import { liveQuery } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDevice } from './reset';
import { db } from './schema';
import { SHOP_SETTINGS_ID, getSettings, updateSettings } from './settings';
import { freshDatabase } from './test-helpers';

beforeEach(async () => {
  await freshDatabase();
});

/** First value a liveQuery emits, or its error: what useLiveQuery would render or throw. */
function firstEmission<T>(querier: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const subscription = liveQuery(querier).subscribe({
      next: (value) => {
        resolve(value);
        queueMicrotask(() => subscription.unsubscribe());
      },
      error: reject,
    });
  });
}

describe('getSettings', () => {
  it('reads the defaults without saving anything when there is no row', async () => {
    await db.shop_settings.clear();
    const settings = await getSettings();
    expect(settings).toMatchObject({ id: SHOP_SETTINGS_ID, shop_name: '', printer_width: 80 });
    expect(await db.shop_settings.count()).toBe(0);
  });

  it('works inside a live query after a reset wiped the row', async () => {
    // Settings, Reports and the receipt view all read settings via
    // useLiveQuery; a reset empties the table under the open page. A write
    // here used to throw ReadOnlyError and crash the page instead of going to setup.
    await updateSettings({ shop_name: 'Test shop' });
    expect((await firstEmission(() => getSettings())).shop_name).toBe('Test shop');

    await resetDevice();
    expect((await firstEmission(() => getSettings())).shop_name).toBe('');
  });

  it('returns what updateSettings saved', async () => {
    await db.shop_settings.clear();
    await updateSettings({ shop_name_am: 'ሱቅ' });
    expect((await getSettings()).shop_name_am).toBe('ሱቅ');
    expect(await db.shop_settings.count()).toBe(1);
  });
});
