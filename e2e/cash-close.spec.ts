import { expect, test } from '@playwright/test';
import {
  PRODUCTS,
  coldLaunch,
  goOffline,
  pay,
  scan,
  searchBox,
  setupShop,
  t,
  unlock,
  waitForServiceWorker,
} from './helpers';

/**
 * ROADMAP item 30. The drawer count used to vanish with the page; now it is
 * saved on the till (offline too), survives a cold launch, and a recount is a
 * second record rather than an edit of the first.
 */
test('offline, the drawer count is saved and still listed after a cold launch', async ({ context, page }) => {
  await setupShop(page);
  await waitForServiceWorker(page);
  await goOffline(context);
  await coldLaunch(page);
  await unlock(page);

  await scan(page, [PRODUCTS[0].barcode, PRODUCTS[2].barcode]);
  await pay(page);

  await page.goto('/reports');
  const save = page.getByRole('button', { name: t.reports.saveClose });
  const closes = page.getByTestId('cash-close');

  await expect(page.getByText(t.reports.noCloses)).toBeVisible();
  await expect(save, 'nothing counted yet').toBeDisabled();
  await expect(page.getByText(t.reports.countFirst)).toBeVisible();

  await page.getByLabel(t.reports.openingFloat, { exact: true }).fill('500');
  await page.getByLabel(t.reports.countedDrawer, { exact: true }).fill('640');
  await save.click();

  await expect(page.getByText(t.reports.closeSaved)).toBeVisible();
  await expect(closes).toHaveCount(1);
  await expect(closes.first()).toContainText(`5.00 ${t.reports.short}`);
  await expect(save, 'the same figures are not saved twice').toBeDisabled();

  // A recount is a new record; the shortfall stays on file.
  await page.getByLabel(t.reports.countedDrawer, { exact: true }).fill('645');
  await save.click();
  await expect(closes).toHaveCount(2);
  await expect(closes.first()).toContainText(t.reports.balanced);
  await expect(closes.nth(1)).toContainText(`5.00 ${t.reports.short}`);

  // Settle on the sale screen first: a cold launch from mid-navigation races
  // the lock's own session write.
  await page.goto('/');
  await expect(searchBox(page)).toBeVisible();
  await coldLaunch(page);
  await unlock(page);
  await page.goto('/reports');
  await expect(closes).toHaveCount(2);
});
