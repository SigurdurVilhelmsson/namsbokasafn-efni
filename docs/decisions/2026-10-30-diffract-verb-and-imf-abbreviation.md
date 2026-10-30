# Decision: the verb *diffract* follows the noun ruling *beygja*, and *IMF* counts as *intermolecular force*

- **Date:** 2026-10-30
- **Status:** Accepted
- **Context owners:** [USER] (both decisions); [CODE] (the measurements and this record)
- **Supersedes:** none. It adds to two stage-1 rulings of 2026-10-11 (*diffraction → beygja*, source
  `ch10_fs-idp160423360`; *intermolecular force → millisameindakraftur*, source `ch10_fs-idm66585952`), as carried
  in `experiments/terminology-consistency/results/2026-10-29/ruling-set-2026-10-29.json`.
- **Related:** the leftover-form check (`tools/ai-review/leftover-forms.js`; the runner design's 2026-10-30
  amendment in `docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md`); its measurement
  `experiments/ai-review-pilot/ch10-2026-10-29/leftover-check-vs-prototype.json`; the active register.

> **FROZEN EVIDENCE — banner-dated 2026-10-30.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The leftover-form check, run over the ch10 pilot, raised two questions that the rulings as written do not answer.

1. ***diffraction* names only the noun.** The AI pass corrected the noun from *sveigja* to *beygja*, but left the
   verb and participle (*diffract*, *diffracted waves*), which the MT renders *sveigja / sveigjast / sveigð*. After
   the pass one ch10 sentence (`m68773:para:fs-idp173470256`) reads *bylgjur sem **sveigjast** við Bragg-hornið …
   en sú neðri sýnir **beygju** við annað horn*. The check flagged 5 such segments in every pilot run. Are they
   leftovers, or correct?
2. ***IMF* is not a use of *intermolecular force*.** The term pass offers a ruling only where its English headword
   occurs. The alt text `m68761:alt:fs-idp1251008-alt` reads "Increasing **I M F**", so the ruling was never
   offered there and the Icelandic kept *Auknir millikraftar* at every effort. No downstream check can see a
   ruling that was never offered.

## Decision

[USER], in the session on 2026-10-30:

1. **The verb and the participle follow the noun:** *diffract → beygja / beygjast*, *diffracted → beygður*. The 5
   flags per run are true leftovers.
2. **The abbreviation is an English form of the ruling:** *IMF*, *IMFs* and the spaced alt-text form *I M F* count
   as uses of *intermolecular force → millisameindakraftur*, so the AI pass is offered the ruling there.

## Reasoning

### Diffraction (measured 2026-10-30 on the chemistry English, `books/efnafraedi-2e/02-for-mt/`)

- The noun *diffraction* occurs 23 times; the verb and participle 18 times (*diffracted* 12 + *Diffracted* 1,
  *diffract* 1, *diffracts* 2, *diffracting* 2). All of them are in ch06 and ch10.
- The five flagged ch10 segments show the MT's verb forms: *sveigjast* (×3), *sveigir*, *sveigja*, and the
  participle *sveigð-* (×2) in the figure caption. The MT's rendering of the other verb uses was not censused.
- With the noun ruled and the verb not, a paragraph can carry *beygja* and *sveigjast* for one phenomenon. That is
  the inconsistency the term pass exists to remove.

### IMF (measured 2026-10-30, segment by segment, English `02-for-mt` against MT `02-mt-output`, pattern `\bI ?M ?Fs?\b`)

| | segments |
|---|---|
| English uses *IMF / IMFs / I M F* | 26 |
| … also spells out *intermolecular force* (ruling already offered) | 3 |
| … abbreviation only (ruling never offered) | 23 |
| … of those, MT has *millikraft-* | 15 |
| … of those, MT has the ruled *millisameindakraft-* | 0 |

So about 15 segments keep the old term after the AI pass, and none of them is flagged. Where the Icelandic keeps
the abbreviation, the model has nothing to change.

## Consequences

- **Ruling-set work (tools):** both changes go through the dated amendments input to
  `tools/ai-review/compile-ruling-set.js`, test-first, giving a new dated ruling set. A verb ruling for
  *diffract* (its English forms listed, since the matcher is word-bounded and *diffraction* does not match
  *diffracted*); and *IMF* forms added to the intermolecular-force ruling. Whether the amendments format can add an
  English form to an existing ruling, or needs a new amendment kind, is found out when it is built. A free offer
  measurement (old set vs new) should show the new offers before any paid run.
- **Matching the spaced form:** *I M F* is three one-letter tokens; it must match only that sequence, never a lone
  *I*. The build has to prove that with a control.
- **The leftover check is unchanged.** It already flags the diffraction leftovers; once the verb is ruled, the
  AI pass is offered it directly and should fix them.
- **The server's term sources** (`server/lib/houseStyleTerms.js`, the concept model) may need the same changes
  for the editor's checks. That joins the post-baseline work the register already holds for the 2026-10-29
  rulings.
- **Reversible** by a later amendment; nothing is applied to layer 1.
- Status and order of this work → the active register, not here.

## Alternatives considered

1. **Diffraction: noun only, the verb keeps *sveigja*.** Rejected: it leaves *beygja* and *sveigjast* side by side
   for one phenomenon, and makes the 5 flags permanent false positives in every run.
2. **Diffraction: revisit the noun ruling itself.** Not taken; the 2026-10-11 ruling stands and the verb follows
   it.
3. **IMF: leave the ~15 segments to editors.** Rejected: a known, measured gap that the AI pass can close.
4. **IMF: widen the leftover check to look wherever the English has IMF, without offering the ruling.**
   Rejected: more tool work, and the AI would still make no fix.
