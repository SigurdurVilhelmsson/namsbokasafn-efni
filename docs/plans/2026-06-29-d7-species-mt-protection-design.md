# D7 — Species-name MT protection (Design + Findings)

**Status:** probe complete, decision made (user-approved 2026-06-29): **no protection mechanism needed.**
**Roadmap item:** D7 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md)
(Track D — biology onboarding). **Guiding directive:** robustness & future-proofing over expedience (`feedback-robustness-over-expedience`) + translations are API-only (`feedback-translations-api-only`).

## Premise (from the roadmap)

Biology has hundreds of `Genus species` binomials in `<emphasis effect="italics">` spans, extracted as
`[[i:…]]` markers. The roadmap worried the Málstaður/Erlendur API would translate the marker *content*
and mangle binomials (e.g. *Homo sapiens* must stay verbatim), and proposed protecting them — via a
no-translate marker variant or glossary identity entries — **after first probing to measure the actual
mangling rate.**

## The probe (the decisive step)

Paid, user-approved focused probe (cost model 5 ISK/1000 chars; ~172 ISK est). Harness committed at
`docs/audit/d7-species-probe.mjs` — re-runnable, reads the book tree read-only, writes only to its own
`probe-out/`.

**Method (faithful to production):** pulled **39 real biology `<para>` fragments** containing italic
binomials, ran each through the actual `extractInlineText()` so the API saw the exact production
`[[i:Genus species]]` form, then translated each in **two conditions** — (A) baseline, no glossary;
(B) with binomial→binomial *identity* glossary entries (domain `biology`). For every binomial, recorded
whether it appeared **verbatim** in the Icelandic output and whether it stayed inside an `[[i:]]` marker.
Sample covered **47 distinct binomials**, including abbreviated forms (`E. coli`, `G. lamblia`,
`T. vaginalis`) and a trinomial (`Homo sapiens sapiens`).

## Results

| Condition | Verbatim | In-marker |
|-----------|----------|-----------|
| **Baseline (no glossary)** | **46/48 (95.8%)** | 46/48 (95.8%) |
| **Identity glossary** | 48/48 (100%) | 48/48 (100%) |

**The two baseline "failures" were false positives of the probe's binomial detector, not mangled
species:**
- `Archaean cell walls do not have peptidoglycan` — a whole italic *sentence fragment*; correctly
  translated to `Frumuveggir fornbaktería hafa ekki peptíðóglýkan`.
- `Ediacaran biota` — a geological-period phrase; its segment correctly translated `Ediacaran Period` →
  `edíakara-tímabilið`.

**So every actual Latin binomial survived verbatim — ~100% baseline, no protection.** The API leaves
Latin alone because it is foreign to both source (EN) and target (IS).

## Decision: no protection mechanism

1. **Not needed.** Real binomials survive at ~100% with zero protection (0 real mangles in 46). The
   premise the roadmap hedged on is not borne out empirically.
2. **Pattern-based protection would *harm* correctness.** The two false positives show that "italic that
   looks like a binomial" also catches translatable English/scientific phrases. A no-translate marker
   driven by such a detector would freeze those phrases in English — a regression. (The identity glossary
   forced them verbatim too, at 100% — i.e. it *over-protected* them. A *curated* species glossary would
   avoid this, but is unnecessary given the baseline.)
3. **YAGNI + one-real-code-path.** Adding an unused protection path (with its own failure modes and
   maintenance) to guard a problem that does not occur is exactly the expedience-over-robustness trap the
   project directive warns against — in reverse. The robust choice here is to *not* add the code, and to
   leave a re-runnable measurement so the claim stays falsifiable.

## Deliverables

- **This findings doc** (the "documented rate" the roadmap's acceptance asked for).
- **`docs/audit/d7-species-probe.mjs`** — committed, re-runnable, PAID diagnostic (mirrors
  `docs/audit/b1-glossary-probe.mjs`). Re-run if the API's behavior is ever doubted.
- **No pipeline code changes.** No extractor/injector/render/glossary changes.
- Roadmap + memory updated; D7 marked done.

## Caveats / when to revisit

- **Sample:** 47 of ~282 distinct binomials. The result is mechanism-based (Latin is foreign to EN+IS, so
  MT passes it through), which generalizes — but it is a sample. If a future spot-check finds a mangled
  binomial, the fallback is a **curated** identity glossary (only real binomials, never pattern-detected),
  which the probe proved restores 100%. Re-run `docs/audit/d7-species-probe.mjs` to re-measure.
- **API drift:** these are live-API properties, not guarantees. The committed probe is the re-measurement
  tool if Erlendur/Málstaður changes.
- This decision is specific to **binomials**. It says nothing about other MT-quality concerns.

## Acceptance (met)

> "a sample of species names round-trips verbatim; documented rate." → 46/46 real binomials verbatim
> (~100%), rate documented here, probe committed for re-measurement.
