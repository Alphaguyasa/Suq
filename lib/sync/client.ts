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
export interface SyncClient {
  /** Upsert on id. Append-only tables ignore duplicates rather than overwrite. */
  upsert(table: SyncedTable, rows: unknown[], appendOnly: boolean): Promise<void>;

  /** Rows for this shop whose watermark column is strictly greater than `since`. */
  fetchSince(
    table: SyncedTable,
    shopId: string,
    column: 'created_at' | 'updated_at',
    since: string,
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

    async fetchSince(table, shopId, column, since) {
      const { data, error } = await getSupabase()
        .from(table)
        .select('*')
        .eq('shop_id', shopId)
        .gt(column, since)
        .order(column, { ascending: true });

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
