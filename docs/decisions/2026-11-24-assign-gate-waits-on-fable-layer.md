# Decision: G1.13's assign gate waits on the Fable layer being served, not on the suggestion view (R6 superseded)

- **Date:** 2026-11-24
- **Status:** Accepted
- **Context owners:** [USER] (chose option (a) below in the 2026-11-24 design conversation for serving the Fable
  layer, and approved that design the same day); [CODE] traced the gate and proposed the options
- **Supersedes:** `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`, in part: its R6
  ("switch on, then assign") only. Its other rulings are untouched.
- **Related:**
  - `docs/superpowers/specs/2026-11-24-fable-layer-serving-design.md` (§2 decision 3, §6.3, §6.7: the setting and the
    gate's new condition);
  - `docs/decisions/2026-11-24-editors-start-from-fable-text.md` (the ruling that left this for the spec to propose);
  - `server/services/assignmentGate.js` (`assignmentRefusal`, where the condition lives) and the `verify-assign-gate`
    model (`server/verification/assign-gate/`);
  - `docs/superpowers/specs/2026-11-02-suggestion-view-design.md` (G1.23; its §6.2 is why R6 existed);
  - the active register's ⏩ RESUME block, which owns what happens next.

> **FROZEN EVIDENCE — banner-dated 2026-11-24.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

R6 made chemistry chapters assignable only after the suggestion view (G1.23) was switched on in production, because
G1.23 §6.2 withholds suggestions for good from a unit opened before the switch-on. On 2026-11-24 [USER] ruled that
editors start from Fable's text and that the term pass is no longer shown. With no suggestions to lose, R6 protects
nothing. What should the assign gate wait on instead?

At stake: the study's baseline. A unit opened while the editor still serves pure MT starts from the wrong text, and a
study that opened some units on MT and others on Fable's text compares two conditions as if they were one.

## Decision

A study book's chapters may be assigned only when the loader's layer for that book is the Fable layer. The gate reads
the same book-to-layer setting the loader reads (`servedLayerFor`, in `server/lib/servedLayer.js` per the design),
and refuses with a new reason in place of `suggestion-view-off`.

## Reasoning

### What the gate protects has changed

- R6's danger was a lost suggestion. Under the 2026-11-24 ruling the danger is a unit opened on the wrong baseline.
  The condition has to name what the editor is served, not whether a view is on.
- Checked against the tree on 2026-11-24: `assignmentRefusal` refuses a study book with `suggestion-view-off` while
  the `suggestion-view` switch is off, and the loader (`loadModuleForEditing` in `server/services/segmentParser.js`)
  serves `02-mt-output` for every chemistry unit. So today no chemistry chapter can be assigned, and none had opened.

### A fact in the code, not a switch

- The gate and the loader read one setting. They cannot disagree, and the gate opens with the same deploy that ships
  the loader change and the study freeze's re-cut.
- It fails closed: if the setting is missing or the code is reverted, assignment stops.
- A switch (option 2 below) could change the served text at a moment no freeze manifest records, which the study
  freeze exists to prevent.

## Consequences

- **The `suggestion-view` switch no longer gates chemistry.** Its code stays for other uses.
- **The gate's other conditions are unchanged**: an open book, chapter 0 never assigned, the bypass roles, a consent
  decision on record, a signed licence clause.
- **The `verify-assign-gate` model must replace the switch with the setting** and be re-run when the code changes.
- **A new Icelandic refusal message**, worded in the design's §6.10 and approved with it.
- **Reversing it** before any unit opens costs one condition and its model. After units open, serving a different
  layer would mix baselines, whatever the gate says.
- The work itself is tracked in the active register, not here.

## Alternatives considered

1. **(a) The gate reads the loader's setting.** Chosen, for the reasons above.
2. **(b) A new admin switch, read by both the loader and the gate.** It would allow deploying the code first and
   switching on later, but a flip would change the served text without a new freeze manifest, so the freeze guard
   and the switch could disagree. Rejected.
3. **(c) Drop the condition.** No window exists today, because the loader change and the re-cut land in one deploy,
   but nothing would stop a later change from reopening one. Rejected.
4. **Keep R6 as written.** It waits on a view that no longer shows chemistry anything, so it would block assignment
   for a reason that no longer exists, or be switched on only to satisfy it. Rejected.
