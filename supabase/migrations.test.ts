// @vitest-environment node
/**
 * The SQL migrations, applied in filename order to a real Postgres engine
 * (PGlite: Postgres compiled to WASM, in-process, no server or network).
 *
 * The sync tests run against an in-memory fake; this is what proves the
 * database side behaves the way the fake claims it does. Supabase's own
 * pieces the migrations lean on (auth.users, auth.uid(), the API roles) are
 * stubbed with the same names and shapes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

const DIR = join(__dirname, 'migrations');
const MIGRATIONS = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const RECEIVED_AT = '20261016000000_received_at.sql';
const LAST_WRITE_WINS = '20261020000000_products_last_write_wins.sql';

const SHOP = '00000000-0000-4000-8000-0000000000a1';
const USER = '00000000-0000-4000-8000-0000000000b1';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public
    grant select, insert, update, delete on tables to anon, authenticated, service_role;
`;

let pg: PGlite | null = null;

afterEach(async () => {
  await pg?.close();
  pg = null;
});

async function database(upTo?: string): Promise<PGlite> {
  pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  for (const name of MIGRATIONS) {
    if (upTo && name >= upTo) break;
    await pg.exec(readFileSync(join(DIR, name), 'utf8'));
  }
  await pg.exec(`
    insert into auth.users (id) values ('${USER}');
    insert into public.shops (id, name) values ('${SHOP}', 'Test shop');
    insert into public.shop_members (shop_id, user_id, role) values ('${SHOP}', '${USER}', 'owner');
  `);
  return pg;
}

async function applyReceivedAt(db: PGlite): Promise<void> {
  await db.exec(readFileSync(join(DIR, RECEIVED_AT), 'utf8'));
}

/** Run as the signed-in till, so RLS applies exactly as through PostgREST. */
async function asMember<T>(db: PGlite, sql: string): Promise<T[]> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER}', false);`);
  try {
    const result = await db.query<T>(sql);
    return result.rows;
  } finally {
    await db.exec('reset role;');
  }
}

function saleSql(id: string, createdAt: string, extra = ''): string {
  return `insert into public.sales
    (id, shop_id, device_id, receipt_no, subtotal, discount, total, payment_method, created_at${extra ? ', received_at' : ''})
    values ('${id}', '${SHOP}', '00000000-0000-4000-8000-0000000000d1', 'A1-000001', 3500, 0, 3500, 'cash',
            '${createdAt}'${extra ? `, '${extra}'` : ''})
    on conflict (id) do nothing`;
}

function productSql(id: string, sellPrice: number, updatedAt: string, extra = ''): string {
  return `insert into public.products
    (id, shop_id, name, name_am, unit, cost_price, sell_price, updated_at${extra ? ', received_at' : ''})
    values ('${id}', '${SHOP}', 'Ambo', 'አምቦ', 'pcs', 2600, ${sellPrice}, '${updatedAt}'${extra ? `, '${extra}'` : ''})
    on conflict (id) do update set sell_price = excluded.sell_price, updated_at = excluded.updated_at`;
}

interface Stamped {
  received_at: Date;
  created_at?: Date;
}

// Each test boots its own Postgres (~2s); generous under a parallel full run.
describe('received_at migration', { timeout: 30_000 }, () => {
  it('applies cleanly after every earlier migration', async () => {
    const db = await database();
    const columns = await db.query<{ table_name: string }>(`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'received_at' and is_nullable = 'NO'
      order by table_name`);
    expect(columns.rows.map((row) => row.table_name)).toEqual([
      'products',
      'sale_items',
      'sales',
      'stock_movements',
    ]);
  });

  it('stamps the server arrival time, whatever the device sent', async () => {
    const db = await database();
    const before = Date.now();

    // An offline sale from 09:50 yesterday, with a forged received_at.
    const saleId = '00000000-0000-4000-8000-00000000c001';
    await asMember(db, saleSql(saleId, '2026-07-31T09:50:00Z', '2000-01-01T00:00:00Z'));

    const [row] = await asMember<Stamped>(
      db,
      `select received_at, created_at from public.sales where id = '${saleId}'`,
    );
    expect(row!.created_at!.toISOString(), 'device time kept').toBe('2026-07-31T09:50:00.000Z');
    expect(row!.received_at.getTime(), 'forged value ignored').toBeGreaterThanOrEqual(before - 1000);
  });

  it('leaves an append-only row alone on a duplicate push', async () => {
    const db = await database();
    const saleId = '00000000-0000-4000-8000-00000000c002';
    await asMember(db, saleSql(saleId, '2026-07-31T09:50:00Z'));
    const [first] = await asMember<Stamped>(db, `select received_at from public.sales where id = '${saleId}'`);

    // The retried push whose first response was lost.
    await asMember(db, saleSql(saleId, '2026-07-31T09:50:00Z'));
    const rows = await asMember<Stamped>(db, `select received_at from public.sales where id = '${saleId}'`);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.received_at.getTime()).toBe(first!.received_at.getTime());
  });

  it('moves a product edit past the watermark even from a slow clock', async () => {
    const db = await database();
    const productId = '00000000-0000-4000-8000-00000000e001';
    await asMember(db, productSql(productId, 3500, '2026-07-31T07:00:00Z'));
    const [first] = await asMember<Stamped>(db, `select received_at from public.products where id = '${productId}'`);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const [{ now: watermark }] = (await asMember<{ now: Date }>(db, 'select public.server_now() as now')) as [
      { now: Date },
    ];
    expect(watermark.getTime()).toBeGreaterThanOrEqual(first!.received_at.getTime());

    // The edit carries an updated_at hours older than the watermark.
    await asMember(db, productSql(productId, 4000, '2026-07-31T08:00:00Z', '2000-01-01T00:00:00Z'));
    const after = await asMember<Stamped & { sell_price: string }>(
      db,
      `select received_at, sell_price from public.products where received_at > '${watermark.toISOString()}'`,
    );

    expect(after, 'a pull after the watermark sees it').toHaveLength(1);
    expect(Number(after[0]!.sell_price)).toBe(4000);
  });

  it('keeps every existing row, and gives each one a received_at', async () => {
    const db = await database(RECEIVED_AT);

    const saleId = '00000000-0000-4000-8000-00000000c003';
    await asMember(db, saleSql(saleId, '2026-07-31T09:50:00Z'));
    await asMember(db, productSql('00000000-0000-4000-8000-00000000e002', 3500, '2026-07-31T07:00:00Z'));
    await db.exec(`
      insert into public.sale_items (id, shop_id, sale_id, product_id, name_snapshot, unit_price, qty, line_total, created_at)
      values ('00000000-0000-4000-8000-00000000f001', '${SHOP}', '${saleId}', '00000000-0000-4000-8000-00000000e002',
              'አምቦ', 3500, 1, 3500, '2026-07-31T09:50:00Z');
      insert into public.stock_movements (id, shop_id, product_id, qty_delta, reason, ref_id, created_at, device_id)
      values ('00000000-0000-4000-8000-00000000f002', '${SHOP}', '00000000-0000-4000-8000-00000000e002', -1, 'sale',
              '${saleId}', '2026-07-31T09:50:00Z', '00000000-0000-4000-8000-0000000000d1');
    `);

    const migratedAt = Date.now();
    await applyReceivedAt(db);

    for (const table of ['products', 'sales', 'sale_items', 'stock_movements']) {
      const rows = await db.query<Stamped>(`select received_at from public.${table}`);
      expect(rows.rows, `${table} kept its row`).toHaveLength(1);
      expect(
        rows.rows[0]!.received_at.getTime(),
        `${table} reads as received when migrated`,
      ).toBeGreaterThanOrEqual(migratedAt - 1000);
    }

    const [sale] = (await db.query<{ total: string; created_at: Date }>(
      `select total, created_at from public.sales where id = '${saleId}'`,
    )).rows;
    expect(Number(sale!.total)).toBe(3500);
    expect(sale!.created_at.toISOString()).toBe('2026-07-31T09:50:00.000Z');
  });

  it('still refuses another shop’s rows (RLS unchanged)', async () => {
    const db = await database();
    const other = '00000000-0000-4000-8000-0000000000a2';
    await db.exec(`insert into public.shops (id) values ('${other}')`);

    await expect(
      asMember(db, saleSql('00000000-0000-4000-8000-00000000c004', '2026-07-31T09:50:00Z').replace(SHOP, other)),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('products last-write-wins migration', { timeout: 30_000 }, () => {
  const productId = '00000000-0000-4000-8000-00000000f001';

  async function product(db: PGlite) {
    const [row] = await asMember<Stamped & { sell_price: string; updated_at: Date }>(
      db,
      `select sell_price, updated_at, received_at from public.products where id = '${productId}'`,
    );
    return row!;
  }

  it('keeps the newer edit when an older one arrives late', async () => {
    const db = await database();
    await asMember(db, productSql(productId, 3500, '2026-07-31T07:00:00Z'));
    await asMember(db, productSql(productId, 4500, '2026-07-31T09:00:00Z'));
    const before = await product(db);

    // Edited offline at 08:00, pushed after the 09:00 edit.
    await asMember(db, productSql(productId, 4000, '2026-07-31T08:00:00Z'));
    const after = await product(db);

    expect(Number(after.sell_price)).toBe(4500);
    expect(after.updated_at.toISOString()).toBe('2026-07-31T09:00:00.000Z');
    expect(after.received_at.getTime(), 'not re-stamped, so no till re-pulls it').toBe(
      before.received_at.getTime(),
    );
  });

  it('applies a newer edit, and ignores a retry of the same one', async () => {
    const db = await database();
    await asMember(db, productSql(productId, 3500, '2026-07-31T07:00:00Z'));
    await asMember(db, productSql(productId, 4000, '2026-07-31T08:00:00Z'));
    expect(Number((await product(db)).sell_price)).toBe(4000);

    // Same updated_at, different body: a tie keeps what is there (apply.ts agrees).
    await asMember(db, productSql(productId, 9999, '2026-07-31T08:00:00Z'));
    expect(Number((await product(db)).sell_price)).toBe(4000);
  });

  it('keeps every existing product when applied', async () => {
    const db = await database(LAST_WRITE_WINS);
    await asMember(db, productSql(productId, 3500, '2026-07-31T07:00:00Z'));
    await db.exec(readFileSync(join(DIR, LAST_WRITE_WINS), 'utf8'));

    expect(Number((await product(db)).sell_price)).toBe(3500);
  });
});
