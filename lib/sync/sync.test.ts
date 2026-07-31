import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_META_ID, localWrite } from '@/lib/db';
import { FakeServer } from './fake-server';
import { PUSH_BATCH_SIZE, drainOutbox, pushOnce } from './push';
import { pullOnce } from './pull';
import type { Replica } from './sync-test-helpers';
import { SHOP, makeProduct, makeReplica, onHandIn, sellOn } from './sync-test-helpers';

const replicas: Replica[] = [];

async function replica(name: string, prefix: string): Promise<Replica> {
  const created = await makeReplica(name, prefix);
  replicas.push(created);
  return created;
}

afterEach(async () => {
  while (replicas.length > 0) {
    const current = replicas.pop();
    current?.db.close();
  }
});

/* ------------------------------------------------------------------ 1 ---- */

describe('1. two-device concurrent sale', () => {
  /**
   * The test that validates the entire data model. Two tills, both offline,
   * both sell the last unit of the same product. Whatever order they sync in,
   * the movements must SUM to -2 and both sales must survive.
   *
   * If this ever fails, the fix is in the data model, not in the sync code.
   */
  async function bothSellTheLastUnit(order: 'a-first' | 'b-first') {
    const server = new FakeServer();
    const client = server.client();

    const product = makeProduct();
    server.seed('products', [product as unknown as Record<string, unknown>]);
    server.seed('stock_movements', [
      {
        id: 'opening-1',
        shop_id: SHOP,
        product_id: product.id,
        qty_delta: 1,
        reason: 'opening',
        ref_id: null,
        note: null,
        created_at: '2026-07-31T08:00:00.000Z',
        device_id: 'setup',
      },
    ]);

    const a = await replica(`suq-a-${order}`, 'A1');
    const b = await replica(`suq-b-${order}`, 'B1');

    // Both offline, both sell the last one.
    const saleA = await sellOn(a, { productId: product.id, qty: 1 });
    const saleB = await sellOn(b, { productId: product.id, qty: 1 });

    if (order === 'a-first') {
      await drainOutbox(client, a.db);
      await drainOutbox(client, b.db);
    } else {
      await drainOutbox(client, b.db);
      await drainOutbox(client, a.db);
    }

    // Nothing was overwritten: 1 opening + 2 sales = -1 on hand.
    expect(server.onHand(product.id), `server sum (${order})`).toBe(-1);
    expect(
      server.rows('stock_movements').filter((row) => row.reason === 'sale'),
      `sale movements (${order})`,
    ).toHaveLength(2);
    expect(server.count('sales'), `sales on server (${order})`).toBe(2);

    // And both replicas converge on the same history.
    await pullOnce(client, a.db);
    await pullOnce(client, b.db);

    for (const [name, current] of [
      ['A', a],
      ['B', b],
    ] as const) {
      expect(await current.db.sales.count(), `${name} sees both sales (${order})`).toBe(2);
      expect(await current.db.sales.get(saleA.sale.id), `${name} has A's sale`).toBeDefined();
      expect(await current.db.sales.get(saleB.sale.id), `${name} has B's sale`).toBeDefined();
      expect(await onHandIn(current.db, product.id), `${name} on hand (${order})`).toBe(-1);
    }

    return server;
  }

  it('sums both sales when A syncs first', async () => {
    await bothSellTheLastUnit('a-first');
  });

  it('sums both sales when B syncs first', async () => {
    await bothSellTheLastUnit('b-first');
  });

  it('would have lost a sale if stock were an absolute quantity', async () => {
    // The counterfactual, stated as a test so the reason stays visible.
    const server = await bothSellTheLastUnit('a-first');
    const deltas = server
      .rows('stock_movements')
      .map((row) => Number(row.qty_delta))
      .sort();

    expect(deltas).toEqual([-1, -1, 1]);
  });
});

/* ------------------------------------------------------------------ 2 ---- */

describe('what the pill counts', () => {
  it('counts sales, not outbox rows', async () => {
    // "Three sales saved" is the promise. A three-line sale queues seven rows,
    // so counting the outbox made the pill read 21 and the demo line fell flat.
    const a = await replica('suq-pill-count', 'A1');
    const water = makeProduct();
    const soap = makeProduct({ name: 'Abay Soap', barcode: '600999' });
    await localWrite('products', water, a.db);
    await localWrite('products', soap, a.db);

    for (let i = 0; i < 3; i += 1) {
      await sellOn(a, { productId: water.id, qty: 1 });
    }

    const rows = await a.db.outbox.count();
    const sales = await a.db.outbox.where('table').equals('sales').count();

    expect(sales, 'what the pill shows').toBe(3);
    expect(rows, 'what is actually queued').toBeGreaterThan(sales);
  });
});

describe('2. interrupted push', () => {
  it('drains to empty with zero duplicates after the network drops mid-drain', async () => {
    const server = new FakeServer();
    const client = server.client();

    const a = await replica('suq-interrupt', 'A1');
    const product = makeProduct();
    await localWrite('products', product, a.db);

    for (let i = 0; i < 5; i += 1) {
      await sellOn(a, { productId: product.id, qty: 1 });
    }

    // First upsert call fails: connection reset part-way through.
    server.failUpsertsRemaining = 1;
    const interrupted = await drainOutbox(client, a.db);
    expect(interrupted.error).toBeTruthy();
    expect(await a.db.outbox.count()).toBeGreaterThan(0);

    // The failed row is now in backoff, so an immediate retry deliberately
    // leaves it alone rather than hammering a server that just dropped us.
    const tooSoon = await drainOutbox(client, a.db);
    expect(tooSoon.remaining, 'still queued during backoff').toBe(true);

    // Wait out the 2s first-attempt backoff and finish.
    const later = Date.now() + 3000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    const resumed = await drainOutbox(client, a.db);
    vi.restoreAllMocks();

    expect(resumed.error).toBeUndefined();

    expect(await a.db.outbox.count()).toBe(0);
    expect(server.count('sales')).toBe(5);
    expect(server.count('sale_items')).toBe(5);
    expect(server.count('stock_movements')).toBe(5);
    expect(server.count('products')).toBe(1);
  });

  it('never lands a child row in the cloud without its parent sale', async () => {
    // Regression, found rehearsing step 5 against the real project.
    //
    // A failure used to back off only the table that failed, so the very next
    // drain skipped it (still in backoff) and pushed the tables AFTER it —
    // sale_items and stock_movements arriving without their sale. There are no
    // foreign keys to catch that, so the owner dashboard would have shown
    // stock moving with no sale to explain it.
    const server = new FakeServer();
    const client = server.client();

    const a = await replica('suq-orphan', 'A1');
    const product = makeProduct();
    await localWrite('products', product, a.db);
    await drainOutbox(client, a.db);

    await sellOn(a, { productId: product.id, qty: 2 });

    // Fail on the sales upsert specifically.
    server.failUpsertsRemaining = 1;
    await drainOutbox(client, a.db);

    expect(server.count('sales'), 'the sale did not land').toBe(0);
    expect(server.count('sale_items'), 'so its items must not either').toBe(0);
    expect(server.count('stock_movements'), 'nor its movements').toBe(0);
    expect(await a.db.outbox.count(), 'all three still queued').toBe(3);

    // Once the backoff expires the whole batch goes together, in order.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3000);
    await drainOutbox(client, a.db);
    vi.restoreAllMocks();

    expect(server.count('sales')).toBe(1);
    expect(server.count('sale_items')).toBe(1);
    expect(server.count('stock_movements')).toBe(1);
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('records the failure on the row rather than losing it', async () => {
    const server = new FakeServer();
    const client = server.client();

    const a = await replica('suq-failure-record', 'A1');
    await localWrite('products', makeProduct(), a.db);

    server.offline = true;
    await pushOnce(client, a.db);

    const queued = await a.db.outbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.attempts).toBe(1);
    expect(queued[0]?.last_error).toContain('unreachable');
    expect(queued[0]?.last_tried_at).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ 3 ---- */

describe('3. clock skew', () => {
  it('skips no rows when the tablet clock runs ahead of the server', async () => {
    const server = new FakeServer();
    const client = server.client();

    // The server's clock sits in the past relative to the test machine's
    // Date.now(). A watermark taken from Date.now() would jump straight past
    // everything the server is about to write.
    const a = await replica('suq-skew', 'A1');
    const product = makeProduct();
    server.seed('products', [product as unknown as Record<string, unknown>]);

    await pullOnce(client, a.db);

    const meta = await a.db.device_meta.get(DEVICE_META_ID);
    expect(meta?.last_pull_at, 'watermark is server time, not device time').toBe(
      server.serverIso(),
    );
    expect(Date.parse(meta?.last_pull_at ?? ''), 'and it is behind the device clock').toBeLessThan(
      Date.now(),
    );

    // A sale lands on the server five seconds later, by the server's clock.
    server.tick(5000);
    server.seed('sales', [
      {
        id: 'later-sale',
        shop_id: SHOP,
        device_id: 'other',
        receipt_no: 'B1-000001',
        subtotal: 3500,
        discount: 0,
        total: 3500,
        payment_method: 'cash',
        cashier_name: 'x',
        voided_by: null,
        voids_sale_id: null,
        cash_received: null,
        created_at: server.serverIso(),
      },
    ]);

    const result = await pullOnce(client, a.db);

    expect(result.inserted, 'the later row is not skipped').toBe(1);
    expect(await a.db.sales.get('later-sale')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ 4 ---- */

describe('4. cold start with a full outbox', () => {
  it('drains 200 queued sales in batches without one giant request', async () => {
    const server = new FakeServer();
    const client = server.client();

    const a = await replica('suq-cold-start', 'A1');
    const product = makeProduct();
    await localWrite('products', product, a.db);

    for (let i = 0; i < 200; i += 1) {
      await sellOn(a, { productId: product.id, qty: 1 });
    }

    // 200 sales + 200 items + 200 movements + 1 product
    expect(await a.db.outbox.count()).toBe(601);

    const result = await drainOutbox(client, a.db);

    expect(result.error).toBeUndefined();
    expect(await a.db.outbox.count()).toBe(0);
    expect(server.count('sales')).toBe(200);
    expect(server.count('sale_items')).toBe(200);
    expect(server.count('stock_movements')).toBe(200);

    // Nothing was sent as one blocking payload.
    expect(Math.max(...server.upsertBatchSizes)).toBeLessThanOrEqual(PUSH_BATCH_SIZE);
    expect(server.upsertBatchSizes.length).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ 5 ---- */

describe('5. voiding an already-synced sale', () => {
  it('propagates compensating movements and leaves on-hand correct on both sides', async () => {
    const server = new FakeServer();
    const client = server.client();

    const a = await replica('suq-void-a', 'A1');
    const b = await replica('suq-void-b', 'B1');

    const product = makeProduct();
    await localWrite('products', product, a.db);
    await localWrite(
      'stock_movements',
      {
        id: 'opening-void',
        shop_id: SHOP,
        product_id: product.id,
        qty_delta: 40,
        reason: 'opening',
        ref_id: null,
        note: null,
        created_at: '2026-07-31T08:00:00.000Z',
        device_id: a.deviceId,
      },
      a.db,
    );

    const { sale } = await sellOn(a, { productId: product.id, qty: 6 });
    await drainOutbox(client, a.db);

    expect(server.onHand(product.id)).toBe(34);

    // B pulls the sale, then A voids it and pushes the correction.
    await pullOnce(client, b.db);
    expect(await onHandIn(b.db, product.id)).toBe(34);

    const voidId = 'void-sale-1';
    const voidedAt = new Date(Date.now() + 1000).toISOString();

    await localWrite(
      'sales',
      {
        id: voidId,
        shop_id: SHOP,
        device_id: a.deviceId,
        receipt_no: 'A1-000002',
        subtotal: -sale.subtotal,
        discount: 0,
        total: -sale.total,
        payment_method: 'cash',
        cashier_name: 'መሠረት',
        voided_by: null,
        voids_sale_id: sale.id,
        cash_received: null,
        created_at: voidedAt,
        synced_at: null,
      },
      a.db,
    );

    await localWrite(
      'stock_movements',
      {
        id: 'void-movement-1',
        shop_id: SHOP,
        product_id: product.id,
        qty_delta: 6,
        reason: 'return',
        ref_id: voidId,
        note: 'wrong item',
        created_at: voidedAt,
        device_id: a.deviceId,
      },
      a.db,
    );

    await drainOutbox(client, a.db);
    await pullOnce(client, b.db);

    // Nothing was deleted anywhere, and both sides agree.
    expect(server.count('sales'), 'original and void both on server').toBe(2);
    expect(server.onHand(product.id), 'server on hand restored').toBe(40);
    expect(await onHandIn(a.db, product.id), 'A on hand restored').toBe(40);
    expect(await onHandIn(b.db, product.id), 'B on hand restored').toBe(40);
    expect(await b.db.sales.get(sale.id), 'B still holds the original').toBeDefined();
    expect(await b.db.sales.get(voidId), 'B received the void row').toBeDefined();
  });
});
