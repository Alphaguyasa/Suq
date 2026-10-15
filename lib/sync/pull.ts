import type { SuqDatabase } from '@/lib/db';
import { DEVICE_META_ID, db as defaultDb } from '@/lib/db';
import { applyAppendOnly, applyProducts } from './apply';
import type { PageCursor, SyncClient, WatermarkColumn } from './client';
import type { SyncedTable } from '@/lib/db';

/** The epoch, for a device that has never pulled. */
const BEGINNING = '1970-01-01T00:00:00.000Z';

/**
 * Rows per request. Must stay at or below the project's PostgREST max-rows
 * (Supabase default 1000): a server that silently caps a page below this
 * would look like a short — final — page, and the rest would be skipped.
 */
export const PULL_PAGE_SIZE = 500;

/**
 * Every row after `since`, page by page.
 *
 * A single unbounded select is silently truncated at the server's row cap,
 * and since the watermark then moves past the whole window, everything
 * beyond the cap would never reach this till (a second till joining a shop
 * with a month of sales). So: keyset pages until a short one.
 */
async function fetchAll(
  client: SyncClient,
  table: SyncedTable,
  shopId: string,
  column: WatermarkColumn,
  since: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: PageCursor = { value: since, id: null };

  for (;;) {
    const page = await client.fetchSince(table, shopId, column, cursor, PULL_PAGE_SIZE);
    rows.push(...page);
    if (page.length < PULL_PAGE_SIZE) return rows;

    const last = page[page.length - 1]!;
    const next: PageCursor = { value: String(last[column]), id: String(last.id) };

    // A server that ignored the cursor would hand back the same page
    // forever. Fail the pull (watermark untouched) rather than spin.
    if (next.value === cursor.value && next.id === cursor.id) {
      throw new Error(`${table}: pull cursor did not advance`);
    }
    cursor = next;
  }
}

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
    fetchAll(client, 'products', meta.shop_id, 'updated_at', since),
    fetchAll(client, 'sales', meta.shop_id, 'created_at', since),
    fetchAll(client, 'sale_items', meta.shop_id, 'created_at', since),
    fetchAll(client, 'stock_movements', meta.shop_id, 'created_at', since),
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
