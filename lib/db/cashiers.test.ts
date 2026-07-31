import { beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateCashierError,
  addCashier,
  anyCashiers,
  isValidPin,
  listCashiers,
  removeCashier,
  verifyPin,
} from './cashiers';
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
    const cashier = await addCashier('ሰላም', '1111');
    await removeCashier(cashier.id);

    expect(await listCashiers()).toHaveLength(0);
    expect(await anyCashiers()).toBe(false);
  });
});
