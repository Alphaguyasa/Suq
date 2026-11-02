import { expect, test } from '@playwright/test';
import { E2E_SUPABASE_URL } from '../playwright.config';
import { FakeSupabase } from './fake-supabase';
import { CASHIER, coldLaunch, goOffline, goOnline, readLocal, searchBox, setupShop, syncPill, t } from './helpers';

/**
 * ROADMAP item 43. PINs are local and never synced, so a shop whose only owner
 * forgets theirs could not approve a reset or a price change, or even unlock
 * the till. The shop owner's Supabase account vouches for them instead: the
 * password is typed again and checked online, and the account must be the
 * owner of this shop.
 */
const NEW_PIN = '2468';
const HELPER = { name: 'ሰላም', pin: '5678' };

async function typePin(page: import('@playwright/test').Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
}

test('the shop owner sets a new PIN from the lock screen with their account', async ({ context, page }) => {
  const server = new FakeSupabase(E2E_SUPABASE_URL);
  await server.install(context);
  await setupShop(page);
  // Connected to the shop (shop_id adopted) before anything is checked against it.
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 });

  await coldLaunch(page);
  await page.getByRole('button', { name: t.settings.forgotOwnerPin }).click();
  const result = page.getByTestId('lock-recover-result');

  // A wrong password changes nothing.
  await page.locator('#lock-recover-email').fill('owner@suq.test');
  await page.locator('#lock-recover-password').fill('wrong');
  await page.locator('#lock-recover-pin').fill(NEW_PIN);
  await page.getByRole('button', { name: t.settings.setOwnerPin }).click();
  await expect(result).toHaveText(t.auth.errors.invalidCredentials);

  // A cashier's account of this shop is not the owner's.
  server.memberRole = 'cashier';
  await page.locator('#lock-recover-password').fill(server.password);
  await page.getByRole('button', { name: t.settings.setOwnerPin }).click();
  await expect(result).toHaveText(t.settings.notShopOwner);
  expect((await readLocal<{ pin: string }>(page, 'cashiers'))[0]?.pin).toBe(CASHIER.pin);

  server.memberRole = 'owner';
  await page.getByRole('button', { name: t.settings.setOwnerPin }).click();
  await expect(result).toHaveText(t.settings.ownerPinChanged(CASHIER.name));
  expect((await readLocal<{ pin: string }>(page, 'cashiers'))[0]?.pin).toBe(NEW_PIN);

  // The old PIN no longer opens the till; the new one does.
  await page.getByRole('button', { name: CASHIER.name, exact: true }).click();
  await typePin(page, CASHIER.pin);
  await expect(page.getByText(t.lock.wrongPin)).toBeVisible();
  await typePin(page, NEW_PIN);
  await expect(searchBox(page)).toBeVisible();
});

test('a cashier gets the owner a new PIN in Settings; offline it says why', async ({ context, page }) => {
  const server = new FakeSupabase(E2E_SUPABASE_URL);
  await server.install(context);
  await setupShop(page);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 });

  // Client-side navigation throughout: a full page load would bring back the PIN lock.
  await page.getByRole('link', { name: t.nav.settings }).first().click();
  // The owner, unlocked as themselves, is not offered it.
  await expect(page.getByRole('button', { name: t.settings.forgotOwnerPin })).toHaveCount(0);
  await page.locator('#cashier-name').fill(HELPER.name);
  await page.locator('#cashier-pin').fill(HELPER.pin);
  await page.getByRole('button', { name: t.settings.addCashier }).click();
  await expect(page.getByText(HELPER.name, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: t.lock.lockNow }).first().click();
  await page.getByRole('button', { name: HELPER.name }).click();
  await typePin(page, HELPER.pin);

  await page.getByRole('button', { name: t.settings.forgotOwnerPin }).click();
  await page.locator('#settings-recover-email').fill('owner@suq.test');
  await page.locator('#settings-recover-password').fill(server.password);
  await page.locator('#settings-recover-pin').fill(NEW_PIN);

  server.offline = true;
  await goOffline(context);
  await page.getByRole('button', { name: t.settings.setOwnerPin }).click();
  await expect(page.getByTestId('settings-recover-result')).toHaveText(t.auth.errors.network);
  await goOnline(context);
  server.offline = false;

  await page.getByRole('button', { name: t.settings.setOwnerPin }).click();
  await expect(page.getByTestId('settings-recover-result')).toHaveText(t.settings.ownerPinChanged(CASHIER.name));

  // The new owner PIN approves at once.
  await page.locator('#cashier-name').fill('ቤዛ');
  await page.locator('#cashier-pin').fill('4444');
  await page.locator('#cashier-owner-pin').fill(NEW_PIN);
  await page.getByRole('button', { name: t.settings.addCashier }).click();
  await expect(page.getByText('ቤዛ', { exact: true })).toBeVisible();
  expect(await readLocal(page, 'cashiers')).toHaveLength(3);
});
