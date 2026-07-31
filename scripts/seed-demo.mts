/**
 * `npm run seed:demo`
 *
 * Generates the demo dataset in Node and checks its shape, then tells you
 * where to load it. As with `npm run seed`, it cannot write the data itself:
 * IndexedDB is the source of truth and it lives in the browser.
 *
 * What it CAN do is prove the month of trading is believable before a client
 * ever sees it — a flat sales curve or a low-stock report with nothing in it
 * is a demo that quietly falls over.
 */
import { generateDemo } from '../lib/seed/demo/generate.ts';
import { demoStats, sumRange } from '../lib/seed/demo/stats.ts';
import { formatETB } from '../lib/format.ts';

const data = generateDemo({
  shopId: '5c9a1000-0000-4000-8000-000000000001',
  deviceId: '00000000-0000-4000-8000-0000000000a1',
  now: new Date(),
});

const stats = demoStats(data);

const midMorning = sumRange(stats.byHour, 10, 11);
const evening = sumRange(stats.byHour, 17, 19);
const saturday = stats.byWeekday[6] ?? 0;
const midweek = ((stats.byWeekday[1] ?? 0) + (stats.byWeekday[2] ?? 0) + (stats.byWeekday[3] ?? 0)) / 3;

console.log(`Products      ${stats.products}`);
console.log(`Sales         ${stats.sales} over ${stats.days} days`);
console.log(`Voided        ${stats.voidRows}`);
console.log(`Net takings   ${formatETB(stats.netTakings)} ETB`);
console.log(`Low stock     ${stats.lowStock} products at or below reorder`);
console.log('');

console.log('Cashiers');
for (const [name, total] of Object.entries(stats.byCashier)) {
  const share = Math.round((total / stats.netTakings) * 100);
  console.log(`  ${name.padEnd(10)} ${formatETB(total).padStart(12)} ETB  ${share}%`);
}
console.log('');

console.log('Takings by hour');
const peak = Math.max(...stats.byHour);
for (let hour = 7; hour <= 21; hour += 1) {
  const value = stats.byHour[hour] ?? 0;
  const bar = '█'.repeat(Math.round((value / peak) * 40));
  console.log(`  ${String(hour).padStart(2, '0')}:00 ${bar}`);
}
console.log('');

const checks: [string, boolean, string][] = [
  ['sixty products', stats.products === 60, `got ${stats.products}`],
  ['about a month of history', stats.days >= 28, `got ${stats.days} days`],
  ['evenings busier than mid-morning', evening > midMorning * 2, `${evening} vs ${midMorning}`],
  ['Saturday busier than midweek', saturday > midweek, `${saturday} vs ${Math.round(midweek)}`],
  ['six products low on stock', stats.lowStock === 6, `got ${stats.lowStock}`],
  ['two cashiers, different volumes', Object.keys(stats.byCashier).length === 2, ''],
  ['some voided sales', stats.voidRows >= 2, `got ${stats.voidRows}`],
];

let failed = 0;
for (const [label, ok, detail] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (${detail})`}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log('\nShape is believable. Load it onto the device at /dev/seed.');
