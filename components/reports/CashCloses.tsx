'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SaveError } from '@/components/ui/SaveError';
import { classifyWriteError, recentCashCloses, saveCashClose } from '@/lib/db';
import type { CashClose, WriteFailure } from '@/lib/db';
import { formatDateTime, formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { CashUp } from '@/lib/reports/compute';

/**
 * Save the drawer count, then list the counts saved before. Before this the
 * float and counted cash lived only in the page's state, so yesterday's
 * shortfall was gone by the morning.
 */
export function SaveCashClose({
  cashUp,
  periodFrom,
  periodTo,
}: {
  cashUp: CashUp;
  periodFrom: string;
  periodTo: string;
}) {
  const t = useT();
  const [failure, setFailure] = useState<WriteFailure>();
  /*
   * What was last saved. The figures stay on screen so the sheet can still be
   * printed or shared, and the button stays off until they change: a recount
   * is a new close, but a second tap on the same numbers is not.
   */
  const [savedKey, setSavedKey] = useState<string>();
  // A ref, not state: two taps in one task must not save the count twice.
  const busy = useRef(false);
  const counted = cashUp.counted !== null;
  const key = `${periodFrom}|${cashUp.openingFloat}|${cashUp.cashSales}|${cashUp.counted}`;
  const saved = savedKey === key;

  async function save() {
    if (busy.current || !counted || saved) return;
    busy.current = true;
    setFailure(undefined);
    try {
      await saveCashClose({ periodFrom, periodTo, cashUp });
      setSavedKey(key);
    } catch (cause) {
      setFailure(classifyWriteError(cause));
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="primary" disabled={!counted || saved} onClick={save}>
        <span className="ethiopic">{t.reports.saveClose}</span>
      </Button>
      <p role="status" className="ethiopic text-sm text-muted empty:hidden">
        {saved ? (
          <span className="font-medium text-birr-ink">{t.reports.closeSaved}</span>
        ) : !counted ? (
          t.reports.countFirst
        ) : null}
      </p>
      <SaveError failure={failure} testId="cash-close-error" />
    </div>
  );
}

export function PastCashCloses() {
  const t = useT();
  const closes = useLiveQuery(() => recentCashCloses(), []);
  if (closes === undefined) return null;

  return (
    <section data-print-hide="" className="flex flex-col gap-3" aria-labelledby="past-closes">
      <h3 id="past-closes" className="ethiopic font-semibold">
        {t.reports.pastCloses}
      </h3>
      {closes.length === 0 ? (
        <p className="ethiopic text-sm text-muted">{t.reports.noCloses}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule rounded-xl border border-rule">
          {closes.map((close) => (
            <CloseRow key={close.id} close={close} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CloseRow({ close }: { close: CashClose }) {
  const t = useT();
  const { variance } = close;
  const verdict =
    variance === 0
      ? t.reports.balanced
      : `${formatETB(Math.abs(variance))} ${variance < 0 ? t.reports.short : t.reports.over}`;

  return (
    <li data-testid="cash-close" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
      <span className="flex flex-col">
        <span className="num text-sm">{formatDateTime(close.created_at)}</span>
        {close.cashier_name ? <span className="ethiopic text-xs text-muted">{close.cashier_name}</span> : null}
      </span>
      <span className="num text-sm text-muted">
        {formatETB(close.counted)} / {formatETB(close.expected)}
      </span>
      {/* Ochre for a short drawer: it needs attention, but nothing is destroyed. */}
      <span className={`ethiopic text-sm font-semibold ${variance < 0 ? 'text-ochre-ink' : 'text-birr-ink'}`}>
        {verdict}
      </span>
    </li>
  );
}
