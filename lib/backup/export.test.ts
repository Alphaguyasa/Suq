import { beforeEach, describe, expect, it } from 'vitest';
import { addCashier, ensureDevice, saveCashClose } from '@/lib/db';
import { db } from '@/lib/db/schema';
import { cartLine, freshDatabase, seedProduct } from '@/lib/db/test-helpers';
import * as salesRepo from '@/lib/db/repositories/sales';
import type { Sale, SaleItem } from '@/lib/db/schema';
import { BACKUP_FORMAT, backupFileName, buildBackup, centsToDecimal, salesCsv } from './export';

beforeEach(async () => {
  await freshDatabase();
});

/** Parse our own CSV back (quoted cells, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r') continue;
    else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  return rows;
}

describe('centsToDecimal', () => {
  it('formats integer cents without grouping or floats', () => {
    expect(centsToDecimal(0)).toBe('0.00');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(123456)).toBe('1234.56');
    expect(centsToDecimal(-500)).toBe('-5.00');
    expect(centsToDecimal(-5)).toBe('-0.05');
  });

  it('refuses a float', () => {
    expect(() => centsToDecimal(12.5)).toThrow(TypeError);
  });
});

describe('buildBackup', () => {
  it('captures every synced table and the shop, but no cashier PINs', async () => {
    await ensureDevice();
    await addCashier('መሠረት', '4321');
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 2)], { method: 'cash' });
    const close = await saveCashClose({
      periodFrom: '2026-10-22T00:00:00.000Z',
      periodTo: '2026-10-23T00:00:00.000Z',
      cashUp: { openingFloat: 10000, cashSales: 5000, expected: 15000, counted: 14500, variance: -500 },
    });

    const backup = await buildBackup(db, new Date('2026-10-22T08:00:00Z'));

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.exported_at).toBe('2026-10-22T08:00:00.000Z');
    expect(backup.device?.device_prefix).toBeTruthy();
    expect(backup.products.map((p) => p.id)).toContain(product.id);
    expect(backup.sales.map((s) => s.id)).toEqual([sale.id]);
    expect(backup.sale_items).toHaveLength(1);
    expect(backup.stock_movements.some((m) => m.ref_id === sale.id)).toBe(true);
    // Money stays integer cents in the JSON.
    expect(backup.sales[0]?.total).toBe(product.sell_price * 2);
    // Saved drawer counts are local only, so the backup is their one copy.
    expect(backup.cash_closes).toEqual([close]);

    const json = JSON.stringify(backup);
    expect(json).not.toContain('4321');
    expect(json).not.toContain('outbox');
    expect(JSON.parse(json)).toEqual(backup);
  });

  it('works on a device that was never set up', async () => {
    await db.device_meta.clear();
    const backup = await buildBackup();
    expect(backup.device).toBeNull();
    expect(backup.sales).toEqual([]);
    expect(backupFileName(backup, 'json')).toMatch(/^suq-device-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('salesCsv', () => {
  it('writes one row per sale line, marks voids, and opens in Excel as UTF-8', async () => {
    await ensureDevice();
    const product = await seedProduct();
    const kept = await salesRepo.create([cartLine(product, 1)], { method: 'telebirr' });
    const cancelled = await salesRepo.create([cartLine(product, 3)], { method: 'cash' });
    await salesRepo.voidSale(cancelled.id, 'wrong item');

    const csv = salesCsv(await buildBackup());
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');

    const [header, ...rows] = parseCsv(csv.slice(1));
    expect(header?.[0]).toBe('receipt_no');
    const col = (name: string) => header!.indexOf(name);
    expect(rows).toHaveLength(3);

    const byReceipt = (no: string) => rows.filter((row) => row[col('receipt_no')] === no);
    expect(byReceipt(kept.receipt_no)[0]?.[col('status')]).toBe('sale');
    expect(byReceipt(kept.receipt_no)[0]?.[col('payment_method')]).toBe('telebirr');
    expect(byReceipt(kept.receipt_no)[0]?.[col('product')]).toBe(product.name_am);
    expect(byReceipt(kept.receipt_no)[0]?.[col('unit_price')]).toBe(centsToDecimal(product.sell_price));
    expect(byReceipt(cancelled.receipt_no)[0]?.[col('status')]).toBe('voided');

    const voidRow = rows.find((row) => row[col('status')] === 'void');
    expect(voidRow?.[col('voids_receipt_no')]).toBe(cancelled.receipt_no);
    expect(voidRow?.[col('qty')]).toBe('-3');
    expect(voidRow?.[col('line_total')]).toBe(centsToDecimal(-product.sell_price * 3));
  });

  it('quotes awkward names and defuses spreadsheet formulas', () => {
    const sale = {
      id: 's1',
      receipt_no: 'A1-000001',
      created_at: '2026-10-22T08:00:00.000Z',
      cashier_name: '=cmd|calc',
      payment_method: 'cash',
      discount: 0,
      total: 1000,
      voids_sale_id: null,
    } as Sale;
    const item = {
      sale_id: 's1',
      name_snapshot: 'Sugar, "Finchaa" 1kg',
      qty: 1,
      unit_price: 1000,
      line_total: 1000,
    } as SaleItem;

    const [, row] = parseCsv(salesCsv({ sales: [sale], sale_items: [item] }).slice(1));
    expect(row?.[4]).toBe("'=cmd|calc");
    expect(row?.[6]).toBe('Sugar, "Finchaa" 1kg');
  });
});
