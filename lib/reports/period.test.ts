import { describe, expect, it } from 'vitest';
import { daysIn, periodFor, previousPeriod, withinPeriod } from './period';

/*
 * Periods are in the till's local time, so every expectation is built with the
 * local Date constructor too: the tests hold in whatever TZ they run in.
 */
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

// Wednesday 28 October 2026, mid-afternoon.
const NOW = new Date(2026, 9, 28, 15, 30);

describe('periodFor', () => {
  it('today runs from local midnight to the next midnight', () => {
    expect(periodFor('today', NOW)).toEqual({ from: local(2026, 10, 28), to: local(2026, 10, 29) });
  });

  it('just after midnight is already the new day', () => {
    const justAfter = new Date(2026, 9, 29, 0, 0, 0, 1);
    expect(periodFor('today', justAfter).from).toBe(local(2026, 10, 29));
  });

  it('the week starts on Monday', () => {
    expect(periodFor('week', NOW)).toEqual({ from: local(2026, 10, 26), to: local(2026, 11, 2) });
  });

  it('a Sunday belongs to the week that started six days before', () => {
    const sunday = new Date(2026, 10, 1, 20, 0);
    expect(periodFor('week', sunday).from).toBe(local(2026, 10, 26));
  });

  it('a Monday starts its own week', () => {
    const monday = new Date(2026, 10, 2, 8, 0);
    expect(periodFor('week', monday).from).toBe(local(2026, 11, 2));
  });

  it('the month runs from the 1st to the 1st of the next month', () => {
    expect(periodFor('month', NOW)).toEqual({ from: local(2026, 10, 1), to: local(2026, 11, 1) });
  });

  it('December rolls over into January', () => {
    const december = new Date(2026, 11, 31, 23, 0);
    expect(periodFor('month', december)).toEqual({ from: local(2026, 12, 1), to: local(2027, 1, 1) });
  });
});

describe('previousPeriod', () => {
  it('yesterday', () => {
    expect(previousPeriod('today', NOW)).toEqual({ from: local(2026, 10, 27), to: local(2026, 10, 28) });
  });

  it('last week ends where this week starts', () => {
    expect(previousPeriod('week', NOW)).toEqual({ from: local(2026, 10, 19), to: local(2026, 10, 26) });
  });

  it('last month, across a year boundary', () => {
    const january = new Date(2027, 0, 15);
    expect(previousPeriod('month', january)).toEqual({ from: local(2026, 12, 1), to: local(2027, 1, 1) });
  });

  it('on the 31st, last month is still the whole previous month (no setMonth overflow)', () => {
    const march31 = new Date(2027, 2, 31, 12);
    expect(previousPeriod('month', march31)).toEqual({ from: local(2027, 2, 1), to: local(2027, 3, 1) });
  });

  it('each period meets the one before it with no gap or overlap', () => {
    for (const key of ['today', 'week', 'month'] as const) {
      expect(previousPeriod(key, NOW).to).toBe(periodFor(key, NOW).from);
    }
  });
});

describe('withinPeriod', () => {
  const today = periodFor('today', NOW);

  it('includes the start and excludes the end', () => {
    expect(withinPeriod(today.from, today)).toBe(true);
    expect(withinPeriod(today.to, today)).toBe(false);
  });

  it('a sale one millisecond before midnight is still today', () => {
    const lastMs = new Date(new Date(today.to).getTime() - 1).toISOString();
    expect(withinPeriod(lastMs, today)).toBe(true);
  });
});

describe('daysIn', () => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  it('today is one day', () => {
    expect(daysIn(periodFor('today', NOW))).toEqual(['2026-10-28']);
  });

  it('a week is seven days from Monday, across a month boundary', () => {
    expect(daysIn(periodFor('week', NOW))).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('a month lists every day of it', () => {
    const february = daysIn(periodFor('month', new Date(2028, 1, 10)));
    expect(february).toHaveLength(29); // 2028 is a leap year
    expect(february[0]).toBe('2028-02-01');
    expect(february.at(-1)).toBe('2028-02-29');
  });

  it('labels are local dates', () => {
    const period = periodFor('today', NOW);
    expect(daysIn(period)).toEqual([day(new Date(period.from))]);
  });
});
