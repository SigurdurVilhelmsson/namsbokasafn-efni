# §C36 B4b — design measurements, taken on PRODUCTION

**Measured 2026-08-10, read-only, against prod `sessions.db`** (`siggi@172.236.212.190:~/repos/namsbokasafn-efni`, HEAD `bc8989b6`). Nothing was written. Scripts are reproduced in §6 so every number here can be re-derived.

> This document is **evidence, frozen at its date**. Status for B4b lives in the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C36). If the two disagree, the register wins.

---

## 1. Why these measurements exist

B4b cuts `findTermsInSegments` over from the old terminology tables to `resolve()`. Before a line of design, two questions decide whether the cut-over is cheap or expensive, and **both were open**:

- **Q1 — does the `missing`-issue check have anything to lose?** The old matcher's issue detection runs on `terminology_translations.inflections`. The concept model declares `concept_term.inflections` in migration 045 and **never writes or reads it** — `045-concept-model.js` is the only concept-model file in the tree that mentions the column (verified by grep across `server/` and `tools/`).
- **Q2 — the automaton fork.** Today's `_automatonCache` is **global and book-independent**: it is built over every headword, and scoping is applied *after* matching via `partitioned`. If B4b builds the automaton over *in-scope* strings instead, it becomes per-book and the single cache slot multiplies.

A third question emerged and is answered here too: **what EN coverage does the cut-over gain and lose?**

---

## 2. Q1 — the inflection asset is real, and it backfills cleanly

### 2.1 It is not negligible

| | rows |
|---|---|
| `terminology_translations` | 28,903 |
| … with non-empty `inflections` | **9,715 (33.61%)** |
| … `status = 'approved'` | 28,903 |
| … approved **and** inflection-bearing | 9,715 (33.61% of approved) |

**A third of the corpus carries hand-entered inflections**, so the cheap outcome — "the column is empty anyway, drop it" — is **falsified**. In a heavily inflected language, base-form-only matching would report `missing` whenever an editor correctly declined the word.

> ⚠️ Note in passing: **approved = total = 28,903.** §C18's finding — that `status` is a degenerate selector because everything is `approved` — is still true on production today. B4b does not depend on this, but nothing has changed it.

### 2.2 Provenance: there is no upstream source

The raw Íðorðabankinn corpus **does not carry inflections at all**. An entry's `words[]` members expose `id · fklanguage · lexcatnames · word · synonyms · abbreviation · domain · definition · example · explanation · rownum` — and nothing else (`~/idordabanki-raw-2026-08-07/raw-EFNAFR.json`, 593 entries; shape confirmed on entry 0).

The inflections are written by the editor-facing propose path (`server/routes/terminology.js:543` → `server/services/terminologyService.js:346`). **They are a project-authored asset with no upstream to re-fetch from.** Losing them is irreversible; a re-import cannot restore them.

### 2.3 They join onto the concept model perfectly

| | count |
|---|---|
| inflection-bearing translation rows | 9,715 |
| distinct Icelandic strings among them | 7,278 |
| … that exist as a `concept_term(is).text` | **7,278 — 100.0%** |
| Icelandic strings with **conflicting** inflection sets | **0** |
| concepts per joined Icelandic string | avg 2.53, max 22 |

**Every inflection set has a home in the concept model, and no string carries two different sets** — so a join-based backfill needs no tie-break rule and cannot be order-dependent. (That last property matters: an order-dependent backfill would be §C18's defect reproduced inside its own successor.)

The avg-2.53 spread is **correct, not a hazard**: one Icelandic string legitimately appears on several concepts, and a word's inflections do not depend on which concept uses it. All rows for one string receive the same set.

---

## 3. Q2 — automaton sizing

| automaton arm | entries | vs old |
|---|---|---|
| **OLD** global (`terminology_headwords`) | 20,272 | 1.00× |
| **NEW** global (distinct `concept_term` `lang='en'`) | **61,042** (81,732 rows) | **3.01×** |
| **NEW** per-book, worst case (`liffraedi-2e` / `orverufraedi`) | 47,568 | 2.35× |

Per-book in-scope distinct EN strings, with each book's domain chain:

| book | in-scope EN | % of global | chain |
|---|---|---|---|
| `edlisfraedi-2e` | 15,867 | 26.0% | physics > astronomy > mathematics > earth-science > chemistry |
| `efnafraedi-2e` | 19,749 | 32.4% | chemistry > physics > biology |
| `liffraedi-2e` | **47,568** | 77.9% | biology > anatomy-physiology > chemistry |
| `lifraen-efnafraedi` | 19,749 | 32.4% | chemistry > biology > physics |
| `orverufraedi` | **47,568** | 77.9% | biology > anatomy-physiology > chemistry |
| `stjornufraedi` | 15,569 | 25.5% | astronomy > physics > earth-science > mathematics |

✅ **These reproduce B1's recorded scope sizes exactly** — 47,568 and 19,749 — which is what makes the *new* global figure (61,042) trustworthy rather than a fresh guess.

### 3.1 The finding that shapes the fork

**There are only 4 distinct domain-SETS across the 6 books:**

| domain set | books |
|---|---|
| `{astronomy, chemistry, earth-science, mathematics, physics}` | `edlisfraedi-2e` |
| `{biology, chemistry, physics}` | `efnafraedi-2e`, `lifraen-efnafraedi` |
| `{anatomy-physiology, biology, chemistry}` | `liffraedi-2e`, `orverufraedi` |
| `{astronomy, earth-science, mathematics, physics}` | `stjornufraedi` |

So a scope-keyed cache needs **at most 4** tries, not 6 — books sharing a chain share one. Note the key must be the **domain set**, not the book and not the ordered chain: `efnafraedi-2e` and `lifraen-efnafraedi` have the *same set* in a *different order*, and order affects resolution but not which strings can match.

**Per-book buys only 22.1% fewer entries at worst (47,568 vs 61,042) while turning one resident trie into up to four.** Global is smaller in total resident memory unless exactly one domain-set is ever live.

### 3.2 What is NOT measured here

**There is no memory ceiling in this document, and none can be derived from C24's.** C24 measured a 264–269 MB RSS delta at 20,073 headwords and its own code comment states that figure is **not the trie's number** — it bundles the per-call 28,903-row JS object reconstruction and the SQL result set, and its synthetic random headwords share fewer prefixes than real terminology, so it reads as an upper bound that "neither confirms nor refutes" a projection. **Extrapolating 3.01 × 264 MB would be inventing a number.** B4b must measure the trie directly, on the real corpus, on a box with production's memory.

---

## 4. Q3 — EN coverage delta: strictly additive

| | count |
|---|---|
| distinct old headword `english` | 20,272 |
| … present in `concept_term(en)`, exact | 20,272 |
| … present, `COLLATE NOCASE` | 20,272 |
| **lost at cut-over** | **0 (0.0%)** |

**The concept model's English strings are a strict superset of every old headword.** No term stops matching. The matcher gains 40,770 strings and loses none.

### 4.1 The control — because a perfect 100% is also what a broken join returns

Re-derived by a **different method** (in-memory sets, `nocaseKey` fold, no SQL join), paired with comparisons that must come out *low*:

| | result | required |
|---|---|---|
| **measurement** — old headwords in `concept_term` **EN** | 20,272 / 20,272 = **100.0%** | — |
| **control** — old headwords in `concept_term` **IS** | 81 / 20,272 = **0.4%** | must be low ✅ |
| **control 2** — bogus strings present | `false`, `false` | must be false ✅ |
| **reverse** — concept EN strings that are old headwords | 20,265 / 60,881 = **33.3%** | must be asymmetric ✅ |

The controls discriminate, so the 100% is the corpus, not the method. (Folded EN distinct is 60,881 against 61,042 raw — the 161-string difference is the case fold doing its job, which is itself a small positive control.)

---

## 5. Two further inputs

**Resolution volume.** `resolve()` is called once per *matched* string, not once per scope entry. **11,553 of 61,042 EN strings (18.9%) are carried by more than one concept** — those are where resolution genuinely decides. The other 81.1% are single-candidate and still need scope filtering, but cannot tie.

**Case folding is no longer inert.** The corpus holds **206 distinct EN strings containing non-ASCII characters** and **157 groups differing only by case**. `verify-b4a-gates.js` gate 4 records that the ASCII-only `nocaseKey` fold is inert "because chemistry's census has 0 non-ASCII strings" — that is a statement about the **census**, and B4b works over the **concept corpus**, where it does not hold. Whatever fold B4b uses to look up a matched string must be the same fold that produced the automaton keys, and the same `nocaseKey` that `buildPreferenceMap` uses.

**Client blast radius** (grep over `server/public/`, `server/views/`): the matcher's payload reaches the browser through `GET /:book/:chapter/:moduleId/terms` and is consumed in **three** files — `public/js/term-highlight.js` (uses `headwordId` as `data-term-id` and as the `showTermPopup()` argument; `isFallback` selects a CSS class), `public/js/segment-editor.js` (`showTermPopup`, `termData[segId].matches.find(m => m.headwordId === …)`, `isFallback` badges, `subjects` rendered via `SUBJECT_NAMES`), and `views/terminology.html`. **The concept model has `domain` (one value), not `subjects` (an array)** — so `matches[].subjects` is a genuine shape change, not a rename.

---

## 6. Reproducing these numbers

Three read-only scripts, run as `ssh <prod> 'cd ~/repos/namsbokasafn-efni/server && node -' < <script>`:

- **`b4b-measure.js`** — Q1 inflection population, Q2 automaton sizing + per-book scopes + domain-set grouping, resolution volume, case-fold census.
- **`b4b-measure2.js`** — Q5 inflection joinability and conflict count, Q6 EN coverage delta. ⚠️ Its final section (Q7, "do the old-only headwords carry editorial work") **timed out at 120 s** and produced no result. That is not a gap: Q6 measured the old-only set as **empty**, so Q7 was computing properties of nothing. Recorded rather than silently dropped.
- **`b4b-control.js`** — §4.1's control, by in-memory sets rather than SQL.

⚠️ **Use `better-sqlite3`, never the `sqlite3` CLI**, per CLAUDE.md — this project's builds differ from stock on `PRAGMA foreign_keys`, and the CLI reports the wrong answer.

⚠️ The correlated `NOT EXISTS … COLLATE NOCASE` subqueries in `b4b-measure2.js` are slow on the Linode (minutes). The in-memory-set method in `b4b-control.js` answers the same question in seconds and is the one to prefer.
