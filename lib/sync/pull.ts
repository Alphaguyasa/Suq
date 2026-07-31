import type { SuqDatabase } from '@/lib/db';
import { DEVICE_META_ID, db as defaultDb } from '@/lib/db';
import { applyAppendOnly, applyProducts } from './apply';
import type { SyncClient } from './client';

/** The epoch, for a device that has never pulled. */
const BEGINNING = '1970-01-01T00:00:00.000Z';

export interface PullResult {
  inserted: number;
  updated: number;
  skipped: number;
  serverTime: string;
}

/**
 * Pull deltas for this shop.
 *
 * The watermark is read from the SERVER before fetching anything, and only
 * committed after every table has been applied. Two bugs that buys us:
 *
 *   - Tablet clock drift. A till running three minutes fast would use its own
 *     future timestamp as `since` and silently skip every row written in that
 *     window, on every pull, forever (BUILD_GUIDE 4.2).
 *   - Rows written during the fetch. Taking the timestamp first means the next
 *     pull re-reads that overlap rather than stepping over it. Re-reading is
 *     free — applyAppendOnly skips rows we already hold.
 */
export async function pullOnce(
  client: SyncClient,
  db: SuqDatabase = defaultDb,
): Promise<PullResult> {
  // Read from the database we were handed, not the singleton: a second
  // replica has its own device_meta and its own watermark.
  const meta = await db.device_meta.get(DEVICE_META_ID);
  if (!meta) throw new Error('Cannot pull before the device is registered.');

  const since = meta.last_pull_at ?? BEGINNING;

  const serverTime = await client.serverNow();

  const [products, sales, saleItems, movements] = await Promise.all([
    client.fetchSince('products', meta.shop_id, 'updated_at', since),
    client.fetchSince('sales', meta.shop_id, 'created_at', since),
    client.fetchSince('sale_items', meta.shop_id, 'created_at', since),
    client.fetchSince('stock_movements', meta.shop_id, 'created_at', since),
  ]);

  const results = [
    await applyProducts(products, db),
    await applyAppendOnly('sales', sales, db),
    await applyAppendOnly('sale_items', saleItems, db),
    await applyAppendOnly('stock_movements', movements, db),
  ];

  const total = results.reduce(
    (sum, result) => ({
      inserted: sum.inserted + result.inserted,
      updated: sum.updated + result.updated,
      skipped: sum.skipped + result.skipped,
    }),
    { inserted: 0, updated: 0, skipped: 0 },
  );

  // Only now, once everything landed. A crash before this point just means
  // the next pull re-reads the same window.
  await db.device_meta.update(DEVICE_META_ID, { last_pull_at: serverTime });

  return { ...total, serverTime };
}
