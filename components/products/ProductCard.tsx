'use client';

import Link from 'next/link';
import type { Product } from '@/lib/db';
import { formatETB, formatQty } from '@/lib/format';
import { useT } from '@/lib/i18n';

export function ProductCard({ product, onHand }: { product: Product; onHand: number }) {
  const t = useT();
  const low = onHand <= product.reorder_level;

  return (
    <Link
      href={`/products/${product.id}`}
      className="flex h-full w-full flex-col gap-1 rounded-xl border border-rule bg-paper p-3 transition-colors hover:border-ink"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="ethiopic text-base leading-snug font-semibold">{product.name_am}</span>
        {low ? (
          <span
            role="img"
            aria-label={t.products.lowStock}
            title={t.products.lowStock}
            className="mt-1.5 size-2.5 shrink-0 rounded-full bg-ochre"
          />
        ) : null}
      </div>

      <span className="truncate text-xs text-muted">{product.name}</span>

      {!product.is_active ? (
        <span className="ethiopic text-xs text-muted">{t.products.inactive}</span>
      ) : null}

      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="num text-lg leading-none font-semibold">
          {formatETB(product.sell_price)}
        </span>
        <span
          className={`num text-sm leading-none ${low ? 'font-semibold text-ochre' : 'text-muted'}`}
        >
          {formatQty(onHand)}
          <span className="ethiopic ml-1 text-xs">{t.units[product.unit]}</span>
        </span>
      </div>
    </Link>
  );
}
