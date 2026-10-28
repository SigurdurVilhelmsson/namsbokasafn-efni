# Decision: the deterministic rule layer's edits also reach editors only as suggestions

- **Date:** 2026-10-28
- **Status:** Accepted
- **Context owners:** [USER] (ruled 2026-10-28, after a pre-push review found that the rule layer had no route to
  editors or readers)
- **Supersedes:** none. It extends `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`, which routed only
  the AI term pass's edits.
- **Related:**
  - `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§1 points 0 and 5, §4, §5's slip rule, 2.4, 3.1, 4.1);
  - `docs/plans/2026-10-23-skerfur-development-plan.md` (G1.23);
  - `docs/plans/2026-10-26-pre-s-week-plan.md` (§1 point 3, Tier 1 item 3, §4's slip rule, §6 items 5 and 11);
  - the active register's ⏩ RESUME block.

> **FROZEN EVIDENCE — banner-dated 2026-10-28.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The 10-10 plan applied [USER]'s rulings to the editors' starting text in two steps:
- first the deterministic rule operations of 10-10 3.1: key-terms headwords and bold definition terms, markup
  normalisation, and computed exact swaps where competitor and target share a declension class;
- then a narrow AI pass.

The earlier record of the same day moved the AI pass's edits into a suggestion view and kept every unit's starting text
pure MT. It said nothing about the rule layer, which was left with no route to editors or readers. Plan text still
routed fixes through it: the slip rule ("freeze with the rule layer") and 2.4's markup normalisation.

## Decision

**The rule layer's edits reach editors as suggestions, in the same view as the AI's.**
- They are labelled as rule edits, with accept-all per ruling.
- Every unit still starts from pure MT (the selected layer).
- An accepted rule edit is logged as an assist of its own type.
- **Accept-all per ruling is an assist, not an acceptance.** It applies a ruling's suggestions in one action. It does
  not mark any segment reviewed or accepted: that stays a per-segment human act under the 2026-07-19 lead decision
  (the follow-on plan's SD5).
- **Rule and AI suggestions are both computed against the editors' starting text** (layer 1s, or pure MT where there
  is no 1s). Neither is applied before the other, and the AI pass reads 1s, as the runner already does.

## Reasoning

- **It keeps the earlier record true.** Every unit starts from pure MT.
- **One channel for machine suggestions.** This is the same principle as the grammar-help ruling (the follow-on plan's
  SD9 note): editors judge every machine change in one place, and B1 sees each as a labelled assist, rule or AI.
- **The volume is modest.** The rule layer is 64 headwords plus the bold definition terms (not yet counted), a few
  markup defects (2.4: 42 MT-invented tags and some legacy marks) and computed swaps. Accept-all per ruling keeps the
  clicks low whatever the count.
- **Checked against the tree:** no rule-layer producer is built on `main` (a search of `tools/` and `server/` finds
  none), so nothing built is re-routed. The layer tooling already anticipates one: `tools/lib/mt-layers.js` validates
  change records whose source is `rule` or `ai`, with a rule id for rule changes. The AI runner reads layer 1 and its
  `02-mt-selected` overlay (`tools/ai-review/term-pass.js`), with no rule layer applied first.

## Consequences

- **G1.23's view shows both kinds**, told apart by label, with the same keying, hiding rule and logging.
- **The slip rule changes meaning.** If a category of AI suggestions fails the short look, that category is not shown;
  rule suggestions are unaffected. "Freeze with the rule layer" now means "show rule suggestions only".
- **The MT preview takes no rule-layer or AI edit.** Its selected pure MT stays as it is, and whether it should take
  rule or AI edits is part of the decision the register defers to the next chemistry sync. 2.4's render check decides
  whether its markup defects reach readers at all. **Fixes already scoped to ride the whole-book re-render are not
  rule-layer edits and keep that route:** H1–H4 from the reader repository's requests ([USER], 2026-10-17, register
  §C201).
- **The per-unit rule applies to rule suggestions too.** A unit gets them only if they and the view existed before it
  was opened.
- **G1.4's consent text covers rule suggestions as well as AI ones,** since each decision on either is logged.
- **Reversibility.** Applying the rule layer to the starting text later would need a superseding record, and a loader
  that reads a rule-applied layer.
- **Follow-up is tracked in the active register,** not here.

## Alternatives considered

The options put to [USER] on 2026-10-28:

1. **Applied before editing (the 10-10 design).** Not chosen: it contradicts the earlier record ("every unit starts from
   pure MT"), so it needs a superseding record and a loader that reads a rule-applied layer. Editors would also not see
   which words a rule had changed.
2. **Decide later.** Not chosen: the slip rule and 2.4 would keep pointing at a route that no longer exists.
