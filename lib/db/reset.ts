import { db } from './schema';

/**
 * Wipe every trace of this shop from the device.
 *
 * Genuinely destructive: anything still sitting in the outbox has never
 * reached the server and cannot be recovered from anywhere. The settings UI
 * makes you type the shop name first, and says so plainly.
 *
 * device_meta goes too, so the next launch runs first-run setup again and the
 * local receipt counter restarts. Receipt numbers do not repeat, though: if
 * the till is set up again with a prefix the shop already used, nextReceiptNo()
 * continues past the highest such receipt once the first pull brings them back.
 */
export async function resetDevice(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
