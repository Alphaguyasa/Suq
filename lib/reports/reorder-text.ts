import type { ShopSettings } from '@/lib/db';
import { formatDateTime, formatQty } from '@/lib/format';
import type { Dict, Lang } from '@/lib/i18n';
import type { LowStockRow } from '@/lib/reports/compute';

/**
 * The low-stock list as plain text, to send "what to order" to a supplier on
 * Telegram or SMS (ROADMAP item 47). Same rules as cashUpText() and
 * receiptText(): one line per product, no table (chat fonts are proportional,
 * and Ethiopic has no monospaced face).
 *
 * The product name follows the UI language, falling back to the other name
 * when that one was left empty: a supplier who reads English gets "Sugar 1kg",
 * and an Amharic-only catalogue still prints something.
 *
 * Rows arrive in lowStock()'s order, furthest below the reorder level first,
 * which is the order a supplier should load the van in.
 */
export function reorderText({
  rows,
  settings,
  t,
  lang,
  date,
}: {
  rows: LowStockRow[];
  settings: ShopSettings;
  t: Dict;
  lang: Lang;
  date: string;
}): string {
  const lines: string[] = [];
  const push = (line: string | null | undefined) => {
    if (line) lines.push(line);
  };

  push(settings.shop_name_am);
  push(settings.shop_name);
  push(settings.phone);
  push(t.reports.reorderTitle);
  push(formatDateTime(date));
  lines.push('--------------------');

  for (const { product, onHand } of rows) {
    const name = lang === 'en' ? product.name || product.name_am : product.name_am || product.name;
    const unit = t.units[product.unit];
    push(
      `${name}: ${t.products.onHand} ${formatQty(onHand)} ${unit} · ${t.productForm.reorderLevel} ${formatQty(
        product.reorder_level,
      )}`,
    );
  }

  return lines.join('\n');
}
