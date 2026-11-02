import { newId, nowIso } from './id';
import { db } from './schema';
import type { Cashier } from './schema';

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function listCashiers(): Promise<Cashier[]> {
  return db.cashiers.orderBy('name').toArray();
}

export class DuplicateCashierError extends Error {
  constructor(name: string) {
    super(`A cashier called ${name} already exists.`);
    this.name = 'DuplicateCashierError';
  }
}

export interface AddCashierOptions {
  /** Setup's first cashier is the shop owner. */
  owner?: boolean;
}

export async function addCashier(
  name: string,
  pin: string,
  options: AddCashierOptions = {},
): Promise<Cashier> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A cashier needs a name.');
  if (!isValidPin(pin)) throw new Error('A PIN must be exactly four digits.');

  /*
   * Names are unique. Two identical entries on the lock screen are
   * indistinguishable — you cannot tell which one you are tapping — so a
   * duplicate is never useful. It also stops the demo loader from stacking up
   * a second መሠረት every time it runs.
   */
  const existing = await db.cashiers.where('name').equals(trimmed).first();
  if (existing) throw new DuplicateCashierError(trimmed);

  const cashier: Cashier = {
    id: newId(),
    name: trimmed,
    pin,
    ...(options.owner ? { role: 'owner' as const } : {}),
    created_at: nowIso(),
  };

  await db.cashiers.put(cashier);
  return cashier;
}

export class LastOwnerError extends Error {
  constructor() {
    super('The last owner cannot be removed.');
    this.name = 'LastOwnerError';
  }
}

/**
 * Removing the only owner would leave nobody able to approve a void, and on a
 * till with no marked owner the next-oldest cashier would quietly become it.
 * Read and delete in one transaction so two taps cannot both pass the check.
 */
export async function removeCashier(id: string): Promise<void> {
  await db.transaction('rw', db.cashiers, async () => {
    const owners = ownerIds(await db.cashiers.toArray());
    if (owners.has(id) && owners.size === 1) throw new LastOwnerError();
    await db.cashiers.delete(id);
  });
}

/**
 * Who counts as an owner (ROADMAP item 32).
 *
 * Cashiers marked role 'owner' are the owners. A till set up before owners
 * existed has no marked cashier at all; there the oldest cashier is the
 * owner, because setup creates the shop owner's own login first. Reading it
 * this way instead of rewriting rows in a Dexie upgrade keeps old tills'
 * cashiers byte-for-byte as they were. Like the PIN itself this decides who
 * may do what at the counter; it is not a security boundary (see Cashier).
 */
export function ownerIds(cashiers: readonly Cashier[]): Set<string> {
  const marked = cashiers.filter((cashier) => cashier.role === 'owner');
  if (marked.length > 0) return new Set(marked.map((cashier) => cashier.id));

  const oldest = [...cashiers].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )[0];
  return new Set(oldest ? [oldest.id] : []);
}

export async function isOwner(cashierId: string): Promise<boolean> {
  return ownerIds(await db.cashiers.toArray()).has(cashierId);
}

/**
 * Whether an action restricted to owners may go ahead without asking for the
 * owner's PIN: yes when the owner is the one unlocked, and yes on a till with
 * no cashiers at all, which is never locked (lib/lock/lock.ts).
 */
export async function ownerApprovalNeeded(unlockedId: string | null): Promise<boolean> {
  const cashiers = await db.cashiers.toArray();
  if (cashiers.length === 0) return false;
  return !(unlockedId !== null && ownerIds(cashiers).has(unlockedId));
}

/** The owner whose PIN this is, or null. Never throws on a wrong PIN. */
export async function verifyOwnerPin(pin: string): Promise<Cashier | null> {
  if (!isValidPin(pin)) return null;
  const cashiers = await db.cashiers.toArray();
  const owners = ownerIds(cashiers);
  return cashiers.find((cashier) => owners.has(cashier.id) && cashier.pin === pin) ?? null;
}

/** Returns the cashier when the PIN matches, or null. Never throws on a wrong PIN. */
export async function verifyPin(cashierId: string, pin: string): Promise<Cashier | null> {
  const cashier = await db.cashiers.get(cashierId);
  return cashier && cashier.pin === pin ? cashier : null;
}

export async function anyCashiers(): Promise<boolean> {
  return (await db.cashiers.count()) > 0;
}

export class NotAnOwnerError extends Error {
  constructor() {
    super('Only an owner’s PIN can be recovered this way.');
    this.name = 'NotAnOwnerError';
  }
}

/**
 * Give an owner a new PIN without the old one (ROADMAP item 43).
 *
 * Only for the recovery path in Settings, after the shop owner's own Supabase
 * account has proved itself online (lib/supabase/owner-recovery.ts). Read and
 * write in one transaction, so a cashier removed or demoted meanwhile is
 * refused instead of quietly given an owner's say.
 */
export async function setOwnerPin(ownerId: string, pin: string): Promise<Cashier> {
  if (!isValidPin(pin)) throw new Error('A PIN must be exactly four digits.');
  return db.transaction('rw', db.cashiers, async () => {
    const cashiers = await db.cashiers.toArray();
    const owner = cashiers.find((cashier) => cashier.id === ownerId);
    if (!owner || !ownerIds(cashiers).has(ownerId)) throw new NotAnOwnerError();
    await db.cashiers.update(ownerId, { pin });
    return { ...owner, pin };
  });
}
