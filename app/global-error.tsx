'use client';

import { ErrorScreen } from '@/components/ErrorScreen';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import './globals.css';

/**
 * Catches a crash in the root layout itself (a provider, the app shell). It
 * replaces the whole document, so there is no language provider to ask:
 * it shows Amharic first and English under it.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="am">
      <body className="min-h-dvh px-4 antialiased">
        <ErrorScreen error={error} dicts={[am, en]} />
      </body>
    </html>
  );
}
