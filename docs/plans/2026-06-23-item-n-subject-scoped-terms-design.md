# Item N — subject-scoped terminology matching (design)

**Date:** 2026-06-23
**Item:** N from [`2026-06-23-live-qa-followup-efni.md`](2026-06-23-live-qa-followup-efni.md)
(tracker: [`2026-06-17-deferred-fixlist-items.md`](2026-06-17-deferred-fixlist-items.md)).
**Scope:** `server/services/terminologyService.js` — `findTermsInSegments` only.
Ties into the multi-subject terminology redesign (migration 032).

## Problem (from live QA)

The segment editor's term highlights, the per-match translation dropdown, and the
"missing term" warnings pull from **all subjects**, not just the book's. A chemistry
book surfaces biology senses — e.g. `mole → moldvarpa` (the animal) instead of
`mól`. Cross-subject noise is counterproductive and can even raise false
missing-term warnings (a chemistry segment flagged for lacking a *biology*
translation of a homograph).

**Root cause:** `findTermsInSegments` (terminologyService.js:1010) loads every
approved/proposed translation across all subjects and only *ranks* the
book-subject one first (`isPrimary`). It never *excludes* off-subject
translations, so:
- a headword whose only translation is off-subject still highlights the wrong sense;
- the `translations[]` dropdown lists every subject's sense;
- the missing-term check considers off-subject approved translations.

Subjects are a fixed vocabulary (`chemistry, biology, physics, microbiology,
organic-chemistry, mathematics, general`); each book maps to one
`primary_subject` via `book_subject_mapping` (`getBookSubjectBySlug`).

## Decision

Turn the existing *ranking* into *filtering*, inside `findTermsInSegments`.

**In-scope rule** — a translation is in-scope iff **any** of:
1. `bookSubject` is null (book has no subject mapping) → **no filtering at all**
   (preserves current behavior as a safe fallback), or
2. its `subjects` includes `bookSubject`, or
3. its `subjects` includes `general`, or
4. its `subjects` is empty/untagged (treat as unknown → keep visible; avoids a
   coverage regression for un-tagged-but-valid terms).

Only **explicitly other-subject** translations (e.g. a biology-tagged
`moldvarpa` in a chemistry book) are excluded.

**Per headword:**
- Filter `translations` to in-scope ones.
- If **none** remain → skip the headword entirely: no entry in `matches`, no
  `translations[]`, and no missing-term `issue`.
- If some remain → use **only** the in-scope translations for: the primary
  pick (`isPrimary`/approved sort), the `matches[].translations[]` dropdown,
  and the missing-term issue's approved-translation set.

**Not in scope:** related-subject inclusion (a `chemistry` book will not show
`organic-chemistry`-tagged terms, and vice-versa — efnafraedi-2e=`chemistry`
and lifraen-efnafraedi=`organic-chemistry` are separate). Term mining
(`mined-candidates`) is left unchanged — it is already per-book and surfaces
post-edit corrections, not cross-subject lookups. `lookupTerm` already does
subject ranking and is out of scope here.

## Implementation sketch

In `findTermsInSegments`, after grouping translations per headword (the
`termMap` loop, ~:1047–1056), each translation already carries `subjects` and a
computed `isPrimary`. Add an `inScope` helper and apply it:

```js
const filterSubject = (subjects) =>
  !bookSubject ||                         // no mapping → no filtering
  subjects.length === 0 ||                // untagged → keep
  subjects.includes(bookSubject) ||
  subjects.includes('general');
```

- When building `terms`, drop any headword whose translations all fail
  `filterSubject` (so it never enters the match loop).
- Within a kept headword, set `term.translations` to the filtered list before
  the per-segment loop, so the primary sort, the `matches[].translations[]`
  array, and the `approvedTranslations` used for the missing-term issue all
  operate on in-scope translations only.

No SQL change (filtering in JS keeps the single grouped query); no schema
change; no route change. `bookSlug`/`bookSubject` are already threaded in.

## Testing

`terminologyService` exposes `_setTestDb`, so `findTermsInSegments` is unit-
testable directly against a seeded in-memory DB. Cases:

1. Chemistry book: a headword whose only translation is biology-tagged is
   **absent** from `matches`.
2. In-subject (chemistry) translation **present**.
3. `general`-tagged translation **present**.
4. Untagged (no subjects) translation **present**.
5. Homograph (`chemistry` + `biology` translations): the match's `primary` and
   `translations[]` contain **only** the chemistry sense.
6. Missing-term issue: for a homograph, the `expected` comes from the chemistry
   approved translation, and no issue is raised due to a missing biology sense.
7. `bookSubject` null (unmapped book): **no filtering** — current behavior.

## Out of scope (YAGNI)

Related-subject hierarchies; term-mining scoping; `lookupTerm`/`searchTerms`
changes; any schema or route change; UI changes (the editor consumes the same
`termMatches` shape, just with fewer/cleaner entries).
