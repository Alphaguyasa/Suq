import { expect, test } from '@playwright/test';
import { PRODUCTS, pay, readLocal, searchBox, setupShop } from './helpers';

/**
 * A USB scanner is a keyboard: it types the code in a few milliseconds and
 * most models finish with Enter. The typed code already adds the product as
 * soon as it matches a barcode; the Enter that follows must not add it again.
 */
test('a scanned code followed by Enter adds the item once', async ({ page }) => {
  await setupShop(page);
  const [water, bread] = PRODUCTS;

  for (const barcode of [water.barcode, bread.barcode, water.barcode]) {
    await searchBox(page).focus();
    await page.keyboard.type(barcode);
    await page.keyboard.press('Enter');
    await expect(searchBox(page)).toHaveValue('');
  }

  await pay(page);

  const lines = await readLocal<{ product_id: string; name_snapshot: string; qty: number }>(
    page,
    'sale_items',
  );
  const qtyByName = Object.fromEntries(lines.map((line) => [line.name_snapshot, line.qty]));
  expect(qtyByName).toEqual({ [water.name_am]: 2, [bread.name_am]: 1 });
});
