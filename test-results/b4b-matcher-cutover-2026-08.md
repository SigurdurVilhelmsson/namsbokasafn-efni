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

### 2.2 Provenance — ⚠️ CORRECTED 2026-08-10, SAME DAY. THE ORIGINAL CONCLUSION WAS FALSE.

**This section first concluded: *"They are a project-authored asset with no upstream to re-fetch from. Losing them is irreversible; a re-import cannot restore them."* That is wrong, and it was wrong in the direction that inflates the value of preserving them.**

The inflections are **BÍN-derived and fully regenerable**. `tools/fetch_bin_inflections.py` is the bulk producer — `:175` `UPDATE terminology_translations SET inflections = ? WHERE id = ?`, encoding `json.dumps(forms, ensure_ascii=False)` at `:187`. Its input is `SHsnid.csv` from Beygingarlýsing íslensks nútímamáls, placed at the gitignored `tools/data/`.

**How the error happened, because the mechanism generalises:** the search that produced it was `grep -rn "inflections" server/ tools/ --include=*.js`. The producer is **Python**, so `--include=*.js` made it structurally invisible — and the grep returned a clean, plausible answer built entirely from the editor-facing propose path (`server/routes/terminology.js:543` → `server/services/terminologyService.js:346`), which is a real but **secondary** writer. *An absence is not an answer* — and a filter you chose is one of the ways an absence gets manufactured. Found by a subagent asked to trace the origin independently, not by the grep, and not by review of its conclusion.

What in this section survives unchanged: the raw Íðorðabankinn corpus genuinely **does not carry inflections at all** — an entry's `words[]` members expose `id · fklanguage · lexcatnames · word · synonyms · abbreviation · domain · definition · example · explanation · rownum` and nothing else (`~/idordabanki-raw-2026-08-07/raw-EFNAFR.json`, 593 entries; shape confirmed on entry 0). That remains true and is why a **concept re-import** cannot produce them. The false step was concluding from it that *nothing* could.

### 2.4 The paradigms are homograph-contaminated, and the cause is in the loader

`load_bin_data:53` keeps **only** field 0 (lemma) and field 4 (form) of SHsnid's six, discarding word class (2), inflection class (3) and the grammatical tag (5); `get_inflections:81` then keys on `word.lower().strip()` alone. **Every BÍN lemma sharing a spelling has its forms unioned into one set.**

Measured on prod with a gender diagnostic — masculine `-inn` and neuter `-ið` nominative-singular definite forms, which one noun cannot both have:

| | count |
|---|---|
| paradigms containing **both** masc `-inn` and neut `-ið` | **124 of 9,715 (1.28%)** |
| paradigms exceeding 16 forms (a single noun's ceiling) | 1,352 |

⚠️ **1.28% is a FLOOR, not a rate.** The diagnostic sees only masculine/neuter *noun* collisions; same-gender homographs and noun/verb or noun/adjective merges are invisible to it. **The worst observed cases are exactly the invisible class:**

| term | English | forms | what merged in |
|---|---|---|---|
| `hverfa` | isomer | **72** | the *verb* hverfa — `horfinn`, `horfið` are past participles |
| `vinna` | work | **50** | the *verb* vinna — `unninn`, `unnið` |
| `afl` | power | 16 | a masculine homograph — `aflinn`, `aflar`, `aflarnir` on a neuter noun |
| `kúluliður` | ball-and-socket joint | 16 | `liður` (masc) with `lið` (neut) |

**The control holds:** known adjectives — which legitimately inflect for all three genders but take no suffixed article — score 0 and 0 (`afturkræfur`, `gagnhverfur`). Without that control the diagnostic would be indistinguishable from one that simply fires on gender-inflecting words.

⚠️ **There is no local signal to fix this with: `terminology_headwords.pos` is non-empty on 2 rows of 20,272.** Disambiguation must come from BÍN itself — field 1 (*Auðkenni*, the BÍN id) or field 2 (*Orðflokkur*) — both of which the current loader discards.

⚠️ **The contamination cannot be repaired in place.** A stored value is a union carrying no record of which lemma contributed which form, so un-merging requires re-consulting BÍN. **Fixing it therefore means regenerating, which is what makes the old model's values no better than a fresh run** — and is why the lead's 2026-08-10 decision collapsed "fix then backfill" into "regenerate directly onto `concept_term`" (option B).

### 2.5 Licensing constraints that bind any regeneration

From [docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md](../docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md) — cited, not restated:

- **The grant is route-bound.** Only `https://bin.arnastofnun.is/gogn/mimisbrunnur/` is covered. 🔴 The convenience URL `django/api/nidurhal/?file=SHsnid.csv.zip` returns 200 and is **outside the grant — do not use it.**
- **`KRISTINsnid.csv` (15 fields, partly prescriptive) is the better-matched source** for a textbook glossary than `SHsnid.csv` (6 fields, purely descriptive), and the script currently parses SHsnid. `Storasnid_ritm.csv` deliberately carries **misspellings** and must never be used.
- **`sessions.db` is gitignored, so storing BÍN-derived forms in `concept_term.inflections` needs no licence change.** 🔴 **But the export payload is a different matter:** adding an inflections column to the glossary export would publish CC BY-SA data under CC BY 4.0 via the unforced 2-hourly cron — invisible to both the producer gate and the shrink guard. **B4b-1 must not put inflections in the payload.**
- Credit BÍN in Ritstjóri and state that the forms are generated.

⚠️ **The acquisition route is a click-through the downloader accepts**, which is why the download is an operator action and not a scripted fetch. `bin.arnastofnun.is` is additionally a client-rendered SPA: `GET /gogn/mimisbrunnur/` returns a **3,625-byte shell with zero links and zero acceptance markers**, so the file URLs are not derivable server-side anyway.

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
