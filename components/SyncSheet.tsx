'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { syncNow } from '@/lib/sync/engine';
import type { SyncStatus } from '@/lib/sync/status';

/**
 * Tapping the pill opens this. It answers the only three questions a
 * shopkeeper has: how much is waiting, when did it last go through, and what
 * went wrong. Plus a way to make it try again now.
 */
export function SyncSheet({ status, onClose }: { status: SyncStatus; onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function handleSyncNow() {
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-print-hide=""
      className="absolute top-16 right-2 z-30 flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-3 rounded-xl border border-rule bg-paper p-4 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="ethiopic text-base font-semibold">{t.syncSheet.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.syncSheet.close}
          className="flex size-9 items-center justify-center rounded-lg text-muted"
        >
          ×
        </button>
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        {/* The pill shows sales; the detail view shows the machinery too, so
            the two numbers never look like a contradiction. */}
        <Row
          label={t.syncSheet.pending}
          value={
            <span className="num">
              {status.pendingSales}
              {status.pending !== status.pendingSales ? (
                <span className="text-muted"> / {status.pending}</span>
              ) : null}
            </span>
          }
        />
        <Row
          label={t.syncSheet.lastSync}
          value={
            status.lastSyncAt ? (
              <span className="num">{formatDateTime(status.lastSyncAt)}</span>
            ) : (
              <span className="ethiopic text-muted">{t.syncSheet.never}</span>
            )
          }
        />
      </dl>

      {status.lastError ? (
        <p className="rounded-lg border border-ochre/40 bg-ochre/10 p-2 text-xs break-words text-ochre-ink">
          {status.lastError}
        </p>
      ) : null}

      {!isSupabaseConfigured() ? (
        <p className="ethiopic text-xs text-muted">{t.syncSheet.notConfigured}</p>
      ) : !status.authed ? (
        <Link
          href="/signin"
          onClick={onClose}
          className="ethiopic flex min-h-touch items-center justify-center rounded-lg border border-ink bg-ink text-sm font-medium text-paper"
        >
          {t.auth.signInToSync}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void handleSyncNow()}
          disabled={busy}
          className="ethiopic min-h-touch rounded-lg border border-rule text-sm font-medium disabled:opacity-50"
        >
          {t.syncSheet.syncNow}
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="ethiopic text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
