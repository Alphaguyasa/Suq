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
