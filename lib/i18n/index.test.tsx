import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANG_STORAGE_KEY, dictionaries, readStoredLang, useLang, useT } from './index';

function Probe() {
  const t = useT();
  const { lang, setLang, toggleLang } = useLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="name">{t.app.name}</span>
      <button onClick={toggleLang}>toggle</button>
      <button onClick={() => setLang('am')}>am</button>
    </div>
  );
}

const mount = () =>
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'am';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('language choice', () => {
  it('starts in Amharic and writes nothing until the user chooses', () => {
    mount();
    expect(screen.getByTestId('lang').textContent).toBe('am');
    expect(document.documentElement.lang).toBe('am');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBeNull();
  });

  it('survives a reload after toggling to English and back', () => {
    const first = mount();
    act(() => screen.getByText('toggle').click());
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    first.unmount();

    // A reload: fresh provider, same device storage.
    const second = mount();
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(screen.getByTestId('name').textContent).toBe(dictionaries.en.app.name);
    expect(document.documentElement.lang).toBe('en');

    act(() => screen.getByText('am').click());
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('am');
    second.unmount();

    mount();
    expect(screen.getByTestId('lang').textContent).toBe('am');
    expect(document.documentElement.lang).toBe('am');
  });

  it('ignores a garbage stored value', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'fr');
    expect(readStoredLang()).toBeNull();
    mount();
    expect(screen.getByTestId('lang').textContent).toBe('am');
  });

  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    mount();
    act(() => screen.getByText('toggle').click());
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
