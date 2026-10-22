import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyWriteError } from './errors';
import { db } from './schema';
import { cartLine, freshDatabase, seedProduct } from './test-helpers';
import * as salesRepo from './repositories/sales';

describe('classifyWriteError', () => {
  it('recognises a quota DOMException', () => {
    expect(classifyWriteError(new DOMException('full', 'QuotaExceededError'))).toBe('quota');
  });

  it("recognises Dexie's own quota error", () => {
    expect(classifyWriteError(new Dexie.QuotaExceededError('full'))).toBe('quota');
  });

  it('finds the quota error under a transaction abort', () => {
    const inner = new DOMException('full', 'QuotaExceededError');
    expect(classifyWriteError(new Dexie.AbortError('aborted', inner))).toBe('quota');
  });

  it('recognises the legacy quota code and the old Firefox name', () => {
    expect(classifyWriteError({ name: 'Error', code: 22 })).toBe('quota');
    expect(classifyWriteError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe('quota');
  });

  it('reports a closed or unopenable database as unavailable', () => {
    expect(classifyWriteError(new Dexie.DatabaseClosedError())).toBe('unavailable');
    expect(classifyWriteError(new Dexie.OpenFailedError('blocked'))).toBe('unavailable');
    expect(classifyWriteError(new DOMException('gone', 'InvalidStateError'))).toBe('unavailable');
  });

  it('prefers quota when it hides under an unavailable error', () => {
    const inner = new DOMException('full', 'QuotaExceededError');
    expect(classifyWriteError(new Dexie.OpenFailedError('failed', inner))).toBe('quota');
  });

  it('falls back to unknown for anything else', () => {
    expect(classifyWriteError(new TypeError('bug'))).toBe('unknown');
    expect(classifyWriteError('a string')).toBe('unknown');
    expect(classifyWriteError(null)).toBe('unknown');
    expect(classifyWriteError(undefined)).toBe('unknown');
  });

  it('does not loop on a self-referencing cause', () => {
    const error = new Error('loop') as Error & { cause?: unknown };
    error.cause = error;
    expect(classifyWriteError(error)).toBe('unknown');
  });
});

describe('a sale that hits the storage quota', () => {
  beforeEach(async () => {
    await freshDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes nothing and is classified as quota', async () => {
    const product = await seedProduct();
    const salesBefore = await db.sales.count();
    const outboxBefore = await db.outbox.count();

    const movementsBefore = await db.stock_movements.count();

    // The browser refuses a write in the middle of the sale transaction, as
    // it does when the origin's quota runs out mid-sale.
    const refuse =
      <M extends 'add' | 'put'>(real: IDBObjectStore[M]) =>
      function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore[M]>) {
        if (this.name === 'stock_movements') {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return (real as (...a: Parameters<IDBObjectStore[M]>) => IDBRequest<IDBValidKey>).apply(this, args);
      };
    const { add, put } = IDBObjectStore.prototype;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(refuse(add));
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(refuse(put));

    const failure = await salesRepo
      .create([cartLine(product, 1)], { method: 'cash' })
      .then(() => undefined, (cause: unknown) => cause);

    expect(failure).toBeDefined();
    expect(classifyWriteError(failure)).toBe('quota');

    vi.restoreAllMocks();
    // All-or-nothing: no sale, no item, no movement, nothing queued.
    expect(await db.sales.count()).toBe(salesBefore);
    expect(await db.sale_items.count()).toBe(0);
    expect(await db.stock_movements.count()).toBe(movementsBefore);
    expect(await db.outbox.count()).toBe(outboxBefore);

    // And the same cart goes through once there is room again.
    await expect(salesRepo.create([cartLine(product, 1)], { method: 'cash' })).resolves.toMatchObject({
      total: product.sell_price,
    });
  });
});
