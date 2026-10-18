/** Test-only fixtures. Never imported by application code. */
import Dexie from 'dexie';
import { registerDevice } from './device';
import * as productsRepo from './repositories/products';
import type { CartLine } from './repositories/sales';
import { SCHEMA_VERSIONS, clearAllTables } from './schema';
import type { DeviceMeta, Product } from './schema';

export const TEST_SHOP = 'shop-test';

/** Empty every table and register a till. Receipt counter starts at zero. */
export async function freshDatabase(devicePrefix = 'A1'): Promise<DeviceMeta> {
  await clearAllTables();
  return registerDevice({
    shop_id: TEST_SHOP,
    device_prefix: devicePrefix,
    cashier_name: 'መሠረት',
  });
}

export async function seedProduct(
  overrides: Partial<productsRepo.ProductInput> = {},
): Promise<Product> {
  return productsRepo.upsert({
    name: 'Ambo Water 1L',
    name_am: 'አምቦ ውሃ 1 ሊትር',
    barcode: '6001234567890',
    unit: 'pcs',
    cost_price: 1800,
    sell_price: 2500,
    reorder_level: 12,
    ...overrides,
  });
}

export function cartLine(product: Product, qty: number): CartLine {
  return {
    product_id: product.id,
    name_snapshot: product.name_am,
    unit_price: product.sell_price,
    qty,
  };
}

/**
 * A database as an older build of the app left it: only the schema steps up
 * to `version`, under its own name so it never touches the app's `db`.
 * Fill it, close it, then open `new SuqDatabase(name)` to run the upgrade a
 * till would run on its next launch (lib/db/upgrade.test.ts).
 */
export function openAtVersion(name: string, version: number): Dexie {
  const old = new Dexie(name);
  for (const step of SCHEMA_VERSIONS) {
    if (step.version > version) break;
    const declared = old.version(step.version).stores(step.stores);
    if (step.upgrade) declared.upgrade(step.upgrade);
  }
  return old;
}
