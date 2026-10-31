import { DEVICE_META_ID, highestReceiptCounter } from './device';
import { rememberPreviousTill } from './previous-till';
import { db } from './schema';

/**
 * Wipe every trace of this shop from the device.
 *
 * Genuinely destructive: anything still sitting in the outbox has never
 * reached the server and cannot be recovered from anywhere. The settings UI
 * makes you type the shop name first, and says so plainly.
 *
 * device_meta goes too, so the next launch runs first-run setup again and the
 * local receipt counter restarts. Receipt numbers do not repeat, though: the
 * till's id and counter are kept outside IndexedDB first (previous-till.ts),
 * and if the till is set up again with a prefix another till used,
 * nextReceiptNo() continues past those receipts once the first pull brings
 * them back.
 */
export async function resetDevice(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const meta = await db.device_meta.get(DEVICE_META_ID);
    if (meta) {
      rememberPreviousTill({
        device_id: meta.device_id,
        device_prefix: meta.device_prefix,
        receipt_counter: Math.max(meta.receipt_counter, await highestReceiptCounter(meta.device_prefix)),
      });
    }
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

export interface UnsyncedSummary {
  /** Every outbox row: sales, their lines, stock movements, product edits. */
  total: number;
  /** Of those, sale rows (voids included), the ones an owner counts. */
  sales: number;
}

/**
 * What a reset would destroy for good: the outbox is the only record of
 * changes the server has never seen. Everything else on the device comes
 * back with the first pull after signing in again.
 */
export async function unsyncedSummary(): Promise<UnsyncedSummary> {
  return db.transaction('r', db.outbox, async () => {
    const [total, sales] = await Promise.all([
      db.outbox.count(),
      db.outbox.where('table').equals('sales').count(),
    ]);
    return { total, sales };
  });
}
