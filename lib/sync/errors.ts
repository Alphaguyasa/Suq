import { NETWORK } from '@/lib/supabase/errors';

/**
 * Why the last sync failed, for the sync sheet and the owner page.
 *
 * The engine keeps the raw text (it also lands in outbox.last_error), because
 * that is what helps when someone has to debug a till. What the shopkeeper
 * reads is one of these, rendered through am.ts / en.ts; the raw text sits
 * under it in small print.
 *
 * PostgREST and fetch errors only arrive as English strings, so this matches
 * on text — by the stable parts: Postgres codes, PostgREST phrases, and the
 * fixed messages each browser uses for a failed fetch.
 */
export type SyncFailure = 'network' | 'signedOut' | 'permission' | 'server' | 'unknown';

export function classifySyncError(message: string): SyncFailure {
  if (NETWORK.test(message)) return 'network';
  if (/row[- ]level security|permission denied|42501/i.test(message)) return 'permission';
  if (/jwt|not authenticated|unauthori[sz]ed|invalid token|refresh token|\b401\b/i.test(message)) {
    return 'signedOut';
  }
  if (/timeout|timed out|unavailable|bad gateway|upstream|\b50[234]\b/i.test(message)) return 'server';
  return 'unknown';
}
