'use client';

import type { Product } from '@/lib/db';
import { formatETB, formatQty } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { CartItem } from '@/lib/sell/useCart';

const STEP = 'flex size-touch shrink-0 items-center justify-center rounded-lg border border-rule text-xl leading-none font-semibold';

export function CartLines({
  items,
  products,
  onHand,
  onSetQty,
  onRemove,
}: {
  items: CartItem[];
  products: Map<string, Product>;
  onHand: Map<string, number>;
  onSetQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
}) {
  const t = useT();

  return (
    <ul className="flex flex-col divide-y divide-rule">
      {items.map((item) => {
        const product = products.get(item.product_id);
        const available = onHand.get(item.product_id) ?? 0;
        const remaining = available - item.qty;

        // Both allowed on purpose. Shops miscount, and blocking a real sale
        // over a data discrepancy is how software gets abandoned.
        const oversold = remaining < 0;
        const low = !oversold && product !== undefined && remaining <= product.reorder_level;

        return (
          <li key={item.product_id} className="flex flex-col gap-2 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="ethiopic text-sm leading-snug font-medium">{item.name_am}</span>
              <button
                type="button"
                onClick={() => onRemove(item.product_id)}
                aria-label={`${t.sell.remove} ${item.name}`}
                className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted"
              >
                ×
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={STEP}
                  onClick={() => onSetQty(item.product_id, item.qty - 1)}
                  aria-label="−"
                >
                  −
                </button>
                <span className="num w-10 text-center text-lg font-semibold">
                  {formatQty(item.qty)}
                </span>
                <button
                  type="button"
                  className={STEP}
                  onClick={() => onSetQty(item.product_id, item.qty + 1)}
                  aria-label="+"
                >
                  +
                </button>
              </div>

              <div className="flex flex-col items-end leading-tight">
                <span className="num text-base font-semibold">
                  {formatETB(Math.round(item.unit_price * item.qty))}
                </span>
                <span className="num text-xs text-muted">
                  {formatQty(item.qty)} × {formatETB(item.unit_price)}
                </span>
              </div>
            </div>

            {oversold ? (
              <span className="ethiopic text-xs font-medium text-ochre-ink">{t.sell.negativeStock}</span>
            ) : low ? (
              <span className="ethiopic text-xs text-ochre-ink">{t.sell.lowStockHint}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
