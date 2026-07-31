import { describe, expect, it } from 'vitest';
import { computeTotals } from './useCart';
import type { CartItem } from './useCart';

function line(unit_price: number, qty: number): CartItem {
  return {
    product_id: `p-${unit_price}-${qty}`,
    name_am: 'አምቦ ውሃ 1 ሊትር',
    name: 'Ambo Water 1L',
    unit: 'pcs',
    unit_price,
    qty,
  };
}

describe('computeTotals', () => {
  it('sums lines in integer cents', () => {
    const totals = computeTotals([line(3500, 3), line(2500, 2)], 'amount', '');

    expect(totals.subtotal).toBe(15500);
    expect(totals.discount).toBe(0);
    expect(totals.total).toBe(15500);
  });

  it('applies a fixed discount typed as birr', () => {
    const totals = computeTotals([line(3500, 2)], 'amount', '10.50');

    expect(totals.subtotal).toBe(7000);
    expect(totals.discount).toBe(1050);
    expect(totals.total).toBe(5950);
  });

  it('applies a percentage discount, rounded to whole cents', () => {
    const totals = computeTotals([line(3333, 1)], 'percent', '10');

    expect(totals.subtotal).toBe(3333);
    expect(totals.discount).toBe(333);
    expect(totals.total).toBe(3000);
  });

  it('treats a half-typed discount as zero rather than blowing up the total', () => {
    for (const partial of ['1.', '.', '-', 'abc', '1.234']) {
      const totals = computeTotals([line(3500, 1)], 'amount', partial);
      expect(totals.total, partial).toBe(3500);
    }
  });

  it('never lets a discount drive the total negative', () => {
    expect(computeTotals([line(3500, 1)], 'amount', '999').total).toBe(0);
    expect(computeTotals([line(3500, 1)], 'percent', '250').total).toBe(0);
    expect(computeTotals([line(3500, 1)], 'amount', '-50').discount).toBe(0);
  });

  it('is empty for an empty cart', () => {
    expect(computeTotals([], 'amount', '10')).toEqual({ subtotal: 0, discount: 0, total: 0 });
  });

  it('rounds fractional quantities to whole cents once, at the line', () => {
    // 0.75 kg of teff at 120.00/kg = 90.00 exactly.
    expect(computeTotals([line(12000, 0.75)], 'amount', '').subtotal).toBe(9000);
    // 0.333 kg at 12.35 -> 4.11 (411.255 rounds to 411), not a fraction of a cent.
    expect(computeTotals([line(1235, 0.333)], 'amount', '').subtotal).toBe(411);
  });
});
