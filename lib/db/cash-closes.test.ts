import { beforeEach, describe, expect, it } from 'vitest';
import { cashUp } from '@/lib/reports/compute';
import { recentCashCloses, saveCashClose } from './cash-closes';
import { DEVICE_META_ID, getDevice } from './device';
import { db } from './schema';
import { TEST_SHOP, freshDatabase } from './test-helpers';

const DAY = { periodFrom: '2026-10-31T00:00:00.000Z', periodTo: '2026-11-01T00:00:00.000Z' };

beforeEach(async () => {
  await freshDatabase();
});

describe('saveCashClose', () => {
  it('records the figures as counted, in cents, with who counted', async () => {
    await db.device_meta.update(DEVICE_META_ID, { cashier_name: 'ሰላም' });
    const device = await getDevice();

    const close = await saveCashClose({ ...DAY, cashUp: { openingFloat: 50000, cashSales: 14500, expected: 64500, counted: 64000, variance: -500 } });

    expect(await db.cash_closes.get(close.id)).toEqual(close);
    expect(close).toMatchObject({
      shop_id: TEST_SHOP,
      device_id: device.device_id,
      period_from: DAY.periodFrom,
      period_to: DAY.periodTo,
      opening_float: 50000,
      cash_sales: 14500,
      expected: 64500,
      counted: 64000,
      variance: -500,
      cashier_name: 'ሰላም',
    });
  });

  it('refuses a close with nothing counted', async () => {
    await expect(saveCashClose({ ...DAY, cashUp: cashUp([], 50000, null) })).rejects.toThrow(/counted/);
    expect(await db.cash_closes.count()).toBe(0);
  });

  it('refuses fractional cents', async () => {
    await expect(
      saveCashClose({ ...DAY, cashUp: { openingFloat: 0.5, cashSales: 0, expected: 0.5, counted: 1, variance: 0.5 } }),
    ).rejects.toThrow(/integer cents/);
  });

  it('appends a recount instead of changing the first count', async () => {
    const first = await saveCashClose({ ...DAY, cashUp: cashUp([], 10000, 9000) });
    const second = await saveCashClose({ ...DAY, cashUp: cashUp([], 10000, 10000) });

    expect(await db.cash_closes.count()).toBe(2);
    expect((await db.cash_closes.get(first.id))?.variance).toBe(-1000);
    expect((await db.cash_closes.get(second.id))?.variance).toBe(0);
  });

  it('writes nothing to the outbox while closes are local only', async () => {
    const before = await db.outbox.count();
    await saveCashClose({ ...DAY, cashUp: cashUp([], 0, 0) });
    expect(await db.outbox.count()).toBe(before);
  });
});

describe('recentCashCloses', () => {
  it('lists newest first, up to the limit', async () => {
    for (const [i, at] of ['2026-10-29T18:00:00.000Z', '2026-10-31T18:00:00.000Z', '2026-10-30T18:00:00.000Z'].entries()) {
      await db.cash_closes.add({
        id: `close-${i}`,
        shop_id: TEST_SHOP,
        device_id: 'd',
        period_from: at,
        period_to: at,
        opening_float: 0,
        cash_sales: 0,
        expected: 0,
        counted: 0,
        variance: 0,
        cashier_name: '',
        created_at: at,
      });
    }

    expect((await recentCashCloses()).map((close) => close.created_at)).toEqual([
      '2026-10-31T18:00:00.000Z',
      '2026-10-30T18:00:00.000Z',
      '2026-10-29T18:00:00.000Z',
    ]);
    expect(await recentCashCloses(1)).toHaveLength(1);
  });
});
