import { describe, expect, it } from 'vitest';
import type { Sale } from '@/lib/db';
import { groupByDay, localDayKey } from './grouping';

function sale(overrides: Partial<Sale> & { created_at: string; total: number }): Sale {
  return {
    id: `s-${overrides.created_at}-${overrides.total}`,
    shop_id: 'shop',
    device_id: 'device',
    receipt_no: 'A1-000001',
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

describe('groupByDay', () => {
  it('groups by local day, newest day first', () => {
    const days = groupByDay([
      sale({ created_at: '2026-07-31T18:00:00.000Z', total: 5000 }),
      sale({ created_at: '2026-07-31T09:00:00.000Z', total: 3000 }),
      sale({ created_at: '2026-07-29T09:00:00.000Z', total: 1000 }),
    ]);

    expect(days).toHaveLength(2);
    expect(days[0]?.sales).toHaveLength(2);
    expect(days[0]?.total).toBe(8000);
    expect(days[1]?.total).toBe(1000);
    expect(days[0]?.date.localeCompare(days[1]?.date ?? '')).toBeGreaterThan(0);
  });

  it('nets void rows out of the daily total without counting them as sales', () => {
    const original = sale({ created_at: '2026-07-31T10:00:00.000Z', total: 5000 });
    const voidRow = sale({
      created_at: '2026-07-31T10:05:00.000Z',
      total: -5000,
      voids_sale_id: original.id,
    });

    const [day] = groupByDay([voidRow, original]);

    expect(day?.total).toBe(0);
    expect(day?.count).toBe(1);
    expect(day?.sales).toHaveLength(2);
  });

  it('is empty for no sales', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('localDayKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(localDayKey('2026-07-31T18:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
