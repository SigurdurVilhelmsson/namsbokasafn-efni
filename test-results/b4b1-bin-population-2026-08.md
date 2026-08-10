# §C36 — the BÍN population op: `concept_term.inflections` on production

**Executed 2026-08-10 against production**, prod HEAD `78cdad14` (contains B4b-0b `a81ae7ba`), Node v22.23.1, via `server/scripts/fetch-bin-inflections.js --execute`. This is the [LEAD] data op that **D2-a** made a precondition of §C36 B4b-1.

**Banner: frozen evidence, not status.** If it disagrees with the register, the register wins.

**Rollback point:** `pipeline-output/backups/sessions.2026-08-10-193708.db` (47,464,448 B), taken via `scripts/backup-db.sh` before any write. ⚠️ **Local only** — `BACKUP_REMOTE` is not set on prod, so the off-box leg did not run.

---

## 0. ⚠️ THE FIRST ATTEMPT WAS ABORTED — PROD HELD THE WRONG BÍN RELEASE (§C46)

The op was run once and **stopped at the dry run**. Prod's `tools/data/SHsnid.csv` was an **older BÍN release** than every B4b-0b figure had been measured against. Three independent confirmations:

| | dev (verified drop) | prod (as found) |
|---|---|---|
| lines | **7,425,931** — exactly the B4b-0 spec's recorded figure | 7,417,027 (**8,904 fewer**) |
| zip bytes | **33,652,916** — exactly the spec's recorded figure | 33,611,877 |
| sha256 | `9c10d70d…` | `86bf1730…` |
| arrived | 2026-08-10 | **2026-03-25** by `ctime` — the original Íðorðabankinn import day |

🔴 **The script's input guard cannot see this.** It validates the **field count** (6 = SHsnid); both files are valid 6-field SHsnid. The B4b-0 spec warned about the adjacent case — *"corrupt yield reads as data; zero yield at least looks wrong"* — and this is quieter: the input was not corrupt, only **stale**, so a full run would have completed cleanly and written a plausible paradigm set indistinguishable from the right one.

⚠️ **A per-file checksum sidecar is NOT a release check.** Both boxes carried one and **both verified**. What disagreed was the two boxes, and nothing compared them.

**What exposed it:** the dry run's *denominators* reproduced the recorded figures exactly (53,719 strings · 74,004 rows · 18,299 multi-word skipped) while every *yield* bucket diverged. **The corpus matching exactly is what proved the input was the variable.**

**Remedy:** prod's old release was **preserved, not overwritten** (`tools/data/SHsnid.csv{,.sha256sum,.zip}.2026-03-release`); the verified drop was transferred **as its 33 MB zip**, extracted on prod, and checked — 376,901,553 bytes, 7,425,931 lines, sha `9c10d70d…`, all matching dev exactly.

---

## 1. The run, against the verified drop

**⚠️ TWO UNITS. One Icelandic string owns many `concept_term` rows** (74,004 rows over 53,719 strings). The BÍN lookup is per **string**; the write fans out to **rows**.

| Bucket | Strings | % of 53,719 |
|---|---:|---:|
| unambiguous | 14,556 | 27.10% |
| rescued-nominal (D4.2) | 463 | 0.86% |
| refused-ambiguous (D4) | 140 | 0.26% |
| refused-no-noun (D4) | 46 | 0.09% |
| base-form-only | 276 | 0.51% |
| **not in BÍN** | **38,238** | **71.18%** |

- **Rows written: 27,728 — 37.47% of the 74,004 candidate rows.**
- Strings that received a paradigm: **15,019** (case-folded) = 27.96% of strings.
- Multi-word rows skipped by SQL: **18,299** (permanently base-form-only).
- `already populated (rows): 0 → 27,728`.

✅ **`71.18%` and `276` reproduce the register's recorded figures EXACTLY**, and `14,556 / 463` reproduce the B4b-1 design session's independent scratch-corpus run exactly.

### 1.1 ⚠️ THE REGISTER'S `14,299 / 26.62%` IS A PRE-FIX FIGURE, AND THE ARITHMETIC PROVES IT

The register records that a case-folding fix moved refusals **906 → 186**. This run refuses **140 + 46 = 186**. And:

```
14,299 + 906   = 15,205
14,556 + 463 + 186 = 15,205
```

Both partitions close on the same total, so `14,299` is simply the measurement taken **before** B4b-0b's twelve review fixes. **The recorded per-string `25.87%` and per-row `33.50%` hit rates are stale for the same reason; the shipped code yields `27.96%` per string and `37.47%` per row.** ⚠️ The evidence doc therefore mixes pre-fix and post-fix numbers in one table (`71.18%` and `276` are current; the hit rates are not) — **do not quote a hit rate from it.**

---

## 2. Verification — every control passed

| Check | Result |
|---|---|
| `concept_term.inflections IS NOT NULL` | **27,728** ✅ (was 0) |
| …all on `lang='is'` | **27,728** ✅ |
| `concept` | 70,187 ✅ unchanged |
| `concept_term` | 192,189 ✅ unchanged |
| `terminology_translations` | 28,903 ✅ unchanged |
| OLD `terminology_translations.inflections` | 9,715 ✅ unchanged — the old model was not touched (D1) |
| rows holding `'null'` or `'[]'` | **0 / 0** ✅ — the values that would break the `JSON.parse` idiom |
| `[vantar]` rows with a paradigm (§C43) | **0** ✅ |
| multi-word rows with a paradigm | **0** ✅ — the SQL skip held |
| prod git tree | **clean** ✅ — no content commit, so no backup stranding |
| `tools/data/` ignored on prod | ✅ `.gitignore:56` — **no BÍN bytes can be committed** |
| `/api/health` | **`status: ok`**, all seven checks ✅ |

**Sampled values are real paradigms**, e.g. `atóm → ["atóma","atómanna","atómi","atómin","atóminu","atómið","atóms","atómsins","atómum","atómunum"]` — a correct neuter declension with definite forms; `sýra` and `frumeind` likewise.

### 2.1 ⚠️ A DISCREPANCY THAT WAS A UNIT MISMATCH IN THE CHECK, NOT A DEFECT IN THE WRITE

`COUNT(DISTINCT text)` returned **15,027** against the expected `14,556 + 463 = 15,019` — **8 too many**. Cause: the producer counts strings **case-folded**; the check counted them **binary**. `COUNT(DISTINCT lower(text))` returns **15,019** exactly.

The 8 are case-variant pairs: `fat/FAT` · `magni/Magni` · `Mendelslögmál/mendelslögmál` · `p-gildi/P-gildi` · `S-bylgja/s-bylgja` · `sjúkrasaga/Sjúkrasaga` · `verkjalyf/Verkjalyf` · `vetrarbrautin/Vetrarbrautin`.

🔴 **This is live evidence for B4b-1's D4.1** (three disagreeing string identities). Two of the eight — **`Magni`** (a personal name) and **`Vetrarbrautin`** (the Milky Way) — are exactly the *proper-noun-case-folds-onto-an-ordinary-word* hazard the B4b-0 spec named. **The corpus demonstrably contains case-variant Icelandic terms carrying paradigms**, so fold agreement in the matcher is not hypothetical.

## 3. Idempotency — MEASURED, per B4b-0 D5

A third dry run, after the write:

| | before | after | reconciles |
|---|---:|---:|---|
| candidate strings | 53,719 | **38,700** | − 15,019 written ✅ |
| candidate rows | 74,004 | **46,276** | − 27,728 written ✅ |
| already populated | 0 | **27,728 → 27,728** | unchanged ✅ |
| would write | — | **0** | clean no-op ✅ |

**The residue partitions exactly:** 140 + 46 + 276 + 38,238 = **38,700**, and `462 of 38,700 are in BÍN` = 140 + 46 + 276. Nothing is unaccounted for.

---

## 4. What this does and does not change

**Does:** B4b-1's precondition (D2-a) is discharged. The matcher's Icelandic-side inflection check now has data to read once B4b-1 cuts over.

**Does NOT — and this is the point of the slice order:**

- **Nothing reads the column.** The only non-test code naming both `concept_term` and `inflections` is the producer itself. **This write is observably inert**; no restart was needed and none was performed.
- **It does not make the paradigm path tested.** The C24 golden is provably blind to inflections (strip them all and it is byte-identical) — B4b-1 still owes **gate 7**.
- **~70% of Icelandic rows still carry no paradigm**, including the 18,299 multi-word rows that are permanently base-form-only. D2-a removed the *100%* window; base-form matching remains the majority path.
- 🔴 **§C41 is untouched and still binding:** BÍN-derived forms must never enter `glossary-unified.json`. Satisfied here **structurally** — the column has no reader — not by a gate.
