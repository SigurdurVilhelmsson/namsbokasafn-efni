# Biology Extraction-Coverage Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only pre-freeze checkpoint tool that flags dropped `<list>` items (the verified BIO-EX3 review-option bug) and duplicate seg-ids in a book's extracted segments, before the MT/Pass-1 freeze.

**Architecture:** A pure lib (`tools/lib/extraction-coverage.js`) compares source CNXML against emitted seg-ids using the extractor's deterministic id-linked scheme (`item.id || `${list.id}-item-${i+1}``) — **no prose normalization** (rejected by the go/no-go spike: biology's legacy `__term__`/`*i*` markers defeat substring matching). A thin CLI (`tools/verify-extraction-coverage.js`) cloned from `tools/scan-residue.js` walks a book, calls the lib per module, reports, and exits 1 on any flag. Writes nothing; not wired into `cnxml-extract` (BIO-EX2).

**Tech Stack:** Node 22 ESM, `@xmldom/xmldom` DOMParser, `tools/lib/seg-markers.cjs` (`parseSegmentsMap`), `tools/lib/parseArgs.js`, Vitest.

## Global Constraints

- Read-only: the tool MUST NOT write any file under `books/`. Never re-extract; never renumber seg-ids (BIO-EX2 — chemistry's frozen ids are the export join key).
- Resolve paths against `import.meta.url` / `import.meta.dirname`, never `process.cwd()` (server runs cwd=`server/`; masked prod bugs #210/#213).
- Not wired into `cnxml-extract.js`; a manual runbook checkpoint only.
- `npm test` from the **repo root** is the authoritative gate (no branch protection).
- Spec of record: `docs/superpowers/specs/2026-07-15-biology-extraction-coverage-gate-design.md`.
- Expected list-item seg-id = `item.id || `${list.id}-item-${i+1}`` — copied verbatim from `cnxml-extract.js:1646/1697`; do not paraphrase.

---

## File Structure

- Create `tools/lib/extraction-coverage.js` — pure analysis (no I/O). Exports `emittedElementIds`, `parseModuleDoc`, `checkLists`, `checkDuplicateSegIds`, `analyzeModule`.
- Create `tools/verify-extraction-coverage.js` — CLI (I/O + reporting), cloned from `tools/scan-residue.js`.
- Create `tools/__tests__/extraction-coverage.test.js` — Vitest unit tests (lib) + one CLI smoke test.
- Modify `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` — add the pre-freeze checkpoint runbook line (biology onboarding doc).
- Modify `docs/plans/2026-07-11-pre-semester-coding-campaign.md` — mark item 6b shipped in the register.

---

### Task 1: Lib — emitted seg-ids + list-item coverage (the verified bug)

**Files:**
- Create: `tools/lib/extraction-coverage.js`
- Test: `tools/__tests__/extraction-coverage.test.js`

**Interfaces:**
- Produces: `emittedElementIds(segText: string) -> Set<string>`; `parseModuleDoc(cnxmlText: string) -> { doc, content }`; `checkLists(content: Element|null, emittedIds: Set<string>) -> Array<{listId, items, present, missing: string[]}>`

- [ ] **Step 1: Write the failing tests**

```js
// tools/__tests__/extraction-coverage.test.js
import { describe, it, expect } from 'vitest';
import { emittedElementIds, parseModuleDoc, checkLists } from '../lib/extraction-coverage.js';

const doc = (contentInner) =>
  `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">` +
  `<content>${contentInner}</content></document>`;
const seg = (...ids) => ids.map((id) => `<!-- SEG:m:${id} -->\nx`).join('\n');

describe('emittedElementIds', () => {
  it('extracts the 3rd colon-component of each marker', () => {
    const ids = emittedElementIds(seg('item:L1-item-1', 'para:fs-1'));
    expect(ids.has('L1-item-1')).toBe(true);
    expect(ids.has('fs-1')).toBe(true);
  });
});

describe('checkLists', () => {
  it('R1: flags a list whose items are all dropped (0 of 4 emitted)', () => {
    const { content } = parseModuleDoc(
      doc('<list id="L1"><item>monomers</item><item>polymers</item>' +
          '<item>water and polymers</item><item>none of the above</item></list>')
    );
    const f = checkLists(content, emittedElementIds(seg('para:fs-stem')));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ listId: 'L1', items: 4, present: 0 });
    expect(f[0].missing).toContain('none of the above');
  });

  it('R2: flags a partial drop (3 of 4 emitted)', () => {
    const { content } = parseModuleDoc(
      doc('<list id="L1"><item>a</item><item>b</item><item>c</item><item>d</item></list>')
    );
    const f = checkLists(content, emittedElementIds(seg('item:L1-item-1', 'item:L1-item-2', 'item:L1-item-3')));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ items: 4, present: 3 });
  });

  it('G1: passes a fully-emitted list (6 of 6) — the m68710 id-orphan case', () => {
    const { content } = parseModuleDoc(
      doc('<list id="S"><item>a</item><item>b</item><item>c</item><item>d</item><item>e</item><item>f</item></list>')
    );
    const emitted = emittedElementIds(
      seg('item:S-item-1', 'item:S-item-2', 'item:S-item-3', 'item:S-item-4', 'item:S-item-5', 'item:S-item-6')
    );
    expect(checkLists(content, emitted)).toHaveLength(0);
  });

  it('G3: passes items carrying their own ids', () => {
    const { content } = parseModuleDoc(doc('<list id="L1"><item id="own-1">a</item><item id="own-2">b</item></list>'));
    expect(checkLists(content, emittedElementIds(seg('item:own-1', 'item:own-2')))).toHaveLength(0);
  });

  it('skips an id-less list (cannot compute expected id -> no false flag)', () => {
    const { content } = parseModuleDoc(doc('<list><item>a</item><item>b</item></list>'));
    expect(checkLists(content, emittedElementIds(seg()))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: FAIL — `Cannot find module '../lib/extraction-coverage.js'`.

- [ ] **Step 3: Write the minimal implementation**

```js
// tools/lib/extraction-coverage.js
import { DOMParser } from '@xmldom/xmldom';
import segMarkers from './seg-markers.cjs';
const { parseSegmentsMap } = segMarkers;

/** Parse a CNXML module string; return the doc and its <content> element (or null). */
export function parseModuleDoc(cnxmlText) {
  const doc = new DOMParser().parseFromString(cnxmlText, 'text/xml');
  const content = doc.getElementsByTagName('content')[0] || null;
  return { doc, content };
}

/** Set of emitted elementIds: the 3rd ':'-component of each `<!-- SEG:module:type:elementId -->`. */
export function emittedElementIds(segText) {
  const ids = new Set();
  for (const full of parseSegmentsMap(segText).keys()) {
    const parts = String(full).split(':');
    if (parts.length >= 3) ids.add(parts.slice(2).join(':'));
  }
  return ids;
}

function directItems(list) {
  const out = [];
  for (let i = 0; i < list.childNodes.length; i++) {
    const c = list.childNodes[i];
    if (c.nodeType === 1 && c.localName === 'item') out.push(c);
  }
  return out;
}

const snippet = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * List-item coverage. The extractor emits list item i as
 * `item.id || `${list.id}-item-${i+1}`` (cnxml-extract.js:1646/1697). Fewer present than
 * source items => a dropped/partial list (BIO-EX3). A list with any uncomputable expected
 * id (id-less item inside an id-less list) is SKIPPED to avoid false positives (spec §12).
 */
export function checkLists(content, emittedIds) {
  const findings = [];
  if (!content) return findings;
  const lists = content.getElementsByTagName('list');
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    const listId = list.getAttribute('id') || null;
    const items = directItems(list);
    if (items.length === 0) continue;
    const expected = [];
    let uncomputable = false;
    items.forEach((it, idx) => {
      const iid = it.getAttribute('id') || (listId ? `${listId}-item-${idx + 1}` : null);
      if (!iid) uncomputable = true;
      expected.push({ id: iid, el: it });
    });
    if (uncomputable) continue;
    const missing = expected.filter((e) => !emittedIds.has(e.id));
    if (missing.length > 0) {
      findings.push({
        listId: listId || '(id-less-list)',
        items: items.length,
        present: items.length - missing.length,
        missing: missing.map((e) => snippet(e.el)),
      });
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/extraction-coverage.js tools/__tests__/extraction-coverage.test.js
git commit -m "feat(6b): list-item coverage lib (catches BIO-EX3 dropped-option bug)"
```

---

### Task 2: Lib — duplicate seg-id detection

**Files:**
- Modify: `tools/lib/extraction-coverage.js`
- Test: `tools/__tests__/extraction-coverage.test.js`

**Interfaces:**
- Produces: `checkDuplicateSegIds(content: Element|null, segText: string) -> { sourceDup: Array<{id,count}>, rawDup: Array<{segId,count}> }`

- [ ] **Step 1: Write the failing tests** (append to the test file)

```js
import { checkDuplicateSegIds } from '../lib/extraction-coverage.js';

describe('checkDuplicateSegIds', () => {
  it('flags a source id that defines two elements in <content>', () => {
    const { content } = parseModuleDoc(doc('<para id="dup">a</para><para id="dup">b</para>'));
    const r = checkDuplicateSegIds(content, '');
    expect(r.sourceDup).toEqual([{ id: 'dup', count: 2 }]);
  });

  it('flags a raw seg marker that repeats (parseSegmentsMap would dedupe it)', () => {
    const { content } = parseModuleDoc(doc('<para id="a">x</para>'));
    const segText = '<!-- SEG:m:para:a -->\nx\n<!-- SEG:m:para:a -->\ny';
    const r = checkDuplicateSegIds(content, segText);
    expect(r.rawDup).toEqual([{ segId: 'm:para:a', count: 2 }]);
  });

  it('reports nothing on a clean module', () => {
    const { content } = parseModuleDoc(doc('<para id="a">x</para>'));
    const r = checkDuplicateSegIds(content, '<!-- SEG:m:para:a -->\nx');
    expect(r.sourceDup).toHaveLength(0);
    expect(r.rawDup).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js -t "checkDuplicateSegIds"`
Expected: FAIL — `checkDuplicateSegIds is not a function`.

- [ ] **Step 3: Implement** (append to `tools/lib/extraction-coverage.js`)

```js
// Same marker pattern as seg-markers.cjs (SEG_MARKER), duplicated intentionally: this
// counts RAW occurrences, whereas parseSegmentsMap dedupes 'first'. Ties to campaign item
// #15 (dup-seg-ID policy unification) — do not consolidate here.
const RAW_SEG_MARKER = /<!--\s*SEG:([^\s]+?)\s*-->/g;

export function checkDuplicateSegIds(content, segText) {
  const sourceDup = [];
  if (content) {
    const counts = new Map();
    const all = content.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const id = all[i].getAttribute('id');
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const [id, n] of counts) if (n > 1) sourceDup.push({ id, count: n });
  }
  const rawCounts = new Map();
  let m;
  const re = new RegExp(RAW_SEG_MARKER.source, 'g');
  while ((m = re.exec(segText || ''))) rawCounts.set(m[1], (rawCounts.get(m[1]) || 0) + 1);
  const rawDup = [];
  for (const [id, n] of rawCounts) if (n > 1) rawDup.push({ segId: id, count: n });
  return { sourceDup, rawDup };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/extraction-coverage.js tools/__tests__/extraction-coverage.test.js
git commit -m "feat(6b): duplicate seg-id detection (source + raw-marker)"
```

---

### Task 3: Lib — analyzeModule aggregator

**Files:**
- Modify: `tools/lib/extraction-coverage.js`
- Test: `tools/__tests__/extraction-coverage.test.js`

**Interfaces:**
- Consumes: `parseModuleDoc`, `emittedElementIds`, `checkLists`, `checkDuplicateSegIds`
- Produces: `analyzeModule(cnxmlText: string, segText: string) -> { listFindings, dupFindings, hasFindings: boolean }`

- [ ] **Step 1: Write the failing test**

```js
import { analyzeModule } from '../lib/extraction-coverage.js';

describe('analyzeModule', () => {
  it('aggregates list + dup findings and sets hasFindings', () => {
    const cnxml = doc('<list id="L1"><item>a</item><item>b</item></list>');
    const r = analyzeModule(cnxml, seg('para:other'));
    expect(r.listFindings).toHaveLength(1);
    expect(r.hasFindings).toBe(true);
  });

  it('hasFindings is false for a clean module', () => {
    const cnxml = doc('<list id="L1"><item>a</item></list>');
    const r = analyzeModule(cnxml, seg('item:L1-item-1'));
    expect(r.hasFindings).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js -t "analyzeModule"`
Expected: FAIL — `analyzeModule is not a function`.

- [ ] **Step 3: Implement** (append to `tools/lib/extraction-coverage.js`)

```js
export function analyzeModule(cnxmlText, segText) {
  const { content } = parseModuleDoc(cnxmlText);
  const listFindings = checkLists(content, emittedElementIds(segText));
  const dupFindings = checkDuplicateSegIds(content, segText);
  const hasFindings =
    listFindings.length > 0 || dupFindings.sourceDup.length > 0 || dupFindings.rawDup.length > 0;
  return { listFindings, dupFindings, hasFindings };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/extraction-coverage.js tools/__tests__/extraction-coverage.test.js
git commit -m "feat(6b): analyzeModule aggregator"
```

---

### Task 4: CLI `tools/verify-extraction-coverage.js`

**Files:**
- Create: `tools/verify-extraction-coverage.js`
- Test: `tools/__tests__/extraction-coverage.test.js` (append a CLI smoke test)

**Interfaces:**
- Consumes: `analyzeModule` from the lib; `parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook` from `tools/lib/parseArgs.js`

- [ ] **Step 1: Write the CLI** (this tool's behavior is exercised by the Step 3 smoke test — write it first here so the test has a target)

```js
#!/usr/bin/env node
/**
 * Read-only pre-freeze extraction-coverage checkpoint (campaign item 6b).
 * Walks a book's 02-for-mt × 01-source, and per module flags dropped <list> items
 * (BIO-EX3) and duplicate seg-ids. Prints a report; never writes any books/ file.
 *
 * Usage: node tools/verify-extraction-coverage.js --book liffraedi-2e [--chapter 3] [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import { analyzeModule } from './lib/extraction-coverage.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_OPTION = { name: 'json', flags: ['--json'], type: 'boolean', default: false };

function chapterDirs(root, chapter) {
  if (chapter === 'appendices') return ['appendices'];
  if (typeof chapter === 'number' && !Number.isNaN(chapter)) return ['ch' + String(chapter).padStart(2, '0')];
  return fs.readdirSync(root).filter((d) => /^ch\d+$/.test(d) || d === 'appendices').sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, CHAPTER_OPTION, JSON_OPTION]);
  if (args.help) {
    console.log(
      'Usage: node tools/verify-extraction-coverage.js --book <slug> [--chapter N|appendices] [--json]\n' +
        'Read-only pre-freeze coverage checkpoint over 02-for-mt x 01-source. Exits 1 on any flag.'
    );
    return;
  }
  requireBook(args);
  if (args.chapter !== null && args.chapter !== 'appendices' && Number.isNaN(args.chapter)) {
    console.error('Error: --chapter must be a number or "appendices"');
    process.exit(1);
  }

  const forMtRoot = path.join(REPO_ROOT, 'books', args.book, '02-for-mt');
  const srcRoot = path.join(REPO_ROOT, 'books', args.book, '01-source');
  if (!fs.existsSync(forMtRoot)) {
    console.error(`Error: no 02-for-mt for ${args.book}`);
    process.exit(1);
  }

  const modules = {};
  let missingSource = 0;
  for (const dir of chapterDirs(forMtRoot, args.chapter)) {
    const segDir = path.join(forMtRoot, dir);
    if (!fs.existsSync(segDir)) continue;
    for (const file of fs.readdirSync(segDir)) {
      if (!file.endsWith('-segments.en.md')) continue;
      const moduleId = file.slice(0, -'-segments.en.md'.length);
      const srcFile = path.join(srcRoot, dir, `${moduleId}.cnxml`);
      if (!fs.existsSync(srcFile)) { missingSource++; continue; } // e.g. chapter-metadata
      const r = analyzeModule(fs.readFileSync(srcFile, 'utf8'), fs.readFileSync(path.join(segDir, file), 'utf8'));
      if (r.hasFindings) modules[moduleId] = { chapter: dir, ...r };
    }
  }

  const ids = Object.keys(modules);
  const summary = {
    modulesWithFindings: ids.length,
    listsWithDroppedItems: ids.reduce((s, m) => s + modules[m].listFindings.length, 0),
    duplicateSegIds: ids.reduce(
      (s, m) => s + modules[m].dupFindings.sourceDup.length + modules[m].dupFindings.rawDup.length, 0),
    modulesMissingSource: missingSource,
  };

  if (args.json) {
    console.log(JSON.stringify({ book: args.book, summary, modules }, null, 2));
  } else {
    console.log(`Extraction-coverage checkpoint — ${args.book}\n`);
    for (const m of ids.sort()) {
      const e = modules[m];
      for (const lf of e.listFindings)
        console.log(`  ${m} (${e.chapter}): list ${lf.listId} — ${lf.present}/${lf.items} items emitted; ` +
          `dropped e.g. ${JSON.stringify(lf.missing.slice(0, 3))}`);
      for (const d of e.dupFindings.sourceDup) console.log(`  ${m} (${e.chapter}): duplicate source id ${d.id} (${d.count}×)`);
      for (const d of e.dupFindings.rawDup) console.log(`  ${m} (${e.chapter}): duplicate seg-id ${d.segId} (${d.count}×)`);
    }
    console.log(
      `\nSummary: ${summary.listsWithDroppedItems} list(s) with dropped items + ` +
        `${summary.duplicateSegIds} duplicate seg-id(s) across ${summary.modulesWithFindings} module(s).`
    );
  }
  process.exit(ids.length ? 1 : 0);
}

main();
```

- [ ] **Step 2: Write the failing smoke test** (append to the test file)

```js
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const TOOLS = path.resolve(import.meta.dirname, '..');

describe('verify-extraction-coverage CLI', () => {
  it('exits 1 and reports the dropped option lists on real m66438 (--json --chapter 3)', () => {
    let out, code = 0;
    try {
      out = execFileSync('node',
        [path.join(TOOLS, 'verify-extraction-coverage.js'), '--book', 'liffraedi-2e', '--chapter', '3', '--json'],
        { cwd: path.resolve(TOOLS, '..'), encoding: 'utf8' });
    } catch (e) { code = e.status; out = e.stdout; }
    expect(code).toBe(1);
    const report = JSON.parse(out);
    expect(report.modules.m66438).toBeDefined();
    expect(report.modules.m66438.listFindings.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Run the smoke test to verify it passes** (the CLI already exists from Step 1; this proves it end-to-end on the real corpus)

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js -t "CLI"`
Expected: PASS — exit code 1, `m66438` present with ≥3 list findings.

- [ ] **Step 4: Run the whole suite from the repo root**

Run: `npm test`
Expected: PASS (full Vitest suite green; the new file included).

- [ ] **Step 5: Commit**

```bash
git add tools/verify-extraction-coverage.js tools/__tests__/extraction-coverage.test.js
git commit -m "feat(6b): read-only verify-extraction-coverage CLI"
```

---

### Task 5: Corpus calibration + runbook + register

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (runbook line)
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (mark 6b shipped)

- [ ] **Step 1: Run the gate over biology and a chem sample; capture output**

Run:
```bash
node tools/verify-extraction-coverage.js --book liffraedi-2e | tee /tmp/6b-biology.txt
node tools/verify-extraction-coverage.js --book efnafraedi-2e --chapter 4   # m68710 must NOT appear
```
Expected: biology flags the multiple-choice option-list drops (this is the gate working);
`efnafraedi-2e --chapter 4` does **not** flag m68710 (id-orphan passes). Record the biology
module/list count in the campaign register. If any *chem* module flags, give it a human glance
(potential real drop) — do **not** edit frozen content.

- [ ] **Step 2: Add the pre-freeze checkpoint runbook line**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, under the biology intake
sequence, add (place next to the extract step):

```markdown
> **Pre-freeze coverage checkpoint (campaign 6b):** after extracting a biology chapter and BEFORE any
> MT/Pass-1 freeze, run `node tools/verify-extraction-coverage.js --book liffraedi-2e --chapter N`.
> Any flagged `<list>` = dropped items (the BIO-EX3 `processExercise` option-drop bug) → the module
> needs the extractor fix + re-extract before freeze (free while 0-faithful). Post-MT, also run
> `node tools/scan-residue.js --book liffraedi-2e --chapter N` for EN residue in 02-mt-output.
> The gate detects list-item drops + duplicate seg-ids only; glossary/caption/standalone-para drops are
> documented residuals (spec §12).
```

- [ ] **Step 3: Mark item 6b shipped in the campaign register**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, update the item 6b line to note: shipped as
`tools/verify-extraction-coverage.js` + `tools/lib/extraction-coverage.js`; mechanism = structural
list-item coverage (content-coverage rejected by go/no-go — legacy marker dialects); surfaced BIO-EX3
live across biology; `processExercise` fix deferred to a follow-up PR.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(6b): pre-freeze checkpoint runbook + register (6b shipped)"
```

---

## Self-Review

- **Spec coverage:** §3(i) list coverage → Task 1; §3(ii) dup seg-ids → Task 2; §8 tool shape (lib + CLI, read-only, `import.meta.url`) → Tasks 3–4; §9 acceptance R1/R2/G1/G3/id-less-skip → Task 1 tests, CLI R1 on real m66438 → Task 4; §11 runbook + register → Task 5; post-MT `scan-residue` line → Task 5 runbook. Glossary/caption deferred (spec §3 note) — no task, intentional.
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** `emittedElementIds`/`parseModuleDoc`/`checkLists`/`checkDuplicateSegIds`/`analyzeModule` names + shapes match across Tasks 1–4 and the CLI. `analyzeModule` returns `{listFindings, dupFindings, hasFindings}` consumed identically by the CLI.
