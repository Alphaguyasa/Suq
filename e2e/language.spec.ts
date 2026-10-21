import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CASHIER, setupShop } from './helpers';
import { en } from '../lib/i18n/en';

/** Setup never unlocks, so the first reload shows the PIN lock (on /settings, not the till). */
async function unlockOnSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: CASHIER.name }).click();
  for (const digit of CASHIER.pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
}

/**
 * The language picked in Settings is a device setting: it must survive a
 * reload (and so a cold launch of the installed app), and <html lang> must
 * follow it so screen readers and the browser's hyphenation use the right one.
 */
test('the language choice survives a reload', async ({ page }) => {
  await setupShop(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');

  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');
  await page.locator('#lang').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  // The very first screen after the reload, the PIN lock, is already in English.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.lock.title);
  await unlockOnSettings(page);
  await expect(page.locator('#lang')).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.locator('#lang').selectOption('am');
  // This tab has unlocked once now, so it remembers the cashier: no PIN this time.
  await page.reload();
  await expect(page.locator('#lang')).toHaveValue('am');
  await expect(page.locator('html')).toHaveAttribute('lang', 'am');
});
