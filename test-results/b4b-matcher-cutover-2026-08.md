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

The inflections are **BÍN-derived and fully regenerable**. `tools/fetch_bin_inflections.py` **was** the bulk producer at the time of this measurement (2026-08-10) — `:175` `UPDATE terminology_translations SET inflections = ? WHERE id = ?`, encoding `json.dumps(forms, ensure_ascii=False)` at `:187`. ⚠️ **It has since been ported and deleted, same day, under §C36 B4b-0a**: the producer is now `server/scripts/fetch-bin-inflections.js` + `server/lib/binInflections.js`, pinned behaviour-identical by a differential golden. Line numbers above are into a file that no longer exists in the tree — recover it with `git show 8072a58f:tools/fetch_bin_inflections.py` if you need to read it. Its input is `SHsnid.csv` from Beygingarlýsing íslensks nútímamáls, placed at the gitignored `tools/data/`.

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

- ⚠️ **WITHDRAWN 2026-08-10 — this said "the grant is route-bound" and marked `django/api/nidurhal/` 🔴 out-of-grant.** The lead supplied SÁM's full *Skilmálar*: **that clause is not in them.** The terms are plain CC BY-SA 4.0 plus two obligations — credit, and declare modifications. Measured: the endpoint returns `200`, `Content-Disposition: attachment`, **no acceptance step of any kind**. Recorded as register **§C41**, with a dated amendment appended to the decision record. **This entry is retained rather than deleted because the withdrawal is the finding.**
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

## 6. KRISTINsnid coverage — measured against the real file, 2026-08-10

Obtained under §C36 B4b-0 (see §2.5 as amended). **The question this answers: does switching SHsnid → KRISTINsnid cost coverage?** KRISTINsnid is *prescriptive* — it takes positions on variant validity — so it could plausibly hold fewer lemmas than the descriptive SHsnid the current values were built from. Checked against the **7,278 Icelandic strings that carry inflections on production today**:

| | count | |
|---|---|---|
| currently-inflected strings | 7,278 | |
| present as a KRISTINsnid lemma | **7,277 (100.0%)** | ✅ **no coverage regression** |
| … resolving to **exactly one** BÍN entry | 6,591 (**90.6%**) | usable under D4 |
| … resolving to **more than one** | 686 (**9.4%**) | D4 refuses |
| absent from KRISTINsnid | 1 (0.0%) | |

⚠️ **THE AMBIGUITY RATE ON OUR TERMS IS 9.4%, NOT THE CORPUS-WIDE 2.12%** recorded in the spec's §2.2.2 — technical vocabulary is **4.4× more homograph-prone** than BÍN's average lemma. **Presence and ambiguity are different questions and only one of them generalises from the corpus figure.** A spec asserting the safe rule "is cheap" on 2.12% is quoting the wrong number.

Breaking down the 686, to test whether a *nominal* restriction (prefer the sole noun entry) rescues them:

| | count | |
|---|---|---|
| exactly **one noun** entry (`kk`/`kvk`/`hk`) | 208 (30.3%) | rescuable — **this is where `hverfa` and `vinna` sit** |
| **more than one** noun entry | 472 (68.8%) | irreducibly ambiguous — **`afl` (kk + hk) is here** |
| **no** noun entry | 6 (0.9%) | genuine adjective/verb headwords (e.g. `afturkræfur`) |

So a nominal rule would recover **208 strings — 2.9% of the total — and they are the worst-contaminated ones**, because noun/verb collisions are exactly the shape that drags in a whole conjugation (`hverfa` 72 forms, `vinna` 50). It leaves 472 untouched. **It is a heuristic, not a derivation** — a glossary headword is *usually* a noun, and the 6 no-noun cases prove "usually" is not "always". Whether to adopt it is a lead decision, recorded in the spec.

### 6.1 The control

All five known chemistry coinages return **0 rows** in KRISTINsnid:

```
kjarnsækir 0 · oxósýra 0 · pniktógen 0 · mólarleysni 0 · kúvetta 0
```

**Absence is therefore detectable here, not merely unobserved** — which is what makes the 100%-present figure above mean something rather than being the output of a lookup that matches everything.

---

## 7. Reproducing these numbers

Read-only scripts, all committed to `server/scripts/`. They were **taken** by piping to stdin (`ssh <prod> 'cd …/server && node -' < <script>`) before they lived in the repo; now that they are files, run them **as files**:

```bash
ssh <prod> 'cd ~/repos/namsbokasafn-efni && node server/scripts/b4b-measure.js'
```

⚠️ **Their `require` of `dbPath` was `./lib/dbPath` when they ran from stdin and is now `../lib/dbPath`.** Those are not interchangeable: from stdin `require` resolves against **cwd**, from a file against the **file**. Piping one of these to `node -` again would now fail to resolve. This is CLAUDE.md's *resolve against something intrinsic* rule showing up in a two-line script.

- **`b4b-measure.js`** — §2.1 inflection population, §3 automaton sizing + per-book scopes + domain-set grouping, §5 resolution volume, §5 case-fold census.
- **`b4b-measure2.js`** — §2.3 inflection joinability and conflict count, §4 EN coverage delta. ⚠️ Its final section (Q7, "do the old-only headwords carry editorial work") **timed out at 120 s** and produced no result. That is not a gap: §4 measured the old-only set as **empty**, so Q7 was computing properties of nothing. Recorded rather than silently dropped.
- **`b4b-control.js`** — §4.1's control, by in-memory sets rather than SQL.
- **`b4b-shape.js`** — §2.1's JSON contract (all 9,715 parse to arrays of non-empty strings; max 72 forms).
- **`b4b-contamination.js`** — §2.4's contamination floor and its adjective control, plus the `pos` availability census.

§2.2.1's source-level confirmation and §6's coverage figures were taken with `awk` over `tools/data/KRISTINsnid.csv` (gitignored; **not committed, and must not be**). Recorded verbatim so they can be re-run:

```bash
# §2.2.1 — which BÍN entries share a lemma, and how many forms they union to
for w in afl hverfa vinna; do
  awk -F';' -v W="$w" '$1==W {k=$2";"$3; if(!(k in s)){s[k]=1; print "  id "$2" "$3" ("$4")"}}' KRISTINsnid.csv
  awk -F';' -v W="$w" '$1==W{print $10}' KRISTINsnid.csv | sort -u | wc -l
done

# §2.2.2 — corpus-wide lemma ambiguity
awk -F';' '{k=tolower($1); if(!(k";"$2 in s)){s[k";"$2]=1; n[k]++;
  wc[k]=(wc[k]==""?$3:(index(wc[k],$3)?wc[k]:wc[k]","$3))}} END{
  for(l in n){tot++; if(n[l]>1){multi++; if(split(wc[l],a,",")>1) multiwc++}}
  print tot, multi, multiwc}' KRISTINsnid.csv

# §6 — coverage, against the prod string list (regenerate it with the SELECT in §7.1)
awk -F';' 'NR==FNR{want[tolower($0)]=1;n++;next}
  {l=tolower($1); if(l in want){k=l";"$2; if(!(k in seen)){seen[k]=1; ids[l]++;
   if($3=="kk"||$3=="kvk"||$3=="hk") nouns[l]++}}}
  END{for(w in want){if(w in ids){present++; if(ids[w]==1)uniq++; else multi++}}
  print n, present, uniq, multi}' inflected-strings.txt KRISTINsnid.csv
```

### 7.1 The prod string list

```sql
SELECT DISTINCT icelandic FROM terminology_translations
 WHERE inflections IS NOT NULL AND inflections <> '' AND inflections <> '[]';
```

⚠️ **Use `better-sqlite3`, never the `sqlite3` CLI**, per CLAUDE.md — this project's builds differ from stock on `PRAGMA foreign_keys`, and the CLI reports the wrong answer.

⚠️ The correlated `NOT EXISTS … COLLATE NOCASE` subqueries in `b4b-measure2.js` are slow on the Linode (minutes). The in-memory-set method in `b4b-control.js` answers the same question in seconds and is the one to prefer.

---

## 8. Attribution

This document quotes inflected forms derived from BÍN.

> **Beygingarlýsing íslensks nútímamáls.** Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir. — <https://bin.arnastofnun.is>

**The forms are modified**: selected, subsetted per lemma, and (in the values quoted from production) unioned across BÍN entries by the defect described in §2.4. Required by CC BY-SA 4.0 §3(a)(1)(A) and §3(a)(1)(B), per SÁM's terms.

---

## 9. Recovering the golden's producer (I-3, wb-review-A, 2026-08-10)

§C36 B4b-0a deletes both `tools/fetch_bin_inflections.py` and `tools/capture-bin-golden.py`
in its final commit, so `server/__tests__/fixtures/bin-golden-hashes.json` can never be
re-derived from a live tree again — only from git history. Two defects made the documented
recovery path not actually work, found by wb-review-A and fixed here rather than in place:

1. **The recovered capture script's fixture paths point into a tree the fixtures left.**
   `git show 8072a58f:tools/capture-bin-golden.py` (note the **colon**, not `-- <path>` — the
   latter prints a commit header and a diff, not the file) returns a script whose `WORDS`/`OUT`
   constants are `tools/__tests__/fixtures/...`. `738d0d36` (`R100`) moved those fixtures to
   `server/__tests__/fixtures/` **before** the capture script was written against them, so the
   committed copy was already stale on arrival. The dangerous failure mode is a **half-fix**:
   repairing only `WORDS` still writes `OUT` to a fresh file in the wrong tree — the real golden
   stays untouched, the gate keeps reporting the same mismatches, and since only `tools/data/` is
   gitignored (not `tools/__tests__/`), the stray file looks like an ordinary untracked artefact
   rather than an error.
2. **The docstring itself has two stale facts**, both harmless to a reader who cross-checks but
   worth not repeating: it says *"MUST be run BEFORE `tools/fetch-bin-inflections.js` exists"* —
   a path that never existed at any commit, the real port lives at
   `server/scripts/fetch-bin-inflections.js` — and *"Captured at commit:
   6193e1a4fbe58faf5f8ebc719bb27bd0e89e10f3"*, which is the **plan-authoring** commit, one
   commit before the capture actually ran. The test, this document and the register all name the
   capture commit as **`8072a58f`** (`test(B4b-0a): capture the differential golden from the
   UNMODIFIED Python`, 2026-08-10 08:30:17 +0000) — that is the sha to cite and the sha this
   corrected copy records.

Neither the git history nor `docs/superpowers/plans/2026-08-10-c36-b4b0a-port-bin-inflections.md`
is edited to fix this — the former cannot be, the latter's embedded Task-1 code block **has**
been corrected in place (it is a live planning doc, not frozen evidence) but a plan is still one
more hop away from "just run it." This section is the actual lifeline: a complete, corrected,
pasteable copy of the capture script, frozen as text so recovery never again depends on
archaeology plus a patch.

**To use it:** the Python it imports is *also* deleted. Recover both at the capture commit,
run this script, then discard the recovered files — do not re-commit them.

```bash
git show 8072a58f:tools/fetch_bin_inflections.py > tools/fetch_bin_inflections.py
git show 8072a58f:tools/capture-bin-golden.py > /tmp/capture-bin-golden-original.py  # for diffing only, not run
# Paste the corrected script below to tools/capture-bin-golden.py, then:
python3 tools/capture-bin-golden.py
# Then discard both recovered files — they must not be re-committed:
git checkout -- tools/fetch_bin_inflections.py 2>/dev/null || rm -f tools/fetch_bin_inflections.py
rm -f tools/capture-bin-golden.py /tmp/capture-bin-golden-original.py
```

```python
# tools/capture-bin-golden.py
"""
Captures the B4b-0a differential golden from the UNMODIFIED Python implementation.

⚠️ MUST be run BEFORE server/scripts/fetch-bin-inflections.js exists. Re-running it after
the port would certify the new implementation against itself and destroy the
oracle — there is no observable difference between a correct golden and a
worthless one. (Same rule as server/scripts/capture-c24-golden.js.)

⚠️ Stores SHA-256 HASHES, never the forms themselves: the values are BÍN-derived
(CC BY-SA) and this repository is public. A hash is fully discriminating for a
differential test and carries no BÍN bytes.

`null` means the Python returned None. That is DISTINCT from a hash of "[]" and
the distinction is load-bearing — see the port's getInflections.

Run: python3 tools/capture-bin-golden.py
Captured at commit: 8072a58ffa8b06894029f5f145b523bd651ce9c1
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fetch_bin_inflections import load_bin_data, get_inflections  # noqa: E402

# ⚠️ HERE is tools/. The fixtures live under server/__tests__/fixtures/, NOT
# tools/__tests__/fixtures/ — R100 (738d0d36) moved them there, before this
# script was ever written against them.
CSV = HERE / "data" / "SHsnid.csv"
WORDS = HERE.parent / "server" / "__tests__" / "fixtures" / "bin-golden-words.txt"
OUT = HERE.parent / "server" / "__tests__" / "fixtures" / "bin-golden-hashes.json"

if not CSV.exists():
    sys.exit(f"REFUSING: {CSV} not found. Download SHsnid.csv first.")

inflection_map = load_bin_data(CSV)
words = [w for w in WORDS.read_text(encoding="utf-8").split("\n") if w != ""]
print(f"words: {len(words)}")

golden = {}
found = missing = 0
for w in words:
    forms = get_inflections(inflection_map, w)
    if forms is None:
        golden[w] = None
        missing += 1
    else:
        payload = json.dumps(forms, ensure_ascii=False)
        golden[w] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        found += 1

OUT.write_text(json.dumps(golden, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
               encoding="utf-8")
print(f"  found: {found}\n  not in BÍN (null): {missing}")

# A golden with no misses would never exercise the None path; one with no hits
# proves nothing at all. Both are worthless in different directions.
if found == 0 or missing == 0:
    sys.exit("REFUSING: a golden with zero hits or zero misses proves nothing.")
```

After running, record the new `CSV_SHA256` in
`server/__tests__/binInflectionsGolden.test.js` (the CSV you ran it against, freshly hashed)
and commit the regenerated `bin-golden-words.txt`/`bin-golden-hashes.json` alongside it. This
recovery procedure is only needed if the golden must be re-captured against a **different**
`SHsnid.csv` (a redownload, or the KRISTINsnid switch spec §D2 defers) — the existing golden
does not need re-capture just because the Python is gone.


---

## 9. The capture script, frozen — the golden's recovery path

⚠️ **`tools/capture-bin-golden.py` was DELETED with the Python it imports** (§C36 B4b-0a, Task 7). `git show 8072a58f:tools/capture-bin-golden.py` recovers it — **note the colon; `git show <sha> -- <path>` prints a diff, not a runnable file.**

⚠️ **The recovered copy will NOT run as-is.** Its fixture constants point at `tools/__tests__/fixtures/`, and commit `738d0d36` moved both fixtures to `server/__tests__/fixtures/`. The dangerous variant is the half-fix: repairing only `WORDS` leaves `OUT` writing a fresh golden into a tree **no test reads**, so the gate keeps reporting the same mismatches while an operator believes they have re-captured it. Found by whole-branch review A (I-3).

**The corrected constants — the only lines that need changing:**

```python
CSV   = HERE / "data" / "SHsnid.csv"                                    # unchanged
WORDS = HERE.parent / "server" / "__tests__" / "fixtures" / "bin-golden-words.txt"
OUT   = HERE.parent / "server" / "__tests__" / "fixtures" / "bin-golden-hashes.json"
```

🔴 **Re-capturing is a LAST RESORT and destroys the oracle's independence.** The golden's whole value is that it was taken from an implementation written before the port existed. Re-capturing from anything else certifies the new code against itself — `capture-c24-golden.js` states the rule and the reason: *"there is no observable difference between a correct golden and a worthless one."* **If the gate fails, the first question is whether `tools/data/SHsnid.csv` still matches `CSV_SHA256`** (`9c10d70d73c03168f05f152616b8cafa6e4275e7db8701338f5f3c48a45b7ab6`). A data swap and a port regression look identical in the mismatch output; only that hash tells them apart.

---

# §C36 B4b-0b — pos-aware BÍN inflections onto `concept_term`

**Measured 2026-08-10** · appended, not edited into the B4b-0a sections above · reproduce with `node server/scripts/verify-b4b0-gates.js --self-test`

⚠️ **NO BÍN FORMS APPEAR ANYWHERE BELOW.** Strings, BÍN ids and word classes only. §C41's ShareAlike constraint has no evidence-file exemption, and this repo is public.

## B1. The instrument — a reconstruction, and what makes it admissible

The local dev DB holds 6 terminology rows and no concept model, so it cannot host any of this. Every figure here is measured on a **scratch database** built by `server/scripts/lib/scratchCorpus.js`: every real migration against an empty file, then the 20-collection Íðorðabankinn import from `~/idordabanki-raw-2026-08-07/`. Import wall time **3.0 s**.

| control | measured | recorded (§C36 B2) |
|---|---|---|
| `concept` | **70,187** | 70,187 |
| `concept_term` | **192,189** | 192,189 |
| `verify-resolve-gates.js` on this DB | **exit 0** | B1's scope sizes + census reproduce |

⚠️ **A reconstruction's numbers are ambiguous until it is shown to be the right corpus** — a divergence could be the code or could be the rebuild. Those three rows are what convert caveat 1 from a disclaimer into a measurement, and the gate **stops** rather than continuing if the first two do not match.

## B2. The candidate set — ⚠️ STATE THE UNIT

`concept_term` is keyed `(concept_id, lang, text)`, so **one Icelandic string owns many rows**.

| | value |
|---|---|
| `lang='is'` rows | 92,303 |
| … `inflections IS NULL` | 92,303 (**the column had never been written**) |
| … single-word — **candidate ROWS** | **74,004** |
| … distinct lowercased — **candidate STRINGS** | **53,719** |
| rows per string | **1.378** |
| multi-word rows skipped | 18,299 |

**The lookup is per string; the write is per row.** The gap moves every headline figure by a third — the same run is a **25.87%** hit rate per string and **33.50%** per row. A report that does not name its unit cannot be compared against anything, which is why the script prints both and asserts the bucket partition in both.

## B3. The measured bucket shape

| bucket | strings (of 53,719) | rows (of 74,004) |
|---|---|---|
| unambiguous | 13,896 (25.87%) | 24,792 (33.50%) |
| rescued-nominal (D4.2) | 403 (0.75%) | 1,018 (1.38%) |
| refused-ambiguous | 862 (1.60%) | 2,350 (3.18%) combined |
| refused-no-noun | 44 (0.08%) | ″ |
| base-form-only | 276 (0.51%) | 505 (0.68%) |
| **not in BÍN** | **38,238 (71.18%)** | **45,339 (61.27%)** |
| **rows written** | — | **25,810 (34.88%)** |

✅ **Cross-checked against an independent implementation.** A standalone prototype, written before the script existed, produced **every one of these figures exactly**. Two different pieces of code over the same corpus agreeing is a stronger statement than either alone — though note it is a statement about *this corpus*, not about production's.

### 🔴 B3.1 The headline is the YIELD, and it is low — this is a B4b-1 input, not a defect

**71.18% of candidate strings are not in BÍN at all.** A full run writes a paradigm for **14,299 of 53,719 strings (26.6%)**.

Spec §7 predicted worse than the 65% a prior measurement got *with* BinPackage's compounder; a raw CSV lookup without one does worse, and it did. **This is measured coverage, not a bug to chase.** What it means downstream: **B4b-1's `missing` check will have no paradigm for roughly three of four terms** and must degrade to base-form matching for them rather than reporting a fault. That belongs in B4b-1's acceptance criteria, and it sharpens D4.1 ②'s point — the false-FAIL population is not 686 terms, it is most of the corpus.

### B3.2 Two independent confirmations of the rule set

Neither was used to derive the rules; both are corpora the rules were not fitted to.

① **The three worked cases reproduce exactly**, and the two rescues are asserted **by identity** — not by count, since a length check passes on the wrong paradigm of the right size:

| string | BÍN entries | outcome | verb participles in the stored value |
|---|---|---|---|
| `afl` | kk + hk (two nouns) | **REFUSED**, named | — (nothing written) |
| `hverfa` | kvk + so + so | **RESCUED** to kvk, 12 forms | **0** |
| `vinna` | kvk + so | **RESCUED** to kvk, 5 forms | **0** |

② **D4.2's rescue share among ambiguous strings is 403 / 1,309 = 30.8%** here, against **208 / 686 = 30.3%** measured on the old model. Different populations, same ratio.

### ⚠️ B3.3 A consequence D4.2 does not state

D4.2's noun test fires **only on ambiguity**, so an *unambiguous* non-noun is written, not refused. Of the 13,896 unambiguous strings: **1,401 resolve to an adjective (`lo`), 335 to a verb (`so`)**, plus a handful of adverbs and pronouns. That is D4 behaving as written — one entry is not a guess — but the corpus will therefore carry verb conjugations for any headword that is unambiguously a verb. **That is not the §2.2 contamination and must not be mistaken for it during review.**

## B4. The input guard — measured inert before it was written

| | measured over the whole file |
|---|---|
| `SHsnid.csv` rows | 7,425,931 — **all exactly 6 fields, zero variance** |
| distinct field-2 values | **16**: `lo kvk kk hk so ao rt fn fs to uh st pfn gr afn nhm` |
| rows failing the field-count half | **0** |
| rows failing the word-class half | **0** |
| `KRISTINsnid.csv` fields | **15** |

⚠️ **The spec specified this guard backwards** — §5's table and §6's bullet both said *"refuse unless field count is 15"*, written before D2 was demoted to a follow-up three subsections above them. Implemented literally, the guard refuses the only file the script reads. Both were corrected in the spec on 2026-08-10 before any code was written.

⚠️ **And the trap inverts with the guard.** Handing KRISTINsnid to a 6-field parser is **not** the zero-yield case §5 was written about: a lower-bound check (`>= 5`) passes, then reads KRISTINsnid's field 4 — a **numeric code** — and writes numbers as inflections. **Corrupt yield reads as data; zero yield at least looks wrong.** Hence positive identification, and hence refuse-never-skip.

## B5. Union-equivalence — why the differential golden kept a subject

B4b-0b deletes the union lookup the B4b-0a golden was written against. Left pointed at it, that file would have been **green forever over code nothing calls**.

Verified before the plan was written, on a standalone prototype: the pos-aware index, **unioned back per lemma** and passed through the Python's base-form filter and code-point sort, reproduces the committed hashes exactly.

| | value |
|---|---|
| golden words | 23,995 |
| hits / misses | 7,285 / 16,710 |
| **mismatches** | **0** |

So the golden now asserts something **stronger** than before — that the new parser reads the same `(lemma, form)` pairs the Python did — against the same oracle, captured from an implementation in a different language written before any of this existed. ⚠️ **The union in that test is the oracle's adapter and must never be copied into the script**: production calls `chooseEntry()`, which refuses or rescues.

## B6. The gate

`node server/scripts/verify-b4b0-gates.js --self-test` — **all checks PASS, exit 0.**

| gate | measured |
|---|---|
| 0 input identity | `SHsnid.csv` matches the recorded sha256 |
| setup | 70,187 / 192,189 — §C36 B2 exactly |
| fidelity control | `verify-resolve-gates.js` exit 0 on this DB |
| 1 D4 refuses | `afl` unwritten across 5 rows, named with 2 entries (kk+hk) |
| 1b D4.2 rescues | `hverfa` → kvk 12 forms · `vinna` → kvk 5 forms · **0 participles** |
| 2 **the control** | 25,810 rows written over 13,896 unambiguous + 403 rescued |
| 3 matcher inertness **+ D1** | 40 matches / 7 issues byte-identical (**cold child processes**), AND the old table's `inflections` digest unchanged (`f3136cbf1bb8cddb`, 2/326 non-null) |
| 4 🔴 D6 licence | 2,119 terms, 0 inflection-shaped keys, 0 of 200 sampled forms present |
| 5 D5 idempotency | 0 written, 25,810 → 25,810 populated |
| self-test | 3 planted defects, **all detected** |

⚠️ **Gate 2 is what makes gate 1 mean anything.** A run that refused *everything* would pass gate 1 perfectly.

### ⚠️ B6.1 A FOURTH way gate 3 could have passed for the wrong reason — found by self-review, after it was already green

The matcher comparison **alone** does not settle D1. Probed both directions on a seeded scratch DB:

| probe | result |
|---|---|
| plant an inflection that **occurs** in a fixture segment's Icelandic text | a `missing` issue **cleared, 7 → 6** — so the matcher genuinely does read this column, and the comparison is **not vacuous** |
| plant `["gervibeyging"]` — a form occurring **nowhere** in the 24 segments — on **324** old-table rows | matcher output **BYTE-IDENTICAL** |

So a D1 violation — the run writing to `terminology_translations` instead of `concept_term` — is caught by the matcher comparison **only if a written form happens to appear in those 24 fixture segments.** That is this project's commonest error in miniature: *a measurement generalised one step past its coverage*, and "byte-identical, therefore inert" reads as complete when it is conditional.

**Closed by adding a digest of `terminology_translations.inflections` across the population**, asserted unchanged whatever the forms are. Both halves are now reported. ⚠️ **Note the first probe was itself too weak and would have "confirmed" vacuity** — it planted a form that could not match anything, so its null result said nothing about the matcher. The second probe is what made either result meaningful.

⚠️ **Gate 3 had three independent ways to pass for the wrong reason**, each closed deliberately: **(a)** two databases — a write to B cannot move a matcher reading A, so one DB is used, the scratch corpus carrying 032's tables beside 045's; **(b)** a **warm automaton cache** — it fingerprints `terminology_headwords`, which B4b-0b never touches, so an in-process re-call re-reads *nothing* and byte-identity would hold whatever the population did, hence cold child processes via `SESSIONS_DB_PATH`; **(c)** an empty capture, hence the non-empty assertion first. Gate 4 carries the same non-empty control for the same reason.

⚠️ **The self-test plants defects in the DATA, on a copy — it does not sabotage the source.** A break-and-revert leaks if the revert is partial (B4b-0a's own recorded hazard), and the property worth proving is that a gate **detects the corpus state it exists to catch**, not that a broken function breaks.

## B7. D5 idempotency, and a distinction the gate makes deliberately

A re-run over the populated corpus wrote **0 rows** with `already populated 25,810 → 25,810` — and it did so with a **non-empty candidate set** (48,194 rows / 39,420 strings still unresolvable), which is a stronger demonstration than the empty-candidate path.

⚠️ **"Nothing to do" and "nothing there" are different facts, and the script must not collapse them.** A fully-populated corpus yields zero candidates, and so does a database with no concept model at all. The first is D5's no-op; the second is B0's zero-yield error. `alreadyPopulatedBefore` is the discriminator — without it a *correct* implementation fails its own gate, because `--db` defaults to `resolveDbPath()`, which on a dev box points at a database with no concept model.

## B8. A defect found during implementation, not by any test

`--force` drops `inflections IS NULL` from the candidate query. The first implementation left that clause in the **UPDATE**, so `--force` selected every row, wrote none, and reported `written: 0` beside a full candidate count — *a flag parsed but never read*, the shape CLAUDE.md names as durable.

**Nothing else here would have caught it:** the row partition balances in that state, because 0 written is a legal outcome. Fixed, and pinned by a test that asserts `--force` actually overwrites.

## B9. 🆕 §C43 — `resolve()` returns the placeholder `[vantar]` as a winning translation

Found while censusing the candidate set; **outside B4b-0b's scope** and logged rather than fixed.

**201 `concept_term` rows hold the literal string `[vantar]`** ("missing") as their Icelandic term, and for **all 201** it is that concept's *only* Icelandic term — so it is the head form. Measured on the rebuilt corpus, with a biology-scoped book:

```
resolve(scope, 'abembryonic pole')
  → { winner: { conceptId: 55551, termId: 153727, text: '[vantar]',
                domain: 'biology', position: 1 },
      reason: 'head-form', integrity: [], alsoInScope: [], … }
```

⚠️ **`text` IS NESTED IN `winner`; THERE IS NO TOP-LEVEL `text`.** *(An earlier version of this block wrote `{ text: '[vantar]', reason: …, integrity: [] }` as if it were the whole return value. Measured: `r.text` is `undefined`; the real top-level shape is `winner · reason · nominalTie · tied · outOfScope · integrity · unscoped · alsoInScope`.)* **This is not pedantry — it is the shape a fix gets written against.** A guard written from the recorded shape (`if (res.text === '[vantar]')`) is permanently `undefined`, never fires, and every test written from the same wrong shape passes. The register corrected this exact error class for B4a two days earlier.

**No integrity fault fires.** The codes test *structure* — ties, scope, term-less concepts — and this is structurally perfect: one concept, one term, rank 1.

**Measured, and stated separately from what is inferred:**
- ✅ **Measured:** `git grep -F '[vantar]' -- 'books/*'` returns **0** lines; all three committed `glossary-unified.json` files carry no `producer` stamp, i.e. the merge-glossary fingerprint.
  - ⚠️ **`-F` IS LOAD-BEARING, AND THIS BLOCK ORIGINALLY OMITTED IT.** Without it, `[vantar]` is a POSIX **bracket expression** matching any one of `v a n t r`, and the command returns **1,591,128** lines — measured, both ways. **The conclusion was right and the cited method could not have produced it.** Anyone re-verifying §C43 before the first `--adopt` would either read that as "the placeholder already ships throughout `books/`", inverting the finding, or discard the whole ✅ Measured half as unreliable. *An unquoted metacharacter turns a null result into its opposite, and both readings look like evidence.*
- ⚠️ **Inferred, from a five-day-old record:** the register's 2026-08-05 §C14 ③ entry says the resolved exporter is refused for all in-loop books. That is cited as the *reason* for the absence, not re-measured today. §C21's own history is a chain of "this state was gated" claims falsified one at a time.

**Either way it becomes reader- and MT-visible the moment a book is `--adopt`ed**, so it is a blocker for the first adopt. It also generalises: **a well-formed term that is not a word passes every mechanical gate** — the same shape as `concept-priority-overrules-consensus`, where a wrong-but-well-formed translation is invisible to all of them.

## B10. Open, logged, not addressed here

- **§C42** — the propose route still writes `terminology_translations.inflections`, so an editor's inflection between now and Part C never reaches the concept model and nothing goes red. **Part C must not drop the old tables while this is open.**
- **Spec §9's closing obligation** — the moment this writes, Ritstjóri becomes *a product built on BÍN data*, so the SÁM credit plus a statement that the forms are generated must be **visible in the editor UI**. It is not in §5 and it is not in this PR: it belongs with **B4c**, the first slice with an editor surface. A licence obligation, not a nicety.
- **D2 / KRISTINsnid** — still a separable follow-up worth ~1.57% of forms, and still blocked on confirming the prescriptive-marker vocabulary against BÍN's documentation rather than inferring it.
- **The production run is a separate [LEAD] data op**, on B2's precedent. This PR ships code, gates and evidence; nothing has been written to production's `sessions.db`.

---

## B11. §C44 — sizing the compounder

**Measured 2026-08-10** on the same scratch corpus as §B. Reproduce: the three scratchpad scripts are throwaway; the method is stated below in full so it can be rebuilt rather than recovered.

⚠️ **NO BÍN FORMS BELOW.** Lemma *strings* the corpus already contains, and counts.

### B11.1 The 71.18% is four populations, and only one is a word

| population | strings |
|---|---|
| plain single words | **34,940** |
| **combining forms** — an affix stored as a term (`-aðgerð`, `-berandi`, `-a`) | **2,182** |
| other non-alphabetic — digits, parentheses, slashes | 1,115 |
| `[vantar]` placeholder (→ §C43) | 1 |

🔴 **668 of the 2,182 combining forms (30.6%) have a body that is already in BÍN.** `-brjóst` is `brjóst` with a marker glued on. **No compounder is involved: this is the corpus storing an affix marker inside the term string**, the same class of defect as §C43. It is also the cheapest thing on this page to fix.

### B11.2 Do the plain words look like compounds? — with the control that makes it mean something

Proxy for BinPackage's rule (Icelandic compounds are head-final, so an unknown compound inherits its **last** constituent's paradigm): does the string end in a known BÍN lemma of ≥4 characters, leaving a prefix of ≥2?

| test | real strings (of 34,940) | **gibberish control** |
|---|---|---|
| LOOSE — tail is a known BÍN lemma | 28,125 (**80.5%**) | 142 (**0.4%**) |
| STRICT — tail **and** prefix both known (prefix may shed a linking `-s-`) | 11,324 (**32.4%**) | 3 (**0.0%**) |

⚠️ **The control is the whole reason these numbers are admissible.** It is length-matched, generated from the Icelandic alphabet with a seeded PRNG. Without it, "80% end in a real word" is equally consistent with *"BÍN contains so many short lemmas that anything matches"* — an absence of that alternative is not evidence against it. At 0.4% and 0.0%, it is.

### B11.3 Translated into coverage, after applying **our own** D4/D4.2 to the head

A head we would refuse buys nothing, so the head is judged by the same rules the run uses.

| | strings | % of all 53,719 candidates |
|---|---|---|
| **today** | 14,299 | **26.6%** |
| + STRICT decomposition | 23,498 | **43.7%** |
| + LOOSE decomposition | 37,151 | **69.2%** |

### B11.4 ⚠️ Both figures are UPPER bounds on what a compounder *specifically* buys

The sample splits show why, and this is the caveat that must travel with the numbers:

```
bikarinn = bik + arinn        ← both parts are real words, and the analysis is WRONG:
                                 `bikarinn` is a DEFINITE FORM ("the beaker"), not a compound
```

Definite forms and accidental splits both pass the strict test. **Neither proxy isolates true compounds.** A real figure means running BinPackage itself over the 34,940 strings — which is the actual next measurement, not a bigger version of this one.

✅ **The spec's five named coinages behave exactly as it predicted**, which is a control on the method rather than a result:

| coinage | loose | strict |
|---|---|---|
| `kjarnsækir` | `kjarn` + `sækir` | — |
| `oxósýra` | `oxó` + `sýra` | — |
| `mólarleysni` | `mólar` + `leysni` | — |
| `pniktógen` | **NONE** | **NONE** |
| `kúvetta` | **NONE** | **NONE** |

The two that resolve to nothing are the two loanwords. A compounder cannot reach them, and nothing morphological will.

### B11.5 ✅ The cheap alternative was tested FIRST, and it failed

Before crediting a compounder: some misses might be missing only because the corpus stores the term **inflected** (`bikarinn`), which BÍN holds as a *form* even though it is not a *lemma*. If that were most of the gap, indexing forms as well as lemmas would fix it with **no new dependency** — `loadBinEntries` already streams past every form.

| | strings | control |
|---|---|---|
| missing as a lemma but present as an inflected form | 1,670 of 34,940 (4.8%) | 24 of 30,725 (**0.08%**) |
| … whose owning lemma D4/D4.2 would accept | 1,589 = **2.96% of all candidates** | — |

**The cheap win is not there.** Worth recording as a negative result: it is the first thing anyone will propose, and it costs 3%.

### B11.6 The toolchain objection is weaker than spec §6.0 assumed

§6.0 rejected Python on the grounds that *"no workflow runs Python at all"*. That is true of **CI**, and it was the right call for a one-file script. It is not the whole picture for a service:

**`server/greynir-sidecar/` already is a Python sidecar** — `app.py` (Flask) + `requirements.txt` (`reynir-correct`, `flask`, `gunicorn`) — with `server/services/greynirEngine.js` as its Node client, wired into `segmentEditorService` and gated by `GREYNIR_URL`. So BinPackage would be a **second consumer of an existing pattern**, not a new toolchain.

⚠️ **UNVERIFIED, and it is the fact that most changes the estimate:** GreynirCorrect is built on BinPackage, so `islenska` may already be installed in that environment transitively. **Run `pip show islenska` there before anyone sizes the work** — do not infer it from the dependency graph, which is exactly the shape of claim this campaign keeps having to withdraw.

🔴 **§C41 is unaffected and becomes more load-bearing, not less.** A compounder *generates* BÍN-derived forms rather than looking them up, so there would be more of them; the prohibition on their reaching `glossary-unified.json` stands unchanged. BinPackage's own licence needs checking separately from BÍN's — Miðeind's repositories are not uniformly licensed.
