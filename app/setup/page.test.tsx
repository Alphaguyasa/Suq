import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDevice } from '@/lib/db';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import { SESSION_KEY, initialiseLock, resetLockState, useLock } from '@/lib/lock/lock';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { default: SetupPage } = await import('./page');

const lockState = () => renderHook(() => useLock()).result.current;

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  sessionStorage.clear();
  resetLockState();
});

async function walkToImportStep() {
  render(
    <I18nProvider initialLang="am">
      <SetupPage />
    </I18nProvider>,
  );
  const next = () => fireEvent.click(screen.getByRole('button', { name: am.setup.next }));

  fireEvent.change(document.querySelector('#s-name-am')!, { target: { value: 'የሙከራ ሱቅ' } });
  next();
  await waitFor(() => expect(document.querySelector('#s-prefix')).not.toBeNull());

  fireEvent.change(document.querySelector('#s-prefix')!, { target: { value: 'A1' } });
  next();
  await waitFor(() => expect(document.querySelector('#s-cashier')).not.toBeNull());

  fireEvent.change(document.querySelector('#s-cashier')!, { target: { value: 'አበበ' } });
  fireEvent.change(document.querySelector('#s-pin')!, { target: { value: '1234' } });
  next();
  await waitFor(() => expect(screen.getByText(am.setup.importStep)).toBeTruthy());
}

describe('setup', () => {
  it('unlocks the tab as the first cashier, so a full page load does not ask for the PIN', async () => {
    // A fresh install: no cashiers yet, so the lock starts open with nobody in it.
    await initialiseLock();
    await walkToImportStep();

    const [cashier] = await db.cashiers.toArray();
    expect(lockState()).toMatchObject({ locked: false, cashier: { id: cashier!.id } });
    expect(sessionStorage.getItem(SESSION_KEY)).toContain(cashier!.id);
    // Sales rung up from here on record who made them.
    expect((await getDevice()).cashier_name).toBe('አበበ');

    // A full page load in the same tab.
    resetLockState();
    await initialiseLock();
    expect(lockState()).toMatchObject({ locked: false, cashier: { id: cashier!.id } });
  });
});
