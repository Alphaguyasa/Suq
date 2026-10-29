import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  CASHIER,
  PRODUCTS,
  coldLaunch,
  forgetUnlock,
  goOffline,
  pay,
  readLocal,
  scan,
  setupShop,
  t,
  waitForServiceWorker,
} from './helpers';

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
  await coldLaunch(page);
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
  await forgetUnlock(page);
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

/**
 * The demo straight after setup: the owner who just chose the PIN goes
 * offline, sells, and taps "Sale complete". Offline that tap can be a full
 * page load, and it used to land on the PIN lock because setup never
 * unlocked anyone. The sale must also record who rang it up.
 */
test('right after setup, offline, a sale opens its receipt without asking for the PIN', async ({
  context,
  page,
}) => {
  await setupShop(page);
  await waitForServiceWorker(page);
  await goOffline(context);

  await scan(page, [PRODUCTS[1].barcode]);
  const receiptNo = await pay(page);
  await page.getByRole('link', { name: new RegExp(t.sell.completed) }).click();
  await page.waitForURL('**/sales/view?id=*');
  await expect(page.getByRole('button', { name: t.sales.print })).toBeVisible();
  await expect(page.getByRole('button', { name: CASHIER.name })).toHaveCount(0);

  // Then the full page load a weak connection can turn any tap into.
  await page.reload();
  await expect(page.getByRole('button', { name: CASHIER.name })).toHaveCount(0);
  await expect(page.getByText(t.offline.body)).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.sales.print })).toBeVisible();
  await expect(page.getByText(receiptNo).first()).toBeVisible();

  const [sale] = await readLocal<{ cashier_name: string }>(page, 'sales');
  expect(sale?.cashier_name).toBe(CASHIER.name);
});
