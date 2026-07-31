'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'money' | 'quiet' | 'danger';

/*
 * money = --birr, reserved for money and completion.
 * danger = --alarm, destructive only. It should appear about twice in the
 * whole app, so reach for `quiet` first and mean it when you don't.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper border-ink',
  money: 'bg-birr text-paper border-birr',
  quiet: 'bg-paper text-ink border-rule',
  danger: 'bg-paper text-alarm border-alarm',
};

const BASE =
  'inline-flex min-h-touch items-center justify-center gap-2 rounded-lg border px-4 ' +
  'text-base font-medium transition-colors disabled:opacity-50';

export function Button({
  variant = 'quiet',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button {...props} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'quiet',
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}
