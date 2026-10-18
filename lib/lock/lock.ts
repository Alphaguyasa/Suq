'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { anyCashiers, db, setCashier } from '@/lib/db';
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
 * The unlocked cashier, remembered for this tab only.
 *
 * Offline, Next's router cannot fetch the next page's payload, so a tap on a
 * link becomes a full page load — and the in-memory lock state above starts
 * over as locked. Without this, opening a receipt in airplane mode asked for
 * the PIN again. sessionStorage dies with the tab, so a cold launch of the
 * app still locks; the idle timeout still applies, measured from the last
 * activity this tab recorded.
 */
export const SESSION_KEY = 'suq.unlocked';

interface UnlockedSession {
  cashierId: string;
  /** Epoch ms of the last pointer/key activity. */
  at: number;
}

function readSession(): UnlockedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as UnlockedSession).cashierId === 'string' &&
      typeof (parsed as UnlockedSession).at === 'number'
    ) {
      return parsed as UnlockedSession;
    }
  } catch {
    // Storage blocked or garbage: behave as if nobody unlocked.
  }
  return null;
}

function writeSession(cashierId: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ cashierId, at: Date.now() }));
  } catch {
    // Storage blocked: the till still works, it just asks for the PIN on reload.
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

/** Activity seen: push the idle deadline of the remembered unlock forward. */
function touchSession(): void {
  if (state.cashier && !state.locked) writeSession(state.cashier.id);
}

/**
 * A till with no cashiers configured is never locked — otherwise a fresh
 * install would be unusable before setup, which is exactly backwards.
 */
export async function initialiseLock(): Promise<void> {
  if (!(await anyCashiers())) {
    setState({ locked: false, ready: true });
    return;
  }

  // Same tab, recently active, and the cashier still exists: carry on.
  const session = readSession();
  if (session && Date.now() - session.at < IDLE_TIMEOUT_MS) {
    const cashier = await db.cashiers.get(session.cashierId);
    if (cashier) {
      setState({ cashier, locked: false, ready: true });
      return;
    }
  }

  clearSession();
  setState({ locked: true, ready: true });
}

export async function unlockAs(cashier: Cashier): Promise<void> {
  // The sale rows record who rang them up.
  await setCashier(cashier.name);
  writeSession(cashier.id);
  setState({ cashier, locked: false });
}

export function lockNow(): void {
  if (!state.ready) return;
  clearSession();
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
      touchSession();
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
