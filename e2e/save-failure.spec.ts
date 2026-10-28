import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PRODUCTS, pay, readLocal, scan, setupShop, t } from './helpers';

/**
 * Outside the sale screen, a write IndexedDB refuses used to be an unhandled
 * rejection: the button came back and nothing said the void or the restock
 * never happened. Each screen now says why, keeps what was typed, and goes
 * through on the next tap once there is room.
 *
 * Same simulation as sale-save-failure.spec.ts: the store refuses add/put
 * with a QuotaExceededError, the way a full phone reports it.
 */
async function refuseWritesTo(page: Page, table: string): Promise<void> {
  await page.evaluate((name) => {
    const store = IDBObjectStore.prototype;
    const real = { add: store.add, put: store.put };
    (window as unknown as { __restoreIdb: () => void }).__restoreIdb = () => {
      store.add = real.add;
      store.put = real.put;
    };
    for (const method of ['add', 'put'] as const) {
      store[method] = function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) {
        if (this.name === name) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return real[method].apply(this, args);
      };
    }
  }, table);
}

async function restoreWrites(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __restoreIdb: () => void }).__restoreIdb());
}

test('a void that cannot be saved says so, and goes through on retry', async ({ page }) => {
  await setupShop(page);
  await scan(page, [PRODUCTS[0].barcode]);
  await pay(page);
  await page.getByRole('link', { name: new RegExp(t.sell.completed) }).click();

  await page.getByRole('button', { name: t.sales.void }).click();
  await page.locator('#void-reason').fill('ስህተት');
  await refuseWritesTo(page, 'sales');
  await page.getByRole('button', { name: t.sales.void }).click();

  const alert = page.getByTestId('void-error');
  await expect(alert).toContainText(t.common.saveFailed);
  await expect(alert).toContainText(t.common.saveFailedQuota);
  await expect(page.locator('#void-reason')).toHaveValue('ስህተት');
  expect(await readLocal(page, 'sales')).toHaveLength(1);

  await restoreWrites(page);
  await page.getByRole('button', { name: t.sales.void }).click();
  await expect(page.getByText(t.sales.voidedAs)).toBeVisible();
  expect(await readLocal(page, 'sales')).toHaveLength(2);
});

test('a restock that cannot be saved says so and keeps the quantity', async ({ page }) => {
  await setupShop(page);
  // Client-side navigation: a full page load would bring back the PIN lock.
  await page.getByRole('link', { name: t.nav.products }).first().click();
  await page.getByRole('link', { name: new RegExp(PRODUCTS[1].name_am) }).click();
  await page.getByRole('link', { name: new RegExp(t.stock.title) }).click();
  await expect(page.getByRole('heading', { name: t.stock.title, exact: true })).toBeVisible();

  await page.locator('#r-qty').fill('6');
  await refuseWritesTo(page, 'stock_movements');
  await page.getByRole('button', { name: t.stock.restock }).click();

  await expect(page.getByTestId('restock-error')).toContainText(t.common.saveFailedQuota);
  await expect(page.locator('#r-qty')).toHaveValue('6');

  await restoreWrites(page);
  await page.getByRole('button', { name: t.stock.restock }).click();
  await expect(page.locator('#r-qty')).toHaveValue('');
  await expect(page.getByTestId('restock-error')).toBeEmpty();
  const movements = await readLocal<{ qty_delta: number; reason: string }>(page, 'stock_movements');
  expect(movements.filter((m) => m.reason === 'purchase').map((m) => m.qty_delta)).toEqual([6]);
});

test('a stock count that cannot be saved says so and keeps the count', async ({ page }) => {
  await setupShop(page);
  await page.getByRole('link', { name: t.nav.products }).first().click();
  await page.getByRole('link', { name: new RegExp(PRODUCTS[1].name_am) }).click();
  await page.getByRole('link', { name: new RegExp(t.stock.title) }).click();
  await expect(page.getByRole('heading', { name: t.stock.title, exact: true })).toBeVisible();
  const before = await readLocal(page, 'stock_movements');

  await page.locator('#a-counted').fill('3');
  await refuseWritesTo(page, 'stock_movements');
  await page.getByRole('button', { name: t.stock.adjust }).click();

  await expect(page.getByTestId('adjust-error')).toContainText(t.common.saveFailedQuota);
  await expect(page.locator('#a-counted')).toHaveValue('3');
  expect(await readLocal(page, 'stock_movements')).toHaveLength(before.length);

  await restoreWrites(page);
  await page.getByRole('button', { name: t.stock.adjust }).click();
  await expect(page.locator('#a-counted')).toHaveValue('');
  await expect(page.getByTestId('adjust-error')).toBeEmpty();
  expect(await readLocal(page, 'stock_movements')).toHaveLength(before.length + 1);
});

test('shop details that cannot be saved say so and keep what was typed', async ({ page }) => {
  await setupShop(page);
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');

  await page.locator('#phone').fill('0911223344');
  await refuseWritesTo(page, 'shop_settings');
  await page.getByRole('button', { name: t.common.save }).click();

  await expect(page.getByTestId('settings-save-error')).toContainText(t.common.saveFailedQuota);
  await expect(page.getByText(t.settings.saved)).toHaveCount(0);
  await expect(page.locator('#phone')).toHaveValue('0911223344');
  const [refused] = await readLocal<{ phone: string }>(page, 'shop_settings');
  expect(refused.phone).not.toBe('0911223344');

  await restoreWrites(page);
  await page.getByRole('button', { name: t.common.save }).click();
  await expect(page.getByText(t.settings.saved)).toBeVisible();
  await expect(page.getByTestId('settings-save-error')).toBeEmpty();
  const [saved] = await readLocal<{ phone: string }>(page, 'shop_settings');
  expect(saved.phone).toBe('0911223344');
});

test('a cashier that cannot be added says so and keeps the name and PIN', async ({ page }) => {
  await setupShop(page);
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');
  const before = await readLocal(page, 'cashiers');

  await page.locator('#cashier-name').fill('ሰላም');
  await page.locator('#cashier-pin').fill('4321');
  await refuseWritesTo(page, 'cashiers');
  await page.getByRole('button', { name: t.settings.addCashier }).click();

  const alert = page.getByTestId('cashier-error');
  await expect(alert).toContainText(t.common.saveFailedQuota);
  await expect(alert).not.toContainText('quota has been exceeded');
  await expect(page.locator('#cashier-name')).toHaveValue('ሰላም');
  await expect(page.locator('#cashier-pin')).toHaveValue('4321');
  expect(await readLocal(page, 'cashiers')).toHaveLength(before.length);

  await restoreWrites(page);
  await page.getByRole('button', { name: t.settings.addCashier }).click();
  await expect(page.locator('#cashier-name')).toHaveValue('');
  await expect(alert).toBeEmpty();
  expect(await readLocal(page, 'cashiers')).toHaveLength(before.length + 1);
});

test('setup that cannot be saved stays on the step, keeps what was typed, and adds the cashier once', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForURL('**/setup');
  const next = page.getByRole('button', { name: t.setup.next });

  // Step 1: the shop's name is refused, so the wizard must not move on.
  await page.locator('#s-name-am').fill('የሙከራ ሱቅ');
  await page.locator('#s-name').fill('Test Shop');
  await refuseWritesTo(page, 'shop_settings');
  await next.click();

  await expect(page.getByTestId('save-error')).toContainText(t.common.saveFailedQuota);
  await expect(page.locator('#s-name-am')).toHaveValue('የሙከራ ሱቅ');
  await expect(page.locator('#s-name')).toHaveValue('Test Shop');
  await expect(next).toBeEnabled();

  await restoreWrites(page);
  await next.click();
  await expect(page.locator('#s-prefix')).toBeVisible();
  await expect(page.getByTestId('save-error')).toBeEmpty();
  const [settings] = await readLocal<{ shop_name: string }>(page, 'shop_settings');
  expect(settings?.shop_name).toBe('Test Shop');

  await page.locator('#s-prefix').fill('A1');
  await next.click();

  // Step 3: the first cashier is refused.
  await page.locator('#s-cashier').fill('አበበ');
  await page.locator('#s-pin').fill('1234');
  await refuseWritesTo(page, 'cashiers');
  await next.click();

  await expect(page.getByTestId('save-error')).toContainText(t.common.saveFailedQuota);
  await expect(page.locator('#s-cashier')).toHaveValue('አበበ');
  await expect(page.locator('#s-pin')).toHaveValue('1234');
  expect(await readLocal(page, 'cashiers')).toHaveLength(0);

  // The retry is a nervous double tap, both in the same tick: one cashier, no
  // "already exists" error, and the wizard lands on the import step.
  await restoreWrites(page);
  await next.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('input[type=file]')).toBeVisible();
  await expect(page.getByText(t.settings.duplicateCashier)).toHaveCount(0);
  await expect(page.getByTestId('save-error')).toBeEmpty();
  expect(await readLocal(page, 'cashiers')).toHaveLength(1);
});
