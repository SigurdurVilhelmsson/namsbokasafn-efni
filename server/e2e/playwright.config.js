// @ts-check
const path = require('path');
const { defineConfig } = require('@playwright/test');

const E2E_DB = path.join(__dirname, '..', '..', 'pipeline-output', 'e2e-sessions.db');
const E2E_RESEARCH_DB = require('../lib/researchDbPath').deriveResearchPath(E2E_DB); // spec §5.1: the research file follows sessions.db

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
      `rm -f "${E2E_DB}" "${E2E_DB}-wal" "${E2E_DB}-shm" "${E2E_RESEARCH_DB}" "${E2E_RESEARCH_DB}-wal" "${E2E_RESEARCH_DB}-shm"; ` +
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
  // Two projects, an ordering kept from when the assign gate (G1.13 spec §6.5) refused a chemistry assignment
  // while the editors' suggestion view was off. Since the spec of 2026-11-24 (§6.7) the gate keys on the served
  // layer (server/lib/servedLayer.js) and no longer reads that switch, which suggestion-view.spec.js still
  // turns on in its step (2). assignments.spec.js runs in a second project that starts after every test of the
  // first has finished. A failure anywhere in the first project means the second does not run.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: 'assignments.spec.js' },
    {
      name: 'chromium-after-switch-on',
      use: { browserName: 'chromium' },
      testMatch: 'assignments.spec.js',
      dependencies: ['chromium'],
    },
  ],
});
