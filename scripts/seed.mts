/**
 * `npm run seed`
 *
 * This cannot load the data. IndexedDB is the source of truth and it lives in
 * the browser, so there is no database here for Node to write to — loading
 * happens in the app at /dev/seed, which also means it works offline like
 * everything else.
 *
 * What this DOES do is validate the catalogue before you put it in front of a
 * client: integer cents, real margins, genuine Amharic names, unique barcodes.
 */
import { CATALOGUE } from '../lib/seed/catalogue.ts';
import { formatETB } from '../lib/format.ts';

const ETHIOPIC = /[ሀ-፿]/;
const problems: string[] = [];

const seen = new Set<string>();
for (const entry of CATALOGUE) {
  if (!Number.isInteger(entry.cost_price) || !Number.isInteger(entry.sell_price)) {
    problems.push(`${entry.name}: prices must be integer cents`);
  }
  if (entry.sell_price <= entry.cost_price) {
    problems.push(`${entry.name}: sells at or below cost`);
  }
  if (!ETHIOPIC.test(entry.name_am)) {
    problems.push(`${entry.name}: name_am "${entry.name_am}" has no Ethiopic characters`);
  }
  if (seen.has(entry.barcode)) {
    problems.push(`${entry.name}: duplicate barcode ${entry.barcode}`);
  }
  seen.add(entry.barcode);
}

const width = Math.max(...CATALOGUE.map((entry) => entry.name_am.length));

for (const entry of CATALOGUE) {
  const low = entry.opening_qty <= entry.reorder_level ? '  ← low stock' : '';
  const margin = Math.round(((entry.sell_price - entry.cost_price) / entry.sell_price) * 100);

  console.log(
    `${entry.name_am.padEnd(width)}  ${formatETB(entry.sell_price).padStart(9)} ETB` +
      `  ${String(margin).padStart(3)}%  qty ${String(entry.opening_qty).padStart(3)}${low}`,
  );
}

console.log(`\n${CATALOGUE.length} products.`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('Catalogue is valid. Load it into the device at /dev/seed.');
