import { ensureDevice, productsRepo, stockRepo } from '@/lib/db';
import type { CsvProduct } from './csv';

export interface ImportResult {
  created: number;
  skipped: number;
}

/**
 * Idempotent by barcode, like the sample catalogue: importing the same file
 * twice does not duplicate products or double the opening stock. Rows without
 * a barcode are always created, since there is nothing to match them on.
 */
export async function importProducts(rows: CsvProduct[]): Promise<ImportResult> {
  await ensureDevice();

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.barcode && (await productsRepo.getByBarcode(row.barcode))) {
      skipped += 1;
      continue;
    }

    const product = await productsRepo.upsert({
      name: row.name,
      name_am: row.name_am,
      barcode: row.barcode,
      unit: row.unit,
      cost_price: row.cost_price,
      sell_price: row.sell_price,
      reorder_level: row.reorder_level,
    });

    if (row.opening_qty > 0) {
      await stockRepo.openingStock({
        productId: product.id,
        qty: row.opening_qty,
        note: 'import',
      });
    }

    created += 1;
  }

  return { created, skipped };
}
