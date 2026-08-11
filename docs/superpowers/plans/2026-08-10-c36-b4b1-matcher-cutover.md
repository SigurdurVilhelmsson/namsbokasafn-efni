# §C36 B4b-1 — `findTermsInSegments` concept-model cut-over: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `findTermsInSegments` over from the old terminology tables to the concept model via `conceptResolver`, preserving the overlap tiler, the fallback/issue semantics and the C24 automaton design, while adding the chapter dimension B4a needs.

**Architecture:** One **global** Aho-Corasick automaton is built over the distinct English strings in `concept_term(lang='en')` — exactly as today's is built over all headwords, unfiltered — and all scoping happens *after* the match, in `resolve(scope, english)`. That keeps the single-slot module cache and means **no scope-keyed cache is needed**. Per matched English string the resolver returns one winner (or none plus out-of-scope candidates, which becomes today's `isFallback`), and the Icelandic-side check reads the paradigm written by the BÍN population op.

**Tech Stack:** Node 22 CommonJS under `server/`, better-sqlite3, Vitest. `server/lib/conceptResolver.js` (B1/B4a), `server/lib/termAutomaton.js` (C24), `server/lib/binInflections.js` (B4b-0b).

**Spec:** [`2026-08-10-terminology-concept-model-part-b4b1-design.md`](../specs/2026-08-10-terminology-concept-model-part-b4b1-design.md). Read §2 (four things with no counterpart), §6 (D4/D4.2), §7 (gates) before Task 4.

## Global Constraints

- **Node 22.x**, `server/` is `"type": "commonjs"` — use `require`, not `import`. **Test files are a third shape: Vitest cannot be `require`d.** Copy the header from `server/__tests__/importConcepts.test.js` (`import` for vitest/node builtins + `createRequire(import.meta.url)` for server modules).
- **`better-sqlite3` resolves only from under `server/`.** Every new file in this plan lives under `server/`.
- **Resolve paths against `__dirname`/`resolveDbPath()`, never `process.cwd()`.**
- **Run `npm test` from the repo root.** It is `vitest run` and does **not** run Playwright; E2E is `server/`'s `test:e2e`, a separate CI job.
- **`vitest.config.js` sets `fileParallelism: false`** — a test that leaks shared state poisons every later file.
- **`grep -a` for every census** (CLAUDE.md § Commands: committed files contain NUL bytes and plain grep reports nothing).
- 🔴 **No BÍN bytes may be committed, test fixtures included.** Paradigm values are BÍN-derived. Assert on *shape and behaviour*, never on a committed inflected form. `tools/data/` is gitignored on both boxes.
- 🔴 **Do not add `inflections` to any glossary export payload** (§C41/D6). The column currently has no reader; this plan adds exactly one, on the editor path.
- **Do not push to `main` from a dev session unless you also deploy** — it strands prod's content backup.
- Branch from `spec/c36-b4b1-matcher-cutover`. One PR.

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `server/lib/conceptMatcher.js` | The concept-backed data source: distinct-EN automaton entries (D4.2), the entry-set fingerprint, and the paradigm lookup. Keeps this logic out of the already-large `terminologyService.js` and makes it unit-testable without the service singleton. |
| **Create** `server/__tests__/conceptMatcher.test.js` | Unit tests for the above, on `freshMigratedDb`. |
| **Modify** `server/services/terminologyService.js` | `findTermsInSegments` + the two wrappers; delete `fingerprintHeadwords` (moves to `conceptMatcher`). |
| **Modify** `server/services/segmentEditorService.js:295,344` | Forward the already-declared `chapter` parameter. |
| **Modify** `server/routes/segment-editor.js:1002` | Forward `req.chapterNum`. |
| **Modify** `server/__tests__/terminologyService.test.js`, `findTermsGolden.test.js`, `findTermsDifferential.test.js` | Re-point; add positive controls to absence assertions. |
| **Create** `server/scripts/verify-b4b1-gates.js` | Corpus gates 1–8 + `--self-test`. Properties no unit test can express. |
| **Modify** `server/scripts/bench-c24.js` | Memory/latency at the biology scope. |
| **Modify** `server/e2e/terminology-multibook.spec.js` | The cross-response id assertion; stop accepting 500. |

---

### Task 1: Accept a chapter, reject a sentinel word — inert

Adds the parameter and its guard. **Nothing reads it yet**, so this task's review question has a checkable answer: *did behaviour change?* No.

**Files:**
- Modify: `server/services/terminologyService.js` (the three signatures, ~1390, ~1877, ~1891)
- Modify: `server/services/segmentEditorService.js:295`, `:344`
- Modify: `server/routes/segment-editor.js:1002`
- Test: `server/__tests__/terminologyService.test.js` (new describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: `findTermsInSegments(segments, bookSlug = null, chapter)`, `checkSegmentConsistency(enContent, isContent, bookSlug = null, segmentId = 'seg', chapter)`, `buildModuleTerminologyReport(segments, bookSlug = null, chapter)`. All three take `chapter` **last**, so existing callers are unaffected. Also exports `normalizeChapterArg(chapter) → number`.

- [ ] **Step 1: Write the failing test**

In `server/__tests__/terminologyService.test.js`, append:

```js
describe('normalizeChapterArg() — the sentinel WORD is the hazard, not the string type', () => {
  it('defaults an omitted chapter to 0, the book-default sentinel', () => {
    expect(terminologyService.normalizeChapterArg(undefined)).toBe(0);
  });
  it('accepts -1, the appendices sentinel', () => {
    expect(terminologyService.normalizeChapterArg(-1)).toBe(-1);
  });
  it('accepts an integer-like string, because req params and argv are strings', () => {
    expect(terminologyService.normalizeChapterArg('3')).toBe(3);
  });
  // THE CONTROL: each of these silently returns book-default rows if passed
  // through to buildPreferenceMap's `chapter IN (0, ?)`. They must throw.
  it.each([['appendices'], [null], [Number.NaN], [3.5], ['ch03']])(
    'throws on %p rather than silently answering from the book default',
    (bad) => {
      expect(() => terminologyService.normalizeChapterArg(bad)).toThrow(/chapter must be an integer/);
    }
  );
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t normalizeChapterArg`
Expected: FAIL — `terminologyService.normalizeChapterArg is not a function`.

- [ ] **Step 3: Implement**

In `server/services/terminologyService.js`, above `findTermsInSegments`:

```js
/**
 * Normalise a caller-supplied chapter for conceptResolver.buildScope.
 *
 * ⚠️ THE CAST IS NOT THE POINT — SQLite already does it correctly. `book_term_
 * preference.chapter` is INTEGER, so `chapter IN (0, ?)` bound with '3' returns
 * the same rows as 3 (column affinity, measured 2026-08-10). The hazard is the
 * SENTINEL WORD: 'appendices', null and undefined all return the chapter-0
 * book-default rows with NO throw, silently dropping every appendices-scoped
 * override. So this guard REJECTS rather than coerces.
 *
 * 0 = book default, -1 = appendices (chapterLabel's sentinel).
 */
function normalizeChapterArg(chapter) {
  if (chapter === undefined) return 0;
  if (typeof chapter === 'number' && Number.isInteger(chapter)) return chapter;
  if (typeof chapter === 'string' && /^-?\d+$/.test(chapter)) return Number(chapter);
  throw new TypeError(
    `chapter must be an integer (0 = book default, -1 = appendices), got ${JSON.stringify(chapter)}`
  );
}
```

Change the three signatures and forward the value (still unused downstream):

```js
function findTermsInSegments(segments, bookSlug = null, chapter) {
  const db = getDb();
  const chapterNum = normalizeChapterArg(chapter); // eslint-disable-line no-unused-vars -- Task 4 consumes it
```

```js
function checkSegmentConsistency(enContent, isContent, bookSlug = null, segmentId = 'seg', chapter) {
  const res = findTermsInSegments([{ segmentId, enContent, isContent }], bookSlug, chapter);
```

```js
function buildModuleTerminologyReport(segments, bookSlug = null, chapter) {
  const res = findTermsInSegments(segments, bookSlug, chapter);
```

Add `normalizeChapterArg` to `module.exports`.

- [ ] **Step 4: Thread the chapter at the three production call sites**

`server/services/segmentEditorService.js:295` — `chapter` is already parameter #2 and unused:

```js
  return terminologyService.checkSegmentConsistency(enContent, editedContent, book, segmentId, chapter);
```

`server/services/segmentEditorService.js:344` — same:

```js
  const violations = terminologyService.buildModuleTerminologyReport(segments, book, chapter);
```

`server/routes/segment-editor.js:1002` — `req.chapterNum` is already read at :990:

```js
      const termMatches = terminology.findTermsInSegments(segments, req.params.book, req.chapterNum);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/terminologyService.test.js server/__tests__/findTermsGolden.test.js`
Expected: PASS, including the new block and the **unchanged** C24 golden — the parameter is inert.

- [ ] **Step 6: Commit**

```bash
git add server/services/terminologyService.js server/services/segmentEditorService.js \
        server/routes/segment-editor.js server/__tests__/terminologyService.test.js
git commit -m "feat(B4b-1): accept a chapter and reject the sentinel word — inert

The three signatures gain chapter LAST, so no existing caller changes. The
guard rejects rather than coerces: SQLite's column affinity already handles
'3' vs 3 correctly, while 'appendices', null and undefined silently return
chapter-0 book-default rows with no throw."
```

---

### Task 2: `conceptMatcher.loadEnglishEntries` — one entry per distinct English string

Implements **D4.2**. Two `concept_term` rows sharing an English string must produce **one** automaton entry, or both match the same span and the overlap tiler drops one by arrival order — a row order deciding an editorial answer (§C18). 18.9% of English strings are carried by more than one concept, so this is a fifth of the corpus, not an edge case.

**Files:**
- Create: `server/lib/conceptMatcher.js`
- Test: `server/__tests__/conceptMatcher.test.js`

**Interfaces:**
- Consumes: Task 1's nothing.
- Produces:
  - `loadEnglishEntries(db) → { entries: Array<{headwordId: number, english: string}>, englishById: Map<number,string>, fingerprint: number }` — `headwordId` is the **lowest `concept_term.id`** for that English string.
  - `fingerprintEntries(entries) → number` — FNV-1a, moved verbatim from `terminologyService.fingerprintHeadwords`.
  - `PLACEHOLDER_TEXT = '[vantar]'`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/conceptMatcher.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { loadEnglishEntries, fingerprintEntries } = require('../lib/conceptMatcher');

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db && db.close());

function addConcept(domain = 'chemistry') {
  return db.prepare("INSERT INTO concept (domain) VALUES (?)").run(domain).lastInsertRowid;
}
// ⚠️ `source` is TEXT NOT NULL (migration 045:45) — omit it and every insert
// dies on a NOT NULL constraint. Nothing outside the importer reads the column,
// so a fixture literal is safe.
function addTerm(conceptId, lang, text, rank = 1) {
  return db
    .prepare("INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,'test')")
    .run(conceptId, lang, text, rank).lastInsertRowid;
}

describe('loadEnglishEntries() — D4.2, one entry per DISTINCT English string', () => {
  it('collapses two concepts sharing an English string to ONE entry', () => {
    const a = addConcept('chemistry');
    const b = addConcept('biology');
    const first = addTerm(a, 'en', 'nucleus');
    addTerm(b, 'en', 'nucleus');
    const { entries } = loadEnglishEntries(db);
    expect(entries.filter((e) => e.english === 'nucleus')).toHaveLength(1);
    expect(entries.find((e) => e.english === 'nucleus').headwordId).toBe(Number(first));
  });

  it('keeps the LOWEST term id, so the handle is stable across re-reads', () => {
    const a = addConcept();
    const b = addConcept();
    const low = addTerm(a, 'en', 'bond');
    addTerm(b, 'en', 'bond');
    expect(loadEnglishEntries(db).entries.find((e) => e.english === 'bond').headwordId).toBe(Number(low));
  });

  it('is case-SENSITIVE, because concept_term lookup is binary-exact', () => {
    const a = addConcept();
    addTerm(a, 'en', 'Cell');
    addTerm(addConcept(), 'en', 'cell');
    const { entries } = loadEnglishEntries(db);
    expect(entries.filter((e) => e.english.toLowerCase() === 'cell')).toHaveLength(2);
  });

  it('ignores Icelandic rows entirely', () => {
    const a = addConcept();
    addTerm(a, 'is', 'frumeind');
    expect(loadEnglishEntries(db).entries).toHaveLength(0);
  });

  it('englishById maps every entry id back to its string', () => {
    const a = addConcept();
    const id = addTerm(a, 'en', 'atom');
    const { englishById } = loadEnglishEntries(db);
    expect(englishById.get(Number(id))).toBe('atom');
  });
});

describe('fingerprintEntries() — it must track what the AUTOMATON is built from', () => {
  const E = (id, english) => ({ headwordId: id, english });

  it('changes when an English string is added', () => {
    expect(fingerprintEntries([E(1, 'a')])).not.toBe(fingerprintEntries([E(1, 'a'), E(2, 'b')]));
  });
  it('changes when an English string is renamed', () => {
    expect(fingerprintEntries([E(1, 'a')])).not.toBe(fingerprintEntries([E(1, 'z')]));
  });
  // C24's transposition test, carried across: an order-blind XOR fold would miss this.
  it('changes on a pure transposition', () => {
    expect(fingerprintEntries([E(1, 'atom')])).not.toBe(fingerprintEntries([E(1, 'atmo')]));
  });
  it('is stable for an identical entry list', () => {
    expect(fingerprintEntries([E(1, 'a'), E(2, 'b')])).toBe(fingerprintEntries([E(1, 'a'), E(2, 'b')]));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run server/__tests__/conceptMatcher.test.js`
Expected: FAIL — `Cannot find module '../lib/conceptMatcher'`.

- [ ] **Step 3: Implement**

Create `server/lib/conceptMatcher.js`:

```js
/**
 * §C36 B4b-1 — the concept-backed data source for findTermsInSegments.
 *
 * Why this is a module and not three functions in terminologyService: the
 * service is already ~2,100 lines, and these are the only parts of the
 * cut-over that can be unit-tested without its DB singleton.
 */

/** §C43: 201 concepts carry this as their ONLY Icelandic term, so it is their
 *  head form and resolve() returns it as a winner with integrity: []. It must
 *  never reach an editor. Filtering here does NOT close §C43. */
const PLACEHOLDER_TEXT = '[vantar]';

/**
 * FNV-1a over the (id, english) pairs, in SQL row order.
 *
 * ⚠️ MOVED HERE FROM terminologyService.fingerprintHeadwords, AND THE MOVE IS
 * THE POINT (spec §7.3). There it hashed `terminology_headwords` while the
 * automaton was built from the same array — a coupling that was structural and
 * so never asserted. Build the automaton from concept EN strings while the
 * fingerprint still reads the old table and editorial changes NEVER invalidate
 * the cache: stale matches for the whole process lifetime, and all four
 * existing cache tests pass anyway. Returning it from loadEnglishEntries,
 * computed over the very array that is returned, makes the coupling structural
 * again instead of a convention.
 *
 * ⚠️ The NUL separators are load-bearing: with no separator [[1,'a'],[2,'b']]
 * and [[1,'a2 b']] collide, and a SPACE is worse because a space is legal
 * inside a term. `\0` here is the two-character JS escape, not a raw NUL byte —
 * a raw byte would make this file binary to grep (CLAUDE.md § Commands).
 *
 * ⚠️ The 0x01000193 multiply is load-bearing: replacing it with 1 degrades this
 * to an order-blind XOR fold, under which 'atom' → 'atmo' would NOT invalidate.
 */
function fingerprintEntries(entries) {
  let hash = 0x811c9dc5;
  for (const { headwordId, english } of entries) {
    const chunk = `${headwordId}\0${english}\0`;
    for (let i = 0; i < chunk.length; i++) {
      hash ^= chunk.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash;
}

/**
 * One automaton entry per DISTINCT English string (spec D4.2).
 *
 * ⚠️ NOT one per concept_term ROW. 18.9% of English strings are carried by more
 * than one concept; one entry per row makes both ids match the SAME span, and
 * findTermsInSegments's `consumed` tiler then drops whichever arrives second —
 * a database row order deciding an editorial answer, which is §C18's defect.
 * The homograph choice belongs to resolve(), which has domain priority, the
 * book preference and rank to decide it with.
 *
 * ⚠️ MIN(id) rather than any id: the handle must be stable across re-reads, or
 * the fingerprint changes when nothing did.
 *
 * ⚠️ Case-SENSITIVE, deliberately. conceptResolver.lookupCandidates matches
 * `text = ?` exactly and relies on idx_concept_term_lookup; a COLLATE NOCASE
 * grouping here would hand it a string it cannot find. The automaton folds case
 * downstream via foldString — that is a THIRD identity, and gate 4 is what
 * proves the three agree.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{entries: Array<{headwordId:number, english:string}>,
 *            englishById: Map<number,string>, fingerprint: number}}
 */
function loadEnglishEntries(db) {
  const rows = db
    .prepare(
      `SELECT MIN(id) AS id, text
         FROM concept_term
        WHERE lang = 'en'
        GROUP BY text
        ORDER BY LENGTH(text) DESC, id ASC`
    )
    .all();

  const entries = [];
  const englishById = new Map();
  for (const r of rows) {
    entries.push({ headwordId: r.id, english: r.text });
    englishById.set(r.id, r.text);
  }
  return { entries, englishById, fingerprint: fingerprintEntries(entries) };
}

module.exports = { loadEnglishEntries, fingerprintEntries, PLACEHOLDER_TEXT };
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/conceptMatcher.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptMatcher.js server/__tests__/conceptMatcher.test.js
git commit -m "feat(B4b-1): conceptMatcher — one automaton entry per distinct English string

D4.2. One entry per ROW would make two ids match the same span, and the
overlap tiler would drop whichever arrived second — a row order deciding an
editorial answer, over the 18.9% of English strings carried by more than one
concept. The homograph choice belongs to resolve().

fingerprintEntries moves here from terminologyService and is returned by
loadEnglishEntries, computed over the array it returns, so the fingerprint is
structurally coupled to what the automaton is built from (spec 7.3)."
```

---

### Task 3: The paradigm lookup

The one new read of `concept_term.inflections`. The BÍN population op wrote **27,728 rows**; ~70% of Icelandic rows still have none, so the `null` path is the common one and must be cheap and correct.

**Files:**
- Modify: `server/lib/conceptMatcher.js`
- Test: `server/__tests__/conceptMatcher.test.js`

**Interfaces:**
- Consumes: Task 2's module.
- Produces: `prepareParadigmStatement(db) → Statement`, `paradigmFor(stmt, termId) → string[]` (empty array when absent or unparseable).

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/conceptMatcher.test.js`:

```js
const { prepareParadigmStatement, paradigmFor } = require('../lib/conceptMatcher');

describe('paradigmFor() — the "no paradigm" path is the COMMON one', () => {
  let stmt;
  beforeEach(() => {
    stmt = prepareParadigmStatement(db);
  });

  it('returns [] when inflections is NULL — ~70% of Icelandic rows', () => {
    const t = addTerm(addConcept(), 'is', 'kúvetta');
    expect(paradigmFor(stmt, Number(t))).toEqual([]);
  });

  it('returns the stored forms when present', () => {
    const t = addTerm(addConcept(), 'is', 'x');
    db.prepare('UPDATE concept_term SET inflections = ? WHERE id = ?').run('["xs","xi"]', t);
    expect(paradigmFor(stmt, Number(t))).toEqual(['xs', 'xi']);
  });

  // THE VALUE THAT ACTUALLY BREAKS THE IDIOM. '[]' is safe (truthy, parses to
  // []); the four-byte string 'null' is truthy, parses to a non-iterable, and
  // [text, ...null] throws TypeError. The B4b-0b producer never writes it —
  // this guards a FUTURE writer.
  it('returns [] for the literal string "null" instead of throwing', () => {
    const t = addTerm(addConcept(), 'is', 'y');
    db.prepare('UPDATE concept_term SET inflections = ? WHERE id = ?').run('null', t);
    expect(() => paradigmFor(stmt, Number(t))).not.toThrow();
    expect(paradigmFor(stmt, Number(t))).toEqual([]);
  });

  it.each([['[]'], ['{}'], ['123'], ['not json']])('returns [] for %p', (bad) => {
    const t = addTerm(addConcept(), 'is', `z${bad.length}`);
    db.prepare('UPDATE concept_term SET inflections = ? WHERE id = ?').run(bad, t);
    expect(paradigmFor(stmt, Number(t))).toEqual([]);
  });

  it('returns [] for an unknown term id rather than throwing', () => {
    expect(paradigmFor(stmt, 999999)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run server/__tests__/conceptMatcher.test.js -t paradigmFor`
Expected: FAIL — `prepareParadigmStatement is not a function`.

- [ ] **Step 3: Implement**

Append to `server/lib/conceptMatcher.js`, before `module.exports`:

```js
/**
 * Hoisted per scope, not prepared per call — B1 gate 4 measured preparing
 * per call at 4.2x the wall time and 21.7x the resident memory.
 */
function prepareParadigmStatement(db) {
  return db.prepare('SELECT inflections FROM concept_term WHERE id = ?');
}

/**
 * The stored BÍN paradigm for one Icelandic term, or [].
 *
 * ⚠️ [] IS THE CORRECT DEGRADATION, NOT A FAILURE. buildInflectionRegex(text, [])
 * yields a correct base-form word-boundary regex, and ~70% of Icelandic rows
 * have no paradigm (71.18% of strings are absent from BÍN, plus 18,299
 * multi-word rows the producer skips permanently). The register's ruling is
 * explicit: degrade to base-form matching rather than report a fault.
 *
 * ⚠️ NEVER THROW. `'[]'` is truthy and parses to [] harmlessly, but the
 * four-byte string `'null'` is truthy, parses to a non-iterable, and
 * `[text, ...null]` throws TypeError inside a request. The B4b-0b producer
 * writes only non-empty JSON arrays; this guards a future writer.
 */
function paradigmFor(stmt, termId) {
  const row = stmt.get(termId);
  if (!row || !row.inflections) return [];
  try {
    const parsed = JSON.parse(row.inflections);
    return Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string' && f) : [];
  } catch {
    return [];
  }
}
```

Extend the export: `module.exports = { loadEnglishEntries, fingerprintEntries, prepareParadigmStatement, paradigmFor, PLACEHOLDER_TEXT };`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/conceptMatcher.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptMatcher.js server/__tests__/conceptMatcher.test.js
git commit -m "feat(B4b-1): the paradigm lookup — [] is the correct degradation

The only new read of concept_term.inflections. Returns [] for absent,
unparseable and non-array values, and never throws: '[]' is harmless but the
four-byte string 'null' parses to a non-iterable and would throw TypeError
inside a request."
```

---

### Task 4: The cut-over — matches

Replaces the old-table query and the tier partition. **Issues are deliberately deferred to Task 5**, so this task's diff answers one question: *does the matcher still find the same spans?*

**Files:**
- Modify: `server/services/terminologyService.js` (`findTermsInSegments`, delete `fingerprintHeadwords`)
- Test: `server/__tests__/terminologyService.test.js`

**Interfaces:**
- Consumes: `loadEnglishEntries`, `prepareParadigmStatement`, `PLACEHOLDER_TEXT` (Tasks 2–3); `buildScope(db, bookSlug, chapter)` and `resolve(scope, english)` from `conceptResolver`; `buildTermAutomaton(entries)` and `findFirstOccurrences(automaton, text)` from `termAutomaton`.
- Produces: each match is `{ headwordId, english, icelandic, subjects, status, isPrimary, isFallback, position, translations }` — **the same keys as today**, so no client changes. `headwordId` is `concept_term.id` of the English row; `subjects` is `[domain]`; `status` is `'approved'` (see the comment in the code); `translations` carries the winner plus `alsoInScope`.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/terminologyService.test.js`. **Use `freshMigratedDb`, not `createTestDb`** — the latter builds 7 tables and none of the concept tables, and `buildScope` *throws* `no such table: book_domain_priority` against it.

First add the two requires this file does not yet have (it uses `createRequire`; follow the existing header):

```js
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { seedBooks } = require('../scripts/lib/scratchCorpus');
```

⚠️ `seedBooks(db)` registers all six books **and** their `book_domain_priority` rows from `server/lib/domains.js`. Without it `buildScope` returns `{unscoped:'unregistered'}` and every match resolves to nothing — a whole block that passes for the wrong reason.

```js
describe('findTermsInSegments() — concept model (B4b-1)', () => {
  let cdb;
  beforeEach(() => {
    ({ db: cdb } = freshMigratedDb());
    seedBooks(cdb); // server/scripts/lib/scratchCorpus.js — registers the 6 books + priorities
    terminologyService._setTestDb(cdb);
  });
  afterEach(() => {
    terminologyService._setTestDb(null);
    cdb && cdb.close();
  });

  it('matches an English term and emits the resolved Icelandic', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'An atom is small.', isContent: 'Frumeind er lítil.' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toHaveLength(1);
    expect(r.s1.matches[0]).toMatchObject({ english: 'atom', icelandic: 'frumeind', isFallback: false });
    expect(r.s1.matches[0].position).toBe(3);
  });

  // THE OVERLAP TILER — the property that must survive the cut-over.
  it('a longer term claims its span and the shorter overlapping one is dropped', () => {
    const a = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, a, 'en', 'melting point');
    addTermIn(cdb, a, 'is', 'bræðslumark');
    const b = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, b, 'en', 'melting');
    addTermIn(cdb, b, 'is', 'bráðnun');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'The melting point is high.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches.map((m) => m.english)).toEqual(['melting point']);
  });

  // D4.2 — the same English string on two concepts is ONE match, and which
  // one wins comes from resolve(), not from row order.
  it('emits ONE match for an English string carried by two concepts', () => {
    const chem = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, chem, 'en', 'nucleus');
    addTermIn(cdb, chem, 'is', 'kjarni');
    const bio = addConceptIn(cdb, 'biology');
    addTermIn(cdb, bio, 'en', 'nucleus');
    addTermIn(cdb, bio, 'is', 'frumukjarni');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'The nucleus.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toHaveLength(1);
    expect(r.s1.matches[0].icelandic).toBe('kjarni'); // chemistry book -> chemistry domain
  });

  // Item-18 semantics: a foreign-domain-only term still MATCHES, badged.
  // ⚠️ `mathematics` is the right domain to test with, and not an arbitrary
  // one: efnafraedi-2e's chain is ['chemistry','physics','biology'], and
  // domains.js says in as many words that mathematics is "deliberately absent
  // from the chemistry books ... out of scope on purpose, not by oversight".
  // A made-up domain would also be out of scope, but would not prove the rule.
  it('an out-of-scope concept still matches, flagged isFallback', () => {
    const c = addConceptIn(cdb, 'mathematics');
    addTermIn(cdb, c, 'en', 'eigenvalue');
    addTermIn(cdb, c, 'is', 'eigingildi');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'An eigenvalue.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches[0]).toMatchObject({ english: 'eigenvalue', isFallback: true });
  });

  // D7 / §C43.
  it('never emits a match whose winner is the [vantar] placeholder', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'abembryonic pole');
    addTermIn(cdb, c, 'is', '[vantar]');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'The abembryonic pole.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toEqual([]);
  });

  it('returns empty for a segment with no EN content, without querying', () => {
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: '', isContent: 'x' }],
      'efnafraedi-2e'
    );
    expect(r.s1).toEqual({ matches: [], issues: [] });
  });
});
```

Add these helpers near the top of the file (they mirror Task 2's):

```js
function addConceptIn(db, domain) {
  return Number(db.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid);
}
// ⚠️ `source` is TEXT NOT NULL (migration 045:45). Nothing outside the importer
// reads it, so a fixture literal is safe — but omitting it fails every insert.
function addTermIn(db, conceptId, lang, text, rank = 1) {
  return Number(
    db.prepare("INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,'test')")
      .run(conceptId, lang, text, rank).lastInsertRowid
  );
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "concept model"`
Expected: FAIL — matches are empty, because the implementation still reads `terminology_headwords`.

- [ ] **Step 3: Replace the body of `findTermsInSegments`**

Delete `fingerprintHeadwords` (it moved to `conceptMatcher`) and replace everything from the `const headwords = db.prepare(...)` query down to `const automaton = _automatonCache.automaton;`:

```js
const { buildScope, resolve } = require('../lib/conceptResolver');
const {
  loadEnglishEntries,
  prepareParadigmStatement,
  paradigmFor,
  PLACEHOLDER_TEXT,
} = require('../lib/conceptMatcher');
```

```js
function findTermsInSegments(segments, bookSlug = null, chapter) {
  const db = getDb();
  const chapterNum = normalizeChapterArg(chapter);

  // ⚠️ An unregistered book yields {unscoped}. resolve() handles it and returns
  // no winner, so every term becomes a non-issue match — the same posture as
  // today's null bookSubject, which made every translation tier 'in-scope'.
  const scope = bookSlug ? buildScope(db, bookSlug, chapterNum) : { unscoped: 'unregistered' };
  const paradigmStmt = prepareParadigmStatement(db);

  // ⚠️ ONE GLOBAL AUTOMATON, exactly as before. The old term SQL was unfiltered
  // too and all scoping happened after; keeping that means the single-slot
  // cache still works and NO scope-keyed cache is needed. Per-book scoping is
  // resolve()'s job.
  const { entries, englishById, fingerprint } = loadEnglishEntries(db);
  if (!_automatonCache || _automatonCache.fingerprint !== fingerprint) {
    // Drop the old automaton BEFORE building the new one: the object literal
    // evaluates fully before the assignment, so without this two automata are
    // live at once. Safe because this function is fully synchronous — if it
    // ever becomes async this is a correctness bug, not an optimisation.
    _automatonCache = null;
    _automatonCache = { fingerprint, automaton: buildTermAutomaton(entries) };
  }
  const automaton = _automatonCache.automaton;

  // ⚠️ MEMOISE resolve() ACROSS THE WHOLE CALL, keyed on the English string.
  // Without this, resolve() runs once per (segment × hit) and each call is a DB
  // lookup through lookupCandidates. The golden fixture's ~40 matches make that
  // look free; a real module has hundreds of segments, and C24 exists because
  // this function took the server down for ~3 minutes per call at production
  // scale. The scope is fixed for the whole invocation, so one English string
  // has one answer.
  //
  // SOUND, and verified rather than assumed: nothing in conceptResolver assigns
  // to `scope` or mutates `scope.preference`/`scope.positionOf` (grepped; the
  // control finds 18 reads, so the search is live), and this function is fully
  // synchronous, so no concurrent write can land mid-call. ⚠️ If this function
  // ever becomes async, this cache — like the automaton one below — turns into
  // a correctness bug.
  const resolved = new Map();
  const resolveOnce = (english) => {
    let r = resolved.get(english);
    if (r === undefined) {
      r = resolve(scope, english);
      resolved.set(english, r);
    }
    return r;
  };

  const result = {};
  for (const seg of segments) {
    const matches = [];
    const issues = [];
    if (!seg.enContent) {
      result[seg.segmentId] = { matches, issues };
      continue;
    }

    const firstByHeadword = findFirstOccurrences(automaton, seg.enContent);

    // ⚠️ RESOLVE FIRST, THEN ORDER, THEN TILE — and the order of those three is
    // the whole behaviour. Under the old model the tier was known from the SQL
    // row, so `terms` could be pre-partitioned; here the tier is only known
    // after resolve(). Tiling before resolving would let a fallback term claim
    // a span an in-scope term wanted, inverting item 18's rule that the book's
    // own domain always wins an overlap.
    const hits = [];
    for (const [headwordId, occ] of firstByHeadword) {
      const english = englishById.get(headwordId);
      const res = resolveOnce(english);
      // §C43 / D7: the placeholder is a well-formed head form that is not a
      // word. It must never reach an editor. This does NOT close §C43.
      if (res.winner && res.winner.text === PLACEHOLDER_TEXT) continue;
      const isFallback = !res.winner;
      if (isFallback && res.outOfScope.length === 0) continue; // nothing to offer
      hits.push({ headwordId, english, occ, res, isFallback });
    }

    hits.sort(
      (a, b) =>
        Number(a.isFallback) - Number(b.isFallback) || // in-scope claims spans first
        b.english.length - a.english.length || // "melting point" before "melting"
        a.headwordId - b.headwordId // deterministic; the golden rests on it
    );

    const consumed = [];
    for (const hit of hits) {
      const start = hit.occ.index;
      const end = start + hit.occ.length;
      if (consumed.some((r) => start < r.end && end > r.start)) continue;
      consumed.push({ start, end });

      const winner = hit.res.winner;
      const alts = hit.res.alsoInScope || [];
      // ⚠️ `status` HAS NO COUNTERPART in the concept model — concept_term has
      // no status column and lifecycle is written and read nowhere. The corpus
      // is Árnastofnun's, imported by an operator, so every term is the
      // equivalent of 'approved'. Emitted as a constant to keep the response
      // shape stable for the existing client; do not read it as provenance.
      matches.push({
        headwordId: hit.headwordId,
        english: hit.english,
        icelandic: winner ? winner.text : (hit.res.outOfScope[0] || {}).text || null,
        subjects: winner ? [winner.domain] : [],
        status: 'approved',
        isPrimary: Boolean(winner),
        isFallback: hit.isFallback,
        position: start,
        translations: (winner ? [winner, ...alts] : hit.res.outOfScope).map((t) => ({
          id: t.termId,
          icelandic: t.text,
          subjects: t.domain ? [t.domain] : [],
          status: 'approved',
          isPrimary: winner ? t.termId === winner.termId : false,
          isFallback: hit.isFallback,
        })),
      });
    }
    result[seg.segmentId] = { matches, issues };
  }
  return result;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "concept model"`
Expected: PASS, 6 tests. **Other blocks in this file and the golden will now FAIL — that is expected and Task 6 repairs them. Do not "fix" them by reverting this task.**

- [ ] **Step 5: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(B4b-1): cut findTermsInSegments over to the concept model — matches

One global automaton over distinct concept_term(lang='en') strings, exactly as
the old one was built over all headwords unfiltered; scoping happens after, in
resolve(), so the single-slot cache still works and no scope-keyed cache is
needed.

Resolve-then-order-then-tile is load-bearing: the tier is only known after
resolve(), so tiling first would let a fallback term claim a span an in-scope
term wanted, inverting item 18.

Issues are deferred to the next commit so this diff answers one question: does
the matcher still find the same spans?

Known-red until the next two tasks: the old-table test blocks and the C24
golden."
```

---

### Task 5: The `missing` issue, and the softer `alternative` tier

Implements **§2.2** and **D5**. The old check passes if the editor used **any** approved translation; the resolver returns **one** winner, so a legitimate rank-2 synonym starts failing. `alsoInScope` carries the material for a softer tier — this task emits it as data; the UI is B4c's.

**Files:**
- Modify: `server/services/terminologyService.js`
- Test: `server/__tests__/terminologyService.test.js`

**Interfaces:**
- Consumes: Task 4's `hits` loop.
- Produces: issues are `{ type: 'missing' | 'alternative', headwordId, english, expected, used?, message }`. `type: 'alternative'` is **new**; the existing client renders unknown types as nothing, which is the intended B4b-1 behaviour.

- [ ] **Step 1: Write the failing test**

```js
describe('findTermsInSegments() — the IS-side check (B4b-1)', () => {
  let cdb;
  beforeEach(() => {
    ({ db: cdb } = freshMigratedDb());
    seedBooks(cdb);
    terminologyService._setTestDb(cdb);
  });
  afterEach(() => {
    terminologyService._setTestDb(null);
    cdb && cdb.close();
  });

  const seg = (en, is) => [{ segmentId: 's1', enContent: en, isContent: is }];

  it('no issue when the resolved term appears in the Icelandic', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    const r = terminologyService.findTermsInSegments(seg('An atom.', 'Frumeind.'), 'efnafraedi-2e');
    expect(r.s1.issues).toEqual([]);
  });

  it('reports missing when it does not', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    const r = terminologyService.findTermsInSegments(seg('An atom.', 'Eitthvað annað.'), 'efnafraedi-2e');
    expect(r.s1.issues).toHaveLength(1);
    expect(r.s1.issues[0]).toMatchObject({ type: 'missing', english: 'atom', expected: 'frumeind' });
  });

  // D5 — the semantic narrowing, softened.
  it('reports `alternative`, not `missing`, when the editor used a rank-2 sibling', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind', 1);
    addTermIn(cdb, c, 'is', 'atóm', 2);
    const r = terminologyService.findTermsInSegments(seg('An atom.', 'Atóm er lítið.'), 'efnafraedi-2e');
    expect(r.s1.issues[0]).toMatchObject({ type: 'alternative', expected: 'frumeind', used: 'atóm' });
  });

  // THE PARADIGM PATH. This is the discrimination the C24 golden provably
  // lacks: strip every inflection from that fixture and it is byte-identical.
  it('a DECLINED form matches when a paradigm is stored', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'acid');
    const t = addTermIn(cdb, c, 'is', 'sýra');
    cdb.prepare('UPDATE concept_term SET inflections = ? WHERE id = ?').run('["sýru","sýrunni"]', t);
    const r = terminologyService.findTermsInSegments(seg('An acid.', 'Í sýrunni.'), 'efnafraedi-2e');
    expect(r.s1.issues).toEqual([]);
  });

  // THE CONTROL for the test above. Same segment, no paradigm -> reported.
  it('the same declined form is reported missing WITHOUT a paradigm', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'acid');
    addTermIn(cdb, c, 'is', 'sýra');
    const r = terminologyService.findTermsInSegments(seg('An acid.', 'Í sýrunni.'), 'efnafraedi-2e');
    expect(r.s1.issues[0]).toMatchObject({ type: 'missing' });
  });

  it('a fallback term never produces an issue — QA must not demand another domain’s term', () => {
    const c = addConceptIn(cdb, 'literature');
    addTermIn(cdb, c, 'en', 'metaphor');
    addTermIn(cdb, c, 'is', 'myndlíking');
    const r = terminologyService.findTermsInSegments(seg('A metaphor.', 'Ekkert.'), 'efnafraedi-2e');
    expect(r.s1.matches).toHaveLength(1);
    expect(r.s1.issues).toEqual([]);
  });

  it('no issue when there is no Icelandic content to check', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    expect(terminologyService.findTermsInSegments(seg('An atom.', ''), 'efnafraedi-2e').s1.issues).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "IS-side check"`
Expected: FAIL — `issues` is always `[]`.

- [ ] **Step 3: Implement**

Inside Task 4's tile loop, after `matches.push({...})`:

```js
      // ⚠️ FOUR GATES, and every prior estimate of this check's rate got the
      // unit wrong by ignoring them: not fallback, IS content present, a
      // winner exists, and the EN span was actually claimed (we are inside the
      // tiler, so that one is already true).
      if (hit.isFallback || !seg.isContent || !winner) continue;

      const matchesForm = (term) => {
        const re = buildInflectionRegex(term.text, paradigmFor(paradigmStmt, term.termId));
        re.lastIndex = 0; // the regex carries /g; without this alternate calls lie
        return re.test(seg.isContent);
      };

      if (matchesForm(winner)) continue;

      // D5: the resolver returns ONE winner, so a legitimate synonym would
      // start failing. Say "you used a known alternative" instead of "missing".
      const used = alts.find(matchesForm);
      issues.push(
        used
          ? {
              type: 'alternative',
              headwordId: hit.headwordId,
              english: hit.english,
              expected: winner.text,
              used: used.text,
              message: `„${hit.english}" → „${winner.text}" (notað: „${used.text}")`,
            }
          : {
              type: 'missing',
              headwordId: hit.headwordId,
              english: hit.english,
              expected: winner.text,
              message: `„${hit.english}" → „${winner.text}" fannst ekki`,
            }
      );
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "IS-side check"`
Expected: PASS, 7 tests — including the paradigm test **and its control**.

- [ ] **Step 5: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(B4b-1): the IS-side check — missing, plus a softer alternative tier

The old check passed if the editor used ANY approved translation; the resolver
returns one winner, so a legitimate rank-2 synonym would start failing. D5:
emit type:'alternative' with the term actually used. The existing client
renders unknown issue types as nothing, which is the intended behaviour until
B4c.

Includes the first test in this repo that DISCRIMINATES the paradigm path from
base-form matching — a declined form that matches with a stored paradigm and
is reported without one. The C24 golden is provably blind to this."
```

---

### Task 6: Repair the test suite — the green-forever classes

The cut-over **creates** a green-forever set. 88 runtime tests are in scope. Today a concept-model matcher run against `createTestDb()` dies loudly (`no such table: concept`); the danger arrives the moment the helper is extended.

**Files:**
- Modify: `server/__tests__/terminologyService.test.js`, `server/__tests__/findTermsGolden.test.js`, `server/__tests__/findTermsDifferential.test.js`, `server/__tests__/migration044.test.js`

- [ ] **Step 1: Give every absence assertion a positive control**

At least 9 tests are pure absence assertions that pass on an all-empty matcher result. For each — `terminologyService.test.js:602`, `:1142`, `:1152`, `:1162`, `:1348`, `:1356`, `:1373`, and the two golden segments `m001:para:fs-id0009` / `m001:para:fs-id0010` — add a control **in the same test**:

```js
    // CONTROL: without this, an all-empty matcher passes this test forever.
    const control = terminologyService.findTermsInSegments(
      [{ segmentId: 'ctl', enContent: 'An atom.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(control.ctl.matches.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Rename the fixture-shape tests so they stop reading as matcher coverage**

12 tests never call the service — they assert only the shape of checked-in JSON. Rename the describe from `c24 fixture realism` to `c24 fixture shape (does NOT exercise the matcher)` and add:

```js
// ⚠️ These assert the checked-in fixture's SHAPE. They call no service and are
// green regardless of what the matcher does. They are not matcher coverage.
```

- [ ] **Step 3: Retire the C24 golden as an oracle, keep it as a span pin**

The golden's `toEqual` covers 9 match fields; the id space and winner selection both change, so it cannot survive. **Do not regenerate it** — `capture-c24-golden.js`'s own header forbids re-running post-swap, and its refusal guard measures *magnitude, not provenance*, so it would not stop you.

Replace the deep-equality assertion with a **span-and-English** assertion over the same fixture, which is the property that genuinely survives:

```js
  it('claims the same spans, in the same order, as the C24 golden', () => {
    const actual = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
    for (const segmentId of Object.keys(golden)) {
      // position + english survive an id-space and winner-selection change;
      // icelandic, status, subjects and translations[] do not.
      expect(actual[segmentId].matches.map((m) => ({ english: m.english, position: m.position })))
        .toEqual(golden[segmentId].matches.map((m) => ({ english: m.english, position: m.position })));
    }
  });
```

Add above it:

```js
// ⚠️ THIS IS NO LONGER A MIGRATION ORACLE. B4b-1 changed the id space
// (concept_term.id) and the winner selection (one resolved term, not a ranked
// sibling list), so a toEqual against the committed golden cannot hold. What
// survives — and is worth pinning — is the automaton + overlap tiler: which
// spans are claimed, in which order. Left as a toEqual it would have been
// green forever over code nothing calls.
```

- [ ] **Step 4: Annotate the two differential tests and the 11 migration044 tests**

`findTermsDifferential.test.js`'s 2 tests survive the cut-over intact — which is exactly why they are **zero** evidence it worked. Add:

```js
// ⚠️ These test findFirstOccurrences directly and are UNAFFECTED by B4b-1.
// Their passing is not evidence the cut-over worked.
```

In `migration044.test.js`, add above the describe:

```js
// ⚠️ HALF OF MIGRATION 044'S STATED RATIONALE IS NOW FALSE, and no assertion
// here can see it: findTermsInSegments no longer resolves tiers through
// book_subject_mapping — it uses book_domain_priority, which is seeded from
// hardcoded maps in server/lib/domains.js. These 11 tests still correctly pin
// the migration's own behaviour; they no longer pin the matcher's.
```

- [ ] **Step 5: Fix the re-seeding trap**

`terminologyService.test.js`'s `beforeEach` clears only the four old tables. Concept rows from a ported test would leak forward through the whole file, and `fileParallelism: false` means into later files too. Extend it:

```js
  // ⚠️ The concept tables MUST be cleared too. This beforeEach cleared only the
  // four old tables; with fileParallelism: false a leak poisons every later file.
  for (const t of ['concept_term', 'concept', 'book_term_preference']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test` (from the repo root — it is the campaign's authoritative gate)
Expected: PASS, all files. Record the file/test counts in the PR body; **do not write them into any doc** (CLAUDE.md § One source of truth).

- [ ] **Step 7: Commit**

```bash
git add server/__tests__/
git commit -m "test(B4b-1): repair the suite — controls, honest names, and the golden's real property

The cut-over CREATES the green-forever set. Nine absence assertions gain a
positive control in the same test; twelve fixture-shape tests are renamed so
they stop reading as matcher coverage; the C24 golden is demoted from a
toEqual oracle to the span-and-order pin that actually survives an id-space and
winner-selection change, and is NOT regenerated — its capture script forbids
that and its refusal guard measures magnitude, not provenance.

Also fixes the re-seeding trap: the beforeEach cleared only the four old
tables, and with fileParallelism: false a concept-row leak poisons every later
file."
```

---

### Task 7: `verify-b4b1-gates.js` — the corpus properties no unit test can express

**Files:**
- Create: `server/scripts/verify-b4b1-gates.js`

**Interfaces:**
- Consumes: `buildCorpusDb(corpusDir)` and `seedBooks(db)` from `server/scripts/lib/scratchCorpus.js`; the matcher via a **cold child process** with `SESSIONS_DB_PATH`.
- Produces: exit 0 = all gates pass, 1 = any failed. `--self-test` plants each defect in the DATA on a copy of the scratch DB and requires each gate to DETECT it.

- [ ] **Step 1: Copy the structure from `verify-b4b0-gates.js`**

`record(id, verdict, measured)` printing immediately and accumulating into a module-level `results[]`; gates return booleans onto `ok[]`; `const failed = ok.filter((x) => !x).length; return failed ? 1 : 0;` and `if (require.main === module) process.exitCode = main();`. **Do not use `tools/lib/parseArgs.js`** — it silently drops unknown flags.

- [ ] **Step 2: Gate 1 — corpus fidelity, and STOP on divergence**

`scratchCorpus.js`'s header mandates it, and b4b0 enforces it. Assert `concept` 70,187 / `concept_term` 192,189 and, on divergence, `record('SETUP', 'FAIL', ...)` then `return finish()` — **do not continue**; every gate below measures this database.

- [ ] **Step 3: Gates 2–8**

| Gate | Measures | Its control, which must FAIL |
|---|---|---|
| 2 | every old headword resolves to a `concept_term` EN row | the reverse direction, which must **not** be 100% (it is ~32%) |
| 3 | **`missing`-issue volume, old vs new, at FIXTURE SCALE** — §5.1's unmeasured magnitude | a run with the IS side blanked, which must report **more** issues |
| 4 | the three folds agree over all 61,042 EN strings (`concept_term` binary · `foldString` · `nocaseKey`) | a planted `Ångström`/`ångström` pair, which must be **detected** |
| 5 | the fingerprint tracks the automaton's source: mutate a `concept_term` EN row in a **cold child process** and require the automaton to change | a mutation to a table the automaton does not read, which must **not** invalidate |
| 6 | `[vantar]` reaches no match and no issue | the 201 known concepts, all filtered |
| 7 | **the paradigm path is reached**: a declined form base-form matching must MISS and a paradigm must CATCH | the same segment with the paradigm removed, which must report `missing` |
| 8 | one automaton entry per distinct EN string; a homograph's winner comes from `resolve()` | one of the 11,553 multi-concept strings re-run with `hits` order reversed — the winner must not move |

🔴 **Gate 3 RUNS AT FIXTURE SCALE, AND ITS LABEL MUST SAY SO.** A production-scale old-arm does not exist locally: the concept import writes nothing to `terminology_headwords` and the dev DB holds 6. The available old-arm is `verify-b4b0-gates.js:131-160`'s `seedC24(db)`, which seeds the 316-headword c24 fixture into the scratch DB's old tables against the real migrated schema. **`record()` the gate as `GATE 3 (fixture scale, 316 headwords)`** — unlabelled it reads as corpus-scale and would quietly answer at 1/64th of it, which is the exact "say what a number covers in the same breath as the number" failure this plan is written to avoid. **If a corpus-scale figure is ever wanted, it is a read-only prod query, not this gate.**

⚠️ **Gate 5 must use cold child processes via `SESSIONS_DB_PATH`.** B4b-0b's recorded hazard: an in-process re-call against a warm cache re-reads nothing and byte-identity holds whatever the run did. `resolveDbPath()` reads the env var at call time, so a child needs no injection and exercises the production path.

⚠️ **Gate 4's fold check must not "fix" the disagreement by making `nocaseKey` Unicode-aware.** Its ASCII-only behaviour must match SQLite's `COLLATE NOCASE`; changing it re-opens §C18. The gate **reports**; it does not normalise.

- [ ] **Step 4: `--self-test`, and it must CALL the gates**

Copy `verify-b4b0-gates.js:729`'s `selfTest(dbPath, report)`: `fs.copyFileSync(dbPath, copy)`, plant the defect in the **data**, then invoke **the real gate function** and require `verdict.ok === false`.

```js
// ⚠️ THE SELF-TEST MUST CALL THE GATE, NOT RE-IMPLEMENT ITS ASSERTION.
// B4b-0b's first self-test hand-wrote the predicate beside the planted defect,
// so a gate whose assertion had been DELETED still reported DETECTED, and its
// GATE 2 case was a tautology. Plant in the DATA on a copy — never by
// sabotaging the source, which leaks if the revert is partial.
```

- [ ] **Step 5: Run it**

Run: `node server/scripts/verify-b4b1-gates.js --self-test` then `node server/scripts/verify-b4b1-gates.js`
Expected: self-test reports DETECTED for every gate; the real run exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/verify-b4b1-gates.js
git commit -m "test(B4b-1): the corpus gates — eight properties, each with a failing control

Properties no unit test can express: fold agreement over 61,042 EN strings,
issue-volume old vs new, the fingerprint tracking the automaton's source, and
the paradigm discrimination the committed suite provably lacks.

Gate 5 uses cold child processes via SESSIONS_DB_PATH — B4b-0b's recorded
hazard is that an in-process re-call against a warm cache re-reads nothing.
--self-test plants each defect in the DATA on a copy and calls the real gate."
```

---

### Task 8: Measure memory and latency — a deliverable, not a footnote

**No ceiling exists and none may be derived from C24's.** The code comment is explicit that 264–269 MB is not the trie's number, and that the *split* is unmeasured — so it is equally wrong to claim the trie's share is nil. **⚠️ The C24 benchmark's own scale is recorded as both 20,073 (code comment) and 20,272 (register), with two different RSS ranges. Do not quote either as a baseline.**

**Files:**
- Modify: `server/scripts/bench-c24.js`

- [ ] **Step 1: Add a standalone trie arm**

Open the scratch corpus, `SELECT` the distinct EN strings, take a baseline, call `buildTermAutomaton` **and nothing else**.

```js
// ⚠️ heapUsed after a forced global.gc() under --expose-gc, NOT a bare RSS
// delta. bench-prepare-arms.js runs two arms sequentially in one process and
// RSS does not shrink between them, so arm 2's delta is systematically
// understated while the script prints a ratio from exactly that.
global.gc();
const before = process.memoryUsage().heapUsed;
const automaton = buildTermAutomaton(entries);
global.gc();
console.log('trie heapUsed delta MB:', ((process.memoryUsage().heapUsed - before) / 1e6).toFixed(1));
```

- [ ] **Step 2: Budget on the BIOLOGY scope, and measure SEGMENT COUNT as its own arm**

47,568 in-scope distinct EN strings, **not** chemistry's 19,749. Re-measure the reference figure on the same box in the same run — B1's 0.044 ms/resolve is a **dev-box, cross-day** number.

⚠️ **Two independent axes, and only one of them is the term count.** The old matcher's cost scaled with terms; the new one also calls `resolve()` per distinct English hit, so **segment count is a second multiplier**. Task 4's memoisation is what bounds it — one resolve per distinct string per call, not per (segment × hit). **Measure a many-segment module explicitly** and report the two arms separately, or a term-count-only benchmark will look fine while a 300-segment module is the case that hurts.

- [ ] **Step 3: Say which scale every number came from**

A production-scale old-vs-new A/B is **not** available locally: the concept import writes nothing to the old tables and the dev DB holds 6 headwords. A **fixture-scale** A/B is — `verify-b4b0-gates.js:131-160`'s `seedC24(db)` seeds the c24 fixture into a scratch DB's old tables against the real migrated schema. Label every figure with its scale.

- [ ] **Step 4: Run and record**

Run: `node --expose-gc server/scripts/bench-c24.js <book> <chapter> <moduleId>`
Write the results to `test-results/b4b1-matcher-perf-2026-08.md` with the scale named beside every number. **No count goes into any prose doc.**

- [ ] **Step 5: Commit**

```bash
git add server/scripts/bench-c24.js test-results/b4b1-matcher-perf-2026-08.md
git commit -m "perf(B4b-1): measure the trie in isolation, at the biology scope

No memory ceiling existed and none could be derived from C24's 264-269 MB,
which its own comment says is not the trie's number. Isolates the trie with
heapUsed after a forced gc rather than a bare RSS delta, which
bench-prepare-arms.js's two-arms-one-process structure systematically
understates."
```

---

### Task 9: E2E — the one assertion `npm test` cannot see

**Files:**
- Modify: `server/e2e/terminology-multibook.spec.js`

- [ ] **Step 1: Fix the cross-response id assertion**

The E2E suite contains the **only** cross-response comparison of a matcher id anywhere: it asserts the matcher's `headwordId` equals the `term.id` returned by `POST /api/terminology`. No concept-model id can satisfy both endpoints — one mints a `terminology_headwords.id`, the other emits a `concept_term.id`. Replace it with an assertion on `english`, which is stable across both.

- [ ] **Step 2: Stop accepting a 500**

`terminology-multibook.spec.js:68-81` accepts a 500, so it goes green if the cut-over breaks the `/terms` route outright. Require `response.ok()`.

- [ ] **Step 3: Run E2E**

Run: `cd server && npm run test:e2e -- terminology-multibook`
Expected: PASS. ⚠️ **Kill anything on :3456 first.** ⚠️ A green root `npm test` is **never** evidence for this change.

- [ ] **Step 4: Commit**

```bash
git add server/e2e/terminology-multibook.spec.js
git commit -m "test(B4b-1): the E2E id assertion, and stop accepting a 500

The only cross-response comparison of a matcher id in the tree asserted it
equals POST /api/terminology's term.id; no concept-model id can satisfy both
endpoints. Re-pointed at english, which is stable across both. Also requires
response.ok() — the spec accepted a 500, so it went green if the terms route
broke outright. npm test cannot see either of these."
```

---

## Self-Review

**Spec coverage.** §2.1 `status` → Task 4's constant + comment. §2.2 narrowing → Task 5 (`alternative`). §2.3 `translations[]` → Task 4. §2.4 subjects/domains + `isFallback` → Task 4. §2.5 §C42's guard → no code; logged. §3/D1-a → the write-path gap is logged, not mitigated, per the ruling — **no code, deliberately**. §5/D3 degradation → Task 3 + Task 5's paradigm test and its control. §6/D4 id space → Task 2. §6.2 E2E + `terminology.html` → Task 9. §6.3/D4.1 three folds → gate 4. §7.1 golden blindness → Task 5's discriminating test **and** gate 7. §7.2 test classes → Task 6. §7.3 fingerprint → Task 2. §7.4 gates → Task 7. §7.5 memory → Task 8. §9/D5 → Task 5. §9/D6 chapter → Task 1. §9/D7 `[vantar]` → Task 4 + gate 6.

**Gap found and closed while reviewing:** the plan had no task for §2.5 or §3 because both are deliberately no-code. Stated explicitly above so a reader does not think they were forgotten.

**Placeholders:** none — every code step carries the actual code. Task 7's gates 2–8 are specified as a table plus the two hazards that make them falsifiable, with `verify-b4b0-gates.js` named as the structure to copy; the implementer writes eight gate bodies against that pattern rather than transcribing 400 lines from here.

**Type consistency:** `loadEnglishEntries` returns `{entries, englishById, fingerprint}` in Task 2 and is destructured with exactly those names in Task 4. `paradigmFor(stmt, termId)` is defined in Task 3 and called with `(paradigmStmt, term.termId)` in Tasks 4–5. `winner` is `{conceptId, termId, text, domain, position}` throughout, matching `conceptResolver.js:502-508`. `normalizeChapterArg` is named identically in Tasks 1 and 4. Issue objects carry `headwordId`/`english`/`expected`/`message` in both branches, `used` only on `alternative`.
