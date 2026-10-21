'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { am } from './am';
import type { Dict } from './am';
import { en } from './en';

export type { Dict } from './am';

export const dictionaries = { am, en } as const;
export type Lang = keyof typeof dictionaries;

/** Amharic is the default. English is the secondary language, not the base. */
export const DEFAULT_LANG: Lang = 'am';

/**
 * The language is a device setting, not an account one: the same phone sits
 * at the same counter every day, often before anyone has signed in. A plain
 * localStorage key is enough: one synchronous read right after hydration, so
 * the language switches before the first interaction, with no IndexedDB
 * round trip.
 */
export const LANG_STORAGE_KEY = 'suq.lang';

function isLang(value: string | null): value is Lang {
  return value === 'am' || value === 'en';
}

export function readStoredLang(): Lang | null {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(stored) ? stored : null;
  } catch {
    // Storage blocked (private mode, policy): fall back to the default.
    return null;
  }
}

function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Storage blocked: the choice lasts until the next reload, nothing worse.
  }
}

interface I18nValue {
  lang: Lang;
  t: Dict;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLang = DEFAULT_LANG,
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  /* Only write the key once the user has chosen, so a till that never touched
     the toggle keeps following DEFAULT_LANG. */
  const chosen = useRef(false);

  /* The pages are prerendered in the default language, so the stored choice
     is applied after hydration rather than in the first render (which must
     match the server HTML). */
  useEffect(() => {
    const stored = readStoredLang();
    if (stored) setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (chosen.current) storeLang(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    chosen.current = true;
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    chosen.current = true;
    setLangState((current) => (current === 'am' ? 'en' : 'am'));
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, t: dictionaries[lang], setLang, toggleLang }),
    [lang, setLang, toggleLang],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useT must be used inside <I18nProvider>');
  }
  return value;
}

/** The only way a user-facing string may enter a component. */
export function useT(): Dict {
  return useI18n().t;
}

/**
 * Both dictionaries at once, for form labels that show the primary language
 * with the other underneath in --muted. Amharic first by default, because
 * that is who is standing at the counter.
 */
export function useBilingual(): { t: Dict; other: Dict } {
  const { lang } = useI18n();
  return { t: dictionaries[lang], other: lang === 'am' ? en : am };
}

export function useLang(): Omit<I18nValue, 't'> {
  const { lang, setLang, toggleLang } = useI18n();
  return { lang, setLang, toggleLang };
}
