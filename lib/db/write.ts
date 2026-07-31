import type { EntityTable } from 'dexie';
import { nowIso } from './id';
import { db } from './schema';
import type { OutboxEntry, Product, Sale, SaleItem, StockMovement, SyncedTable } from './schema';

/**
 * ============================================================================
 * THIS IS THE ONLY MUTATION PATH IN THE ENTIRE CODEBASE.
 *
 * Nothing else may call db.products.put(), db.sales.put(), db.sale_items.put()
 * or db.stock_movements.put(). Not a component, not a hook, not another
 * repository. No exceptions. (CLAUDE.md rule 3, BUILD_GUIDE 4.3.)
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
function tableFor<T extends SyncedTable>(table: T): EntityTable<RowFor<T>, 'id'> {
  return db[table] as unknown as EntityTable<RowFor<T>, 'id'>;
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
  };
}

/** Write one domain row and queue it for push, atomically. */
export async function localWrite<T extends SyncedTable>(table: T, row: RowFor<T>): Promise<void> {
  await db.transaction('rw', db[table], db.outbox, async () => {
    await tableFor(table).put(row);
    await db.outbox.add(outboxEntry(table, row));
  });
}

/**
 * Same guarantee for a batch. Used by sales.create(), which must land a sale,
 * its items and its stock movements together or not at all.
 */
export async function localWriteMany<T extends SyncedTable>(
  table: T,
  rows: RowFor<T>[],
): Promise<void> {
  if (rows.length === 0) return;

  await db.transaction('rw', db[table], db.outbox, async () => {
    await tableFor(table).bulkPut(rows);
    await db.outbox.bulkAdd(rows.map((row) => outboxEntry(table, row)));
  });
}
