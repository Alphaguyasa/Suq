'use client';

import { ProductForm } from '@/components/products/ProductForm';
import { useT } from '@/lib/i18n';

export default function NewProductPage() {
  const t = useT();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="ethiopic text-2xl font-semibold">{t.products.add}</h1>
      <ProductForm />
    </div>
  );
}
