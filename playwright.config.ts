import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the PRODUCTION build, because the service
 * worker only exists there (next.config.ts disables Serwist in dev) and the
 * whole point of these tests is the offline path.
 *
 * Supabase is never real here. The build points at a dummy URL and
 * e2e/fake-supabase.ts answers every REST/auth call in memory, so the suite
 * needs no keys and no network — CI included.
 *
 * In CI the workflow has already run `next build` with these same dummy env
 * values, so E2E_SKIP_BUILD=1 just starts the server.
 */
const PORT = 3100;

export const E2E_SUPABASE_URL = 'http://127.0.0.1:54321';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ci-dummy-anon-key',
};

const start = `npm run start -- --port ${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Each test owns a fresh browser context (fresh IndexedDB, fresh service
  // worker), but the server is shared; one worker keeps a slow CI box honest.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? start : `npm run build && ${start}`,
    url: `http://localhost:${PORT}`,
    env,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
