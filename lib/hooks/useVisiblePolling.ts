'use client';

import { useEffect, useRef } from 'react';

/**
 * Run `task` now and then every `intervalMs`, but only while the page is
 * visible.
 *
 * The owner leaves the dashboard open on a phone. A plain setInterval keeps
 * querying Supabase from a locked phone or a background tab all day: battery
 * and free-tier quota for numbers nobody is looking at. So the timer stops
 * when the page is hidden, and coming back runs `task` at once (the numbers
 * are stale by then) before the timer starts again.
 *
 * `task` is read through a ref, so a new function identity each render does
 * not restart the timer.
 */
export function useVisiblePolling(task: () => void, intervalMs: number): void {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      taskRef.current();
      timer = setInterval(() => taskRef.current(), intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else start();
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [intervalMs]);
}
