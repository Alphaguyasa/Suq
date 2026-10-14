import { adoptShopId, ensureDevice } from '@/lib/db';
import { getSupabase } from '@/lib/supabase/client';

export type AdoptOutcome = 'adopted' | 'unchanged' | 'refused' | 'no-membership';

/**
 * Take the real shop_id from the signed-in user's membership.
 *
 * ensureDevice() invents a placeholder shop_id so the till works before anyone
 * signs in. That placeholder matches no RLS policy, so every push would be
 * rejected until this runs.
 */
export async function adoptShopFromMembership(): Promise<{
  outcome: AdoptOutcome;
  shopId: string | null;
}> {
  const { data, error } = await getSupabase()
    .from('shop_members')
    .select('shop_id')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { outcome: 'no-membership', shopId: null };

  /*
   * On a cold start with a saved session — every launch after the first
   * sign-in, and every launch after a device reset, since the session lives in
   * localStorage and survives it — this runs before AppShell has registered the
   * device. adoptShopId() would then throw 'not registered', the caller would
   * swallow it, and the till would push under the placeholder shop_id forever:
   * every row rejected by RLS, the pill stuck. Registering here first closes the
   * race; ensureDevice() is idempotent.
   */
  await ensureDevice();

  const shopId = (data as { shop_id: string }).shop_id;
  return { outcome: await adoptShopId(shopId), shopId };
}
