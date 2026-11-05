import { DEVICE_META_ID } from '@/lib/db/device';
import { nowIso } from '@/lib/db/id';
import { recomputeCacheFor } from '@/lib/db/repositories/stock';
import { db } from '@/lib/db/schema';
import type {
  CashClose,
  MovementReason,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  ShopSettings,
  StockMovement,
  SuqDatabase,
  Unit,
} from '@/lib/db/schema';
import { SHOP_SETTINGS_ID } from '@/lib/db/settings';
import { localWriteMany } from '@/lib/db/write';
import { BACKUP_FORMAT, BACKUP_VERSION } from './export';

/**
 * Read a `suq-backup` JSON file back onto a fresh till (ROADMAP item 46).
 *
 * The shop that never signs in has no other copy of its history, so a lost or
 * replaced phone must be able to start again from the file Settings exported.
 *
 * Two rules shape everything here:
 *
 * 1. All or nothing. The whole file is checked before anything is written, and
 *    then every row lands in ONE IndexedDB transaction. A file that is wrong
 *    anywhere is refused whole: a half-restored till (sales without their
 *    lines, products without their stock) is worse than an empty one, because
 *    it looks right.
 *
 * 2. Only on an empty till. Restoring over live data would mean deciding which
 *    copy of a product wins, and two histories would merge silently. Setup
 *    offers it before anything has been sold or added, and the check is made
 *    again inside the write transaction.
 *
 * Why the synced rows still go through localWriteMany(): it writes each table
 * and queues its rows in the outbox in the same transaction, which is exactly
 * what a restore needs. The rows are pushed again when the till signs in.
 * That is safe: every row keeps its original uuid, sales, sale lines and stock
 * movements are append-only upserts that ignore duplicates, and products are
 * last-write-wins on updated_at, so a row the server already holds is a no-op.
 * Rows the server never saw (sold offline before the old phone was lost) are
 * recovered.
 *
 * Rows are rebuilt field by field from the known columns, never copied as they
 * stand: an unknown key in a pushed payload makes PostgREST refuse the whole
 * batch, and a hand-edited file must not smuggle one in.
 *
 * Not restored, because the file does not hold them: cashiers (setup's next
 * steps create the owner again) and the device row. This till keeps its own
 * device_id and receipt counter, so restored receipts never collide with new
 * ones: nextReceiptNo() continues past every receipt the till holds with its
 * prefix. Only the shop_id is taken from the backup, so the rows still belong
 * to the shop that wrote them.
 */

export type RestoreErrorCode =
  /** Not JSON at all, or not a file Suq wrote. */
  | 'notBackup'
  /** Written by a newer Suq than this one. */
  | 'newerVersion'
  /** A Suq backup with a row that is wrong (bad money, missing id, …). */
  | 'invalid'
  /** Nothing in it to restore. */
  | 'empty'
  /** This till already holds products, sales or queued changes. */
  | 'notEmpty';

export class RestoreError extends Error {
  constructor(
    readonly code: RestoreErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RestoreError';
  }
}

export interface ValidBackup {
  shop_id: string;
  shop_settings: Omit<ShopSettings, 'id' | 'updated_at'> | null;
  products: Product[];
  sales: Sale[];
  sale_items: SaleItem[];
  stock_movements: StockMovement[];
  cash_closes: CashClose[];
}

export interface RestoreSummary {
  products: number;
  /** Sales an owner would count: void rows are left out, as in the export. */
  sales: number;
  cashCloses: number;
}

const UNITS: ReadonlySet<Unit> = new Set(['pcs', 'kg', 'l', 'pack']);
const PAYMENT_METHODS: ReadonlySet<PaymentMethod> = new Set(['cash', 'telebirr', 'card', 'credit']);
const REASONS: ReadonlySet<MovementReason> = new Set([
  'sale',
  'purchase',
  'adjustment',
  'return',
  'damage',
  'opening',
]);

type Row = Record<string, unknown>;

/** Reads one row's fields, failing with the table, index and column it was reading. */
class Reader {
  constructor(
    private readonly row: Row,
    private readonly where: string,
  ) {}

  private fail(column: string): never {
    throw new RestoreError('invalid', `${this.where}.${column}`);
  }

  text(column: string): string {
    const value = this.row[column];
    if (typeof value !== 'string') this.fail(column);
    return value;
  }

  id(column: string): string {
    const value = this.text(column);
    if (!value.trim()) this.fail(column);
    return value;
  }

  optionalId(column: string): string | null {
    const value = this.row[column];
    return value === null || value === undefined ? null : this.id(column);
  }

  optionalText(column: string): string | null {
    const value = this.row[column];
    return value === null || value === undefined ? null : this.text(column);
  }

  /** Returned in the one canonical text form every timestamp on the till uses (timestamps.ts). */
  time(column: string): string {
    const value = this.text(column);
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) this.fail(column);
    return new Date(ms).toISOString();
  }

  optionalTime(column: string): string | null {
    const value = this.row[column];
    return value === null || value === undefined ? null : this.time(column);
  }

  /** Money: integer cents, never a float. */
  cents(column: string): number {
    const value = this.row[column];
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) this.fail(column);
    return value;
  }

  optionalCents(column: string): number | null {
    const value = this.row[column];
    return value === null || value === undefined ? null : this.cents(column);
  }

  /** Quantities may be fractional (kg, l). */
  quantity(column: string): number {
    const value = this.row[column];
    if (typeof value !== 'number' || !Number.isFinite(value)) this.fail(column);
    return value;
  }

  bool(column: string): boolean {
    const value = this.row[column];
    if (typeof value !== 'boolean') this.fail(column);
    return value;
  }

  oneOf<T extends string>(column: string, allowed: ReadonlySet<T>): T {
    const value = this.row[column];
    if (typeof value !== 'string' || !allowed.has(value as T)) this.fail(column);
    return value as T;
  }
}

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rowsOf(file: Row, table: string, required: boolean): Row[] {
  const value = file[table];
  // cash_closes arrived after v1 shipped: an older file has none.
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new RestoreError('invalid', table);
  return value.map((row, index) => {
    if (!isRecord(row)) throw new RestoreError('invalid', `${table}[${index}]`);
    return row;
  });
}

function read<T>(file: Row, table: string, required: boolean, build: (row: Reader) => T): T[] {
  const ids = new Set<string>();
  return rowsOf(file, table, required).map((row, index) => {
    const built = build(new Reader(row, `${table}[${index}]`));
    const id = (built as { id: string }).id;
    if (ids.has(id)) throw new RestoreError('invalid', `${table}[${index}].id duplicate`);
    ids.add(id);
    return built;
  });
}

/**
 * Check a backup file and return clean rows, or throw RestoreError. Writes
 * nothing, so a refused file has touched nothing.
 */
export function parseBackup(text: string): ValidBackup {
  let file: unknown;
  try {
    file = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new RestoreError('notBackup', 'not JSON');
  }
  if (!isRecord(file) || file.format !== BACKUP_FORMAT) throw new RestoreError('notBackup');
  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) {
    throw new RestoreError('notBackup', 'version');
  }
  if (file.version > BACKUP_VERSION) throw new RestoreError('newerVersion', String(file.version));

  const products = read(file, 'products', true, (r): Product => ({
    id: r.id('id'),
    shop_id: r.id('shop_id'),
    name: r.text('name'),
    name_am: r.text('name_am'),
    barcode: r.optionalText('barcode'),
    unit: r.oneOf('unit', UNITS),
    cost_price: r.cents('cost_price'),
    sell_price: r.cents('sell_price'),
    reorder_level: r.quantity('reorder_level'),
    is_active: r.bool('is_active'),
    updated_at: r.time('updated_at'),
    deleted_at: r.optionalTime('deleted_at'),
  }));

  const sales = read(file, 'sales', true, (r): Sale => ({
    id: r.id('id'),
    shop_id: r.id('shop_id'),
    device_id: r.id('device_id'),
    receipt_no: r.id('receipt_no'),
    subtotal: r.cents('subtotal'),
    discount: r.cents('discount'),
    total: r.cents('total'),
    payment_method: r.oneOf('payment_method', PAYMENT_METHODS),
    cashier_name: r.text('cashier_name'),
    voided_by: r.optionalId('voided_by'),
    voids_sale_id: r.optionalId('voids_sale_id'),
    cash_received: r.optionalCents('cash_received'),
    created_at: r.time('created_at'),
    synced_at: r.optionalTime('synced_at'),
  }));

  const saleItems = read(file, 'sale_items', true, (r): SaleItem => ({
    id: r.id('id'),
    shop_id: r.id('shop_id'),
    sale_id: r.id('sale_id'),
    product_id: r.id('product_id'),
    name_snapshot: r.text('name_snapshot'),
    unit_price: r.cents('unit_price'),
    qty: r.quantity('qty'),
    line_total: r.cents('line_total'),
    cost_snapshot: r.optionalCents('cost_snapshot'),
    created_at: r.time('created_at'),
  }));

  const movements = read(file, 'stock_movements', true, (r): StockMovement => ({
    id: r.id('id'),
    shop_id: r.id('shop_id'),
    product_id: r.id('product_id'),
    qty_delta: r.quantity('qty_delta'),
    reason: r.oneOf('reason', REASONS),
    ref_id: r.optionalId('ref_id'),
    note: r.optionalText('note'),
    created_at: r.time('created_at'),
    device_id: r.id('device_id'),
  }));

  const cashCloses = read(file, 'cash_closes', false, (r): CashClose => ({
    id: r.id('id'),
    shop_id: r.id('shop_id'),
    device_id: r.id('device_id'),
    period_from: r.time('period_from'),
    period_to: r.time('period_to'),
    opening_float: r.cents('opening_float'),
    cash_sales: r.cents('cash_sales'),
    expected: r.cents('expected'),
    counted: r.cents('counted'),
    variance: r.cents('variance'),
    cashier_name: r.text('cashier_name'),
    created_at: r.time('created_at'),
  }));

  let shopSettings: ValidBackup['shop_settings'] = null;
  if (file.shop_settings !== null && file.shop_settings !== undefined) {
    if (!isRecord(file.shop_settings)) throw new RestoreError('invalid', 'shop_settings');
    const r = new Reader(file.shop_settings, 'shop_settings');
    const width = file.shop_settings.printer_width;
    if (width !== 58 && width !== 80) throw new RestoreError('invalid', 'shop_settings.printer_width');
    shopSettings = {
      shop_name: r.text('shop_name'),
      shop_name_am: r.text('shop_name_am'),
      phone: r.text('phone'),
      address: r.text('address'),
      receipt_footer: r.text('receipt_footer'),
      receipt_footer_am: r.text('receipt_footer_am'),
      printer_width: width,
    };
  }

  if (products.length === 0 && sales.length === 0) throw new RestoreError('empty');

  /*
   * One shop per file. RLS scopes every table by shop_id, so a row carrying a
   * different one would be refused on push and block the whole outbox.
   */
  const device = isRecord(file.device) ? file.device : null;
  const shopId =
    (device && typeof device.shop_id === 'string' && device.shop_id) ||
    products[0]?.shop_id ||
    sales[0]?.shop_id;
  if (!shopId) throw new RestoreError('invalid', 'shop_id');
  for (const [table, rows] of [
    ['products', products],
    ['sales', sales],
    ['sale_items', saleItems],
    ['stock_movements', movements],
    ['cash_closes', cashCloses],
  ] as const) {
    const stray = rows.findIndex((row) => row.shop_id !== shopId);
    if (stray !== -1) throw new RestoreError('invalid', `${table}[${stray}].shop_id`);
  }

  // Every line belongs to a sale in the same file, or reports would count a
  // line whose sale is missing.
  const saleIds = new Set(sales.map((sale) => sale.id));
  const orphan = saleItems.findIndex((item) => !saleIds.has(item.sale_id));
  if (orphan !== -1) throw new RestoreError('invalid', `sale_items[${orphan}].sale_id`);

  // A movement of zero is never written (makeMovement refuses it).
  const zero = movements.findIndex((movement) => movement.qty_delta === 0);
  if (zero !== -1) throw new RestoreError('invalid', `stock_movements[${zero}].qty_delta`);

  return {
    shop_id: shopId,
    shop_settings: shopSettings,
    products,
    sales,
    sale_items: saleItems,
    stock_movements: movements,
    cash_closes: cashCloses,
  };
}

/** True when nothing a restore would merge into exists on this till yet. */
export async function canRestore(database: SuqDatabase = db): Promise<boolean> {
  const counts = await Promise.all(
    [
      database.products,
      database.sales,
      database.sale_items,
      database.stock_movements,
      database.cash_closes,
      database.outbox,
    ].map((table) => table.count()),
  );
  return counts.every((count) => count === 0);
}

/**
 * Write a checked backup onto this empty till, in one transaction. Throws
 * RestoreError('notEmpty') and writes nothing if the till holds data.
 */
export async function restoreBackup(
  backup: ValidBackup,
  database: SuqDatabase = db,
): Promise<RestoreSummary> {
  await database.transaction(
    'rw',
    [
      database.products,
      database.sales,
      database.sale_items,
      database.stock_movements,
      database.cash_closes,
      database.outbox,
      database.stock_cache,
      database.device_meta,
      database.shop_settings,
    ],
    async () => {
      if (!(await canRestore(database))) throw new RestoreError('notEmpty');

      const meta = await database.device_meta.get(DEVICE_META_ID);
      /*
       * A till that has already pulled holds the server's view of its own
       * shop. Re-stamping it with another shop's id would mix two shops; the
       * owner resets the till first. (canRestore() already makes this rare:
       * a till that pulled anything has rows.)
       */
      if (meta && meta.last_pull_at !== null && meta.shop_id !== backup.shop_id) {
        throw new RestoreError('notEmpty', 'till already synced with another shop');
      }
      if (meta && meta.shop_id !== backup.shop_id) {
        await database.device_meta.update(DEVICE_META_ID, { shop_id: backup.shop_id });
      }

      if (backup.shop_settings) {
        await database.shop_settings.put({
          id: SHOP_SETTINGS_ID,
          ...backup.shop_settings,
          updated_at: nowIso(),
        });
      }

      // Parents first, the same order push uses.
      await localWriteMany('products', backup.products, database);
      await localWriteMany('sales', backup.sales, database);
      await localWriteMany('sale_items', backup.sale_items, database);
      await localWriteMany('stock_movements', backup.stock_movements, database);

      // Local only (until ROADMAP item 13 replicates it): nothing to queue.
      if (backup.cash_closes.length > 0) await database.cash_closes.bulkAdd(backup.cash_closes);

      await recomputeCacheFor(
        backup.stock_movements.map((movement) => movement.product_id),
        database,
      );
    },
  );

  return {
    products: backup.products.length,
    sales: backup.sales.filter((sale) => !sale.voids_sale_id).length,
    cashCloses: backup.cash_closes.length,
  };
}
