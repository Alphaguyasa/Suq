import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, stockRepo } from '@/lib/db';
import { freshDatabase } from '@/lib/db/test-helpers';
import { parseProductCsv } from './csv';
import { importProducts } from './import';

const header = 'name,name_am,barcode,unit,cost_price,sell_price,reorder_level,opening_qty';

function rows(...lines: string[]) {
  return parseProductCsv([header, ...lines].join('\n')).products;
}

function quotaError() {
  return Object.assign(new Error('full'), { name: 'QuotaExceededError' });
}

beforeEach(async () => {
  await freshDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importProducts', () => {
  it('creates products with opening stock as a movement', async () => {
    const result = await importProducts(rows('Soap,ሳሙና,111,pcs,10,15,2,8'));

    expect(result).toEqual({ created: 1, skipped: 0, failed: [] });
    const [product] = await db.products.toArray();
    expect(product).toMatchObject({ name: 'Soap', cost_price: 1000, sell_price: 1500 });
    expect(await stockRepo.onHand(product!.id)).toBe(8);
  });

  it('counts a re-import as skipped, not imported, and does not double stock', async () => {
    const file = rows('Soap,ሳሙና,111,pcs,10,15,2,8', 'Oil,ዘይት,222,l,90,120,1,4');
    await importProducts(file);
    const again = await importProducts(file);

    expect(again).toEqual({ created: 0, skipped: 2, failed: [] });
    expect(await db.products.count()).toBe(2);
    expect(await db.stock_movements.count()).toBe(2);
  });

  it('reports a row that fails and carries on with the rest', async () => {
    const real = stockRepo.openingStock;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(stockRepo, 'openingStock').mockImplementation(async (input) => {
      if (input.qty === 4) throw new Error('boom');
      return real(input);
    });

    const result = await importProducts(
      rows('Soap,ሳሙና,111,pcs,10,15,2,8', 'Oil,ዘይት,222,l,90,120,1,4', 'Salt,ጨው,333,kg,5,8,1,3'),
    );

    expect(result.created).toBe(2);
    expect(result.failed).toEqual([{ row: 3, name: 'ዘይት', failure: 'unknown' }]);
    // The failed row left nothing behind: no product without its opening stock,
    // so importing the file again creates it whole.
    expect((await db.products.toArray()).map((p) => p.name).sort()).toEqual(['Salt', 'Soap']);
    expect(await db.outbox.where('table').equals('products').count()).toBe(2);

    vi.mocked(stockRepo.openingStock).mockRestore();
    const retry = await importProducts(rows('Oil,ዘይት,222,l,90,120,1,4'));
    expect(retry).toEqual({ created: 1, skipped: 0, failed: [] });
  });

  it('stops trying once storage is full and reports every remaining row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const openingStock = vi.spyOn(stockRepo, 'openingStock').mockRejectedValue(quotaError());

    const result = await importProducts(
      rows('Soap,ሳሙና,111,pcs,10,15,2,8', 'Oil,ዘይት,222,l,90,120,1,4', 'Salt,ጨው,333,kg,5,8,1,3'),
    );

    expect(result.created).toBe(0);
    expect(result.failed.map((f) => [f.row, f.failure])).toEqual([
      [2, 'quota'],
      [3, 'quota'],
      [4, 'quota'],
    ]);
    expect(openingStock).toHaveBeenCalledTimes(1);
    expect(await db.products.count()).toBe(0);
  });
});
