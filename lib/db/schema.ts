import Dexie from 'dexie';
import type { EntityTable, Transaction } from 'dexie';

/**
 * IndexedDB is the source of truth. Supabase is a replica.
 * BUILD_GUIDE section 3.2 defines these shapes; they are mirrored exactly in
 * Postgres in session 5, so do not rename a column casually.
 *
 * Tier rules (BUILD_GUIDE 3.1):
 *   append-only   sales, sale_items, stock_movements  — immutable, no conflict rule needed
 *   last-write-wins  products                          — higher updated_at wins
 *   local only    outbox, device_meta, stock_cache     — machinery, never syncs
 */

export type Unit = 'pcs' | 'kg' | 'l' | 'pack';
export type PaymentMethod = 'cash' | 'telebirr' | 'card' | 'credit';
export type MovementReason =
  | 'sale'
  | 'purchase'
  | 'adjustment'
  | 'return'
  | 'damage'
  | 'opening';

/** Tables that replicate to Supabase, and therefore the only ones with an outbox. */
export type SyncedTable = 'products' | 'sales' | 'sale_items' | 'stock_movements';

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  name_am: string;
  barcode: string | null;
  unit: Unit;
  /** integer cents */
  cost_price: number;
  /** integer cents */
  sell_price: number;
  reorder_level: number;
  is_active: boolean;
  /** ISO string — the last-write-wins key */
  updated_at: string;
  deleted_at: string | null;
}

export interface Sale {
  id: string;
  shop_id: string;
  device_id: string;
  /** "A1-000142" — see BUILD_GUIDE 3.4 */
  receipt_no: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  cashier_name: string;
  /**
   * Reserved for parity with the Postgres column in BUILD_GUIDE 3.2. It is
   * never written locally: setting it would be an UPDATE on an immutable
   * table. Voided status is derived from the existence of a void row whose
   * voids_sale_id points here — see isVoided() in repositories/sales.ts.
   */
  voided_by: string | null;
  /** Set only on a void row: the id of the sale this one reverses. */
  voids_sale_id: string | null;
  /**
   * What the customer handed over, for cash sales. Stored so a reprint can
   * still show the change given — it is not derivable from the total.
   * Null for every other payment method.
   */
  cash_received: number | null;
  created_at: string;
  /** Local only, stripped on push. */
  synced_at: string | null;
}

export interface SaleItem {
  id: string;
  /**
   * Carried on the row rather than reached through sale_id. Postgres RLS
   * scopes every table by shop_id, and an INSERT policy that had to look up
   * the parent sale would make the sale's arrival order load-bearing.
   * See supabase/migrations/20260731000000_init.sql.
   */
  shop_id: string;
  sale_id: string;
  product_id: string;
  /** Name and price AT TIME OF SALE. Never join to products for history. */
  name_snapshot: string;
  unit_price: number;
  qty: number;
  line_total: number;
  /** Copied from the parent sale. It is the watermark pull filters by. */
  created_at: string;
}

export interface StockMovement {
  id: string;
  shop_id: string;
  product_id: string;
  /** Negative for sales, positive for restock. On-hand is the SUM of these. */
  qty_delta: number;
  reason: MovementReason;
  /** sale_id when reason is 'sale' or 'return' */
  ref_id: string | null;
  note: string | null;
  created_at: string;
  device_id: string;
}

export interface OutboxEntry {
  id?: number;
  table: SyncedTable;
  op: 'upsert';
  row_id: string;
  payload: unknown;
  created_at: string;
  attempts: number;
  last_error: string | null;
  /** When the last push attempt ran, for exponential backoff. */
  last_tried_at: string | null;
}

/** Local only. One row, keyed by DEVICE_META_ID. */
export interface DeviceMeta {
  id: string;
  device_id: string;
  /** "A1" — makes receipt numbers collision-free across offline devices. */
  device_prefix: string;
  shop_id: string;
  /** Monotonic, local, never reset. */
  receipt_counter: number;
  /** Server time from the last successful pull. Never Date.now(). */
  last_pull_at: string | null;
  /**
   * Which server column last_pull_at is a watermark for. Absent = the legacy
   * device-clock columns (created_at / updated_at). Not indexed, so adding it
   * needs no Dexie version bump.
   */
  pull_column?: 'received_at';
  cashier_name: string;
  /**
   * Outcome of the first-run navigator.storage.persist() request, and when.
   * Absent = never asked. Not indexed, so no Dexie version bump.
   */
  storage_persist?: 'granted' | 'denied' | 'unsupported';
  storage_persist_at?: string;
}

/**
 * Render-speed cache only. Always recomputed from stock_movements, never
 * written to directly by feature code. If cache and movements disagree,
 * the movements are right. BUILD_GUIDE 3.5.
 */
export interface StockCacheEntry {
  product_id: string;
  on_hand: number;
  computed_at: string;
}

/**
 * Local only, one row, keyed by SHOP_SETTINGS_ID.
 *
 * BUILD_GUIDE 3.1 files shop_settings under last-write-wins, but the session 5
 * migration list does not include it, so nothing here replicates yet. Session 8
 * owns the settings UI; if the owner dashboard ever needs these fields, add the
 * Postgres table then and move it to the synced tier.
 */
export interface ShopSettings {
  id: string;
  shop_name: string;
  shop_name_am: string;
  phone: string;
  address: string;
  receipt_footer: string;
  receipt_footer_am: string;
  /** Thermal paper width in mm. Plenty of shops have the narrower printer. */
  printer_width: 58 | 80;
  updated_at: string;
}

/**
 * Local only. A cashier's PIN identifies who rang up a sale — it is not a
 * security boundary and is not built as one. It is stored in plain text
 * deliberately: hashing would imply a protection it cannot provide, since
 * anyone holding the tablet already holds the whole database. Its job is to
 * stop the wrong name landing on a receipt, not to keep anybody out.
 */
export interface Cashier {
  id: string;
  name: string;
  /** Exactly four digits. */
  pin: string;
  created_at: string;
}

export class SuqDatabase extends Dexie {
  products!: EntityTable<Product, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  sale_items!: EntityTable<SaleItem, 'id'>;
  stock_movements!: EntityTable<StockMovement, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'id'>;
  device_meta!: EntityTable<DeviceMeta, 'id'>;
  stock_cache!: EntityTable<StockCacheEntry, 'product_id'>;
  shop_settings!: EntityTable<ShopSettings, 'id'>;
  cashiers!: EntityTable<Cashier, 'id'>;

  constructor(name = 'suq') {
    super(name);

    for (const { version, stores, upgrade } of SCHEMA_VERSIONS) {
      const step = this.version(version).stores(stores);
      if (upgrade) step.upgrade(upgrade);
    }
  }
}

/**
 * Every Dexie version, oldest first. APPEND ONLY: a device in a shop may still
 * hold any of these on disk, and Dexie upgrades it by replaying the steps after
 * it. Editing a published step changes what an old till upgrades into.
 * lib/db/upgrade.test.ts opens a database at each historical version, fills
 * it, upgrades it, and checks nothing was lost; it also freezes these
 * definitions. A new version needs only a new entry here (plus an `upgrade`
 * if existing rows must change) and a fixture for any new table in that test.
 *
 * Indexed for the queries we actually run.
 *
 * is_active is deliberately NOT indexed despite being on the wish list:
 * IndexedDB cannot use a boolean as a key, so records would simply be
 * absent from the index and `where('is_active')` would silently return
 * nothing — worse than no index at all. Active filtering happens in
 * memory, which is free at shop scale (tens to hundreds of products).
 * The same constraint applies to nulls, which is why deleted_at and
 * synced_at lookups filter rather than seek.
 */
export interface SchemaVersion {
  version: number;
  stores: Record<string, string>;
  /** Rewrites existing rows when a step changes their shape. */
  upgrade?: (tx: Transaction) => Promise<void> | void;
}

export const SCHEMA_VERSIONS: readonly SchemaVersion[] = [
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
  // v2 adds shop settings. Dexie carries the v1 stores forward untouched.
  { version: 2, stores: { shop_settings: 'id' } },
  // v3 adds cashiers for the PIN lock.
  { version: 3, stores: { cashiers: 'id, name' } },
];

export const db = new SuqDatabase();

/** Test helper. Empties every table without tearing down the schema. */
export async function clearAllTables(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
