import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import { SaveError } from './SaveError';

describe('SaveError', () => {
  it('keeps an empty live region mounted until a write fails', () => {
    render(
      <I18nProvider initialLang="am">
        <SaveError />
      </I18nProvider>,
    );
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it.each([
    ['quota', am.common.saveFailedQuota],
    ['unavailable', am.common.saveFailedUnavailable],
    ['unknown', am.common.saveFailedUnknown],
  ] as const)('explains a %s failure in Amharic by default', (failure, text) => {
    render(
      <I18nProvider initialLang="am">
        <SaveError failure={failure} />
      </I18nProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain(am.common.saveFailed);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('follows the chosen language', () => {
    render(
      <I18nProvider initialLang="en">
        <SaveError failure="quota" />
      </I18nProvider>,
    );
    expect(screen.getByText(en.common.saveFailedQuota)).toBeTruthy();
    expect(screen.queryByText(am.common.saveFailedQuota)).toBeNull();
  });
});
