import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addCashier, db, removeCashier } from '@/lib/db';
import { IDLE_TIMEOUT_MS, SESSION_KEY, initialiseLock, lockNow, resetLockState, unlockAs, useLock } from './lock';

const lockState = () => renderHook(() => useLock()).result.current;

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  sessionStorage.clear();
  resetLockState();
});

describe('lock', () => {
  it('never locks a till with no cashiers', async () => {
    await initialiseLock();
    expect(lockState()).toMatchObject({ locked: false, ready: true });
  });

  it('locks a cold launch when cashiers exist', async () => {
    await addCashier('Abebe', '1234');
    await initialiseLock();
    expect(lockState()).toMatchObject({ locked: true, cashier: null });
  });

  it('stays unlocked across a full page load in the same tab', async () => {
    const cashier = await addCashier('Abebe', '1234');
    await initialiseLock();
    await unlockAs(cashier);

    // A full load: module state starts over, sessionStorage survives.
    resetLockState();
    await initialiseLock();
    expect(lockState()).toMatchObject({ locked: false, cashier: { id: cashier.id } });
  });

  it('locks again once the remembered unlock has been idle too long', async () => {
    const cashier = await addCashier('Abebe', '1234');
    await unlockAs(cashier);
    const stale = { cashierId: cashier.id, at: Date.now() - IDLE_TIMEOUT_MS - 1 };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stale));

    resetLockState();
    await initialiseLock();
    expect(lockState().locked).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('locks again if the remembered cashier was removed', async () => {
    const abebe = await addCashier('Abebe', '1234');
    await addCashier('Almaz', '5678');
    await unlockAs(abebe);
    await removeCashier(abebe.id);

    resetLockState();
    await initialiseLock();
    expect(lockState().locked).toBe(true);
  });

  it('"lock now" forgets the unlock, so a reload asks for the PIN', async () => {
    const cashier = await addCashier('Abebe', '1234');
    await initialiseLock();
    await unlockAs(cashier);
    lockNow();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    resetLockState();
    await initialiseLock();
    expect(lockState().locked).toBe(true);
  });

  it('ignores a garbled session entry', async () => {
    await addCashier('Abebe', '1234');
    sessionStorage.setItem(SESSION_KEY, '{not json');
    await initialiseLock();
    expect(lockState().locked).toBe(true);
  });
});
