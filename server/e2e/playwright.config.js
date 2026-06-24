// @ts-check
const path = require('path');
const { defineConfig } = require('@playwright/test');

const E2E_DB = path.join(__dirname, '..', '..', 'pipeline-output', 'e2e-sessions.db');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3456',
    headless: true,
  },
  webServer: {
    command:
      `rm -f "${E2E_DB}" "${E2E_DB}-wal" "${E2E_DB}-shm"; ` +
      `SESSIONS_DB_PATH="${E2E_DB}" node seed-fixture.js; ` +
      `SESSIONS_DB_PATH="${E2E_DB}" JWT_SECRET=test-secret-for-e2e-not-production PORT=3456 node ../index.js`,
    port: 3456,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
