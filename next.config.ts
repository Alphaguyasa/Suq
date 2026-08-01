import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

/**
 * Serwist rather than next-pwa: next-pwa does not properly support Next 15.
 * Disabled in development so the service worker cannot serve a stale bundle
 * while you are editing.
 */
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * `app/dev/*` are build harnesses: one loads sample data into IndexedDB, one
   * eyeballs the sync pill in all four states. Neither should reach a shop.
   *
   * Gating on `page.dev.tsx` rather than a runtime check means the routes are
   * not built, not bundled, and not reachable in production — a redirect would
   * still ship the demo catalogue to every tablet. `next build` always runs
   * with NODE_ENV=production, `next dev` with development, so this splits
   * exactly along dev/prod.
   *
   * Keep 'ts' in the list: app/manifest.ts is a route convention too.
   */
  pageExtensions:
    process.env.NODE_ENV === 'development' ? ['tsx', 'ts', 'dev.tsx'] : ['tsx', 'ts'],
};

export default withSerwist(nextConfig);
