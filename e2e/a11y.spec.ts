import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CASHIER, PRODUCTS, pay, scan, setupShop, syncPill, t } from './helpers';

/**
 * WCAG 2.1 A/AA, as axe can check it, on every screen a cashier touches.
 * Contrast is the one that matters most at a counter in daylight on a cheap
 * phone, and the one the brand colours used to fail (see --ochre-ink /
 * --birr-ink in app/globals.css).
 */
async function expectNoViolations(page: Page, screen: string): Promise<void> {
  // A colour mid-transition (the pill fades between states) is not what anyone reads.
  // Only transitions: the pulsing dot is an infinite animation and never finishes.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const found = violations.map((v) => ({
    rule: v.id,
    nodes: v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
  }));
  expect(found, `axe violations on ${screen}`).toEqual([]);
}

test('the till passes axe (WCAG 2.1 AA) on every main screen', async ({ context, page }) => {
  await setupShop(page);
  await expectNoViolations(page, 'sale screen (empty)');

  await scan(page, [PRODUCTS[0].barcode]);
  await expectNoViolations(page, 'sale screen (cart)');

  await pay(page);
  await expectNoViolations(page, 'sale screen (sale complete)');

  // The pill's ochre states are the ones that failed contrast.
  await context.setOffline(true);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'offline');
  await expectNoViolations(page, 'sale screen (offline)');
  await context.setOffline(false);

  await page.getByRole('link', { name: new RegExp(t.sell.completed) }).click();
  await expect(page.getByRole('button', { name: t.sales.print })).toBeVisible();
  await expectNoViolations(page, 'receipt');

  for (const href of ['/products', '/reports', '/settings']) {
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForURL(`**${href}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoViolations(page, href);
  }

  // A reload is a cold launch: the PIN lock.
  await page.reload();
  await expect(page.getByRole('button', { name: CASHIER.name })).toBeVisible();
  await expectNoViolations(page, 'PIN lock');
});

test('the sale confirmation and sync state are announced', async ({ page }) => {
  await setupShop(page);
  // Live regions must exist before their content changes, or nothing is read out.
  const confirmation = page.locator('aside [role="status"]');
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).toBeEmpty();
  await scan(page, [PRODUCTS[0].barcode]);
  const receiptNo = await pay(page);
  await expect(confirmation).toContainText(receiptNo);
  await expect(page.getByRole('status').filter({ hasText: t.sync.label })).toHaveCount(1);
});
