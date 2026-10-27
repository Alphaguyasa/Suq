/**
 * One text format for every timestamp IndexedDB holds: `toISOString()`,
 * e.g. `2026-10-26T08:00:00.120Z`.
 *
 * The till compares timestamps as strings: every created_at range (report
 * periods, history paging), the created_at index, and the (created_at, id)
 * order that picks THE void of a twice-voided sale on every till. Rows
 * written here use one fixed-width UTC format; rows pulled from PostgREST
 * carry Postgres's timestamptz text instead, with an offset and trailing
 * zeros trimmed (`2026-10-26T08:00:00.1+00:00`).
 *
 * Mostly that still sorts by time, but not at an equal instant: `…00.1+00:00`
 * sorts before `…00.100Z`. So a sale pulled at exactly a period boundary
 * falls into the previous period, and two tills that each hold their own
 * row as `Z` and the other's as `+00:00` order a same-millisecond pair
 * differently — each picks the other's void as the earliest. Values the
 * server stamped itself (microseconds, `…00.123456+00:00`) even sort before
 * the same millisecond's `…00.123Z`.
 */
export function canonicalIso(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const ms = Date.parse(value);
  // Not a timestamp: leave it alone rather than invent one.
  if (Number.isNaN(ms)) return value;
  return new Date(ms).toISOString();
}

/** Timestamp columns of the synced tables. */
export const TIMESTAMP_COLUMNS = {
  products: ['updated_at', 'deleted_at'],
  sales: ['created_at', 'synced_at'],
  sale_items: ['created_at'],
  stock_movements: ['created_at'],
} as const;

export type TimestampedTable = keyof typeof TIMESTAMP_COLUMNS;

/** A copy of `row` with its timestamp columns in canonical form. */
export function withCanonicalTimestamps<T extends Record<string, unknown>>(
  table: TimestampedTable,
  row: T,
): T {
  const copy: Record<string, unknown> = { ...row };
  for (const column of TIMESTAMP_COLUMNS[table]) {
    if (column in copy) copy[column] = canonicalIso(copy[column]);
  }
  return copy as T;
}

/** True when a row already uses the canonical format, so it need not be rewritten. */
export function hasCanonicalTimestamps(table: TimestampedTable, row: Record<string, unknown>): boolean {
  return TIMESTAMP_COLUMNS[table].every((column) => canonicalIso(row[column]) === row[column]);
}
