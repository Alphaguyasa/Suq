import { newId } from './id';
import { db } from './schema';
import type { DeviceMeta } from './schema';

/** device_meta holds exactly one row. */
export const DEVICE_META_ID = 'device';

export interface RegisterDeviceInput {
  shop_id: string;
  /** Short per-till prefix: "A1", "A2", "B1". Assigned once at setup. */
  device_prefix: string;
  cashier_name?: string;
}

/**
 * Idempotent. Returns the existing device row if one is already registered,
 * so a re-run of first-run setup can never reset the receipt counter.
 */
export async function registerDevice(input: RegisterDeviceInput): Promise<DeviceMeta> {
  return db.transaction('rw', db.device_meta, async () => {
    const existing = await db.device_meta.get(DEVICE_META_ID);
    if (existing) return existing;

    const meta: DeviceMeta = {
      id: DEVICE_META_ID,
      device_id: newId(),
      device_prefix: input.device_prefix,
      shop_id: input.shop_id,
      receipt_counter: 0,
      last_pull_at: null,
      cashier_name: input.cashier_name ?? '',
    };

    await db.device_meta.put(meta);
    return meta;
  });
}

export async function getDevice(): Promise<DeviceMeta> {
  const meta = await db.device_meta.get(DEVICE_META_ID);
  if (!meta) {
    throw new Error('Device is not registered. Run registerDevice() during first-run setup.');
  }
  return meta;
}

/**
 * Format: {DEVICE_PREFIX}-{6 digit local counter} -> "A1-000142".
 *
 * The counter is local and monotonic, which is why two offline tills can
 * never collide without coordinating. Must be called inside the same
 * transaction as the sale it numbers, or a crash between numbering and
 * writing would burn a receipt number.
 */
export async function nextReceiptNo(): Promise<string> {
  const meta = await getDevice();
  const next = meta.receipt_counter + 1;

  await db.device_meta.update(DEVICE_META_ID, { receipt_counter: next });

  return `${meta.device_prefix}-${String(next).padStart(6, '0')}`;
}

/** Server time from the pull response. Never Date.now() — see BUILD_GUIDE 4.2. */
export async function setLastPullAt(serverTime: string): Promise<void> {
  await db.device_meta.update(DEVICE_META_ID, { last_pull_at: serverTime });
}

export async function setCashier(cashier_name: string): Promise<void> {
  await db.device_meta.update(DEVICE_META_ID, { cashier_name });
}
