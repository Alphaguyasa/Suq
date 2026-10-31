/**
 * What a reset leaves behind on purpose: which till this was.
 *
 * resetDevice() wipes IndexedDB, device_meta included, and two things used to
 * go with it that only this device can know:
 *
 * - Its device_id. A void this till wrote that turns out to be a duplicate is
 *   reversed by the device that wrote it (reconcileDuplicateVoids), and only
 *   that device. Once the till comes back with a fresh id nobody owns the
 *   duplicate, so the sale stays voided twice: takings short, stock over.
 * - Its receipt counter. nextReceiptNo() continues past receipts it can see,
 *   but until the first pull it sees none, so a till set up again with the
 *   same code and selling straight away printed A1-000001 a second time.
 *
 * Neither is shop data, so keeping them does not undo "wipe this shop". A
 * plain localStorage key outlives the IndexedDB wipe; if storage is blocked
 * or cleared too, the till simply starts as a new one, as it always did.
 */
export const PREVIOUS_TILL_KEY = 'suq.previousTill';

export interface PreviousTill {
  device_id: string;
  device_prefix: string;
  /** Highest receipt counter this till had used or seen under that prefix. */
  receipt_counter: number;
}

export function readPreviousTill(): PreviousTill | null {
  try {
    const raw = localStorage.getItem(PREVIOUS_TILL_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPreviousTill(parsed) ? parsed : null;
  } catch {
    // Blocked storage or garbage: behave like a till that was never reset.
    return null;
  }
}

export function rememberPreviousTill(till: PreviousTill): void {
  try {
    localStorage.setItem(PREVIOUS_TILL_KEY, JSON.stringify(till));
  } catch {
    // Blocked storage: the reset still goes ahead, the gaps just stay open.
  }
}

function isPreviousTill(value: unknown): value is PreviousTill {
  if (typeof value !== 'object' || value === null) return false;
  const till = value as Record<string, unknown>;
  return (
    typeof till.device_id === 'string' &&
    till.device_id.length > 0 &&
    typeof till.device_prefix === 'string' &&
    Number.isInteger(till.receipt_counter) &&
    (till.receipt_counter as number) >= 0
  );
}

/** Counter floor for a prefix: the previous till's, if it used the same code. */
export function previousCounterFor(prefix: string): number {
  const previous = readPreviousTill();
  return previous && previous.device_prefix === prefix ? previous.receipt_counter : 0;
}
