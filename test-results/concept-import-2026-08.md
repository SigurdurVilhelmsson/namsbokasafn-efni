# Concept import — measured yield, 2026-08-07

Evidence for the Part A concept model (`docs/superpowers/plans/2026-08-07-terminology-concept-model-part-a.md`).
Dated snapshot, following the precedent of `test-results/api-marker-survival.md`: this is
**evidence, not status**. Re-measure rather than trusting these numbers later.

**How it was run.** All 20 Íðorðabankinn collections fetched with
`tools/fetch_idordabanki.py --mode fetch-raw` at the mandated `REQUEST_DELAY = 1.0`, then
imported into a **copy** of `pipeline-output/sessions.db` (`/tmp/concept-import-test.db`).
No production database was modified. Nothing reads the new tables yet.

---

## ⚠️ A truncation defect was found by this run, and the numbers below are post-fix

The first fetch returned **exactly 10,000** entries for both LIFORD and LAEKN — the signature
of a cap. `fetch_collection_raw` called `_fetch_paginated` directly and inherited the
Elasticsearch 10,000-result window with none of the per-letter bypass that `fetch_collection`
has had all along. Its docstring claimed it "discards nothing"; that was false for any
collection over the window.

**The obvious check for this is vacuous.** Probing `metadata.total` also returns `10000`,
because the API caps its own reported total identically — so "fetched == reported total"
*agrees*, and proves nothing. That is why `fetch_collection`'s condition is
`if total < ES_MAX_WINDOW` rather than a comparison.

Fixed in `f97227de` by extracting `_fetch_collection_entries`, shared by both public
functions so the bypass exists in exactly one place.

| Collection | truncated | after fix | unique ids | dupes | elapsed |
|---|---|---|---|---|---|
| LIFORD | 10,000 | **10,030** | 10,030 | 0 | 555 s |
| LAEKN | 10,000 | **33,593** | 33,593 | 0 | 2,628 s |

LAEKN's 33,593 is an **exact match** to the figure recorded in
`tools/idordabanki_collections.json`. LIFORD's file records 10,031 **terms** against 10,030
**entries** fetched — those are not the same unit (an entry is a concept carrying one or more
words), so no exact-match claim is made either way.

**Corpus total: 48,859 → 72,482 entries.** The truncated fetch was missing **23,623 entries,
about a third of the corpus** and roughly 70% of anatomy-physiology.

**Known limit:** the per-letter bypass walks `LETTER_PREFIXES` (a–z, Icelandic characters,
digits). An entry whose term begins with an uncovered character is unreachable by any prefix
and would be silently absent. "We now get everything" is an inference, not a measurement.

---

## Per-collection yield

```
  EDLISFR                  4629 concepts ·  11709 terms (en 5288 / is 6421 / la 0) · 353 skipped, no Icelandic
  EFNAFR                    593 concepts ·   1329 terms (en 593 / is 736 / la 0)
  ERFDAFR                  1163 concepts ·   2737 terms (en 1204 / is 1533 / la 0)
  FARALDSFRAEDI             269 concepts ·    729 terms (en 289 / is 440 / la 0)
  FUGLAR                   2747 concepts ·   8240 terms (en 2746 / is 2747 / la 2747)
  GEIMVISINDI               210 concepts ·    442 terms (en 203 / is 239 / la 0)
  JARDEDLISFRAEDI           349 concepts ·    765 terms (en 366 / is 399 / la 0)
  JARDFRAEDI2               240 concepts ·    566 terms (en 262 / is 304 / la 0)
  LAEKN                   32916 concepts ·  95368 terms (en 39084 / is 41751 / la 14533) · 677 skipped, no Icelandic
  LAND                     2407 concepts ·   6331 terms (en 2741 / is 3590 / la 0) · 34 skipped, no Icelandic
  LIFORD                  10027 concepts ·  25510 terms (en 11235 / is 14275 / la 0) · 3 skipped, no Icelandic
  LIFORD2                   620 concepts ·   1324 terms (en 620 / is 704 / la 0)
  LYDHEILSA                 244 concepts ·    511 terms (en 223 / is 288 / la 0)
  LYFJAFRLYFJASTOFNUN       943 concepts ·   2240 terms (en 1001 / is 1239 / la 0)
  ONAEMI                    818 concepts ·   2017 terms (en 917 / is 1100 / la 0) · 125 skipped, no Icelandic
  PODDUR                    796 concepts ·   1591 terms (en 0 / is 796 / la 795) · 1 skipped, no Icelandic
      ⚠️  LATIN-ONLY — reachable by the EDITOR via Latin, never by the EN→IS MT payload
  STAERDFRAEDI             7705 concepts ·  22251 terms (en 10905 / is 11346 / la 0) · 895 skipped, no Icelandic
  STJARNA                  2357 concepts ·   5463 terms (en 2680 / is 2783 / la 0) · 30 skipped, no Icelandic
  TANNL                     652 concepts ·   1652 terms (en 761 / is 812 / la 79) · 177 skipped, no Icelandic
  TOLFR                     502 concepts ·   1414 terms (en 614 / is 800 / la 0)

  TOTAL: 70187 concepts
```

Per-file failures: **none**. No collection reported ZERO YIELD.

**PODDUR is the only LATIN-ONLY collection** (en 0 / is 796 / la 795) — the case Task 1's
`fetch-raw` mode exists for. Under the previous fetch every one of these entries was discarded
at fetch time for lacking an English side. FUGLAR (la 2,747) and LAEKN (la 14,533) also carry
substantial Latin, but alongside English.

**Concepts by domain**

| Domain | Concepts |
|---|---|
| anatomy-physiology | 33,568 |
| biology | 17,627 |
| mathematics | 8,207 |
| physics | 4,629 |
| earth-science | 2,996 |
| astronomy | 2,567 |
| chemistry | 593 |

⚠️ **Chemistry draws on a single collection (EFNAFR, 593 concepts)** and physics on one
(EDLISFR). That is the quantitative case for migration 046's fallback ordering — `efnafraedi-2e`'s
`biology` fallback is doing real work, not decoration.

---

## Verification

```
VERIFY: PASS   [yield: 70187 concepts, 192189 terms]
  ✓ model-is-non-empty — 70187 concepts imported
  ✓ every-concept-has-icelandic — 0 concepts with no Icelandic term
  ✓ one-head-form-per-concept — 0 concepts without exactly one head form
  ✓ homographs-separated — 0 concepts carrying terms of two measured senses
  ✓ domains-are-known — unknown domains: none
```

The verdict is printed with the yield beside it deliberately: every check is "count of bad
things == 0", so all five pass trivially on an empty database. `model-is-non-empty` exists
because of that, and is evaluated first.

⚠️ **`homographs-separated` is a spot-check, not a universal detector.** A "sense" is not
representable in this schema. It verifies that no single concept carries terms of two
*measured* senses, and it is exactly one oracle pair wide (`fruma`/biology, `rafhlað`/physics).
Contamination involving no measured pair passes silently. **If it ever goes red on real data it
points at Íðorðabankinn's own self-inconsistency, not at the importer — do not "fix" the import.**

---

## The three spot checks the design was derived from

**1. `cell` separates by sense — 9 concepts across 5 domains**

| Domain / collection | Icelandic head |
|---|---|
| anatomy-physiology / LAEKN | fruma |
| astronomy / STJARNA | bakfesting |
| biology / LIFORD | fruma |
| mathematics / STAERDFRAEDI | flokkur |
| mathematics / STAERDFRAEDI | fruma |
| mathematics / STAERDFRAEDI | reitur |
| mathematics / TOLFR | bil |
| mathematics / TOLFR | flokkur |
| physics / EDLISFR | rafhlað |

The design premise was three senses (biology `fruma`, physics `rafhlað`, mathematics `flokkur`)
collapsed onto one headword row in the old model. **All three are present and separate.** The
full 20-collection corpus surfaces six more — that is the model working, not a defect: one
entry is one concept, and the import never merges.

**2. `Drosophila melanogaster` → `ediksgerla`** via the Latin route, exactly as designed. Under
the previous fetch this entry did not exist at all: it has no English side and was discarded
before import.

**3. `atom` — head/synonym ranking preserved, per concept**

| Domain / collection | Icelandic terms by rank |
|---|---|
| chemistry / EFNAFR | **frumeind(1), atóm(2)** ← the expected result |
| physics / EDLISFR | frumeind(1), atóm(2) |
| biology / LIFORD | frumeind(1), atóm(2) |
| anatomy-physiology / LAEKN | frumeind(1), atóm(2) |
| astronomy / STJARNA | atóm(1), frumeind(2) |
| mathematics / STAERDFRAEDI | atóm(1) |
| mathematics / STAERDFRAEDI | einfaldur atburður(1), frumatburður(2) |

Árnastofnun's own ordering is preserved per concept. Note astronomy reverses the ranks and
mathematics carries an unrelated probability-theory sense — differences the old model destroyed
by flattening head forms and synonyms into sibling rows and bulk-stamping them all `approved`.

---

## Two design judgements, now confirmed against real data

Both were made on reasoning alone, before this corpus existed.

**`flokkur` was deliberately excluded from the homograph oracle** on the grounds that it is the
ordinary Icelandic word for the taxonomic rank *class*, so a `flokkur → mathematics` row would
fire on correct biology concepts. **Measured:** `flokkur` appears in mathematics (5), **biology
(3)**, chemistry (1) and anatomy-physiology (1). Had it been in the oracle, the gate would have
false-fired on real data.

**The oracle was reworked to stop reading `concept.domain`** after a reviewer measured that a
correct `fruma` in LIFORD plus a correct `fruma` in LAEKN would turn the gate red — `domain`
records which *collection* an entry came from, not which sense a term denotes. **Measured:**
`fruma` is present in biology (1), anatomy-physiology (1) and mathematics (1). The pre-fix rule
would have false-fired on this corpus.

---

## Comma census — the deferred `parseSynonyms` question, now answered

`parseSynonyms` splits on `/[;,]/`. On the 20-entry GEIMVISINDI fixture the comma was right
once and wrong once, so the decision was deferred to corpus-scale measurement rather than a
heuristic invented from two data points.

| | Count | Share |
|---|---|---|
| synonym fields, all collections | 32,860 | — |
| containing a **semicolon** | **0** | 0% |
| comma-only | 7,653 | 23.3% of synonym fields |
| ├ list-shaped (comma-split correct) | **7,611** | **99.5% of comma-only** |
| └ gloss-shaped (comma-split wrong) | ≤42 | ≤0.5% of comma-only |

**Conclusion: keep the comma splitting.** Removing it would break 7,611 legitimate synonym
lists to fix at most 42 glosses. The fixture's 1-for-1 split was a small-sample artefact.

⚠️ **Two caveats on these numbers.**

1. **The 42 is an upper bound, and most of it is misclassified.** The classifier calls a piece
   a gloss when its longest comma-separated segment runs to ≥6 words. Inspecting the flagged
   LAEKN cases, most are genuine multi-word synonym lists —
   `adenoma substantiae corticalis suprarenalis, functional cortical tumor, granular cell tumor
   of the adrenal cortex` is three long synonyms, not a gloss. The true gloss count is lower.
   A clear genuine gloss: GEIMVISINDI `Björgunarsamningurinn` →
   `samningur um björgun geimfara, framsal geimfara og skil á hlutum sem skotið hefur verið út í
   himingeiminn (Hugtakasafnið)`.
2. **Zero semicolons anywhere.** The code comment says "Íðorðabankinn separates synonyms with
   semicolons, sometimes commas" — the data says the opposite: commas always, semicolons never.
   The `;` branch of the split never fires on this corpus. Harmless, but the comment is wrong.

---

## Ungated diagnostic

Cross-domain head/synonym overlap — an Icelandic term heading a concept in one domain while
appearing as a rank ≥2 synonym in another: **2,906**.

Deliberately **not** gated. A term legitimately shared across two fields produces the same
pattern as contamination, and at 2,906 occurrences gating on it would fail the import over
something that is very likely not a defect. Recorded so it can be characterised before anyone
considers gating on it.

---

## Per-book domain priority (migration 046)

| Book | Fallback order |
|---|---|
| edlisfraedi-2e | physics → astronomy → mathematics → earth-science → chemistry |
| efnafraedi-2e | chemistry → physics → biology |
| liffraedi-2e | biology → anatomy-physiology → chemistry |
| lifraen-efnafraedi | chemistry → biology → physics |
| orverufraedi | biology → anatomy-physiology → chemistry |

**5 books, not 6** — `stjornufraedi` is in the `PRIORITIES` map but is not registered in this
box's database, so migration 046's `if (!row) continue` skipped it. Expected on this box; not a
defect.

---

## What this run does NOT establish

- **Nothing reads these tables.** `terminologyService.js`, the glossary export, the MT payload
  and the editor are all untouched and still on the old model. That is Part B.
- **Nothing was dropped.** The old terminology tables are all still present and authoritative.
  That is Part C.
- **No production database was modified.** This ran against a copy.
- **No term was chosen for any book.** `book_concept_preference` is empty by design — the model
  makes choice expressible; editors make it.
