import { getDevice } from '../device';
import { newId, nowIso } from '../id';
import { db } from '../schema';
import type { MovementReason, StockMovement } from '../schema';
import { localWrite } from '../write';

/**
 * Stock on hand is ALWAYS SUM(stock_movements.qty_delta). It is never stored,
 * never updated, never synced as an absolute number.
 *
 * Two tills, both offline, both selling the last case of water: each appends
 * qty_delta -1, they sync in either order, the sum is -2. Correct. Do the same
 * thing with a stock_qty column and whichever syncs last wins, one sale is
 * silently erased, and the owner's count drifts from reality a little more
 * every day until they stop trusting the system. BUILD_GUIDE 3.5.
 */

export interface MovementInput {
  productId: string;
  qtyDelta: number;
  reason: MovementReason;
  refId?: string | null;
  note?: string | null;
}

function assertQuantity(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, received ${value}`);
  }
}

/** Pure builder, so a sale can construct its movements inside its own transaction. */
export function makeMovement(
  meta: { shop_id: string; device_id: string },
  input: MovementInput,
): StockMovement {
  assertQuantity(input.qtyDelta, 'qty_delta');

  if (input.qtyDelta === 0) {
    throw new RangeError('A movement of zero carries no information; do not record one.');
  }

  return {
    id: newId(),
    shop_id: meta.shop_id,
    product_id: input.productId,
    qty_delta: input.qtyDelta,
    reason: input.reason,
    ref_id: input.refId ?? null,
    note: input.note ?? null,
    created_at: nowIso(),
    device_id: meta.device_id,
  };
}

export async function onHand(productId: string): Promise<number> {
  const movements = await db.stock_movements.where('product_id').equals(productId).toArray();
  return movements.reduce((sum, movement) => sum + movement.qty_delta, 0);
}

export async function onHandAll(): Promise<Map<string, number>> {
  const totals = new Map<string, number>();

  await db.stock_movements.each((movement) => {
    totals.set(movement.product_id, (totals.get(movement.product_id) ?? 0) + movement.qty_delta);
  });

  return totals;
}

/**
 * Recompute the render cache from movements. This is the only way stock_cache
 * is ever written — nothing increments it, nothing sets it from a sale.
 */
export async function recomputeCache(productId?: string): Promise<void> {
  await db.transaction('rw', db.stock_movements, db.stock_cache, async () => {
    const computed_at = nowIso();

    if (productId !== undefined) {
      await db.stock_cache.put({ product_id: productId, on_hand: await onHand(productId), computed_at });
      return;
    }

    const totals = await onHandAll();
    await db.stock_cache.clear();
    await db.stock_cache.bulkPut(
      [...totals].map(([product_id, on_hand]) => ({ product_id, on_hand, computed_at })),
    );
  });
}

export async function cachedOnHand(productId: string): Promise<number> {
  const entry = await db.stock_cache.get(productId);
  return entry?.on_hand ?? 0;
}

/** Append one movement and refresh that product's cache entry, atomically. */
export async function appendMovement(input: MovementInput): Promise<StockMovement> {
  const meta = await getDevice();
  const movement = makeMovement(meta, input);

  await db.transaction(
    'rw',
    db.stock_movements,
    db.outbox,
    db.stock_cache,
    async () => {
      await localWrite('stock_movements', movement);
      await recomputeCache(input.productId);
    },
  );

  return movement;
}

export async function restock(input: {
  productId: string;
  qty: number;
  note?: string;
}): Promise<StockMovement> {
  assertQuantity(input.qty, 'restock qty');
  if (input.qty <= 0) {
    throw new RangeError('Restock quantity must be positive. To remove stock, use adjust().');
  }

  return appendMovement({
    productId: input.productId,
    qtyDelta: input.qty,
    reason: 'purchase',
    note: input.note ?? null,
  });
}

/** Opening balance when a product is first created. Not a quantity field — a movement. */
export async function openingStock(input: {
  productId: string;
  qty: number;
  note?: string;
}): Promise<StockMovement | null> {
  assertQuantity(input.qty, 'opening qty');
  if (input.qty === 0) return null;

  return appendMovement({
    productId: input.productId,
    qtyDelta: input.qty,
    reason: 'opening',
    note: input.note ?? null,
  });
}

/**
 * Correct stock to a counted number. Writes the delta needed to get there,
 * so the movement history still explains how the number changed and by whom.
 * Returns null when the count already matches — no movement, no noise.
 */
export async function adjust(input: {
  productId: string;
  countedQty: number;
  reason: Extract<MovementReason, 'adjustment' | 'damage' | 'return'>;
  note?: string;
}): Promise<StockMovement | null> {
  assertQuantity(input.countedQty, 'counted qty');

  const current = await onHand(input.productId);
  const delta = input.countedQty - current;

  if (delta === 0) return null;

  return appendMovement({
    productId: input.productId,
    qtyDelta: delta,
    reason: input.reason,
    note: input.note ?? null,
  });
}

export async function movementsFor(productId: string): Promise<StockMovement[]> {
  const movements = await db.stock_movements.where('product_id').equals(productId).toArray();
  return movements.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
