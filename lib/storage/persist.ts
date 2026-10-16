import { DEVICE_META_ID, db as defaultDb, nowIso } from '@/lib/db';
import type { SuqDatabase } from '@/lib/db';

/**
 * Persistent storage (navigator.storage.persist()).
 *
 * Without it the browser treats IndexedDB as "best effort" and may evict it
 * when the phone runs low on space — on a cheap Android that is a normal
 * week, and the data it would delete includes sales not yet synced. With it,
 * only the user clearing site data can remove them.
 *
 * Browsers decide on their own (Chrome grants an installed PWA or a site
 * used often; Firefox asks the user), so the answer can change over time:
 * Settings re-reads the live state and offers to ask again.
 */
export type PersistState = 'granted' | 'denied' | 'unsupported';

type StorageLike = Pick<StorageManager, 'persist' | 'persisted'>;

function storageOf(nav: { storage?: Partial<StorageLike> } | undefined): StorageLike | null {
  const storage = nav?.storage;
  if (!storage || typeof storage.persist !== 'function' || typeof storage.persisted !== 'function') {
    return null;
  }
  return storage as StorageLike;
}

function defaultNavigator(): { storage?: Partial<StorageLike> } | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator;
}

/** The current state, without asking for anything. */
export async function persistState(nav = defaultNavigator()): Promise<PersistState> {
  const storage = storageOf(nav);
  if (!storage) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Ask, unless it is already granted. Never throws. */
export async function requestPersistence(nav = defaultNavigator()): Promise<PersistState> {
  const storage = storageOf(nav);
  if (!storage) return 'unsupported';
  try {
    if (await storage.persisted()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Ask and remember the outcome on this device. */
export async function requestAndRecord(
  nav = defaultNavigator(),
  db: SuqDatabase = defaultDb,
): Promise<PersistState> {
  const state = await requestPersistence(nav);
  await db.device_meta.update(DEVICE_META_ID, {
    storage_persist: state,
    storage_persist_at: nowIso(),
  });
  return state;
}

/**
 * First run: ask once and record it. Later boots leave it alone — Firefox
 * shows a prompt each time it is asked, and nobody should meet that on every
 * launch. Settings has the retry.
 */
export async function requestPersistenceOnFirstRun(
  nav = defaultNavigator(),
  db: SuqDatabase = defaultDb,
): Promise<PersistState | null> {
  const meta = await db.device_meta.get(DEVICE_META_ID);
  if (!meta || meta.storage_persist !== undefined) return null;
  return requestAndRecord(nav, db);
}
