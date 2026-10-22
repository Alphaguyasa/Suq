import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageError from '@/app/error';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import { ErrorScreen } from './ErrorScreen';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('page error boundary', () => {
  it('shows the crash in the current language with a reload action', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <I18nProvider initialLang="en">
        <PageError error={new Error('boom')} />
      </I18nProvider>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: en.errors.title })).toBeTruthy();
    expect(screen.getByText(en.errors.body)).toBeTruthy();
    expect(screen.getByRole('button', { name: en.errors.reload })).toBeTruthy();
    expect(screen.queryByText(am.errors.title)).toBeNull();
  });

  it('logs the error instead of swallowing it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('boom');
    render(<ErrorScreen error={error} dicts={[am]} />);
    expect(log).toHaveBeenCalledWith(expect.any(String), error);
  });
});

describe('root error boundary text', () => {
  it('shows Amharic first, then English, when no provider is left', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ErrorScreen error={new Error('boom')} dicts={[am, en]} />);

    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual([am.errors.title, en.errors.title]);
    expect(
      screen.getByRole('button', { name: `${am.errors.reload} · ${en.errors.reload}` }),
    ).toBeTruthy();
  });

  it('reloads the page from the reload button', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    render(<ErrorScreen error={new Error('boom')} dicts={[en]} />);
    fireEvent.click(screen.getByRole('button', { name: en.errors.reload }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
