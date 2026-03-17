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

    it('index.js imports at least 20 route files', () => {
      expect(routeRequires.length).toBeGreaterThanOrEqual(20);
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
    it('all 26 migration files exist on disk', () => {
      const migrationsDir = join(serverDir, 'migrations');
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.js'))
        .sort();

      expect(files.length).toBe(26);

      // Verify sequential numbering 001-026
      for (let i = 1; i <= 26; i++) {
        const prefix = String(i).padStart(3, '0');
        const match = files.find((f) => f.startsWith(prefix));
        expect(match).toBeTruthy();
      }
    });

    it('migrationRunner references all 26 migrations', () => {
      const source = readFileSync(join(serverDir, 'services', 'migrationRunner.js'), 'utf-8');

      for (let i = 1; i <= 26; i++) {
        const prefix = String(i).padStart(3, '0');
        expect(source).toContain(`'../migrations/${prefix}-`);
      }
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
