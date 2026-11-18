'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { listPriceChanges } from '@/lib/db';
import type { PriceChange } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';

/**
 * Read-only: every sell or cost price this product has had, newest first,
 * with who changed it. Products only hold the latest price, so this is the
 * owner's answer to "since when is sugar this price, and who set it?".
 */
export function PriceHistory({ productId }: { productId: string }) {
  const t = useT();
  const changes = useLiveQuery(() => listPriceChanges(productId), [productId]);

  if (changes === undefined) return null;

  return (
    <section aria-labelledby="price-history-title" className="flex flex-col gap-3">
      <h2 id="price-history-title" className="ethiopic text-lg font-semibold">
        {t.priceHistory.title}
      </h2>

      {changes.length === 0 ? (
        <p className="ethiopic text-sm text-muted" data-testid="price-history-empty">
          {t.priceHistory.empty}
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule" data-testid="price-history">
          {changes.map((change) => (
            <PriceChangeRow key={change.id} change={change} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PriceChangeRow({ change }: { change: PriceChange }) {
  const t = useT();
  const who =
    change.source === 'other_till'
      ? t.priceHistory.byOtherTill
      : change.cashier_name
        ? t.priceHistory.by(change.cashier_name)
        : null;

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="num text-xs text-muted">{formatDateTime(change.changed_at)}</span>
        {who ? <span className="ethiopic text-xs text-muted">{who}</span> : null}
      </div>
      {change.old_sell_price !== change.new_sell_price ? (
        <PriceLine label={t.priceHistory.sell} from={change.old_sell_price} to={change.new_sell_price} />
      ) : null}
      {change.old_cost_price !== change.new_cost_price ? (
        <PriceLine label={t.priceHistory.cost} from={change.old_cost_price} to={change.new_cost_price} />
      ) : null}
    </li>
  );
}

function PriceLine({ label, from, to }: { label: string; from: number; to: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="ethiopic text-sm">{label}</span>
      <span className="num text-sm">
        <span className="text-muted line-through">{formatETB(from)}</span>
        <span aria-hidden="true"> → </span>
        <span className="font-semibold">{formatETB(to)}</span>
      </span>
    </div>
  );
}
