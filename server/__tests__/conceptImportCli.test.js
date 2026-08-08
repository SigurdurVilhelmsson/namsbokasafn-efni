// server/__tests__/conceptImportCli.test.js
/**
 * The concept import and its verifier now have entry points, and those entry
 * points FAIL LOUD.
 *
 * Register §C36 finding 6: neither script had a `require.main === module` block,
 * so the driver that produced the measured yield in
 * test-results/concept-import-2026-08.md was not in the repo — while that file
 * itself says to re-measure rather than trust its numbers.
 *
 * ⚠️ These parsers deliberately do NOT use tools/lib/parseArgs.js, which drops
 * unknown flags with no warning on stderr. That is how a "safe rehearsal into a
 * scratch directory" becomes a full-strength run with defaults. The
 * unrecognised-flag cases below are the regression guard for exactly that.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { parseImportArgs, main: importMain } = require('../scripts/run-concept-import');
const { parseVerifyArgs } = require('../scripts/verify-concept-import');
const migration045 = require('../migrations/045-concept-model');

describe('parseImportArgs fails loud', () => {
  it('accepts the documented flags', () => {
    expect(parseImportArgs(['--dir', '/tmp/raw', '--db', '/tmp/x.db'])).toEqual({
      dir: '/tmp/raw',
      db: '/tmp/x.db',
      allowZeroYield: false,
      help: false,
      error: null,
    });
  });

  it('REJECTS an unknown flag instead of ignoring it', () => {
    const r = parseImportArgs(['--dir', '/tmp/raw', '--output-dir', '/tmp/scratch']);
    expect(r.error).toMatch(/--output-dir/);
  });

  it('rejects --dir with no value', () => {
    expect(parseImportArgs(['--dir']).error).toMatch(/--dir requires a value/);
  });

  it('rejects an empty --dir', () => {
    expect(parseImportArgs(['--dir', '   ']).error).toMatch(/non-empty/);
  });

  it('rejects the --dir=<path> form, which it does not support', () => {
    expect(parseImportArgs(['--dir=/tmp/raw']).error).toMatch(/--dir=/);
  });

  it('requires --dir', () => {
    expect(parseImportArgs([]).error).toMatch(/--dir is required/);
  });

  it('does not require --dir when asking for help', () => {
    expect(parseImportArgs(['--help'])).toEqual({
      dir: null,
      db: null,
      allowZeroYield: false,
      help: true,
      error: null,
    });
  });

  it('accepts --allow-zero-yield', () => {
    expect(parseImportArgs(['--dir', '/tmp/raw', '--allow-zero-yield']).allowZeroYield).toBe(true);
  });
});

describe('parseVerifyArgs fails loud', () => {
  it('defaults db to null so the caller resolves it', () => {
    expect(parseVerifyArgs([])).toEqual({ db: null, help: false, error: null });
  });

  it('REJECTS an unknown flag', () => {
    expect(parseVerifyArgs(['--verbose']).error).toMatch(/--verbose/);
  });

  it('rejects --db with no value', () => {
    expect(parseVerifyArgs(['--db']).error).toMatch(/--db requires a value/);
  });
});

function rawDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'concept-raw-'));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(body));
  }
  return dir;
}

function tmpDb() {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'concept-db-')), 'x.db');
  const db = new Database(p);
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
  db.close();
  return p;
}

describe('a zero-yield collection is REFUSED, not merely printed', () => {
  const good = {
    collection: 'EFNAFR',
    entries: [
      {
        id: 1,
        words: [
          { fklanguage: 'EN', word: 'atom' },
          { fklanguage: 'IS', word: 'frumeind' },
        ],
      },
    ],
  };
  const empty = { collection: 'GEIMVISINDI', entries: [] };

  it('exits 0 when every collection yields', () => {
    expect(importMain(['--dir', rawDir({ 'raw-EFNAFR.json': good }), '--db', tmpDb()])).toBe(0);
  });

  it('exits 1 when one collection yields nothing', () => {
    expect(
      importMain([
        '--dir',
        rawDir({ 'raw-EFNAFR.json': good, 'raw-GEIMVISINDI.json': empty }),
        '--db',
        tmpDb(),
      ])
    ).toBe(1);
  });

  it('exits 0 when the zero yield is accepted deliberately', () => {
    expect(
      importMain([
        '--dir',
        rawDir({ 'raw-EFNAFR.json': good, 'raw-GEIMVISINDI.json': empty }),
        '--db',
        tmpDb(),
        '--allow-zero-yield',
      ])
    ).toBe(0);
  });

  it('exits 2 — not 1 — on a usage error, so a typo is distinguishable from a refusal', () => {
    expect(importMain(['--nonsense'])).toBe(2);
  });
});
