import { newId, nowIso } from './id';
import { db } from './schema';
import type { Cashier } from './schema';

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function listCashiers(): Promise<Cashier[]> {
  return db.cashiers.orderBy('name').toArray();
}

export async function addCashier(name: string, pin: string): Promise<Cashier> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A cashier needs a name.');
  if (!isValidPin(pin)) throw new Error('A PIN must be exactly four digits.');

  const cashier: Cashier = {
    id: newId(),
    name: trimmed,
    pin,
    created_at: nowIso(),
  };

  await db.cashiers.put(cashier);
  return cashier;
}

export async function removeCashier(id: string): Promise<void> {
  await db.cashiers.delete(id);
}

/** Returns the cashier when the PIN matches, or null. Never throws on a wrong PIN. */
export async function verifyPin(cashierId: string, pin: string): Promise<Cashier | null> {
  const cashier = await db.cashiers.get(cashierId);
  return cashier && cashier.pin === pin ? cashier : null;
}

export async function anyCashiers(): Promise<boolean> {
  return (await db.cashiers.count()) > 0;
}
