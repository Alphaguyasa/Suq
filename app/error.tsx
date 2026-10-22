'use client';

import { ErrorScreen } from '@/components/ErrorScreen';
import { useT } from '@/lib/i18n';

/**
 * Catches a crash in any page. It renders inside the root layout, so the
 * language provider, the sync pill and the bottom nav are still there.
 */
export default function PageError({ error }: { error: Error & { digest?: string } }) {
  const t = useT();
  return <ErrorScreen error={error} dicts={[t]} />;
}
