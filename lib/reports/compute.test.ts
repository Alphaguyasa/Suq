import { describe, expect, it } from 'vitest';
import type { Product, Sale, SaleItem } from '@/lib/db';
import {
  cashUp,
  changeVsPrevious,
  dailyTotals,
  effectiveSales,
  grossProfit,
  hourlyTotals,
  lowStock,
  summarise,
  topProducts,
  voidedSaleIds,
} from './compute';

/*
 * The fixture, and the figures worked out by hand before any code ran.
 *
 * Products      cost    sell   reorder
 *   water       26.00   35.00     24
 *   pasta       54.00   70.00     20
 *   coffee     280.00  350.00      8
 *   salt        22.00   30.00     15
 *
 * Sales (all today, local time)
 *   S1 09:15 cash      2 x water  @35.00              =  70.00
 *   S2 11:30 telebirr  1 x pasta  @70.00              =  70.00
 *                      1 x water  @35.00              =  35.00
 *                      subtotal 105.00, discount 5.00 = 100.00
 *   S3 18:45 cash      1 x coffee @350.00             = 350.00
 *   S4 19:00 cash      VOID of S3                     = -350.00
 *
 * Net takings   70 + 100 + 350 - 350                  =  170.00
 * Transactions  S1 and S2 only (S3 voided, S4 is the void row) = 2
 * Avg basket    170.00 / 2                            =   85.00
 * By method     cash 70 + 350 - 350 = 70.00; telebirr = 100.00
 *
 * Gross profit, per line, snapshotted unit_price minus current cost:
 *   S1 water   (35 - 26) x 2  =  18.00
 *   S2 pasta   (70 - 54) x 1  =  16.00
 *   S2 water   (35 - 26) x 1  =   9.00
 *   S3 coffee (350 - 280) x 1 =  70.00
 *   S4 coffee (350 - 280) x -1 = -70.00
 *                              =  43.00
 */

const WATER = 'p-water';
const PASTA = 'p-pasta';
const COFFEE = 'p-coffee';
const SALT = 'p-salt';

const COSTS = new Map([
  [WATER, 2600],
  [PASTA, 5400],
  [COFFEE, 28000],
  [SALT, 2200],
]);

function at(hour: number, minute: number): string {
  return new Date(2026, 6, 31, hour, minute, 0, 0).toISOString();
}

function sale(overrides: Partial<Sale> & Pick<Sale, 'id' | 'total' | 'created_at'>): Sale {
  return {
    shop_id: 'shop',
    device_id: 'device',
    receipt_no: 'A1-000000',
    subtotal: overrides.total,
    discount: 0,
    payment_method: 'cash',
    cashier_name: 'መሠረት',
    voided_by: null,
    voids_sale_id: null,
    cash_received: null,
    synced_at: null,
    ...overrides,
  };
}

function item(
  saleId: string,
  productId: string,
  name: string,
  unitPrice: number,
  qty: number,
): SaleItem {
  return {
    id: `${saleId}-${productId}`,
    shop_id: 'shop',
    sale_id: saleId,
    product_id: productId,
    name_snapshot: name,
    unit_price: unitPrice,
    qty,
    line_total: Math.round(unitPrice * qty),
    created_at: at(12, 0),
  };
}

const SALES: Sale[] = [
  sale({ id: 'S1', total: 7000, created_at: at(9, 15), payment_method: 'cash' }),
  sale({
    id: 'S2',
    total: 10000,
    subtotal: 10500,
    discount: 500,
    created_at: at(11, 30),
    payment_method: 'telebirr',
  }),
  sale({ id: 'S3', total: 35000, created_at: at(18, 45), payment_method: 'cash' }),
  sale({
    id: 'S4',
    total: -35000,
    subtotal: -35000,
    created_at: at(19, 0),
    payment_method: 'cash',
    voids_sale_id: 'S3',
  }),
];

const ITEMS: SaleItem[] = [
  item('S1', WATER, 'አምቦ ውሃ 1 ሊትር', 3500, 2),
  item('S2', PASTA, 'ሾላ ፓስታ 500 ግራም', 7000, 1),
  item('S2', WATER, 'አምቦ ውሃ 1 ሊትር', 3500, 1),
  item('S3', COFFEE, 'የተፈጨ ቡና 500 ግራም', 35000, 1),
  item('S4', COFFEE, 'የተፈጨ ቡና 500 ግራም', 35000, -1),
];

function product(id: string, reorder: number): Product {
  return {
    id,
    shop_id: 'shop',
    name: id,
    name_am: id,
    barcode: null,
    unit: 'pcs',
    cost_price: COSTS.get(id) ?? 0,
    sell_price: 0,
    reorder_level: reorder,
    is_active: true,
    updated_at: at(8, 0),
    deleted_at: null,
  };
}

describe('summarise', () => {
  it('matches the hand-computed figures', () => {
    const result = summarise(SALES, ITEMS, COSTS);

    expect(result.net).toBe(17000); // 170.00
    expect(result.transactions).toBe(2);
    expect(result.averageBasket).toBe(8500); // 85.00
    expect(result.grossProfit).toBe(4300); // 43.00
  });

  it('splits by payment method with the void netted against cash', () => {
    const { byMethod } = summarise(SALES, ITEMS, COSTS);

    expect(byMethod.cash).toBe(7000); // 70 + 350 - 350
    expect(byMethod.telebirr).toBe(10000);
    expect(byMethod.card).toBe(0);
    expect(byMethod.credit).toBe(0);
    expect(byMethod.cash + byMethod.telebirr).toBe(17000);
  });

  it('does not count a voided sale as a transaction', () => {
    const voided = voidedSaleIds(SALES);
    expect([...voided]).toEqual(['S3']);

    const real = effectiveSales(SALES, voided);
    expect(real.map((row) => row.id)).toEqual(['S1', 'S2']);
  });

  it('reports zeroes rather than dividing by zero on an empty day', () => {
    const empty = summarise([], [], COSTS);

    expect(empty.net).toBe(0);
    expect(empty.transactions).toBe(0);
    expect(empty.averageBasket).toBe(0);
    expect(empty.grossProfit).toBe(0);
  });
});

describe('grossProfit', () => {
  it('uses the snapshotted unit price, not the product current price', () => {
    // The product's sell_price has since doubled; profit must not move.
    const inflated = new Map(COSTS);
    expect(grossProfit(ITEMS, inflated)).toBe(4300);
  });

  it('subtracts a void line rather than ignoring it', () => {
    const withoutVoid = ITEMS.filter((row) => row.sale_id !== 'S4');
    expect(grossProfit(withoutVoid, COSTS)).toBe(4300 + 7000);
  });

  it('treats an unknown product as zero cost rather than crashing', () => {
    expect(grossProfit([item('X', 'gone', 'x', 1000, 1)], COSTS)).toBe(1000);
  });
});

describe('hourlyTotals', () => {
  it('buckets by local hour', () => {
    const hours = hourlyTotals(SALES);

    expect(hours).toHaveLength(24);
    expect(hours[9]).toBe(7000);
    expect(hours[11]).toBe(10000);
    expect(hours[18]).toBe(35000);
    expect(hours[19]).toBe(-35000);
    expect(hours.reduce((sum, value) => sum + value, 0)).toBe(17000);
    expect(hours[3]).toBe(0);
  });
});

describe('dailyTotals', () => {
  it('keeps empty days as zeroes so the line does not lie about gaps', () => {
    const days = ['2026-07-29', '2026-07-30', '2026-07-31'];
    const totals = dailyTotals(SALES, days);

    expect(totals.map((row) => row.date)).toEqual(days);
    expect(totals[0]?.total).toBe(0);
    expect(totals[1]?.total).toBe(0);
    expect(totals[2]?.total).toBe(17000);
  });
});

describe('topProducts', () => {
  it('ranks by revenue', () => {
    const ranked = topProducts(ITEMS, 'revenue');

    // Coffee nets to zero units after the void and drops out entirely.
    expect(ranked.map((row) => row.product_id)).toEqual([WATER, PASTA]);
    expect(ranked[0]?.revenue).toBe(10500); // 70.00 + 35.00
    expect(ranked[0]?.units).toBe(3);
    expect(ranked[1]?.revenue).toBe(7000);
  });

  it('ranks by units', () => {
    const ranked = topProducts(ITEMS, 'units');

    expect(ranked.map((row) => row.units)).toEqual([3, 1]);
  });

  it('uses the snapshotted name, so a renamed product keeps its history', () => {
    expect(topProducts(ITEMS, 'revenue')[0]?.name_am).toBe('አምቦ ውሃ 1 ሊትር');
  });
});

describe('lowStock', () => {
  it('lists everything at or below reorder level, worst first', () => {
    const products = [
      product(WATER, 24),
      product(PASTA, 20),
      product(COFFEE, 8),
      product(SALT, 15),
    ];

    const onHand = new Map([
      [WATER, 30], // above the line, excluded
      [PASTA, 6], // 14 short
      [COFFEE, 5], // 3 short
      [SALT, 15], // exactly at the line, included
    ]);

    const rows = lowStock(products, onHand);

    expect(rows.map((row) => row.product.id)).toEqual([PASTA, COFFEE, SALT]);
    expect(rows[0]?.deficit).toBe(14);
    expect(rows[2]?.deficit).toBe(0);
  });
});

describe('cashUp', () => {
  it('counts only cash toward the drawer', () => {
    const result = cashUp(SALES, 50000, 56500);

    expect(result.cashSales).toBe(7000);
    expect(result.expected).toBe(57000); // 500.00 float + 70.00
    expect(result.variance).toBe(-500); // 5.00 short
  });

  it('leaves variance null until the drawer is counted', () => {
    expect(cashUp(SALES, 50000, null).variance).toBeNull();
  });
});

describe('changeVsPrevious', () => {
  it('reports a percentage move', () => {
    expect(changeVsPrevious(15000, 10000)).toBe(50);
    expect(changeVsPrevious(5000, 10000)).toBe(-50);
  });

  it('is null with no baseline, rather than infinity', () => {
    expect(changeVsPrevious(15000, 0)).toBeNull();
  });
});
