import type { BrowserContext, Route } from '@playwright/test';

/**
 * An in-memory stand-in for the parts of Supabase the till talks to:
 * PostgREST upserts and filtered selects on the four synced tables, the
 * `server_now` RPC, the `shop_members` lookup, and a pre-seeded auth session.
 *
 * It behaves like the real thing where it matters for the offline tests:
 *   - upsert on id; append-only tables ignore duplicates (Prefer header)
 *   - rows for another shop are rejected, as RLS would
 *   - its clock is the real clock, but it is the SERVER's clock
 *   - when `offline` is set every request fails at the network layer
 *
 * Every request is matched by path (`/rest/v1/`, `/auth/v1/`) rather than by
 * host, so it also catches a build that was made with a real project URL.
 */

type Row = Record<string, unknown>;

export const SYNCED_TABLES = ['products', 'sales', 'sale_items', 'stock_movements'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const E2E_SHOP_ID = '00000000-0000-4000-8000-00000000e2e0';
export const E2E_USER_ID = '00000000-0000-4000-8000-000000000001';

function base64url(value: string): string {
  return Buffer.from(value).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * An unsigned, structurally valid JWT. Built at runtime so no token-shaped
 * literal sits in the repo for the pre-commit secret scanner to trip over.
 */
function fakeAccessToken(expiresAt: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ sub: E2E_USER_ID, role: 'authenticated', aud: 'authenticated', exp: expiresAt }),
  );
  return `${header}.${payload}.e2e-signature`;
}

/** supabase-js v2 stores the session under sb-<first host label>-auth-token. */
function storageKeyFor(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

interface Filter {
  column: string;
  op: string;
  value: string;
}

const NON_FILTER_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function parseFilters(url: URL): Filter[] {
  const filters: Filter[] = [];
  for (const [column, raw] of url.searchParams) {
    if (NON_FILTER_PARAMS.has(column)) continue;
    const dot = raw.indexOf('.');
    filters.push({ column, op: raw.slice(0, dot), value: raw.slice(dot + 1) });
  }
  return filters;
}

function matches(row: Row, filter: Filter): boolean {
  const actual = String(row[filter.column]);
  switch (filter.op) {
    case 'eq':
      return actual === filter.value;
    case 'gt':
      return actual > filter.value;
    case 'gte':
      return actual >= filter.value;
    case 'lt':
      return actual < filter.value;
    case 'lte':
      return actual <= filter.value;
    default:
      throw new Error(`fake-supabase: unsupported filter operator "${filter.op}"`);
  }
}

export class FakeSupabase {
  readonly tables: Record<SyncedTable, Map<string, Row>> = {
    products: new Map(),
    sales: new Map(),
    sale_items: new Map(),
    stock_movements: new Map(),
  };

  /** Every row the client ever sent, duplicates included, per table. */
  readonly received: Record<SyncedTable, Row[]> = {
    products: [],
    sales: [],
    sale_items: [],
    stock_movements: [],
  };

  /** Rows rejected because their shop_id is not this user's shop (RLS). */
  rejected = 0;

  offline = false;

  constructor(readonly supabaseUrl: string) {}

  rows(table: SyncedTable): Row[] {
    return [...this.tables[table].values()];
  }

  async install(context: BrowserContext): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const session = {
      access_token: fakeAccessToken(expiresAt),
      refresh_token: 'e2e-refresh-token',
      token_type: 'bearer',
      expires_in: 24 * 60 * 60,
      expires_at: expiresAt,
      user: {
        id: E2E_USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'owner@suq.test',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };

    // Signed in from the first paint, exactly like a till that signed in once
    // and has kept its session in localStorage ever since.
    await context.addInitScript(
      ([key, value]) => {
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
      },
      [storageKeyFor(this.supabaseUrl), JSON.stringify(session)] as const,
    );

    await context.route('**/rest/v1/**', (route) => this.handleRest(route));
    await context.route('**/auth/v1/**', (route) => this.handleAuth(route, session));
  }

  private async handleAuth(route: Route, session: { user: Row }): Promise<void> {
    if (this.offline) return route.abort('internetdisconnected');

    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/user')) {
      return route.fulfill({ status: 200, json: session.user });
    }
    // Token refresh, sign-out, anything else: the session simply stays valid.
    return route.fulfill({ status: 200, json: session });
  }

  private async handleRest(route: Route): Promise<void> {
    if (this.offline) return route.abort('internetdisconnected');

    const request = route.request();
    const url = new URL(request.url());
    const resource = url.pathname.split('/rest/v1/')[1] ?? '';

    if (resource === 'rpc/server_now') {
      return route.fulfill({ status: 200, json: new Date().toISOString() });
    }

    if (resource === 'shop_members') {
      return route.fulfill({ status: 200, json: [{ shop_id: E2E_SHOP_ID }] });
    }

    if (!(SYNCED_TABLES as readonly string[]).includes(resource)) {
      return route.fulfill({ status: 404, json: { message: `fake-supabase: no table ${resource}` } });
    }

    const table = resource as SyncedTable;

    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Row | Row[];
      const rows = Array.isArray(body) ? body : [body];
      const ignoreDuplicates = (request.headers()['prefer'] ?? '').includes('ignore-duplicates');

      // RLS: the whole statement fails if any row is for another shop.
      if (rows.some((row) => row.shop_id !== E2E_SHOP_ID)) {
        this.rejected += rows.length;
        return route.fulfill({
          status: 403,
          json: { code: '42501', message: `new row violates row-level security policy for table "${table}"` },
        });
      }

      const store = this.tables[table];
      for (const row of rows) {
        this.received[table].push(row);
        const id = row.id as string;
        if (ignoreDuplicates && store.has(id)) continue;
        store.set(id, { ...row });
      }
      return route.fulfill({ status: 201, body: '' });
    }

    if (request.method() === 'GET') {
      const filters = parseFilters(url);
      const order = url.searchParams.get('order');
      let result = this.rows(table).filter((row) => filters.every((filter) => matches(row, filter)));

      if (order) {
        // order=updated_at.asc,id.asc — compare key by key.
        const keys = order.split(',').map((part) => {
          const [column, direction] = part.split('.');
          return { column: column!, sign: direction === 'desc' ? -1 : 1 };
        });
        result = result.sort((a, b) => {
          for (const { column, sign } of keys) {
            const cmp = String(a[column]).localeCompare(String(b[column]));
            if (cmp !== 0) return cmp * sign;
          }
          return 0;
        });
      }

      const limit = url.searchParams.get('limit');
      if (limit) result = result.slice(0, Number(limit));

      return route.fulfill({ status: 200, json: result });
    }

    return route.fulfill({ status: 405, json: { message: `fake-supabase: ${request.method()}` } });
  }
}
