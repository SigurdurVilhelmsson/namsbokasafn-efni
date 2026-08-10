// server/__tests__/binInflectionsCli.test.js
// ⚠️ The HYBRID shape every server/__tests__ file uses: `import` for vitest and
// node builtins — **Vitest CANNOT be require()d at all**, it throws — and
// `createRequire` for the server's own CommonJS modules. Matches
// importConcepts.test.js:9-14.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseArgs, selectSql } = require('../scripts/fetch-bin-inflections');

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    expect(parseArgs([]).execute).toBe(false);
  });

  it('accepts --execute', () => {
    expect(parseArgs(['--execute']).execute).toBe(true);
  });

  it('reads --db and --bin-data as the NEXT argument', () => {
    const a = parseArgs(['--db', '/tmp/x.db', '--bin-data', '/tmp/y.csv']);
    expect(a.db).toBe('/tmp/x.db');
    expect(a.binData).toBe('/tmp/y.csv');
  });

  it('parses --limit as a number', () => {
    expect(parseArgs(['--limit', '50']).limit).toBe(50);
  });

  // ⚠️ argparse EXITS on an unknown flag. tools/lib/parseArgs.js silently drops
  // it (CLAUDE.md, durable) — using that helper here would be a regression.
  it('THROWS on an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--output-dir', '/tmp'])).toThrow(/unrecognised/i);
  });

  // The value-swallow bug B0 found in the sibling scripts.
  it('refuses a flag as the value of another flag', () => {
    expect(() => parseArgs(['--db', '--execute'])).toThrow(/expects a value/i);
  });
});

describe('selectSql', () => {
  it('filters to rows lacking inflections by default', () => {
    expect(selectSql({ force: false, limit: 0 })).toContain('t.inflections IS NULL');
  });

  it('drops that filter under --force', () => {
    const sql = selectSql({ force: true, limit: 0 });
    expect(sql).toContain('1=1');
    expect(sql).not.toContain('t.inflections IS NULL');
  });

  // Both filters are unconditional in the Python.
  it('always excludes multi-word and NULL icelandic', () => {
    for (const force of [true, false]) {
      const sql = selectSql({ force, limit: 0 });
      expect(sql).toContain("t.icelandic NOT LIKE '% %'");
      expect(sql).toContain('t.icelandic IS NOT NULL');
    }
  });

  it('adds LIMIT only when limit is non-zero', () => {
    expect(selectSql({ force: false, limit: 0 })).not.toContain('LIMIT');
    expect(selectSql({ force: false, limit: 5 })).toContain('LIMIT 5');
  });

  it('orders by t.id for a deterministic --limit slice', () => {
    expect(selectSql({ force: false, limit: 0 })).toContain('ORDER BY t.id');
  });
});
