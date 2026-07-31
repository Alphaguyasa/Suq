/** Test-only. Builds a second replica so two tills can be simulated properly. */
import { DEVICE_META_ID, SuqDatabase, localWrite, localWriteMany, newId } from '@/lib/db';
import type { Product, Sale, SaleItem, StockMovement } from '@/lib/db';

export const SHOP = 'shop-under-test';

export interface Replica {
  db: SuqDatabase;
  deviceId: string;
  prefix: string;
  counter: number;
}

export async function makeReplica(name: string, prefix: string): Promise<Replica> {
  const db = new SuqDatabase(name);
  await db.open();

  await Promise.all(db.tables.map((table) => table.clear()));

  const deviceId = newId();
  await db.device_meta.put({
    id: DEVICE_META_ID,
    device_id: deviceId,
    device_prefix: prefix,
    shop_id: SHOP,
    receipt_counter: 0,
    last_pull_at: null,
    cashier_name: 'መሠረት',
  });

  return { db, deviceId, prefix, counter: 0 };
}

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: newId(),
    shop_id: SHOP,
    name: 'Ambo Water 1L',
    name_am: 'አምቦ ውሃ 1 ሊትር',
    barcode: '6130001000017',
    unit: 'pcs',
    cost_price: 2600,
    sell_price: 3500,
    reorder_level: 24,
    is_active: true,
    updated_at: '2026-07-31T09:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

/**
 * Rings up a sale on a replica through the real localWrite path, so what
 * lands in the outbox is exactly what the app would have queued.
 */
export async function sellOn(
  replica: Replica,
  input: { productId: string; qty: number; unitPrice?: number; createdAt?: string },
): Promise<{ sale: Sale; item: SaleItem; movement: StockMovement }> {
  replica.counter += 1;

  const saleId = newId();
  const unitPrice = input.unitPrice ?? 3500;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const lineTotal = Math.round(unitPrice * input.qty);

  const sale: Sale = {
    id: saleId,
    shop_id: SHOP,
    device_id: replica.deviceId,
    receipt_no: `${replica.prefix}-${String(replica.counter).padStart(6, '0')}`,
    subtotal: lineTotal,
    discount: 0,
    total: lineTotal,
    payment_method: 'cash',
    cashier_name: 'መሠረት',
    voided_by: null,
    voids_sale_id: null,
    cash_received: null,
    created_at: createdAt,
    synced_at: null,
  };

  const item: SaleItem = {
    id: newId(),
    shop_id: SHOP,
    sale_id: saleId,
    product_id: input.productId,
    name_snapshot: 'አምቦ ውሃ 1 ሊትር',
    unit_price: unitPrice,
    qty: input.qty,
    line_total: lineTotal,
    created_at: createdAt,
  };

  const movement: StockMovement = {
    id: newId(),
    shop_id: SHOP,
    product_id: input.productId,
    qty_delta: -input.qty,
    reason: 'sale',
    ref_id: saleId,
    note: null,
    created_at: createdAt,
    device_id: replica.deviceId,
  };

  await localWrite('sales', sale, replica.db);
  await localWriteMany('sale_items', [item], replica.db);
  await localWriteMany('stock_movements', [movement], replica.db);

  return { sale, item, movement };
}

export async function onHandIn(db: SuqDatabase, productId: string): Promise<number> {
  const movements = await db.stock_movements.where('product_id').equals(productId).toArray();
  return movements.reduce((sum, movement) => sum + movement.qty_delta, 0);
}
