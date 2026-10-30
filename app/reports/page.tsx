'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BarChart } from '@/components/reports/BarChart';
import { CashUpSheet } from '@/components/reports/CashUpSheet';
import { LineChart } from '@/components/reports/LineChart';
import { ShareReceiptButton } from '@/components/ShareReceiptButton';
import { Button } from '@/components/ui/Button';
import { NumberInput } from '@/components/ui/Field';
import { getSettings, productsRepo, salesRepo, stockRepo } from '@/lib/db';
import type { PaymentMethod, Sale, SaleItem } from '@/lib/db';
import { formatETB, formatQty, parseETBOrZero } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { cashUpText } from '@/lib/reports/cashup-text';
import { productStockHref } from '@/lib/routes';
import {
  cashUp,
  changeVsPrevious,
  dailyTotals,
  hourlyTotals,
  lowStock,
  summarise,
  topProducts,
} from '@/lib/reports/compute';
import type { PeriodKey } from '@/lib/reports/period';
import { daysIn, periodFor, previousPeriod } from '@/lib/reports/period';

const PERIODS: PeriodKey[] = ['today', 'week', 'month'];
const METHODS: PaymentMethod[] = ['cash', 'telebirr', 'card', 'credit'];
const EMPTY: Sale[] = [];
const EMPTY_ITEMS: SaleItem[] = [];

export default function ReportsPage() {
  const t = useT();
  const [periodKey, setPeriodKey] = useState<PeriodKey>('today');
  const [rankBy, setRankBy] = useState<'revenue' | 'units'>('revenue');
  const [floatInput, setFloatInput] = useState('');
  const [countedInput, setCountedInput] = useState('');

  const period = useMemo(() => periodFor(periodKey), [periodKey]);
  const prior = useMemo(() => previousPeriod(periodKey), [periodKey]);

  // Everything reads local Dexie, so reports work offline like the rest.
  // Only the two periods on screen are read, through the created_at index,
  // not every sale and line the shop ever recorded.
  const current = useLiveQuery(async () => {
    const sales = await salesRepo.between(period.from, period.to);
    const items = await salesRepo.itemsForSales(sales.map((sale) => sale.id));
    return { sales, items };
  }, [period]);
  const inPrior = useLiveQuery(() => salesRepo.between(prior.from, prior.to), [prior]) ?? EMPTY;
  const products = useLiveQuery(() => productsRepo.list(), []);
  const onHand = useLiveQuery(() => stockRepo.cachedOnHandAll(), []);
  const settings = useLiveQuery(() => getSettings(), []);

  const inPeriod = current?.sales ?? EMPTY;
  const periodItems = current?.items ?? EMPTY_ITEMS;

  const costByProduct = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product.cost_price])),
    [products],
  );

  const summary = useMemo(
    () => summarise(inPeriod, periodItems, costByProduct),
    [inPeriod, periodItems, costByProduct],
  );

  const priorNet = useMemo(
    () => inPrior.reduce((sum, sale) => sum + sale.total, 0),
    [inPrior],
  );
  const change = changeVsPrevious(summary.net, priorNet);

  const low = useMemo(
    () => lowStock(products ?? [], onHand ?? new Map()),
    [products, onHand],
  );
  const ranked = useMemo(() => topProducts(periodItems, rankBy), [periodItems, rankBy]);

  const drawer = useMemo(
    () =>
      cashUp(
        inPeriod,
        parseETBOrZero(floatInput),
        countedInput.trim() === '' ? null : parseETBOrZero(countedInput),
      ),
    [inPeriod, floatInput, countedInput],
  );

  if (current === undefined || settings === undefined) return null;

  return (
    <div className="flex flex-col gap-8">
      <header data-print-hide="" className="flex flex-col gap-3">
        <h1 className="ethiopic text-2xl font-semibold">{t.reports.title}</h1>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriodKey(key)}
              aria-pressed={periodKey === key}
              className={`ethiopic min-h-touch min-w-touch rounded-full border px-4 text-sm font-medium ${
                periodKey === key ? 'border-ink bg-ink text-paper' : 'border-rule text-muted'
              }`}
            >
              {t.reports[key]}
            </button>
          ))}

          <Link
            href="/sales"
            className="ethiopic ml-auto min-h-touch content-center rounded-full border border-rule px-4 text-sm text-muted"
          >
            {t.sales.title}
          </Link>
        </div>
      </header>

      <section data-print-hide="" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.reports.netSales} value={formatETB(summary.net)} change={change} large />
        <Stat label={t.reports.transactions} value={String(summary.transactions)} />
        <Stat label={t.reports.averageBasket} value={formatETB(summary.averageBasket)} />
        <Stat label={t.reports.grossProfit} value={formatETB(summary.grossProfit)} />
      </section>

      <section data-print-hide="" className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="ethiopic text-lg font-semibold">
            {periodKey === 'today' ? t.reports.hourly : t.reports.daily}
          </h2>

          {periodKey === 'today' ? (
            <BarChart
              values={hourlyTotals(inPeriod)}
              labelFor={(hour) => `${String(hour).padStart(2, '0')}:00`}
              formatValue={formatETB}
              ariaLabel={`${t.reports.hourly} — ${t.reports.netSales}`}
            />
          ) : (
            <LineChart
              points={dailyTotals(inPeriod, daysIn(period))}
              labelFor={(date) => date.slice(5)}
              formatValue={formatETB}
              ariaLabel={`${t.reports.daily} — ${t.reports.netSales}`}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="ethiopic text-lg font-semibold">{t.reports.byPaymentMethod}</h2>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {METHODS.filter((method) => summary.byMethod[method] !== 0).map((method) => (
              <li key={method} className="flex items-baseline justify-between gap-3 py-2">
                <span className="ethiopic text-sm">{t.payment[method]}</span>
                <span className="num text-base font-semibold">
                  {formatETB(summary.byMethod[method])}
                </span>
              </li>
            ))}
            {METHODS.every((method) => summary.byMethod[method] === 0) ? (
              <li className="ethiopic py-3 text-sm text-muted">{t.reports.noData}</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section data-print-hide="" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="ethiopic text-lg font-semibold">{t.reports.topProducts}</h2>
          <div className="flex gap-1">
            {(
              [
                ['revenue', t.reports.byRevenue],
                ['units', t.reports.byUnits],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRankBy(key)}
                aria-pressed={rankBy === key}
                className={`ethiopic min-h-touch min-w-touch rounded-full border px-4 text-sm font-medium ${
                  rankBy === key ? 'border-ink bg-ink text-paper' : 'border-rule text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {ranked.length === 0 ? (
          <p className="ethiopic text-sm text-muted">{t.reports.noData}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {ranked.slice(0, 10).map((row) => {
              const top = rankBy === 'revenue' ? ranked[0]?.revenue : ranked[0]?.units;
              const value = rankBy === 'revenue' ? row.revenue : row.units;
              const share = top ? Math.max(2, Math.round((value / top) * 100)) : 0;

              return (
                <li key={row.product_id} className="flex flex-col gap-1 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="ethiopic text-sm">{row.name_am}</span>
                    <span className="num text-sm font-semibold">
                      {rankBy === 'revenue' ? formatETB(row.revenue) : formatQty(row.units)}
                    </span>
                  </div>
                  <div
                    className="h-1 rounded-full bg-birr-data"
                    style={{ width: `${share}%` }}
                    aria-hidden="true"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-print-hide="" className="flex flex-col gap-3">
        <h2 className="ethiopic text-lg font-semibold">{t.reports.lowStock}</h2>

        {low.length === 0 ? (
          <p className="ethiopic text-sm text-muted">{t.reports.nothingLow}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {low.map((row) => (
              <li key={row.product.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="ethiopic truncate text-sm">{row.product.name_am}</span>
                  <span className="num text-xs text-muted">
                    {formatQty(row.onHand)} / {formatQty(row.product.reorder_level)}
                  </span>
                </span>

                <Link
                  href={productStockHref(row.product.id)}
                  className="ethiopic min-h-touch shrink-0 content-center rounded-lg border border-rule px-3 text-sm"
                >
                  {t.stock.restock}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 data-print-hide="" className="ethiopic text-lg font-semibold">
          {t.reports.cashUp}
        </h2>

        <div data-print-hide="" className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="ethiopic text-sm font-medium">{t.reports.openingFloat}</span>
            <NumberInput
              value={floatInput}
              placeholder="0.00"
              onChange={(event) => setFloatInput(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="ethiopic text-sm font-medium">{t.reports.countedDrawer}</span>
            <NumberInput
              value={countedInput}
              placeholder="0.00"
              onChange={(event) => setCountedInput(event.target.value)}
            />
          </label>
        </div>

        <CashUpSheet cashUp={drawer} settings={settings} date={period.from} />

        <div data-print-hide="" className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" onClick={() => window.print()}>
            <span className="ethiopic">{t.reports.printCashUp}</span>
          </Button>
          <ShareReceiptButton
            title={`${t.reports.cashUp} · ${t.reports[periodKey]}`}
            text={cashUpText({
              cashUp: drawer,
              summary,
              settings,
              t,
              periodLabel: t.reports[periodKey],
              date: period.from,
            })}
            label={t.reports.shareCashUp}
            copiedMessage={t.reports.cashUpCopied}
          />
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  change,
  large,
}: {
  label: string;
  value: string;
  change?: number | null;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-rule p-3">
      <span className="ethiopic text-xs text-muted">{label}</span>
      <span className={`num leading-none font-semibold ${large ? 'text-2xl' : 'text-xl'}`}>
        {value}
      </span>
      {change !== null && change !== undefined ? (
        <span className="num text-xs text-muted">
          {change > 0 ? '+' : ''}
          {change}%
        </span>
      ) : null}
    </div>
  );
}
