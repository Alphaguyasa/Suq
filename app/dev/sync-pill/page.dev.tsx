'use client';

import { SyncPill } from '@/components/SyncPill';
import type { SyncState } from '@/components/SyncPill';
import { formatETB } from '@/lib/format';
import { useLang, useT } from '@/lib/i18n';

/**
 * Preview harness for the signature element. Not part of the shipped nav —
 * it exists so all four states can be eyeballed side by side, in both
 * languages, without having to unplug anything.
 */
const CASES: { state: SyncState; pending: number }[] = [
  { state: 'synced', pending: 0 },
  { state: 'syncing', pending: 3 },
  { state: 'offline', pending: 12 },
  { state: 'blocked', pending: 47 },
];

const TYPE_SAMPLE = [1235, 100000, 12345678, -1235];

export default function SyncPillPreview() {
  const t = useT();
  const { lang, toggleLang } = useLang();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="ethiopic text-2xl font-semibold">{t.sync.label}</h1>
        <button
          type="button"
          onClick={toggleLang}
          className="ethiopic min-h-touch rounded-full border border-rule px-4 text-sm font-medium"
        >
          {lang === 'am' ? t.lang.english : t.lang.amharic}
        </button>
      </header>

      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {CASES.map(({ state, pending }) => (
          <li key={state} className="flex items-center justify-between gap-4 py-2">
            <code className="num text-xs text-muted">{state}</code>
            <SyncPill state={state} pending={pending} />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3">
        <h2 className="ethiopic text-lg font-semibold">{t.money.currency}</h2>
        <table className="w-full max-w-sm">
          <tbody>
            {TYPE_SAMPLE.map((cents) => (
              <tr key={cents} className="border-b border-rule last:border-0">
                <td className="num py-2 text-sm text-muted">{cents}</td>
                <td className="num py-2 text-right text-xl font-semibold">{formatETB(cents)}</td>
                <td className="ethiopic py-2 pl-2 text-sm text-muted">{t.money.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="num text-4xl font-semibold">{formatETB(4875)}</p>
      </section>
    </div>
  );
}
