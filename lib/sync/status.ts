'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { db } from '@/lib/db';
import type { SuqDatabase } from '@/lib/db';
import { getEngineState, subscribeToEngine } from './engine';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'blocked';

/** BUILD_GUIDE 4.4: blocked once anything has failed this many times. */
export const MAX_ATTEMPTS = 5;

export interface SyncStatus {
  state: SyncState;
  /** Every queued row: sales, their lines, their movements, product edits. */
  pending: number;
  /**
   * Queued SALES only — what the pill shows.
   *
   * A three-line sale queues seven rows, so counting the outbox made the pill
   * read "21 saved" after three offline sales. Honest about the machinery,
   * wrong about the thing a shopkeeper is being reassured about. They are
   * counting sales, so the pill counts sales.
   */
  pendingSales: number;
  lastSyncAt: string | null;
  lastError: string | null;
  authed: boolean;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

/**
 * Derives the four states honestly. Order matters: a device that is offline
 * with a failing row is offline, not blocked — reconnecting is the fix, and
 * saying "blocked" would send the shopkeeper looking for a problem that
 * isn't theirs.
 */
export function deriveState(input: {
  online: boolean;
  authed: boolean;
  syncing: boolean;
  pending: number;
  maxAttempts: number;
}): SyncState {
  if (!input.online) return 'offline';
  if (!input.authed) return 'blocked';
  if (input.maxAttempts >= MAX_ATTEMPTS) return 'blocked';
  if (input.syncing) return 'syncing';
  if (input.pending > 0) return 'syncing';
  return 'synced';
}

/**
 * Highest attempt count in the outbox, 0 when empty.
 *
 * Runs on every IndexedDB change the pill observes. Reading the whole queue
 * here meant a cold-start till with hundreds of queued rows re-read all of
 * them on every sale; the attempts index (schema v4) makes it one seek.
 */
export async function worstAttempts(database: SuqDatabase = db): Promise<number> {
  const worst = await database.outbox.orderBy('attempts').last();
  return worst?.attempts ?? 0;
}

export function useSyncStatus(): SyncStatus {
  const online = useOnline();

  const engine = useSyncExternalStore(subscribeToEngine, getEngineState, getEngineState);

  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const pendingSales = useLiveQuery(
    () => db.outbox.where('table').equals('sales').count(),
    [],
    0,
  );
  const maxAttempts = useLiveQuery(() => worstAttempts(), [], 0);

  return {
    state: deriveState({
      online,
      authed: engine.authed,
      syncing: engine.syncing,
      pending: pending ?? 0,
      maxAttempts: maxAttempts ?? 0,
    }),
    pending: pending ?? 0,
    pendingSales: pendingSales ?? 0,
    lastSyncAt: engine.lastSyncAt,
    lastError: engine.lastError,
    authed: engine.authed,
  };
}
