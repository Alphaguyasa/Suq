import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup } from '@/lib/backup/export';
import { parseBackup, restoreBackup } from '@/lib/backup/restore';
import { applyProducts } from '@/lib/sync/apply';
import { DEVICE_META_ID } from './device';
import { listPriceChanges, priceChangesBetween } from './price-changes';
import * as productsRepo from './repositories/products';
import { clearAllTables, db } from './schema';
import { TEST_SHOP, freshDatabase } from './test-helpers';

beforeEach(async () => {
  await freshDatabase();
});

async function sugar() {
  return productsRepo.upsert({ name: 'Sugar 1kg', name_am: 'ስኳር', cost_price: 9000, sell_price: 11000 });
}

describe('the price-change log', () => {
  it('writes nothing when a product is created', async () => {
    await sugar();
    expect(await db.price_changes.count()).toBe(0);
  });

  it('records the old and new prices and who changed them', async () => {
    await db.device_meta.update(DEVICE_META_ID, { cashier_name: 'ሰላም' });
    const product = await sugar();

    await productsRepo.upsert({ ...product, sell_price: 12000 });
    const edited = await db.products.get(product.id);

    const [change] = await listPriceChanges(product.id);
    expect(change).toMatchObject({
      shop_id: TEST_SHOP,
      product_id: product.id,
      old_sell_price: 11000,
      new_sell_price: 12000,
      old_cost_price: 9000,
      new_cost_price: 9000,
      cashier_name: 'ሰላም',
      source: 'this_till',
      changed_at: edited!.updated_at,
    });
  });

  it('ignores edits that leave both prices alone, and soft deletes', async () => {
    const product = await sugar();
    await productsRepo.upsert({ ...product, name: 'White sugar 1kg' });
    await productsRepo.softDelete(product.id);
    expect(await db.price_changes.count()).toBe(0);
  });

  it('records a cost-only change too', async () => {
    const product = await sugar();
    await productsRepo.upsert({ ...product, cost_price: 9500 });
    const [change] = await listPriceChanges(product.id);
    expect(change).toMatchObject({ old_cost_price: 9000, new_cost_price: 9500, old_sell_price: 11000, new_sell_price: 11000 });
  });

  it('lists one product only, newest first', async () => {
    const product = await sugar();
    const other = await productsRepo.upsert({ name: 'Salt', name_am: 'ጨው', cost_price: 1000, sell_price: 1500 });
    await productsRepo.upsert({ ...product, sell_price: 12000 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await productsRepo.upsert({ ...product, sell_price: 12500 });
    await productsRepo.upsert({ ...other, sell_price: 1600 });

    const changes = await listPriceChanges(product.id);
    expect(changes.map((change) => change.new_sell_price)).toEqual([12500, 12000]);
  });

  it('keeps the product row, its outbox entry and the log row together', async () => {
    const product = await sugar();
    const outboxBefore = await db.outbox.count();
    await productsRepo.upsert({ ...product, sell_price: 12000 });
    expect(await db.outbox.count()).toBe(outboxBefore + 1);
    expect(await db.price_changes.count()).toBe(1);
  });

  it('records a newer price pulled from another till, but not a stale or repeated one', async () => {
    const product = await sugar();
    const newer = { ...product, sell_price: 13000, updated_at: '2999-01-01T00:00:00.000Z' };

    await applyProducts([newer as unknown as Record<string, unknown>]);
    await applyProducts([newer as unknown as Record<string, unknown>]);
    await applyProducts([
      { ...product, sell_price: 1, updated_at: '2000-01-01T00:00:00.000Z' } as unknown as Record<string, unknown>,
    ]);

    const changes = await listPriceChanges(product.id);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      old_sell_price: 11000,
      new_sell_price: 13000,
      source: 'other_till',
      cashier_name: '',
      changed_at: newer.updated_at,
    });
  });

  it('survives a backup and restore onto an empty till', async () => {
    const product = await sugar();
    await productsRepo.upsert({ ...product, sell_price: 12000 });
    const logged = await db.price_changes.toArray();

    const file = JSON.parse(JSON.stringify(await buildBackup())) as Record<string, unknown>;
    await clearAllTables();
    await freshDatabase();
    await restoreBackup(parseBackup(JSON.stringify(file)));

    expect(await db.price_changes.toArray()).toEqual(logged);
  });

  it('restores an older backup that has no price log', async () => {
    await sugar();
    const file = JSON.parse(JSON.stringify(await buildBackup())) as Record<string, unknown>;
    delete file.price_changes;
    await freshDatabase();

    expect(parseBackup(JSON.stringify(file)).price_changes).toEqual([]);
  });

  it('lists every product changed in a half-open period, newest first', async () => {
    const product = await sugar();
    const salt = await productsRepo.upsert({ name: 'Salt', name_am: 'ጨው', cost_price: 1000, sell_price: 1500 });
    await productsRepo.upsert({ ...product, sell_price: 12000 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await productsRepo.upsert({ ...salt, sell_price: 1600 });
    const [newest, oldest] = await db.price_changes.orderBy('changed_at').reverse().toArray();

    expect((await priceChangesBetween('2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z')).map((c) => c.product_id)).toEqual([
      salt.id,
      product.id,
    ]);
    // The end is exclusive, the start inclusive.
    expect(await priceChangesBetween(oldest!.changed_at, newest!.changed_at)).toEqual([oldest]);
  });
});
