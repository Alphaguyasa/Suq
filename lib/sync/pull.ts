import type { SuqDatabase } from '@/lib/db';
import { DEVICE_META_ID, db as defaultDb } from '@/lib/db';
import { applyAppendOnly, applyProducts } from './apply';
import { MissingColumnError } from './client';
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
 * How far behind the watermark each pull starts re-reading.
 *
 * received_at is stamped by a trigger while the writing transaction runs,
 * but the row only becomes visible when it commits. A pull that reads
 * server_now() between those two moments sets a watermark past a row it never
 * saw. Re-reading a short window behind the watermark closes that gap; the
 * cost is a few duplicate rows per pull, which apply skips.
 */
export const PULL_OVERLAP_MS = 2 * 60_000;

/** The pre-received_at watermarks, still used until the migration is applied. */
const LEGACY_COLUMNS: Record<SyncedTable, WatermarkColumn> = {
  products: 'updated_at',
  sales: 'created_at',
  sale_items: 'created_at',
  stock_movements: 'created_at',
};

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
 * received_at is server bookkeeping. It is not part of the local row, and
 * keeping it out means a product edited here never carries it back.
 */
function stripServerColumns(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(({ received_at: _server, ...row }) => row);
}

function minus(iso: string, ms: number): string {
  return new Date(Math.max(0, Date.parse(iso) - ms)).toISOString();
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
 *
 * And rows are filtered by received_at — when the SERVER got them — not by
 * created_at. A till that was offline at 09:50 pushes its sale at 10:05 still
 * stamped 09:50; filtering on created_at, a till that pulled at 10:00 would
 * never see it. received_at is in the same (server) clock as the watermark,
 * so a late push always lands after it.
 *
 * Projects without the received_at migration fall back to the legacy
 * columns, so an app update never stops a till syncing. The first pull on
 * received_at starts from the beginning: rows the legacy filter skipped are
 * recovered once, and apply drops everything already held.
 */
export async function pullOnce(
  client: SyncClient,
  db: SuqDatabase = defaultDb,
): Promise<PullResult> {
  // Read from the database we were handed, not the singleton: a second
  // replica has its own device_meta and its own watermark.
  const meta = await db.device_meta.get(DEVICE_META_ID);
  if (!meta) throw new Error('Cannot pull before the device is registered.');

  const serverTime = await client.serverNow();

  const receivedSince =
    meta.pull_column === 'received_at' && meta.last_pull_at
      ? minus(meta.last_pull_at, PULL_OVERLAP_MS)
      : BEGINNING;

  let pullColumn: 'received_at' | undefined = 'received_at';
  let since = receivedSince;
  const columnFor = (table: SyncedTable): WatermarkColumn =>
    pullColumn === 'received_at' ? 'received_at' : LEGACY_COLUMNS[table];
  const fetchTable = (table: SyncedTable) =>
    fetchAll(client, table, meta.shop_id, columnFor(table), since).then(stripServerColumns);

  // products first, alone: it doubles as the probe for the migration, so a
  // project without it costs one failed request per pull, not four.
  let products: Record<string, unknown>[];
  try {
    products = await fetchTable('products');
  } catch (cause) {
    if (!(cause instanceof MissingColumnError)) throw cause;
    pullColumn = undefined;
    since = meta.pull_column === undefined ? (meta.last_pull_at ?? BEGINNING) : BEGINNING;
    products = await fetchTable('products');
  }

  const [sales, saleItems, movements] = await Promise.all([
    fetchTable('sales'),
    fetchTable('sale_items'),
    fetchTable('stock_movements'),
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
  await db.device_meta.update(DEVICE_META_ID, {
    last_pull_at: serverTime,
    pull_column: pullColumn,
  });

  return { ...total, serverTime };
}
