# Item 8 — PR 1: Boundary guards (B3 + #15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two producer/freeze-boundary guards — an inline bracket-marker count report in `api-translate` (B3), and a content-aware duplicate-seg-id classifier in the pre-freeze gate (#15) — so silent marker loss and content-dropping duplicate seg-ids are caught at their source.

**Architecture:** B3 adds two pure helpers to `api-translate.js` (`countBracketMarkers`, `bracketMarkerDelta`) plus a per-module delta computed in `translateModule` and reported by the caller. #15 upgrades `checkDuplicateSegIds` (in `tools/lib/extraction-coverage.js`) to classify each duplicate seg-id `benign` (identical normalized visible text) vs `real` (different words), reusing `normalizeVisibleText`; the gate (`verify-extraction-coverage.js`) fails only on `real` dups + `sourceDup`, and reports `benign` dups informationally.

**Tech Stack:** Node 22.x LTS, ESM (`tools/*.js`) + one CJS lib (`seg-markers.cjs`), Vitest. Design spec: `docs/superpowers/specs/2026-07-16-item8-boundary-checks-design.md`.

## Global Constraints

- Node 22.x LTS / npm 10.x; ESM modules (`import`/`export`) for `tools/*.js`.
- `npm test` from the **repo root** is the authoritative gate (no branch protection).
- Read-only w.r.t. content: **no** re-extraction, re-MT, re-render, or `books/` file writes in this PR.
- #15 measures **content** (normalized visible text), not raw seg-id repetition. Benign dup =
  all occurrences share normalized visible text (byte-identical, or differing only in opaque
  `[[MATH:N]]`/`[[MEDIA:N]]` indices). Real dup = different words.
- `normalizeVisibleText` is imported from `tools/verify-reextract-equivalence.js` (the same
  normalizer the 6b coverage check reuses) — do not fork it.
- Frozen chemistry has 285 benign dups / 83 modules today; the gate over `efnafraedi-2e` must
  exit **0** after #15 (proof it stopped false-failing), where it exits 1 today.

---

## File Structure

- `tools/api-translate.js` — MODIFY: add `countBracketMarkers`, `bracketMarkerDelta`,
  `formatBracketDelta`; compute per-module delta in `translateModule`; accumulate + report in the
  main run loop.
- `tools/__tests__/api-translate-bracket-count.test.js` — CREATE: B3 unit tests.
- `tools/lib/extraction-coverage.js` — MODIFY: `checkDuplicateSegIds` gains benign/real
  classification; `analyzeModule`'s `hasFindings` counts only `real` dups + `sourceDup`.
- `tools/verify-extraction-coverage.js` — MODIFY: split dup reporting into flagged (`real`/
  `sourceDup`) vs informational (`benign`); summary line for benign count.
- `tools/__tests__/dup-segid-gate.test.js` — CREATE: #15 unit + integration tests.
- `tools/lib/seg-markers.cjs` — MODIFY: header comment documenting the canonical policy.

---

## Task 1: B3 — bracket-marker count helpers (pure)

**Files:**
- Modify: `tools/api-translate.js` (add helpers near `countInlineMarkers`, ~line 283)
- Test: `tools/__tests__/api-translate-bracket-count.test.js`

**Interfaces:**
- Produces: `countBracketMarkers(text) → Record<type, number>` for the 11 inline bracket types;
  `bracketMarkerDelta(input, output) → Record<type, number>` (only types where counts differ,
  value = output − input); `formatBracketDelta(label, delta) → string | null`.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/api-translate-bracket-count.test.js
import { describe, it, expect } from 'vitest';
import {
  countBracketMarkers,
  bracketMarkerDelta,
  formatBracketDelta,
} from '../api-translate.js';

describe('countBracketMarkers', () => {
  it('tallies each inline bracket type, including nested and payload-bearing', () => {
    const t = 'A [[i:x]] and [[sub:2]] and [[link:t|http://e]] and [[term:mól|term-1]] and [[i:[[sub:g]]]]';
    const c = countBracketMarkers(t);
    expect(c.i).toBe(2); // [[i:x]] and the outer [[i:[[sub:g]]]]
    expect(c.sub).toBe(2); // [[sub:2]] and the nested [[sub:g]]
    expect(c.link).toBe(1);
    expect(c.term).toBe(1);
    expect(c.b).toBe(0);
  });
});

describe('bracketMarkerDelta', () => {
  it('reports only types whose output count differs from input', () => {
    const input = 'x [[i:a]] [[i:b]] [[link:t|u]]';
    const output = 'x [[i:a]]'; // dropped one [[i:]] and the [[link:]]
    expect(bracketMarkerDelta(input, output)).toEqual({ i: -1, link: -1 });
  });

  it('is empty for a clean round-trip', () => {
    const s = 'x [[i:a]] [[sub:2]]';
    expect(bracketMarkerDelta(s, s)).toEqual({});
  });
});

describe('formatBracketDelta', () => {
  it('renders a one-line note for a non-empty delta', () => {
    expect(formatBracketDelta('m66438', { link: -1, i: -2 })).toBe(
      'm66438: bracket-marker delta (output vs input) — link -1, i -2'
    );
  });
  it('returns null for an empty delta', () => {
    expect(formatBracketDelta('m1', {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/api-translate-bracket-count.test.js`
Expected: FAIL — `countBracketMarkers is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

Add to `tools/api-translate.js` just after `countInlineMarkers` (~line 286):

```js
/** The inline bracket marker types that ride through the MT API as `[[<type>:…]]`. */
export const BRACKET_MARKER_TYPES = [
  'i', 'b', 'sub', 'sup', 'u', 'em', 'link', 'xref', 'docref', 'term', 'fn',
];

/**
 * Tally each inline bracket marker by its opening token `[[<type>:`. Counting the
 * type-prefixed opener is robust to nesting (`[[i:[[sub:x]]]]`) and to the
 * `|id`/`|class`/`|url` payloads, and never double-counts a closing delimiter.
 * @param {string} text
 * @returns {Record<string, number>}
 */
export function countBracketMarkers(text) {
  const counts = {};
  const s = String(text || '');
  for (const type of BRACKET_MARKER_TYPES) {
    counts[type] = (s.match(new RegExp(`\\[\\[${type}:`, 'g')) || []).length;
  }
  return counts;
}

/**
 * Per-type delta of inline bracket markers, output minus input. Only types whose
 * count changed are present. A negative value is a dropped marker (the ~2.3%-loss
 * class the paired term/fn round-trip does not cover for i/b/sub/sup/u/em/link/xref/
 * docref); a positive value is a spurious API duplication.
 * @returns {Record<string, number>}
 */
export function bracketMarkerDelta(input, output) {
  const a = countBracketMarkers(input);
  const b = countBracketMarkers(output);
  const delta = {};
  for (const type of BRACKET_MARKER_TYPES) {
    if (a[type] !== b[type]) delta[type] = b[type] - a[type];
  }
  return delta;
}

/** One-line human note for a non-empty bracket delta, or null when clean. */
export function formatBracketDelta(label, delta) {
  const parts = Object.entries(delta).map(([t, n]) => `${t} ${n > 0 ? '+' : ''}${n}`);
  if (parts.length === 0) return null;
  return `${label}: bracket-marker delta (output vs input) — ${parts.join(', ')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/api-translate-bracket-count.test.js`
Expected: PASS (3 describe blocks, 5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-bracket-count.test.js
git commit -m "feat(item8/B3): countBracketMarkers + bracketMarkerDelta helpers"
```

---

## Task 2: B3 — wire per-module delta into translateModule + run summary

**Files:**
- Modify: `tools/api-translate.js` — `translateModule` return (~line 902); `results` init
  (~line 1094); caller destructure (~line 1131); run summary (~line 1170).

**Interfaces:**
- Consumes: `bracketMarkerDelta`, `formatBracketDelta` (Task 1).
- Produces: `translateModule` return object gains `bracketDelta: Record<type, number>`; the run
  `results` object gains `bracketLoss: Record<type, number>` (accumulated across modules).

**Note on testing:** `translateModule` calls the live Málstaður API, so it is not unit-tested
here; Task 1's pure helpers carry the logic and the wiring is verified by the full suite staying
green. This task is glue — keep it minimal.

- [ ] **Step 1: Compute + log the per-module delta in `translateModule`**

In `tools/api-translate.js`, in `translateModule`, immediately before the `return { chars, ... }`
statement (~line 902), add:

```js
  // B3: surface any inline bracket-marker loss/add at the producer, per module.
  const bracketDelta = bracketMarkerDelta(input, output);
  const bracketNote = formatBracketDelta(moduleId, bracketDelta);
  if (bracketNote) console.error(`  Note: ${bracketNote}`);
```

Then change the return to include it:

```js
  return { chars: input.length, usage: totalUsage, markersNormalized, mismatches, bracketDelta };
```

- [ ] **Step 2: Accumulate in the run `results` object**

In the `results` initializer (~line 1094), add a field:

```js
  const results = {
    translated: 0,
    skipped: toSkip.length,
    lockedSkipped: 0,
    failed: 0,
    markersNormalized: 0,
    mismatches: 0,
    bracketLoss: {}, // B3: per-type accumulated output−input delta across modules
    errors: [],
  };
```

In the caller loop, change the destructure (~line 1131) and add accumulation right after
`results.markersNormalized += markersNormalized;` (~line 1141):

```js
      const { chars, markersNormalized, mismatches, bracketDelta } = await translateModule(
        client,
        mod.path,
        mod.outputPath,
        glossary,
        args.verbose,
        args.maxChunk
      );
```

```js
      results.markersNormalized += markersNormalized;
      for (const [t, n] of Object.entries(bracketDelta || {})) {
        results.bracketLoss[t] = (results.bracketLoss[t] || 0) + n;
      }
```

- [ ] **Step 3: Print in the run summary**

After the `markersNormalized` summary block (~line 1174, before the `mismatches` block), add:

```js
  const bracketLossParts = Object.entries(results.bracketLoss).filter(([, n]) => n !== 0);
  if (bracketLossParts.length > 0) {
    console.log(
      `  Bracket-marker deltas: ${bracketLossParts.map(([t, n]) => `${t} ${n > 0 ? '+' : ''}${n}`).join(', ')} ` +
        `(inline markers dropped/added by the API — see per-module notes)`
    );
  }
```

- [ ] **Step 4: Verify the full suite still passes**

Run: `npm test`
Expected: all green (no behavior change to existing tests; new fields are additive).

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js
git commit -m "feat(item8/B3): per-module + run-summary bracket-marker delta reporting"
```

---

## Task 3: #15 — classify duplicate seg-ids benign vs real

**Files:**
- Modify: `tools/lib/extraction-coverage.js` — imports (top); `checkDuplicateSegIds` (~line 128);
  `analyzeModule` (~line 149).
- Test: `tools/__tests__/dup-segid-gate.test.js`

**Interfaces:**
- Consumes: `normalizeVisibleText` from `../verify-reextract-equivalence.js`.
- Produces: `checkDuplicateSegIds(content, segText)` returns `rawDup` entries of shape
  `{ segId, count, kind: 'benign' | 'real', sampleA?, sampleB? }`; `sourceDup` unchanged
  (`{ id, count }`). `analyzeModule(...)` `hasFindings` counts only `real` rawDups + any
  `sourceDup` + list drops.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/dup-segid-gate.test.js
import { describe, it, expect } from 'vitest';
import { checkDuplicateSegIds, analyzeModule } from '../lib/extraction-coverage.js';

const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n`;

describe('checkDuplicateSegIds — content classification', () => {
  it('classifies a byte-identical duplicate as benign', () => {
    const segText = seg('m1:para:p1', 'Hello world') + seg('m1:para:p1', 'Hello world');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup).toHaveLength(1);
    expect(rawDup[0]).toMatchObject({ segId: 'm1:para:p1', count: 2, kind: 'benign' });
  });

  it('classifies a duplicate differing only in [[MATH:N]] index as benign', () => {
    const segText = seg('m1:para:p1', '4.586 [[MATH:12]] atoms') + seg('m1:para:p1', '4.586 [[MATH:13]] atoms');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup[0].kind).toBe('benign');
  });

  it('classifies a duplicate with different words as real', () => {
    const segText = seg('m1:para:p1', 'The cat sat') + seg('m1:para:p1', 'A dog ran');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup[0].kind).toBe('real');
    expect(rawDup[0].sampleA).toContain('cat');
    expect(rawDup[0].sampleB).toContain('dog');
  });

  it('does not flag a unique seg-id', () => {
    const segText = seg('m1:para:p1', 'x') + seg('m1:para:p2', 'y');
    expect(checkDuplicateSegIds(null, segText).rawDup).toHaveLength(0);
  });
});

describe('analyzeModule — hasFindings counts only real dups', () => {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content><section id="s"><title>S</title></section></content></document>`;
  it('is clean when the only duplicate is benign', () => {
    const segText = seg('m1:para:p1', 'same') + seg('m1:para:p1', 'same');
    expect(analyzeModule(cnxml, segText).hasFindings).toBe(false);
  });
  it('flags when a duplicate is real', () => {
    const segText = seg('m1:para:p1', 'alpha') + seg('m1:para:p1', 'beta gamma');
    expect(analyzeModule(cnxml, segText).hasFindings).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/dup-segid-gate.test.js`
Expected: FAIL — `rawDup[0]` has no `kind` property (current shape is `{ segId, count }`).

- [ ] **Step 3: Write minimal implementation**

At the top of `tools/lib/extraction-coverage.js`, add the import (next to the existing imports):

```js
import { normalizeVisibleText } from '../verify-reextract-equivalence.js';
```

Replace the `rawDup` half of `checkDuplicateSegIds` (the block from `const rawCounts = new Map();`
through the `for (const [id, n] of rawCounts) ...` loop) with a text-collecting, classifying
version. The full function becomes:

```js
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

  // Group every raw SEG occurrence's normalized visible text by seg-id, so a
  // duplicate can be classified by CONTENT (parseSegmentsMap's 'first' dedup hides
  // the repeat, but a repeat whose occurrences share visible text drops nothing).
  const occ = new Map(); // segId -> string[] normalized visible texts
  for (const part of String(segText || '').split(/(?=<!--\s*SEG:)/)) {
    const m = part.match(/<!--\s*SEG:([^\s]+?)\s*-->/);
    if (!m) continue;
    const text = part.replace(/<!--\s*SEG:[^>]*-->/, '');
    if (!occ.has(m[1])) occ.set(m[1], []);
    occ.get(m[1]).push(normalizeVisibleText(text));
  }

  const rawDup = [];
  for (const [segId, texts] of occ) {
    if (texts.length < 2) continue;
    const benign = texts.every((t) => t === texts[0]);
    const entry = { segId, count: texts.length, kind: benign ? 'benign' : 'real' };
    if (!benign) {
      entry.sampleA = texts[0].slice(0, 80);
      entry.sampleB = texts.find((t) => t !== texts[0]).slice(0, 80);
    }
    rawDup.push(entry);
  }
  return { sourceDup, rawDup };
}
```

Then update `analyzeModule` so `hasFindings` counts only real dups:

```js
export function analyzeModule(cnxmlText, segText) {
  const { content } = parseModuleDoc(cnxmlText);
  const listFindings = checkLists(content, emittedElementIds(segText));
  const dupFindings = checkDuplicateSegIds(content, segText);
  const realDups = dupFindings.rawDup.filter((d) => d.kind === 'real');
  const hasFindings =
    listFindings.length > 0 || dupFindings.sourceDup.length > 0 || realDups.length > 0;
  return { listFindings, dupFindings, hasFindings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/dup-segid-gate.test.js`
Expected: PASS.

Also run the existing coverage test to confirm no regression:
Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: PASS (update any assertion that pinned the old `rawDup` shape — see Step 5).

- [ ] **Step 5: Update the one pinned old-shape assertion**

Exactly one existing assertion pins the old `rawDup` shape:
`tools/__tests__/extraction-coverage.test.js:164`. Its fixture segText is
`'<!-- SEG:m:para:a -->\nx\n<!-- SEG:m:para:a -->\ny'` — occurrences `x` ≠ `y`, so the entry is
now classified `real`. Change line 164 from:

```js
    expect(r.rawDup).toEqual([{ segId: 'm:para:a', count: 2 }]);
```

to:

```js
    expect(r.rawDup).toEqual([{ segId: 'm:para:a', count: 2, kind: 'real', sampleA: 'x', sampleB: 'y' }]);
```

(The other dup-related tests are unaffected and need no change: the `analyzeModule` "aggregates"
test at :176 gets `hasFindings` from a *list* drop, not a dup; the hermetic gate test at :271 uses
`x`/`y` → `real` → still exits 1 and only checks `.segId`.) Re-run:
Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: PASS (25 tests).

- [ ] **Step 6: Commit**

```bash
git add tools/lib/extraction-coverage.js tools/__tests__/dup-segid-gate.test.js tools/__tests__/extraction-coverage.test.js
git commit -m "feat(item8/#15): classify duplicate seg-ids benign vs real by visible text"
```

---

## Task 4: #15 — gate reports benign informationally, fails only on real

**Files:**
- Modify: `tools/verify-extraction-coverage.js` — the per-module store (~line 100), the summary
  object (~line 110), the print loop (~line 143), and the benign summary line (~line 155).
- Test: extend `tools/__tests__/dup-segid-gate.test.js` with a gate-level integration assertion.

**Interfaces:**
- Consumes: `analyzeModule` returning classified `dupFindings` (Task 3).

- [ ] **Step 1: Write the failing integration test**

Append to `tools/__tests__/dup-segid-gate.test.js`:

```js
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

describe('verify-extraction-coverage gate — benign dups do not fail', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const cli = join(repoRoot, 'tools', 'verify-extraction-coverage.js');

  it('exits 0 on frozen efnafraedi-2e (285 benign dups, 0 real)', () => {
    // Throws on non-zero exit; passing means exit 0.
    const out = execFileSync('node', [cli, '--book', 'efnafraedi-2e'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(out).toMatch(/benign duplicate seg-id/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/dup-segid-gate.test.js -t "exits 0 on frozen"`
Expected: FAIL — `execFileSync` throws because the gate currently exits 1 on the 285 dups (and
the output has no "benign duplicate seg-id" line yet).

- [ ] **Step 3: Update the gate to split real vs benign**

In `tools/verify-extraction-coverage.js`:

(a) Accumulate benign dups across ALL analyzed modules (not just flagged ones). Change the
per-module store block (~line 96–100) to always tally benign:

```js
        const r = analyzeModule(
          fs.readFileSync(srcFile, 'utf8'),
          fs.readFileSync(path.join(segDir, file), 'utf8')
        );
        benignDupTotal += r.dupFindings.rawDup.filter((d) => d.kind === 'benign').length;
        if (r.hasFindings) modules[moduleId] = { chapter: dir, ...r };
```

Declare `let benignDupTotal = 0;` alongside the existing `let ... = 0;` counters above the walk
loop (near `parseErrors`).

(b) In the summary object (~line 110), count only REAL rawDups + sourceDup as duplicates:

```js
    duplicateSegIds: ids.reduce(
      (s, m) =>
        s +
        (modules[m].dupFindings
          ? modules[m].dupFindings.sourceDup.length +
            modules[m].dupFindings.rawDup.filter((d) => d.kind === 'real').length
          : 0),
      0
    ),
```

(c) In the human print loop (~line 143–147), only print REAL rawDups as findings:

```js
      for (const d of e.dupFindings.sourceDup) {
        console.log(`  ${m} (${e.chapter}): duplicate source id ${d.id} (${d.count}×)`);
      }
      for (const d of e.dupFindings.rawDup.filter((x) => x.kind === 'real')) {
        console.log(
          `  ${m} (${e.chapter}): duplicate seg-id ${d.segId} (${d.count}×) — DIFFERENT visible text ` +
            `[A: ${JSON.stringify(d.sampleA)} | B: ${JSON.stringify(d.sampleB)}]`
        );
      }
```

(d) Add the benign informational line to the non-JSON summary (right after the existing
`Summary: ...` console.log, ~line 155):

```js
    if (benignDupTotal > 0) {
      console.log(
        `Note: ${benignDupTotal} benign duplicate seg-id(s) (identical visible text — depth-blind ` +
          `duplicate emission; non-blocking).`
      );
    }
```

Also fold `benignDupTotal` into the JSON `summary` object so `--json` consumers see it:

```js
    parseErrors,
    modulesMissingSource: missingSource,
    benignDuplicateSegIds: benignDupTotal,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/dup-segid-gate.test.js`
Expected: PASS (including the frozen-chemistry exit-0 integration test).

- [ ] **Step 5: Manually confirm the gate now exits 0 on chemistry**

Run: `node tools/verify-extraction-coverage.js --book efnafraedi-2e; echo "exit=$?"`
Expected: prints `Note: 285 benign duplicate seg-id(s) …`, `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add tools/verify-extraction-coverage.js tools/__tests__/dup-segid-gate.test.js
git commit -m "feat(item8/#15): gate fails on real dups only; benign reported informationally"
```

---

## Task 5: #15 — document the canonical policy + correct the register

**Files:**
- Modify: `tools/lib/seg-markers.cjs` (header of `parseSegmentsMap`, ~line 16).
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (the BIO-EX3 dup-count note).

- [ ] **Step 1: Document the policy in `seg-markers.cjs`**

Expand the JSDoc above `parseSegmentsMap` (~line 16) to state the canonical policy:

```js
/**
 * Parse into Map<id, text>.
 *
 * CANONICAL DUPLICATE-SEG-ID POLICY (campaign item #15): a seg-id's occurrences must
 * carry the same VISIBLE content. `'first'` here is the deliberate RUNTIME TOLERANCE —
 * a benign duplicate (identical normalized visible text; the depth-blind duplicate-
 * emission artifact) loses nothing because the source element is unique and filled once.
 * ENFORCEMENT lives at the pre-freeze gate (tools/verify-extraction-coverage.js →
 * checkDuplicateSegIds), which fails only on a *real* duplicate (occurrences with
 * DIFFERENT visible text = a content drop). Do not add duplicate-id failing here — the
 * runtime path must stay tolerant so already-frozen benign dups never break inject.
 *
 * @param {string} content
 * @param {{duplicates?: 'first'|'last'}} [opts] - 'first' (default) skips repeats; 'last' overwrites.
 * @returns {Map<string,string>}
 */
```

- [ ] **Step 2: Correct the register's dup-count claim**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, find the BIO-EX3 / 6b note that says
"12 duplicate para seg-ids across 4 FROZEN chemistry modules" and append a correction (do not
delete the original — the register is append-only per project convention):

```markdown
  **[correction 2026-07-16, item 8/#15]** The "12 dups / 4 modules" was a partial observation.
  The live gate reports **285 rawDup seg-ids across 83 modules** (0 sourceDup) — but ALL are
  benign (identical visible text; 71 differ only in `[[MATH:N]]` indices). Zero content drops.
  Item 8/#15 makes the gate content-aware (fail on `real` only), so chemistry passes clean.
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tools/lib/seg-markers.cjs docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(item8/#15): document canonical dup-seg-id policy; correct register count"
```

---

## Task 6: Verify + open PR

- [ ] **Step 1: Full suite from repo root**

Run: `npm test`
Expected: 173 files green; total = prior 2646 + new B3 (5) + #15 (~7) specs.

- [ ] **Step 2: Confirm the two guards behave end-to-end**

Run: `node tools/verify-extraction-coverage.js --book efnafraedi-2e; echo "exit=$?"`
Expected: benign note printed, `exit=0`.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/item8-boundary-guards
gh pr create --base main --title "feat(item8): boundary guards — B3 marker-count + #15 content-aware dup gate" --body "<summary per the spec; note the 285-benign-dup correction and the semantic #15 design>"
```

---

## Self-review checklist (run before handoff)

- Spec coverage: B3 (Task 1–2), #15 classifier (Task 3), #15 gate (Task 4), #15 doc + register
  (Task 5). D2 is PR 2, out of scope here. ✓
- Placeholder scan: every code step has complete code; PR body text is the only prose-fill (Task 6).
- Type consistency: `rawDup` entries carry `kind` from Task 3 onward; `analyzeModule.hasFindings`,
  the gate summary, and the print loop all filter on `kind === 'real'`; `bracketDelta` field name
  is consistent across Task 2's `translateModule` return, `results` accumulation, and summary.
