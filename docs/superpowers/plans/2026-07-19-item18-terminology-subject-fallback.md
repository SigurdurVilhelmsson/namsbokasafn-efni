# Item 18 — Terminology Subject-Fallback-on-Miss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a book's subject glossary has no hit for a headword, surface the other-subject translations as visibly-secondary fallback suggestions (never QA warnings), and label subjects in the lookup surfaces.

**Architecture:** One new pure policy function `translationTier(subjects, bookSubject)` in `server/services/terminologyService.js` classifies every translation as `'primary' | 'in-scope' | 'fallback'`. `findTermsInSegments` partitions on it instead of filtering (fallback translations attach only when in-scope is empty; the missing-term issue block never sees them). `lookupTerm` stamps `isFallback` and sorts translations best-first. The MT export (`exportBookGlossary`) is deliberately untouched. Client work is presentation only: a `cross-subject` highlight modifier, a fallback note + badge variant in the term popup, and subject badges in the quick-lookup box.

**Tech Stack:** Node 22 / Express 5 / better-sqlite3 (CommonJS server code), Vitest (ESM test files with `createRequire`), vanilla JS client (IIFE, no framework, no jsdom harness — client DOM code is pinned with static source pins per the item-16 precedent).

**Spec:** `docs/superpowers/specs/2026-07-19-item18-terminology-subject-fallback-design.md` (approved 2026-07-19). File:line references verified against main `3ea62488`; trust the pattern over the line number if they drift.

## Global Constraints

- Branch: `fix/item18-terminology-subject-fallback` off `main`. One PR. **`npm test` from the repo root is the authoritative gate** (no branch protection — never rely on CI).
- Run `nvm use` before any `npm install` (Node 22 pin; lockfile must never be generated under npm 11). This plan needs no dependency changes.
- Payload changes are **additive only**: `isFallback` booleans on matches/translations. No route signature changes; `lookupTerm(q, bookSlug)` keeps its exact signature (`termLookupBookSlug.test.js` pins the args object `{q, bookSlug}` — it must stay green untouched).
- Never use `\b` in any regex touching Icelandic text — use the existing `wholeWordRegex` lookaround pattern (already the case; don't regress it).
- Static pin tests must match **file bytes** — do not put Icelandic literals in pin regexes (campaign lesson: escaped vs raw Icelandic mismatch); pin on class names / object keys instead.
- New user-facing strings are Icelandic and live in `server/public/js/ui-strings.js` (never hardcoded English; UI terminology per `ui-terminology-convention`: the tool is "Ritill").
- Four guard tests in `server/__tests__/terminologyService.test.js` MUST remain green **unmodified**: `homograph: keeps only the in-subject sense in primary + dropdown`, `missing-term issue uses only the in-subject approved translation`, `no book subject (unmapped) → no filtering, all senses kept`, and the three allow-list arm tests (`keeps an in-subject translation` / `keeps a general-tagged translation` / `keeps an untagged translation (no subjects)`). If any of them fails, the implementation is wrong — do not edit the test.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Run all test commands from the **repo root** (`<repo>`).

## File Structure

| File | Role in this plan |
|---|---|
| `server/services/terminologyService.js` | Modify: add `translationTier` (+ export), partition in `findTermsInSegments`, stamp+sort in `lookupTerm`, comment in `exportBookGlossary` |
| `server/__tests__/terminologyService.test.js` | Modify: 1 retargeted test, ~10 new tests across 4 describe blocks |
| `server/public/js/term-highlight.js` | Modify: `cross-subject` class composition (1 line) |
| `server/__tests__/termHighlight.test.js` | Modify: 2 new tests |
| `server/public/js/segment-editor.js` | Modify: term popup fallback note + class-based subject badges; quick-lookup subject badges |
| `server/public/js/ui-strings.js` | Modify: add `termPopup.fallbackNote` string |
| `server/views/segment-editor.html` | Modify: CSS for `.term-highlight.cross-subject`, `.term-subject-badge`(+`.other`), `.term-popup-fallback-note` |
| `server/__tests__/termFallbackClientPins.test.js` | Create: static source pins for the segment-editor.js/CSS changes |
| `docs/plans/2026-07-11-pre-semester-coding-campaign.md` | Modify: append item-18 register (I18-R1..R4) |

---

### Task 1: Branch + `translationTier()` policy helper

**Files:**
- Modify: `server/services/terminologyService.js` (new function above `findTermsInSegments`, ~line 1003; new export in the `module.exports` Query group, ~line 1494)
- Test: `server/__tests__/terminologyService.test.js` (new describe block after the `lookupTerm()` describe, which ends `});` at ~line 304)

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `translationTier(subjects: string[], bookSubject: string|null) => 'primary' | 'in-scope' | 'fallback'` — exported from `terminologyService`; Tasks 2 and 3 call it by exactly this name.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --rebase && git checkout -b fix/item18-terminology-subject-fallback
```

- [ ] **Step 2: Write the failing tests**

In `server/__tests__/terminologyService.test.js`, insert after the `lookupTerm()` describe block's closing `});` (just before the `// =====================` / `// createTerm()` comment):

```js
// =====================
// translationTier() — item 18 shared scoping policy
// =====================
describe('translationTier()', () => {
  it('returns in-scope for every translation when the book has no subject', () => {
    expect(terminologyService.translationTier(['biology'], null)).toBe('in-scope');
    expect(terminologyService.translationTier([], null)).toBe('in-scope');
  });

  it('returns primary when tagged with the book subject', () => {
    expect(terminologyService.translationTier(['chemistry'], 'chemistry')).toBe('primary');
    expect(terminologyService.translationTier(['biology', 'chemistry'], 'chemistry')).toBe(
      'primary'
    );
  });

  it('returns in-scope for untagged and general-tagged translations', () => {
    expect(terminologyService.translationTier([], 'chemistry')).toBe('in-scope');
    expect(terminologyService.translationTier(['general'], 'chemistry')).toBe('in-scope');
    expect(terminologyService.translationTier(['biology', 'general'], 'chemistry')).toBe(
      'in-scope'
    );
  });

  it('returns fallback only when all tags are foreign subjects', () => {
    expect(terminologyService.translationTier(['biology'], 'chemistry')).toBe('fallback');
    expect(terminologyService.translationTier(['biology', 'physics'], 'chemistry')).toBe(
      'fallback'
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "translationTier" 2>&1 | tail -20`
Expected: 4 FAIL — `terminologyService.translationTier is not a function`

- [ ] **Step 4: Implement the helper**

In `server/services/terminologyService.js`, directly above the `findTermsInSegments` JSDoc (the comment block starting `/**\n * Find terminology matches in segments.`), insert:

```js
/**
 * Item 18 — the single subject-scoping policy for editing surfaces.
 * Classifies one translation relative to a book's primary subject:
 *   'primary'  — tagged with the book's subject (ranks first, drives isPrimary)
 *   'in-scope' — untagged or tagged 'general' (or the book has no subject
 *                mapping at all → nothing is filtered, nothing is primary)
 *   'fallback' — tagged only with other subjects; surfaces ONLY when a
 *                headword has no in-scope translation, and never produces
 *                missing-term issues.
 * exportBookGlossary deliberately does NOT use this (MT priming stays strict).
 *
 * @param {string[]} subjects
 * @param {string|null} bookSubject
 * @returns {'primary'|'in-scope'|'fallback'}
 */
function translationTier(subjects, bookSubject) {
  if (!bookSubject) return 'in-scope';
  if (subjects.includes(bookSubject)) return 'primary';
  if (subjects.length === 0 || subjects.includes('general')) return 'in-scope';
  return 'fallback';
}
```

In `module.exports`, in the `// Query` group after `findTermsInSegments,`, add:

```js
  translationTier,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "translationTier" 2>&1 | tail -5`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(item18): translationTier — shared subject-scoping policy helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `findTermsInSegments` — partition, fallback matches, issues gate

**Files:**
- Modify: `server/services/terminologyService.js` (`findTermsInSegments`, ~lines 1060-1160)
- Test: `server/__tests__/terminologyService.test.js` (the `findTermsInSegments() — subject scoping` describe ~line 866, and the `checkSegmentConsistency()` describe ~line 1013)

**Interfaces:**
- Consumes: `translationTier(subjects, bookSubject)` from Task 1.
- Produces: match objects gain `isFallback: boolean` (match level AND on every entry of `translations[]`). Fallback matches have `isPrimary: false` everywhere and NEVER contribute to `issues`. Tasks 5–6 read `m.isFallback` / `tr.isFallback` / `termInfo.isFallback` from exactly these fields.

- [ ] **Step 1: Retarget the drop-pin test and add the new failing tests**

In the `findTermsInSegments() — subject scoping` describe block, **replace** this entire test:

```js
  it('hides a headword whose only translation is another subject', () => {
    // "mole" with only a biology translation must not surface in a chemistry book
    const hw = insertHeadword({ english: 'mole' });
    const tr = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(tr, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of carbon', 'eitt mól af kolefni'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(0);
    expect(result.s.issues).toHaveLength(0);
  });
```

with (item 18 retarget — the "miss" now falls back instead of hiding):

```js
  it('surfaces a fallback match when the only translation is another subject — no issues', () => {
    // Item 18: "mole" with only a biology translation surfaces in a chemistry
    // book as a BADGED fallback suggestion (isFallback) — but never as a QA
    // issue: a chemistry editor is not warned for skipping a biology term.
    const hw = insertHeadword({ english: 'mole' });
    const tr = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(tr, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of carbon', 'eitt kolefnismagn'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].isFallback).toBe(true);
    expect(result.s.matches[0].icelandic).toBe('moldvarpa');
    expect(result.s.matches[0].isPrimary).toBe(false);
    expect(result.s.matches[0].translations[0].isFallback).toBe(true);
    // The IS text does NOT contain 'moldvarpa' — an in-scope term would issue here.
    expect(result.s.issues).toHaveLength(0);
  });
```

Then **append** these three tests inside the same describe block (before its closing `});`):

```js
  it('fallback match prefers the approved foreign translation over a proposed one', () => {
    const hw = insertHeadword({ english: 'mole' });
    // Proposed inserted FIRST so DB order alone would rank it first.
    const trProposed = insertTranslation(hw, { icelandic: 'jarðvarpa', status: 'proposed' });
    const trApproved = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(trProposed, 'biology');
    addSubject(trApproved, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of carbon', 'eitt kolefnismagn'),
      'efnafraedi-2e'
    );
    expect(result.s.matches[0].icelandic).toBe('moldvarpa');
    expect(result.s.matches[0].translations.map((t) => t.icelandic)).toEqual([
      'moldvarpa',
      'jarðvarpa',
    ]);
  });

  it('fallback with only proposed translations still surfaces, marked proposed', () => {
    const hw = insertHeadword({ english: 'mole' });
    const tr = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'proposed' });
    addSubject(tr, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of carbon', 'eitt kolefnismagn'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].isFallback).toBe(true);
    expect(result.s.matches[0].status).toBe('proposed');
    expect(result.s.issues).toHaveLength(0);
  });

  it('normal (in-scope) matches carry isFallback: false at both levels', () => {
    const hw = insertHeadword({ english: 'acid' });
    const tr = insertTranslation(hw, { icelandic: 'sýra', status: 'approved' });
    addSubject(tr, 'chemistry');

    const result = terminologyService.findTermsInSegments(
      seg('an acid reacts', 'sýra hvarfast'),
      'efnafraedi-2e'
    );
    expect(result.s.matches[0].isFallback).toBe(false);
    expect(result.s.matches[0].translations[0].isFallback).toBe(false);
  });
```

And **append** this test inside the `checkSegmentConsistency()` describe block (before its closing `});`) — it pins the save-path QA surface explicitly:

```js
  it('foreign-only term produces no issue even though it matches as fallback (item 18)', () => {
    const hw = insertHeadword({ english: 'mole' });
    const tr = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(tr, 'biology');

    const issues = terminologyService.checkSegmentConsistency(
      'one mole of carbon',
      'eitt kolefnismagn',
      'efnafraedi-2e'
    );
    expect(issues).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "fallback" 2>&1 | tail -20`
Expected: the 4 new "fallback"-named tests FAIL (matches come back empty / `isFallback` undefined); `foreign-only term produces no issue` PASSES already (current behavior also yields 0 issues — it is a pin against regression, that is fine).

- [ ] **Step 3: Implement the partition**

In `server/services/terminologyService.js`, `findTermsInSegments`: **replace** this block (the item-N comment + `subjectAllowed` + the `terms` construction):

```js
  // Item N: scope translations to the book's subject. A translation is in-scope
  // when the book has no subject mapping (→ no filtering), or it is tagged with
  // the book subject, or 'general', or it is untagged. Headwords left with no
  // in-scope translation are dropped entirely (no match, no missing-term issue).
  const subjectAllowed = (subjects) =>
    !bookSubject ||
    subjects.length === 0 ||
    subjects.includes(bookSubject) ||
    subjects.includes('general');

  const terms = Array.from(termMap.values())
    .map((term) => ({
      ...term,
      translations: term.translations.filter((t) => subjectAllowed(t.subjects)),
    }))
    .filter((term) => term.translations.length > 0);
```

with:

```js
  // Item N → item 18: scope translations to the book's subject, but never hide
  // a headword entirely. A headword with at least one in-scope translation
  // (tier 'primary'/'in-scope') behaves exactly as before — foreign-subject
  // siblings stay hidden (homograph guard). A headword whose translations are
  // ALL foreign-subject becomes a FALLBACK term: it still matches (suggestion
  // surfaces, badged via isFallback) but never produces missing-term issues —
  // QA must not demand another subject's translation. Every headword has ≥1
  // translation (SQL inner join), so the partition is total.
  const terms = Array.from(termMap.values()).map((term) => {
    const inScope = term.translations.filter(
      (t) => translationTier(t.subjects, bookSubject) !== 'fallback'
    );
    return inScope.length > 0
      ? { ...term, translations: inScope, isFallback: false }
      : { ...term, isFallback: true };
  });
```

Then in the `matches.push({...})` call in the same function, add the two `isFallback` stamps (the existing approved-first `sorted` comparator already ranks fallback lists correctly — `isPrimary` is false throughout them):

```js
        matches.push({
          headwordId: term.headwordId,
          english: term.english,
          icelandic: primary.icelandic,
          subjects: primary.subjects,
          status: primary.status,
          isPrimary: primary.isPrimary,
          isFallback: term.isFallback,
          position: enMatch.index,
          translations: sorted.map((t) => ({
            id: t.id,
            icelandic: t.icelandic,
            subjects: t.subjects,
            status: t.status,
            isPrimary: t.isPrimary,
            isFallback: term.isFallback,
          })),
        });
```

Then gate the issues block — change the line

```js
        if (seg.isContent) {
```

(the one directly under the `// Check if any approved translation appears in IS text` comment) to:

```js
        if (!term.isFallback && seg.isContent) {
```

- [ ] **Step 4: Run the full service suite — new tests pass AND all guards stay green**

Run: `npx vitest run server/__tests__/terminologyService.test.js 2>&1 | tail -10`
Expected: 0 failed. Pay attention to the Global Constraints guard list — `homograph:`, `missing-term issue uses only…`, `no book subject…`, and the three `keeps…` tests must pass UNMODIFIED.

- [ ] **Step 5: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(item18): findTermsInSegments falls back on a true miss — suggestions only, never issues

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `lookupTerm` — stamp `isFallback`, sort translations best-first

**Files:**
- Modify: `server/services/terminologyService.js` (`lookupTerm`, ~lines 208-217)
- Test: `server/__tests__/terminologyService.test.js` (`lookupTerm()` describe, ~line 254)

**Interfaces:**
- Consumes: `translationTier` from Task 1.
- Produces: every translation in a `lookupTerm` result carries `isPrimary: boolean` and `isFallback: boolean`; `hw.translations` is sorted primary → in-scope → fallback, approved-first within each tier. Task 7's client code reads `primary.isFallback` and relies on `translations[0]` being the best pick. Route signature unchanged.

- [ ] **Step 1: Write the failing tests**

Append inside the `lookupTerm()` describe block (before its closing `});`):

```js
  it('stamps isFallback and sorts primary → in-scope → fallback (item 18)', () => {
    const hwId = insertHeadword({ english: 'cell' });
    // Inserted worst-first so DB order alone would fail the assertion.
    const trChem = insertTranslation(hwId, { icelandic: 'hólf', status: 'approved' });
    const trUntagged = insertTranslation(hwId, { icelandic: 'eining', status: 'approved' });
    const trBio = insertTranslation(hwId, { icelandic: 'fruma', status: 'approved' });
    addSubject(trChem, 'chemistry');
    addSubject(trBio, 'biology');

    const result = terminologyService.lookupTerm('cell', 'liffraedi-2e'); // biology book
    expect(result[0].translations.map((t) => t.icelandic)).toEqual(['fruma', 'eining', 'hólf']);
    expect(result[0].translations[0].isPrimary).toBe(true);
    expect(result[0].translations[0].isFallback).toBe(false);
    expect(result[0].translations[1].isFallback).toBe(false); // untagged = in-scope
    expect(result[0].translations[2].isFallback).toBe(true); // chemistry in a biology book
  });

  it('approved outranks proposed within a tier (item 18)', () => {
    const hwId = insertHeadword({ english: 'bond' });
    const trProposed = insertTranslation(hwId, { icelandic: 'tengsl', status: 'proposed' });
    const trApproved = insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    addSubject(trProposed, 'chemistry');
    addSubject(trApproved, 'chemistry');

    const result = terminologyService.lookupTerm('bond', 'efnafraedi-2e');
    expect(result[0].translations.map((t) => t.icelandic)).toEqual(['tengi', 'tengsl']);
  });

  it('unmapped book: nothing primary, nothing fallback, approved-first order', () => {
    const hwId = insertHeadword({ english: 'cell' });
    const trProposed = insertTranslation(hwId, { icelandic: 'fruma', status: 'proposed' });
    const trApproved = insertTranslation(hwId, { icelandic: 'hólf', status: 'approved' });
    addSubject(trProposed, 'biology');
    addSubject(trApproved, 'chemistry');

    const result = terminologyService.lookupTerm('cell', null);
    expect(result[0].translations.every((t) => t.isPrimary === false)).toBe(true);
    expect(result[0].translations.every((t) => t.isFallback === false)).toBe(true);
    expect(result[0].translations[0].icelandic).toBe('hólf');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "lookupTerm" 2>&1 | tail -15`
Expected: the 3 new tests FAIL (`isFallback` undefined / wrong order); the 5 pre-existing lookupTerm tests still pass.

- [ ] **Step 3: Implement stamp + sort**

In `lookupTerm`, **replace** the return block:

```js
  return rows.map((r) => {
    const hw = loadHeadword(db, r.id);
    // Mark primary translation based on book's domain
    if (bookSubject && hw.translations) {
      for (const tr of hw.translations) {
        tr.isPrimary = tr.subjects.includes(bookSubject);
      }
    }
    return hw;
  });
```

with:

```js
  // Item 18: stamp tier flags and sort best-first so callers can safely take
  // translations[0]. Rank: primary → in-scope → fallback; approved before
  // proposed within a tier (Array#sort is stable, ties keep DB order).
  const TIER_RANK = { primary: 0, 'in-scope': 1, fallback: 2 };
  const tierOf = (tr) => translationTier(tr.subjects || [], bookSubject);

  return rows.map((r) => {
    const hw = loadHeadword(db, r.id);
    if (hw.translations) {
      for (const tr of hw.translations) {
        const tier = tierOf(tr);
        tr.isPrimary = tier === 'primary';
        tr.isFallback = tier === 'fallback';
      }
      hw.translations.sort((a, b) => {
        const byTier = TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)];
        if (byTier !== 0) return byTier;
        if (a.status === 'approved' && b.status !== 'approved') return -1;
        if (a.status !== 'approved' && b.status === 'approved') return 1;
        return 0;
      });
    }
    return hw;
  });
```

- [ ] **Step 4: Run the service suite AND the route pin**

Run: `npx vitest run server/__tests__/terminologyService.test.js server/__tests__/termLookupBookSlug.test.js 2>&1 | tail -8`
Expected: 0 failed (route pin proves the signature contract survived).

- [ ] **Step 5: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(item18): lookupTerm stamps isFallback and sorts translations best-first

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Pin `exportBookGlossary` strictness + document the asymmetry

**Files:**
- Modify: `server/services/terminologyService.js` (comment only, at the subject-scoping `continue` inside `exportBookGlossary`, ~line 1224)
- Test: `server/__tests__/terminologyService.test.js` (`exportBookGlossary()` describe, ~line 1073)

**Interfaces:**
- Consumes: nothing new.
- Produces: no behavior change — a pin. The MT export keeps excluding untagged/`general` translations for subject-mapped books.

- [ ] **Step 1: Write the pinning test (expected to pass immediately — it pins current behavior)**

Append inside the `exportBookGlossary()` describe block (before its closing `});`):

```js
  it('excludes untagged and general-tagged translations for a mapped book (deliberately strict, item 18)', () => {
    // The MT-priming export is STRICTER than the editor surfaces on purpose:
    // cross-subject/unclassified terms in the MT glossary would harm MT quality.
    // The editor-side fallback (findTermsInSegments/lookupTerm) must NOT leak here.
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      subjects: ['chemistry'],
    });
    insertFullTerm({
      english: 'energy',
      icelandic: 'orka',
      status: 'approved',
      subjects: ['general'],
    });
    insertFullTerm({ english: 'thing', icelandic: 'hlutur', status: 'approved' }); // untagged

    const data = terminologyService.exportBookGlossary('efnafraedi-2e');
    expect(data.terms).toHaveLength(1);
    expect(data.terms[0].english).toBe('molecule');
  });
```

- [ ] **Step 2: Run it — must pass with zero implementation change**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "deliberately strict" 2>&1 | tail -5`
Expected: 1 passed. (If it fails, STOP — the current export behavior differs from the audit's reading; report to the user rather than "fixing" either side.)

- [ ] **Step 3: Add the asymmetry comment**

In `exportBookGlossary`, **replace**:

```js
      // Subject scoping: include when the translation carries the book's
      // subject, or when the book has no subject mapping.
      if (bookSubject && !t.subjects.includes(bookSubject)) continue;
```

with:

```js
      // Subject scoping: include when the translation carries the book's
      // subject, or when the book has no subject mapping.
      // DELIBERATELY STRICT (item 18): unlike the editor surfaces
      // (findTermsInSegments/lookupTerm admit 'general'/untagged and fall back
      // on a miss), MT priming exports ONLY exact-subject-tagged translations —
      // cross-subject or unclassified terms in the MT glossary would harm MT
      // quality. Pinned by 'deliberately strict' in terminologyService.test.js.
      if (bookSubject && !t.subjects.includes(bookSubject)) continue;
```

- [ ] **Step 4: Re-run the export describe**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "exportBookGlossary" 2>&1 | tail -5`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "test(item18): pin exportBookGlossary strict subject rule — editor fallback must not leak into MT priming

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `term-highlight.js` — `cross-subject` modifier + CSS

**Files:**
- Modify: `server/public/js/term-highlight.js` (class decision, line ~71)
- Modify: `server/views/segment-editor.html` (CSS after the `.term-highlight.proposed:hover` rule, ~line 772)
- Test: `server/__tests__/termHighlight.test.js`

**Interfaces:**
- Consumes: `m.isFallback` on match objects (Task 2's contract).
- Produces: highlight spans classed `term-highlight cross-subject` / `term-highlight proposed cross-subject`. CSS classes `.term-highlight.cross-subject` defined in the editor page.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/termHighlight.test.js`, at the end of the file:

```js
describe('highlightTermsInHtml — cross-subject fallback modifier (item 18)', () => {
  it('adds the cross-subject class for fallback matches, composing with status', () => {
    const approved = highlightTermsInHtml('the mole is a unit', [
      { english: 'mole', headwordId: 7, status: 'approved', isFallback: true },
    ]);
    expect(approved).toContain('class="term-highlight cross-subject"');

    const proposed = highlightTermsInHtml('the mole is a unit', [
      { english: 'mole', headwordId: 7, status: 'proposed', isFallback: true },
    ]);
    expect(proposed).toContain('class="term-highlight proposed cross-subject"');
  });

  it('omits the modifier for normal matches (isFallback absent or false)', () => {
    const absent = highlightTermsInHtml('the mole is a unit', [
      { english: 'mole', headwordId: 7, status: 'approved' },
    ]);
    expect(absent).not.toContain('cross-subject');

    const explicit = highlightTermsInHtml('the mole is a unit', [
      { english: 'mole', headwordId: 7, status: 'approved', isFallback: false },
    ]);
    expect(explicit).not.toContain('cross-subject');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/termHighlight.test.js 2>&1 | tail -8`
Expected: the 2 new tests FAIL (no `cross-subject` in output); the 9 existing tests pass.

- [ ] **Step 3: Implement the class composition**

In `server/public/js/term-highlight.js`, **replace**:

```js
        const cls = m.status === 'approved' ? 'term-highlight' : 'term-highlight proposed';
```

with:

```js
        const cls =
          (m.status === 'approved' ? 'term-highlight' : 'term-highlight proposed') +
          (m.isFallback ? ' cross-subject' : '');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/termHighlight.test.js 2>&1 | tail -5`
Expected: 11 passed.

- [ ] **Step 5: Add the CSS**

In `server/views/segment-editor.html`, directly after the `.term-highlight.proposed:hover { … }` rule, insert:

```css
    /* Item 18 — fallback (cross-subject) matches: visibly secondary. Declared
       after .proposed so at equal specificity the muted look wins for
       proposed+fallback; status still shows in the popup badges. */
    .term-highlight.cross-subject {
      background: transparent;
      border-bottom: 2px dashed var(--text-muted);
    }

    .term-highlight.cross-subject:hover {
      background: var(--bg-elevated);
    }
```

- [ ] **Step 6: Commit**

```bash
git add server/public/js/term-highlight.js server/__tests__/termHighlight.test.js server/views/segment-editor.html
git commit -m "feat(item18): cross-subject highlight modifier for fallback term matches

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Term popup — fallback note + class-based subject badges

**Files:**
- Modify: `server/public/js/ui-strings.js` (new `termPopup` group, after the `termLookup` group ~line 355)
- Modify: `server/views/segment-editor.html` (CSS, after the block added in Task 5)
- Modify: `server/public/js/segment-editor.js` (`showTermPopup`, ~lines 2190-2220)
- Test (create): `server/__tests__/termFallbackClientPins.test.js`

**Interfaces:**
- Consumes: `termInfo.isFallback` / `tr.isFallback` from Task 2's payload; CSS vars already defined in the page.
- Produces: `UI.termPopup.fallbackNote` string; CSS classes `.term-subject-badge`, `.term-subject-badge.other`, `.term-popup-fallback-note`; Task 7 reuses `.term-subject-badge`.

- [ ] **Step 1: Write the failing static pins**

Create `server/__tests__/termFallbackClientPins.test.js`:

```js
/**
 * Item 18 — static source pins for the fallback presentation in the segment
 * editor. No jsdom infra exists for segment-editor.js's DOM code (same
 * rationale as viewRouteContracts.test.js); term-highlight.js carries the
 * behavioral half in termHighlight.test.js. Pins match file bytes — class
 * names and object keys only, no Icelandic literals (campaign lesson).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('term popup fallback presentation (item 18)', () => {
  const editorJs = read('public/js/segment-editor.js');
  const editorHtml = read('views/segment-editor.html');
  const uiStrings = read('public/js/ui-strings.js');

  it('renders the fallback note when the match is fallback', () => {
    expect(editorJs).toMatch(/termInfo\.isFallback/);
    expect(editorJs).toMatch(/term-popup-fallback-note/);
    expect(uiStrings).toMatch(/termPopup:\s*\{/);
    expect(uiStrings).toMatch(/fallbackNote:/);
  });

  it('subject badges are class-based with a fallback modifier', () => {
    expect(editorJs).toMatch(/term-subject-badge\$\{tr\.isFallback \? ' other' : ''\}/);
  });

  it('CSS defines the popup fallback classes', () => {
    expect(editorHtml).toMatch(/\.term-subject-badge\s*\{/);
    expect(editorHtml).toMatch(/\.term-subject-badge\.other\s*\{/);
    expect(editorHtml).toMatch(/\.term-popup-fallback-note\s*\{/);
  });
});
```

- [ ] **Step 2: Run the pins to verify they fail**

Run: `npx vitest run server/__tests__/termFallbackClientPins.test.js 2>&1 | tail -8`
Expected: 3 FAIL (none of the strings exist yet).

- [ ] **Step 3: Add the UI string**

In `server/public/js/ui-strings.js`, after the `termLookup: { … },` group (before the file's closing `};`), add:

```js
  termPopup: {
    fallbackNote: 'Ekkert hugtak í fagi bókarinnar — sýnt úr öðru fagi',
  },
```

- [ ] **Step 4: Add the CSS**

In `server/views/segment-editor.html`, directly after the `.term-highlight.cross-subject:hover { … }` block from Task 5, insert:

```css
    /* Item 18 — term popup subject badges + fallback note */
    .term-subject-badge {
      font-size: 0.7em;
      padding: 0.1em 0.4em;
      background: var(--bg-elevated);
      border-radius: 3px;
      color: var(--text-muted);
    }

    .term-subject-badge.other {
      background: transparent;
      border: 1px dashed var(--text-muted);
    }

    .term-popup-fallback-note {
      font-size: var(--text-xs);
      color: var(--text-muted);
      padding-bottom: 0.3rem;
      margin-bottom: 0.3rem;
      border-bottom: 1px dashed var(--border);
    }
```

- [ ] **Step 5: Rewire `showTermPopup`**

In `server/public/js/segment-editor.js`, inside `showTermPopup`, **replace** the inline-styled badge builder:

```js
        const subjectBadges = (tr.subjects || [])
          .map(
            (s) =>
              `<span style="font-size: 0.7em; padding: 0.1em 0.4em; background: var(--bg-elevated); border-radius: 3px; color: var(--text-muted);">${SUBJECT_NAMES[s] || s}</span>`
          )
          .join(' ');
```

with (class-based, fallback-aware, and escaped — subject slugs come from the DB):

```js
        const subjectBadges = (tr.subjects || [])
          .map(
            (s) =>
              `<span class="term-subject-badge${tr.isFallback ? ' other' : ''}">${escapeHtml(SUBJECT_NAMES[s] || s)}</span>`
          )
          .join(' ');
```

Then **replace** the popup body assignment:

```js
    document.getElementById('term-popup-body').innerHTML = `
        ${translationsHtml}
```

with:

```js
    const fallbackNote = termInfo.isFallback
      ? `<div class="term-popup-fallback-note">${UI.termPopup.fallbackNote}</div>`
      : '';

    document.getElementById('term-popup-body').innerHTML = `
        ${fallbackNote}
        ${translationsHtml}
```

(the rest of the template literal — the glossary-link footer — stays byte-identical).

- [ ] **Step 6: Run the pins to verify they pass + syntax-check the client file**

Run: `npx vitest run server/__tests__/termFallbackClientPins.test.js 2>&1 | tail -5 && node --check server/public/js/segment-editor.js && node --check server/public/js/ui-strings.js`
Expected: 3 passed; both `node --check` runs silent (campaign lesson: always `node --check` hand-edited client files).

- [ ] **Step 7: Commit**

```bash
git add server/public/js/segment-editor.js server/public/js/ui-strings.js server/views/segment-editor.html server/__tests__/termFallbackClientPins.test.js
git commit -m "feat(item18): term popup — fallback note + class-based subject badges

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Quick-lookup box — subject badges + fallback marker

**Files:**
- Modify: `server/public/js/segment-editor.js` (lookup result renderer, ~lines 2276-2294)
- Test: `server/__tests__/termFallbackClientPins.test.js` (extend)

**Interfaces:**
- Consumes: `primary.isFallback` + `primary.subjects` from Task 3's sorted/stamped lookup payload; `.term-subject-badge` CSS from Task 6.
- Produces: labeled lookup rows — closes the requirement's "explicit request" prong (editors see, labeled, which subject each translation belongs to).

- [ ] **Step 1: Extend the static pins (failing)**

Append to `server/__tests__/termFallbackClientPins.test.js`:

```js
describe('quick-lookup subject labeling (item 18)', () => {
  const editorJs = read('public/js/segment-editor.js');

  it('lookup rows badge the primary translation subjects and mark fallback', () => {
    expect(editorJs).toMatch(/term-subject-badge\$\{primary\.isFallback \? ' other' : ''\}/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/termFallbackClientPins.test.js 2>&1 | tail -6`
Expected: the new test FAILS; the Task-6 pins pass.

- [ ] **Step 3: Implement the lookup renderer change**

In `server/public/js/segment-editor.js`, in the lookup result renderer, **replace**:

```js
              const others = translations.filter((t) => t !== primary);
              const othersText =
                others.length > 0
                  ? `<span style="font-size: 0.75em; color: var(--text-muted);"> (einnig: ${others.map((t) => escapeHtml(t.icelandic)).join(', ')})</span>`
                  : '';
              return `
              <div class="term-lookup-item" onclick="insertTermFromLookup('${escapeHtml(primary.icelandic)}')">
                <span class="term-lookup-en">${escapeHtml(hw.english)}</span>
                &#8594; <span class="term-lookup-is">${escapeHtml(primary.icelandic)}</span>
                ${primary.status === 'approved' ? ' &#10003;' : ''}${othersText}
              </div>`;
```

with:

```js
              const others = translations.filter((t) => t !== primary);
              const othersText =
                others.length > 0
                  ? `<span style="font-size: 0.75em; color: var(--text-muted);"> (einnig: ${others.map((t) => escapeHtml(t.icelandic)).join(', ')})</span>`
                  : '';
              // Item 18: label where the shown translation comes from; the
              // 'other' modifier marks a fallback (foreign-subject) pick.
              const subjectBadges = (primary.subjects || [])
                .map(
                  (s) =>
                    `<span class="term-subject-badge${primary.isFallback ? ' other' : ''}">${escapeHtml(SUBJECT_NAMES[s] || s)}</span>`
                )
                .join(' ');
              return `
              <div class="term-lookup-item" onclick="insertTermFromLookup('${escapeHtml(primary.icelandic)}')">
                <span class="term-lookup-en">${escapeHtml(hw.english)}</span>
                &#8594; <span class="term-lookup-is">${escapeHtml(primary.icelandic)}</span>
                ${primary.status === 'approved' ? ' &#10003;' : ''} ${subjectBadges}${othersText}
              </div>`;
```

- [ ] **Step 4: Run the pins + syntax check**

Run: `npx vitest run server/__tests__/termFallbackClientPins.test.js 2>&1 | tail -5 && node --check server/public/js/segment-editor.js`
Expected: all passed; `node --check` silent.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/__tests__/termFallbackClientPins.test.js
git commit -m "feat(item18): quick-lookup rows labeled with subject badges + fallback marker

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Campaign register, full suite, PR

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (insert a new register section directly BEFORE the `## Phase 4 — products & provenance gaps` heading)

**Interfaces:**
- Consumes: everything above, merged on the branch.
- Produces: the item-18 PR.

- [ ] **Step 1: Append the register section**

Insert into `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, directly before the line `## Phase 4 — products & provenance gaps (weeks 4–5, audit's own order)`:

```markdown
### Register — findings/deferrals from item 18 (2026-07-19)
- **I18-R1 `[gap]`** — approved mined-postedit terms are created untagged (`proposeMinedTerm` → `addTranslation` with no subjects) → never reach the MT export (`exportBookGlossary` strict rule) for subject-mapped books; real fix is tag-at-approval (item-19-adjacent), not a looser export.
- **I18-R2 `[hygiene]`** — `routes/terminology.js` `resolveBookSubject` (~`:989-1018`) is a divergent duplicate of `terminologyService.getBookSubjectBySlug` (opens its own better-sqlite3 connection per call, swallows errors → null); consolidate when convenient.
- **I18-R3 `[latent]`** — `views/terminology.html` `loadStats()` reads `bookSlug` but never uses it, despite a comment claiming fallback (~`:1277-1284`).
- **I18-R4 `[minor]`** — `SUBJECT_NAMES` is hardcoded client-side (`segment-editor.js` ~`:2157`); a subject added server-side renders as a raw slug in badges.
```

- [ ] **Step 2: Run the FULL suite from the repo root**

Run: `npm test 2>&1 | tail -15`
Expected: 0 failed across the whole workspace (~2900+ tests). This is the authoritative gate — do not proceed on any failure.

- [ ] **Step 3: Commit the register, push, open the PR**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(campaign): item 18 register I18-R1..R4

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git fetch origin && git push -u origin fix/item18-terminology-subject-fallback
```

Then open the PR (via `gh pr create`) titled **"feat(item18): terminology subject-fallback-on-miss — surface other subjects on a true miss, suggestions only"** with a body covering: the requirement (audit #7, lead-clarified); the four lead decisions (suggestions-only QA / labels-not-toggle / MT export stays strict / shared tier helper); the deliberate visible changes — fallback highlights+badges appear where terms used to be hidden, AND the quick-lookup "(einnig: …)" list order changes from DB order to tier/approved order; what is pinned (retargeted miss test, homograph guards untouched, export strictness, static client pins); register entries I18-R1..R4. End the body with the standard `🤖 Generated with [Claude Code](https://claude.com/claude-code)` line.

- [ ] **Step 4: Post-merge note (for whoever merges)**

After merge, per campaign convention: update the campaign doc item-18 line + memory resume pointer (`docs(campaign): item 18 merged` marker commit), and remember the server change reaches ritstjórn only via `./scripts/deploy.sh` (rides the already-pending deploy batch with items 14–16).

---

## Self-Review (performed at write time)

- **Spec coverage:** §4.1 helper → Task 1; §4.2 partition/issues-gate/payload → Task 2; §4.3 lookup stamp+sort (incl. the "visible ordering change" PR-description note) → Tasks 3 + 8; §4.4 export pin + comment → Task 4; §5.1 highlight → Task 5; §5.2 popup → Task 6; §5.3 quick-lookup → Task 7; §6 test matrix → distributed (retarget in T2, guards enforced via Global Constraints, export pin T4, highlight T5, static pins T6/T7); §7 register → Task 8. No gaps found.
- **Placeholder scan:** no TBDs; every code step shows the exact code; the PR body content is enumerated.
- **Type consistency:** `translationTier(subjects, bookSubject)` name/args identical in Tasks 1/2/3; `isFallback` field name identical across service (T2/T3), highlight (T5), popup (T6), lookup renderer (T7) and all pins; `.term-subject-badge` defined in T6, consumed in T7; `UI.termPopup.fallbackNote` defined and consumed in T6 only.
