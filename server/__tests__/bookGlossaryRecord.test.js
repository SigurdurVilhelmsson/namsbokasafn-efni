// server/__tests__/bookGlossaryRecord.test.js
/**
 * The committed record of the book glossary layer (spec 2026-11-19-book-glossary-layer-design §5.4):
 * books/<book>/glossary/book-glossary.json, written by the glossary export.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  addExclusion,
  addEntry,
  changeEntry,
  removeEntry,
  displayNameFor,
  buildBookGlossaryRecord,
  writeBookGlossaryRecord,
} = require('../lib/bookGlossaryLayer');
const { runGlossaryExport } = require('../scripts/export-terminology');

const BOOK = 'efnafraedi-2e';
let db;
let root;

function addPair(domain, english, icelandic, idordabankiId = null) {
  const id = Number(
    db
      .prepare('INSERT INTO concept (domain, idordabanki_id) VALUES (?, ?)')
      .run(domain, idordabankiId).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,'test')"
  );
  ins.run(id, 'en', english);
  ins.run(id, 'is', icelandic);
  return id;
}
const base = {
  book: BOOK,
  reason: 'because',
  source: 'test',
  by: 'tester',
  at: '2026-11-19T00:00:00.000Z',
};

beforeAll(() => {
  db = freshMigratedDb().db;
});
afterAll(() => db.close());
beforeEach(() => {
  for (const t of [
    'book_glossary_exclusion',
    'book_glossary_entry',
    'book_glossary_change',
    'book_term_preference',
    'concept_term',
    'concept',
    'users',
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  root = mkdtempSync(path.join(tmpdir(), 'c19-record-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function seedBook(slug) {
  const dir = path.join(root, 'books', slug, 'glossary');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runExport(opts) {
  return runGlossaryExport({
    booksDir: path.join(root, 'books'),
    projectRoot: root,
    subjectFn: () => 'chemistry',
    exportFn: () => ({
      generated: 'x',
      book: BOOK,
      stats: {},
      terms: [{ english: 'a', icelandic: 'b', status: 'approved' }],
    }),
    layerChangeIdFn: () => null,
    log: () => {},
    logError: () => {},
    ...opts,
  });
}

describe('buildBookGlossaryRecord / the export', () => {
  it('no layer rows: buildBookGlossaryRecord returns null and the export writes no file', () => {
    expect(buildBookGlossaryRecord(db, BOOK)).toBeNull();
    const dir = seedBook(BOOK);
    runExport({ recordFn: (b) => buildBookGlossaryRecord(db, b) });
    expect(existsSync(path.join(dir, 'book-glossary.json'))).toBe(false);
  });

  it('the record lists exclusions without Icelandic, entries with Icelandic, and the full history', () => {
    const old = addPair('chemistry', 'ATP', 'adenósínþrífosfat', 555);
    addExclusion(db, { ...base, english: 'ATP', conceptId: old });
    addExclusion(db, { ...base, english: 'Function' });
    addEntry(db, {
      ...base,
      english: ['unit cell', 'cell unit'],
      icelandic: 'grindareining',
      replaces: [],
    });
    const rec = buildBookGlossaryRecord(db, BOOK);
    expect(rec.schema).toBe('book-glossary/1');
    expect(rec.book).toBe(BOOK);
    expect(rec.exclusions).toHaveLength(2);
    expect(rec.exclusions.map((e) => e.english).sort()).toEqual(['ATP', 'Function']);
    expect(JSON.stringify(rec.exclusions)).not.toContain('adenósínþrífosfat');
    expect(rec.exclusions.find((e) => e.english === 'ATP')).toMatchObject({
      conceptId: old,
      idordabankiId: 555,
      reason: 'because',
      source: 'test',
      createdBy: 'tester',
    });
    expect(rec.entries).toHaveLength(1);
    expect(rec.entries[0]).toMatchObject({
      english: ['unit cell', 'cell unit'],
      icelandic: 'grindareining',
      domain: 'chemistry',
    });
    expect(rec.history.map((h) => h.action)).toEqual(['exclude', 'exclude', 'entry-add']);
    expect(rec.history[2].after).toMatchObject({ icelandic: 'grindareining' });
    expect(rec.dangling).toEqual([]);
  });

  it('history is cumulative: a second export after a new change carries both changes', () => {
    const dir = seedBook(BOOK);
    addExclusion(db, { ...base, english: 'Function' });
    runExport({ recordFn: (b) => buildBookGlossaryRecord(db, b) });
    addExclusion(db, { ...base, english: 'Other' });
    runExport({ recordFn: (b) => buildBookGlossaryRecord(db, b) });
    const rec = JSON.parse(readFileSync(path.join(dir, 'book-glossary.json'), 'utf8'));
    expect(rec.history.map((h) => h.english)).toEqual(['Function', 'Other']);
  });

  it('unchanged content is not rewritten', () => {
    const dir = seedBook(BOOK);
    addExclusion(db, { ...base, english: 'Function' });
    const file = path.join(dir, 'book-glossary.json');
    expect(writeBookGlossaryRecord(dir, buildBookGlossaryRecord(db, BOOK))).toBe('written');
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(file, old, old);
    const bytes = readFileSync(file, 'utf8');
    const second = { ...buildBookGlossaryRecord(db, BOOK), generated: 'a different time' };
    expect(writeBookGlossaryRecord(dir, second)).toBe('unchanged');
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(statSync(file).mtimeMs).toBe(old.getTime());
  });

  it('writeBookGlossaryRecord does not create a missing glossary directory', () => {
    addExclusion(db, { ...base, english: 'Function' });
    const dir = path.join(root, 'books', BOOK, 'glossary');
    expect(writeBookGlossaryRecord(dir, buildBookGlossaryRecord(db, BOOK))).toBe('no-glossary-dir');
    expect(existsSync(dir)).toBe(false);
  });

  it('a dangling exclusion is listed', () => {
    const id = addPair('chemistry', 'geometry', 'rúmfræði');
    addExclusion(db, { ...base, english: 'geometry', conceptId: id });
    db.exec('DELETE FROM concept_term; DELETE FROM concept');
    const rec = buildBookGlossaryRecord(db, BOOK);
    expect(rec.dangling).toEqual([
      { kind: 'exclusion', english: 'geometry', conceptId: id, reason: 'missing' },
    ]);
  });

  it('a dangling exclusion is listed when its concept has been merged', () => {
    const id = addPair('chemistry', 'geometry', 'rúmfræði');
    const other = addPair('chemistry', 'geometry', 'rúmfræði2');
    addExclusion(db, { ...base, english: 'geometry', conceptId: id });
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(other, id);
    expect(buildBookGlossaryRecord(db, BOOK).dangling).toEqual([
      { kind: 'exclusion', english: 'geometry', conceptId: id, reason: 'merged' },
    ]);
  });

  it('a dangling exclusion is listed when its concept no longer carries the English', () => {
    const id = addPair('chemistry', 'geometry', 'rúmfræði');
    addExclusion(db, { ...base, english: 'geometry', conceptId: id });
    db.prepare("UPDATE concept_term SET text = 'shape' WHERE concept_id = ? AND lang = 'en'").run(
      id
    );
    expect(buildBookGlossaryRecord(db, BOOK).dangling).toEqual([
      { kind: 'exclusion', english: 'geometry', conceptId: id, reason: 'no-english' },
    ]);
  });

  it('a dangling entry is listed when its concept is merged', () => {
    const { conceptId } = addEntry(db, {
      ...base,
      english: ['unit cell'],
      icelandic: 'grindareining',
    });
    const other = addPair('chemistry', 'x', 'y');
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(other, conceptId);
    expect(buildBookGlossaryRecord(db, BOOK).dangling).toEqual([
      { kind: 'entry', english: 'unit cell', conceptId, reason: 'merged' },
    ]);
  });
});

describe('the record is read from one snapshot', () => {
  // Head editors write while the cron exports, from another process: a second connection to the
  // same file, in WAL mode as production, plays that writer.
  it('a commit from another connection between two of its reads does not reach the record', () => {
    const fresh = freshMigratedDb();
    const local = fresh.db;
    local.pragma('journal_mode = WAL');
    const other = new Database(fresh.path, { timeout: 0 }); // never waits: a refused write throws
    try {
      addExclusion(local, { ...base, english: 'Function' });
      const before = buildBookGlossaryRecord(local, BOOK);
      // `local`, with the other connection's exclusion committed just after the builder's first
      // read (the exclusions) has returned, and before its next (the entries, then the history).
      let raced = false;
      const racing = new Proxy(local, {
        get(target, prop) {
          const v = Reflect.get(target, prop);
          if (prop !== 'prepare') return typeof v === 'function' ? v.bind(target) : v;
          return (sql) => {
            const stmt = target.prepare(sql);
            if (raced || !/FROM book_glossary_exclusion/.test(sql)) return stmt;
            return {
              all: (...args) => {
                const rows = stmt.all(...args);
                raced = true;
                addExclusion(other, { ...base, english: 'Raced' });
                return rows;
              },
            };
          };
        },
      });
      const built = buildBookGlossaryRecord(racing, BOOK);
      const after = buildBookGlossaryRecord(local, BOOK);
      const unstamped = (r) => ({ ...r, generated: null });
      expect({
        raced, // control: the write was planted mid-build
        landed: after.history.map((h) => h.english), // control: and it committed
        built: unstamped(built),
      }).toEqual({
        raced: true,
        landed: ['Function', 'Raced'],
        built: unstamped(before),
      });
      // The exporter's connection is read-only, and a read transaction must work on it.
      const readOnly = new Database(fresh.path, { readonly: true });
      try {
        expect(unstamped(buildBookGlossaryRecord(readOnly, BOOK))).toEqual(unstamped(after));
      } finally {
        readOnly.close();
      }
    } finally {
      other.close();
      local.close();
    }
  });
});

describe('runGlossaryExport and the record', () => {
  it('runGlossaryExport writes the record even when glossary-unified.json is refused', () => {
    const dir = seedBook(BOOK);
    // A baseline of 10 approved terms; the export returns 1 -> shrink refusal.
    const many = Array.from({ length: 10 }, (_, i) => ({
      english: `t${i}`,
      icelandic: `i${i}`,
      status: 'approved',
    }));
    writeFileSync(
      path.join(dir, 'glossary-unified.json'),
      JSON.stringify({ generated: 'x', book: BOOK, stats: {}, terms: many })
    );
    const record = {
      schema: 'book-glossary/1',
      book: BOOK,
      generated: 'g',
      exclusions: [],
      entries: [],
      history: [],
      dangling: [],
    };
    const code = runExport({ recordFn: () => record });
    expect(code).toBe(0);
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.books[BOOK].outcome).toMatch(/^refused/);
    expect(existsSync(path.join(dir, 'book-glossary.json'))).toBe(true);
    expect(status.bookGlossaryRecords[BOOK]).toBe('written');
  });

  it('a recordFn that throws is logged and leaves the glossary outcome unchanged', () => {
    const dir = seedBook(BOOK);
    writeFileSync(
      path.join(dir, 'glossary-unified.json'),
      JSON.stringify({ generated: 'x', book: BOOK, stats: {}, terms: [] })
    );
    const errs = [];
    const code = runExport({
      recordFn: () => {
        throw new Error('boom');
      },
      logError: (m) => errs.push(m),
    });
    expect(code).toBe(0);
    expect(errs.join('\n')).toContain('boom');
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.bookGlossaryRecords[BOOK]).toBe('error: boom');
    expect(status.books[BOOK].outcome).not.toBe('error');
    expect(existsSync(path.join(dir, 'glossary-unified.json'))).toBe(true);
  });

  it('a dry run writes no record', () => {
    const dir = seedBook(BOOK);
    let called = 0;
    runExport({ dryRun: true, recordFn: () => (called++, null) });
    expect(called).toBe(0);
    expect(existsSync(path.join(dir, 'book-glossary.json'))).toBe(false);
  });
});

describe('the licence rule on the written file', () => {
  it("book-glossary.json's bytes carry neither an excluded nor a replaced row's Icelandic", () => {
    // ASCII markers, so JSON escapes nothing and a raw byte search is exact.
    const EXCLUDED = 'MARKERc19ExcludedIdordabankiRow';
    const REPLACED = 'MARKERc19ReplacedRow';
    const dir = seedBook(BOOK);
    // An Íðorðabankinn-style row (it carries an idordabanki_id), excluded for one headword.
    const idb = addPair('chemistry', 'ATP', EXCLUDED, 555);
    addExclusion(db, { ...base, english: 'ATP', conceptId: idb });
    // A row a book entry replaces.
    const old = addPair('physics', 'geometry', REPLACED, 777);
    addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun', replaces: [old] });
    // control: the database column the builder reads holds both markers
    const column = db
      .prepare('SELECT icelandic FROM book_glossary_exclusion ORDER BY id')
      .all()
      .map((r) => r.icelandic);
    expect(column).toEqual(expect.arrayContaining([EXCLUDED, REPLACED]));
    runExport({ recordFn: (b) => buildBookGlossaryRecord(db, b) });
    const bytes = readFileSync(path.join(dir, 'book-glossary.json'));
    // control: the file was written and carries the entry's own Icelandic
    expect(bytes.includes('lögun')).toBe(true);
    expect(bytes.includes(EXCLUDED)).toBe(false);
    expect(bytes.includes(REPLACED)).toBe(false);
  });
});

/** A users row; provider_username is NOT NULL UNIQUE, so it is derived from the account id. */
function addUser(providerId, displayName, role, email = null) {
  db.prepare(
    'INSERT INTO users (provider_id, provider_username, display_name, email, role) VALUES (?,?,?,?,?)'
  ).run(providerId, `u-${providerId}`, displayName, email, role);
}
const GUID = '3f2b8c1e-9a4d-4e7b-8c55-1d2e3f4a5b6c';
const historyBys = () => buildBookGlossaryRecord(db, BOOK).history.map((h) => h.by);

describe('the record shows names, never emails or inflections', () => {
  it('an account id is written as its display name', () => {
    addUser(GUID, 'Jóna Jónsdóttir', 'editor');
    addExclusion(db, { ...base, by: GUID, english: 'Function' });
    expect(historyBys()).toEqual(['Jóna Jónsdóttir']);
    expect(buildBookGlossaryRecord(db, BOOK).exclusions[0].createdBy).toBe('Jóna Jónsdóttir');
  });

  it('an email-shaped display_name is written as the role', () => {
    addUser('acct-1', 'nafn@skoli.example', 'head-editor');
    addExclusion(db, { ...base, by: 'acct-1', english: 'Function' });
    expect(historyBys()).toEqual(['aðalritstjóri']);
  });

  it('a blank display_name falls back to the role label, and an unknown role to notandi', () => {
    addUser('acct-2', '   ', 'admin');
    addUser('acct-3', null, 'mystery');
    expect(displayNameFor(db, 'acct-2')).toBe('stjórnandi');
    expect(displayNameFor(db, 'acct-3')).toBe('notandi');
  });

  it('the c19 label and a by with no account pass through', () => {
    const c19 = 'c19-load ([USER] rulings 2026-11-18)';
    expect(displayNameFor(db, c19)).toBe(c19);
    expect(displayNameFor(db, 'tester')).toBe('tester');
  });

  it('a GUID-shaped by with no account is written as óþekktur notandi', () => {
    expect(displayNameFor(db, GUID)).toBe('óþekktur notandi');
    expect(displayNameFor(db, 'someone@skoli.example')).toBe('óþekktur notandi');
  });

  it('no email and no account id anywhere in the record', () => {
    addUser(GUID, 'nafn@skoli.example', 'viewer', 'nafn@skoli.example');
    addExclusion(db, { ...base, by: GUID, english: 'Function' });
    const e = addEntry(db, {
      ...base,
      by: GUID,
      english: ['unit cell'],
      icelandic: 'grindareining',
    });
    // A change by the same account, so the entry's updatedBy goes through the name lookup too.
    changeEntry(db, { ...base, by: GUID, conceptId: e.conceptId, icelandic: 'grindareiningar' });
    addExclusion(db, { ...base, by: 'other@skoli.example', english: 'Other' });
    const rec = buildBookGlossaryRecord(db, BOOK);
    const json = JSON.stringify(rec);
    expect(json).toContain('lesandi'); // control: the account's changes are in the record
    // control: the change wrote updated_by, so updatedBy is a looked-up name and not null
    expect(rec.entries[0].updatedBy).toBe('lesandi');
    expect(json).not.toContain('@');
    // An account id is not an email, so the check above cannot see it; the record is public.
    expect(json).not.toContain(GUID);
  });

  it('no inflection list anywhere in the record', () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    db.prepare("UPDATE concept_term SET inflections = ? WHERE concept_id = ? AND lang = 'is'").run(
      '["zbeyging1"]',
      e.conceptId
    );
    changeEntry(db, { ...base, conceptId: e.conceptId, icelandic: 'zfruma' });
    const f = addEntry(db, { ...base, english: ['zother'], icelandic: 'zannad' });
    db.prepare("UPDATE concept_term SET inflections = ? WHERE concept_id = ? AND lang = 'is'").run(
      '["zbeyging1"]',
      f.conceptId
    );
    removeEntry(db, { ...base, conceptId: f.conceptId });
    // control: the database keeps the list in before_json
    const raw = db.prepare('SELECT before_json FROM book_glossary_change').all();
    expect(raw.filter((r) => r.before_json && r.before_json.includes('zbeyging1'))).toHaveLength(2);
    const json = JSON.stringify(buildBookGlossaryRecord(db, BOOK));
    expect(json).not.toContain('zbeyging1');
    expect(json).not.toContain('"inflections"');
  });

  it('the committed chemistry record is a fixed point of this task', () => {
    const file = path.join(__dirname, '..', '..', 'books', BOOK, 'glossary', 'book-glossary.json');
    const text = readFileSync(file, 'utf8');
    const rec = JSON.parse(text);
    const names = [
      ...rec.history.map((h) => h.by),
      ...rec.exclusions.map((e) => e.createdBy),
      ...rec.entries.map((e) => e.createdBy),
      ...rec.entries.map((e) => e.updatedBy).filter((v) => v !== null),
    ];
    expect(names.length).toBeGreaterThan(0); // control
    for (const v of names) expect(displayNameFor(db, v)).toBe(v);
    expect(text).not.toContain('"inflections"');
  });
});
