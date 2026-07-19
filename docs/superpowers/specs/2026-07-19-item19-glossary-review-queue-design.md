# Item 19 — Glossary Review-Queue — Design

Campaign item 19 (`docs/plans/2026-07-11-pre-semester-coding-campaign.md` Phase 4).
Source finding: audit 6b (`docs/audit/2026-07-11-product-provenance-durability-audit.md`).
Companion register: I18-R1 (tag-at-approval).

## 1. Requirement

Audit 6b: added glossary terms default to `status='proposed'` and promotion requires a
HEAD_EDITOR, but a proposed term is live immediately in editor lookup and consistency
checks, and `getReviewQueue` surfaces only `disputed`/`needs_review` — never `proposed`.
Nothing proactively shows a head-editor new proposals; approval is one-at-a-time through
each headword's detail modal. The only end-to-end approval enforcement is MT priming
(`approvedOnly` in `tools/lib/malstadur-api.js`).

I18-R1: approved mined-postedit terms are created untagged (`proposeMinedTerm` →
`addTranslation` with no subjects), so even after approval they never pass
`exportBookGlossary`'s deliberately-strict subject rule for subject-mapped books. The
registered fix is tag-at-approval.

## 2. Lead decisions (2026-07-19, adjudicated in the scoping conversation)

1. **Surface + govern, don't gate.** Proposed terms join a real review queue but STAY
   live in editor surfaces exactly as today (amber-flagged, "…" badge; QA missing-term
   issues remain approved-only). "Proposed is live immediately" is pinned, deliberate
   item-18 behavior serving ~617 unapproved chemistry terms — no editor-facing regression.
2. **Tag-at-approval (I18-R1) is in scope.** The approve flow gains an optional subjects
   parameter + a subject picker in the queue UI.
3. **New `rejected` status** is the queue's negative action (terminal-but-reversible;
   audit trail via a `terminology_discussions` entry, same pattern as dispute). Also
   gives long-stuck disputed/needs_review rows an exit.
4. **Batch approve+tag is in scope** (the actual throughput bottleneck). The my-work
   "Orðatillögur" proposer card is NOT — registered instead (I19-R2).
5. **Architecture B:** translation-level queue panel on terminology.html (mined-candidates
   card pattern), not a retrofit of the headword-level `getReviewQueue` and not a
   dedicated page.

## 3. Current state (map from understand-workflow wf_1652a070, 6 readers, line-anchored)

- Status lives on **translations only**; `TERM_STATUSES = ['approved','proposed',
  'disputed','needs_review']` (`terminologyService.js:33`); headwords have no status.
- Every creation path hardcodes `proposed` at INSERT (`addTranslation:311`, CSV `:687`,
  Excel `:764`, key-terms `:962`) except `importGlossaryTerms:884` → `needs_review`.
- Transitions: `approveTranslation:444` (HEAD_EDITOR route `routes/terminology.js:565-568`;
  any status → approved; idempotent early-return `:440`; **no subjects param**) and
  `disputeTranslation:469` (EDITOR; + discussion insert). No reject/demote/unapprove;
  `updateTranslation:388` excludes status from allowedFields.
- Live-immediately gates (allowlists): `lookupTerm` `status IN ('approved','proposed')`
  at `:197`; `findTermsInSegments` same at `:1063` (audit's `:1027` moved — now a comment
  in `translationTier`'s docblock). QA missing-term issues fire from **approved
  translations only** (`:1181-1182`) — proposed terms are matches/suggestions, never
  violations.
- `getReviewQueue:533` surfaces only disputed/needs_review, headword-granular
  (DISTINCT h.id → `loadHeadword` each), no count, no book filter. Consumers: route
  `:122` (EDITOR), terminology.html `:1298` fake "N+" banner (fetches `limit=1`), e2e
  shape checks. `showReviewQueue()` sets the list filter to `disputed` only — already
  drops `needs_review` (pre-existing bug, fixed by the rewire).
- Item 18's `translationTier` is orthogonal to status (subjects-only); within-tier sort
  is approved-first. MT export: `exportBookGlossary:1241` exports **ALL statuses**
  subject-strict (`:1277`, pinned "deliberately strict"); consumers filter —
  `api-translate` + `math-label-substitute` approved-only, but
  `translate-chapter-titles.js` passes `approvedOnly:false` (leaks non-approved to MT —
  registered, I19-R1).
- I18-R1 confirmed: `proposeMinedTerm:1225` passes no subjects; mined candidate rows
  carry `book`; `getBookSubjectBySlug:1450` maps book→subject. A divergent
  `resolveBookSubject` duplicate lives at `routes/terminology.js:989-1018` (own DB
  connection per call, swallows errors → null) — I18-R2.
- `translations.status` has **no CHECK constraint** — a new status value needs no
  migration; enforcement is `TERM_STATUSES` + route validation + the allowlist gates.
- Route-ordering trap: new routes under `/api/terminology` must register above the
  parametric `/:id` routes (item-L regression note at `routes/terminology.js:242-245`).
- Test seams: in-memory better-sqlite3 via `_setTestDb` with a hand-copied DDL block
  (`terminologyService.test.js:23-92`); route-harness extraction idiom
  (`locApproveConflict.test.js`); client byte-pins must match file bytes (escaped
  `\uXXXX` in terminology.html vs raw Icelandic in segment-editor.js).

## 4. Server design

### 4.1 Status model — `rejected`, no migration

`TERM_STATUSES` gains `'rejected'` (terminal-but-reversible; `approveTranslation`
already approves from any status, so un-reject exists for free). No schema change.
Because every editor-surface gate is an allowlist, `rejected` is invisible in lookup,
findTermsInSegments, and the queue's defaults with **zero changes** to those gates.
Explicit opt-outs needed in exactly two places:

- `exportBookGlossary` excludes `rejected` (today it exports all statuses) so junk never
  rides into the committed `glossary-unified.json`. The item-18 "deliberately strict"
  subject-scoping pin is orthogonal and untouched.
- `getStats` gains a `rejected` CASE column.

### 4.2 `getTranslationReviewQueue(opts)` — the one queue query

New service function, translation-granular. Replaces `getReviewQueue`, which is
**deleted** along with nothing-else-uses-it plumbing (one real code path). Options:

- `status[]` — default `['proposed','disputed','needs_review']`; `'rejected'` allowed
  explicitly (an audit view), `'approved'` not offered by the UI but not rejected by the
  service (harmless).
- `source` — exact match (e.g. `mined-postedit`, `manual`, import sources).
- `subject` — a subject slug, or the special value `'untagged'` (rows with zero subject
  tags). Untagged rows are the I18-R1 targets; a slug-filtered view must not hide them
  silently, so `'untagged'` is a first-class filter value.
- `book` — resolved to a subject via `getBookSubjectBySlug` (service singleton; see 4.6).
- `limit`/`offset` — paginated, clamped (limit 1–200, default 50), newest-first
  (`created_at DESC, id DESC` tie-break).

Returns `{ items, total }` where `total` is the real filtered count and each item is
`{ translationId, headwordId, english, pos, icelandic, status, source, subjects[],
proposedBy, proposedByName, createdAt, definitionIs, notes }` — flat rows, no
`loadHeadword` hydration (cheap at limit 200).

`getReviewQueueCounts({book?, subject?})` returns per-status counts
(`{proposed, disputed, needs_review}`) for the banner and filter chips.

### 4.3 `approveTranslation(id, userId, username, {subjects} = {})` — tag-at-approval

- `subjects` omitted/undefined → byte-for-byte today's behavior, including the pinned
  already-approved early-return.
- `subjects` provided (non-empty array of valid slugs) → in ONE transaction: wholesale
  replace the translation's subject tags (same replace semantics as `updateTranslation`)
  then set approved + stamps. Runs even if already approved (re-tagging an approved row
  through the approve action is legitimate).
- Invalid slug → throw before any write (route maps to 400).

### 4.4 `batchApproveTranslations(ids, userId, username, {subjects} = {})`

One transaction, all-or-nothing, fail-loud: any unknown id → throw naming the offending
id(s), nothing applied. Cap 200 ids (route-validated too). Subject semantics differ
deliberately from single-approve: the batch subject tag is applied **only to rows that
are currently untagged** — already-tagged rows just get approved. A bulk action can
never clobber deliberate per-term tagging; per-row explicit intent uses single approve.

### 4.5 `rejectTranslation(id, userId, username, reason = '')`

HEAD_EDITOR action. Any status → `'rejected'`; inserts a `terminology_discussions` entry
on the headword recording actor + "Hafnað" + reason (dispute's exact pattern — the audit
trail without schema change); one transaction. Reason optional, length-capped (500).

### 4.6 I18-R2 consolidation (rides along)

The routes-level `resolveBookSubject` duplicate (`routes/terminology.js:989-1018`) is
deleted; its call sites rewire to `terminologyService.getBookSubjectBySlug`. Behavior
change: no more swallow-to-null on DB error (fail loud) — covered by a test.

### 4.7 Untouched, deliberately

- `lookupTerm` / `findTermsInSegments` status gates (`:197`, `:1063`) — proposed stays
  live in-editor (lead decision 1).
- The item-18 tier model, sorts, partitions, and the "deliberately strict" export
  subject rule.
- `disputeTranslation` (EDITOR) and `deleteTranslation` (ADMIN) semantics.
- Mining endpoints' role-only (non-book-scoped) posture — registered (I19-R3), no authz
  churn in a feature batch (I12-R1 precedent).
- `proposeMinedTerm` stays untagged-at-proposal — the fix point is approval, where the
  human is looking at the term (I18-R1's registered fix shape).

## 5. Routes (all above the parametric `/:id` routes)

| Method | Path | Gate | Notes |
|---|---|---|---|
| GET | `/api/terminology/review-queue` | EDITOR | New contract `{items, total, limit, offset}`; query params per 4.2. Same path as the retired route; e2e retargets. |
| GET | `/api/terminology/review-queue/counts` | EDITOR | `{proposed, disputed, needs_review}` (+optional book/subject filter). |
| POST | `/api/terminology/translations/:id/approve` | HEAD_EDITOR | Existing route; body gains optional `{subjects}`. |
| POST | `/api/terminology/translations/batch-approve` | HEAD_EDITOR | `{ids, subjects?}`; ids non-empty ints, ≤200; all-or-nothing; offending ids named in error. |
| POST | `/api/terminology/translations/:id/reject` | HEAD_EDITOR | `{reason?}` ≤500 chars. |

Read=EDITOR / act=HEAD_EDITOR preserves the pinned RBAC asymmetry. Validation at the
boundary: subject slugs checked against the subjects table; garbage → 400 with nothing
applied.

## 6. Client design (terminology.html; mined-candidates card pattern)

- **"Yfirferðarröð" panel**: filter row (status chips with live counts from the counts
  endpoint; source select; subject select incl. "Ómerkt"; book select), paginated rows
  (50/page): EN headword (pos) / IS translation / status + source + subject badges (or
  an "ómerkt" marker) / proposer + date. Row click-through opens the existing headword
  detail modal.
- **Role split**: panel visible to editors read-only; head-editor/admin additionally see
  per-row checkboxes, approve (subject picker, prefilled from the active book filter's
  subject when set), and reject (reason prompt). Client role checks cosmetic; API gates
  authoritative.
- **Batch bar** appears when ≥1 row checked: one subject picker + "Samþykkja valin (N)".
- **Banner rewire**: real counts from the counts endpoint; "Skoða" opens/scrolls to the
  panel — fixing the pre-existing drops-needs_review bug in `showReviewQueue()`.
- **Status vocabulary**: "Hafnað" added to the main list's status filter dropdown and
  label/badge maps. The panel's status chips are the three default review statuses only;
  the rejected audit view is reached via the main list's "Hafnað" filter, not a panel
  chip (keeps the queue = "things awaiting action").
- **Escaping**: every DB-sourced field through `escapeHtml`/`escapeAttr` (Unit-0
  stored-XSS discipline). Reuse the page's existing subject-badge helper — the panel
  must not become a 5th hand-rolled badge site (cross-file SUBJECT_NAMES duplication
  stays registered as I18-R4).
- **Expectation setting**: first deploy shows a large backlog (hundreds of proposed +
  imported needs_review rows). Intended — that is the finding being fixed.

## 7. Testing (TDD; suite from repo root is the gate)

Service (in-memory `_setTestDb`; keep the hand-copied DDL block in sync — no schema
change expected, verify):

- Queue query: status default + explicit filters, source, subject slug, `'untagged'`,
  book→subject resolution, pagination + real `total`, newest-first order, rejected
  excluded by default / included when asked.
- Counts endpoint shape.
- Approve: no-subjects path byte-identical (pinned idempotent early-return survives);
  subjects path replaces tags + approves in one tx; invalid slug throws pre-write;
  re-tag-while-approved works.
- Batch: all-or-nothing on unknown id (error names ids, DB unchanged); untagged-only
  tagging (tagged row keeps its tags, still approved); cap enforcement.
- Reject: any prior status; discussion entry content; excluded from lookup /
  findTermsInSegments / default queue; approve-after-reject works (un-reject for free).
- `exportBookGlossary` excludes rejected (new test beside the untouched "deliberately
  strict" subject pin); `getStats` rejected column.
- `getReviewQueue` describe block **rewritten** for the new function (old deleted with
  its function — not silently dropped).
- I18-R2: rewired call sites use the service mapper; DB-error path fails loud.

Routes (router.stack harness idiom): gates (EDITOR read / HEAD_EDITOR act), validation
400s, batch error shape.

Client: byte-pins for panel wiring where behavioral tests aren't feasible — pins match
FILE BYTES (escaped `\uXXXX` in terminology.html). Existing item-18 client pins
(`termFallbackClientPins`, `termHighlight`) must stay green.

E2E: retarget `terminology.spec.js` review-queue shape checks to the new contract; RBAC
specs (editor cannot approve; viewer cannot access review-queue) preserved.

## 8. Error handling

Fail loud throughout: batch is transactional and names offending ids; unknown subject
slugs 400 with nothing applied; reject reason capped; the I18-R2 rewire removes the one
swallow-to-null catch in this area. Client surfaces errors via the existing `fetchJson`
+ toast pattern (`err.data` since #270).

## 9. Register entries (append to campaign doc as I19-R\*)

- **I19-R1 `[decision]`** — `translate-chapter-titles.js` primes chapter-title MT with
  `approvedOnly:false` (`:118/:124`) — the one consumer that leaks non-approved terms to
  Málstaður; flip to approved-only or bless deliberately.
- **I19-R2 `[feature]`** — my-work "Orðatillögur" proposer card is fully built but dead
  (`getUserProposedTerms` stub returns `[]`); wiring it = query by `created_by` +
  route; gives proposers feedback on their terms' fate.
- **I19-R3 `[authz note]`** — queue actions + mining endpoints are role-gated but not
  book-scoped (a head-editor of book A can act on candidates/terms surfaced from book
  B); deliberate posture today (glossary is subject-oriented), decide with the wider
  cross-book authz lane.
- **I19-R4 `[gap]`** — `PUT /translations/:id` lets any EDITOR silently rewrite the
  Icelandic text and subjects of an **approved** translation with no status reset —
  undermines the queue's trust in "approved"; decide reset-on-edit vs gate.
- **I19-R5 `[yagni]`** — batch-reject deliberately omitted; add only if triage practice
  demands it.
- **I19-R6 `[minor]`** — mining headword dedupe is case-sensitive (`Mole` vs `mole`
  fork headwords).

## 10. Out of scope (deliberate)

- Gating proposed terms out of editor surfaces (lead decision 1 — surface + govern).
- Book-scoping authz churn (I19-R3), the proposer card (I19-R2), batch-reject (I19-R5).
- Any change to the MT-export strictness pins or the item-18 tier model.
- `merge-glossary.js` retirement (flagged by the readers as a stale-overwrite hazard;
  belongs to Batch 9 hygiene, not this PR).

## 11. Delivery

One PR (`fix/item19-glossary-review-queue` or `feat/…`), brainstorm → writing-plans →
SDD per the standing flow; `npm test` from repo root is the authoritative gate. Server-
only + terminology.html — no data op, no re-render; reaches ritstjórn via the pending
`./scripts/deploy.sh` batch. Deploy note: none beyond the standing batch.
