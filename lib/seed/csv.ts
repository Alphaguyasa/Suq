import type { Unit } from '@/lib/db';
import { parseETB } from '@/lib/format';

export interface CsvProduct {
  name: string;
  name_am: string;
  barcode: string | null;
  unit: Unit;
  cost_price: number;
  sell_price: number;
  reorder_level: number;
  opening_qty: number;
}

export interface CsvParseResult {
  products: CsvProduct[];
  /** One line per rejected row, saying which row and why. */
  errors: string[];
}

const UNITS: Unit[] = ['pcs', 'kg', 'l', 'pack'];

/**
 * Minimal RFC-4180-ish splitter: handles quoted fields and doubled quotes,
 * which is what a spreadsheet export produces when a product name contains
 * a comma. Not a general CSV library — it does not need to be.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(current);
      current = '';
    } else current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function toCents(raw: string, label: string, row: number): number {
  const value = raw.trim();
  if (!value) return 0;

  try {
    return parseETB(value);
  } catch {
    throw new Error(`row ${row}: ${label} "${raw}" is not a price`);
  }
}

function toQuantity(raw: string, label: string, row: number): number {
  const value = raw.trim();
  if (!value) return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`row ${row}: ${label} "${raw}" is not a quantity`);
  }
  return parsed;
}

/**
 * Parses a product CSV. A bad row is reported and skipped rather than
 * aborting the import: a shopkeeper with one malformed line out of two
 * hundred should still get the other hundred and ninety-nine.
 */
export function parseProductCsv(text: string): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return { products: [], errors: ['The file is empty'] };

  const header = splitCsvLine(lines[0] as string).map((column) => column.toLowerCase());
  const index = (name: string) => header.indexOf(name);

  const nameAt = index('name');
  const nameAmAt = index('name_am');

  if (nameAt === -1 && nameAmAt === -1) {
    return { products: [], errors: ['Needs at least a "name" or "name_am" column'] };
  }

  const barcodeAt = index('barcode');
  const unitAt = index('unit');
  const costAt = index('cost_price');
  const sellAt = index('sell_price');
  const reorderAt = index('reorder_level');
  const openingAt = index('opening_qty');

  const products: CsvProduct[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const fields = splitCsvLine(lines[i] as string);
    const at = (position: number) => (position === -1 ? '' : (fields[position] ?? ''));
    const rowNumber = i + 1;

    try {
      const name = at(nameAt);
      const nameAm = at(nameAmAt);

      if (!name && !nameAm) {
        errors.push(`row ${rowNumber}: no name`);
        continue;
      }

      const rawUnit = at(unitAt).toLowerCase();
      const unit = (UNITS as string[]).includes(rawUnit) ? (rawUnit as Unit) : 'pcs';

      products.push({
        // Either column alone is enough; the other mirrors it so nothing
        // renders blank on a receipt.
        name: name || nameAm,
        name_am: nameAm || name,
        barcode: at(barcodeAt) || null,
        unit,
        cost_price: toCents(at(costAt), 'cost_price', rowNumber),
        sell_price: toCents(at(sellAt), 'sell_price', rowNumber),
        reorder_level: toQuantity(at(reorderAt), 'reorder_level', rowNumber),
        opening_qty: toQuantity(at(openingAt), 'opening_qty', rowNumber),
      });
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return { products, errors };
}
