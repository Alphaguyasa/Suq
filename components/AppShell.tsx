'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { anyCashiers, db, ensureDevice, ensureSettings, getSettings } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { initialiseLock, useIdleLock, useLock } from '@/lib/lock/lock';
import { useSyncStatus } from '@/lib/sync/status';
import { BottomNav } from './BottomNav';
import { LockScreen } from './LockScreen';
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
  const lock = useLock();
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  // A till always has a device row and settings, whether or not anyone has
  // been through /setup yet. The setup flow overwrites these values rather
  // than creating them.
  useEffect(() => {
    void ensureDevice();
    void ensureSettings();
    void initialiseLock();
  }, []);

  /*
   * Send a genuinely fresh install to setup: no shop name, no cashier, and
   * nothing sold. All three, so a device that has been seeded for a demo or
   * is mid-trading is never interrupted.
   */
  useEffect(() => {
    if (pathname === '/setup') return;

    void (async () => {
      const settings = await getSettings();
      if (settings.shop_name || settings.shop_name_am) return;
      if (await anyCashiers()) return;
      if ((await db.sales.count()) > 0) return;
      if ((await db.products.count()) > 0) return;

      router.replace('/setup');
    })();
  }, [pathname, router]);

  // Only arm the idle timer once somebody is actually working.
  useIdleLock(lock.ready && !lock.locked);

  if (lock.locked) return <LockScreen />;

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
