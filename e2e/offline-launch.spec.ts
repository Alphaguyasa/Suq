import { expect, test } from '@playwright/test';
import { PRODUCTS, coldLaunch, goOffline, pay, readLocal, scan, searchBox, setupShop, syncPill, unlock, waitForServiceWorker } from './helpers';

/**
 * The PWA promise: once the app has loaded, a cold launch in airplane mode
 * still reaches a working sale screen and can complete a sale. No Supabase at
 * all in this test — a till that never signs in must work just the same.
 */
test('a cold launch with no network reaches the sale screen and completes a sale', async ({
  context,
  page,
}) => {
  await setupShop(page);
  await waitForServiceWorker(page);

  // goOffline, not just setOffline: the reload must come from the precache.
  await goOffline(context);
  await coldLaunch(page);

  await unlock(page);
  await expect(searchBox(page)).toBeVisible();
  await expect(syncPill(page)).toHaveAttribute('data-state', 'offline');

  await scan(page, [PRODUCTS[0].barcode, PRODUCTS[2].barcode]);
  const receiptNo = await pay(page);
  expect(receiptNo).toBe('A1-000001');

  const sales = await readLocal<{ receipt_no: string; total: number }>(page, 'sales');
  expect(sales).toHaveLength(1);
  // Integer cents end to end.
  expect(sales[0]?.total).toBe(PRODUCTS[0].price + PRODUCTS[2].price);
});

/**
 * The fonts are committed files (app/layout.tsx), so they ship with the build
 * and the service worker precaches them. Offline, the Amharic UI must still
 * render in Noto Sans Ethiopic, not the device's fallback, and the mono
 * numerals in IBM Plex Mono. FontFace.load() rejects when a font cannot be
 * fetched, so a font missing from the precache fails this test.
 */
test('a cold offline launch still loads the self-hosted Ethiopic and mono fonts', async ({ context, page }) => {
  await setupShop(page);
  await waitForServiceWorker(page);

  await goOffline(context);
  await coldLaunch(page);
  await unlock(page);
  await expect(searchBox(page)).toBeVisible();

  const loaded = await page.evaluate(async () => {
    const root = getComputedStyle(document.documentElement);
    const family = (v: string) => root.getPropertyValue(v).split(',')[0]?.trim() ?? '';
    const check = async (cssVar: string, weight: number, text: string) => {
      const name = family(cssVar);
      const faces = await document.fonts.load(`${weight} 16px ${name}`, text);
      return { name, faces: faces.length, ok: faces.every((f) => f.status === 'loaded') };
    };
    return [
      await check('--font-noto-ethiopic', 400, 'ሱቅ'),
      await check('--font-noto-ethiopic', 700, 'ሱቅ'),
      await check('--font-plex-mono', 500, '0123'),
      await check('--font-archivo', 600, 'Suq'),
    ];
  });

  for (const font of loaded) {
    expect(font.name, 'CSS variable resolves to a font family').not.toBe('');
    expect(font.faces, `${font.name} has a face for the text`).toBeGreaterThan(0);
    expect(font.ok, `${font.name} loaded offline`).toBe(true);
  }

  // Nothing in the built CSS points at Google any more.
  const sheets = await page.evaluate(() =>
    [...document.styleSheets].flatMap((s) => {
      try {
        return [...s.cssRules].map((r) => r.cssText);
      } catch {
        return [];
      }
    }),
  );
  expect(sheets.join('\n')).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
});
