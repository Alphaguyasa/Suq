import { describe, expect, it } from 'vitest';
import { formatETB, parseETB } from './format';

describe('formatETB', () => {
  it('formats whole and fractional birr', () => {
    expect(formatETB(0)).toBe('0.00');
    expect(formatETB(5)).toBe('0.05');
    expect(formatETB(50)).toBe('0.50');
    expect(formatETB(1235)).toBe('12.35');
    expect(formatETB(100000)).toBe('1,000.00');
    expect(formatETB(12345678)).toBe('123,456.78');
  });

  it('formats negative amounts for voids and change', () => {
    expect(formatETB(-1235)).toBe('-12.35');
    expect(formatETB(-5)).toBe('-0.05');
  });

  it('rejects floats, because a float here means a bug upstream', () => {
    expect(() => formatETB(12.35)).toThrow(TypeError);
    expect(() => formatETB(NaN)).toThrow(TypeError);
  });
});

describe('parseETB', () => {
  it('parses what a cashier actually types', () => {
    expect(parseETB('12.35')).toBe(1235);
    expect(parseETB('12.5')).toBe(1250);
    expect(parseETB('12')).toBe(1200);
    expect(parseETB('0.05')).toBe(5);
    expect(parseETB('1,000.00')).toBe(100000);
    expect(parseETB(' 42 ')).toBe(4200);
  });

  it('rejects junk instead of guessing', () => {
    expect(() => parseETB('')).toThrow(TypeError);
    expect(() => parseETB('abc')).toThrow(TypeError);
    expect(() => parseETB('12.345')).toThrow(TypeError);
    expect(() => parseETB('1.2.3')).toThrow(TypeError);
  });

  it('rejects negative amounts', () => {
    expect(() => parseETB('-5')).toThrow(TypeError);
    expect(() => parseETB('-0.50')).toThrow(TypeError);
    expect(() => parseETB(' -1,000 ')).toThrow(TypeError);
  });

  it('round-trips without drift across many values', () => {
    for (let cents = 0; cents < 20000; cents += 7) {
      expect(parseETB(formatETB(cents))).toBe(cents);
    }
  });

  it('sums exactly where floats would drift', () => {
    // 0.1 + 0.2 in float is 0.30000000000000004. In cents it is 30.
    const total = [10, 20].reduce((a, b) => a + b, 0);
    expect(formatETB(total)).toBe('0.30');
  });
});
