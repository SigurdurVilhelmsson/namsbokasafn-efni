// server/__tests__/indexBodyHardening.test.js
//
// §C200 wiring in index.js, checked on the source because index.js starts the
// server when it is required (see startup.test.js for the same constraint).
// refuseCompressedBodies.test.js covers the behaviour; this covers that
// index.js still uses it, in the right place, and that pipeline-output/ is not
// served: the old `/downloads` mount handed sessions.db, its backups and the
// cron logs to any signed-in user, and nothing in the app linked to it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(__dirname, '..', 'index.js'), 'utf-8');

describe('index.js request-body hardening (§C200)', () => {
  it('mounts refuseCompressedBodies before both body parsers', () => {
    const guard = indexSource.indexOf('app.use(refuseCompressedBodies)');
    const json = indexSource.indexOf('app.use(express.json(');
    const form = indexSource.indexOf('app.use(express.urlencoded(');
    expect(guard).toBeGreaterThan(-1);
    expect(json).toBeGreaterThan(guard);
    expect(form).toBeGreaterThan(guard);
  });

  it('tells both body parsers not to inflate', () => {
    const parsers = [...indexSource.matchAll(/app\.use\(express\.(json|urlencoded)\(([^)]*)\)\)/g)];
    expect(parsers.map((m) => m[1]).sort()).toEqual(['json', 'urlencoded']);
    for (const [, kind, options] of parsers) {
      expect(options, kind).toMatch(/\binflate:\s*false\b/);
    }
  });
});

describe('index.js static mounts', () => {
  const staticArgs = [...indexSource.matchAll(/express\.static\(([^)]*)\)/g)].map((m) =>
    m[1].trim()
  );

  it('control: the detector finds the public/ mount', () => {
    expect(staticArgs).toContain('publicPath');
  });

  it('serves nothing statically but public/ (no /downloads over pipeline-output/)', () => {
    expect(staticArgs).toEqual(['publicPath']);
    expect(indexSource).not.toMatch(/['"`]\/downloads['"`]/);
  });
});
