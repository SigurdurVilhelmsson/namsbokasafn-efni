# §C36 Part B4b-0 — pos-aware BÍN inflections, written onto the concept model

**Written 2026-08-10** · Branch `spec/c36-b4b-matcher-cutover` · Slice of §C36 B4b, ahead of the `findTermsInSegments` cut-over (B4b-1)

> Evidence for every number here is [test-results/b4b-matcher-cutover-2026-08.md](../../../test-results/b4b-matcher-cutover-2026-08.md), measured read-only on production 2026-08-10. **Status lives in the register, not here.**

---

## 1. What this is, and what it deliberately is not

B4b-1 cuts `findTermsInSegments` over from the old terminology tables to `resolve()`. That cut-over silently deletes the matcher's inflection-aware Icelandic-side check, because **`concept_term.inflections` is declared by migration 045 and has never been written or read** — `045-concept-model.js` is the only concept-model file in the tree that mentions the column.

**B4b-0 populates it, from BÍN, with a lookup that does not merge homographs.**

### 1.1 What B4b-0 changes — TWO PRs, port first and INERT *(lead, 2026-08-10)*

**An earlier draft of this section landed the port and the logic change together**, arguing that splitting them "would produce one diff worth reviewing and one that isn't." **The lead ruled otherwise, and the ruling is the stronger one:** an inert port is the only version whose review question has a *checkable answer* — *did behaviour change?* — and the paragraph below shows that answer can be made a measurement rather than an assertion.

#### B4b-0a — the port, behaviour-preserving

`tools/fetch_bin_inflections.py` → **`tools/fetch-bin-inflections.js`**; the Python is deleted. **Nothing else changes**: still `SHsnid.csv`, still `terminology_translations`, still the union-by-lowercased-lemma lookup, still `--execute` opt-in.

**Inert in production by construction** — it is a CLI tool nothing invokes, with a dry-run default.

⚠️ **Inertness is PROVEN BY A DIFFERENTIAL GOLDEN, not asserted.** `get_inflections` is a **pure function of (SHsnid, word)**, so its output can be captured over a fixed word list **without a database**. Capture from the **unmodified Python**, then require the Node port to reproduce it byte-identically.

**This repo already holds the discipline and the warning**: `capture-c24-golden.js` says a golden *"MUST be run against the UNMODIFIED matcher … Re-running it after the swap would certify the new implementation against itself and destroy the oracle. There is no observable difference between a correct golden and a worthless one."* Same rule here — **capture before the port exists.**

#### B4b-0b — the logic change

Pos-aware (D3), targeting `concept_term` (D1), applying D4 and D4.2. **One behavioural diff, reviewable on its own**, against a port already known not to have moved anything.

⚠️ **B4b-0b does NOT require KRISTINsnid** — see D2 as corrected. `SHsnid.csv` already carries the BÍN id and word class, which is everything D3 and D4 need.

### 1.2 Non-goals

- **No matcher change.** `findTermsInSegments` and the C24 automaton are untouched — that is B4b-1.
- **No export change.** 🔴 See D6: putting inflections in the glossary payload is a **licence breach**, not a feature.
- **No migration.** This is a data op, following §C36 B2's precedent, not a schema change. Migration 045 already created the column.
- **No editor UI.** The propose route keeps writing the old table until B4c/B5 — logged in §7 as an open gap.
- **No compounder.** Chemistry coinages BÍN does not hold stay unresolved; §7.

---

## 2. Why the design is what it is — a claim that was falsified mid-design

### 2.1 The original plan was a backfill, and it was wrong

The first design was: copy the old model's 9,715 inflection sets onto `concept_term`. It rested on a measured-looking claim — *"they are a project-authored asset with no upstream to re-fetch from"* — which is **false**. They are BÍN-derived, produced by `tools/fetch_bin_inflections.py`.

**The mechanism is worth carrying past this item.** The search behind the claim was `grep -rn "inflections" server/ tools/ --include=*.js`. The producer is **Python**; `--include=*.js` made it structurally invisible. The grep did not fail — it returned a clean, plausible answer assembled entirely from the editor-facing propose route (`routes/terminology.js:543`), which is a real but *secondary* writer. *An absence is not an answer, and a filter you chose is one of the ways an absence gets manufactured.* → [[engineering-lessons]]

### 2.2 The stored paradigms are homograph-contaminated

`load_bin_data:53` keeps **only** field 0 (lemma) and field 4 (form) of SHsnid's six — discarding word class (2), inflection class (3) and the grammatical tag (5) — and `get_inflections:81` keys on `word.lower().strip()`. **Every BÍN lemma sharing a spelling has its forms unioned.**

Measured: **124 of 9,715 (1.28%)** paradigms contain both a masculine `-inn` and a neuter `-ið` nominative-singular definite form, which one noun cannot have. ⚠️ **That is a FLOOR** — the diagnostic sees only masculine/neuter *noun* collisions, and the worst cases are the class it cannot see: `hverfa` (isomer) carries **72** forms including the verb's past participles `horfinn`/`horfið`; `vinna` (work) carries **50**.

### 2.2.1 ✅ CONFIRMED FROM THE PRIMARY SOURCE, 2026-08-10 — not inferred

The diagnosis above was reached from *ending patterns in the stored values*. With `KRISTINsnid.csv` in hand it is now confirmed against BÍN itself, and the arithmetic matches exactly:

| lemma | BÍN entries | distinct forms in BÍN | stored on prod |
|---|---|---|---|
| `afl` | id 5594 **kk** (masc) · id 367 **hk** (neut) | 17 | **16** = 17 − 1 |
| `hverfa` | id 15818 **kvk** (the isomer noun) · id 434258 **so** · id 434900 **so** | 73 | **72** = 73 − 1 |
| `vinna` | id 15449 **kvk** (noun) · id 485738 **so** (verb) | 51 | **50** = 51 − 1 |

**Every stored count is the unioned source-form count minus one** — the base form `get_inflections:94` strips. Three independent exact matches confirm both the contamination mechanism and the script's arithmetic from the primary source. `hverfa` (isomer) is a feminine noun carrying **two complete conjugations of the unrelated verb *hverfa*** ("to disappear"); roughly 50 of its 72 stored forms are not this word in any sense.

### 2.2.2 How much D4 will refuse — measured on the whole of BÍN

| | count |
|---|---|
| distinct lemmas (lowercased) in KRISTINsnid | 347,926 |
| … with **more than one** BÍN entry | 7,371 (**2.12%**) |
| … with more than one **distinct word class** | 3,220 (**0.93%**) |

⚠️ **DO NOT READ THIS AS D4'S COST — see D4.1.** This section originally concluded *"the safe rule is cheap here; that is a measurement, not a hope"*, reasoning that ~2% was consistent with the 1.28% contamination floor. **Two measurements agreeing is not two measurements confirming each other when both describe the corpus and the question is about our subset.** On the strings we actually hold the refusal rate is **9.4%**, 4.4× this figure. The number above is retained because it is correct *about BÍN* and because the error is instructive: **a corpus statistic is not a statistic about your sample of it.**

### 2.3 That inverts the build-or-copy decision

The contamination **cannot be repaired in place**: a stored value is a union with no record of which lemma contributed which form, so un-merging requires re-consulting BÍN. **Fixing therefore means regenerating — and once you are regenerating, the old model's 7,278 strings have no advantage over a fresh run against `concept_term`'s 70,103.** Hence the lead's decision (2026-08-10) to skip the backfill entirely.

---

## 3. Decisions

### D1 — Source of truth is BÍN, target is `concept_term` *(lead, 2026-08-10)*

The old `terminology_translations.inflections` is **not read, not copied, and not migrated**. Part C deletes that table; routing this data through it would be work performed on a corpse.

### D2 — ⚠️ CORRECTED 2026-08-10 AGAINST BOTH FILES: THE SWITCH ALONE IS A NO-OP, AND IT IS NOT A PRECONDITION

**As first written**, D2 read: *"KRISTINsnid (15 fields) is partly vísandi — it takes a position on the validity of variants … A textbook glossary wants the standard form, not every attested variant."* That reasoning came from the licensing decision record and **was never checked against the files**. Both are now on disk. Measured:

| | SHsnid | KRISTINsnid |
|---|---|---|
| lines | 7,425,931 | **7,425,931 — identical** |
| `(lemma, id, form)` triples | — | **0 mismatches in 200,000 rows** |
| forms for `afl` | 17 | **the same 17** |

**KRISTINsnid does not remove variants. It ANNOTATES them.** Same rows, nine extra columns. So switching files and reading only the form column produces **byte-identical output** — the switch, on its own, buys nothing at all.

**Two corrections follow, and the second is the one that changes the plan:**

**① The prescriptive value is real but small, and lives in fields 5 and 12.** They carry markers — `VILLA` (error), `URE`, `GAM`, `FORN` (obsolete/old/archaic), `SJALD` (rare), `SKALD`, `FORM`, `STAD`, `NID`. Corpus-wide **5.80%** of rows carry one; **on our own terms, 3,113 of 198,512 forms — 1.57%**. ⚠️ **The marker vocabulary must be confirmed against BÍN's own documentation before any filter is written.** The glosses above are inferred from transparent Icelandic abbreviations, and BÍN's docs are unreachable from here (SPA). **Do not encode a filter list from a guess** — that is D4's doctrine applied to metadata.

**② `SHsnid.csv` ALREADY CARRIES THE BÍN ID AND WORD CLASS** — fields 1 and 2, exactly as KRISTINsnid does. **So the pos-aware fix, which is the entire point of B4b-0, needs no file switch.** The Python simply discarded those columns.

**Therefore D2 is DEMOTED from a precondition to a separable follow-up**: B4b-0a and B4b-0b both stay on `SHsnid.csv`, and adopting KRISTINsnid + a marker filter becomes its own small change, worth ~1.57% of forms, once the vocabulary is confirmed. ⚠️ **A switch to KRISTINsnid also moves the form column from index 4 to index 9** — which is precisely the silent zero-yield trap §5's input guard exists to catch.

⚠️ `Storasnid_ritm.csv` deliberately carries **misspellings, typos and older orthography**. It must never be used here. It is spell-checker material.

### D3 — Disambiguate on BÍN's own identity, never on ours

`terminology_headwords.pos` is non-empty on **2 rows of 20,272**, so there is no local signal. The loader must therefore retain BÍN's **`Auðkenni` (id)** and **`Orðflokkur` (word class)** and group forms **per BÍN entry**, not per lowercased lemma string.

### D4 — ⚠️ AN AMBIGUOUS STRING IS REPORTED, NEVER UNIONED AND NEVER GUESSED

When one Icelandic string maps to **more than one** BÍN entry:

- **Do not union.** That is the present defect.
- **Do not pick.** A deterministic pick — first id, largest paradigm, most common word class — would let an arbitrary rule decide an editorial answer. **That is §C18's defect** (row order deciding which Icelandic word readers see) reproduced inside its own successor, and §C38's (a mechanism that cannot express what the editor means) one level down.
- **Write nothing for that string, and report it by name**, with every contending BÍN id and word class.

The resolver already holds this doctrine in as many words — *"resolving to the majority form would be guessing"*. This is the same rule at the data layer.

**The rule is REFUSE ON >1 ENTRY, not on >1 word class.** The word-class split is what makes contamination *visible*, but two same-class entries sharing a lemma are still two different words, and picking between them is still guessing.

### D4.1 — ⚠️ TWO CORRECTIONS, 2026-08-10, BOTH FROM MEASUREMENT AGAINST THE REAL FILE

**① The cost is 9.4%, not 2.12%.** §2.2.2's corpus-wide ambiguity figure does **not** transfer. Measured against the **7,278 Icelandic strings that carry inflections on production today**: 7,277 (100.0%) are present in KRISTINsnid — **so D2 costs no coverage** — but only **6,591 (90.6%) resolve to exactly one BÍN entry**, and **686 (9.4%) do not**. Technical vocabulary is **4.4× more homograph-prone than BÍN's average lemma**. *Presence and ambiguity are different questions, and only one of them generalises from a corpus figure.*

**② "Strictly better than today" was FALSE and is withdrawn.** This decision claimed that leaving an ambiguous string at `inflections IS NULL` is strictly better than a contaminated paradigm, because a base-form match is a subset of a correct one. **That reasons about the accept and ignores the reject, and the two errors point in opposite directions:**

| | contaminated paradigm | `inflections IS NULL` |
|---|---|---|
| error mode | **false PASS** — accepts a form belonging to the *other* lemma | **false FAIL** — warns whenever the editor declined the word at all |
| frequency | rare | **common** — Icelandic declines heavily |

**So D4 trades a rare wrong accept for frequent wrong warnings**, and noise is what trains editors to ignore a check. It is still the right trade — a warning an editor can dismiss beats a silent wrong answer, and it is the only option that never guesses — but it is a **trade**, not a free win, and 686 terms pay it.

### D4.2 — ✅ ADOPTED *(lead, 2026-08-10)*: the nominal rescue

When a string maps to several BÍN entries of which **exactly one is a noun** (`kk`/`kvk`/`hk`), prefer that entry rather than refusing.

⚠️ **This is a DELIBERATE, RECORDED EXCEPTION to D4's never-guess rule, taken on domain grounds — not a refinement of it.** D4 forbids picking between candidates; D4.2 picks. It is defensible because the discriminator is *categorical rather than arbitrary* — "a glossary headword denotes a concept, and a concept is a noun" is a statement about this corpus, where a first-id or largest-paradigm tie-break would be a statement about nothing. **The rule fires ONLY when exactly one noun exists, so it never picks between nouns**, which is the case where the domain argument would run out.

**Its failure mode must be logged, not just tolerated:** the run reports every string it rescues this way, with the entries it discarded, so a wrong pick is discoverable after the fact rather than silent. That is the price of the exception.

| of the 686 ambiguous | count | |
|---|---|---|
| exactly one noun entry | **208 (30.3%)** | rescued — **`hverfa` and `vinna` are here** |
| more than one noun entry | 472 (68.8%) | still refused — **`afl` (kk + hk) is here** |
| no noun entry | 6 (0.9%) | still refused — genuine adjective headwords, e.g. `afturkræfur` |

**For:** it recovers exactly the worst-contaminated cases, because a noun/verb collision is the shape that drags in a whole conjugation — `hverfa` 72 forms, `vinna` 50. It fires only when there is exactly one noun, so it never picks *between* nouns. Net refusal 9.4% → 6.6%.

**Against:** it is a **heuristic, not a derivation**. "A glossary headword denotes a concept, therefore a noun" is usually true and **the 6 no-noun cases prove it is not always true** — and where a genuine adjective headword also has a noun homograph, the rule silently picks the noun. That population is **unmeasurable without `pos`**, which is populated on 2 rows of 20,272. This spec's own D4 forbids guessing; adopting D4.2 is a deliberate exception on domain grounds, and must be recorded as one rather than folded in quietly.

⚠️ **Deferred either way:** where several entries yield *identical* form sets there is nothing to choose between, so the union is provably a no-op and could be accepted. Bounded gain, extra complexity; not worth it before a plain run's yield is known.

### D5 — One-way fill, and idempotency is MEASURED not inferred

The write is guarded `WHERE inflections IS NULL`, so the op never clobbers a later writer. **But that guard is not the evidence of a no-op**: the run reports destination rows with non-null inflections **before and after**, so "already populated" is distinguishable from "nothing matched". Inferring one from the other is how a run that silently did nothing reads as success.

### D6 — 🔴 INFLECTIONS MUST NOT ENTER THE GLOSSARY EXPORT PAYLOAD

`sessions.db` is gitignored, so **storing** BÍN-derived forms needs no licence change. The export is different: `glossary-unified.json` is **committed and world-readable**, this repo publishes `books/` under per-book CC licences, and BÍN is **CC BY-SA**.

Adding an inflections column to the payload would publish CC BY-SA data under CC BY 4.0 **via the unforced 2-hourly cron**, and it would be invisible to **both** existing gates — the producer gate fingerprints the term shape, the shrink guard measures size, and neither would flag a new key on a growing payload. The licensing record already flags this for `exportBookGlossary()`; **B3 shipped a second exporter after that record was written**, so it applies to `buildResolvedGlossary` too.

`buildResolvedGlossary`'s `terms` statement selects `id, text, rank` and must keep doing so.

**⚠️ The rule is ANY COMMITTED ARTIFACT, not one filename — re-derived 2026-08-10, because naming a single path is how an enumeration goes stale** (CLAUDE.md's E-2 lesson). Tracked classes under `books/`:

| class | files | could it carry inflections? |
|---|---|---|
| `01-source/` | 11,125 | no — READ-ONLY OpenStax CNXML |
| `05-publication/` | 2,985 | ⚠️ **yes in principle** — approved terms are substituted into published HTML by `substituteMathLabels` |
| `03-translated/` | 2,300 | ⚠️ same path, upstream |
| `glossary/` | 11 | 🔴 **the direct hazard** — D6's subject |
| `02-*`, `media/`, `chapters/`, `book-config.json` | — | no |

✅ **`git grep -l 'inflections' -- 'books/*'` returns nothing: no committed artifact carries them today.** And `tm/` and `corpus/` are **absent from the tracked set entirely** — consistent with §C3's finding that no TMX has ever reached git — so they are not a current exposure, *and would become one if TM ever starts being committed*.

**The structural reason the risk stays narrow: inflections are read to TEST presence and are never written anywhere.** The `missing` check asks "does a known form appear in the editor's text?" and emits only a boolean. Any change that makes an inflected form *travel* — into a payload, a TMX, a rendered page — is the thing D6 forbids, whatever file it lands in.

### D7 — ✅ The layout is CONFIRMED AGAINST THE REAL FILE, and it has NO header row

This decision was originally written as *"the parser is header-driven and refuses an unexpected layout"*, because `bin.arnastofnun.is` is a client-rendered SPA returning a 3,625-byte shell for every path — including its own format documentation — so the field order could not be verified remotely. **D7's own contingency clause is now the actual case**: the file has **no header row**, so the layout is pinned from the file itself.

`KRISTINsnid.csv` — 450 MB, **7,425,931 lines**, `;`-separated, **15 fields, no header**:

```
zafl;9001;kvk;alm;1;;;;V;zafl;NFET;1;;;
zafl;9001;kvk;alm;1;;;;V;zaflin;NFETgr;1;;;
```

**⚠️ Since D2 was demoted, `SHsnid.csv` is the file in use — 6 fields, no header, and it carries the same id and word class:**

| idx | SHsnid (in use) | KRISTINsnid (follow-up) |
|---|---|---|
| 0 | lemma | lemma |
| 1 | **BÍN id** | **BÍN id** |
| 2 | **word class** | **word class** |
| 3 | register | register |
| **4** | **inflected form** | (a numeric code) |
| 5 | grammatical tag | prescriptive marker |
| **9** | — | **inflected form** |
| 12 | — | second prescriptive marker |

⚠️ **The form column moves 4 → 9 between the two files. That single fact is the whole reason §5's input guard exists.**

KRISTINsnid's own layout, for the follow-up:

| idx | content | used for |
|---|---|---|
| **0** | lemma (*uppflettiorð*) | the lookup key |
| **1** | **BÍN id (*auðkenni*)** | **D3/D4 — the grouping key** |
| **2** | **word class (`kk`/`kvk`/`hk`/`so`/`lo`…)** | **D4 — the contamination test** |
| 3 | register (`alm`) | reported only |
| **9** | inflected form (*beygingarmynd*) | the value written |
| **10** | grammatical tag (`NFET`, `NFETgr`, …) | reported only |

**The parser pins these indices and validates them on load** — it asserts field count 15 and that field 2 holds a known word-class code, refusing loudly otherwise. It does not guess, and it does not silently accept a 6-field SHsnid file handed to it by mistake.

---

## 4. Acquisition — ⚠️ CORRECTED 2026-08-10: THE ROUTE-BOUND CLAUSE IS NOT IN THE LICENCE

**This section originally made the download an operator-only step**, on the decision record's section titled *"The clause that matters most, and that nothing else had: the grant is route-bound"*, which quotes — as *"Verbatim from SÁM's terms"* — a sentence restricting the grant to data fetched from `/gogn/mimisbrunnur/` and prohibiting all copying of the BÍN website.

**The lead supplied the full terms on 2026-08-10. That sentence is not in them.** Checked clause by clause against *Skilmálar um notkun gagna úr Beygingarlýsingu íslensks nútímamáls*:

| record's claim | in the terms |
|---|---|
| CC BY-SA 4.0 | ✅ |
| credit required **in products built on BÍN data**, exact string, cites §3(a)(1)(A) | ✅ verbatim |
| modifications must be declared, cites §3(a)(1)(B) | ✅ verbatim |
| *"Notast skal við vefhlekkinn https://bin.arnastofnun.is"* | ✅ verbatim |
| 🔴 **route-bound grant / website-copying prohibition** | ❌ **absent** |
| SÁM direct paradigm-publishers to BÍN-kjarninn and its API | ❌ **absent** |

The terms are plain **CC BY-SA 4.0 plus two obligations** — credit, and declare modifications — with a warranty disclaimer and a link requirement. There is no acquisition-route restriction, therefore no basis for the 🔴 on `django/api/nidurhal/`, and none for the "click-through acceptance binds" reasoning built on it.

**Measured, not assumed:** `HEAD` on that endpoint returns `200`, `Content-Disposition: attachment`, **35,655,687 bytes**, with **no acceptance step of any kind**. The file was obtained at that exact byte count.

⚠️ **This is CLAUDE.md § *One source of truth* operating on the project's own decision record**: a frozen document is *evidence, never status*, and enumerations must be **re-derived, not inherited**. A 🔴 prohibition, a spec section and an operator hand-off all rested on one sentence nobody had re-checked. → the decision record now carries a dated amendment; it is **not** edited in place.

### 4.1 What survives the correction — and it is the part that binds

- 🔴 **ShareAlike is confirmed, so D6 stands entirely unchanged.** It never depended on the route clause. This is now the single most load-bearing constraint in this spec.
- **Credit** *Beygingarlýsing íslensks nútímamáls. Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.* in Ritstjóri — the terms scope this to **products built on BÍN data**, which Ritstjóri is.
- **Declare that the forms are modified/generated** — §3(a)(1)(B). ⚠️ We union nothing but we *do* select and subset, which is a modification.
- **Use the link `https://bin.arnastofnun.is`.**
- **Commit no BÍN bytes.** `tools/data/` is gitignored at `.gitignore:56` under the comment *"Licensed data files (BÍN, etc.) — download separately per license terms"*. `sessions.db` is gitignored too, which is why **storing** forms is fine and **exporting** them is not.

---

## 5. The script

`tools/fetch_bin_inflections.py` → **`tools/fetch-bin-inflections.js`** (§6.0); the Python script is deleted.

| stage | today (Python) | B4b-0 (Node) |
|---|---|---|
| load | `inflection_map[lemma.lower()].add(form)` — fields 0, 4, whole file | `entries[bin_id] = {lemma, wordClass, forms}` — retains id + word class, **streamed line by line** (450 MB) |
| select | `terminology_translations` where `inflections IS NULL AND icelandic NOT LIKE '% %'` | `concept_term` where `lang='is' AND inflections IS NULL` |
| lookup | `map.get(word.lower())` → **union** | index `lemma.lower() → [bin_id…]` → **exactly one** id → its paradigm · **several, exactly one a noun** → that entry (D4.2, logged) · **otherwise** → refuse + report |
| write | `UPDATE terminology_translations …` | `UPDATE concept_term SET inflections = ? WHERE id = ?` |
| input file | `tools/data/SHsnid.csv` — 6 fields | `tools/data/KRISTINsnid.csv` — 15 fields (D2) |
| input guard | none — a wrong file parses to nothing and reports 0 found | **refuse** unless field count is 15 and field 2 holds a known word class (D7) |
| default | **`--execute` opt-in; dry-run is the default** | unchanged — the one thing worth keeping as-is |

⚠️ **The input guard is not defensive padding.** Today, handing the script the wrong CSV produces a clean run reporting "0 found" — indistinguishable from "BÍN does not have these words." A 6-field SHsnid file fed to a 15-field parser reads field 9 as out-of-range and silently matches nothing. **A zero-yield run must be refused, not printed** — that is B0's lesson, already recorded in `run-concept-import.js`'s own docstring.

Multi-word terms: today's `NOT LIKE '% %'` filter is retained, and the count of skipped multi-word strings is **reported** rather than silently dropped — `concept_term` holds far more multi-word Icelandic strings than the old model did, so the skip is a much larger and more interesting number here.

**Reported counts, all of them:** candidates · resolved-unambiguous · **rescued-nominal (with the discarded entries named — D4.2)** · **refused-ambiguous (with names)** · not-in-BÍN · multi-word-skipped · already-populated · written. Every candidate must land in exactly one bucket, with an **UNEXPLAINED tripwire** if the buckets do not partition — 048's discipline, for the same reason.

**Expected shape of a first full run**, from §6's measurements — stated so a wildly different result is a finding rather than a shrug. Against the 7,278 strings that carry inflections today: ~6,591 unambiguous, ~208 rescued-nominal, ~478 refused, ~1 not-in-BÍN. ⚠️ **The run's real candidate set is `concept_term`'s 70,103 Icelandic strings, not those 7,278, so its absolute totals are UNPREDICTED** — the *ratios* are the check, and the yield on the other ~63,000 is exactly the unknown §7 flags.

---

## 6. Testing and gates

### 6.0 ✅ RESOLVED *(lead, 2026-08-10)*: PORT TO NODE

⚠️ **The unit tests below were first specified against a harness that does not exist.** `fetch_bin_inflections.py` is Python; this repo's suite is **Vitest + Playwright**. Measured 2026-08-10: no `pytest.ini`, `pyproject.toml`, `setup.cfg`, `tox.ini` or `conftest.py`; the only `test_*.py` files in the tree are **vendored third-party code** under `experiments/cnxml-validation-gate/external/`; and **no workflow under `.github/workflows/` mentions Python or pytest at all**. A green `npm test` — the campaign's authoritative gate — would have said **nothing** about this script.

**Decision: port it.** `tools/fetch-bin-inflections.js` replaces the Python script, which is deleted; tests are Vitest under `server/__tests__/`, so they run in `npm test` and in CI's `test` job with no new surface. Rejected: *add pytest* (a new toolchain gating merges for one script) and *corpus-gate only* (the register's own warning — corpus-only properties are what the unit suite silently stops covering).

⚠️ **Two things the port must carry across, both easy to lose:**
- **`--execute` opt-in, dry-run default.** The Python script's one genuinely good safety property.
- **Streaming, not `readFileSync`.** The CSV is **450 MB / 7,425,931 lines**. Node's default string cap and the memory cost both make a whole-file read wrong here; the Python version used `csv.reader` over a file handle. Read it line by line and build only the index.

**Unit** — a synthetic KRISTINsnid fixture (no BÍN bytes committed; ⚠️ the fixture must be *invented* Icelandic-shaped rows, never real BÍN lines, because committing BÍN-derived bytes is the one thing the licence analysis forbids by default):

- a single-entry lemma resolves to its own paradigm
- **a lemma with two entries of the SAME word class is refused and named — never unioned, never picked** (D4's anchor; the `afl` case, kk + hk)
- **a lemma with several entries of which exactly one is a noun resolves to that noun, and the discarded entries are logged** (D4.2's anchor; the `hverfa` case, kvk + so + so)
- **a lemma with no noun entry is refused** (D4.2 must not fire on `afturkræfur`)
- ⚠️ **the base form is excluded from the stored paradigm** — the property that made §2.2.1's `n − 1` arithmetic legible, and which a rewrite can silently drop
- **a 6-field SHsnid row is refused, not parsed** (D7's input guard; the zero-yield trap)
- `--execute` absent writes nothing
- re-run is a measured no-op; a non-null value is never clobbered (D5)
- the bucket partition holds, and the tripwire fires when it is broken

⚠️ **No test may assert a total that equals a fixture's row count** — that passes for the wrong reason the moment the fixture changes. Assert the *identity* of what was written.

**Corpus gate** — `server/scripts/verify-b4b0-gates.js`, against a **scratch DB rebuilt from `~/idordabanki-raw-2026-08-07/`** via `run-concept-import.js --db <scratch>`. ⚠️ **Never `pipeline-output/sessions.db`, never prod.** The local dev DB cannot host this gate: it holds 6 terminology rows and no concept model at all.

| gate | asserts |
|---|---|
| 1 | **`afl`** — two noun entries (kk + hk) — is **refused**, not written, and named |
| 1b | **`hverfa` and `vinna` are RESCUED by D4.2** and written with the **kvk noun's paradigm only** — asserted by *identity*: the stored forms must contain none of the verb participles (`horfinn`, `horfið`, `unninn`, `unnið`) that contaminate them today. ⚠️ **This gate did not exist until D4.2 was adopted, and the table asserted the opposite** — that all three were refused. A gate written against a superseded decision passes or fails for reasons unconnected to the code. |
| 2 | **the control:** an unambiguous term IS written, with a paradigm containing no foreign-gender form |
| 3 | **inertness:** `findTermsInSegments` output is byte-identical before and after the run |
| 4 | **the licence control:** the glossary export payload gains **no** inflections key (D6) |
| 5 | re-run writes 0 rows, and the before/after non-null counts prove it (D5) |

⚠️ **Gate 2 is what makes gate 1 mean anything.** A run that refused *everything* would pass gate 1 perfectly.

---

## 7. Deferred, logged here, none blocking

- **Staleness:** the propose route still writes `terminology_translations.inflections`, so an inflection an editor adds between B4b-0 and Part C never reaches the concept model, **and nothing goes red**. → register.
- **No compounder:** BÍN lacks this project's chemistry coinages (*kjarnsækir, oxósýra, pniktógen, mólarleysni, kúvetta*). A prior measurement against 756 project glossary terms resolved 488 (65%) via BinPackage **with** its compounder; a raw CSV lookup without one will do worse. **The yield of this run is therefore unpredicted and must be reported, not assumed.**
- **Multi-word terms** are skipped entirely; `concept_term` holds many.
- **BinPackage** is the designated route for *publishing* paradigms per SÁM, and is not evaluated here.
- **Coverage question B4b-1 must answer:** what fraction of *matched* terms end up with a paradigm. A low figure makes the `missing` check noisier than today's, and that is a B4b-1 acceptance input, not a B4b-0 one. **D4.1 ② is the sharper version of this question** — the noise is not hypothetical, it is 686 terms at minimum.
- **⚠️ B4b-1 INHERITS A SEMANTIC NARROWING NOBODY HAS NAMED.** The old `missing` check tests **every** approved translation — `approvedTranslations.some((t) => t.isRegex.test(seg.isContent))`, so a segment passes if the editor used *any* approved Icelandic word for that headword. **The concept model returns ONE winner.** So B4b-1's check will demand *the resolved term specifically*, and a segment using a legitimate synonym — a rank-2 `concept_term` the resolver did not pick — starts failing. That is arguably the *correct* behaviour for a book that has chosen its term, and it is exactly what §C36 exists to enable. **But it is a behaviour change in issue detection that no gate currently names, and it lands on editors as new warnings on text they already reviewed.** It belongs in B4b-1's acceptance criteria; `resolve()`'s `alsoInScope` already carries the material for a softer "you used a known alternative" tier.

---

## 8. Preconditions

1. ✅ **`tools/data/KRISTINsnid.csv` — OBTAINED 2026-08-10**, 35,655,687 bytes zipped (byte count matched `Content-Length`), 450 MB / 7,425,931 lines extracted. Gitignored at `.gitignore:56`. **No BÍN bytes are committed, and none may be** — including in test fixtures (§6).
2. ✅ **The 15-field layout is confirmed against the real file** — D7, which this spec originally declined to state. There is **no header row**.
3. ⬜ A locally rebuilt concept corpus in a scratch DB (§6). The raw source is present at `~/idordabanki-raw-2026-08-07/`. **Still open.**
4. ✅ **The decision record's dated amendment for §4's licence correction — APPENDED 2026-08-10** (append-only; the 2026-08-06 body is not edited). Logged in the register as **§C41**.

---

## 9. Attribution

This spec quotes inflected forms derived from BÍN, and the work it specifies builds on BÍN data.

> **Beygingarlýsing íslensks nútímamáls.** Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir. — <https://bin.arnastofnun.is>

**The forms are modified**: selected per lemma, subsetted (the base form is excluded), and — in the production values quoted in §2.2 — unioned across BÍN entries by the defect this spec exists to end. Required by CC BY-SA 4.0 §3(a)(1)(A) and §3(a)(1)(B) per SÁM's terms; see §4.1.

⚠️ **The same obligation lands on Ritstjóri** the moment B4b-0 writes: it becomes a *product built on BÍN data*, and the credit plus a statement that the forms are generated must be visible there. **That is an implementation task, not a footnote** — it is not currently in §5.
