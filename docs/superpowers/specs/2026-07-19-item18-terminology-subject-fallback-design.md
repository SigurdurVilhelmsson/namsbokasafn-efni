# Item 18 — Terminology Subject-Fallback-on-Miss — Design

**Date:** 2026-07-19 · **Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` item 18 (Phase 4)
**Sources:** audit condition #7 + judgment-requirement 6 (`docs/audit/2026-07-11-product-provenance-durability-audit.md:70-74,102`), item-N design (`docs/plans/2026-06-23-item-n-subject-scoped-terms-design.md`, PR #148), lead's original June ask (`docs/plans/2026-06-23-live-qa-followup-efni.md:123-134`).
**Verification basis:** all file:line references verified against main `3ea62488` (2026-07-19) by a 4-agent read-only fan-out (workflow `wf_2ae739ac-1ab`; journal in the session transcript dir). Trust the pattern over the line number if they drift.

## 1. Requirement

Lead's clarified requirement, verbatim (2026-07-11, mid-audit): *"terminology lookup must prioritise the book's subject and **fall back** to other subjects on a miss (or on explicit request)."*

History matters here: the June ask (live-QA item N) was that chemistry editing draw **only** from the chemistry set, and PR #148 built exactly that — a hard filter (`subjectAllowed`) that silently drops any headword whose translations are all foreign-subject. The July clarification supersedes the June wording: prioritise-and-demote, don't hide. **Item 18 is a requirement change, not a bug fix.** Two June wins must not regress:

1. **Wrong-sense-as-primary** (`mole → moldvarpa` surfacing as the suggested translation in a chemistry book) must stay impossible — fallback must be visibly secondary and appear only when the book's own glossary genuinely has nothing.
2. **False missing-term warnings** for off-subject homographs must stay suppressed — QA never demands a chemistry editor use a physics translation.

The audit's "4th surface broken" finding (lookup route reading `bookId`) was already fixed by item 16 PR1 F13 (commit `6948668f`, pinned by `termLookupBookSlug.test.js`) — item 18 is purely fallback semantics plus presentation; no route plumbing.

## 2. Lead decisions (2026-07-19, adjudicated in the scoping conversation)

| Decision | Outcome |
|---|---|
| QA participation | **Suggestions only.** Fallback terms appear in highlights + popups but NEVER generate missing-term issues — post-save toast, Hugtakafrávik report, and hugtakavandamál counts are untouched by construction. |
| Explicit-request prong | **Presentation only.** Subject badges in the in-editor quick-lookup results (which already return all subjects, unlabeled) + in the term popup. No new toggle/UI state. |
| MT export path | **Keep strict + pin it.** `exportBookGlossary` unchanged (strict subject-only is a feature for MT priming); add a test pinning the currently-unpinned exclusion of untagged/`general`; log the untagged-mined-terms gap to the register (I18-R1) — the real fix is tag-at-approval, item-19-adjacent. |
| Mechanism | **Shared tier helper.** One pure `translationTier()` policy function used by both `findTermsInSegments` (partition, don't filter) and `lookupTerm` (stamp + sort). Matches the standing "one real code path" feedback. |

## 3. Current state (three scoping dialects)

All scoping lives in `server/services/terminologyService.js`, keyed off `getBookSubjectBySlug` (`:1399-1411`; returns `null` for unmapped/unregistered → scoping disabled):

| Function | Rule today | Surfaces fed |
|---|---|---|
| `findTermsInSegments` (`:1011`, filter at `:1064-1075`) | Lenient allow-list {book subject, `general`, untagged}; headword with zero in-scope translations **dropped entirely** — no match, no issue | Auto-highlight (`routes/segment-editor.js:878`), post-save QA toast (`checkSegmentConsistency` `:1259-1262` via `segmentEditorService.js:286`), head-editor Hugtakafrávik report (`buildModuleTerminologyReport` `:1273-1292` via `segmentEditorService.js:335`), dormant `POST /api/terminology/check-consistency` (`routes/terminology.js:949/964`) |
| `lookupTerm` (`:175-218`) | **No filtering**; stamps `isPrimary = subjects.includes(bookSubject)` post-query; translations in DB order | Quick-lookup box (`routes/segment-editor.js:107`) + terminology-manager lookup (`routes/terminology.js:93`) |
| `exportBookGlossary` (`:1195-1247`, strict rule at `:1226`) | Strict: only exact-subject-tagged translations export for a mapped book; untagged/`general` **excluded** (unpinned) | `server/scripts/export-terminology.js:54` → `glossary-unified.json` → `tools/api-translate.js` (MT priming; tools add only an approved-status filter) |

The "miss" being fixed: a headword whose translations are *all* foreign-subject vanishes from every editing surface (`server/__tests__/terminologyService.test.js:869-881` pins this drop).

## 4. Server design

### 4.1 `translationTier(subjects, bookSubject)` — the single policy site

New pure function in `terminologyService.js` (exported for tests):

```js
function translationTier(subjects, bookSubject) {
  if (!bookSubject) return 'in-scope';            // unmapped book → no scoping, nothing primary
  if (subjects.includes(bookSubject)) return 'primary';
  if (subjects.length === 0 || subjects.includes('general')) return 'in-scope';
  return 'fallback';
}
```

Semantically identical to today's `subjectAllowed` for the primary/in-scope arms; the `fallback` arm replaces "dropped".

### 4.2 `findTermsInSegments` — partition, don't filter

Per headword, partition translations into `inScope` (tiers `primary`/`in-scope`) and `fallback`:

- **`inScope` non-empty → behavior byte-for-byte identical to today.** Matches ranked isPrimary-first then approved-first; missing-term issues computed from in-scope approved translations only; foreign siblings stay hidden (homograph guard: `mól` present ⇒ `moldvarpa` invisible).
- **`inScope` empty, `fallback` non-empty → the new path.** The headword participates in EN matching. On a hit it emits a match with:
  - `isFallback: true` (match level),
  - `icelandic` = best fallback translation (reusing the existing comparator: `isPrimary` all false ⇒ approved before proposed, stable DB order among ties),
  - `translations[]` = fallback list sorted the same way, each stamped `isFallback: true` (`isPrimary` stays `false`),
  - **no issues, ever** — the missing-term block is structurally unreachable for fallback headwords (issues are computed from the `inScope` partition, which is empty). Status parity with in-scope behavior: proposed-only fallback headwords still surface (marked proposed), consistent with today's in-scope handling; item 19 owns proposed-gating globally.
- **`inScope` and `fallback` both empty** (can't occur — every translation has a tier) — n/a.

Payload additions are **additive only** (`isFallback` on match + translation); every client consumer verified to ignore unknown fields.

### 4.3 `lookupTerm` — stamp + sort, no filtering change

- Stamp per-translation `isFallback = (tier === 'fallback')` alongside the existing `isPrimary`.
- Sort each headword's `translations[]`: primary → in-scope → fallback, approved-first within tier. The quick-lookup popup's existing insert logic (`find(t => t.isPrimary) || translations[0]`, `public/js/segment-editor.js:2280`) then picks the best available translation with zero client logic change. Note this is a deliberate, visible ordering change: non-primary translations (the popup's "(einnig: …)" list, and `translations[0]` for unmapped books) move from DB order to tier/approved order — an improvement, but it should be named in the PR description.
- Signature stays `(q, bookSlug)` — the item-16 route pin (`termLookupBookSlug.test.js`, exact-arg assertion) survives untouched.

### 4.4 Untouched, deliberately

- `exportBookGlossary` — strict rule stays; new pinning test + code comment documenting the editor/MT asymmetry.
- `getBookSubjectBySlug` and its route-local duplicate `resolveBookSubject` (`routes/terminology.js:989-1018`) — consolidation is register hygiene (I18-R2), not this PR.
- `searchTerms`/`getReviewQueue`/`getStats` exact-tag filters (explicit user-chosen subject filter — a different concept from book-derived scoping).
- Localization editor — has no terminology surface at all.

## 5. Client design (three files, all additive)

1. **EN-pane highlight** — `server/public/js/term-highlight.js` (class decision at `:71`): a `cross-subject` modifier class when `m.isFallback` that **composes** with the existing status split — `term-highlight cross-subject` (approved) or `term-highlight proposed cross-subject` (proposed) — so status styling is never lost. Visually quieter than a normal hit (e.g. dashed underline) — reads as "something exists elsewhere", not "use this". CSS lands next to the existing `term-highlight` styles.
2. **Term popup** — `showTermPopup` (`public/js/segment-editor.js:2157-2232`): per-translation subject badges already render via the `SUBJECT_NAMES` map; fallback translations get a styled badge variant (`.subject-badge.other`) + one header note when `match.isFallback`: *"Ekkert hugtak í fagi bókarinnar — sýnt úr öðru fagi"* (final copy per `ui-terminology-convention`). No new DOM structure.
3. **Quick-lookup popup** — result renderer (`public/js/segment-editor.js:2276-2294`): subject badges per result line (reusing `SUBJECT_NAMES`), fallback entries marked with the same visual language. Insert behavior unchanged (server sort does the work). This closes the explicit-request prong: an editor who wants another subject's term types it in the box and sees, labeled, where each translation comes from.

No changes: stats chips (fallback hits count as ordinary `hugtök`; they can never inflate `hugtakavandamál`), save-toast/report rendering (issues never fire for fallback), submit gate, localization editor.

## 6. Testing

Blast radius verified: all scoping pins live in `server/__tests__/terminologyService.test.js` (+ `termHighlight.test.js` for the class variant; `termLookupBookSlug.test.js` unaffected).

**Retarget** (campaign lesson: retarget tests whose mutated class becomes invariant):
- `hides a headword whose only translation is another subject` (`:869-881`) → now pins the fallback shape: match present, `isFallback: true`, `icelandic: 'moldvarpa'`, **issues still 0**.

**Keep unchanged as guards:**
- Homograph-dropdown test (`:921-935`) — fallback fires only on a true miss; in-subject hit keeps foreign siblings hidden.
- Homograph missing-issue test (`:937-953`) — in-scope exists ⇒ no fallback; issue expects the in-subject translation only.
- Unmapped-book test (`:955-965`) — `!bookSubject` escape hatch preserved.
- Three allow-list arm tests (`:883-919`) — subject-tagged / `general` / untagged all stay in-scope.

**New:**
- `translationTier` unit tests — all four arms.
- Fallback selection: approved outranks proposed within the fallback list.
- Fallback-only-proposed headword still surfaces, marked proposed (status parity).
- `checkSegmentConsistency` with a foreign-only term → no issue even though the term matches as fallback (fills a mapped coverage gap in the save-path QA).
- `lookupTerm`: `isFallback` stamping + primary → in-scope → fallback sort order (approved-first within tier).
- `exportBookGlossary`: strict pin — untagged and `general`-tagged translations excluded for a subject-mapped book (closes the unpinned asymmetry).
- `term-highlight`: fixture asserting the `cross-subject` class on `isFallback` matches (and its absence otherwise).

Test seeding reuses the existing in-memory idiom (`createTestDb` + `_setTestDb` + `insertFullTerm({subjects})`; chemistry=`efnafraedi-2e`, biology=`liffraedi-2e` mappings already seeded).

## 7. Register entries (log-out-of-scope standing feedback; append to campaign doc)

- **I18-R1 `[gap]`** — approved mined-postedit terms are created untagged (`proposeMinedTerm` → `addTranslation` with no subjects) → never reach the MT export for subject-mapped books; real fix is tag-at-approval (item-19-adjacent), not a looser export.
- **I18-R2 `[hygiene]`** — `routes/terminology.js` `resolveBookSubject` (`:989-1018`) is a divergent duplicate of `getBookSubjectBySlug` (opens its own DB connection per call, swallows errors → null); consolidate when convenient.
- **I18-R3 `[latent]`** — `terminology.html` `loadStats()` reads `bookSlug` but never uses it, despite a comment claiming fallback (`:1277-1284`).
- **I18-R4 `[minor]`** — `SUBJECT_NAMES` is client-hardcoded in `segment-editor.js` (`:2157-2165`); a new subject added server-side renders as a raw slug.

## 8. Out of scope (deliberate)

- Untagged-semantics decision (judgment-requirement 6: "global" vs "unclassified-with-warning") — untagged stays in-scope-everywhere, unchanged.
- Glossary review-queue / proposed-gating (item 19).
- Related-subject inclusion (chemistry ≈ organic-chemistry) — same exclusion as item N.
- Inline "sýna öll fög" toggle — the labeled lookup box covers the explicit-request prong.
- Any change to MT priming behavior.
- Consolidating the duplicate slug→subject resolver (I18-R2).

## 9. Delivery

One PR, branch `fix/item18-terminology-subject-fallback`. `npm test` from repo root is the authoritative gate. Server work reaches ritstjórn only via `./scripts/deploy.sh` (rides the existing pending-deploy batch). No migrations, no schema change, no route signature change — payload additions are additive, so server and client can ship in one PR without ordering concerns.
