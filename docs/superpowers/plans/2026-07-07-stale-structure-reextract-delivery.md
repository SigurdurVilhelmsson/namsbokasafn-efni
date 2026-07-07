# STALE-STRUCT re-extract delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the July extraction order-fixes (F1/OC-A/B/E/OC-E) to the live efnafraedi-2e content by re-extracting the 143 re-MT-free modules, re-injecting with the existing translations, re-rendering, and flipping the order gate warn→hard — fixing ~22 live nested-section reading-order scrambles without shipping any silent regression.

**Architecture:** WS5-style content regeneration, but re-*extract*-first (the missing step WS5 skipped). A new equivalence-preflight tool mechanically proves each module is content-equivalent (up to the intended reorder) before injection; the 6 re-MT modules are excluded (→ B4); two Fable-found glossary-annotation drifts are hand-fixed; the order gate then flips to hard-fail with a fingerprint allowlist for the excluded 6.

**Tech Stack:** Node 22 ES modules, Vitest. Pipeline CLIs: `cnxml-extract.js`, `cnxml-inject.js`, `cnxml-render.js`, `cnxml-fidelity-check.js`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-stale-structure-reextract-delivery-design.md`. Scope analysis: `docs/audit/2026-07-07-stale-structure-whole-book-analysis.md`.
- **01-source is READ-ONLY.** This plan regenerates `02-*`, `03-translated`, `05-publication` (generated stages) + test fixtures/baselines. No `01-source` writes.
- **The 6 re-MT modules are EXCLUDED and must stay byte-unchanged:** `m68764, m68770, m68789, m68791, m68793, m68829`. → Track B4.
- **`npm test` from the repo root is the authoritative gate** (no branch protection).
- Robustness > expedience: one real code path, fail loud. Any preflight failure outside the known-exception set **halts the run**.
- Known same-ID EN-text exceptions (Fable-verified), triage explicitly: `m68692` (benign), `m68819` (benign improvement), `m68852` (garbled `(e. positron  or)` — must fix).
- Branch off `main` after PR #245 (analysis/register) merges, so the register + audit docs are present. One PR for the whole delivery; lead does sync/deploy.
- `.bak` before any hand-edit to a generated/content file (project rule).

## The 143 module set

All 149 source modules **except** the 6 re-MT. Generate the list at run time:
```bash
# excludes the 6 re-MT modules; prints "chNN mNNNNN" per line
node -e '
const {readdirSync,statSync}=require("fs");
const EX=new Set(["m68764","m68770","m68789","m68791","m68793","m68829"]);
const base="books/efnafraedi-2e/01-source";
for(const ch of readdirSync(base)){ const p=`${base}/${ch}`; if(!statSync(p).isDirectory())continue;
  for(const f of readdirSync(p)){ const m=f.match(/^(m\d+)\.cnxml$/); if(m && !EX.has(m[1])) console.log(ch, m[1]); } }
' > /tmp/reextract-modules.txt
wc -l /tmp/reextract-modules.txt   # expect 143
```

---

### Task 1: Equivalence-preflight tool

**Files:**
- Create: `tools/verify-reextract-equivalence.js`
- Test: `tools/__tests__/verify-reextract-equivalence.test.js`

**Interfaces:**
- Produces (pure, testable): `normalizeVisibleText(segText: string) → string` (strips ALL marker formats — legacy `{{i}}X{{/i}}`, bracket `[[i:X]]`, xref `[#X]`/`[[xref:id]]`, `[[MATH:N]]`, `[[MEDIA:N]]`, links — down to reader-visible text, so equivalent content compares equal regardless of marker syntax); `compareModule(committed, fresh) → { ok: boolean, failures: string[] }` where `committed`/`fresh` are `{ segIds: Set, segText: Map<id,string>, equations: Map<key,mathml>, inlineAttrs: string }`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test**

```javascript
// tools/__tests__/verify-reextract-equivalence.test.js
import { describe, it, expect } from 'vitest';
import { normalizeVisibleText, compareModule } from '../verify-reextract-equivalence.js';

describe('normalizeVisibleText — marker-format agnostic', () => {
  it('treats legacy and bracket emphasis as equal', () => {
    expect(normalizeVisibleText('Molarity {{i}}M{{/i}} is'))
      .toBe(normalizeVisibleText('Molarity [[i:M]] is'));
  });
  it('treats legacy and bracket xref as equal (no visible text)', () => {
    expect(normalizeVisibleText('see [#CNX_X] here'))
      .toBe(normalizeVisibleText('see [[xref:CNX_X]] here'));
  });
  it('flags a real visible-text change (MathML capture replacing literal notation)', () => {
    expect(normalizeVisibleText('positron (+10β)'))
      .not.toBe(normalizeVisibleText('positron ([[MATH:51]])'));
  });
});

describe('compareModule — 4-part equivalence', () => {
  const base = { segIds: new Set(['a']), segText: new Map([['a', 'x [[i:M]]']]),
                 equations: new Map([['math-1', '<mi>k</mi>']]), inlineAttrs: '{"terms":[]}' };
  it('passes when only marker format differs', () => {
    const fresh = { ...base, segText: new Map([['a', 'x {{i}}M{{/i}}']]) };
    expect(compareModule(base, fresh).ok).toBe(true);
  });
  it('fails on segment-id-set change', () => {
    const fresh = { ...base, segIds: new Set(['a', 'b']) };
    expect(compareModule(base, fresh).ok).toBe(false);
  });
  it('fails on equations shared-key MathML change', () => {
    const fresh = { ...base, equations: new Map([['math-1', '<mi>DIFFERENT</mi>']]) };
    expect(compareModule(base, fresh).ok).toBe(false);
  });
  it('fails on inline-attrs byte change', () => {
    const fresh = { ...base, inlineAttrs: '{"terms":[{"id":"t1"}]}' };
    expect(compareModule(base, fresh).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/verify-reextract-equivalence.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

```javascript
// tools/verify-reextract-equivalence.js
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

// Strip every marker family to the reader-visible text so equivalent content
// compares equal regardless of marker SYNTAX (the re-extract modernizes
// {{i}}→[[i:]], [#x]→[[xref:x]]). Non-visible payloads (xref ids, MATH/MEDIA
// placeholders, link urls) are removed; visible label/inner text is kept.
export function normalizeVisibleText(s) {
  return s
    .replace(/\[\[(?:xref|docref):[^\]|]*\]\]/g, '')          // [[xref:id]] / [[docref:id]] — no visible text
    .replace(/\[\[(?:xref|docref):[^\]|]*\|([^\]]*)\]\]/g, '$1') // [[xref:label|id]] — keep label
    .replace(/\[#[^\]]*\]/g, '')                              // legacy [#id]
    .replace(/\[\[(?:MATH|MEDIA|TABLE):\d+\]\]/g, '')   // placeholders → sentinel (present but opaque)
    .replace(/\[\[link:([^\]|]*)\|[^\]]*\]\]/g, '$1')         // [[link:text|url]] — keep text
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')                // legacy [text](url)
    .replace(/\[\[[a-z]+:([^\]]*)\]\]/g, '$1')                // [[i:X]] [[b:X]] [[sub:X]] [[sup:X]] [[term:X]] → X
    .replace(/\{\{\/?[a-z]+\}\}/g, '')                        // legacy {{i}} {{/i}} {{term}} {{/term}}
    .replace(/\s+/g, ' ')
    .trim();
}

export function compareModule(committed, fresh) {
  const failures = [];
  const aIds = [...committed.segIds].sort().join('|');
  const bIds = [...fresh.segIds].sort().join('|');
  if (aIds !== bIds) failures.push('segment-id-set changed');
  else {
    for (const [id, t] of committed.segText) {
      if (normalizeVisibleText(t) !== normalizeVisibleText(fresh.segText.get(id) ?? '')) {
        failures.push(`same-id EN visible-text changed: ${id}`);
      }
    }
  }
  for (const [k, v] of committed.equations) {
    if (fresh.equations.has(k) && fresh.equations.get(k) !== v) {
      failures.push(`equations shared-key MathML changed: ${k}`);
    }
  }
  if (committed.inlineAttrs !== fresh.inlineAttrs) failures.push('inline-attrs changed');
  return { ok: failures.length === 0, failures };
}

// ---- CLI: compare committed (git HEAD) vs working-tree (post-re-extract) ----
function segMap(text) {
  const ids = new Set(), map = new Map();
  for (const p of text.split(/(?=<!-- SEG:[^>]*-->)/)) {
    const m = p.match(/<!-- SEG:([^>]*?) -->/); if (!m) continue;
    const id = m[1].trim(); ids.add(id);
    map.set(id, p.replace(/<!-- SEG:[^>]*-->/, '').replace(/\s+/g, ' ').trim());
  }
  return { ids, map };
}
function eqMap(json) {
  const m = new Map();
  try { for (const [k, v] of Object.entries(JSON.parse(json).equations ?? JSON.parse(json))) m.set(k, JSON.stringify(v)); } catch {}
  return m;
}
function loadCommitted(path) { try { return execSync(`git show HEAD:${path}`, { encoding: 'utf8' }); } catch { return null; } }
function loadDisk(path) { return existsSync(path) ? readFileSync(path, 'utf8') : null; }

export function verifyBook(book, modulesFile, knownExceptions = new Set()) {
  const lines = readFileSync(modulesFile, 'utf8').trim().split('\n').filter(Boolean);
  const report = [];
  for (const line of lines) {
    const [ch, mod] = line.trim().split(/\s+/);
    const seg = `books/${book}/02-for-mt/${ch}/${mod}-segments.en.md`;
    const eq = `books/${book}/02-structure/${ch}/${mod}-equations.json`;
    const ia = `books/${book}/02-structure/${ch}/${mod}-inline-attrs.json`;
    const cSeg = segMap(loadCommitted(seg) ?? ''); const fSeg = segMap(loadDisk(seg) ?? '');
    const committed = { segIds: cSeg.ids, segText: cSeg.map, equations: eqMap(loadCommitted(eq) ?? '{}'), inlineAttrs: loadCommitted(ia) ?? '' };
    const fresh = { segIds: fSeg.ids, segText: fSeg.map, equations: eqMap(loadDisk(eq) ?? '{}'), inlineAttrs: loadDisk(ia) ?? '' };
    const r = compareModule(committed, fresh);
    // downgrade the known-exception segment failures to warnings
    const real = r.failures.filter((f) => !knownExceptions.has(mod));
    report.push({ mod, ch, ok: real.length === 0, failures: r.failures, exceptionWaived: r.failures.length > 0 && real.length === 0 });
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const modulesFile = process.argv[2] || '/tmp/reextract-modules.txt';
  const known = new Set(['m68692', 'm68819', 'm68852']);
  const report = verifyBook('efnafraedi-2e', modulesFile, known);
  const failed = report.filter((r) => !r.ok);
  const waived = report.filter((r) => r.exceptionWaived);
  for (const r of report) if (r.failures.length) console.log(`${r.ok ? (r.exceptionWaived ? 'WAIVED ' : 'OK    ') : 'FAIL  '} ${r.mod}: ${r.failures.join('; ')}`);
  console.log(`\n${report.length} modules; ${failed.length} FAIL; ${waived.length} waived-known-exception`);
  process.exit(failed.length ? 1 : 0);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tools/__tests__/verify-reextract-equivalence.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add tools/verify-reextract-equivalence.js tools/__tests__/verify-reextract-equivalence.test.js
git commit -m "feat(tools): re-extract equivalence preflight (4-part, marker-agnostic) [STALE-STRUCT]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Re-extract the 143 + preflight gate + assert-6-unchanged

**Files:**
- Modify (generated, commit): `books/efnafraedi-2e/02-structure/**`, `books/efnafraedi-2e/02-for-mt/**` (143 modules)

**Interfaces:**
- Consumes: `tools/verify-reextract-equivalence.js` (Task 1), `/tmp/reextract-modules.txt` (143).

- [ ] **Step 1: Snapshot the 6 re-MT modules' committed artifacts (to assert unchanged later)**

```bash
git ls-files 'books/efnafraedi-2e/02-structure/**' 'books/efnafraedi-2e/02-for-mt/**' \
  | grep -E 'm68764|m68770|m68789|m68791|m68793|m68829' | sort > /tmp/re-mt-6-files.txt
wc -l /tmp/re-mt-6-files.txt
```

- [ ] **Step 2: Re-extract exactly the 143 (by module)**

```bash
while read ch mod; do
  node tools/cnxml-extract.js --book efnafraedi-2e --chapter "${ch#ch}" --module "$mod" >/dev/null 2>&1 \
    || echo "EXTRACT FAILED: $ch $mod";
done < /tmp/reextract-modules.txt
echo "re-extract done"
```

- [ ] **Step 3: Assert the 6 re-MT modules are byte-unchanged (they must NOT have been re-extracted)**

```bash
git diff --quiet -- $(cat /tmp/re-mt-6-files.txt) && echo "OK: 6 re-MT modules unchanged" || { echo "FAIL: a re-MT module changed — restore it"; git status --porcelain $(cat /tmp/re-mt-6-files.txt); }
```
Expected: `OK: 6 re-MT modules unchanged`. If FAIL, `git checkout -- <files>` those and re-check.

- [ ] **Step 4: Run the equivalence preflight (the safety gate)**

Run: `node tools/verify-reextract-equivalence.js /tmp/reextract-modules.txt`
Expected: exit 0; output shows only `WAIVED m68692/m68819/m68852` lines (the known exceptions) and `0 FAIL`. **If any `FAIL` line appears, STOP** — a module drifted beyond the known exceptions; investigate before proceeding.

- [ ] **Step 5: Commit the re-extract**

```bash
git add books/efnafraedi-2e/02-structure books/efnafraedi-2e/02-for-mt
git commit -m "content(efnafraedi-2e): re-extract 143 re-MT-free modules (delivers F1/OC-A/B/E/OC-E to structure.json) [STALE-STRUCT]

Preflight: equivalence gate green (segment-id-set + normalized EN text + equations
shared-key + inline-attrs), 3 known glossary exceptions waived (m68692/819/852).
6 re-MT modules (m68764/770/789/791/793/829) excluded → B4.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix the m68852 glossary-annotation garble (+ verify m68819)

**Files:**
- Investigate: `tools/cnxml-inject.js` `annotateInlineTerms` (~832, F6 math-strip)
- Modify: either `tools/cnxml-inject.js` (+ test) OR the single m68852 faithful/mt segment (targeted content fix)

**Interfaces:** consumes the re-extracted structure (Task 2).

- [ ] **Step 1: Reproduce — re-inject m68852 and confirm the garble**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 21 --module m68852 >/dev/null 2>&1
grep -o '(e\. positron[^)]*)' books/efnafraedi-2e/03-translated/mt-preview/ch21/m68852.cnxml
```
Expected: shows `(e. positron  or)` (the garble — math notation stripped from the annotation).

- [ ] **Step 2: Decide the fix location**

Read `annotateInlineTerms` around `cnxml-inject.js:832`. If the math-strip can preserve the math *visible* notation generally (e.g. keep the rendered notation text) without regressing other annotations, prefer a **code fix** + a unit test on the `positron` case. If it is entangled/risky, apply a **targeted content fix**: back up (`.bak`) and correct the m68852 term annotation so the notation reads correctly, and log the code root-cause to the register (B4). Record the decision in the commit message.

- [ ] **Step 3: Apply the chosen fix**

(Code fix path) add a Vitest case that a term annotation containing math notation renders the notation rather than stripping it; implement minimally; run it.
(Content fix path) edit the m68852 segment (with `.bak`), re-inject m68852, re-check Step 1 shows a correct annotation.

- [ ] **Step 4: Verify m68819 is the benign improvement**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 16 --module m68819 >/dev/null 2>&1
grep -o '(e\. standard free energy[^)]*)' books/efnafraedi-2e/03-translated/mt-preview/ch16/m68819.cnxml
```
Expected: reads cleanly (the mangled `(δgf°)` no longer present). Accept.

- [ ] **Step 5: Commit the fix**

```bash
git add -A books/efnafraedi-2e tools/cnxml-inject.js tools/__tests__ 2>/dev/null
git commit -m "fix: m68852 glossary term annotation garble ('positron  or') [STALE-STRUCT]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Re-inject the 143 (both tracks) + residue/marker gates + postflight diff

**Files:**
- Modify (generated, commit): `books/efnafraedi-2e/03-translated/**` (143 modules, mt-preview + faithful ch1/ch3)

- [ ] **Step 1: Re-inject the 143 — mt-preview (all) + faithful (ch1/ch3 reviewed)**

```bash
while read ch mod; do node tools/cnxml-inject.js --book efnafraedi-2e --chapter "${ch#ch}" --module "$mod" >/dev/null 2>&1 || echo "INJECT FAIL: $ch $mod"; done < /tmp/reextract-modules.txt
for ch in 1 3; do node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$ch" --source-dir 03-faithful-translation >/dev/null 2>&1; done
echo "re-inject done"
```

- [ ] **Step 2: EN-residue + marker-residue gate on all 143**

```bash
# no literal bracket/legacy markers leaked into output; no obvious EN residue
grep -rlE '\[\[(i|b|sub|sup|xref|term|MATH|MEDIA|TABLE):|\{\{/?(i|b|term)\}\}' books/efnafraedi-2e/03-translated/mt-preview | grep -Ev 'm68764|m68770|m68789|m68791|m68793|m68829' | head
```
Expected: no output (no leaked markers in the 143). Also run the project residue scanner if present (`node tools/scan-residue.js --book efnafraedi-2e` or the inject-time A2 gate) and confirm no new residue in the 143.

- [ ] **Step 3: Postflight — text-node diff new vs old 03-translated = "reorders only + known glossary lines"**

```bash
git diff books/efnafraedi-2e/03-translated | grep -E '^[+-]' | grep -vE '^[+-]{3}' \
  | grep -ivE 'path d=|mjx-c|<use |viewBox|<svg|</svg' \
  | grep -iE 'positron|standard free energy' | head
# Broad check: the diff should be dominated by MOVED lines (reorders), not changed prose.
git diff --stat books/efnafraedi-2e/03-translated | tail -3
```
Expected: the only *prose* changes are the m68819/m68852 glossary lines; the bulk is element repositioning. Spot-review 3–4 modules' diffs to confirm reorders, not rewrites.

- [ ] **Step 4: Commit the re-inject**

```bash
git add books/efnafraedi-2e/03-translated
git commit -m "content(efnafraedi-2e): re-inject 143 modules from fixed structure — order corrected, translations preserved [STALE-STRUCT]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Re-render + goldens + baseline + fidelity + full test

**Files:**
- Modify (generated, commit): `books/efnafraedi-2e/05-publication/**`, `tools/__tests__/fixtures/render-golden/**`, `books/efnafraedi-2e/render-fidelity-baseline.json`

- [ ] **Step 1: Re-render both tracks (all chapters)**

```bash
for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch" --track mt-preview >/dev/null 2>&1; done
for ch in 1 3; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch" --track faithful >/dev/null 2>&1; done
echo "re-render done"
```

- [ ] **Step 2: Regenerate render goldens + eyeball diff**

```bash
UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js
git diff --stat tools/__tests__/fixtures/render-golden/
```
Expected: goldens change only for re-extracted golden-set modules; diffs are order/structure fixes (+ the m68852/m68819 lines if in-set). Any *other* change → STOP and investigate.

- [ ] **Step 3: Regenerate render-fidelity-baseline + confirm clean**

```bash
node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e --update-baseline >/dev/null 2>&1
npm run fidelity:render 2>&1 | grep -E 'Total findings'; echo "exit ${PIPESTATUS[0]}"
```
Expected: `Total findings: 0`, exit 0.

- [ ] **Step 4: Assistive-mathml invariant + full test**

```bash
# assistive <math> count must equal mjx-container count (a11y invariant, WS5-style)
node -e 'const {execSync}=require("child_process"); const f=execSync("grep -rho \"assistive-mathml\\|mjx-container\" books/efnafraedi-2e/05-publication | sort | uniq -c",{encoding:"utf8"}); console.log(f)'
npm test 2>&1 | grep -E 'Test Files|Tests ' | tail -2
```
Expected: assistive count == mjx count; `npm test` all green.

- [ ] **Step 5: Reader-order spot-check on a known nested-section module**

```bash
F=books/efnafraedi-2e/05-publication/mt-preview/chapters/03/3-3-molarstyrkur.html   # m68702-derived; adjust to the real slug
node --input-type=module -e 'import {compareElementOrder} from "./tools/cnxml-fidelity-check.js"; import {readFileSync} from "fs";
const s=readFileSync("books/efnafraedi-2e/01-source/ch03/m68702.cnxml","utf8"), t=readFileSync("books/efnafraedi-2e/03-translated/mt-preview/ch03/m68702.cnxml","utf8");
console.log("m68702 order ok:", compareElementOrder(s,t).ok);'
```
Expected: `m68702 order ok: true`.

- [ ] **Step 6: Commit the re-render**

```bash
git add books/efnafraedi-2e/05-publication tools/__tests__/fixtures/render-golden books/efnafraedi-2e/render-fidelity-baseline.json
git commit -m "content(efnafraedi-2e): re-render 143 modules — reading order fixed for readers [STALE-STRUCT]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Order-gate warn→hard flip + fingerprint allowlist

**Files:**
- Modify: `tools/cnxml-fidelity-check.js` (order check → exit-affecting; load allowlist)
- Create: `books/efnafraedi-2e/order-allowlist.json`
- Test: `tools/__tests__/cnxml-fidelity-order-gate.test.js`

**Interfaces:**
- Consumes: `compareElementOrder` (existing). Produces: `orderFingerprint(moved: string[]) → string` (stable hash of the sorted moved-id set); allowlist file shape `{ "<moduleId>": { "fingerprint": "<hash>", "reason": "B4 re-MT" } }`.

- [ ] **Step 1: Confirm the order check is now clean except the 6**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e 2>&1 | grep -c 'ORDER \[warn-only\]'`
Expected: `6` (only the excluded re-MT modules).

- [ ] **Step 2: Write the failing test**

```javascript
// tools/__tests__/cnxml-fidelity-order-gate.test.js
import { describe, it, expect } from 'vitest';
import { orderFingerprint, isOrderAllowlisted } from '../cnxml-fidelity-check.js';

describe('order gate fingerprint allowlist', () => {
  it('fingerprint is order-insensitive over the moved set', () => {
    expect(orderFingerprint(['b', 'a'])).toBe(orderFingerprint(['a', 'b']));
  });
  it('allowlists a module only when the moved-set fingerprint matches', () => {
    const allow = { m68793: { fingerprint: orderFingerprint(['x', 'y']), reason: 'B4' } };
    expect(isOrderAllowlisted('m68793', ['y', 'x'], allow)).toBe(true);   // same set → waived
    expect(isOrderAllowlisted('m68793', ['x', 'z'], allow)).toBe(false);  // NEW reorder → red
    expect(isOrderAllowlisted('m68999', ['x', 'y'], allow)).toBe(false);  // not listed → red
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-fidelity-order-gate.test.js`
Expected: FAIL — `orderFingerprint`/`isOrderAllowlisted` not exported.

- [ ] **Step 4: Implement fingerprint + allowlist + flip**

In `tools/cnxml-fidelity-check.js` add:
```javascript
import { createHash } from 'crypto';
export function orderFingerprint(moved) {
  return createHash('sha1').update([...moved].sort().join(' ')).digest('hex').slice(0, 16);
}
export function isOrderAllowlisted(moduleId, moved, allow) {
  const e = allow[moduleId];
  return !!e && e.fingerprint === orderFingerprint(moved);
}
```
Load `books/efnafraedi-2e/order-allowlist.json` at book scope; in the order-check loop, a module with `!order.ok` that **is** allowlisted → warn (does not affect exit); one that is **not** allowlisted → **push to a hard-fail list** and set exit non-zero. Update the summary line to distinguish `allowlisted (B4)` from `HARD-FAIL`.

- [ ] **Step 5: Generate the order-allowlist for the 6, run tests**

```bash
node --input-type=module -e 'import {compareElementOrder,orderFingerprint} from "./tools/cnxml-fidelity-check.js"; import {readFileSync} from "fs";
const out={}; for(const [ch,m] of [["ch10","m68764"],["ch10","m68770"],["ch12","m68789"],["ch12","m68791"],["ch12","m68793"],["ch18","m68829"]]){
  const s=readFileSync(`books/efnafraedi-2e/01-source/${ch}/${m}.cnxml`,"utf8"), t=readFileSync(`books/efnafraedi-2e/03-translated/mt-preview/${ch}/${m}.cnxml`,"utf8");
  out[m]={fingerprint:orderFingerprint(compareElementOrder(s,t).moved),reason:"B4 re-MT (stale structure; seg-id-set changes) — see docs/audit/2026-07-07-stale-structure-whole-book-analysis.md"};
}
import {writeFileSync} from "fs"; writeFileSync("books/efnafraedi-2e/order-allowlist.json", JSON.stringify(out,null,2));'
npx vitest run tools/__tests__/cnxml-fidelity-order-gate.test.js
node tools/cnxml-fidelity-check.js --book efnafraedi-2e; echo "exit $?"
```
Expected: unit test PASS; the check reports the 6 as `allowlisted (B4)` and exits **0** (hard-fail list empty).

- [ ] **Step 6: Full test + commit**

```bash
npm test 2>&1 | grep -E 'Test Files|Tests ' | tail -2
git add tools/cnxml-fidelity-check.js tools/__tests__/cnxml-fidelity-order-gate.test.js books/efnafraedi-2e/order-allowlist.json
git commit -m "feat(fidelity): order check warn→hard with fingerprint allowlist (6 re-MT → B4) [STALE-STRUCT]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Register follow-up, memory, PR

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (mark STALE-STRUCT done; add link-target-parity follow-up)

- [ ] **Step 1: Log the source↔output link-target parity follow-up + mark STALE-STRUCT delivered**

Add a 🟡 register row: `link-target parity | no gate compares source↔output <link target-id>/document values (m68692 dead local link invisible) | [fix] follow-up`. Update the 🔴 STALE-STRUCT row → "✅ delivered (128 order-fixed + 15 marker-modernized re-injected/re-rendered; order gate flipped; 6 → B4)".

- [ ] **Step 2: Final whole-suite gate**

Run: `npm test` (from repo root). Expected: all green. Run `npm run fidelity:render` → 0 findings. Run `node tools/cnxml-fidelity-check.js --book efnafraedi-2e` → exit 0.

- [ ] **Step 3: Push + PR**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md && git commit -m "docs(register): STALE-STRUCT delivered; log link-target-parity follow-up"
git push -u origin <branch>
gh pr create --base main --title "content: STALE-STRUCT re-extract delivery — fix live reading-order scrambles + flip order gate" --body "..."
```
PR body: the 143-module re-extract delivery; preflight evidence; order gate 6→allowlisted + flipped; m68852 fix; 6 re-MT → B4; lead does sync/deploy. Link the spec + analysis doc.

- [ ] **Step 4: Post-merge (lead)**

Lead runs Phase-6 sync + prod deploy. Post-deploy spot-check: a nested-subsection page reads intro-first (no out-of-order prose); m68852 glossary term correct.

---

## Self-Review

- **Spec coverage:** D1 re-extract → Task 2; D2 preflight → Task 1 (tool) + Task 2 (run); D3 re-inject → Task 4; D4 glossary fix → Task 3; D5 re-render/goldens → Task 5; D6 gate flip → Task 6; D7 verification suite → distributed across Tasks 2/4/5/6; D8 delivery + register follow-up → Task 7. All covered.
- **Placeholder scan:** the only open decision is Task 3's code-fix-vs-content-fix, which is explicitly a decide-at-implementation branch with both paths specified — not a placeholder. PR body text in Task 7 Step 3 is a fill-at-time summary (acceptable).
- **Type/name consistency:** `normalizeVisibleText`/`compareModule`/`verifyBook` (Task 1) used consistently; `orderFingerprint`/`isOrderAllowlisted` (Task 6) consistent; module-list file `/tmp/reextract-modules.txt` and 6-exclusion set consistent across tasks; `order-allowlist.json` shape consistent between Task 6 Steps 2/4/5.
