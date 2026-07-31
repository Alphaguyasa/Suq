import type { DemoData } from './generate.ts';

export interface DemoStats {
  products: number;
  sales: number;
  voidRows: number;
  days: number;
  netTakings: number;
  /** Net takings per hour of the day, index 0–23. */
  byHour: number[];
  /** Net takings per weekday, index 0 = Sunday. */
  byWeekday: number[];
  byCashier: Record<string, number>;
  lowStock: number;
  onHand: Map<string, number>;
}

/**
 * Derived the same way the reports do, so "believable shape" is something the
 * seed script can actually assert rather than something anybody eyeballs.
 */
export function demoStats(data: DemoData): DemoStats {
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  const byCashier: Record<string, number> = {};
  const days = new Set<string>();

  for (const sale of data.sales) {
    const at = new Date(sale.created_at);
    byHour[at.getHours()] = (byHour[at.getHours()] ?? 0) + sale.total;
    byWeekday[at.getDay()] = (byWeekday[at.getDay()] ?? 0) + sale.total;
    days.add(sale.created_at.slice(0, 10));

    if (sale.voids_sale_id === null) {
      byCashier[sale.cashier_name] = (byCashier[sale.cashier_name] ?? 0) + sale.total;
    }
  }

  const onHand = new Map<string, number>();
  for (const movement of data.movements) {
    onHand.set(movement.product_id, (onHand.get(movement.product_id) ?? 0) + movement.qty_delta);
  }

  const lowStock = data.products.filter(
    (product) => (onHand.get(product.id) ?? 0) <= product.reorder_level,
  ).length;

  return {
    products: data.products.length,
    sales: data.sales.filter((sale) => sale.voids_sale_id === null).length,
    voidRows: data.sales.filter((sale) => sale.voids_sale_id !== null).length,
    days: days.size,
    netTakings: data.sales.reduce((sum, sale) => sum + sale.total, 0),
    byHour,
    byWeekday,
    byCashier,
    lowStock,
    onHand,
  };
}

export function sumRange(values: number[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i <= to; i += 1) total += values[i] ?? 0;
  return total;
}
