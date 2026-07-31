'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { onAuthChange } from '@/lib/supabase/auth';
import { setAuthed, startSyncEngine } from '@/lib/sync/engine';
import { adoptShopFromMembership } from '@/lib/sync/shop';

/**
 * Owns the sync engine's lifecycle. Deliberately renders nothing and blocks
 * nothing: the till is fully usable before this has done anything at all, and
 * stays usable if it never succeeds.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const stopEngine = startSyncEngine();

    const unsubscribe = onAuthChange((user) => {
      setAuthed(user !== null);

      if (user) {
        // Adopt the real shop_id before anything is pushed under the
        // placeholder one, which no RLS policy would accept.
        void adoptShopFromMembership().catch(() => undefined);
      }
    });

    return () => {
      unsubscribe();
      stopEngine();
    };
  }, []);

  return <>{children}</>;
}
