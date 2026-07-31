/// <reference lib="webworker" />
// This file runs in a worker, not the DOM, so it pulls in the WebWorker lib
// for itself rather than widening the whole project's globals.
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The whole point: a cold launch in airplane mode has to reach a working sale
 * screen. The precache manifest covers the app shell and the self-hosted
 * fonts, so nothing on the till's critical path needs the network.
 *
 * Data does not live here — it lives in IndexedDB, and the sync engine moves
 * it. This worker caches the application, not the shop's records.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
