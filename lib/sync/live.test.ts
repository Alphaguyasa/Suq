/**
 * The six-step demo rehearsal, run against the REAL Supabase project.
 *
 * Skipped unless SUQ_LIVE=1, because it needs the network and it writes rows
 * to the cloud. Everything else in the suite runs against an in-memory replica.
 *
 *   SUQ_LIVE=1 npx vitest run lib/sync/live
 *
 * What this covers that the fake-server tests cannot: real auth, real RLS,
 * real PostgREST, real latency. What it still cannot cover is the part that is
 * genuinely visual — whether the UI flinches when the network drops, and
 * whether the pill turns ochre. Those need eyes on a tablet.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const LIVE = process.env.SUQ_LIVE === '1';

// The app reads these at module load, so they must be set before the import.
if (LIVE) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const EMAIL = process.env.SUQ_LIVE_EMAIL ?? 'owner@rowda.et';
const PASSWORD = process.env.SUQ_LIVE_PASSWORD ?? '';

describe.skipIf(!LIVE)('six-step demo rehearsal (live)', () => {
  let db: typeof import('@/lib/db').db;
  let salesRepo: typeof import('@/lib/db').salesRepo;
  let stockRepo: typeof import('@/lib/db').stockRepo;
  let client: import('./client').SyncClient;
  let supabase: import('@supabase/supabase-js').SupabaseClient;
  let shopId: string;
  const ringUp: string[] = [];

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    const clientModule = await import('./client');
    const supabaseModule = await import('@/lib/supabase/client');

    db = dbModule.db;
    salesRepo = dbModule.salesRepo;
    stockRepo = dbModule.stockRepo;
    supabase = supabaseModule.getSupabase();

    const { error } = await supabase.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    if (error) throw new Error(`sign in failed: ${error.message}`);

    const { data } = await supabase.from('shop_members').select('shop_id').limit(1).maybeSingle();
    shopId = (data as { shop_id: string }).shop_id;

    await Promise.all(db.tables.map((table) => table.clear()));
    await dbModule.registerDevice({
      shop_id: shopId,
      device_prefix: 'RH',
      cashier_name: 'መሠረት',
    });

    client = clientModule.supabaseSyncClient();
  }, 60_000);

  afterAll(async () => {
    await supabase?.auth.signOut();
  });

  it('step 1-2: rings up sales locally with correct totals', async () => {
    const { productsRepo } = await import('@/lib/db');

    const water = await productsRepo.upsert({
      name: 'Rehearsal Water',
      name_am: 'አምቦ ውሃ 1 ሊትር',
      barcode: `RH-${Date.now()}`,
      unit: 'pcs',
      cost_price: 2600,
      sell_price: 3500,
      reorder_level: 5,
    });
    await stockRepo.openingStock({ productId: water.id, qty: 50 });

    const sale = await salesRepo.create(
      [
        {
          product_id: water.id,
          name_snapshot: water.name_am,
          unit_price: water.sell_price,
          qty: 3,
        },
      ],
      { method: 'cash', cash_received: 20000 },
    );
    ringUp.push(sale.id);

    expect(sale.total).toBe(10500);
    expect(await stockRepo.onHand(water.id)).toBe(47);
  }, 30_000);

  it('step 2b: pushes the first sales to the cloud', async () => {
    const { drainOutbox } = await import('./push');

    const result = await drainOutbox(client, db);

    expect(result.error).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);

    const { data } = await supabase.from('sales').select('id').in('id', ringUp);
    expect(data).toHaveLength(ringUp.length);
  }, 60_000);

  it('step 3-4: keeps selling with the network down, and queues every row', async () => {
    const { productsRepo } = await import('@/lib/db');
    const product = (await productsRepo.list())[0];
    if (!product) throw new Error('no product');

    // The network is gone. Nothing below is allowed to await it.
    const offline: typeof client = {
      upsert: async () => {
        throw new Error('network unreachable');
      },
      fetchSince: async () => {
        throw new Error('network unreachable');
      },
      serverNow: async () => {
        throw new Error('network unreachable');
      },
    };

    const started = Date.now();
    for (let i = 0; i < 3; i += 1) {
      const sale = await salesRepo.create(
        [
          {
            product_id: product.id,
            name_snapshot: product.name_am,
            unit_price: product.sell_price,
            qty: 1,
          },
        ],
        { method: 'cash', cash_received: 5000 },
      );
      ringUp.push(sale.id);
    }
    const elapsed = Date.now() - started;

    // Three sales, entirely local. If this ever awaits the network it will
    // show up here as seconds rather than milliseconds.
    expect(elapsed).toBeLessThan(2000);

    const { drainOutbox } = await import('./push');
    const attempt = await drainOutbox(offline, db);

    expect(attempt.error).toContain('unreachable');
    // 3 sales + 3 items + 3 movements, all still safely queued.
    expect(await db.outbox.count()).toBe(9);

    const { data } = await supabase.from('sales').select('id').in('id', ringUp);
    expect(data, 'offline sales must NOT be in the cloud yet').toHaveLength(1);

    // And nothing belonging to them either. A stock movement in the cloud
    // whose sale is missing would show the owner stock moving with nothing to
    // explain it.
    const offlineSaleIds = ringUp.slice(1);
    const { data: orphanItems } = await supabase
      .from('sale_items')
      .select('id')
      .in('sale_id', offlineSaleIds);
    const { data: orphanMovements } = await supabase
      .from('stock_movements')
      .select('id')
      .in('ref_id', offlineSaleIds);

    expect(orphanItems, 'no orphaned sale_items').toHaveLength(0);
    expect(orphanMovements, 'no orphaned stock_movements').toHaveLength(0);
  }, 60_000);

  it('step 5: drains to zero on reconnect', async () => {
    const { drainOutbox } = await import('./push');

    const started = Date.now();

    // The failed rows are in their first backoff (2s). The real engine hits
    // this on its 15s tick or the 'online' event, so waiting it out is what
    // actually happens rather than a convenience for the test.
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const result = await drainOutbox(client, db);
    const elapsed = Date.now() - started;

    expect(result.error).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
    // The demo script promises "within fifteen seconds".
    expect(elapsed).toBeLessThan(15_000);
  }, 60_000);

  it('step 6: the owner view sees every sale', async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('id,receipt_no,total')
      .in('id', ringUp);

    expect(error).toBeNull();
    expect(data).toHaveLength(4);
  }, 30_000);

  it('pulls the cloud back into a fresh replica, unchanged', async () => {
    const { pullOnce } = await import('./pull');
    const { SuqDatabase, DEVICE_META_ID } = await import('@/lib/db');

    const second = new SuqDatabase(`suq-rehearsal-${Date.now()}`);
    await second.open();
    await second.device_meta.put({
      id: DEVICE_META_ID,
      device_id: '00000000-0000-4000-8000-00000000beef',
      device_prefix: 'B1',
      shop_id: shopId,
      receipt_counter: 0,
      last_pull_at: null,
      cashier_name: 'ሰላም',
    });

    await pullOnce(client, second);

    const pulled = await second.sales.where('id').anyOf(ringUp).toArray();
    expect(pulled).toHaveLength(4);

    second.close();
  }, 60_000);
});
