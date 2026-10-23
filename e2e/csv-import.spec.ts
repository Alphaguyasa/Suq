import { expect, test } from '@playwright/test';
import { CASHIER, readLocal, t } from './helpers';

const CSV = [
  'name,name_am,barcode,unit,cost_price,sell_price,reorder_level,opening_qty',
  'Soap,ሳሙና,111,pcs,10,15,2,8',
  'Oil,ዘይት,222,l,-5,120,1,4',
  'Salt,ጨው,333,kg,5,8,1,3',
].join('\n');

/**
 * A bad row is reported in Amharic with its row number and does not stop the
 * good rows; importing the same file again reports them as already there,
 * not as imported a second time.
 */
test('a CSV with a bad row imports the rest and says what happened, in Amharic', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/setup');
  await page.locator('#s-name-am').fill('የሙከራ ሱቅ');
  await page.getByRole('button', { name: t.setup.next }).click();
  await page.locator('#s-prefix').fill('A1');
  await page.getByRole('button', { name: t.setup.next }).click();
  await page.locator('#s-cashier').fill(CASHIER.name);
  await page.locator('#s-pin').fill(CASHIER.pin);
  await page.getByRole('button', { name: t.setup.next }).click();

  const upload = () =>
    page.locator('input[type=file]').setInputFiles({
      name: 'products.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV, 'utf8'),
    });

  await upload();
  const summary = page.getByTestId('import-summary');
  await expect(summary).toContainText(t.setup.imported(2));
  await expect(page.getByText(t.setup.csvErrors.badPrice(3, 'cost_price', '-5'))).toBeVisible();
  expect(await readLocal(page, 'products')).toHaveLength(2);

  await upload();
  await expect(summary).toContainText(t.setup.imported(0));
  await expect(summary).toContainText(t.setup.importSkipped(2));
  expect(await readLocal(page, 'products')).toHaveLength(2);
  expect(await readLocal(page, 'stock_movements')).toHaveLength(2);
});
