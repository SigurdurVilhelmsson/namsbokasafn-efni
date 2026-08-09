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
**Confirmed harmless to `ctrl-bare` specifically** — it carries no `book_domain_priority` rows
(the gate's own control depends on that), so it cannot affect `buildScope`/`resolve` for any of
the four real books.

⚠️ **That row-count check is blind to two other mutations this same script makes, so "no drift
in the four counts" cannot by itself certify them.** `verify-resolve-gates.js`'s `seedBooks()`
runs unconditionally at `main()` and `INSERT OR REPLACE`s `book_domain_priority` for all six
real books — precisely the table `buildScope`/`resolve` read to produce chemistry's
`chemistry@1, physics@2, biology@3` scope, so a divergent reseed would move every number below,
invisibly to a row-count check. The same run also `UPDATE`s `concept_term.rank` across the
whole table (its rank-reversal control), again with no row-count signature. **Both were checked
directly, not inferred from the four-count table**: the reseeded priorities for all six books
match `server/lib/domains.js`/migration 046's frozen map exactly — value-identical, not merely
same-count — and the rank `UPDATE` is wrapped in `db.exec('BEGIN')` / `db.exec('ROLLBACK')`, so
it never commits. ⚠️ The priorities check is weaker than it first looks: it shows the snapshot
agrees with the frozen map, but `seedBooks()` and migration 046 both *read that same frozen
map* — agreement confirms the map is self-consistent, not that two independent sources agree.
It holds here only because production's own rows also come from migration 046.

So the accurate statement is: **the two content mutations this script performs were checked
directly and found value-identical / rolled back** — not "confirmed harmless to every
measurement below," which claims a reach the four-count check never had. Recorded here because
an unexplained population drift is exactly the kind of thing this file exists to not paper over.

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

⚠️ **Biology's committed file is 2,262 terms against this new payload's 763 — a 66% shrink**
(measured directly from `books/liffraedi-2e/glossary/glossary-unified.json`: 2,262 terms,
against §1's 763). The magnitude, not only the under-extraction cause, is worth carrying
forward: this is exactly the drop `glossaryExportDecision.js`'s shrink guard (`SHRINK_RATIO =
0.5`) exists to catch, and would have, had the producer gate not refused first (§6 below).

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
(`refused-producer`, §6 below). 709 comes from calling
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

⚠️ **`books/lifraen-efnafraedi/glossary/glossary-unified.json` is byte-identical to chemistry's**
(md5 `477c336749585c93b2e40238a8a4759a`, both 1,117 terms) — organic chemistry's committed
baseline is literally chemistry's file, term for term. Out of scope for this task's
measurements (organic chemistry's own resolved payload was not diffed here), but any adoption
argument made below for chemistry from the committed file applies unchanged to organic
chemistry, and this fact belongs in the register, not only here.

---

## 3. The four fallback terms — two baselines, two different answers

| english | icelandic (new) | domain | position | reason | in the *old exporter's fresh output* (709 terms)? | in the *committed* `glossary-unified.json` (1,117 terms — what adoption overwrites) |
|---|---|---|---:|---|---|---|
| `pH` | sýrustig | biology | 3 | head-form | **absent** | `pH`, `approved` |
| `bond` | tengi | physics | 2 | head-form | **absent** | `efnatengi`, `approved` |
| `carbon dioxide` | koltvíoxíð | biology | 3 | head-form | **absent** | `koldíoxíð`, `approved` |
| `nitrogen` | nitur | physics | 2 | head-form | **absent** | `nitur`, `approved` — byte-identical to new |

All four are present in the new payload with exactly the domain/position/text
`verify-resolve-gates.js`'s Gate 1 pins, and all four are confirmed absent from the old
*fresh* export's 709 terms (checked directly against the fresh `exportBookGlossary` run above,
not assumed).

⚠️ **That "absent" answer is true of a payload nobody will ever ship, and misleading about the
one readers actually get.** The committed file — the thing `--adopt` overwrites — is not the
old exporter's fresh output; it was written by a third producer (`merge-glossary`, §2) and
already carries all four, all `approved`. **Against the baseline adoption actually overwrites,
none of these four is an addition.** Adoption *changes* `pH` (`pH` → `sýrustig`), `carbon
dioxide` (`koldíoxíð` → `koltvíoxíð`) and `bond` (`efnatengi` → `tengi`), and leaves `nitrogen`
byte-identical. The fallback mechanism these four were chosen to demonstrate is real and does
real work — §4 below counts 1,686 keys with no committed counterpart at all under any status —
but these four specific terms demonstrate the *mechanism*, not a net addition. A claim that
this is "the measured content of 'B3 unblocks chemistry'" does not survive the swap to the
baseline an adoption decision actually needs.

⚠️ `bond` resolves via **physics**, not biology — spec §8.1's own illustrative prediction was
wrong here (recorded in the spec itself, §7 Testing note); the fallback property (physics @2,
past chemistry @1) is what matters and holds. And `bond`'s new value is a **loss of
specificity, not only a change of source** — `efnatengi` names a *chemical* bond, `tengi` is a
bare, generic "connector." §4 measures the same loss of subject-specific precision across the
rest of the fallback's changed outputs.

---

## 4. What the changed terms say — the committed-file diff

§3 compares against a baseline that is never written. This section compares against the one
that matters for an adoption decision: `books/efnafraedi-2e/glossary/glossary-unified.json`,
1,117 terms, the file `--adopt --book efnafraedi-2e` overwrites. This is measurement, not an
editorial verdict — which word is *better* is addressed nowhere here (see "What this run does
NOT establish").

### 4.1 Three numbers, one baseline, three methods

| # | key | status filter | collapse rule | result |
|---:|---|---|---|---:|
| 22 | lower-cased English | none (`needs_review` rows excluded — their Icelandic is empty, so there is nothing to compare) | last-write-wins | **22 differ** |
| 8 | lower-cased English | `approved` only | last-write-wins | **8 differ** |
| 205 | lower-cased English | `approved` only | membership (present in committed, absent from new) | **205 dropped** |

Reproduced directly against the shared snapshot and this checkout's committed file: 617
`approved` + 170 `proposed` + 330 `needs_review` (all with empty Icelandic) = 1,117 ✓; 772
non-empty distinct lower-cased keys; against the new payload's 2,108 lower-cased keys, **350
only-in-committed, 22 differ, 400 same** (350+22+400=772 ✓). Of the 22, **8 are `approved`, 14
are `proposed`**.

**8, not 22, is the number that changes what a reader sees today.** Both real consumers of
`glossary-unified.json` filter to `status === 'approved'` before using it —
`tools/lib/math-label-substitute.js`'s `buildGlossaryMap` (`if (t.status !== 'approved')
continue;` — the render path: approved terms are substituted into published math) and
`tools/lib/malstadur-api.js`'s `formatGlossary` (`approvedOnly = true` by default, which
`tools/api-translate.js` takes as-is — the MT-priming path). The other 14 are `proposed` and
inert in both paths today; adoption activates them with a different word than the dormant one.

### 4.2 Why the fallback lands where it does: 593 concepts

| domain | concepts |
|---|---:|
| anatomy-physiology | 33,568 |
| biology | 17,627 |
| mathematics | 8,207 |
| physics | 4,629 |
| earth-science | 2,996 |
| astronomy | 2,567 |
| **chemistry** | **593** |

Chemistry is the smallest domain by an order of magnitude, and for five of the 22 changed
terms — `bond`, `accuracy`, `precision`, `hydrocarbon`, `plasma` — **there is no chemistry
concept at all** (checked directly: each has concepts only under
physics/biology/mathematics, never chemistry). For this book, the subject fallback the
resolver falls back to (`chemistry@1, physics@2, biology@3` — B1's scope) is the **primary**
mechanism for these terms, not a safety net triggered occasionally.

That shows up directly in the 22's domain of origin: **18 are won by physics at position 2, 4
by biology at position 3. None are won by chemistry.**

### 4.3 Named examples

- **`accuracy` (`hittni`, `approved`) and `precision` (`prentnákvæmni`, `proposed`) both
  resolve to `nákvæmni`** under the new payload — collapsing the exact pair a chemistry
  textbook exists to distinguish. `prentnákvæmni` → `nákvæmni` is, in isolation, an
  improvement (the discarded word means *print*-precision); that is exactly why judging the
  words one at a time misses the defect — **the problem is the merge, not either word.**
- **`bond`: `efnatengi` (chemical bond) → `tengi` (generic)** — §3's flagship fallback success
  and a loss of specificity at once.
- `hydrocarbon`: `kolvetni` (standard) → `vetniskol`.
- `chemical symbol`: `efnatákn` → `frumefnistákn`.
- `inert gas`: `hlutlaust gas` → `eðalgas`.
- `plasma`: `plasma` → `rafgas`.
- `carbon monoxide`: `kolmónoxíð` → `koleinoxíð`.

### 4.4 The other side of the swap: 205 approved terms drop out

Adoption doesn't only change words — it also **drops 205 terms that are `approved` in the
committed file and absent from the new payload entirely** (measured: 617 approved committed
rows collapse to 602 distinct lower-cased keys; 205 of those 602 have no counterpart, under any
name, among the new payload's 2,108 keys). Losing an approved term means `resolveLabel` returns
the bare English label the next time that term appears in published math — D2's own stated
risk for an unstamped or absent export, now measured for a *swap* rather than an absence.

Scanning leaf `<m:mtext>`/`<m:mi>` nodes (CNXML) and their rendered `<mtext>`/`<mi>`
counterparts (the only nodes `substituteMathLabels` touches) across chemistry's three trees:

| tree | files | distinct labels | resolvable (committed-approved) | resolvable (new) | dropped-term hits | changed-term hits |
|---|---:|---:|---:|---:|---:|---:|
| `01-source` | 149 | 1,973 | 48 | 95 | 1 (`reaction` ×7) | 1 (`carbon dioxide` ×1) |
| `03-translated` | 153 | 1,961 | 2 | 25 | 0 | 0 |
| `05-publication` | 266 | 1,954 | 2 | 24 | 0 | 0 |

`files` = total `.cnxml` (`01-source`/`03-translated`) / `.html` (`05-publication`) files in
each tree, independently confirmed by extension count. "Resolvable" = distinct labels that
resolve to a non-empty Icelandic value under `resolveLabel`'s case rules. "Changed-term hits"
is restricted to the 8 `approved` differs (§4.1) — a `proposed` old value never rendered under
`buildGlossaryMap`'s approved-only filter in the first place, so a label going from
unresolved-English to resolved-Icelandic under adoption is a gain, not a changed word; folding
those in would overcount (`reducing agent`, `proposed` old, spuriously reads as "changed" in all
three trees otherwise).

So the render-side delta of adoption is **~2 labels / ~8 occurrences**, against a net *increase*
in coverage (24 vs 2 resolvable labels in `05-publication`). ⚠️ **This bounds the render half
only.** `glossary-unified.json` has a second `approved`-filtered consumer —
`formatGlossary`/`api-translate.js`'s MT-priming glossary — where all 205 dropped terms are in
play regardless of whether they ever appear in math. Nothing above measures that half; it
degrades the terminology primed into *future* translations without changing a single published
byte.

### 4.5 The fallback's other side

Not every consequence of adoption is a loss: **1,686 of the new payload's 2,108 lower-cased
keys have no counterpart at all in the committed file** (under any non-empty status) — real
terms the fallback resolves that nothing in the committed file, approved or proposed,
currently answers (350 only-in-committed + 22 differ + 400 same = 772 committed keys; the
remaining 1,686 of the new payload's 2,108 are new). The four terms in §3 were chosen to
illustrate that mechanism and turned out to be the wrong witnesses for "addition" specifically
(all four already existed, approved, in the committed file) — but the mechanism itself is not
a fiction, and 1,686 is its measured size.

---

## 5. Census reproduction — method, not just numbers

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

## 6. The regression pin — production's own state, dry-run

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

## 7. Old-fresh vs new diff for chemistry — the secondary record

Built both ways against the same snapshot: old via `terminologyService.exportBookGlossary`,
new via `buildResolvedGlossary`. **This diff cannot be reconstructed once Part C deletes the
old path** — kept here as the record the brief asked for. ⚠️ **It is secondary, not primary**:
the old exporter's fresh output is a payload nobody will ever ship (chemistry refuses under it
today, `refused-producer`, §6 below). §4 above, against the *committed* file, is the comparison
an adoption decision needs; read this section as the historical record §4 supersedes for that
purpose, qualified in §7.1 below.

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

### 7.1 The 78 is an artifact of the collapse rule — checked, not assumed

⚠️ **All 78 arise from English headwords where the old exporter's fresh output emitted two or
more competing rows** (124 such headwords exist in chemistry's `terminology_translations` —
§2's finding). Checked directly, for all 78: the new resolved value is already present among
that same headword's own competing old translations. Recomputing the same comparison by **set
membership** instead of last-write-wins — does the new value appear *anywhere* among the old
headword's rows, rather than only in whichever row happened to load last? — collapses **78
differ / 309 same** to **0 differ / 387 same** (checksum: 0 + 387 = 387 = 580 − 193 `onlyOld`).
Not a smaller number: zero.

Worked example: `atom`'s two old rows carry `frumeind` and `atóm`; last-write-wins (file order)
retained `atóm`; the resolver chose `frumeind` — a value the old payload already carried on the
same headword (CLAUDE.md's own §C18 illustration: `status` selects among competing rows, it is
not provenance). **So the 78 does not measure "78 words changed" — it measures which of two
already-present translations the old exporter's row order happened to land on, in a payload
nobody will ship.** Use §4 for the adoption-relevant diff; this section's 78 answers "how much
does row order matter to a payload we're retiring," not "how much does adoption change."

---

## What this run does NOT establish

- **No book was adopted.** All four still refuse under the new exporter, exactly as under the
  old one. Chemistry's adoption (`--adopt --book efnafraedi-2e`) is a separate, deliberate,
  reader-visible step this task does not take.
- **Which word is the better translation** — for any of the 22 committed-baseline changes (§4)
  or the 78 old-fresh-baseline pairs (§7). That is genuinely editorial: a human with subject
  expertise judges `nákvæmni` vs `prentnákvæmni`, not a script, and this gate does not reach
  that judgement. **What this does NOT leave open, because §4 and §7.1 measure it directly:
  which domain the 22 came from (physics 18, biology 4, chemistry 0), what merged with what
  (`accuracy`/`precision` → `nákvæmni`), and whether the 78 is 78 independent changes or a
  single collapse-rule artifact — it is the latter, 0 of 78 survive a set-membership recheck.**
  A NOT-established bullet should mark the edge of what was measured, not stand in for
  measuring it.
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
