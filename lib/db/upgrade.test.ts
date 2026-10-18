import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DEVICE_META_ID } from './device';
import { SCHEMA_VERSIONS, SuqDatabase } from './schema';
import type {
  Cashier,
  DeviceMeta,
  OutboxEntry,
  Product,
  Sale,
  SaleItem,
  ShopSettings,
  StockCacheEntry,
  StockMovement,
} from './schema';
import { openAtVersion } from './test-helpers';

/**
 * PROJECT RULE (CLAUDE.md §5): every Dexie schema change needs a versioned
 * upgrade plus a test that old data survives it.
 *
 * For every historical version this opens a database exactly as that build
 * left it, fills every table it had with real-looking rows, then opens the
 * current SuqDatabase on top — the upgrade a till runs on its next launch —
 * and checks every row came through, indexes still answer, and the newer
 * tables work. Adding a version: append it to SCHEMA_VERSIONS, add its
 * definition to FROZEN below, and give any new table a fixture in ROWS.
 */

/**
 * What each published version declared, copied by hand. If SCHEMA_VERSIONS
 * ever stops starting with these, an old step was edited — which changes what
 * tills in the field upgrade into. Append a new version instead.
 */
const FROZEN = [
  {
    version: 1,
    stores: {
      products: 'id, barcode, name, name_am, updated_at',
      sales: 'id, created_at, receipt_no, synced_at, voids_sale_id',
      sale_items: 'id, sale_id, product_id, created_at',
      stock_movements: 'id, product_id, created_at, [product_id+created_at], ref_id',
      outbox: '++id, table, row_id, created_at',
      device_meta: 'id',
      stock_cache: 'product_id',
    },
  },
  { version: 2, stores: { shop_settings: 'id' } },
  { version: 3, stores: { cashiers: 'id, name' } },
];

const SHOP = 'b7c1d2e3-0000-4000-8000-000000000001';
const DEVICE = 'd1d1d1d1-0000-4000-8000-000000000002';

const product: Product = {
  id: 'p-ambo',
  shop_id: SHOP,
  name: 'Ambo Water 1L',
  name_am: 'አምቦ ውሃ 1 ሊትር',
  barcode: '6001234567890',
  unit: 'pcs',
  cost_price: 1800,
  sell_price: 2500,
  reorder_level: 12,
  is_active: true,
  updated_at: '2026-09-30T08:00:00.000Z',
  deleted_at: null,
};

const sale: Sale = {
  id: 's-1',
  shop_id: SHOP,
  device_id: DEVICE,
  receipt_no: 'A1-000042',
  subtotal: 5000,
  discount: 0,
  total: 5000,
  payment_method: 'cash',
  cashier_name: 'መሠረት',
  voided_by: null,
  voids_sale_id: null,
  cash_received: 10000,
  created_at: '2026-10-01T09:15:00.000Z',
  synced_at: null,
};

const voidRow: Sale = {
  ...sale,
  id: 's-2',
  receipt_no: 'A1-000043',
  subtotal: -5000,
  total: -5000,
  cash_received: null,
  voids_sale_id: 's-1',
  created_at: '2026-10-01T09:20:00.000Z',
  synced_at: '2026-10-01T09:21:00.000Z',
};

const item: SaleItem = {
  id: 'si-1',
  shop_id: SHOP,
  sale_id: 's-1',
  product_id: 'p-ambo',
  name_snapshot: 'አምቦ ውሃ 1 ሊትር',
  unit_price: 2500,
  qty: 2,
  line_total: 5000,
  created_at: sale.created_at,
};

const movements: StockMovement[] = [
  {
    id: 'm-open',
    shop_id: SHOP,
    product_id: 'p-ambo',
    qty_delta: 24,
    reason: 'opening',
    ref_id: null,
    note: null,
    created_at: '2026-09-30T08:00:00.000Z',
    device_id: DEVICE,
  },
  {
    id: 'm-sale',
    shop_id: SHOP,
    product_id: 'p-ambo',
    qty_delta: -2,
    reason: 'sale',
    ref_id: 's-1',
    note: null,
    created_at: sale.created_at,
    device_id: DEVICE,
  },
];

// The id is auto-incremented; the next row written after the upgrade must not reuse it.
const outbox: OutboxEntry = {
  id: 7,
  table: 'sales',
  op: 'upsert',
  row_id: 's-1',
  payload: sale,
  created_at: sale.created_at,
  attempts: 3,
  last_error: 'Failed to fetch',
  last_tried_at: '2026-10-01T09:16:00.000Z',
};

const device: DeviceMeta = {
  id: DEVICE_META_ID,
  device_id: DEVICE,
  device_prefix: 'A1',
  shop_id: SHOP,
  receipt_counter: 43,
  last_pull_at: '2026-10-01T09:00:00.000Z',
  cashier_name: 'መሠረት',
};

const cache: StockCacheEntry = {
  product_id: 'p-ambo',
  on_hand: 22,
  computed_at: '2026-10-01T09:15:01.000Z',
};

const settings: ShopSettings = {
  id: 'singleton',
  shop_name: 'Test Shop',
  shop_name_am: 'የሙከራ ሱቅ',
  phone: '+251911000000',
  address: 'Addis Ababa',
  receipt_footer: 'Thank you',
  receipt_footer_am: 'እናመሰግናለን',
  printer_width: 58,
  updated_at: '2026-10-01T07:00:00.000Z',
};

const cashier: Cashier = {
  id: 'c-1',
  name: 'መሠረት',
  pin: '1234',
  created_at: '2026-10-01T07:00:00.000Z',
};

/** Rows for every table that has ever existed. A new table needs an entry. */
const ROWS: Record<string, unknown[]> = {
  products: [product],
  sales: [sale, voidRow],
  sale_items: [item],
  stock_movements: movements,
  outbox: [outbox],
  device_meta: [device],
  stock_cache: [cache],
  shop_settings: [settings],
  cashiers: [cashier],
};

const LATEST = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1]!.version;
const opened: Dexie[] = [];
let counter = 0;

afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

/** Tables that exist once every step up to `version` has run. */
function tablesAt(version: number): string[] {
  return SCHEMA_VERSIONS.filter((step) => step.version <= version).flatMap((step) =>
    Object.keys(step.stores),
  );
}

async function fillAt(version: number): Promise<{ name: string; tables: string[] }> {
  const name = `suq-upgrade-${version}-${counter++}`;
  const old = openAtVersion(name, version);
  opened.push(old);
  const tables = tablesAt(version);

  await old.open();
  await old.transaction('rw', tables, async () => {
    for (const table of tables) {
      await old.table(table).bulkAdd(ROWS[table]!);
    }
  });
  old.close();

  return { name, tables };
}

async function upgrade(name: string): Promise<SuqDatabase> {
  const current = new SuqDatabase(name);
  opened.push(current);
  await current.open();
  return current;
}

describe('Dexie schema history', () => {
  it('starts with the published versions, unedited', () => {
    expect(
      SCHEMA_VERSIONS.slice(0, FROZEN.length).map(({ version, stores }) => ({
        version,
        stores,
      })),
    ).toEqual(FROZEN);
    expect(SCHEMA_VERSIONS.map((step) => step.version)).toEqual(
      [...SCHEMA_VERSIONS.map((step) => step.version)].sort((a, b) => a - b),
    );
  });

  it('has a fixture for every table, so no table escapes the upgrade test', () => {
    expect(Object.keys(ROWS).sort()).toEqual(tablesAt(LATEST).sort());
  });
});

describe.each(SCHEMA_VERSIONS.filter((step) => step.version < LATEST).map((step) => step.version))(
  'upgrading a v%i database to the current schema',
  (from) => {
    it('keeps every row exactly as it was', async () => {
      const { name, tables } = await fillAt(from);
      const current = await upgrade(name);

      expect(current.verno).toBe(LATEST);
      for (const table of tables) {
        const key = current.table(table).schema.primKey.keyPath as string;
        const rows = await current.table(table).toArray();
        const byKey = (a: Record<string, unknown>, b: Record<string, unknown>) =>
          String(a[key]).localeCompare(String(b[key]));
        expect(rows.sort(byKey), table).toEqual(
          [...(ROWS[table] as Record<string, unknown>[])].sort(byKey),
        );
      }
    });

    it('keeps the receipt counter, so the next receipt number does not repeat', async () => {
      const { name } = await fillAt(from);
      const current = await upgrade(name);

      expect((await current.device_meta.get(DEVICE_META_ID))?.receipt_counter).toBe(43);
    });

    it('still answers the indexed queries the app runs', async () => {
      const { name } = await fillAt(from);
      const current = await upgrade(name);

      expect(await current.products.where('barcode').equals('6001234567890').count()).toBe(1);
      expect(await current.sales.where('receipt_no').equals('A1-000042').count()).toBe(1);
      expect(await current.sales.where('voids_sale_id').equals('s-1').count()).toBe(1);
      expect(await current.sale_items.where('sale_id').equals('s-1').count()).toBe(1);
      expect(
        await current.stock_movements
          .where('[product_id+created_at]')
          .between(['p-ambo', Dexie.minKey], ['p-ambo', Dexie.maxKey])
          .count(),
      ).toBe(2);
      expect(await current.outbox.where('row_id').equals('s-1').count()).toBe(1);
    });

    it('makes the newer tables usable and keeps the outbox sequence', async () => {
      const { name, tables } = await fillAt(from);
      const current = await upgrade(name);

      for (const table of tablesAt(LATEST).filter((t) => !tables.includes(t))) {
        expect(await current.table(table).count(), table).toBe(0);
        await current.table(table).add(ROWS[table]![0]);
        expect(await current.table(table).count(), table).toBe(1);
      }

      const nextId = await current.outbox.add({
        ...outbox,
        id: undefined,
        row_id: 's-3',
      });
      expect(nextId).toBeGreaterThan(7);
    });
  },
);
