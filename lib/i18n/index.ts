'use client';

import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { am } from './am';
import type { Dict } from './am';
import { en } from './en';

export type { Dict } from './am';

export const dictionaries = { am, en } as const;
export type Lang = keyof typeof dictionaries;

/** Amharic is the default. English is the secondary language, not the base. */
export const DEFAULT_LANG: Lang = 'am';

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
  const [lang, setLang] = useState<Lang>(initialLang);

  const toggleLang = useCallback(() => {
    setLang((current) => (current === 'am' ? 'en' : 'am'));
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, t: dictionaries[lang], setLang, toggleLang }),
    [lang, toggleLang],
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
