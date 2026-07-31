import type { Product, Sale, SaleItem, StockMovement } from '@/lib/db';
// Explicit extension so `npm run seed:demo` can import this under Node's
// native ESM resolver, which does not guess.
import { DEMO_CATALOGUE } from './catalogue.ts';

/**
 * A month of trading for a shop that does not exist, generated deterministically
 * so `npm run seed:demo` can assert the shape is believable before it ever
 * reaches a tablet. Nothing here touches the database — it returns plain rows.
 */

export interface DemoData {
  products: Product[];
  cashiers: { name: string; pin: string }[];
  sales: Sale[];
  items: SaleItem[];
  movements: StockMovement[];
}

export interface DemoOptions {
  shopId: string;
  deviceId: string;
  devicePrefix?: string;
  now?: Date;
  days?: number;
  seed?: number;
  /** How many products should end at or below their reorder level. */
  lowStockCount?: number;
}

/** Quiet mid-morning, a lunch bump, and the evening rush after work. */
const HOUR_WEIGHTS: Record<number, number> = {
  7: 0.4,
  8: 0.75,
  9: 0.6,
  10: 0.4,
  11: 0.45,
  12: 0.9,
  13: 0.85,
  14: 0.55,
  15: 0.6,
  16: 0.9,
  17: 1.35,
  18: 1.7,
  19: 1.5,
  20: 1.0,
  21: 0.45,
};

/** Sunday through Saturday. Saturday is the big shop. */
const WEEKDAY_WEIGHTS = [1.15, 0.9, 0.9, 0.95, 1.0, 1.1, 1.45];

const CASHIERS = [
  { name: 'መሠረት', pin: '1234', share: 0.65 },
  { name: 'ሰላም', pin: '4321', share: 0.35 },
];

const BASE_SALES_PER_DAY = 38;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic but validly shaped, because Postgres columns are uuid. */
function uuidFrom(rand: () => number): string {
  const hex = '0123456789abcdef';
  let out = '';

  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.floor(rand() * 16) & 0x3) | 0x8];
    else out += hex[Math.floor(rand() * 16)];
  }

  return out;
}

function pickWeighted<T>(rand: () => number, entries: [T, number][]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rand() * total;

  for (const [value, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }

  return entries[entries.length - 1]?.[0] as T;
}

export function generateDemo(options: DemoOptions): DemoData {
  const {
    shopId,
    deviceId,
    devicePrefix = 'A1',
    now = new Date(),
    days = 30,
    seed = 20260731,
    lowStockCount = 6,
  } = options;

  const rand = mulberry32(seed);

  const openedAt = new Date(now);
  openedAt.setDate(openedAt.getDate() - days);
  openedAt.setHours(6, 0, 0, 0);

  const products: Product[] = DEMO_CATALOGUE.map((entry) => ({
    id: uuidFrom(rand),
    shop_id: shopId,
    name: entry.name,
    name_am: entry.name_am,
    barcode: entry.barcode,
    unit: entry.unit,
    cost_price: entry.cost_price,
    sell_price: entry.sell_price,
    reorder_level: entry.reorder_level,
    is_active: true,
    updated_at: openedAt.toISOString(),
    deleted_at: null,
  }));

  const weightedProducts: [number, number][] = DEMO_CATALOGUE.map((entry, index) => [
    index,
    entry.popularity,
  ]);

  const sales: Sale[] = [];
  const items: SaleItem[] = [];
  const movements: StockMovement[] = [];
  const soldPerProduct = new Array<number>(products.length).fill(0);

  let receiptCounter = 0;

  for (let dayOffset = days; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - dayOffset);
    day.setHours(0, 0, 0, 0);

    // The current day is only part-done, so it gets a partial count.
    const isToday = dayOffset === 0;
    const weekday = WEEKDAY_WEIGHTS[day.getDay()] ?? 1;
    const jitter = 0.82 + rand() * 0.36;
    const hoursSoFar = isToday ? Math.max(1, new Date(now).getHours() - 7) : 14;

    const count = Math.max(
      1,
      Math.round(BASE_SALES_PER_DAY * weekday * jitter * (hoursSoFar / 14)),
    );

    // Trading hours available on this day. Before 07:00 the shop has not
    // opened yet, so today contributes nothing rather than an invalid time.
    const openHours = Object.entries(HOUR_WEIGHTS)
      .map(([key, weight]) => [Number(key), weight] as [number, number])
      .filter(([hour]) => !isToday || hour <= now.getHours());

    if (openHours.length === 0) continue;

    for (let i = 0; i < count; i += 1) {
      const hour = pickWeighted(rand, openHours);
      const created = new Date(day);
      created.setHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      if (created > now) continue;

      const cashier = rand() < (CASHIERS[0]?.share ?? 0.65) ? CASHIERS[0] : CASHIERS[1];
      const saleId = uuidFrom(rand);
      const createdAt = created.toISOString();

      const lineCount = 1 + Math.floor(rand() * rand() * 5);
      const chosen = new Set<number>();

      for (let line = 0; line < lineCount; line += 1) {
        chosen.add(pickWeighted(rand, weightedProducts));
      }

      let subtotal = 0;

      for (const index of chosen) {
        const product = products[index] as Product;
        const qty = 1 + Math.floor(rand() * rand() * 3);
        const lineTotal = product.sell_price * qty;
        subtotal += lineTotal;
        soldPerProduct[index] = (soldPerProduct[index] ?? 0) + qty;

        items.push({
          id: uuidFrom(rand),
          shop_id: shopId,
          sale_id: saleId,
          product_id: product.id,
          name_snapshot: product.name_am,
          unit_price: product.sell_price,
          qty,
          line_total: lineTotal,
          created_at: createdAt,
        });

        movements.push({
          id: uuidFrom(rand),
          shop_id: shopId,
          product_id: product.id,
          qty_delta: -qty,
          reason: 'sale',
          ref_id: saleId,
          note: null,
          created_at: createdAt,
          device_id: deviceId,
        });
      }

      // A round-birr discount now and then, the way a shopkeeper actually does it.
      const discount = rand() < 0.12 ? Math.min(subtotal, 500 * (1 + Math.floor(rand() * 4))) : 0;
      const total = subtotal - discount;
      const method = rand() < 0.72 ? 'cash' : rand() < 0.85 ? 'telebirr' : 'card';

      receiptCounter += 1;

      sales.push({
        id: saleId,
        shop_id: shopId,
        device_id: deviceId,
        receipt_no: `${devicePrefix}-${String(receiptCounter).padStart(6, '0')}`,
        subtotal,
        discount,
        total,
        payment_method: method,
        cashier_name: cashier?.name ?? 'መሠረት',
        voided_by: null,
        voids_sale_id: null,
        cash_received:
          method === 'cash' ? Math.ceil(total / 5000) * 5000 : null,
        created_at: createdAt,
        synced_at: null,
      });
    }
  }

  sales.sort((a, b) => a.created_at.localeCompare(b.created_at));

  // ---- a couple of voids, so the audit trail has something in it --------
  const voidable = sales.filter((sale) => sale.voids_sale_id === null).slice(5, -5);

  for (let i = 0; i < 3 && voidable.length > 0; i += 1) {
    const original = voidable[Math.floor(rand() * voidable.length)] as Sale;
    if (sales.some((sale) => sale.voids_sale_id === original.id)) continue;

    const voidId = uuidFrom(rand);
    const voidedAt = new Date(Date.parse(original.created_at) + 4 * 60 * 1000).toISOString();
    receiptCounter += 1;

    sales.push({
      ...original,
      id: voidId,
      receipt_no: `${devicePrefix}-${String(receiptCounter).padStart(6, '0')}`,
      subtotal: -original.subtotal,
      discount: -original.discount,
      total: -original.total,
      voids_sale_id: original.id,
      cash_received: null,
      created_at: voidedAt,
    });

    for (const item of items.filter((row) => row.sale_id === original.id)) {
      items.push({
        ...item,
        id: uuidFrom(rand),
        sale_id: voidId,
        qty: -item.qty,
        line_total: -item.line_total,
        created_at: voidedAt,
      });

      const index = products.findIndex((product) => product.id === item.product_id);
      if (index >= 0) soldPerProduct[index] = (soldPerProduct[index] ?? 0) - item.qty;

      movements.push({
        id: uuidFrom(rand),
        shop_id: shopId,
        product_id: item.product_id,
        qty_delta: item.qty,
        reason: 'return',
        ref_id: voidId,
        note: 'ተሳስቶ ተመዝግቧል',
        created_at: voidedAt,
        device_id: deviceId,
      });
    }
  }

  // ---- opening stock, worked backwards from where we want to end up -----
  //
  // Stock on hand is SUM(qty_delta), so the opening movement is simply
  // "what was sold" plus "what should be left". That lets the low-stock
  // report show a real, deliberate six rather than whatever fell out.
  const lowStockIndexes = new Set<number>();
  const byPopularity = DEMO_CATALOGUE.map((entry, index) => ({ index, pop: entry.popularity })).sort(
    (a, b) => b.pop - a.pop,
  );

  for (const candidate of byPopularity) {
    if (lowStockIndexes.size >= lowStockCount) break;
    if ((soldPerProduct[candidate.index] ?? 0) > 0) lowStockIndexes.add(candidate.index);
  }

  products.forEach((product, index) => {
    const sold = soldPerProduct[index] ?? 0;

    const remaining = lowStockIndexes.has(index)
      ? Math.max(0, product.reorder_level - Math.floor(rand() * 4))
      : product.reorder_level + 8 + Math.floor(rand() * 40);

    movements.push({
      id: uuidFrom(rand),
      shop_id: shopId,
      product_id: product.id,
      qty_delta: sold + remaining,
      reason: 'opening',
      ref_id: null,
      note: null,
      created_at: openedAt.toISOString(),
      device_id: deviceId,
    });
  });

  movements.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return {
    products,
    cashiers: CASHIERS.map(({ name, pin }) => ({ name, pin })),
    sales,
    items,
    movements,
  };
}
