import type { OutboxEntry, SuqDatabase, SyncedTable } from '@/lib/db';
import { db as defaultDb } from '@/lib/db';
import type { SyncClient } from './client';

/** BUILD_GUIDE 4.1: drain in id order, batches of 50. */
export const PUSH_BATCH_SIZE = 50;

/** Rows are immutable, so a duplicate arrival is a no-op rather than an overwrite. */
const APPEND_ONLY: ReadonlySet<SyncedTable> = new Set([
  'sales',
  'sale_items',
  'stock_movements',
]);

/** Fixed table order, so a batch cannot land parent-after-child. */
const TABLE_ORDER: SyncedTable[] = ['products', 'sales', 'sale_items', 'stock_movements'];

/** 2s doubling to a 60s cap. */
export function backoffMs(attempts: number): number {
  return Math.min(2000 * 2 ** Math.max(0, attempts - 1), 60_000);
}

/** synced_at is local bookkeeping and has no column in Postgres. */
function forWire(table: SyncedTable, payload: unknown): unknown {
  if (table !== 'sales') return payload;

  const { synced_at: _ignored, ...rest } = payload as Record<string, unknown>;
  return rest;
}

export interface PushResult {
  pushed: number;
  /** True when the outbox still holds rows this run did not clear. */
  remaining: boolean;
  error?: string;
}

/**
 * Drain one batch.
 *
 * Every row carries a client-generated uuid, so a push that actually succeeded
 * but whose response was lost is a no-op on retry. That is what makes the
 * network's unreliability harmless (BUILD_GUIDE 4.1) — and it is why this
 * deletes outbox rows only after a confirmed success.
 */
export async function pushOnce(
  client: SyncClient,
  db: SuqDatabase = defaultDb,
): Promise<PushResult> {
  const batch = await db.outbox.orderBy('id').limit(PUSH_BATCH_SIZE).toArray();
  if (batch.length === 0) return { pushed: 0, remaining: false };

  const ready = batch.filter(isReady);
  if (ready.length === 0) return { pushed: 0, remaining: true };

  const byTable = new Map<SyncedTable, OutboxEntry[]>();
  for (const entry of ready) {
    const existing = byTable.get(entry.table);
    if (existing) existing.push(entry);
    else byTable.set(entry.table, [entry]);
  }

  for (const table of TABLE_ORDER) {
    const entries = byTable.get(table);
    if (!entries || entries.length === 0) continue;

    try {
      await client.upsert(
        table,
        entries.map((entry) => forWire(table, entry.payload)),
        APPEND_ONLY.has(table),
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await recordFailure(db, entries, message);
      return { pushed: 0, remaining: true, error: message };
    }

    // Confirmed success for this table — those rows are safe to forget.
    await db.outbox.bulkDelete(entries.map((entry) => entry.id as number));
  }

  const remaining = (await db.outbox.count()) > 0;
  return { pushed: ready.length, remaining };
}

function isReady(entry: OutboxEntry): boolean {
  if (entry.attempts === 0) return true;

  const lastTried = Date.parse(entry.last_tried_at ?? entry.created_at);
  return Date.now() - lastTried >= backoffMs(entry.attempts);
}

async function recordFailure(
  db: SuqDatabase,
  entries: OutboxEntry[],
  message: string,
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction('rw', db.outbox, async () => {
    for (const entry of entries) {
      await db.outbox.update(entry.id as number, {
        attempts: entry.attempts + 1,
        last_error: message,
        last_tried_at: now,
      });
    }
  });
}

/** Drain until empty or something fails. Used on reconnect and cold start. */
export async function drainOutbox(
  client: SyncClient,
  db: SuqDatabase = defaultDb,
  maxBatches = 100,
): Promise<PushResult> {
  let pushed = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const result = await pushOnce(client, db);
    pushed += result.pushed;

    if (result.error) return { ...result, pushed };
    if (!result.remaining) return { pushed, remaining: false };
    if (result.pushed === 0) return { pushed, remaining: true };
  }

  return { pushed, remaining: true };
}
