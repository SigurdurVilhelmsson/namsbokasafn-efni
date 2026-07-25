/**
 * CI must run the Node major that `.nvmrc` declares.
 *
 * WHY THIS EXISTS (C2-R2): every workflow pinned `node-version: '20'` while
 * `.nvmrc`, this dev box and production had all moved to 22 on 2026-05-10.
 * Node 20 reached end-of-life on 2026-04-30, so for months every green check
 * was evidence about a runtime nobody deploys — and nothing complained,
 * because a version pin has no test and `engines: ">=20.0.0"` still allowed it.
 *
 * The drift also stopped being cosmetic: `better-sqlite3@13` declares
 * `engines: {node: ">=22"}`, so the Node-20 pin blocked a routine dependency
 * major.
 *
 * `.nvmrc` is the single source of truth. Bump it, and this test tells you
 * every workflow that has to follow.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const WORKFLOW_DIR = path.join(REPO_ROOT, '.github', 'workflows');

/** The major declared by `.nvmrc` (e.g. "22\n" → "22", "22.11.0" → "22"). */
function nvmrcMajor() {
  const raw = fs.readFileSync(path.join(REPO_ROOT, '.nvmrc'), 'utf8').trim();
  return raw.replace(/^v/, '').split('.')[0];
}

/**
 * Every `node-version:` pin in the workflows, with enough context to name the
 * offender in a failure message. A workflow can pin more than once (separate
 * jobs), so this is a flat list of occurrences, not a per-file map.
 */
function nodeVersionPins() {
  const pins = [];
  for (const file of fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const lines = fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^\s*node-version:\s*['"]?([^'"#\s]+)/);
      if (m) pins.push({ file, line: i + 1, value: m[1] });
    });
  }
  return pins;
}

describe('CI Node version tracks .nvmrc', () => {
  it('finds .nvmrc and at least one workflow pin (guard against a vacuous pass)', () => {
    // Without this, a renamed workflow dir or a changed pin syntax would make
    // every assertion below iterate an empty list and pass by doing nothing.
    expect(nvmrcMajor()).toMatch(/^\d+$/);
    expect(nodeVersionPins().length).toBeGreaterThanOrEqual(5);
  });

  it('pins the same Node major everywhere', () => {
    const want = nvmrcMajor();
    const wrong = nodeVersionPins()
      .filter((p) => p.value.replace(/^v/, '').split('.')[0] !== want)
      .map((p) => `${p.file}:${p.line} pins '${p.value}', .nvmrc says '${want}'`);

    expect(wrong).toEqual([]);
  });

  it('declares an engines floor no lower than .nvmrc, in both trees', () => {
    // `engines` is what tells a contributor — and npm — the real floor. A floor
    // below .nvmrc silently blesses a runtime CI no longer exercises.
    const want = Number(nvmrcMajor());
    for (const manifest of ['package.json', 'server/package.json']) {
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, manifest), 'utf8'));
      const floor = Number((pkg.engines?.node || '').match(/(\d+)/)?.[1]);
      expect(floor, `${manifest} engines.node = ${pkg.engines?.node}`).toBeGreaterThanOrEqual(want);
    }
  });
});
