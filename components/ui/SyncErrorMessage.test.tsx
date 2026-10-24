import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import { SyncErrorMessage } from './SyncErrorMessage';

const RLS = 'sales: new row violates row-level security policy for table "sales"';

describe('SyncErrorMessage', () => {
  it('explains the failure in Amharic and keeps the raw text in small print', () => {
    render(
      <I18nProvider initialLang="am">
        <SyncErrorMessage raw={RLS} />
      </I18nProvider>,
    );

    expect(screen.getByText(am.syncSheet.errors.permission)).toBeTruthy();
    expect(screen.getByText(RLS)).toBeTruthy();
    expect(screen.getByTestId('sync-error').dataset.failure).toBe('permission');
  });

  it('follows the UI language', () => {
    render(
      <I18nProvider initialLang="en">
        <SyncErrorMessage raw="TypeError: Failed to fetch" />
      </I18nProvider>,
    );

    expect(screen.getByText(en.syncSheet.errors.network)).toBeTruthy();
    expect(screen.queryByText(am.syncSheet.errors.network)).toBeNull();
  });
});
