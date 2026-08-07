# Terminology Concept Model — Part A: schema and import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the concept-oriented terminology tables and populate them from a fresh
Íðorðabankinn import, **without touching any existing table or consumer**.

**Architecture:** New tables are created *alongside* the current ones. Nothing is dropped, no
consumer is switched over, and the running editor is unaffected for the whole of this plan.
The Python fetcher gains a mode that writes **verbatim** API entries; all transformation moves
to JavaScript, where the repo's own test harness can cover it.

**Tech Stack:** Node 22 (`.nvmrc`), better-sqlite3, Vitest, Python 3 (fetch only).

**Spec:** [`docs/superpowers/specs/2026-08-07-terminology-concept-model-design.md`](../specs/2026-08-07-terminology-concept-model-design.md)

## Scope

This is **Part A of three**. Part B (the `resolve()` function, glossary export, MT payload) and
Part C (editor surface, and dropping the old tables) get their own plans. Part A on its own
produces working, testable software: a populated concept database that nothing yet reads.

**⚠️ THIS PLAN DELIBERATELY DEVIATES FROM SPEC §9's ORDERING, AND THE DEVIATION IS THE POINT.**
The spec's step 1 says the migration *drops* the old tables and creates the new ones. Executed
literally, that breaks `terminologyService.js` — and therefore the editor — from that moment
until Part B lands. Building beside, cutting over, then dropping reaches the same end state
with **no broken intermediate**. Nothing in this plan removes anything.

## Global Constraints

- Node **22.x** — `.nvmrc` is the single source of truth. Run `nvm use` before `npm install`.
- Run `npm test` from the **repo root**. It is `vitest run` and does **not** run Playwright.
- Resolve resource paths against `import.meta.url` / `__dirname`, **never** `process.cwd()`.
  The server runs with cwd=`server/`.
- `books/*/01-source/` and `books/*/02-mt-output/` are **READ ONLY**. Nothing in this plan
  writes to `books/` at all.
- Íðorðabankinn policy: **1 second between requests**. `REQUEST_DELAY = 1.0` in
  `tools/fetch_idordabanki.py` — do not lower it.
- Domains are exactly these seven: `biology` `chemistry` `physics` `astronomy`
  `anatomy-physiology` `mathematics` `earth-science`.
- Chapter sentinels (item-14 `chapterLabel` contract): `0` = book default, `-1` = appendices,
  `1..n` = chapter.
- Migrations are **append-only**. Never edit a shipped migration.
- New migrations must be registered in `server/services/migrationRunner.js` **and** the count
  pinned in `server/__tests__/startup.test.js` must be bumped (three places).

---

### Task 1: Fetch verbatim entries, including entries with no English

The current fetcher cannot represent the data this model needs. At
`tools/fetch_idordabanki.py:261` it does `if not word_en or not word_is: return None`, so any
entry lacking an EN/IS pair is **discarded at fetch time** — which is every PODDUR entry, the
Latin↔Icelandic collection the spec includes precisely because it has no English side. The
Latin term is never captured, and the collection code is not retained per entry.

This task adds a **new mode** rather than changing the existing one, so nothing that depends on
`raw_fetch.json` can break.

**Files:**
- Modify: `tools/fetch_idordabanki.py` (add `fetch-raw` mode; touch nothing else)
- Create: `server/__tests__/fixtures/idordabanki-raw-sample.json` (committed fixture)
- Test: `server/__tests__/conceptImportFixture.test.js`

**Interfaces:**
- Produces: a JSON file of shape
  `{ "collection": "GEIMVISINDI", "fetched_at": "<iso>", "entries": [ <verbatim API entry>, ... ] }`
  where each entry is the API's object unmodified, including its `words` array with
  `fklanguage`, `word`, `synonyms`, `lexcatnames`, `abbreviation`.

- [ ] **Step 1: Add the `fetch-raw` mode**

In `tools/fetch_idordabanki.py`, add this function next to `fetch_collection`:

```python
def fetch_collection_raw(ordabok, delay=REQUEST_DELAY):
    """Fetch every entry from a collection VERBATIM, with no EN/IS filtering.

    Unlike fetch_collection, this discards nothing. Entries with no English side
    (PODDUR, RISAEDLUR are Latin<->Icelandic) are retained: the textbooks carry
    Latin binomials, so a Latin term can supply an Icelandic name no EN->IS
    lookup can reach. Transformation happens in JS, where it is testable.
    """
    entries, _ = _fetch_paginated(ordabok, delay)
    return entries
```

Then register the mode in `main()`, beside the existing `--mode fetch` branch:

```python
    elif args.mode == "fetch-raw":
        if not args.ordabok:
            print("--ordabok is required for fetch-raw mode", file=sys.stderr)
            sys.exit(1)
        entries = fetch_collection_raw(args.ordabok, args.delay)
        output_dir = Path(args.output)
        output_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "collection": args.ordabok,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "entries": entries,
        }
        with open(output_dir / f"raw-{args.ordabok}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"Wrote {len(entries)} verbatim entries for {args.ordabok}")
```

Add `"fetch-raw"` to the `--mode` argument's `choices` list.

- [ ] **Step 2: Produce the committed fixture from a real collection**

Run against the smallest relevant collection (210 entries, ~5 s at the 1 s policy):

```bash
python3 tools/fetch_idordabanki.py --mode fetch-raw --ordabok GEIMVISINDI \
  --output /tmp/idord-raw
```

Then trim it to a committed fixture of 20 entries:

```bash
python3 -c "
import json
d=json.load(open('/tmp/idord-raw/raw-GEIMVISINDI.json'))
d['entries']=d['entries'][:20]
json.dump(d, open('server/__tests__/fixtures/idordabanki-raw-sample.json','w'),
          ensure_ascii=False, indent=2)
print('entries:', len(d['entries']))
"
```

- [ ] **Step 3: Write a test pinning the fixture's shape**

The Python has no test harness in this repo, so its **output shape** is what gets pinned.

```js
// server/__tests__/conceptImportFixture.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'idordabanki-raw-sample.json'), 'utf-8')
);

describe('idordabanki raw fetch shape', () => {
  it('names the collection it came from', () => {
    expect(raw.collection).toBe('GEIMVISINDI');
  });

  it('carries entries', () => {
    expect(raw.entries.length).toBeGreaterThan(0);
  });

  it('keeps every language the API returned, not just EN and IS', () => {
    const langs = new Set();
    for (const e of raw.entries) for (const w of e.words || []) langs.add(w.fklanguage);
    expect(langs.has('IS')).toBe(true);
    expect(langs.size).toBeGreaterThan(1);
  });

  it('keeps the per-word fields the transform depends on', () => {
    const w = raw.entries.flatMap((e) => e.words || [])[0];
    expect(w).toHaveProperty('fklanguage');
    expect(w).toHaveProperty('word');
  });

  it('keeps the entry id, which is the concept identity', () => {
    expect(raw.entries.every((e) => e.id !== undefined)).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run server/__tests__/conceptImportFixture.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/fetch_idordabanki.py server/__tests__/fixtures/idordabanki-raw-sample.json \
        server/__tests__/conceptImportFixture.test.js
git commit -m "feat(terminology): fetch-raw mode retains entries with no English side

The existing fetch drops any entry lacking an EN/IS pair, which discards
every PODDUR entry — the Latin<->Icelandic collection the concept spec
includes precisely because the textbooks carry Latin binomials and it can
supply Icelandic names no EN->IS lookup reaches. It also never captured
the Latin term or the per-entry collection code.

New mode, additive: nothing depending on raw_fetch.json changes."
```

---

### Task 2: Migration 045 — the four concept tables

**Files:**
- Create: `server/migrations/045-concept-model.js`
- Modify: `server/services/migrationRunner.js`
- Modify: `server/__tests__/startup.test.js` (44 → 45, three places)
- Test: `server/__tests__/migration045.test.js`

**Interfaces:**
- Produces: tables `concept`, `concept_term`, `book_concept_preference`,
  `book_domain_priority`, with the columns exactly as written in Step 3.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/migration045.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const __dirname = dirname(fileURLToPath(import.meta.url));

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);
           INSERT INTO registered_books (id, slug) VALUES (1, 'efnafraedi-2e');`);
  migration045.up(db);
});
afterEach(() => db.close());

const insertConcept = (domain = 'chemistry', oid = 111) =>
  db
    .prepare('INSERT INTO concept (domain, idordabanki_id, collection) VALUES (?,?,?)')
    .run(domain, oid, 'EFNAFR').lastInsertRowid;

describe('migration 045 concept model', () => {
  it('creates a concept row', () => {
    const id = insertConcept();
    expect(db.prepare('SELECT domain FROM concept WHERE id=?').get(id).domain).toBe('chemistry');
  });

  it('rejects a second concept claiming the same Íðorðabankinn entry', () => {
    insertConcept('chemistry', 999);
    expect(() => insertConcept('biology', 999)).toThrow();
  });

  it('allows many concepts with no Íðorðabankinn id (project-originated)', () => {
    db.prepare('INSERT INTO concept (domain) VALUES (?)').run('chemistry');
    expect(() => db.prepare('INSERT INTO concept (domain) VALUES (?)').run('biology')).not.toThrow();
  });

  it('accepts a Latin term — PODDUR has no English side', () => {
    const c = insertConcept();
    expect(() =>
      db
        .prepare(
          'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
        )
        .run(c, 'la', 'Drosophila melanogaster', 1, 'idordabankinn')
    ).not.toThrow();
  });

  it('rejects a language outside en/is/la', () => {
    const c = insertConcept();
    expect(() =>
      db
        .prepare(
          'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
        )
        .run(c, 'de', 'Ensete', 1, 'idordabankinn')
    ).toThrow();
  });

  it('rejects a duplicate term within one concept and language', () => {
    const c = insertConcept();
    const ins = db.prepare(
      'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
    );
    ins.run(c, 'is', 'frumeind', 1, 'idordabankinn');
    expect(() => ins.run(c, 'is', 'frumeind', 2, 'idordabankinn')).toThrow();
  });

  it('deletes a concept’s terms with it', () => {
    const c = insertConcept();
    db.prepare(
      'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
    ).run(c, 'is', 'frumeind', 1, 'idordabankinn');
    db.prepare('DELETE FROM concept WHERE id=?').run(c);
    expect(db.prepare('SELECT COUNT(*) n FROM concept_term').get().n).toBe(0);
  });

  it('allows one preference per book, chapter and concept', () => {
    const c = insertConcept();
    const t = db
      .prepare('INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)')
      .run(c, 'is', 'frumeind', 1, 'idordabankinn').lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?,?,?,?)'
    );
    ins.run(1, 0, c, t);
    expect(() => ins.run(1, 0, c, t)).toThrow();
  });

  it('allows a chapter override alongside the book default', () => {
    const c = insertConcept();
    const t = db
      .prepare('INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)')
      .run(c, 'is', 'frumeind', 1, 'idordabankinn').lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?,?,?,?)'
    );
    ins.run(1, 0, c, t);
    expect(() => ins.run(1, 17, c, t)).not.toThrow();
  });

  it('orders domains per book', () => {
    const ins = db.prepare(
      'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)'
    );
    ins.run(1, 'chemistry', 1);
    ins.run(1, 'physics', 2);
    const rows = db
      .prepare('SELECT domain FROM book_domain_priority WHERE book_id=1 ORDER BY position')
      .all();
    expect(rows.map((r) => r.domain)).toEqual(['chemistry', 'physics']);
  });

  it('is idempotent across a re-run', () => {
    expect(() => migration045.up(db)).not.toThrow();
  });

  it('does not touch the existing terminology tables', () => {
    // Part A adds beside; it removes nothing. This is the guard on that promise.
    const src = readFileSync(join(__dirname, '..', 'migrations', '045-concept-model.js'), 'utf-8');
    expect(src).not.toMatch(/DROP\s+TABLE/i);
  });

  it('is registered in migrationRunner, by its full module path', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain("require('../migrations/045-concept-model')");
  });
});
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

Run: `npx vitest run server/__tests__/migration045.test.js`
Expected: FAIL — `Cannot find module '../migrations/045-concept-model'`.

⚠️ That is a **module-resolution** failure and vitest will report `Tests: no tests` — no
assertion ran, so it proves nothing about the assertions. Create the stub below, re-run, and
confirm you get **assertion** failures before implementing.

```js
// server/migrations/045-concept-model.js  (STUB — replaced in Step 3)
module.exports = { name: '045-concept-model', up(_db) {} };
```

Re-run. Expected: 13 failing assertions, not a load error.

- [ ] **Step 3: Write the migration**

```js
// server/migrations/045-concept-model.js
/**
 * Migration 045: concept-oriented terminology model (spec 2026-08-07).
 *
 * A CONCEPT is one sense. Íðorðabankinn is concept-oriented — one entry per
 * concept with synonyms — and the concept identity survived the original import
 * in idordabanki_id while the structure around it was discarded: `cell` is one
 * headword row with five translations from THREE entries (biology fruma,
 * physics rafhlað, mathematics flokkur).
 *
 * ⚠️ ADDS BESIDE, REMOVES NOTHING. The old tables and every consumer are
 * untouched by this migration. Cut-over is Part B; dropping is Part C. A
 * migration that dropped them here would break the editor from this moment
 * until Part B landed.
 *
 * ⚠️ book_concept_preference.chapter is NOT NULL with 0 as the book-default
 * sentinel, deliberately not nullable: in SQLite NULLs do not compare equal
 * inside a primary key, so a nullable chapter would admit two conflicting
 * "book defaults" for one concept. -1 is the appendices sentinel (item-14).
 */
module.exports = {
  name: '045-concept-model',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS concept (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        domain          TEXT NOT NULL,
        idordabanki_id  INTEGER UNIQUE,
        collection      TEXT,
        definition_en   TEXT,
        definition_is   TEXT,
        merged_into     INTEGER REFERENCES concept(id),
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_concept_domain ON concept(domain);
      CREATE INDEX IF NOT EXISTS idx_concept_merged ON concept(merged_into);

      CREATE TABLE IF NOT EXISTS concept_term (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        concept_id  INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
        lang        TEXT NOT NULL CHECK(lang IN ('en','is','la')),
        text        TEXT NOT NULL,
        rank        INTEGER NOT NULL,
        source      TEXT NOT NULL,
        inflections TEXT,
        lifecycle   TEXT,
        UNIQUE(concept_id, lang, text)
      );

      CREATE INDEX IF NOT EXISTS idx_concept_term_lookup ON concept_term(lang, text);
      CREATE INDEX IF NOT EXISTS idx_concept_term_concept ON concept_term(concept_id);

      CREATE TABLE IF NOT EXISTS book_concept_preference (
        book_id     INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
        chapter     INTEGER NOT NULL,
        concept_id  INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
        term_id     INTEGER NOT NULL REFERENCES concept_term(id) ON DELETE CASCADE,
        PRIMARY KEY (book_id, chapter, concept_id)
      );

      CREATE TABLE IF NOT EXISTS book_domain_priority (
        book_id  INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
        domain   TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (book_id, domain)
      );
    `);
  },
};
```

- [ ] **Step 4: Register it and bump the count pin**

In `server/services/migrationRunner.js`, after the `044` line:

```js
    require('../migrations/045-concept-model'),
```

In `server/__tests__/startup.test.js`, change `44` to `45` in **three** places: the test
name `all 44 migration files exist on disk`, the `expect(files.length).toBe(44)` assertion and
its comment, and both `for (let i = 1; i <= 44; i++)` loops (there are two, one per test) —
plus the second test's name `migrationRunner references all 44 migrations`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/migration045.test.js server/__tests__/startup.test.js server/__tests__/migrationIdempotency.test.js`
Expected: PASS, all three files.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/045-concept-model.js server/__tests__/migration045.test.js \
        server/services/migrationRunner.js server/__tests__/startup.test.js
git commit -m "feat(terminology): migration 045 — concept-oriented tables, added beside the old

concept / concept_term / book_concept_preference / book_domain_priority.

Adds beside, removes nothing: the old tables and every consumer are
untouched, so the editor keeps working. Cut-over is Part B, dropping is
Part C. Dropping here would break terminologyService from this commit
until Part B landed.

chapter is NOT NULL with 0 as the book-default sentinel — a nullable
chapter would admit two conflicting defaults for one concept, because
SQLite NULLs do not compare equal inside a primary key."
```

---

### Task 3: The transform — one API entry to one concept and its terms

This is where the logic lives, and it is pure: no database, no network, fully testable.

**Files:**
- Create: `server/lib/conceptFromEntry.js`
- Test: `server/__tests__/conceptFromEntry.test.js`

**Interfaces:**
- Consumes: a verbatim API entry from Task 1's fixture.
- Produces: `conceptFromEntry(entry, { collection, domain })` →
  `{ concept: { idordabankiId, collection, domain, definitionEn, definitionIs },
     terms: [ { lang, text, rank, source } ] }`
  or `null` when the entry yields no Icelandic term.
  Also exports `COLLECTION_DOMAIN` — a frozen map from collection code to domain.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/conceptFromEntry.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { conceptFromEntry, COLLECTION_DOMAIN } = require('../lib/conceptFromEntry');

const entry = (words, id = 931178) => ({ id, words });
const w = (fklanguage, word, extra = {}) => ({ fklanguage, word, ...extra });

describe('conceptFromEntry', () => {
  it('keeps the Íðorðabankinn entry id as the concept identity', () => {
    const r = conceptFromEntry(entry([w('EN', 'atom'), w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.concept.idordabankiId).toBe(931178);
  });

  it('ranks the head form 1', () => {
    const r = conceptFromEntry(entry([w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.terms.find((t) => t.lang === 'is' && t.text === 'frumeind').rank).toBe(1);
  });

  it('ranks a listed synonym 2, on the SAME concept', () => {
    const r = conceptFromEntry(entry([w('IS', 'frumeind', { synonyms: 'atóm' })]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    const is = r.terms.filter((t) => t.lang === 'is');
    expect(is.map((t) => [t.text, t.rank])).toEqual([
      ['frumeind', 1],
      ['atóm', 2],
    ]);
  });

  it('keeps the English side as terms too', () => {
    const r = conceptFromEntry(entry([w('EN', 'atom'), w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.terms.filter((t) => t.lang === 'en').map((t) => t.text)).toEqual(['atom']);
  });

  it('keeps a Latin term — this is what makes PODDUR importable', () => {
    const r = conceptFromEntry(
      entry([w('LA', 'Drosophila melanogaster'), w('IS', 'ediksgerla')]),
      { collection: 'PODDUR', domain: 'biology' }
    );
    expect(r.terms.find((t) => t.lang === 'la').text).toBe('Drosophila melanogaster');
  });

  it('accepts an entry with NO English side at all', () => {
    const r = conceptFromEntry(
      entry([w('LA', 'Pediculus humanus'), w('IS', 'fatalús')]),
      { collection: 'PODDUR', domain: 'biology' }
    );
    expect(r).not.toBeNull();
    expect(r.terms.some((t) => t.lang === 'en')).toBe(false);
  });

  it('drops languages outside en/is/la', () => {
    const r = conceptFromEntry(
      entry([w('IS', 'ediksgerla'), w('DE', 'Taufliege'), w('SV', 'bananfluga')]),
      { collection: 'PODDUR', domain: 'biology' }
    );
    expect(r.terms.every((t) => ['en', 'is', 'la'].includes(t.lang))).toBe(true);
  });

  it('returns null when there is no Icelandic term — nothing to translate to', () => {
    const r = conceptFromEntry(entry([w('EN', 'atom'), w('DE', 'Atom')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r).toBeNull();
  });

  it('records the collection as provenance', () => {
    const r = conceptFromEntry(entry([w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.concept.collection).toBe('EFNAFR');
  });

  it('maps PODDUR to biology', () => {
    expect(COLLECTION_DOMAIN.PODDUR).toBe('biology');
  });

  it('maps LAEKN to anatomy-physiology', () => {
    expect(COLLECTION_DOMAIN.LAEKN).toBe('anatomy-physiology');
  });

  it('covers all 20 collections the spec imports', () => {
    expect(Object.keys(COLLECTION_DOMAIN)).toHaveLength(20);
  });

  it('uses only the seven approved domains', () => {
    const allowed = new Set([
      'biology',
      'chemistry',
      'physics',
      'astronomy',
      'anatomy-physiology',
      'mathematics',
      'earth-science',
    ]);
    for (const d of Object.values(COLLECTION_DOMAIN)) expect(allowed.has(d)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm assertion failures**

Create the stub first, so the failures are assertions rather than a load error:

```js
// server/lib/conceptFromEntry.js  (STUB — replaced in Step 3)
module.exports = { conceptFromEntry: () => null, COLLECTION_DOMAIN: {} };
```

Run: `npx vitest run server/__tests__/conceptFromEntry.test.js`
Expected: 12 failing assertions (the "returns null" test passes against the stub — it is the
control, and it should pass both before and after).

- [ ] **Step 3: Implement**

```js
// server/lib/conceptFromEntry.js
/**
 * Turn one verbatim Íðorðabankinn API entry into a concept and its terms.
 *
 * Pure: no DB, no network. One ENTRY is one CONCEPT — the import never merges
 * (spec decision 1), so two entries sharing an English string stay two concepts
 * and `cell` comes out correct with no editorial work.
 *
 * `rank` carries Árnastofnun's own ordering: the head word is 1, its listed
 * synonyms are 2..n. That single field resolves 7,277 of 7,315 competing groups
 * measured on production — what the old model destroyed by flattening head form
 * and synonyms into sibling rows and bulk-stamping them all `approved`.
 */

/** Collection → OUR domain. Árnastofnun's collection is provenance only. */
const COLLECTION_DOMAIN = Object.freeze({
  EFNAFR: 'chemistry',
  LIFORD: 'biology',
  LIFORD2: 'biology',
  ERFDAFR: 'biology',
  ONAEMI: 'biology',
  LYFJAFRLYFJASTOFNUN: 'biology',
  FARALDSFRAEDI: 'biology',
  LYDHEILSA: 'biology',
  FUGLAR: 'biology',
  PODDUR: 'biology',
  EDLISFR: 'physics',
  STJARNA: 'astronomy',
  GEIMVISINDI: 'astronomy',
  LAEKN: 'anatomy-physiology',
  TANNL: 'anatomy-physiology',
  STAERDFRAEDI: 'mathematics',
  TOLFR: 'mathematics',
  LAND: 'earth-science',
  JARDFRAEDI2: 'earth-science',
  JARDEDLISFRAEDI: 'earth-science',
});

const LANGS = { EN: 'en', IS: 'is', LA: 'la' };

/** Íðorðabankinn separates synonyms with semicolons, sometimes commas. */
function parseSynonyms(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function conceptFromEntry(entry, { collection, domain }) {
  const terms = [];
  for (const w of entry.words || []) {
    const lang = LANGS[String(w.fklanguage || '').toUpperCase()];
    if (!lang) continue; // the API returns up to 13 languages; we keep three
    const head = (w.word || '').trim();
    if (!head) continue;
    terms.push({ lang, text: head, rank: 1, source: 'idordabankinn' });
    parseSynonyms(w.synonyms).forEach((syn, i) => {
      terms.push({ lang, text: syn, rank: i + 2, source: 'idordabankinn' });
    });
  }

  // No Icelandic side means nothing to translate TO. An entry with no ENGLISH
  // side is kept on purpose — that is PODDUR, reachable via its Latin term.
  if (!terms.some((t) => t.lang === 'is')) return null;

  return {
    concept: {
      idordabankiId: entry.id ?? null,
      collection,
      domain,
      definitionEn: entry.definition_en ?? null,
      definitionIs: entry.definition_is ?? null,
    },
    terms,
  };
}

module.exports = { conceptFromEntry, COLLECTION_DOMAIN, parseSynonyms };
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/conceptFromEntry.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Mutation-check the rank logic**

`rank` is the field the whole head-form default rests on, so prove a test guards it. Change
`rank: i + 2` to `rank: 1` in `conceptFromEntry`, re-run, and confirm the synonym-ranking test
goes RED. **Restore from a file copy — never `git checkout`, which would discard your
uncommitted implementation along with the mutation and make the next mutation look caught.**

```bash
cp server/lib/conceptFromEntry.js /tmp/conceptFromEntry.BACKUP.js
# apply the mutation, run the test, observe RED
cp /tmp/conceptFromEntry.BACKUP.js server/lib/conceptFromEntry.js
npx vitest run server/__tests__/conceptFromEntry.test.js   # green again
```

- [ ] **Step 6: Commit**

```bash
git add server/lib/conceptFromEntry.js server/__tests__/conceptFromEntry.test.js
git commit -m "feat(terminology): pure transform from Íðorðabankinn entry to concept + terms

One entry is one concept; the import never merges. rank carries
Árnastofnun's own ordering (head 1, synonyms 2..n) — the single field that
resolves 7,277 of 7,315 competing groups, and the thing the old model
destroyed by flattening head and synonyms into siblings and bulk-stamping
them approved.

Entries with no ENGLISH side are kept (PODDUR, reachable by Latin);
entries with no ICELANDIC side are dropped, having nothing to translate to.
Mutation-verified: rank collapse reddens the synonym-ranking test."
```

---

### Task 4: Load concepts into the database

**Files:**
- Create: `server/scripts/import-concepts.js`
- Test: `server/__tests__/importConcepts.test.js`

**Interfaces:**
- Consumes: `conceptFromEntry`, `COLLECTION_DOMAIN` (Task 3); the tables from Task 2.
- Produces: `importConcepts(db, rawPayload)` →
  `{ collection, entries, imported, skippedNoIcelandic, terms, byLang: {en, is, la} }`

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/importConcepts.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const { importConcepts } = require('../scripts/import-concepts');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
});
afterEach(() => db.close());

const payload = (entries, collection = 'EFNAFR') => ({ collection, entries });
const w = (fklanguage, word, extra = {}) => ({ fklanguage, word, ...extra });

describe('importConcepts', () => {
  it('creates one concept per entry', () => {
    const r = importConcepts(
      db,
      payload([
        { id: 1, words: [w('EN', 'atom'), w('IS', 'frumeind')] },
        { id: 2, words: [w('EN', 'bond'), w('IS', 'efnatengi')] },
      ])
    );
    expect(r.imported).toBe(2);
    expect(db.prepare('SELECT COUNT(*) n FROM concept').get().n).toBe(2);
  });

  it('keeps two entries sharing an English string APART — this is the whole point', () => {
    importConcepts(
      db,
      payload([{ id: 687862, words: [w('EN', 'cell'), w('IS', 'fruma')] }], 'LIFORD')
    );
    importConcepts(
      db,
      payload([{ id: 321691, words: [w('EN', 'cell'), w('IS', 'rafhlað')] }], 'EDLISFR')
    );
    const n = db
      .prepare("SELECT COUNT(DISTINCT concept_id) n FROM concept_term WHERE lang='en' AND text='cell'")
      .get().n;
    expect(n).toBe(2);
  });

  it('assigns the domain from the collection', () => {
    importConcepts(db, payload([{ id: 5, words: [w('IS', 'ediksgerla')] }], 'PODDUR'));
    expect(db.prepare('SELECT domain FROM concept').get().domain).toBe('biology');
  });

  it('imports a PODDUR entry with no English side', () => {
    const r = importConcepts(
      db,
      payload(
        [{ id: 7, words: [w('LA', 'Drosophila melanogaster'), w('IS', 'ediksgerla')] }],
        'PODDUR'
      )
    );
    expect(r.imported).toBe(1);
    expect(r.byLang.la).toBe(1);
    expect(r.byLang.en).toBe(0);
  });

  it('skips an entry with no Icelandic side and counts it', () => {
    const r = importConcepts(db, payload([{ id: 8, words: [w('EN', 'atom')] }]));
    expect(r.imported).toBe(0);
    expect(r.skippedNoIcelandic).toBe(1);
  });

  it('is idempotent — re-importing the same payload adds nothing', () => {
    const p = payload([{ id: 9, words: [w('EN', 'atom'), w('IS', 'frumeind')] }]);
    importConcepts(db, p);
    importConcepts(db, p);
    expect(db.prepare('SELECT COUNT(*) n FROM concept').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM concept_term').get().n).toBe(2);
  });

  it('rejects an unknown collection loudly rather than guessing a domain', () => {
    expect(() => importConcepts(db, payload([{ id: 10, words: [w('IS', 'x')] }], 'NOSUCH'))).toThrow(
      /NOSUCH/
    );
  });

  it('reports term counts by language', () => {
    const r = importConcepts(
      db,
      payload([{ id: 11, words: [w('EN', 'atom', { synonyms: 'atomic unit' }), w('IS', 'frumeind')] }])
    );
    expect(r.byLang).toEqual({ en: 2, is: 1, la: 0 });
  });
});
```

- [ ] **Step 2: Run it and confirm assertion failures**

Stub first:

```js
// server/scripts/import-concepts.js  (STUB — replaced in Step 3)
module.exports = { importConcepts: () => ({}) };
```

Run: `npx vitest run server/__tests__/importConcepts.test.js`
Expected: 8 failing assertions, not a load error.

- [ ] **Step 3: Implement**

```js
// server/scripts/import-concepts.js
/**
 * Load verbatim Íðorðabankinn entries (Task 1's `fetch-raw` output) into the
 * concept model.
 *
 * ⚠️ Adds only. This script writes to the concept tables and reads nothing from
 * the old terminology tables, so it can run while the editor is live.
 *
 * Idempotent by `concept.idordabanki_id`: re-running replaces a concept's terms
 * rather than duplicating them, so an interrupted 20-collection import can be
 * resumed by simply re-running it.
 */
const { conceptFromEntry, COLLECTION_DOMAIN } = require('../lib/conceptFromEntry');

function importConcepts(db, payload) {
  const collection = payload.collection;
  const domain = COLLECTION_DOMAIN[collection];
  if (!domain) {
    // Fail loud: a guessed domain would silently scope a whole collection to
    // the wrong books, and nothing downstream could detect it.
    throw new Error(
      `Unknown collection '${collection}' — add it to COLLECTION_DOMAIN in ` +
        `server/lib/conceptFromEntry.js with a deliberate domain, or do not import it.`
    );
  }

  const findConcept = db.prepare('SELECT id FROM concept WHERE idordabanki_id = ?');
  const insConcept = db.prepare(
    `INSERT INTO concept (domain, idordabanki_id, collection, definition_en, definition_is)
     VALUES (?,?,?,?,?)`
  );
  const clearTerms = db.prepare('DELETE FROM concept_term WHERE concept_id = ?');
  const insTerm = db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)`
  );

  const stats = {
    collection,
    entries: (payload.entries || []).length,
    imported: 0,
    skippedNoIcelandic: 0,
    terms: 0,
    byLang: { en: 0, is: 0, la: 0 },
  };

  const run = db.transaction(() => {
    for (const entry of payload.entries || []) {
      const built = conceptFromEntry(entry, { collection, domain });
      if (!built) {
        stats.skippedNoIcelandic++;
        continue;
      }
      const { concept, terms } = built;

      const existing =
        concept.idordabankiId != null ? findConcept.get(concept.idordabankiId) : null;
      const conceptId = existing
        ? existing.id
        : insConcept.run(
            concept.domain,
            concept.idordabankiId,
            concept.collection,
            concept.definitionEn,
            concept.definitionIs
          ).lastInsertRowid;

      if (existing) clearTerms.run(conceptId);

      const seen = new Set();
      for (const t of terms) {
        const key = `${t.lang} ${t.text}`;
        if (seen.has(key)) continue; // the API can repeat a form as its own synonym
        seen.add(key);
        insTerm.run(conceptId, t.lang, t.text, t.rank, t.source);
        stats.terms++;
        stats.byLang[t.lang]++;
      }
      stats.imported++;
    }
  });
  run();

  return stats;
}

module.exports = { importConcepts };
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/importConcepts.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full root suite**

Run: `npm test` (from the repo root)
Expected: PASS. Note the file and test counts in the commit message.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/import-concepts.js server/__tests__/importConcepts.test.js
git commit -m "feat(terminology): load verbatim Íðorðabankinn entries into the concept model

Idempotent by idordabanki_id, so an interrupted 20-collection import
resumes by re-running. Adds only — reads nothing from the old tables, so
it can run while the editor is live.

An unknown collection throws rather than defaulting a domain: a guessed
domain would silently scope a whole collection to the wrong books and
nothing downstream could detect it.

Pinned: two entries sharing an English string stay TWO concepts. That test
is the model's reason for existing — it is the case `cell` failed."
```

---

### Task 5: Seed the per-book domain priority

**Files:**
- Create: `server/migrations/046-seed-domain-priority.js`
- Modify: `server/services/migrationRunner.js`
- Modify: `server/__tests__/startup.test.js` (45 → 46, four places)
- Test: `server/__tests__/migration046.test.js`

**Interfaces:**
- Consumes: `book_domain_priority` (Task 2).
- Produces: one ordered domain list per registered book.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/migration046.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const migration046 = require('../migrations/046-seed-domain-priority');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  const ins = db.prepare('INSERT INTO registered_books (id, slug) VALUES (?,?)');
  [
    [1, 'efnafraedi-2e'],
    [2, 'orverufraedi'],
    [3, 'liffraedi-2e'],
    [6, 'stjornufraedi'],
    [17, 'lifraen-efnafraedi'],
    [155, 'edlisfraedi-2e'],
  ].forEach(([id, slug]) => ins.run(id, slug));
  migration045.up(db);
  migration046.up(db);
});
afterEach(() => db.close());

const order = (slug) =>
  db
    .prepare(
      `SELECT p.domain FROM book_domain_priority p
         JOIN registered_books b ON b.id = p.book_id
        WHERE b.slug = ? ORDER BY p.position`
    )
    .all(slug)
    .map((r) => r.domain);

describe('migration 046 domain priority seed', () => {
  it('puts chemistry first for efnafraedi-2e', () => {
    expect(order('efnafraedi-2e')[0]).toBe('chemistry');
  });

  it('gives efnafraedi-2e biology as a fallback — this is what returns pH and bond', () => {
    expect(order('efnafraedi-2e')).toContain('biology');
  });

  it('puts astronomy first for stjornufraedi, which had no terminology at all', () => {
    expect(order('stjornufraedi')[0]).toBe('astronomy');
  });

  it('gives orverufraedi biology first', () => {
    expect(order('orverufraedi')[0]).toBe('biology');
  });

  it('gives lifraen-efnafraedi chemistry first', () => {
    expect(order('lifraen-efnafraedi')[0]).toBe('chemistry');
  });

  it('gives edlisfraedi-2e physics first', () => {
    expect(order('edlisfraedi-2e')[0]).toBe('physics');
  });

  it('gives every registered book a priority list — a book scoped to nothing is the bug', () => {
    const books = db.prepare('SELECT slug FROM registered_books').all().map((r) => r.slug);
    for (const slug of books) expect(order(slug).length).toBeGreaterThan(0);
  });

  it('uses contiguous positions starting at 1', () => {
    expect(order('efnafraedi-2e').length).toBeGreaterThan(1);
    const positions = db
      .prepare('SELECT position FROM book_domain_priority WHERE book_id=1 ORDER BY position')
      .all()
      .map((r) => r.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  });

  it('is idempotent across a re-run', () => {
    const before = order('efnafraedi-2e');
    migration046.up(db);
    expect(order('efnafraedi-2e')).toEqual(before);
  });
});
```

- [ ] **Step 2: Run it and confirm assertion failures**

Stub: `module.exports = { name: '046-seed-domain-priority', up(_db) {} };`
Run: `npx vitest run server/__tests__/migration046.test.js`
Expected: 9 failing assertions.

- [ ] **Step 3: Implement**

```js
// server/migrations/046-seed-domain-priority.js
/**
 * Migration 046: seed each book's domain fallback order.
 *
 * Replaces book_subject_mapping's single primary_subject with an ORDERED list.
 * The first fallback entry is load-bearing: efnafraedi-2e's `biology` is what
 * returns pH, bond and carbon dioxide — 112 correct chemistry terms that the
 * old strict subject scope discarded for want of anywhere to fall back to.
 *
 * ⚠️ book_subject_mapping is NOT touched here. Part C removes it, once nothing
 * reads it.
 */
const PRIORITIES = {
  'efnafraedi-2e': ['chemistry', 'physics', 'biology'],
  'lifraen-efnafraedi': ['chemistry', 'biology', 'physics'],
  'liffraedi-2e': ['biology', 'anatomy-physiology', 'chemistry'],
  orverufraedi: ['biology', 'anatomy-physiology', 'chemistry'],
  'edlisfraedi-2e': ['physics', 'astronomy', 'mathematics', 'earth-science', 'chemistry'],
  stjornufraedi: ['astronomy', 'physics', 'earth-science', 'mathematics'],
};

module.exports = {
  name: '046-seed-domain-priority',

  up(db) {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?');
    const ins = db.prepare(
      `INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)`
    );
    const run = db.transaction(() => {
      for (const [slug, domains] of Object.entries(PRIORITIES)) {
        const row = book.get(slug);
        if (!row) continue; // a book not registered on this box is not an error
        domains.forEach((domain, i) => ins.run(row.id, domain, i + 1));
      }
    });
    run();
  },
};
```

- [ ] **Step 4: Register and bump the pin**

Add `require('../migrations/046-seed-domain-priority'),` after the 045 line in
`server/services/migrationRunner.js`, and change `45` → `46` in the four places in
`server/__tests__/startup.test.js` (two test names, one `toBe`, two loop bounds).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/migration046.test.js server/__tests__/startup.test.js server/__tests__/migrationIdempotency.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/046-seed-domain-priority.js server/__tests__/migration046.test.js \
        server/services/migrationRunner.js server/__tests__/startup.test.js
git commit -m "feat(terminology): seed per-book domain fallback order

Replaces a single primary_subject with an ordered list. The first fallback
entry is load-bearing: efnafraedi-2e's biology is what returns pH, bond
and carbon dioxide — the 112 correct chemistry terms the old strict scope
discarded for want of anywhere to fall back to.

Pinned: every registered book has a non-empty list. A book scoped to
nothing is the failure this whole design exists to remove."
```

---

### Task 6: The import runner, with per-collection yield reporting

**Files:**
- Create: `server/scripts/run-concept-import.js`
- Test: `server/__tests__/conceptImportReport.test.js`

**Interfaces:**
- Consumes: `importConcepts` (Task 4).
- Produces: `formatImportReport(statsList)` → a string; and a CLI reading `raw-*.json` files
  from a directory.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/conceptImportReport.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { formatImportReport } = require('../scripts/run-concept-import');

const s = (over = {}) => ({
  collection: 'EFNAFR',
  entries: 100,
  imported: 90,
  skippedNoIcelandic: 10,
  terms: 150,
  byLang: { en: 80, is: 70, la: 0 },
  ...over,
});

describe('formatImportReport', () => {
  it('names every collection', () => {
    const out = formatImportReport([s(), s({ collection: 'PODDUR' })]);
    expect(out).toMatch(/EFNAFR/);
    expect(out).toMatch(/PODDUR/);
  });

  it('reports a zero-yield collection LOUDLY — a silent one bulks out the editor', () => {
    const out = formatImportReport([s({ collection: 'RISAEDLUR', imported: 0, terms: 0 })]);
    expect(out).toMatch(/ZERO YIELD/);
  });

  it('does not flag a healthy collection as zero yield', () => {
    // The control: without this, a formatter that flagged EVERYTHING would pass above.
    expect(formatImportReport([s()])).not.toMatch(/ZERO YIELD/);
  });

  it('flags a Latin-only collection so its editor-only reach is not mistaken for MT reach', () => {
    const out = formatImportReport([
      s({ collection: 'PODDUR', byLang: { en: 0, is: 300, la: 300 } }),
    ]);
    expect(out).toMatch(/LATIN-ONLY/);
  });

  it('totals the imported concepts', () => {
    expect(formatImportReport([s(), s({ imported: 10 })])).toMatch(/100 concepts/);
  });
});
```

- [ ] **Step 2: Run it and confirm assertion failures**

Stub: `module.exports = { formatImportReport: () => '' };`
Run: `npx vitest run server/__tests__/conceptImportReport.test.js`
Expected: 5 failing assertions — except *"does not flag a healthy collection"*, which passes
against the stub. That one is the **control**: it must pass before and after.

- [ ] **Step 3: Implement**

```js
// server/scripts/run-concept-import.js
/**
 * Run the concept import over a directory of `raw-<COLLECTION>.json` files
 * produced by `fetch_idordabanki.py --mode fetch-raw`.
 *
 * ⚠️ Per-collection yield is REPORTED, never assumed. A collection's entry count
 * is not its usable count: SJODYR has 985 entries, 838 bilingual, and 0 hits
 * against this project's headwords. A collection that contributes nothing must
 * be VISIBLE here rather than silently bulking out the editor's search.
 */
const fs = require('fs');
const path = require('path');
const { importConcepts } = require('./import-concepts');

function formatImportReport(statsList) {
  const lines = ['Concept import — per-collection yield', ''];
  let totalConcepts = 0;
  for (const st of statsList) {
    totalConcepts += st.imported;
    const flags = [];
    if (st.imported === 0) flags.push('ZERO YIELD — contributes nothing; reconsider importing it');
    if (st.byLang.la > 0 && st.byLang.en === 0)
      flags.push('LATIN-ONLY — reachable by the EDITOR via Latin, never by the EN→IS MT payload');
    lines.push(
      `  ${st.collection.padEnd(22)} ${String(st.imported).padStart(6)} concepts · ` +
        `${String(st.terms).padStart(6)} terms ` +
        `(en ${st.byLang.en} / is ${st.byLang.is} / la ${st.byLang.la})` +
        (st.skippedNoIcelandic ? ` · ${st.skippedNoIcelandic} skipped, no Icelandic` : '')
    );
    for (const f of flags) lines.push(`      ⚠️  ${f}`);
  }
  lines.push('', `  TOTAL: ${totalConcepts} concepts`);
  return lines.join('\n');
}

function runImport(db, dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('raw-') && f.endsWith('.json'))
    .sort();
  const stats = [];
  for (const f of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    stats.push(importConcepts(db, payload));
  }
  return stats;
}

module.exports = { formatImportReport, runImport };
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/conceptImportReport.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/run-concept-import.js server/__tests__/conceptImportReport.test.js
git commit -m "feat(terminology): per-collection yield report for the concept import

Yield is reported, never assumed: SJODYR has 985 entries, 838 bilingual
and 0 hits against this project's headwords. A collection contributing
nothing must be VISIBLE, not silently bulking out the editor's search.

Flags LATIN-ONLY separately so PODDUR's editor-only reach is never
mistaken for MT reach — the glossary is EN->IS and a Latin term can never
enter the payload."
```

---

### Task 7: Verification — assert the import reproduced the measured facts

An import that runs is not an import that is right. This task pins the model against
measurements taken from production on 2026-08-07.

**Files:**
- Create: `server/scripts/verify-concept-import.js`
- Test: `server/__tests__/verifyConceptImport.test.js`

**Interfaces:**
- Consumes: the populated tables.
- Produces: `verifyConceptImport(db)` → `{ ok, checks: [{ name, ok, detail }] }`

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/verifyConceptImport.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const { importConcepts } = require('../scripts/import-concepts');
const { verifyConceptImport } = require('../scripts/verify-concept-import');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
});
afterEach(() => db.close());

const w = (fklanguage, word, extra = {}) => ({ fklanguage, word, ...extra });
const check = (r, name) => r.checks.find((c) => c.name === name);

function seedCell() {
  importConcepts(db, {
    collection: 'LIFORD',
    entries: [{ id: 687862, words: [w('EN', 'cell'), w('IS', 'fruma')] }],
  });
  importConcepts(db, {
    collection: 'EDLISFR',
    entries: [{ id: 321691, words: [w('EN', 'cell'), w('IS', 'rafhlað')] }],
  });
}

describe('verifyConceptImport', () => {
  it('passes the homograph check when cell is separated by domain', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'homographs-separated').ok).toBe(true);
  });

  it('FAILS the homograph check when two senses share one concept', () => {
    // The control: without this, a check that always passed would look correct.
    importConcepts(db, {
      collection: 'LIFORD',
      entries: [{ id: 1, words: [w('EN', 'cell'), w('IS', 'fruma', { synonyms: 'rafhlað' })] }],
    });
    expect(check(verifyConceptImport(db), 'homographs-separated').ok).toBe(false);
  });

  it('requires every concept to have at least one Icelandic term', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'every-concept-has-icelandic').ok).toBe(true);
  });

  it('requires every concept to have exactly one rank-1 Icelandic term', () => {
    importConcepts(db, {
      collection: 'EFNAFR',
      entries: [{ id: 2, words: [w('IS', 'frumeind', { synonyms: 'atóm' })] }],
    });
    expect(check(verifyConceptImport(db), 'one-head-form-per-concept').ok).toBe(true);
  });

  it('requires every domain to be one of the seven', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'domains-are-known').ok).toBe(true);
  });

  it('FAILS domains-are-known when an unknown domain is present', () => {
    seedCell();
    db.prepare("UPDATE concept SET domain='botany' WHERE id=1").run();
    expect(check(verifyConceptImport(db), 'domains-are-known').ok).toBe(false);
  });

  it('reports ok only when every check passes', () => {
    seedCell();
    db.prepare("UPDATE concept SET domain='botany' WHERE id=1").run();
    expect(verifyConceptImport(db).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm assertion failures**

Stub: `module.exports = { verifyConceptImport: () => ({ ok: true, checks: [] }) };`
Run: `npx vitest run server/__tests__/verifyConceptImport.test.js`
Expected: failures on every test that looks up a named check.

- [ ] **Step 3: Implement**

```js
// server/scripts/verify-concept-import.js
/**
 * Assert the imported model reproduces what was measured on production
 * 2026-08-07. An import that RUNS is not an import that is RIGHT.
 */
const DOMAINS = new Set([
  'biology',
  'chemistry',
  'physics',
  'astronomy',
  'anatomy-physiology',
  'mathematics',
  'earth-science',
]);

function verifyConceptImport(db) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  const noIs = db
    .prepare(
      `SELECT COUNT(*) n FROM concept c
        WHERE NOT EXISTS (SELECT 1 FROM concept_term t
                           WHERE t.concept_id = c.id AND t.lang = 'is')`
    )
    .get().n;
  add('every-concept-has-icelandic', noIs === 0, `${noIs} concepts with no Icelandic term`);

  const badHeads = db
    .prepare(
      `SELECT COUNT(*) n FROM (
         SELECT concept_id FROM concept_term WHERE lang='is'
          GROUP BY concept_id HAVING SUM(CASE WHEN rank=1 THEN 1 ELSE 0 END) <> 1)`
    )
    .get().n;
  add('one-head-form-per-concept', badHeads === 0, `${badHeads} concepts without exactly one head form`);

  // A concept holding two Icelandic terms from DIFFERENT senses is the failure
  // the old model had. We cannot detect senses directly — but a concept whose
  // Icelandic terms were never listed together by Árnastofnun is a proxy: the
  // import must never put two entries' terms on one concept.
  const merged = db
    .prepare(
      `SELECT COUNT(*) n FROM (
         SELECT t.concept_id FROM concept_term t
           JOIN concept c ON c.id = t.concept_id
          WHERE t.lang='en'
          GROUP BY t.concept_id, t.text
         HAVING COUNT(DISTINCT c.idordabanki_id) > 1)`
    )
    .get().n;
  const senseCollision = db
    .prepare(
      `SELECT COUNT(*) n FROM (
         SELECT concept_id FROM concept_term WHERE lang='is'
          GROUP BY concept_id HAVING COUNT(DISTINCT text) > 1
            AND MIN(rank) = MAX(rank))`
    )
    .get().n;
  add(
    'homographs-separated',
    merged === 0 && senseCollision === 0,
    `${merged} cross-entry merges, ${senseCollision} equal-rank sense collisions`
  );

  const unknown = db
    .prepare('SELECT DISTINCT domain FROM concept')
    .all()
    .map((r) => r.domain)
    .filter((d) => !DOMAINS.has(d));
  add('domains-are-known', unknown.length === 0, `unknown domains: ${unknown.join(', ') || 'none'}`);

  return { ok: checks.every((c) => c.ok), checks };
}

module.exports = { verifyConceptImport, DOMAINS };
```

⚠️ If `homographs-separated` does not go red on the control test in Step 1, the proxy is wrong
and must be reworked before this task is complete. **A check that cannot fail is not a check** —
do not adjust the test to match a passing implementation.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/verifyConceptImport.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full root suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/verify-concept-import.js server/__tests__/verifyConceptImport.test.js
git commit -m "feat(terminology): verify the import reproduces the measured model

An import that runs is not an import that is right. Asserts: every concept
has an Icelandic term; exactly one rank-1 head form per concept; no two
Íðorðabankinn entries merged onto one concept; every domain is one of the
seven.

Each check has a control test that FORCES it red, because a check that
cannot fail is not a check."
```

---

### Task 8: Run the real import and record the result

Not code — the operation the previous seven tasks exist to make safe.

**Files:**
- Create: `test-results/concept-import-2026-08.md`

- [ ] **Step 1: Fetch all 20 collections**

~25–30 min unattended. **Do not lower `REQUEST_DELAY`.**

```bash
for C in EFNAFR LIFORD LIFORD2 EDLISFR STAERDFRAEDI STJARNA GEIMVISINDI ERFDAFR ONAEMI \
         LAEKN LYFJAFRLYFJASTOFNUN FARALDSFRAEDI LYDHEILSA TOLFR LAND JARDFRAEDI2 \
         JARDEDLISFRAEDI TANNL PODDUR FUGLAR; do
  python3 tools/fetch_idordabanki.py --mode fetch-raw --ordabok "$C" --output /tmp/idord-raw
done
ls -1 /tmp/idord-raw/raw-*.json | wc -l    # expect 20
```

- [ ] **Step 2: Import into a COPY of the database, never the live one**

```bash
cp pipeline-output/sessions.db /tmp/concept-import-test.db
node -e "
const Database=require('better-sqlite3');
const db=new Database('/tmp/concept-import-test.db');
require('./server/migrations/045-concept-model').up(db);
require('./server/migrations/046-seed-domain-priority').up(db);
const {runImport,formatImportReport}=require('./server/scripts/run-concept-import');
console.log(formatImportReport(runImport(db,'/tmp/idord-raw')));
const {verifyConceptImport}=require('./server/scripts/verify-concept-import');
const v=verifyConceptImport(db);
console.log('\nVERIFY:', v.ok ? 'PASS' : 'FAIL');
for(const c of v.checks) console.log(' ', c.ok?'✓':'✗', c.name, '—', c.detail);
"
```

- [ ] **Step 3: Check the three facts that motivated the design**

```bash
node -e "
const Database=require('better-sqlite3');
const db=new Database('/tmp/concept-import-test.db');
const q=(s,...a)=>db.prepare(s).all(...a);
console.log('cell senses:', q(\"SELECT c.domain, t2.text FROM concept_term t
  JOIN concept c ON c.id=t.concept_id
  JOIN concept_term t2 ON t2.concept_id=c.id AND t2.lang='is' AND t2.rank=1
  WHERE t.lang='en' AND t.text='cell'\"));
console.log('Drosophila:', q(\"SELECT t2.text FROM concept_term t
  JOIN concept_term t2 ON t2.concept_id=t.concept_id AND t2.lang='is'
  WHERE t.lang='la' AND t.text LIKE 'Drosophila melanogaster%'\"));
console.log('atom head/synonym:', q(\"SELECT t2.text, t2.rank FROM concept_term t
  JOIN concept_term t2 ON t2.concept_id=t.concept_id AND t2.lang='is'
  WHERE t.lang='en' AND t.text='atom' ORDER BY t2.rank\"));
"
```

Expected: `cell` appears under **three** domains with different Icelandic; `Drosophila
melanogaster` yields *ediksgerla*; `atom` yields *frumeind* at rank 1 and *atóm* at rank 2.

⚠️ **If any of these three is wrong, stop.** They are the three cases the whole design was
derived from; a model that gets them wrong is not worth carrying forward.

- [ ] **Step 4: Record the result**

Write `test-results/concept-import-2026-08.md` containing the verbatim yield report, the verify
output, the three spot checks, and the date. Follow `test-results/api-marker-survival.md`'s
precedent: it is evidence, and it is dated.

- [ ] **Step 5: Commit**

```bash
git add test-results/concept-import-2026-08.md
git commit -m "docs(terminology): record the concept import's measured yield

Per-collection yield, verification output, and the three spot checks the
design was derived from: cell separates into three senses by domain,
Drosophila melanogaster resolves to ediksgerla via the Latin route, and
atom carries frumeind at rank 1 with atóm at rank 2."
```

---

## What Part A does NOT do

Stated so nobody reads a green suite as a finished feature:

- **Nothing reads the new tables.** `terminologyService.js`, the glossary export, the MT payload
  and the editor are all untouched and still on the old model. That is Part B.
- **Nothing is dropped.** `terminology_headwords`, `terminology_translations`,
  `terminology_translation_subjects` and `book_subject_mapping` are all still present and still
  authoritative. That is Part C.
- **No production database is modified.** Task 8 imports into a copy. Cutting production over is
  a deploy decision, taken once Part B exists.
- **No term is chosen for any book.** `book_concept_preference` is created empty. The model makes
  choice expressible; editors make it.
