# M0 — the post-run manual-fix ledger sweep

> **FROZEN EVIDENCE — 2026-08-23.** A sweep as run, with its range and predicate stated so a later
> reader can tell what was covered. **The register owns status**; if this disagrees with it, the
> register wins. **Nothing was fixed here — M0 is a sweep, not a fix pass.**

**Probe:** [`m0-anomaly-sweep-probe-2026-08-23.mjs`](m0-anomaly-sweep-probe-2026-08-23.mjs) —
read-only, cwd-independent. `git status` clean apart from this file and the probe.

---

## Headline — the sweep SHRANK the ledger and found one misclassification

**M2 and M3 are the same defect, in the same module, from one root cause — and it is a CODE
defect that cannot be fixed by hand at all.** The ledger goes from 3 seeded items to **1**
(M1), plus a new code item. **A ledger item that prescribes a hand fix which cannot be performed
is worse than no item**: it looks discharged when the work is impossible.

## Range swept, and the predicate

**Predicate:** content-level · KEPT book (`efnafraedi-2e`, `lifraen-efnafraedi`) · still open ·
**survives or is undone by the run** · cheaper by hand than by code.

**Swept:**
1. `books/{efnafraedi-2e,lifraen-efnafraedi}/02-mt-output/` — **full git history, path-filtered**
   (not subject-keyword filtered), then classified by hand.
2. Class B — alt attributes with no source string, both kept books, all `01-source`.
3. The `<media[^>]*>` truncation class — all media/image open tags, both kept books.
4. Published `<img>` alt across both kept books' `05-publication/`.
5. The register's body items — **101 enumerated mechanically** and filtered by book scope and
   class (see exclusions).
6. `docs/pipeline/cnxml-fidelity-gaps.md` · `docs/pipeline/html-pipeline-issues.md`.
7. Population reconciliation of §C32 / §C33 / §C107.

**Excluded as a class, with the reason** — this is what makes the range checkable:
- **Withdrawn books** (`edlisfraedi-2e`, `liffraedi-2e`, `orverufraedi`) — §C109's, not the
  ledger's. This is why **§C102 is out**: it looks like a fit and is *physics-only*.
- **Tooling / CI / authz / deploy / glossary-process items** — not content-level. Most of the 101.
- **Publication-layer items** (slugs, redirects, index — §C57, §C103, §C104) — runbook **Phase 5**
  owns these, §5.3 by name.

**NOT swept, and it should be said plainly:** the other frozen `test-results/` artifacts
individually · `docs/superpowers/specs/` · the 101 register items read **in full** (they were
filtered by class and book scope, not each read end-to-end). **M0 is therefore substantially, not
exhaustively, complete.**

---

## Finding 1 — M2 and M3 are ONE defect, and it is not hand-fixable

**Mechanism, measured rather than argued.** `efnafraedi-2e` `ch05/m68727`'s
`<media id="fs-idp1427264">` carries a **485-character** alt whose text contains a **raw,
unescaped `>`**:

> `… the terms “Δ U > 0”, “System,” and “Δ U &lt; 0.”`

The `<` in the same sentence **is** escaped and the `>` is not — which is **legal XML** (only `<`
and `&` must be escaped in attribute values) and therefore invisible to a schema check. A
`<media[^>]*>` regex stops at that `>`, 483 characters in, leaving an unterminated `alt="` and an
**empty capture**.

**Two consequences that were logged as two separate items:**
- `addSegment` gets empty text and returns `null` → **no alt segment is emitted** (6 reachable,
  5 emitted) — logged as **M2**.
- The structure node's `alt` is `undefined` → `readAlt` returns `''` → the published page emits
  **`alt=""`** — logged as **M3**.

**Measured, with controls that fired:**

| measurement | result | control |
|---|---|---|
| raw `>` in a media/image attribute value | **1** of 2,298 (chemistry) | **0** of 4,328 (organic) |
| alt slots in `m68727` | 6, of which **1** is `undefined` | the other **5** capture correctly |
| empty `alt` in published kept-book HTML | **1** of 1,381 `<img>` | — |
| media with no usable alt in `01-source` | **0** of 1,149 / **0** of 2,163 | — |

🔴 **"The localization route drops alt" was REFUTED, not assumed.** Split by whether the image is
a localized `_IS.` variant: **719 localized images carry a non-empty alt against this single
empty one**, and 662 non-localized carry non-empty alts with 0 empty. The `_IS.` suffix is a
coincidence of which image happens to be localized.

**Why it is not a hand fix — the reclassification:**
- There is **no segment**, so the segment editor cannot reach it.
- Editing `05-publication/` HTML is **overwritten by the next render**.
- `01-source` is **READ-ONLY and legally load-bearing**, so escaping the `>` at source is
  forbidden (→ CLAUDE.md § *Never overwrite local OpenStax CNXML*).
- ▶ **The only durable fix is in code.** → new register item **§C115**.

**Severity is higher than either item implied.** `alt=""` tells a screen reader *"decorative,
skip"* — **strictly worse than English alt text**, which at least conveys meaning. It is the only
such case in 1,381 published images across both kept books. **And the run reproduces it**: the
truncation is live in extraction today.

## Finding 2 — E1 (`02-mt-output` hand repairs): nothing to re-apply

The run overwrites `02-mt-output`, so human corrections there are **destroyed, not preserved**.
Swept by **path** across full history (the `manualCorrections` provenance block is a known
under-report — it was written into exactly one file).

**Positive control:** §C57's `827424da` appears in the result, so the detector works.

24 chemistry + 6 organic commits touch the path. Excluding the `auto-backup:` cron, the genuine
**hand** repairs are five — and **every one has a shipped tooling mitigation or is superseded by
re-extraction**:

| commit | what | why the run is safe |
|---|---|---|
| `6240cd64` | organic `m00033` — unwrap 9 MT-invented markers (§C67) | `unwrapInventedMarkers` is shipped in `api-translate.js` and wired at both `translateChunk` call sites; §C67's ch20 hard gate ran and passed |
| `edd84811` | chemistry `m68866` — repair `{=…=}` emphasis markers | legacy marker dialect; superseded by the bracket-marker migration |
| `d440b5b8` | chemistry — restore 2 lost `[[docref:]]` markers | bracket markers, survival measured on `/v1/translate` |
| `334d800d` | chemistry `m68865` — relabel marker `auto-342→auto-338` | re-extraction renumbers ids wholesale |
| `7439d07e` | chemistry — repair API null-byte degree-sign corruption | the same commit added the **fail-loud guard** |

⚠️ **`827424da` is NOT a hand edit** — despite its 492/528-line diff and `fix(...)` subject, the
content diff is wholesale MT rewording plus a `[#CNX_…]` → `[[xref:…]]` marker migration, i.e. a
**re-translation**. Classifying it by subject keyword would have produced a false item.

🔴 **The conclusion rests on causes being fixed, NOT on anything being backed up.**
`03-faithful-translation/` holds **0** files for organic and only a `README.md` for chemistry
(Phase 0.4 moved the four reviewed files aside). **Nothing in `02-mt-output` is protected by a
faithful file in either kept book.**

## Finding 3 — §C32, §C33 and §C107 are the SAME population

§C107's relayed *"208 English alt texts and 59 stray-English prose runs"* is a later count of the
**same 2026-08-07 vefur post-sync audit** that §C32 (209) and §C33 (61) record. They must not be
treated as separate backlogs.

- 📌 **§C32's `img-missing-alt: 1 (chemistry 5-3-vermi)` IS M3** — the same defect was logged on
  2026-08-07 (§C32), relayed again on 2026-08-19 (§C107), and seeded a third time as M3.
  **Three records, one defect** — which is itself the argument for the ledger having one home.
- **§C32's alt backlog is resolved by §C81 + §C88 + the run**, not by hand: its own note *"extraction
  does not currently send it for translation"* was written on 2026-08-07, **before** §C81 (merged
  08-15) and §C88 (merged 08-19).
- ⚠️ **209 is a DETECTOR-LIMITED LOWER BOUND, not the population.** The check is *"alt ≥30 chars
  containing no Icelandic letters"*; the real pre-§C81 population is every alt in both books —
  **3,312**. Do not read it as a defect count.

## Finding 4 — the two pipeline docs yield nothing

- `docs/pipeline/html-pipeline-issues.md` — every issue is **Fixed** or **Resolved**; file last
  written 2026-03-02.
- `docs/pipeline/cnxml-fidelity-gaps.md` — Gaps 2–6 are dated **2026-03-18**, describe the
  **pre-bracket-marker** `*text*` / `^N^` / `__term__` dialect that the migration replaced, and
  are explicitly scoped to *"merging back with the OpenStax publishing platform"*, not to readers.
  Gap 8 (2026-08-23, §C85) is a **documented accepted cost**, verified at the consumer.
  ▶ **Its numbers need re-measurement at the post-run vintage before anyone acts on them.**

---

## Ledger after M0

| | before | after |
|---|---|---|
| **M1** organic `m00032` — one table-cell alt | seeded | **stands** |
| **M2** chemistry `m68727` — missing alt segment | seeded | **struck → §C115** |
| **M3** chemistry `5-3-vermi` — empty alt | seeded | **struck → §C115** (same defect as M2) |

**One ledger item, one new code item.** The sweep's most useful output was not an addition.
