'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field';
import { SaveError } from '@/components/ui/SaveError';
import { classifyWriteError, ensureDevice, productsRepo, stockRepo } from '@/lib/db';
import type { Product, Unit, WriteFailure } from '@/lib/db';
import { formatETB, parseETB } from '@/lib/format';
import { useBilingual } from '@/lib/i18n';

const UNITS: Unit[] = ['pcs', 'kg', 'l', 'pack'];

interface FormValues {
  barcode: string;
  name_am: string;
  name: string;
  unit: Unit;
  cost_price: string;
  sell_price: string;
  reorder_level: string;
  opening_qty: string;
  is_active: boolean;
}

export function ProductForm({ product }: { product?: Product }) {
  const { t, other } = useBilingual();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const isNew = product === undefined;

  const [values, setValues] = useState<FormValues>({
    barcode: product?.barcode ?? '',
    name_am: product?.name_am ?? '',
    name: product?.name ?? '',
    unit: product?.unit ?? 'pcs',
    cost_price: product ? formatETB(product.cost_price) : '',
    sell_price: product ? formatETB(product.sell_price) : '',
    reorder_level: product ? String(product.reorder_level) : '0',
    opening_qty: '',
    is_active: product?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<WriteFailure>();

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /**
   * A USB barcode scanner types the code and then sends Enter. If that Enter
   * reaches the form it submits half-filled data, so we intercept it and move
   * to the next field instead — submit only from the last one.
   */
  function onEnter(nextFieldId: string | null) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      if (nextFieldId) {
        document.getElementById(nextFieldId)?.focus();
      } else {
        formRef.current?.requestSubmit();
      }
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveError(undefined);

    const found: Partial<Record<keyof FormValues, string>> = {};
    let cost = 0;
    let sell = 0;
    let reorder = 0;
    let opening = 0;

    if (!values.name_am.trim()) found.name_am = t.common.required;
    if (!values.name.trim()) found.name = t.common.required;

    try {
      cost = parseETB(values.cost_price.trim() || '0');
    } catch {
      found.cost_price = t.productForm.invalidPrice;
    }

    try {
      sell = parseETB(values.sell_price.trim() || '0');
    } catch {
      found.sell_price = t.productForm.invalidPrice;
    }

    const reorderValue = Number(values.reorder_level.trim() || '0');
    if (!Number.isFinite(reorderValue) || reorderValue < 0) {
      found.reorder_level = t.productForm.invalidNumber;
    } else {
      reorder = reorderValue;
    }

    if (isNew && values.opening_qty.trim()) {
      const openingValue = Number(values.opening_qty.trim());
      if (!Number.isFinite(openingValue) || openingValue < 0) {
        found.opening_qty = t.productForm.invalidNumber;
      } else {
        opening = openingValue;
      }
    }

    const barcode = values.barcode.trim();
    if (barcode) {
      let clash: Product | undefined;
      try {
        clash = await productsRepo.getByBarcode(barcode);
      } catch (cause) {
        console.error('[products] barcode check failed', cause);
        setSaveError(classifyWriteError(cause));
        return;
      }
      if (clash && clash.id !== product?.id) {
        found.barcode = t.productForm.duplicateBarcode;
      }
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await ensureDevice();

      const saved = await productsRepo.upsert({
        id: product?.id,
        name: values.name.trim(),
        name_am: values.name_am.trim(),
        barcode: barcode || null,
        unit: values.unit,
        cost_price: cost,
        sell_price: sell,
        reorder_level: reorder,
        is_active: values.is_active,
      });

      // Opening stock is a movement with reason 'opening'. It does not set a
      // quantity field, because there isn't one.
      if (isNew && opening > 0) {
        await stockRepo.openingStock({ productId: saved.id, qty: opening });
      }

      router.push('/products');
    } catch (cause) {
      // The form keeps what was typed, so the owner frees space and taps save
      // again. A product saved without its opening stock is still listed and
      // can be restocked from its stock page.
      console.error('[products] not saved', cause);
      setSaveError(classifyWriteError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    if (!window.confirm(t.products.deleteConfirm)) return;

    setSaveError(undefined);
    try {
      await productsRepo.softDelete(product.id);
    } catch (cause) {
      console.error('[products] not deleted', cause);
      setSaveError(classifyWriteError(cause));
      return;
    }
    router.push('/products');
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field
        htmlFor="f-barcode"
        label={t.productForm.barcode}
        sublabel={other.productForm.barcode}
        hint={t.productForm.barcodeHint}
        error={errors.barcode}
      >
        <TextInput
          id="f-barcode"
          /* Auto-focused so a scanner can fire the moment the screen opens. */
          autoFocus
          autoComplete="off"
          value={values.barcode}
          invalid={Boolean(errors.barcode)}
          onChange={(event) => set('barcode', event.target.value)}
          onKeyDown={onEnter('f-name-am')}
          className="num"
        />
      </Field>

      <Field
        htmlFor="f-name-am"
        label={t.productForm.nameAm}
        sublabel={other.productForm.nameAm}
        error={errors.name_am}
      >
        <TextInput
          id="f-name-am"
          value={values.name_am}
          invalid={Boolean(errors.name_am)}
          onChange={(event) => set('name_am', event.target.value)}
          onKeyDown={onEnter('f-name')}
          className="ethiopic"
        />
      </Field>

      <Field
        htmlFor="f-name"
        label={t.productForm.name}
        sublabel={other.productForm.name}
        error={errors.name}
      >
        <TextInput
          id="f-name"
          value={values.name}
          invalid={Boolean(errors.name)}
          onChange={(event) => set('name', event.target.value)}
          onKeyDown={onEnter('f-cost')}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          htmlFor="f-cost"
          label={t.productForm.costPrice}
          sublabel={other.productForm.costPrice}
          error={errors.cost_price}
        >
          <NumberInput
            id="f-cost"
            value={values.cost_price}
            placeholder="0.00"
            invalid={Boolean(errors.cost_price)}
            onChange={(event) => set('cost_price', event.target.value)}
            onKeyDown={onEnter('f-sell')}
          />
        </Field>

        <Field
          htmlFor="f-sell"
          label={t.productForm.sellPrice}
          sublabel={other.productForm.sellPrice}
          error={errors.sell_price}
        >
          <NumberInput
            id="f-sell"
            value={values.sell_price}
            placeholder="0.00"
            invalid={Boolean(errors.sell_price)}
            onChange={(event) => set('sell_price', event.target.value)}
            onKeyDown={onEnter('f-reorder')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field htmlFor="f-unit" label={t.productForm.unit} sublabel={other.productForm.unit}>
          <Select
            id="f-unit"
            value={values.unit}
            onChange={(event) => set('unit', event.target.value as Unit)}
            className="ethiopic"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t.units[unit]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          htmlFor="f-reorder"
          label={t.productForm.reorderLevel}
          sublabel={other.productForm.reorderLevel}
          hint={t.productForm.reorderHint}
          error={errors.reorder_level}
        >
          <NumberInput
            id="f-reorder"
            value={values.reorder_level}
            invalid={Boolean(errors.reorder_level)}
            onChange={(event) => set('reorder_level', event.target.value)}
            onKeyDown={onEnter(isNew ? 'f-opening' : null)}
          />
        </Field>
      </div>

      {isNew ? (
        <Field
          htmlFor="f-opening"
          label={t.productForm.openingQty}
          sublabel={other.productForm.openingQty}
          hint={t.productForm.openingHint}
          error={errors.opening_qty}
        >
          <NumberInput
            id="f-opening"
            value={values.opening_qty}
            placeholder="0"
            invalid={Boolean(errors.opening_qty)}
            onChange={(event) => set('opening_qty', event.target.value)}
            onKeyDown={onEnter(null)}
          />
        </Field>
      ) : null}

      <label className="flex min-h-touch items-center gap-3">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(event) => set('is_active', event.target.checked)}
          className="size-5 accent-[var(--color-ink)]"
        />
        <span className="flex flex-col leading-tight">
          <span className="ethiopic text-sm font-medium">{t.productForm.isActive}</span>
          <span className="text-xs text-muted">{other.productForm.isActive}</span>
        </span>
      </label>

      <SaveError failure={saveError} />

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" variant="money" disabled={saving} className="flex-1">
          <span className="ethiopic">{saving ? t.common.saving : t.common.save}</span>
        </Button>
        <Button type="button" variant="quiet" onClick={() => router.back()}>
          <span className="ethiopic">{t.common.cancel}</span>
        </Button>
        {product ? (
          <Button type="button" variant="danger" onClick={handleDelete}>
            <span className="ethiopic">{t.common.delete}</span>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
