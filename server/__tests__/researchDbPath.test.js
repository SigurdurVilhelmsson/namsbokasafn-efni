import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..');
const ORIG = process.env.SESSIONS_DB_PATH;
afterEach(() => {
  if (ORIG === undefined) delete process.env.SESSIONS_DB_PATH;
  else process.env.SESSIONS_DB_PATH = ORIG;
});

describe('deriveResearchPath (spec §5.1; T10, path half)', () => {
  const { deriveResearchPath } = require('../lib/researchDbPath');
  it('maps every shape the suite and production use', () => {
    const cases = [
      ['/x/pipeline-output/sessions.db', '/x/pipeline-output/research.db'],
      ['/x/pipeline-output/e2e-sessions.db', '/x/pipeline-output/e2e-research.db'],
      ['/tmp/acc-test-1.db', '/tmp/acc-test-1.research.db'], // spec T10's example
      ['/tmp/acc-test-4242.db', '/tmp/acc-test-4242.research.db'],
      ['/tmp/acc-apply-4242.db', '/tmp/acc-apply-4242.research.db'],
      ['/w/authz-test.db', '/w/authz-test.research.db'],
      ['/w/sessions/acc.db', '/w/sessions/acc.research.db'], // a directory named sessions is untouched
      ['/w/noext', '/w/noext.research'],
    ];
    expect(cases.map(([p]) => deriveResearchPath(p))).toEqual(cases.map(([, r]) => r));
  });
  it('never returns its input (so a research file cannot be the editorial one)', () => {
    for (const p of ['/a/sessions.db', '/a/b.db', '/a/research.db', '/a/x']) {
      expect(deriveResearchPath(p)).not.toBe(p);
    }
  });
  it('the real suites still use the names above (re-point this test if one is renamed)', () => {
    const uses = [
      ['__tests__/acceptanceService.test.js', 'acc-test-${process.pid}.db'],
      ['__tests__/acceptanceApply.test.js', 'acc-apply-${process.pid}.db'],
      ['__tests__/crossBookAuthz.test.js', "'authz-test.db'"],
      ['e2e/playwright.config.js', "'e2e-sessions.db'"],
    ];
    expect(
      uses.filter(([f, s]) => !fs.readFileSync(path.join(SERVER, f), 'utf8').includes(s))
    ).toEqual([]);
  });
});

describe('resolveResearchDbPath', () => {
  it('follows SESSIONS_DB_PATH at call time, with no second variable', () => {
    const { resolveResearchDbPath } = require('../lib/researchDbPath');
    process.env.SESSIONS_DB_PATH = '/tmp/acc-test-7.db';
    expect(resolveResearchDbPath()).toEqual({
      researchPath: '/tmp/acc-test-7.research.db',
      editorialPath: '/tmp/acc-test-7.db',
    });
    delete process.env.SESSIONS_DB_PATH;
    const { researchPath } = resolveResearchDbPath();
    expect(researchPath.endsWith(path.join('pipeline-output', 'research.db'))).toBe(true);
    expect(path.isAbsolute(researchPath)).toBe(true); // __dirname-based, never process.cwd()
  });
});
