# Decision: what research capture takes from each editor, how long its copies live, and the order in which units open

- **Date:** 2026-11-03
- **Status:** Accepted
- **Context owners:** [USER] (ruled in the G1.1 + G1.2 brainstorm on 2026-11-03, choosing among the options below,
  then answered three questions the draft raised; approved the design that records them, as written, the same day)
- **Supersedes:** none. It changes two Skerfur plan rows (a plan, not a decision record): G1.1's per-unit manifest
  (R5) and G1.4's "an editor who declines is not used in research" (R1). Each row carries a dated note citing this file.
- **Related:**
  - `docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md`, the G1.1 + G1.2 design. Its §4 holds
    what each ruling means for that design, and §14 holds the three answers. This record does not restate them;
  - `docs/plans/2026-10-23-skerfur-development-plan.md`, §3.1 rows G1.1, G1.2, G1.4, G1.7, G1.12, G1.13, G1.15, G1.20
    and G3.2, and §4.1 (the measurement protocol's content);
  - `docs/superpowers/specs/2026-11-02-suggestion-view-design.md` (G1.23; its §6.2 makes R6 matter);
  - `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md` and
    `docs/decisions/2026-10-28-d12-and-editor-licence-answers.md` (the consent notes and the licence clause these
    rulings read with);
  - the active register's ⏩ RESUME block.

> **FROZEN EVIDENCE — banner-dated 2026-11-03.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Building G1.1 (served versions) and G1.2 (the event log) forced nine questions whose answers bind more than that
project. They decide what the consent text can promise (G1.4), what the protocol may measure (G1.5), what the freeze
and the corpus release carry (G1.7, G3.2), the order of three gate items (G1.12, G1.13, G1.23) and what the backups do
(G1.20):

1. What may the study use from an editor who declines research consent?
2. How long may copies of research data survive a deletion?
3. What does the consent text promise about the records the editing tool keeps for every editor?
4. What happens to the 285 duplicated segment ids before G1.12 lands?
5. What replaces G1.1's per-unit manifest, now that D7 is closed?
6. Which comes first: assigning chapters, or switching the suggestion view on?
7. (A1) Read literally, R3 ("research figures come only from the research file") rules out the main figure. What does
   it mean?
8. (A2) Should R5's end-of-editing export list every edit, or only each segment's final text?
9. (A3) The note that counts a lost research record outlives R2's 7 days in the editorial backups. Is that acceptable?

At stake: whether the contract figure stays whole, whether the consent text's promises are true of every copy, and
whether any captured row can describe text the editor never saw.

## Decision

Each ruling was the recommended option.

- **R1, decliners: finished text only.** A decliner's approved, licensed text counts in the per-unit change figure
  (pure MT → approved final, for each of the 134 units). Nothing about how or when they worked is captured. A
  consenting reviewer's act on a decliner's edit is logged with no key or link for the edit's author.
- **R2, backups of the research file: its own 7-day rotation,** apart from the editorial database's tiers, so a
  deletion is complete within 7 days, and the consent text says so. **Precondition:** a read-only check that no
  whole-disk backup or `tar` job also copies the file. *(The approved design sends the off-box copies to their own
  bucket rather than under a name prefix in the editorial one, because the encrypted bucket cannot scope a rule to a
  prefix; that is design §14 call 22.)*
- **R3, records the tool keeps for everyone: named in the consent text, never research data.** They stay under the
  ordinary retention rule (G1.15). Identity and time are left out of new records wherever that costs nothing. A
  withdrawal before publication means results are recomputed without that editor; aggregates already published stay.
- **R4, duplicate ids: G1.12 first, refuse meanwhile.** G1.12 lands before any of the 83 affected modules opens. Until
  then a save or accept on a duplicated id that cannot be placed is refused.
- **R5, the per-unit manifest: replaced** by G1.7's freeze manifest, committed in full at the freeze, and an
  end-of-editing export (shape: A2).
- **R6, order: switch on, then assign.** Chapters are assigned (G1.13) only after the suggestion view (G1.23) is on in
  production. If G1.23 slips, [USER] decides again then.
- **A1, R3's reading:** research figures read the research file plus reference data that names no person and holds no
  time (the served texts, the opening snapshot, a per-unit "opened after the switch-on" yes/no, committed files, loss
  counts), and never an editing record.
- **A2, the export:** one line per segment: the served version its final text was made on, that text's sha256, and a
  state (complete, reviewed but unapplied, unreviewed). No attempts, names, times or edit ids.
- **A3, loss notes:** kept, countable, in `sessions.db`; the consent text says their copies may outlive the 7 days in
  the editorial backups.

## Reasoning

### Consent governs behaviour; the licence governs text (R1, A2)

The contract figure describes published text, which every editor licenses under CC BY whatever they decide about
research, and which survives withdrawal (the D12 record). How an editor worked (events, assists, times, attempts) is
what consent governs. Splitting along that line keeps the 134-unit figure whole without capturing anything a decliner
declined. A2 applies the same line to the export: one line per segment says what each segment ended as; one line per
edit would show attempt counts, which for a decliner is "how they worked".

### A promise is only as true as its least-deleted copy (R2, A3)

The consent text must state the real lifetime of backups (G1.4). The editorial tiers are built to keep copies long,
which is the opposite of what a deletion promise needs, and a disk failure without any backup would lose the study's
raw data. A separate short rotation is the middle that can be stated honestly. The loss note is the one exception
[USER] accepted, because a loss has to be countable exactly when the research file is down, so the note cannot live
there; the consent text discloses it instead. The precondition exists because the deployment checklist recommends a
whole-disk backup and a nightly `tar` of `pipeline-output/` (`docs/deployment/linode-deployment-checklist.md` §9);
either would void the promise however the scripts behave. That was read from the checklist, not from production.

### The screen must not depend on research data, and research must not lean on editing records (R3, A1)

Withdrawing must never change what an editor sees (G1.23's anti-goal), so the editing record cannot be research data
that a withdrawal deletes. Naming those records honestly costs nothing. A1 exists because the decomposition needs the
texts editors were shown, which name no person and hold no time, and which the screen also needs, so they live with
the editing record. Reading them by value, never by an id whose order follows serve order, keeps time out.

### A row describing text the editor did not see is worse than no row (R4)

Measured at `3a1db909`: 285 ids occur twice in 83 chemistry modules. The screen cannot tell the two copies apart,
and for 75 of the ids it shows the second copy's Icelandic. Recording such saves would produce data that is complete
by every count and wrong by value, the failure CLAUDE.md's sentinel rule describes. Refusing until G1.12 lands means
no such row is ever written.

### Nothing left to hide, and a timing leak to avoid (R5)

The per-unit manifest hid D7's arm. D7 is decided, and a per-unit file committed when a unit opens would publish,
through its commit time, when an editor started. The freeze manifest holds no editor data, so it can be committed in
full. The design found that the MT lock marker already publishes the time of each unit's first edit; G1.7's freeze
closes that too (design §5.19).

### Units opened early lose their suggestions for good (R6)

G1.23 §6.2 rules that a module opened before the view is switched on never gets suggestions, and "opened" means an
assigned editor's first look. Assigning first would let ordinary looking-around remove suggestions permanently.

## Consequences

- **G1.4 (the consent text)** must say: a decliner's finished text is used; the research file's backups live 7 days;
  loss notes may outlive them; the editing records are named and never research; results are recomputed after a
  withdrawal before publication. The full list is the design's §6 until G1.4's text exists.
- **G1.5 (the protocol)** forbids research figures from reading editing records, as A1 bounds them.
- **G1.7** writes freeze markers and the freeze manifest before any unit opens.
- **G1.12** lands before any of the 83 affected modules opens. **G1.13** assigns only after G1.23 is switched on, and
  only to editors whose consent decision and licence clause are recorded.
- **G1.20** gives the research file its own rotation and bucket; its own versioning plan for the editorial bucket must
  never cover research copies.
- **G3.2** reads the end-of-editing export in A2's shape, not a per-unit manifest.
- **Forecloses:** using a decliner's process data in any form; using `activity_log` or other editing records as
  research data; opening a duplicate-id module before G1.12. Reversing R1 or R3 would need new consent from every
  editor, so it is not cheap after capture starts.
- The work these create, and its order, is tracked in the active register, not here.

## Alternatives considered

1. **R1: use nothing of a decliner's.** Honours the widest reading of "not used in research", but the contract figure
   could fall short of 134 for no gain, since the text is licensed regardless. **Everything except time:** captures
   behaviour, which consent rules out.
2. **R2: no backups of the research file:** the simplest promise, but one disk failure loses the raw data. **The
   editorial tiers:** long lifetimes that contradict G1.20's purpose.
3. **R3: treat editing records as research data:** a withdrawal would then change what editors see. **Name them and
   trim now:** a smaller promise at build cost; the design trims only where it costs nothing.
4. **R4: widen this project to build G1.12 (b):** more scope in a measurement project. **Record anyway:** wrong data
   that looks complete.
5. **R5: keep the manifest as written:** hides nothing and leaks timing. **Drop it:** G3.2 would read the database at
   release instead of a reviewed, person-free export.
6. **R6: assign early and accept the loss,** or **assign early and ask editors to wait:** the first loses suggestions
   by design, the second relies on everyone remembering.
7. **A1: copy the reference data into the research file at serve time:** duplicates data and adds a second write that
   can fail. **A2: list every edit:** shows attempts. **A3: unlinked notes** (a withdrawal cannot delete them, and a
   unit plus a day still points to its editor) or **a daily count only** (cannot say which units lost data).
