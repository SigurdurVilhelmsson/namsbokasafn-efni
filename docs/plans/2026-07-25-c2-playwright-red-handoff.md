# C2 — Playwright red on `main`: session handoff

**Register item:** C2 / **I16-R14** in `docs/plans/2026-07-21-post-item17-followup-campaign.md` (P1 · correctness)
**Status:** open. Red on `main` since **2026-07-12**.
**Severity:** test-integrity. Blocks a trustworthy E2E signal — not a user-facing defect.
**Size:** small-to-medium. One session. Two spec files, no production code should change.

---

## 1. What is failing

The `Tests` workflow's **`e2e` job**. Its sibling `test` job (unit) passes — 3368/3368.

```
2 failed
  [chromium] › e2e/editor-workflow.spec.js:32:3 › Editor workflow › editor saves a segment edit
  [chromium] › e2e/ux-phase2.spec.js:89:3    › M5 revert bug regression › saved edit persists after API reload
1 skipped
174 passed (1.0m)
```

`editor-workflow.spec.js` is a `test.describe.serial` block, so its first test failing
**cascades**: the other three (`submits module for review`, `head-editor approves the
edit`, `editor sees approved status`) are reported as skipped, not run. Fixing test 1
should restore all four.

CI evidence (run on `cb919966`):

```
Error: expect(received).toBe(expected)
Expected: 200
Received: 404
  > 44 |     expect(res.status()).toBe(200);
  at server/e2e/editor-workflow.spec.js:44:26
```

---

## 2. Verified root cause

Both specs POST **synthetic segment IDs that do not exist in the fixture**, and the
SR-OOS-2 structural-marker backstop (PR #272, commit `2767b9c4`, 2026-07-12)
correctly 404s them.

The backstop, in `server/routes/segment-editor.js`, loads the **server-side**
baseline and requires the segment to exist:

```js
const modData = segmentParser.loadModuleForEditing(book, chapterNum, moduleId);
baseline = modData.segments.find((s) => s.segmentId === segmentId);
...
if (!baseline) {
  return res.status(404).json({ error: 'segment not found' });
}
if (editedContent !== baseline.is) {
  const structure = segmentValidation.validateStructure(baseline.en, baseline.is, editedContent);
  if (structure.blocked) return res.status(400).json({ error: 'Vistun hafnað: …' });
}
```

Before that commit the route accepted any `segmentId`, so the specs' invented IDs
worked. The backstop is **correct**; the specs encode a pre-backstop assumption.

The offending IDs:

| Spec | Line | `segmentId` posted | Why it 404s |
|---|---|---|---|
| `editor-workflow.spec.js` | 26 | `` `${MODULE}:para:e2e-wf-${RUN_ID}` `` (`RUN_ID = Date.now()`) | timestamped — can never exist |
| `ux-phase2.spec.js` | 98 | `'m68664:para:test-persist'` | hardcoded, not in the fixture |

**Why it went unnoticed for two weeks:** Playwright sits outside the authoritative
`npm test` gate, and CI was billing-blocked 2026-07-17 → 2026-07-25 (every job died in
~3s). Nothing surfaced it.

---

## 3. Constraints the fix must respect

**a. Structural-marker validation runs after the ID lookup.** Passing a real
`segmentId` but arbitrary replacement text can trip the second guard and 400 if the
baseline carries `[[…]]` / `{{…}}` markers. Prefer a **marker-free** baseline segment,
or construct edited content preserving the baseline's markers.

Verified marker-free segments in `books/__e2e-fixture__` module `m68664`:

```
m68664:title:auto-1                      "Efnafræði í samhengi"
m68664:abstract:auto-2                   "Þegar þú hefur lokið við þennan kafla getur þú:"
m68664:abstract-item:abstract-item-1..5  "Lýst sögulegri þróun efnafræðinnar" …
m68664:para:fs-idp77567568
```

**b. The two fixture modules resolve their baseline differently.**
`loadModuleForEditing` reads `03-faithful-translation` when it exists, else
`02-mt-output`. In the fixture:

- `m68663` **has** a faithful file → baseline comes from there.
- `m68664` has **no** faithful file → baseline comes from `02-mt-output`.

So `baseline.is` for an `m68664` segment is the MT text above. Don't assume.

**c. ⚠️ Fixture ownership — the reason the IDs were synthetic in the first place.**
`books/__e2e-fixture__` has only two modules, and the durable rule (memory
`pre-semester-campaign-2026-07`, A4 PR-1) is:

> `m68663` is **review-cycle-owned**; `m68664` is owned by **editor-workflow** and
> **ux-phase2**. A new *mutating* spec on either **races across parallel workers** —
> put mutating steps in the owner's serial describe, or seed a new book.

The unique-per-run IDs were how these specs avoided colliding. Removing that uniqueness
without replacing it re-opens the race. **Move the uniqueness into the edited
*content*** (`editedContent` can stay `` `E2E-…-${Date.now()}` ``) while the
`segmentId` becomes real and fixed — the assertions check `body.success` / `editId` /
persisted text, not the ID.

Note `ux-phase2.spec.js`'s describe is **not** `.serial` while
`editor-workflow.spec.js`'s is. If both end up mutating the *same* real segment of
`m68664` concurrently, that is a new race. Give them **different** segments (e.g.
editor-workflow → `m68664:abstract-item:abstract-item-1`, ux-phase2 →
`m68664:abstract-item:abstract-item-2`), or serialise.

**d. Do not change production code.** The backstop is behaving as designed. If you
find yourself editing `server/routes/segment-editor.js`, stop and re-read this
section — the specs are what's wrong.

---

## 4. Recommended approach

1. Reproduce first: `cd server && npx playwright test e2e/editor-workflow.spec.js e2e/ux-phase2.spec.js`.
   Confirm 404, not something else. (Browsers may need `npx playwright install chromium`.)
2. Replace both synthetic IDs with **distinct, real, marker-free** fixture segments.
   Keep run-uniqueness in the content.
3. Consider a shared helper that reads a real `segmentId` from the fixture at run time
   rather than hardcoding — the same lesson as vefur's
   `e2e/helpers/content-fixtures.ts`, where hardcoded fixture assumptions expired and
   went red while the app was correct. Optional, but it prevents the next drift.
4. Add a guard so this can't silently regress: assert `res.status()` with the response
   body in the failure message, so a future 400-vs-404 is diagnosable from CI logs
   alone.

## 5. Verification

- Both specs green locally.
- **Full** e2e suite green — confirm the 3 cascade-skipped `editor-workflow` tests now
  run and pass, and that nothing else regressed: `1 skipped` should shrink.
- `npm test` from the **repo root** still 3368/3368 (authoritative gate).
- Push and confirm the `Tests` workflow's `e2e` job goes green. `workflow_dispatch` is
  enabled on all five gating workflows if you need to re-run without a commit.

## 6. Out of scope

- The backstop itself (#272) — correct, leave it.
- Seeding a third fixture module or a new fixture book. Only if the two-segment
  split in §3c proves insufficient; that is a bigger change with its own review.
- Every other register item (C1d, C3, C4, P2 batches).

## 7. Context a fresh session should load

- This file.
- Register entry **C2 / I16-R14** in `docs/plans/2026-07-21-post-item17-followup-campaign.md`.
- Memory: `pre-semester-campaign-2026-07` (fixture-ownership rule),
  `verify-against-what-ci-actually-runs` (CI ≠ local script sets).
- `CLAUDE.md` § "CI — what actually gates, and how to read a red check".
