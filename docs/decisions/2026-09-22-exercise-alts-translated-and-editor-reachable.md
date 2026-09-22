# Decision: exercise image alts are translated, and exercise content must eventually reach the editors

- **Date:** 2026-09-22
- **Status:** Accepted
- **Context owners:** [USER]
- **Supersedes:** none. It overrides the premise of one code comment, not a prior decision record: `server/services/segmentParser.js` excludes `exercises-segments.en.md` from the editor as *"os-embed pipeline data, not an editable module"* — the premise the register already measured as false for organic (§C82 L148).
- **Related:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C126 row 3, §C123, §C82 L148, the 2026-09-22 late-night ⏩ RESUME, and the item that owns the editor work) · `docs/decisions/2026-09-22-organic-text-before-figures-exception.md` · `docs/plans/2026-09-05-per-chapter-loop.md`

> **FROZEN EVIDENCE — banner-dated 2026-09-22.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

§C126 #3 made organic's exercise `<img>` alt text extractable: every non-blank alt in a translated exercise field is now a segment of type `alt` (2,375 alts, 288,603 characters, across 31 exercise bundles). That settled that the alts *can* be translated. It left two questions open:

1. **Are they to be translated at all** — i.e. bought, per chapter, as part of the exercise bundle — or left in English as a known gap?
2. **Who can correct them afterwards?** Exercise content is **MT-only** today. The segment editor filters out every `exercises-segments.en.md` (§C82 L148), and no path writes a faithful-track exercise IS file. Runs and alts alike can be translated only by buying MT, and never reviewed by a person. At stake is **close to half of organic's text**, not an edge. Measured 2026-09-22 on the whole-book extract: exercise bundles hold **9,039 of 20,128 segments (44.9%)**, alts included. (L148's 91% and its "29 of 31 chapters list zero modules" were pre-extraction figures that L148 itself marks as expiring. Every organic chapter now has module files, so those numbers no longer describe the book.)

## Decision

**[USER], 2026-09-22, verbatim:** *"The alts should be translated and we will have to get them to the editors eventually. Make sure that is permanently logged."*

- **The alts are translated.** A chapter's exercise alts are bought with that chapter's exercises. An English alt on a published organic page is a defect to fix, not an accepted state.
- **Exercise content must be brought into the editor.** The exclusion is a gap to close, not a design boundary. "Eventually" sets no date and no order relative to other work; the register owns scheduling.

## Reasoning

### An alt is what a screen-reader user gets instead of the figure

§C123 set the severity: it is accessibility, not cosmetics. An Icelandic chapter that gives a screen-reader user English prose in place of a figure is a worse failure than visible English, because sighted review never meets it. The census found the alts are mostly real descriptions (*"The ball and stick model of ethane where grey and black spheres represent hydrogen and carbon"*), not decoration. Some solutions consist of an image alone (e.g. `01-04-OC-P04`), and there the alt is the only text that solution has.

### MT-only is not a resting state for this project

The project's standing model is MT as a *baseline* and human review as the quality step. The faithful track and the translation memory both depend on that review. Content that no editor can reach can never become human-verified, so it can never enter the faithful track or the TM, both of which exist for human-verified content. For organic, that is close to half the book. The editor exclusion was written when exercises looked like pipeline data. L148 measured that for organic they are fully translated prose (4,367 of the then 6,664 run segments carried real prose).

### What was verified against the tree, and what was not

- **Verified:** the editor filter exists and is the only mention of exercise bundles under `server/`; nothing writes `03-faithful-translation/*/exercises-segments.is.md`; the alt segments reach the MT as translatable prose and are written back at the right image (§C126 #3's four-column measurement, recorded in the register and its commits).
- **Not verified, and the reason this is "eventually" rather than "next":** what the editor exclusion was protecting. L148 flags that exercise segment ids have a different shape (`{nickname}:{type}:{elementId}`, e.g. `05-02-OC-P01:stem:347075-b0`), so the save path, `applyApprovedEdits` and the faithful-track assembly may all assume the module shape. The editor work starts by measuring that. It cannot start by deleting the filter.

## Consequences

- **Every organic chapter buy includes its exercise alts.** Because `mtRunDecision` skips on file existence and every organic chapter already has committed exercise MT, buying the alts today means a `--force` re-buy of the whole bundle, runs included. **Whether to build segment-granular buying instead is NOT decided here**; the register owns that question.
- **The 19 alts that read `"Alt Text Placeholder"`** (OpenStax's own) are covered by the ruling as worded: they are alts, and the extractor emits them. This ruling does not single them out. Excluding them from MT would be a separate call.
- **The exercise-editor work is committed work, not an optional improvement.** It is owned by one register item. Its status lives there, never here.
- **It composes with the organic text-before-figures exception** (`2026-09-22-organic-text-before-figures-exception.md`): editors stay off a text-bought chapter until its figures land. So exercise content reaches editors when that chapter opens to editing, not earlier.
- **Reversal cost:** low for the alt half (stop buying the `alt` type; the segments stay harmless in the EN bundle). The editor half has no cost until the work begins.

## Alternatives considered

1. **Leave exercise alts in English as a known gap.** Rejected by the ruling. It is the accessibility failure §C123 describes, and it is not reachable by any editor to fix later.
2. **Translate the alts but keep exercises MT-only permanently** (accept the editor exclusion as a design boundary). Rejected by the ruling ("we will have to get them to the editors eventually"). Close to half of organic would then stay forever outside human review, the faithful track and the TM.
3. **Treat the 19 placeholder alts as blank.** Not adopted. The ruling covers alts as a whole, and the extractor keeps emitting them.
