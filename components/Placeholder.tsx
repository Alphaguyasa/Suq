'use client';

import { useT } from '@/lib/i18n';

type ScreenKey = 'sell' | 'products' | 'reports' | 'settings';

/**
 * Temporary screen marker for routes that later sessions fill in. Kept in one
 * place so it is trivial to delete, and so no route ships a hardcoded string.
 */
export function Placeholder({ screen, session }: { screen: ScreenKey; session: number }) {
  const t = useT();

  return (
    <section className="flex flex-col items-start gap-2 border-l-2 border-rule py-4 pl-4">
      <h1 className="ethiopic text-2xl font-semibold">{t.placeholder[screen]}</h1>
      <p className="ethiopic text-sm text-muted">{t.placeholder.comingIn(session)}</p>
    </section>
  );
}
