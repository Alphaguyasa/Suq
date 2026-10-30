import type { PaymentMethod, ShopSettings } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { CashUp, SalesSummary } from '@/lib/reports/compute';

const METHODS: PaymentMethod[] = ['cash', 'telebirr', 'card', 'credit'];

/**
 * The cash-up as plain text, so the owner gets the day's takings on Telegram
 * when they are not in the shop. Same rules as receiptText(): one
 * "label: value" per line (chat fonts are proportional, Ethiopic has no
 * monospaced face) and every amount through formatETB, so no float touches money.
 *
 * Unlike the printed sheet, which stays in the drawer, the shared text also
 * carries the period's takings by payment method: the owner reading it has
 * no other screen to look at.
 */
export function cashUpText({
  cashUp,
  summary,
  settings,
  t,
  periodLabel,
  date,
}: {
  cashUp: CashUp;
  summary: SalesSummary;
  settings: ShopSettings;
  t: Dict;
  periodLabel: string;
  date: string;
}): string {
  const rule = '--------------------';
  const lines: string[] = [];
  const push = (line: string | null | undefined) => {
    if (line) lines.push(line);
  };

  push(settings.shop_name_am);
  push(settings.shop_name);
  push(`${t.reports.cashUp} · ${periodLabel}`);
  push(formatDateTime(date));

  lines.push(rule);
  push(`${t.reports.netSales}: ${formatETB(summary.net)} ${t.money.currency}`);
  push(`${t.reports.transactions}: ${summary.transactions}`);
  for (const method of METHODS) {
    if (summary.byMethod[method] !== 0) {
      push(`${t.payment[method]}: ${formatETB(summary.byMethod[method])}`);
    }
  }

  lines.push(rule);
  push(`${t.reports.openingFloat}: ${formatETB(cashUp.openingFloat)}`);
  push(`${t.reports.cashSales}: ${formatETB(cashUp.cashSales)}`);
  push(`${t.reports.expectedDrawer}: ${formatETB(cashUp.expected)}`);
  if (cashUp.counted !== null) push(`${t.reports.countedDrawer}: ${formatETB(cashUp.counted)}`);
  if (cashUp.variance !== null) {
    push(
      cashUp.variance === 0
        ? t.reports.balanced
        : `${t.reports.variance}: ${formatETB(Math.abs(cashUp.variance))} ${
            cashUp.variance < 0 ? t.reports.short : t.reports.over
          }`,
    );
  }

  return lines.join('\n');
}
