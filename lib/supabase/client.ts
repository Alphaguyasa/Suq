import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser client. Anon/publishable key ONLY.
 *
 * The service-role key bypasses every RLS policy written in
 * supabase/migrations, so it must never reach anything that ships. The guard
 * below is belt and braces on top of the pre-commit hook from session 0:
 * if a service-role key is ever pasted into the public env var, the app
 * refuses to start rather than quietly shipping it.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;

  try {
    const base64 = (segments[1] as string).replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('binary');

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Exported for testing. A service-role JWT carries "role":"service_role". */
export function isServiceRoleKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;

  const payload = decodeJwtPayload(key);
  return payload?.role === 'service_role';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/**
 * Lazy, so a build without env vars still succeeds and the offline-only paths
 * keep working. Sync (session 6) is the only caller.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  if (isServiceRoleKey(SUPABASE_ANON_KEY)) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY holds a service-role key. That key bypasses every RLS ' +
        'policy and must never ship to a browser. Use the anon or publishable key.',
    );
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    // The till is offline most of the time; realtime would just churn.
    realtime: { params: { eventsPerSecond: 1 } },
  });

  return client;
}
