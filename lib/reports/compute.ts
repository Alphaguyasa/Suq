import type { PaymentMethod, Product, Sale, SaleItem } from '@/lib/db';
import { localDayKey } from '@/lib/sales/grouping';

/**
 * All of this is pure and reads nothing, so the numbers can be checked against
 * figures worked out by hand. That is the whole "done when" for this session.
 *
 * How voids are counted, stated once so every figure below is consistent:
 *
 *   Net takings  — sums EVERY sale row in the period. A void row carries
 *                  negative totals, so it subtracts on the day it was made.
 *                  That is what actually happened to the drawer.
 *   Transactions — counts real sales only: not void rows, and not sales that
 *                  a void row reverses. Voiding a sale un-sells it; it should
 *                  not still inflate the count or flatter the average basket.
 */

export interface SalesSummary {
  net: number;
  transactions: number;
  averageBasket: number;
  byMethod: Record<PaymentMethod, number>;
  grossProfit: number;
}

export function voidedSaleIds(sales: Sale[]): Set<string> {
  const ids = new Set<string>();
  for (const sale of sales) {
    if (sale.voids_sale_id) ids.add(sale.voids_sale_id);
  }
  return ids;
}

/** Real, still-standing sales. Excludes void rows and anything they reverse. */
export function effectiveSales(sales: Sale[], voided: Set<string>): Sale[] {
  return sales.filter((sale) => sale.voids_sale_id === null && !voided.has(sale.id));
}

export function summarise(
  sales: Sale[],
  items: SaleItem[],
  costByProduct: Map<string, number>,
): SalesSummary {
  const voided = voidedSaleIds(sales);

  const net = sales.reduce((sum, sale) => sum + sale.total, 0);
  const real = effectiveSales(sales, voided);
  const transactions = real.length;

  const byMethod: Record<PaymentMethod, number> = {
    cash: 0,
    telebirr: 0,
    card: 0,
    credit: 0,
  };

  for (const sale of sales) {
    byMethod[sale.payment_method] += sale.total;
  }

  return {
    net,
    transactions,
    averageBasket: transactions === 0 ? 0 : Math.round(net / transactions),
    byMethod,
    grossProfit: grossProfit(items, costByProduct),
  };
}

/**
 * SUM((unit_price - cost_price) * qty), using the unit_price snapshotted on the
 * line — never the product's current price, which has moved since.
 *
 * cost_price is the product's CURRENT cost, because sale_items does not
 * snapshot cost. Worth knowing: if a supplier's price changes, historical
 * profit shifts with it. Snapshotting cost on the line would fix that, and is
 * a schema change rather than a reporting one.
 *
 * Void rows carry negative qty, so they subtract here without special casing.
 */
export function grossProfit(items: SaleItem[], costByProduct: Map<string, number>): number {
  return items.reduce((sum, item) => {
    const cost = costByProduct.get(item.product_id) ?? 0;
    return sum + Math.round((item.unit_price - cost) * item.qty);
  }, 0);
}

/** 24 buckets of net takings, by local hour. */
export function hourlyTotals(sales: Sale[]): number[] {
  const hours = new Array<number>(24).fill(0);

  for (const sale of sales) {
    const hour = new Date(sale.created_at).getHours();
    hours[hour] = (hours[hour] ?? 0) + sale.total;
  }

  return hours;
}

export interface DayTotal {
  date: string;
  total: number;
}

/** Net takings per local day, with empty days present as zeroes. */
export function dailyTotals(sales: Sale[], days: string[]): DayTotal[] {
  const totals = new Map<string, number>(days.map((date) => [date, 0]));

  for (const sale of sales) {
    const date = localDayKey(sale.created_at);
    if (totals.has(date)) totals.set(date, (totals.get(date) ?? 0) + sale.total);
  }

  return days.map((date) => ({ date, total: totals.get(date) ?? 0 }));
}

export interface ProductPerformance {
  product_id: string;
  name_am: string;
  revenue: number;
  units: number;
}

/**
 * Ranked by revenue or by units. Uses name_snapshot so a renamed product still
 * appears under the name it was actually sold as.
 */
export function topProducts(items: SaleItem[], by: 'revenue' | 'units'): ProductPerformance[] {
  const totals = new Map<string, ProductPerformance>();

  for (const item of items) {
    const existing = totals.get(item.product_id);

    if (existing) {
      existing.revenue += item.line_total;
      existing.units += item.qty;
    } else {
      totals.set(item.product_id, {
        product_id: item.product_id,
        name_am: item.name_snapshot,
        revenue: item.line_total,
        units: item.qty,
      });
    }
  }

  return [...totals.values()]
    .filter((row) => row.units > 0)
    .sort((a, b) => (by === 'revenue' ? b.revenue - a.revenue : b.units - a.units));
}

export interface LowStockRow {
  product: Product;
  onHand: number;
  /** How far below the line, so the worst sits at the top. */
  deficit: number;
}

export function lowStock(products: Product[], onHand: Map<string, number>): LowStockRow[] {
  return products
    .map((product) => {
      const current = onHand.get(product.id) ?? 0;
      return { product, onHand: current, deficit: product.reorder_level - current };
    })
    .filter((row) => row.deficit >= 0)
    .sort((a, b) => b.deficit - a.deficit);
}

export interface CashUp {
  openingFloat: number;
  cashSales: number;
  expected: number;
  counted: number | null;
  variance: number | null;
}

/**
 * The drawer only ever holds cash, so card and Telebirr are excluded. Variance
 * is counted minus expected: negative means the drawer is short.
 */
export function cashUp(sales: Sale[], openingFloat: number, counted: number | null): CashUp {
  const cashSales = sales
    .filter((sale) => sale.payment_method === 'cash')
    .reduce((sum, sale) => sum + sale.total, 0);

  const expected = openingFloat + cashSales;

  return {
    openingFloat,
    cashSales,
    expected,
    counted,
    variance: counted === null ? null : counted - expected,
  };
}

/** Percentage change, guarded. Null when there is no baseline to compare to. */
export function changeVsPrevious(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
