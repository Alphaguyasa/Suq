import { expect, test } from '@playwright/test';
import { formatETB } from '../lib/format';
import { PRODUCTS, pay, scan, setupShop, t } from './helpers';

/**
 * Reports shows what the shelf is worth, from on-hand stock, and the figure
 * moves when a sale takes goods off the shelf.
 */
test('Reports shows the stock value at cost and at selling price', async ({ page }) => {
  await setupShop(page);
  // The setup CSV prices each product's cost 5 birr under its selling price.
  const atCost = (sold: number) =>
    PRODUCTS.reduce((sum, p, i) => sum + (p.opening - (i === 0 ? sold : 0)) * (p.price - 500), 0);
  const atSell = (sold: number) =>
    PRODUCTS.reduce((sum, p, i) => sum + (p.opening - (i === 0 ? sold : 0)) * p.price, 0);

  await page.goto('/reports');
  const section = page.getByRole('region', { name: t.reports.stockValue });
  await expect(section).toContainText(formatETB(atCost(0)));
  await expect(section).toContainText(formatETB(atSell(0)));

  await page.goto('/');
  await scan(page, [PRODUCTS[0].barcode]);
  await pay(page);

  await page.goto('/reports');
  await expect(section).toContainText(formatETB(atCost(1)));
  await expect(section).toContainText(formatETB(atSell(1)));
});
