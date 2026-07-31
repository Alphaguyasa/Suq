'use client';

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/** 56px minimum, because this is a fingertip on a bagging counter. */
const CONTROL =
  'w-full min-h-touch rounded-lg border border-rule bg-paper px-3 text-base text-ink ' +
  'placeholder:text-muted focus-visible:border-ink';

export function Field({
  htmlFor,
  label,
  sublabel,
  hint,
  error,
  children,
}: {
  htmlFor: string;
  /** Primary language */
  label: string;
  /** The other language, shown underneath in muted */
  sublabel: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex flex-col leading-tight">
        <span className="ethiopic text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">{sublabel}</span>
      </label>

      {children}

      {hint && !error ? <p className="ethiopic text-xs text-muted">{hint}</p> : null}
      {/* Ochre, not alarm: a mistyped price needs attention, it has destroyed nothing. */}
      {error ? <p className="ethiopic text-xs font-medium text-ochre">{error}</p> : null}
    </div>
  );
}

export function TextInput({
  invalid,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={`${CONTROL} ${invalid ? 'border-ochre' : ''} ${className}`}
    />
  );
}

/** Prices and quantities: mono, tabular, and a numeric keypad on a tablet. */
export function NumberInput({
  invalid,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-invalid={invalid || undefined}
      className={`${CONTROL} num text-right ${invalid ? 'border-ochre' : ''} ${className}`}
    />
  );
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${CONTROL} ${className}`}>
      {children}
    </select>
  );
}
