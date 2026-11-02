import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthFailureError } from './errors';
import { verifyShopOwner } from './owner-recovery';

const SHOP = 'shop-1';
const USER = 'user-1';

interface FakeOptions {
  signInError?: { code?: string; name?: string; message: string };
  member?: { role: string } | null;
  memberError?: { message: string };
}

/** Just the calls verifyShopOwner makes, recording the filters it used. */
function fakeClient(options: FakeOptions = {}) {
  const filters: Array<[string, string]> = [];
  const signOut = vi.fn(async () => ({ error: null }));
  const signInWithPassword = vi.fn(async () =>
    options.signInError
      ? { data: { user: null, session: null }, error: options.signInError }
      : { data: { user: { id: USER } }, error: null },
  );

  const query = {
    select: () => query,
    eq: (column: string, value: string) => {
      filters.push([column, value]);
      return query;
    },
    maybeSingle: async () =>
      options.memberError
        ? { data: null, error: options.memberError }
        : { data: options.member ?? null, error: null },
  };

  const client = {
    auth: { signInWithPassword, signOut },
    from: vi.fn(() => query),
  } as unknown as SupabaseClient;

  return { client, filters, signOut, signInWithPassword, from: client.from };
}

describe('verifyShopOwner', () => {
  it('says owner for an account listed as owner of this shop, and signs out locally', async () => {
    const fake = fakeClient({ member: { role: 'owner' } });
    await expect(verifyShopOwner(' owner@suq.test ', 'secret', SHOP, () => fake.client)).resolves.toBe('owner');
    expect(fake.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@suq.test', password: 'secret' });
    expect(fake.from).toHaveBeenCalledWith('shop_members');
    expect(fake.filters).toEqual([
      ['shop_id', SHOP],
      ['user_id', USER],
    ]);
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('refuses a cashier account of this shop', async () => {
    const fake = fakeClient({ member: { role: 'cashier' } });
    await expect(verifyShopOwner('c@suq.test', 'secret', SHOP, () => fake.client)).resolves.toBe('notOwner');
  });

  it('refuses an account with no membership in this shop', async () => {
    const fake = fakeClient({ member: null });
    await expect(verifyShopOwner('x@suq.test', 'secret', SHOP, () => fake.client)).resolves.toBe('notOwner');
    expect(fake.signOut).toHaveBeenCalled();
  });

  it('throws a classified failure for a wrong password, without querying', async () => {
    const fake = fakeClient({ signInError: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const error = await verifyShopOwner('o@suq.test', 'nope', SHOP, () => fake.client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthFailureError);
    expect((error as AuthFailureError).failure).toBe('invalidCredentials');
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('throws network when sign-in never reaches the server', async () => {
    const fake = fakeClient({ signInError: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } });
    const error = await verifyShopOwner('o@suq.test', 'pw', SHOP, () => fake.client).catch((e: unknown) => e);
    expect((error as AuthFailureError).failure).toBe('network');
  });

  it('throws when the roster cannot be read, and still signs out', async () => {
    const offline = fakeClient({ memberError: { message: 'TypeError: Failed to fetch' } });
    const e1 = await verifyShopOwner('o@suq.test', 'pw', SHOP, () => offline.client).catch((e: unknown) => e);
    expect((e1 as AuthFailureError).failure).toBe('network');
    expect(offline.signOut).toHaveBeenCalled();

    const broken = fakeClient({ memberError: { message: 'permission denied' } });
    const e2 = await verifyShopOwner('o@suq.test', 'pw', SHOP, () => broken.client).catch((e: unknown) => e);
    expect((e2 as AuthFailureError).failure).toBe('unknown');
  });
});
