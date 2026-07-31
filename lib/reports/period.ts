export type PeriodKey = 'today' | 'week' | 'month';

export interface Period {
  /** Inclusive ISO instant. */
  from: string;
  /** Exclusive ISO instant. */
  to: string;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Monday. A shop's trading week is not the ISO calendar's problem, but Monday is the common answer. */
function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const weekday = (start.getDay() + 6) % 7; // Monday = 0
  return addDays(start, -weekday);
}

function startOfMonth(date: Date): Date {
  const start = startOfDay(date);
  start.setDate(1);
  return start;
}

/**
 * Calendar periods in the till's local time, because "today" means the day the
 * shopkeeper is standing in, not a UTC boundary that moves the cash-up.
 */
export function periodFor(key: PeriodKey, now = new Date()): Period {
  switch (key) {
    case 'today': {
      const from = startOfDay(now);
      return { from: from.toISOString(), to: addDays(from, 1).toISOString() };
    }
    case 'week': {
      const from = startOfWeek(now);
      return { from: from.toISOString(), to: addDays(from, 7).toISOString() };
    }
    case 'month': {
      const from = startOfMonth(now);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }
}

/** The same period, one step back, for comparison. */
export function previousPeriod(key: PeriodKey, now = new Date()): Period {
  switch (key) {
    case 'today': {
      const from = addDays(startOfDay(now), -1);
      return { from: from.toISOString(), to: addDays(from, 1).toISOString() };
    }
    case 'week': {
      const from = addDays(startOfWeek(now), -7);
      return { from: from.toISOString(), to: addDays(from, 7).toISOString() };
    }
    case 'month': {
      const from = startOfMonth(now);
      from.setMonth(from.getMonth() - 1);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }
}

export function withinPeriod(iso: string, period: Period): boolean {
  return iso >= period.from && iso < period.to;
}

/** Local YYYY-MM-DD for each day the period covers. */
export function daysIn(period: Period): string[] {
  const days: string[] = [];
  const cursor = startOfDay(new Date(period.from));
  const end = new Date(period.to);

  while (cursor < end) {
    const pad = (value: number) => String(value).padStart(2, '0');
    days.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
