'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Product, Unit } from '@/lib/db';
import { parseETB } from '@/lib/format';

export interface CartItem {
  product_id: string;
  name_am: string;
  name: string;
  unit: Unit;
  /** integer cents, snapshotted when the line was added */
  unit_price: number;
  qty: number;
}

export type DiscountMode = 'amount' | 'percent';

export interface CartTotals {
  subtotal: number;
  discount: number;
  total: number;
}

/**
 * Pure, so the money path can be tested without rendering anything.
 *
 * A malformed discount is treated as zero rather than throwing: the cashier is
 * mid-keystroke, and a half-typed "1." must not take the total down with it.
 * The discount is always clamped to the subtotal — the repository would reject
 * an over-large one anyway, but the total should never render as negative.
 */
export function computeTotals(
  items: CartItem[],
  discountMode: DiscountMode,
  discountInput: string,
): CartTotals {
  const subtotal = items.reduce((sum, item) => sum + Math.round(item.unit_price * item.qty), 0);

  let discount = 0;
  const raw = discountInput.trim();

  if (raw !== '') {
    if (discountMode === 'amount') {
      try {
        discount = parseETB(raw);
      } catch {
        discount = 0;
      }
    } else {
      const percent = Number(raw);
      if (Number.isFinite(percent) && percent > 0) {
        discount = Math.round((subtotal * Math.min(percent, 100)) / 100);
      }
    }
  }

  discount = Math.max(0, Math.min(discount, subtotal));

  return { subtotal, discount, total: subtotal - discount };
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discountMode, setDiscountMode] = useState<DiscountMode>('amount');
  const [discountInput, setDiscountInput] = useState('');

  /** Same product twice becomes one line with a bigger qty — and so one movement. */
  const add = useCallback((product: Product, qty = 1) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.product_id === product.id);

      if (index >= 0) {
        const next = [...current];
        const existing = next[index] as CartItem;
        next[index] = { ...existing, qty: existing.qty + qty };
        return next;
      }

      return [
        ...current,
        {
          product_id: product.id,
          name_am: product.name_am,
          name: product.name,
          unit: product.unit,
          unit_price: product.sell_price,
          qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((current) =>
      qty <= 0
        ? current.filter((item) => item.product_id !== productId)
        : current.map((item) => (item.product_id === productId ? { ...item, qty } : item)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.product_id !== productId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setDiscountInput('');
  }, []);

  const totals = useMemo<CartTotals>(
    () => computeTotals(items, discountMode, discountInput),
    [items, discountMode, discountInput],
  );

  return {
    items,
    add,
    setQty,
    remove,
    clear,
    totals,
    discountMode,
    setDiscountMode,
    discountInput,
    setDiscountInput,
  };
}
