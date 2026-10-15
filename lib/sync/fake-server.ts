/**
 * An in-memory replica that behaves like the Postgres side: upsert on id,
 * ignore duplicates on the append-only tables, filter by shop_id and a
 * watermark, and keep its OWN clock.
 *
 * Test-only. It exists because test 1 — two devices, both offline, both
 * selling the last unit — only proves anything if something actually stores
 * and merges the rows. Asserting against a mock would prove the mock.
 */
import type { SyncedTable } from '@/lib/db';
import type { SyncClient } from './client';

type Row = Record<string, unknown>;

const APPEND_ONLY: ReadonlySet<SyncedTable> = new Set(['sales', 'sale_items', 'stock_movements']);

export class FakeServer {
  readonly tables: Record<SyncedTable, Map<string, Row>> = {
    products: new Map(),
    sales: new Map(),
    sale_items: new Map(),
    stock_movements: new Map(),
  };

  /** The server's own clock, deliberately unrelated to Date.now(). */
  private clock = Date.parse('2026-07-31T12:00:00.000Z');

  offline = false;
  failUpsertsRemaining = 0;

  /** PostgREST's max-rows: a select never returns more, whatever it asks for. */
  maxRows = 1000;

  /** Successful fetches left before the network drops; null = never drops. */
  fetchesBeforeOffline: number | null = null;

  /** Rows per fetch call, so a test can prove paging. */
  readonly fetchSizes: number[] = [];

  /** Rows per upsert call, so a test can prove batching. */
  readonly upsertBatchSizes: number[] = [];

  tick(ms = 1000): void {
    this.clock += ms;
  }

  serverIso(): string {
    return new Date(this.clock).toISOString();
  }

  rows(table: SyncedTable): Row[] {
    return [...this.tables[table].values()];
  }

  count(table: SyncedTable): number {
    return this.tables[table].size;
  }

  /** Straight into the store, as though another till had already pushed. */
  seed(table: SyncedTable, rows: Row[]): void {
    for (const row of rows) this.tables[table].set(row.id as string, { ...row });
  }

  onHand(productId: string): number {
    return this.rows('stock_movements')
      .filter((row) => row.product_id === productId)
      .reduce((sum, row) => sum + Number(row.qty_delta), 0);
  }

  client(): SyncClient {
    return {
      upsert: async (table, rows, appendOnly) => {
        this.assertReachable();

        if (this.failUpsertsRemaining > 0) {
          this.failUpsertsRemaining -= 1;
          throw new Error('connection reset by peer');
        }

        this.upsertBatchSizes.push(rows.length);
        const store = this.tables[table];

        for (const row of rows as Row[]) {
          const id = row.id as string;

          // ignoreDuplicates: an append-only row already here is identical.
          if (appendOnly && store.has(id)) continue;
          if (appendOnly !== APPEND_ONLY.has(table)) {
            throw new Error(`${table}: wrong append-only flag`);
          }

          store.set(id, { ...row });
        }
      },

      fetchSince: async (table, shopId, column, after, limit) => {
        if (this.fetchesBeforeOffline !== null) {
          if (this.fetchesBeforeOffline === 0) this.offline = true;
          else this.fetchesBeforeOffline -= 1;
        }
        this.assertReachable();

        // Same semantics as the PostgREST query: strictly after the
        // (watermark, id) key, ordered by it, capped at max-rows.
        const key = (row: Row): [string, string] => [String(row[column]), String(row.id)];
        const compare = (a: [string, string], b: [string, string]): number =>
          a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;

        const page = this.rows(table)
          .filter((row) => {
            if (row.shop_id !== shopId) return false;
            const [value, id] = key(row);
            if (after.id === null) return value > after.value;
            return compare([value, id], [after.value, after.id]) > 0;
          })
          .sort((a, b) => compare(key(a), key(b)))
          .slice(0, Math.min(limit, this.maxRows));

        this.fetchSizes.push(page.length);
        return page;
      },

      serverNow: async () => {
        this.assertReachable();
        return this.serverIso();
      },
    };
  }

  private assertReachable(): void {
    if (this.offline) throw new Error('network unreachable');
  }
}
