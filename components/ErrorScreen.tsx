'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import type { Dict } from '@/lib/i18n';

/**
 * What a till shows instead of a blank screen when a page throws.
 *
 * Both actions are full page loads, not client navigations or `reset()`:
 * whatever broke is usually still broken in memory (a bad live query, a
 * half-initialised store), and a fresh load is the one thing a cashier can
 * trust. Sales are already in IndexedDB, so nothing is lost by reloading.
 */
export function ErrorScreen({ error, dicts }: { error: Error; dicts: readonly Dict[] }) {
  useEffect(() => {
    console.error('[suq] page crashed', error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-8">
      {dicts.map((t, index) => (
        <div key={index} className="flex flex-col gap-1">
          <h1 className="ethiopic text-2xl font-semibold">{t.errors.title}</h1>
          <p className="ethiopic max-w-prose text-sm text-muted">{t.errors.body}</p>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          <span className="ethiopic">{dicts.map((t) => t.errors.reload).join(' · ')}</span>
        </Button>
        <Button onClick={() => window.location.assign('/')}>
          <span className="ethiopic">{dicts.map((t) => t.errors.toSell).join(' · ')}</span>
        </Button>
      </div>
    </div>
  );
}
