'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { Cashier } from '@/lib/db';
import { listCashiers, verifyPin } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { unlockAs } from '@/lib/lock/lock';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

/**
 * Pick a name, tap four digits. This identifies who is at the till; it is not
 * a security boundary, so there is no lockout, no attempt counter and no
 * scolding — a wrong PIN just clears and lets you try again.
 */
export function LockScreen() {
  const t = useT();
  const cashiers = useLiveQuery(() => listCashiers(), []);
  const [selected, setSelected] = useState<Cashier | null>(null);
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  async function push(key: (typeof KEYS)[number]) {
    if (!selected) return;

    if (key === 'clear') {
      setPin('');
      setWrong(false);
      return;
    }

    if (key === 'back') {
      setPin((current) => current.slice(0, -1));
      setWrong(false);
      return;
    }

    const next = (pin + key).slice(0, 4);
    setPin(next);
    setWrong(false);

    if (next.length === 4) {
      const cashier = await verifyPin(selected.id, next);
      if (cashier) {
        await unlockAs(cashier);
      } else {
        setWrong(true);
        setPin('');
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-paper px-6">
      <h1 className="ethiopic text-2xl font-semibold">{t.lock.title}</h1>

      {!selected ? (
        <ul className="flex w-full max-w-sm flex-col gap-2">
          {(cashiers ?? []).map((cashier) => (
            <li key={cashier.id}>
              <button
                type="button"
                onClick={() => setSelected(cashier)}
                className="ethiopic flex min-h-touch w-full items-center justify-center rounded-xl border border-rule text-base font-medium"
              >
                {cashier.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex w-full max-w-xs flex-col items-center gap-5">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPin('');
              setWrong(false);
            }}
            className="ethiopic text-sm text-muted underline"
          >
            {selected.name}
          </button>

          <div className="flex gap-3" aria-live="polite" aria-label={t.lock.pin}>
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={`size-4 rounded-full border ${
                  index < pin.length ? 'border-ink bg-ink' : 'border-rule'
                } ${wrong ? 'border-ochre' : ''}`}
              />
            ))}
          </div>

          {wrong ? (
            <p className="ethiopic text-sm font-medium text-ochre">{t.lock.wrongPin}</p>
          ) : null}

          <div className="grid w-full grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void push(key)}
                className="num flex min-h-touch items-center justify-center rounded-xl border border-rule text-xl font-semibold"
              >
                {key === 'clear' ? '✕' : key === 'back' ? '←' : key}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
