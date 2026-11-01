import { beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateCashierError,
  LastOwnerError,
  addCashier,
  anyCashiers,
  isOwner,
  isValidPin,
  listCashiers,
  ownerApprovalNeeded,
  ownerIds,
  removeCashier,
  verifyOwnerPin,
  verifyPin,
} from './cashiers';
import { db } from './schema';
import type { Cashier } from './schema';
import { freshDatabase } from './test-helpers';

beforeEach(async () => {
  await freshDatabase();
});

describe('isValidPin', () => {
  it('accepts exactly four digits', () => {
    expect(isValidPin('0000')).toBe(true);
    expect(isValidPin('9137')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['', '123', '12345', 'abcd', '12a4', '12 4', '1.24']) {
      expect(isValidPin(bad), bad).toBe(false);
    }
  });
});

describe('cashiers', () => {
  it('adds and lists by name', async () => {
    await addCashier('ሰላም', '1234');
    await addCashier('መሠረት', '4321');

    const all = await listCashiers();
    expect(all).toHaveLength(2);
    expect(await anyCashiers()).toBe(true);
  });

  it('refuses a nameless cashier or a bad PIN', async () => {
    await expect(addCashier('   ', '1234')).rejects.toThrow();
    await expect(addCashier('ሰላም', '12')).rejects.toThrow();
  });

  it('refuses a duplicate name, so the lock screen never shows two of one person', async () => {
    await addCashier('መሠረት', '1234');

    await expect(addCashier('መሠረት', '9999')).rejects.toThrow(DuplicateCashierError);
    await expect(addCashier('  መሠረት  ', '9999')).rejects.toThrow(DuplicateCashierError);

    expect(await listCashiers()).toHaveLength(1);
    // And the original PIN is untouched.
    const [only] = await listCashiers();
    expect((await verifyPin(only?.id ?? '', '1234'))?.name).toBe('መሠረት');
  });

  it('verifies a PIN and returns null rather than throwing on a wrong one', async () => {
    const cashier = await addCashier('መሠረት', '4321');

    expect((await verifyPin(cashier.id, '4321'))?.name).toBe('መሠረት');
    expect(await verifyPin(cashier.id, '0000')).toBeNull();
    expect(await verifyPin('no-such-cashier', '4321')).toBeNull();
  });

  it('reports no cashiers on a fresh device, so a new till is not locked out', async () => {
    expect(await anyCashiers()).toBe(false);
  });

  it('removes a cashier', async () => {
    await addCashier('አልፋ', '9999', { owner: true });
    const cashier = await addCashier('ሰላም', '1111');
    await removeCashier(cashier.id);

    expect((await listCashiers()).map((c) => c.name)).toEqual(['አልፋ']);
  });
});

/** A cashier row as an older build saved it: no role field at all. */
async function legacyCashier(id: string, name: string, pin: string, created_at: string) {
  const row: Cashier = { id, name, pin, created_at };
  await db.cashiers.put(row);
  return row;
}

describe('owners (ROADMAP item 32)', () => {
  it('marks the owner only when asked', async () => {
    const owner = await addCashier('አልፋ', '9999', { owner: true });
    const cashier = await addCashier('ሰላም', '1111');

    expect(owner.role).toBe('owner');
    expect('role' in cashier).toBe(false);
    expect(ownerIds(await listCashiers())).toEqual(new Set([owner.id]));
  });

  it('reads the oldest cashier as the owner on a till set up before owners existed', async () => {
    await legacyCashier('c-2', 'ሰላም', '1111', '2026-10-02T08:00:00.000Z');
    await legacyCashier('c-1', 'አልፋ', '9999', '2026-10-01T08:00:00.000Z');
    await legacyCashier('c-3', 'መሠረት', '2222', '2026-10-03T08:00:00.000Z');

    expect(ownerIds(await listCashiers())).toEqual(new Set(['c-1']));
    expect(await isOwner('c-1')).toBe(true);
    expect(await isOwner('c-2')).toBe(false);
    // And nothing was rewritten to get there.
    expect(await db.cashiers.get('c-1')).toEqual({
      id: 'c-1',
      name: 'አልፋ',
      pin: '9999',
      created_at: '2026-10-01T08:00:00.000Z',
    });
  });

  it('has no owner when there are no cashiers', () => {
    expect(ownerIds([])).toEqual(new Set());
  });

  it('accepts only an owner PIN as approval', async () => {
    const owner = await addCashier('አልፋ', '9999', { owner: true });
    await addCashier('ሰላም', '1111');

    expect((await verifyOwnerPin('9999'))?.id).toBe(owner.id);
    expect(await verifyOwnerPin('1111')).toBeNull();
    expect(await verifyOwnerPin('0000')).toBeNull();
    expect(await verifyOwnerPin('')).toBeNull();
  });

  it('asks for approval unless the owner is unlocked or the till has no cashiers', async () => {
    expect(await ownerApprovalNeeded(null)).toBe(false);

    const owner = await addCashier('አልፋ', '9999', { owner: true });
    const cashier = await addCashier('ሰላም', '1111');

    expect(await ownerApprovalNeeded(owner.id)).toBe(false);
    expect(await ownerApprovalNeeded(cashier.id)).toBe(true);
    expect(await ownerApprovalNeeded(null)).toBe(true);
  });

  it('never removes the last owner, marked or read from age', async () => {
    const owner = await addCashier('አልፋ', '9999', { owner: true });
    await expect(removeCashier(owner.id)).rejects.toThrow(LastOwnerError);

    await freshDatabase();
    await legacyCashier('c-1', 'አልፋ', '9999', '2026-10-01T08:00:00.000Z');
    await legacyCashier('c-2', 'ሰላም', '1111', '2026-10-02T08:00:00.000Z');
    // Otherwise ሰላም would silently become the owner.
    await expect(removeCashier('c-1')).rejects.toThrow(LastOwnerError);
    expect(await listCashiers()).toHaveLength(2);
  });

  it('removes an owner while another owner remains', async () => {
    const first = await addCashier('አልፋ', '9999', { owner: true });
    const second = await addCashier('ቤዛ', '8888', { owner: true });

    await removeCashier(first.id);
    expect(ownerIds(await listCashiers())).toEqual(new Set([second.id]));
  });
});
