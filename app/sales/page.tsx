'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TextInput } from '@/components/ui/Field';
import { salesRepo } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { saleHref } from '@/lib/routes';
import { groupByDay } from '@/lib/sales/grouping';

export default function SalesHistoryPage() {
  const t = useT();
  const [term, setTerm] = useState('');

  const sales = useLiveQuery(() => salesRepo.list(), []);

  /** A sale is voided when some other row points at it. */
  const voidedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sale of sales ?? []) {
      if (sale.voids_sale_id) ids.add(sale.voids_sale_id);
    }
    return ids;
  }, [sales]);

  const days = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const filtered = needle
      ? (sales ?? []).filter((sale) => sale.receipt_no.toLowerCase().includes(needle))
      : (sales ?? []);

    return groupByDay(filtered);
  }, [sales, term]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="ethiopic text-2xl font-semibold">{t.sales.title}</h1>

      <TextInput
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t.sales.searchPlaceholder}
        aria-label={t.sales.searchPlaceholder}
        className="num"
      />

      {sales === undefined ? null : days.length === 0 ? (
        <p className="ethiopic py-8 text-center text-sm text-muted">
          {sales.length === 0 ? t.sales.empty : t.sales.noResults}
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
                          <span className="ethiopic text-xs font-medium text-ochre">
                            {t.sales.voidRow}
                          </span>
                        ) : isVoided ? (
                          <span className="ethiopic text-xs font-medium text-ochre">
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
    </div>
  );
}
