import { db } from '@/lib/db/schema';
import type { Product, Sale, SaleItem, ShopSettings, StockMovement, SuqDatabase } from '@/lib/db/schema';

/**
 * A backup a shop can keep without ever signing in to sync.
 *
 * Two files, for two readers:
 * - JSON: everything that defines the shop's history (products, sales, sale
 *   lines, stock movements, shop details), exactly as stored, so a future
 *   import can restore it. Money stays integer cents.
 * - CSV: one row per sale line, for an owner or accountant opening it in a
 *   spreadsheet. Money is written in birr ("25.00"), formatted from integer
 *   cents without touching a float.
 *
 * Deliberately left out: cashiers (their PINs are stored in plain text, and a
 * backup file ends up in Downloads, on Telegram, on a shared PC), the outbox
 * and the sync machinery, which mean nothing outside this device.
 */

export const BACKUP_FORMAT = 'suq-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  device: { device_id: string; device_prefix: string; shop_id: string } | null;
  shop_settings: ShopSettings | null;
  products: Product[];
  sales: Sale[];
  sale_items: SaleItem[];
  stock_movements: StockMovement[];
}

/** One read transaction, so the files are a consistent snapshot even mid-sale. */
export async function buildBackup(database: SuqDatabase = db, now = new Date()): Promise<Backup> {
  return database.transaction(
    'r',
    [
      database.device_meta,
      database.shop_settings,
      database.products,
      database.sales,
      database.sale_items,
      database.stock_movements,
    ],
    async () => {
      const [meta] = await database.device_meta.toArray();
      const [settings] = await database.shop_settings.toArray();

      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exported_at: now.toISOString(),
        device: meta
          ? { device_id: meta.device_id, device_prefix: meta.device_prefix, shop_id: meta.shop_id }
          : null,
        shop_settings: settings ?? null,
        products: await database.products.toArray(),
        sales: await database.sales.orderBy('created_at').toArray(),
        sale_items: await database.sale_items.toArray(),
        stock_movements: await database.stock_movements.orderBy('created_at').toArray(),
      };
    },
  );
}

/** Integer cents as a plain decimal: 123456 -> "1234.56", -500 -> "-5.00". No grouping, no float. */
export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`centsToDecimal expects integer cents, received ${cents}`);
  }
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/*
 * A cell a spreadsheet would run as a formula (=, +, -, @, tab, CR) is
 * prefixed with an apostrophe. Product names and cashier names are typed by
 * people, and a CSV is exactly where "=HYPERLINK(...)" turns into an attack.
 * Only text cells go through this: numbers we format ourselves stay numbers.
 */
function textCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export const SALES_CSV_COLUMNS = [
  'receipt_no',
  'created_at',
  'status',
  'voids_receipt_no',
  'cashier',
  'payment_method',
  'product',
  'qty',
  'unit_price',
  'line_total',
  'sale_discount',
  'sale_total',
] as const;

/**
 * One row per sale line. A void is its own sale (negative lines, status
 * "void") that names the receipt it cancels; the cancelled sale is marked
 * "voided". Rows keep the order sales were rung up.
 */
export function salesCsv(backup: Pick<Backup, 'sales' | 'sale_items'>): string {
  const receiptById = new Map(backup.sales.map((sale) => [sale.id, sale.receipt_no]));
  // Voided is derived, never stored: a sale is voided when a void row points
  // at it (voided_by is never written locally, see schema.ts).
  const voidedIds = new Set(backup.sales.flatMap((sale) => (sale.voids_sale_id ? [sale.voids_sale_id] : [])));
  const linesBySale = new Map<string, SaleItem[]>();
  for (const item of backup.sale_items) {
    const lines = linesBySale.get(item.sale_id) ?? [];
    lines.push(item);
    linesBySale.set(item.sale_id, lines);
  }

  const rows: string[][] = [[...SALES_CSV_COLUMNS]];

  for (const sale of backup.sales) {
    const status = sale.voids_sale_id ? 'void' : voidedIds.has(sale.id) ? 'voided' : 'sale';
    const voids = sale.voids_sale_id ? (receiptById.get(sale.voids_sale_id) ?? '') : '';

    for (const item of linesBySale.get(sale.id) ?? []) {
      rows.push([
        textCell(sale.receipt_no),
        sale.created_at,
        status,
        textCell(voids),
        textCell(sale.cashier_name),
        sale.payment_method,
        textCell(item.name_snapshot),
        String(item.qty),
        centsToDecimal(item.unit_price),
        centsToDecimal(item.line_total),
        centsToDecimal(sale.discount),
        centsToDecimal(sale.total),
      ]);
    }
  }

  // Windows line endings and a byte-order mark: without the BOM, Excel opens
  // UTF-8 as a legacy code page and every Amharic name turns into mojibake.
  return '﻿' + rows.map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

/** "suq-A1-2026-10-22.json" — the device prefix tells two tills' backups apart. */
export function backupFileName(backup: Pick<Backup, 'device' | 'exported_at'>, ext: 'json' | 'csv'): string {
  const date = new Date(backup.exported_at);
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const prefix = (backup.device?.device_prefix ?? 'device').replace(/[^A-Za-z0-9-]/g, '');
  return `suq-${prefix || 'device'}-${day}${ext === 'csv' ? '-sales' : ''}.${ext}`;
}

/** Hand a file to the browser's download, offline, no server involved. */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next tick: some Android WebViews read the URL after click().
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
