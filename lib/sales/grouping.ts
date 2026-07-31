import type { Sale } from '@/lib/db';

export interface SaleDay {
  /** YYYY-MM-DD in the till's local time, which is the day the shopkeeper means. */
  date: string;
  sales: Sale[];
  /** Net takings: void rows carry negative totals, so they subtract here. */
  total: number;
  /** Real sales only — a void row is a correction, not a transaction. */
  count: number;
}

export function localDayKey(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Group sales into days, newest first. Input is expected newest-first already;
 * this preserves that order within each day.
 */
export function groupByDay(sales: Sale[]): SaleDay[] {
  const days = new Map<string, SaleDay>();

  for (const sale of sales) {
    const date = localDayKey(sale.created_at);
    let day = days.get(date);

    if (!day) {
      day = { date, sales: [], total: 0, count: 0 };
      days.set(date, day);
    }

    day.sales.push(sale);
    day.total += sale.total;
    if (sale.voids_sale_id === null) day.count += 1;
  }

  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
