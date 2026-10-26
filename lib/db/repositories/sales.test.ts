import { beforeEach, describe, expect, it } from 'vitest';
import { applyAppendOnly } from '@/lib/sync/apply';
import { newId } from '../id';
import { db } from '../schema';
import type { Sale } from '../schema';
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

/**
 * What another till's void of `sale` looks like once a pull has applied it:
 * the same rows voidSale() writes, from a different device, at `createdAt`.
 */
async function pullForeignVoid(sale: Sale, createdAt: string): Promise<Sale> {
  const items = await salesRepo.itemsFor(sale.id);
  const voidRow: Sale = {
    ...sale,
    id: newId(),
    device_id: 'other-till',
    receipt_no: 'B1-000007',
    subtotal: -sale.subtotal,
    discount: -sale.discount,
    total: -sale.total,
    voids_sale_id: sale.id,
    cash_received: null,
    created_at: createdAt,
  };

  await applyAppendOnly('sales', [{ ...voidRow }]);
  await applyAppendOnly(
    'sale_items',
    items.map((item) => ({ ...item, id: newId(), sale_id: voidRow.id, qty: -item.qty, line_total: -item.line_total, created_at: createdAt })),
  );
  await applyAppendOnly(
    'stock_movements',
    items.map((item) => ({
      id: newId(),
      shop_id: sale.shop_id,
      product_id: item.product_id,
      qty_delta: item.qty,
      reason: 'return',
      ref_id: voidRow.id,
      note: null,
      created_at: createdAt,
      device_id: 'other-till',
    })),
  );

  return voidRow;
}

async function netTakings(): Promise<number> {
  return (await db.sales.toArray()).reduce((sum, sale) => sum + sale.total, 0);
}

describe('the same sale voided on two tills', () => {
  it('writes one void row when two voids race on this till', async () => {
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    const results = await Promise.allSettled([
      salesRepo.voidSale(sale.id, 'double tap'),
      salesRepo.voidSale(sale.id, 'double tap'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.sales.where('voids_sale_id').equals(sale.id).count()).toBe(1);
    expect((await db.stock_movements.toArray()).filter((m) => m.reason === 'return')).toHaveLength(1);
  });

  it('reverses this till\'s later void once the earlier one arrives', async () => {
    const product = await seedProduct();
    await stockRepo.openingStock({ productId: product.id, qty: 40 });
    const sale = await salesRepo.create([cartLine(product, 6)], { method: 'cash' });

    // This till voids it, then a pull brings the other till's void, made earlier.
    const mine = await salesRepo.voidSale(sale.id, 'wrong item');
    const theirs = await pullForeignVoid(sale, sale.created_at);

    expect(await stockRepo.onHand(product.id), 'goods came back twice').toBe(46);
    expect(await netTakings(), 'takings dropped twice').toBe(-sale.total);

    const written = await salesRepo.reconcileDuplicateVoids();

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ voids_sale_id: mine.id, total: sale.total, receipt_no: 'A1-000003' });
    expect(await stockRepo.onHand(product.id)).toBe(40);
    expect(await stockRepo.cachedOnHand(product.id)).toBe(40);
    expect(await netTakings()).toBe(0);
    expect(await salesRepo.findVoidOf(sale.id), 'the earliest void is the void').toMatchObject({ id: theirs.id });
    expect(await salesRepo.isVoided(mine.id), 'the duplicate shows as reversed').toBe(true);

    const movement = await db.stock_movements.where('ref_id').equals(written[0]!.id).first();
    expect(movement).toMatchObject({ qty_delta: -6, reason: 'sale' });

    // Queued for push like any other write, and nothing was updated or deleted.
    const queued = await db.outbox.where('row_id').equals(written[0]!.id).count();
    expect(queued).toBe(1);
    expect(await db.sales.count()).toBe(4);

    // Running it again (every pull does) writes nothing more.
    expect(await salesRepo.reconcileDuplicateVoids()).toHaveLength(0);
    expect(await db.sales.count()).toBe(4);
  });

  it('leaves the reversal to the other till when its void is the later one', async () => {
    const product = await seedProduct();
    await stockRepo.openingStock({ productId: product.id, qty: 10 });
    const sale = await salesRepo.create([cartLine(product, 2)], { method: 'cash' });

    const mine = await salesRepo.voidSale(sale.id, 'wrong item');
    await pullForeignVoid(sale, new Date(Date.parse(mine.created_at) + 60_000).toISOString());

    expect(await salesRepo.reconcileDuplicateVoids()).toHaveLength(0);
    expect(await salesRepo.findVoidOf(sale.id)).toMatchObject({ id: mine.id });
  });

  it('breaks a created_at tie by id, the same way on every till', async () => {
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    const first = await pullForeignVoid(sale, '2026-10-24T08:00:00.000Z');
    const second = await pullForeignVoid(sale, '2026-10-24T08:00:00.000Z');
    const expected = [first.id, second.id].sort()[0];

    expect((await salesRepo.findVoidOf(sale.id))?.id).toBe(expected);
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

describe('recentProductIds', () => {
  /** A sale from another till at a fixed time, so the order is not left to the clock. */
  async function pulledSale(at: string, productIds: string[], voids: string | null = null) {
    const id = newId();
    await applyAppendOnly('sales', [
      {
        id,
        shop_id: 'shop-test',
        device_id: 'other-till',
        receipt_no: `B1-${id.slice(0, 6)}`,
        subtotal: 100,
        discount: 0,
        total: 100,
        payment_method: 'cash',
        cashier_name: 'x',
        voided_by: null,
        voids_sale_id: voids,
        cash_received: null,
        created_at: at,
        synced_at: null,
      },
    ]);
    await applyAppendOnly(
      'sale_items',
      productIds.map((product_id) => ({
        id: newId(),
        shop_id: 'shop-test',
        sale_id: id,
        product_id,
        name_snapshot: product_id,
        unit_price: 100,
        qty: 1,
        line_total: 100,
        created_at: at,
      })),
    );
    return id;
  }

  it('lists products most recently sold first, each once, skipping void rows', async () => {
    const old = await pulledSale('2026-10-26T08:00:00.000Z', ['bread', 'milk']);
    await pulledSale('2026-10-26T09:00:00.000Z', ['soap']);
    await pulledSale('2026-10-26T10:00:00.000Z', ['milk']);
    // A void row's lines are the voided sale's products; they were not just sold.
    await pulledSale('2026-10-26T11:00:00.000Z', ['sugar'], old);

    expect(await salesRepo.recentProductIds()).toEqual(['milk', 'soap', 'bread']);
  });

  it('stops at the limit', async () => {
    await pulledSale('2026-10-26T08:00:00.000Z', ['a', 'b']);
    await pulledSale('2026-10-26T09:00:00.000Z', ['c']);

    const ids = await salesRepo.recentProductIds(2);

    // Lines within one sale come back in id order, which is random.
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('c');
    expect(['a', 'b']).toContain(ids[1]);
  });

  it('is empty before the first sale', async () => {
    expect(await salesRepo.recentProductIds()).toEqual([]);
  });
});
