'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db, priceChangesBetween } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { productHref } from '@/lib/routes';

/**
 * Which prices moved in the chosen period, across every product, so the
 * owner spots a change they did not make. Each row opens the product, where
 * its full history is.
 */
export function PeriodPriceChanges({ from, to }: { from: string; to: string }) {
  const t = useT();
  const rows = useLiveQuery(async () => {
    const changes = await priceChangesBetween(from, to);
    // Deleted products still have a name worth showing, so read them by id.
    const products = await db.products.bulkGet([...new Set(changes.map((c) => c.product_id))]);
    const names = new Map(products.flatMap((p) => (p ? [[p.id, p.name_am] as const] : [])));
    return changes.map((change) => ({ change, name: names.get(change.product_id) ?? '' }));
  }, [from, to]);

  if (rows === undefined) return null;

  return (
    <section data-print-hide="" className="flex flex-col gap-3" data-testid="period-price-changes">
      <h2 className="ethiopic text-lg font-semibold">{t.reports.priceChanges}</h2>

      {rows.length === 0 ? (
        <p className="ethiopic text-sm text-muted">{t.reports.noPriceChanges}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {rows.map(({ change, name }) => (
            <li key={change.id}>
              <Link
                href={productHref(change.product_id)}
                className="flex min-h-touch items-center justify-between gap-3 py-2"
              >
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="ethiopic truncate text-sm">{name}</span>
                  <span className="num text-xs text-muted">{formatDateTime(change.changed_at)}</span>
                </span>
                <span className="num shrink-0 text-sm">
                  {change.old_sell_price !== change.new_sell_price ? (
                    <>
                      <span className="text-muted line-through">{formatETB(change.old_sell_price)}</span>
                      <span aria-hidden="true"> → </span>
                      <span className="font-semibold">{formatETB(change.new_sell_price)}</span>
                    </>
                  ) : (
                    <span className="ethiopic text-xs text-muted">{t.priceHistory.cost}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
