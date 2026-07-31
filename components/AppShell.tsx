'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ensureDevice, ensureSettings } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { useSyncStatus } from '@/lib/sync/status';
import { BottomNav } from './BottomNav';
import { SyncPill } from './SyncPill';
import { SyncSheet } from './SyncSheet';

/**
 * Persistent chrome: shop mark top-left, sync pill top-right, nav along the
 * bottom where a thumb already is. Everything here should be quiet enough
 * that the pill is the one element people remember.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const status = useSyncStatus();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Every write needs a registered till. Session 8 replaces this with the
  // real first-run flow; until then the app registers a default one.
  useEffect(() => {
    void ensureDevice();
    void ensureSettings();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        data-print-hide=""
        className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-rule bg-paper px-3 sm:px-4"
      >
        <span className="ethiopic text-xl font-semibold tracking-tight">{t.app.name}</span>

        <SyncPill
          state={status.state}
          pending={status.pending}
          onClick={() => setSheetOpen((open) => !open)}
        />

        {sheetOpen ? <SyncSheet status={status} onClose={() => setSheetOpen(false)} /> : null}
      </header>

      {/* Wide enough for the sale screen's two panes on a 1024px tablet. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <BottomNav />
    </div>
  );
}
