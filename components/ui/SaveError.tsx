'use client';

import type { WriteFailure } from '@/lib/db';
import { useT } from '@/lib/i18n';

/**
 * The "not saved" box for every screen that writes to IndexedDB outside the
 * sale screen (which has its own, with a retry tied to the cart). Same inverted
 * ochre as the blocked sync pill: loud, but red stays reserved for destructive
 * actions (docs/RULES.md). The live region is always mounted so a screen reader
 * announces the failure when it appears.
 */
export function SaveError({ failure, testId = 'save-error' }: { failure?: WriteFailure; testId?: string }) {
  const t = useT();

  return (
    <div role="alert" data-testid={testId} className="empty:hidden">
      {failure ? (
        <div className="flex flex-col gap-1 rounded-lg border border-ochre-ink bg-ochre-ink px-3 py-2 text-paper">
          <p className="ethiopic text-sm font-semibold">{t.common.saveFailed}</p>
          <p className="ethiopic text-sm">
            {failure === 'quota'
              ? t.common.saveFailedQuota
              : failure === 'unavailable'
                ? t.common.saveFailedUnavailable
                : t.common.saveFailedUnknown}
          </p>
        </div>
      ) : null}
    </div>
  );
}
