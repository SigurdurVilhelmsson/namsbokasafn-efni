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
- Known same-ID content exceptions (empirically derived — see "Preflight calibration" below), triage explicitly: `m68819` (benign improvement — drops a mangled `(ΔGf°)`), `m68852` (garbled `positron or` — must fix). **These are the only two modules whose normalized EN text or equation key-set changes on re-extract; both are math-capture cases.** `m68692` is NOT an exception — its earlier-flagged "drift" was a docref-label modernization the corrected normalizer canonicalizes to equal (its dead local link is a non-delivery, not a content change).

### Preflight calibration (verified 2026-07-07, whole-book re-extract dry-run)

Re-extracting all 149 and running the corrected `normalizeVisibleText` (Task 1) + the equation
key-set check (Task 1) yields:
- **segment-ID-set change** = exactly the 6 re-MT modules (scope boundary confirmed exact).
- **normalized-text drift** (non-re-MT) = exactly `{m68819, m68852}` after the normalizer covers
  every marker-modernization pattern (legacy `{{ }}`↔bracket `[[ ]]`, sub/sup capture, labeled
  xref/docref/link visible-label, markdown `[text](url)`/`[text](doc:m…)`, legacy raw refs
  `[m68674#id]`/`[#id]`). ~20 other modules gain benign modernizations that MUST normalize to
  equality — if the normalizer is under-built they false-positive and halt the run.
- **equation key-set change** (added/removed `math-N`, non-re-MT) = the *same* `{m68819, m68852}`.
  Two independent detectors converging on the same two math-capture modules is the safety proof.
- **inline-attrs.json + equations.json shared-key values** = byte-stable for all non-re-MT modules
  (term-ids are source-order stable; a reorder does not renumber them).
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
- Produces (pure, testable): `normalizeVisibleText(segText: string) → string` — reduces text to reader-visible content so equivalent content compares equal regardless of marker SYNTAX. Must be **loop-until-stable** (nested markers like `[[i:e[[sub:g]]]]`) and cover EVERY modernization: legacy `{{i}}X{{/i}}`↔bracket `[[i:X]]`/`[[sub:X]]`/`[[sup:X]]`, labeled `[[xref|docref|link:text|id]]` → **the visible label (text BEFORE the pipe)**, unlabeled `[[xref|docref:id]]`/`[#id]` → `''`, opaque `[[MATH|MEDIA|TABLE:N]]` → `''`, markdown `[text](url)`/`[text](doc:m…)` → `text`, and legacy raw refs left as literal text `[m68674#id]`/`[#id]` → `''`. (Empirically, an under-built normalizer false-positives on ~20 benign modules and halts the run.)
- `compareModule(committed, fresh) → { ok: boolean, failures: string[] }`, **5-part** (adds equation KEY-SET): `committed`/`fresh` are `{ segIds: Set, segText: Map<id,string>, equations: Map<key,mathml>, inlineAttrs: string }`. Checks: (1) segment-id-set equality; (2) normalized same-id text equality; (3) equation shared-key value equality; (4) **equation key-set equality (added/removed keys) — a math-N key present on one side only is a `[[MATH:N]]` renumber/strip risk (the m68852 mechanism)**; (5) inline-attrs byte-equality.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test**

```javascript
// tools/__tests__/verify-reextract-equivalence.test.js
import { describe, it, expect } from 'vitest';
import { normalizeVisibleText, compareModule } from '../verify-reextract-equivalence.js';

describe('normalizeVisibleText — marker-format agnostic (every modernization pattern)', () => {
  it('legacy and bracket emphasis are equal', () => {
    expect(normalizeVisibleText('Molarity {{i}}M{{/i}} is'))
      .toBe(normalizeVisibleText('Molarity [[i:M]] is'));
  });
  it('plain text and newly-captured sub/sup are equal (re-extract captures inline math)', () => {
    // March left "me"/"Ei" as plain text; July captures m[[sub:e]]/E[[sub:i]] → must normalize equal
    expect(normalizeVisibleText('ratio (e/me)')).toBe(normalizeVisibleText('ratio (e/m[[sub:e]])'));
    expect(normalizeVisibleText('Ei and Ef')).toBe(normalizeVisibleText('E[[sub:i]] and E[[sub:f]]'));
  });
  it('handles NESTED bracket markers (loop-until-stable)', () => {
    // m68844: "eg orbitals" → "[[i:e[[sub:g]]]] orbitals"
    expect(normalizeVisibleText('eg orbitals')).toBe(normalizeVisibleText('[[i:e[[sub:g]]]] orbitals'));
  });
  it('labeled xref/docref/link keep the VISIBLE label (before pipe), not the id', () => {
    // regression guard for the before-vs-after-pipe capture bug
    expect(normalizeVisibleText('see [[xref:Figure 5.2|CNX_X]] now')).toBe('see Figure 5.2 now');
    expect(normalizeVisibleText('in [[docref:Appendix B|m68860]]')).toBe('in Appendix B');
    expect(normalizeVisibleText('watch [[link:video|http://x/y]] clip')).toBe('watch video clip');
  });
  it('markdown [text](url) / [text](doc:m…) and its bracket form are equal', () => {
    expect(normalizeVisibleText('see [Appendix B](doc:m68860)'))
      .toBe(normalizeVisibleText('see [[docref:Appendix B|m68860]]'));
  });
  it('legacy raw refs left as visible text normalize to nothing (re-extract fixes them)', () => {
    // m68690: March shipped literal "[m68674#fs-id…]" text; July converts to an invisible docref
    expect(normalizeVisibleText('From [m68674#fs-idm45639696], density is'))
      .toBe(normalizeVisibleText('From [[docref:m68674#fs-idm45639696]], density is'));
  });
  it('unlabeled xref has no visible text', () => {
    expect(normalizeVisibleText('see [#CNX_X] here')).toBe(normalizeVisibleText('see [[xref:CNX_X]] here'));
  });
  it('flags a REAL visible-text change (math capture drops literal notation — the m68852 class)', () => {
    expect(normalizeVisibleText('positron (+10β)'))
      .not.toBe(normalizeVisibleText('positron ([[MATH:51]])'));
  });
});

describe('compareModule — 5-part equivalence (adds equation key-set)', () => {
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
  it('fails on equation key ADDED (math newly captured → [[MATH:N]] renumber risk)', () => {
    const fresh = { ...base, equations: new Map([['math-1', '<mi>k</mi>'], ['math-2', '<mi>q</mi>']]) };
    const r = compareModule(base, fresh);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /equation.*key/i.test(f))).toBe(true);
  });
  it('fails on equation key REMOVED', () => {
    const fresh = { ...base, equations: new Map() };
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

// Reduce text to reader-visible content so equivalent content compares equal
// regardless of marker SYNTAX (re-extract modernizes {{i}} to [[i:]], captures
// sub/sup that March left as plain text, promotes raw refs to docrefs, etc.).
// LOOP-UNTIL-STABLE so nested markers (e.g. [[i:e[[sub:g]]]]) fully unwrap.
// Verified 2026-07-07 over all 149 modules: residual is exactly {m68819, m68852}
// (the two real math-capture changes). An under-built version false-positives on
// ~20 benign modules (sub/sup capture, docref labels, raw refs) and halts the run.
export function normalizeVisibleText(s) {
  let prev, t = s ?? '';
  do {
    prev = t;
    t = t
      .replace(/\{\{\/?[a-z]+\}\}/g, '')                       // legacy paired {{i}}X{{/i}} -> strip delimiters
      .replace(/\[\[[a-z]+:([^\[\]|]*)\|[^\[\]]*\]\]/g, '$1')  // labeled [[link|xref|docref:TEXT|id]] -> TEXT (BEFORE pipe)
      .replace(/\[\[(?:xref|docref):[^\[\]]*\]\]/g, '')        // unlabeled [[xref|docref:id]] -> '' (no visible text)
      .replace(/\[\[(?:MATH|MEDIA|TABLE):\d+\]\]/gi, '')       // opaque placeholders -> ''
      .replace(/\[\[[a-z]+:([^\[\]]*)\]\]/g, '$1')             // bracket inline [[i:X]] [[sub:X]] ... -> X (innermost)
      .replace(/\[([^\[\]]*)\]\([^)]*\)/g, '$1')               // markdown [text](url) / [text](doc:m123) -> text
      .replace(/\[(?:m\d+)?#[^\[\]]*\]/g, '');                 // legacy raw ref [m68674#id] / [#id] -> ''
  } while (t !== prev);
  return t.replace(/\s+/g, ' ').trim();
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
  // equations: shared-key value drift AND key-set (added/removed) -- an added or
  // removed math-N key renumbers the [[MATH:N]] placeholders the existing IS
  // translations carry (the m68852 mechanism). Independent math-capture detector.
  for (const [k, v] of committed.equations) {
    if (fresh.equations.has(k)) {
      if (fresh.equations.get(k) !== v) failures.push(`equations shared-key MathML changed: ${k}`);
    } else {
      failures.push(`equation key removed: ${k}`);
    }
  }
  for (const k of fresh.equations.keys()) {
    if (!committed.equations.has(k)) failures.push(`equation key added: ${k}`);
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
  const known = new Set(['m68819', 'm68852']); // the ONLY two real content changes (math-capture); verified whole-book 2026-07-07
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
git commit -m "feat(tools): re-extract equivalence preflight (5-part, marker-agnostic) [STALE-STRUCT]

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
Expected: exit 0; output shows only `WAIVED m68819/m68852` lines (the two known math-capture exceptions) and `0 FAIL`. **If any `FAIL` line appears, STOP** — a module drifted beyond the known exceptions; investigate before proceeding (do NOT reflexively add it to `known` — a new drift is either a normalizer gap to close or a real content change to triage). Per the whole-book calibration (Global Constraints), the ~20 benign-modernization modules must show neither WAIVED nor FAIL — if they do, the normalizer is under-built.

- [ ] **Step 5: Commit the re-extract**

> **Diff-noise note:** `cnxml-extract.js` stamps `extractedAt: new Date().toISOString()` into every
> `structure.json`, so **all 143 structure.json files show a diff even where only the timestamp
> changed** (the 15 already-current modules included). This is invisible to the preflight (it never
> compares `structure.json`) and harmless — just don't read the structure.json line-count in
> `git diff --stat` as a proxy for "how much changed", and exclude the `extractedAt` line from any
> prose-diff review.

```bash
git add books/efnafraedi-2e/02-structure books/efnafraedi-2e/02-for-mt
git commit -m "content(efnafraedi-2e): re-extract 143 re-MT-free modules (delivers F1/OC-A/B/E/OC-E to structure.json) [STALE-STRUCT]

Preflight: equivalence gate green (segment-id-set + normalized EN text + equations
shared-key + equation key-set + inline-attrs), 2 known math-capture exceptions waived (m68819/852).
6 re-MT modules (m68764/770/789/791/793/829) excluded → B4.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix the m68852 glossary-annotation garble (+ verify m68819)

**Files:**
- Modify (primary — code fix): `tools/cnxml-inject.js` (`annotateInlineTerms` signature + line ~832 F6 strip) + `tools/__tests__/*` unit test
- Fallback only: the single m68852 faithful/mt segment (targeted content fix)

**Decision (settled — do the code fix; content fix is the escape hatch, not a coin-flip):**
The garble is **one line**. `annotateInlineTerms` (cnxml-inject.js:782) already converts
`[[sub:]]`/`[[sup:]]`/`[[i:]]`/`[[b:]]` to their inner text (lines ~826–829 — which is why i/sub/sup
terms like m68733 render fine). Only **line ~832** — `.replace(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g, '')`
— drops `[[MATH:N]]` to *empty*, so m68852's `positron (+10β or +10e)` (β/e captured as MATH) →
`positron ( or )` → `positron or`. Fix = substitute the math's visible notation instead of dropping.
Injection already resolves `[[MATH:N]]` via `equations['math-N'].mathml` (line ~1164), and
`equations` is **in scope at the annotate call site (line ~3923)** — so threading it in is a clean
3rd-param add, not a refactor. Take the content-fix fallback **only if** that plumbing proves
genuinely entangled; if you do, back up (`.bak`), correct the m68852 segment, and log the code
root-cause to the register (B4). Record which path you took in the commit message.

**Interfaces:** consumes the re-extracted structure (Task 2) and `equations['math-N'].mathml`.

- [ ] **Step 1: Reproduce — re-inject m68852 and confirm the garble**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 21 --module m68852 >/dev/null 2>&1
grep -o '(e\. positron[^)]*)' books/efnafraedi-2e/03-translated/mt-preview/ch21/m68852.cnxml
```
Expected: shows `(e. positron  or)` (the garble — math notation stripped from the annotation).

- [ ] **Step 2: Code fix — substitute MATH notation instead of dropping it (TDD)**

1. **Thread `equations` into `annotateInlineTerms`.** Change the signature to
   `annotateInlineTerms(isSegments, enSegments, equations = {})` and pass `equations` at the call
   site (~line 3923: `annotateInlineTerms(segments, enSegments, equations)` — `equations` is already
   in scope there, used by the `[[MATH:N]]` restore at ~1164). Also update the module export/any
   other caller for the new arity (default `{}` keeps them safe).
2. **Replace the line ~832 drop with a resolve-or-empty substitution.** Before the catch-all strip,
   resolve `[[MATH:N]]` to readable text from the equations map — strip MathML tags to visible
   characters, so the annotation shows the notation rather than nothing:
   ```javascript
   .replace(/\[\[MATH:(\d+)\]\]/g, (m, n) => {
     const eq = equations[`math-${n}`];
     if (!eq || !eq.mathml) return '';                 // unresolved → drop (old behaviour, rare)
     return eq.mathml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); // MathML → visible text
   })
   .replace(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g, '')        // F6: still drop MEDIA / any OTHER placeholder
   ```
   Leave lines ~826–829 (`sub`/`sup`/`i`/`b` → inner text) UNTOUCHED — they already render correctly.
3. **Write the failing test first** (`tools/__tests__/…`): `annotateInlineTerms` on an EN term
   `positron ([[MATH:1]] or [[MATH:2]])` with `equations = { 'math-1': { mathml: '<mn>+1</mn><mn>0</mn>β' }, 'math-2': {…} }`
   yields an annotation that is non-empty, contains the notation characters, and has **no** leftover
   `[[MATH:` and no stray `( or )`. Run red → implement → green.

- [ ] **Step 3: Confirm on the real module (+ fallback trigger)**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 21 --module m68852 >/dev/null 2>&1
grep -o '(e\. positron[^)]*)' books/efnafraedi-2e/03-translated/mt-preview/ch21/m68852.cnxml
```
Expected: reads with the notation present (e.g. `(e. positron …)`), NOT `(e. positron  or)`.

**Fallback (only if threading `equations` proves genuinely entangled — not a default):** revert the
code change, back up (`.bak`) and correct the m68852 segment's annotation directly, re-inject,
confirm Step 3 clean, and **log the `annotateInlineTerms` math-strip root-cause to the register (B4)**
so it's fixed properly later. Note in the commit which path you took.

- [ ] **Step 4: Verify m68819 is the benign improvement**

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 16 --module m68819 >/dev/null 2>&1
grep -o '(e\. standard free energy[^)]*)' books/efnafraedi-2e/03-translated/mt-preview/ch16/m68819.cnxml
```
Expected: reads cleanly (the mangled `(δgf°)` no longer present). Accept.

- [ ] **Step 5: Commit the fix**

```bash
git add -A books/efnafraedi-2e tools/cnxml-inject.js tools/__tests__ 2>/dev/null
git commit -m "fix(inject): annotateInlineTerms substitutes MATH notation instead of dropping it [STALE-STRUCT]

annotateInlineTerms threaded 'equations'; line ~832 resolves [[MATH:N]] to visible
notation (MathML stripped to text) rather than deleting it, fixing the m68852
glossary garble 'positron  or'. sub/sup/i/b handling unchanged. Unit test added.

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
Expected: the bulk of the diff is element repositioning (reorders). **Beyond reorders, the delivery legitimately also ships benign marker-modernizations** the re-extract introduces — this is NOT "order-only" (correct the scope framing accordingly): newly-captured inline sub/sup (e.g. `me`→`m<sub>e</sub>`, `Ei`→`E<sub>i</sub>`), emphasis format changes, and raw-ref cleanups where March rendered a literal `[m68674#…]` in the text and July resolves it to a proper link (m68690). These are improvements, expected on the ~20 modules the preflight flagged as benign (Global Constraints calibration). The only *content-affecting* changes are the m68819/m68852 glossary lines. Spot-review 3–4 modules' diffs to confirm: reorders + benign marker modernization, **no reworded prose**.

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

- [ ] **Step 1: Confirm the order check is now clean except the 6 — and STOP if it isn't**

Run: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e 2>&1 | grep 'ORDER \[warn-only\]'`
Expected: **exactly the 6 re-MT modules** `{m68764, m68770, m68789, m68791, m68793, m68829}`, no others.

**Residual handling (fail-loud — do NOT paper over it).** The audit projects "near-0", not a
guaranteed 6: some order flags could be injection-side rather than extraction-side, so re-extract
might not clear them. If the list contains **any module that is NOT one of the 6 re-MT**, that is a
residual scramble the re-extract did not fix — **STOP and root-cause it** (compare source vs
`03-translated` element order; is it a nested-para/list injection limitation, a still-stale
structure, or a genuine new bug?). **Never add a non-re-MT module to the order allowlist to make
the gate pass** — the allowlist is *exclusively* the 6 re-MT modules pending B4 (Step 4 asserts
this). Fix the root cause or, if it is a known-accepted injection limitation, log it to the register
and get explicit sign-off before proceeding. Conversely, if a module in the 6 does **not** flag,
that is also unexpected (it should still be structurally stale) — investigate before allowlisting it.

- [ ] **Step 2: Write the failing test**

```javascript
// tools/__tests__/cnxml-fidelity-order-gate.test.js
import { describe, it, expect } from 'vitest';
import { orderFingerprint, isOrderAllowlisted, assertOrderAllowlistScope } from '../cnxml-fidelity-check.js';

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
  it('rejects any allowlist entry that is not one of the 6 re-MT modules (I1 escape-hatch guard)', () => {
    expect(() => assertOrderAllowlistScope({ m68793: { fingerprint: 'x' } })).not.toThrow();
    expect(() => assertOrderAllowlistScope({ m68702: { fingerprint: 'x' } })).toThrow(/stray/);
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
  return createHash('sha1').update([...moved].sort().join('\u0000')).digest('hex').slice(0, 16);
}
export function isOrderAllowlisted(moduleId, moved, allow) {
  const e = allow[moduleId];
  return !!e && e.fingerprint === orderFingerprint(moved);
}

// The order allowlist is EXCLUSIVELY the 6 re-MT modules pending B4. Fail loud if
// anyone ever adds another module to make the gate pass (the I1 escape-hatch guard).
const ORDER_ALLOWLIST_SCOPE = new Set(['m68764', 'm68770', 'm68789', 'm68791', 'm68793', 'm68829']);
export function assertOrderAllowlistScope(allow) {
  const stray = Object.keys(allow).filter((m) => !ORDER_ALLOWLIST_SCOPE.has(m));
  if (stray.length) throw new Error(`order-allowlist may only contain the 6 re-MT modules; stray: ${stray.join(', ')}`);
}
```
Load `books/efnafraedi-2e/order-allowlist.json` at book scope and call `assertOrderAllowlistScope(allow)` immediately (a non-re-MT entry is a hard boot error, never a silent waive). In the order-check loop, a module with `!order.ok` that **is** allowlisted → warn (does not affect exit); one that is **not** allowlisted → **push to a hard-fail list** and set exit non-zero. Update the summary line to distinguish `allowlisted (B4)` from `HARD-FAIL`.

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
- **Preflight empirically calibrated (2026-07-07):** the equivalence gate (Task 1) was validated against a whole-book re-extract dry-run, not just designed. `normalizeVisibleText` is loop-until-stable and covers every observed modernization (sub/sup capture, labeled-ref visible-label, markdown/doc links, legacy raw refs); `compareModule` is 5-part (D2.3's added/removed equation key-set is now implemented, not just "shared-key"). Result: normalized-text drift and equation-key-set drift each independently reduce to exactly `{m68819, m68852}`, the two known math-capture cases — so the exception list is derived, not assumed. `m68692` was dropped from `known` (its earlier "drift" was the labeled-docref capture bug, now fixed).
- **Placeholder scan:** the only open decision is Task 3's code-fix-vs-content-fix, which is explicitly a decide-at-implementation branch with both paths specified — not a placeholder. PR body text in Task 7 Step 3 is a fill-at-time summary (acceptable).
- **Type/name consistency:** `normalizeVisibleText`/`compareModule`/`verifyBook` (Task 1) used consistently; `orderFingerprint`/`isOrderAllowlisted`/`assertOrderAllowlistScope` (Task 6) consistent; module-list file `/tmp/reextract-modules.txt` and 6-exclusion set consistent across tasks; `order-allowlist.json` shape consistent between Task 6 Steps 2/4/5.
