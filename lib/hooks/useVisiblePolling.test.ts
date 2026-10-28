import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisiblePolling } from './useVisiblePolling';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useVisiblePolling', () => {
  it('runs at once and then on every interval while visible', () => {
    const task = vi.fn();
    renderHook(() => useVisiblePolling(task, 15_000));

    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(45_000);
    expect(task).toHaveBeenCalledTimes(4);
  });

  it('stops while hidden and refreshes at once on coming back', () => {
    const task = vi.fn();
    renderHook(() => useVisiblePolling(task, 15_000));
    expect(task).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    vi.advanceTimersByTime(10 * 60_000);
    expect(task).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(task).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(15_000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('does not poll when mounted in a hidden page until it is shown', () => {
    visibility = 'hidden';
    const task = vi.fn();
    renderHook(() => useVisiblePolling(task, 15_000));

    vi.advanceTimersByTime(60_000);
    expect(task).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('a second "visible" event does not start a second timer', () => {
    const task = vi.fn();
    renderHook(() => useVisiblePolling(task, 15_000));

    setVisibility('visible');
    setVisibility('visible');
    task.mockClear();
    vi.advanceTimersByTime(15_000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('stops on unmount', () => {
    const task = vi.fn();
    const { unmount } = renderHook(() => useVisiblePolling(task, 15_000));
    unmount();
    task.mockClear();

    vi.advanceTimersByTime(60_000);
    setVisibility('visible');
    expect(task).not.toHaveBeenCalled();
  });

  it('uses the latest task without restarting the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ task }) => useVisiblePolling(task, 15_000), {
      initialProps: { task: first },
    });
    vi.advanceTimersByTime(10_000);
    rerender({ task: second });

    vi.advanceTimersByTime(5_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
