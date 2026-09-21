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
