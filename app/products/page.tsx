'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/products/ProductCard';
import { ButtonLink } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { productsRepo, stockRepo } from '@/lib/db';
import { useT } from '@/lib/i18n';

type SortKey = 'name' | 'low';

export default function ProductsPage() {
  const t = useT();
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  // Reactive: the grid re-renders the moment a movement or edit lands,
  // which is what makes the low-stock dot appear while you watch it.
  const products = useLiveQuery(() => productsRepo.search(term), [term]);
  const onHand = useLiveQuery(() => stockRepo.cachedOnHandAll(), []);

  const sorted = useMemo(() => {
    if (!products) return [];
    const rows = [...products];

    if (sort === 'low') {
      rows.sort((a, b) => (onHand?.get(a.id) ?? 0) - (onHand?.get(b.id) ?? 0));
    } else {
      rows.sort((a, b) => a.name_am.localeCompare(b.name_am, 'am'));
    }

    return rows;
  }, [products, onHand, sort]);

  const loading = products === undefined;
  const nothingAtAll = !loading && products.length === 0 && term === '';

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="ethiopic text-2xl font-semibold">{t.products.title}</h1>
        <ButtonLink href="/products/new" variant="primary">
          <span className="ethiopic">{t.products.add}</span>
        </ButtonLink>
      </header>

      <TextInput
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t.products.searchPlaceholder}
        aria-label={t.products.searchPlaceholder}
        className="ethiopic"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="num text-xs text-muted">{t.products.count(sorted.length)}</span>

        <div className="flex gap-1" role="group" aria-label={t.products.sort}>
          {(
            [
              ['name', t.products.sortByName],
              ['low', t.products.sortByLowStock],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={`ethiopic min-h-touch min-w-touch rounded-full border px-4 text-sm font-medium ${
                sort === key ? 'border-ink bg-ink text-paper' : 'border-rule text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? null : nothingAtAll ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-rule border-dashed p-6">
          <p className="ethiopic text-base font-medium">{t.products.empty}</p>
          <ButtonLink href="/products/new" variant="primary">
            <span className="ethiopic">{t.products.emptyAction}</span>
          </ButtonLink>
        </div>
      ) : sorted.length === 0 ? (
        <p className="ethiopic py-8 text-center text-sm text-muted">{t.products.noResults}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((product) => (
            <li key={product.id} className="flex">
              <ProductCard product={product} onHand={onHand?.get(product.id) ?? 0} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
