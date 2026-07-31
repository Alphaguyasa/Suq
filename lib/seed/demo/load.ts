import { addCashier, db, ensureDevice, ensureSettings, updateSettings } from '@/lib/db';
import { stockRepo } from '@/lib/db';
import { generateDemo } from './generate';

export interface LoadDemoResult {
  products: number;
  sales: number;
  movements: number;
}

/**
 * Load a month of demo trading onto this device.
 *
 * These rows are written STRAIGHT TO THE TABLES, not through localWrite().
 * That is deliberate and it is the second sanctioned exception, alongside
 * lib/sync/apply.ts:
 *
 *   - localWrite() would queue roughly two thousand outbox rows and push a
 *     fictional shop's month of history into the real Supabase project.
 *   - The demo depends on the opposite. The cloud starts empty, the five
 *     sales rung up during the demo are the only things that sync, and step 6
 *     of DEMO_SCRIPT.md — "all five are there" — is then literally true on a
 *     second browser rather than five rows lost in seven hundred.
 *
 * So: history is local scenery, and the live sales are the demonstration.
 */
export async function loadDemoData(): Promise<LoadDemoResult> {
  const device = await ensureDevice();
  await ensureSettings();

  const data = generateDemo({
    shopId: device.shop_id,
    deviceId: device.device_id,
    devicePrefix: device.device_prefix,
    now: new Date(),
  });

  await db.transaction(
    'rw',
    [db.products, db.sales, db.sale_items, db.stock_movements, db.stock_cache],
    async () => {
      await db.products.bulkPut(data.products);
      await db.sales.bulkPut(data.sales);
      await db.sale_items.bulkPut(data.items);
      await db.stock_movements.bulkPut(data.movements);
    },
  );

  await stockRepo.recomputeCache();

  // The receipt counter has to clear the demo history, or the first live sale
  // reuses a number that is already on screen.
  await db.device_meta.update(device.id, { receipt_counter: data.sales.length });

  await updateSettings({
    shop_name: 'Rowda Supermarket',
    shop_name_am: 'ሮዳ ሱፐርማርኬት',
    phone: '+251 91 100 0000',
    address: 'ቦሌ፣ አዲስ አበባ',
    receipt_footer_am: 'እናመሰግናለን!',
  });

  for (const cashier of data.cashiers) {
    try {
      await addCashier(cashier.name, cashier.pin);
    } catch {
      // Already present from a previous load.
    }
  }

  return {
    products: data.products.length,
    sales: data.sales.length,
    movements: data.movements.length,
  };
}
