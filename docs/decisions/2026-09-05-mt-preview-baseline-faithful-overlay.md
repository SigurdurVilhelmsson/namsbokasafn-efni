# Decision: `mt-preview` is the complete machine BASELINE and `faithful` is a per-module human OVERLAY — editorial fixes are never written back to `mt-preview`

- **Date:** 2026-09-05
- **Status:** Accepted
- **Context owners:** [USER] (stated the model) + pipeline (verified it against the code)
- **Supersedes:** none
- **Related:** `docs/plans/2026-09-05-per-chapter-loop.md` (the loop this governs) · `docs/plans/2026-07-21-post-item17-followup-campaign.md` (⚒️ ledger item M4, whose first version contradicted this) · `docs/handoffs/2026-09-05-vefur-ch03-publish-redirects.md` · `docs/decisions/2026-08-22-editorial-work-survives-the-clean-break.md` · sister repo `namsbokasafn-vefur` `scripts/sync-content.js`

> **FROZEN EVIDENCE — banner-dated 2026-09-05.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

**What is the relationship between the `mt-preview` and `faithful` publication tracks, and where does an editorial fix land?**

The question became load-bearing because a session reasoned its way to the opposite answer and wrote it into the campaign register as a blocking finding. Confronted with organic ch03's `m00037` — a module whose paragraph the MT count-guard degraded, so the injector refused it — that session observed three true facts:

- `applyApprovedEdits` writes **only** to `03-faithful-translation/`
- `TRACK_SOURCE_DIR['mt-preview']` is `02-mt-output`, which is **READ-ONLY** and API-only
- `loadModuleInputs` **throws** for a module absent from its source dir

and concluded that an editor's fix *cannot reach a published page*, filing the item as failing the ledger's admission rule 3 (*"name WHERE the hand fix is performed"*). **Every one of those facts is true. The conclusion was wrong.** What was at stake: a real defect was recorded as unworkable, and the proposed remedies included one that would have damaged the architecture.

## Decision

**`mt-preview` is the complete machine-translated baseline for every module; `faithful` is a per-module overlay that replaces individual modules as humans review them.** An editorial fix is *never* written back to `mt-preview` — it produces a `faithful` module, and the reader sees `faithful` where it exists and `mt-preview` everywhere else.

**Consequently, letting an approved edit reach the `mt-preview` render is STRUCK as an option — not deferred, not deprioritised. It is the wrong fix.**

## Reasoning

### The model is implemented, not merely intended — on both sides of the repo boundary

Verified by reading the code, not by inference. In this repo:

- `segmentParser.js:117-120` — with no faithful file present, `loadModuleForEditing` returns `isSource: 'mt-output'`. **The editor edits the MT itself.**
- `segmentEditorService.js:1083` — `applyApprovedEdits` **seeds** the faithful file from the `02-mt-output` baseline, writing a **full module**: edited segments overlaid, every other segment carried over verbatim.
- `server/routes/segment-editor.js:1657` — the "Vista + Birta" route `POST /:book/:chapter/:moduleId/apply-and-render` applies the edits and then calls `runPipeline` with **`track: 'faithful'` hardcoded** and the `moduleId`.
- `pipelineService.js:208` → `cnxml-inject.js:4857-4863` — `runInject` appends `--module`, and `getModules` then returns **`[moduleId]` alone**, so unreviewed sibling modules are never opened and the throw above is unreachable on this path.
- `cnxml-render.js:422` — for chapter **rollups** only, a missing faithful CNXML falls back to the mt-preview one, so Samantekt / Lykilhugtök / Æfingar cover the whole chapter rather than only the reviewed part. Its own comment states the model: *"Faithful is an overlay over the complete mt-preview baseline."*

In the sister repo, `scripts/sync-content.js:9-15` states it outright in its docstring: *"mt-preview is mirrored first (with `--delete`); faithful is then copied on top WITHOUT `--delete`, so a partial reviewed translation never wipes baseline chapters."* `generate-toc.js` marks each overlaid module `reviewed: true`, which removes that module's machine-translation banner.

▶ **Two independently authored halves implement the same model. That is design, not coincidence.**

### Why the opposite conclusion was reachable, and what makes it a reusable trap

The refuted reasoning was *mechanically correct at every step*. It failed by inferring **intent** from a boundary: `applyApprovedEdits` writing only to `faithful` is a deliberate architectural line, and it was read as a broken link. This is the inverse of the failure mode this project usually guards against — here the mechanism was right and the conclusion wrong, which is harder to catch precisely because the evidence all checks out.

▶ **The general form: a boundary that separates two things on purpose looks identical to a connection that is missing.** Only the design intent distinguishes them, and intent is not visible in the code that enforces it.

### Why writing editorial content into `mt-preview` must be foreclosed rather than left open

`02-mt-output` is READ-ONLY and API-only by project rule, so the write would violate an existing invariant. More importantly it would **destroy the distinction the whole two-track system rests on**: if the baseline can contain human edits, then "baseline" no longer means "what the machine produced", `reviewed: true` no longer means "a human checked this", and the reader-facing MT banner becomes unsound. The cost is not the write; it is that nothing downstream could still tell machine output from human output.

### What was verified and what was not

**Verified by execution or by reading the named lines:** every claim in the first subsection above; that chemistry has already exercised the overlay end to end (`05-publication/faithful` holds pages across two chapters).

**NOT verified:** nobody has run a `--module` faithful render on organic ch03 to confirm the section page lands in `05-publication/faithful/chapters/03/`. The mechanism is proven on chemistry and unrehearsed for organic. **Rehearse once before relying on it** — that obligation is recorded in the register's M4 entry, not here.

## Consequences

- **Commits the project to:** treating `faithful` as the delivery track for reviewed content, per module, with `mt-preview` remaining a complete machine baseline underneath it. A chapter does **not** need all its modules reviewed before any of them can be published as reviewed.
- **Forecloses:** any path that writes editorial content into `02-mt-output` or `03-translated/mt-preview`. Reversing this would require re-establishing some other way to distinguish machine output from human output — the banner, the TM corpus's "human-verified" claim, and `generate-tm.js`'s input set all depend on it.
- **Creates follow-up work, tracked in the register, not here:** the ⚒️ ledger's M4 entry needed rewriting against this model; a per-module faithful render wants one rehearsal on organic; and the *editor-notification* half of the intended workflow — the pipeline already computes per-segment MT-error data that no server code reads — is a separate gap recorded in the register.
- **Does not change** the `01-source` read-only rules, the licence provenance rules, or which books may be published.

## Alternatives considered

1. **Let an approved edit reach the `mt-preview` render** (write editorial content into the baseline, or teach the mt-preview render to consult faithful) — **rejected, and struck rather than deferred.** It violates the READ-ONLY/API-only rule on `02-mt-output` and collapses the baseline/overlay distinction that the reviewed-banner, the TM corpus and the two-track sync all depend on.
2. **Require a whole chapter to be reviewed before any of it publishes as faithful** — **rejected as unnecessary.** It was the premise behind the refuted finding, and the code already handles partial review: `--module` scoping on inject, a per-module rollup fallback on render, and an overlay-without-`--delete` on sync. Adopting it would impose a cost the design was explicitly built to avoid.
3. **Treat the disconnect as a defect and build a bridge** — **rejected.** There is no disconnect to bridge; the bridge already exists as "Vista + Birta". Building a second one would have created the duplicate-mechanism failure this project has hit before.
