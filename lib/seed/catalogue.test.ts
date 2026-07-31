import { describe, expect, it } from 'vitest';
import { CATALOGUE } from './catalogue';

/** Ge'ez / Ethiopic block. A name without one of these is not an Amharic name. */
const ETHIOPIC = /[ሀ-፿]/;

describe('seed catalogue', () => {
  it('has fifteen products', () => {
    expect(CATALOGUE).toHaveLength(15);
  });

  it('prices everything in integer cents, with a real margin', () => {
    for (const entry of CATALOGUE) {
      expect(Number.isInteger(entry.cost_price), `${entry.name} cost`).toBe(true);
      expect(Number.isInteger(entry.sell_price), `${entry.name} sell`).toBe(true);
      expect(entry.sell_price, `${entry.name} margin`).toBeGreaterThan(entry.cost_price);
    }
  });

  it('gives every product a genuine Amharic name, not a transliteration', () => {
    for (const entry of CATALOGUE) {
      expect(ETHIOPIC.test(entry.name_am), `${entry.name} -> "${entry.name_am}"`).toBe(true);
    }
  });

  it('has unique barcodes, so seeding stays idempotent', () => {
    const barcodes = CATALOGUE.map((entry) => entry.barcode);
    expect(new Set(barcodes).size).toBe(barcodes.length);
  });

  it('leaves several products at or below reorder level, so low stock is visible', () => {
    const low = CATALOGUE.filter((entry) => entry.opening_qty <= entry.reorder_level);
    expect(low.length).toBeGreaterThanOrEqual(3);
  });

  it('never ships a placeholder name', () => {
    for (const entry of CATALOGUE) {
      expect(entry.name).not.toMatch(/product\s*[a-z0-9]$/i);
      expect(entry.name.length).toBeGreaterThan(3);
    }
  });
});
