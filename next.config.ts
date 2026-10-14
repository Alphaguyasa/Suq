import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

/**
 * Serwist rather than next-pwa: next-pwa does not properly support Next 15.
 * Disabled in development so the service worker cannot serve a stale bundle
 * while you are editing.
 */
/**
 * The HTML of every static route, precached at install.
 *
 * Without these the service worker only held JS/CSS: the HTML for a page was
 * cached at runtime, and only after a full load made while the worker was
 * already in control. A till installed, set up, and then launched in airplane
 * mode got net::ERR_FAILED — not even the /offline fallback, which was never
 * cached either. Found by e2e/offline-launch.spec.ts.
 *
 * Dynamic routes (/sales/[id], /products/[id]) are not here; see ROADMAP.
 */
const STATIC_ROUTES = [
  '/',
  '/offline',
  '/products',
  '/products/new',
  '/sales',
  '/reports',
  '/settings',
  '/setup',
  '/signin',
  '/owner',
];

/** Changes on every deploy, so precached HTML never outlives its JS chunks. */
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  (spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
    randomUUID());

const withSerwist = withSerwistInit({
  additionalPrecacheEntries: STATIC_ROUTES.map((url) => ({ url, revision })),
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
