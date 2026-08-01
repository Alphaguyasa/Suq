'use client';

import type { Sale, SaleItem, ShopSettings } from '@/lib/db';
import { formatDateTime, formatETB, formatQty } from '@/lib/format';
import { useT } from '@/lib/i18n';

/**
 * 80mm thermal layout (58mm behind a setting).
 *
 * On "everything monospace": the numbers are, and that is what has to line up.
 * Amharic has no monospaced face — Noto Sans Ethiopic is proportional, and
 * forcing a mono fallback would render Ethiopic badly, which docs/RULES.md rules
 * out. So columns are held by flex/grid rather than by character counting,
 * which also survives a product name long enough to wrap. Names wrap onto
 * their own line above the qty × price row for exactly that reason.
 */
export function Receipt({
  sale,
  items,
  settings,
  voidedBy,
  original,
}: {
  sale: Sale;
  items: SaleItem[];
  settings: ShopSettings;
  voidedBy?: Sale | null;
  original?: Sale | null;
}) {
  const t = useT();
  const width = settings.printer_width;
  const change = sale.cash_received !== null ? sale.cash_received - sale.total : null;

  return (
    <>
      {/* @page cannot be selected by class, so the size is emitted per receipt. */}
      <style>{`@page { size: ${width}mm auto; margin: 0; }`}</style>

      <div
        data-print-sheet=""
        style={{ width: `${width}mm` }}
        className="mx-auto flex max-w-full flex-col gap-2 border border-rule bg-white px-3 py-4 text-[11px] leading-snug text-black print:border-0"
      >
        <header className="flex flex-col items-center gap-0.5 text-center">
          {settings.shop_name_am ? (
            <span className="ethiopic text-sm font-bold">{settings.shop_name_am}</span>
          ) : null}
          {settings.shop_name ? <span className="font-bold">{settings.shop_name}</span> : null}
          {settings.phone ? <span className="num">{settings.phone}</span> : null}
          {settings.address ? <span className="ethiopic">{settings.address}</span> : null}
        </header>

        {voidedBy || sale.voids_sale_id ? (
          <p className="ethiopic border-y border-dashed border-black py-1 text-center font-bold">
            {t.receipt.voidedStamp}
          </p>
        ) : null}

        <Rule />

        <div className="flex flex-col gap-0.5">
          <Line label={<span className="num font-bold">{sale.receipt_no}</span>} />
          <Line label={<span className="num">{formatDateTime(sale.created_at)}</span>} />
          {sale.cashier_name ? (
            <Row label={t.receipt.cashier} value={sale.cashier_name} valueClass="ethiopic" />
          ) : null}
          {original ? (
            <Row label={t.sales.original} value={original.receipt_no} valueClass="num" />
          ) : null}
        </div>

        <Rule />

        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col">
              {/* Its own line so a long Amharic name wraps without shoving the
                  money column off the paper. */}
              <span className="ethiopic break-words">{item.name_snapshot}</span>
              <div className="flex items-baseline justify-between gap-2 pl-3">
                <span className="num">
                  {formatQty(item.qty)} × {formatETB(item.unit_price)}
                </span>
                <span className="num shrink-0">{formatETB(item.line_total)}</span>
              </div>
            </li>
          ))}
        </ul>

        <Rule />

        <div className="flex flex-col gap-0.5">
          <Row label={t.sell.subtotal} value={formatETB(sale.subtotal)} />
          {sale.discount !== 0 ? (
            <Row label={t.sell.discount} value={`-${formatETB(Math.abs(sale.discount))}`} />
          ) : null}
        </div>

        <div className="flex items-baseline justify-between gap-2 border-y border-black py-1">
          <span className="ethiopic text-sm font-bold">{t.sell.total}</span>
          <span className="num shrink-0 text-sm font-bold">{formatETB(sale.total)}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <Row
            label={t.receipt.paymentMethod}
            value={t.payment[sale.payment_method]}
            valueClass="ethiopic"
          />
          {sale.cash_received !== null ? (
            <>
              <Row label={t.sell.received} value={formatETB(sale.cash_received)} />
              <Row label={t.sell.change} value={formatETB(change ?? 0)} strong />
            </>
          ) : null}
        </div>

        <Rule />

        <footer className="flex flex-col items-center gap-0.5 pt-1 text-center">
          <span className="ethiopic font-medium">
            {settings.receipt_footer_am || t.receipt.thankYou}
          </span>
          {settings.receipt_footer ? <span>{settings.receipt_footer}</span> : null}
        </footer>
      </div>
    </>
  );
}

function Rule() {
  return <div className="border-t border-dashed border-black" />;
}

function Line({ label }: { label: React.ReactNode }) {
  return <div className="flex justify-between gap-2">{label}</div>;
}

function Row({
  label,
  value,
  valueClass = 'num',
  strong,
}: {
  label: string;
  value: string;
  valueClass?: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${strong ? 'font-bold' : ''}`}>
      <span className="ethiopic">{label}</span>
      <span className={`${valueClass} shrink-0`}>{value}</span>
    </div>
  );
}
