'use client';

import { useT } from '@/lib/i18n';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'blocked';

export interface SyncPillProps {
  state: SyncState;
  /** Rows waiting in the outbox. Shown for every state except synced. */
  pending?: number;
  onClick?: () => void;
}

/**
 * The signature element (BUILD_GUIDE 5.4). Persistent, top-right, every screen.
 * It is the product's thesis made visible: the shop keeps running, the app is
 * honest about what is happening, nothing is lost. Offline states count rather
 * than apologise — that count is a promise the app is visibly keeping.
 *
 * Presentational only. Session 6 wires it to useSyncStatus() and gives the
 * button a detail sheet.
 *
 * Note on colour: 'blocked' does not use --alarm. Red is reserved for
 * destructive actions (docs/RULES.md), and a stalled sync has destroyed nothing.
 * It escalates by inverting ochre instead — louder, same vocabulary.
 */
const STATE_STYLES: Record<SyncState, { pill: string; dot: string }> = {
  synced: {
    pill: 'border-birr/30 bg-birr/10 text-birr',
    dot: 'bg-birr',
  },
  syncing: {
    pill: 'border-birr/30 bg-birr/10 text-birr',
    dot: 'bg-birr motion-safe:animate-pulse',
  },
  offline: {
    pill: 'border-ochre/40 bg-ochre/10 text-ochre',
    dot: 'bg-ochre',
  },
  blocked: {
    pill: 'border-ochre bg-ochre text-paper',
    dot: 'bg-paper motion-safe:animate-pulse',
  },
};

export function SyncPill({ state, pending = 0, onClick }: SyncPillProps) {
  const t = useT();

  const label: Record<SyncState, string> = {
    synced: t.sync.synced,
    syncing: t.sync.syncing,
    offline: t.sync.offline,
    blocked: t.sync.blocked,
  };

  const styles = STATE_STYLES[state];
  const showPending = pending > 0 && state !== 'synced';

  const accessibleLabel = showPending
    ? `${t.sync.label}: ${label[state]}, ${t.sync.pending(pending)}`
    : `${t.sync.label}: ${label[state]}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      aria-live="polite"
      // Stable hooks for the e2e suite; the visible text is bilingual and changes.
      data-testid="sync-pill"
      data-state={state}
      data-pending={pending}
      /* 56px tap target per BUILD_GUIDE 5.3; the visible pill sits inside it. */
      className="inline-flex min-h-touch items-center rounded-full px-1"
    >
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 transition-colors ${styles.pill}`}
      >
        <span className={`size-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
        <span className="ethiopic text-sm leading-none font-medium whitespace-nowrap">
          {label[state]}
        </span>
        {showPending ? (
          <>
            <span aria-hidden="true" className="text-current opacity-40">
              ·
            </span>
            <span className="num text-sm leading-none font-semibold">{pending}</span>
            <span className="ethiopic text-sm leading-none whitespace-nowrap opacity-80">
              {t.sync.pendingSuffix}
            </span>
          </>
        ) : null}
      </span>
    </button>
  );
}
