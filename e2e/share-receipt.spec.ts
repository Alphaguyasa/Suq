import { expect, test } from '@playwright/test';
import { CASHIER, PRODUCTS, goOffline, pay, scan, setupShop, t, unlock, waitForServiceWorker } from './helpers';

/**
 * For a shop with no thermal printer: the receipt goes to the customer's
 * Telegram through the phone's share sheet, offline too. Headless Chromium
 * has no share sheet, so the test stands one in and reads what it was given.
 */
test('offline, a receipt is shared as text', async ({ context, page }) => {
  await context.addInitScript(() => {
    const shared: ShareData[] = [];
    (window as unknown as { __shared: ShareData[] }).__shared = shared;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        shared.push(data);
      },
    });
  });

  await setupShop(page);
  await waitForServiceWorker(page);
  // Launched in airplane mode, as in the demo; the cashier unlocks once.
  await goOffline(context);
  await page.reload();
  await unlock(page);

  await scan(page, [PRODUCTS[0].barcode, PRODUCTS[2].barcode]);
  const receiptNo = await pay(page);
  await page.getByRole('link', { name: new RegExp(t.sell.completed) }).click();

  await page.getByRole('button', { name: t.sales.share }).click();

  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]?.title).toBe(receiptNo);
  const text = shared[0]?.text ?? '';
  expect(text).toContain('የሙከራ ሱቅ');
  expect(text).toContain(receiptNo);
  expect(text).toContain(`${t.receipt.cashier}: ${CASHIER.name}`);
  expect(text).toContain(PRODUCTS[0].name_am);
  expect(text).toContain(`${t.sell.total}: 145.00 ${t.money.currency}`);
});
