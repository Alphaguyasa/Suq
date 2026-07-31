import type { MetadataRoute } from 'next';
import { am } from '@/lib/i18n/am';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${am.app.name} · Suq POS`,
    short_name: am.app.name,
    description: am.app.tagline,
    start_url: '/',
    // No browser chrome: on the counter this should not look like a web page.
    display: 'standalone',
    orientation: 'any',
    background_color: '#FBFAF7',
    theme_color: '#FBFAF7',
    lang: 'am',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
