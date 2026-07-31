import { ensureDevice, productsRepo, stockRepo } from '@/lib/db';
import { CATALOGUE } from './catalogue';

export interface SeedResult {
  created: number;
  skipped: number;
}

/**
 * Load the sample catalogue onto this device.
 *
 * IndexedDB lives in the browser, so this necessarily runs in the browser —
 * see scripts/seed.ts for why `npm run seed` can only validate, not load.
 *
 * Idempotent by barcode: running it twice does not duplicate products or
 * double the opening stock.
 */
export async function seedCatalogue(): Promise<SeedResult> {
  await ensureDevice();

  let created = 0;
  let skipped = 0;

  for (const entry of CATALOGUE) {
    if (await productsRepo.getByBarcode(entry.barcode)) {
      skipped += 1;
      continue;
    }

    const product = await productsRepo.upsert({
      name: entry.name,
      name_am: entry.name_am,
      barcode: entry.barcode,
      unit: entry.unit,
      cost_price: entry.cost_price,
      sell_price: entry.sell_price,
      reorder_level: entry.reorder_level,
    });

    await stockRepo.openingStock({
      productId: product.id,
      qty: entry.opening_qty,
      note: 'seed',
    });

    created += 1;
  }

  return { created, skipped };
}
