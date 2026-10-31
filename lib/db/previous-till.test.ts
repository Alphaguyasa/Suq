import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIOUS_TILL_KEY,
  previousCounterFor,
  readPreviousTill,
  rememberPreviousTill,
} from './previous-till';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('previous till', () => {
  it('round-trips through localStorage', () => {
    const till = { device_id: 'till-1', device_prefix: 'A1', receipt_counter: 41 };
    rememberPreviousTill(till);

    expect(readPreviousTill()).toEqual(till);
    expect(previousCounterFor('A1')).toBe(41);
    expect(previousCounterFor('B1')).toBe(0);
  });

  it('is nothing when no till was ever reset here', () => {
    expect(readPreviousTill()).toBeNull();
    expect(previousCounterFor('A1')).toBe(0);
  });

  it.each([
    ['not JSON', '{oops'],
    ['not an object', '42'],
    ['an empty device id', JSON.stringify({ device_id: '', device_prefix: 'A1', receipt_counter: 1 })],
    ['a fractional counter', JSON.stringify({ device_id: 'x', device_prefix: 'A1', receipt_counter: 1.5 })],
    ['a negative counter', JSON.stringify({ device_id: 'x', device_prefix: 'A1', receipt_counter: -3 })],
    ['a missing prefix', JSON.stringify({ device_id: 'x', receipt_counter: 3 })],
  ])('ignores %s', (_label, raw) => {
    localStorage.setItem(PREVIOUS_TILL_KEY, raw);
    expect(readPreviousTill()).toBeNull();
  });

  it('survives blocked storage on both read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => rememberPreviousTill({ device_id: 'x', device_prefix: 'A1', receipt_counter: 1 })).not.toThrow();
    expect(readPreviousTill()).toBeNull();
  });
});
