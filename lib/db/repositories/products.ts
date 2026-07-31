import { getDevice } from '../device';
import { newId, nowIso } from '../id';
import { db } from '../schema';
import type { Product, Unit } from '../schema';
import { localWrite } from '../write';

/**
 * products is a last-write-wins table: it is edited rarely, by one admin, from
 * one device, so the higher updated_at simply wins. Deletes are soft, because
 * a hard delete leaves no row to carry the news to the other replica.
 */

export interface ProductInput {
  /** Omit to create; pass to edit. */
  id?: string;
  name: string;
  name_am: string;
  barcode?: string | null;
  unit?: Unit;
  /** integer cents */
  cost_price: number;
  /** integer cents */
  sell_price: number;
  reorder_level?: number;
  is_active?: boolean;
}

function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be integer cents, received ${value}. Use parseETB().`);
  }
  if (value < 0) {
    throw new RangeError(`${label} cannot be negative, received ${value}`);
  }
}

export async function upsert(input: ProductInput): Promise<Product> {
  assertCents(input.cost_price, 'cost_price');
  assertCents(input.sell_price, 'sell_price');

  const meta = await getDevice();
  const existing = input.id ? await db.products.get(input.id) : undefined;

  const product: Product = {
    id: input.id ?? newId(),
    shop_id: meta.shop_id,
    name: input.name.trim(),
    name_am: input.name_am.trim(),
    barcode: input.barcode?.trim() || null,
    unit: input.unit ?? existing?.unit ?? 'pcs',
    cost_price: input.cost_price,
    sell_price: input.sell_price,
    reorder_level: input.reorder_level ?? existing?.reorder_level ?? 0,
    is_active: input.is_active ?? existing?.is_active ?? true,
    updated_at: nowIso(),
    deleted_at: existing?.deleted_at ?? null,
  };

  await localWrite('products', product);
  return product;
}

export async function getById(id: string): Promise<Product | undefined> {
  return db.products.get(id);
}

export async function getByBarcode(barcode: string): Promise<Product | undefined> {
  const trimmed = barcode.trim();
  if (!trimmed) return undefined;

  const matches = await db.products.where('barcode').equals(trimmed).toArray();
  return matches.find((product) => product.deleted_at === null);
}

export interface ListOptions {
  includeInactive?: boolean;
  includeDeleted?: boolean;
  sort?: 'name' | 'name_am';
}

export async function list(options: ListOptions = {}): Promise<Product[]> {
  const key = options.sort ?? 'name_am';
  const products = await db.products.orderBy(key).toArray();

  return products.filter((product) => {
    if (!options.includeDeleted && product.deleted_at !== null) return false;
    if (!options.includeInactive && !product.is_active) return false;
    return true;
  });
}

/**
 * Search name, name_am and barcode. An exact barcode hit short-circuits and
 * returns alone, because that is a scanner firing and the cashier wants the
 * one item, not a result set.
 */
export async function search(term: string, options: ListOptions = {}): Promise<Product[]> {
  const needle = term.trim().toLowerCase();
  if (!needle) return list(options);

  const scanned = await getByBarcode(term);
  if (scanned) return [scanned];

  const products = await list(options);

  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(needle) ||
      product.name_am.toLowerCase().includes(needle) ||
      (product.barcode?.toLowerCase().includes(needle) ?? false),
  );
}

/** Soft delete only. The row stays so the tombstone can replicate. */
export async function softDelete(id: string): Promise<Product> {
  const existing = await db.products.get(id);
  if (!existing) {
    throw new Error(`Cannot delete unknown product ${id}`);
  }

  const deleted: Product = {
    ...existing,
    is_active: false,
    deleted_at: nowIso(),
    updated_at: nowIso(),
  };

  await localWrite('products', deleted);
  return deleted;
}
