# Audit #14 — SEG-marker parser unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7 hand-maintained `parseSegments` copies with one shared `tools/lib/seg-markers.cjs`, preserving each call site's behavior exactly (proven a no-op on the real corpus).

**Architecture:** A single CommonJS lib (`.cjs`) exposes `SEG_MARKER`, `parseSegmentsMap(content,{duplicates})`, and `parseSegmentRecords(content)`. ESM tools named-import it; the CommonJS server `require()`s it synchronously (interop verified). A characterization test pins byte-identical output old-vs-new across real corpus files before/while call sites migrate.

**Tech Stack:** Node 22, Vitest. Mixed module systems: `tools/` ESM (root `"type":"module"`), `server/` CommonJS (`server/package.json` `"type":"commonjs"`).

## Global Constraints

- **Behavior-preserving refactor only.** No policy convergence, no routing changes. Each site's output must be byte-identical before/after. Converging duplicate-policy (#15), the `isApiTranslated` routing fix, and #19 orphan cleanup are explicitly OUT of scope.
- **The lib is `tools/lib/seg-markers.cjs` (CommonJS, `module.exports`).** ESM tools: `import { … } from '<rel>/seg-markers.cjs'`. CJS server: `require('<rel>/seg-markers.cjs')`.
- **Canonical marker:** `/<!--\s*SEG:([^\s]+?)\s*-->/g` — proven identical to all variants on 54,379 corpus markers. Marker-based slicing (tolerates a marker glued onto the previous line — the PR #96 case).
- **Duplicate policy is preserved per-site:** `duplicates:'first'` (inject, generate-tm, repair-emphasis) vs `duplicates:'last'` (module-sections, auto-insert). `parseSegmentRecords` keeps ALL. 185 corpus files have dup IDs, so this matters.
- **`normalizeWraps` stays in `segmentParser.js`** (editor-display-specific) — NOT in the lib.
- **Local `npm test` is the authoritative gate** (CI red until ~Jul 1). Run before each commit.
- A shared `/g` regex carries `.lastIndex` state — iterate via `matchAll` or `new RegExp(SEG_MARKER.source,'g')`, never bare `.exec` on the exported object across calls.

---

### Task 1: The shared lib `tools/lib/seg-markers.cjs` + unit tests

**Files:**
- Create: `tools/lib/seg-markers.cjs`
- Test: `tools/__tests__/seg-markers.test.js`

**Interfaces:**
- Produces:
  - `SEG_MARKER: RegExp` — global, `/<!--\s*SEG:([^\s]+?)\s*-->/g`.
  - `parseSegmentsMap(content: string, opts?: {duplicates?: 'first'|'last'}) → Map<string,string>` (default `'first'`).
  - `parseSegmentRecords(content: string) → Array<{segmentId,moduleId,segmentType,elementId,content}>` (keep-all, order preserved).
- Consumed by Tasks 2–4.

- [ ] **Step 1: Write the failing unit tests**

Create `tools/__tests__/seg-markers.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { SEG_MARKER, parseSegmentsMap, parseSegmentRecords } from '../lib/seg-markers.cjs';

const DUP = [
  '<!-- SEG:m1:title:auto-1 -->', 'First', '',
  '<!-- SEG:m1:para:p1 -->', 'Para one', '',
  '<!-- SEG:m1:title:auto-1 -->', 'Second', '',
].join('\n');

describe('parseSegmentsMap', () => {
  it('parses id→text, trimmed', () => {
    const m = parseSegmentsMap('<!-- SEG:m1:para:p1 -->\n  Hello  \n');
    expect(m.get('m1:para:p1')).toBe('Hello');
  });
  it('default duplicates=first keeps the first value', () => {
    expect(parseSegmentsMap(DUP).get('m1:title:auto-1')).toBe('First');
  });
  it('duplicates=last overwrites with the last value', () => {
    expect(parseSegmentsMap(DUP, { duplicates: 'last' }).get('m1:title:auto-1')).toBe('Second');
  });
  it('tolerates a marker glued onto the previous line (PR #96 case)', () => {
    const glued = '<!-- SEG:m1:t:a -->\nTitle<!-- SEG:m1:para:p -->\nBody';
    const m = parseSegmentsMap(glued);
    expect(m.get('m1:t:a')).toBe('Title');
    expect(m.get('m1:para:p')).toBe('Body');
  });
  it('tolerates flexible whitespace in the marker', () => {
    expect(parseSegmentsMap('<!--  SEG:m1:para:p  -->\nX').get('m1:para:p')).toBe('X');
  });
  it('returns empty map for empty input', () => {
    expect(parseSegmentsMap('').size).toBe(0);
  });
});

describe('parseSegmentRecords', () => {
  it('keeps ALL occurrences in order and splits the id', () => {
    const recs = parseSegmentRecords(DUP);
    expect(recs.map((r) => r.segmentId)).toEqual(['m1:title:auto-1', 'm1:para:p1', 'm1:title:auto-1']);
    expect(recs[0]).toMatchObject({ moduleId: 'm1', segmentType: 'title', elementId: 'auto-1', content: 'First' });
    expect(recs[2].content).toBe('Second');
  });
  it('captures the trailing segment (EOF, no following marker)', () => {
    const recs = parseSegmentRecords('<!-- SEG:m1:para:only -->\nLast bit');
    expect(recs).toHaveLength(1);
    expect(recs[0].content).toBe('Last bit');
  });
});

describe('SEG_MARKER', () => {
  it('is a global regex', () => {
    expect(SEG_MARKER.flags).toContain('g');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/seg-markers.test.js`
Expected: FAIL — cannot resolve `../lib/seg-markers.cjs`.

- [ ] **Step 3: Implement the lib**

Create `tools/lib/seg-markers.cjs`:

```javascript
/**
 * seg-markers.cjs — the single SEG-marker parser. Replaces 7 hand-maintained
 * copies (audit #14). CommonJS so both the ESM tools (named import) and the
 * CommonJS server (sync require) can consume it.
 *
 * Marker format: <!-- SEG:module:type:elementId -->. Content runs from a marker
 * to the next marker (or EOF), trimmed — marker-based, so a marker glued onto
 * the previous line is handled (the PR #96 failure).
 */

// Whitespace-tolerant, permissive 3-part id. Proven identical to the prior
// permissive/strict/exact variants across 54,379 corpus markers.
const SEG_MARKER = /<!--\s*SEG:([^\s]+?)\s*-->/g;

/**
 * Parse into Map<id, text>.
 * @param {string} content
 * @param {{duplicates?: 'first'|'last'}} [opts] - 'first' (default) skips repeats; 'last' overwrites.
 * @returns {Map<string,string>}
 */
function parseSegmentsMap(content, { duplicates = 'first' } = {}) {
  const segments = new Map();
  if (!content) return segments;
  const re = new RegExp(SEG_MARKER.source, 'g');
  let currentId = null;
  let contentStart = 0;
  for (const match of content.matchAll(re)) {
    if (currentId !== null) {
      const text = content.slice(contentStart, match.index).trim();
      if (duplicates === 'last' || !segments.has(currentId)) segments.set(currentId, text);
    }
    currentId = match[1];
    contentStart = match.index + match[0].length;
  }
  if (currentId !== null) {
    const text = content.slice(contentStart).trim();
    if (duplicates === 'last' || !segments.has(currentId)) segments.set(currentId, text);
  }
  return segments;
}

/**
 * Parse into ordered records, keeping ALL occurrences.
 * @param {string} content
 * @returns {Array<{segmentId:string,moduleId:string,segmentType:string,elementId:string,content:string}>}
 */
function parseSegmentRecords(content) {
  const records = [];
  if (!content) return records;
  const re = new RegExp(SEG_MARKER.source, 'g');
  let current = null;
  let contentStart = 0;
  for (const match of content.matchAll(re)) {
    if (current) {
      current.content = content.slice(contentStart, match.index).trim();
      records.push(current);
    }
    const id = match[1];
    const [moduleId, segmentType, elementId] = id.split(':');
    current = { segmentId: id, moduleId, segmentType, elementId, content: '' };
    contentStart = match.index + match[0].length;
  }
  if (current) {
    current.content = content.slice(contentStart).trim();
    records.push(current);
  }
  return records;
}

module.exports = { SEG_MARKER, parseSegmentsMap, parseSegmentRecords };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/seg-markers.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/seg-markers.cjs tools/__tests__/seg-markers.test.js
git commit -m "feat(audit14): tools/lib/seg-markers.cjs — single SEG-marker parser + unit tests"
```

---

### Task 2: Characterization test — prove the lib reproduces every old parser on the real corpus

**Files:**
- Test: `tools/__tests__/seg-markers-characterization.test.js`

**Interfaces:**
- Consumes: `parseSegmentsMap`, `parseSegmentRecords` from Task 1.
- Produces: the no-op guarantee that lets Tasks 3–4 migrate safely.

**Why:** embeds the THREE old parser variants verbatim and asserts the lib reproduces each, byte-identically, on every real segment file (including the 185 dup-ID files). If any file differs, the refactor is NOT a no-op there — STOP and report it.

- [ ] **Step 1: Write the characterization test**

Create `tools/__tests__/seg-markers-characterization.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSegmentsMap, parseSegmentRecords } from '../lib/seg-markers.cjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── verbatim copies of the OLD parsers (the golden behavior) ──
function oldPatternAFirst(content) { // inject / repair-emphasis
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;
  let m;
  while ((m = pattern.exec(content)) !== null) { const id = m[1], t = m[2].trim(); if (!segments.has(id)) segments.set(id, t); }
  return segments;
}
function oldPatternALast(content) { // module-sections / auto-insert
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;
  let m;
  while ((m = pattern.exec(content)) !== null) { segments.set(m[1], m[2].trim()); }
  return segments;
}
const OLD_STRICT = /<!--\s*SEG:([\w]+:[\w-]+:[\w-]+)\s*-->/g;
function oldPatternBFirst(content) { // generate-tm
  const segments = new Map();
  if (!content) return segments;
  let currentId = null, contentStart = 0;
  for (const m of content.matchAll(OLD_STRICT)) {
    if (currentId !== null && !segments.has(currentId)) segments.set(currentId, content.slice(contentStart, m.index).trim());
    currentId = m[1]; contentStart = m.index + m[0].length;
  }
  if (currentId !== null && !segments.has(currentId)) segments.set(currentId, content.slice(contentStart).trim());
  return segments;
}

function allSegmentFiles() {
  const files = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p) : (/-segments.*\.md$|\.(en|is)\.md$/.test(n) && files.push(p)); } };
  for (const b of fs.readdirSync(path.join(REPO, 'books'))) {
    const bd = path.join(REPO, 'books', b);
    if (!fs.statSync(bd).isDirectory()) continue;
    for (const sub of ['02-for-mt', '02-mt-output', '03-faithful-translation']) walk(path.join(bd, sub));
  }
  return files;
}

const mapEq = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

describe('seg-markers characterization (no-op proof on real corpus)', () => {
  const files = allSegmentFiles();
  it('finds a representative corpus (incl. dup-id files)', () => { expect(files.length).toBeGreaterThan(100); });

  it('parseSegmentsMap(first) matches old Pattern-A-first on every file', () => {
    const diffs = files.filter((f) => { const c = fs.readFileSync(f, 'utf8'); return !mapEq(parseSegmentsMap(c), oldPatternAFirst(c)); });
    expect(diffs).toEqual([]);
  });
  it('parseSegmentsMap(last) matches old Pattern-A-last on every file', () => {
    const diffs = files.filter((f) => { const c = fs.readFileSync(f, 'utf8'); return !mapEq(parseSegmentsMap(c, { duplicates: 'last' }), oldPatternALast(c)); });
    expect(diffs).toEqual([]);
  });
  it('parseSegmentsMap(first) matches old Pattern-B-first (generate-tm) on every file', () => {
    const diffs = files.filter((f) => { const c = fs.readFileSync(f, 'utf8'); return !mapEq(parseSegmentsMap(c), oldPatternBFirst(c)); });
    expect(diffs).toEqual([]);
  });
  it('parseSegmentRecords content matches old Pattern-B slice on every file', () => {
    const diffs = files.filter((f) => {
      const c = fs.readFileSync(f, 'utf8');
      const recs = parseSegmentRecords(c);
      // compare against a fresh slice over the strict regex (segmentParser pre-normalizeWraps behavior)
      const old = [];
      let cur = null, start = 0;
      for (const m of c.matchAll(new RegExp(OLD_STRICT.source, 'g'))) { if (cur) { cur.content = c.slice(start, m.index).trim(); old.push(cur); } cur = { segmentId: m[1], content: '' }; start = m.index + m[0].length; }
      if (cur) { cur.content = c.slice(start).trim(); old.push(cur); }
      return recs.length !== old.length || recs.some((r, i) => r.segmentId !== old[i].segmentId || r.content !== old[i].content);
    });
    expect(diffs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tools/__tests__/seg-markers-characterization.test.js`
Expected: PASS (all 5). If any `diffs` is non-empty, the lib is NOT a no-op for those files — STOP, report the file list and the divergence; do not proceed to migration.

- [ ] **Step 3: Commit**

```bash
git add tools/__tests__/seg-markers-characterization.test.js
git commit -m "test(audit14): characterization — lib reproduces all 3 old SEG parsers on real corpus"
```

---

### Task 3: Migrate the 5 ESM Map-consumer sites

**Files:**
- Modify: `tools/cnxml-inject.js` (`parseSegments` ~`:173`), `tools/generate-tm.js` (`parseSegments` ~`:54`, `SEG_MARKER_REGEX` ~`:41`), `tools/repair-emphasis.js` (~`:41`), `tools/lib/module-sections.js` (~`:87`), `tools/auto-insert-placeholders.js` (~`:58`)

**Interfaces:**
- Consumes: `parseSegmentsMap` from Task 1; the no-op guarantee from Task 2.
- Produces: these 5 tools share one parser. Public behavior unchanged.

- [ ] **Step 1: Migrate `cnxml-inject.js`**

Add near the top imports: `import { parseSegmentsMap } from './lib/seg-markers.cjs';`
Replace the whole `function parseSegments(content) {…}` body (~`:173-194`) with a thin wrapper that preserves the dup-count log:

```javascript
function parseSegments(content) {
  const all = [...content.matchAll(new RegExp('<!--\\s*SEG:([^\\s]+?)\\s*-->', 'g'))].map((m) => m[1]);
  const segments = parseSegmentsMap(content); // first-wins
  const duplicateCount = all.length - segments.size;
  if (duplicateCount > 0) {
    console.error(`  Note: ${duplicateCount} duplicate segment(s) skipped (first-match-wins)`);
  }
  return segments;
}
```

- [ ] **Step 2: Migrate `generate-tm.js`**

Replace `const SEG_MARKER_REGEX = …` (~`:41`) and the `function parseSegments(content){…}` (~`:54-73`) with:

```javascript
const { SEG_MARKER, parseSegmentsMap } = require('./lib/seg-markers.cjs');
// (generate-tm.js is ESM; use: import { SEG_MARKER, parseSegmentsMap } from './lib/seg-markers.cjs';)
const SEG_MARKER_REGEX = SEG_MARKER; // back-compat alias if referenced elsewhere
function parseSegments(content) { return parseSegmentsMap(content); }
```

(generate-tm.js is ESM — use the `import` form, not `require`. Keep `parseSegments` as a 1-line wrapper so internal callers at `:256-257` are untouched. Verify `SEG_MARKER_REGEX` has no other use; if none, delete the alias and the wrapper and call `parseSegmentsMap` directly at `:256-257`.)

- [ ] **Step 3: Migrate `repair-emphasis.js`, `module-sections.js`, `auto-insert-placeholders.js`**

In each, add the ESM import `import { parseSegmentsMap } from '<rel>/lib/seg-markers.cjs';` (`./lib/` from `tools/`, `./` from within `tools/lib/`) and replace the local `function parseSegments(content){…}`:
- `repair-emphasis.js`: `function parseSegments(content) { return parseSegmentsMap(content); }` (first-wins).
- `module-sections.js`: `function parseSegments(content) { return parseSegmentsMap(content, { duplicates: 'last' }); }`.
- `auto-insert-placeholders.js`: `function parseSegments(content) { return parseSegmentsMap(content, { duplicates: 'last' }); }`.

(Keeping the 1-line `parseSegments` wrapper avoids touching each file's internal call sites. Alternatively inline `parseSegmentsMap(...)` at the call sites and delete `parseSegments` — either is fine; the wrapper is lower-risk.)

- [ ] **Step 4: Run the full suite + characterization**

Run: `npm test`
Expected: green (84+ files). The existing inject/generate-tm/repair-emphasis suites are the behavior guard; the characterization test confirms parity.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js tools/generate-tm.js tools/repair-emphasis.js tools/lib/module-sections.js tools/auto-insert-placeholders.js
git commit -m "refactor(audit14): 5 ESM tools use shared seg-markers.cjs (behavior preserved)"
```

---

### Task 4: Migrate the records-consumer sites (docx-import ESM + segmentParser CJS)

**Files:**
- Modify: `tools/docx-import.js` (`parseSegmentFile` ~`:148`)
- Modify: `server/services/segmentParser.js` (`parseSegments` ~`:102`)

**Interfaces:**
- Consumes: `parseSegmentRecords` from Task 1.
- Produces: proves the lib serves BOTH module systems (ESM tool + CJS server).

- [ ] **Step 1: Migrate `docx-import.js` (ESM)**

Add `import { parseSegmentRecords } from './lib/seg-markers.cjs';`. Replace `function parseSegmentFile(content){…}` so it returns the file's existing shape (`{segmentId, text, type, moduleId}`):

```javascript
function parseSegmentFile(content) {
  return parseSegmentRecords(content).map((r) => ({
    segmentId: r.segmentId, text: r.content, type: r.segmentType, moduleId: r.moduleId,
  }));
}
```

- [ ] **Step 2: Migrate `server/services/segmentParser.js` (CJS)**

Add at the top (with the other `require`s): `const { parseSegmentRecords } = require('../../tools/lib/seg-markers.cjs');`
Replace `function parseSegments(content){…}` (~`:102-146`) so it keeps `normalizeWraps` (still defined in this file) applied to each record's content, returning the same `{segmentId,moduleId,segmentType,elementId,content}` shape it returns today:

```javascript
function parseSegments(content) {
  return parseSegmentRecords(content).map((r) => ({
    ...r,
    content: normalizeWraps(r.content),
  }));
}
```

(`normalizeWraps` already trims-then-collapses; `parseSegmentRecords` returns trimmed content, so `normalizeWraps(r.content)` reproduces the old `normalizeWraps(slice.trim())`.)

- [ ] **Step 3: Run the full suite (incl. server tests)**

Run: `npm test`
Expected: green. `server/__tests__/segmentParser*.test.js` (if present) + the editor/preview server suites guard segmentParser; the characterization test guards docx-import's records shape.

- [ ] **Step 4: Commit**

```bash
git add tools/docx-import.js server/services/segmentParser.js
git commit -m "refactor(audit14): docx-import + server segmentParser use shared seg-markers.cjs"
```

---

### Task 5: Docs, register, memory, PR

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (mark #14 done; record the re-scoped routing item + #15/#19 in the register)
- Modify: project `MEMORY.md`

- [ ] **Step 1: Update the roadmap + out-of-scope register**

In the plan's register, mark **#14 SEG-marker parser unification** done (one `seg-markers.cjs`, 7 sites, characterization-proven no-op). Add/keep register entries for: the **`isApiTranslated` routing fix** (re-scoped as a provenance item — the real biology blocker, needs B2); **#15** duplicate-policy convergence (enforcement PR, after this); **#19** orphan legacy segment files (cleanup). Note biology routing is NOT unblocked by #14.

- [ ] **Step 2: Update memory**

Update `MEMORY.md`: #14 done; **next biology item = #33** (inject list-flattening), then the re-scoped routing/provenance item. Add a one-line topic pointer for `seg-markers.cjs` (the dual ESM/CJS shared parser; duplicate-policy preserved per-site; routing fix is separate).

- [ ] **Step 3: Commit + push + PR**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(audit14): mark parser unification done; register routing/#15/#19 follow-ups"
git push -u origin feat/seg-markers-unification
gh pr create --title "Audit #14: unify SEG-marker parsing into one seg-markers.cjs (no-op refactor)" --body "<summary + characterization evidence + scope boundary>"
```

---

## Self-review notes (author)

- **Spec coverage:** lib + unit tests (Task 1) ✓; characterization no-op proof incl. dup-ID files (Task 2) ✓; all 7 sites migrated — 5 Map (Task 3) + 2 records across both module systems (Task 4) ✓; docs/register/memory/PR (Task 5) ✓. Out-of-scope items (routing, #15, #18 absorbed, #19) recorded ✓.
- **Type consistency:** `parseSegmentsMap(content,{duplicates})→Map`, `parseSegmentRecords(content)→records[]`, `SEG_MARKER` used identically in Tasks 1–4. docx-import maps records→`{segmentId,text,type,moduleId}`; segmentParser maps records→`{...r,content:normalizeWraps}` — both preserve their file's existing return shape.
- **Module boundary:** lib is `.cjs`; ESM sites `import`, CJS server `require`s — interop verified 2026-06-29.
- **Risk:** the dup-count log in inject is reproduced via a marker-count minus map-size (Task 3 Step 1); the characterization test only checks the Map, so confirm the log still fires on a dup-ID module during Task 3 (manual eyeball or a focused assert).
