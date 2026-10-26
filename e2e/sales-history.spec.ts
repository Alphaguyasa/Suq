import { expect, test } from '@playwright/test';
import { PRODUCTS, pay, scan, setupShop, t } from './helpers';

/**
 * History and reports read through the created_at index (ROADMAP 26), not the
 * whole table: the sales of today must still all be there, searchable, voids
 * marked, and the report must count them.
 */
test('sales history and today’s report show the day’s sales, searchable', async ({ page }) => {
  await setupShop(page);

  await scan(page, [PRODUCTS[0].barcode]);
  const first = await pay(page);
  await scan(page, [PRODUCTS[1].barcode]);
  const second = await pay(page);

  // In-app navigation, as a cashier would: Reports, then its link to Sales.
  await page.getByRole('link', { name: t.nav.reports }).click();
  await expect(page.getByText(PRODUCTS[0].name_am).first()).toBeVisible();
  await expect(page.getByText(PRODUCTS[1].name_am).first()).toBeVisible();

  await page.getByRole('link', { name: t.sales.title }).click();
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText(second, { exact: true })).toBeVisible();
  await expect(page.getByText(t.sales.saleCount(2))).toBeVisible();
  // Two sales are one page: nothing older to load.
  await expect(page.getByRole('button', { name: t.sales.showMore })).toHaveCount(0);

  await page.getByRole('searchbox', { name: t.sales.searchPlaceholder }).fill(first.slice(-2));
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText(second, { exact: true })).toHaveCount(0);
});
