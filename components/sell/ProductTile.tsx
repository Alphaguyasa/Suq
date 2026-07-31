'use client';

import type { Product } from '@/lib/db';
import { formatETB, formatQty } from '@/lib/format';
import { useT } from '@/lib/i18n';

/**
 * A tile, not a list row. Recognition beats reading when you have rung up the
 * same twelve items every morning for a year.
 */
export function ProductTile({
  product,
  onHand,
  onAdd,
}: {
  product: Product;
  onHand: number;
  onAdd: () => void;
}) {
  const t = useT();
  const low = onHand <= product.reorder_level;

  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex h-full min-h-28 w-full flex-col justify-between gap-2 rounded-xl border border-rule bg-paper p-3 text-left transition-colors active:border-ink active:bg-rule/40"
    >
      <span className="ethiopic line-clamp-2 text-sm leading-snug font-semibold">
        {product.name_am}
      </span>

      <div className="flex items-end justify-between gap-2">
        <span className="num text-base leading-none font-semibold">
          {formatETB(product.sell_price)}
        </span>
        <span
          className={`num text-xs leading-none ${low ? 'font-semibold text-ochre' : 'text-muted'}`}
          title={low ? t.products.lowStock : undefined}
        >
          {formatQty(onHand)}
        </span>
      </div>
    </button>
  );
}
