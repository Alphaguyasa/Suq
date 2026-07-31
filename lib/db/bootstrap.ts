import { DEVICE_META_ID, registerDevice } from './device';
import { newId } from './id';
import { db } from './schema';
import type { DeviceMeta } from './schema';

/**
 * Every write needs a registered till: shop_id, device_id and the receipt
 * prefix all come from device_meta. Session 8 builds the real first-run flow
 * (shop details -> device prefix -> first cashier). Until then this registers
 * a default till on first load so the app is usable.
 *
 * Idempotent, and it never touches an existing row — re-running it can't reset
 * the receipt counter.
 */
export async function ensureDevice(): Promise<DeviceMeta> {
  const existing = await db.device_meta.get(DEVICE_META_ID);
  if (existing) return existing;

  return registerDevice({
    shop_id: newId(),
    device_prefix: 'A1',
    cashier_name: '',
  });
}
