import { expect, test } from '@playwright/test';
import { readLocal, setupShop } from './helpers';

/**
 * Project rule: persistent storage is requested on first run and the result
 * is shown in Settings. Whether headless Chromium grants it is the browser's
 * call, so this asserts that it was asked, recorded, and shown — not which
 * way it went.
 */
test('first run requests persistent storage and Settings shows the result', async ({ page }) => {
  await setupShop(page);

  await expect
    .poll(async () => {
      const [meta] = await readLocal<{ storage_persist?: string }>(page, 'device_meta');
      return meta?.storage_persist;
    })
    .toMatch(/^(granted|denied|unsupported)$/);

  // Client-side navigation, the way a cashier gets there.
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');
  const status = page.getByTestId('storage-persist');
  await expect(status).toHaveAttribute('data-state', /^(granted|denied|unsupported)$/);
  await expect(status).not.toBeEmpty();
});
