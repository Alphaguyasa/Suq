import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllTables, db, getDevice, setLastPullAt } from '@/lib/db';
import { TEST_SHOP, freshDatabase, seedProduct } from '@/lib/db/test-helpers';
import { adoptShopFromMembership } from './shop';

/*
 * The membership lookup is the only network call here, so supabase-js is
 * replaced by the one chain it uses: from().select().limit().maybeSingle().
 * Everything after it runs against the real (fake-indexeddb) Dexie.
 */
const membership = vi.hoisted(() => ({
  result: { data: null as { shop_id: string } | null, error: null as { message: string } | null },
  table: '' as string,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    from(table: string) {
      membership.table = table;
      const chain = {
        select: () => chain,
        limit: () => chain,
        maybeSingle: async () => membership.result,
      };
      return chain;
    },
  }),
}));

const REAL_SHOP = 'shop-real';

beforeEach(async () => {
  membership.result = { data: null, error: null };
  membership.table = '';
  await clearAllTables();
});

describe('adoptShopFromMembership', () => {
  it('reads shop_members', async () => {
    await adoptShopFromMembership();
    expect(membership.table).toBe('shop_members');
  });

  it('throws the server message and changes nothing on an error', async () => {
    await freshDatabase();
    membership.result = { data: null, error: { message: 'JWT expired' } };

    await expect(adoptShopFromMembership()).rejects.toThrow('JWT expired');
    expect((await getDevice()).shop_id).toBe(TEST_SHOP);
  });

  it('reports no membership and leaves the device alone', async () => {
    await freshDatabase();

    await expect(adoptShopFromMembership()).resolves.toEqual({
      outcome: 'no-membership',
      shopId: null,
    });
    expect((await getDevice()).shop_id).toBe(TEST_SHOP);
  });

  it('registers the device first on a cold start, then adopts the shop', async () => {
    // A saved session on launch: this runs before AppShell registered the till.
    expect(await db.device_meta.count()).toBe(0);
    membership.result = { data: { shop_id: REAL_SHOP }, error: null };

    await expect(adoptShopFromMembership()).resolves.toEqual({
      outcome: 'adopted',
      shopId: REAL_SHOP,
    });
    expect((await getDevice()).shop_id).toBe(REAL_SHOP);
  });

  it('re-stamps rows written under the placeholder shop', async () => {
    await freshDatabase();
    const product = await seedProduct();
    membership.result = { data: { shop_id: REAL_SHOP }, error: null };

    await expect(adoptShopFromMembership()).resolves.toMatchObject({ outcome: 'adopted' });
    expect((await db.products.get(product.id))?.shop_id).toBe(REAL_SHOP);
    const queued = await db.outbox.toArray();
    expect(queued.length).toBeGreaterThan(0);
    for (const entry of queued) {
      expect((entry.payload as { shop_id: string }).shop_id).toBe(REAL_SHOP);
    }
  });

  it('is unchanged when the device already has that shop', async () => {
    await freshDatabase();
    membership.result = { data: { shop_id: TEST_SHOP }, error: null };

    await expect(adoptShopFromMembership()).resolves.toEqual({
      outcome: 'unchanged',
      shopId: TEST_SHOP,
    });
  });

  it('refuses to switch shops once the device has pulled', async () => {
    await freshDatabase();
    const product = await seedProduct();
    await setLastPullAt('2026-10-28T08:00:00.000Z');
    membership.result = { data: { shop_id: REAL_SHOP }, error: null };

    await expect(adoptShopFromMembership()).resolves.toEqual({
      outcome: 'refused',
      shopId: REAL_SHOP,
    });
    expect((await getDevice()).shop_id).toBe(TEST_SHOP);
    expect((await db.products.get(product.id))?.shop_id).toBe(TEST_SHOP);
  });
});
