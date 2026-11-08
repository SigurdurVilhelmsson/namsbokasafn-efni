# Decision: seven answers on 2026-11-08 — the 8-segment re-request route and buy; three gates (SD1); editor-data visibility (SD7); the BÍN credit; sidecar privacy; organic removal; retiring sync-content.yml; parking an expired save; the read-only editor held

- **Date:** 2026-11-08
- **Status:** Accepted
- **Context owners:** [USER] (answered 2026-11-08, after the four answers in `docs/decisions/2026-11-08-chemistry-sync-path-answers.md`; questions from the same register scan, each re-checked against its source line)
- **Supersedes:** none
- **Related:**
  - `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§2.3, 4.0, 4.2, 4.4, D8);
  - `docs/plans/2026-10-23-skerfur-development-plan.md` (SD1, SD7, G1.15, G1.16, G2.3);
  - `docs/plans/2026-10-26-pre-s-week-plan.md` (item 8, the re-request buy);
  - the active register's §C190, §C11, §C208 and its open `processQueue` and read-only-editor items;
  - `docs/handoffs/2026-11-02-sign-in-hardening.md`.

> **FROZEN EVIDENCE — banner-dated 2026-11-08.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Seven open items waited on [USER], each with its options stated in its source document:

5. How the 8 untranslated September segments are handled before the 4.5 rebuild, and whether to buy them.
6. SD1: adopt the three gates (editing, apply, release)?
7. §C190 ②: remove organic's translated files from `main`'s tree?
8. §C11 ①: retire `.github/workflows/sync-content.yml`?
9. SD7 (who sees per-editor data), and c09's two choices: G1.16 (the BÍN credit) and G2.3 (the review sidecar's fields).
10. Should `processQueue` park a queued save that is out of attempts or expired, instead of dropping it silently?
11. The read-only editor for signed-in visitors.

## Decision

5. **The 8 segments follow plan 10-10 §2.3's route, and the buy is authorized.** Build and test the small re-request mode first (it writes layer 1s and never writes over `02-mt-output`). Then buy the 8 segments, plus 15-3's answer once §C208's fix lands. June's API text is the fallback for the 7 June translated, and the 8th (a table alt only September has) goes to editors flagged if it comes back untranslated twice. [USER] authorized the buy on 2026-11-08; it runs once the mode is built and tested, with a dry run first. It is paid privately, since no grant pays API costs from S on.
6. **SD1: yes, three gates.** This amends plan 10-10 4.4, D8 and 4.0's order (4.0 moves to "before the hold is lifted"), and splits 4.2 into supersede and re-attach.
7. **§C190 ②: yes.** Remove organic's translated files from `main`'s tree in a PR of its own. `01-source/` and the glossary stay, and the same commit re-calibrates the test floor that assumed both books.
8. **§C11 ①: yes, retire the workflow.** The manual sync from vefur stays the route. CLAUDE.md's content-delivery section, which describes the workflow, is updated in the same PR.
9. **SD7: admin, plus each book's head editors for that book's editors only.** No ranking by volume, and never any time or distance; viewers see none; B1 data is never used to verify anyone's hours, pay or workload. (The plan recommended admin only; [USER] chose to include head editors for their own book.)
   - **G1.16: show the credit.** BÍN's credit and modification statement appear wherever BÍN forms appear. The lookup-insert's `__…__` wrapper is probed, and disabled until it survives inject and render.
   - **G2.3: drop `by` and `at`, and keep `generated` cut to the date.** A revoke refreshes statuses without re-stamping.
10. **Park it and show it.** A queued save that runs out of attempts or expires is kept, and the editor is told it was not saved, so they can retry or discard it.
11. **The read-only editor is held** until the tasks from the 2026-11-02 sign-in and permissions review are done.

## Reasoning

### 5. Build, then buy

- The 8 segments came back from the September MT untranslated: in the MT they are English text, not missing ids. So `--top-up`, which buys only missing ids, cannot reach them, and `--force --module` would rewrite whole modules and revert a `HAND REPAIR`. Plan 10-10 §2.3 named the narrow mode for exactly this reason.
- 7 of the 8 are Icelandic on the live site, so shipping them in English would regress readers there. An API re-request keeps CLAUDE.md § Purpose's rule that new translations come only from the API, and writing to layer 1s keeps the pure MT as received.

### 6. Three gates

- The Skerfur plan's §1 point 2 and §3 argue it: with the hold and G1.14, editing need not wait for the apply-side fixes. A single gate makes editors wait for work that only matters when edits are applied.

### 7 and 8. Housekeeping the register had unblocked

- §C190 recorded that ② was unblocked (organic is off the site) and that whether and when were [USER]'s call. Organic is not translated (OpenStax, 2026-09-23, CLAUDE.md § Organic), so its outputs on `main` serve no reader.
- `sync-content.yml` has never succeeded. vefur reports it could not publish even with a token, and armed it would run a bare all-books sync (§C11; register §C190 ⑤).

### 9. Editor data and credits

- SD7 protects B1's promise never to compare editors. [USER] extended visibility to each book's head editors, who review that book's editors' work, while keeping every rule against ranking, timing and use for hours or pay.
- The 2026-08-06 BÍN licensing record requires the credit, and showing it keeps the inflected forms editors use.
- The sidecar's `by` and `at` identify an editor and a moment; `tools/export-corpus.js` reads only `status`, so dropping them breaks nothing, while a date keeps coarse provenance.

### 10. Never drop an editor's work silently

- `processQueue` (`server/public/js/saveRetry.js`) drops such an item today without a trace. A silent drop is the failure this project keeps finding, and here what is lost is an editor's edit.

### 11. Hold the visitor view

- Since PR #557 a sign-in that matches no account is a visitor session. The 2026-11-02 review found permission work still to do, whose findings are held privately until fixed. Opening a visitor view of the editor before that work is done would widen the surface it covers.

### Checked against the tree

- **Checked:** every source line quoted in the questions (register, plans, handoff), re-read at the commit scanned; `processQueue` in `server/public/js/saveRetry.js`; no `02-mt-selected/` exists for chemistry (layer 1s is empty), and no re-request mode exists in `tools/api-translate.js` by that name.
- **Not checked:** the private sign-in review's findings.

## Consequences

- **New code work, tracked in the register:** the re-request mode (then the authorized buy); §C208's fix; organic's removal PR; the workflow's retirement PR with the CLAUDE.md update; SD7's visibility rule (G1.15, now including per-book head editors); G1.16's credit; G2.3's sidecar fields; `processQueue`'s parking.
- **Plan amendments:** SD1 amends plan 10-10 4.4, D8, 4.0 and 4.2, as the Skerfur plan's SD1 row states.
- **Reversal:** each answer can be superseded by a new record before its code lands. After the buy, the bought MT is kept as received.

## Alternatives considered

1. **June's text only, no buy** (item 5). Not chosen: it leaves the 8th segment untranslated, and the planned route already uses June's text as a fallback.
2. **Ship the 8 in English, editors fix** (item 5). Not chosen: it regresses 7 segments readers have in Icelandic today.
3. **Keep one gate** (SD1). Not chosen, for the reason above.
4. **SD7 admin only**, the plan's recommendation. Not chosen: [USER] includes each book's head editors for that book.
5. **Hide the BÍN inflections** (G1.16). Not chosen: the credit keeps a form editors use.
6. **Drop all three sidecar fields** (G2.3). Not chosen: a date keeps coarse provenance at no privacy cost.
7. **Drop with a notice, or keep the silent drop** (item 10). Not chosen: parking loses nothing.
8. **Approve or refuse the visitor editor now** (item 11). Not chosen: the permission work comes first.
