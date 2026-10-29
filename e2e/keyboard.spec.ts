import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CASHIER, PRODUCTS, coldLaunch, scan, searchBox, setupShop, t } from './helpers';

/** A short, readable name for whatever has focus: its accessible label, else its text. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return '<body>';
    return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
  });
}

async function tabThrough(page: Page, count: number): Promise<string[]> {
  const seen: string[] = [];
  for (let step = 0; step < count; step += 1) {
    await page.keyboard.press('Tab');
    seen.push(await focused(page));
  }
  return seen;
}

/**
 * axe checks names and contrast, not the order Tab walks in. A till on a
 * laptop or a tablet with a keyboard is driven this way, so the sale screen
 * must go search → products → cart → payment → pay, and nothing may trap
 * focus or be skipped.
 */
test('Tab walks the sale screen in order: search, products, cart, payment, pay', async ({ page }) => {
  await setupShop(page);
  await scan(page, [PRODUCTS[0].barcode]);
  await expect(searchBox(page)).toBeFocused();

  const seen = await tabThrough(page, 30);
  const at = (label: string | RegExp) =>
    seen.findIndex((name) => (typeof label === 'string' ? name.includes(label) : label.test(name)));

  const tile = at(PRODUCTS[1].name_am);
  const less = at(`${t.sell.oneLess} ${PRODUCTS[0].name}`);
  const more = at(`${t.sell.oneMore} ${PRODUCTS[0].name}`);
  const cash = at(t.payment.cash);
  const pay = at(new RegExp(`^${t.sell.pay}`));
  const nav = at(t.nav.products);

  for (const index of [tile, less, more, cash, pay, nav]) expect(index, seen.join(' | ')).toBeGreaterThanOrEqual(0);
  expect(tile).toBeLessThan(less);
  expect(less).toBeLessThan(more);
  expect(more).toBeLessThan(cash);
  expect(cash).toBeLessThan(pay);
  expect(pay).toBeLessThan(nav);

  // Focus goes round the page and back to the search box: nothing traps it.
  expect(seen).toContain(t.sell.searchPlaceholder);
});

test('the PIN lock works from a keyboard alone', async ({ page }) => {
  await setupShop(page);
  await coldLaunch(page);

  // The first name has focus, so Enter picks it.
  const name = page.getByRole('button', { name: CASHIER.name });
  await expect(name).toBeFocused();
  await page.keyboard.press('Enter');

  // Focus does not fall back to <body> once the names are gone.
  await expect(page.getByRole('group', { name: t.lock.pin })).toBeFocused();
  // Every key has a name a screen reader can say.
  await expect(page.getByRole('button', { name: t.lock.clearPin })).toBeVisible();
  await expect(page.getByRole('button', { name: t.lock.deleteDigit })).toBeVisible();

  // A wrong digit, Backspace, then the PIN typed on the keyboard.
  await page.keyboard.type(CASHIER.pin.slice(0, 3));
  await page.keyboard.press('9');
  await expect(page.getByText(t.lock.wrongPin)).toBeVisible();
  await page.keyboard.type('5');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(CASHIER.pin);
  await expect(searchBox(page)).toBeVisible();
});

test('Escape on the PIN pad goes back to the names', async ({ page }) => {
  await setupShop(page);
  await coldLaunch(page);
  await page.getByRole('button', { name: CASHIER.name }).click();
  await expect(page.getByRole('group', { name: t.lock.pin })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: CASHIER.name })).toBeVisible();
  await expect(page.getByRole('button', { name: '1', exact: true })).toHaveCount(0);
});
