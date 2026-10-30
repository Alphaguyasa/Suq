import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import type { SyncState } from '@/lib/sync/status';
import { SyncPill } from './SyncPill';

const t = am;

/**
 * WCAG 2.5.3 (label in name): a speech-input user says what they see, so the
 * pill's accessible name has to contain its visible text word for word, with
 * "Sync status" in front for screen-reader context.
 */
describe('SyncPill', () => {
  const cases: Array<[SyncState, number, string]> = [
    ['synced', 0, `${t.sync.label}: ${t.sync.synced}`],
    ['synced', 4, `${t.sync.label}: ${t.sync.synced}`],
    ['syncing', 3, `${t.sync.label}: ${t.sync.syncing} 3 ${t.sync.pendingSuffix}`],
    ['offline', 12, `${t.sync.label}: ${t.sync.offline} 12 ${t.sync.pendingSuffix}`],
    ['blocked', 1, `${t.sync.label}: ${t.sync.blocked} 1 ${t.sync.pendingSuffix}`],
  ];

  it.each(cases)('the %s pill with %i saved is named "%s"', (state, pending, name) => {
    render(
      <I18nProvider>
        <SyncPill state={state} pending={pending} />
      </I18nProvider>,
    );

    const pill = screen.getByTestId('sync-pill');
    expect(pill).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('button', { name })).toBe(pill);
  });
});
