import { beforeEach, describe, expect, it } from 'vitest';
import { applyAppendOnly } from '@/lib/sync/apply';
import { db } from '../schema';
import { cartLine, freshDatabase, seedProduct } from '../test-helpers';
import * as salesRepo from './sales';
import * as stockRepo from './stock';

beforeEach(async () => {
  await freshDatabase();
});

describe('on-hand is derived from movements', () => {
  it('appends exactly one movement of -3 when three units are sold', async () => {
    const product = await seedProduct();

    await salesRepo.create([cartLine(product, 3)], { method: 'cash' });

    const movements = await db.stock_movements.where('product_id').equals(product.id).toArray();

    expect(movements).toHaveLength(1);
    expect(movements[0]?.qty_delta).toBe(-3);
    expect(movements[0]?.reason).toBe('sale');
    expect(await stockRepo.onHand(product.id)).toBe(-3);
  });

  it('equals the sum of movements after a mixed sale/restock/adjustment/return history', async () => {
    const product = await seedProduct();

    await stockRepo.openingStock({ productId: product.id, qty: 100 }); // 100
    await salesRepo.create([cartLine(product, 12)], { method: 'cash' }); // 88
    await stockRepo.restock({ productId: product.id, qty: 50 }); // 138
    await stockRepo.adjust({ productId: product.id, countedQty: 130, reason: 'adjustment' }); // 130
    await stockRepo.adjust({ productId: product.id, countedQty: 133, reason: 'return' }); // 133
    await salesRepo.create([cartLine(product, 5)], { method: 'telebirr' }); // 128

    const movements = await db.stock_movements.where('product_id').equals(product.id).toArray();
    const sum = movements.reduce((total, movement) => total + movement.qty_delta, 0);

    expect(await stockRepo.onHand(product.id)).toBe(sum);
    expect(sum).toBe(128);
    expect(movements).toHaveLength(6);
  });

  it('records an adjustment as the delta needed to reach the counted number', async () => {
    const product = await seedProduct();
    await stockRepo.openingStock({ productId: product.id, qty: 40 });

    const movement = await stockRepo.adjust({
      productId: product.id,
      countedQty: 37,
      reason: 'damage',
      note: 'three broken in transit',
    });

    expect(movement?.qty_delta).toBe(-3);
    expect(movement?.reason).toBe('damage');
    expect(await stockRepo.onHand(product.id)).toBe(37);
  });

  it('records nothing when the count already matches', async () => {
    const product = await seedProduct();
    await stockRepo.openingStock({ productId: product.id, qty: 40 });

    const movement = await stockRepo.adjust({
      productId: product.id,
      countedQty: 40,
      reason: 'adjustment',
    });

    expect(movement).toBeNull();
    expect(await db.stock_movements.count()).toBe(1);
  });

  it('allows stock to go negative rather than blocking a real sale', async () => {
    const product = await seedProduct();
    await stockRepo.openingStock({ productId: product.id, qty: 2 });

    await expect(salesRepo.create([cartLine(product, 5)], { method: 'cash' })).resolves.toBeDefined();
    expect(await stockRepo.onHand(product.id)).toBe(-3);
  });

  it('refuses a restock that is not positive', async () => {
    const product = await seedProduct();
    await expect(stockRepo.restock({ productId: product.id, qty: 0 })).rejects.toThrow(RangeError);
    await expect(stockRepo.restock({ productId: product.id, qty: -5 })).rejects.toThrow(RangeError);
  });
});

describe('stock_cache', () => {
  it('is recomputed from movements, never incremented', async () => {
    const product = await seedProduct();
    await stockRepo.openingStock({ productId: product.id, qty: 20 });
    await salesRepo.create([cartLine(product, 7)], { method: 'cash' });

    expect(await stockRepo.cachedOnHand(product.id)).toBe(13);

    // Corrupt the cache by hand, then prove a recompute heals it from movements.
    await db.stock_cache.put({ product_id: product.id, on_hand: 999, computed_at: 'whenever' });
    expect(await stockRepo.cachedOnHand(product.id)).toBe(999);

    await stockRepo.recomputeCache();

    expect(await stockRepo.cachedOnHand(product.id)).toBe(13);
    expect(await stockRepo.onHand(product.id)).toBe(13);
  });

  it('covers every product that has movements when recomputed wholesale', async () => {
    const water = await seedProduct();
    const soap = await seedProduct({ name: 'Abay Soap', name_am: 'አባይ ሳሙና', barcode: '600111' });

    await stockRepo.openingStock({ productId: water.id, qty: 10 });
    await stockRepo.openingStock({ productId: soap.id, qty: 4 });
    await salesRepo.create([cartLine(water, 2), cartLine(soap, 1)], { method: 'cash' });

    await stockRepo.recomputeCache();

    expect(await stockRepo.cachedOnHand(water.id)).toBe(8);
    expect(await stockRepo.cachedOnHand(soap.id)).toBe(3);
  });
});

describe('the stock the screens read', () => {
  it('matches the movement sum after local sales, voids, restocks and adjustments', async () => {
    const water = await seedProduct();
    const soap = await seedProduct({ name: 'Abay Soap', name_am: 'አባይ ሳሙና', barcode: '600111' });

    await stockRepo.openingStock({ productId: water.id, qty: 30 });
    await stockRepo.openingStock({ productId: soap.id, qty: 5 });
    const sale = await salesRepo.create([cartLine(water, 4), cartLine(soap, 2)], {
      method: 'cash',
    });
    await salesRepo.voidSale(sale.id, 'mistake');
    await salesRepo.create([cartLine(water, 1)], { method: 'cash' });
    await stockRepo.restock({ productId: soap.id, qty: 3 });
    await stockRepo.adjust({ productId: water.id, countedQty: 27, reason: 'damage' });

    expect(await stockRepo.cachedOnHandAll()).toEqual(await stockRepo.onHandAll());
    expect((await stockRepo.cachedOnHandAll()).get(water.id)).toBe(27);
    expect((await stockRepo.cachedOnHandAll()).get(soap.id)).toBe(8);
  });

  it('includes movements pulled from another till', async () => {
    const water = await seedProduct();
    await stockRepo.openingStock({ productId: water.id, qty: 10 });

    const pulled = {
      shop_id: 'shop-test',
      product_id: water.id,
      reason: 'sale',
      ref_id: null,
      note: null,
      created_at: '2026-10-26T08:00:00.000Z',
      device_id: 'other-till',
    };
    await applyAppendOnly('stock_movements', [
      { ...pulled, id: 'pulled-1', qty_delta: -3 },
      { ...pulled, id: 'pulled-2', qty_delta: -1 },
    ]);

    expect((await stockRepo.cachedOnHandAll()).get(water.id)).toBe(6);

    // A repeated pull holds rows we already have; the stock must not move.
    await applyAppendOnly('stock_movements', [{ ...pulled, id: 'pulled-1', qty_delta: -3 }]);
    expect((await stockRepo.cachedOnHandAll()).get(water.id)).toBe(6);
    expect(await stockRepo.cachedOnHandAll()).toEqual(await stockRepo.onHandAll());
  });

  it('covers a product the till has only ever heard about from a pull', async () => {
    await applyAppendOnly('stock_movements', [
      {
        id: 'pulled-open',
        shop_id: 'shop-test',
        product_id: 'p-from-elsewhere',
        qty_delta: 12,
        reason: 'opening',
        ref_id: null,
        note: null,
        created_at: '2026-10-26T08:00:00.000Z',
        device_id: 'other-till',
      },
    ]);

    expect((await stockRepo.cachedOnHandAll()).get('p-from-elsewhere')).toBe(12);
  });
});
