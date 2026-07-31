'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ensureDevice } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { BottomNav } from './BottomNav';
import { SyncPill } from './SyncPill';

/**
 * Persistent chrome: shop mark top-left, sync pill top-right, nav along the
 * bottom where a thumb already is. Everything here should be quiet enough
 * that the pill is the one element people remember.
 *
 * The pill is hardcoded to 'synced' until session 6 provides useSyncStatus().
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();

  // Every write needs a registered till. Session 8 replaces this with the
  // real first-run flow; until then the app registers a default one.
  useEffect(() => {
    void ensureDevice();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-rule bg-paper px-3 sm:px-4">
        <span className="ethiopic text-xl font-semibold tracking-tight">{t.app.name}</span>
        <SyncPill state="synced" pending={0} />
      </header>

      {/* Wide enough for the sale screen's two panes on a 1024px tablet. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <BottomNav />
    </div>
  );
}
