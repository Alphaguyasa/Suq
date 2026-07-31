'use client';

import type { PaymentMethod } from '@/lib/db';
import { formatETB, parseETB } from '@/lib/format';
import { useT } from '@/lib/i18n';

const METHODS: PaymentMethod[] = ['cash', 'telebirr', 'card'];

/** The notes a customer actually hands over, in cents. */
const QUICK_NOTES = [5000, 10000, 20000, 50000];

function safeParse(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  try {
    return parseETB(trimmed);
  } catch {
    return 0;
  }
}

export function PaymentPanel({
  method,
  onMethod,
  total,
  received,
  onReceived,
  onPay,
  disabled,
}: {
  method: PaymentMethod;
  onMethod: (method: PaymentMethod) => void;
  total: number;
  received: string;
  onReceived: (value: string) => void;
  onPay: () => void;
  disabled: boolean;
}) {
  const t = useT();

  const receivedCents = safeParse(received);
  const change = receivedCents - total;
  const showChange = method === 'cash' && receivedCents > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onMethod(option)}
            aria-pressed={method === option}
            className={`ethiopic flex min-h-touch items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors ${
              method === option ? 'border-ink bg-ink text-paper' : 'border-rule text-ink'
            }`}
          >
            {t.payment[option as 'cash' | 'telebirr' | 'card']}
          </button>
        ))}
      </div>

      {/* Used on nearly every sale, so it is inline and always visible.
          No modal on this screen: a modal is a decision, and a decision is
          a second the cashier does not have. */}
      {method === 'cash' ? (
        <div className="flex flex-col gap-2 rounded-lg border border-rule p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="received" className="ethiopic text-sm text-muted">
              {t.sell.received}
            </label>
            <input
              id="received"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={received}
              onChange={(event) => onReceived(event.target.value)}
              placeholder="0.00"
              className="num min-h-touch w-32 rounded-lg border border-rule bg-paper px-3 text-right text-lg"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onReceived(formatETB(total))}
              className="ethiopic rounded-full border border-rule px-3 py-2 text-xs font-medium"
            >
              {t.sell.total}
            </button>
            {QUICK_NOTES.map((note) => (
              <button
                key={note}
                type="button"
                onClick={() => onReceived(formatETB(note))}
                className="num rounded-full border border-rule px-3 py-2 text-xs font-medium"
              >
                {formatETB(note)}
              </button>
            ))}
          </div>

          {showChange ? (
            <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-2">
              <span className={`ethiopic text-sm ${change < 0 ? 'text-ochre' : 'text-muted'}`}>
                {change < 0 ? t.sell.shortBy : t.sell.change}
              </span>
              <span
                className={`num text-2xl font-semibold ${change < 0 ? 'text-ochre' : 'text-ink'}`}
              >
                {formatETB(Math.abs(change))}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 64px, --birr, and it says the number out loud. */}
      <button
        type="button"
        onClick={onPay}
        disabled={disabled}
        className="flex min-h-pay items-center justify-between gap-3 rounded-xl bg-birr px-5 text-paper disabled:opacity-40"
      >
        <span className="ethiopic text-lg font-semibold">{t.sell.pay}</span>
        <span className="num text-2xl font-semibold">{formatETB(total)}</span>
      </button>
    </div>
  );
}
