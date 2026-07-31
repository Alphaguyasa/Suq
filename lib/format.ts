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
 * Parse a price the cashier typed into integer cents: "12.35" -> 1235.
 * Accepts thousands separators and up to two decimal places. Throws on
 * anything else rather than silently rounding — a wrong price is worse
 * than a rejected keystroke.
 */
export function parseETB(input: string): number {
  const cleaned = input.trim().replace(/[,\s]/g, '');

  if (!/^-?\d+(\.\d{1,2})?$|^-?\.\d{1,2}$/.test(cleaned)) {
    throw new TypeError(`parseETB cannot parse "${input}" as a price`);
  }

  const negative = cleaned.startsWith('-');
  const [major = '0', minor = ''] = cleaned.replace('-', '').split('.');

  const cents = Number(major || '0') * 100 + Number(minor.padEnd(2, '0') || '0');

  return negative ? -cents : cents;
}
