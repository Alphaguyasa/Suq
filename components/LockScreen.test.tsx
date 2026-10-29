import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addCashier, db } from '@/lib/db';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import { initialiseLock, resetLockState, useLock } from '@/lib/lock/lock';
import { LockScreen } from './LockScreen';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  sessionStorage.clear();
  resetLockState();
});

/** Renders the lock, picks the cashier, and hands back a live view of the lock state. */
async function pickAbebe() {
  await addCashier('አበበ', '1234');
  await initialiseLock();
  const lock = renderHook(() => useLock()).result;
  render(
    <I18nProvider initialLang="am">
      <LockScreen />
    </I18nProvider>,
  );

  const name = await screen.findByRole('button', { name: 'አበበ' });
  // Booleans, not toBe(element): a failing DOM-node diff prints the whole tree.
  expect(document.activeElement === name).toBe(true);
  fireEvent.click(name);
  expect(document.activeElement === screen.getByRole('group', { name: am.lock.pin })).toBe(true);
  return lock;
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));

/* All four in one act(), so React does not re-render between keys: the way a
   fast typist outruns a slow phone. */
const typeFast = (keys: string) => act(async () => [...keys].forEach((key) => press(key)));

describe('LockScreen from a keyboard', () => {
  it('unlocks on a PIN typed faster than React re-renders', async () => {
    const lock = await pickAbebe();
    await typeFast('1234');
    await waitFor(() => expect(lock.current.locked).toBe(false));
    expect(lock.current.cashier?.name).toBe('አበበ');
  });

  it('Backspace deletes the last digit', async () => {
    const lock = await pickAbebe();
    await typeFast('129');
    await act(async () => press('Backspace'));
    await typeFast('34');
    await waitFor(() => expect(lock.current.locked).toBe(false));
  });

  it('ignores a digit typed with a modifier, so browser shortcuts still work', async () => {
    const lock = await pickAbebe();
    await act(async () => press('1', { ctrlKey: true }));
    await typeFast('1234');
    await waitFor(() => expect(lock.current.locked).toBe(false));
  });

  it('Escape goes back to the names', async () => {
    await pickAbebe();
    await act(async () => press('Escape'));
    expect(screen.queryByRole('group', { name: am.lock.pin })).toBeNull();
    expect(screen.getByRole('button', { name: 'አበበ' })).toBeTruthy();
  });
});
