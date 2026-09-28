# Decision: Before editors edit again — buy the table summaries now, fix bought terms in the editor, repair the titles by hand, apply the strict font licence, check WebKit/Firefox, and fix the figure backup before any figure review

- **Date:** 2026-09-26
- **Status:** Accepted
- **Context owners:** [USER] (the five rulings) + pipeline (the audit that framed them)
- **Supersedes:** none. It refines the timing and glossary arm of the 2026-09-23 §C183 route and does not change that route.
- **Related:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` (2026-09-26 ⏩ RESUME block, §C183, §C186, §C187, §C192, §C193, §C140 ㉗ ⑭ ㊲, §C112) · `docs/decisions/2026-09-21-chemistry-terminology-rulings.md` · `experiments/figure-text-translation/REGISTER.md` · `docs/plans/2026-09-06-editor-terminology-assistant.md`

> **FROZEN EVIDENCE — banner-dated 2026-09-26.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

[USER] is moving development from the translation pipeline to the editor interface. Organic is stopped, and chemistry's 149 modules are bought and prepared.

A read-only audit, completed 2026-09-26 at 0 ISK, found five open matters in which **an option closes once editors edit again.** The mechanisms, each checked against the code on 2026-09-26:
- The first editor edit writes an MT lock, and `mtRunDecision` returns `locked-skip` before any other check.
- The editor reads the faithful file first, and any id missing from it pairs with an empty body (§C112).
- The composer version is hashed into every figure's `renderHash`, so a composer change demotes every figure approval.
- Prod's figure-review writes are not in the content backup.

Which way should each of the five matters go?

## Decision

1. **§C183: buy chemistry's 191 table summaries now, before editors open the 83 modules, with NO glossary on the wire (`--no-glossary`).**
   - First, build the add-only top-up and the paid-run guards:
     - an explicit glossary-arm flag;
     - refuse the empty, trailing and `=` spellings of `--module`;
     - per-segment Greek-letter conservation;
     - an output/input length-ratio guard.
   - Accept only if every existing IS segment is byte-identical afterwards.
2. **Wrong terminology in the already-bought text is fixed by editors (0 ISK). The re-buy option is given up.**
   - A term-keyed finder comes early in the editor phase.
   - A one-page terminology ruling sheet is prepared (§C193): per term, keep the approved word or adopt the model's word.
3. **Chapter and section titles (§C192) are settled on a title sheet, in the same sitting as the terminology sheet, BEFORE the redirect rows are written.**
   - [USER] **authorises hand-editing the ruled title lines in the READ-ONLY `books/efnafraedi-2e/02-mt-output/`**, only those lines, each recorded in the hand-repair list.
4. **Figures:**
   - **(a) §C140 ㉗: the strict font-licence reading, consistent with the 2026-09-16 STIX ruling.** Remove "Liberation" from the `FigIS` subset's internal names, add the copyright and OFL notice, and retire or recompose the June 1.07.4 figures. All of it goes into the single recompose pass.
   - **(b) §C140 ⑭: check every composed figure in WebKit and Firefox against Chromium, and on a real iPad.** [USER] allows a one-time networked `npx playwright install` on the dev box.
5. **§C140 ㊲: fix the content backup so it carries `books/*/figure-text/` (and `media/` if figure review writes there), with a test, and deploy it.**
   - Figure review on prod stays closed, including [USER]'s ㉕ batch and M8, until the recompose pass is deployed.
   - Before that deploy, [USER] confirms with a read-only count that prod's `figure_review` table is empty.

## Reasoning

### The common thread: each option costs least while nothing is locked, reviewed or approved

Measured 2026-09-26:
- 0 chemistry `*.locked` files; the one tracked lock is biology's `m66443`, which is the positive control.
- 0 chemistry faithful segment files.
- 0 of 459 figure sidecars carry a review state.

So a top-up needs no lock exemption, and a composer bump demotes nothing. Each of these stops being true the moment editors or reviewers start.

### 1 — Summaries now, no glossary

- The 191 summaries (~202k characters, ~2,000 ISK list) reach no reader: OpenStax deliberately hides `data-summary` from screen readers. Their value is completeness of the Icelandic CNXML and TM, which is what [USER]'s 2026-09-23 ruling chose.
- Buying later would need an add-only exception to `locked-skip`, and would meet §C112's empty-body pairing, exactly while editors work.
- **Why no glossary:**
  - With `--glossary-only`, §C186 would rank candidate terms over every segment EXCEPT the summaries being bought (`tools/compute-glossary-subset.js`).
  - Unprompted, the model already writes most house terms; for example `atóm` in 1,626 of 1,762 aligned chemistry segments that contain *atom*.
- The guards protect every future paid run as well as this one.

### 2 — Editors, not a re-buy

A targeted re-buy is a whole-module `--force`: ~8.5–11k ISK list for ~24 modules, close to the ~10.3k the whole book cost. It would still leave the problem half-solved:
- it re-rolls every segment, and about 25% change run to run (§C133);
- it can rename pages and revert hand repairs;
- compliance with a glossary row is partial (§C73).

The residue is real but finite, and a term-keyed finder (§C78 U3) turns it into editor substitutions. Counts, aligned segments, re-measured 2026-09-26:
- *stoichiometry*: 0 of 129 carry the approved form;
- *electrolyte*: 0 of 46;
- *dissociation*: 4 of 56;
- *osmosis/osmotic*: 0 of 42 — the model writes a consistent `osmó-`;
- *trigonal planar*: 2 of 43.

Some rows are better changed than enforced. The model's consistent form may simply be accepted, and that is what the ruling sheet decides per term.

### 3 — Titles by hand, before the redirects

- Titles were bought as isolated one-segment requests, and vefur's `generate-toc` takes the chapter title from the rendered intro page, so every changed title replaces the live one at the sync. Examples, checked by hand:
  - ch07 now reads *Efnahvörf* (reactions) for bonding;
  - ch12 reads *Hreyfifræði* (kinematics) for kinetics;
  - ch04 drops *hlutfallaefnafræði*.
- Section-title fixes change slugs. Settling them before the redirect rows are written means each row is written once, and a title restored to its live wording needs no redirect at all.
- The editor route is blocked for chapter titles until §C59 lands.
- The §C183 top-up is additive, so it cannot touch an existing title.
- This authorises a hand repair of a READ-ONLY tree. There is precedent in the ch06/ch07 title repairs, and every repair is recorded, so a later `--force` is checked against it.

### 4 — Strict licence; WebKit and Firefox

- **(a)** The same strict OFL reading [USER] applied to STIX on 2026-09-16 reaches the Liberation `FigIS` subsets, which keep the reserved name in name IDs 1/4/6. The repository and the site are public. The remedy bumps `COMPOSER_VERSION`, which is free only while no approvals exist.
- **(b)** Only Chromium has ever rendered a composed figure. iPads are WebKit, and 56 of 717 figures use an in-document `feImage`, which Firefox is believed not to support (inferred, not measured). Any remedy would be a composer change, so it belongs in the same single pass.

### 5 — Backup before review

- `scripts/git-backup.sh` PATHSPECS lacks `books/*/figure-text/`; re-checked 2026-09-26.
- A figure-review transition on prod rewrites that figure's sidecar.
- The 4a recompose rewrites every sidecar in the repo.
- Any overlap makes `deploy.sh`'s stash-pop conflict. From then on, the content backup fails on every tick (§C140 ㊲'s measured chain).

## Consequences

- The next development work, before the editor-interface work proper, is:
  - the paid-run guards and the §C183 top-up, then the ~2,000 ISK buy;
  - the ㊲ backup fix;
  - the composer changes for ㉗, and for ⑭ if needed;
  - one recompose pass.
- [USER] owes two things:
  - one sitting for the terminology and title sheets;
  - a real-iPad look at a test page.
- **Foreclosed:**
  - A re-buy as the fix for bought terminology. Reversing costs ~10k ISK and must happen before editors lock the modules.
  - A glossary on the summaries' wire. Reversing means a later re-buy of those segments.
- **Standing constraint:** figure review on prod is closed until the recompose pass is deployed.
- **The editor phase inherits:**
  - a terminology find-and-replace list, sized by the ruling sheet;
  - a term-keyed finder (§C78 U3) as an early feature.
- Status of all of this → the active register (2026-09-26 ⏩ RESUME block).

## Alternatives considered

1. **§C183 later, or not at all.**
   - *Later*: rejected — same ISK, more design, and it collides with editor work.
   - *Not at all*: rejected — it reverses the 2026-09-23 ruling and leaves 202k characters of narration in English or to editors.
2. **§C183 with an audited glossary subset.** Rejected for now: §C186 would first have to be fixed, for text no reader sees.
3. **Re-buying the worst modules, or a mix.** Rejected: cost, a 25% random re-roll, partial compliance, possible renames and reverted hand repairs.
4. **Titles through the editor, or shipped as they are.**
   - *Through the editor*: rejected — blocked by §C59, and it delays the redirects and the sync.
   - *As they are*: rejected — readers would see wrong titles, and every later fix renames a live page again.
5. **Font: notice only, a different font, or decide later.**
   - *Notice only*: inconsistent with the STIX ruling.
   - *A different font*: loses Liberation Sans's Arial metrics, on which label fitting depends.
   - *Later*: demotes every approval.
6. **⑭ on a real iPad only, or skipped.** Rejected: coverage of 10 of 717 figures, or none.
7. **㊲: open review with the fix, or rely on a rule not to click.** Rejected: a review before the recompose deploy collides with it, and one accidental click stops the whole content backup.
