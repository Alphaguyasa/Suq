import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId, nowIso } from './id';
import { db } from './schema';
import type { Product } from './schema';
import { TEST_SHOP, freshDatabase } from './test-helpers';
import { localWrite, localWriteMany } from './write';

function draftProduct(): Product {
  return {
    id: newId(),
    shop_id: TEST_SHOP,
    name: 'Abay Soap',
    name_am: 'አባይ ሳሙና',
    barcode: '6009876543210',
    unit: 'pcs',
    cost_price: 1500,
    sell_price: 2000,
    reorder_level: 6,
    is_active: true,
    updated_at: nowIso(),
    deleted_at: null,
  };
}

beforeEach(async () => {
  await freshDatabase();
});

describe('localWrite', () => {
  it('writes the domain row and queues exactly one outbox row', async () => {
    const product = draftProduct();

    await localWrite('products', product);

    expect(await db.products.get(product.id)).toMatchObject({ id: product.id, name: 'Abay Soap' });

    const queued = await db.outbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      table: 'products',
      op: 'upsert',
      row_id: product.id,
      attempts: 0,
      last_error: null,
    });
  });

  it('is atomic: if the outbox insert throws, the domain row does not persist', async () => {
    const product = draftProduct();

    const add = vi.spyOn(db.outbox, 'add').mockImplementation(() => {
      throw new Error('outbox unavailable');
    });

    await expect(localWrite('products', product)).rejects.toThrow();

    add.mockRestore();

    // Either both land or neither does. A row that exists locally but was
    // never queued would sync silently never — the worst failure mode we have.
    expect(await db.products.get(product.id)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });

  it('rolls back the whole batch when one outbox insert fails', async () => {
    const products = [draftProduct(), draftProduct(), draftProduct()];

    const bulkAdd = vi.spyOn(db.outbox, 'bulkAdd').mockImplementation(() => {
      throw new Error('outbox unavailable');
    });

    await expect(localWriteMany('products', products)).rejects.toThrow();

    bulkAdd.mockRestore();

    expect(await db.products.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('queues one outbox row per row in a batch, in order', async () => {
    const products = [draftProduct(), draftProduct(), draftProduct()];

    await localWriteMany('products', products);

    const queued = await db.outbox.orderBy('id').toArray();
    expect(queued.map((entry) => entry.row_id)).toEqual(products.map((product) => product.id));
  });

  it('does nothing at all for an empty batch', async () => {
    await localWriteMany('products', []);
    expect(await db.outbox.count()).toBe(0);
  });
});
