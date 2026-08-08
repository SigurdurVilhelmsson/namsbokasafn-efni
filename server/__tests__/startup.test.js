/**
 * Server Startup Smoke Test
 *
 * Validates that index.js references route files that exist on disk,
 * that all migrations are present and listed in migrationRunner.js,
 * and that no dead imports remain.
 *
 * NOTE: We verify file existence statically rather than require()-ing routes,
 * because route modules have side effects (DB connections, config validation)
 * that require environment variables not available in unit tests.
 * E2E tests (Playwright) cover actual server boot.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..');

describe('Server startup smoke tests', () => {
  const indexSource = readFileSync(join(serverDir, 'index.js'), 'utf-8');

  describe('route file existence', () => {
    // Extract all require('./routes/...') from index.js
    const routeRequires = [...indexSource.matchAll(/require\('\.\/routes\/([^']+)'\)/g)].map(
      (m) => m[1]
    );

    it('index.js imports at least 14 route files', () => {
      expect(routeRequires.length).toBeGreaterThanOrEqual(14);
    });

    for (const route of routeRequires) {
      it(`routes/${route}.js exists on disk`, () => {
        const filePath = join(serverDir, 'routes', `${route}.js`);
        expect(existsSync(filePath)).toBe(true);
      });
    }
  });

  describe('route files have valid internal requires', () => {
    // Spot-check that route files don't import non-existent services
    const routesDir = join(serverDir, 'routes');
    const routeFiles = readdirSync(routesDir).filter(
      (f) => f.endsWith('.js') && !f.startsWith('.')
    );

    for (const file of routeFiles) {
      it(`routes/${file} does not import non-existent service files`, () => {
        const source = readFileSync(join(routesDir, file), 'utf-8');
        const serviceImports = [...source.matchAll(/require\('\.\.\/services\/([^']+)'\)/g)].map(
          (m) => m[1]
        );

        for (const svc of serviceImports) {
          const svcPath = join(serverDir, 'services', `${svc}.js`);
          // Some requires omit .js and point to a directory or index
          const svcDirPath = join(serverDir, 'services', svc);
          const exists =
            existsSync(svcPath) || existsSync(svcDirPath) || existsSync(`${svcDirPath}/index.js`);
          expect(exists, `routes/${file} imports services/${svc} which does not exist`).toBe(true);
        }
      });
    }
  });

  describe('migration file inventory', () => {
    it('all 47 migration files exist on disk', () => {
      const migrationsDir = join(serverDir, 'migrations');
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.js'))
        .sort();

      // 47 as of migration 047-reconcile-domain-priority (bumped from 46).
      expect(files.length).toBe(47);

      // Verify sequential numbering 001-047
      for (let i = 1; i <= 47; i++) {
        const prefix = String(i).padStart(3, '0');
        const match = files.find((f) => f.startsWith(prefix));
        expect(match).toBeTruthy();
      }
    });

    it('migrationRunner references all 47 migrations', () => {
      const source = readFileSync(join(serverDir, 'services', 'migrationRunner.js'), 'utf-8');

      for (let i = 1; i <= 47; i++) {
        const prefix = String(i).padStart(3, '0');
        expect(source).toContain(`'../migrations/${prefix}-`);
      }
    });
  });

  describe('request-timing middleware is actually mounted (register C23)', () => {
    // A middleware that is written but not mounted is register C22 verbatim:
    // a feature gated on something that never happens, silent for months.
    // index.js cannot be require()d in a unit test (config validation,
    // migrations, DB), so the mount is pinned against its source — the same
    // reason the route-existence checks above are static.

    it('index.js imports createRequestTimer', () => {
      expect(indexSource).toContain("require('./middleware/requestTiming')");
      expect(indexSource).toContain('createRequestTimer');
    });

    it('index.js mounts the timer with app.use', () => {
      expect(indexSource).toMatch(/app\.use\(\s*createRequestTimer\(/);
    });

    it('the timer is mounted before the first API route, or it times nothing', () => {
      // Located by regex, not indexOf: prettier wraps the mount across lines.
      const mountedAt = indexSource.search(/app\.use\(\s*createRequestTimer\(/);
      const firstApiRoute = indexSource.indexOf("app.use('/api/");

      expect(mountedAt).toBeGreaterThan(-1);
      expect(firstApiRoute).toBeGreaterThan(-1);
      expect(mountedAt).toBeLessThan(firstApiRoute);
    });

    it('the old entry-only request log is gone, not merely supplemented', () => {
      // It logged that a request arrived and nothing about how long it took;
      // keeping both would double prod log volume for no extra signal.
      expect(indexSource).not.toContain('log.info({ method: req.method, path: req.path }');
    });

    it('index.js does not repeat the threshold literal', () => {
      // The default lives in the middleware next to the comment explaining
      // why it is what it is. Repeating it here would let the two drift.
      // Asserted as an ABSENCE, because the presence check it replaced could
      // pass while a hardcoded number sat right beside it.
      expect(indexSource).toContain('DEFAULT_SLOW_REQUEST_MS');
      expect(indexSource).not.toMatch(/thresholdMs:\s*\d/);
    });

    it('index.js keeps the SLOW_REQUEST_MS operator override', () => {
      // Asserted against process.env, not the bare name: 'SLOW_REQUEST_MS' is
      // a substring of 'DEFAULT_SLOW_REQUEST_MS', so a toContain on it was
      // vacuous — it could not fail while the line above passed, and dropping
      // the override entirely went undetected.
      expect(indexSource).toMatch(/process\.env\.SLOW_REQUEST_MS/);
    });
  });

  describe('no dead imports in index.js', () => {
    it('does not import from routes/archived/', () => {
      expect(indexSource).not.toContain('routes/archived');
    });

    it('does not reference editorHistory (dropped service)', () => {
      expect(indexSource).not.toContain('editorHistory');
    });
  });

  describe('archived files cleaned up', () => {
    it('server/routes/archived/ does not exist', () => {
      expect(existsSync(join(serverDir, 'routes', 'archived'))).toBe(false);
    });

    it('server/services/archived/ does not exist', () => {
      expect(existsSync(join(serverDir, 'services', 'archived'))).toBe(false);
    });
  });
});
