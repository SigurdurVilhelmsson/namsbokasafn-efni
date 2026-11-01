// server/__tests__/setBookTermPreferences.test.js
//
// server/scripts/set-book-term-preferences.js — chemistry's book preferences for the rulings that
// select an existing term — and the two house-style entries of the same batch, whose Icelandic
// exists on no concept. Records: docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md,
// docs/decisions/2026-11-01-polyatomic-ion-two-words.md.
//
// 🔴 freshMigratedDb() has no Íðorðabankinn import, so every resolution below is asserted against
// a seeded incumbent: a test with nothing to beat passes for the wrong reason.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const conceptResolver = require('../lib/conceptResolver');
const { HOUSE_STYLE_TERMS } = require('../lib/houseStyleTerms');
const { PREFERENCES, planPreferences, applyPlan } = require('../scripts/set-book-term-preferences');

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'set-book-term-preferences.js'
);

let db;
let dbPath;
beforeEach(() => {
  ({ db, path: dbPath } = freshMigratedDb());
});
afterEach(() => db.close());

const insConcept = (domain, idordabankiId = null) =>
  db
    .prepare(
      `INSERT INTO concept (domain, collection, idordabanki_id) VALUES (?, 'IDORD', ?) RETURNING id`
    )
    .get(domain, idordabankiId).id;
const insTerm = (conceptId, lang, text, rank) =>
  db
    .prepare(
      `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,'idordabankinn') RETURNING id`
    )
    .get(conceptId, lang, text, rank).id;

/**
 * For each entry: a CHEMISTRY incumbent that wins today (position 1), and the entry's own concept
 * in biology (position 3) carrying the ruled Icelandic at rank 2 behind another head form — the
 * shape production has (the ruled word is a listed alternative).
 */
const seedAll = (entries = PREFERENCES) => {
  for (const e of entries) {
    const inc = insConcept('chemistry');
    insTerm(inc, 'en', e.english, 1);
    insTerm(inc, 'is', `INCUMBENT ${e.english}`, 1);
    const own = insConcept('biology', e.idordabankiId);
    insTerm(own, 'en', e.english, 1);
    insTerm(own, 'is', `HEAD ${e.english}`, 1);
    insTerm(own, 'is', e.icelandic, 2);
  }
};

const winner = (english) =>
  conceptResolver.resolve(conceptResolver.buildScope(db, 'efnafraedi-2e'), english).winner?.text;
const prefCount = () => db.prepare('SELECT COUNT(*) n FROM book_term_preference').get().n;

describe('the rulings themselves', () => {
  it('eight chemistry entries, one per English word and per concept', () => {
    expect(PREFERENCES).toHaveLength(8);
    expect(new Set(PREFERENCES.map((e) => e.english)).size).toBe(8);
    expect(new Set(PREFERENCES.map((e) => e.idordabankiId)).size).toBe(8);
    expect(PREFERENCES.every((e) => e.book === 'efnafraedi-2e')).toBe(true);
  });

  it('polyatomic ion is the two-word fjölatóma jón ([USER] 2026-11-01)', () => {
    const e = PREFERENCES.find((p) => p.english === 'polyatomic ion');
    expect([e.icelandic, e.ruled]).toEqual(['fjölatóma jón', '2026-11-01 [USER]']);
  });

  it('accuracy points at the hittni-only concept, never the one that also carries nákvæmni', () => {
    // Production concept 6524 carries nákvæmni | hittni; its Íðorðabankinn id is not this one.
    expect(PREFERENCES.find((p) => p.english === 'accuracy').idordabankiId).toBe(523838);
  });

  it('none of them is a house-style head, calorimetry or a word with no concept (out of scope)', () => {
    const house = new Set(HOUSE_STYLE_TERMS.flatMap((t) => t.en));
    const out = [
      'calorimetry',
      'concentrated acid',
      'diffract',
      'intermolecular force',
      'body-centered cubic solid',
      'face-centered cubic solid',
      'half-life of a reaction',
      'standard hydrogen electrode',
    ];
    for (const e of PREFERENCES) {
      expect(house.has(e.english)).toBe(false);
      expect(out).not.toContain(e.english);
    }
  });
});

describe('planPreferences / applyPlan', () => {
  it('CONTROL: before applying, every incumbent wins, so the after-test can fail', () => {
    seedAll();
    for (const e of PREFERENCES) expect(winner(e.english)).toBe(`INCUMBENT ${e.english}`);
  });

  it('applies all eight, and the resolver then gives each ruled Icelandic for chemistry', () => {
    seedAll();
    const plan = planPreferences(db);
    expect([plan.problems, plan.rows.map((r) => r.action)]).toEqual([[], Array(8).fill('insert')]);
    expect(applyPlan(db, plan)).toBe(8);
    for (const e of PREFERENCES) expect(winner(e.english)).toBe(e.icelandic);
  });

  it('is idempotent: a second run finds every row already set and inserts nothing', () => {
    seedAll();
    applyPlan(db, planPreferences(db));
    const again = planPreferences(db);
    expect(again.rows.map((r) => r.action)).toEqual(Array(8).fill('already-set'));
    expect([applyPlan(db, again), prefCount()]).toEqual([0, 8]);
  });

  it('the preference is per book: another book keeps its own resolution', () => {
    seedAll();
    applyPlan(db, planPreferences(db));
    const scope = conceptResolver.buildScope(db, 'liffraedi-2e');
    // Biology's chain starts with biology, where the entry's own concept wins on its head form.
    expect(conceptResolver.resolve(scope, 'vacancy').winner?.text).toBe('HEAD vacancy');
  });

  it('refuses to overwrite a different preference, and then writes nothing at all', () => {
    seedAll();
    const book = db.prepare(`SELECT id FROM registered_books WHERE slug='efnafraedi-2e'`).get().id;
    const other = db
      .prepare(`SELECT t.id FROM concept_term t WHERE t.text = 'INCUMBENT vacancy'`)
      .get().id;
    db.prepare(
      `INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, 'Vacancy', ?)`
    ).run(book, other); // different case: the key folds it, so this IS the vacancy row
    const plan = planPreferences(db);
    expect(plan.problems.map((p) => [p.entry.english, p.code])).toEqual([
      ['vacancy', 'conflicting-preference'],
    ]);
    expect(() => applyPlan(db, plan)).toThrow(/problems/);
    expect(prefCount()).toBe(1);
  });

  it('reports a concept missing, merged, or lacking the English or the Icelandic', () => {
    const [a, b, c, d] = PREFERENCES;
    seedAll([b, c, d]); // a: no concept at all
    const ownOf = (e) =>
      db.prepare('SELECT id FROM concept WHERE idordabanki_id = ?').get(e.idordabankiId).id;
    const target = insConcept('chemistry');
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(target, ownOf(b));
    db.prepare(`DELETE FROM concept_term WHERE concept_id = ? AND lang = 'en'`).run(ownOf(c));
    db.prepare(`DELETE FROM concept_term WHERE concept_id = ? AND text = ?`).run(
      ownOf(d),
      d.icelandic
    );
    const plan = planPreferences(db, [a, b, c, d]);
    expect(plan.problems.map((p) => p.code)).toEqual([
      'concept-not-found',
      'concept-merged',
      'english-not-on-concept',
      'icelandic-not-on-concept',
    ]);
    expect(plan.rows).toEqual([]);
  });

  it('matches the Icelandic exactly: a different case is a miss, not a near hit', () => {
    const e = PREFERENCES.find((p) => p.english === 'rate law');
    seedAll([{ ...e, icelandic: 'Hraðalögmál' }]);
    expect(planPreferences(db, [e]).problems.map((p) => p.code)).toEqual([
      'icelandic-not-on-concept',
    ]);
  });
});

describe('the CLI', () => {
  const run = (...args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, SESSIONS_DB_PATH: dbPath },
    });

  it('a dry run writes nothing; --apply writes eight; a second --apply writes none', () => {
    seedAll();
    const dry = run();
    expect([
      dry.status,
      /DRY RUN/.test(dry.stdout),
      /8 to insert/.test(dry.stdout),
      prefCount(),
    ]).toEqual([0, true, true, 0]);
    const first = run('--apply');
    expect([first.status, /INSERTED 8 row/.test(first.stdout), prefCount()]).toEqual([0, true, 8]);
    const second = run('--apply');
    expect([second.status, /INSERTED 0 row/.test(second.stdout), prefCount()]).toEqual([
      0,
      true,
      8,
    ]);
  });

  it('one problem fails the run with exit 1 and writes nothing, even under --apply', () => {
    seedAll(PREFERENCES.slice(1)); // the first entry's concept is missing
    const r = run('--apply');
    expect([r.status, /concept-not-found/.test(r.stdout), prefCount()]).toEqual([1, true, 0]);
  });
});

describe('the two house-style entries of the batch', () => {
  const seedIncumbent = (english, icelandic, domain) => {
    const id = insConcept(domain);
    insTerm(id, 'en', english, 1);
    insTerm(id, 'is', icelandic, 1);
  };

  it('CONTROL: an unruled head loses to its physics incumbent, so the tests below can fail', () => {
    seedIncumbent('some unruled head', 'eitthvað annað', 'physics');
    expect(winner('some unruled head')).toBe('eitthvað annað');
  });

  it('dissociation constant → klofnunarfasti, over the physics row klofnunarstuðull', () => {
    seedIncumbent('dissociation constant', 'klofnunarstuðull', 'physics');
    expect(winner('dissociation constant')).toBe('klofnunarfasti');
  });

  it('heat of combustion → brunavarmi, over the physics row brennsluvarmi', () => {
    seedIncumbent('heat of combustion', 'brennsluvarmi', 'physics');
    expect(winner('heat of combustion')).toBe('brunavarmi');
  });
});
