import { expect, test } from '@playwright/test';
import { CASHIER, PRODUCTS, coldLaunch, goOffline, pay, scan, setupShop, t, unlock, waitForServiceWorker } from './helpers';

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
  await coldLaunch(page);
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

/**
 * The owner is not always in the shop: the day's cash-up goes to them on
 * Telegram the same way, offline too, with what the cashier counted.
 */
test('offline, the cash-up is shared as text', async ({ context, page }) => {
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
  await goOffline(context);
  await coldLaunch(page);
  await unlock(page);

  await scan(page, [PRODUCTS[0].barcode, PRODUCTS[2].barcode]);
  await pay(page);

  await page.goto('/reports');
  await page.getByLabel(t.reports.openingFloat, { exact: true }).fill('500');
  await page.getByLabel(t.reports.countedDrawer, { exact: true }).fill('640');
  await page.getByRole('button', { name: t.reports.shareCashUp }).click();

  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]?.title).toBe(`${t.reports.cashUp} · ${t.reports.today}`);
  const text = shared[0]?.text ?? '';
  expect(text).toContain('የሙከራ ሱቅ');
  expect(text).toContain(`${t.reports.netSales}: 145.00 ${t.money.currency}`);
  expect(text).toContain(`${t.reports.transactions}: 1`);
  expect(text).toContain(`${t.reports.expectedDrawer}: 645.00`);
  expect(text).toContain(`${t.reports.variance}: 5.00 ${t.reports.short}`);
});

/**
 * The day's sales summary goes to the owner's own Telegram the same way, so
 * they see how the shop did without opening the till.
 */
test('offline, the sales summary is shared as text', async ({ context, page }) => {
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
  await goOffline(context);
  await coldLaunch(page);
  await unlock(page);

  await scan(page, [PRODUCTS[0].barcode, PRODUCTS[2].barcode]);
  await pay(page);

  await page.goto('/reports');
  await page.getByRole('button', { name: t.reports.shareSummary }).click();

  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]?.title).toBe(`${t.reports.summaryTitle} · ${t.reports.today}`);
  const text = shared[0]?.text ?? '';
  expect(text).toContain('የሙከራ ሱቅ');
  expect(text).toContain(`${t.reports.netSales}: 145.00 ${t.money.currency}`);
  expect(text).toContain(`${t.reports.transactions}: 1`);
  expect(text).toContain(
    `${t.reports.topProducts}\n1. ${PRODUCTS[2].name_am}: 120.00\n2. ${PRODUCTS[0].name_am}: 25.00`,
  );
});

/**
 * What to order goes to the supplier the same way: the products at or below
 * their reorder level, with what is on hand, offline.
 */
test('offline, the reorder list is shared as text', async ({ context, page }) => {
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
  await goOffline(context);
  await coldLaunch(page);
  await unlock(page);

  // Sugar opens at 10 with a reorder level of 5: selling 6 leaves 4.
  const sugar = PRODUCTS[2];
  await scan(page, Array(6).fill(sugar.barcode));
  await pay(page);

  await page.goto('/reports');
  await page.getByRole('button', { name: t.reports.shareReorder }).click();

  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]?.title).toBe(t.reports.reorderTitle);
  const text = shared[0]?.text ?? '';
  expect(text).toContain('የሙከራ ሱቅ');
  expect(text).toContain(
    `${sugar.name_am}: ${t.products.onHand} 4 ${t.units.pcs} · ${t.productForm.reorderLevel} 5`,
  );
  // Water and bread are well stocked.
  expect(text).not.toContain(PRODUCTS[0].name_am);
  expect(text).not.toContain(PRODUCTS[1].name_am);
});
