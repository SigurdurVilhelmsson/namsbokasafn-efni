# Terminology Unicode Word-Boundary Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop false "missing-term" warnings for Icelandic terms whose form starts/ends with a special letter (þ æ ö ó á í ú ð), by replacing ASCII `\b` with Unicode-aware word boundaries in terminology matching.

**Architecture:** A shared `wholeWordRegex(forms)` helper builds a case-insensitive, Unicode-aware whole-word regex using `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])` lookarounds + the `u` flag. The IS-side inflection matcher (the bug) and the EN-side headword matcher both use it.

**Tech Stack:** Node.js, better-sqlite3, Vitest (in-memory DB via `_setTestDb`).

**Design:** [`2026-06-23-terminology-unicode-wordboundary-design.md`](2026-06-23-terminology-unicode-wordboundary-design.md)

## Global Constraints

- Change confined to `server/services/terminologyService.js` (one helper + two regex sites) and its test file. No schema/route/UI change; no new dependencies.
- The `u` flag is mandatory for `\p{L}`/`\p{N}`. Forms pass through the existing `escapeRegex` (valid under `u`).
- Boundary must reject substrings: a term `mól` must not match inside `mólekúl`.
- Branch: `fix/terminology-unicode-wordboundary` (already created off `main`, holds the design doc).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `server/services/terminologyService.js` | Add `wholeWordRegex`; use it in `buildInflectionRegex` (:1420) and the EN headword regex (:1040). | Modify |
| `server/__tests__/terminologyService.test.js` | Add a `findTermsInSegments() — Unicode word boundary` describe block. | Modify (append after the existing `findTermsInSegments()` blocks) |

Single task.

---

## Task 1: Unicode-aware whole-word matching

**Files:**
- Modify: `server/services/terminologyService.js` (`buildInflectionRegex` ~:1415–1421; EN headword regex ~:1040; new helper)
- Test: `server/__tests__/terminologyService.test.js`

**Interfaces:**
- Consumes: `escapeRegex` (existing).
- Produces: `wholeWordRegex(forms: string[]): RegExp` (internal); behavior change in `findTermsInSegments` matching (IS-side no longer false-negative on Icelandic-initial/final terms; EN-side unchanged for ASCII).

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/terminologyService.test.js`, after the existing `findTermsInSegments()` describe block(s):

```js
// =====================
// findTermsInSegments() — Unicode word boundary (Icelandic special letters)
// =====================
describe('findTermsInSegments() — Unicode word boundary', () => {
  const seg = (enContent, isContent) => [{ segmentId: 's', enContent, isContent }];

  it('no missing-term issue when an Icelandic-initial term is present, capitalized', () => {
    // "þungi" starts with þ → ASCII \b fails; the term IS present (sentence start)
    insertFullTerm({ english: 'mass', icelandic: 'þungi', status: 'approved' });
    const result = terminologyService.findTermsInSegments(
      seg('The mass of the object', 'Þungi hlutarins er mikill')
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.issues).toHaveLength(0);
  });

  it('no missing-term issue when an Icelandic-initial term is present, lowercase', () => {
    insertFullTerm({ english: 'mass', icelandic: 'þungi', status: 'approved' });
    const result = terminologyService.findTermsInSegments(
      seg('a small mass here', 'það er lítill þungi hér')
    );
    expect(result.s.issues).toHaveLength(0);
  });

  it('handles other Icelandic-initial forms (öl, ólífa)', () => {
    insertFullTerm({ english: 'ale', icelandic: 'öl', status: 'approved' });
    const result = terminologyService.findTermsInSegments(seg('good ale', 'Öl er gott'));
    expect(result.s.issues).toHaveLength(0);
  });

  it('still flags a genuinely absent term (no substring false-positive)', () => {
    // term "mól" present only inside "mólekúl" → should still be reported missing
    insertFullTerm({ english: 'mole', icelandic: 'mól', status: 'approved' });
    const result = terminologyService.findTermsInSegments(
      seg('one mole', 'ein mólekúl hér') // no standalone "mól"
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.issues).toHaveLength(1);
    expect(result.s.issues[0].type).toBe('missing');
  });

  it('ASCII term still matches case-insensitively (regression guard)', () => {
    insertFullTerm({ english: 'acid', icelandic: 'sýra', status: 'approved' });
    const result = terminologyService.findTermsInSegments(seg('an acid', 'Sýra og basi'));
    expect(result.s.issues).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail (for the right reasons)**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "Unicode word boundary"`
Expected: FAIL on the Icelandic-initial cases — "no missing-term issue when … capitalized" and "… lowercase" and "öl, ólífa" report a missing-term issue (length 1) because `\bþungi\b`/`\böl\b` don't match. The substring guard and ASCII regression tests should already PASS.

- [ ] **Step 3: Add the `wholeWordRegex` helper**

In `server/services/terminologyService.js`, add the helper next to `escapeRegex` (~:1423):

```js
/**
 * Build a case-insensitive, Unicode-aware whole-word regex matching any of the
 * given forms. Uses \p{L}/\p{N} lookarounds instead of \b so Icelandic special
 * letters (þ æ ö ó á í ú ð) form proper word boundaries. Longest form first to
 * avoid partial matches. Returns a never-matching regex for an empty list.
 */
function wholeWordRegex(forms) {
  const alts = forms.filter(Boolean).map(escapeRegex);
  if (alts.length === 0) return /(?!)/;
  alts.sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alts.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}
```

- [ ] **Step 4: Use it in `buildInflectionRegex` (IS-side — the bug)**

Replace the body of `buildInflectionRegex` (~:1415–1421):

```js
function buildInflectionRegex(icelandic, inflections) {
  return wholeWordRegex([icelandic, ...inflections]);
}
```

(The empty-list guard and longest-first sort now live in `wholeWordRegex`.)

- [ ] **Step 5: Use it in the EN-side headword regex**

In `findTermsInSegments`, change the headword regex (~:1040):

```js
        regex: new RegExp(`\\b${escapeRegex(row.english)}\\b`, 'gi'),
```
to:
```js
        regex: wholeWordRegex([row.english]),
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "Unicode word boundary"`
Expected: PASS (all 5).

- [ ] **Step 7: Run the full terminology test file (no regression)**

Run: `npx vitest run server/__tests__/terminologyService.test.js`
Expected: PASS. Pay attention to the existing `findTermsInSegments()` cases (e.g. "longer term takes priority over shorter substring", "matches inflected forms") — they exercise the same matchers and must stay green.

- [ ] **Step 8: Run the full unit suite + lint**

Run: `npm test`
Expected: all green.
Run: `npx eslint server/services/terminologyService.js server/__tests__/terminologyService.test.js`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "fix(terminology): Unicode-aware word boundaries for Icelandic term matching"
```

---

## Self-review notes (coverage vs. spec)

- Spec "IS-side bug fix" → Step 4 (`buildInflectionRegex` → `wholeWordRegex`). ✅
- Spec "EN-side consistency/DRY" → Step 5. ✅
- Spec "shared helper, \p{L}/\p{N} lookarounds + u flag" → Step 3. ✅
- Spec "boundary rejects substrings (mól ≠ mólekúl)" → Step 1 test 4. ✅
- Spec "ASCII regression guard" → Step 1 test 5. ✅
- Spec "client EN highlighter unchanged; no schema/route/UI/dep change" → only terminologyService + its test touched. ✅
