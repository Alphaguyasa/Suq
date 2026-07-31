import { describe, expect, it } from 'vitest';
import { DEMO_CATALOGUE } from './catalogue';
import { generateDemo } from './generate';
import { demoStats, sumRange } from './stats';

const ETHIOPIC = /[ሀ-፿]/;

function build() {
  return generateDemo({
    shopId: '5c9a1000-0000-4000-8000-000000000001',
    deviceId: '00000000-0000-4000-8000-0000000000a1',
    now: new Date(2026, 6, 31, 20, 30),
    seed: 20260731,
  });
}

describe('demo catalogue', () => {
  it('has sixty products across six categories', () => {
    expect(DEMO_CATALOGUE).toHaveLength(60);
    expect(new Set(DEMO_CATALOGUE.map((row) => row.category)).size).toBe(6);
  });

  it('gives every product a real Amharic name', () => {
    for (const entry of DEMO_CATALOGUE) {
      expect(ETHIOPIC.test(entry.name_am), `${entry.name} -> "${entry.name_am}"`).toBe(true);
    }
  });

  it('prices everything in integer cents with a plausible margin', () => {
    for (const entry of DEMO_CATALOGUE) {
      expect(Number.isInteger(entry.cost_price)).toBe(true);
      expect(Number.isInteger(entry.sell_price)).toBe(true);

      const margin = (entry.sell_price - entry.cost_price) / entry.sell_price;
      expect(margin, `${entry.name} margin`).toBeGreaterThan(0.1);
      expect(margin, `${entry.name} margin`).toBeLessThan(0.45);
    }
  });

  it('has unique barcodes', () => {
    const codes = DEMO_CATALOGUE.map((row) => row.barcode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('generated demo data', () => {
  it('is deterministic for a given seed', () => {
    const a = build();
    const b = build();

    expect(a.sales.length).toBe(b.sales.length);
    expect(a.sales[0]?.id).toBe(b.sales[0]?.id);
    expect(a.sales[0]?.receipt_no).toBe(b.sales[0]?.receipt_no);
  });

  it('produces client-generated uuids, so it can be pushed to Postgres', () => {
    const { sales, products } = build();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    expect(products[0]?.id).toMatch(uuid);
    expect(sales[0]?.id).toMatch(uuid);
  });

  it('covers about a month of trading', () => {
    const stats = demoStats(build());

    expect(stats.days).toBeGreaterThanOrEqual(28);
    expect(stats.sales).toBeGreaterThan(600);
  });

  it('is busier in the evening than mid-morning', () => {
    const { byHour } = demoStats(build());

    const midMorning = sumRange(byHour, 10, 11);
    const evening = sumRange(byHour, 17, 19);

    expect(evening).toBeGreaterThan(midMorning * 2);
  });

  it('is busier at the weekend', () => {
    const { byWeekday } = demoStats(build());

    const saturday = byWeekday[6] ?? 0;
    const midweek = ((byWeekday[1] ?? 0) + (byWeekday[2] ?? 0) + (byWeekday[3] ?? 0)) / 3;

    expect(saturday).toBeGreaterThan(midweek);
  });

  it('generates cleanly when run before the shop opens', () => {
    // Regression: the "today" hour filter emptied before 07:00, which fed
    // setHours(undefined) and threw RangeError: Invalid time value. Only
    // showed up running the real script at 00:40.
    for (const hour of [0, 3, 6, 7, 23]) {
      const data = generateDemo({
        shopId: '5c9a1000-0000-4000-8000-000000000001',
        deviceId: '00000000-0000-4000-8000-0000000000a1',
        now: new Date(2026, 6, 31, hour, 15),
        seed: 7,
      });

      expect(data.sales.length, `at ${hour}:00`).toBeGreaterThan(0);
      for (const sale of data.sales) {
        expect(Number.isNaN(Date.parse(sale.created_at)), sale.receipt_no).toBe(false);
      }
    }
  });

  it('never rings up a sale outside shop hours', () => {
    for (const sale of build().sales) {
      const hour = new Date(sale.created_at).getHours();
      expect(hour, sale.receipt_no).toBeGreaterThanOrEqual(7);
      expect(hour, sale.receipt_no).toBeLessThanOrEqual(21);
    }
  });

  it('leaves exactly six products at or below reorder level', () => {
    expect(demoStats(build()).lowStock).toBe(6);
  });

  it('never leaves a product in negative stock', () => {
    const { products } = build();
    const { onHand } = demoStats(build());

    for (const product of products) {
      expect(onHand.get(product.id) ?? 0, product.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('splits takings between two cashiers with different volumes', () => {
    const { byCashier } = demoStats(build());
    const totals = Object.values(byCashier);

    expect(Object.keys(byCashier)).toHaveLength(2);
    expect(Math.max(...totals)).toBeGreaterThan(Math.min(...totals) * 1.3);
  });

  it('includes voided sales with matching compensating movements', () => {
    const data = build();
    const stats = demoStats(data);

    expect(stats.voidRows).toBeGreaterThanOrEqual(2);

    for (const voidRow of data.sales.filter((sale) => sale.voids_sale_id !== null)) {
      const original = data.sales.find((sale) => sale.id === voidRow.voids_sale_id);
      expect(original).toBeDefined();
      expect(voidRow.total).toBe(-(original?.total ?? 0));

      const returns = data.movements.filter((movement) => movement.ref_id === voidRow.id);
      expect(returns.length).toBeGreaterThan(0);
      expect(returns.every((movement) => movement.reason === 'return')).toBe(true);
    }
  });

  it('gives every sale at least one line and matching movements', () => {
    const data = build();

    for (const sale of data.sales.slice(0, 50)) {
      const lines = data.items.filter((item) => item.sale_id === sale.id);
      expect(lines.length, sale.receipt_no).toBeGreaterThan(0);

      const moved = data.movements.filter((movement) => movement.ref_id === sale.id);
      expect(moved.length, sale.receipt_no).toBe(lines.length);
    }
  });

  it('has receipt numbers that never repeat', () => {
    const receipts = build().sales.map((sale) => sale.receipt_no);
    expect(new Set(receipts).size).toBe(receipts.length);
  });
});
