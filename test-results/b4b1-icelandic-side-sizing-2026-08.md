# §C36 B4b-1 / D1 — sizing the ICELANDIC side of the matcher cut-over

**Measured 2026-08-10, READ-ONLY, against production `sessions.db`** (`/home/siggi/repos/namsbokasafn-efni/pipeline-output/sessions.db`), prod HEAD `78cdad14`, Node v22.23.1. The database was opened `{readonly: true, fileMustExist: true}` with **better-sqlite3 from `server/node_modules`** — never the `sqlite3` CLI. No write was issued; prod's working tree was confirmed clean afterwards.

**Why this exists.** The register and [`b4b-matcher-cutover-2026-08.md`](b4b-matcher-cutover-2026-08.md) record *"0 lost at cut-over"* — but that figure covers the **English key only**. The Icelandic side, which is what an editor actually contributes and what the matcher emits, had never been sized. It is the missing input to design decision **D1** in [`2026-08-10-terminology-concept-model-part-b4b1-design.md`](../docs/superpowers/specs/2026-08-10-terminology-concept-model-part-b4b1-design.md).

**Banner: this file is frozen evidence, not status.** If it disagrees with the register, the register wins.

---

## 0. Controls — taken first, because nothing below is admissible without them

| Control | Recorded | Measured | |
|---|---|---|---|
| `concept` | 70,187 | **70,187** | ✅ |
| `concept_term` | 192,189 | **192,189** | ✅ |
| `terminology_translations` | 28,903 | **28,903** | ✅ |
| `terminology_headwords` | 20,272 | **20,272** | ✅ |
| **EN side present in `concept_term(lang='en')`** | 100% | **20,272 / 20,272 = 100.00%** | ✅ independently reproduced |
| **CONTROL: reverse direction** (concept IS strings present in the old model) | — | **22,541 / 70,118 = 32.15%** | ✅ **asymmetric, so the join is real** |

The reverse control is the one that makes the rest mean anything: a join that answered ~100% in both directions would indicate a broken comparison rather than good coverage.

---

## 1. 🔴 THE HEADLINE: the Icelandic side is **99.98% expressible**. Only **5 approved pairs** are not.

**Unit: distinct approved `(english, icelandic)` pairs. Comparison: exact / binary.** *(All 28,903 rows are `status='approved'` — see §3 — so "approved pairs" is the whole population, not a subset.)*

| | Pairs | Share |
|---|---:|---:|
| **(1)** whole `icelandic` string expressible as-is — a concept carries **both** the English and that Icelandic | 27,285 | 94.40% |
| **(2)** the field is a **comma-separated synonym list**, and **every** synonym is expressible | 1,613 | 5.58% |
| **(3)** comma list, only **some** synonyms expressible | **0** | 0.00% |
| **(4)** **nothing** expressible | **5** | **0.02%** |
| **⇒ expressible in some form (1+2+3)** | **28,898** | **99.98%** |

**All 5 of the unexpressible pairs have their Icelandic text present in the corpus** — just carried by a *different* concept. **Zero approved Icelandic strings are absent from the corpus entirely.**

## 2. ⚠️ THE FIRST MEASUREMENT SAID 5.60% WAS "GENUINELY LOST EDITORIAL VOCABULARY". IT WAS WRONG, AND THE ERROR IS THE INSTRUCTIVE PART.

The first pass compared the old `icelandic` field **as a whole string** and found 1,618 pairs (5.60%) with no match, of which 1,613 had "the IS string absent from the corpus entirely". Read literally, that is *1,613 editorial decisions destroyed by the cut-over*.

**It was a format artifact.** The old model stores **multiple Icelandic synonyms in ONE `icelandic` field, comma-separated**; `concept_term` stores each synonym as its own row. So the composite string is absent by construction. **[measured]** 1,647 of 28,903 rows (5.70%) contain a comma.

**What caught it was reading a sample, not re-running the query.** The counts were internally consistent and the controls all passed; the defect was visible only in the values:

```
meniscus          ->  bjúgborð, vökvakúpull
state of matter   ->  efnafasi, efnisástand
Gibbs free energy ->  fríorka Gibbs, frjálsorka Gibbs, Gibbs frjálsorka
```

**Two lessons, both of which this project has recorded before and neither of which prevented this:**

- **A join key is a format assumption.** Comparing two schemas on a text column silently assumes they *tokenise the same way*. They did not, and nothing in the schema said so.
- **Print the values, not only the counts.** A count cannot show you that your key is malformed; 1,613 was a perfectly plausible number, and every control around it passed. → [[engineering-lessons]]

## 3. `status` is a column with ONE value in production

**[measured]** `SELECT status, COUNT(*) FROM terminology_translations GROUP BY status` → **`approved` 28,903**, and nothing else.

There are **zero `proposed` rows on production.** So the matcher's `WHERE t.status IN ('approved','proposed')` filter selects everything, and the design's §2.1 concern — that the concept model has nowhere to represent *proposed* — is **empirically moot on the current data** while remaining true of the code path. It also means the "an EDITOR-role user can make a term matchable with no head-editor approval" hazard is real in code and **has never been exercised**.

⚠️ This is a fact about **today's rows**, not a constraint: nothing stops the next propose from writing `proposed`.

---

## 4. What this settles, and what it explicitly does NOT

**Settles (D1's input):** the cut-over does **not** discard existing editorial vocabulary. 99.98% of it is expressible in the concept model, and the 0.02% that is not is a *linking* disagreement, not missing words. **D1 is therefore about the WRITE PATH — the inability to record NEW decisions — and not about losing old ones.**

🔴 **Does NOT settle — and the distinction is the whole point: EXPRESSIBLE ≠ SELECTED, and EXPRESSIBLE ≠ MIGRATED.**

- **Expressible ≠ selected.** This measurement asks only whether *a concept exists carrying both strings*. It does **not** ask whether `resolve()` would **return** that Icelandic — the resolver picks by domain priority → book preference → head form, and may well return a different synonym of the same concept. **That agreement rate is unmeasured**, and it is what determines how much editor-visible change the cut-over actually produces. It is the job of the design's **gate 3** (`missing`-issue volume, old vs new, on the same real segments), not of a precondition query.
- **Expressible ≠ migrated.** No bridge exists and no migration backfills one. "The vocabulary is present in the corpus" is not "the editor's choice has been carried across."

**Consequence for the comma lists:** 1,613 pairs are expressible only by *splitting* a field. Nothing in the tree splits it today. If any future bridge or comparison consumes `terminology_translations.icelandic`, it must tokenise on commas or it will reproduce this exact false negative.

---

## 5. Reproduction

Three read-only scripts, run from `/tmp` on prod with **absolute** requires into `server/node_modules` (a script under `/tmp` cannot resolve `better-sqlite3` otherwise — Node resolves from the *file's* location — and writing into prod's repo checkout is forbidden). Each opened the DB readonly and closed it; the scripts were removed after the run and prod's tree was verified clean.

The controls in §0 must be re-taken on any re-run: they are what make the comparison admissible.
