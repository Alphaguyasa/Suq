import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { SyncProvider } from '@/components/SyncProvider';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import './globals.css';

/*
 * The three fonts are committed woff2 files (app/fonts, SIL OFL 1.1, licences
 * alongside), not next/font/google: the build must never need the network.
 * On 2026-11-03 a CI build failed because the Google Fonts fetch flaked.
 * Same families, weights, subsets and CSS variables as before. The files end
 * up in /_next/static/media, so the service worker precaches them with the
 * rest of the build and a cold offline launch still gets real Ethiopic glyphs.
 * Source: the Fontsource 5.3.0 packages (Google Fonts builds, split per subset).
 */

/* Grotesque, sturdy, signage-like — holds up at a glance and under glare. */
const archivo = localFont({
  src: [
    { path: './fonts/archivo-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/archivo-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/archivo-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/archivo-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-archivo',
  display: 'swap',
});

/* Non-negotiable. Fallback rendering of Ethiopic is genuinely bad. */
const notoSansEthiopic = localFont({
  src: [
    { path: './fonts/noto-sans-ethiopic-ethiopic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/noto-sans-ethiopic-ethiopic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/noto-sans-ethiopic-ethiopic-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/noto-sans-ethiopic-ethiopic-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-noto-ethiopic',
  display: 'swap',
});

/* Every price, quantity, total and receipt number. */
const ibmPlexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
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
