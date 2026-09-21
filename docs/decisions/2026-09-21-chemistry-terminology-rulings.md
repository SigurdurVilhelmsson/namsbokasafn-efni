# Decision: nine chemistry terminology rulings, and the concept-model changes they require

- **Status:** Accepted
- **Ruled by:** [USER], 2026-09-21
- **Cited by:** the active campaign register (§C170b) and
  `docs/handoffs/2026-09-21-glossary-subset-audit.md`, which raised 18 questions; these nine are answered.

## The rulings, and what each one costs to apply

| english | ruled | glossary today | action |
|---|---|---|---|
| hydrocarbon | **vetniskolefni** | `vetniskol` *(domain: physics)* | **CHANGE** — ruled form is a listed alternative |
| carbohydrate / carbohydrates | **sykra / sykrur** | `sykra` / `sykrur` | ✅ already correct — put ON the wire |
| laser | **leysir** | `ljósleysir` *(physics)* | **CHANGE** — ruled form is a listed alternative |
| steam | **gufa** | `vatnsgufa` *(physics)* | **CHANGE** — not currently listed |
| electronegative | **rafneikvæður** | `rafeindadrægur` *(physics)* | **CHANGE** — not currently listed |
| phase transition | **fasabreyting** | `hamskipti` *(physics)* | **CHANGE** — ruled form is a listed alternative |
| amorphous | **myndlaust** | `myndlaus` *(physics)* | ⚠️ see the note below |
| carbon monoxide | **kolmónoxíð** | `koleinoxíð` *(biology)* | **CHANGE** — not currently listed |
| lone pair | **rafeindapar** | `rafeindapar` | ✅ already correct — put ON the wire |

🔑 **`electronegative → rafneikvæður` makes the PAIR consistent, which is why it is right.** The book
already has `electronegativity → rafneikvæðni` in the **chemistry** domain; the singular adjective sat
at `rafeindadrægur` in **physics**. [USER] noted the pairing explicitly. Measured: the book's own MT
writes `rafneikvæð-` **140 times** against `rafeindadræg-` **5**.

⚠️ **`amorphous` — THE RULED FORM IS THE NEUTER, AND A GLOSSARY HEAD FORM MUST BE THE LEMMA.**
`myndlaust` is the neuter of `myndlaus`, which is what the glossary already stores. Storing the
neuter would instruct the model to use it with masculine and feminine nouns too — wrong for
*myndlaus brennisteinn*. ▶ **Read as: the `myndlaus` family, NOT `formlaus`** — so the existing row
is correct and the change is only that it now rides the wire. **Confirm if that reading is wrong.**

⚠️ **Four rows carry a NON-chemistry domain** (hydrocarbon, laser, steam, electronegative are
*physics*; carbon monoxide is *biology*). The audit found that nearly every wrong-sense homograph it
caught carried a non-chemistry domain, so these are worth revisiting as a class, not one at a time.

## 🔴 How these are applied, and the trap

**Edit the CONCEPT MODEL, never `terminology_translations` and never the exported file.** CLAUDE.md
records that setting `status` on `terminology_translations` *applies cleanly and changes the exported
payload not at all*, because `resolvedGlossary` re-stamps every term `approved`. The working edits are
`UPDATE concept_term.text`, `DELETE` of a `concept_term` row, or an `INSERT` in a higher-priority
domain. A DB change needs **no deploy** — `export-terminology.js --force` rewrites the file that MT
and inject read from disk — but a large shrink needs that explicit `--force`, because the cron passes
no override and would otherwise open a D6-clocked refusal instead of writing.

⚠️ **A hand-run `DELETE` against `book_domain_priority` is reverted on the next boot** by migration
047, which re-asserts `BOOK_DOMAIN_PRIORITY` from `server/lib/domains.js` on every start. If domain
scoping is ever the remedy, the file the code reads is the fix, never SQL.

## 🔴 The hydrocarbon ruling reaches chapters already bought — measured

`hydrocarbon = vetniskolefni` and `carbohydrate = sykra` together resolve the collision the audit
found: **ch20 currently calls both senses `kolvetni`** (59 hydrocarbon, 7 carbohydrate, including a
section title and a note title). With the ruling, `kolvetni` is retired for both.

**Where `kolvetni` sits in already-bought chapters — 40 occurrences across five:**

| chapter | `kolvetni` in MT | EN hydrocarbon | EN carbohydrate | sense |
|---|---|---|---|---|
| ch04 | 1 | 3 | 0 | hydrocarbon |
| ch05 | **24** | 5 | **28** | mostly **carbohydrate** |
| ch10 | 1 | 2 | 0 | hydrocarbon |
| ch11 | 12 | 13 | 1 | hydrocarbon |
| ch12 | 2 | 4 | 0 | hydrocarbon |

⚠️ **ch05 is the one to look at first and it is NOT the hydrocarbon case** — its 24 uses are
overwhelmingly *carbohydrate*, so they become **sykra**, not *vetniskolefni*. Reading the table by
chapter rather than by sense would apply the wrong word to the largest group.

**Unbought, so they get it right for free once the concept model is fixed:** ch18 (6 / 1) and
**ch20 (105 / 7)** — which is where the collision actually lives.

▶ **Not yet applied.** The concept-model edits, the re-export, and the decision about the 40 bought
occurrences (an editor's substitution versus a targeted re-buy) are the next session's first work.

---

## Addendum — `amorphous` confirmed, 2026-09-21

[USER]: *"yes, myndlaus is right"*.

✅ **The reading above was correct: the ruling chose the `myndlaus` family over `formlaus`, and
`myndlaust` was simply the neuter as it appears in context.** The stored lemma `myndlaus` stays
exactly as it is. **No concept-model change for this term** — the only action is that it now rides
its chapter's wire, where the model currently writes `formlaus` 28 times against `myndlaus` once in
the whole book.

▶ So the count stands at **five concept-model changes** (hydrocarbon, laser, steam, electronegative,
phase transition, carbon monoxide — six rows, five terms plus carbon monoxide) and **four terms that
were already correct** and need only to be put on the wire: carbohydrate, carbohydrates, lone pair,
amorphous.

_(Appended, not edited — a decision file is append-only, so the original question and its answer both
stay readable.)_

---

## Addendum 2 — the remaining audit questions, ruled 2026-09-21

[USER], verbatim:

> porous = gropinn
> submerged = á kafi
> trigonal planar = þríhyrnt flatt
> square planar = ferningslaga flatt
> complementary color = fyllingarlitur
> substituted - substitution is translated as "skiptihvarf". This will have to be reviewed by committee.
> fissionable - The physics glossary lists fissile and fissionable as the same term, translated as either kleyfur or kjarnkleyfur
> radioactive material = geislaefni or geislavirkt efni
> decay = sundrun

### 🔑 FOUR OF THESE NEEDED NO CHANGE AT ALL — the approved row already WAS the ruling

Measured against `books/efnafraedi-2e/glossary/glossary-unified.json` before anything was
written. **Checking first is what kept four no-op rows out of the concept model.**

| ruled | glossary today | action |
|---|---|---|
| porous = **gropinn** | `gropinn` *(physics)* | ✅ none — put ON the wire |
| complementary color = **fyllingarlitur** | `fyllingarlitur` *(physics)* | ✅ none — put ON the wire |
| square planar = **ferningslaga flatt** | `ferningslaga flatt` *(chemistry)* | ✅ none — put ON the wire |
| decay = **sundrun** | `sundrun` *(physics)* | ✅ none — already on ch21's wire |
| submerged = **á kafi** | `í kafi` *(biology)* | 🔧 **CHANGE** |
| trigonal planar = **þríhyrnt flatt** | `þríhyrningslaga flatt` *(chemistry)* | 🔧 **CHANGE** — see the warning below |

### §C73 unprompted control, measured over the committed chemistry MT

| form | tokens | | form | tokens |
|---|---|---|---|---|
| `á kafi` (ruled) | **9** | | `í kafi` (incumbent) | **0** |
| `gropin` (ruled) | 1 | | `gljúp` (what the model writes) | 11 |
| `fyllingarlitur` (ruled) | 0 | | `fyllilitur` (what the model writes) | 1 |
| `ferningslaga flatt` (ruled) | 3 | | — | — |
| `sundrun` (ruled) | 62 | | `hrörnun` | 112 |
| `þríhyrnt flatt` (ruled) | **0** | | `þríhyrningslaga` (incumbent) | **36** |

✅ **`submerged` is the cleanest case in either batch: the ruled form is produced 9 times and
the INCUMBENT is the form the model has never written.** The row being replaced was also in
the `biology` domain, so `chemistry` outranks it — the ordinary non-destructive route.

🔴 **`trigonal planar` IS THE ONE ENTRY IN THE WHOLE FILE THAT OVERRIDES A FORM THE MODEL
ALREADY PRODUCES, AND IT IS RECORDED THAT WAY RATHER THAN QUIETLY APPLIED.** The incumbent
`þríhyrningslaga flatt` is **already a chemistry row** and the MT writes `þríhyrningslaga`
**36 times**; the ruled `þríhyrnt flatt` appears **0** times. That is §C73's second test
failing on the *ruling* rather than on the incumbent — the opposite of every other term here.
It was applied because the ruling is explicit and there is precedent for a deliberate 0-token
ruling (`radioactive decay → geislasundrun`, 2026-09-20). **Say so if that reading is wrong.**
- ⚠️ **Its MECHANISM also differs.** Because the incumbent is in the SAME domain, this does not
  win by domain priority. It wins by §C164's tie-break in `conceptResolver.resolveCandidates`:
  among candidates at the best domain position, if the texts differ and exactly one is
  house-style, the house one wins. The test seeds a competing same-domain concept, because
  without one the assertion would pass against an empty table and prove nothing.

### ⏸ THREE ARE HELD OFF THE WIRE

- **`substituted` → committee.** Noted: `substitution → skiptihvarf` already exists as a
  **chemistry** row and the MT writes `skiptihvarf` 8 times, so that half is already right.
  The adjective `substituted → setinn` (domain *biology*, 0 tokens) stays off the wire.
- **`radioactive material`.** [USER] wrote *"geislaefni **or** geislavirkt efni"*. ▶ **Read as:
  both are acceptable, therefore no row is needed** — the house rule is to add a term only when
  it resolves an ambiguity the model cannot see, and the model already writes an acceptable
  form unprompted (`geislavirk-` 158, `geislaefni` **0**). **Dropped from ch21's subset.** This
  is an inference from the house rule, not a literal instruction — correct it if wrong.
- **`fissionable` / `fissile`.** [USER] stated a fact about the source rather than a direction,
  so nothing was applied. See the open question below.

### ⚖️ TWO QUESTIONS THIS ADDENDUM COULD NOT CLOSE

1. **`fissionable` vs `fissile`.** The glossary gives them **identical** rows —
   `kleyfur`, alt `kjarnkleyfur` — for both. But ch21 explicitly contrasts them
   (*"fissile material can undergo fission with neutrons of any energy, whereas fissionable
   material requires high-energy neutrons"*), and the **MT already keeps them apart
   unprompted: `klofnanleg` 18 for fissionable, `kleyf` 19 for fissile, `kjarnkleyf` 0.**
   Sending either row would collapse the distinction the chapter is teaching.
   ▶ **Leave both OFF the wire and keep the model's own distinction?** (That is the current
   state.) Or split them deliberately — e.g. `kjarnkleyfur` for one and `kleyfur` for the
   other? **A `kjarnkleyfur` split was NOT inferred or applied.**
2. **The `decay` family's consistency.** `decay = sundrun` is confirmed and already on the
   wire. But `nuclear decay → kjarnahrörnun` and `disintegration → hrörnun` are also approved,
   so ch21 would say *"1 Bq = 1 hrörnun á sekúndu"* while calling the same process *sundrun*
   elsewhere. ▶ **Both already carry a `-sundrun` LISTED ALTERNATIVE** (`kjarnasundrun`,
   `sundrun`), so making the family consistent is choosing a listed alternative, not coining a
   form. Make it consistent, or leave those two?

### 📌 STILL UNRULED after this addendum

`alpha particle` (ch21 — glossary `alfaögn`, alt `alfaeind`; MT writes `alfaeind` 13,
`alfaögn` 3, and the neighbouring `betaeind` 5) · bare **`plane`** (ch19 d-orbital diagrams;
⚠️ the two rulings above both chose **`flatt`** over `slétta`, which is evidence about *planar*
but not about a bare geometric *plane*) · the book-wide bad rows (`gray → grei`,
`valence → girðitala`, `addition → álagning`, `crystalline`, `chlorophyll`).

### 🔴 ONE CONSOLIDATED DECISION ON ALREADY-BOUGHT CHAPTERS

Two of these rulings reach chapters that are already bought, exactly as `hydrocarbon` does.
**These are one decision, not three** — editor substitution versus targeted re-buy:

| term | reaches UNBOUGHT chapters free | already BOUGHT |
|---|---|---|
| hydrocarbon / carbohydrate | ch18, ch20 | **40 `kolvetni`** across ch04 1 · ch05 24 · ch10 1 · ch11 12 · ch12 2 |
| trigonal planar | ch18 4 · ch19 1 · ch20 9 = **14** | **43** — ch07 29 · ch08 14 |
| submerged | ch17 6 · ch18 4 = **10** | **12** — ch01 5 · ch04 1 · ch05 5 · ch11 1 |

⚠️ **The EN counts were re-measured with `--include='*-segments.en.md'`: `02-for-mt/ch07/` holds
76 `.backup.*` files and a naive `grep -r` inflated every figure roughly ten-fold** (it read
`trigonal planar` as 303 in ch07 rather than 29).

### ▶ CONSEQUENCE FOR ch17

Its subset gains **`porous`** (rides immediately — no concept-model change) and **`submerged`**,
which rides only once the export converges. `submerged` is 6 occurrences in ch17, all figure
alt text. **Buying ch17 before the deploy costs those 6 renderings; buying after costs a wait.**
That trade is [USER]'s, not the session's.

_(Appended, not edited — a decision file is append-only, so every question and its answer stay
readable together.)_
