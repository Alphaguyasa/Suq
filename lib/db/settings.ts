import { nowIso } from './id';
import { db } from './schema';
import type { ShopSettings } from './schema';

/** shop_settings holds exactly one row. */
export const SHOP_SETTINGS_ID = 'shop';

const DEFAULTS: Omit<ShopSettings, 'id' | 'updated_at'> = {
  shop_name: '',
  shop_name_am: '',
  phone: '',
  address: '',
  receipt_footer: '',
  receipt_footer_am: '',
  printer_width: 80,
};

/** Idempotent. Session 8's first-run flow fills these in properly. */
export async function ensureSettings(): Promise<ShopSettings> {
  return db.transaction('rw', db.shop_settings, async () => {
    const existing = await db.shop_settings.get(SHOP_SETTINGS_ID);
    if (existing) return existing;

    const settings: ShopSettings = {
      id: SHOP_SETTINGS_ID,
      ...DEFAULTS,
      updated_at: nowIso(),
    };

    await db.shop_settings.put(settings);
    return settings;
  });
}

/**
 * Read-only on purpose: pages call this inside useLiveQuery, and Dexie throws
 * ReadOnlyError on a readwrite transaction there. A missing row (fresh install,
 * or just after a reset wiped the table under an open Settings page) reads as
 * the defaults; nothing is saved until updateSettings() runs.
 */
export async function getSettings(): Promise<ShopSettings> {
  return (
    (await db.shop_settings.get(SHOP_SETTINGS_ID)) ?? {
      id: SHOP_SETTINGS_ID,
      ...DEFAULTS,
      updated_at: '',
    }
  );
}

export async function updateSettings(
  patch: Partial<Omit<ShopSettings, 'id'>>,
): Promise<ShopSettings> {
  await ensureSettings();
  await db.shop_settings.update(SHOP_SETTINGS_ID, { ...patch, updated_at: nowIso() });
  return getSettings();
}
