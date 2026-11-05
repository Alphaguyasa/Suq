import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettings, saveCashClose, updateSettings } from '@/lib/db';
import { DEVICE_META_ID, getDevice, nextReceiptNo, registerDevice } from '@/lib/db/device';
import { db, clearAllTables } from '@/lib/db/schema';
import * as salesRepo from '@/lib/db/repositories/sales';
import * as stockRepo from '@/lib/db/repositories/stock';
import { TEST_SHOP, cartLine, freshDatabase, seedProduct } from '@/lib/db/test-helpers';
import { buildBackup } from './export';
import { RestoreError, canRestore, parseBackup, restoreBackup } from './restore';

/** A shop with history: two products, a sale, a void, a restock and a drawer count. */
async function exportedShop(): Promise<string> {
  await freshDatabase('A1');
  await updateSettings({ shop_name: 'Test Shop', shop_name_am: 'የሙከራ ሱቅ', printer_width: 58 });
  const water = await seedProduct();
  const bread = await seedProduct({ name: 'Bread', name_am: 'ዳቦ', barcode: '111', sell_price: 1000 });
  await stockRepo.openingStock({ productId: water.id, qty: 24 });
  await stockRepo.openingStock({ productId: bread.id, qty: 40 });
  await salesRepo.create([cartLine(water, 2), cartLine(bread, 3)], { method: 'cash', cash_received: 10000 });
  const second = await salesRepo.create([cartLine(bread, 1)], { method: 'telebirr' });
  await salesRepo.voidSale(second.id, 'wrong item');
  await stockRepo.restock({ productId: water.id, qty: 0.5 });
  await saveCashClose({
    periodFrom: '2026-11-05T00:00:00.000Z',
    periodTo: '2026-11-06T00:00:00.000Z',
    cashUp: { openingFloat: 10000, cashSales: 8000, expected: 18000, counted: 17500, variance: -500 },
  });
  return JSON.stringify(await buildBackup(db));
}

/** The phone that replaces the lost one: a different device, no data, nothing synced. */
async function freshTill(prefix = 'B1'): Promise<void> {
  await clearAllTables();
  await registerDevice({ shop_id: 'placeholder-shop', device_prefix: prefix });
}

// `any` because the tests reach into arbitrary rows of the file to break them on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BackupFile = Record<string, any>;

function edit(json: string, change: (file: BackupFile) => void): string {
  const file = JSON.parse(json) as BackupFile;
  change(file);
  return JSON.stringify(file);
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (cause) {
    if (cause instanceof RestoreError) return cause.code;
    throw cause;
  }
  return undefined;
}

async function snapshot() {
  const stock = await stockRepo.onHandAll();
  return {
    products: (await db.products.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    sales: await db.sales.orderBy('created_at').toArray(),
    items: (await db.sale_items.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    movements: (await db.stock_movements.toArray()).sort((a, b) => a.id.localeCompare(b.id)),
    closes: await db.cash_closes.toArray(),
    stock: [...stock].sort(),
  };
}

beforeEach(async () => {
  await freshDatabase();
});

describe('restoreBackup', () => {
  it('brings back every product, sale, line, movement and drawer count, with the same stock', async () => {
    const json = await exportedShop();
    const before = await snapshot();

    await freshTill();
    const ownDevice = (await getDevice()).device_id;
    const summary = await restoreBackup(parseBackup(json));

    expect(summary).toEqual({ products: 2, sales: 2, cashCloses: 1 });
    // Compared as JSON: a void stores its discount as -0, which a JSON file writes as 0.
    expect(JSON.parse(JSON.stringify(await snapshot()))).toEqual(JSON.parse(JSON.stringify(before)));

    // The render cache agrees with SUM(qty_delta).
    for (const [productId, onHand] of await stockRepo.onHandAll()) {
      expect(await stockRepo.cachedOnHand(productId)).toBe(onHand);
    }

    // The shop comes back; the device stays this one.
    const settings = await getSettings();
    expect(settings.shop_name_am).toBe('የሙከራ ሱቅ');
    expect(settings.printer_width).toBe(58);
    const meta = await getDevice();
    expect(meta.shop_id).toBe(TEST_SHOP);
    expect(meta.device_id).toBe(ownDevice);
    expect(meta.device_prefix).toBe('B1');
  });

  it('queues every synced row for push, with only known columns', async () => {
    const json = await exportedShop();
    await freshTill();
    await restoreBackup(parseBackup(json));

    const outbox = await db.outbox.toArray();
    const expected =
      (await db.products.count()) +
      (await db.sales.count()) +
      (await db.sale_items.count()) +
      (await db.stock_movements.count());
    expect(outbox).toHaveLength(expected);
    // Parents queued before their children.
    expect(outbox[0]?.table).toBe('products');
    expect(outbox.at(-1)?.table).toBe('stock_movements');
    // Drawer counts are local only.
    expect(outbox.some((entry) => (entry.table as string) === 'cash_closes')).toBe(false);
  });

  it('drops unknown keys a hand-edited file carries', async () => {
    const json = edit(await exportedShop(), (file) => {
      file.products[0].evil_column = 'x';
    });
    await freshTill();
    await restoreBackup(parseBackup(json));

    for (const product of await db.products.toArray()) expect(product).not.toHaveProperty('evil_column');
    for (const entry of await db.outbox.toArray()) expect(entry.payload).not.toHaveProperty('evil_column');
  });

  it('continues receipt numbers past restored ones when the old prefix is kept', async () => {
    const json = await exportedShop();
    await freshTill('A1');
    await restoreBackup(parseBackup(json));
    // A1-000001 and -000002 were sales, -000003 the void.
    expect(await nextReceiptNo()).toBe('A1-000004');
  });

  it('restores a v1 file written before drawer counts existed', async () => {
    const json = edit(await exportedShop(), (file) => {
      delete file.cash_closes;
    });
    await freshTill();
    expect((await restoreBackup(parseBackup(json))).cashCloses).toBe(0);
    expect(await db.sales.count()).toBe(3);
  });

  it('refuses a till that already holds data, and writes nothing', async () => {
    const json = await exportedShop();
    await freshTill();
    await seedProduct({ barcode: '999' });
    const outboxBefore = await db.outbox.count();

    expect(await canRestore()).toBe(false);
    await expect(restoreBackup(parseBackup(json))).rejects.toMatchObject({ code: 'notEmpty' });
    expect(await db.products.count()).toBe(1);
    expect(await db.sales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(outboxBefore);
  });

  it('refuses a till that already pulled another shop', async () => {
    const json = await exportedShop();
    await freshTill();
    await db.device_meta.update(DEVICE_META_ID, { last_pull_at: '2026-11-05T08:00:00.000Z' });

    await expect(restoreBackup(parseBackup(json))).rejects.toMatchObject({ code: 'notEmpty' });
    expect((await getDevice()).shop_id).toBe('placeholder-shop');
  });

  it('leaves nothing half-written when a write fails part way', async () => {
    const json = await exportedShop();
    await freshTill();
    const parsed = parseBackup(json);
    const spy = vi.spyOn(db.stock_movements, 'bulkPut').mockRejectedValueOnce(new Error('QuotaExceededError'));

    await expect(restoreBackup(parsed)).rejects.toThrow('QuotaExceededError');
    spy.mockRestore();

    expect(await canRestore()).toBe(true);
    expect(await db.products.count()).toBe(0);
    expect(await db.sales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await getDevice()).shop_id).toBe('placeholder-shop');
    expect((await getSettings()).shop_name_am).toBe('');
  });
});

describe('parseBackup', () => {
  it('refuses a file that is not a Suq backup', () => {
    expect(codeOf(() => parseBackup('not json'))).toBe('notBackup');
    expect(codeOf(() => parseBackup('{"format":"other","version":1}'))).toBe('notBackup');
    expect(codeOf(() => parseBackup('[]'))).toBe('notBackup');
  });

  it('refuses a backup from a newer version of the app', async () => {
    const json = edit(await exportedShop(), (file) => {
      file.version = 2;
    });
    expect(codeOf(() => parseBackup(json))).toBe('newerVersion');
  });

  it('stores timestamps in the canonical form whatever form the file used', async () => {
    const json = edit(await exportedShop(), (file) => {
      file.sales[0].created_at = '2026-11-05T08:00:00.1+00:00';
    });
    expect(parseBackup(json).sales[0]?.created_at).toBe('2026-11-05T08:00:00.100Z');
  });

  it('refuses a backup with nothing in it', async () => {
    await freshDatabase();
    expect(codeOf(() => parseBackup(''))).toBe('notBackup');
    const empty = JSON.stringify(await buildBackup(db));
    expect(codeOf(() => parseBackup(empty))).toBe('empty');
  });

  it.each([
    ['money that is not integer cents', (f: BackupFile) => (f.sales[0].total = 12.5)],
    ['money written as text', (f: BackupFile) => (f.products[0].sell_price = '25.00')],
    ['a row without an id', (f: BackupFile) => delete f.sale_items[0].id],
    ['a duplicate id', (f: BackupFile) => f.products.push(f.products[0])],
    ['a line whose sale is missing', (f: BackupFile) => (f.sale_items[0].sale_id = 'nope')],
    ['a row of another shop', (f: BackupFile) => (f.stock_movements[0].shop_id = 'other')],
    ['an unknown payment method', (f: BackupFile) => (f.sales[0].payment_method = 'bitcoin')],
    ['a movement of zero', (f: BackupFile) => (f.stock_movements[0].qty_delta = 0)],
    ['a broken timestamp', (f: BackupFile) => (f.sales[0].created_at = 'yesterday')],
    ['a table that is not a list', (f: BackupFile) => (f.sales = {})],
    ['a bad drawer count', (f: BackupFile) => (f.cash_closes[0].counted = null)],
    ['a bad printer width', (f: BackupFile) => (f.shop_settings.printer_width = 100)],
  ])('refuses %s', async (_label, breakIt) => {
    const json = edit(await exportedShop(), breakIt);
    expect(codeOf(() => parseBackup(json))).toBe('invalid');
  });
});
