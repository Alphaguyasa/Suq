import { expect, test } from '@playwright/test';
import { PRODUCTS, readLocal, setupShop, t } from './helpers';

/**
 * An owner changes a price, then opens the product again and sees the
 * earlier price, the new one and who changed it. Works with no network: the
 * log is written on the till in the same transaction as the edit.
 */
test('a price edit shows up in the product price history', async ({ page }, testInfo) => {
  await setupShop(page);

  const products = await readLocal<{ id: string; barcode: string }>(page, 'products');
  const sugar = products.find((product) => product.barcode === PRODUCTS[2].barcode)!;

  await page.goto(`/products/edit?id=${sugar.id}`);
  await expect(page.getByTestId('price-history-empty')).toHaveText(t.priceHistory.empty);

  await page.locator('#f-sell').fill('125.00');
  await page.getByRole('button', { name: t.common.save }).click();
  await page.waitForURL('**/products');

  await page.goto(`/products/edit?id=${sugar.id}`);
  const history = page.getByTestId('price-history');
  await expect(history).toContainText(t.priceHistory.sell);
  await expect(history).toContainText('120.00');
  await expect(history).toContainText('125.00');
  await expect(history).toContainText(t.priceHistory.by('አበበ'));

  const log = await readLocal<{ old_sell_price: number; new_sell_price: number }>(page, 'price_changes');
  expect(log).toEqual([expect.objectContaining({ old_sell_price: 12000, new_sell_price: 12500 })]);

  await page.goto('/reports');
  const period = page.getByTestId('period-price-changes');
  await expect(period).toContainText(PRODUCTS[2].name_am);
  await expect(period).toContainText('125.00');
  await page.setViewportSize({ width: 360, height: 900 });
  await period.screenshot({ path: testInfo.outputPath('reports-price-changes-360.png') });

  await page.goto(`/products/edit?id=${sugar.id}`);
  await page.setViewportSize({ width: 360, height: 900 });
  await history.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('price-history-360.png'), fullPage: true });
});
