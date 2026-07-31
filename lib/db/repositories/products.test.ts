import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { freshDatabase, seedProduct } from '../test-helpers';
import * as productsRepo from './products';

beforeEach(async () => {
  await freshDatabase();
});

describe('products.upsert', () => {
  it('creates with a client-generated id and queues the row', async () => {
    const product = await seedProduct();

    expect(product.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await db.outbox.count()).toBe(1);
  });

  it('rejects prices that are not integer cents', async () => {
    await expect(seedProduct({ sell_price: 25.5 })).rejects.toThrow(TypeError);
    await expect(seedProduct({ cost_price: -100 })).rejects.toThrow(RangeError);
  });

  it('bumps updated_at on edit, because products are last-write-wins', async () => {
    const created = await seedProduct();

    await new Promise((resolve) => setTimeout(resolve, 2));
    const edited = await productsRepo.upsert({
      id: created.id,
      name: 'Ambo Water 1L',
      name_am: 'አምቦ ውሃ 1 ሊትር',
      cost_price: 1900,
      sell_price: 2600,
    });

    expect(edited.id).toBe(created.id);
    expect(edited.sell_price).toBe(2600);
    expect(edited.updated_at > created.updated_at).toBe(true);
    expect(await db.products.count()).toBe(1);
  });
});

describe('products.search', () => {
  it('matches Amharic name, English name, and barcode', async () => {
    await seedProduct();
    await seedProduct({ name: 'Abay Soap', name_am: 'አባይ ሳሙና', barcode: '600333' });

    expect(await productsRepo.search('አምቦ')).toHaveLength(1);
    expect(await productsRepo.search('soap')).toHaveLength(1);
    expect(await productsRepo.search('ውሃ')).toHaveLength(1);
    expect(await productsRepo.search('')).toHaveLength(2);
  });

  it('returns the single item on an exact barcode hit, the way a scanner expects', async () => {
    const water = await seedProduct();
    await seedProduct({ name: 'Abay Soap', name_am: 'አባይ ሳሙና', barcode: '600444' });

    const found = await productsRepo.search('6001234567890');
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(water.id);
  });
});

describe('products.softDelete', () => {
  it('keeps the row so the tombstone can replicate', async () => {
    const product = await seedProduct();

    await productsRepo.softDelete(product.id);

    expect(await db.products.count()).toBe(1);
    expect(await productsRepo.list()).toHaveLength(0);
    expect(await productsRepo.list({ includeDeleted: true, includeInactive: true })).toHaveLength(1);
    expect(await productsRepo.getByBarcode('6001234567890')).toBeUndefined();
  });

  it('hides inactive products from the default list', async () => {
    await seedProduct({ is_active: false });
    expect(await productsRepo.list()).toHaveLength(0);
    expect(await productsRepo.list({ includeInactive: true })).toHaveLength(1);
  });
});
