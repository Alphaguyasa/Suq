import { classifyWriteError, db, ensureDevice, productsRepo, stockRepo } from '@/lib/db';
import type { WriteFailure } from '@/lib/db';
import type { CsvProduct } from './csv';

export interface ImportFailure {
  /** Line in the file, as CsvProduct.row. */
  row: number;
  name: string;
  failure: WriteFailure;
}

export interface ImportResult {
  created: number;
  /** Already on this till (same barcode); left untouched. */
  skipped: number;
  /** Rows that could not be saved, including any never tried after storage ran out. */
  failed: ImportFailure[];
}

/**
 * Idempotent by barcode, like the sample catalogue: importing the same file
 * twice does not duplicate products or double the opening stock. Rows without
 * a barcode are always created, since there is nothing to match them on.
 *
 * Each row is its own transaction (the product and its opening stock land
 * together or not at all), so a row that fails cannot leave a product whose
 * opening stock is missing — which a re-import would then skip by barcode and
 * never repair. A failed row is reported and the rest carry on; once storage
 * is full or gone, every remaining row would fail the same way, so they are
 * reported without being tried.
 */
export async function importProducts(rows: CsvProduct[]): Promise<ImportResult> {
  await ensureDevice();

  let created = 0;
  let skipped = 0;
  const failed: ImportFailure[] = [];
  let stoppedBy: WriteFailure | undefined;

  for (const row of rows) {
    if (stoppedBy) {
      failed.push({ row: row.row, name: row.name_am, failure: stoppedBy });
      continue;
    }

    try {
      const outcome = await importRow(row);
      if (outcome === 'created') created += 1;
      else skipped += 1;
    } catch (cause) {
      console.error(`[import] row ${row.row} not saved`, cause);
      const failure = classifyWriteError(cause);
      failed.push({ row: row.row, name: row.name_am, failure });
      if (failure !== 'unknown') stoppedBy = failure;
    }
  }

  return { created, skipped, failed };
}

async function importRow(row: CsvProduct): Promise<'created' | 'skipped'> {
  return db.transaction(
    'rw',
    [db.products, db.stock_movements, db.outbox, db.stock_cache, db.device_meta],
    async () => {
      if (row.barcode && (await productsRepo.getByBarcode(row.barcode))) return 'skipped';

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

      return 'created';
    },
  );
}
