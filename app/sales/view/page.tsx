'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Receipt } from '@/components/Receipt';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { getSettings, salesRepo } from '@/lib/db';
import { useBilingual, useT } from '@/lib/i18n';
import { saleHref } from '@/lib/routes';

/**
 * A static shell: the id comes from the query string so the service worker can
 * precache this page and open any receipt offline (lib/routes.ts).
 * useSearchParams needs a Suspense boundary to prerender.
 */
export default function SaleDetailPage() {
  return (
    <Suspense fallback={null}>
      <SaleDetailFromQuery />
    </Suspense>
  );
}

function SaleDetailFromQuery() {
  const id = useSearchParams().get('id') ?? '';
  // Keyed so a form half-filled for one id never carries over to the next.
  return <SaleDetail key={id} id={id} />;
}

function SaleDetail({ id }: { id: string }) {
  const t = useT();

  const detail = useLiveQuery(async () => (await salesRepo.getById(id)) ?? null, [id]);
  const settings = useLiveQuery(() => getSettings(), []);
  const original = useLiveQuery(async () => {
    const current = await salesRepo.getById(id);
    if (!current?.sale.voids_sale_id) return null;
    return (await salesRepo.getById(current.sale.voids_sale_id))?.sale ?? null;
  }, [id]);

  if (detail === undefined || settings === undefined) return null;

  if (detail === null) {
    return <p className="ethiopic text-sm text-muted">{t.sales.noResults}</p>;
  }

  const { sale, items, voidedBy } = detail;
  const isVoidRow = sale.voids_sale_id !== null;
  const canVoid = !isVoidRow && voidedBy === null;

  return (
    <div className="flex flex-col gap-5">
      <header data-print-hide="" className="flex items-center justify-between gap-3">
        <Link href="/sales" className="ethiopic text-sm text-muted">
          {t.sales.title}
        </Link>
        <span className="num text-sm font-semibold">{sale.receipt_no}</span>
      </header>

      {voidedBy ? (
        <p
          data-print-hide=""
          className="flex items-center justify-between gap-2 rounded-lg border border-ochre/40 bg-ochre/10 px-3 py-2"
        >
          <span className="ethiopic text-sm font-medium text-ochre-ink">{t.sales.voidedAs}</span>
          <Link href={saleHref(voidedBy.id)} className="num text-sm font-semibold text-ochre-ink">
            {voidedBy.receipt_no}
          </Link>
        </p>
      ) : null}

      <Receipt
        sale={sale}
        items={items}
        settings={settings}
        voidedBy={voidedBy}
        original={original ?? null}
      />

      <div data-print-hide="" className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={() => window.print()}>
          <span className="ethiopic">{t.sales.print}</span>
        </Button>

        {canVoid ? <VoidControl saleId={sale.id} /> : null}
      </div>
    </div>
  );
}

/**
 * Voiding is destructive-sounding but appends rather than deletes, so the
 * explanation says so plainly. The reason is required: when the owner asks
 * who voided this and why, the answer should be a row, not a shrug.
 */
function VoidControl({ saleId }: { saleId: string }) {
  const { t, other } = useBilingual();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        <span className="ethiopic">{t.sales.void}</span>
      </Button>
    );
  }

  async function handleVoid() {
    if (!reason.trim()) {
      setError(t.sales.voidReasonRequired);
      return;
    }

    setError(undefined);
    setBusy(true);
    try {
      await salesRepo.voidSale(saleId, reason.trim());
      setOpen(false);
      setReason('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-rule p-4">
      <p className="ethiopic text-xs text-muted">{t.sales.voidExplain}</p>

      <Field
        htmlFor="void-reason"
        label={t.sales.voidReason}
        sublabel={other.sales.voidReason}
        error={error}
      >
        <TextInput
          id="void-reason"
          autoFocus
          value={reason}
          invalid={Boolean(error)}
          onChange={(event) => setReason(event.target.value)}
          className="ethiopic"
        />
      </Field>

      <div className="flex gap-3">
        <Button type="button" variant="danger" disabled={busy} onClick={() => void handleVoid()}>
          <span className="ethiopic">{t.sales.void}</span>
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          <span className="ethiopic">{t.common.cancel}</span>
        </Button>
      </div>
    </div>
  );
}
