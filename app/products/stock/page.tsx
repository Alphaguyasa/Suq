'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field';
import { productsRepo, stockRepo } from '@/lib/db';
import type { MovementReason, StockMovement } from '@/lib/db';
import { formatDateTime, formatQty } from '@/lib/format';
import { useBilingual, useT } from '@/lib/i18n';
import { productHref } from '@/lib/routes';

type AdjustReason = Extract<MovementReason, 'adjustment' | 'damage' | 'return'>;
const ADJUST_REASONS: AdjustReason[] = ['adjustment', 'damage', 'return'];

/**
 * A static shell: the id comes from the query string so the service worker can
 * precache this page and open any product's stock offline (lib/routes.ts).
 * useSearchParams needs a Suspense boundary to prerender.
 */
export default function ProductStockPage() {
  return (
    <Suspense fallback={null}>
      <ProductStockFromQuery />
    </Suspense>
  );
}

function ProductStockFromQuery() {
  const id = useSearchParams().get('id') ?? '';
  // Keyed so a form half-filled for one id never carries over to the next.
  return <ProductStock key={id} id={id} />;
}

function ProductStock({ id }: { id: string }) {
  const t = useT();

  const product = useLiveQuery(async () => (await productsRepo.getById(id)) ?? null, [id]);
  const onHand = useLiveQuery(() => stockRepo.onHand(id), [id]);
  const movements = useLiveQuery(() => stockRepo.movementsFor(id), [id]);

  if (product === undefined) return null;
  if (product === null) {
    return <p className="ethiopic text-sm text-muted">{t.products.noResults}</p>;
  }

  const current = onHand ?? 0;
  const low = current <= product.reorder_level;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href={productHref(id)} className="ethiopic text-xs text-muted">
          {product.name_am}
        </Link>

        <div className="flex items-baseline justify-between gap-3">
          <h1 className="ethiopic text-2xl font-semibold">{t.stock.title}</h1>
          <span className={`num text-4xl font-semibold ${low ? 'text-ochre' : 'text-ink'}`}>
            {formatQty(current)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="ethiopic text-xs text-muted">{t.stock.currentOnHand}</span>
          {low ? (
            <span className="ethiopic text-xs font-medium text-ochre">{t.products.lowStock}</span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <RestockForm productId={id} />
        <AdjustForm productId={id} current={current} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="ethiopic text-lg font-semibold">{t.stock.history}</h2>
        <MovementList movements={movements ?? []} />
      </section>
    </div>
  );
}

function RestockForm({ productId }: { productId: string }) {
  const { t, other } = useBilingual();
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const value = Number(qty.trim());
    if (!Number.isFinite(value) || value <= 0) {
      setError(t.productForm.invalidNumber);
      return;
    }

    setError(undefined);
    setBusy(true);
    try {
      await stockRepo.restock({ productId, qty: value, note: note.trim() || undefined });
      setQty('');
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-rule p-4"
    >
      <h2 className="ethiopic text-base font-semibold">{t.stock.restock}</h2>

      <Field htmlFor="r-qty" label={t.stock.qty} sublabel={other.stock.qty} error={error}>
        <NumberInput
          id="r-qty"
          value={qty}
          placeholder="0"
          invalid={Boolean(error)}
          onChange={(event) => setQty(event.target.value)}
        />
      </Field>

      <Field htmlFor="r-note" label={t.stock.note} sublabel={other.stock.note}>
        <TextInput
          id="r-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="ethiopic"
        />
      </Field>

      <Button type="submit" variant="primary" disabled={busy}>
        <span className="ethiopic">{t.stock.restock}</span>
      </Button>
    </form>
  );
}

function AdjustForm({ productId, current }: { productId: string; current: number }) {
  const { t, other } = useBilingual();
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState<AdjustReason>('adjustment');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const value = Number(counted.trim());
    if (counted.trim() === '' || !Number.isFinite(value) || value < 0) {
      setError(t.productForm.invalidNumber);
      return;
    }

    setError(undefined);
    setBusy(true);
    try {
      // Writes the delta needed to reach the counted number, so the history
      // still explains how the figure moved and who moved it.
      const movement = await stockRepo.adjust({
        productId,
        countedQty: value,
        reason,
        note: note.trim() || undefined,
      });

      setMessage(movement === null ? t.stock.noChange : undefined);
      setCounted('');
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-rule p-4"
    >
      <h2 className="ethiopic text-base font-semibold">{t.stock.adjust}</h2>

      <Field
        htmlFor="a-counted"
        label={t.stock.countedQty}
        sublabel={other.stock.countedQty}
        hint={t.stock.countedHint}
        error={error}
      >
        <NumberInput
          id="a-counted"
          value={counted}
          placeholder={formatQty(current)}
          invalid={Boolean(error)}
          onChange={(event) => setCounted(event.target.value)}
        />
      </Field>

      <Field htmlFor="a-reason" label={t.stock.reason} sublabel={other.stock.reason}>
        <Select
          id="a-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as AdjustReason)}
          className="ethiopic"
        >
          {ADJUST_REASONS.map((key) => (
            <option key={key} value={key}>
              {t.reasons[key]}
            </option>
          ))}
        </Select>
      </Field>

      <Field htmlFor="a-note" label={t.stock.note} sublabel={other.stock.note}>
        <TextInput
          id="a-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="ethiopic"
        />
      </Field>

      {message ? <p className="ethiopic text-xs text-muted">{message}</p> : null}

      <Button type="submit" variant="primary" disabled={busy}>
        <span className="ethiopic">{t.stock.adjust}</span>
      </Button>
    </form>
  );
}

function MovementList({ movements }: { movements: StockMovement[] }) {
  const t = useT();

  if (movements.length === 0) {
    return <p className="ethiopic text-sm text-muted">{t.stock.noMovements}</p>;
  }

  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {movements.map((movement) => (
        <li key={movement.id} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="ethiopic text-sm font-medium">{t.reasons[movement.reason]}</span>
            <span className="num text-xs text-muted">{formatDateTime(movement.created_at)}</span>
            {movement.note ? (
              <span className="ethiopic truncate text-xs text-muted">{movement.note}</span>
            ) : null}
          </div>

          <span className="num shrink-0 text-base font-semibold">
            {movement.qty_delta > 0 ? '+' : ''}
            {formatQty(movement.qty_delta)}
          </span>
        </li>
      ))}
    </ul>
  );
}
