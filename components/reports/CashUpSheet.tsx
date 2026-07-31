'use client';

import type { ShopSettings } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { CashUp } from '@/lib/reports/compute';

/**
 * End-of-day summary on the same thermal paper as a receipt, so it can be
 * torn off and left in the drawer. Reuses the receipt's sheet conventions:
 * the @page size comes from the printer_width setting, and app chrome is
 * hidden by data-print-hide elsewhere.
 */
export function CashUpSheet({
  cashUp,
  settings,
  date,
}: {
  cashUp: CashUp;
  settings: ShopSettings;
  date: string;
}) {
  const t = useT();
  const width = settings.printer_width;
  const variance = cashUp.variance;

  return (
    <>
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
          <span className="ethiopic font-bold">{t.reports.cashUp}</span>
          <span className="num">{formatDateTime(date)}</span>
        </header>

        <div className="border-t border-dashed border-black" />

        <div className="flex flex-col gap-0.5">
          <Row label={t.reports.openingFloat} value={formatETB(cashUp.openingFloat)} />
          <Row label={t.reports.cashSales} value={formatETB(cashUp.cashSales)} />
        </div>

        <div className="flex items-baseline justify-between gap-2 border-y border-black py-1">
          <span className="ethiopic font-bold">{t.reports.expectedDrawer}</span>
          <span className="num shrink-0 font-bold">{formatETB(cashUp.expected)}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <Row
            label={t.reports.countedDrawer}
            value={cashUp.counted === null ? '—' : formatETB(cashUp.counted)}
          />
          <Row
            label={t.reports.variance}
            value={variance === null ? '—' : formatETB(variance)}
            strong
          />
        </div>

        {variance !== null ? (
          <p className="ethiopic text-center font-medium">
            {variance === 0
              ? t.reports.balanced
              : `${formatETB(Math.abs(variance))} ${variance < 0 ? t.reports.short : t.reports.over}`}
          </p>
        ) : null}

        <div className="border-t border-dashed border-black" />

        <footer className="flex flex-col gap-3 pt-2">
          <span className="ethiopic">____________________</span>
        </footer>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${strong ? 'font-bold' : ''}`}>
      <span className="ethiopic">{label}</span>
      <span className="num shrink-0">{value}</span>
    </div>
  );
}
