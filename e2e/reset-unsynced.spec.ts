import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { E2E_SUPABASE_URL } from '../playwright.config';
import { FakeSupabase } from './fake-supabase';
import { PRODUCTS, pay, scan, setupShop, syncPill, t } from './helpers';

/**
 * Reset is the one action that can destroy sales for good: whatever is still
 * in the outbox exists nowhere else. Settings must say how much that is, and
 * hand over a backup right there, before the shop name is typed.
 */
test('reset says what has not synced and offers the backup first', async ({ context, page }) => {
  const server = new FakeSupabase(E2E_SUPABASE_URL);
  await server.install(context);
  await setupShop(page);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 });

  // Everything reached the server: nothing to lose, and no backup nagging.
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');
  await expect(page.getByTestId('reset-all-synced')).toHaveText(t.settings.resetAllSynced);
  await expect(page.getByTestId('reset-unsynced')).toHaveCount(0);

  // An offline sale: the sale, its line and its stock movement are only here.
  server.offline = true;
  await context.setOffline(true);
  await page.locator('a[href="/"]').first().click();
  await page.waitForURL((url) => url.pathname === '/');
  await scan(page, [PRODUCTS[0].barcode]);
  const receiptNo = await pay(page);

  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');
  const warning = page.getByTestId('reset-unsynced');
  await expect(warning).toContainText(t.settings.resetUnsynced(3, 1));

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    warning.getByRole('button', { name: t.settings.resetBackupFirst }).click(),
  ]);
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    sales: { receipt_no: string }[];
  };
  expect(backup.sales.map((sale) => sale.receipt_no)).toContain(receiptNo);
  await expect(page.getByTestId('reset-backup-result')).toHaveText(t.settings.backupDone(1, PRODUCTS.length));

  // Back online, the push drains the outbox and the warning goes away on its own.
  server.offline = false;
  await context.setOffline(false);
  await expect(page.getByTestId('reset-all-synced')).toBeVisible({ timeout: 30_000 });
  expect(server.rows('sales').map((sale) => sale.receipt_no)).toContain(receiptNo);

  // The reset itself still works the same way.
  await page.locator('#reset-confirm').fill('የሙከራ ሱቅ');
  await page.getByRole('button', { name: t.settings.resetDevice }).click();
  await page.waitForURL('**/setup');
});
