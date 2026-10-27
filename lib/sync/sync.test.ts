import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_META_ID, clearAllTables, db, localWrite, registerDevice, salesRepo } from '@/lib/db';
import { resetEngineState, setAuthed, syncNow } from './engine';
import { FakeServer } from './fake-server';
import { PUSH_BATCH_SIZE, drainOutbox, pushOnce } from './push';
import { PULL_OVERLAP_MS, PULL_PAGE_SIZE, pullOnce } from './pull';
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
  // 600 IndexedDB writes: comfortably fast alone, but the 5s default is too
  // tight when the whole suite runs in parallel on a slow CI runner.
  it('drains 200 queued sales in batches without one giant request', { timeout: 30_000 }, async () => {
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

/* ------------------------------------------------------------------ 6 ---- */

describe('6. pulling a history longer than the server row cap', () => {
  function serverSale(index: number, createdAt: string): Record<string, unknown> {
    return {
      id: `sale-${String(index).padStart(5, '0')}`,
      shop_id: SHOP,
      device_id: 'other-till',
      receipt_no: `B1-${String(index).padStart(6, '0')}`,
      subtotal: 3500,
      discount: 0,
      total: 3500,
      payment_method: 'cash',
      cashier_name: 'x',
      voided_by: null,
      voids_sale_id: null,
      cash_received: null,
      created_at: createdAt,
    };
  }

  it('pages past the cap so a joining till gets every row', { timeout: 30_000 }, async () => {
    const server = new FakeServer();
    server.maxRows = 1000;

    // A month of another till's sales, more than one capped response holds.
    const total = 2345;
    const start = Date.parse('2026-07-01T08:00:00.000Z');
    server.seed(
      'sales',
      Array.from({ length: total }, (_, i) =>
        serverSale(i, new Date(start + i * 60_000).toISOString()),
      ),
    );

    const a = await replica('suq-page-cap', 'A1');
    const result = await pullOnce(server.client(), a.db);

    expect(result.inserted).toBe(total);
    expect(await a.db.sales.count(), 'nothing truncated at the cap').toBe(total);
    expect(Math.max(...server.fetchSizes), 'no request asks past the page size').toBeLessThanOrEqual(
      PULL_PAGE_SIZE,
    );
  });

  it('loses nothing when a page boundary falls inside rows sharing one timestamp', async () => {
    const server = new FakeServer();
    const sameInstant = '2026-07-15T10:00:00.000Z';

    // A bulk import stamps every row alike; the id is the only tiebreak.
    const total = PULL_PAGE_SIZE + 37;
    server.seed(
      'sales',
      Array.from({ length: total }, (_, i) => serverSale(i, sameInstant)),
    );

    const a = await replica('suq-page-ties', 'A1');
    await pullOnce(server.client(), a.db);

    expect(await a.db.sales.count()).toBe(total);
  });

  it('keeps the old watermark when the network drops between pages', async () => {
    const server = new FakeServer();
    const start = Date.parse('2026-07-01T08:00:00.000Z');
    server.seed(
      'sales',
      Array.from({ length: PULL_PAGE_SIZE * 2 }, (_, i) =>
        serverSale(i, new Date(start + i * 1000).toISOString()),
      ),
    );

    const a = await replica('suq-page-drop', 'A1');

    // The four first pages (one per table) succeed, then the wifi goes.
    server.fetchesBeforeOffline = 4;
    await expect(pullOnce(server.client(), a.db)).rejects.toThrow('unreachable');

    const meta = await a.db.device_meta.get(DEVICE_META_ID);
    expect(meta?.last_pull_at, 'a half-read window is re-read next time').toBeNull();

    server.offline = false;
    server.fetchesBeforeOffline = null;
    await pullOnce(server.client(), a.db);

    expect(await a.db.sales.count()).toBe(PULL_PAGE_SIZE * 2);
  });

  it('fails the pull instead of looping when the server ignores the cursor', async () => {
    const server = new FakeServer();
    const stuck = Array.from({ length: PULL_PAGE_SIZE }, (_, i) =>
      serverSale(i, '2026-07-15T10:00:00.000Z'),
    );
    const client = {
      ...server.client(),
      fetchSince: async () => stuck,
    };

    const a = await replica('suq-page-stuck', 'A1');
    const pulled = pullOnce(client, a.db);

    await expect(pulled).rejects.toThrow('did not advance');
  });
});

/* ------------------------------------------------------------------ 7 ---- */

describe('7. rows that reach the server late', () => {
  /**
   * Till A is offline from 09:45 and sells at 09:50 (its created_at). Till B
   * pulls at 10:00, so its watermark is 10:00 by the server's clock. A comes
   * back and pushes at 10:05 — a row created at 09:50 arriving at 10:05.
   * Filtering on created_at, B asks for "after 10:00" and never sees it.
   */
  async function lateOfflineSale(server: FakeServer) {
    const client = server.client();
    const product = makeProduct({ updated_at: '2026-07-31T08:00:00.000Z' });
    server.setClock('2026-07-31T08:00:00.000Z');
    server.seed('products', [product as unknown as Record<string, unknown>]);
    server.seed('stock_movements', [
      {
        id: 'opening-late',
        shop_id: SHOP,
        product_id: product.id,
        qty_delta: 10,
        reason: 'opening',
        ref_id: null,
        note: null,
        created_at: '2026-07-31T08:00:00.000Z',
        device_id: 'setup',
      },
    ]);

    const a = await replica(`suq-late-a-${server.hasReceivedAt}`, 'A1');
    const b = await replica(`suq-late-b-${server.hasReceivedAt}`, 'B1');

    const late = await sellOn(a, {
      productId: product.id,
      qty: 2,
      createdAt: '2026-07-31T09:50:00.000Z',
    });

    server.setClock('2026-07-31T10:00:00.000Z');
    await pullOnce(client, b.db);

    server.setClock('2026-07-31T10:05:00.000Z');
    await drainOutbox(client, a.db);

    server.setClock('2026-07-31T10:06:00.000Z');
    await pullOnce(client, b.db);

    return { client, product, a, b, late };
  }

  it('delivers an offline sale pushed after the other till pulled', async () => {
    const server = new FakeServer();
    const { product, b, late } = await lateOfflineSale(server);

    expect(await b.db.sales.get(late.sale.id), 'B has the late sale').toBeDefined();
    expect(await b.db.sale_items.get(late.item.id), 'and its line').toBeDefined();
    expect(await b.db.stock_movements.get(late.movement.id), 'and its movement').toBeDefined();
    expect(await onHandIn(b.db, product.id), 'B on hand').toBe(8);
    expect(server.onHand(product.id), 'server on hand').toBe(8);
  });

  it('lost that sale on the legacy watermark, and recovers it once migrated', async () => {
    // The bug, kept visible: a project without the migration still syncs
    // (legacy fallback) but drops the late row.
    const server = new FakeServer();
    server.hasReceivedAt = false;
    const { client, product, b, late } = await lateOfflineSale(server);

    expect(await b.db.sales.get(late.sale.id), 'legacy filter skipped it').toBeUndefined();
    expect(await onHandIn(b.db, product.id)).toBe(10);
    expect((await b.db.device_meta.get(DEVICE_META_ID))?.pull_column).toBeUndefined();

    // The migration is applied; B's first received_at pull starts over.
    server.setClock('2026-07-31T11:00:00.000Z');
    server.applyReceivedAtMigration();
    server.tick(60_000);
    await pullOnce(client, b.db);

    expect(await b.db.sales.get(late.sale.id), 'recovered').toBeDefined();
    expect(await onHandIn(b.db, product.id)).toBe(8);
    expect(await b.db.sales.count(), 'nothing duplicated').toBe(1);
    expect(await b.db.stock_movements.count(), 'nothing duplicated').toBe(2);
    expect((await b.db.device_meta.get(DEVICE_META_ID))?.pull_column).toBe('received_at');
  });

  it('delivers a product edit from a till whose clock runs slow', async () => {
    const server = new FakeServer();
    const client = server.client();
    server.setClock('2026-07-31T10:00:00.000Z');

    const product = makeProduct({ updated_at: '2026-07-31T07:00:00.000Z', sell_price: 3500 });
    server.seed('products', [product as unknown as Record<string, unknown>]);

    const a = await replica('suq-late-edit-a', 'A1');
    const b = await replica('suq-late-edit-b', 'B1');
    await pullOnce(client, a.db);
    await pullOnce(client, b.db);

    // A's clock says 08:00 — hours behind the server — when it edits.
    await localWrite(
      'products',
      { ...product, sell_price: 4000, updated_at: '2026-07-31T08:00:00.000Z' },
      a.db,
    );
    server.tick(60_000);
    await drainOutbox(client, a.db);
    server.tick(60_000);
    await pullOnce(client, b.db);

    expect((await b.db.products.get(product.id))?.sell_price).toBe(4000);
  });

  it('keeps the newer product edit when an older offline edit is pushed late', async () => {
    const server = new FakeServer();
    const client = server.client();
    server.setClock('2026-07-31T10:00:00.000Z');

    const product = makeProduct({ updated_at: '2026-07-31T07:00:00.000Z', sell_price: 3500 });
    server.seed('products', [product as unknown as Record<string, unknown>]);

    const a = await replica('suq-lww-a', 'A1');
    const b = await replica('suq-lww-b', 'B1');
    await pullOnce(client, a.db);
    await pullOnce(client, b.db);

    // A edits at 08:00 while offline; B edits at 09:00 and pushes first.
    await localWrite('products', { ...product, sell_price: 4000, updated_at: '2026-07-31T08:00:00.000Z' }, a.db);
    await localWrite('products', { ...product, sell_price: 4500, updated_at: '2026-07-31T09:00:00.000Z' }, b.db);
    server.tick(60_000);
    await drainOutbox(client, b.db);
    server.tick(60_000);
    await drainOutbox(client, a.db);

    expect(server.tables.products.get(product.id)?.sell_price, 'late, older edit refused').toBe(4500);
    expect(await a.db.outbox.count(), 'refused edit is not retried forever').toBe(0);

    server.tick(60_000);
    await pullOnce(client, a.db);
    await pullOnce(client, b.db);
    expect((await a.db.products.get(product.id))?.sell_price, 'A converges').toBe(4500);
    expect((await b.db.products.get(product.id))?.sell_price).toBe(4500);
  });

  it('re-reads a window behind the watermark for rows that committed late', async () => {
    const server = new FakeServer();
    const client = server.client();
    server.setClock('2026-07-31T10:00:00.000Z');

    const b = await replica('suq-late-commit', 'B1');
    await pullOnce(client, b.db);

    // Stamped 30s before B's watermark but invisible until its transaction
    // committed — after B had already read server_now().
    server.tables.sales.set('slow-commit', {
      id: 'slow-commit',
      shop_id: SHOP,
      device_id: 'other-till',
      receipt_no: 'C1-000001',
      subtotal: 3500,
      discount: 0,
      total: 3500,
      payment_method: 'cash',
      cashier_name: 'x',
      voided_by: null,
      voids_sale_id: null,
      cash_received: null,
      created_at: '2026-07-31T09:59:30.000Z',
      received_at: new Date(Date.parse('2026-07-31T10:00:00.000Z') - 30_000).toISOString(),
    });
    expect(30_000).toBeLessThan(PULL_OVERLAP_MS);

    server.tick(60_000);
    await pullOnce(client, b.db);
    expect(await b.db.sales.get('slow-commit')).toBeDefined();

    // And re-reading the overlap again is harmless.
    server.tick(10_000);
    const again = await pullOnce(client, b.db);
    expect(again.inserted).toBe(0);
    expect(await b.db.sales.count()).toBe(1);
  });

  it('keeps received_at out of local rows and out of pushes', async () => {
    const server = new FakeServer();
    const client = server.client();
    const product = makeProduct();
    server.seed('products', [product as unknown as Record<string, unknown>]);

    const a = await replica('suq-received-local', 'A1');
    await pullOnce(client, a.db);

    const local = (await a.db.products.get(product.id)) as unknown as Record<string, unknown>;
    expect(local).toBeDefined();
    expect('received_at' in local).toBe(false);

    const upsert = vi.spyOn(client, 'upsert');
    await localWrite(
      'products',
      { ...(local as unknown as typeof product), received_at: 'client-made-this-up' } as never,
      a.db,
    );
    await drainOutbox(client, a.db);

    const sent = upsert.mock.calls[0]?.[1] as Record<string, unknown>[];
    expect(sent[0]).toBeDefined();
    expect('received_at' in sent[0]!).toBe(false);
  });
});

/* ------------------------------------------------------------------ 8 ---- */

describe('8. two tills void the same sale while offline', () => {
  afterEach(() => resetEngineState());

  it('ends with one void on the server and on both tills, nothing deleted', async () => {
    const server = new FakeServer();
    const client = server.client();

    // Till A is a replica; till B is the app's own database, so B runs the
    // real repository and the real sync engine.
    const a = await replica('suq-double-void-a', 'A1');
    await clearAllTables();
    await registerDevice({ shop_id: SHOP, device_prefix: 'B1', cashier_name: 'ሰላም' });
    setAuthed(true);

    const product = makeProduct();
    await localWrite('products', product, a.db);
    await localWrite(
      'stock_movements',
      {
        id: 'opening-double-void',
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

    const { sale, item } = await sellOn(a, { productId: product.id, qty: 6 });
    await drainOutbox(client, a.db);
    server.tick();
    await syncNow(client);
    expect(await onHandIn(db, product.id)).toBe(34);

    // Both offline. A voids first (by its clock), B a minute later.
    const voidedAt = new Date(Date.now() - 60_000).toISOString();
    await localWrite(
      'sales',
      {
        ...sale,
        id: 'void-on-a',
        receipt_no: 'A1-000002',
        subtotal: -sale.subtotal,
        total: -sale.total,
        voids_sale_id: sale.id,
        created_at: voidedAt,
      },
      a.db,
    );
    await localWrite(
      'sale_items',
      { ...item, id: 'void-item-on-a', sale_id: 'void-on-a', qty: -6, line_total: -item.line_total, created_at: voidedAt },
      a.db,
    );
    await localWrite(
      'stock_movements',
      {
        id: 'void-movement-on-a',
        shop_id: SHOP,
        product_id: product.id,
        qty_delta: 6,
        reason: 'return',
        ref_id: 'void-on-a',
        note: null,
        created_at: voidedAt,
        device_id: a.deviceId,
      },
      a.db,
    );
    const voidOnB = await salesRepo.voidSale(sale.id, 'wrong item');

    // Back online: A pushes, then B syncs (push its void, pull A's, reconcile),
    // then B's next sync pushes the reversal, then A pulls.
    await drainOutbox(client, a.db);
    server.tick();
    await syncNow(client);
    server.tick();
    await syncNow(client);
    server.tick();
    await pullOnce(client, a.db);

    const serverSales = server.rows('sales');
    const net = serverSales.reduce((sum, row) => sum + Number(row.total), 0);

    expect(serverSales, 'sale, two voids, one reversal').toHaveLength(4);
    expect(net, 'the sale is voided once').toBe(0);
    expect(server.onHand(product.id), 'goods came back once').toBe(40);
    expect(await onHandIn(a.db, product.id)).toBe(40);
    expect(await onHandIn(db, product.id)).toBe(40);
    expect(await a.db.sales.count()).toBe(4);
    expect(await db.sales.count()).toBe(4);
    expect(await db.outbox.count(), 'B pushed everything').toBe(0);

    const reversal = serverSales.find((row) => row.voids_sale_id === voidOnB.id);
    expect(reversal, 'B reversed its own duplicate').toMatchObject({ device_id: voidOnB.device_id });
    expect(serverSales.filter((row) => row.voids_sale_id === 'void-on-a'), 'A\'s void stands').toHaveLength(0);
    expect((await salesRepo.findVoidOf(sale.id))?.id).toBe('void-on-a');
  });
});

/* ------------------------------------------------------------------ 9 ---- */

describe('9. Postgres timestamp text', () => {
  /**
   * PostgREST prints timestamptz as `…08:00:00.1+00:00`, not the till's
   * `…08:00:00.100Z`. Kept as received, each till would hold its own rows in
   * one format and the other till's in the other, and sort an equal instant
   * differently from its neighbour.
   */
  it('gives every till the same text, so a same-millisecond pair sorts alike', async () => {
    const server = new FakeServer();
    server.postgresTimestamps = true;
    const client = server.client();

    const product = makeProduct();
    server.seed('products', [product as unknown as Record<string, unknown>]);
    const a = await replica('suq-pgtime-a', 'A1');
    const b = await replica('suq-pgtime-b', 'B1');

    const at = '2026-10-26T08:00:00.100Z';
    await sellOn(a, { productId: product.id, qty: 1, createdAt: at });
    await sellOn(b, { productId: product.id, qty: 1, createdAt: at });
    await drainOutbox(client, a.db);
    await drainOutbox(client, b.db);
    await pullOnce(client, a.db);
    await pullOnce(client, b.db);

    // The (created_at, id) order findVoidOf uses to pick THE void.
    const order = async (db: typeof a.db) =>
      (await db.sales.toArray())
        .sort((x, y) =>
          x.created_at !== y.created_at
            ? x.created_at < y.created_at
              ? -1
              : 1
            : x.id < y.id
              ? -1
              : 1,
        )
        .map((sale) => sale.id);

    expect(await order(a.db)).toEqual(await order(b.db));
    for (const db of [a.db, b.db]) {
      expect((await db.sales.toArray()).map((sale) => sale.created_at)).toEqual([at, at]);
      expect((await db.sale_items.toArray()).map((item) => item.created_at)).toEqual([at, at]);
      expect((await db.stock_movements.toArray()).map((m) => m.created_at)).toEqual([at, at]);
      expect((await db.products.get(product.id))?.updated_at).toBe(product.updated_at);
      expect(await onHandIn(db, product.id)).toBe(-2);
    }
  });

  it('puts a sale pulled at exactly a period boundary into the period it starts', async () => {
    const server = new FakeServer();
    server.postgresTimestamps = true;
    const client = server.client();

    const product = makeProduct();
    server.seed('products', [product as unknown as Record<string, unknown>]);
    const a = await replica('suq-pgtime-edge-a', 'A1');
    const b = await replica('suq-pgtime-edge-b', 'B1');

    // Midnight in Addis Ababa, to the millisecond.
    const midnight = '2026-10-26T21:00:00.000Z';
    await sellOn(a, { productId: product.id, qty: 1, createdAt: midnight });
    await drainOutbox(client, a.db);
    await pullOnce(client, b.db);

    const nextDay = await b.db.sales
      .where('created_at')
      .between(midnight, '2026-10-27T21:00:00.000Z', true, false)
      .count();
    expect(nextDay).toBe(1);
  });

  it.each([true, false])(
    'pages through a long history with Postgres-formatted cursors (received_at: %s)',
    { timeout: 30_000 },
    async (hasReceivedAt) => {
      const server = new FakeServer();
      server.postgresTimestamps = true;
      server.hasReceivedAt = hasReceivedAt;
      const client = server.client();

      // More than two pages, each row stamped a few ms apart so the cursors
      // carry trimmed fractions (`.07+00:00`, `.1+00:00`, `+00:00`).
      const total = PULL_PAGE_SIZE * 2 + 37;
      const start = Date.parse('2026-10-26T08:00:00.000Z');
      for (let i = 0; i < total; i += 1) {
        server.tick(7);
        server.seed('sales', [
          {
            id: `pg-sale-${String(i).padStart(5, '0')}`,
            shop_id: SHOP,
            device_id: 'other-till',
            receipt_no: `B1-${String(i).padStart(6, '0')}`,
            subtotal: 3500,
            discount: 0,
            total: 3500,
            payment_method: 'cash',
            cashier_name: 'x',
            voided_by: null,
            voids_sale_id: null,
            cash_received: null,
            created_at: new Date(start + i * 10).toISOString(),
          },
        ]);
      }

      const a = await replica(`suq-pgtime-page-${hasReceivedAt}`, 'A1');
      const result = await pullOnce(client, a.db);

      expect(result.inserted).toBe(total);
      expect(await a.db.sales.count()).toBe(total);
      expect((await a.db.sales.toArray()).every((sale) => sale.created_at.endsWith('Z'))).toBe(true);
    },
  );
});
