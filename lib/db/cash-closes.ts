import type { CashUp } from '@/lib/reports/compute';
import { getDevice } from './device';
import { newId, nowIso } from './id';
import { db } from './schema';
import type { CashClose } from './schema';

/**
 * Record a drawer count. Append-only: saving again (a recount, or a second
 * shift) adds a row and never touches an earlier one, so a shortfall stays on
 * the record however the drawer looks later.
 *
 * Needs a counted amount — a close with nothing counted says nothing. The
 * figures are copied, not recomputed later, because a sale voided tomorrow
 * must not rewrite what the drawer held tonight.
 */
export async function saveCashClose(input: {
  periodFrom: string;
  periodTo: string;
  cashUp: CashUp;
}): Promise<CashClose> {
  const { cashUp } = input;
  if (cashUp.counted === null || cashUp.variance === null) {
    throw new Error('A cash close needs a counted amount.');
  }
  for (const amount of [cashUp.openingFloat, cashUp.cashSales, cashUp.expected, cashUp.counted]) {
    if (!Number.isInteger(amount)) throw new Error('Cash close amounts must be integer cents.');
  }

  const meta = await getDevice();
  const close: CashClose = {
    id: newId(),
    shop_id: meta.shop_id,
    device_id: meta.device_id,
    period_from: input.periodFrom,
    period_to: input.periodTo,
    opening_float: cashUp.openingFloat,
    cash_sales: cashUp.cashSales,
    expected: cashUp.expected,
    counted: cashUp.counted,
    variance: cashUp.variance,
    cashier_name: meta.cashier_name,
    created_at: nowIso(),
  };

  await db.cash_closes.add(close);
  return close;
}

/** Newest first, through the created_at index. */
export async function recentCashCloses(limit = 14): Promise<CashClose[]> {
  return db.cash_closes.orderBy('created_at').reverse().limit(limit).toArray();
}
