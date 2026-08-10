# §C36 Part B4b-0 — pos-aware BÍN inflections, written onto the concept model

**Written 2026-08-10** · Branch `spec/c36-b4b-matcher-cutover` · Slice of §C36 B4b, ahead of the `findTermsInSegments` cut-over (B4b-1)

> Evidence for every number here is [test-results/b4b-matcher-cutover-2026-08.md](../../../test-results/b4b-matcher-cutover-2026-08.md), measured read-only on production 2026-08-10. **Status lives in the register, not here.**

---

## 1. What this is, and what it deliberately is not

B4b-1 cuts `findTermsInSegments` over from the old terminology tables to `resolve()`. That cut-over silently deletes the matcher's inflection-aware Icelandic-side check, because **`concept_term.inflections` is declared by migration 045 and has never been written or read** — `045-concept-model.js` is the only concept-model file in the tree that mentions the column.

**B4b-0 populates it, from BÍN, with a lookup that does not merge homographs.**

### 1.1 What B4b-0 changes

1. `tools/fetch_bin_inflections.py` becomes **pos-aware** and **targets `concept_term`** instead of `terminology_translations`.
2. It parses **`KRISTINsnid.csv`** instead of `SHsnid.csv`.
3. A data op writes ~`concept_term.inflections` for the Icelandic terms BÍN can resolve unambiguously.

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

So D4's refuse-rather-than-guess rule costs on the order of **2% of candidate strings** — and that figure is consistent, from an entirely independent direction, with the 1.28% contamination floor measured on our own terms. **The safe rule is cheap here; that is a measurement, not a hope.**

### 2.3 That inverts the build-or-copy decision

The contamination **cannot be repaired in place**: a stored value is a union with no record of which lemma contributed which form, so un-merging requires re-consulting BÍN. **Fixing therefore means regenerating — and once you are regenerating, the old model's 7,278 strings have no advantage over a fresh run against `concept_term`'s 70,103.** Hence the lead's decision (2026-08-10) to skip the backfill entirely.

---

## 3. Decisions

### D1 — Source of truth is BÍN, target is `concept_term` *(lead, 2026-08-10)*

The old `terminology_translations.inflections` is **not read, not copied, and not migrated**. Part C deletes that table; routing this data through it would be work performed on a corpse.

### D2 — `KRISTINsnid.csv`, not `SHsnid.csv` *(lead, 2026-08-10)*

Per the licensing decision record: SHsnid (6 fields) is purely **lýsandi** — it records every attested variant without judging any. KRISTINsnid (15 fields) is partly **vísandi** — it takes a position on the validity of variants. **A textbook glossary wants the standard form, not every attested variant.**

⚠️ `Storasnid_ritm.csv` deliberately carries **misspellings, typos and older orthography**. It must never be used here. It is spell-checker material.

### D3 — Disambiguate on BÍN's own identity, never on ours

`terminology_headwords.pos` is non-empty on **2 rows of 20,272**, so there is no local signal. The loader must therefore retain BÍN's **`Auðkenni` (id)** and **`Orðflokkur` (word class)** and group forms **per BÍN entry**, not per lowercased lemma string.

### D4 — ⚠️ AN AMBIGUOUS STRING IS REPORTED, NEVER UNIONED AND NEVER GUESSED

When one Icelandic string maps to **more than one** BÍN entry:

- **Do not union.** That is the present defect.
- **Do not pick.** A deterministic pick — first id, largest paradigm, most common word class — would let an arbitrary rule decide an editorial answer. **That is §C18's defect** (row order deciding which Icelandic word readers see) reproduced inside its own successor, and §C38's (a mechanism that cannot express what the editor means) one level down.
- **Write nothing for that string, and report it by name**, with every contending BÍN id and word class.

The resolver already holds this doctrine in as many words — *"resolving to the majority form would be guessing"*. This is the same rule at the data layer.

**Consequence to accept up front:** the ambiguous strings end with `inflections IS NULL`, so B4b-1's `missing` check matches their base form only. **That is strictly better than today**, where those strings match a *contaminated* paradigm — a base-form match is a true subset of a correct paradigm, whereas a merged one contains forms that are simply not this word's.

**The rule is REFUSE ON >1 ENTRY, not on >1 word class.** The word-class split is what makes contamination *visible* (0.93%), but two same-class entries sharing a lemma are still two different words, and picking between them is still guessing. Measured cost of the stricter line: **2.12% versus 0.93%** — 1.2 percentage points to avoid a whole class of invisible error. ⚠️ **Deferred refinement, not taken here:** where several entries yield *identical* form sets there is nothing to choose between, so the union is provably a no-op and could be accepted. That recovers at most a fraction of the 2.12%; it is complexity for a bounded gain and is not worth it before the yield of a plain run is known.

### D5 — One-way fill, and idempotency is MEASURED not inferred

The write is guarded `WHERE inflections IS NULL`, so the op never clobbers a later writer. **But that guard is not the evidence of a no-op**: the run reports destination rows with non-null inflections **before and after**, so "already populated" is distinguishable from "nothing matched". Inferring one from the other is how a run that silently did nothing reads as success.

### D6 — 🔴 INFLECTIONS MUST NOT ENTER THE GLOSSARY EXPORT PAYLOAD

`sessions.db` is gitignored, so **storing** BÍN-derived forms needs no licence change. The export is different: `glossary-unified.json` is **committed and world-readable**, this repo publishes `books/` under per-book CC licences, and BÍN is **CC BY-SA**.

Adding an inflections column to the payload would publish CC BY-SA data under CC BY 4.0 **via the unforced 2-hourly cron**, and it would be invisible to **both** existing gates — the producer gate fingerprints the term shape, the shrink guard measures size, and neither would flag a new key on a growing payload. The licensing record already flags this for `exportBookGlossary()`; **B3 shipped a second exporter after that record was written**, so it applies to `buildResolvedGlossary` too.

`buildResolvedGlossary`'s `terms` statement selects `id, text, rank` and must keep doing so.

### D7 — ✅ The layout is CONFIRMED AGAINST THE REAL FILE, and it has NO header row

This decision was originally written as *"the parser is header-driven and refuses an unexpected layout"*, because `bin.arnastofnun.is` is a client-rendered SPA returning a 3,625-byte shell for every path — including its own format documentation — so the field order could not be verified remotely. **D7's own contingency clause is now the actual case**: the file has **no header row**, so the layout is pinned from the file itself.

`KRISTINsnid.csv` — 450 MB, **7,425,931 lines**, `;`-separated, **15 fields, no header**:

```
zafl;9001;kvk;alm;1;;;;V;zafl;NFET;1;;;
zafl;9001;kvk;alm;1;;;;V;zaflin;NFETgr;1;;;
```

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

`tools/fetch_bin_inflections.py`, rewritten:

| stage | today | B4b-0 |
|---|---|---|
| load | `inflection_map[lemma.lower()].add(form)` — fields 0, 4 | `entries[bin_id] = {lemma, word_class, forms}` — retains id + word class |
| select | `terminology_translations` where `inflections IS NULL AND icelandic NOT LIKE '% %'` | `concept_term` where `lang='is' AND inflections IS NULL` |
| lookup | `map.get(word.lower())` → union | index `lemma.lower() → [bin_id…]`; **exactly one** id → its paradigm; **more than one** → refuse + report |
| write | `UPDATE terminology_translations …` | `UPDATE concept_term SET inflections = ? WHERE id = ?` |
| input file | `tools/data/SHsnid.csv` — 6 fields | `tools/data/KRISTINsnid.csv` — 15 fields (D2) |
| input guard | none — a wrong file parses to nothing and reports 0 found | **refuse** unless field count is 15 and field 2 holds a known word class (D7) |
| default | **`--execute` opt-in; dry-run is the default** | unchanged — the one thing worth keeping as-is |

⚠️ **The input guard is not defensive padding.** Today, handing the script the wrong CSV produces a clean run reporting "0 found" — indistinguishable from "BÍN does not have these words." A 6-field SHsnid file fed to a 15-field parser reads field 9 as out-of-range and silently matches nothing. **A zero-yield run must be refused, not printed** — that is B0's lesson, already recorded in `run-concept-import.js`'s own docstring.

Multi-word terms: today's `NOT LIKE '% %'` filter is retained, and the count of skipped multi-word strings is **reported** rather than silently dropped — `concept_term` holds far more multi-word Icelandic strings than the old model did, so the skip is a much larger and more interesting number here.

**Reported counts, all of them:** candidates · resolved-unambiguous · **refused-ambiguous (with names)** · not-in-BÍN · multi-word-skipped · already-populated · written. Every candidate must land in exactly one bucket, with an **UNEXPLAINED tripwire** if the buckets do not partition — 048's discipline, for the same reason.

---

## 6. Testing and gates

**Unit** — a synthetic KRISTINsnid fixture (no BÍN bytes committed; ⚠️ the fixture must be *invented* Icelandic-shaped rows, never real BÍN lines, because committing BÍN-derived bytes is the one thing the licence analysis forbids by default):

- a single-entry lemma resolves to its own paradigm
- **a two-entry lemma is refused and named — never unioned, never picked** (D4's anchor; the `afl` case)
- an absent header column refuses with the columns it found (D7)
- `--execute` absent writes nothing
- re-run is a measured no-op; a non-null value is never clobbered (D5)
- the bucket partition holds, and the tripwire fires when it is broken

**Corpus gate** — `server/scripts/verify-b4b0-gates.js`, against a **scratch DB rebuilt from `~/idordabanki-raw-2026-08-07/`** via `run-concept-import.js --db <scratch>`. ⚠️ **Never `pipeline-output/sessions.db`, never prod.** The local dev DB cannot host this gate: it holds 6 terminology rows and no concept model at all.

| gate | asserts |
|---|---|
| 1 | `hverfa`, `vinna`, `afl` — contaminated under the old lookup — are **refused**, not written, and named |
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
- **Coverage question B4b-1 must answer:** what fraction of *matched* terms end up with a paradigm. A low figure makes the `missing` check noisier than today's, and that is a B4b-1 acceptance input, not a B4b-0 one.

---

## 8. Preconditions

1. ✅ **`tools/data/KRISTINsnid.csv` — OBTAINED 2026-08-10**, 35,655,687 bytes zipped (byte count matched `Content-Length`), 450 MB / 7,425,931 lines extracted. Gitignored at `.gitignore:56`. **No BÍN bytes are committed, and none may be** — including in test fixtures (§6).
2. ✅ **The 15-field layout is confirmed against the real file** — D7, which this spec originally declined to state. There is **no header row**.
3. ⬜ A locally rebuilt concept corpus in a scratch DB (§6). The raw source is present at `~/idordabanki-raw-2026-08-07/`. **Still open.**
4. ✅ **The decision record's dated amendment for §4's licence correction — APPENDED 2026-08-10** (append-only; the 2026-08-06 body is not edited). Logged in the register as **§C41**.
