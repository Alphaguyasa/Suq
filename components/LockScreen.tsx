'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cashier } from '@/lib/db';
import { listCashiers, verifyPin } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { unlockAs } from '@/lib/lock/lock';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;
type Key = (typeof KEYS)[number];

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
  /* The digits typed so far, read synchronously. A keyboard types faster than
     React re-renders, so `pin` alone would drop the second of two quick
     keystrokes; four digits in also means "checking", so a fifth is ignored. */
  const pinRef = useRef('');
  const pinDisplay = useRef<HTMLDivElement>(null);

  const typePin = useCallback((value: string) => {
    pinRef.current = value;
    setPin(value);
  }, []);

  const choose = useCallback(
    (cashier: Cashier | null) => {
      setSelected(cashier);
      typePin('');
      setWrong(false);
    },
    [typePin],
  );

  const push = useCallback(
    async (key: Key) => {
      if (!selected) return;

      if (key === 'clear') {
        typePin('');
        setWrong(false);
        return;
      }

      if (key === 'back') {
        if (pinRef.current.length < 4) typePin(pinRef.current.slice(0, -1));
        setWrong(false);
        return;
      }

      if (pinRef.current.length >= 4) return;
      const next = pinRef.current + key;
      typePin(next);
      setWrong(false);

      if (next.length === 4) {
        const cashier = await verifyPin(selected.id, next);
        if (cashier) {
          await unlockAs(cashier);
        } else {
          setWrong(true);
          typePin('');
        }
      }
    },
    [selected, typePin],
  );

  /* The button that had focus is gone once a name is picked, which left focus
     on <body>. Put it on the PIN display: Tab goes on to the keys from there,
     and Enter on it does nothing by accident. */
  useEffect(() => {
    if (selected) pinDisplay.current?.focus();
  }, [selected]);

  /* The demo laptop and a tablet with a keyboard: type the PIN, Backspace
     deletes a digit, Escape goes back to the names. */
  useEffect(() => {
    if (!selected) return;

    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        void push(event.key as Key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        void push('back');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        choose(null);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, push, choose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-paper px-6">
      <h1 className="ethiopic text-2xl font-semibold">{t.lock.title}</h1>

      {!selected ? (
        <ul className="flex w-full max-w-sm flex-col gap-2">
          {(cashiers ?? []).map((cashier, index) => (
            <li key={cashier.id}>
              <button
                type="button"
                // Nothing else is on this screen: a keyboard starts on the first name.
                autoFocus={index === 0}
                onClick={() => choose(cashier)}
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
            onClick={() => choose(null)}
            className="ethiopic text-sm text-muted underline"
          >
            {selected.name}
          </button>

          <div
            ref={pinDisplay}
            tabIndex={-1}
            role="group"
            className="flex gap-3 rounded-lg p-2"
            aria-live="polite"
            aria-label={t.lock.pin}
          >
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
            <p className="ethiopic text-sm font-medium text-ochre-ink">{t.lock.wrongPin}</p>
          ) : null}

          <div className="grid w-full grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void push(key)}
                aria-label={key === 'clear' ? t.lock.clearPin : key === 'back' ? t.lock.deleteDigit : undefined}
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
