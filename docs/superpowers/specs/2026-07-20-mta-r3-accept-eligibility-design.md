# MTA-R3 — accept-eligibility design (supersedes the register's fix design)

**Date:** 2026-07-20 · **Branch:** `fix/mta-r3-frontend-accept-gate` · **Follows:** item 20b PR1 (#308, main `9da508a7`)

## Why this spec exists

The MTA-R3 register entry in `docs/plans/2026-07-11-pre-semester-coding-campaign.md`
carries a **fix design that must not be implemented literally**. Pre-implementation
verification (3 adversarial lenses, findings in
`2026-07-20-mta-r3-verification-findings.md`) confirmed the diagnosis but broke the
prescription. Corrections:

1. **The literal fix creates an invisible, unrevokable acceptance.** `renderSegmentRow`'s
   actions cell is `if (latestEdit) … else if (acceptance) … else`. The "Staðfest" chip
   (`:865`), the "Afturkalla staðfestingu" button (`:869`) and the `accepted-row` tint
   (`:722`) live **only** in the `else if (acceptance)` arm, which `latestEdit`
   permanently shadows. Adding the accept button to branch 1 lets an editor enter a
   state they can neither see nor leave, while completion metrics silently rise.
2. **"Non-active edit" is the wrong predicate.** It admits approved **+applied**
   (published) edits, which the backend also does not block (`applied_at IS NULL` is part
   of its guard). On a published module `loadModuleForEditing` reads
   `03-faithful-translation` as baseline, so `seg.is` is **human text, not MT** —
   attesting it as MT flips the sidecar from `edited` to `accepted` and corrupts the
   provenance record item 20b exists to protect (and PR2's corpus will read).
3. **`discuss` must be blocked** (lead decision, 2026-07-20). Accepting over an open
   disagreement lets an uninvolved editor unilaterally close a flagged four-eyes dispute,
   and forks the two definitions of done: the reviewed-union counts the module complete
   while `completeModuleReview` still refuses it (`counts.discuss === 0` gate,
   `segmentEditorService.js:716`).
4. **Enforcement belongs in the backend.** A client-only gate cannot hold — `POST
   …/accept` is directly reachable, and the eligibility rule is already encoded five
   times client-side (two of them disagreeing about `hasTranslation`). The client
   **mirrors** one authoritative backend rule.

## The eligibility rule (authoritative, in `acceptSegment`)

A segment may be accepted when **all** hold:

| # | Condition | Failure code | Status |
|---|-----------|--------------|--------|
| 1 | segment exists in the module | `SEGMENT_NOT_FOUND` | existing |
| 2 | `seg.hasTranslation` | `NO_TRANSLATION` | existing |
| 3 | `acceptedContent === seg.is` (byte anchor) | `STALE_CONTENT` | existing |
| 4 | no `pending` and no `approved`-unapplied edit | `EDIT_EXISTS` | existing |
| 5 | **no edit with `status = 'discuss'`** | `DISCUSS_OPEN` | **new** |
| 6 | **no `approved`+applied edit whose `edited_content === seg.is`** | `HUMAN_CONTENT` | **new** |

Eligible prior-edit states: **none, `rejected`, `superseded`.**
Blocked: `pending`, `approved`-unapplied, `discuss`, and published-whose-bytes-are-live.

### Why rule 6 is byte-based, not existence-based

The obvious rule — "block if an approved+applied edit exists" — would break the
**restore edge** that MTA-R4 documents as by-design and that
`acceptanceService.test.js` already pins (*"an active acceptance outranks an older
applied edit on the same segment"*). After a content restore, the faithful file no
longer holds the applied edit's text; the current bytes really are MT again, and
accepting them is honest.

The discriminator is therefore **whether the human-edited bytes are the ones now on
disk**, which is exactly the byte-anchored philosophy the service already applies in
rule 3. `edited_content === seg.is` ⇒ the editor would be attesting human text as
machine translation ⇒ block. Otherwise ⇒ allow.

## Client mirror

### One named predicate, used by the button gate and the facet

```js
// Mirrors acceptSegment's eligibility rule (server is authoritative).
function canAcceptMt(seg) { … }
```

Replaces the ad-hoc conditions at the button gate (`:876-882`) and the `unhandled`
facet (`:696-700`). The facet **widens** to include contested rows — they are genuinely
unreviewed backlog.

### Two named concepts, deliberately NOT unified

- **`canAcceptMt(seg)`** — accept-eligible: button gate + Óyfirfarnir facet. Includes
  contested (rejected/superseded) rows.
- **`isKeyboardAcceptTarget(seg)`** — the Ctrl+Shift+Enter rapid-accept stream:
  `canAcceptMt(seg) && no edits at all`. This is today's `isUnhandled` semantics,
  renamed with its rationale. Contested rows are **excluded on purpose**: the keyboard
  flow is a motor rhythm designed for virgin MT rows, and sweeping a head editor's
  rejection into it is where blind attestation happens. Contested rows require a
  deliberate click.
- Consequence: the "no unhandled segments left" toast can fire while contested rows
  still show accept buttons. The copy must say so rather than imply the module is done.

### Restructured actions cell

Acceptance affordances render **independently** of edit presence:

```
if (latestEdit)            → edit chip + review/edit affordances   (unchanged)
if (acceptance)            → Staðfest chip + revoke                (now reachable with an edit present)
else if (canAcceptMt(seg)) → Staðfesta MT button + contested hint
                             (+ Breyta, as today)
```

- **Compound chip is required, not polish.** When a segment carries both a non-active
  edit and an acceptance, the row shows the retained history chip
  ("Hafnað" / "Leyst úr gildi") **next to** "Staðfest". For an attestation feature,
  hiding that the segment was contested opens a new honesty hole while closing the
  dead-end one.
- `accepted-row` tint loses its `!latestEdit` guard.
- Contested rows get a visible inline hint (not a `title=`), so the reason is on screen
  at the moment of attestation.

## Out of scope — registered as follow-ups

- Confirm dialog before a contested accept (MTA-R7).
- `returnEditToPending` / `unapproveEdit` do not call `supersedeForEdit`, so reopening
  an edit can leave pending-edit + active-acceptance (MTA-R8).
- Cursor-set-before-await on accept failure (already MTA-R5).
- Stats-bar chips over-sum (a segment can count in both `rejected` and `accepted`) — pre-existing.

## Test plan

**Backend** (`acceptanceService.test.js`) — TDD, written before implementation:
- `discuss` edit blocks acceptance → `DISCUSS_OPEN`
- published edit whose text **is** the current baseline blocks → `HUMAN_CONTENT`
- published edit whose text is **not** the baseline (restore edge) still accepts
- `rejected` still accepts (existing pin, must stay green)
- `superseded` accepts

**Client** (`acceptanceUiPins.test.js`) — static pins are presence-proofs only; they must
match **file bytes** (raw UTF-8 Icelandic, not escapes):
- `canAcceptMt` exists and is used by both the button gate and the facet
- the acceptance chip/revoke are no longer inside an `else if`
- `isKeyboardAcceptTarget` excludes segments with edits

**E2E** (`acceptance.spec.js`): accept on a rejected-edit row → chip + revoke visible
alongside the retained "Hafnað" chip; revoke restores the accept button.
