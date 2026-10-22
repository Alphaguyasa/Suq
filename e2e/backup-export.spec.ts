import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PRODUCTS, pay, scan, setupShop, t } from './helpers';

/**
 * A shop that never signs in has no copy of its history anywhere but the
 * till. Settings must hand over that copy offline, as files a phone can save
 * and a spreadsheet can open.
 */
test('Settings exports a JSON backup and a sales CSV, offline', async ({ context, page }) => {
  await setupShop(page);
  const [water, bread] = PRODUCTS;
  await scan(page, [water.barcode, bread.barcode]);
  const receiptNo = await pay(page);

  await page.locator('a[href="/settings"]').first().click();
  await page.waitForURL('**/settings');
  await context.setOffline(true);

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: t.settings.backupJson }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/^suq-A1-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile((await jsonDownload.path())!, 'utf8')) as {
    format: string;
    sales: { receipt_no: string; total: number }[];
    products: unknown[];
    sale_items: unknown[];
  };
  expect(backup.format).toBe('suq-backup');
  expect(backup.sales.map((sale) => sale.receipt_no)).toEqual([receiptNo]);
  expect(backup.sales[0]?.total).toBe(water.price + bread.price);
  expect(backup.products).toHaveLength(PRODUCTS.length);
  expect(backup.sale_items).toHaveLength(2);
  await expect(page.getByTestId('backup-result')).toHaveText(t.settings.backupDone(1, PRODUCTS.length));

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: t.settings.backupCsv }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(/^suq-A1-\d{4}-\d{2}-\d{2}-sales\.csv$/);
  const csv = await readFile((await csvDownload.path())!, 'utf8');
  expect(csv.startsWith('﻿')).toBe(true);
  const lines = csv.slice(1).trim().split('\r\n');
  expect(lines).toHaveLength(3);
  expect(lines[1]).toContain(receiptNo);
  expect(csv).toContain(water.name_am);
  expect(csv).toContain('25.00');
});
