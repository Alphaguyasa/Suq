import type { SupabaseClient } from '@supabase/supabase-js';
import { createVerificationClient } from './client';
import { AuthFailureError, NETWORK, classifyAuthError } from './errors';

export type OwnerCheck = 'owner' | 'notOwner';

/**
 * Is this email and password the owner of this shop? (ROADMAP item 43)
 *
 * The till's PINs are local and never synced, so if the only owner forgets
 * theirs, nothing on the till can approve a reset or a price change. The shop
 * owner's Supabase account is the one thing the server can vouch for. A saved
 * sync session is not enough: anyone holding the tablet holds it, so the
 * password is typed again and checked online, and the account must be listed
 * as role 'owner' for this till's shop (shop_members, RLS: members read their
 * own shop's roster). A cashier's account, or the owner of another shop, is
 * refused.
 *
 * A throwaway client does the sign-in, so the till's own session is left
 * alone; its one session is closed again on the way out (local scope only:
 * the owner's other devices stay signed in).
 *
 * Throws AuthFailureError for a wrong password, no internet and the like.
 */
export async function verifyShopOwner(
  email: string,
  password: string,
  shopId: string,
  makeClient: () => SupabaseClient = createVerificationClient,
): Promise<OwnerCheck> {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new AuthFailureError(classifyAuthError(error), error.message);

  try {
    const { data: member, error: memberError } = await client
      .from('shop_members')
      .select('role')
      .eq('shop_id', shopId)
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (memberError) {
      const failure = NETWORK.test(memberError.message) ? 'network' : 'unknown';
      throw new AuthFailureError(failure, memberError.message);
    }
    return (member as { role?: unknown } | null)?.role === 'owner' ? 'owner' : 'notOwner';
  } finally {
    // Best effort: the session dies with the page anyway, nothing is saved.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}
