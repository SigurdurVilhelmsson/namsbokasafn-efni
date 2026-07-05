# WS4 Fable-5 fix wave — 5 correctness bugs in PR #233 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Fix the 5 correctness bugs the Fable-5 review found in PR #233 (report: `docs/audit/2026-07-05-fable5-ws4-substitution-f8-review.md`), all on the same branch before merge.

**Architecture:** All 5 fixes are localized to the code this PR built. Three are in the resolver/matcher (`math-label-substitute.js` + one `math-label-inventory.js` validator), one restructures the inject report seam, one normalizes F8's comparison.

**Tech Stack:** Node.js 22 ESM, Vitest.

## Global Constraints
- Vanilla JS ESM. `npm test` from repo root is the authoritative gate.
- **No content bytes committed** — smoke-tests that write `books/03-translated/` must `git checkout` after.
- The 5 fixes must not regress the existing Task-1/2/3 tests; update those only where a fix deliberately changes behavior.
- Design decisions (locked): **#1 case** = overlay tries exact key then lowercase key *only for `/^[A-Za-z]{3,}$/` word tokens*; glossary lookup uses the lowercased label; emit the map value verbatim. **#2 F8** = decode entities on BOTH sides before comparing (not a DOM round-trip).

---

### Task FT1: Resolver hardening — #1 case, #4 whitespace, #5 entity-decode

**Files:**
- Modify: `tools/lib/math-label-substitute.js` (`resolveLabel`, `substituteMathLabels`, add `decodeEntities` import)
- Modify: `tools/lib/math-label-inventory.js` (`validateValue` — whitespace-only → hard)
- Test: `tools/__tests__/math-label-substitute.test.js` (extend), `tools/__tests__/math-label-inventory.test.js` (extend)

**Interfaces:** signatures unchanged (`resolveLabel(label,{overlay,glossaryMap})`, `substituteMathLabels(mathml,resolve)`, `validateValue(value,{enforceLength})`).

- [ ] **Step 1: Write failing tests** in `math-label-substitute.test.js`:

```javascript
describe('resolveLabel — case + whitespace hardening', () => {
  const glossaryMap = new Map([['acid', 'sýra']]);
  it('#1 capitalized word falls back to the lowercase overlay key', () => {
    expect(resolveLabel('Rate', { overlay: { rate: 'hraði' }, glossaryMap }))
      .toEqual({ value: 'hraði', source: 'overlay-translated' });
  });
  it('#1 capitalized word falls back to the lowercased glossary key', () => {
    expect(resolveLabel('Acid', { overlay: {}, glossaryMap }))
      .toEqual({ value: 'sýra', source: 'glossary' });
  });
  it('#1 exact-case overlay key still wins over the lowercase fallback', () => {
    expect(resolveLabel('Rate', { overlay: { Rate: 'Hraði', rate: 'hraði' }, glossaryMap: new Map() }))
      .toEqual({ value: 'Hraði', source: 'overlay-translated' });
  });
  it('#1 a formula / short / mixed token is NOT case-folded', () => {
    // "NaCl" lowercases to "nacl" which is not a key → stays english (no false hit)
    expect(resolveLabel('NaCl', { overlay: { nacl: 'x' }, glossaryMap: new Map() }))
      .toEqual({ value: 'NaCl', source: 'english' });
  });
  it('#4 whitespace-only overlay value is pending (falls through), not a translation', () => {
    expect(resolveLabel('vap', { overlay: { vap: ' ' }, glossaryMap: new Map() }))
      .toEqual({ value: 'vap', source: 'english' });
  });
  it('#4 value equal to the key after trimming is a self-map', () => {
    expect(resolveLabel('amu', { overlay: { amu: 'amu ' }, glossaryMap: new Map() }))
      .toEqual({ value: 'amu', source: 'overlay-self' });
  });
  it('#4 a trailing space on a real translation is trimmed off the emitted value', () => {
    expect(resolveLabel('rate', { overlay: { rate: 'hraði ' }, glossaryMap: new Map() }))
      .toEqual({ value: 'hraði', source: 'overlay-translated' });
  });
});

describe('substituteMathLabels — entity-decoded matching (#5)', () => {
  const resolve = buildResolver({ overlay: { all: 'allur' }, glossaryMap: new Map() });
  it('matches a label whose node carries a trailing entity-encoded NBSP, preserving the entity', () => {
    expect(substituteMathLabels('<m:mtext>all&#x00A0;</m:mtext>', resolve))
      .toBe('<m:mtext>allur&#x00A0;</m:mtext>');
  });
  it('#4 whitespace-only overlay never blanks a label (pending → unchanged)', () => {
    const r = buildResolver({ overlay: { rate: ' ' }, glossaryMap: new Map() });
    expect(substituteMathLabels('<m:mtext>rate</m:mtext>', r)).toBe('<m:mtext>rate</m:mtext>');
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tools/__tests__/math-label-substitute.test.js`

- [ ] **Step 3: Update the import** at the top of `tools/lib/math-label-substitute.js`:

```javascript
import { collectMathTokens, bucketToken, decodeEntities } from './math-label-inventory.js';
```

- [ ] **Step 4: Replace `resolveLabel`** with:

```javascript
export function resolveLabel(label, { overlay = {}, glossaryMap = new Map() } = {}) {
  // #1: pure alphabetic words (>=3 chars) fall back to their lowercase form so a
  // capitalized occurrence (Rate/Acid/Base) resolves like the lowercase key, while
  // formulae / element symbols (digits, mixed case, <3 chars) are never case-folded.
  const isWord = /^[A-Za-z]{3,}$/.test(label);
  const lower = label.toLowerCase();

  // overlay: exact key first (honors hand-added exact-case keys), then lowercase for words.
  let ovRaw = overlay[label];
  if (!(typeof ovRaw === 'string' && ovRaw.trim().length > 0) && isWord && lower !== label) {
    ovRaw = overlay[lower];
  }
  if (typeof ovRaw === 'string' && ovRaw.trim().length > 0) {
    // #4: trim before judging — a value equal to the label (or its lowercase) after
    // trimming is a self-map (renders English); otherwise the trimmed value is emitted
    // (a stray leading/trailing space never reaches the output).
    const v = ovRaw.trim();
    if (v === label || v === lower) return { value: label, source: 'overlay-self' };
    return { value: v, source: 'overlay-translated' };
  }
  // glossary keys are lowercased in buildGlossaryMap; look up the lowercase form for words.
  const g = glossaryMap.get(isWord ? lower : label);
  if (typeof g === 'string' && g.trim()) return { value: g, source: 'glossary' };
  return { value: label, source: 'english' };
}
```

- [ ] **Step 5: Replace `substituteMathLabels`** with (matches on decoded text, replaces the decoded core in the raw inner):

```javascript
export function substituteMathLabels(mathml, resolve) {
  if (typeof mathml !== 'string') return mathml;
  return mathml.replace(LEAF_MATH_TOKEN, (full, open, inner, close) => {
    // #5: match on the DECODED, trimmed text so a token the inventory recorded
    // (collectMathTokens uses DOM textContent, which decodes entities) is found here
    // too. Replace the literal decoded core in the raw inner, preserving other bytes
    // (e.g. a trailing entity-encoded NBSP).
    const key = decodeEntities(inner).trim();
    if (!key) return full;
    const { value, source } = resolve(key);
    if (source !== 'english' && FORBIDDEN_XML.test(value)) {
      throw new Error(
        `math-label substitution: value "${value}" for "${key}" contains a forbidden XML character`
      );
    }
    if (value === key) return full;
    return open + inner.replace(key, value) + close;
  });
}
```

- [ ] **Step 6: Harden `validateValue`** (#4 tripwire) in `tools/lib/math-label-inventory.js` — add a whitespace-only hard error before the charset check:

```javascript
export function validateValue(value, { enforceLength = true } = {}) {
  const warnings = [];
  if (typeof value !== 'string' || value.length === 0) return { hard: null, warnings };
  if (value.trim().length === 0) {
    return {
      hard: 'whitespace-only (would delete the label — leave blank for pending instead)',
      warnings,
    };
  }
  const hard = /[<>&"']/.test(value)
    ? 'contains a forbidden XML character (one of < > & " \')'
    : null;
  if (/\s/.test(value)) warnings.push('multi-word (contains whitespace)');
  if (enforceLength) {
    const cp = [...value].length;
    if (cp > 6) warnings.push(`${cp} chars > 6 (long for a subscript)`);
  }
  return { hard, warnings };
}
```

- [ ] **Step 7: Add a validateValue test** in `math-label-inventory.test.js`:

```javascript
it('flags a whitespace-only value as a hard error (would delete the label)', () => {
  expect(validateValue(' ').hard).toMatch(/whitespace-only/);
});
it('still treats a multi-word value as advisory, not hard', () => {
  expect(validateValue('fast efni').hard).toBeNull();
});
```

- [ ] **Step 8: Run both test files — expect PASS.**
`npx vitest run tools/__tests__/math-label-substitute.test.js tools/__tests__/math-label-inventory.test.js`

- [ ] **Step 9: Confirm the live overlay still validates clean** (regression on real data):
`node tools/inventory-math-labels.js --book efnafraedi-2e --validate; echo "exit=$?"` → expect `exit=0` (the committed map has no whitespace-only values).

- [ ] **Step 10: Commit** `git add tools/lib/math-label-substitute.js tools/lib/math-label-inventory.js tools/__tests__/math-label-substitute.test.js tools/__tests__/math-label-inventory.test.js` with message `fix(ws4): resolver hardening — case-fold #1, whitespace-pending #4, entity-decode match #5 [WS4]` + the Co-Authored-By trailer.

---

### Task FT2: Unmapped-label report covers the originalCnxml seam (#3)

**Files:**
- Modify: `tools/cnxml-inject.js` (move `reportMathLabels` from the equations-object join to the raw `originalCnxml`, pre-substitution, in `loadModuleInputs`)
- Test: `tools/__tests__/cnxml-inject-math-labels.test.js` (extend) or a small integration test

**Interfaces:** none new.

- [ ] **Step 1: Read the current wiring** in `loadModuleInputs` (`tools/cnxml-inject.js`): the resolver + `reportMathLabels(Object.values(equations)…)` block at ~line 3528-3548, and the `originalCnxml` read + `substituteMathLabels` at ~line 3571-3577.

- [ ] **Step 2: Restructure.** (a) At the equations seam, KEEP the resolver destructure (`const { resolve: resolveMathLabel, overlay: mathLabelOverlay } = getMathLabelResolver(BOOKS_DIR);`) and `applyMathLabelSubstitution(equations, resolveMathLabel);`, but DELETE the `reportMathLabels(...)` call and its two warning-emitting blocks (they move). (b) At the `originalCnxml` read, run the report on the RAW source (it contains all math — inline, standalone `<equation>`, note/example/exercise), BEFORE substituting:

```javascript
  // WS4 #3: report unmapped labels + subscript advisories on the RAW source, which
  // contains ALL math (inline, standalone <equation>, note/example/exercise) — the
  // equations object misses the second-seam classes. Must run pre-substitution so
  // Icelandic fills don't pollute token collection.
  const rawOriginalCnxml = fs.readFileSync(originalPath, 'utf-8');
  const mathLabelReport = reportMathLabels(rawOriginalCnxml, resolveMathLabel, {
    overlay: mathLabelOverlay,
  });
  if (mathLabelReport.unmapped.length) {
    console.error(
      `  ⚠ ${moduleId}: ${mathLabelReport.unmapped.length} unmapped math label(s): ${mathLabelReport.unmapped.join(', ')}`
    );
  }
  for (const a of mathLabelReport.longSubscriptFills) {
    console.error(
      `  ⚠ ${moduleId}: glossary term "${a.value}" is ${a.cp} chars in a subscript (label "${a.token}") — consider a compact overlay override`
    );
  }
  const originalCnxml = substituteMathLabels(rawOriginalCnxml, resolveMathLabel);
```

Ensure `mathLabelOverlay` remains in scope (it is destructured at the equations seam earlier in the same function). Remove the now-unused equations-join report.

- [ ] **Step 3: Add a regression test** proving the report now sees note/standalone-equation math. Prefer extending the existing temp-dir integration pattern used in `tools/__tests__/cnxml-inject-equation-seam.test.js`: build a fixture whose ONLY occurrence of an unmapped bucket-1 label (e.g. `<m:mtext>enzyme</m:mtext>`, absent from the overlay) sits inside a standalone `<equation>` or `<note>`, run inject capturing stderr, and assert the `⚠ … unmapped math label(s): enzyme` warning is emitted. Verify it FAILS against the old equations-only report and PASSES after the move (temporarily revert to confirm).

  If a stderr-capturing integration test is impractical, at minimum assert `reportMathLabels(rawSourceString, resolve, {overlay})` returns `enzyme` in `.unmapped` for a source string where `enzyme` appears only in a `<note>`/standalone-`<equation>` `<m:math>` (unit-level proof the report reads full-source math).

- [ ] **Step 4: Run** `npx vitest run tools/__tests__/cnxml-inject-math-labels.test.js tools/__tests__/cnxml-inject-equation-seam.test.js` — expect PASS.

- [ ] **Step 5: Smoke** `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 5 2>&1 >/dev/null | head` — expect no `unmapped` warnings (efnafraedi map is complete), then `git checkout books/efnafraedi-2e/03-translated/`. Confirm `git status --porcelain books/` empty.

- [ ] **Step 6: Commit** `tools/cnxml-inject.js` + test, message `fix(ws4): unmapped-label report reads raw originalCnxml, covering the second seam [WS4]`.

---

### Task FT3: F8 entity-normalized comparison (#2)

**Files:**
- Modify: `tools/cnxml-fidelity-check.js` (`compareMathBlocks` — decode entities on both sides)
- Test: `tools/__tests__/cnxml-fidelity-math-blocks.test.js` (extend)

**Interfaces:** `compareMathBlocks` signature unchanged.

- [ ] **Step 1: Write failing tests** in `cnxml-fidelity-math-blocks.test.js`:

```javascript
import { buildResolver } from '../lib/math-label-substitute.js';
const noop = buildResolver({ overlay: {}, glossaryMap: new Map() });

it('#2 treats a numeric charref vs its literal as equal (xmldom DOM-emit normalization)', () => {
  const source = '<m:math><m:mtext>&#x394;H</m:mtext></m:math>';
  const translated = '<m:math><m:mtext>ΔH</m:mtext></m:math>';
  expect(compareMathBlocks(source, translated, noop).ok).toBe(true);
});
it('#2 treats a raw > vs &gt; as equal', () => {
  const source = '<m:math><m:mo>></m:mo></m:math>';
  const translated = '<m:math><m:mo>&gt;</m:mo></m:math>';
  expect(compareMathBlocks(source, translated, noop).ok).toBe(true);
});
it('#2 still flags a genuinely corrupted block', () => {
  const source = '<m:math><m:mrow><m:mi>a</m:mi></m:mrow></m:math>';
  const translated = '<m:math><m:mi>a</m:mi></m:math>';
  expect(compareMathBlocks(source, translated, noop).ok).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** (first two mismatch under raw compare).

- [ ] **Step 3: Import `decodeEntities`** in `tools/cnxml-fidelity-check.js` (it's exported by the inventory lib):

```javascript
import { decodeEntities } from './lib/math-label-inventory.js';
```

- [ ] **Step 4: Normalize both sides in `compareMathBlocks`** — decode entities after substituting the source, and on the translated blocks, so xmldom's DOM-emit entity/`>` normalization (`&#x394;`→`Δ`, `>`→`&gt;`) doesn't produce false mismatches on correct math:

```javascript
export function compareMathBlocks(sourceCnxml, translatedCnxml, resolve) {
  // #2: the DOM builders (example/exercise/note) round-trip math through xmldom, which
  // decodes numeric charrefs and re-escapes raw '>'. substituteMathLabels leaves the
  // source raw, so decode entities on BOTH sides before comparing — otherwise F8 flags
  // correct math permanently and masks real corruption. Comparison-only normalization.
  const src = extractMathBlocks(sourceCnxml).map((b) => decodeEntities(substituteMathLabels(b, resolve)));
  const trans = extractMathBlocks(translatedCnxml).map((b) => decodeEntities(b));
  let mismatched = 0;
  const n = Math.max(src.length, trans.length);
  for (let i = 0; i < n; i++) {
    if (src[i] !== trans[i]) mismatched += 1;
  }
  return { ok: mismatched === 0, mismatched, sourceBlocks: src.length, translatedBlocks: trans.length };
}
```

- [ ] **Step 5: Run** `npx vitest run tools/__tests__/cnxml-fidelity-math-blocks.test.js tools/__tests__/cnxml-fidelity-check.test.js` — expect PASS.

- [ ] **Step 6: Smoke on the real modules the report cited** (should drop the false-positive noise): `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 12 2>&1 | grep -iE "MATH|exit"; echo "exit=$?"`. The committed `03-translated/` is stale English so label-substitution mismatches remain (expected pre-WS5), but the entity/`>` false-positives on m68786-class blocks should be gone. Exit still 0 (warn-only). No files written.

- [ ] **Step 7: Commit** `tools/cnxml-fidelity-check.js` + test, message `fix(ws4): F8 decode-entities both sides so DOM-emit normalization isn't a false mismatch [WS4]`.

---

### Task FT4: Full-suite gate + push

- [ ] **Step 1:** `npm test` from repo root — expect all green.
- [ ] **Step 2:** `git status --porcelain books/` empty.
- [ ] **Step 3:** `git push` (updates PR #233).

---

## Self-Review
- #1 case-blind → FT1 resolveLabel exact-then-lowercase + glossary lowercase; tested (capitalized overlay + glossary hit, exact-key precedence, formula-not-folded). ✓
- #4 whitespace-only → FT1 resolveLabel `ovRaw.trim().length>0` + self-map on trimmed + FT1 validateValue hard; tested (pending, self-map, trimmed value, validate hard). ✓
- #5 entity-decode → FT1 substituteMathLabels decode-for-match; tested (NBSP-trailing preserved). ✓
- #3 report seam → FT2 report on raw originalCnxml; regression test on second-seam math. ✓
- #2 F8 normalize → FT3 decode both sides; tested (charref, `>`, real-corruption still flagged). ✓
- No content bytes: FT2/FT3 smokes `git checkout`; FT4 asserts clean. ✓
- Type consistency: `resolveLabel`→`{value,source}` unchanged; `compareMathBlocks`→`{ok,mismatched,sourceBlocks,translatedBlocks}` unchanged.
