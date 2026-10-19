import type { EntityTable } from 'dexie';
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
 * transaction as the sale it numbers (with `sales` in scope), or a crash
 * between numbering and writing would burn a receipt number.
 *
 * The counter alone is not enough: "reset device" wipes it, and Settings lets
 * the prefix change to one an earlier till already printed. Re-running setup
 * with the same prefix would then hand out A1-000001 a second time. So the
 * next number is also kept above every receipt with this prefix the device
 * knows about — its own and any pulled from the server — and the gap closes
 * on the first pull after a reset.
 */
export async function nextReceiptNo(): Promise<string> {
  const meta = await getDevice();
  const next = Math.max(meta.receipt_counter, await highestReceiptCounter(meta.device_prefix)) + 1;

  await db.device_meta.update(DEVICE_META_ID, { receipt_counter: next });

  return formatReceiptNo(meta.device_prefix, next);
}

export function formatReceiptNo(prefix: string, counter: number): string {
  return `${prefix}-${String(counter).padStart(6, '0')}`;
}

/** Sales whose receipt number starts with "{prefix}-", via the receipt_no index. */
function salesWithPrefix(prefix: string) {
  return db.sales.where('receipt_no').between(`${prefix}-`, `${prefix}-\uffff`);
}

/**
 * Highest counter on any local receipt carrying this prefix, 0 if none.
 *
 * Reads index keys only. The keys sort as strings, which matches numeric
 * order while counters are six digits (a million receipts on one prefix is
 * far beyond a small shop). The last few keys are parsed rather than just the
 * last one so a stray non-numeric receipt number cannot hide the real maximum.
 */
export async function highestReceiptCounter(prefix: string): Promise<number> {
  const keys = (await salesWithPrefix(prefix).reverse().limit(50).keys()) as string[];
  let highest = 0;
  for (const key of keys) {
    const counter = Number(key.slice(prefix.length + 1));
    if (Number.isInteger(counter) && counter > highest) highest = counter;
  }
  return highest;
}

/**
 * True when receipts with this prefix were printed by a different device_id.
 *
 * That is either another till in the shop using the same code (receipts will
 * interleave, and two offline sales can get the same number), or this till
 * before a reset (harmless now that numbering continues past them). Settings
 * and setup cannot tell those apart, so they warn and let the owner decide.
 */
export async function isPrefixUsedByAnotherDevice(prefix: string, deviceId: string): Promise<boolean> {
  if (!prefix) return false;
  const other = await salesWithPrefix(prefix)
    .filter((sale) => sale.device_id !== deviceId)
    .first();
  return other !== undefined;
}

/*
 * Letters that cannot be misread as digits on a thermal receipt, so a
 * suggested code never looks like "01" or "11".
 */
const PREFIX_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Default code offered by first-run setup. Every till used to default to "A1",
 * so two tills set up without changing it — or one till reset and set up
 * again — shared a prefix. A random letter+digit makes that unlikely (1 in
 * 216) without asking anything more of the owner.
 */
export function suggestDevicePrefix(random: () => number = Math.random): string {
  const letter = PREFIX_LETTERS[Math.floor(random() * PREFIX_LETTERS.length)];
  const digit = 1 + Math.floor(random() * 9);
  return `${letter}${digit}`;
}

/**
 * Adopt the real shop_id from the signed-in user's membership.
 *
 * Until someone signs in, ensureDevice() invents a placeholder shop_id, so
 * anything sold before that carries an id no RLS policy will ever match. This
 * re-stamps those rows and rebuilds their outbox payloads so the first push
 * lands correctly.
 *
 * It is a first-run repair, not a general capability: it refuses once the
 * device has pulled, because by then rows exist that the server already holds
 * under their original shop_id and re-stamping would orphan them.
 */
export async function adoptShopId(shopId: string): Promise<'adopted' | 'unchanged' | 'refused'> {
  const meta = await getDevice();
  if (meta.shop_id === shopId) return 'unchanged';
  if (meta.last_pull_at !== null) return 'refused';

  await db.transaction(
    'rw',
    [db.device_meta, db.products, db.sales, db.sale_items, db.stock_movements, db.outbox],
    async () => {
      await db.device_meta.update(DEVICE_META_ID, { shop_id: shopId });

      for (const table of ['products', 'sales', 'sale_items', 'stock_movements'] as const) {
        // Union of four EntityTable types; all are keyed by id and carry shop_id.
        const target = db[table] as unknown as EntityTable<
          { id: string; shop_id: string },
          'id'
        >;

        const stale = (await target.toArray()).filter((row) => row.shop_id !== shopId);
        if (stale.length === 0) continue;

        await target.bulkPut(stale.map((row) => ({ ...row, shop_id: shopId })));
      }

      // Outbox payloads are snapshots, so they need the same correction.
      const queued = await db.outbox.toArray();
      for (const entry of queued) {
        const payload = entry.payload as Record<string, unknown>;
        if (payload.shop_id === shopId) continue;
        await db.outbox.update(entry.id as number, {
          payload: { ...payload, shop_id: shopId },
        });
      }
    },
  );

  return 'adopted';
}

/** Server time from the pull response. Never Date.now() — see BUILD_GUIDE 4.2. */
export async function setLastPullAt(serverTime: string): Promise<void> {
  await db.device_meta.update(DEVICE_META_ID, { last_pull_at: serverTime });
}

export async function setCashier(cashier_name: string): Promise<void> {
  await db.device_meta.update(DEVICE_META_ID, { cashier_name });
}
