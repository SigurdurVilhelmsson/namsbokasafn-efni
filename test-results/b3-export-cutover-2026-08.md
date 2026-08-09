# §C36 B3 — the glossary export cut-over, acceptance gate measured on the real corpus, 2026-08-08

Evidence for the Part B3 slice of the terminology concept model
(register `docs/plans/2026-07-21-post-item17-followup-campaign.md` §C36; spec
`docs/superpowers/specs/2026-08-08-terminology-concept-model-part-b3-design.md` §8/§9).

**Dated snapshot — this is evidence, not status**, following the precedent of
`test-results/b1-resolve-gates-2026-08.md` and `test-results/b2-prod-population-2026-08.md`.
Re-measure rather than trusting these numbers later. Status for B3 lives in the register.

**No production database was modified. No committed glossary under `books/` was written.**
Every measurement below ran against a read-only copy of a `db.backup()` snapshot, or as a
`--dry-run`. Adoption (`--adopt --book <slug>`) is a separate, later, deliberate step this
run does not take.

---

## Method

**The corpus.** A `db.backup()` snapshot of production, taken 2026-08-08 21:37Z (B2's
method — `db.backup()`, never `cp` of a live file), already existed at a sibling session's
scratchpad. Copied once more with a plain `cp` into this session's own scratchpad before
use: safe because the sidecar `-wal` file next to the source was **0 bytes** at copy time
(fully checkpointed into the main file), confirmed before copying. Every connection opened
against the copy below is `{ readonly: true }`; nothing in this task ever opens the snapshot
for write.

**Verification against the register's recorded population (brief step 2), all four exact:**

| table | expected | measured |
|---|---:|---:|
| `concept` | 70,187 | 70,187 |
| `concept_term` | 192,189 | 192,189 |
| `book_domain_priority` | 21 | 21 |
| `terminology_translations` | 28,903 | 28,903 |

⚠️ **`registered_books` measured 7, not the 6 B2 recorded — a finding, reported rather than
smoothed over.** It was not one of the four gating checks, so this does not stop the run, but
it does not go unexplained: row `id=526`, `slug='ctrl-bare'`, `registered_by='gate'`,
`registered_at='2026-08-08 22:46:59'`. That is `verify-resolve-gates.js`'s own control-book
insert (`main()`, the "Controls" section) — this exact snapshot file had already been used
once, directly, as a scratch DB for a prior gate run, after the 21:37Z backup timestamp.
**Confirmed harmless to every measurement below**: `ctrl-bare` carries no
`book_domain_priority` rows (the gate's own control depends on that — it exists to prove an
unscoped book is distinguishable from an unregistered one), so it cannot affect
`buildScope`/`resolve` for any of the four real books. Recorded here because an unexplained
population drift is exactly the kind of thing this file exists to not paper over.

**Where the four books' source lived.** `collectSourceEnglish` and `buildResolvedGlossary`
both defaulted to this checkout's own `books/` tree (`feat/c36-b3-export-cutover`,
`67dacea2`, tree clean) — this **is** "production's own `books/` tree" for the purpose of
§8's regression pin: content reaches prod from this repo's `main` via
`scripts/git-backup.sh`, never the reverse, and `git status` was clean for the whole `books/`
tree at measurement time. No fixture directory was used anywhere in this run (Trap 1 in the
brief) — `booksDir` was never overridden, and the old-export comparison went through
`terminologyService.exportBookGlossary` with `_setTestDb(snapshotConnection)`, never through
`SESSIONS_DB_PATH` (Trap 2).

**Scripts.** All measurement code was throwaway, run with plain `node` from a scratch
directory outside the repo, and is not committed. It called `buildResolvedGlossary`,
`buildScope`/`resolve`, `collectSourceEnglish`, `detectProducer`, `runGlossaryExport`, and
`terminologyService.exportBookGlossary`/`_setTestDb` exactly as documented in their own
modules — no reimplementation of resolution logic, except the tie census (below), which
deliberately reproduces `verify-resolve-gates.js`'s method as a second, independent code path
over the same primitives.

---

## 1. Per-book `buildResolvedGlossary`, real corpus

All four ran to completion; none threw.

| book | terms | ties | nominalTies | outOfScopeOnly | censusStrings | duration |
|---|---:|---:|---:|---:|---:|---:|
| `efnafraedi-2e` | 2,119 | 299 | 120 | 1,168 | 118,749 | 2,065 ms |
| `liffraedi-2e` | 763 | 190 | 124 | 209 | 13,788 | 252 ms |
| `lifraen-efnafraedi` | 760 | 149 | 68 | 409 | 21,475 | 473 ms |
| `edlisfraedi-2e` | 458 | 150 | 21 | 134 | 11,922 | 284 ms |

`stats.total`/`stats.approved` equal `terms.length` for all four, as designed — every emitted
term is stamped `approved` (D2); nothing here exercises a term that *isn't*.

⚠️ **Biology's small yield is the D1 consequence stated up front, not a defect.** Its census
is 13,788 strings from **13** `.md` files under `books/liffraedi-2e/02-for-mt` — independently
counted with `find … -name '*.md' | wc -l`, matching `collectSourceEnglish`'s own `filesRead`.
Chemistry's `filesRead` (249) was checked the same way and also matches exactly, and its
tracked directory carries 0 `.md.backup.*` files today (84 non-`.md` tracked files there are
`.json` sidecars, not backups) — the exclusion trap exists but is not currently live for this
book. `lifraen-efnafraedi` (40 files) and `edlisfraedi-2e` (10 files) were spot-checked the
same way and agree.

---

## 2. Chemistry vs today — three payloads, three producers

| payload | producer | raw term count | effective (lower-cased) map size |
|---|---|---:|---:|
| committed `glossary-unified.json` | `merge-glossary` | 1,117 | 602 |
| old export, run fresh (`exportBookGlossary`) | `export-terminology` | **709** | 580 |
| new export (`buildResolvedGlossary`) | `export-terminology-resolved` | 2,119 | 2,108 |

⚠️ **"709" is not the committed file — it is what the OLD exporter would produce if it ran
today.** The committed file (1,117 terms) was written by `tools/merge-glossary.js`, a third
producer neither export path emits; it is why chemistry currently refuses
(`refused-producer`, §4 below). 709 comes from calling
`terminologyService.exportBookGlossary('efnafraedi-2e')` fresh against this snapshot's
unchanged `terminology_translations` table (28,903 rows, untouched since B0) — this is the
number spec §5 and the brief both cite, and it reproduces exactly.

**Effective map size ≠ raw term count, on both sides, for different reasons.** Old's 709 raw
term rows collapse to 580 *distinct English keys* even before any case-folding — 124 English
strings in chemistry's `terminology_translations` carry 2+ chemistry-tagged competing
translations, each emitted as its own top-level row (the §C18 competition pattern, not a case
issue: the collapsed count, 580, equals old's lower-cased map size exactly, so none of old's
collapse is case-driven). New's 2,119 raw terms collapse by only 11 pairs (22 terms) to 2,108
— all 11 are element-symbol/two-letter-word collisions among the *emitted* terms: `AM`/`Am`,
`At`/`at`, `Cd`/`cd`, `ER`/`Er`, `IR`/`Ir`, `In`/`in`, `No`/`no`, `OS`/`Os`, `PD`/`Pd`,
`Pr`/`pr`, `SI`/`Si`.

⚠️ **That 11-pair figure is a different question from the Task 4 review's 6,994, and both are
reported so neither is mistaken for the other.** 6,994 is the count of lowercase-collapsed
keys with more than one case variant in chemistry's raw **census** (118,749 candidate
strings, upstream of resolution) — independently reproduced here, exactly: 118,749 strings
lower-case to 111,709 distinct keys, of which 6,994 carry 2+ variants. The 11 above is the
much smaller number of those collisions that *survive resolution into the emitted payload*.
Both are real; they answer "how noisy is the source text" vs. "how much does the shipped file
actually collapse," and 6,994 is not the number that bears on `buildGlossaryMap`'s output.

**The committed file's 617-approved/602-collapsed figures corroborate an existing code
comment independently**: `glossaryExportDecision.js`'s shrink-guard comment says chemistry
"could go from 617 approved terms to near zero" — 617 is exactly the count of `approved`-status
terms in the committed 1,117, measured directly from the file, unprompted by that comment.

---

## 3. The four fallback terms — the content of "unblocks chemistry"

| english | icelandic | domain | position | reason | in chemistry's payload today (old export)? |
|---|---|---|---:|---|---|
| `pH` | sýrustig | biology | 3 | head-form | **absent** |
| `bond` | tengi | physics | 2 | head-form | **absent** |
| `carbon dioxide` | koltvíoxíð | biology | 3 | head-form | **absent** |
| `nitrogen` | nitur | physics | 2 | head-form | **absent** |

All four are present in the new payload with exactly the domain/position/text
`verify-resolve-gates.js`'s Gate 1 pins, and all four are confirmed absent from the old
export's 709 terms (checked directly against the fresh `exportBookGlossary` run above, not
assumed). **This is the measured content of "B3 unblocks chemistry."**

⚠️ `bond` resolves via **physics**, not biology — spec §8.1's own illustrative prediction was
wrong here (recorded in the spec itself, §7 Testing note); the fallback property (physics @2,
past chemistry @1) is what matters and holds.

---

## 4. Census reproduction — method, not just numbers

Reproduced independently of `buildResolvedGlossary`, via `verify-resolve-gates.js`'s own
`census()` shape, over `buildScope`/`resolve` directly:

| | outright | nominal | real (tied) |
|---|---:|---:|---:|
| B1 recorded | 1,999 | 120 | 299 |
| reproduced here (independent `census()`-shaped orchestration, this run) | **1,999** | **120** | **299** |
| `buildResolvedGlossary`'s own `stats.ties`/`stats.nominalTies` (§1) | n/a¹ | **120** | **299** |

¹ `buildResolvedGlossary` does not report "outright" as its own field; 1,999 outright + 120
nominal = 2,119 emitted terms, which is exactly §1's `efnafraedi-2e` term count.

**Method reproduced, not assumed**: source `books/efnafraedi-2e/02-for-mt` (249 files),
overlapping-bigram tokenisation via the shared `collectSourceEnglish`, exact zero-tolerance
match. `outOfScopeOnly` also measured (1,168) — B1's original gate did not compare this
figure against a target, so it is reported without a delta.

Zero drift on the three numbers B1 recorded, across an independent orchestration
(`verify-resolve-gates.js`'s bucketing logic) and the production code path
(`buildResolvedGlossary`'s own `stats`) agreeing exactly with each other and with the
register.

---

## 5. The regression pin — production's own state, dry-run

`runGlossaryExport({ exportFn: createResolvedExportFn(<snapshot>), subjectFn:
terminologyService.getBookSubject, book: null, dryRun: true })`, against this checkout's real
`books/` tree, `--dry-run` semantics (no write, no status file, no heartbeat):

| book | outcome |
|---|---|
| `efnafraedi-2e` | `refused-producer` — committed file written by `merge-glossary` |
| `liffraedi-2e` | `refused-producer` — committed file written by `merge-glossary` |
| `lifraen-efnafraedi` | `refused-producer` — committed file written by `merge-glossary` |
| `edlisfraedi-2e` | `refused-absent-baseline` — no committed glossary to compare against |

Exit code **0** (a refusal is not an error, decision D2). This is the same four outcomes B2's
doc recorded live from `GET /api/health` on 2026-08-08 (§ "An unrelated observation" in that
file) — measured there under the **old** exporter, reproduced here under the **new** one
against the same committed files. That agreement is the empirical form of D6 ("B3 moves
nothing"): the new default produces the identical refusal set the live system already showed
under the old one, not merely what the unit-level regression-pin test asserts in isolation.

---

## 6. Old vs new diff for chemistry

Built both ways against the same snapshot: old via `terminologyService.exportBookGlossary`,
new via `buildResolvedGlossary`. **This diff cannot be reconstructed once Part C deletes the
old path** — kept here as the record.

### Raw (exact English string)

Compared by distinct English key on each side. Old's 709 raw term rows collapse to **580**
distinct keys before this comparison even starts (§2's 124-competing-translations finding);
new's 2,119 raw terms are already 2,119 distinct keys (the census is a Set). The counts below
are keyed on those distinct sets, so `onlyInOld + differs + same` sums to old's **580**, not
709 — stated explicitly so the arithmetic is checkable rather than silently inconsistent with
§2.

| | count |
|---|---:|
| old, distinct English keys | 580 (from 709 raw rows) |
| new, distinct English keys | 2,119 |
| only in old | 193 |
| only in new | 1,732 (all 4 fallback terms are among these) |
| present in both, Icelandic **differs** | 78 |
| present in both, Icelandic same | 309 |

Check: 193 + 78 + 309 = 580. ✓

Sample, **only in old** (dropped by the new export — a real term the old subject filter
carried that the new resolved view does not, sorted alphabetically, first 15):

    absorbtion → gleypni · achiral → óhendinn · acid dissociation constant → sýrufasti ·
    activity coefficient → virknistuðull · addition funnel → dropatrekt · adhesion → viðloðun ·
    adiabatic → jafnvarma · adsorb → aðsogast · aggregate → þyrping ·
    alkaline earth metal → jarðalkalímálmur · allowed energy levels → leyfð orkuþrep ·
    angular moment quantum number → hliðarskammtatala · atomic mass unit → atómmassaeining ·
    atomic model → frumeindalíkan · atomic spectrum → litróf frumeindar

Sample, **only in new** (first 15 alphabetically — mostly element symbols and short tokens
the old subject-strict filter never carried; the 4 fallback terms are further down the
alphabet and are called out separately in §3):

    ADP → adenósíntvífosfat (biology) · AM → víddarmótun (physics) · ATP → adenosínþrífosfat
    (biology) · Ac → aktín (physics) · Ag → silfur (physics) · Al → ál (physics) ·
    Am → ameríkín (physics) · Antarctica → Suðurskautsland (biology) · Ar → argon (physics) ·
    As → arsen (physics) · Aspergillus → fruggur (biology) · At → astat (physics) ·
    Au → gull (physics) · Ba → barín (physics) · Be → beryllín (physics)

Sample, **Icelandic differs** (same English, different word — first 15 alphabetically):

    actual yield: eiginlegur afrakstur → raunheimtur · alloy: málmblanda, málmblendi → melmi ·
    amorphous solid: formlaust fastefni → myndlaust fastefni · atom: atóm → frumeind ·
    atomic orbital: atómsvigrúm → frumeindasvigrúm · average rate: meðal hvarfhraði →
    meðalhraði · bond energy: tengiorka → tengjaorka · bond order: tengistig → tengigráða ·
    brightness: birtustig → ljósstyrkur · buffer: búffer, dúi → stuðpúði · buffer solution:
    búfferlausn, dúalausn → stuðpúðalausn · catalysis: efnahvötun → hvötun · catalyst:
    efnahvati → hvati · chemical properties: efnafræðilegir eiginleikar → efnaeiginleikar ·
    complex: komplex → flóki

### Lowercase-collapsed (the shape `buildGlossaryMap` actually produces)

| | count |
|---|---:|
| old effective map size | 580 |
| new effective map size | 2,108 |
| only in old | 193 |
| only in new | 1,721 |
| differ | 78 |
| same | 309 |

Case-folding changes the **only-in-new** count (1,732 → 1,721) but not the other three
columns — consistent with §2's finding that none of old's collapse and only 11 pairs of new's
collapse are case-driven.

**Not evaluated here: which of the 78 differing Icelandic words is the better translation.**
That is an editorial judgement for whoever runs the adoption, not a measurement this gate
makes.

---

## What this run does NOT establish

- **No book was adopted.** All four still refuse under the new exporter, exactly as under the
  old one. Chemistry's adoption (`--adopt --book efnafraedi-2e`) is a separate, deliberate,
  reader-visible step this task does not take.
- **Whether the 78 Icelandic-word changes are quality improvements.** This gate measures that
  they differ and shows the pairs; it does not judge them. That judgement belongs to the
  human running the eventual adoption.
- **Whether the same four books resolve identically against the *actual live* production DB
  right now.** This ran against a snapshot that is hours old and had itself already been used
  once as a different task's scratch DB (§ Method) — inert here, but this is not a live-DB
  measurement.
- **Performance under production load.** Durations (252 ms–2,065 ms) are single-run
  wall-clock on a dev machine, not a production benchmark, though they are the same code path
  the 2-hourly cron will run.
- **The `--force`/`--adopt` override paths.** Only the default (no-override) refusal behaviour
  was exercised; overriding either gate was out of scope for this task by design (§8/§9 of the
  spec — this task measures, it does not adopt).
- **Biology's (`liffraedi-2e`) resolved payload as a meaningful glossary.** Its small yield
  (763 terms from 13 source files) is the D1-predicted consequence of an under-extracted book,
  not a statement about the concept model's quality for biology.
- **A byte-for-byte diff between this checkout's `books/` tree and production's on-disk
  copy.** `git status` was clean locally at measurement time and content reaches prod only via
  this repo's `main` (never the reverse), which is why this checkout stands in for "production's
  own tree" per the brief — but no direct comparison against prod's disk was made in this task.

No count from this file belongs in the register, and no status verb belongs in this file
(CLAUDE.md § *One source of truth*).
