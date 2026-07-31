import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { cartLine, freshDatabase, seedProduct } from '../test-helpers';
import * as salesRepo from './sales';
import * as stockRepo from './stock';

beforeEach(async () => {
  await freshDatabase();
});

describe('sales.create', () => {
  it('writes the sale, its items and its movements together', async () => {
    const product = await seedProduct();

    const sale = await salesRepo.create([cartLine(product, 2)], {
      method: 'cash',
      discount: 500,
    });

    expect(sale.subtotal).toBe(5000);
    expect(sale.discount).toBe(500);
    expect(sale.total).toBe(4500);
    expect(sale.voids_sale_id).toBeNull();
    expect(sale.synced_at).toBeNull();

    const detail = await salesRepo.getById(sale.id);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]).toMatchObject({
      unit_price: 2500,
      qty: 2,
      line_total: 5000,
      name_snapshot: 'አምቦ ውሃ 1 ሊትር',
    });

    // Sale + item + movement all queued for push.
    const queued = await db.outbox.toArray();
    expect(queued.filter((row) => row.table === 'sales')).toHaveLength(1);
    expect(queued.filter((row) => row.table === 'sale_items')).toHaveLength(1);
    expect(queued.filter((row) => row.table === 'stock_movements')).toHaveLength(1);
  });

  it('snapshots the name and price so later edits cannot rewrite history', async () => {
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    const { upsert } = await import('./products');
    await upsert({
      id: product.id,
      name: 'Ambo Water 1L',
      name_am: 'አምቦ ውሃ 1 ሊትር',
      cost_price: 2000,
      sell_price: 3200,
    });

    const detail = await salesRepo.getById(sale.id);
    expect(detail?.items[0]?.unit_price).toBe(2500);
  });

  it('refuses an empty cart, a float price, and an over-large discount', async () => {
    const product = await seedProduct();

    await expect(salesRepo.create([], { method: 'cash' })).rejects.toThrow();

    await expect(
      salesRepo.create([{ ...cartLine(product, 1), unit_price: 25.5 }], { method: 'cash' }),
    ).rejects.toThrow(TypeError);

    await expect(
      salesRepo.create([cartLine(product, 1)], { method: 'cash', discount: 999999 }),
    ).rejects.toThrow(RangeError);
  });
});

describe('receipt numbers', () => {
  it('increment monotonically and never repeat', async () => {
    const product = await seedProduct();
    const receipts: string[] = [];

    for (let i = 0; i < 25; i += 1) {
      const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
      receipts.push(sale.receipt_no);
    }

    expect(new Set(receipts).size).toBe(25);
    expect(receipts[0]).toBe('A1-000001');
    expect(receipts[24]).toBe('A1-000025');

    const counters = receipts.map((receipt) => Number(receipt.split('-')[1]));
    for (let i = 1; i < counters.length; i += 1) {
      expect(counters[i]).toBeGreaterThan(counters[i - 1] as number);
    }
  });

  it('never repeat even when sales are rung up concurrently', async () => {
    const product = await seedProduct();

    const sales = await Promise.all(
      Array.from({ length: 20 }, () => salesRepo.create([cartLine(product, 1)], { method: 'cash' })),
    );

    const receipts = sales.map((sale) => sale.receipt_no);
    expect(new Set(receipts).size).toBe(20);
  });

  it('carry the device prefix so two offline tills cannot collide', async () => {
    await freshDatabase('B2');
    const product = await seedProduct();

    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    expect(sale.receipt_no).toBe('B2-000001');
  });
});

describe('voiding', () => {
  it('appends compensating movements and restores on-hand without deleting anything', async () => {
    const product = await seedProduct();
    await stockRepo.openingStock({ productId: product.id, qty: 40 });

    const sale = await salesRepo.create([cartLine(product, 6)], { method: 'cash' });
    expect(await stockRepo.onHand(product.id)).toBe(34);

    const movementsBefore = await db.stock_movements.count();
    const voidRow = await salesRepo.voidSale(sale.id, 'rang up the wrong item');

    expect(await stockRepo.onHand(product.id)).toBe(40);
    expect(await db.stock_movements.count()).toBe(movementsBefore + 1);

    // The original is untouched, and still there.
    const original = await db.sales.get(sale.id);
    expect(original).toBeDefined();
    expect(original?.total).toBe(sale.total);

    // The void row is the evidence, and it nets the takings out.
    expect(voidRow.voids_sale_id).toBe(sale.id);
    expect(voidRow.total).toBe(-sale.total);
    expect(await salesRepo.isVoided(sale.id)).toBe(true);

    const compensating = await db.stock_movements.where('ref_id').equals(voidRow.id).toArray();
    expect(compensating).toHaveLength(1);
    expect(compensating[0]?.qty_delta).toBe(6);
    expect(compensating[0]?.reason).toBe('return');
    expect(compensating[0]?.note).toBe('rang up the wrong item');
  });

  it('restores on-hand across a multi-line sale', async () => {
    const water = await seedProduct();
    const soap = await seedProduct({ name: 'Abay Soap', name_am: 'አባይ ሳሙና', barcode: '600222' });

    await stockRepo.openingStock({ productId: water.id, qty: 24 });
    await stockRepo.openingStock({ productId: soap.id, qty: 12 });

    const sale = await salesRepo.create([cartLine(water, 3), cartLine(soap, 2)], {
      method: 'telebirr',
    });

    await salesRepo.voidSale(sale.id, 'customer changed their mind');

    expect(await stockRepo.onHand(water.id)).toBe(24);
    expect(await stockRepo.onHand(soap.id)).toBe(12);
    expect(await stockRepo.cachedOnHand(water.id)).toBe(24);
  });

  it('refuses to void twice, or to void a void', async () => {
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    const voidRow = await salesRepo.voidSale(sale.id, 'first');

    await expect(salesRepo.voidSale(sale.id, 'second')).rejects.toThrow(/already voided/);
    await expect(salesRepo.voidSale(voidRow.id, 'third')).rejects.toThrow(/void row/);
  });

  it('gives the void row its own receipt number', async () => {
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    const voidRow = await salesRepo.voidSale(sale.id, 'test');

    expect(sale.receipt_no).toBe('A1-000001');
    expect(voidRow.receipt_no).toBe('A1-000002');
  });
});

describe('sales.list', () => {
  it('returns newest first and can hide void rows', async () => {
    const product = await seedProduct();

    const first = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    const second = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    await salesRepo.voidSale(first.id, 'mistake');

    const all = await salesRepo.list();
    expect(all).toHaveLength(3);

    const real = await salesRepo.list({ excludeVoidRows: true });
    expect(real.map((sale) => sale.id)).toEqual([second.id, first.id]);
  });

  it('finds a sale by receipt number', async () => {
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    expect((await salesRepo.getByReceiptNo(sale.receipt_no))?.id).toBe(sale.id);
  });
});
