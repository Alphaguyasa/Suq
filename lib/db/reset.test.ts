import { beforeEach, describe, expect, it } from 'vitest';
import * as salesRepo from './repositories/sales';
import { resetDevice, unsyncedSummary } from './reset';
import { db } from './schema';
import { cartLine, freshDatabase, seedProduct } from './test-helpers';

beforeEach(async () => {
  await freshDatabase();
});

describe('unsyncedSummary', () => {
  it('is zero on a till with nothing queued', async () => {
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0 });
  });

  it('counts every queued row, and the sales among them', async () => {
    const product = await seedProduct(); // product + opening stock movement
    const sale = await salesRepo.create([cartLine(product, 2)], { method: 'cash' });
    await salesRepo.voidSale(sale.id, 'wrong item');

    const summary = await unsyncedSummary();
    expect(summary.total).toBe(await db.outbox.count());
    // The sale and its void: both are lost if the till is wiped now.
    expect(summary.sales).toBe(2);
    expect(summary.total).toBeGreaterThan(summary.sales);
  });

  it('drops to zero once the outbox has drained', async () => {
    const product = await seedProduct();
    await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    expect((await unsyncedSummary()).sales).toBe(1);

    // What a successful push does: the server has the rows, the queue empties.
    await db.outbox.clear();
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0 });
  });
});

describe('resetDevice', () => {
  it('empties every table, the outbox included', async () => {
    const product = await seedProduct();
    await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    await resetDevice();

    for (const table of db.tables) expect(await table.count(), table.name).toBe(0);
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0 });
  });
});
