import type { ShopSettings } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { ProductPerformance, SalesSummary } from '@/lib/reports/compute';

/** How many best sellers the message names. More than this is a list nobody reads on a phone. */
export const SUMMARY_TOP_COUNT = 3;

/**
 * The period's sales in a few lines, for the owner to send to themselves (or a
 * partner) on Telegram at the end of the day: "today: 42 sales, 8,350 birr,
 * best seller …". The cash-up text covers the drawer; this one covers how the
 * shop did. Same rules as cashUpText(): one "label: value" per line (chat fonts
 * are proportional, Ethiopic has no monospaced face) and every amount through
 * formatETB, so no float touches money.
 *
 * Best sellers come in topProducts()'s revenue order and keep the name the item
 * was sold as. The change against the previous period is left out when there is
 * no baseline (changeVsPrevious() returns null), as on the screen.
 */
export function summaryText({
  summary,
  change,
  top,
  lowStockCount,
  settings,
  t,
  periodLabel,
  date,
}: {
  summary: SalesSummary;
  change: number | null;
  top: ProductPerformance[];
  lowStockCount: number;
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
  push(`${t.reports.summaryTitle} · ${periodLabel}`);
  push(formatDateTime(date));

  lines.push(rule);
  const changeNote =
    change === null ? '' : ` (${change > 0 ? '+' : ''}${change}% ${t.reports.vsPrevious})`;
  push(`${t.reports.netSales}: ${formatETB(summary.net)} ${t.money.currency}${changeNote}`);
  push(`${t.reports.transactions}: ${summary.transactions}`);
  if (summary.transactions > 0) {
    push(`${t.reports.averageBasket}: ${formatETB(summary.averageBasket)}`);
    push(`${t.reports.grossProfit}: ${formatETB(summary.grossProfit)}`);
  }

  const best = top.filter((row) => row.revenue > 0).slice(0, SUMMARY_TOP_COUNT);
  if (best.length > 0) {
    lines.push(rule);
    push(t.reports.topProducts);
    best.forEach((row, index) => push(`${index + 1}. ${row.name_am}: ${formatETB(row.revenue)}`));
  }

  if (lowStockCount > 0) {
    lines.push(rule);
    push(`${t.reports.lowStock}: ${lowStockCount}`);
  }

  return lines.join('\n');
}
