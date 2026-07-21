# Item 21 · PR-B — Árnastofnun added-terms seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a HEAD_EDITOR a downloadable, Árnastofnun-shaped seed of the project's *own* approved Icelandic terms that are **not already in Íðorðabankinn** — each row classified as a *new translation* or a *new alternative* to an existing Íðorðabankinn entry — closing audit finding #6c and completing campaign item 21.

**Architecture:** One new service function `terminologyService.getAddedTerms()` does the rights filter (`status='approved' ∧ idordabanki_id IS NULL ∧ source ∈ PROJECT_ORIGINATED_SOURCES`) with a second, per-headword lookup of the `idordabanki_id`-linked siblings to classify each surviving row (*new-translation* vs *new-alternative*) and surface the existing Íðorðabankinn anchor. A pure serializer lib `server/lib/arnastofnunSeed.js` renders the rows to CSV (with a formula-injection guard, external destination) or JSON (with a provenance note). A new `GET /api/terminology/added-terms/export` route (HEAD_EDITOR, registered **before** the parametric `/:id`) wires them; a HEAD_EDITOR-gated control on `terminology.html` downloads it.

**Tech Stack:** Node 22 CommonJS (`server/`), better-sqlite3, Express 5, Vitest. No new dependencies. Frontend is vanilla JS inline in `terminology.html`.

## Global Constraints

- **Design record:** `docs/superpowers/specs/2026-07-20-item21-tm-and-added-terms-export-design.md` — read its **"PR-B Amendments (2026-07-21 — lead decisions)"** block first; it supersedes §2.3/§B2/§B3. The five decisions it records are load-bearing here.
- **Rights filter (the product):** `status = 'approved'` **AND** `idordabanki_id IS NULL` **AND** `source IN PROJECT_ORIGINATED_SOURCES`, where
  `PROJECT_ORIGINATED_SOURCES = ['manual', 'mined-postedit', 'chapter-glossary', 'openstax-mt', 'openstax-glossary']`.
  These are the sources whose *Icelandic* is project-authored. Excluded on purpose: `idordabankinn`, `chemistry-association`, `chemistry-society-csv` (already in Íðorðabankinn), `imported-csv`, `imported-excel`, `merge-glossary` (indeterminate Icelandic origin). Mutation-check the constant.
- **Submission classification:** a row is `new-alternative` iff its headword has ≥1 sibling **known to be in Íðorðabankinn** — a sibling with `idordabanki_id IS NOT NULL` **OR** `source IN IN_IDORDABANKINN_SOURCES` (`idordabankinn`, `chemistry-association`, `chemistry-society-csv`). The lead confirmed those three are already in Íðorðabankinn, yet they carry a **NULL id** because the id is written only by the Íðorðabankinn *fetch* import — so id-presence alone would mislabel them `new-translation`. Else `new-translation`. For `new-alternative`: `existing_idordabanki_term` = those siblings' Icelandic (`'; '`-joined); `existing_idordabanki_id` = only the **non-null** ids among them (a chem-society sibling has no id to surface — do not fabricate one; an empty id on a new-alternative is honest). Detection is best-effort — stated in the JSON `provenance_note`.
- **`alternatives` = approved project-Icelandic siblings**, derived *within* the filtered kept set (siblings' `icelandic`, excl. self), `'; '`-joined in CSV / array in JSON. Maps to Árnastofnun's native `synonyms` field.
- **Auth = HEAD_EDITOR** (`requireAuth, requireRole(ROLES.HEAD_EDITOR)`). Relaying terms outward is a governance act, stricter than the plain glossary `/export` (which is `requireAuth`).
- **Route ordering:** the new `/added-terms/export` route MUST be registered **before** `router.get('/:id')` (line 367) or `/:id` captures `added-terms` as a headword id → 404. Place it in the pre-`/:id` "EXPORT" block (after `csvEscapeField`, line 277). This is an in-file documented hazard (comment at 197–199, 280–282).
- **CSV formula-injection guard is PR-B-local** (`csvSeedField` in `arnastofnunSeed.js`). Do **NOT** touch the shared `routes/terminology.js` `csvEscapeField` (would break the glossary export's byte-exact pins).
- **Attribution:** `proposed_by`/`approved_by` columns carry the human name (`proposed_by_name`/`approved_by_name`, falling back to the id).
- **Seed columns (CSV header, exact order):** `english,pos,definition_en,icelandic,definition_is,alternatives,subject,notes,source,submission_type,existing_idordabanki_term,existing_idordabanki_id,proposed_by,approved_by,approved_at`.
- **Tests use `createTestDb()`** (`server/__tests__/helpers/terminologyTestDb.js`) injected via `terminologyService._setTestDb(db)` — never live data. Every server test file sets `process.env.SESSIONS_DB_PATH` (temp) + `JWT_SECRET` **before** any server require (item-12 real-DB-pollution lesson).
- **Run the full suite from the repo root** (`npm test`) — authoritative gate; no branch protection. Baseline this branch starts from: **3235 passing / 226 files**.
- **Branch:** `feat/item21-prb-arnastofnun-added-terms`, cut from `main` (`a5871b60`). The spec amendment (already written) + this plan are committed as the first branch commit.

---

### Task 0: Branch + commit the spec amendment & this plan

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-item21-tm-and-added-terms-export-design.md` (amendment already written to the working tree)
- Create: `docs/superpowers/plans/2026-07-21-item21-prb-arnastofnun-added-terms.md` (this file)

- [ ] **Step 1: Cut the branch** (carries the uncommitted spec edit):

```bash
git checkout -b feat/item21-prb-arnastofnun-added-terms
```

- [ ] **Step 2: Commit the design docs**

```bash
git add docs/superpowers/specs/2026-07-20-item21-tm-and-added-terms-export-design.md \
        docs/superpowers/plans/2026-07-21-item21-prb-arnastofnun-added-terms.md
git commit -m "docs(item21-prb): spec amendment (Icelandic-origin source rule + submission model) + plan

Lead decisions 2026-07-21: source allowlist reversed to Icelandic-origin
(openstax-mt IN); alternatives = approved project-Icelandic siblings; per-row
new-translation/new-alternative classification + Íðorðabankinn anchor; CSV
formula-injection guard; attribution names. Resolves I21-R1."
```

---

### Task 1: `getAddedTerms()` + `PROJECT_ORIGINATED_SOURCES` in `terminologyService`

**Files:**
- Modify: `server/services/terminologyService.js` (new constant near `TERM_SOURCES` line 48; new function near `exportBookGlossary` line 1556; export both in `module.exports` line 1770)
- Test: `server/__tests__/terminologyAddedTerms.test.js` (new)

**Interfaces:**
- Consumes: `getDb()`, `getBookSubjectBySlug(db, slug)`, `subjectScopeClause(effectiveSubject, where, params)`, `TERM_STATUSES`/`TERM_SOURCES` (existing).
- Produces (consumed by Tasks 2/3):
  - `PROJECT_ORIGINATED_SOURCES: string[]` — the 5-source rights allowlist (exported constant).
  - `getAddedTerms({ subject?: string|null, book?: string|null }) → Array<Row>` where
    `Row = { english, pos, definitionEn, icelandic, definitionIs, alternatives: string[], subjects: string[], notes, source, submissionType: 'new-translation'|'new-alternative', existingIdordabankiTerm: string, existingIdordabankiId: string, proposedBy: string, approvedBy: string, approvedAt: string|null }`. Rows ordered by `english` then `icelandic` (NOCASE).

- [ ] **Step 1: Write the failing test** — `server/__tests__/terminologyAddedTerms.test.js`:

```js
/**
 * Item 21 PR-B — getAddedTerms() rights filter + submission classification.
 * Fixture DB via createTestDb + _setTestDb (never live data).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';

process.env.SESSIONS_DB_PATH = path.join(os.tmpdir(), `added-terms-${process.pid}.db`);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/terminologyTestDb');
const terminology = require('../services/terminologyService');

let db;

/** Insert a headword; return its id. */
function hw(english, { pos = null, definitionEn = null } = {}) {
  return Number(
    db
      .prepare('INSERT INTO terminology_headwords (english, pos, definition_en) VALUES (?, ?, ?)')
      .run(english, pos, definitionEn).lastInsertRowid
  );
}

/** Insert a translation; return its id. */
function tr(headwordId, icelandic, opts = {}) {
  const {
    source = 'manual',
    status = 'approved',
    idordabankiId = null,
    definitionIs = null,
    notes = null,
    proposedBy = 'u1',
    proposedByName = 'Editor One',
    approvedBy = 'he1',
    approvedByName = 'Head Editor',
    approvedAt = '2026-07-01T00:00:00Z',
    subjects = [],
  } = opts;
  const id = Number(
    db
      .prepare(
        `INSERT INTO terminology_translations
           (headword_id, icelandic, definition_is, notes, source, idordabanki_id, status,
            proposed_by, proposed_by_name, approved_by, approved_by_name, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(headwordId, icelandic, definitionIs, notes, source, idordabankiId, status,
        proposedBy, proposedByName, approvedBy, approvedByName, approvedAt).lastInsertRowid
  );
  for (const s of subjects) {
    db.prepare(
      'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
    ).run(id, s);
  }
  return id;
}

beforeEach(() => {
  db = createTestDb();
  terminology._setTestDb(db);
});
afterEach(() => {
  terminology._setTestDb(null);
  db.close();
});

describe('PROJECT_ORIGINATED_SOURCES', () => {
  it('is exactly the five Icelandic-origin sources (mutation-checked)', () => {
    expect(terminology.PROJECT_ORIGINATED_SOURCES).toEqual([
      'manual',
      'mined-postedit',
      'chapter-glossary',
      'openstax-mt',
      'openstax-glossary',
    ]);
  });
  it('excludes the already-in-Íðorðabankinn and indeterminate-origin sources', () => {
    for (const s of ['idordabankinn', 'chemistry-association', 'chemistry-society-csv',
      'imported-csv', 'imported-excel', 'merge-glossary']) {
      expect(terminology.PROJECT_ORIGINATED_SOURCES).not.toContain(s);
    }
  });
});

describe('getAddedTerms filter', () => {
  it('includes an approved, id-null, openstax-mt term (the reversed lead decision)', () => {
    const h = hw('adsorb');
    tr(h, 'aðsog', { source: 'openstax-mt' });
    const rows = terminology.getAddedTerms();
    expect(rows.map((r) => r.icelandic)).toEqual(['aðsog']);
  });

  it('excludes a proposed (unapproved) term', () => {
    const h = hw('atom');
    tr(h, 'frumeind', { status: 'proposed' });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });

  it('excludes a term already pulled from Íðorðabankinn (idordabanki_id set)', () => {
    const h = hw('mole');
    tr(h, 'mól', { idordabankiId: 931162 });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });

  it('excludes an idordabankinn-source term even with a null id', () => {
    const h = hw('base');
    tr(h, 'basi', { source: 'idordabankinn' });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });

  it('excludes an imported-csv term', () => {
    const h = hw('acid');
    tr(h, 'sýra', { source: 'imported-csv' });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });
});

describe('getAddedTerms submission classification', () => {
  it('labels a term new-translation when the headword has no id-linked sibling', () => {
    const h = hw('adsorb');
    tr(h, 'aðsog', { source: 'openstax-mt' });
    const [row] = terminology.getAddedTerms();
    expect(row.submissionType).toBe('new-translation');
  });

  it('labels a term new-alternative and surfaces the anchor when a sibling has an id', () => {
    const h = hw('mole');
    tr(h, 'mól', { source: 'manual' }); // project alternative (id null) -> KEPT
    tr(h, 'móleind', { source: 'idordabankinn', idordabankiId: 931162 }); // Íðorðabankinn's -> excluded, becomes anchor
    const rows = terminology.getAddedTerms();
    expect(rows).toHaveLength(1);
    expect(rows[0].submissionType).toBe('new-alternative');
    expect(rows[0].existingIdordabankiTerm).toBe('móleind');
    expect(rows[0].existingIdordabankiId).toBe('931162');
  });

  // The contradiction case (advisor catch): the lead confirmed chemistry-
  // association / -society terms are already IN Íðorðabankinn, yet they carry a
  // NULL idordabanki_id. An id-only classifier would mislabel this new-alternative
  // as new-translation. This test pins the fact into the classifier.
  it('labels new-alternative when a sibling is chemistry-association (in Íðorðabankinn, NULL id)', () => {
    const h = hw('buffer');
    tr(h, 'stuðpúði', { source: 'manual' }); // kept project term
    tr(h, 'jafnalausn', { source: 'chemistry-association' }); // in Íðorðabankinn, NULL id -> excluded, becomes anchor
    const rows = terminology.getAddedTerms();
    expect(rows).toHaveLength(1);
    expect(rows[0].submissionType).toBe('new-alternative');
    expect(rows[0].existingIdordabankiTerm).toBe('jafnalausn');
    expect(rows[0].existingIdordabankiId).toBe(''); // no id to surface — honest, not fabricated
  });
});

describe('getAddedTerms alternatives (approved project-Icelandic siblings)', () => {
  it('lists the other kept translations of the same headword, excluding self', () => {
    const h = hw('solvent');
    tr(h, 'leysir', { source: 'manual' });
    tr(h, 'leysiefni', { source: 'mined-postedit' });
    const rows = terminology.getAddedTerms();
    const leysir = rows.find((r) => r.icelandic === 'leysir');
    expect(leysir.alternatives).toEqual(['leysiefni']);
  });

  it('does not list an Íðorðabankinn sibling as an alternative', () => {
    const h = hw('salt');
    tr(h, 'salt', { source: 'manual' });
    tr(h, 'salti', { source: 'idordabankinn', idordabankiId: 5 });
    const [row] = terminology.getAddedTerms();
    expect(row.alternatives).toEqual([]); // the idordabankinn sibling is the anchor, not an alternative
  });
});

describe('getAddedTerms subject/book scoping', () => {
  it('filters by explicit subject', () => {
    const h1 = hw('cell'); tr(h1, 'fruma', { subjects: ['biology'] });
    const h2 = hw('bond'); tr(h2, 'tengi', { subjects: ['chemistry'] });
    expect(terminology.getAddedTerms({ subject: 'chemistry' }).map((r) => r.icelandic)).toEqual(['tengi']);
  });

  it('resolves book to its primary subject', () => {
    const h1 = hw('cell'); tr(h1, 'fruma', { subjects: ['biology'] });
    const h2 = hw('bond'); tr(h2, 'tengi', { subjects: ['chemistry'] });
    // efnafraedi-2e -> chemistry (seeded in createTestDb)
    expect(terminology.getAddedTerms({ book: 'efnafraedi-2e' }).map((r) => r.icelandic)).toEqual(['tengi']);
  });
});

describe('getAddedTerms attribution', () => {
  it('emits the human name for proposed_by/approved_by', () => {
    const h = hw('ion');
    tr(h, 'jón', { proposedByName: 'Anna', approvedByName: 'Björn' });
    const [row] = terminology.getAddedTerms();
    expect(row.proposedBy).toBe('Anna');
    expect(row.approvedBy).toBe('Björn');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run __tests__/terminologyAddedTerms.test.js`
Expected: FAIL — `PROJECT_ORIGINATED_SOURCES` / `getAddedTerms` are `undefined`.

- [ ] **Step 3a: Add the constant** in `server/services/terminologyService.js` immediately after the `TERM_SOURCES` array (line 48):

```js
// Sources whose ICELANDIC is project-authored — the Árnastofnun added-terms
// rights allowlist (item 21 PR-B, spec PR-B Amendment 1). Excludes sources
// already in Íðorðabankinn (idordabankinn/chemistry-association/chemistry-
// society-csv) and indeterminate-origin bulk imports (imported-csv/-excel/
// merge-glossary). A scientific term is not source-owned; the discriminator is
// whose Icelandic it is + idordabanki_id IS NULL (not already in Íðorðabankinn).
const PROJECT_ORIGINATED_SOURCES = [
  'manual',
  'mined-postedit',
  'chapter-glossary',
  'openstax-mt',
  'openstax-glossary',
];

// Sources the lead confirmed are ALREADY in Íðorðabankinn (2026-07-21). They
// carry idordabanki_id = NULL because the id is written only by the
// Íðorðabankinn *fetch* import — so a headword owning one of these siblings has
// a concept Íðorðabankinn already holds (⇒ a kept project term is a NEW
// ALTERNATIVE, not a new translation). The lead said "(at least)" these three;
// extend if more in-Íðorðabankinn sources are identified.
const IN_IDORDABANKINN_SOURCES = ['idordabankinn', 'chemistry-association', 'chemistry-society-csv'];
```

- [ ] **Step 3b: Add `getAddedTerms`** immediately after `exportBookGlossary` (after line 1556):

```js
/**
 * Árnastofnun added-terms seed rows (item 21 PR-B). Selects the project's
 * approved, project-authored Icelandic terms that are NOT already in
 * Íðorðabankinn, then classifies each as a new translation or a new
 * alternative to an existing Íðorðabankinn entry.
 *
 * Filter: status='approved' AND idordabanki_id IS NULL AND
 *         source IN PROJECT_ORIGINATED_SOURCES [AND subject scope].
 *
 * `alternatives` are the other KEPT (approved project-Icelandic) translations
 * of the same headword. `submissionType`/`existingIdordabanki*` come from a
 * per-headword lookup of the id-linked siblings the filter excluded.
 *
 * @param {{ subject?: string|null, book?: string|null }} [options]
 * @returns {Array<object>} rows ordered by english then icelandic (NOCASE)
 */
function getAddedTerms(options = {}) {
  const { subject = null, book = null } = options;
  const db = getDb();

  const effectiveSubject = subject || (book ? getBookSubjectBySlug(db, book) : null);

  const where = [
    "t.status = 'approved'",
    't.idordabanki_id IS NULL',
    `t.source IN (${PROJECT_ORIGINATED_SOURCES.map(() => '?').join(', ')})`,
  ];
  const params = [...PROJECT_ORIGINATED_SOURCES];
  subjectScopeClause(effectiveSubject, where, params);
  const whereSql = where.join(' AND ');

  const rows = db
    .prepare(
      `SELECT h.id AS headword_id, h.english, h.pos, h.definition_en,
              t.icelandic, t.definition_is, t.notes, t.source,
              t.proposed_by, t.proposed_by_name, t.approved_by, t.approved_by_name, t.approved_at,
              GROUP_CONCAT(ts.subject) AS subjects
       FROM terminology_headwords h
       JOIN terminology_translations t ON t.headword_id = h.id
       LEFT JOIN terminology_translation_subjects ts ON ts.translation_id = t.id
       WHERE ${whereSql}
       GROUP BY t.id
       ORDER BY h.english COLLATE NOCASE ASC, t.icelandic COLLATE NOCASE ASC`
    )
    .all(...params);

  if (rows.length === 0) return [];

  // Kept siblings per headword (for `alternatives`).
  const keptByHeadword = new Map();
  for (const r of rows) {
    if (!keptByHeadword.has(r.headword_id)) keptByHeadword.set(r.headword_id, []);
    keptByHeadword.get(r.headword_id).push(r.icelandic);
  }

  // Siblings KNOWN to be in Íðorðabankinn (the ones the filter excluded): either
  // idordabanki_id-linked (fetched from Íðorðabankinn) OR sourced from a set the
  // lead confirmed is already in Íðorðabankinn (those carry a NULL id). Presence
  // ⇒ the concept is in Íðorðabankinn ⇒ the kept project term is a NEW
  // ALTERNATIVE. One query over the kept headword ids.
  const hwIds = [...keptByHeadword.keys()];
  const anchorRows = db
    .prepare(
      `SELECT headword_id, icelandic, idordabanki_id
       FROM terminology_translations
       WHERE headword_id IN (${hwIds.map(() => '?').join(', ')})
         AND (idordabanki_id IS NOT NULL
              OR source IN (${IN_IDORDABANKINN_SOURCES.map(() => '?').join(', ')}))
       ORDER BY idordabanki_id ASC`
    )
    .all(...hwIds, ...IN_IDORDABANKINN_SOURCES);
  const anchorByHeadword = new Map();
  for (const a of anchorRows) {
    if (!anchorByHeadword.has(a.headword_id)) anchorByHeadword.set(a.headword_id, []);
    anchorByHeadword.get(a.headword_id).push(a);
  }

  return rows.map((r) => {
    const anchors = anchorByHeadword.get(r.headword_id) || [];
    return {
      english: r.english,
      pos: r.pos || null,
      definitionEn: r.definition_en || null,
      icelandic: r.icelandic,
      definitionIs: r.definition_is || null,
      alternatives: keptByHeadword.get(r.headword_id).filter((is) => is !== r.icelandic),
      subjects: r.subjects ? r.subjects.split(',') : [],
      notes: r.notes || null,
      source: r.source,
      submissionType: anchors.length ? 'new-alternative' : 'new-translation',
      existingIdordabankiTerm: anchors.map((a) => a.icelandic).join('; '),
      // Only the non-null ids — a chem-society anchor has no Íðorðabankinn id.
      existingIdordabankiId: anchors.map((a) => a.idordabanki_id).filter((v) => v != null).join('; '),
      proposedBy: r.proposed_by_name || r.proposed_by || '',
      approvedBy: r.approved_by_name || r.approved_by || '',
      approvedAt: r.approved_at || null,
    };
  });
}
```

- [ ] **Step 3c: Export both** — add to the `module.exports` object (line 1770). Add `getAddedTerms,` in the Query group (near `exportBookGlossary`) and `PROJECT_ORIGINATED_SOURCES,` in the Constants group (near `TERM_SOURCES`):

```js
  // Query
  ...
  exportBookGlossary,
  getAddedTerms,
  proposeMinedTerm,

  // Constants
  TERM_STATUSES,
  TERM_SOURCES,
  PROJECT_ORIGINATED_SOURCES,
  IN_IDORDABANKINN_SOURCES,
  SUBJECTS,
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run __tests__/terminologyAddedTerms.test.js`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyAddedTerms.test.js
git commit -m "feat(terminology): getAddedTerms() + PROJECT_ORIGINATED_SOURCES (item 21 PR-B)

Rights filter (approved ∧ idordabanki_id IS NULL ∧ Icelandic-origin source) +
per-headword id-linked-sibling lookup classifying each row new-translation vs
new-alternative with the Íðorðabankinn anchor. alternatives = approved
project-Icelandic siblings."
```

---

### Task 2: `arnastofnunSeed.js` serializer lib (CSV + JSON, formula-guard)

**Files:**
- Create: `server/lib/arnastofnunSeed.js`
- Test: `server/__tests__/arnastofnunSeed.test.js` (new)

**Interfaces:**
- Consumes: the `getAddedTerms` `Row` shape (Task 1).
- Produces (consumed by Task 3):
  - `SEED_COLUMNS: string[]` (the 15 CSV column names, exact order).
  - `csvSeedField(value) → string` (formula-injection guard + RFC-4180 quoting).
  - `serializeSeedCsv(rows) → string` (header + one row each; header-only when empty; trailing `\n`).
  - `serializeSeedJson(rows, opts={date}) → string` (pretty doc with `provenance_note`, `stats`, `terms`; trailing `\n`).
  - `PROVENANCE_NOTE: string`.

- [ ] **Step 1: Write the failing test** — `server/__tests__/arnastofnunSeed.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  SEED_COLUMNS,
  csvSeedField,
  serializeSeedCsv,
  serializeSeedJson,
  PROVENANCE_NOTE,
} = require('../lib/arnastofnunSeed');

const ROW = {
  english: 'mole',
  pos: 'noun',
  definitionEn: 'SI unit of amount',
  icelandic: 'mól',
  definitionIs: 'SI-eining efnismagns',
  alternatives: ['mólmagn'],
  subjects: ['chemistry', 'general'],
  notes: 'from ch03',
  source: 'openstax-mt',
  submissionType: 'new-alternative',
  existingIdordabankiTerm: 'móleind',
  existingIdordabankiId: '931162',
  proposedBy: 'Anna',
  approvedBy: 'Björn',
  approvedAt: '2026-07-01T00:00:00Z',
};

describe('SEED_COLUMNS', () => {
  it('is the exact 15-column header order', () => {
    expect(SEED_COLUMNS.join(',')).toBe(
      'english,pos,definition_en,icelandic,definition_is,alternatives,subject,notes,source,submission_type,existing_idordabanki_term,existing_idordabanki_id,proposed_by,approved_by,approved_at'
    );
  });
});

describe('csvSeedField formula-injection guard', () => {
  it("prefixes an apostrophe to a field starting with =", () => {
    expect(csvSeedField('=SUM(A1)')).toBe("'=SUM(A1)");
  });
  it('guards +, -, @ leads too', () => {
    expect(csvSeedField('+1')).toBe("'+1");
    expect(csvSeedField('-1')).toBe("'-1");
    expect(csvSeedField('@x')).toBe("'@x");
  });
  it('quotes (RFC 4180) a field with a comma after guarding', () => {
    expect(csvSeedField('=a,b')).toBe('"\'=a,b"');
  });
  it('leaves an ordinary field untouched', () => {
    expect(csvSeedField('mól')).toBe('mól');
  });
});

describe('serializeSeedCsv', () => {
  it('emits the header then one joined row', () => {
    const lines = serializeSeedCsv([ROW]).split('\n');
    expect(lines[0]).toBe(SEED_COLUMNS.join(','));
    expect(lines[1]).toBe(
      'mole,noun,SI unit of amount,mól,SI-eining efnismagns,mólmagn,chemistry; general,from ch03,openstax-mt,new-alternative,móleind,931162,Anna,Björn,2026-07-01T00:00:00Z'
    );
  });
  it('is a valid header-only file when there are no rows', () => {
    expect(serializeSeedCsv([])).toBe(SEED_COLUMNS.join(',') + '\n');
  });
  it('ends with a trailing newline', () => {
    expect(serializeSeedCsv([ROW]).endsWith('\n')).toBe(true);
  });
});

describe('serializeSeedJson', () => {
  it('emits provenance_note, stats, and terms with a fixed date', () => {
    const doc = JSON.parse(serializeSeedJson([ROW], { date: new Date('2026-01-02T03:04:05Z') }));
    expect(doc.generated).toBe('2026-01-02T03:04:05.000Z');
    expect(doc.provenance_note).toBe(PROVENANCE_NOTE);
    expect(doc.stats).toEqual({ total: 1, newTranslation: 0, newAlternative: 1 });
    expect(doc.terms[0].submission_type).toBe('new-alternative');
    expect(doc.terms[0].existing_idordabanki_id).toBe('931162');
    expect(doc.terms[0].alternatives).toEqual(['mólmagn']);
  });
  it('counts new-translation rows in stats', () => {
    const nt = { ...ROW, submissionType: 'new-translation', existingIdordabankiTerm: '', existingIdordabankiId: '' };
    const doc = JSON.parse(serializeSeedJson([nt, ROW], { date: new Date('2026-01-02Z') }));
    expect(doc.stats).toEqual({ total: 2, newTranslation: 1, newAlternative: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run __tests__/arnastofnunSeed.test.js`
Expected: FAIL — `Cannot find module '../lib/arnastofnunSeed'`.

- [ ] **Step 3: Create `server/lib/arnastofnunSeed.js`:**

```js
'use strict';
/**
 * Árnastofnun added-terms seed serializers (item 21 PR-B). Pure functions over
 * the getAddedTerms() row shape.
 *
 * The CSV carries a formula-injection guard because this file is opened in
 * Árnastofnun's spreadsheet — an EXTERNAL destination (unlike the internal
 * glossary/corpus exports). Do NOT reuse this to harden routes/terminology.js's
 * shared csvEscapeField (would break the glossary export's byte-exact pins).
 */

const SEED_COLUMNS = [
  'english',
  'pos',
  'definition_en',
  'icelandic',
  'definition_is',
  'alternatives',
  'subject',
  'notes',
  'source',
  'submission_type',
  'existing_idordabanki_term',
  'existing_idordabanki_id',
  'proposed_by',
  'approved_by',
  'approved_at',
];

const TOOL = 'terminology-added-terms-export';
const VERSION = '1.0';
const PROVENANCE_NOTE =
  "The project's approved, project-authored Icelandic terms that are not present in " +
  'Íðorðabankinn as such, offered as a submission seed. Each row is either a new translation ' +
  '(no known Íðorðabankinn entry for the concept) or a new alternative (an additional Icelandic ' +
  'rendering for a concept Íðorðabankinn already holds — see existing_idordabanki_term / ' +
  'existing_idordabanki_id, which may be blank when the existing term was imported without an ' +
  'Íðorðabankinn id). Classification is best-effort: a concept is treated as already in ' +
  'Íðorðabankinn when the project holds a sibling term either fetched from Íðorðabankinn or ' +
  "imported from a source known to be in it; 'new-translation' means 'no such known sibling in " +
  "our data', not a guarantee of absence.";

/**
 * CSV field escape. First a formula-injection guard (prefix an apostrophe to a
 * field beginning with = + - @ or tab/CR — the OWASP mitigation), then RFC-4180
 * quoting (quote fields with comma/quote/CR/LF; double inner quotes).
 * @param {*} value
 * @returns {string}
 */
function csvSeedField(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowToCells(row) {
  return [
    row.english,
    row.pos || '',
    row.definitionEn || '',
    row.icelandic,
    row.definitionIs || '',
    (row.alternatives || []).join('; '),
    (row.subjects || []).join('; '),
    row.notes || '',
    row.source,
    row.submissionType,
    row.existingIdordabankiTerm || '',
    row.existingIdordabankiId || '',
    row.proposedBy || '',
    row.approvedBy || '',
    row.approvedAt || '',
  ];
}

/**
 * @param {Array<object>} rows getAddedTerms() rows
 * @returns {string} CSV (header + one row each; header-only when empty)
 */
function serializeSeedCsv(rows) {
  const lines = [SEED_COLUMNS.join(',')];
  for (const row of rows) lines.push(rowToCells(row).map(csvSeedField).join(','));
  return lines.join('\n') + '\n';
}

function seedStats(rows) {
  return {
    total: rows.length,
    newTranslation: rows.filter((r) => r.submissionType === 'new-translation').length,
    newAlternative: rows.filter((r) => r.submissionType === 'new-alternative').length,
  };
}

/**
 * @param {Array<object>} rows getAddedTerms() rows
 * @param {{date?: Date}} [opts]
 * @returns {string} pretty JSON doc + trailing newline
 */
function serializeSeedJson(rows, opts = {}) {
  const doc = {
    generated: (opts.date || new Date()).toISOString(),
    tool: TOOL,
    version: VERSION,
    provenance_note: PROVENANCE_NOTE,
    stats: seedStats(rows),
    terms: rows.map((r) => ({
      english: r.english,
      pos: r.pos || null,
      definition_en: r.definitionEn || null,
      icelandic: r.icelandic,
      definition_is: r.definitionIs || null,
      alternatives: r.alternatives || [],
      subjects: r.subjects || [],
      notes: r.notes || null,
      source: r.source,
      submission_type: r.submissionType,
      existing_idordabanki_term: r.existingIdordabankiTerm || null,
      existing_idordabanki_id: r.existingIdordabankiId || null,
      proposed_by: r.proposedBy || null,
      approved_by: r.approvedBy || null,
      approved_at: r.approvedAt || null,
    })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

module.exports = {
  SEED_COLUMNS,
  csvSeedField,
  serializeSeedCsv,
  serializeSeedJson,
  PROVENANCE_NOTE,
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run __tests__/arnastofnunSeed.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/arnastofnunSeed.js server/__tests__/arnastofnunSeed.test.js
git commit -m "feat(terminology): Árnastofnun seed serializers (CSV+JSON, formula-guard)

PR-B-local csvSeedField neutralizes leading =,+,-,@ (external spreadsheet
destination) on top of RFC-4180 quoting; JSON carries the best-effort
provenance_note + submission-type stats. Shared csvEscapeField untouched."
```

---

### Task 3: `GET /api/terminology/added-terms/export` route (HEAD_EDITOR)

**Files:**
- Modify: `server/routes/terminology.js` (new route in the pre-`/:id` EXPORT block, after `csvEscapeField` line 277; new `require` near line 21)
- Test: `server/__tests__/addedTermsRoute.test.js` (new)

**Interfaces:**
- Consumes: `terminology.getAddedTerms` (Task 1), `terminology.SUBJECTS` (existing), `seed.serializeSeedCsv`/`serializeSeedJson` (Task 2), `requireAuth`, `requireRole`, `ROLES` (existing imports).
- Produces: `GET /api/terminology/added-terms/export?format=csv|json&subject=&book=` — 200 with an attachment; 400 bad format/subject; 403 non-HEAD_EDITOR; 500 + `log.error`.

- [ ] **Step 1: Write the failing test** — `server/__tests__/addedTermsRoute.test.js`:

```js
/**
 * Item 21 PR-B — GET /api/terminology/added-terms/export route contract.
 * Handler + middleware pulled from the router stack, invoked with fake req/res
 * (terminologyReviewRoutes.test.js idiom). Fixture DB via createTestDb.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';

process.env.SESSIONS_DB_PATH = path.join(os.tmpdir(), `added-terms-route-${process.pid}.db`);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/terminologyTestDb');
const terminology = require('../services/terminologyService');

let db;
let router;

function getLayer(routePath, method) {
  return router.stack.find((l) => l.route && l.route.path === routePath && l.route.methods[method]);
}
function getHandler(routePath, method) {
  const layer = getLayer(routePath, method);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}
function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      status(c) { this.statusCode = c; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      json(b) { resolve({ status: this.statusCode, headers: this.headers, body: b }); },
      send(b) { resolve({ status: this.statusCode, headers: this.headers, body: b }); },
    };
    Promise.resolve(handler(req, res));
  });
}

const HE_USER = { id: 'he1', name: 'Head Editor', username: 'head', role: 'head-editor' };
const ROUTE = '/added-terms/export';

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations(); // gives activityLog a real (temp) DB
  router = require('../routes/terminology');
});
beforeEach(() => {
  db = createTestDb();
  terminology._setTestDb(db);
});
afterAll(() => {
  terminology._setTestDb(null);
});

function seedRow() {
  const h = Number(db.prepare('INSERT INTO terminology_headwords (english) VALUES (?)').run('adsorb').lastInsertRowid);
  db.prepare(
    `INSERT INTO terminology_translations (headword_id, icelandic, source, status, idordabanki_id)
     VALUES (?, 'aðsog', 'openstax-mt', 'approved', NULL)`
  ).run(h);
}

describe('GET /api/terminology/added-terms/export', () => {
  it('is registered before the parametric /:id route (no shadowing)', () => {
    const paths = router.stack.filter((l) => l.route).map((l) => l.route.path);
    expect(paths).toContain(ROUTE);
    expect(paths.indexOf(ROUTE)).toBeLessThan(paths.indexOf('/:id'));
  });

  it('requireRole gate 403s an editor', async () => {
    const layer = getLayer(ROUTE, 'get');
    expect(layer.route.stack.length).toBe(3); // requireAuth, requireRole, handler
    const gate = layer.route.stack[1].handle;
    const out = await invoke(gate, { user: { role: 'editor', id: 'e1' }, query: {} });
    expect(out.status).toBe(403);
  });

  it('defaults to json and returns provenance_note + terms for a head-editor', async () => {
    seedRow();
    const out = await invoke(getHandler(ROUTE, 'get'), { query: {}, user: HE_USER });
    expect(out.status).toBe(200);
    expect(out.headers['Content-Type']).toMatch(/json/);
    const doc = JSON.parse(out.body);
    expect(doc.provenance_note).toBeTruthy();
    expect(doc.terms.map((t) => t.icelandic)).toEqual(['aðsog']);
  });

  it('serves csv with the exact header and attachment filename', async () => {
    seedRow();
    const out = await invoke(getHandler(ROUTE, 'get'), { query: { format: 'csv' }, user: HE_USER });
    expect(out.headers['Content-Type']).toMatch(/csv/);
    expect(out.headers['Content-Disposition']).toContain('arnastofnun-added-terms.csv');
    expect(out.body.split('\n')[0]).toBe(
      'english,pos,definition_en,icelandic,definition_is,alternatives,subject,notes,source,submission_type,existing_idordabanki_term,existing_idordabanki_id,proposed_by,approved_by,approved_at'
    );
  });

  it('400s an unknown format', async () => {
    const out = await invoke(getHandler(ROUTE, 'get'), { query: { format: 'xml' }, user: HE_USER });
    expect(out.status).toBe(400);
  });

  it('400s an unknown subject', async () => {
    const out = await invoke(getHandler(ROUTE, 'get'), { query: { subject: 'astrology' }, user: HE_USER });
    expect(out.status).toBe(400);
  });

  it('returns a valid header-only CSV when there are no added terms', async () => {
    const out = await invoke(getHandler(ROUTE, 'get'), { query: { format: 'csv' }, user: HE_USER });
    expect(out.status).toBe(200);
    expect(out.body.split('\n')[0]).toContain('english,pos,');
    expect(out.body.split('\n').filter((l) => l.length).length).toBe(1); // header only
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run __tests__/addedTermsRoute.test.js`
Expected: FAIL — the route is not registered (`indexOf(ROUTE)` is `-1`).

- [ ] **Step 3a: Add the require** near the other service/middleware requires (after line 21, `const terminology = require('../services/terminologyService');`):

```js
const seed = require('../lib/arnastofnunSeed');
```

- [ ] **Step 3b: Add the route** in `server/routes/terminology.js` immediately after the `csvEscapeField` function (after line 277), still inside the pre-`/:id` EXPORT region:

```js
/**
 * GET /api/terminology/added-terms/export?format=csv|json&subject=&book=
 * Árnastofnun submission seed: the project's approved, project-authored terms
 * not already in Íðorðabankinn, each classified new-translation | new-alternative
 * (item 21 PR-B). HEAD_EDITOR — relaying terms outward is a governance act.
 * MUST stay before the parametric /:id route (shadowing hazard).
 */
router.get('/added-terms/export', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { format = 'json', subject, book } = req.query;

  if (format !== 'csv' && format !== 'json') {
    return res.status(400).json({ error: 'Invalid format', message: "format must be 'csv' or 'json'" });
  }
  if (subject && !terminology.SUBJECTS.includes(subject)) {
    return res.status(400).json({ error: 'Invalid subject', message: `Unknown subject: ${subject}` });
  }

  try {
    const rows = terminology.getAddedTerms({ subject: subject || null, book: book || null });
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="arnastofnun-added-terms.csv"');
      return res.send(seed.serializeSeedCsv(rows));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="arnastofnun-added-terms.json"');
    return res.send(seed.serializeSeedJson(rows, { date: new Date() }));
  } catch (err) {
    log.error({ err }, 'Added-terms export failed');
    return res.status(500).json({ error: 'Failed to export added terms', message: err.message });
  }
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run __tests__/addedTermsRoute.test.js`
Expected: PASS (ordering, 403, json default, csv header, 2×400, header-only).

- [ ] **Step 5: Commit**

```bash
git add server/routes/terminology.js server/__tests__/addedTermsRoute.test.js
git commit -m "feat(terminology): GET /added-terms/export route (HEAD_EDITOR, item 21 PR-B)

Registered before /:id (shadowing guard, pinned). Validates format+subject,
streams csv|json seed via arnastofnunSeed; empty set -> valid header-only file."
```

---

### Task 4: HEAD_EDITOR download control on `terminology.html`

**Files:**
- Modify: `server/views/terminology.html` (control markup ~line 933; `init()` gate ~line 1201; `downloadAddedTerms` fn ~line 2322)

**Interfaces:**
- Consumes: `GET /api/terminology/added-terms/export` (Task 3); the page's `filter-book`/`filter-subject` inputs + `currentUser` (existing).

- [ ] **Step 1: Add the control** inside the export flex `div` (between the "Flytja inn" button at line 933 and its closing `</div>` at line 934). Hidden by default; `init()` reveals it for a head-editor. Icelandic uses HTML entities to match this file's convention:

```html
        <span id="added-terms-export" style="display: none;">
          <button class="btn btn-sm btn-secondary" onclick="downloadAddedTerms('csv')" title="S&#230;kja vi&#240;b&#230;tt hugt&#246;k fyrir &#193;rnastofnun (CSV)">
            Vi&#240;b&#230;tt hugt&#246;k (CSV)
          </button>
          <button class="btn btn-sm btn-secondary" onclick="downloadAddedTerms('json')" title="S&#230;kja vi&#240;b&#230;tt hugt&#246;k fyrir &#193;rnastofnun (JSON)">
            JSON
          </button>
        </span>
```

- [ ] **Step 2: Reveal it in the existing head-editor `init()` block** (lines 1201–1204). Add the reveal line inside the block that already shows `mined-section` (reuse the same role gate — no second check):

```js
      // Mined term-decision candidates are a head-editor tool.
      if (currentUser && ['admin', 'head-editor'].includes(currentUser.role)) {
        document.getElementById('mined-section').style.display = 'block';
        document.getElementById('added-terms-export').style.display = 'inline';
        try { await loadMinedCandidates(); } catch (e) { console.error('Load mined candidates failed:', e); }
      }
```

- [ ] **Step 3: Add the `downloadAddedTerms` function** next to `exportGlossary` (after line 2322, before the `// ─── Boot ───` comment). Mirrors the blob-download idiom; note the query param is `book` (the route reads `req.query.book`):

```js
    async function downloadAddedTerms(format) {
      const bookSlug = document.getElementById('filter-book')?.value || '';
      const subject = document.getElementById('filter-subject').value;
      const params = new URLSearchParams({ format: format });
      if (subject) params.set('subject', subject);
      else if (bookSlug) params.set('book', bookSlug);
      const url = '/api/terminology/added-terms/export?' + params.toString();
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Villa við útflutning viðbættra hugtaka');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'arnastofnun-added-terms.' + format;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        alert('Villa: ' + err.message);
      }
    }
```

- [ ] **Step 4: Syntax-check the added client function** (campaign lesson: `node --check` hand-edited client JS — `terminology.html` is not covered by `clientJsSyntax.test.js`, which only scans `public/js`):

```bash
node --check <(printf 'async function downloadAddedTerms(format){ const bookSlug=document.getElementById("filter-book")?.value||""; const subject=document.getElementById("filter-subject").value; const params=new URLSearchParams({format:format}); if(subject)params.set("subject",subject); else if(bookSlug)params.set("book",bookSlug); const url="/api/terminology/added-terms/export?"+params.toString(); try{ const res=await fetch(url,{credentials:"include"}); if(!res.ok)throw new Error("x"); const blob=await res.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="arnastofnun-added-terms."+format; a.click(); URL.revokeObjectURL(a.href);}catch(err){alert("Villa: "+err.message);} }')
```
Expected: no output (exit 0). The route it calls is proven by Task 3; the button's visibility gate mirrors the pinned `mined-section` pattern.

- [ ] **Step 5: Commit**

```bash
git add server/views/terminology.html
git commit -m "feat(terminology): HEAD_EDITOR Árnastofnun added-terms download control

Hidden-by-default control revealed in the existing head-editor init() gate
(mined-section pattern); downloadAddedTerms mirrors exportGlossary's blob
download. Item 21 PR-B."
```

---

### Task 5: Full-suite gate + campaign register

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 21 PR-B register block, ~line 216)

- [ ] **Step 1: Run the full suite from the repo root**

Run: `npm test`
Expected: PASS — baseline **3235** + the new `terminologyAddedTerms`, `arnastofnunSeed`, `addedTermsRoute` cases; **no reds**. Record the new total. **Watch:** if a route-inventory / auth-coverage test enumerates routes and goes red on `/added-terms/export`, that is the test working as designed — add the new route to its expected allowlist (a real gap if it stays silent). Report it either way.

- [ ] **Step 2: Update the campaign doc** — flip item 21 PR-B from "NOT STARTED" to shipped and append registers. In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, edit the PR-B bullet (line 216) and add under the existing I21-R1..R3 block:

```markdown
      - **I21-R4 `[lead decision — spec superseded]`** — the 2026-07-20 `openstax-mt` exclusion (spec §2.3) was **reversed 2026-07-21** to an *Icelandic-origin* rule: a scientific term is not source-owned, so the discriminator is whose *Icelandic* it is + `idordabanki_id IS NULL` (not already in Íðorðabankinn). `PROJECT_ORIGINATED_SOURCES = manual, mined-postedit, chapter-glossary, openstax-mt, openstax-glossary`. **Resolves I21-R1** (chapter-glossary/openstax-mt now consistent). Excluded: idordabankinn/chemistry-association/chemistry-society-csv (already in Íðorðabankinn per lead) + imported-csv/-excel/merge-glossary (indeterminate Icelandic origin; `proposed` insert-default already gates them). Spec PR-B Amendment 1.
      - **I21-R5 `[feature]`** — per-row submission model: `submission_type` (new-translation | new-alternative) + `existing_idordabanki_term`/`_id` anchor. Classification treats a concept as in-Íðorðabankinn when a sibling has `idordabanki_id IS NOT NULL` **OR** `source IN IN_IDORDABANKINN_SOURCES` (idordabankinn/chemistry-association/chemistry-society-csv — the lead confirmed these are in Íðorðabankinn but they carry NULL ids; an id-only rule would mislabel them `new-translation` — advisor catch, test-pinned). Anchor `existing_idordabanki_id` surfaces only non-null ids (no fabrication). Best-effort — stated in `provenance_note`. Spec PR-B Amendment 3.
      - **I21-R8 `[scale — register only]`** — `getAddedTerms` binds `headword_id IN (…)` one placeholder per kept headword. Fine at the current ~617-approved scale; SQLite's bound-variable ceiling would bite only at many thousands of added terms — chunk the IN then. No action now.
      - **I21-R6 `[posture]`** — the seed CSV adds a PR-B-local formula-injection guard (`csvSeedField`) because it is opened in Árnastofnun's spreadsheet (external). The shared glossary/corpus CSV exports keep the un-guarded `csvEscapeField` (internal, byte-pinned). Consider hardening those too if they ever become external. Spec PR-B Amendment 4.
      - **I21-R7 `[data — deploy]`** — the dev `sessions.db` holds ~no terminology rows (6 proposed imported-csv); the real ~617-approved chemistry set is on prod. First real export happens after `./scripts/deploy.sh`; the on-dev smoke correctly yields a header-only file. Tell ritstjórn the first seed size once seen on prod.
```

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(campaign): item 21 PR-B shipped + registers I21-R4..R7"
```

---

## Self-Review

**1. Spec coverage** (spec §PR-B + PR-B Amendments):
- B1 components — `getAddedTerms` + `PROJECT_ORIGINATED_SOURCES` (Task 1), route (Task 3), UI (Task 4). ✓
- B2 filter (`approved ∧ idordabanki_id IS NULL ∧ source ∈ allowlist ∧ subject`) — Task 1, mutation-checked. ✓ (allowlist reversed per Amendment 1.)
- B3 output shape — revised 15-column set incl. `submission_type`/`existing_idordabanki_*`/`alternatives`/attribution names (Amendments 2/3/5) — Tasks 1 (rows) + 2 (serialize). ✓
- B4 error handling (empty → header-only 200; bad format/subject → 400; non-HE → 403; error → 500 log) — Task 3. ✓
- B5 testing (filter incl/excl + mutation-check; CSV/JSON shape; route auth 403/200) — Tasks 1/2/3. ✓
- B6 licence boundary (no item-17 footer/guard) — honored: the seed adds only a `provenance_note` + formula guard, no page footer/containment. ✓
- PR-B Amendment 1 (Icelandic-origin sources) — Task 1 constant + tests. ✓
- Amendment 2 (alternatives = approved project siblings) — Task 1 derivation + test. ✓
- Amendment 3 (submission model + anchor, best-effort note) — Task 1 classification + Task 2 provenance_note. ✓
- Amendment 4 (formula guard, shared escaper untouched) — Task 2 `csvSeedField`. ✓
- Amendment 5 (attribution names) — Task 1 `proposedBy`/`approvedBy` + test. ✓

**2. Placeholder scan:** every code step shows full code; every run step gives command + expected result. No TBD/TODO. ✓

**3. Type consistency:** the `Row` shape (`submissionType`, `existingIdordabankiTerm`, `existingIdordabankiId`, `alternatives`, `subjects`, `proposedBy`, `approvedBy`) is produced by `getAddedTerms` (Task 1) and consumed identically by `rowToCells`/`serializeSeedJson` (Task 2). `SEED_COLUMNS` header string is asserted byte-identical in Task 2 (unit) and Task 3 (route). `terminology.getAddedTerms`/`terminology.SUBJECTS`/`terminology.PROJECT_ORIGINATED_SOURCES` names match the `module.exports` additions (Task 1 Step 3c). Route path `/added-terms/export` matches the test's `ROUTE` and the ordering pin. ✓

**Note on process:** after all tasks, run a **whole-branch adversarial review** (campaign convention — cross-stage/cross-consumer defects evade per-task review) before opening the PR to the lead.
