/**
 * Why a local write failed, in the terms a cashier can act on.
 *
 * IndexedDB failures reach us in several shapes: a DOMException straight from
 * the browser, a Dexie error wrapping it, or a transaction AbortError whose
 * `inner` is the real cause (a quota overrun aborts the whole transaction, so
 * the first error Dexie sees is often the abort). We walk the `inner`/`cause`
 * chain and look at names, never at messages, which differ per browser and
 * per language.
 */
export type WriteFailure = 'quota' | 'unavailable' | 'unknown';

const QUOTA_NAMES = new Set([
  'QuotaExceededError',
  // Old Firefox.
  'NS_ERROR_DOM_QUOTA_REACHED',
]);

/* The database itself is gone or cannot be opened: blocked storage, private
   mode on some browsers, a profile being cleared under us, a failed upgrade. */
const UNAVAILABLE_NAMES = new Set([
  'DatabaseClosedError',
  'OpenFailedError',
  'MissingAPIError',
  'InvalidStateError',
  'VersionError',
  'UnknownError',
]);

const MAX_DEPTH = 5;

function nameOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

function causeOf(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  const { inner, cause } = value as { inner?: unknown; cause?: unknown };
  return inner ?? cause;
}

export function classifyWriteError(error: unknown): WriteFailure {
  let unavailable = false;
  let current: unknown = error;

  for (let depth = 0; current !== undefined && depth < MAX_DEPTH; depth += 1) {
    const name = nameOf(current);
    if (name && QUOTA_NAMES.has(name)) return 'quota';
    // Legacy DOMException code for quota (22), still set by some WebViews.
    if ((current as { code?: unknown } | null)?.code === 22) return 'quota';
    if (name && UNAVAILABLE_NAMES.has(name)) unavailable = true;
    current = causeOf(current);
  }

  return unavailable ? 'unavailable' : 'unknown';
}
