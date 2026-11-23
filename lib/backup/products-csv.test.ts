import { describe, expect, it } from 'vitest';
import type { Product, StockMovement } from '@/lib/db/schema';
import { parseProductCsv } from '@/lib/seed/csv';
import { PRODUCTS_CSV_COLUMNS, backupFileName, productsCsv } from './export';

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    shop_id: 'shop-1',
    name_am: overrides.name,
    barcode: null,
    unit: 'pcs',
    cost_price: 1000,
    sell_price: 1500,
    reorder_level: 5,
    is_active: true,
    updated_at: '2026-11-23T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

let movementId = 0;
function movement(product_id: string, qty_delta: number): StockMovement {
  movementId += 1;
  return {
    id: `m-${movementId}`,
    shop_id: 'shop-1',
    product_id,
    qty_delta,
    reason: qty_delta < 0 ? 'sale' : 'purchase',
    ref_id: null,
    note: null,
    created_at: '2026-11-23T00:00:00.000Z',
    device_id: 'device-1',
  };
}

function lines(csv: string): string[] {
  return csv.replace(/^﻿/, '').trimEnd().split('\r\n');
}

describe('productsCsv', () => {
  it('writes the import columns, a BOM and CRLF line endings', () => {
    const csv = productsCsv({ products: [], stock_movements: [] });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(lines(csv)).toEqual([PRODUCTS_CSV_COLUMNS.join(',')]);
  });

  it('writes on-hand as the sum of movements, money in birr, sorted by name', () => {
    const csv = productsCsv({
      products: [
        product({ id: 'p2', name: 'Sugar', name_am: 'ስኳር', unit: 'kg', cost_price: 9050, sell_price: 11000 }),
        product({ id: 'p1', name: 'Bread', name_am: 'ዳቦ', barcode: '6290000000017', reorder_level: 10 }),
      ],
      stock_movements: [movement('p1', 20), movement('p1', -3), movement('p2', 0.1), movement('p2', 0.2)],
    });
    expect(lines(csv).slice(1)).toEqual([
      'Bread,ዳቦ,6290000000017,pcs,10.00,15.00,10,17',
      'Sugar,ስኳር,,kg,90.50,110.00,5,0.3',
    ]);
  });

  it('leaves out deleted and archived products', () => {
    const csv = productsCsv({
      products: [
        product({ id: 'p1', name: 'Kept' }),
        product({ id: 'p2', name: 'Deleted', deleted_at: '2026-11-20T00:00:00.000Z' }),
        product({ id: 'p3', name: 'Archived', is_active: false }),
      ],
      stock_movements: [],
    });
    expect(lines(csv)).toHaveLength(2);
    expect(csv).toContain('Kept');
  });

  it('writes a product sold below zero as an opening count of 0', () => {
    const csv = productsCsv({
      products: [product({ id: 'p1', name: 'Oversold' })],
      stock_movements: [movement('p1', 2), movement('p1', -5)],
    });
    expect(lines(csv)[1]?.split(',').at(-1)).toBe('0');
  });

  it('guards formula-like names and quotes commas', () => {
    const csv = productsCsv({
      products: [product({ id: 'p1', name: '=HYPERLINK("x")', name_am: 'Oil, 1 l' })],
      stock_movements: [],
    });
    expect(lines(csv)[1]).toBe(`"'=HYPERLINK(""x"")","Oil, 1 l",,pcs,10.00,15.00,5,0`);
  });

  it('goes back through the product import unchanged', () => {
    const products = [
      product({ id: 'p1', name: '-50% Soap, bar', name_am: 'ሳሙና', barcode: '123', unit: 'pack', cost_price: 2575 }),
      product({ id: 'p2', name: 'Rice', name_am: 'ሩዝ', unit: 'kg', sell_price: 9999, reorder_level: 2.5 }),
    ];
    const csv = productsCsv({ products, stock_movements: [movement('p1', 12), movement('p2', 7.25)] });

    const { products: parsed, errors } = parseProductCsv(csv);
    expect(errors).toEqual([]);
    expect(parsed.map(({ row: _row, ...rest }) => rest)).toEqual([
      {
        name: '-50% Soap, bar',
        name_am: 'ሳሙና',
        barcode: '123',
        unit: 'pack',
        cost_price: 2575,
        sell_price: 1500,
        reorder_level: 5,
        opening_qty: 12,
      },
      {
        name: 'Rice',
        name_am: 'ሩዝ',
        barcode: null,
        unit: 'kg',
        cost_price: 1000,
        sell_price: 9999,
        reorder_level: 2.5,
        opening_qty: 7.25,
      },
    ]);
  });
});

describe('backupFileName for the product list', () => {
  it('ends in -products.csv', () => {
    const name = backupFileName(
      { device: { device_id: 'd', device_prefix: 'A1', shop_id: 's' }, exported_at: '2026-11-23T08:00:00.000Z' },
      'csv',
      'products',
    );
    expect(name).toMatch(/^suq-A1-\d{4}-\d{2}-\d{2}-products\.csv$/);
  });
});
