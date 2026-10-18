import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { CASHIER, PRODUCTS, pay, readLocal, scan, setupShop, t, waitForServiceWorker } from './helpers';

/**
 * context.setOffline() does not reliably cover requests the service worker
 * makes itself: in Chromium they can still reach the server, so a page that
 * is not precached passes anyway. Refuse every request to the app's own
 * origin as well, so only what the worker holds can be served.
 */
async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route(/^http:\/\/localhost:\d+\//, (route) => route.abort('internetdisconnected'));
}

/** A full load shows the PIN lock on whatever page it lands on, not just the sale screen. */
async function unlockHere(page: Page): Promise<void> {
  await page.getByRole('button', { name: CASHIER.name }).click();
  for (const digit of CASHIER.pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(page.getByRole('button', { name: CASHIER.name })).toHaveCount(0);
}

/**
 * The step right after the wifi goes off in the demo: "Sale complete A1-000001"
 * is a link to the receipt. Receipts and product pages used to be dynamic
 * routes (/sales/<id>), which the service worker could not precache, so
 * offline they fell through to the /offline page. They are now static shells
 * that read the id from the query string, and these tests keep them that way.
 */
test('offline, a fresh sale opens its receipt and can be voided', async ({ context, page }) => {
  await setupShop(page);
  await waitForServiceWorker(page);

  // The demo: the app is launched in airplane mode and the cashier unlocks once.
  await goOffline(context);
  await page.reload();
  await unlockHere(page);

  await scan(page, [PRODUCTS[0].barcode]);
  const receiptNo = await pay(page);

  await page.getByRole('link', { name: new RegExp(t.sell.completed) }).click();

  await expect(page.getByText(t.offline.body)).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.sales.print })).toBeVisible();
  await expect(page.getByText(receiptNo).first()).toBeVisible();

  // Offline, a tap can become a full page load. The shell must come from the
  // precache, and the cashier who just unlocked must not be asked again.
  await page.reload();
  await expect(page.getByRole('button', { name: CASHIER.name })).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.sales.print })).toBeVisible();

  await page.getByRole('button', { name: t.sales.void }).click();
  await page.locator('#void-reason').fill('ስህተት');
  await page.getByRole('button', { name: t.sales.void }).click();
  await expect(page.getByText(t.sales.voidedAs)).toBeVisible();

  // The void is a new, appended sale row; the original is untouched.
  const sales = await readLocal<{ receipt_no: string; voids_sale_id: string | null }>(page, 'sales');
  expect(sales).toHaveLength(2);
  expect(sales.filter((s) => s.voids_sale_id !== null)).toHaveLength(1);

  // The "voided as" link leads to the void receipt, still offline.
  await page.getByRole('link', { name: /^[A-Z0-9]+-\d{6}$/ }).click();
  await expect(page.getByText(t.offline.body)).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.sales.print })).toBeVisible();
});

test('offline, a product opens for editing and its stock page takes a restock', async ({
  context,
  page,
}) => {
  await setupShop(page);
  await waitForServiceWorker(page);

  await goOffline(context);
  await page.goto('/products');
  await unlockHere(page);

  await page.getByRole('link', { name: new RegExp(PRODUCTS[1].name_am) }).click();
  await expect(page.getByText(t.offline.body)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: t.products.edit })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: CASHIER.name })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: t.products.edit })).toBeVisible();

  await page.getByRole('link', { name: new RegExp(t.stock.title) }).click();
  await expect(page.getByText(t.offline.body)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: t.stock.title, exact: true })).toBeVisible();

  await page.locator('#r-qty').fill('6');
  await page.getByRole('button', { name: t.stock.restock }).click();
  await expect(page.locator('#r-qty')).toHaveValue('');

  const movements = await readLocal<{ qty_delta: number; reason: string }>(page, 'stock_movements');
  expect(movements.filter((m) => m.reason === 'purchase').map((m) => m.qty_delta)).toEqual([6]);
});

test('old /sales/<id> and /products/<id> links still land on the right page', async ({ page }) => {
  await setupShop(page);

  const [product] = await readLocal<{ id: string }>(page, 'products');
  await page.goto(`/products/${product!.id}`);
  await expect(page).toHaveURL(`/products/edit?id=${product!.id}`);

  await page.goto(`/products/${product!.id}/stock`);
  await expect(page).toHaveURL(`/products/stock?id=${product!.id}`);

  await page.goto('/sales/00000000-0000-4000-8000-000000000000');
  await expect(page).toHaveURL('/sales/view?id=00000000-0000-4000-8000-000000000000');
});
