'use client';

import { onLocalWrite } from '@/lib/db';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { SyncClient } from './client';
import { supabaseSyncClient } from './client';
import { drainOutbox } from './push';
import { pullOnce } from './pull';

/** BUILD_GUIDE 4.1 / 4.2. */
export const PUSH_INTERVAL_MS = 15_000;
export const PULL_INTERVAL_MS = 60_000;

export interface EngineState {
  running: boolean;
  syncing: boolean;
  /** False until somebody signs in; every RLS policy is `to authenticated`. */
  authed: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

let state: EngineState = {
  running: false,
  syncing: false,
  authed: false,
  lastSyncAt: null,
  lastError: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<EngineState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function getEngineState(): EngineState {
  return state;
}

export function subscribeToEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAuthed(authed: boolean): void {
  setState({ authed, lastError: authed ? null : state.lastError });
}

let timers: ReturnType<typeof setInterval>[] = [];
let unsubscribeWrites: (() => void) | null = null;
let inFlight: Promise<void> | null = null;

function online(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** Serialised: overlapping drains would double-send the same batch. */
async function runSync(client: SyncClient, alsoPull: boolean): Promise<void> {
  if (inFlight) return inFlight;
  if (!online() || !state.authed) return;

  inFlight = (async () => {
    setState({ syncing: true });
    try {
      const push = await drainOutbox(client);

      if (push.error) {
        setState({ lastError: push.error });
      } else {
        if (alsoPull) await pullOnce(client);
        setState({ lastSyncAt: new Date().toISOString(), lastError: null });
      }
    } catch (cause) {
      setState({ lastError: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setState({ syncing: false });
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Start the background engine: push every 15s, pull every 60s, and push
 * immediately after any local write. None of this is ever awaited by the UI.
 */
export function startSyncEngine(client: SyncClient = supabaseSyncClient()): () => void {
  if (state.running) return stopSyncEngine;
  if (!isSupabaseConfigured()) return () => undefined;

  setState({ running: true });

  timers.push(setInterval(() => void runSync(client, false), PUSH_INTERVAL_MS));
  timers.push(setInterval(() => void runSync(client, true), PULL_INTERVAL_MS));

  unsubscribeWrites = onLocalWrite(() => void runSync(client, false));

  const onOnline = () => void runSync(client, true);
  window.addEventListener('online', onOnline);
  const onOffline = () => setState({ syncing: false });
  window.addEventListener('offline', onOffline);

  // Cold start: drain whatever the last session left behind.
  void runSync(client, true);

  const cleanup = () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    stopSyncEngine();
  };

  return cleanup;
}

export function stopSyncEngine(): void {
  for (const timer of timers) clearInterval(timer);
  timers = [];
  unsubscribeWrites?.();
  unsubscribeWrites = null;
  setState({ running: false, syncing: false });
}

/** The pill's "Sync now". */
export async function syncNow(client: SyncClient = supabaseSyncClient()): Promise<void> {
  await runSync(client, true);
}

/** Test seam. */
export function resetEngineState(): void {
  stopSyncEngine();
  state = {
    running: false,
    syncing: false,
    authed: false,
    lastSyncAt: null,
    lastError: null,
  };
}
