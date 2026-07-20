# Item 20b PR2 — corpus `reviewStatus` + TSV single-sourcing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `tools/export-corpus.js` to read the per-module `-review-status.json` sidecar and emit a `reviewStatus` field (JSONL row + TSV column + manifest + stats), and single-source the TSV contract through one accessor table (folds register I20-R6).

**Architecture:** A pure consumer change, `tools/` only — no server code, no data op, no re-render. The corpus loop already builds each module's tier maps from disk; PR2 loads the sidecar from the sibling path in that same loop, resolves a per-row `reviewStatus` through an ordered rule set, and counts the outcomes. The TSV's duplicated column contract (`TSV_COLUMNS` + a hand-built positional row array) collapses into one `TSV_SPEC` array of `{ column, get }` records that both the header and every row derive from.

**Tech Stack:** Node ESM, Vitest. Run every command from the repo root (`/home/siggi/dev/repos/namsbokasafn-efni`).

## Global Constraints

- **Spec authority:** §9 of `docs/superpowers/specs/2026-07-19-mt-acceptance-design.md` (what) + `docs/superpowers/specs/2026-07-20-item20b-pr2-corpus-review-status-addendum.md` (the open decisions, D1–D9). Cited as **D<n>** below.
- **Tools-only.** Do not touch anything under `server/`. No new dependencies.
- **Read the sidecar from disk, never from `sessions.db`** (D1) — the DB is gitignored/prod-only; disk-derivability is the sidecar's entire reason to exist.
- **`null` means UNKNOWN, never "unreviewed"** (D5). Never claim review status the sidecar does not assert.
- **A single corrupt/absent sidecar must never abort a book export** (D3) — warn + count + treat as `null` for that module, matching the existing skip-report idiom.
- **Determinism preserved:** `reviewStatus` is appended **last** in both the JSONL row key order and the TSV column order (D7); existing key positions are unchanged so old/new outputs diff cleanly.
- **Test file:** `tools/__tests__/export-corpus.test.js`. **Source file:** `tools/export-corpus.js`. These two are the only files the code tasks modify.
- **Vitest command for one file:** `npx vitest run tools/__tests__/export-corpus.test.js`. **Full gate:** `npm test` from repo root (authoritative — there is no branch protection; local green is the merge gate).
- **Icelandic/typographic bytes are load-bearing in pin tests.** The manifest `notes` array is pinned byte-exact; use the exact characters shown (em-dash `—` = U+2014). When in doubt, run `node --check` and let the byte-exact `toEqual` catch drift.

---

### Task 1: TSV single-sourcing via one accessor table (folds I20-R6)

Behavior-preserving refactor: replace the two parallel TSV definitions with one `TSV_SPEC` table. No new column yet. This clears register **I20-R6** and lands the missing pins (byte-literal header, all-values-at-index) that make Task 4's column addition safe.

**Files:**
- Modify: `tools/export-corpus.js` (TSV section, ~lines 276–323; exports ~lines 471–484)
- Test: `tools/__tests__/export-corpus.test.js` (`serializers` describe, ~lines 377–422)

**Interfaces:**
- Consumes: existing `tsvField`, `buildRow`.
- Produces: `const TSV_SPEC = [{ column: string, get: (row) => any }, …]`; `TSV_COLUMNS = TSV_SPEC.map(c => c.column)` (still exported — an existing test and the off-repo consumer use it); `toTsv(rows)` unchanged in signature/output bytes.

- [ ] **Step 1: Write/replace the failing TSV tests**

In `tools/__tests__/export-corpus.test.js`, add `TSV_SPEC` to the import block (line 5–18) so it reads `…, TSV_COLUMNS, TSV_SPEC } from '../export-corpus.js';`.

Replace the existing `it('toTsv emits the frozen header and sanitizes tabs/newlines in fields', …)` block (lines 412–422) with these three tests:

```js
  it('toTsv emits the byte-literal 11-column header and sanitizes tabs/newlines', () => {
    const tsv = toTsv([row]);
    const lines = tsv.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'id\tbook\tchapter\tmodule\ttype\tlicence\ten_clean\tmt_clean\tfaithful_clean\tlocalized_clean\tpostEdited'
    );
    const fields = lines[1].split('\t');
    expect(fields).toHaveLength(11);
    // en clean had a tab; the raw text's tab/newline must not split columns
    expect(fields[TSV_COLUMNS.indexOf('en_clean')]).toBe('A B C.');
    expect(fields[TSV_COLUMNS.indexOf('localized_clean')]).toBe('');
    expect(fields[TSV_COLUMNS.indexOf('postEdited')]).toBe('true');
  });

  it('maps every column to its value at the right index (I20-R6: no silent field swap)', () => {
    const fields = toTsv([row]).trimEnd().split('\n')[1].split('\t');
    expect(fields[0]).toBe('m1:para:p1'); // id
    expect(fields[1]).toBe('efnafraedi-2e'); // book
    expect(fields[2]).toBe('1'); // chapter
    expect(fields[3]).toBe('m1'); // module
    expect(fields[4]).toBe('para'); // type
    expect(fields[5]).toBe('CC BY 4.0'); // licence
    expect(fields[6]).toBe('A B C.'); // en_clean
    expect(fields[7]).toBe('Vatn.'); // mt_clean
    expect(fields[8]).toBe('Vatnið.'); // faithful_clean
    expect(fields[9]).toBe(''); // localized_clean (null tier)
    expect(fields[10]).toBe('true'); // postEdited
  });

  it('serializes postEdited true/false/null through the bare accessor (ternary removal safe)', () => {
    const col = (pe) =>
      toTsv([{ ...row, postEdited: pe }]).trimEnd().split('\n')[1].split('\t')[
        TSV_COLUMNS.indexOf('postEdited')
      ];
    expect(col(true)).toBe('true');
    expect(col(false)).toBe('false');
    expect(col(null)).toBe('');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/export-corpus.test.js -t "byte-literal 11-column header"`
Expected: FAIL — `TSV_SPEC` is not exported (ReferenceError / undefined import), and/or the byte-literal header assertion runs. The point of this step is to confirm the tests execute against the not-yet-refactored code.

- [ ] **Step 3: Replace the TSV definitions with the accessor table**

In `tools/export-corpus.js`, replace the `TSV_COLUMNS` const (lines 276–288) **and** the `toTsv` function (lines 301–323) with:

```js
/**
 * Single source of truth for the TSV contract (I20-R6): one record per column,
 * each carrying its own getter. The header and every row derive from this array,
 * so a column can never drift between the two. Column name != row key for the
 * clean-tier columns (they dereference `.clean` off a nullable tier object) and
 * `elementId` is JSONL-only — so these are real accessors, not key lookups.
 */
const TSV_SPEC = [
  { column: 'id', get: (r) => r.id },
  { column: 'book', get: (r) => r.book },
  { column: 'chapter', get: (r) => r.chapter },
  { column: 'module', get: (r) => r.module },
  { column: 'type', get: (r) => r.type },
  { column: 'licence', get: (r) => r.licence },
  { column: 'en_clean', get: (r) => (r.en ? r.en.clean : '') },
  { column: 'mt_clean', get: (r) => (r.mt ? r.mt.clean : '') },
  { column: 'faithful_clean', get: (r) => (r.faithful ? r.faithful.clean : '') },
  { column: 'localized_clean', get: (r) => (r.localized ? r.localized.clean : '') },
  { column: 'postEdited', get: (r) => r.postEdited },
];

const TSV_COLUMNS = TSV_SPEC.map((c) => c.column);
```

Keep `toJsonl` (lines 291–293) and `tsvField` (lines 295–298) exactly as they are. Then add the new `toTsv` immediately after `tsvField`:

```js
/** @param {Array<object>} rows */
function toTsv(rows) {
  const lines = [TSV_COLUMNS.join('\t')];
  for (const r of rows) {
    lines.push(TSV_SPEC.map((c) => tsvField(c.get(r))).join('\t'));
  }
  return lines.join('\n') + '\n';
}
```

Note the `postEdited` getter is the bare `r.postEdited` — the old ternary `r.postEdited === null ? '' : String(r.postEdited)` is redundant because `tsvField(null)` already returns `''` and `tsvField(false)` returns `'false'` (proven by the Step-1 test).

In the export block (lines 471–484), add `TSV_SPEC,` next to `TSV_COLUMNS,`.

- [ ] **Step 4: Run the file's tests to verify green**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: PASS — all 27 pre-existing tests plus the 3 new/replaced ones (the header test replaced one, so net +2). Confirm no test in the file is red.

- [ ] **Step 5: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js
git commit -m "refactor(export-corpus): single-source TSV via {column,get} accessor table (I20-R6)

Replace TSV_COLUMNS + toTsv's parallel hand-built row array with one TSV_SPEC
table both derive from. Add the pins the old self-referential header assertion
lacked: byte-literal 11-column header + every column value asserted at index.
Behavior-preserving; postEdited ternary collapses to a bare accessor (proven).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `loadSidecar` + `resolveReviewStatus` helpers

The two pure functions at the heart of D3. No wiring into the corpus loop yet — this task delivers and unit-tests the resolution logic in isolation.

**Files:**
- Modify: `tools/export-corpus.js` (add after `parseAndCount`, ~line 166; exports)
- Test: `tools/__tests__/export-corpus.test.js` (new describe blocks after the `computePostEdited` block, ~line 111)

**Interfaces:**
- Consumes: `fs`.
- Produces:
  - `loadSidecar(sidecarPath: string, expectedModule: string) => { state: 'ok', segments: object } | { state: 'absent' } | { state: 'malformed' }`
  - `resolveReviewStatus(sidecar, segId: string, faithfulRaw: string|null) => { status: string|null, segMissing: boolean }`

- [ ] **Step 1: Write the failing unit tests**

In `tools/__tests__/export-corpus.test.js`, add `loadSidecar` and `resolveReviewStatus` to the import block. Then add these two describe blocks after the `computePostEdited` describe (after line 111):

```js
describe('loadSidecar', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const write = (name, body) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body));
    return p;
  };

  it('returns absent when the file does not exist', () => {
    expect(loadSidecar(path.join(tmp, 'nope.json'), 'm1')).toEqual({ state: 'absent' });
  });

  it('returns ok with the segments map for a well-formed matching sidecar', () => {
    const p = write('s.json', { module: 'm1', segments: { 'm1:para:p1': { status: 'accepted' } } });
    const r = loadSidecar(p, 'm1');
    expect(r.state).toBe('ok');
    expect(r.segments['m1:para:p1'].status).toBe('accepted');
  });

  it('returns malformed on invalid JSON (D3.3)', () => {
    expect(loadSidecar(write('s.json', '{not json'), 'm1').state).toBe('malformed');
  });

  it('returns malformed when segments is missing or not a plain object', () => {
    expect(loadSidecar(write('a.json', { module: 'm1' }), 'm1').state).toBe('malformed');
    expect(loadSidecar(write('b.json', { module: 'm1', segments: [] }), 'm1').state).toBe('malformed');
    expect(loadSidecar(write('c.json', { module: 'm1', segments: null }), 'm1').state).toBe('malformed');
  });

  it('returns malformed when the sidecar module does not match the expected module (D2)', () => {
    const p = write('s.json', { module: 'mOTHER', segments: {} });
    expect(loadSidecar(p, 'm1').state).toBe('malformed');
  });
});

describe('resolveReviewStatus', () => {
  const ok = {
    state: 'ok',
    segments: {
      'm1:para:p1': { status: 'accepted' },
      'm1:para:p2': { status: 'edited' },
      'm1:para:p3': { status: 'carryover' },
    },
  };

  it('returns the verbatim status for a listed segment with faithful text (D3.5)', () => {
    expect(resolveReviewStatus(ok, 'm1:para:p2', 'Fast efni.')).toEqual({
      status: 'edited',
      segMissing: false,
    });
  });

  it('is null when faithful is null even if the sidecar lists the segment (D3.1 beats a stale sidecar)', () => {
    expect(resolveReviewStatus(ok, 'm1:para:p1', null)).toEqual({ status: null, segMissing: false });
  });

  it('is null when faithful is whitespace-only', () => {
    expect(resolveReviewStatus(ok, 'm1:para:p1', '   ')).toEqual({ status: null, segMissing: false });
  });

  it('is null for an absent sidecar (D3.2)', () => {
    expect(resolveReviewStatus({ state: 'absent' }, 'm1:para:p1', 'Vatn.')).toEqual({
      status: null,
      segMissing: false,
    });
  });

  it('is null for a malformed sidecar (D3.3)', () => {
    expect(resolveReviewStatus({ state: 'malformed' }, 'm1:para:p1', 'Vatn.')).toEqual({
      status: null,
      segMissing: false,
    });
  });

  it('flags segMissing when the sidecar is ok but omits the segment (D3.4 drift tripwire)', () => {
    expect(resolveReviewStatus(ok, 'm1:para:pX', 'Vatn.')).toEqual({ status: null, segMissing: true });
  });

  it('does not flag segMissing for an omitted segment whose faithful is null', () => {
    expect(resolveReviewStatus(ok, 'm1:para:pX', null)).toEqual({ status: null, segMissing: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/export-corpus.test.js -t "loadSidecar"`
Expected: FAIL — `loadSidecar`/`resolveReviewStatus` are not exported (undefined import).

- [ ] **Step 3: Implement the two helpers**

In `tools/export-corpus.js`, add immediately after `parseAndCount` (after line 166, before `buildCorpus`'s doc comment at line 168):

```js
/**
 * Load a module's derived review-status sidecar from disk (D1). Classification
 * is defensive by construction: any shape the corpus reader cannot trust — bad
 * JSON, a non-object `segments`, or a `module` that does not match the module
 * being exported (D2) — is 'malformed', so a single corrupt file yields `null`
 * for that module's rows without ever aborting the book export (D3.3).
 *
 * @param {string} sidecarPath  books/<book>/03-faithful-translation/<dir>/<mod>-review-status.json
 * @param {string} expectedModule  the module id the corpus is currently exporting
 * @returns {{state:'ok', segments:object} | {state:'absent'} | {state:'malformed'}}
 */
function loadSidecar(sidecarPath, expectedModule) {
  if (!fs.existsSync(sidecarPath)) return { state: 'absent' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
  } catch {
    return { state: 'malformed' };
  }
  const segments = parsed && parsed.segments;
  if (!segments || typeof segments !== 'object' || Array.isArray(segments)) {
    return { state: 'malformed' };
  }
  if (parsed.module !== expectedModule) return { state: 'malformed' };
  return { state: 'ok', segments };
}

/**
 * Resolve a row's reviewStatus per the addendum's ordered rules (D3). Returns
 * both the status and a `segMissing` flag so the caller can count the drift
 * tripwire (D3.4). Statuses pass through verbatim — the per-status counter is
 * the vocabulary check, so a future/malformed status reports itself rather than
 * being silently remapped.
 *
 * @param {{state:string, segments?:object}} sidecar  result of loadSidecar
 * @param {string} segId
 * @param {string|null} faithfulRaw  the row's faithful tier (already `|| null`-coerced)
 * @returns {{status: string|null, segMissing: boolean}}
 */
function resolveReviewStatus(sidecar, segId, faithfulRaw) {
  // D3.1 — cannot have reviewed a translation that is not there; also stops a
  // stale sidecar asserting a status on a row whose faithful tier is null.
  if (faithfulRaw == null || faithfulRaw.trim() === '') return { status: null, segMissing: false };
  // D3.2 (absent) + D3.3 (malformed)
  if (!sidecar || sidecar.state !== 'ok') return { status: null, segMissing: false };
  const entry = sidecar.segments[segId];
  // D3.5 — verbatim status
  if (entry && typeof entry.status === 'string') return { status: entry.status, segMissing: false };
  // D3.4 — file segment the sidecar does not list: a post-write drift tripwire
  return { status: null, segMissing: true };
}
```

In the export block, add `loadSidecar,` and `resolveReviewStatus,`.

- [ ] **Step 4: Run the tests to verify green**

Run: `npx vitest run tools/__tests__/export-corpus.test.js -t "loadSidecar"` then `… -t "resolveReviewStatus"`
Expected: PASS for both. Then run the whole file `npx vitest run tools/__tests__/export-corpus.test.js` — all green.

- [ ] **Step 5: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js
git commit -m "feat(export-corpus): loadSidecar + resolveReviewStatus helpers (D2/D3)

Pure functions for reading the derived -review-status.json sidecar from disk and
resolving a per-row reviewStatus through the addendum's ordered rules: faithful
null beats a stale sidecar; absent/malformed -> null; a listed segment -> its
status verbatim; an omitted file segment -> the segMissing drift tripwire.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire `reviewStatus` into rows and stats

Emit `reviewStatus` on every JSONL row (last key, D7), load the sidecar once per module, and count the outcomes (D4).

**Files:**
- Modify: `tools/export-corpus.js` (`buildRow` ~104–118; `buildCorpus` stats init ~181–191, module loop ~217–260)
- Test: `tools/__tests__/export-corpus.test.js` (`buildRow` describe ~113–148; `buildCorpus` fixture ~164–243 and its assertions)

**Interfaces:**
- Consumes: `loadSidecar`, `resolveReviewStatus` (Task 2), `buildRow`.
- Produces: rows gain a 13th key `reviewStatus: string|null`; `stats` gains `reviewStatus: {edited,accepted,carryover,null,…}`, `sidecarsRead`, `sidecarsMalformed`, `sidecarsAbsent`, `sidecarSegMissing`.

- [ ] **Step 1: Update the `buildRow` key-order pin and add a passthrough test**

In `tools/__tests__/export-corpus.test.js`, in the `buildRow` describe (lines 126–139), add `'reviewStatus'` as the last entry of the `Object.keys(row)` array, and add after line 146 (`expect(row.postEdited).toBeNull();`):

```js
    expect(row.reviewStatus).toBeNull(); // absent from p → defaults null
```

Add a second `it` inside the `buildRow` describe:

```js
  it('carries a provided reviewStatus through as the last key', () => {
    const row = buildRow({
      id: 'm1:para:p1',
      book: 'efnafraedi-2e',
      chapter: '1',
      module: 'm1',
      licence: 'CC BY 4.0',
      en: 'Water.',
      mt: 'Vatn.',
      faithful: 'Vatn.',
      localized: null,
      reviewStatus: 'accepted',
    });
    expect(Object.keys(row).at(-1)).toBe('reviewStatus');
    expect(row.reviewStatus).toBe('accepted');
  });
```

Also update the `toJsonl` key-order pin in the `serializers` describe (lines 395–408): add `'reviewStatus'` as the last entry of that `Object.keys(parsed)` array.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/export-corpus.test.js -t "buildRow"`
Expected: FAIL — `Object.keys(row)` lacks `reviewStatus`; `row.reviewStatus` is undefined not null.

- [ ] **Step 3: Add `reviewStatus` to `buildRow`**

In `tools/export-corpus.js`, in `buildRow`'s returned object (lines 104–117), add after the `postEdited:` line (line 116):

```js
    postEdited: computePostEdited(p.en, p.mt, p.faithful),
    reviewStatus: p.reviewStatus ?? null,
  };
```

- [ ] **Step 4: Run to verify the buildRow tests pass**

Run: `npx vitest run tools/__tests__/export-corpus.test.js -t "buildRow"` and `… -t "toJsonl"`
Expected: PASS.

- [ ] **Step 5: Extend the stats object and wire the module loop**

In `tools/export-corpus.js`, in `buildCorpus`'s `stats` initializer (lines 181–191), add these keys after `emptyClean: 0,`:

```js
    emptyClean: 0,
    reviewStatus: { edited: 0, accepted: 0, carryover: 0, null: 0 },
    sidecarsRead: 0,
    sidecarsMalformed: 0,
    sidecarsAbsent: 0,
    sidecarSegMissing: 0,
  };
```

After the tier-maps loop closes (after line 223, the `}` ending `for (const [tierName, tierDir] of Object.entries(TIER_DIRS))`) and **before** the `for (const [segId, enRaw] of enMap)` loop, insert the once-per-module sidecar load:

```js
      // Review-status sidecar (D1/D2): sibling of the faithful file, one per
      // module. Classified once here so the module-grain counters stay in step
      // with modulesListed (invariant: read + malformed + absent === listed).
      const sidecar = loadSidecar(
        path.join(BOOKS_DIR, book, '03-faithful-translation', dir, `${moduleName}-review-status.json`),
        moduleName
      );
      if (sidecar.state === 'ok') stats.sidecarsRead++;
      else if (sidecar.state === 'absent') stats.sidecarsAbsent++;
      else stats.sidecarsMalformed++;
```

Replace the `for (const [segId, enRaw] of enMap)` body (lines 225–247) with (hoisting `faithfulRaw` so both the row and the resolver see the same `|| null`-coerced value):

```js
      for (const [segId, enRaw] of enMap) {
        const faithfulRaw = tierMaps.faithful ? tierMaps.faithful.get(segId) || null : null;
        const { status: reviewStatus, segMissing } = resolveReviewStatus(sidecar, segId, faithfulRaw);
        if (segMissing) stats.sidecarSegMissing++;
        const row = buildRow({
          id: segId,
          book,
          chapter,
          module: moduleName,
          licence,
          en: enRaw,
          mt: tierMaps.mt ? tierMaps.mt.get(segId) || null : null,
          faithful: faithfulRaw,
          localized: tierMaps.localized ? tierMaps.localized.get(segId) || null : null,
          reviewStatus,
        });
        for (const tierName of ['mt', 'faithful', 'localized']) {
          if (row[tierName]) stats.tiers[tierName]++;
        }
        for (const tierName of ['en', 'mt', 'faithful', 'localized']) {
          if (row[tierName] && row[tierName].raw && row[tierName].clean === '') stats.emptyClean++;
        }
        if (row.postEdited === true) stats.postEditedTrue++;
        if (row.postEdited === false) stats.postEditedFalse++;
        const rsKey = row.reviewStatus === null ? 'null' : row.reviewStatus;
        stats.reviewStatus[rsKey] = (stats.reviewStatus[rsKey] || 0) + 1;
        rows.push(row);
        stats.rows++;
      }
```

- [ ] **Step 6: Add the fixture sidecar and its integration tests**

In `tools/__tests__/export-corpus.test.js`, in `writeFixtureBook()`, add a sidecar for m1 just before the m2 block (after line 198's `04-localized-content` write). This file is read only by `loadSidecar` via its exact path — it does **not** change any row/module/tier count:

```js
    // m1 review-status sidecar (item 20b PR2): all three statuses on
    // faithful-present segments, plus a STALE accepted claim on p3 whose
    // faithful is empty — D3.1 must override it to null.
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      JSON.stringify({
        generated: '2026-07-19T00:00:00.000Z',
        book: BOOK,
        chapter: '1',
        module: 'm1',
        segments: {
          'm1:title:t': { status: 'edited', by: 'ed', at: '2026-07-19 09:00:00' },
          'm1:para:p1': { status: 'accepted', by: 'ed', at: '2026-07-19 09:00:00' },
          'm1:para:p2': { status: 'carryover' },
          'm1:para:p3': { status: 'accepted', by: 'ed', at: '2026-07-19 09:00:00' },
        },
      })
    );
```

Add a new describe block after the `buildCorpus over a book fixture` describe closes (after line 375). It reuses the same fixture helpers by living inside the same outer describe — so place these `it`s **inside** the `describe('buildCorpus over a book fixture', …)` block, right before its closing `});` at line 375:

```js
  it('resolves reviewStatus from the sidecar; faithful-null beats a stale sidecar (D3)', () => {
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').reviewStatus).toBe('edited');
    expect(byId.get('m1:para:p1').reviewStatus).toBe('accepted');
    expect(byId.get('m1:para:p2').reviewStatus).toBe('carryover');
    // p3: sidecar says 'accepted' but faithful is empty -> null (D3.1)
    expect(byId.get('m1:para:p3').reviewStatus).toBeNull();
    // no faithful tier at all -> null (D3.1)
    expect(byId.get('m2:para:p1').reviewStatus).toBeNull();
    // no sidecar for m2/m3/... -> null (D3.2)
    expect(byId.get('m3:para:p1').reviewStatus).toBeNull();
    expect(stats.reviewStatus).toEqual({ edited: 1, accepted: 1, carryover: 1, null: 6 });
  });

  it('counts sidecar states and holds the read+malformed+absent === listed invariant (D4)', () => {
    const { stats } = buildCorpus(BOOK, {});
    expect(stats.sidecarsRead).toBe(1); // m1
    expect(stats.sidecarsMalformed).toBe(0);
    expect(stats.sidecarsAbsent).toBe(5); // m2, m3, chapter-metadata, exercises, m9
    expect(stats.sidecarsRead + stats.sidecarsMalformed + stats.sidecarsAbsent).toBe(
      stats.modulesListed
    );
    expect(stats.sidecarSegMissing).toBe(0);
  });

  it('treats a malformed sidecar as null for the whole module without aborting (D3.3)', () => {
    // Overwrite the fixture's good sidecar with invalid JSON.
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      '{ this is not json'
    );
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').reviewStatus).toBeNull();
    expect(byId.get('m1:para:p1').reviewStatus).toBeNull();
    expect(stats.sidecarsMalformed).toBe(1);
    expect(stats.sidecarsRead).toBe(0);
    expect(stats.reviewStatus).toEqual({ edited: 0, accepted: 0, carryover: 0, null: 9 });
  });

  it('flags the drift tripwire when the sidecar omits a faithful-present segment (D3.4)', () => {
    // Rewrite the sidecar to list t and p1 but OMIT p2 (whose faithful text
    // "Fast efni." exists). m1's faithful-present segments are t, p1, p2 —
    // p3 is empty so D3.1 nulls it before any lookup and it never counts as
    // drift. Only p2 is present-in-file-absent-from-sidecar → exactly 1.
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      JSON.stringify({
        module: 'm1',
        segments: {
          'm1:title:t': { status: 'edited' },
          'm1:para:p1': { status: 'accepted' },
        },
      })
    );
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:para:p2').reviewStatus).toBeNull();
    expect(byId.get('m1:para:p3').reviewStatus).toBeNull(); // empty faithful, NOT counted as drift
    expect(stats.sidecarSegMissing).toBe(1); // only p2: present in file, absent from sidecar
    expect(stats.sidecarsRead).toBe(1);
  });

  it('treats a module-mismatched sidecar as malformed (D2)', () => {
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      JSON.stringify({ module: 'mWRONG', segments: { 'm1:title:t': { status: 'edited' } } })
    );
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').reviewStatus).toBeNull();
    expect(stats.sidecarsMalformed).toBe(1);
  });
```

- [ ] **Step 7: Run the file's tests to verify green**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: PASS — all pre-existing tests (untouched counts still hold because a `.json` sidecar is never readdir-scanned) plus the 5 new integration tests and the 2 buildRow updates.

- [ ] **Step 8: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js
git commit -m "feat(export-corpus): emit reviewStatus per row + sidecar-state stats (D3/D4/D7)

Load the -review-status.json sidecar once per module, resolve a per-row
reviewStatus (last JSONL key), and count outcomes: per-status tallies plus
sidecarsRead/Malformed/Absent (invariant === modulesListed) and the
sidecarSegMissing drift tripwire. faithful-null overrides a stale sidecar;
a malformed/mismatched sidecar nulls the module without aborting the export.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `reviewStatus` TSV column, manifest notes, version bump, CLI summary

Surface the field in the TSV (12th column, D7), rewrite manifest note 4 + add note 5 (D5), bump `TOOL_VERSION` to 1.1 (D6), and print the new counters in `main()`.

**Files:**
- Modify: `tools/export-corpus.js` (`TOOL_VERSION` line 30; `TSV_SPEC`; `buildManifest` notes ~340–345; `main()` summary ~425–439)
- Test: `tools/__tests__/export-corpus.test.js` (`serializers` TSV tests; `buildManifest` notes pin ~424–446)

**Interfaces:**
- Consumes: Task-1 `TSV_SPEC`, Task-3 `row.reviewStatus`.
- Produces: TSV grows to 12 columns ending in `reviewStatus`; manifest `notes` grows to 5 entries; `manifest.toolVersion === '1.1'`.

- [ ] **Step 1: Update the TSV tests to 12 columns and the manifest notes pin**

In `tools/__tests__/export-corpus.test.js`:

(a) In the `serializers` describe, give the shared `row` a reviewStatus by adding a second fixture row for the value check, and update the two TSV tests written in Task 1. Replace the `it('toTsv emits the byte-literal 11-column header …')` test with:

```js
  it('toTsv emits the byte-literal 12-column header and sanitizes tabs/newlines', () => {
    const tsv = toTsv([row]);
    // No trimEnd(): reviewStatus is now the LAST column and is empty here (null);
    // trimEnd() strips trailing tab whitespace and would eat that empty field
    // before the split, collapsing 12 fields to 11. split('\n')[1] is the row;
    // toTsv's single real trailing '\n' becomes a harmless final '' element.
    const lines = tsv.split('\n');
    expect(lines[0]).toBe(
      'id\tbook\tchapter\tmodule\ttype\tlicence\ten_clean\tmt_clean\tfaithful_clean\tlocalized_clean\tpostEdited\treviewStatus'
    );
    const fields = lines[1].split('\t');
    expect(fields).toHaveLength(12);
    expect(fields[TSV_COLUMNS.indexOf('en_clean')]).toBe('A B C.');
    expect(fields[TSV_COLUMNS.indexOf('localized_clean')]).toBe('');
    expect(fields[TSV_COLUMNS.indexOf('postEdited')]).toBe('true');
    expect(fields[TSV_COLUMNS.indexOf('reviewStatus')]).toBe(''); // row has no status → null → ''
  });
```

Update the `it('maps every column to its value at the right index …')` test (added in Task 1): its first line currently reads `const fields = toTsv([row]).trimEnd().split('\n')[1].split('\t');` — change it to drop `.trimEnd()` (same trailing-empty-field trap now that `reviewStatus` is the last column):

```js
    const fields = toTsv([row]).split('\n')[1].split('\t');
```

and add, after the `fields[10]` line:

```js
    expect(fields[11]).toBe(''); // reviewStatus (null → '')
```

Add a focused test proving a non-null status maps through:

```js
  it('serializes a non-null reviewStatus into the last column', () => {
    const r = buildRow({
      id: 'm1:para:p1',
      book: 'efnafraedi-2e',
      chapter: '1',
      module: 'm1',
      licence: 'CC BY 4.0',
      en: 'Water.',
      mt: 'Vatn.',
      faithful: 'Vatn.',
      localized: null,
      reviewStatus: 'accepted',
    });
    const fields = toTsv([r]).split('\n')[1].split('\t');
    expect(fields[TSV_COLUMNS.indexOf('reviewStatus')]).toBe('accepted');
  });
```

(b) Replace the byte-exact notes pin (lines 440–445) with the 5-note version, and add a `toolVersion` assertion. In the `buildManifest carries …` test, after line 438 (`expect(manifest.notes.some(...))`) the block currently pins 4 notes; replace the `expect(manifest.notes).toEqual([...])` array with:

```js
    expect(manifest.notes).toEqual([
      'single-char legacy markers (*…*, ~…~, ^…^, __…__) retained in clean text (TM ambiguity rationale)',
      '[[MATH:N]]/[[MEDIA:n]] placeholders retained, resolve via 02-structure sidecars; [[BR]]/[[SPACE]] formatting placeholders also retained and are NOT sidecar-resolvable',
      `EN tier is the current extraction; for modules MT’d before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g. m68664)`,
      'faithful-tier presence and postEdited=false do not imply per-segment human review — apply rebuilds whole-module files, carrying unreviewed segments through as the normalized MT view; the per-segment record is the reviewStatus field (note 5)',
      'reviewStatus reflects the last apply, faithful-restore, or acceptance-revoke for the module — not live DB state, and not necessarily the current file bytes (a hand-edit to 03-faithful-translation/ does not regenerate the sidecar); null means unknown (no sidecar, no faithful tier, or a segment the sidecar does not list), never "unreviewed"',
    ]);
```

Add after that array:

```js
    expect(manifest.toolVersion).toBe('1.1');
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/export-corpus.test.js -t "12-column header"` and `… -t "buildManifest carries"`
Expected: FAIL — TSV still has 11 columns; notes array still has 4 entries; `toolVersion` is `'1.0'`.

- [ ] **Step 3: Add the reviewStatus column, rewrite the notes, bump the version**

In `tools/export-corpus.js`:

(a) Bump the version (line 30):

```js
const TOOL_VERSION = '1.1';
```

(b) Append the `reviewStatus` column to `TSV_SPEC` (added in Task 1) — after the `postEdited` entry:

```js
  { column: 'postEdited', get: (r) => r.postEdited },
  { column: 'reviewStatus', get: (r) => r.reviewStatus },
];
```

(c) In `buildManifest`, replace note 4 (line 344, the `'faithful-tier presence and postEdited=false …'` string) and append note 5, so the `notes` array ends:

```js
      `EN tier is the current extraction; for modules MT’d before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g. m68664)`,
      'faithful-tier presence and postEdited=false do not imply per-segment human review — apply rebuilds whole-module files, carrying unreviewed segments through as the normalized MT view; the per-segment record is the reviewStatus field (note 5)',
      'reviewStatus reflects the last apply, faithful-restore, or acceptance-revoke for the module — not live DB state, and not necessarily the current file bytes (a hand-edit to 03-faithful-translation/ does not regenerate the sidecar); null means unknown (no sidecar, no faithful tier, or a segment the sidecar does not list), never "unreviewed"',
    ],
  };
}
```

- [ ] **Step 4: Add the CLI summary lines**

In `main()`, after the `postEdited:` console.log (line 433), add the always-printed per-status line and, after the existing conditional block (after line 439), the anomaly counters:

```js
  console.log(`postEdited:         true=${stats.postEditedTrue} false=${stats.postEditedFalse}`);
  const rs = stats.reviewStatus;
  console.log(
    `reviewStatus:       edited=${rs.edited} accepted=${rs.accepted} carryover=${rs.carryover} null=${rs.null}`
  );
```

and after the `if (stats.filesSkipped) …` line (line 439):

```js
  if (stats.filesSkipped) console.log(`  files skipped (see manifest):   ${stats.filesSkipped}`);
  if (stats.sidecarsRead) console.log(`  review-status sidecars read:    ${stats.sidecarsRead}`);
  if (stats.sidecarsMalformed) console.log(`  review-status sidecars bad:     ${stats.sidecarsMalformed}`);
  if (stats.sidecarSegMissing) console.log(`  sidecar seg-id absent (drift):  ${stats.sidecarSegMissing}`);
  const rsUnexpected = Object.keys(rs).filter(
    (k) => !['edited', 'accepted', 'carryover', 'null'].includes(k)
  );
  if (rsUnexpected.length) console.log(`  unexpected reviewStatus values: ${rsUnexpected.join(', ')}`);
```

- [ ] **Step 5: Run the file's tests to verify green**

Run: `npx vitest run tools/__tests__/export-corpus.test.js`
Expected: PASS — all tests including the 12-column header, the at-index reviewStatus, the non-null status mapping, the 5-note pin, and `toolVersion === '1.1'`.

- [ ] **Step 6: `node --check` and a manual CLI smoke**

Run: `node --check tools/export-corpus.js` — expect no output (syntax OK).

Run: `node tools/export-corpus.js --book efnafraedi-2e --dry-run -v`
Expected: a summary that now includes a `reviewStatus:  edited=0 accepted=0 carryover=0 null=<N>` line (no real sidecars exist yet, so every row is `null` — the honest current state), no `review-status sidecars read` line, and no crash. Confirm the tool still reports its rows/tiers as before.

- [ ] **Step 7: Commit**

```bash
git add tools/export-corpus.js tools/__tests__/export-corpus.test.js
git commit -m "feat(export-corpus): reviewStatus TSV column + manifest v1.1 + honest note (D5/D6)

Add reviewStatus as the 12th TSV column (last), bump TOOL_VERSION 1.0->1.1,
rewrite manifest note 4 (drop the now-false 'lives only in the DB' claim, point
at the field) and add note 5 stating the exact contract: reflects the last
apply/restore/revoke, null means unknown never 'unreviewed'. Print per-status
tallies + sidecar-state counters in the CLI summary.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full gate + docs, register, campaign entry

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 20b block + register)
- Modify: `.superpowers/sdd/progress.md` (SDD ledger — append)

- [ ] **Step 1: Run the authoritative full gate**

Run: `npm test` (from repo root)
Expected: all suites green. If any pre-existing suite is red, confirm it is red on `main` too (`git stash && npm test`) before attributing it elsewhere — do not mark this task done on a red gate you introduced.

- [ ] **Step 2: Mark item 20b PR2 shipped + register MTA-R13 and I20-R10**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, in the item-20b block, update the `▶ NEXT coding` pointer from "item 20b PR2" to "item 21 (TM + Árnastofnun)", and add a PR2-shipped line mirroring the PR1 style. Then add to the register (after the MTA-R12 entry):

```markdown
      - **MTA-R13 `[correctness — producer asymmetry, register only]`** — `acceptSegment` does not regenerate the `-review-status.json` sidecar though `revokeAcceptance` does (PR1 F1), and neither do `supersedeForEdit`'s call sites (`segmentEditorService.js:134/:171`, `propagationService.js:135`). A segment accepted (or an acceptance superseded) after the module's last apply is not reflected until the next apply/restore/revoke, so the sidecar — and PR2's corpus `reviewStatus` — reads "as of the last apply", not live DB. Both directions under-claim (fail-safe). Lead decision 2026-07-20: register, do not fix in the tools-only PR2 — fix belongs with a server PR (one `regenSidecarSafe` per site + tests). PR2's manifest note 5 documents the contract honestly.
      - **I20-R10 `[stat — honesty signal, register only]`** — the cross-tab `reviewStatus === 'carryover' && postEdited === true` names the sharpest class in the corpus: the Icelandic text diverges from raw MT, but no one attested this segment. Nearly free from counters PR2 already has. Lead decision 2026-07-20: register, do not build — with zero sidecars in production it would ship reading 0 everywhere, no data to validate the interpretation. Pick up once the 4 faithful modules are re-reviewed.
```

Update the item 21 scope note if needed (I20-R6's deadline is now met by PR2 — reword "rides item 20b PR2 instead" → "closed by item 20b PR2").

- [ ] **Step 3: Commit the docs**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(campaign): item 20b PR2 shipped — corpus reviewStatus + I20-R6 closed; register MTA-R13, I20-R10

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Whole-branch adversarial review**

Hand off to the SDD wrapper's final-review step (a Workflow: diverse-lens finders → refute-default verify → triage) over the branch diff `main..HEAD`. Known-not-to-reraise: MTA-R13 and I20-R10 are deliberate register-only deferrals; `main()` has no subprocess test (I20-R9 precedent, covered by the Step-6 manual smoke). Address any confirmed findings in a fix wave, re-run `npm test`, then open the PR.

---

## Self-Review

**Spec coverage (§9 + addendum D1–D9):**
- §9 "read `-review-status.json` when present" → Task 2 `loadSidecar` + Task 3 wiring. ✓
- §9 row field `reviewStatus` domain incl. `null` for missing sidecar → Task 3 (`buildRow`), D3 rules in Task 2. ✓
- §9 "TSV gains the column" → Task 4. ✓
- §9 "manifest note 4 updated to point consumers at the field" → Task 4 note 4 rewrite + note 5. ✓ (D5)
- §9 "stats gain per-status counts" → Task 3 `stats.reviewStatus` + Task 4 CLI. ✓ (D4)
- §9 "Folds I20-R6 (accessor table + literal header pin)" → Task 1. ✓ (D8)
- D1 read from disk not DB → Task 2/3 (path-built, `fs.readFileSync`). ✓
- D2 validate module not chapter → Task 2 `loadSidecar` module check; chapter never compared. ✓
- D3 five-case order incl. faithful-null-beats-stale + drift tripwire → Task 2 `resolveReviewStatus` + Task 3 tests. ✓
- D4 split null counter + invariant → Task 3 stats + invariant test. ✓
- D5 no staleness detection, documented → Task 4 note 5; no mtime code anywhere. ✓
- D6 TOOL_VERSION 1.1 → Task 4. ✓
- D7 append-last both serializations → Task 3 (row) + Task 4 (TSV). ✓
- D8 accessor table, TSV_COLUMNS still exported, postEdited ternary collapse proven → Task 1. ✓
- D9 byte-literal header, all-12-at-index, discriminating faithful-null test, counter invariant, notes+key-order pins in lockstep → Tasks 1/3/4. ✓
- §3 register MTA-R13 + I20-R10, neither built → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact code and exact commands. ✓

**Type consistency:** `loadSidecar` returns `{state, segments?}` consumed identically in Task 3's module loop and Task 2's tests; `resolveReviewStatus` returns `{status, segMissing}` destructured identically in Task 3; `buildRow` gains `p.reviewStatus ?? null`; `TSV_SPEC` `{column, get}` consumed by `toTsv` and `TSV_COLUMNS` derivation. Names match across tasks. ✓
