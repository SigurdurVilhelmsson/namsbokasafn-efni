# B2 — Producer-Provenance Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route inject's web-UI marker-repair on a recorded per-module producer-provenance sidecar instead of the content-sniff that mis-routes term-free modules.

**Architecture:** Both MT producers (`api-translate`, `docx-import`) stamp a `mNNNNN-provenance.json` next to each `02-mt-output` segment file. Inject resolves a restore *policy* (`mutate` for docx, `warn` for api-translate / human-authored) from that sidecar, fails loud when it is missing for MT-origin content, and runs the three web-UI restores under that policy. A one-time backfill stamps pre-existing content; the orphan `/import-mt` upload route is retired. A re-inject-byte-identical gate proves it is a pure refactor.

**Tech Stack:** Node.js 22 ESM, Vitest, better-sqlite3 (server tests only here for the route removal).

## Global Constraints

- Runtime Node 22.x LTS / npm 10.x; tools are ESM (`import`), `package.json` `"type": "module"`.
- Shared tool libs live in `tools/lib/`; ESM libs are `.js`, CJS dual-consumed libs are `.cjs` (e.g. `seg-markers.cjs`). `provenance.js` is consumed only by ESM tools → plain ESM `.js`.
- All pipeline tools require `--book` (`requireBook`); never default the book.
- Authoritative test gate is **local `npm test`** (CI is red until ~2026-07-01, no branch protection).
- Fail loud; no escape hatch that reaches prod. One real code path.
- Backup convention for ✏️ files is irrelevant here (we only add sidecars + edit tools/server).
- Provenance `tool` vocabulary is exactly `{ "api-translate", "docx-import" }`. Unknown value → throw.

---

### Task 1: Provenance library (`tools/lib/provenance.js`)

**Files:**
- Create: `tools/lib/provenance.js`
- Test: `tools/__tests__/provenance.test.js`

**Interfaces:**
- Consumes: nothing (Node `fs`/`path` only).
- Produces:
  - `writeProvenance(mtOutputChapterDir: string, moduleId: string, { tool: string, generatedAt?: string }) → object`
  - `readProvenance(mtOutputChapterDir: string, moduleId: string) → object | null` (throws on malformed JSON / unknown tool)
  - `restorePolicyFor(tool: string) → 'warn' | 'mutate'` (throws on unknown tool)
  - `resolveRestorePolicy({ mtOutputChapterDir: string, moduleId: string }) → { policy: 'warn'|'mutate', tool: string|null, source: 'sidecar'|'human-authored' }` (throws when MT segments exist but provenance is absent)
  - `provenancePath(mtOutputChapterDir: string, moduleId: string) → string`
  - constants `KNOWN_TOOLS`, `SCHEMA_VERSION`

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/provenance.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  writeProvenance,
  readProvenance,
  restorePolicyFor,
  resolveRestorePolicy,
  SCHEMA_VERSION,
} from '../lib/provenance.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('restorePolicyFor', () => {
  it('maps api-translate to warn', () => {
    expect(restorePolicyFor('api-translate')).toBe('warn');
  });
  it('maps docx-import to mutate', () => {
    expect(restorePolicyFor('docx-import')).toBe('mutate');
  });
  it('throws on an unknown tool', () => {
    expect(() => restorePolicyFor('web-import')).toThrow(/unknown provenance tool/i);
  });
});

describe('write/read round-trip', () => {
  it('writes a sidecar that reads back with the same tool and schema', () => {
    writeProvenance(dir, 'm66372', { tool: 'api-translate', generatedAt: '2026-06-30T00:00:00.000Z' });
    const got = readProvenance(dir, 'm66372');
    expect(got).toEqual({
      schemaVersion: SCHEMA_VERSION,
      tool: 'api-translate',
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
  });
  it('returns null when no sidecar exists', () => {
    expect(readProvenance(dir, 'm00000')).toBeNull();
  });
  it('throws when writing an unknown tool', () => {
    expect(() => writeProvenance(dir, 'm1', { tool: 'nope' })).toThrow(/unknown provenance tool/i);
  });
  it('throws when reading a sidecar with an unknown tool', () => {
    fs.writeFileSync(path.join(dir, 'm1-provenance.json'), JSON.stringify({ schemaVersion: 1, tool: 'nope' }));
    expect(() => readProvenance(dir, 'm1')).toThrow(/unknown provenance tool/i);
  });
});

describe('resolveRestorePolicy', () => {
  it('returns the sidecar policy when provenance is present', () => {
    writeProvenance(dir, 'm66372', { tool: 'docx-import' });
    expect(resolveRestorePolicy({ mtOutputChapterDir: dir, moduleId: 'm66372' })).toEqual({
      policy: 'mutate',
      tool: 'docx-import',
      source: 'sidecar',
    });
  });
  it('throws when MT segments exist but provenance is missing', () => {
    fs.writeFileSync(path.join(dir, 'm66372-segments.is.md'), '<!-- SEG:m66372:para:x -->\nhi\n');
    expect(() => resolveRestorePolicy({ mtOutputChapterDir: dir, moduleId: 'm66372' })).toThrow(
      /no provenance for m66372/i
    );
  });
  it('returns warn/human-authored when there is no MT origin at all', () => {
    expect(resolveRestorePolicy({ mtOutputChapterDir: dir, moduleId: 'm99999' })).toEqual({
      policy: 'warn',
      tool: null,
      source: 'human-authored',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/provenance.test.js`
Expected: FAIL — `Cannot find module '../lib/provenance.js'`.

- [ ] **Step 3: Implement `tools/lib/provenance.js`**

```js
import fs from 'fs';
import path from 'path';

export const SCHEMA_VERSION = 1;

// The only producers of 02-mt-output. tool -> restore policy.
//   'mutate'  -> run the web-UI restores and rewrite segments (external/docx MT can drop markers)
//   'warn'    -> compare-and-warn only; never mutate (api-translate preserves markers)
export const KNOWN_TOOLS = Object.freeze({
  'api-translate': 'warn',
  'docx-import': 'mutate',
});

export function restorePolicyFor(tool) {
  if (!Object.prototype.hasOwnProperty.call(KNOWN_TOOLS, tool)) {
    throw new Error(
      `Unknown provenance tool: ${JSON.stringify(tool)} ` +
        `(expected one of: ${Object.keys(KNOWN_TOOLS).join(', ')})`
    );
  }
  return KNOWN_TOOLS[tool];
}

export function provenancePath(mtOutputChapterDir, moduleId) {
  return path.join(mtOutputChapterDir, `${moduleId}-provenance.json`);
}

export function writeProvenance(mtOutputChapterDir, moduleId, { tool, generatedAt } = {}) {
  restorePolicyFor(tool); // validate before writing
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    tool,
    generatedAt: generatedAt || new Date().toISOString(),
  };
  fs.writeFileSync(
    provenancePath(mtOutputChapterDir, moduleId),
    JSON.stringify(payload, null, 2) + '\n',
    'utf8'
  );
  return payload;
}

export function readProvenance(mtOutputChapterDir, moduleId) {
  const p = provenancePath(mtOutputChapterDir, moduleId);
  if (!fs.existsSync(p)) return null;
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')); // throws on malformed JSON
  restorePolicyFor(parsed.tool); // throws on unknown tool
  return parsed;
}

/**
 * Resolve the restore policy for a module from its MT origin (02-mt-output),
 * independent of which track inject is producing.
 * - sidecar present        -> its tool's policy
 * - sidecar absent + MT seg -> throw (real gap; needs backfill — never guess)
 * - no MT seg at all        -> 'warn' (content was authored directly, not via MT)
 */
export function resolveRestorePolicy({ mtOutputChapterDir, moduleId }) {
  const prov = readProvenance(mtOutputChapterDir, moduleId);
  if (prov) {
    return { policy: restorePolicyFor(prov.tool), tool: prov.tool, source: 'sidecar' };
  }
  const segPath = path.join(mtOutputChapterDir, `${moduleId}-segments.is.md`);
  if (fs.existsSync(segPath)) {
    throw new Error(
      `No provenance for ${moduleId} in ${mtOutputChapterDir}. ` +
        `Run: node tools/backfill-provenance.js --book <book> (refusing to guess producer).`
    );
  }
  return { policy: 'warn', tool: null, source: 'human-authored' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/provenance.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/provenance.js tools/__tests__/provenance.test.js
git commit -m "feat(B2): provenance lib — per-module sidecar read/write + restore-policy resolution"
```

---

### Task 2: `api-translate.js` stamps `api-translate` provenance

**Files:**
- Modify: `tools/api-translate.js` (import near `:40`; stamp inside `translateFile` right after the `:577` write)
- Test: `tools/__tests__/api-translate-provenance.test.js`

**Interfaces:**
- Consumes: `writeProvenance` from Task 1.
- Produces: each `02-mt-output/chNN/mNNNNN-segments.is.md` written by `translateFile` gains a sibling `mNNNNN-provenance.json` with `tool: "api-translate"`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/api-translate-provenance.test.js`. The network path can't be unit-tested, so we test the moduleId-derivation seam that the production stamp line depends on, plus a round-trip that mirrors the exact production call (`writeProvenance(outputDir, moduleIdFromOutputPath(outputPath), { tool: 'api-translate' })`) so a regression in either half fails here. The byte-identical gate (Task 8) covers the integrated path.

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeProvenance, readProvenance } from '../lib/provenance.js';
import { moduleIdFromOutputPath } from '../api-translate.js';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiprov-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('moduleIdFromOutputPath', () => {
  it('derives the module id from an mt-output filename', () => {
    expect(moduleIdFromOutputPath('/x/02-mt-output/ch05/m66372-segments.is.md')).toBe('m66372');
  });
});

describe('the production stamp call mirrored', () => {
  it('writes tool=api-translate that reads back', () => {
    const outputPath = path.join(dir, 'm66372-segments.is.md');
    fs.writeFileSync(outputPath, '<!-- SEG:m66372:para:x --> halló\n');
    writeProvenance(dir, moduleIdFromOutputPath(outputPath), { tool: 'api-translate' });
    expect(readProvenance(dir, 'm66372').tool).toBe('api-translate');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/api-translate-provenance.test.js`
Expected: FAIL — `moduleIdFromOutputPath` is not exported.

- [ ] **Step 3: Implement the export + the stamp**

In `tools/api-translate.js`, add the import alongside the existing lib imports (near `:40`):

```js
import { writeProvenance } from './lib/provenance.js';
```

Add an exported helper (near the other small helpers, above `translateFile`):

```js
/** Derive a module id (mNNNNN) from an mt-output output path. */
export function moduleIdFromOutputPath(outputPath) {
  return path.basename(outputPath).replace('-segments.is.md', '');
}
```

In `translateFile`, immediately after the existing write at `:577` (`fs.writeFileSync(outputPath, output, 'utf8');`) and before the `-links.json` copy, add:

```js
  // B2: stamp producer provenance next to the segment file.
  writeProvenance(outputDir, moduleIdFromOutputPath(outputPath), { tool: 'api-translate' });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/api-translate-provenance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-provenance.test.js
git commit -m "feat(B2): api-translate stamps api-translate provenance per module"
```

---

### Task 3: `docx-import.js` stamps `docx-import` provenance

**Files:**
- Modify: `tools/docx-import.js` (import near `:27`; stamp inside `writeSegmentFiles` after each per-module write, guarded by `!dryRun`)
- Test: `tools/__tests__/docx-import-provenance.test.js`

**Interfaces:**
- Consumes: `writeProvenance` from Task 1.
- Produces: each module file `writeSegmentFiles` emits gains a sibling `mNNNNN-provenance.json` with `tool: "docx-import"` (skipped under `--dry-run`).

- [ ] **Step 1: Read the current write loop**

Read `tools/docx-import.js:803-827` to confirm the per-module loop writes `filePath = path.join(outputDir, `${moduleId}-segments.is.md`)` under `if (!dryRun)`.

- [ ] **Step 2: Write the failing test**

Create `tools/__tests__/docx-import-provenance.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readProvenance } from '../lib/provenance.js';
import { writeSegmentFiles } from '../docx-import.js';

let booksDir;
beforeEach(() => { booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docxprov-')); });
afterEach(() => { fs.rmSync(booksDir, { recursive: true, force: true }); });

describe('writeSegmentFiles provenance', () => {
  const alignments = [{ segmentId: 'm12345:para:a', docxText: 'halló heimur' }];
  const moduleMetadata = new Map([['m12345', { title: 'X' }]]);

  it('stamps docx-import next to each written module (book=__t__, chapter=3)', () => {
    fs.mkdirSync(path.join(booksDir, '__t__'), { recursive: true });
    writeSegmentFiles(alignments, path.join(booksDir, '__t__'), 3, moduleMetadata, false);
    const chDir = path.join(booksDir, '__t__', '02-mt-output', 'ch03');
    expect(fs.existsSync(path.join(chDir, 'm12345-segments.is.md'))).toBe(true);
    expect(readProvenance(chDir, 'm12345').tool).toBe('docx-import');
  });

  it('does not stamp under dry-run', () => {
    fs.mkdirSync(path.join(booksDir, '__t__'), { recursive: true });
    writeSegmentFiles(alignments, path.join(booksDir, '__t__'), 3, moduleMetadata, true);
    const chDir = path.join(booksDir, '__t__', '02-mt-output', 'ch03');
    expect(readProvenance(chDir, 'm12345')).toBeNull();
  });
});
```

> If `writeSegmentFiles` is not currently exported, add `export` to its declaration at `:785`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/docx-import-provenance.test.js`
Expected: FAIL — `writeSegmentFiles` not exported / no provenance stamped.

- [ ] **Step 4: Implement the import, export, and stamp**

In `tools/docx-import.js`, add near the existing imports (`:27`):

```js
import { writeProvenance } from './lib/provenance.js';
```

Export the function: change `function writeSegmentFiles(` at `:785` to `export function writeSegmentFiles(`.

Inside the per-module loop, after the `if (dryRun) { ... } else { fs.writeFileSync(filePath, content, 'utf-8'); ... }` block, within the `else` (non-dry-run) branch, add:

```js
      // B2: stamp producer provenance next to the segment file.
      writeProvenance(outputDir, moduleId, { tool: 'docx-import' });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/docx-import-provenance.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/docx-import.js tools/__tests__/docx-import-provenance.test.js
git commit -m "feat(B2): docx-import stamps docx-import provenance per module"
```

---

### Task 4: Backfill tool (`tools/backfill-provenance.js`)

**Files:**
- Create: `tools/backfill-provenance.js`
- Test: `tools/__tests__/backfill-provenance.test.js`

**Interfaces:**
- Consumes: `writeProvenance`, `readProvenance` from Task 1.
- Produces: `backfillBook(bookDir) → { stamped: number, skipped: number }` — for each `02-mt-output/ch*` dir: `import-report.json` present ⇒ stamp every module `docx-import`; else `api-translate`. Idempotent (skips modules that already have a sidecar). A CLI `main()` requires `--book`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/backfill-provenance.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readProvenance } from '../lib/provenance.js';
import { backfillBook } from '../backfill-provenance.js';

let bookDir;
function seg(dir, mod) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${mod}-segments.is.md`), `<!-- SEG:${mod}:para:a --> x\n`);
}
beforeEach(() => { bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-')); });
afterEach(() => { fs.rmSync(bookDir, { recursive: true, force: true }); });

describe('backfillBook', () => {
  it('stamps api-translate for a chapter with no import-report', () => {
    seg(path.join(bookDir, '02-mt-output', 'ch05'), 'm66372');
    const r = backfillBook(bookDir);
    expect(r.stamped).toBe(1);
    expect(readProvenance(path.join(bookDir, '02-mt-output', 'ch05'), 'm66372').tool).toBe('api-translate');
  });

  it('stamps docx-import for a chapter that has import-report.json', () => {
    const ch = path.join(bookDir, '02-mt-output', 'ch03');
    seg(ch, 'm66437');
    fs.writeFileSync(path.join(ch, 'import-report.json'), '{}');
    backfillBook(bookDir);
    expect(readProvenance(ch, 'm66437').tool).toBe('docx-import');
  });

  it('is idempotent — a second run stamps nothing new', () => {
    seg(path.join(bookDir, '02-mt-output', 'ch05'), 'm66372');
    backfillBook(bookDir);
    const r2 = backfillBook(bookDir);
    expect(r2.stamped).toBe(0);
    expect(r2.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/backfill-provenance.test.js`
Expected: FAIL — `Cannot find module '../backfill-provenance.js'`.

- [ ] **Step 3: Implement `tools/backfill-provenance.js`**

```js
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, requireBook } from './lib/parseArgs.js';
import { writeProvenance, readProvenance } from './lib/provenance.js';

/**
 * Stamp producer provenance onto pre-existing 02-mt-output content.
 * Rule: a chapter dir with import-report.json was docx-imported; otherwise api-translate.
 * Idempotent: modules that already have a provenance sidecar are skipped.
 * @param {string} bookDir e.g. books/efnafraedi-2e
 * @returns {{ stamped: number, skipped: number }}
 */
export function backfillBook(bookDir) {
  const mtRoot = path.join(bookDir, '02-mt-output');
  let stamped = 0;
  let skipped = 0;
  if (!fs.existsSync(mtRoot)) return { stamped, skipped };

  for (const entry of fs.readdirSync(mtRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const chDir = path.join(mtRoot, entry.name);
    const tool = fs.existsSync(path.join(chDir, 'import-report.json')) ? 'docx-import' : 'api-translate';

    for (const f of fs.readdirSync(chDir)) {
      const m = f.match(/^(m\d{5})-segments\.is\.md$/);
      if (!m) continue;
      const moduleId = m[1];
      if (readProvenance(chDir, moduleId)) {
        skipped++;
        continue;
      }
      writeProvenance(chDir, moduleId, { tool });
      stamped++;
    }
  }
  return { stamped, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    { name: 'book', flags: ['--book'], type: 'string', default: null },
  ]);
  requireBook(args);
  const bookDir = path.join('books', args.book);
  const { stamped, skipped } = backfillBook(bookDir);
  console.log(`Backfill ${args.book}: stamped ${stamped}, skipped ${skipped} (already stamped).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

> Implementer: confirm the exact `parseArgs`/`requireBook` import names and signature against another tool (e.g. `tools/api-translate.js:33-40`) and match them. The flag spec shape above mirrors `api-translate.js` (`{ name, flags, type, default }`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/backfill-provenance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/backfill-provenance.js tools/__tests__/backfill-provenance.test.js
git commit -m "feat(B2): backfill-provenance tool — stamp existing 02-mt-output (docx via import-report, else api-translate)"
```

---

### Task 5: Run the backfill on all real books and commit the sidecars

This is a data-migration task: it must land **before** Task 6 (the inject change) so inject does not fail-loud on existing content.

**Files:**
- Create (generated): `books/*/02-mt-output/**/mNNNNN-provenance.json`

- [ ] **Step 1: Backfill every book with mt-output**

```bash
for b in efnafraedi-2e liffraedi-2e edlisfraedi-2e lifraen-efnafraedi orverufraedi __e2e-fixture__; do
  node tools/backfill-provenance.js --book "$b"
done
```
Expected: each prints `stamped N, skipped 0`.

- [ ] **Step 2: Sanity-check the docx vs api split**

Run:
```bash
echo "docx (should be liffraedi ch03 only):"; grep -rl '"docx-import"' books/*/02-mt-output | sed 's#/[^/]*$##' | sort -u
echo "total stamped:"; find books/*/02-mt-output -name '*-provenance.json' | wc -l
```
Expected: docx-import sidecars only under `books/liffraedi-2e/02-mt-output/ch03`; every `*-segments.is.md` has a sibling sidecar.

- [ ] **Step 3: Re-run backfill to confirm idempotency**

```bash
node tools/backfill-provenance.js --book efnafraedi-2e
```
Expected: `stamped 0, skipped <N>`.

- [ ] **Step 4: Commit the sidecars**

```bash
git add books/*/02-mt-output/**/*-provenance.json
git commit -m "chore(B2): backfill producer provenance for existing 02-mt-output content"
```

---

### Task 6: Inject resolves provenance and runs restores under policy

**Files:**
- Modify: `tools/cnxml-inject.js` (import near `:48`; `loadModuleInputs` `:3174` returns `restorePolicy`; replace sniff `:3328-3374` with policy block)
- Test: `tools/__tests__/inject-provenance-routing.test.js`

**Interfaces:**
- Consumes: `resolveRestorePolicy` from Task 1; the existing `restoreSupersubMarkers` / `restoreMediaMarkers` / `restoreNewlines` (unchanged signatures, mutate-in-place, return counts).
- Produces: routing behavior — `mutate` policy mutates segments (today's `!isApiTranslated` path); `warn` policy never mutates (runs on a throwaway clone, logs would-have counts).

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/inject-provenance-routing.test.js`. This tests the policy block in isolation by exercising the restore functions exactly as the call site will, asserting mutation vs no-mutation.

```js
import { describe, it, expect } from 'vitest';
import { restoreSupersubMarkers } from '../cnxml-inject.js';

// A segment whose IS has an excess legacy ^...^ sup vs EN — the mutate path would strip it.
function fixtures() {
  const en = new Map([['m1:para:a', 'water H2O']]);
  const is = new Map([['m1:para:a', 'vatn H^2^O^extra^']]);
  return { en, is };
}

describe('restore under mutate vs warn (B2 routing contract)', () => {
  it('mutate policy: running on the real map changes it', () => {
    const { en, is } = fixtures();
    const before = is.get('m1:para:a');
    restoreSupersubMarkers(is, en); // mutate path runs on real segments
    expect(is.get('m1:para:a')).not.toBe(before); // excess sup stripped
  });

  it('warn policy: running on a clone leaves the real map untouched', () => {
    const { en, is } = fixtures();
    const before = is.get('m1:para:a');
    const clone = new Map(is);
    const { supStripped } = restoreSupersubMarkers(clone, en); // warn path uses a clone
    expect(supStripped).toBeGreaterThan(0); // detector still reports
    expect(is.get('m1:para:a')).toBe(before); // real segments unchanged
  });
});
```

> Implementer: if `restoreSupersubMarkers` is not exported, add `export` to its declaration at `:300`. (The other two restores need not be exported for this test.) Adjust the fixture if the sup/sub strip heuristic needs a different shape to trigger — run the mutate test first and tune the fixture until it mutates.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/inject-provenance-routing.test.js`
Expected: FAIL — `restoreSupersubMarkers` not exported.

- [ ] **Step 3: Wire the resolver into `loadModuleInputs`**

In `tools/cnxml-inject.js`, add the import near `:48`:

```js
import { resolveRestorePolicy } from './lib/provenance.js';
```

In `loadModuleInputs` (`:3174`), after `const chapterDir = formatChapter(chapter);`, add:

```js
  const mtOutputChapterDir = path.join(BOOKS_DIR, '02-mt-output', chapterDir);
  const restorePolicy = resolveRestorePolicy({ mtOutputChapterDir, moduleId });
```

Add `restorePolicy` to the returned object:

```js
  return { structure, segments, equations, originalCnxml, enSegments, inlineAttrs, restorePolicy };
```

Export `restoreSupersubMarkers` (declaration at `:300`): `export function restoreSupersubMarkers(`.

- [ ] **Step 4: Replace the sniff + gate with the policy block**

At the call site, change the destructuring (`:3325`) to include `restorePolicy`:

```js
      const { structure, segments, equations, originalCnxml, enSegments, inlineAttrs, restorePolicy } =
        loadModuleInputs(args.chapter, moduleId, args.lang, sourceDir, args.allowEnFallback);
```

Delete the `isApiTranslated` block (`:3328-3336`) and the `if (!isApiTranslated) { ... }` block (`:3352-3374`). Keep `restoreTermMarkers` (`:3338-3347`) exactly as-is. In place of the deleted `if (!isApiTranslated)` block, insert:

```js
      // B2: web-UI marker restoration is gated on recorded producer provenance,
      // not a content sniff. 'mutate' (docx) rewrites segments as before; 'warn'
      // (api-translate / human-authored) detects-and-reports without mutating —
      // which doubles as a mis-stamped-backfill detector.
      if (restorePolicy.policy === 'mutate') {
        const { supStripped, subStripped } = restoreSupersubMarkers(segments, enSegments);
        if (supStripped > 0 || subStripped > 0) {
          console.error(`  Note: stripped ${supStripped} excess sup + ${subStripped} excess sub marker(s)`);
        }
        const { restoredCount: mediaRestoredCount } = restoreMediaMarkers(segments, enSegments);
        if (mediaRestoredCount > 0) {
          console.error(`  Restored ${mediaRestoredCount} [[MEDIA:N]] placeholder(s) from EN source`);
        }
        const { restoredCount: brRestoredCount } = restoreNewlines(segments, enSegments);
        if (args.verbose && brRestoredCount > 0) {
          console.error(`  Restored ${brRestoredCount} newline placeholder(s) from EN source`);
        }
      } else {
        // warn-only: run on a throwaway clone so the real segments are never mutated.
        const probe = new Map(segments);
        const { supStripped, subStripped } = restoreSupersubMarkers(probe, enSegments);
        const { restoredCount: wouldMedia } = restoreMediaMarkers(probe, enSegments);
        const { restoredCount: wouldBr } = restoreNewlines(probe, enSegments);
        if (supStripped || subStripped || wouldMedia || wouldBr) {
          console.error(
            `  Note [warn-only, provenance=${restorePolicy.tool || 'human-authored'}]: ` +
              `would have stripped ${supStripped} sup/${subStripped} sub and restored ` +
              `${wouldMedia} media/${wouldBr} BR marker(s) — not mutating`
          );
        }
      }
```

- [ ] **Step 5: Run the routing test + the full tools suite**

Run: `npx vitest run tools/__tests__/inject-provenance-routing.test.js`
Expected: PASS.
Run: `npx vitest run tools/`
Expected: PASS (no regressions in the existing inject suites).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/inject-provenance-routing.test.js
git commit -m "feat(B2): inject routes restores on producer provenance; fail-loud on missing; warn-only for api-translate"
```

---

### Task 7: Retire the orphan `/import-mt` route

**Files:**
- Modify: `server/routes/books.js` (delete the `POST /:bookId/chapters/:chapter/import-mt` handler, `:611-704` and its block end)
- Modify/Delete: any spec asserting `/import-mt` (search below)

**Interfaces:**
- Consumes: nothing.
- Produces: the route no longer mounts (a request returns 404).

- [ ] **Step 1: Find references to the route**

```bash
grep -rn "import-mt" server/ | grep -v node_modules
```
Note every hit (route definition + any E2E/unit spec). If `upload` (the multer instance) becomes unused after deletion, note it for Step 3.

- [ ] **Step 2: Write/adjust the failing test**

If an existing spec asserts `/import-mt` behavior, update it to assert the route is gone. Otherwise add to the books-route spec (path per the grep, e.g. `server/__tests__/routes-books.test.js` or the E2E books spec) a test:

```js
it('POST /api/books/:bookId/chapters/:chapter/import-mt is retired (404)', async () => {
  const res = await request(app).post('/api/books/efnafraedi-2e/chapters/5/import-mt');
  expect(res.status).toBe(404);
});
```

> Implementer: match the existing test harness in that file (supertest `app` import, auth helper). If the books routes have no unit spec, add this assertion to the nearest E2E books spec instead, using its `loginAs` helper.

- [ ] **Step 3: Delete the route**

Remove the entire `router.post('/:bookId/chapters/:chapter/import-mt', ... )` handler (its JSDoc `:611-617` through the closing `);` after `:704`). If `grep` shows the multer `upload` import/instance is now unused, remove it too; otherwise leave it.

- [ ] **Step 4: Run the test + server suite**

Run: `npx vitest run server/` (or the specific books spec path)
Expected: PASS — the 404 assertion passes, no other server test references the route.

- [ ] **Step 5: Commit**

```bash
git add server/routes/books.js server/**/*books*.* 2>/dev/null; git add -A server/
git commit -m "refactor(B2): retire orphan /import-mt upload route (un-stamped MT producer, Matecat-era)"
```

---

### Task 8: Byte-identical re-inject acceptance gate

This is the headline guarantee that B2 is a pure refactor: after backfill, re-injecting every committed `(book, track, chapter)` combo must reproduce the committed CNXML byte-for-byte.

**Files:**
- Create: `scripts/verify-b2-idempotent.sh`

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-b2-idempotent.sh`:

```bash
#!/usr/bin/env bash
# B2 acceptance: re-inject every committed (book, track, chapter) and assert
# the produced CNXML is byte-identical to what is committed. Reverts after.
set -uo pipefail
fail=0
shopt -s nullglob
for trackdir in books/*/03-translated/*/; do
  book=$(echo "$trackdir" | cut -d/ -f2)
  track=$(basename "$trackdir")
  case "$track" in
    mt-preview) src=02-mt-output ;;
    faithful)   src=03-faithful-translation ;;
    localized)  src=04-localized-content ;;
    *) echo "unknown track: $track"; exit 2 ;;
  esac
  for chdir in "$trackdir"ch*/ "$trackdir"appendices/; do
    [ -d "$chdir" ] || continue
    base=$(basename "$chdir")
    if [ "$base" = "appendices" ]; then ch="appendices"; else ch=$((10#${base#ch})); fi
    node tools/cnxml-inject.js --book "$book" --chapter "$ch" --source-dir "$src" --track "$track" \
      >/dev/null 2>&1 || { echo "inject FAILED: $book ch=$ch track=$track"; fail=1; }
  done
done

if git diff --quiet -- 'books/*/03-translated/**/*.cnxml'; then
  echo "BYTE-IDENTICAL ✓ — B2 is a pure refactor"
else
  echo "DIFF DETECTED ✗"
  git diff --stat -- 'books/*/03-translated/**/*.cnxml'
  fail=1
fi

# revert any tool side-effects (CNXML, error/residue manifests)
git checkout -- 'books/*/03-translated' 'books/*/translation-errors.json' 2>/dev/null || true
git clean -f -q -- 'books/*/residue-report.*.json' 2>/dev/null || true
exit $fail
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x scripts/verify-b2-idempotent.sh
./scripts/verify-b2-idempotent.sh
```
Expected: `BYTE-IDENTICAL ✓ — B2 is a pure refactor`, exit 0. (If a diff appears, the policy block changed file output somewhere — investigate before proceeding; the probe predicts zero diff.)

- [ ] **Step 3: Full local gate**

```bash
npm test
```
Expected: PASS (Vitest suite green, including the four new test files).

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-b2-idempotent.sh
git commit -m "test(B2): byte-identical re-inject acceptance gate across all books"
```

---

### Task 9: Update the plan register + memory + open the PR

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (mark B2 done; log `/import-mt` retirement + the deferred math-upstream-move)

- [ ] **Step 1: Update the out-of-scope register / B2 status**

In the pipeline-architecture plan, mark the re-scoped `isApiTranslated` item **DONE** (this PR), and add two register lines: (a) `/import-mt` retired as a found un-stamped producer; (b) `restoreMathMarkers` upstream-move to `api-translate.js` still deferred (its own item).

- [ ] **Step 2: Commit + push + open PR**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(B2): mark provenance-routing done; log /import-mt retirement + math-move follow-up"
git push -u origin feat/b2-provenance-routing
gh pr create --title "B2: producer-provenance routing for inject" --body "<summary + link to design/probe docs; note byte-identical gate>"
```

- [ ] **Step 3: Update project memory**

Update `[[b2-isapitranslated-routing]]` and the MEMORY.md pickup line to "B2 DONE & MERGED" once the PR merges.

---

## Self-Review

**Spec coverage:**
- §2 sidecar + lib → Task 1. ✓
- §3 producers stamp → Tasks 2, 3. ✓
- §4 consumer resolution + policy-aware restores (3 rows incl. human-authored + fail-loud) → Task 1 (`resolveRestorePolicy`) + Task 6. ✓
- §5 backfill tool + run → Tasks 4, 5. ✓
- §6 retire `/import-mt` → Task 7. ✓
- §7 tests (unit, producers, routing, backfill, fail-loud, byte-identical, route retirement) → Tasks 1-8. ✓
- §8 out-of-scope logged → Task 9. ✓
- §9 files touched → all covered.

**Placeholder scan:** No TBD/TODO. The one network-path caveat (api-translate is tested at the stamping seam, not via a live API call) is explicit and justified, with real test code. The PR body in Task 9 is intentionally a fill-at-time summary (operational), not code.

**Type consistency:** `resolveRestorePolicy` returns `{ policy, tool, source }` in Task 1 and is consumed with `.policy` / `.tool` in Task 6. ✓ `writeProvenance(dir, moduleId, { tool })` consistent across Tasks 1-5. ✓ Restore functions keep their existing `(isSegments, enSegments) → { ..., counts }` signatures (mutate-in-place); Task 6 relies only on those. ✓ `backfillBook(bookDir) → { stamped, skipped }` consistent Task 4↔5.

**Ordering risk:** Task 5 (backfill real content) MUST precede Task 6 (fail-loud inject) — called out in Task 5's intro. ✓
