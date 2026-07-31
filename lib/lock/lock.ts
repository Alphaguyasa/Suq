'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { anyCashiers, setCashier } from '@/lib/db';
import type { Cashier } from '@/lib/db';

/** BUILD_GUIDE has no number for this; five minutes is the session 8 brief. */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface LockState {
  /** Null when nobody has unlocked yet. */
  cashier: Cashier | null;
  locked: boolean;
  /** False until we know whether any cashier exists at all. */
  ready: boolean;
}

let state: LockState = { cashier: null, locked: false, ready: false };
const listeners = new Set<() => void>();

function setState(patch: Partial<LockState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function getState(): LockState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A till with no cashiers configured is never locked — otherwise a fresh
 * install would be unusable before setup, which is exactly backwards.
 */
export async function initialiseLock(): Promise<void> {
  setState({ locked: await anyCashiers(), ready: true });
}

export async function unlockAs(cashier: Cashier): Promise<void> {
  // The sale rows record who rang them up.
  await setCashier(cashier.name);
  setState({ cashier, locked: false });
}

export function lockNow(): void {
  if (!state.ready) return;
  setState({ locked: true });
}

export function useLock(): LockState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * Locks after five idle minutes. Any pointer or key activity resets it, so a
 * cashier mid-transaction is never locked out by the clock.
 */
export function useIdleLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lockNow, IDLE_TIMEOUT_MS);
    };

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, reset, { passive: true });
    reset();

    return () => {
      clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, reset);
    };
  }, [enabled]);
}

/** Test seam. */
export function resetLockState(): void {
  state = { cashier: null, locked: false, ready: false };
}
