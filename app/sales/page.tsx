'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { salesRepo } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { saleHref } from '@/lib/routes';
import { groupByDay } from '@/lib/sales/grouping';

/**
 * Sales rendered per step. A year of trading is thousands of rows; a cheap
 * phone should draw today's, not all of them, and fetch older days on request.
 */
const PAGE_SIZE = 100;

export default function SalesHistoryPage() {
  const t = useT();
  const [term, setTerm] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const needle = term.trim();

  const page = useLiveQuery(async () => {
    const { sales, hasMore } = needle
      ? await salesRepo
          .searchByReceipt(needle, limit + 1)
          .then((found) => ({ sales: found.slice(0, limit), hasMore: found.length > limit }))
      : await salesRepo.history(limit);

    // A sale is voided when some other row points at it. Asked of the index,
    // because a search result's void row need not be among the rows shown.
    const voidedIds = await salesRepo.voidedAmong(sales.map((sale) => sale.id));
    return { sales, hasMore, voidedIds };
  }, [needle, limit]);

  const sales = page?.sales;
  const voidedIds = page?.voidedIds ?? new Set<string>();

  const days = useMemo(() => groupByDay(sales ?? []), [sales]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="ethiopic text-2xl font-semibold">{t.sales.title}</h1>

      <TextInput
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setLimit(PAGE_SIZE);
        }}
        placeholder={t.sales.searchPlaceholder}
        aria-label={t.sales.searchPlaceholder}
        className="num"
      />

      {sales === undefined ? null : days.length === 0 ? (
        <p className="ethiopic py-8 text-center text-sm text-muted">
          {needle === '' ? t.sales.empty : t.sales.noResults}
        </p>
      ) : (
        days.map((day) => (
          <section key={day.date} className="flex flex-col gap-1">
            <header className="flex items-baseline justify-between gap-3 border-b border-rule pb-1">
              <span className="num text-sm font-semibold">{day.date}</span>
              <span className="flex items-baseline gap-3">
                <span className="ethiopic text-xs text-muted">{t.sales.saleCount(day.count)}</span>
                <span className="num text-base font-semibold">{formatETB(day.total)}</span>
              </span>
            </header>

            <ul className="flex flex-col divide-y divide-rule">
              {day.sales.map((sale) => {
                const isVoidRow = sale.voids_sale_id !== null;
                const isVoided = voidedIds.has(sale.id);

                return (
                  <li key={sale.id}>
                    <Link
                      href={saleHref(sale.id)}
                      className="flex min-h-touch items-center justify-between gap-3 py-2"
                    >
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="num text-sm font-medium">{sale.receipt_no}</span>
                        <span className="num text-xs text-muted">
                          {formatDateTime(sale.created_at).slice(11)}
                        </span>
                      </span>

                      <span className="flex items-center gap-3">
                        {isVoidRow ? (
                          <span className="ethiopic text-xs font-medium text-ochre-ink">
                            {t.sales.voidRow}
                          </span>
                        ) : isVoided ? (
                          <span className="ethiopic text-xs font-medium text-ochre-ink">
                            {t.sales.voided}
                          </span>
                        ) : (
                          <span className="ethiopic text-xs text-muted">
                            {t.payment[sale.payment_method]}
                          </span>
                        )}
                        <span
                          className={`num text-base font-semibold ${
                            isVoidRow || isVoided ? 'text-muted line-through' : ''
                          }`}
                        >
                          {formatETB(sale.total)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {page?.hasMore ? (
        <Button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
          <span className="ethiopic">{t.sales.showMore}</span>
        </Button>
      ) : null}
    </div>
  );
}
