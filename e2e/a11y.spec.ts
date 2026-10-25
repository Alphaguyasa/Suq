import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  CASHIER,
  PRODUCTS,
  pay,
  scan,
  setupShop,
  syncPill,
  t,
} from "./helpers";

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
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const found = violations.map((v) => ({
    rule: v.id,
    nodes: v.nodes.map(
      (n) => `${n.target.join(" ")} — ${n.failureSummary ?? ""}`,
    ),
  }));
  expect(found, `axe violations on ${screen}`).toEqual([]);
}

/**
 * docs/RULES.md: every touch target is at least 56px (the pay button 64px).
 * axe's own target-size rule is WCAG 2.2 and only asks for 24px, so this is
 * the till's own check: every visible control a finger can hit, in both
 * dimensions. A control is measured by its own box, not the text inside it.
 */
const MIN_TARGET = 56;

async function expectTouchTargets(page: Page, screen: string): Promise<void> {
  const small = await page.evaluate((min) => {
    const controls = document.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]',
    );
    const out: string[] = [];
    for (const control of controls) {
      // A checkbox's target is the label wrapped around it: a tap on the text toggles it too.
      const el = control.closest("label") ?? control;
      const box = el.getBoundingClientRect();
      // Not rendered (display: none, closed <details>, print-only) is not a target.
      if (
        box.width === 0 ||
        box.height === 0 ||
        el.closest('[aria-hidden="true"]')
      )
        continue;
      // Half a pixel of subpixel layout is not a smaller finger.
      if (box.width >= min - 0.5 && box.height >= min - 0.5) continue;
      const name = (
        control.getAttribute("aria-label") ??
        control.textContent ??
        ""
      )
        .trim()
        .slice(0, 30);
      out.push(
        `${control.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
      );
    }
    return out;
  }, MIN_TARGET);
  expect(small, `touch targets under ${MIN_TARGET}px on ${screen}`).toEqual([]);
  // Bigger controls must not push the page sideways on a 360px phone.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal scroll on ${screen}`).toBeLessThanOrEqual(0);
}

test("the till passes axe (WCAG 2.1 AA) on every main screen", async ({
  context,
  page,
}) => {
  await setupShop(page);
  await expectNoViolations(page, "sale screen (empty)");

  await scan(page, [PRODUCTS[0].barcode]);
  await expectNoViolations(page, "sale screen (cart)");

  await pay(page);
  await expectNoViolations(page, "sale screen (sale complete)");

  // The pill's ochre states are the ones that failed contrast.
  await context.setOffline(true);
  await expect(syncPill(page)).toHaveAttribute("data-state", "offline");
  await expectNoViolations(page, "sale screen (offline)");
  await context.setOffline(false);

  await page.getByRole("link", { name: new RegExp(t.sell.completed) }).click();
  await expect(page.getByRole("button", { name: t.sales.print })).toBeVisible();
  await expectNoViolations(page, "receipt");

  for (const href of ["/products", "/reports", "/settings"]) {
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForURL(`**${href}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoViolations(page, href);
  }

  // A reload is a cold launch: the PIN lock.
  await page.reload();
  await expect(page.getByRole("button", { name: CASHIER.name })).toBeVisible();
  await expectNoViolations(page, "PIN lock");
});

test("the sale confirmation and sync state are announced", async ({ page }) => {
  await setupShop(page);
  // Live regions must exist before their content changes, or nothing is read out.
  const confirmation = page.locator('aside [role="status"]');
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).toBeEmpty();
  await scan(page, [PRODUCTS[0].barcode]);
  const receiptNo = await pay(page);
  await expect(confirmation).toContainText(receiptNo);
  await expect(
    page.getByRole("status").filter({ hasText: t.sync.label }),
  ).toHaveCount(1);
});

// The cheap Android phone is the real till; a desktop screen is the demo laptop.
for (const [device, viewport] of [
  ["phone", { width: 360, height: 740 }],
  ["desktop", { width: 1280, height: 720 }],
] as const) {
  test(`every control on the main screens is a 56px touch target (${device})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await setupShop(page);
    await expectTouchTargets(page, "sale screen (empty)");

    // Cart and payment panel, cash selected: the quick-note buttons show.
    await scan(page, [PRODUCTS[0].barcode]);
    await expectTouchTargets(page, "sale screen (cart)");

    await pay(page);
    await expectTouchTargets(page, "sale screen (sale complete)");

    await page
      .getByRole("link", { name: new RegExp(t.sell.completed) })
      .click();
    await expect(
      page.getByRole("button", { name: t.sales.print }),
    ).toBeVisible();
    await expectTouchTargets(page, "receipt");

    for (const href of ["/sales", "/products", "/reports", "/settings"]) {
      await page.locator(`a[href="${href}"]`).first().click();
      await page.waitForURL(`**${href}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectTouchTargets(page, href);
    }

    await page.locator('a[href="/products"]').first().click();
    await page
      .getByRole("link", { name: new RegExp(PRODUCTS[1].name_am) })
      .click();
    await expect(
      page.getByRole("heading", { name: t.products.edit }),
    ).toBeVisible();
    await expectTouchTargets(page, "product edit");

    await page.getByRole("link", { name: new RegExp(t.stock.title) }).click();
    await expect(
      page.getByRole("heading", { name: t.stock.title, exact: true }),
    ).toBeVisible();
    await expectTouchTargets(page, "stock");

    await page.reload();
    await expect(
      page.getByRole("button", { name: CASHIER.name }),
    ).toBeVisible();
    await expectTouchTargets(page, "PIN lock");
  });
}
