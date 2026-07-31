'use client';

import { ButtonLink } from '@/components/ui/Button';
import { useT } from '@/lib/i18n';

/**
 * The service worker's navigation fallback. It should never be the sale
 * screen — that one is precached and must always load — so this exists for
 * a route the till has genuinely never visited.
 */
export default function OfflinePage() {
  const t = useT();

  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <h1 className="ethiopic text-2xl font-semibold">{t.offline.title}</h1>
      <p className="ethiopic max-w-prose text-sm text-muted">{t.offline.body}</p>
      <ButtonLink href="/" variant="primary">
        <span className="ethiopic">{t.offline.toSell}</span>
      </ButtonLink>
    </div>
  );
}
