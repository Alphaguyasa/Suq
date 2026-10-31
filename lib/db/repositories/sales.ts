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
  /** integer cents handed over. Recorded for cash only, so a reprint can show the change. */
  cash_received?: number;
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
    shop_id: meta.shop_id,
    sale_id: saleId,
    product_id: line.product_id,
    name_snapshot: line.name_snapshot,
    unit_price: line.unit_price,
    qty: line.qty,
    line_total: lineTotal(line),
    created_at,
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
        cash_received:
          payment.method === 'cash' && payment.cash_received !== undefined
            ? payment.cash_received
            : null,
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

/**
 * Voided status is derived, not stored — the void row is the evidence.
 *
 * Two tills can each void the same receipt while offline, so a sale may end
 * up with more than one void row. The earliest one (created_at, then id, so
 * every device picks the same row) is THE void; any later one is a duplicate
 * that reconcileDuplicateVoids() reverses.
 */
export async function findVoidOf(saleId: string): Promise<Sale | null> {
  const found = await db.sales.where('voids_sale_id').equals(saleId).toArray();
  return found.sort(byCreation)[0] ?? null;
}

function byCreation(a: Sale, b: Sale): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function isVoided(saleId: string): Promise<boolean> {
  return (await findVoidOf(saleId)) !== null;
}

/**
 * Product ids in recency order, most recently sold first. Feeds the sale
 * screen's tile order: someone ringing up the same twelve items every morning
 * should find them without hunting.
 */
export async function recentProductIds(limit = 12): Promise<string[]> {
  const recent = (await db.sales.orderBy('created_at').reverse().limit(40).toArray()).filter(
    (sale) => sale.voids_sale_id === null,
  );

  // One query for every line of those sales, not one per sale: this runs
  // after every write on the sale screen.
  const lines = await db.sale_items
    .where('sale_id')
    .anyOf(recent.map((sale) => sale.id))
    .toArray();
  const linesBySale = new Map<string, SaleItem[]>();
  for (const line of lines) {
    linesBySale.set(line.sale_id, [...(linesBySale.get(line.sale_id) ?? []), line]);
  }

  const ids = new Set<string>();
  for (const sale of recent) {
    for (const item of linesBySale.get(sale.id) ?? []) {
      ids.add(item.product_id);
      if (ids.size >= limit) return [...ids];
    }
  }

  return [...ids];
}

/**
 * Sales whose created_at falls in [from, to), oldest first, read through the
 * created_at index: a report for today should not load a year of trading.
 */
export async function between(from: string, to: string): Promise<Sale[]> {
  return db.sales.where('created_at').between(from, to, true, false).toArray();
}

/** Every line of the given sales, in one query. */
export async function itemsForSales(saleIds: string[]): Promise<SaleItem[]> {
  if (saleIds.length === 0) return [];
  return db.sale_items.where('sale_id').anyOf(saleIds).toArray();
}

export interface HistoryPage {
  /** Newest first, always whole local days, so each day's total is the real one. */
  sales: Sale[];
  /** Older sales exist beyond the last day returned. */
  hasMore: boolean;
}

/**
 * The newest `limit` sales for the history screen, extended back to the start
 * of the oldest day they touch. Cutting a day in half would print a day total
 * that is wrong. Index range reads only; older days stay on disk.
 */
export async function history(limit: number): Promise<HistoryPage> {
  const newest = await db.sales.orderBy('created_at').reverse().limit(limit).toArray();
  const oldest = newest[newest.length - 1];
  if (newest.length < limit || !oldest) return { sales: newest, hasMore: false };

  const dayStart = new Date(oldest.created_at);
  dayStart.setHours(0, 0, 0, 0);
  const from = dayStart.toISOString();

  const sales = await db.sales.where('created_at').aboveOrEqual(from).reverse().toArray();
  const hasMore = (await db.sales.where('created_at').below(from).limit(1).count()) > 0;

  return { sales, hasMore };
}

/**
 * Receipts whose number contains `term`, newest first, at most `limit`. Not
 * indexable (a substring), so it scans — but only while someone is searching.
 */
export async function searchByReceipt(term: string, limit: number): Promise<Sale[]> {
  const needle = term.trim().toLowerCase();
  return db.sales
    .orderBy('created_at')
    .reverse()
    .filter((sale) => sale.receipt_no.toLowerCase().includes(needle))
    .limit(limit)
    .toArray();
}

/** Which of these sales have a void row pointing at them. */
export async function voidedAmong(saleIds: string[]): Promise<Set<string>> {
  if (saleIds.length === 0) return new Set();
  const voids = await db.sales.where('voids_sale_id').anyOf(saleIds).toArray();
  return new Set(voids.map((row) => row.voids_sale_id as string));
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

  return appendReversal(original, reason, 'return', () => {
    throw new Error(`Sale ${original.receipt_no} is already voided.`);
  });
}

/**
 * Writes a mirror image of `target` (negated totals and lines) and the stock
 * movements that undo its movements, in one transaction.
 *
 * The "already reversed?" check runs INSIDE the transaction: checked outside,
 * a double tap (or two tabs) could both pass it before either wrote.
 */
async function appendReversal(
  target: Sale,
  note: string | null,
  movementReason: 'return' | 'sale',
  onAlreadyReversed: () => never,
): Promise<Sale> {
  const targetItems = await itemsFor(target.id);
  const meta = await getDevice();
  const reversalId = newId();
  const created_at = nowIso();

  const items: SaleItem[] = targetItems.map((item) => ({
    id: newId(),
    shop_id: target.shop_id,
    sale_id: reversalId,
    product_id: item.product_id,
    name_snapshot: item.name_snapshot,
    unit_price: item.unit_price,
    qty: -item.qty,
    line_total: -item.line_total,
    created_at,
  }));

  // A sale's lines took goods out, so reversing it puts item.qty back; a void's
  // lines carry negative qty, so reversing a void takes them out again.
  const movements = targetItems.map((item) =>
    makeMovement(meta, {
      productId: item.product_id,
      qtyDelta: item.qty,
      reason: movementReason,
      refId: reversalId,
      note,
    }),
  );

  let reversal!: Sale;

  await db.transaction(
    'rw',
    [db.sales, db.sale_items, db.stock_movements, db.outbox, db.device_meta, db.stock_cache],
    async () => {
      if ((await db.sales.where('voids_sale_id').equals(target.id).count()) > 0) {
        onAlreadyReversed();
      }

      reversal = {
        id: reversalId,
        shop_id: target.shop_id,
        device_id: meta.device_id,
        receipt_no: await nextReceiptNo(),
        subtotal: -target.subtotal,
        discount: -target.discount,
        total: -target.total,
        payment_method: target.payment_method,
        cashier_name: meta.cashier_name,
        voided_by: null,
        voids_sale_id: target.id,
        cash_received: null,
        created_at,
        synced_at: null,
      };

      await localWrite('sales', reversal);
      if (items.length > 0) await localWriteMany('sale_items', items);
      if (movements.length > 0) await localWriteMany('stock_movements', movements);

      for (const productId of new Set(targetItems.map((item) => item.product_id))) {
        await recomputeCache(productId);
      }
    },
  );

  return reversal;
}

class AlreadyReconciled extends Error {}

/**
 * Two offline tills voided the same sale: after they sync, every device holds
 * two void rows, so takings drop twice and the goods come back twice. Rows are
 * immutable, so the fix is another row — a reversal of the duplicate void,
 * which takes its money and stock back out.
 *
 * Only the device that wrote a duplicate reverses it. Every device sees the
 * same rows and picks the same earliest void (findVoidOf), so exactly one
 * device is responsible for each duplicate and no two tills can write the
 * same correction twice. That device learns about the clash on its next pull,
 * which is when the sync engine calls this. Reports need no special case:
 * once the reversal exists, plain sums are right again.
 *
 * A device that is reset before it pulls keeps its device_id (see
 * previous-till.ts), so it still corrects its duplicate after signing in
 * again. Only if site storage is wiped too does nobody correct it.
 *
 * Returns the reversal rows written.
 */
export async function reconcileDuplicateVoids(): Promise<Sale[]> {
  const meta = await getDevice();

  // Rows with voids_sale_id = null are not in that index at all (null is not
  // a valid IndexedDB key), so this reads void rows only.
  const voidRows = await db.sales.orderBy('voids_sale_id').toArray();

  const byTarget = new Map<string, Sale[]>();
  for (const row of voidRows) {
    const target = row.voids_sale_id as string;
    byTarget.set(target, [...(byTarget.get(target) ?? []), row]);
  }

  const written: Sale[] = [];

  for (const rows of byTarget.values()) {
    if (rows.length < 2) continue;

    for (const duplicate of rows.sort(byCreation).slice(1)) {
      if (duplicate.device_id !== meta.device_id) continue;
      if (byTarget.has(duplicate.id)) continue;

      try {
        written.push(
          await appendReversal(duplicate, null, 'sale', () => {
            throw new AlreadyReconciled();
          }),
        );
      } catch (cause) {
        if (!(cause instanceof AlreadyReconciled)) throw cause;
      }
    }
  }

  return written;
}
