'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { productsRepo } from '@/lib/db';
import { CATALOGUE } from '@/lib/seed/catalogue';
import { seedCatalogue } from '@/lib/seed/seed';
import { loadDemoData } from '@/lib/seed/demo/load';
import { formatETB } from '@/lib/format';
import { useT } from '@/lib/i18n';

/**
 * IndexedDB only exists in the browser, so sample data has to be loaded from
 * inside the app. This is the working equivalent of `npm run seed`.
 */
export default function SeedPage() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();

  const existing = useLiveQuery(() => productsRepo.list({ includeInactive: true }), []);

  async function handleSeed() {
    setBusy(true);
    try {
      const { created, skipped } = await seedCatalogue();
      setResult(created === 0 ? t.seed.alreadyLoaded : t.seed.loaded(created + skipped));
    } finally {
      setBusy(false);
    }
  }

  async function handleDemo() {
    setBusy(true);
    try {
      const { products, sales } = await loadDemoData();
      setResult(`${products} products · ${sales} sales`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="ethiopic text-2xl font-semibold">{t.seed.title}</h1>
        <p className="ethiopic text-sm text-muted">{t.seed.description}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="quiet" onClick={handleSeed} disabled={busy}>
          <span className="ethiopic">{t.seed.load}</span>
        </Button>

        {/* The demo dataset: 60 products and a month of trading. Written
            straight to the tables, so none of it syncs — see load.ts. */}
        <Button type="button" variant="primary" onClick={handleDemo} disabled={busy}>
          <span className="ethiopic">{t.seed.loadDemo}</span>
        </Button>

        <span className="num text-sm text-muted">{existing?.length ?? 0}</span>
      </div>

      {result ? <p className="ethiopic text-sm font-medium text-birr-ink">{result}</p> : null}

      <table className="w-full text-left">
        <tbody>
          {CATALOGUE.map((entry) => (
            <tr key={entry.barcode} className="border-b border-rule last:border-0">
              <td className="ethiopic py-2 text-sm">{entry.name_am}</td>
              <td className="py-2 text-xs text-muted">{entry.name}</td>
              <td className="num py-2 text-right text-sm">{formatETB(entry.sell_price)}</td>
              <td className="num py-2 pl-3 text-right text-sm text-muted">{entry.opening_qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
