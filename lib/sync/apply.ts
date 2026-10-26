import type { EntityTable } from 'dexie';
import type { Product, SuqDatabase, SyncedTable } from '@/lib/db';
import { db as defaultDb, stockRepo } from '@/lib/db';

/**
 * ============================================================================
 * The one sanctioned exception to "localWrite() is the only mutation path".
 *
 * Rows arriving from the server must NOT go through localWrite(), because
 * localWrite queues an outbox entry — and a row we just received would then be
 * pushed straight back, forever. Replication is not a local mutation.
 *
 * Nothing else may write here. If you are adding a feature and this file looks
 * convenient, you want localWrite() (docs/RULES.md rule 3).
 * ============================================================================
 */

export interface ApplyResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Append-only tables: insert if absent, skip if present. Rows are immutable,
 * so a row we already hold is by definition identical to the incoming one and
 * there is nothing to reconcile.
 */
export async function applyAppendOnly(
  table: Extract<SyncedTable, 'sales' | 'sale_items' | 'stock_movements'>,
  rows: Record<string, unknown>[],
  db: SuqDatabase = defaultDb,
): Promise<ApplyResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const result: ApplyResult = { inserted: 0, updated: 0, skipped: 0 };

  // db[table] is a union of three EntityTable types; TypeScript cannot pick an
  // overload from the generic alone. Safe because all three are keyed by id.
  const target = db[table] as unknown as EntityTable<{ id: string }, 'id'>;

  // A pulled movement changes stock just like a local one, so the screens'
  // stock cache is refreshed for the products it touched, in the same
  // transaction: no moment where the movement exists and the cache is stale.
  const tables = table === 'stock_movements' ? [db.stock_movements, db.stock_cache] : [db[table]];

  await db.transaction('rw', tables, async () => {
    const ids = rows.map((row) => row.id as string);
    const existing = new Set(
      (await target.bulkGet(ids)).filter(Boolean).map((row) => (row as { id: string }).id),
    );

    const fresh = rows.filter((row) => !existing.has(row.id as string));
    result.skipped = rows.length - fresh.length;
    result.inserted = fresh.length;

    if (fresh.length > 0) {
      await target.bulkPut(fresh as unknown as { id: string }[]);

      if (table === 'stock_movements') {
        await stockRepo.recomputeCacheFor(
          fresh.map((row) => row.product_id as string),
          db,
        );
      }
    }
  });

  return result;
}

/**
 * products is last-write-wins: overwrite only when the incoming row is
 * genuinely newer. An equal timestamp is not newer — leaving the local row
 * alone keeps this idempotent across repeated pulls.
 */
export async function applyProducts(
  rows: Record<string, unknown>[],
  db: SuqDatabase = defaultDb,
): Promise<ApplyResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const result: ApplyResult = { inserted: 0, updated: 0, skipped: 0 };

  await db.transaction('rw', db.products, async () => {
    const ids = rows.map((row) => row.id as string);
    const locals = await db.products.bulkGet(ids);
    const localById = new Map<string, Product>();

    for (const local of locals) {
      if (local) localById.set(local.id, local);
    }

    const toWrite: Product[] = [];

    for (const row of rows) {
      const incoming = row as unknown as Product;
      const local = localById.get(incoming.id);

      if (!local) {
        toWrite.push(incoming);
        result.inserted += 1;
      } else if (incoming.updated_at > local.updated_at) {
        toWrite.push(incoming);
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    }

    if (toWrite.length > 0) await db.products.bulkPut(toWrite);
  });

  return result;
}
