'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartLines } from '@/components/sell/CartLines';
import { PaymentPanel } from '@/components/sell/PaymentPanel';
import { ProductTile } from '@/components/sell/ProductTile';
import { ensureDevice, productsRepo, salesRepo, stockRepo } from '@/lib/db';
import type { PaymentMethod, Product } from '@/lib/db';
import { formatETB, parseETBOrZero } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { saleHref } from '@/lib/routes';
import { useCart } from '@/lib/sell/useCart';

/** Shorter than this and a search term could collide with a real barcode. */
const MIN_BARCODE_LENGTH = 6;

export default function SellPage() {
  const t = useT();
  const cart = useCart();
  const searchRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState('');
  const [receipt, setReceipt] = useState<{ id: string; receipt_no: string }>();
  const [busy, setBusy] = useState(false);

  const products = useLiveQuery(() => productsRepo.list(), []);
  const onHand = useLiveQuery(() => stockRepo.onHandAll(), []);
  const recent = useLiveQuery(() => salesRepo.recentProductIds(), []);

  const productsById = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product])),
    [products],
  );

  /** A scanner types into whatever has focus, so focus discipline is the feature. */
  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  const addProduct = useCallback(
    (product: Product) => {
      cart.add(product);
      setTerm('');
      focusSearch();
    },
    [cart, focusSearch],
  );

  const tiles = useMemo(() => {
    if (!products) return [];

    const needle = term.trim().toLowerCase();

    if (needle) {
      return products.filter(
        (product) =>
          product.name.toLowerCase().includes(needle) ||
          product.name_am.toLowerCase().includes(needle) ||
          (product.barcode?.toLowerCase().includes(needle) ?? false),
      );
    }

    // No search term: most recently sold float to the top.
    const rank = new Map((recent ?? []).map((id, index) => [id, index]));

    return [...products].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.name_am.localeCompare(b.name_am, 'am'),
    );
  }, [products, term, recent]);

  /** Exact barcode match adds straight to the cart. No confirmation step. */
  async function handleTermChange(value: string) {
    setTerm(value);

    const trimmed = value.trim();
    if (trimmed.length < MIN_BARCODE_LENGTH) return;

    const scanned = await productsRepo.getByBarcode(trimmed);
    if (scanned) addProduct(scanned);
  }

  async function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const trimmed = term.trim();
    if (!trimmed) return;

    const scanned = await productsRepo.getByBarcode(trimmed);
    if (scanned) {
      addProduct(scanned);
      return;
    }

    // One obvious match is not a decision worth making twice.
    if (tiles.length === 1 && tiles[0]) addProduct(tiles[0]);
  }

  const complete = useCallback(async () => {
    if (cart.items.length === 0 || busy) return;

    setBusy(true);
    try {
      await ensureDevice();

      // One call. Sale, items and negative movements in a single transaction,
      // and nothing here awaits the network.
      const sale = await salesRepo.create(
        cart.items.map((item) => ({
          product_id: item.product_id,
          name_snapshot: item.name_am,
          unit_price: item.unit_price,
          qty: item.qty,
        })),
        {
          method,
          discount: cart.totals.discount,
          // Recorded so a reprint can still show the change given.
          cash_received: method === 'cash' ? parseETBOrZero(received) : undefined,
        },
      );

      setReceipt({ id: sale.id, receipt_no: sale.receipt_no });
      cart.clear();
      setReceived('');
      setTerm('');
      focusSearch();
    } finally {
      setBusy(false);
    }
  }, [busy, cart, focusSearch, method, received]);

  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(undefined), 2500);
    return () => clearTimeout(timer);
  }, [receipt]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'F2') {
        event.preventDefault();
        focusSearch();
      } else if (event.key === 'F4') {
        event.preventDefault();
        void complete();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cart.clear();
        focusSearch();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cart, complete, focusSearch]);

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <section className="flex min-w-0 flex-col gap-3">
        <input
          ref={searchRef}
          type="text"
          value={term}
          onChange={(event) => void handleTermChange(event.target.value)}
          onKeyDown={(event) => void handleSearchKeyDown(event)}
          placeholder={t.sell.searchPlaceholder}
          aria-label={t.sell.searchPlaceholder}
          autoComplete="off"
          className="ethiopic min-h-touch w-full rounded-xl border border-rule bg-paper px-4 text-base placeholder:text-muted"
        />

        {products === undefined ? null : tiles.length === 0 ? (
          <p className="ethiopic py-8 text-center text-sm text-muted">
            {products.length === 0 ? t.sell.noProducts : t.products.noResults}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {tiles.map((product) => (
              <li key={product.id} className="flex">
                <ProductTile
                  product={product}
                  onHand={onHand?.get(product.id) ?? 0}
                  onAdd={() => addProduct(product)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        {/* The live region is always mounted so a screen reader announces the
            confirmation when it appears, not only when it already exists. */}
        <div role="status" aria-live="polite" className="empty:hidden">
          {receipt ? (
            <Link
              href={saleHref(receipt.id)}
              className="flex items-center justify-between gap-2 rounded-lg border border-birr/30 bg-birr/10 px-3 py-2 text-birr-ink"
            >
              <span className="ethiopic text-sm font-medium">{t.sell.completed}</span>
              <span className="num text-sm font-semibold">{receipt.receipt_no}</span>
            </Link>
          ) : null}
        </div>

        {cart.items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-rule px-4 py-10 text-center">
            <p className="ethiopic text-sm font-medium">{t.sell.cartEmpty}</p>
            <p className="ethiopic text-xs text-muted">{t.sell.cartEmptyHint}</p>
          </div>
        ) : (
          <CartLines
            items={cart.items}
            products={productsById}
            onHand={onHand ?? new Map()}
            onSetQty={cart.setQty}
            onRemove={cart.remove}
          />
        )}

        <div className="flex flex-col gap-2 border-t border-rule pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="ethiopic text-sm text-muted">{t.sell.subtotal}</span>
            <span className="num text-base">{formatETB(cart.totals.subtotal)}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="ethiopic text-sm text-muted">{t.sell.discount}</span>

            <div className="flex items-center gap-1">
              {(['amount', 'percent'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => cart.setDiscountMode(mode)}
                  aria-pressed={cart.discountMode === mode}
                  className={`ethiopic rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                    cart.discountMode === mode
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule text-muted'
                  }`}
                >
                  {mode === 'amount' ? t.sell.amount : t.sell.percent}
                </button>
              ))}
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={cart.discountInput}
                onChange={(event) => cart.setDiscountInput(event.target.value)}
                aria-label={t.sell.discount}
                placeholder="0"
                className="num w-20 rounded-lg border border-rule bg-paper px-2 py-1.5 text-right"
              />
            </div>
          </div>

          {/* The largest thing on screen, readable from the customer's side. */}
          <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-3">
            <span className="ethiopic text-base font-medium">{t.sell.total}</span>
            <span className="num text-5xl leading-none font-semibold">
              {formatETB(cart.totals.total)}
            </span>
          </div>
        </div>

        <PaymentPanel
          method={method}
          onMethod={setMethod}
          total={cart.totals.total}
          received={received}
          onReceived={setReceived}
          onPay={() => void complete()}
          disabled={busy || cart.items.length === 0}
        />

        {cart.items.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              cart.clear();
              focusSearch();
            }}
            className="ethiopic min-h-touch rounded-lg border border-rule text-sm text-muted"
          >
            {t.sell.clear}
          </button>
        ) : null}
      </aside>
    </div>
  );
}
