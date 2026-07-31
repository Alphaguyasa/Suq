import { getDevice, nextReceiptNo } from '../device';
import { newId, nowIso } from '../id';
import { db } from '../schema';
import type { PaymentMethod, Sale, SaleItem } from '../schema';
import { localWrite, localWriteMany } from '../write';
import { makeMovement, recomputeCache } from './stock';

/**
 * sales, sale_items and stock_movements are immutable. Nothing here updates or
 * deletes a row; a correction is a new void sale plus compensating movements
 * (BUILD_GUIDE 3.6). Postgres has no update or delete policy on these tables,
 * so a client-side bug cannot corrupt history even if it tries.
 */

export interface CartLine {
  product_id: string;
  /** Name AT TIME OF SALE. The product may be renamed later; receipts must not change. */
  name_snapshot: string;
  /** integer cents, AT TIME OF SALE */
  unit_price: number;
  qty: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  /** integer cents, applied to the whole sale */
  discount?: number;
  cashier_name?: string;
}

export interface SaleDetail {
  sale: Sale;
  items: SaleItem[];
  /** The void row that reverses this sale, if there is one. */
  voidedBy: Sale | null;
}

function lineTotal(line: CartLine): number {
  // qty may be fractional for kg/l products, so round to whole cents here —
  // the one place rounding is allowed, and it happens before anything is stored.
  return Math.round(line.unit_price * line.qty);
}

function assertCart(cart: CartLine[]): void {
  if (cart.length === 0) {
    throw new Error('Cannot complete a sale with an empty cart.');
  }

  for (const line of cart) {
    if (!Number.isInteger(line.unit_price) || line.unit_price < 0) {
      throw new TypeError(
        `unit_price must be non-negative integer cents, received ${line.unit_price}`,
      );
    }
    if (!Number.isFinite(line.qty) || line.qty <= 0) {
      throw new RangeError(`qty must be a positive finite number, received ${line.qty}`);
    }
  }
}

/**
 * Writes the sale, its items and its negative stock movements in ONE
 * transaction. Never awaits the network — the outbox does that later.
 *
 * Selling into negative stock is allowed on purpose: shops miscount, and
 * blocking a real sale over a data discrepancy is how software gets abandoned.
 * The UI warns; the database does not refuse.
 */
export async function create(cart: CartLine[], payment: PaymentInput): Promise<Sale> {
  assertCart(cart);

  const discount = payment.discount ?? 0;
  if (!Number.isInteger(discount) || discount < 0) {
    throw new TypeError(`discount must be non-negative integer cents, received ${discount}`);
  }

  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0);
  if (discount > subtotal) {
    throw new RangeError(`Discount ${discount} exceeds subtotal ${subtotal}`);
  }

  const meta = await getDevice();
  const saleId = newId();
  const created_at = nowIso();

  const items: SaleItem[] = cart.map((line) => ({
    id: newId(),
    sale_id: saleId,
    product_id: line.product_id,
    name_snapshot: line.name_snapshot,
    unit_price: line.unit_price,
    qty: line.qty,
    line_total: lineTotal(line),
  }));

  // One movement per cart line, carrying the whole quantity.
  const movements = cart.map((line) =>
    makeMovement(meta, {
      productId: line.product_id,
      qtyDelta: -line.qty,
      reason: 'sale',
      refId: saleId,
    }),
  );

  let sale!: Sale;

  await db.transaction(
    'rw',
    [db.sales, db.sale_items, db.stock_movements, db.outbox, db.device_meta, db.stock_cache],
    async () => {
      sale = {
        id: saleId,
        shop_id: meta.shop_id,
        device_id: meta.device_id,
        receipt_no: await nextReceiptNo(),
        subtotal,
        discount,
        total: subtotal - discount,
        payment_method: payment.method,
        cashier_name: payment.cashier_name ?? meta.cashier_name,
        voided_by: null,
        voids_sale_id: null,
        created_at,
        synced_at: null,
      };

      await localWrite('sales', sale);
      await localWriteMany('sale_items', items);
      await localWriteMany('stock_movements', movements);

      for (const productId of new Set(cart.map((line) => line.product_id))) {
        await recomputeCache(productId);
      }
    },
  );

  return sale;
}

export async function getById(id: string): Promise<SaleDetail | null> {
  const sale = await db.sales.get(id);
  if (!sale) return null;

  const [items, voidedBy] = await Promise.all([itemsFor(id), findVoidOf(id)]);
  return { sale, items, voidedBy };
}

export async function getByReceiptNo(receiptNo: string): Promise<Sale | undefined> {
  return db.sales.where('receipt_no').equals(receiptNo).first();
}

export async function itemsFor(saleId: string): Promise<SaleItem[]> {
  return db.sale_items.where('sale_id').equals(saleId).toArray();
}

/** Voided status is derived, not stored — the void row is the evidence. */
export async function findVoidOf(saleId: string): Promise<Sale | null> {
  const found = await db.sales.where('voids_sale_id').equals(saleId).first();
  return found ?? null;
}

export async function isVoided(saleId: string): Promise<boolean> {
  return (await findVoidOf(saleId)) !== null;
}

export interface SaleListOptions {
  limit?: number;
  /** Hide void rows themselves from the list. */
  excludeVoidRows?: boolean;
}

export async function list(options: SaleListOptions = {}): Promise<Sale[]> {
  let collection = db.sales.orderBy('created_at').reverse();

  if (options.limit !== undefined) {
    collection = collection.limit(options.limit);
  }

  const sales = await collection.toArray();

  return options.excludeVoidRows ? sales.filter((sale) => sale.voids_sale_id === null) : sales;
}

/**
 * Void a sale. Named voidSale because `void` is a reserved word.
 *
 * Appends a mirror-image sale (negative totals, so daily takings net out), a
 * mirror-image set of items, and compensating stock movements that put the
 * goods back. The original row is not touched — it cannot be, and the audit
 * trail is better for it: when the owner asks who voided this and why, the
 * answer is a row.
 */
export async function voidSale(saleId: string, reason: string): Promise<Sale> {
  const original = await db.sales.get(saleId);
  if (!original) {
    throw new Error(`Cannot void unknown sale ${saleId}`);
  }
  if (original.voids_sale_id !== null) {
    throw new Error(`Sale ${original.receipt_no} is itself a void row and cannot be voided.`);
  }
  if (await isVoided(saleId)) {
    throw new Error(`Sale ${original.receipt_no} is already voided.`);
  }

  const originalItems = await itemsFor(saleId);
  const meta = await getDevice();
  const voidId = newId();
  const created_at = nowIso();

  const items: SaleItem[] = originalItems.map((item) => ({
    id: newId(),
    sale_id: voidId,
    product_id: item.product_id,
    name_snapshot: item.name_snapshot,
    unit_price: item.unit_price,
    qty: -item.qty,
    line_total: -item.line_total,
  }));

  const movements = originalItems.map((item) =>
    makeMovement(meta, {
      productId: item.product_id,
      qtyDelta: item.qty,
      reason: 'return',
      refId: voidId,
      note: reason,
    }),
  );

  let voidRow!: Sale;

  await db.transaction(
    'rw',
    [db.sales, db.sale_items, db.stock_movements, db.outbox, db.device_meta, db.stock_cache],
    async () => {
      voidRow = {
        id: voidId,
        shop_id: original.shop_id,
        device_id: meta.device_id,
        receipt_no: await nextReceiptNo(),
        subtotal: -original.subtotal,
        discount: -original.discount,
        total: -original.total,
        payment_method: original.payment_method,
        cashier_name: meta.cashier_name,
        voided_by: null,
        voids_sale_id: saleId,
        created_at,
        synced_at: null,
      };

      await localWrite('sales', voidRow);
      if (items.length > 0) await localWriteMany('sale_items', items);
      if (movements.length > 0) await localWriteMany('stock_movements', movements);

      for (const productId of new Set(originalItems.map((item) => item.product_id))) {
        await recomputeCache(productId);
      }
    },
  );

  return voidRow;
}
