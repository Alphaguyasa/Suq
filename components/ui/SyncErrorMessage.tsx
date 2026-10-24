'use client';

import { useT } from '@/lib/i18n';
import { classifySyncError } from '@/lib/sync/errors';

/**
 * A sync or server failure, explained in the UI language, with the server's
 * own (English) text underneath in small print: useless to a cashier, but it
 * is what someone helping over the phone needs to hear read out.
 */
export function SyncErrorMessage({ raw, testId = 'sync-error' }: { raw: string; testId?: string }) {
  const t = useT();
  const failure = classifySyncError(raw);

  return (
    <div
      data-testid={testId}
      data-failure={failure}
      className="flex flex-col gap-1 rounded-lg border border-ochre/40 bg-ochre/10 p-2 text-ochre-ink"
    >
      <p className="ethiopic text-sm font-medium">{t.syncSheet.errors[failure]}</p>
      <p className="text-xs break-words opacity-80">{raw}</p>
    </div>
  );
}
