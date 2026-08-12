# Decision: Íðorðabankinn's rank-1 is a source ordering, not editorial consent — contested headwords need an explicit preference before the glossary is adopted

- **Date:** 2026-08-12
- **Status:** Accepted
- **Context owners:** lead (terminology) + pipeline
- **Supersedes:** none
- **Related:** [`../plans/2026-07-21-post-item17-followup-campaign.md`](../plans/2026-07-21-post-item17-followup-campaign.md) §C62 · §C63 · §C36 · §C18 · [`../plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md`](../plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md) · [`2026-08-12-matecat-evaluation-and-editor-architecture.md`](2026-08-12-matecat-evaluation-and-editor-architecture.md)

> **FROZEN EVIDENCE — banner-dated 2026-08-12.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The concept model already holds Íðorðabankinn. Adopting it into the MT glossary is a large,
cheap quality win and is wanted **before** a corpus-wide machine translation, because the
glossary is an MT *input* and changing it later is what would create a second translation bill.

**But `atom` has two Icelandic terms in every relevant domain, and the source ranks them.** So:
when Íðorðabankinn offers more than one Icelandic term for a headword, **does its rank order
settle the question, or does it merely propose an order that a human must still ratify?**

What was at stake: whichever answer holds is applied silently to **6,024 concepts** in the three
pilot domains alone, and it determines the Icelandic that readers see across the whole corpus.

## Decision

**Rank is a source ordering, not editorial consent.** Where Íðorðabankinn offers competing
Icelandic terms, its rank-1 must not be treated as a ruling — the headword needs an explicit
per-book preference, or a deliberate decision to let rank stand.

**For `atom`, the lead's stated preference is `atóm`, not `frumeind`** — *"at least for now"*,
which this record carries as a lean, not a closed question.

## Reasoning

### The rank order is against both the lead and the machine, measured

Read from the production concept model on 2026-08-12: in **all three** pilot domains
Íðorðabankinn ranks **`frumeind` = 1** and **`atóm` = 2** — chemistry (concept 4744), physics
(859), biology (47593), each `source = idordabankinn`. Without a preference row the resolver
takes rank-1, so **adopting the export as-is publishes `frumeind`.**

Independently, the §C56 pilot produced the opposite. Because `atom` is *contested* in the current
chemistry glossary, `formatGlossary` **omitted both candidates**, so the machine translated it
with **no guidance at all** — and across chemistry ch20 it produced **`atóm` 296 / `frumeind` 0**
against 287 English `atom*`, correctly inflected across eight forms.

**So the two independent signals available — the lead's judgement and the model's unguided
output — agree with each other and disagree with rank-1.** That is the entire basis for this
decision; neither signal alone would have been enough.

### This is not about one word

**6,024 concepts in the chemistry, physics and biology domains carry more than one Icelandic
term** (measured against the production DB). `atom` is not a special case — it is the one
instance that happened to be visible, because a lead noticed it. The other ~6,023 would be
decided by rank-1 silently, at adoption time, with no record that a choice was made.

Project memory already records Íðorðabankinn as **authoritative but self-inconsistent ⇒ adopt
per-term**. This record is that rule meeting a concrete mechanism.

### Why the mechanism was checked rather than assumed

`book_term_preference` exists, is read by `conceptResolver.buildPreferenceMap`, and was **empty**
(0 rows) when this was written. Its key is `(book_id, chapter, english)` with **`chapter = 0` as
the book-default sentinel** — so a book-wide preference is **one row, not one per chapter**. That
detail was verified in the code, because an earlier reading of the schema alone suggested the
opposite and would have made the fix look ~22× more expensive than it is.

### What was NOT checked

- Whether rank-1 is wrong for any of the other 6,023 contested concepts. **Only `atom` was
  examined.** No claim is made that Íðorðabankinn's ordering is generally poor — only that it is
  not consent.
- Whether `atóm` is right for every book. The preference is per book by design; physics,
  chemistry and biology are separate rows and separate judgements.
- Any downstream reader-visible effect, since nothing has been adopted.

## Consequences

- **Adopting the Íðorðabankinn export is no longer "free quality".** It imposes ~6,024 rank-1
  choices per adoption. That does not make adoption wrong — the approved-term gain is large — but
  it must be *chosen*, not absorbed silently.
- **A contested headword now has three legitimate outcomes**, and picking among them is editorial:
  set a preference, deliberately let rank stand, or leave it contested so the term is omitted and
  the model translates unguided. **The third is what produced the `atóm` evidence**, so "omit and
  observe" is a genuine instrument, not merely a failure state.
- **Forecloses**: treating a future glossary adoption as a mechanical refresh. Any adoption that
  changes competing-term resolution is an editorial event.
- **To reverse**: delete the preference row(s) and re-export. Cheap while nothing has been
  machine-translated against them; **expensive afterwards, because the glossary is an MT input**
  and a changed preference is a reason to re-translate. That asymmetry is why this is being
  settled before the corpus run rather than after.
- **Follow-up work is tracked in the register** (§C62 owns the adoption, §C63 the status
  semantics). This record does not state where any of it stands.

## Alternatives considered

1. **Let rank-1 stand everywhere; correct terms later in the editor.** Rejected: the correction
   would land *after* a corpus-wide MT, and re-translating is the cost the whole sequencing
   exists to avoid. It also inverts the burden — every one of 6,024 choices would need catching
   by an editor rather than being decided once.
2. **Leave contested headwords omitted, as the current chemistry glossary does.** Rejected as a
   general policy, though kept as a deliberate option: omission means the MT gets *no* guidance
   for exactly the words most likely to need it. It is useful as an instrument (it is how `atóm`
   was measured) and poor as a default.
3. **Record `atóm` globally rather than per book.** Rejected: the mechanism is per book, the
   domains are genuinely separate concepts in the model, and a physics decision should not bind
   chemistry by accident.
4. **Defer the whole question until after the corpus MT.** Rejected on cost asymmetry — this is
   the same reasoning as the 2026-07-06 re-MT decision, one level down: the reversible side
   (setting a preference now) is cheap, the irreversible side (re-translating) is not.
