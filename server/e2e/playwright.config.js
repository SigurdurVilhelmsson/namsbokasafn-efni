// @ts-check
const path = require('path');
const { defineConfig } = require('@playwright/test');

const E2E_DB = path.join(__dirname, '..', '..', 'pipeline-output', 'e2e-sessions.db');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 30000,
  retries: 0,
  // Writer specs trigger the MT edit-lock first-edit hook against the fixture
  // book AND the real efnafraedi-2e modules they edit. Setup snapshots the
  // markers that already exist; teardown removes only the ones this run added.
  // Both are required: without globalSetup there is no snapshot and teardown
  // conservatively sweeps the fixture book only.
  globalSetup: require.resolve('./global-setup.js'),
  globalTeardown: require.resolve('./global-teardown.js'),
  use: {
    baseURL: 'http://localhost:3456',
    headless: true,
  },
  webServer: {
    // The whole suite runs from 127.0.0.1 within a single 15-minute rate-limit
    // window, so its cumulative request count (160 tests × many API calls each)
    // exceeds the general limiter's production default (500, ×5 for authed) and
    // later requests get 429'd — which surfaced as order-dependent "flakes"
    // (logout's /editor returning 429 instead of redirecting; terminology's
    // 401-check tolerating 429). Raise only the GENERAL ceiling far above any
    // suite total; the auth limiter is left at its real value (no test hits
    // /api/auth/login — auth is via injected cookies). Production keeps all its
    // real limits; this only affects the test server. See RATE_LIMIT_* in
    // server/config.js.
    command:
      `rm -f "${E2E_DB}" "${E2E_DB}-wal" "${E2E_DB}-shm"; ` +
      `SESSIONS_DB_PATH="${E2E_DB}" node seed-fixture.js; ` +
      `SESSIONS_DB_PATH="${E2E_DB}" JWT_SECRET=test-secret-for-e2e-not-production ` +
      `RATE_LIMIT_MAX=10000000 ` +
      `PORT=3456 node ../index.js`,
    port: 3456,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
