import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono, Noto_Sans_Ethiopic } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { SyncProvider } from '@/components/SyncProvider';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import './globals.css';

/* Grotesque, sturdy, signage-like — holds up at a glance and under glare. */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
  display: 'swap',
});

/* Non-negotiable. Fallback rendering of Ethiopic is genuinely bad. */
const notoSansEthiopic = Noto_Sans_Ethiopic({
  subsets: ['ethiopic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-ethiopic',
  display: 'swap',
});

/* Every price, quantity, total and receipt number. */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${am.app.name} · Suq`,
  description: am.app.tagline,
  applicationName: 'Suq',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FBFAF7',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="am"
      className={`${archivo.variable} ${notoSansEthiopic.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <I18nProvider>
          <SyncProvider>
            <AppShell>{children}</AppShell>
          </SyncProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
