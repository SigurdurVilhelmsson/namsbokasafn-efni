# Structural-Marker Backstop — Design (Campaign Item 4, SR-OOS-2)

**Date:** 2026-07-12 · **Status:** approved by lead (Approach A, "shared rules, three consumers") · **Branch:** `fix/structural-marker-backstop`, one PR off `main` (@ `febebbcc`, post-#271)
**Campaign item:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` Phase 1 item 4
**Source finding:** SR-OOS-2 in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md:934` — "the editor's structural-marker integrity gate lives in the browser, so a save that bypasses the client (direct API call) has no server-side validation of marker balance."

## 1. Problem

The editor's structural-integrity rules — the things that must survive an edit or injection/rendering breaks three pipeline stages downstream — are enforced only in the browser:

- **Seven hard blocks** (`server/public/js/segment-editor.js:1027-1126`, `validateSegmentEdit`): EN-derived `[[MATH:N]]`, `[[MEDIA:N]]`, `[#CNX_...]` xrefs, `[doc#target]` docrefs must appear in the edited IS; original-IS-derived `[text](url)` links must be kept; `[[BR]]` and `[[SPACE(:N)]]` counts must not decrease.
- **Six advisory warnings** (odd `**`/`__`/`++` counts, `{=`/`=}` mismatch, odd `~`/`^`, cleared segment) — editor can proceed after a confirm.

A direct API call to the save endpoints skips all of it. Additionally, the rules exist as **two already-drifted client copies**: `validateSegmentEdit` (segment editor) and `edValidateSegmentEdit` (`server/public/js/localization-editor.js:878+`) — the exact copy-drift class the `seg-markers-unification` effort (7 `parseSegments` copies → one lib) cleaned up elsewhere.

## 2. Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **One shared rule module:** `server/public/js/segment-validation.js`, UMD (browser global + `module.exports`), per the existing `marker-highlight.js:110-111` / `term-highlight.js:86-87` precedent. Pure functions, no DOM, no requires. | One real code path for three consumers; the repo already has the vehicle. Approach B (a third copy server-side) reproduces the drift class this repo keeps paying for. |
| D2 | **API shape returns structured violation codes, not message strings:** `validateStructure(enText, originalIs, editedIs)` → `{ blocked: [{ code, params }] \| null, warnings: [{ code, params }] \| null }`. Codes: `math-missing`, `br-removed`, `xref-missing`, `link-removed`, `docref-missing`, `media-missing`, `space-removed`; warnings: `unmatched-pair`, `unmatched-emphasis`, `unmatched-subscript`, `unmatched-superscript`, `segment-cleared`. | Decouples rules from wording: each client pane keeps its own `UI.validation` formatters (zero editor-visible wording change); the server formats its own Icelandic 400. |
| D3 | **Server enforces HARD BLOCKS ONLY — never warnings.** | Warnings are advisory by product design (editor may confirm past them); enforcing them server-side would add save friction the lead has explicitly kept out of the editor UI. The backstop rejects only what the UI already refuses outright. |
| D4 | **Enforcement lives at the service seam:** `segmentEditorService.saveSegmentEdit()` (the funnel for both insert and update-in-place) throws a typed error (`err.code = 'STRUCTURE_BLOCKED'`, `err.violations = [...]`); the route maps it to **400** `{ error: <Icelandic summary>, violations }`. Same guard at the localization save seam (single + bulk, both direct-save and review-tier). | Service-level placement guards every route that funnels through the seam, not just the one route the finding named. `fetchJson`'s `err.data` (batch-2 rider) already delivers the payload to any client code that wants it. |
| D5 | **Server baseline = the same `en`/`is` the client GET serves** (the module loader's segment data), so client and server compare against identical inputs. | Parity by construction (see §5). |
| D6 | **Both client panes converge on the shared module** — rule bodies deleted, codes mapped to their existing formatters; `<script>` tag added to both views ahead of the pane bundles. | Kills the two-copy drift; editor-visible behavior and wording unchanged. |
| D7 | **Rule-copy reconciliation is a deliberate pre-flight step:** the plan diffs `validateSegmentEdit` vs `edValidateSegmentEdit` rule-by-rule BEFORE writing the shared module; any semantic difference (not just message granularity) is resolved explicitly in the plan, not silently by picking one copy. | The copies are known to differ in message variants; if they differ in RULES, that is a decision to record, not an accident to inherit. |
| D8 | **Propagation writes get the same guard if (and only if) they bypass `saveSegmentEdit`** — the plan verifies where `propagationService` inserts pending edits. Propagated content copies an approved edit onto identical source text, so it passes by construction; the guard there is cheap insurance, not a behavior change. | No unguarded path that writes pending-edit content should remain. |

## 3. Components

### 3.1 `server/public/js/segment-validation.js` (new, UMD)
- `validateStructure(enText, originalIs, editedIs)` per D2 — rules moved verbatim from `segment-editor.js:1027-1126` (post-D7 reconciliation).
- UMD footer identical in shape to `marker-highlight.js:110-111`; browser global `window.segmentValidation`.

### 3.2 Server seams
- `server/services/segmentEditorService.js` `saveSegmentEdit()`: after resolving the segment's `en`/`is` baseline (the function already loads module data — plan pins the exact spot), run `validateStructure`; `blocked` → throw typed error. Route `POST /:book/:chapter/:moduleId/edit` maps `STRUCTURE_BLOCKED` → 400 with Icelandic summary (e.g. `Vistun hafnað: byggingarmerki vantar eða hafa breyst`) + `violations`.
- Localization save seam (plan identifies the exact service/route functions behind `POST .../save` and `.../save-all`, both tiers): same guard, same error shape.
- The service requires the shared module via a relative path into `public/js/` (CJS `require` works against the UMD footer; precedent: the file is dependency-free).

### 3.3 Client convergence
- `segment-editor.js`: `validateSegmentEdit` body → call shared module, map codes → existing `UI.validation.*` formatters. `edValidateSegmentEdit` in `localization-editor.js`: same, keeping its `*Short` message variants.
- `server/views/segment-editor.html` + the localization editor view: `<script src="/js/segment-validation.js">` before the pane bundle.

## 4. Error handling

- 400 body: `{ error: '<Icelandic summary>', violations: [{ code, params }] }`. Only marker text/counts appear in `params` — no content echo beyond the markers themselves.
- The typed service error must not be swallowed by any catch between seam and route (batch 4 made the audit-write path never-throw precisely so route catches stay meaningful — verify the save routes' catch maps `STRUCTURE_BLOCKED` before their generic 400/500 fallbacks).
- Bulk localization save: reject the whole request with the per-segment violation list (segment IDs in `params`) — partial-apply on a structurally broken batch is worse than a clean retry.

## 5. Parity (why this cannot block legitimate editor flows)

Same rules + same baselines ⇒ the server rejects exactly the set the UI already hard-blocks. A segment whose MT baseline itself violates an EN-derived rule (MT dropped a `[[MATH:N]]`) is already un-saveable in the UI today; the backstop adds no new failure class. Existing pending/approved edits are untouched (guard applies to new writes only); the apply path re-validates nothing (approved content was validated at save time).

## 6. Testing

1. **Shared module:** table-driven unit tests per rule — one passing and one violating case per hard block, warning cases, and the identity case (edited == original passes all original-IS rules).
2. **Service seam:** for each hard-block class, `saveSegmentEdit` (and the localization seam) rejects with `STRUCTURE_BLOCKED` + correct code; a valid edit saves; update-in-place path covered.
3. **Route mapping:** 400 + violations shape (crossBookAuthz-style harness or router introspection — plan picks the cheapest existing idiom).
4. **Static pins:** both panes call `segmentValidation.validateStructure` (no resurrected inline rule bodies); both views load the script; UMD footer intact.
5. **Suite gate:** `npm test` from repo root (baseline 2396 green).

## 7. Out of scope → register

- Warnings server-side (deliberate, D3).
- Any change to marker vocabulary or injection behavior.
- The `[[SPACE]]`/`[[BR]]` count rules remain not-lower-than (an edit may ADD markers; only removal blocks) — unchanged semantics.
