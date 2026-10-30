'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useT } from '@/lib/i18n';

type Outcome = 'copied' | 'failed';

/**
 * Sends the receipt text through the phone's share sheet (Telegram, SMS,
 * whatever is installed). Works offline: the share sheet is the OS, and the
 * chat app queues the message until the network comes back.
 *
 * Where Web Share is missing (most desktop browsers) the text is copied to
 * the clipboard instead. Where neither exists the button is not shown at all.
 * Support is detected after mount: the page is a prerendered shell, and
 * reading navigator during render would not match the server HTML.
 *
 * The cash-up sheet reuses it with its own label and copied message; the
 * receipt wording is the default.
 */
export function ShareReceiptButton({
  title,
  text,
  label,
  copiedMessage,
}: {
  title: string;
  text: string;
  label?: string;
  copiedMessage?: string;
}) {
  const t = useT();
  const [mode, setMode] = useState<'share' | 'copy' | null>(null);
  const [outcome, setOutcome] = useState<Outcome>();

  useEffect(() => {
    if (typeof navigator.share === 'function') setMode('share');
    else if (typeof navigator.clipboard?.writeText === 'function') setMode('copy');
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setOutcome('copied');
    } catch (cause) {
      console.error('[receipt] copy failed', cause);
      setOutcome('failed');
    }
  }

  async function handleShare() {
    setOutcome(undefined);
    if (mode === 'copy') {
      await copy();
      return;
    }

    try {
      await navigator.share({ title, text });
    } catch (cause) {
      // The cashier closed the share sheet: nothing went wrong.
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      console.error('[receipt] share failed', cause);
      if (typeof navigator.clipboard?.writeText === 'function') await copy();
      else setOutcome('failed');
    }
  }

  if (mode === null) return null;

  return (
    <>
      <Button type="button" variant="quiet" onClick={() => void handleShare()}>
        <span className="ethiopic">{label ?? t.sales.share}</span>
      </Button>
      {/* Always mounted so screen readers hear the result when it appears. */}
      <p role="status" className="ethiopic w-full text-sm text-muted">
        {outcome === 'copied'
          ? (copiedMessage ?? t.sales.copied)
          : outcome === 'failed'
            ? t.sales.shareFailed
            : ''}
      </p>
    </>
  );
}
