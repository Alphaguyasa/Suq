import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  CASHIER,
  PRODUCTS,
  goOffline,
  pay,
  readLocal,
  scan,
  searchBox,
  setupShop,
  t,
  waitForServiceWorker,
} from './helpers';

interface Row {
  id: string;
  receipt_no?: string;
  product_id?: string;
  on_hand?: number;
}

const ids = (rows: Row[]) => rows.map((row) => row.id).sort();

/**
 * The phone with the till on it is lost or replaced, and the shop never
 * signed in to sync. The JSON backup from Settings is the only copy, and a new
 * phone must take it back offline: same products, same sales, same stock,
 * and new receipts that do not repeat the old ones.
 */
test('a JSON backup restores onto a fresh till, offline, and the till sells on', async ({ browser, page }) => {
  // The old phone: set up, sell, back up.
  await setupShop(page);
  const [water, bread] = PRODUCTS;
  await scan(page, [water.barcode, bread.barcode]);
  const firstReceipt = await pay(page);
  await scan(page, [water.barcode]);
  await pay(page);

  const oldSales = await readLocal<Row>(page, 'sales');
  const oldItems = await readLocal<Row>(page, 'sale_items');
  const oldMovements = await readLocal<Row>(page, 'stock_movements');
  const oldStock = await readLocal<Row>(page, 'stock_cache');

  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: t.settings.backupJson }).click(),
  ]);
  const backupJson = await readFile((await download.path())!, 'utf8');

  // The new phone: its own storage, opened once online, then no network at all.
  const phone = await browser.newContext();
  const fresh = await phone.newPage();
  await fresh.goto('/');
  await fresh.waitForURL('**/setup');
  await waitForServiceWorker(fresh);
  await goOffline(phone);

  const restore = fresh.getByLabel(t.setup.restoreFile);

  // A file that is not a backup is refused and changes nothing.
  await restore.setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(fresh.getByTestId('restore-error')).toHaveText(t.setup.restoreErrors.notBackup);
  expect(await readLocal(fresh, 'products')).toHaveLength(0);

  await restore.setInputFiles({ name: 'suq-A1.json', mimeType: 'application/json', buffer: Buffer.from(backupJson) });
  await expect(fresh.getByTestId('restore-summary')).toHaveText(t.setup.restored(PRODUCTS.length, 2));
  // The shop details came back into step 1, and the offer is gone.
  await expect(fresh.locator('#s-name-am')).toHaveValue('የሙከራ ሱቅ');
  await expect(restore).toHaveCount(0);

  // Same history, same stock, every synced row queued for the first sign-in.
  expect(ids(await readLocal<Row>(fresh, 'sales'))).toEqual(ids(oldSales));
  expect(ids(await readLocal<Row>(fresh, 'sale_items'))).toEqual(ids(oldItems));
  expect(ids(await readLocal<Row>(fresh, 'stock_movements'))).toEqual(ids(oldMovements));
  const stockOf = (rows: Row[]) => rows.map((row) => `${row.product_id}:${row.on_hand}`).sort();
  expect(stockOf(await readLocal<Row>(fresh, 'stock_cache'))).toEqual(stockOf(oldStock));
  expect(await readLocal(fresh, 'outbox')).toHaveLength(
    PRODUCTS.length + oldSales.length + oldItems.length + oldMovements.length,
  );

  // The rest of setup as on any new till: its own code, the owner again.
  await fresh.getByRole('button', { name: t.setup.next }).click();
  // The old phone's code is on the restored receipts: setup warns, so a phone
  // that still sells offline does not end up sharing numbers with this one.
  const oldPrefix = firstReceipt.split('-')[0]!;
  await fresh.locator('#s-prefix').fill(oldPrefix);
  await expect(fresh.getByText(t.settings.devicePrefixInUse)).toBeVisible();
  await fresh.locator('#s-prefix').fill('B1');
  await expect(fresh.getByText(t.settings.devicePrefixInUse)).toHaveCount(0);
  await fresh.getByRole('button', { name: t.setup.next }).click();
  await fresh.locator('#s-cashier').fill(CASHIER.name);
  await fresh.locator('#s-pin').fill(CASHIER.pin);
  await fresh.getByRole('button', { name: t.setup.next }).click();
  await fresh.getByRole('button', { name: t.setup.finish }).click();
  await fresh.waitForURL((url) => url.pathname === '/');
  await expect(searchBox(fresh)).toBeVisible();

  // Restored products sell, and the old receipt is still findable.
  await scan(fresh, [bread.barcode]);
  expect(await pay(fresh)).toBe('B1-000001');
  const receipts = (await readLocal<Row>(fresh, 'sales')).map((sale) => sale.receipt_no);
  expect(receipts).toContain(firstReceipt);
  expect(receipts).toHaveLength(3);

  await phone.close();
});
