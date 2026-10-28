import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingColumnError, supabaseSyncClient } from './client';

/*
 * A recording stand-in for the supabase-js query builder: every chained call
 * is logged, and awaiting the chain returns whatever the test set as the
 * PostgREST response. Enough to check how the till talks to PostgREST and how
 * it reads PostgREST's errors, without a server.
 */
type Response = { data: unknown; error: { code?: string; message: string } | null };

const net = vi.hoisted(() => ({
  calls: [] as [string, ...unknown[]][],
  response: { data: [], error: null } as Response,
}));

vi.mock('@/lib/supabase/client', () => {
  const builder = (): unknown => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gt', 'or', 'order', 'limit', 'upsert']) {
      chain[method] = (...args: unknown[]) => {
        net.calls.push([method, ...args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: Response) => unknown) => resolve(net.response);
    return chain;
  };
  return {
    getSupabase: () => ({
      from: (table: string) => {
        net.calls.push(['from', table]);
        return builder();
      },
      rpc: async (name: string) => {
        net.calls.push(['rpc', name]);
        return net.response;
      },
    }),
  };
});

beforeEach(() => {
  net.calls = [];
  net.response = { data: [], error: null };
});

describe('supabaseSyncClient().fetchSince', () => {
  const client = supabaseSyncClient();

  it('maps PostgREST 42703 (undefined column) to MissingColumnError', async () => {
    net.response = {
      data: null,
      error: { code: '42703', message: 'column sales.received_at does not exist' },
    };

    const failure = await client
      .fetchSince('sales', 'shop-1', 'received_at', { value: '1970-01-01T00:00:00.000Z', id: null }, 500)
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(MissingColumnError);
    expect(failure).toMatchObject({ table: 'sales', column: 'received_at' });
  });

  it('any other error is a plain error naming the table, not a missing column', async () => {
    net.response = { data: null, error: { code: '42501', message: 'permission denied' } };

    const failure = await client
      .fetchSince('products', 'shop-1', 'received_at', { value: 'x', id: null }, 500)
      .catch((cause: unknown) => cause);

    expect(failure).not.toBeInstanceOf(MissingColumnError);
    expect((failure as Error).message).toBe('products: permission denied');
  });

  it('an error without a code is a plain error too', async () => {
    net.response = { data: null, error: { message: 'Failed to fetch' } };

    await expect(
      client.fetchSince('sales', 'shop-1', 'created_at', { value: 'x', id: null }, 500),
    ).rejects.not.toBeInstanceOf(MissingColumnError);
  });

  it('first page: rows of this shop strictly after the watermark, in key order', async () => {
    net.response = { data: [{ id: 'a' }], error: null };

    const rows = await client.fetchSince(
      'sales',
      'shop-1',
      'received_at',
      { value: '2026-10-28T08:00:00.123456+00:00', id: null },
      500,
    );

    expect(rows).toEqual([{ id: 'a' }]);
    expect(net.calls).toEqual([
      ['from', 'sales'],
      ['select', '*'],
      ['eq', 'shop_id', 'shop-1'],
      ['gt', 'received_at', '2026-10-28T08:00:00.123456+00:00'],
      ['order', 'received_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['limit', 500],
    ]);
  });

  it('later pages: keyset on (watermark, id) with the values quoted, passed back verbatim', async () => {
    await client.fetchSince(
      'stock_movements',
      'shop-1',
      'received_at',
      { value: '2026-10-28T08:00:00.123456+00:00', id: 'm-9' },
      500,
    );

    expect(net.calls).toContainEqual([
      'or',
      'received_at.gt."2026-10-28T08:00:00.123456+00:00",' +
        'and(received_at.eq."2026-10-28T08:00:00.123456+00:00",id.gt."m-9")',
    ]);
    expect(net.calls.some(([method]) => method === 'gt')).toBe(false);
  });

  it('no data is an empty page', async () => {
    net.response = { data: null, error: null };
    await expect(
      client.fetchSince('sales', 'shop-1', 'created_at', { value: 'x', id: null }, 500),
    ).resolves.toEqual([]);
  });
});

describe('supabaseSyncClient().upsert', () => {
  const client = supabaseSyncClient();

  it('append-only tables ignore duplicates; products overwrite', async () => {
    await client.upsert('sales', [{ id: 's' }], true);
    await client.upsert('products', [{ id: 'p' }], false);

    expect(net.calls).toContainEqual([
      'upsert',
      [{ id: 's' }],
      { onConflict: 'id', ignoreDuplicates: true },
    ]);
    expect(net.calls).toContainEqual([
      'upsert',
      [{ id: 'p' }],
      { onConflict: 'id', ignoreDuplicates: false },
    ]);
  });

  it('an error names the table', async () => {
    net.response = { data: null, error: { message: 'new row violates row-level security' } };
    await expect(client.upsert('sale_items', [], true)).rejects.toThrow(
      'sale_items: new row violates row-level security',
    );
  });
});

describe('supabaseSyncClient().serverNow', () => {
  const client = supabaseSyncClient();

  it("returns the server's clock as an ISO instant", async () => {
    net.response = { data: '2026-10-28T08:00:00.5+03:00', error: null };

    await expect(client.serverNow()).resolves.toBe('2026-10-28T05:00:00.500Z');
    expect(net.calls).toEqual([['rpc', 'server_now']]);
  });

  it('an error is reported as server_now', async () => {
    net.response = { data: null, error: { message: 'function not found' } };
    await expect(client.serverNow()).rejects.toThrow('server_now: function not found');
  });
});
