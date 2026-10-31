import { beforeEach, describe, expect, it } from 'vitest';
import { saveCashClose } from './cash-closes';
import * as salesRepo from './repositories/sales';
import { DEVICE_META_ID } from './device';
import { readPreviousTill } from './previous-till';
import { resetDevice, unsyncedSummary } from './reset';
import { db } from './schema';
import { cartLine, freshDatabase, seedProduct } from './test-helpers';

beforeEach(async () => {
  await freshDatabase();
});

describe('unsyncedSummary', () => {
  it('is zero on a till with nothing queued', async () => {
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0, cashCloses: 0 });
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
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0, cashCloses: 0 });
  });

  it('counts saved drawer counts even when the outbox is empty', async () => {
    // cash_closes never reach the outbox (local only until ROADMAP item 13),
    // so a fully synced till still loses them on a reset.
    const day = { periodFrom: '2026-10-31T00:00:00.000Z', periodTo: '2026-11-01T00:00:00.000Z' };
    const figures = { openingFloat: 50000, cashSales: 14500, expected: 64500, counted: 64000, variance: -500 };
    await saveCashClose({ ...day, cashUp: figures });
    await saveCashClose({ ...day, cashUp: { ...figures, counted: 64500, variance: 0 } });

    expect(await db.outbox.count()).toBe(0);
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0, cashCloses: 2 });

    await resetDevice();
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0, cashCloses: 0 });
  });
});

describe('resetDevice', () => {
  it('empties every table, the outbox included', async () => {
    const product = await seedProduct();
    await salesRepo.create([cartLine(product, 1)], { method: 'cash' });

    await resetDevice();

    for (const table of db.tables) expect(await table.count(), table.name).toBe(0);
    expect(await unsyncedSummary()).toEqual({ total: 0, sales: 0, cashCloses: 0 });
  });

  it('remembers which till this was, past the highest receipt it knows of', async () => {
    const meta = await db.device_meta.get(DEVICE_META_ID);
    await db.device_meta.update(DEVICE_META_ID, { receipt_counter: 3 });
    // A receipt with this code pulled from the server, ahead of the counter.
    const product = await seedProduct();
    const sale = await salesRepo.create([cartLine(product, 1)], { method: 'cash' });
    await db.sales.update(sale.id, { receipt_no: 'A1-000017' });

    await resetDevice();

    expect(readPreviousTill()).toEqual({ device_id: meta?.device_id, device_prefix: 'A1', receipt_counter: 17 });
  });

  it('remembers nothing when there was no till to reset', async () => {
    await db.device_meta.clear();
    await resetDevice();
    expect(readPreviousTill()).toBeNull();
  });
});
