/**
 * Money is integer cents everywhere in this codebase. 12.35 ETB is 1235.
 * These two functions are the only boundary where that representation is
 * allowed to change shape — parse on the way in, format on the way out.
 * No float ever touches a money value in between. BUILD_GUIDE section 3.3.
 *
 * Note these return bare numerals ("1,234.50"). The currency word is a
 * user-facing string and therefore lives in lib/i18n, not here.
 */

/** Format integer cents for display: 1234567 -> "12,345.67" */
export function formatETB(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatETB expects integer cents, received ${cents}`);
  }

  const negative = cents < 0;
  const abs = Math.abs(cents);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;

  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${negative ? '-' : ''}${grouped}.${minor.toString().padStart(2, '0')}`;
}

/**
 * Fixed format rather than Intl, deliberately: toLocaleString under an Amharic
 * locale can render Ge'ez numerals or Ethiopian calendar dates, which is not
 * what a shopkeeper reading a movement log expects to see.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * parseETB for a field the cashier is still typing into: a half-finished "1."
 * yields 0 rather than throwing. Only for live input — anything being stored
 * must go through parseETB and deal with the error.
 */
export function parseETBOrZero(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;

  try {
    return parseETB(trimmed);
  } catch {
    return 0;
  }
}

/** Quantities are not money: show them plainly, trimming a pointless ".00". */
export function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Parse a price the cashier typed into integer cents: "12.35" -> 1235.
 * Accepts thousands separators and up to two decimal places. Throws on
 * anything else rather than silently rounding — a wrong price is worse
 * than a rejected keystroke. Negative amounts are rejected too: no price,
 * cost, discount or cash received is ever below zero, and letting "-5"
 * through only moved the failure to the repository, where the form could
 * no longer say which field was wrong.
 */
export function parseETB(input: string): number {
  const cleaned = input.trim().replace(/[,\s]/g, '');

  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(cleaned)) {
    throw new TypeError(`parseETB cannot parse "${input}" as a price`);
  }

  const [major = '0', minor = ''] = cleaned.split('.');

  return Number(major || '0') * 100 + Number(minor.padEnd(2, '0') || '0');
}
