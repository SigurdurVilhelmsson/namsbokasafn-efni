# Chemistry WS2 — Fidelity Honest-Manifest Implementation Plan

> **✅ STATUS: COMPLETE — PR #217** (branch `feat/chem-ws2-fidelity-honest-manifest`, 2026-07-02). All 4 tasks
> shipped + reviewed (spec+quality per task, opus whole-branch). Manifest honest-green (mt-preview:
> green:true, unexplained:0, deferredLosses:10 / 4 entries, benignArtifacts:34 = 44 total). Full suite
> 1696 / validate 24/24. Plus the re-MT recovery (m68764 PERFECT, m68818 italics) + m68710 golden regen.
> Overall clean-slate status + resume point: project memory `chemistry-clean-slate`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the fidelity manifest *honest* — every discrepancy is either fixed or explicitly classified with a reason, so `green` means "zero **unexplained** discrepancies," and genuine reader-facing losses stay visibly counted (never silently allowlisted as benign).

**Architecture:** A per-book data file `books/<book>/fidelity-allowlist.json` lists each accepted discrepancy (`moduleId`+`tag`+`diff`) with a **two-class** label — `benign` (not a real loss: checker counting artifact, term-annotation, MT-stripped formatting) or `known-loss-deferred` (a real loss not fixed here, with a mandatory `pointer`). A shared pure lib `tools/lib/fidelity-allowlist.js` classifies a diff against the allowlist. The live manifest producer `tools/lib/update-translation-errors.js` consults it: allowlisted diffs are still **listed** but don't count as `unexplained`; `green = unexplained === 0 && skippedUntranslated === 0`; the summary surfaces `deferredLosses` so real losses aren't hidden. A diff that isn't allowlisted — or whose `diff` value drifted — stays **unexplained** → red (fail-loud on drift).

**Tech Stack:** Node 22 ESM, Vitest. Builds on the A1 track-qualified manifest (`tracks[track].summary/modules`).

## Global Constraints
- Robustness: two classes are **mandatory** — labeling a real loss `benign` is the silent-green the lead forbade. `known-loss-deferred` requires a `reason` AND a `pointer`. Every allowlisted diff stays **listed** in the manifest.
- Exact-match on `moduleId`+`tag`+`diff`: if a discrepancy's `diff` changes or a new one appears, it is **unexplained** (red). No wildcards.
- Node 22 ESM; local `npm test` from repo root is the gate. Branch: `feat/chem-ws2-fidelity-honest-manifest` (already cut; carries the re-MT recovery commit + design/WS1 context).
- Resolve `books/` intrinsically (this lib is `tools/lib/`, loaded relative to `bookDir` which callers already pass — no `process.cwd()`).

---

## File Structure
- **Create `tools/lib/fidelity-allowlist.js`** — pure: `loadAllowlist(bookDir)` + `classifyDiff(moduleId, tag, diff, allowlist)`.
- **Create `books/efnafraedi-2e/fidelity-allowlist.json`** — the 32 accepted entries (28 benign + 4 deferred).
- **Modify `tools/lib/update-translation-errors.js`** — consult the allowlist; new summary counts + `green` semantics; annotate listed discrepancies.
- **Test:** `tools/__tests__/fidelity-allowlist.test.js`, extend `tools/__tests__/update-translation-errors.test.js`.

---

## Task 1: Allowlist lib (pure classify)

**Files:** Create `tools/lib/fidelity-allowlist.js`; Test `tools/__tests__/fidelity-allowlist.test.js`.

**Interfaces (Produces):**
- `loadAllowlist(bookDir: string) → { entries: Array<{moduleId,tag,diff,class,reason,pointer?}> }` — reads `<bookDir>/fidelity-allowlist.json`; returns `{entries: []}` if the file is absent (a book with no allowlist ⇒ every discrepancy is unexplained, which is correct/safe).
- `classifyDiff(moduleId, tag, diff, allowlist) → { status: 'benign'|'known-loss-deferred'|'unexplained', reason?: string, pointer?: string }` — exact match on `moduleId`+`tag`+`diff`.

- [ ] **Step 1: Write the failing test**
```js
// tools/__tests__/fidelity-allowlist.test.js
import { describe, it, expect } from 'vitest';
import { classifyDiff } from '../lib/fidelity-allowlist.js';

const AL = { entries: [
  { moduleId: 'm1', tag: 'emphasis', diff: -1, class: 'benign', reason: 'checker counting artifact' },
  { moduleId: 'm2', tag: 'para', diff: -7, class: 'known-loss-deferred', reason: 'nested para/list', pointer: 'Track C' },
] };

describe('classifyDiff', () => {
  it('returns benign with reason on an exact benign match', () => {
    expect(classifyDiff('m1', 'emphasis', -1, AL)).toEqual({ status: 'benign', reason: 'checker counting artifact' });
  });
  it('returns known-loss-deferred with reason+pointer', () => {
    expect(classifyDiff('m2', 'para', -7, AL)).toEqual({ status: 'known-loss-deferred', reason: 'nested para/list', pointer: 'Track C' });
  });
  it('is unexplained when the diff value drifted (fail-loud)', () => {
    expect(classifyDiff('m2', 'para', -8, AL).status).toBe('unexplained');
  });
  it('is unexplained for an unlisted module/tag', () => {
    expect(classifyDiff('m9', 'sub', -1, AL).status).toBe('unexplained');
  });
});
```
- [ ] **Step 2: Run → FAIL** (`npx vitest run tools/__tests__/fidelity-allowlist.test.js`; "Failed to resolve import").
- [ ] **Step 3: Implement**
```js
// tools/lib/fidelity-allowlist.js
import fs from 'fs';
import path from 'path';

/** Load a book's fidelity allowlist; {entries:[]} when absent (⇒ nothing is pre-explained). */
export function loadAllowlist(bookDir) {
  const p = path.join(bookDir, 'fidelity-allowlist.json');
  if (!fs.existsSync(p)) return { entries: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/** Exact-match classify one discrepancy. Unlisted or drifted → unexplained (fail-loud). */
export function classifyDiff(moduleId, tag, diff, allowlist) {
  const e = (allowlist.entries || []).find(
    (x) => x.moduleId === moduleId && x.tag === tag && x.diff === diff
  );
  if (!e) return { status: 'unexplained' };
  const out = { status: e.class, reason: e.reason };
  if (e.pointer) out.pointer = e.pointer;
  return out;
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(fidelity): two-class allowlist lib (benign vs known-loss-deferred)`).

---

## Task 2: Consult the allowlist in the live manifest producer

**Files:** Modify `tools/lib/update-translation-errors.js`; extend `tools/__tests__/update-translation-errors.test.js`.

**Consumes:** `loadAllowlist`, `classifyDiff` (Task 1).
**Produces:** track summary gains `unexplainedDiscrepancies`, `deferredLosses`, `benignArtifacts`; `green = unexplainedDiscrepancies === 0 && skippedUntranslated === 0`; each listed module's `discrepancies[]` entries gain `status`/`reason`/`pointer`.

- [ ] **Step 1: Write the failing test** — add to `update-translation-errors.test.js`: build a temp bookDir with a source+translated module that has one `emphasis:-1`, and a `fidelity-allowlist.json` marking it `benign`; assert the resulting track summary has `green: true`, `unexplainedDiscrepancies: 0`, `benignArtifacts: 1`, and the module is still listed with `discrepancies[0].status === 'benign'`. Add a second case: allowlist a `para:-7` as `known-loss-deferred` → `green: true` (unexplained 0) but `deferredLosses: 1`. Add a third: an unlisted `sub:-1` → `green: false`, `unexplainedDiscrepancies: 1`. (Follow the existing test's temp-dir + fixture pattern in this file.)
- [ ] **Step 2: Run → FAIL** (new summary fields undefined / green wrong).
- [ ] **Step 3: Implement** — in `updateTranslationErrors` (`tools/lib/update-translation-errors.js`):
  - Near the top: `const allowlist = loadAllowlist(bookDir);` (import at file head).
  - Replace the counting block (currently lines ~101-113 + green at ~119) so that, for each module with `diffs`, it classifies every diff via `classifyDiff(mod.moduleId, d.tag, d.diff, allowlist)`; tally per status into `unexplainedDiscrepancies`, `deferredLosses`, `benignArtifacts` (by `Math.abs(diff)`); keep the existing `withDiscrepancies`/`totalDiscrepancies` (total, unchanged) for continuity; push `discrepancies: diffs.map(d => ({ tag, diff, ...classifyDiff(...) }))` so each is annotated; set `green = unexplainedDiscrepancies === 0 && skippedUntranslated === 0`; add the three new counts to `summary`.
  - Update the console log line (~158) to include `unexplained`/`deferred`.
- [ ] **Step 4: Run → PASS**, then `npm test` (full) green.
- [ ] **Step 5: Commit** (`feat(fidelity): manifest green = zero unexplained; surface deferredLosses`).

---

## Task 3: Populate + regenerate + verify the efnafraedi-2e allowlist

**Files:** Create `books/efnafraedi-2e/fidelity-allowlist.json`.

- [ ] **Step 1: Write the allowlist** from the triage (32 entries; `diff` values must match the CURRENT manifest exactly). Deferred (4): `m68727 para -7`, `m68818 para -1` (both `pointer: "docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md — Track C nested para/list"`); `m68854 link -1` (`pointer: "… inject xref restore / Track B-C"`); `m68826 title -1` (`reason: "dropped note heading 'Statue of Liberty: Changing Colors' — investigate note-title extraction"`, `pointer: "WS2 register"`). Benign (28): every emphasis/sub/sup/term/title(+1) entry currently in `tracks['mt-preview'].modules`, `reason` per family — emphasis/sub/sup: `"fidelity-checker counting artifact (nested marker / normalization); text + formatting present"`; term±: `"pipeline term-annotation / legacy {{term}} edge; term text present in prose"`; `m68860 title +1`: `"duplicate-title artifact"`. Generate the exact list with:
  `node -e "const m=require('./books/efnafraedi-2e/translation-errors.json'); m.tracks['mt-preview'].modules.forEach(x=>x.discrepancies.forEach(d=>console.log(x.moduleId,x.chapter,d.tag,d.diff)))"`
- [ ] **Step 2: Regenerate the manifest** — re-run inject on any one already-injected module (which calls `updateTranslationErrors`), or add a small `npm run fidelity:manifest` invocation; confirm `tracks['mt-preview'].summary` now shows `green: true`, `unexplainedDiscrepancies: 0`, `deferredLosses: 4`, `benignArtifacts: 28`.
- [ ] **Step 3: Verify honesty** — flip one benign entry's `diff` in the source of truth mentally: confirm that removing any single allowlist entry makes `green:false` (the manifest can't be green with an unexplained diff). Spot-confirm the 4 deferred entries are still listed with their pointers.
- [ ] **Step 4: Commit** (`content(efnafraedi-2e): fidelity allowlist — 28 benign + 4 deferred; manifest honest-green`).

---

## Task 4: Standalone fidelity-check consistency + register the out-of-scope find

**Files:** Modify `tools/cnxml-fidelity-check.js` (standalone writer); Modify `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register).

- [ ] **Step 1:** Make `cnxml-fidelity-check.js` consult the same allowlist (reuse `classifyDiff`) so its standalone report and exit code agree with the live producer (green = zero unexplained). If its report shape differs, at minimum annotate discrepancies + compute an `unexplained` exit code. Add/extend a focused test.
- [ ] **Step 2:** Append to the register's out-of-scope section: **m68860 untranslated-EN title** ("Graphing the Dependence of y…") — a title-level EN residue WS1's body-segment scan didn't cover; and the **m68826 note-title drop** as a `known-loss-deferred` needing root-cause (note-title extraction/inject).
- [ ] **Step 3:** `npm test` + `npm run validate` green from repo root. Commit.

---

## Self-Review
- **Spec coverage:** two-class allowlist (Task 1) ✅; green=unexplained + deferred surfaced (Task 2) ✅; populated + honest-green verified (Task 3) ✅; both producers consistent (Task 4) ✅; register logged (Task 4) ✅.
- **Placeholder scan:** allowlist entry *values* are generated from the live manifest in Task 3 Step 1 (exact `diff` match required) — not hand-guessed.
- **Type consistency:** `classifyDiff` returns `{status,reason?,pointer?}` (Task 1) and is consumed with that shape in Task 2. `loadAllowlist → {entries:[]}` used in both.
