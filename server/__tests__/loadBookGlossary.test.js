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
function input(actions, extra = {}) {
  return { schema: 'c19-book-layer-input/1', book: CHEM, actions, ...extra };
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
