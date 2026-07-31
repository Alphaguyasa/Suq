'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { use } from 'react';
import { ProductForm } from '@/components/products/ProductForm';
import { ButtonLink } from '@/components/ui/Button';
import { productsRepo, stockRepo } from '@/lib/db';
import { formatQty } from '@/lib/format';
import { useT } from '@/lib/i18n';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();

  // null distinguishes "not found" from undefined, which means "still loading".
  const product = useLiveQuery(async () => (await productsRepo.getById(id)) ?? null, [id]);
  const onHand = useLiveQuery(() => stockRepo.onHand(id), [id]);

  if (product === undefined) return null;

  if (product === null) {
    return <p className="ethiopic text-sm text-muted">{t.products.noResults}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="ethiopic text-2xl font-semibold">{t.products.edit}</h1>

        <ButtonLink href={`/products/${id}/stock`} variant="quiet">
          <span className="ethiopic">{t.stock.title}</span>
          <span className="num font-semibold">{formatQty(onHand ?? 0)}</span>
        </ButtonLink>
      </header>

      <ProductForm product={product} />
    </div>
  );
}
