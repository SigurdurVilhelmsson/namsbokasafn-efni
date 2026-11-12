// server/__tests__/suggestionViewReferencesScript.test.js
//
// G1.23 PR1 Task 1: the independent reference script. Plants a two-module layer 2 and checks the
// drop rule, the integrity half and the script's independence from the view's code.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

process.env.SESSIONS_DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'suggestion-refs-')),
  'sessions.db'
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const {
  buildReferences,
  parseDateArg,
  DEFAULT_DATE,
} = require('../scripts/suggestion-view-references');
const { sha256Text } = require('../lib/servedText');

const SCRIPT = path.resolve(__dirname, '../scripts/suggestion-view-references.js');
const BOOK = 'efnafraedi-2e';

const rec = (module, segmentId, n, rulingId, category, find, replace, before, after) => ({
  module,
  segmentId,
  occurrence: 0,
  opId: `ch01/${module}/001.op${n}`,
  rulingId,
  category,
  find,
  replace,
  before,
  after,
  beforeSha256: sha256Text(before),
  afterSha256: sha256Text(after),
});
const jsonl = (rs) => rs.map((r) => JSON.stringify(r)).join('\n') + '\n';

// m90001:para:a holds a term change, an agreement change of the same ruling, then another term
// change of that ruling. All three belong to the dropped group.
const A0 = 'rauður sykur og salt';
const A1 = 'rauður sykur og salt x';
const A2 = 'rauð sykur og salt x';
const A3 = 'rauð sykur og salt y';
const m1 = [
  rec('m90001', 'm90001:para:a', 1, 'r1', 'term', 'salt', 'salt x', A0, A1),
  rec('m90001', 'm90001:para:a', 2, 'r1', 'agreement', 'rauður', 'rauð', A1, A2),
  rec('m90001', 'm90001:para:a', 3, 'r1', 'term', 'x', 'y', A2, A3),
  rec('m90001', 'm90001:para:b', 4, 'r2', 'term', 'aa', 'bb', 'aa cc', 'bb cc'),
];
const m2 = [rec('m90002', 'm90002:para:b', 1, 'r3', 'term', 'p', 'q', 'p r', 'q r')];

const SERVED = {
  m90001: [
    { segmentId: 'm90001:para:a', is: A0 },
    { segmentId: 'm90001:para:b', is: 'aa cc' },
  ],
  m90002: [{ segmentId: 'm90002:para:b', is: 'DIFFERENT served text' }],
};
const plantedLoader = (book, chapter, moduleId) => ({ segments: SERVED[moduleId] });

function plant() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestion-refs-books-'));
  const rev = path.join(root, BOOK, '02-mt-revised');
  fs.mkdirSync(path.join(rev, 'ch00'), { recursive: true }); // empty chapter dir
  fs.mkdirSync(path.join(rev, 'ch01'));
  fs.writeFileSync(path.join(rev, 'ch01', 'm90001-changes.jsonl'), jsonl(m1));
  fs.writeFileSync(path.join(rev, 'ch01', 'm90002-changes.jsonl'), jsonl(m2));
  fs.writeFileSync(path.join(rev, 'ch01', 'chapter-metadata-changes.jsonl'), '');
  return root;
}

describe('buildReferences', () => {
  const out = buildReferences({ booksRoot: plant(), book: BOOK, load: plantedLoader });

  it('drops the agreement change and both changes of its group', () => {
    expect(out.dropped.changes).toBe(3);
    expect(out.droppedChanges.map((d) => d.opId)).toEqual([
      'ch01/m90001/001.op1',
      'ch01/m90001/001.op2',
      'ch01/m90001/001.op3',
    ]);
  });

  it('keeps the sibling groups (positive control)', () => {
    expect(out.kept.changes).toBe(2);
    expect(out.dropped.byCategory).toEqual({ term: 2, agreement: 1 });
    expect(out.dropped.groups).toBe(1);
  });

  it('flags the chain whose served text differs, and only that one', () => {
    expect(out.integrityFailures).toEqual([
      { chapter: 1, module: 'm90002', segmentId: 'm90002:para:b', occurrence: 0 },
    ]);
  });

  it('counts logs, the empty one and chains; the empty chapter dir does not crash', () => {
    expect(out.totals).toEqual({ records: 5, logs: 3, emptyLogs: 1, chains: 3 });
  });

  it('lists no cross-group dependence for independent chains', () => {
    expect(out.crossGroupDependent).toEqual([]);
  });
});

describe('independence', () => {
  it('never names the view code in its source', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    for (const name of ['suggestionLogs', 'suggestionView', 'suggestion-placement']) {
      expect(src).not.toContain(name);
    }
    expect(src).toContain('loadModuleForEditing'); // control: the reader of the source text is found
  });

  it('does not load the view code when required (child process require.cache)', () => {
    const code = `require(${JSON.stringify(SCRIPT)}); console.log(JSON.stringify(Object.keys(require.cache)))`;
    const keys = JSON.parse(
      execFileSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env } })
    );
    for (const name of ['suggestionLogs', 'suggestionView', 'suggestion-placement']) {
      expect(keys.some((k) => k.includes(name))).toBe(false);
    }
    expect(keys.some((k) => k.endsWith('services/segmentParser.js'))).toBe(true); // control
  });
});

describe('--date (G1.12: a re-run after a re-extraction records its own build date)', () => {
  it('defaults to the frozen artifact’s date, so the bare invocation reproduces it', () => {
    expect(DEFAULT_DATE).toBe('2026-11-09');
    expect(parseDateArg(['--out', 'x'])).toBe('2026-11-09');
    expect(buildReferences({ booksRoot: plant(), book: BOOK, load: plantedLoader }).date).toBe(
      '2026-11-09'
    );
  });

  it('records a valid date it is given', () => {
    expect(parseDateArg(['--date', '2026-11-12'])).toBe('2026-11-12');
    expect(
      buildReferences({ booksRoot: plant(), book: BOOK, load: plantedLoader, date: '2026-11-12' })
        .date
    ).toBe('2026-11-12');
  });

  it.each([
    ['a missing value', ['--date']],
    ['another flag in its place', ['--date', '--out', 'x']],
    ['a one-digit day', ['--date', '2026-11-1']],
    ['day first', ['--date', '12-11-2026']],
    ['a day the month does not have', ['--date', '2026-02-30']],
    ['a month that does not exist', ['--date', '2026-13-01']],
  ])('refuses %s', (_label, argv) => {
    expect(() => parseDateArg(argv)).toThrow(/--date must be a calendar date written YYYY-MM-DD/);
  });
});
