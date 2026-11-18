import Dexie from 'dexie';
import { newId } from './id';
import { db } from './schema';
import type { PriceChange, Product, SuqDatabase } from './schema';

/**
 * The price-change log (see PriceChange in schema.ts).
 *
 * A row is written only when the sell or cost price really moved. Creating a
 * product is not a change (there was no earlier price), and an edit that only
 * renames it, or a soft delete, leaves the prices alone and writes nothing.
 * Callers run this inside the transaction that writes the product, so a
 * product can never show a new price with no log row behind it.
 */
export function priceChangeFor(
  before: Product | undefined,
  after: Product,
  source: PriceChange['source'],
  cashier_name: string,
): PriceChange | null {
  if (!before) return null;
  if (before.sell_price === after.sell_price && before.cost_price === after.cost_price) {
    return null;
  }

  return {
    id: newId(),
    shop_id: after.shop_id,
    product_id: after.id,
    old_sell_price: before.sell_price,
    new_sell_price: after.sell_price,
    old_cost_price: before.cost_price,
    new_cost_price: after.cost_price,
    cashier_name,
    source,
    changed_at: after.updated_at,
  };
}

/** One product's price history, newest first. */
export async function listPriceChanges(
  productId: string,
  database: SuqDatabase = db,
): Promise<PriceChange[]> {
  return database.price_changes
    .where('[product_id+changed_at]')
    .between([productId, Dexie.minKey], [productId, Dexie.maxKey])
    .reverse()
    .toArray();
}

/** Every product's price changes in [from, to), newest first: the period's audit list. */
export async function priceChangesBetween(
  from: string,
  to: string,
  database: SuqDatabase = db,
): Promise<PriceChange[]> {
  return database.price_changes.where('changed_at').between(from, to, true, false).reverse().toArray();
}
