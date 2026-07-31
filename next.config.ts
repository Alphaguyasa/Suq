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
};

export default withSerwist(nextConfig);
