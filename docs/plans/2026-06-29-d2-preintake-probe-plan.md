# D2 — Pre-intake Structural Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only `tools/preintake-probe.js` that scans a candidate book's raw CNXML and emits a go/no-go fitness checklist (os-embed → BLOCK; iframe / empty-glossary / unknown note class / unrecognized inline → WARN), reproducing each of the 5 in-repo books' known gaps.

**Architecture:** Pure check functions in `tools/lib/preintake-checks.js` (`runFileChecks(cnxml)` per file + `evaluateBook(agg, bookConfig)` verdict). A thin CLI `tools/preintake-probe.js` walks the source dir, aggregates, evaluates, prints (+`--json`), and exits non-zero on NO-GO. Checks 1–4 are regex; check 5 (unrecognized inline) is DOM-scoped via `@xmldom/xmldom` so MathML internals don't flood it.

**Tech Stack:** Node 22 ESM, Vitest, `@xmldom/xmldom` ^0.9.10 (already a dependency), `fs.readdirSync(dir,{recursive:true})`.

**Design spec:** [docs/plans/2026-06-29-d2-preintake-probe-design.md](2026-06-29-d2-preintake-probe-design.md)

## Global Constraints

- **Read-only.** The probe never writes/mutates any book file.
- Robustness directive: a malformed CNXML file must not crash the probe (skip its inline check, keep going).
- Node 22 / ESM (`export function`, `.js` imports). Test gate is local `npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 🔒 `books/*/01-source/` is READ-ONLY (the probe only reads it).

## Verified facts (baked into the acceptance test)

Recursive counts over `books/<slug>/01-source/`: efnafraedi-2e os-embed=0 iframe=0 glossary=present →
**GO**; liffraedi-2e iframe=35 →WARN; edlisfraedi-2e iframe=57 →WARN; orverufraedi glossary=0/term=141
→WARN; lifraen-efnafraedi os-embed=260 →**BLOCK/NO-GO** + glossary=0/term=214 →WARN. Extractor's handled
inline tags: `emphasis sub sup link term footnote newline space math`. os-embed shape:
`<link class="os-embed" url="#exercise/…"/>`. Note class shape: `<note class="microbiology clinical-focus">`.

## File structure

- **Create** `tools/lib/preintake-checks.js` — `HANDLED_INLINE`, `TEXT_CONTAINERS`, `runFileChecks(cnxml)`, `evaluateBook(agg, bookConfig)`. Pure (string/obj in, obj out).
- **Create** `tools/preintake-probe.js` — `probeDir(dir, bookConfig)` + `main()` (CLI). I/O + orchestration.
- **Create** `tools/__tests__/preintake-checks.test.js`, `tools/__tests__/preintake-probe.test.js`.

---

### Task 1: Per-file regex checks (os-embed, iframe, term/glossary, note classes)

**Files:**
- Create: `tools/lib/preintake-checks.js`
- Test: `tools/__tests__/preintake-checks.test.js`

**Interfaces:**
- Produces: `runFileChecks(cnxml: string) => { osEmbed: number, iframe: number, hasTerm: boolean, hasGlossary: boolean, noteClasses: string[], unrecognizedInline: Record<string,number> }`. (Task 1 returns `unrecognizedInline: {}`; Task 2 fills it.)

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/preintake-checks.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { runFileChecks } from '../lib/preintake-checks.js';

describe('runFileChecks — regex checks', () => {
  it('counts os-embed exercise links', () => {
    const cnxml = '<document><link class="os-embed" url="#exercise/11-06"/></document>';
    expect(runFileChecks(cnxml).osEmbed).toBe(1);
  });

  it('counts iframe embeds', () => {
    const cnxml = '<document><media><iframe src="https://phet"/></media></document>';
    expect(runFileChecks(cnxml).iframe).toBe(1);
  });

  it('detects term and glossary presence', () => {
    const withGloss = '<document><term>x</term><glossary><definition/></glossary></document>';
    const r1 = runFileChecks(withGloss);
    expect(r1.hasTerm).toBe(true);
    expect(r1.hasGlossary).toBe(true);
    const termOnly = runFileChecks('<document><para>a <term>y</term> b</para></document>');
    expect(termOnly.hasTerm).toBe(true);
    expect(termOnly.hasGlossary).toBe(false);
  });

  it('extracts note class values (deduped)', () => {
    const cnxml =
      '<document><note class="microbiology clinical-focus"/><note class="microbiology clinical-focus"/>' +
      '<note class="evolution"/><note>no class</note></document>';
    expect(runFileChecks(cnxml).noteClasses.sort()).toEqual([
      'evolution',
      'microbiology clinical-focus',
    ]);
  });

  it('is clean on a plain module', () => {
    const r = runFileChecks('<document><para>Hello <emphasis>world</emphasis></para></document>');
    expect(r.osEmbed).toBe(0);
    expect(r.iframe).toBe(0);
    expect(r.noteClasses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `npx vitest run tools/__tests__/preintake-checks.test.js`
Expected: FAIL — cannot resolve `../lib/preintake-checks.js`.

- [ ] **Step 3: Implement the regex checks**

Create `tools/lib/preintake-checks.js`:

```js
/**
 * preintake-checks.js — pure structural checks for the D2 pre-intake probe.
 * No I/O. Each check is tied to a proven pipeline failure mode.
 */

/** Inline tags the extractor converts to markers (everything else gets stripped). */
export const HANDLED_INLINE = new Set([
  'emphasis',
  'sub',
  'sup',
  'link',
  'term',
  'footnote',
  'newline',
  'space',
  'math', // <m:math> localName is 'math'
]);

/** Inline-only text containers whose direct element children must be handled inline. */
export const TEXT_CONTAINERS = ['para', 'title', 'caption', 'label', 'meaning'];

/** Note class values present in the CNXML (deduped); notes without a class are ignored. */
function extractNoteClasses(cnxml) {
  const out = new Set();
  const re = /<note\b[^>]*\bclass="([^"]+)"/g;
  let m;
  while ((m = re.exec(cnxml)) !== null) out.add(m[1]);
  return [...out];
}

/**
 * Per-file structural findings.
 * @param {string} cnxml
 * @returns {{osEmbed:number, iframe:number, hasTerm:boolean, hasGlossary:boolean,
 *            noteClasses:string[], unrecognizedInline:Record<string,number>}}
 */
export function runFileChecks(cnxml) {
  const text = String(cnxml || '');
  return {
    osEmbed: (text.match(/class="os-embed"/g) || []).length,
    iframe: (text.match(/<iframe\b/g) || []).length,
    hasTerm: /<term\b/.test(text),
    hasGlossary: /<glossary\b/.test(text),
    noteClasses: extractNoteClasses(text),
    unrecognizedInline: {}, // filled in Task 2
  };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tools/__tests__/preintake-checks.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/preintake-checks.js tools/__tests__/preintake-checks.test.js
git commit -m "feat(probe): per-file regex checks for the pre-intake probe (D2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Unrecognized-inline check (DOM-scoped)

**Files:**
- Modify: `tools/lib/preintake-checks.js` (fill `unrecognizedInline`)
- Test: `tools/__tests__/preintake-checks.test.js`

**Interfaces:**
- Consumes: `HANDLED_INLINE`, `TEXT_CONTAINERS`. Produces: `runFileChecks(...).unrecognizedInline` = `{ <tag>: <count> }` for direct element children of text containers whose `localName` is not in `HANDLED_INLINE`. Malformed CNXML → `{}` (skip, don't throw).

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/preintake-checks.test.js`:

```js
describe('runFileChecks — unrecognized inline (DOM)', () => {
  it('flags an unhandled inline element inside a para', () => {
    const cnxml =
      '<document xmlns:m="http://www.w3.org/1998/Math/MathML">' +
      '<para>A <quote>q</quote> and <emphasis>e</emphasis> and <m:math><m:mn>2</m:mn></m:math></para>' +
      '</document>';
    const r = runFileChecks(cnxml);
    expect(r.unrecognizedInline).toEqual({ quote: 1 });
  });

  it('does not flag handled inline or MathML internals', () => {
    const cnxml =
      '<document xmlns:m="http://www.w3.org/1998/Math/MathML">' +
      '<para><emphasis>e</emphasis><sub>2</sub><link url="x">l</link>' +
      '<m:math><m:mrow><m:mi>x</m:mi></m:mrow></m:math></para></document>';
    expect(runFileChecks(cnxml).unrecognizedInline).toEqual({});
  });

  it('returns {} on malformed CNXML (does not throw)', () => {
    expect(() => runFileChecks('<para>unclosed')).not.toThrow();
    expect(runFileChecks('<para>unclosed').unrecognizedInline).toEqual({});
  });
});
```

- [ ] **Step 2: Run — fails (unrecognizedInline still {})**

Run: `npx vitest run tools/__tests__/preintake-checks.test.js -t "unrecognized inline"`
Expected: FAIL — first test expects `{ quote: 1 }`, gets `{}`.

- [ ] **Step 3: Implement the DOM check**

In `tools/lib/preintake-checks.js`, add the import at top:

```js
import { DOMParser } from '@xmldom/xmldom';
```

Add the helper (above `runFileChecks`):

```js
/**
 * Direct element children of inline-only text containers whose localName is not
 * a handled inline tag — these get stripped by the extractor. DOM-scoped so
 * MathML internals (grandchildren under <m:math>) are never examined.
 */
function findUnrecognizedInline(cnxml) {
  const counts = {};
  let doc;
  try {
    // Silence the parser; a malformed file just yields no findings.
    doc = new DOMParser({ onError: () => {} }).parseFromString(cnxml, 'text/xml');
  } catch {
    return counts;
  }
  if (!doc || !doc.documentElement) return counts;

  for (const container of TEXT_CONTAINERS) {
    const nodes = doc.getElementsByTagName(container);
    for (let i = 0; i < nodes.length; i++) {
      const child = nodes[i].firstChild;
      for (let c = child; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue; // element nodes only
        const name = c.localName || c.nodeName.replace(/^.*:/, '');
        if (!HANDLED_INLINE.has(name)) {
          counts[name] = (counts[name] || 0) + 1;
        }
      }
    }
  }
  return counts;
}
```

Then in `runFileChecks`, replace `unrecognizedInline: {}` with:

```js
    unrecognizedInline: findUnrecognizedInline(text),
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tools/__tests__/preintake-checks.test.js`
Expected: PASS (all checks, incl. 3 new).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/preintake-checks.js tools/__tests__/preintake-checks.test.js
git commit -m "feat(probe): DOM-scoped unrecognized-inline check (D2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `evaluateBook` — per-book verdict

**Files:**
- Modify: `tools/lib/preintake-checks.js` (add `evaluateBook`)
- Test: `tools/__tests__/preintake-checks.test.js`

**Interfaces:**
- Consumes: `SHARED_NOTE_LABELS` from `book-rendering-config.js`. Produces:
  `evaluateBook(agg, bookConfig) => { checks: {osEmbed,iframe,glossary,noteClass,inline: {status, ...}}, verdict: 'GO'|'GO-WITH-GAPS'|'NO-GO' }` where `agg = { osEmbed:number, iframe:number, anyTerm:boolean, anyGlossary:boolean, noteClasses:Set<string>, unrecognizedInline:Map<string,number> }` and `bookConfig` is the parsed `book-config.json` or `null`.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/preintake-checks.test.js`:

```js
import { evaluateBook } from '../lib/preintake-checks.js';

const baseAgg = () => ({
  osEmbed: 0,
  iframe: 0,
  anyTerm: false,
  anyGlossary: false,
  noteClasses: new Set(),
  unrecognizedInline: new Map(),
});

describe('evaluateBook — verdict', () => {
  it('GO for a clean, fully-configured book', () => {
    const r = evaluateBook(baseAgg(), { noteTypeLabels: {} });
    expect(r.verdict).toBe('GO');
  });

  it('NO-GO when os-embed is present (BLOCK)', () => {
    const agg = { ...baseAgg(), osEmbed: 260 };
    const r = evaluateBook(agg, { noteTypeLabels: {} });
    expect(r.checks.osEmbed.status).toBe('block');
    expect(r.verdict).toBe('NO-GO');
  });

  it('GO-WITH-GAPS on iframe (WARN)', () => {
    const r = evaluateBook({ ...baseAgg(), iframe: 35 }, { noteTypeLabels: {} });
    expect(r.checks.iframe.status).toBe('warn');
    expect(r.verdict).toBe('GO-WITH-GAPS');
  });

  it('WARN on term-without-glossary', () => {
    const r = evaluateBook({ ...baseAgg(), anyTerm: true, anyGlossary: false }, { noteTypeLabels: {} });
    expect(r.checks.glossary.status).toBe('warn');
  });

  it('does not WARN when a glossary is present', () => {
    const r = evaluateBook({ ...baseAgg(), anyTerm: true, anyGlossary: true }, { noteTypeLabels: {} });
    expect(r.checks.glossary.status).toBe('ok');
  });

  it('WARNs on note classes absent from book-config (+SHARED)', () => {
    const agg = { ...baseAgg(), noteClasses: new Set(['evolution', 'link-to-learning']) };
    const r = evaluateBook(agg, { noteTypeLabels: { career: 'Starfsferill' } });
    // link-to-learning is in SHARED; evolution is not configured
    expect(r.checks.noteClass.status).toBe('warn');
    expect(r.checks.noteClass.items).toEqual(['evolution']);
  });
});
```

- [ ] **Step 2: Run — fails (evaluateBook not exported)**

Run: `npx vitest run tools/__tests__/preintake-checks.test.js -t "evaluateBook"`
Expected: FAIL — `evaluateBook is not a function`.

- [ ] **Step 3: Implement**

In `tools/lib/preintake-checks.js`, add the import at top:

```js
import { SHARED_NOTE_LABELS } from './book-rendering-config.js';
```

Add:

```js
/**
 * Per-book verdict from aggregated findings.
 * @param {{osEmbed:number,iframe:number,anyTerm:boolean,anyGlossary:boolean,
 *          noteClasses:Set<string>,unrecognizedInline:Map<string,number>}} agg
 * @param {object|null} bookConfig - parsed book-config.json (or null in --source mode)
 */
export function evaluateBook(agg, bookConfig) {
  const knownNoteClasses = new Set([
    ...Object.keys(SHARED_NOTE_LABELS),
    ...Object.keys((bookConfig && bookConfig.noteTypeLabels) || {}),
  ]);
  const unknownNoteClasses = [...agg.noteClasses].filter((c) => !knownNoteClasses.has(c)).sort();
  const inlineTags = [...agg.unrecognizedInline.keys()].sort();

  const checks = {
    osEmbed: { status: agg.osEmbed > 0 ? 'block' : 'ok', count: agg.osEmbed },
    iframe: { status: agg.iframe > 0 ? 'warn' : 'ok', count: agg.iframe },
    glossary: { status: agg.anyTerm && !agg.anyGlossary ? 'warn' : 'ok' },
    noteClass: { status: unknownNoteClasses.length ? 'warn' : 'ok', items: unknownNoteClasses },
    inline: { status: inlineTags.length ? 'warn' : 'ok', items: inlineTags },
  };

  const statuses = Object.values(checks).map((c) => c.status);
  const verdict = statuses.includes('block')
    ? 'NO-GO'
    : statuses.includes('warn')
      ? 'GO-WITH-GAPS'
      : 'GO';
  return { checks, verdict };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tools/__tests__/preintake-checks.test.js`
Expected: PASS (all, incl. 6 evaluateBook tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/preintake-checks.js tools/__tests__/preintake-checks.test.js
git commit -m "feat(probe): evaluateBook verdict (GO / GO-WITH-GAPS / NO-GO) (D2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: CLI `preintake-probe.js` (`probeDir` + `main`)

**Files:**
- Create: `tools/preintake-probe.js`
- Test: `tools/__tests__/preintake-probe.test.js`

**Interfaces:**
- Consumes: `runFileChecks`, `evaluateBook` (Task 1–3). Produces:
  `probeDir(dir: string, bookConfig: object|null) => { checks, verdict, agg: {…, fileCount:number} }` — walks `dir/**/*.cnxml`, aggregates per-file findings, evaluates.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/preintake-probe.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { probeDir } from '../preintake-probe.js';

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
  fs.mkdirSync(path.join(dir, 'ch01'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'ch01', 'm1.cnxml'),
    '<document><link class="os-embed" url="#e/1"/><para><term>t</term></para></document>'
  );
  fs.writeFileSync(
    path.join(dir, 'ch01', 'm2.cnxml'),
    '<document><para>clean <emphasis>x</emphasis></para></document>'
  );
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('probeDir', () => {
  it('walks .cnxml recursively and aggregates to a NO-GO on os-embed', () => {
    const r = probeDir(dir, { noteTypeLabels: {} });
    expect(r.agg.fileCount).toBe(2);
    expect(r.checks.osEmbed.count).toBe(1);
    expect(r.checks.glossary.status).toBe('warn'); // term present, no glossary
    expect(r.verdict).toBe('NO-GO');
  });
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `npx vitest run tools/__tests__/preintake-probe.test.js`
Expected: FAIL — cannot resolve `../preintake-probe.js`.

- [ ] **Step 3: Implement the CLI**

Create `tools/preintake-probe.js`:

```js
#!/usr/bin/env node
/**
 * preintake-probe.js — read-only pre-intake structural probe (D2).
 *
 * Scans a candidate book's raw CNXML and prints a go/no-go fitness checklist:
 *   os-embed exercises (BLOCK), iframe embeds, empty key-terms risk,
 *   unconfigured note classes, unrecognized inline elements (WARN).
 *
 * Usage:
 *   node tools/preintake-probe.js --book <slug>     # books/<slug>/01-source
 *   node tools/preintake-probe.js --source <dir>    # arbitrary candidate dir
 *   [--json] [--verbose] [-h|--help]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION } from './lib/parseArgs.js';
import { runFileChecks, evaluateBook } from './lib/preintake-checks.js';

const SOURCE_OPTION = { name: 'source', flags: ['--source'], type: 'string', default: null };
const JSON_OPTION = { name: 'json', flags: ['--json'], type: 'boolean', default: false };

/**
 * Walk dir for *.cnxml, run per-file checks, aggregate, and evaluate.
 * @param {string} dir
 * @param {object|null} bookConfig
 */
export function probeDir(dir, bookConfig) {
  const entries = fs.readdirSync(dir, { recursive: true });
  const files = entries.map(String).filter((f) => f.endsWith('.cnxml'));
  const agg = {
    osEmbed: 0,
    iframe: 0,
    anyTerm: false,
    anyGlossary: false,
    noteClasses: new Set(),
    unrecognizedInline: new Map(),
    fileCount: 0,
  };
  for (const rel of files) {
    const cnxml = fs.readFileSync(path.join(dir, rel), 'utf-8');
    const r = runFileChecks(cnxml);
    agg.osEmbed += r.osEmbed;
    agg.iframe += r.iframe;
    if (r.hasTerm) agg.anyTerm = true;
    if (r.hasGlossary) agg.anyGlossary = true;
    for (const c of r.noteClasses) agg.noteClasses.add(c);
    for (const [tag, n] of Object.entries(r.unrecognizedInline)) {
      agg.unrecognizedInline.set(tag, (agg.unrecognizedInline.get(tag) || 0) + n);
    }
    agg.fileCount++;
  }
  return { ...evaluateBook(agg, bookConfig), agg };
}

function loadBookConfig(dir) {
  // book-config.json lives at the book root (parent of 01-source) for --book,
  // or in the source dir itself for --source. Try both; null if neither.
  for (const p of [path.join(dir, '..', 'book-config.json'), path.join(dir, 'book-config.json')]) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const ICON = { ok: '✓ ok   ', warn: '⚠ WARN ', block: '✗ BLOCK' };

function printReport(label, result) {
  const { checks, verdict, agg } = result;
  console.log(`\nPre-intake probe: ${label} (${agg.fileCount} files)`);
  console.log(`  [${ICON[checks.osEmbed.status]}] os-embed exercises: ${checks.osEmbed.count}`);
  console.log(`  [${ICON[checks.iframe.status]}] iframe / embeds: ${checks.iframe.count}`);
  console.log(
    `  [${ICON[checks.glossary.status]}] empty key-terms risk: ${
      checks.glossary.status === 'warn' ? '<term> present, no <glossary>' : 'ok'
    }`
  );
  console.log(
    `  [${ICON[checks.noteClass.status]}] unconfigured note classes: ${checks.noteClass.items.length}`
  );
  if (checks.noteClass.items.length) console.log(`        ${checks.noteClass.items.join(', ')}`);
  console.log(
    `  [${ICON[checks.inline.status]}] unrecognized inline elements: ${checks.inline.items.length}`
  );
  if (checks.inline.items.length) console.log(`        ${checks.inline.items.join(', ')}`);
  console.log(`Verdict: ${verdict}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, SOURCE_OPTION, JSON_OPTION]);
  if (args.help) {
    console.log('Usage: preintake-probe.js (--book <slug> | --source <dir>) [--json] [--verbose]');
    process.exit(0);
  }
  if ((!args.book && !args.source) || (args.book && args.source)) {
    console.error('Error: provide exactly one of --book <slug> or --source <dir>');
    process.exit(1);
  }

  const dir = args.source || path.join('books', args.book, '01-source');
  if (!fs.existsSync(dir)) {
    console.error(`Error: source directory not found: ${dir}`);
    process.exit(1);
  }

  const label = args.source || args.book;
  const result = probeDir(dir, loadBookConfig(dir));

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          source: label,
          verdict: result.verdict,
          fileCount: result.agg.fileCount,
          checks: result.checks,
        },
        null,
        2
      )
    );
  } else {
    printReport(label, result);
  }
  process.exit(result.verdict === 'NO-GO' ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tools/__tests__/preintake-probe.test.js`
Expected: PASS.

- [ ] **Step 5: Smoke-test the CLI on a real book**

Run: `node tools/preintake-probe.js --book lifraen-efnafraedi; echo "exit=$?"`
Expected: a checklist showing `os-embed exercises: 260` as BLOCK, glossary WARN, `Verdict: NO-GO`, `exit=1`.

Run: `node tools/preintake-probe.js --book efnafraedi-2e; echo "exit=$?"`
Expected: os-embed 0, iframe 0, `Verdict: GO` (or GO-WITH-GAPS if note/inline WARNs surface), `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add tools/preintake-probe.js tools/__tests__/preintake-probe.test.js
git commit -m "feat(probe): preintake-probe CLI (probeDir + checklist + --json) (D2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Acceptance test — reproduce the 5 books' known gaps

**Files:**
- Test: `tools/__tests__/preintake-probe-acceptance.test.js`

**Interfaces:**
- Consumes: `probeDir` (Task 4); reads each book's real `01-source` + `book-config.json`.

- [ ] **Step 1: Write the acceptance test**

Create `tools/__tests__/preintake-probe-acceptance.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { probeDir } from '../preintake-probe.js';

function probe(slug) {
  const dir = path.join('books', slug, '01-source');
  const cfgPath = path.join('books', slug, 'book-config.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : null;
  return probeDir(dir, cfg);
}

describe('pre-intake probe reproduces the 5 in-repo books known gaps', () => {
  it('efnafraedi-2e: no os-embed, no iframe, glossary present', () => {
    const r = probe('efnafraedi-2e');
    expect(r.checks.osEmbed.status).toBe('ok');
    expect(r.checks.iframe.status).toBe('ok');
    expect(r.checks.glossary.status).toBe('ok');
    expect(r.verdict).not.toBe('NO-GO');
  });

  it('lifraen-efnafraedi (organic): os-embed BLOCK + glossary WARN → NO-GO', () => {
    const r = probe('lifraen-efnafraedi');
    expect(r.checks.osEmbed.status).toBe('block');
    expect(r.checks.osEmbed.count).toBeGreaterThan(0);
    expect(r.checks.glossary.status).toBe('warn');
    expect(r.verdict).toBe('NO-GO');
  });

  it('edlisfraedi-2e (physics): iframe WARN', () => {
    expect(probe('edlisfraedi-2e').checks.iframe.status).toBe('warn');
  });

  it('liffraedi-2e (biology): iframe WARN, glossary ok', () => {
    const r = probe('liffraedi-2e');
    expect(r.checks.iframe.status).toBe('warn');
    expect(r.checks.glossary.status).toBe('ok');
  });

  it('orverufraedi (microbiology): glossary WARN, no iframe', () => {
    const r = probe('orverufraedi');
    expect(r.checks.glossary.status).toBe('warn');
    expect(r.checks.iframe.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run the acceptance test**

Run: `npx vitest run tools/__tests__/preintake-probe-acceptance.test.js`
Expected: PASS (5 books reproduce their known gaps). If a per-check status is unexpected (e.g. an iframe count of 0 where 1 was expected), investigate the count with `grep -rl` before adjusting — the assertions encode verified facts.

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: PASS (full suite green).

- [ ] **Step 4: Commit**

```bash
git add tools/__tests__/preintake-probe-acceptance.test.js
git commit -m "test(probe): acceptance — reproduce 5 in-repo books' known gaps (D2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:** os-embed/iframe/glossary/note-class/inline checks → Tasks 1–2; go/no-go verdict → Task 3; `--book`/`--source`/`--json` CLI + exit-on-NO-GO → Task 4; acceptance over 5 books → Task 5. Read-only (no writes anywhere). ✅
**Out of scope held:** no auto-fix; no config-presence (validate); no fidelity (A3); no D3/D4/D5 path implementation. ✅
**Placeholder scan:** every code step is complete; commands have expected output; the Task-1 `unrecognizedInline: {}` is an explicit, labelled staged stub filled in Task 2 (not a placeholder). ✅
**Type consistency:** `runFileChecks` return shape (Task 1) is consumed by `probeDir`'s aggregation (Task 4) field-for-field; `agg` shape produced by `probeDir` matches `evaluateBook`'s parameter (Task 3); `checks.{osEmbed,iframe,glossary,noteClass,inline}.status` names are identical across `evaluateBook` (Task 3), the CLI printer (Task 4), and the acceptance assertions (Task 5). `HANDLED_INLINE`/`TEXT_CONTAINERS` defined Task 1, used Task 2. ✅
