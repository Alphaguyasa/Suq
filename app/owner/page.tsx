'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Sale } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { currentUser } from '@/lib/supabase/auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * The owner's read-only view, and the last beat of DEMO_SCRIPT.md: "this is
 * what you see from home".
 *
 * Unlike every other screen, this one reads the CLOUD rather than Dexie —
 * that is the whole point. It is what the owner sees on their phone while the
 * tablet is behind the counter, so it must show what actually arrived, not
 * what this device happens to hold.
 */
export default function OwnerPage() {
  const t = useT();
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string>();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    const user = await currentUser();
    setSignedIn(user !== null);
    if (!user) return;

    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const { data, error: queryError } = await getSupabase()
      .from('sales')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setError(undefined);
    setSales((data ?? []) as Sale[]);
  }, []);

  useEffect(() => {
    void load();
    // The owner leaves this open on a phone; refresh without a reload.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!isSupabaseConfigured()) {
    return <p className="ethiopic text-sm text-muted">{t.syncSheet.notConfigured}</p>;
  }

  if (signedIn === false) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="ethiopic text-2xl font-semibold">{t.owner.title}</h1>
        <Link
          href="/signin"
          className="ethiopic flex min-h-touch items-center rounded-lg border border-ink bg-ink px-4 text-sm font-medium text-paper"
        >
          {t.auth.signIn}
        </Link>
      </div>
    );
  }

  const net = (sales ?? []).reduce((sum, sale) => sum + sale.total, 0);
  const real = (sales ?? []).filter((sale) => sale.voids_sale_id === null);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="ethiopic text-2xl font-semibold">{t.owner.title}</h1>
        <p className="ethiopic text-sm text-muted">{t.owner.today}</p>
      </header>

      <div className="flex flex-col gap-1 border-y border-rule py-4">
        <span className="ethiopic text-xs text-muted">{t.reports.netSales}</span>
        <span className="num text-5xl leading-none font-semibold">{formatETB(net)}</span>
        <span className="num pt-1 text-xs text-muted">
          {real.length} · {t.reports.transactions}
        </span>
      </div>

      {error ? (
        <p className="rounded-lg border border-ochre/40 bg-ochre/10 p-3 text-xs text-ochre-ink">
          {error}
        </p>
      ) : null}

      {sales === null ? null : sales.length === 0 ? (
        <p className="ethiopic py-8 text-center text-sm text-muted">{t.owner.noSalesYet}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {sales.map((sale) => (
            <li key={sale.id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex flex-col leading-tight">
                <span className="num text-sm font-medium">{sale.receipt_no}</span>
                <span className="num text-xs text-muted">
                  {formatDateTime(sale.created_at).slice(11)} · {sale.cashier_name}
                </span>
              </span>
              <span
                className={`num text-base font-semibold ${
                  sale.voids_sale_id ? 'text-muted line-through' : ''
                }`}
              >
                {formatETB(sale.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
