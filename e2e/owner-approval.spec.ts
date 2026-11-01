import { expect, test } from '@playwright/test';
import { CASHIER, PRODUCTS, pay, readLocal, scan, searchBox, setupShop, t } from './helpers';

/**
 * ROADMAP item 32. Whoever sets the till up is the owner. A second cashier can
 * sell, but a void needs the owner's PIN typed into the void form itself; the
 * owner, unlocked as themselves, is never asked. And the owner cannot be
 * removed, or nobody would be left to approve.
 */
const HELPER = { name: 'ሰላም', pin: '5678' };

test('a cashier needs the owner PIN to void; the owner does not', async ({ page }) => {
  await setupShop(page);

  // Client-side navigation throughout: a full page load would bring back the PIN lock.
  await page.getByRole('link', { name: t.nav.settings }).first().click();
  await expect(page.getByText(t.settings.ownerBadge)).toHaveCount(1);
  await page.locator('#cashier-name').fill(HELPER.name);
  await page.locator('#cashier-pin').fill(HELPER.pin);
  await page.getByRole('button', { name: t.settings.addCashier }).click();
  await expect(page.getByText(HELPER.name, { exact: true })).toBeVisible();

  // The owner cannot be removed.
  const ownerRow = page.getByRole('listitem').filter({ hasText: CASHIER.name });
  await ownerRow.getByRole('button', { name: t.settings.removeCashier }).click();
  await expect(page.getByTestId('last-owner')).toHaveText(t.settings.lastOwner);
  expect(await readLocal(page, 'cashiers')).toHaveLength(2);

  // Hand the till to the helper.
  await page.getByRole('button', { name: t.lock.lockNow }).first().click();
  await page.getByRole('button', { name: HELPER.name }).click();
  for (const digit of HELPER.pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('link', { name: t.nav.sell }).first().click();
  await expect(searchBox(page)).toBeVisible();

  await scan(page, [PRODUCTS[0].barcode]);
  await pay(page);
  await page.getByRole('link', { name: new RegExp(t.sell.completed) }).click();

  await page.getByRole('button', { name: t.sales.void }).click();
  await page.locator('#void-reason').fill('ስህተት');
  const ownerPin = page.locator('#void-owner-pin');
  await expect(ownerPin).toBeVisible();

  // The helper's own PIN is not the owner's: nothing is written.
  await ownerPin.fill(HELPER.pin);
  await page.getByRole('button', { name: t.sales.void }).click();
  await expect(page.getByText(t.lock.wrongOwnerPin)).toBeVisible();
  await expect(page.locator('#void-reason')).toHaveValue('ስህተት');
  expect(await readLocal(page, 'sales')).toHaveLength(1);

  await ownerPin.fill(CASHIER.pin);
  await page.getByRole('button', { name: t.sales.void }).click();
  await expect(page.getByText(t.sales.voidedAs)).toBeVisible();
  expect(await readLocal(page, 'sales')).toHaveLength(2);
});

test('the owner voids without being asked for a PIN again', async ({ page }) => {
  await setupShop(page);
  await scan(page, [PRODUCTS[1].barcode]);
  await pay(page);
  await page.getByRole('link', { name: new RegExp(t.sell.completed) }).click();

  await page.getByRole('button', { name: t.sales.void }).click();
  await expect(page.locator('#void-reason')).toBeVisible();
  await expect(page.locator('#void-owner-pin')).toHaveCount(0);
  await page.locator('#void-reason').fill('ስህተት');
  await page.getByRole('button', { name: t.sales.void }).click();
  await expect(page.getByText(t.sales.voidedAs)).toBeVisible();
});
