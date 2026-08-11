// server/__tests__/migrationRunnerCoverage.test.js
/**
 * ⚠️ THE PRODUCTION RUNNER AND THE TEST HELPER DISCOVER MIGRATIONS DIFFERENTLY,
 * AND NOTHING PINNED THAT THEY AGREE — found 2026-08-11 while shipping 049.
 *
 * `services/migrationRunner.js` (what production boots with) holds an EXPLICIT
 * `require()` list. `__tests__/helpers/freshMigratedDb.js` (what most tests and
 * every §C36 gate build on) `readdirSync`s the directory. So a migration file
 * that exists on disk but was never added to the list:
 *   · runs in every test, including `migrationsRealTree.test.js`, and
 *   · NEVER RUNS IN PRODUCTION,
 * with the whole suite green. That is precisely how 049 was first written — the
 * flipped real-tree assertion went green while production would have kept
 * serving four unregistered books and an empty terminology panel.
 *
 * A "the fixture tests the code, only the real chain tests the system" failure
 * one level up: here the fixture is MORE complete than the system, so the test
 * passes for a reason that does not hold in production. Register §C51 is the
 * same shape in the other direction.
 *
 * This guard is static on purpose — it reads the runner's SOURCE rather than
 * calling it, because calling it would need a database and would tell us only
 * that the migrations it *does* know about ran.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const RUNNER = path.join(__dirname, '..', 'services', 'migrationRunner.js');

/** Every `require('../migrations/NNN-name')` the runner actually lists. */
function listedInRunner() {
  const src = fs.readFileSync(RUNNER, 'utf-8');
  return [...src.matchAll(/require\(['"]\.\.\/migrations\/([^'"]+)['"]\)/g)].map((m) => m[1]);
}

/** Every migration module on disk, without extension. */
function presentOnDisk() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''));
}

describe('migrationRunner lists every migration that exists', () => {
  it('parses a non-empty list (control: a regex that matched nothing would pass every other test here vacuously)', () => {
    const listed = listedInRunner();
    expect(listed.length).toBeGreaterThan(40);
    // A specific known member, so a regex that accidentally matched some other
    // require() shape cannot satisfy the count alone.
    expect(listed).toContain('003-book-catalogue');
  });

  it('finds migrations on disk (control for the same reason)', () => {
    expect(presentOnDisk().length).toBeGreaterThan(40);
  });

  it('runs every migration present on disk — a file the runner never requires is dead in production', () => {
    const listed = new Set(listedInRunner());
    const missing = presentOnDisk().filter((m) => !listed.has(m));
    expect(missing).toEqual([]);
  });

  it('requires no migration that is absent from disk — a stale entry crashes boot at require time', () => {
    const onDisk = new Set(presentOnDisk());
    const dangling = listedInRunner().filter((m) => !onDisk.has(m));
    expect(dangling).toEqual([]);
  });

  it('lists them in the order their numeric prefixes imply — order is the contract, 047 must run before 049', () => {
    const listed = listedInRunner();
    const numbers = listed.map((m) => Number(m.slice(0, 3)));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });
});
