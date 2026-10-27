import { describe, expect, it } from 'vitest';
import { canonicalIso, hasCanonicalTimestamps, withCanonicalTimestamps } from './timestamps';

describe('canonicalIso', () => {
  it.each([
    ['2026-10-26T08:00:00.12+00:00', '2026-10-26T08:00:00.120Z'],
    ['2026-10-26T08:00:00+00:00', '2026-10-26T08:00:00.000Z'],
    ['2026-10-26T08:00:00.123456+00:00', '2026-10-26T08:00:00.123Z'],
    ['2026-10-26T11:00:00.5+03:00', '2026-10-26T08:00:00.500Z'],
    ['2026-10-26T08:00:00.120Z', '2026-10-26T08:00:00.120Z'],
  ])('%s → %s', (input, expected) => {
    expect(canonicalIso(input)).toBe(expected);
  });

  it('leaves non-timestamps alone', () => {
    expect(canonicalIso(null)).toBeNull();
    expect(canonicalIso(undefined)).toBeUndefined();
    expect(canonicalIso('not a date')).toBe('not a date');
    expect(canonicalIso(42)).toBe(42);
  });
});

describe('withCanonicalTimestamps', () => {
  it('rewrites only the timestamp columns and keeps nulls', () => {
    const row = {
      id: 'p-1',
      name: '2026-10-26',
      updated_at: '2026-10-26T08:00:00.1+00:00',
      deleted_at: null,
    };
    const fixed = withCanonicalTimestamps('products', row);

    expect(fixed).toEqual({ ...row, updated_at: '2026-10-26T08:00:00.100Z' });
    expect(row.updated_at, 'the input is not mutated').toBe('2026-10-26T08:00:00.1+00:00');
    expect(hasCanonicalTimestamps('products', row)).toBe(false);
    expect(hasCanonicalTimestamps('products', fixed)).toBe(true);
  });

  it('does not add columns the row lacks', () => {
    expect(withCanonicalTimestamps('sales', { id: 's-1' })).toEqual({ id: 's-1' });
  });
});
