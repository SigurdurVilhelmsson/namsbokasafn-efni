# Item N — Subject-Scoped Term Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope the segment editor's term matching to the book's subject so a chemistry book stops surfacing other-subject senses (e.g. `mole → moldvarpa`).

**Architecture:** Turn the existing subject *ranking* in `findTermsInSegments` (terminologyService.js) into *filtering*: keep only translations tagged with the book subject, `general`, or untagged; drop headwords left with no in-scope translation. Pure JS filter on the already-loaded translations — no SQL/schema/route change.

**Tech Stack:** Node.js, better-sqlite3, Vitest (unit, in-memory DB via `_setTestDb`).

**Design:** [`2026-06-23-item-n-subject-scoped-terms-design.md`](2026-06-23-item-n-subject-scoped-terms-design.md)

## Global Constraints

- Change is confined to `server/services/terminologyService.js` → `findTermsInSegments`. No SQL, schema, route, or UI change.
- In-scope rule (exact): a translation is in-scope iff `!bookSubject` OR `subjects.length === 0` OR `subjects.includes(bookSubject)` OR `subjects.includes('general')`.
- Fallback: unmapped book (`bookSubject` null) ⇒ no filtering (preserve current behavior).
- Term mining (`mined-candidates`), `lookupTerm`, `searchTerms` are out of scope — do not touch.
- Vanilla JS; follow existing file style. No new dependencies.
- Branch: `feature/item-n-subject-scoped-terms` (already created off `main`, holds the design doc).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `server/services/terminologyService.js` | `findTermsInSegments` — add subject filtering of translations before the match loop. | Modify (~line 1059) |
| `server/__tests__/terminologyService.test.js` | Add a `findTermsInSegments() — subject scoping` describe block. | Modify (append after the existing `findTermsInSegments()` block, ~line 861) |

The test harness (top of the file) already seeds `registered_books` (`efnafraedi-2e`→`chemistry` id 1, `liffraedi-2e`→`biology` id 2) and `book_subject_mapping`, and provides helpers `insertHeadword`, `insertTranslation(headwordId, overrides)`, `addSubject(translationId, subject)`, and `insertFullTerm`. Reuse them — do not re-seed.

---

## Task 1: Subject-scope `findTermsInSegments`

**Files:**
- Modify: `server/services/terminologyService.js` (`findTermsInSegments`, the `const terms = Array.from(termMap.values());` line ~`:1059`)
- Test: `server/__tests__/terminologyService.test.js` (new describe block after `:861`)

**Interfaces:**
- Consumes: existing `findTermsInSegments(segments, bookSlug)`; `bookSubject` (already computed at `:1014` via `getBookSubjectBySlug`); each term's `translations[]` already carry `subjects: string[]` and `isPrimary`.
- Produces: same return shape `{ [segmentId]: { matches, issues } }`, but `matches`/`issues` only reflect in-scope translations, and headwords with no in-scope translation are absent.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/terminologyService.test.js`, immediately after the closing `});` of the existing `describe('findTermsInSegments()', …)` block (~line 861):

```js
// =====================
// findTermsInSegments() — subject scoping (item N)
// =====================
describe('findTermsInSegments() — subject scoping', () => {
  const seg = (enContent, isContent) => [{ segmentId: 's', enContent, isContent }];

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

  it('keeps an in-subject translation', () => {
    const hw = insertHeadword({ english: 'acid' });
    const tr = insertTranslation(hw, { icelandic: 'sýra', status: 'approved' });
    addSubject(tr, 'chemistry');

    const result = terminologyService.findTermsInSegments(
      seg('an acid reacts', 'sýra hvarfast'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('sýra');
  });

  it('keeps a general-tagged translation', () => {
    const hw = insertHeadword({ english: 'energy' });
    const tr = insertTranslation(hw, { icelandic: 'orka', status: 'approved' });
    addSubject(tr, 'general');

    const result = terminologyService.findTermsInSegments(
      seg('energy flows', 'orka flæðir'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('orka');
  });

  it('keeps an untagged translation (no subjects)', () => {
    const hw = insertHeadword({ english: 'thing' });
    insertTranslation(hw, { icelandic: 'hlutur', status: 'approved' }); // no addSubject

    const result = terminologyService.findTermsInSegments(
      seg('a thing here', 'hlutur hér'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('hlutur');
  });

  it('homograph: keeps only the in-subject sense in primary + dropdown', () => {
    const hw = insertHeadword({ english: 'mole' });
    const chem = insertTranslation(hw, { icelandic: 'mól', status: 'approved' });
    const bio = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(chem, 'chemistry');
    addSubject(bio, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of', 'eitt mól af'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].translations).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('mól');
  });

  it('missing-term issue uses only the in-subject approved translation', () => {
    // chem 'mól' + bio 'moldvarpa'; IS contains the biology homograph but not 'mól'.
    // Before scoping: anyFound is true (moldvarpa present) → no issue (wrong).
    // After scoping: only 'mól' counts → it's absent → one issue expecting 'mól'.
    const hw = insertHeadword({ english: 'mole' });
    const chem = insertTranslation(hw, { icelandic: 'mól', status: 'approved' });
    const bio = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(chem, 'chemistry');
    addSubject(bio, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of', 'ein moldvarpa grefur'),
      'efnafraedi-2e'
    );
    expect(result.s.issues).toHaveLength(1);
    expect(result.s.issues[0].expected).toBe('mól');
  });

  it('no book subject (unmapped) → no filtering, all senses kept', () => {
    const hw = insertHeadword({ english: 'mole' });
    const chem = insertTranslation(hw, { icelandic: 'mól', status: 'approved' });
    const bio = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(chem, 'chemistry');
    addSubject(bio, 'biology');

    const result = terminologyService.findTermsInSegments(seg('one mole of', 'eitt mól af'));
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].translations).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail (for the right reasons)**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "subject scoping"`
Expected: FAIL on three cases that exercise the new behavior — "hides a headword whose only translation is another subject" (currently matches → length 1, not 0), "homograph: keeps only the in-subject sense" (currently translations length 2), and "missing-term issue uses only the in-subject approved translation" (currently no issue raised). The four guard tests (in-subject, general, untagged, no-book-subject) should already PASS — they protect against over-filtering.

- [ ] **Step 3: Implement the subject filter**

In `server/services/terminologyService.js`, in `findTermsInSegments`, replace this single line (~`:1059`):

```js
  const terms = Array.from(termMap.values());
```

with:

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

This works because everything downstream (the primary sort at `:1092`, the `matches[].translations[]` map at `:1109`, and the `approvedTranslations` for the missing-term issue at `:1120`) already reads `term.translations`. The spread preserves `headwordId`, `english`, and the EN `regex`.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "subject scoping"`
Expected: PASS (all 7).

- [ ] **Step 5: Run the full terminologyService test file (no regression)**

Run: `npx vitest run server/__tests__/terminologyService.test.js`
Expected: PASS. Note the existing `findTermsInSegments()` cases stay green: "includes all translations in match info" calls `findTermsInSegments(segments)` with NO bookSlug (→ no filtering, 2 translations kept), and "ranks primary translation by book domain" only asserts the primary `icelandic`/`isPrimary` (the now-filtered dropdown still contains the primary). If either fails, the filter changed behavior it shouldn't — fix the filter, not the existing tests.

- [ ] **Step 6: Run the full server unit suite + lint**

Run: `npx vitest run --project server`
Expected: PASS (all green).
Run: `npx eslint server/services/terminologyService.js server/__tests__/terminologyService.test.js`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(terminology): subject-scope findTermsInSegments (item N)"
```

---

## Self-review notes (coverage vs. spec)

- Spec "in-scope rule" (book-subject OR general OR untagged; null→no filter) → Task 1 Step 3 `subjectAllowed`. ✅
- Spec "drop headwords with no in-scope translation" → the `.filter((term) => term.translations.length > 0)`. ✅
- Spec "primary pick, dropdown, and missing-term issue use only in-scope" → downstream reads filtered `term.translations`; covered by tests (homograph dropdown, missing-term `expected`). ✅
- Spec "fallback: unmapped book → no filtering" → `!bookSubject` short-circuit + test. ✅
- Spec "only findTermsInSegments; mining/lookup untouched" → no other file/function changed. ✅
- Spec test cases 1–7 → the 7 tests in Step 1. ✅
