# Decision: figure-label MT sends each figure's labels both per label and joined, keeps the joined wording, and flags every disagreement for an editor

- **Date:** 2026-09-15
- **Status:** Accepted
- **Context owners:** [USER] + figure-text pipeline
- **Supersedes:** none. It overrides a design rationale that lived only in code and in no decision record: the header of `experiments/figure-text-translation/translate-blocks.mjs` ("One request per DISTINCT BLOCK KEY, not one joined request").
- **Related:** [`experiments/figure-text-translation/evidence/2026-09-15-label-context-mt/`](../../experiments/figure-text-translation/evidence/2026-09-15-label-context-mt/README.md) (the measurement) · campaign register [`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../plans/2026-07-21-post-item17-followup-campaign.md) §C140 ⑪ and the implementation row that cites this file · [`experiments/figure-text-translation/REGISTER.md`](../../experiments/figure-text-translation/REGISTER.md) (the figure MT leg) · the glossary-off-the-figure-wire ruling ([USER] 2026-09-06, register §C133)

> **FROZEN EVIDENCE — banner-dated 2026-09-15.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The figure MT leg sends every translatable figure label to Málstaður as its own request, bare (no glossary, [USER] 2026-09-06). [USER]'s picture reviews kept finding short labels translated in the wrong sense: `Element` → *Þáttur*, `Product` → *Vara*, `After reaction` → *Eftir viðbrögð*. [USER]'s own diagnosis (2026-09-13): *"sending tiny fragments of text for translation seems to strip the MT-engine of context."*

The question: **what context should a figure label carry to the MT engine, and at what cost and risk?** Three things were at stake:
- **Money:** every figure bought is paid per character.
- **Reader-visible quality:** a wrong-sense label sits inside an Icelandic chemistry figure.
- **The composer's premise:** the label text that comes back is drawn as-is, formulas included.

## Decision

For every figure, send the labels **both ways**: one request per label (today's shape), and all of the figure's labels newline-joined in one request.
- **Keep the joined wording.**
- **Flag every label where the two answers disagree**, so an editor sees both.

## Reasoning

### The measurement ([USER]-paid, 2026-09-15, frozen evidence above)

Setup:
- 169 labels across the 34 bought ch03/ch04 figures, all bare `/v1/translate`.
- Three arms: per label, and the labels joined in one request per multi-label figure, run twice.
- The 76 labels whose wording changed were judged blind by three model judges: established terminology, consistency with the book's own MT, and fitness as a figure label.

What joining buys:
- **Sibling labels resolve the sense of a short, ambiguous label.** Every label the judges rated wrong in the per-label shape came back right or acceptable when joined. Examples: *Frumefni*, *Sameindamassi*, *Myndefni*, *Eftir hvarf*.
- **A one-figure probe showed the alt text adds nothing beyond the sibling labels.** It cost about 14× the characters, and on one run it rewrote formula digits to Unicode subscripts.

What joining costs:
- **Established multi-word terms become unstable.** `Stoichiometric factor` was *Efnajöfnustuðull* every time per label, and took several different forms when joined, some wrong.
- **The joined arm scored below per-label on some labels.** One joined run also dropped a word from a sentence fragment.

The per-item better/same/worse counts, the wrong/acceptable/correct counts and the run-to-run variation are in the evidence README and `verdicts.json`. They are deliberately not restated here.

### Why both, not either

**Neither shape dominates.** Joining fixes a class of error that per-label MT cannot see (sense), and per-label MT holds a class that joining loses (term stability). Where the two agree, both kinds of context produced the same wording. Where they disagree is exactly where one of the two classes of error lives, and a human editor is the only reliable judge there.

The run-to-run variation of each shape alone is the same order as that disagreement set. So a single joined run cannot be trusted without the per-label control beside it.

### Why keep the joined wording by default

- **On the judged set, joined won far more often than it lost.**
- **Its wins are the reader-visible, wrong-sense errors.**
- **Its losses are mostly stable-term substitutions** that the disagreement flag surfaces to the editor anyway.

### What was not verified

- **The judges are models, not Icelandic chemistry teachers.** Many "acceptable → correct" gains are style conventions [USER] may not share, such as `Mól af X` → `Mól X` and imperative → participle.
- **Only one figure set was measured.** It is one textbook's ch03/ch04 figures.
- **Split-back held on every joined answer measured**, but the corpus is small and §C118 has measured the model restructuring joined payloads elsewhere.

## Consequences

- **MT spend for figure labels roughly doubles**: the joined request carries the same characters as the per-label requests, plus newlines. It stays small per figure.
- **The implementation must guard the joined answer:**
  - A joined reply that does not split back into exactly the label count must not be used; fall back to the per-label wording and flag the figure.
  - A joined reply that alters a formula, digit or symbol relative to the English must not be used; the alt-text probe saw exactly this.
  - Both guards need tests that can fail.
- **The sidecar and the editor's review panel need a place for the disagreement flag and both candidates.** Without it the decision has no effect on quality.
- **The per-block rationale in `translate-blocks.mjs` is superseded** once the implementation lands. That file's key de-duplication (one request per distinct key) still applies to the per-label arm, and to the order of labels in the joined request.
- **It does not reopen the glossary**: both arms stay bare (§C133).
- **Reversing it is cheap**: turn off the joined arm. Figures already bought keep whatever wording their sidecars hold.
- **Follow-up work:** building it is tracked in the campaign register (§C140). The separate batch of editorial label corrections [USER] will run is tracked there too. Neither status is restated here.

## Alternatives considered

1. **Keep per-label only (status quo).** Rejected: it reproduces the wrong-sense labels every time. The error is stable, not sporadic.
2. **Switch wholesale to joined.** Rejected: it trades wrong-sense words for unstable established terms, with no signal to the editor about which labels moved.
3. **Prefix the figure's alt text as context.** Rejected: no measurable gain over the sibling labels, many times the characters, and a formula rewrite seen on one run.
4. **Send the glossary on the figure wire to pin terms.** Not reopened: [USER] ruled the figure leg bare on 2026-09-06 (§C133).
5. **Leave all correction to editors.** Rejected as the only mechanism: editors cannot see which labels are likely wrong. The disagreement flag gives them that list, and [USER]'s planned correction batch covers what is already bought.
