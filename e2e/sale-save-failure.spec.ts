import { expect, test } from '@playwright/test';
import { PRODUCTS, readLocal, scan, setupShop, t } from './helpers';

/**
 * A full phone is the most likely way a write fails at a real counter. The
 * sale must not vanish silently or look completed: the cashier sees why, the
 * cart stays, and the same cart goes through once there is room again.
 *
 * The quota is simulated the way the browser reports it: IndexedDB refuses a
 * write inside the sale transaction with a QuotaExceededError.
 */
test('a sale that cannot be saved says so and keeps the cart', async ({ page }) => {
  await setupShop(page);
  const [water] = PRODUCTS;

  await scan(page, [water.barcode]);

  await page.evaluate(() => {
    const store = IDBObjectStore.prototype;
    const real = { add: store.add, put: store.put };
    (window as unknown as { __restoreIdb: () => void }).__restoreIdb = () => {
      store.add = real.add;
      store.put = real.put;
    };
    for (const method of ['add', 'put'] as const) {
      store[method] = function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) {
        if (this.name === 'sales') {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return real[method].apply(this, args);
      };
    }
  });

  await page.keyboard.press('F4');

  const alert = page.getByTestId('sale-error');
  await expect(alert).toContainText(t.sell.saveFailed);
  await expect(alert).toContainText(t.sell.saveFailedQuota);
  await expect(page.getByRole('link', { name: new RegExp(t.sell.completed) })).toHaveCount(0);
  // The cart is still there: total unchanged, nothing re-scanned.
  await expect(page.getByText(water.name_am).first()).toBeVisible();
  expect(await readLocal(page, 'sales')).toHaveLength(0);
  expect(await readLocal(page, 'outbox').then((rows) => rows.filter((r) => r.table === 'sales'))).toHaveLength(0);

  // Space freed: the same cart goes through from the retry button.
  await page.evaluate(() => (window as unknown as { __restoreIdb: () => void }).__restoreIdb());
  await alert.getByRole('button', { name: t.sell.retry }).click();

  await expect(page.getByRole('link', { name: new RegExp(t.sell.completed) })).toBeVisible();
  await expect(alert).toBeEmpty();
  const sales = await readLocal<{ total: number }>(page, 'sales');
  expect(sales).toHaveLength(1);
  expect(sales[0]?.total).toBe(water.price);
});
