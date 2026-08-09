# §C36 B4a — the term-preference acceptance gate, measured on a rebuilt corpus, 2026-08-09

Evidence for the Part B4a slice of the terminology concept model
(register `docs/plans/2026-07-21-post-item17-followup-campaign.md` §C36/§C38; spec
`docs/superpowers/specs/2026-08-09-terminology-concept-model-part-b4a-design.md` §9).

**Dated snapshot — this is evidence, not status**, following
`test-results/b1-resolve-gates-2026-08.md`, `b2-prod-population-2026-08.md` and
`b3-export-cutover-2026-08.md`. Re-measure rather than trusting these numbers later; status
for B4a lives in the register.

**Nothing on production was touched.** No `ssh`, no `scp`, no `db.backup()` of the live box.
No committed glossary under `books/` was written, and `books/*/01-source/` and
`books/*/02-mt-output/` were never opened for write. Every measurement below ran against a
throwaway database in the system temp directory, which the script deletes on exit.

---

## ⚠️ TWO CAVEATS THAT TRAVEL WITH EVERY NUMBER BELOW

**1. This is a RECONSTRUCTION, not production's database.** The local
`pipeline-output/sessions.db` predates migration 045 and has no concept tables at all, so
per a lead decision the corpus was rebuilt locally from the raw Íðorðabankinn fetch instead
of copying anything off the box. **If a number here diverged from a recorded figure, that
would be AMBIGUOUS — it could be the code or it could be the reconstruction — so a
divergence would not by itself be a diagnosis.** The fidelity control below is what narrows
that from a disclaimer to a bounded statement; read it before reading any gate.

**2. `efnafraedi-2e` was registered BY THE GATE SCRIPT, not by the admin route as on
production.** Register §C35: migration 019's `INSERT OR IGNORE` omits the `NOT NULL`
`title_is` column, and SQLite's `OR IGNORE` silently swallows a NOT NULL violation — no
exception, no row — so **a locally-migrated database has no chemistry book at all**.
Chemistry is the book every gate targets, so registration is an explicit, logged setup step
in the script (`seedBooks`, `registered_by = 'gate'`, `title_is` = the slug). Four of the six
books were registered this way; `lifraen-efnafraedi` and `edlisfraedi-2e` already existed
from the migrations' own seed. The `book_domain_priority` rows are `INSERT OR REPLACE`d from
`server/lib/domains.js`, the same frozen map migration 047 reads.

---

## Method — the exact commands

```bash
# from the repo root, on the dev box
node server/scripts/verify-b4a-gates.js                       # the whole gate, one command
node server/scripts/verify-b4a-gates.js --corpus <other-dir>  # if the raw fetch has moved
npm test                                                      # root suite, authoritative
```

The script is self-contained and re-runnable by anyone holding the raw fetch. In one process
it:

1. builds a scratch database — **every migration** against an empty file, via
   `server/__tests__/helpers/freshMigratedDb` (the one place that builds a schema by running
   the real migrations in order; the alternative was a second hand-copied DDL, which
   `verify-resolve-gates.js`'s review finding 5 deleted from that script for good reason);
2. imports the 20-collection raw fetch at `~/idordabanki-raw-2026-08-07` with the production
   importer (`runImport`), printing `formatImportReport`'s per-collection yield;
3. registers the six books (caveat 2);
4. runs B1's `verify-resolve-gates.js` against the same database as a **fidelity control**;
5. runs gates 2 → 1 → 3 → 4 → 5 and prints `PASS`/`FAIL`/`NOT RUN` with a measured number
   for each, exiting non-zero if any failed;
6. deletes the scratch database.

**The raw fetch was read only.** It is a rate-limited ~1.5 h asset with its own
`PROVENANCE.md`; the script never writes to it and never re-fetches.

**Three traps the script is built around**, each of which made the first draft of this gate
unrunnable or meaningless:

- `createResolvedExportFn` opens the database `{ readonly: true }`. Gates 3 and 4 write
  preference rows, so the script holds **its own writable connection** and calls
  `buildResolvedGlossary(db, …)` directly.
- **`scope.preference` is a snapshot taken at `buildScope` time.** A row inserted afterwards
  is invisible to `resolve()`. Every re-check rebuilds the scope — and gate 3 demonstrates
  the trap on purpose, by resolving once through the stale scope and showing it does not move.
- **Byte-identity is not asserted and must not be**: `generated: new Date().toISOString()`
  differs on every build. Gate 1 uses the export's own equality over `terms`.

---

## Reconstruction fidelity — the control that makes caveat 1 measurable

| what                 | recorded (production, §C36 B2) | measured (this reconstruction) |
| -------------------- | -----------------------------: | -----------------------------: |
| `concept` rows       |                         70,187 |                     **70,187** |
| `concept_term` rows  |                        192,189 |                    **192,189** |
| collections imported |                             20 |                         **20** |
| import wall time     |                         ~3.8 s |                          4.8 s |

`server/scripts/verify-resolve-gates.js --db <scratch>` — B1's own gate script, unmodified —
**exits 0 on this database**:

- chemistry's fallback: `pH → sýrustig [biology @3]`, `bond → tengi [physics @2]`,
  `carbon dioxide → koltvíoxíð [biology @3]`, `nitrogen → nitur [physics @2]`;
- scope sizes `liffraedi-2e` **47,568** and `efnafraedi-2e` **19,749**, both exact;
- tie census **1,999 / 120 / 299**, exact, with its rank-reversal control moving the numbers
  (1,999 / 113 / 306) as it must;
- term-less candidates **0**; both unscoped causes still distinguishable.

**So the reconstruction reproduces every figure B1 and B2 measured on the real corpus.** That
does not make it production's database — caveat 1 stands — but it does mean the corpus the
gates below ran against is not a different corpus in any respect anyone has yet measured.

---

## Results

| gate                          | verdict  | measured                                                                                                                                |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| fidelity control              | **PASS** | `verify-resolve-gates.js` exit 0 (see above)                                                                                            |
| 2 — zero-preference control   | **PASS** | 0 `book_term_preference` rows · 0 expanded by 048 · old table dropped                                                                   |
| 1 — export unchanged          | **PASS** | `JSON.stringify(prev.terms) === JSON.stringify(next.terms)` over **2,119** terms; `stats` identical; census 1,999 / 120 / 299           |
| 3 — §C38 closes               | **PASS** | `nákvæmni [physics @2]` → `hittni [biology @3]` (`book-preference`), and `nákvæmni` returns on delete                                   |
| 4 — the leak is closed        | **PASS** | concept #1246: `'Hz' → 'rið'` while `'hertz'` stayed `'herts' [physics @2]`                                                             |
| 5 — no performance regression | **PASS** | 5a cold 0.069 ms/resolve vs B1's 0.044 (1.57×, tolerance 3×) · **5b prev-vs-next median 0.93× on the same box**, 44,861 winners on both |

Root suite: **297 files / 4305 tests, all passing** (`npm test` from the repo root, 222 s).

### Gate 2 — the zero-preference control (run FIRST, because gate 1 depends on it)

`SELECT COUNT(*) FROM book_term_preference` = **0**. `book_concept_preference` no longer
exists (048 dropped it). Migration 048 emitted **zero** `[048]` log lines, which is the
positive observation that nothing was expanded, dropped, or collided — reading a row count
afterwards cannot tell you that, because the table is gone by then.

⚠️ **Two different statements, recorded separately rather than conflated.** On _this_
database the 048 expansion is 0 **structurally**: nothing ever inserted into
`book_concept_preference`, so it was empty when 048 ran. Production's 0 is a **measurement**
(§C36 B4a, 2026-08-09, and no production code path INSERTs into that table). This
reconstruction cannot re-measure production's, and does not claim to.

The count was **re-asserted as 0 after gates 3 and 4**, so the two write-and-delete gates
left the database exactly as gate 2 found it.

### Gate 1 — the export is unchanged, gated on `terms`, never on bytes

The comparison is a genuine **before/after**, not a self-comparison: the pre-B4a
`server/lib/{resolvedGlossary,conceptResolver,sourceEnglish,glossaryProducer}.js` are
extracted with `git show <merge-base>:…` (branch point `bf680c3d`) into a temp directory and
required directly. That works with no `node_modules` and no worktree because the base module
graph is pure — `new Database` lives only in `createResolvedExportFn`, which this gate never
calls.

⚠️ **The base `buildPreferenceMap` SELECTs from `book_concept_preference`, which 048
dropped**, so without that table the base code throws `no such table` and gate 1 cannot run
at all. The table is restored by **re-running migration 045's own `up()`** — pure
`CREATE … IF NOT EXISTS`, already re-run on every server start, so it is idempotent _and_ it
is the real DDL rather than a hand-copied one — asserted empty on both sides, and dropped
again afterwards.

**The same census object is passed to both builds**, so the only variable is the code:
118,749 strings from 249 `.md` files under `books/efnafraedi-2e/02-for-mt`.

|                         |                         prev (`bf680c3d`) | next (this branch) |
| ----------------------- | ----------------------------------------: | -----------------: |
| terms                   |                                     2,119 |              2,119 |
| `JSON.stringify(terms)` |                             \<identical\> |      \<identical\> |
| `stats`                 |                    identical, key for key |          identical |
| top-level keys          | `book, generated, producer, stats, terms` |      + `integrity` |

Census reproduced: **outright 1,999 · nominal 120 · real ties 299** (recorded 1,999 / 120 /
299). `outright` is derived — the export emits a term for every outright win _and_ every
nominal tie and omits the real ties, so `outright = stats.total − stats.nominalTies`.

⚠️ **A term count alone is not this gate** — two payloads can agree on 2,119 and differ in
which 2,119, which is why the string equality is the assertion and the count is only a
headline.

⚠️ **`integrity` is the one added top-level key, and it never reaches disk.** It is
caller-only by spec D5: `export-terminology.js` strips it via `NON_PAYLOAD_KEYS` before
writing, pinned by `server/__tests__/glossaryExportRun.test.js`. The gate asserts that
`integrity` is the _only_ addition and that nothing was removed — anything else would be a
leak into `glossary-unified.json`.

### Gate 3 — §C38 closes on the real corpus

The six concepts carrying the English `accuracy`, as measured (matching the spec's account
exactly):

| concept | domain      | collection          | Icelandic terms                |
| ------- | ----------- | ------------------- | ------------------------------ |
| #2500   | physics     | EDLISFR             | `nákvæmni` (r1)                |
| #6464   | biology     | FARALDSFRAEDI       | `hittni` (r1)                  |
| #6524   | biology     | FARALDSFRAEDI       | `nákvæmni` (r1), `hittni` (r2) |
| #56718  | biology     | LYFJAFRLYFJASTOFNUN | `hittni` (r1)                  |
| #61279  | mathematics | STAERDFRAEDI        | `hittni` (r1), `nánd` (r2)     |
| #69823  | mathematics | TOLFR               | `hittni` (r1)                  |

- **baseline** — `accuracy` → `nákvæmni [physics @2]`. §C38's defect, reproduced on the
  corpus before anything is changed.
- **stale scope** — after inserting the preference but _without_ rebuilding, `accuracy` still
  answers `nákvæmni`. The snapshot trap, demonstrated rather than described.
- **with the preference** (`efnafraedi-2e`, chapter 0, `accuracy` → term #15994 `hittni` on
  biology concept #6464), scope rebuilt — `accuracy` → **`hittni [biology @3]`**,
  `reason: 'book-preference'`.
- **the control** — the row deleted and the scope rebuilt, `accuracy` → `nákvæmni [physics @2]`,
  `reason: 'head-form'`, **byte-identical to the baseline object**. Without this half the gate
  would only have shown that _something_ changed.

An editor can now say "for this book, `accuracy` means `hittni`" — the sentence §C38 records
as impossible under `book_concept_preference`.

### Gate 4 — the leak is closed (the most valuable gate in the set)

This is the regression test for the defect that forced the whole spec to be rewritten: a
preference keyed on `concept_id` would have moved **every** English string on that concept.
⚠️ **No unit fixture in the suite can express it** — every one inserts exactly one `'en'`
term per concept, so on a fixture the concept-keyed and string-keyed designs are
indistinguishable. It exists only here.

Selection, over the concepts that answered chemistry's census:

- **15** concepts answer ≥2 **case-distinct** census strings _and_ carry ≥2 Icelandic terms.
- ⚠️ **Case variants are excluded deliberately.** The census carries `atom`/`Atom`/`ATOM` as
  three strings, `book_term_preference.english` is `COLLATE NOCASE`, and `buildPreferenceMap`
  lowercases its key — so preferring `Atom` moving `atom` is §5.1's documented collation
  contract working correctly, and a pair differing only by case would have produced a **false
  failure**.
- The second Icelandic term is required so the preference can actually move something;
  otherwise the gate would be vacuous in the other direction.

Subject: **concept #1246** (physics), carrying the English `Hz` and `hertz`, Icelandic
`herts` (r1) / `rið` (r2).

|                                            | `'Hz'`                                | `'hertz'`               |
| ------------------------------------------ | ------------------------------------- | ----------------------- |
| before                                     | `herts`                               | `herts`                 |
| after preferring `'Hz'` → term #3147 `rið` | **`rið`** (`reason: book-preference`) | **`herts`** — unchanged |
| after deleting the row                     | `herts`                               | `herts`                 |

⚠️ **"A moved" is the control for "B did not."** A preference that silently never fired would
also leave `hertz` unchanged, and that pass would prove nothing — so the gate asserts `Hz`
moved _and_ that `reason === 'book-preference'`, and compares `hertz`'s **whole winner
object** (`conceptId`, `termId`, `text`, `domain`, `position`), not just its text.

### Gate 5 — no performance regression

**5a, the mandated comparison** — `server/scripts/bench-resolve.js --db <scratch> --book
liffraedi-2e`, 47,568 scoped English terms:

```
  buildScope: 1.0 ms
  cold: 3276.2 ms for 47568 resolves (0.069 ms each), 44861 winners, rss 85.2 MB
  warm: 2089.0 ms for 47568 resolves (0.044 ms each), 44861 winners, rss 85.9 MB
  single resolve: 0.079 ms · rss delta: 35.9 MB
```

Cold **0.069 ms/resolve** against B1's recorded **0.044** = 1.57×. ⚠️ **A DEV-BOX FIGURE — a
regression check against itself, never a production budget.** The production question belongs
to B4b, where biology's 47,568-term scope bites.

**5b, the discriminating comparison — and the reason 5a is readable at all.** 5a compares
today's cold figure against one recorded on _another day_, and this box does not repeat
itself: three runs of this gate measured **1.43×, 1.64× and 1.57×** against B1's 0.044 while
the code was provably not slower. So the branch-point resolver and the current one were run
**interleaved, in one process, against one database**:

| round | prev (`bf680c3d`) | next (this branch) | ratio |
| ----- | ----------------: | -----------------: | ----: |
| 1     |  0.059 ms/resolve |   0.049 ms/resolve | 0.82× |
| 2     |             0.067 |              0.063 | 0.93× |
| 3     |             0.064 |              0.073 | 1.13× |

**Median 0.93× over 47,568 resolves** — next is _not_ slower; the medians across three whole
gate runs were 0.95×, 0.80× and 0.93×, with next faster in most rounds. The cross-day metric
carries ±60% of box noise and the same-box A/B does not.

⚠️ **5b is also a free correctness control at a second, larger book:** with zero preference
rows, prev and next find **the same 44,861 winners** over biology's 47,568-term scope. Gate 1
proves the chemistry payload is unchanged; this proves the resolver's answers are unchanged
on a book gate 1 never touches. A disagreement here is a hard failure.

⚠️ **Tolerances, set from measurement and stated so they do not look moved after the fact.**
5a gates at **3×** — deliberately coarse, because a 2× threshold would eventually fail
spuriously on a busy box (measured spread 1.43–1.64× with the code unchanged) and a gate that
cries wolf gets ignored; 3× still catches the shape that matters, since a per-resolve database
round trip is orders of magnitude, not tens of percent. **5b gates at 1.5×**, which is tight
because it compares like with like.

---

## What did NOT run, and why

- **Nothing ran against production, by lead decision.** No `ssh`, no `scp`, no `db.backup()`.
  The corpus is a local rebuild, which is caveat 1 and the single largest limitation of this
  evidence.
- **Migration 048's expansion was not measured on production data** — see gate 2. On this
  database the 0 is structural, not a measurement of production's rows.
- **Gate 4 RAN** and is reported above. It was the gate most at risk of being marked
  `NOT RUN`: had no concept answered two case-distinct census strings while carrying a second
  Icelandic term, the script would print `NOT RUN` with that reason and **not** a pass. 15
  such concepts exist, so the case was real and the gate is not vacuous.
- **The E2E suite did not run.** `npm test` is `vitest run` and does not include Playwright;
  B4a touches no route, view or editor pathway, so no E2E evidence is claimed here.
- **No `--adopt` and no glossary write.** B4a cannot create a preference row (that is B4c),
  and no committed `glossary-unified.json` was touched. Gate 1's whole point is that today's
  export is byte-for-byte unaffected in `terms`, so nothing under `books/` needed rewriting.
- **No production deploy or health check was consulted.** Deployment status for this branch
  lives in the register, not here.

---

## Where these numbers came from

- Chemistry's 2,119 terms and the 1,999/120/299 census → `test-results/b3-export-cutover-2026-08.md` §1.
- B1's 0.044 ms/resolve (`cold:`) and the 47,568 / 19,749 scope sizes → `test-results/b1-resolve-gates-2026-08.md`.
- Production's 70,187 concepts / 192,189 terms → `test-results/b2-prod-population-2026-08.md`.
- §C38's six `accuracy` concepts and the failed `book_concept_preference` experiment →
  register §C38 and the B4a spec §2.

**Every figure above is a number to reproduce, not a constant to update.** The gate script
compares against them at zero tolerance (except the two performance tolerances, stated above);
a divergence is a finding to explain — and on this reconstruction, an ambiguous one.
