import { db } from './schema';

/**
 * Wipe every trace of this shop from the device.
 *
 * Genuinely destructive: anything still sitting in the outbox has never
 * reached the server and cannot be recovered from anywhere. The settings UI
 * makes you type the shop name first, and says so plainly.
 *
 * device_meta goes too, so the next launch runs first-run setup again and the
 * receipt counter restarts — appropriate, because this is now a different
 * shop as far as the device is concerned.
 */
export async function resetDevice(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
