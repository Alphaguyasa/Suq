import type { EntityTable } from 'dexie';
import { nowIso } from './id';
import { db } from './schema';
import type {
  OutboxEntry,
  Product,
  Sale,
  SaleItem,
  StockMovement,
  SuqDatabase,
  SyncedTable,
} from './schema';

/**
 * ============================================================================
 * THIS IS THE ONLY MUTATION PATH IN THE ENTIRE CODEBASE.
 *
 * Nothing else may call db.products.put(), db.sales.put(), db.sale_items.put()
 * or db.stock_movements.put(). Not a component, not a hook, not another
 * repository. No exceptions. (docs/RULES.md rule 3, BUILD_GUIDE 4.3.)
 *
 * The domain row and its outbox row are written inside ONE IndexedDB
 * transaction, so either both land or neither does. Bypass this and you can
 * produce a sale that exists locally but will never sync — the single most
 * damaging failure mode this app has, because it stays invisible until
 * someone reconciles the cash drawer weeks later.
 *
 * db.outbox, db.device_meta and db.stock_cache are local-only machinery and
 * are written directly by their own modules; they never replicate, so they
 * have nothing to queue.
 * ============================================================================
 */

type RowFor<T extends SyncedTable> = T extends 'products'
  ? Product
  : T extends 'sales'
    ? Sale
    : T extends 'sale_items'
      ? SaleItem
      : T extends 'stock_movements'
        ? StockMovement
        : never;

/**
 * db[table] is a union of four EntityTable types, which TypeScript will not
 * narrow from the generic alone. The cast is safe because RowFor<T> is defined
 * as exactly the row type of table T.
 */
function tableFor<T extends SyncedTable>(
  database: SuqDatabase,
  table: T,
): EntityTable<RowFor<T>, 'id'> {
  return database[table] as unknown as EntityTable<RowFor<T>, 'id'>;
}

/**
 * Push fires immediately after any write (BUILD_GUIDE 4.1). Rather than have
 * the db layer import the sync engine, writes announce themselves and the
 * engine subscribes.
 */
type WriteListener = () => void;
const writeListeners = new Set<WriteListener>();

export function onLocalWrite(listener: WriteListener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function announceWrite(): void {
  for (const listener of writeListeners) listener();
}

function outboxEntry(table: SyncedTable, row: { id: string }): OutboxEntry {
  return {
    table,
    op: 'upsert',
    row_id: row.id,
    payload: row,
    created_at: nowIso(),
    attempts: 0,
    last_error: null,
    last_tried_at: null,
  };
}

/**
 * Write one domain row and queue it for push, atomically.
 *
 * `database` defaults to the singleton. It is a parameter so the sync tests
 * can drive a second replica through this same path rather than hand-rolling
 * rows that only resemble what the app writes.
 */
export async function localWrite<T extends SyncedTable>(
  table: T,
  row: RowFor<T>,
  database: SuqDatabase = db,
): Promise<void> {
  await database.transaction('rw', database[table], database.outbox, async () => {
    await tableFor(database, table).put(row);
    await database.outbox.add(outboxEntry(table, row));
  });

  announceWrite();
}

/**
 * Same guarantee for a batch. Used by sales.create(), which must land a sale,
 * its items and its stock movements together or not at all.
 */
export async function localWriteMany<T extends SyncedTable>(
  table: T,
  rows: RowFor<T>[],
  database: SuqDatabase = db,
): Promise<void> {
  if (rows.length === 0) return;

  await database.transaction('rw', database[table], database.outbox, async () => {
    await tableFor(database, table).bulkPut(rows);
    await database.outbox.bulkAdd(rows.map((row) => outboxEntry(table, row)));
  });

  announceWrite();
}
