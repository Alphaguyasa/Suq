import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_META_ID, db, ensureDevice } from '@/lib/db';
import {
  persistState,
  requestAndRecord,
  requestPersistence,
  requestPersistenceOnFirstRun,
} from './persist';

function fakeNavigator(opts: { persisted: boolean; grant: boolean; throws?: boolean }) {
  const persist = vi.fn(async () => {
    if (opts.throws) throw new Error('SecurityError');
    return opts.grant;
  });
  const persisted = vi.fn(async () => opts.persisted);
  return { nav: { storage: { persist, persisted } }, persist, persisted };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  await ensureDevice();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestPersistence', () => {
  it('reports granted when the browser grants it', async () => {
    const { nav, persist } = fakeNavigator({ persisted: false, grant: true });
    expect(await requestPersistence(nav)).toBe('granted');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('reports denied when the browser refuses', async () => {
    const { nav } = fakeNavigator({ persisted: false, grant: false });
    expect(await requestPersistence(nav)).toBe('denied');
  });

  it('does not ask again when already persisted', async () => {
    const { nav, persist } = fakeNavigator({ persisted: true, grant: false });
    expect(await requestPersistence(nav)).toBe('granted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports unsupported without a StorageManager', async () => {
    expect(await requestPersistence({})).toBe('unsupported');
    expect(await requestPersistence(undefined)).toBe('unsupported');
    expect(await requestPersistence({ storage: {} })).toBe('unsupported');
  });

  it('never throws, even when the browser does', async () => {
    const { nav } = fakeNavigator({ persisted: false, grant: true, throws: true });
    expect(await requestPersistence(nav)).toBe('denied');
  });
});

describe('persistState', () => {
  it('reads the state without asking', async () => {
    const granted = fakeNavigator({ persisted: true, grant: true });
    const denied = fakeNavigator({ persisted: false, grant: true });

    expect(await persistState(granted.nav)).toBe('granted');
    expect(await persistState(denied.nav)).toBe('denied');
    expect(await persistState({})).toBe('unsupported');
    expect(denied.persist).not.toHaveBeenCalled();
  });
});

describe('first run', () => {
  it('asks once and records the outcome on the device', async () => {
    const { nav, persist } = fakeNavigator({ persisted: false, grant: false });

    expect(await requestPersistenceOnFirstRun(nav)).toBe('denied');
    const meta = await db.device_meta.get(DEVICE_META_ID);
    expect(meta?.storage_persist).toBe('denied');
    expect(meta?.storage_persist_at).toBeTruthy();

    // Later launches do not prompt again.
    expect(await requestPersistenceOnFirstRun(nav)).toBeNull();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('the Settings retry asks again and overwrites the record', async () => {
    await requestPersistenceOnFirstRun(fakeNavigator({ persisted: false, grant: false }).nav);

    expect(await requestAndRecord(fakeNavigator({ persisted: false, grant: true }).nav)).toBe(
      'granted',
    );
    expect((await db.device_meta.get(DEVICE_META_ID))?.storage_persist).toBe('granted');
  });

  it('waits for the device row rather than inventing one', async () => {
    await db.device_meta.clear();
    const { nav, persist } = fakeNavigator({ persisted: false, grant: true });

    expect(await requestPersistenceOnFirstRun(nav)).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });
});
