'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';

interface NavItem {
  href: string;
  key: 'sell' | 'products' | 'reports' | 'settings';
  icon: ReactNode;
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'size-6 shrink-0',
  'aria-hidden': true,
};

const ITEMS: NavItem[] = [
  {
    href: '/',
    key: 'sell',
    icon: (
      <svg {...iconProps}>
        <path d="M4 7h16l-1.2 11a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8Z" />
        <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
      </svg>
    ),
  },
  {
    href: '/products',
    key: 'products',
    icon: (
      <svg {...iconProps}>
        <path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5Z" />
        <path d="M3.5 8.5 12 13l8.5-4.5M12 13v7" />
      </svg>
    ),
  },
  {
    href: '/reports',
    key: 'reports',
    icon: (
      <svg {...iconProps}>
        <path d="M4 20h16" />
        <path d="M7 20v-6M12 20V6M17 20v-9" />
      </svg>
    ),
  },
  {
    href: '/settings',
    key: 'settings',
    icon: (
      <svg {...iconProps}>
        <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
        <circle cx="16" cy="8" r="2.2" />
        <circle cx="10" cy="16" r="2.2" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      aria-label={t.app.name}
      className="sticky bottom-0 z-20 shrink-0 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-3xl">
        {ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-touch flex-col items-center justify-center gap-1 border-t-2 py-2 transition-colors ${
                  active ? 'border-ink text-ink' : 'border-transparent text-muted'
                }`}
              >
                {item.icon}
                <span className="ethiopic text-xs leading-none font-medium">{t.nav[item.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
