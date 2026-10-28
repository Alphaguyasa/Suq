import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { am } from '../lib/i18n/am';

/**
 * The app opens in Amharic, so the suite drives it with the Amharic
 * dictionary — the same strings a cashier sees — rather than hardcoding them.
 */
export const t = am;

export const CASHIER = { name: 'አበበ', pin: '1234' };

/** Three products with real barcodes and opening stock, in the setup CSV format (prices in cents). */
export const PRODUCTS = [
  { name: 'Ambo Water 1L', name_am: 'አምቦ ውሃ 1 ሊትር', barcode: '6001234567890', price: 2500, opening: 24 },
  { name: 'Bread', name_am: 'ዳቦ', barcode: '6001234567891', price: 1000, opening: 40 },
  { name: 'Sugar 1kg', name_am: 'ስኳር 1 ኪሎ', barcode: '6001234567892', price: 12000, opening: 10 },
] as const;

/** The CSV takes birr, as an owner would type it; the app stores integer cents. */
const birr = (cents: number) => (cents / 100).toFixed(2);

const CSV = [
  'name,name_am,barcode,unit,cost_price,sell_price,reorder_level,opening_qty',
  ...PRODUCTS.map((p) => `${p.name},${p.name_am},${p.barcode},pcs,${birr(p.price - 500)},${birr(p.price)},5,${p.opening}`),
].join('\n');

/** Walk the four-step first-run wizard the way a shop owner would. */
export async function setupShop(page: Page, prefix = 'A1'): Promise<void> {
  await page.goto('/');
  await page.waitForURL('**/setup');

  await page.locator('#s-name-am').fill('የሙከራ ሱቅ');
  await page.locator('#s-name').fill('Test Shop');
  await page.getByRole('button', { name: t.setup.next }).click();

  await page.locator('#s-prefix').fill(prefix);
  await page.getByRole('button', { name: t.setup.next }).click();

  await page.locator('#s-cashier').fill(CASHIER.name);
  await page.locator('#s-pin').fill(CASHIER.pin);
  await page.getByRole('button', { name: t.setup.next }).click();

  await page.locator('input[type=file]').setInputFiles({
    name: 'products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV, 'utf8'),
  });
  await expect(page.getByText(t.setup.imported(PRODUCTS.length))).toBeVisible();
  await page.getByRole('button', { name: t.setup.finish }).click();

  await page.waitForURL((url) => url.pathname === '/');
  await expect(searchBox(page)).toBeVisible();
}

/** The PIN lock appears on every cold launch once a cashier exists. */
export async function unlock(page: Page): Promise<void> {
  await page.getByRole('button', { name: CASHIER.name }).click();
  for (const digit of CASHIER.pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(searchBox(page)).toBeVisible();
}

export function searchBox(page: Page) {
  return page.getByRole('textbox', { name: t.sell.searchPlaceholder });
}

export function syncPill(page: Page) {
  return page.getByTestId('sync-pill');
}

/** Scan items (a USB scanner just types into the focused search box). */
export async function scan(page: Page, barcodes: readonly string[]): Promise<void> {
  for (const barcode of barcodes) {
    await searchBox(page).fill(barcode);
    // An exact barcode match lands in the cart and clears the box.
    await expect(searchBox(page)).toHaveValue('');
  }
}

/**
 * F4 completes the sale; the confirmation shows the new receipt number.
 *
 * The previous sale's confirmation lingers for 2.5s, so on a fast machine the
 * link is already visible before this sale lands — wait for a receipt number
 * that differs from whatever was showing when F4 was pressed.
 */
export async function pay(page: Page): Promise<string> {
  const confirmation = page.getByRole('link', { name: new RegExp(t.sell.completed) });
  const receiptOf = async () =>
    (await confirmation.count()) > 0
      ? ((await confirmation.locator('.num').textContent())?.trim() ?? '')
      : '';

  const before = await receiptOf();
  await page.keyboard.press('F4');

  let receiptNo = '';
  await expect
    .poll(async () => {
      receiptNo = await receiptOf();
      return receiptNo !== '' && receiptNo !== before;
    })
    .toBe(true);

  expect(receiptNo).toMatch(/^[A-Z0-9]+-\d{6}$/);
  return receiptNo;
}

/** Wait until the service worker controls the page, so a reload can be served offline. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
    );
  });
}

/** Read a table straight out of the till's IndexedDB — the source of truth. */
export async function readLocal<T = Record<string, unknown>>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('suq');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database.transaction(name, 'readonly').objectStore(name).getAll();
          request.onsuccess = () => {
            database.close();
            resolve(request.result as T[]);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    table,
  );
}

/** Every request to the app's own origin (the fake Supabase lives on 127.0.0.1, so it is not caught). */
const APP_ORIGIN = /^http:\/\/localhost:\d+\//;

/**
 * context.setOffline() does not reliably cover requests the service worker
 * makes itself: in Chromium they can still reach the server, so a page or
 * chunk that is not precached loads anyway and an "offline" test passes for
 * the wrong reason. Refuse every request to the app's own origin as well, so
 * only what the worker holds can be served.
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route(APP_ORIGIN, (route) => route.abort('internetdisconnected'));
}

/** Undo goOffline(): the network and the app's origin come back together. */
export async function goOnline(context: BrowserContext): Promise<void> {
  await context.unroute(APP_ORIGIN);
  await context.setOffline(false);
}
