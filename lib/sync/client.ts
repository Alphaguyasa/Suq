import type { SyncedTable } from '@/lib/db';
import { getSupabase } from '@/lib/supabase/client';

/**
 * The whole surface the sync engine needs from the network, behind one
 * interface. Two reasons this exists rather than calling supabase-js directly:
 *
 *   1. The tests can drive a real in-memory replica instead of asserting
 *      against mocks. Test 1 (two devices, both offline, both selling the last
 *      unit) is only meaningful if something actually stores and merges rows.
 *   2. Everything network-shaped is in one file, so nothing in push/pull can
 *      accidentally await the UI's network on a code path it shouldn't.
 */
export type WatermarkColumn = 'received_at' | 'created_at' | 'updated_at';

/**
 * The server has no such column. Pull uses it to tell a project that has not
 * had the received_at migration applied yet from a real failure, and falls
 * back to the legacy device-clock columns rather than stop syncing.
 */
export class MissingColumnError extends Error {
  constructor(readonly table: SyncedTable, readonly column: WatermarkColumn) {
    super(`${table}.${column} does not exist on the server`);
    this.name = 'MissingColumnError';
  }
}

/**
 * Keyset position in a (watermark, id) ordering. `id: null` means "everything
 * with watermark > value" — the first page of a pull.
 *
 * Keyset, not offset: rows keep arriving while a till pages through a long
 * history, and a product edit moves a row to a later position. An offset
 * would shift under both and skip a row; a key never moves. The id breaks
 * ties, so a page boundary in the middle of rows sharing one timestamp (a
 * bulk import, a multi-line sale) loses nothing either.
 *
 * `value` is passed back exactly as the server sent it. Never round-trip it
 * through Date: Postgres keeps microseconds, JavaScript does not, and the
 * equality half of the cursor would then match nothing.
 */
export interface PageCursor {
  value: string;
  id: string | null;
}

export interface SyncClient {
  /** Upsert on id. Append-only tables ignore duplicates rather than overwrite. */
  upsert(table: SyncedTable, rows: unknown[], appendOnly: boolean): Promise<void>;

  /**
   * One page of this shop's rows strictly after `after`, ordered by
   * (watermark column, id). At most `limit` rows; fewer means the last page.
   */
  fetchSince(
    table: SyncedTable,
    shopId: string,
    column: WatermarkColumn,
    after: PageCursor,
    limit: number,
  ): Promise<Record<string, unknown>[]>;

  /** The server's clock. Never the tablet's. */
  serverNow(): Promise<string>;
}

export function supabaseSyncClient(): SyncClient {
  return {
    async upsert(table, rows, appendOnly) {
      const { error } = await getSupabase()
        .from(table)
        .upsert(rows as never, { onConflict: 'id', ignoreDuplicates: appendOnly });

      if (error) throw new Error(`${table}: ${error.message}`);
    },

    async fetchSince(table, shopId, column, after, limit) {
      const base = getSupabase().from(table).select('*').eq('shop_id', shopId);

      // Values are double-quoted: timestamps contain ':' and '.', which are
      // reserved inside PostgREST's or=(...) syntax.
      const filtered =
        after.id === null
          ? base.gt(column, after.value)
          : base.or(
              `${column}.gt."${after.value}",` +
                `and(${column}.eq."${after.value}",id.gt."${after.id}")`,
            );

      const { data, error } = await filtered
        .order(column, { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);

      // 42703 = undefined_column (Postgres), passed through by PostgREST.
      if (error?.code === '42703') throw new MissingColumnError(table, column);
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as Record<string, unknown>[];
    },

    async serverNow() {
      const { data, error } = await getSupabase().rpc('server_now');
      if (error) throw new Error(`server_now: ${error.message}`);
      return new Date(data as string).toISOString();
    },
  };
}
