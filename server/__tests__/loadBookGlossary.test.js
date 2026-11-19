// server/__tests__/loadBookGlossary.test.js
/**
 * The c19 book-glossary loader (spec 2026-11-19-book-glossary-layer-design §5.5 steps 2-4).
 * Fixtures: one fresh migrated DB, real domain chains (as bookGlossaryResolve.test.js).
 * Every "writes nothing" or "absent" assertion has a control that the same fixture does
 * write / contain the thing when the guard is lifted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { main } = require('../scripts/load-book-glossary');
const { buildResolvedGlossary } = require('../lib/resolvedGlossary');
const { HOUSE_STYLE_SOURCE } = require('../lib/houseStyleTerms');

const CHEM = 'efnafraedi-2e';
let fixture;
let db;
let tmp;

const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const layerRows = () =>
  count('book_glossary_exclusion') + count('book_glossary_entry') + count('book_glossary_change');

function concept(domain, en, is, collection = null) {
  const id = Number(
    db.prepare('INSERT INTO concept (domain, collection) VALUES (?, ?)').run(domain, collection)
      .lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, ?, ?, ?, 'test')"
  );
  for (const e of [].concat(en)) ins.run(id, 'en', e, 1);
  [].concat(is).forEach((t, i) => ins.run(id, 'is', t, i + 1));
  return id;
}

const base = { choice: 'remove', flagKind: 'x', ruledAt: '2026-11-18T00:00:00.000Z' };
/** Actions by kind, as the join writes the input's `counts`. */
function tally(actions) {
  const t = {};
  for (const a of actions) t[a.kind] = (t[a.kind] || 0) + 1;
  return t;
}
function input(actions, extra = {}) {
  return {
    schema: 'c19-book-layer-input/1',
    book: CHEM,
    counts: tally(actions),
    actions,
    ...extra,
  };
}
function writeInput(obj) {
  const file = path.join(tmp, `in-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}
function run(argv, deps = {}) {
  const out = [];
  const err = [];
  const io = { log: (s = '') => out.push(String(s)), error: (s = '') => err.push(String(s)) };
  const code = main(argv, io, { db, booksDir: path.join(tmp, 'books'), ...deps });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** Standard fixture: a chemistry row to exclude, a physics row to replace, a phrase. */
let ids;
function seed() {
  ids = {
    chemSub: concept('chemistry', 'substitution', 'skiptihvarf'),
    physGeo: concept('physics', 'geometry', 'rúmfræði'),
    physFn: concept('physics', 'function', 'fall'),
  };
  return input([
    {
      ...base,
      kind: 'exclude-headword',
      rulingId: 'r001',
      english: 'function',
      comment: 'c1',
    },
    {
      ...base,
      kind: 'exclude-concept',
      rulingId: 'r002',
      english: 'substitution',
      conceptId: ids.chemSub,
      icelandicAtCensus: 'skiptihvarf',
      comment: 'c2',
    },
    {
      ...base,
      choice: 'replace',
      kind: 'entry',
      rulingId: 'r003',
      english: 'geometry',
      conceptId: ids.physGeo,
      icelandicAtCensus: 'rúmfræði',
      comment: 'c3',
      entry: { english: ['geometry'], icelandic: 'lögun', replaces: [ids.physGeo] },
    },
    {
      ...base,
      kind: 'entry',
      rulingId: 'C234-8',
      english: 'standard cell potential',
      comment: 'c4',
      entry: {
        english: ['standard cell potential', 'standard cell potentials'],
        icelandic: 'staðalíspenna',
        replaces: [],
      },
    },
  ]);
}

beforeAll(() => {
  fixture = freshMigratedDb();
  db = fixture.db;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'load-book-glossary-'));
});
afterAll(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  for (const t of [
    'book_glossary_change',
    'book_glossary_exclusion',
    'book_glossary_entry',
    'book_term_preference',
    'concept_term',
    'concept',
  ])
    db.exec(`DELETE FROM ${t}`);
});

describe('load-book-glossary', () => {
  it('dry run writes nothing to the real DB', () => {
    const file = writeInput(seed());
    const conceptsBefore = count('concept');
    const sha = () =>
      crypto.createHash('sha256').update(fs.readFileSync(fixture.path)).digest('hex');
    db.pragma('wal_checkpoint(TRUNCATE)');
    const shaBefore = sha();
    const r = run(['--book', CHEM, '--input', file]);
    expect(r.code).toBe(0);
    expect(layerRows()).toBe(0);
    expect(count('concept')).toBe(conceptsBefore);
    expect(sha()).toBe(shaBefore);
    for (const id of ['r001', 'r002', 'r003', 'C234-8']) expect(r.out).toContain(id);
    expect(r.out).toMatch(/added: 4/);
    // control: the same input really writes when applied
    expect(run(['--book', CHEM, '--input', file, '--apply']).code).toBe(0);
    expect(layerRows()).toBeGreaterThan(0);
  });

  it('dry run shows chemistry before → after and the physics book unchanged', () => {
    const file = writeInput(seed());
    const r = run(['--book', CHEM, '--input', file]);
    const row = (id) => r.out.split('\n').find((l) => l.startsWith(id));
    expect(row('r003')).toContain('rúmfræði → lögun');
    expect(row('r001')).toMatch(/fall → —/);
    expect(row('r003')).toMatch(/physics: rúmfræði = rúmfræði/);
    expect(row('r001')).toMatch(/physics: fall = fall/);
  });

  it('refuses all on a drifted Icelandic', () => {
    const inp = seed();
    inp.actions[1].icelandicAtCensus = 'something-else';
    const r = run(['--book', CHEM, '--input', writeInput(inp)]);
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain('r002');
    expect(layerRows()).toBe(0);
    // control: without the drift the same input is accepted
    inp.actions[1].icelandicAtCensus = 'skiptihvarf';
    expect(run(['--book', CHEM, '--input', writeInput(inp)]).code).toBe(0);
  });

  it('refuses all on a house-style headword being excluded', () => {
    const inp = seed();
    concept('chemistry', 'function', 'virkni', HOUSE_STYLE_SOURCE);
    const r = run(['--book', CHEM, '--input', writeInput(inp), '--apply']);
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain('r001');
    expect(layerRows()).toBe(0);
    // control: an ordinary concept with the same headword does not refuse
    db.exec('DELETE FROM concept_term; DELETE FROM concept');
    expect(run(['--book', CHEM, '--input', writeInput(seed())]).code).toBe(0);
  });

  it('--apply writes every action; a second --apply reports already for all and adds no history row', () => {
    const file = writeInput(seed());
    const first = run(['--book', CHEM, '--input', file, '--apply']);
    expect(first.code).toBe(0);
    expect(first.out).toMatch(/added: 4/);
    const hist = count('book_glossary_change');
    expect(hist).toBeGreaterThan(0);
    const by = db.prepare('SELECT DISTINCT by, source FROM book_glossary_change').all();
    expect([...new Set(by.map((x) => x.by))]).toEqual(['c19-load ([USER] rulings 2026-11-18)']);
    expect(by.map((x) => x.source).sort()).toEqual(['c19 pre-screen', '§C234']);
    const second = run(['--book', CHEM, '--input', file, '--apply']);
    expect(second.code).toBe(0);
    expect(second.out).toMatch(/added: 0/);
    expect(second.out).toMatch(/already: 4/);
    expect(count('book_glossary_change')).toBe(hist);
  });

  it('--verify passes after an export of the applied layer and fails when an excluded headword is present', () => {
    const file = writeInput(seed());
    run(['--book', CHEM, '--input', file, '--apply']);
    const exp = buildResolvedGlossary(db, CHEM, {
      census: {
        strings: ['function', 'substitution', 'geometry', 'standard cell potential'],
        filesRead: 1,
        root: 'test',
      },
    });
    const dir = path.join(tmp, 'books', CHEM, 'glossary');
    fs.mkdirSync(dir, { recursive: true });
    const gf = path.join(dir, 'glossary-unified.json');
    fs.writeFileSync(gf, JSON.stringify(exp));
    const ok = run(['--book', CHEM, '--input', file, '--verify']);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('standard cell potential');
    // control: a payload that still carries the excluded headword fails
    exp.terms.push({ english: 'function', icelandic: 'fall', status: 'approved' });
    fs.writeFileSync(gf, JSON.stringify(exp));
    const bad = run(['--book', CHEM, '--input', file, '--verify']);
    expect(bad.code).toBe(1);
    expect(bad.out + bad.err).toContain('function');
  });
});

describe('fix round 1', () => {
  it('dry run works on a WAL database with an uncheckpointed row, and leaves file and -wal untouched', () => {
    const wal = freshMigratedDb();
    const saved = db;
    db = wal.db;
    try {
      db.pragma('journal_mode = WAL');
      const file = writeInput(seed()); // concepts are written now and NOT checkpointed
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      const walFile = `${wal.path}-wal`;
      expect(fs.statSync(walFile).size).toBeGreaterThan(0); // control: rows live only in the WAL
      const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
      const before = [sha(wal.path), sha(walFile)];
      const r = run(['--book', CHEM, '--input', file]);
      expect(r.code).toBe(0);
      expect(r.out).toContain('r003');
      expect(r.out).toContain('rúmfræði → lögun'); // the copy saw the uncheckpointed rows
      expect([sha(wal.path), sha(walFile)]).toEqual(before);
      expect(layerRows()).toBe(0);
    } finally {
      db = saved;
      wal.db.close();
    }
  });

  it('verify fails when the layer is empty', () => {
    const file = writeInput(seed());
    const exp = {
      terms: [{ english: 'function', icelandic: 'fall', status: 'approved' }],
    };
    const dir = path.join(tmp, 'books', CHEM, 'glossary');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'glossary-unified.json'), JSON.stringify(exp));
    const r = run(['--book', CHEM, '--input', file, '--verify']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('r001');
    expect(r.out).not.toContain('PASS');
  });

  it('verify requires --input', () => {
    const r = run(['--book', CHEM, '--verify']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--input is required');
  });

  it('verify on an unmigrated database is a named FAIL', () => {
    const bare = new (require('better-sqlite3'))(':memory:');
    const r = run(['--book', CHEM, '--input', writeInput(seed()), '--verify'], { db: bare });
    bare.close();
    expect(r.code).toBe(1);
    expect(r.err).toContain('migrate it first');
  });

  it('the dry run refuses when the physics book is not registered', () => {
    const file = writeInput(seed());
    const row = db.prepare('SELECT * FROM registered_books WHERE slug = ?').get('edlisfraedi-2e');
    expect(row).toBeTruthy();
    expect(run(['--book', CHEM, '--input', file]).code).toBe(0); // control
    // ⚠️ Rolled back, not re-inserted: foreign keys are ON here, so the DELETE cascades to the
    // book's book_domain_priority rows. Re-inserting the book row alone left physics with no
    // priorities, so every later test in this file saw physics unscoped ("— = —").
    db.exec('SAVEPOINT physics_unregistered');
    try {
      db.prepare('DELETE FROM registered_books WHERE slug = ?').run('edlisfraedi-2e');
      const r = run(['--book', CHEM, '--input', file]);
      expect(r.code).toBe(1);
      expect(r.err).toContain('edlisfraedi-2e');
      expect(r.out).not.toContain('n/a');
    } finally {
      db.exec('ROLLBACK TO physics_unregistered; RELEASE physics_unregistered');
    }
    expect(
      db.prepare('SELECT * FROM registered_books WHERE slug = ?').get('edlisfraedi-2e')
    ).toEqual(row);
  });
});

describe('final review', () => {
  const CENSUS = ['function', 'substitution', 'geometry', 'standard cell potential'];
  function writeExport() {
    const exp = buildResolvedGlossary(db, CHEM, {
      census: { strings: CENSUS, filesRead: 1, root: 'test' },
    });
    const dir = path.join(tmp, 'books', CHEM, 'glossary');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'glossary-unified.json'), JSON.stringify(exp));
  }

  it('refuses an input with no actions', () => {
    const good = writeInput(seed());
    expect(run(['--book', CHEM, '--input', good, '--apply']).code).toBe(0);
    writeExport();
    // control: the same database and export pass --verify for an input that holds actions
    expect(run(['--book', CHEM, '--input', good, '--verify']).code).toBe(0);
    const rowsBefore = layerRows();
    const empty = writeInput(input([]));
    const dry = run(['--book', CHEM, '--input', empty]);
    expect(dry.code).toBe(1);
    expect(dry.err).toContain('input has no actions');
    const apply = run(['--book', CHEM, '--input', empty, '--apply']);
    expect(apply.code).toBe(1);
    expect(apply.err).toContain('input has no actions');
    const verify = run(['--book', CHEM, '--input', empty, '--verify']);
    expect(verify.code).toBe(1);
    expect(verify.err).toContain('input has no actions');
    expect(verify.out).not.toContain('PASS');
    expect(layerRows()).toBe(rowsBefore);
  });

  it('refuses an input whose counts disagree with its actions', () => {
    const good = seed();
    const miscounted = { ...good, counts: { ...good.counts, entry: good.counts.entry + 1 } };
    const uncounted = { ...good };
    delete uncounted.counts;
    for (const bad of [miscounted, uncounted]) {
      const file = writeInput(bad);
      const dry = run(['--book', CHEM, '--input', file]);
      expect(dry.code).toBe(1);
      expect(dry.err).toContain('counts');
      const apply = run(['--book', CHEM, '--input', file, '--apply']);
      expect(apply.code).toBe(1);
      expect(apply.err).toContain('counts');
      expect(layerRows()).toBe(0);
    }
    // control: the correctly counted input is applied, and passes --verify on its export
    const goodFile = writeInput(good);
    expect(run(['--book', CHEM, '--input', goodFile, '--apply']).code).toBe(0);
    expect(layerRows()).toBeGreaterThan(0);
    writeExport();
    expect(run(['--book', CHEM, '--input', goodFile, '--verify']).code).toBe(0);
    for (const bad of [miscounted, uncounted]) {
      const verify = run(['--book', CHEM, '--input', writeInput(bad), '--verify']);
      expect(verify.code).toBe(1);
      expect(verify.err).toContain('counts');
      expect(verify.out).not.toContain('PASS');
    }
  });

  it('the physics column prints ≠ when the physics book would change, never =', () => {
    const file = writeInput(seed());
    // control: physics unchanged prints = and the dry run passes
    const ok = run(['--book', CHEM, '--input', file]);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/physics: rúmfræði = rúmfræði/);
    // A trigger in the fixture adds an out-of-chain (biology) row for each excluded headword.
    // It fires only in the dry run's in-memory copy, since the real database is never written:
    // physics keeps its winner and gains an out-of-scope row, so its signature changes.
    db.exec(`CREATE TRIGGER physics_change_probe AFTER INSERT ON book_glossary_exclusion BEGIN
      INSERT INTO concept (domain) VALUES ('biology');
      INSERT INTO concept_term (concept_id, lang, text, rank, source)
        VALUES ((SELECT MAX(id) FROM concept), 'en', NEW.english, 1, 'test');
      INSERT INTO concept_term (concept_id, lang, text, rank, source)
        VALUES ((SELECT MAX(id) FROM concept), 'is', 'líffræðiprófun', 1, 'test');
    END`);
    const conceptsBefore = count('concept');
    try {
      const r = run(['--book', CHEM, '--input', file]);
      const row = (id) => r.out.split('\n').find((l) => l.startsWith(id));
      expect(r.code).toBe(1);
      expect(r.err).toContain('r003 (entry): the physics book would change');
      expect(row('r003')).toMatch(/physics: rúmfræði ≠ rúmfræði/);
      expect(r.out).not.toMatch(/physics: rúmfræði = rúmfræði/);
      expect(count('concept')).toBe(conceptsBefore); // the trigger fired in the copy only
    } finally {
      db.exec('DROP TRIGGER IF EXISTS physics_change_probe');
    }
  });
});
