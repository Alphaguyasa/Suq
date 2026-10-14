import { expect, test } from '@playwright/test';
import { PRODUCTS, pay, readLocal, scan, searchBox, setupShop, syncPill, unlock, waitForServiceWorker } from './helpers';

/**
 * The PWA promise: once the app has loaded, a cold launch in airplane mode
 * still reaches a working sale screen and can complete a sale. No Supabase at
 * all in this test — a till that never signs in must work just the same.
 */
test('a cold launch with no network reaches the sale screen and completes a sale', async ({
  context,
  page,
}) => {
  await setupShop(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();

  await unlock(page);
  await expect(searchBox(page)).toBeVisible();
  await expect(syncPill(page)).toHaveAttribute('data-state', 'offline');

  await scan(page, [PRODUCTS[0].barcode, PRODUCTS[2].barcode]);
  const receiptNo = await pay(page);
  expect(receiptNo).toBe('A1-000001');

  const sales = await readLocal<{ receipt_no: string; total: number }>(page, 'sales');
  expect(sales).toHaveLength(1);
  // Integer cents end to end.
  expect(sales[0]?.total).toBe(PRODUCTS[0].price + PRODUCTS[2].price);
});
