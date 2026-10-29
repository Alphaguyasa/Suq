import type { Sale, SaleItem, ShopSettings } from '@/lib/db';
import { formatDateTime, formatETB, formatQty } from '@/lib/format';
import type { Dict } from '@/lib/i18n';

/**
 * The receipt as plain text, for shops without a thermal printer: the cashier
 * shares it to the customer's Telegram or SMS from the phone's share sheet.
 *
 * The same content as components/Receipt.tsx, in the same order, so a shared
 * receipt and a printed one never disagree. No column padding: chat apps use
 * proportional fonts (and Ethiopic has no monospaced face anyway), so one
 * "label: value" per line reads better than spaces that never line up.
 * Every amount still goes through formatETB, so no float touches money.
 */
export function receiptText({
  sale,
  items,
  settings,
  t,
  voidedBy,
  original,
}: {
  sale: Sale;
  items: SaleItem[];
  settings: ShopSettings;
  t: Dict;
  voidedBy?: Sale | null;
  original?: Sale | null;
}): string {
  const rule = '--------------------';
  const lines: string[] = [];
  const push = (line: string | null | undefined) => {
    if (line) lines.push(line);
  };

  push(settings.shop_name_am);
  push(settings.shop_name);
  push(settings.phone);
  push(settings.address);
  if (voidedBy || sale.voids_sale_id) push(t.receipt.voidedStamp);

  lines.push(rule);
  push(sale.receipt_no);
  push(formatDateTime(sale.created_at));
  if (sale.cashier_name) push(`${t.receipt.cashier}: ${sale.cashier_name}`);
  if (original) push(`${t.sales.original}: ${original.receipt_no}`);

  lines.push(rule);
  for (const item of items) {
    push(item.name_snapshot);
    push(`  ${formatQty(item.qty)} × ${formatETB(item.unit_price)} = ${formatETB(item.line_total)}`);
  }

  lines.push(rule);
  push(`${t.sell.subtotal}: ${formatETB(sale.subtotal)}`);
  if (sale.discount !== 0) push(`${t.sell.discount}: -${formatETB(Math.abs(sale.discount))}`);
  push(`${t.sell.total}: ${formatETB(sale.total)} ${t.money.currency}`);
  push(`${t.receipt.paymentMethod}: ${t.payment[sale.payment_method]}`);
  if (sale.cash_received !== null) {
    push(`${t.sell.received}: ${formatETB(sale.cash_received)}`);
    push(`${t.sell.change}: ${formatETB(sale.cash_received - sale.total)}`);
  }

  lines.push(rule);
  push(settings.receipt_footer_am || t.receipt.thankYou);
  push(settings.receipt_footer);

  return lines.join('\n');
}
