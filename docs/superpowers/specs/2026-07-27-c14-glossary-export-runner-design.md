# C14 — Glossary export runner + `formatGlossary` blank-side guard (design)

**Date:** 2026-07-27 · **Register item:** C14 (P1, `[CODE]`) in
[`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md)
· **Baseline:** main `0ec58888`

---

## 1. Why this item exists, stated correctly

The register warns that C14's premise was corrected once already, so restate it precisely:

**The bridge exists.** `server/scripts/export-terminology.js` reads the terminology DB via
`terminologyService.exportBookGlossary` and writes
`books/<book>/glossary/glossary-unified.json` — exactly the file `tools/api-translate.js`
`loadGlossary` (`:623`) feeds to Málstaður as the MT glossary. **Do not write a second
exporter.** What is missing is anything that *invokes* it, and — established below — anything
that would *deliver* its output if it did.

## 2. What was verified against the tree (2026-07-27)

Evidence for every claim this design rests on. Each was checked directly, not inherited.

| # | Claim | Evidence |
|---|---|---|
| V1 | The exporter has **zero callers** | `grep -rn export-terminology scripts/ .github/ package.json server/ tools/` → only its own docstring, docs, and audit files |
| V2 | The committed exports are **stale** | `books/{efnafraedi-2e,liffraedi-2e}/glossary/glossary-unified.json` mtime Mar 11; `lifraen-efnafraedi` Mar 23 |
| V3 | `formatGlossary` has **no blank-side guard** | `tools/lib/malstadur-api.js:179` maps every term to `{sourceWord, targetWord}` unconditionally |
| V4 | `formatGlossary` has **zero test coverage** | `grep -rln formatGlossary tools/__tests__/ server/__tests__/` → no matches |
| **V5** | **The exporter's own header is FALSE** | `export-terminology.js:9-10` says *"the 2h git-backup already stages `books/`"*. `scripts/git-backup.sh:108-118` lists nine pathspecs; `books/*/glossary/` is **not** among them |
| V6 | `architecture.md` repeats the false wiring | `docs/technical/architecture.md:460` claims "`export-terminology.js` (cron) + git-backup · nightly + ~2h"; `:473` repeats it |
| V7 | The pathspec gap is registered as **C3** | C3 covers `books/*/tm/` **and** `books/*/glossary/` |
| V8 | **WAL is on** — a second reader process is safe | every service does `db.pragma('journal_mode = WAL')` on open |
| V9 | **No cron script invokes `node` today** | `backup-db.sh` uses the `sqlite3` system binary; `git-backup.sh` uses only `git` |
| V10 | The established node-resolution idiom | `scripts/deploy.sh:26` `export PATH="/usr/bin:$PATH"`, commented: nvm otherwise shadows the systemd Node |
| V11 | `git-backup.sh` is `set -euo pipefail` (`:28`) | an uncontained non-zero exit would abort the backup and suppress the C11(b) heartbeat (`:70-72`) |
| V12 | `deploy.sh` enumerates health checks **generically** and gates nothing | `scripts/deploy.sh:110-135` — `Object.entries(h.checks).filter(([,c]) => !c.ok)`; a new check needs **no** `deploy.sh` change |
| **V13** | **`formatGlossary`'s return value IS the request body** | `filterGlossaryForText` spreads it (`api-translate.js:756-762`); `malstadur-api.js:242` assigns `body.glossaries = opts.glossaries` |
| V14 | A blank IS side survives DB validation | `terminologyService.js:1501` uses `!icelandic`, and `!' '` is `false` → whitespace-only passes and can be approved |
| V15 | `merge-glossary` writes blank IS sides directly | `tools/merge-glossary.js:347` sets `icelandic = ''` for `needs_review` terms, bypassing the DB |
| V16 | `filterGlossaryForText` **TypeErrors** on a null EN side | `api-translate.js:759` calls `t.sourceWord.toLowerCase()` |

### V17 — the finding that reshaped this design: **two producers, one artifact**

All three committed `glossary-unified.json` files carry merge-glossary's `category` key and
lack the DB exporter's `subjects` key. **`tools/merge-glossary.js` wrote them, not
`export-terminology.js`.** So cron-ing the DB exporter does not refresh a stale file — it
**swaps producers**.

Measured contents of the committed files:

| Book | terms | approved | dominant source |
|---|---|---|---|
| `efnafraedi-2e` | 1117 | **617** | `chemistry-society-csv` 605 |
| `lifraen-efnafraedi` | 1117 | **617** | *byte-identical copy of the above* |
| `liffraedi-2e` | 2262 | **0** | `openstax-glossary` 2262, all `needs_review` |

Three facts make the swap's outcome **unknowable without querying prod**:

1. `server/migrations/032-terminology-redesign.js:24` does `DROP TABLE IF EXISTS
   terminology_terms` under the comment *"Clean start"* — the 605 chemistry-society terms
   may not have survived into the new tables.
2. `merge-glossary.js:533` still writes `INSERT INTO terminology_terms` — a table that no
   longer exists. Its error is swallowed by the catch at `:727`, so its `--db` bridge is
   **dead and silently so**.
3. `exportBookGlossary` is **deliberately strict** (item 18,
   `terminologyService.js:1556-1561`): only translations tagged with the book's exact subject
   export at all. Untagged/`general` terms are excluded.

**Consequence:** an unguarded first cron run could take chemistry's MT priming from 617
approved terms to near zero, silently, with the damage visible only as degraded translation
quality weeks later. This is why the shrink guard (§4.2) is the gate that makes cron-ing
this safe at all, not a defensive nicety.

## 3. Decisions taken (lead, 2026-07-27)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Host the runner inside `scripts/git-backup.sh`**, and take `books/*/glossary/` from C3 | Zero new prod ops — no `crontab -e`, rides the cron C11(b) already monitors. A runner without the pathspec delivers nothing (V5/V7), so the pathspec is the minimum that makes C14's own deliverable real. `books/*/tm/` stays in C3 |
| D2 | **Write-if-changed + shrink guard** in the exporter | Write-if-changed kills ~4,380 timestamp-only commits/year and preserves `git-backup.sh:140`'s healthy "nothing to commit" path. The shrink guard makes the producer swap (V17) fail loud instead of silently degrading MT |
| D3 | **Drop malformed glossary entries + report the count** | Fails safe: MT loses one term of priming rather than the whole paid batch 400ing. Mirrors the `countInlineMarkers` idiom of surfacing data defects at the MT stage |
| D4 | **Ship a `/api/health` check** | The project's recurring failure is "wired but never verified" (34/34 sync failures unnoticed; this export stale since March). Reuses the 3-day-old C11(b) pattern; `deploy.sh` picks it up free (V12) |

## 4. Component design

### 4.1 Exporter — write-if-changed

Before writing, read the existing file and compare **term content only**, ignoring
`generated` (which changes every run by construction —
`terminologyService.js:1581`). Unchanged → skip the write, log it, and treat the book as
**healthy** (the alarm is "the exporter is not running", not "terminology is not changing" —
the same semantics as `git-backup.sh`'s `no_changes` healthy path).

### 4.2 Exporter — shrink guard

⚠️ **Corrected 2026-07-28 (whole-branch adversarial review, finding 1 — CRITICAL):** this
section originally said the approved-count check "subsumes the empty-DB case of `0`". That is
false, and it was the bug: `books/liffraedi-2e/glossary/glossary-unified.json` — the largest
committed glossary in the repo — is 2262 terms, **all `needs_review`, 0 approved**. An
approved-only check starts at `prevApproved === 0` for that book and can never fire, so an
empty export would have been written and pushed. The guard now checks **both** the approved
count (what primes MT — `approvedOnly: true`, `api-translate.js:629`) and the **total** term
count regardless of status, refusing when either falls below the ratio. See
`server/lib/glossaryExportDecision.js` and the register's C14 entry for the verified
before/after against the real committed files.

Refuse to write, for that book, when **either** of the following holds:

- an existing file has approved count `> 0` **and** the new export's approved count is
  `< 50%` of it, **or**
- an existing file has total term count `> 0` (any status) **and** the new export's total
  term count is `< 50%` of it

…unless `--force` is passed. A refusal writes nothing and logs all four counts (both totals,
both approved). Rationale for a ratio rather than a strict `>=`: legitimate shrinkage happens
(a head editor un-approves; item-18 subject scoping tightens). 50% is deliberately loose — it
targets catastrophe, not drift.

**An unparseable or absent existing file is not a refusal** — there is no baseline to protect,
so the export writes and logs that it established a new baseline. Refusing there would wedge
the exporter permanently on a corrupt file it is capable of replacing.

⚠️ **Corrected 2026-07-28 (Task 4 per-task review finding, commit `5cdf3659`; predates the
whole-branch review rounds below).** The paragraph above is true only of `ENOENT` (no file yet)
and a JSON parse failure (corrupt file) — the two cases with genuinely no usable baseline. It
does **not** extend to every read error: `readExisting` originally caught them all into `null`,
which for a permissions fault (`EACCES`) means an *unreadable* existing glossary reads as "no
baseline," the shrink guard stands down on exactly the file it exists to protect, chemistry's
617 approved terms get overwritten, and the heartbeat is still written — `/api/health` stays
green through a silent overwrite. Shipped `readExisting` (`server/scripts/export-terminology.js`)
returns `null` only for `ENOENT` and a parse failure; every other error, `EACCES` above all,
propagates and is caught per-book by the caller as a failure (counted, heartbeat withheld, later
books unaffected). Verified by a `chmod 000` export holding 617 approved terms being left intact.

`--dry-run` keeps its current meaning and additionally reports what the guard *would* do.

**Exit-code contract** (`git-backup.sh` keys off it): `0` only when every requested book
resolved healthily; non-zero if **any** book was refused or threw. Books are processed
independently — one refusal must not skip the remaining books.

⚠️ **Corrected 2026-07-28 (whole-branch adversarial reviews, rounds 1 and 3).** "Refused or
threw" no longer covers every way a book can now fail — two more per-book failure modes were
added alongside the shrink guard, both counted exactly like a refusal (logged, `failures++`,
loop continues, heartbeat withheld, nothing written for that book): (1) **round 1, finding 2** —
a book with no `book_subject_mapping` row would make `exportBookGlossary`'s subject filter a
no-op and export an unscoped, all-subjects glossary, the opposite of item 18's deliberately
strict intent; `runGlossaryExport` now resolves each book's subject via `subjectFn` (default
`terminologyService.getBookSubject`) before exporting and refuses when it is `null`. This does
**not** change the §5 rollout outcome for the three real books — migration 032 already seeds
`book_subject_mapping` for `efnafraedi-2e`/`liffraedi-2e`/`lifraen-efnafraedi` — but it is a real
gate for any book registered since. (2) **round 3** — a non-throwing but malformed `exportFn`
return (no `.terms`, or `terms` not an array) used to reach `sameTerms`/`shrinkVerdict`
unchecked; with no baseline (a book's first export) `shrinkVerdict.refuse` stays `false`
regardless of shape, so a malformed payload was written to disk as-is — exit 0, zero errors,
heartbeat green. `runGlossaryExport` now validates `next` immediately after the `exportFn` call
(non-null object, `Array.isArray(next.terms)`) before any comparison or write, via a
`describeMalformedPayload` helper for the message (built to name `null` distinctly and report the
payload's own keys — see the shipped file's JSDoc for why it does not `JSON.stringify`). Read
`server/scripts/export-terminology.js` for the four failure modes as they now stand.

⚠️ **Corrected 2026-07-28 (whole-branch adversarial review, finding 6): exit `0` is NOT
equivalent to "the heartbeat was written".** The sentence originally here claimed they were
exactly equivalent, immediately followed by "`--dry-run` never writes it" — `--dry-run` can
return exit `0` (every book legitimately unchanged/would-write) while writing no heartbeat, so
the two sentences contradicted each other. The real rule, restated in § 4.3 below and in
`export-terminology.js`'s header: the heartbeat is written only on an **unfiltered** (no
`--book`), **non-dry-run** pass with **zero failures**. A `--book <slug>` run or a `--dry-run`
can each legitimately exit `0` while leaving the heartbeat untouched (a `--book` run says
nothing about the health of the OTHER books — see the same review's finding 5).

### 4.3 Exporter — heartbeat

Write `pipeline-output/.last-glossary-export` only on an unfiltered (no `--book`), non-dry-run
pass where **every** discovered book resolved healthily (written, or legitimately unchanged).
A refusal, a crash, `--dry-run`, or a `--book <slug>` run all leave it untouched — absence is
the alarm, per the C11(b) doctrine (`git-backup.sh:56-72`).

**Discovering zero books is unhealthy**, not vacuously healthy: the exporter selects books by
the presence of `books/<slug>/glossary/` (the `hasGlossaryDir` filter, `export-terminology.js:188`,
applied in the book-selection line at `:199-200`), so an empty set means book discovery is
broken, not that there is no work. It exits non-zero and withholds the heartbeat. Without this,
a mis-resolved `BOOKS_DIR` would report healthy forever — the precise shape of failure this
check exists to catch.

### 4.4 Cron wiring — `scripts/git-backup.sh`

⚠️ **Corrected 2026-07-28 (documentation sweep, round 5; PATH scoping per Task 6 review, commit
`742c0c1e`, further corrected by addendum parked minor P3, commit `cad3363e`; timeout per round 2).**
The design below originally had no `timeout` and used a blanket `export PATH=`. Both mattered:
a hang is the one failure the exit-status check cannot catch, and it blocks `git-backup.sh`
before `write_heartbeat` — exactly the outcome this section's containment exists to prevent, not
hypothetically: the exporter opens `sessions.db` as a **second** process against the live
editorial server, there is no `flock`, and a hang would let the next 2h tick start a second
`add`/`commit`/`push` against the same working tree. And `export PATH=` is a **permanent
mutation** for the rest of the script — every later `git`/`date`/`timeout` call, including `git
commit`/`git push`/`git fetch` further down, none of which need `/usr/bin` prioritized — whereas
`deploy.sh` pins `PATH` on its literal first line because its *whole* script needs it. Corrected
in place below to match the shipped file; mutation-verified: removing the containment (a bare
`node …` call, no `timeout`) turns the `scripts` suite red, including every C11(b)
content-backup heartbeat test, because an uncontained failure under `set -euo pipefail` aborts
the run before the heartbeat is written.

A guarded export call **before** staging, following the file's own per-pathspec idiom at
`:174-184` (log and continue; never take the run down):

- `PATH="/usr/bin:$PATH"` is prefixed **per-command**, on both the `command -v node` existence
  check and the export invocation below — not `export`ed — so a `PATH` minimal enough to omit
  `/usr/bin` cannot make the existence check report a false "not found" while the (correctly
  scoped) invocation would in fact have worked
- `command -v node` check → absent: `log "WARN: node not found in cron PATH — glossary export skipped"`
- the invocation is wrapped in `timeout 120` — 120s is far above the sub-second this normally
  takes and far below the 2h cron period; not belt-and-braces, it is the only thing in this
  design that catches a hang, which an `if ! …; then` exit-status check cannot
- non-zero exit **or a timeout** → `log "WARN: glossary export failed or timed out — continuing with the content backup"`
- **never** aborts the backup (V11): terminology-DB health must not be coupled to the content
  backup's heartbeat

Add `'books/*/glossary/'` to `PATHSPECS` (`:160-171`, the glossary entry at `:167`).

⚠️ **Explicitly out of scope, per the register's standing warning:** no `git fetch` or rebase
is added to the cron.

Read `scripts/git-backup.sh` for the exact shipped form if this section and the file ever
disagree again — the file is authoritative.

### 4.5 `formatGlossary` — `tools/lib/malstadur-api.js:200`

Trim-based emptiness on **both** sides (`(t.english ?? '').trim()`, `(t.icelandic ?? '').trim()`);
drop entries failing either; emit trimmed values.

**The return shape must stay exactly `{domain, sourceLanguage, targetLanguage, terms}`.** Per
V13 it becomes the outbound request body verbatim, and the B1 probe established that glossary
bytes count toward the char budget that triggers truncation-retries. The skip count therefore
travels by a **separate channel**: an optional `opts.onSkipped(droppedTerms)` callback.

`loadGlossary` (`api-translate.js:632`) supplies an `onSkipped` that surfaces the count in the
existing glossary line at `api-translate.js:1117`:

```
Glossary: 412 approved chemistry terms (2 malformed skipped)
```

This also fixes V16 transitively — a null-EN term can no longer reach
`filterGlossaryForText:759`. "Fixed transitively" is exactly the kind of claim that rots, so
it gets its own explicit test (§6).

⚠️ **Corrected 2026-07-28 (documentation sweep, round 5 — spec/shipped drift).** Two points:

1. **The emptiness check is not the `??` form above.** Shipped:
   `typeof t.english === 'string' ? t.english.trim() : ''` (and the same for `t.icelandic`), not
   `(t.english ?? '').trim()`. The difference is not cosmetic: `??` only substitutes on
   `null`/`undefined`, so a non-string, non-nullish value (a number, say — DB rows are not
   type-checked before reaching here) would reach `.trim()` and throw under the sketch above,
   where the shipped `typeof` guard treats any non-string as blank and drops it instead. (V16's
   own case — a null EN side — is caught by either form; the `typeof` guard's extra safety is for
   non-string, non-nullish values, which V16 didn't cover.) Read `formatGlossary`
   (`tools/lib/malstadur-api.js`) for the exact shipped guard rather than rebuilding from the `??`
   sketch.
2. **A fourth consumer needed the same fix.** `tools/translate-chapter-titles.js` also calls
   `formatGlossary` (`approvedOnly: false`) and used to log `allTerms.length` — the count
   *before* the blank-side guard — so its "Glossary: N terms" line silently overstated what was
   actually sent once the guard started dropping entries. Corrected alongside the exporter work
   to log `glossaries[0].terms.length` (what the guard actually kept) instead, with a one-line
   comment at the call site explaining why the two counts can diverge.

### 4.6 Health — `server/lib/glossaryExportHealth.js` + `server/index.js`

A ~60-line wrapper over the existing shared `computeBackupHeartbeatHealth`
(`server/lib/backupHeartbeatHealth.js`), mirroring `contentBackupHealth.js`. Logic lives in
`server/lib/` because `server/index.js` calls `app.listen()` at module load and cannot be
imported by a unit test.

`checks.glossary_export` is added beside `content_backup` (`server/index.js:323-335`).
`GLOSSARY_EXPORT_STALE_HOURS`, default **6** (two missed 2h cycles + margin), with the default
defined in the lib next to its rationale and *not* repeated in `index.js` — the existing
comment at `index.js:329-331` explains why.

Resolve the project root from `__dirname`, never `process.cwd()` (the server runs with
`cwd=server/`).

**No `deploy.sh` change** (V12).

### 4.7 Documentation corrections — the register's explicit ask

| File | Correction |
|---|---|
| `CLAUDE.md` blocker (a) | "nothing bridges the terminology DB" → the bridge exists; what was missing was a runner *and* delivery. State the C14 outcome |
| project `MEMORY.md` | same wording |
| `server/scripts/export-terminology.js:9-10` | delete the false "git-backup already stages `books/`" claim; describe the real wiring |
| `docs/technical/architecture.md:460`, `:473` | describe actual wiring, not intent |
| register C3 | record that the `glossary/` half landed in C14; only `tm/` remains |
| register C14 | close, with the V17 finding and the rollout outcome |

Per CLAUDE.md § *One source of truth*: fix each wrong document **in place**; never log a
correction as a to-do in a second document.

**Note (2026-07-28), not a correction:** this table was a plan, now executed and then some — the
false wiring claim actually lived in five places, not the two implied above (`CLAUDE.md`, the
memory topic file `idordabanki-biology-seeding.md` rather than `MEMORY.md` itself,
`architecture.md`'s durability table *and* its freshness paragraph, the exporter's own header,
and a fifth occurrence in `docs/plans/2026-06-12-editorial-throughput-roadmap.md:163` found after
the first pass closed). All six rows above are done; none is left as an open task. Not rewritten,
since this table's job was to state intent at design time, and it did so correctly enough to
execute from.

## 5. Rollout, and the expected first-run outcome

**State this plainly rather than discovering it on prod:** on the first cron run after deploy,
the shrink guard will **most likely refuse** for `efnafraedi-2e` and `lifraen-efnafraedi`
(617 approved → an unknown, possibly near-zero, subject-scoped count). It will write nothing,
hold the merge-glossary files intact, withhold the heartbeat, and flip
`checks.glossary_export` to not-ok — which `./scripts/deploy.sh` prints.

**That is the design working.** It converts an unknowable silent degradation into a visible,
reversible stop, and it is the cheapest way to learn the real prod numbers.

⚠️ **Corrected 2026-07-28 (second whole-branch adversarial review, finding 4 — IMPORTANT):** the
sentence originally here — "`liffraedi-2e` has 0 approved terms committed, so its guard cannot
trigger; it will export whatever the DB holds" — describes the approved-count-only guard this
spec's own §4.2 correction already retracted. It is exactly the defect finding 1 (§4.2) fixed:
`shrinkVerdict` now also compares total term counts, and `liffraedi-2e`'s committed export is
2262 terms (all `needs_review`, 0 approved), so its guard refuses whenever the DB-scoped total
lands below ~1131 (50% of 2262) — likely, given only 13 of biology's 259 modules are extracted.
**So all three books most likely refuse on the first cron run after deploy, not only
`efnafraedi-2e` and `lifraen-efnafraedi`** — same outcome as described above: nothing written,
the merge-glossary files held intact, the heartbeat withheld, `checks.glossary_export` flipped
to not-ok. The `[LEAD]` follow-up below (`--dry-run` on prod, read the real counts before
`--force`) applies to `liffraedi-2e` exactly as it does to the other two.

**`[LEAD]` follow-up after deploy:** run
`node server/scripts/export-terminology.js --dry-run` on prod to read the real counts, then
decide per book whether to `--force` (accept the DB as authoritative) or to treat the
shortfall as a data defect to repair first. **Do not `--force` before reading the numbers.**

⚠️ **Re-checked 2026-07-28 against rounds 3 and 4 — still accurate, no further correction.** The
round-1 book-subject-mapping guard (§4.2) does not change this section's three-book outcome:
migration 032 seeds `book_subject_mapping` for exactly `efnafraedi-2e`, `liffraedi-2e`, and
`lifraen-efnafraedi`, so `subjectFn` resolves for all three and the shrink guard is what actually
fires first, as described above. Round 3's shape guard and round 4's `parseArgs`/message-format
changes affect what gets *logged* on refusal, not *whether* these three books refuse — the
flagless invocation `git-backup.sh` uses parses to the same `{book: null, dryRun: false, force:
false}` before and after round 4. No change needed.

## 6. Testing strategy

`formatGlossary` has no tests today (V4), so this is genuinely test-first rather than retrofit.

- **`formatGlossary`**: drops empty / whitespace-only / null on either side; trims survivors;
  `onSkipped` receives exactly the dropped terms; **wire-shape invariant** — the returned
  object has exactly the four expected keys, so nothing extra can reach the request body (V13)
- **Transitive V16 pin**: a term with a null `english` never reaches
  `filterGlossaryForText`, asserted explicitly rather than assumed
- **Exporter**: unchanged-content → no write, `generated` alone → no write, shrink → refuses
  and writes nothing, `--force` → writes, absent/unparseable baseline → writes, heartbeat
  written only on a fully healthy run, `--dry-run` writes neither file nor heartbeat, zero
  books discovered → non-zero exit and no heartbeat, one book's refusal does **not** skip the
  books after it
- **Health lib**: missing heartbeat → stale, fresh → ok, threshold boundary
- **Static pin**: `books/*/glossary/` present in `git-backup.sh` `PATHSPECS`, matching **file
  bytes**; the export call is contained (does not abort the run). **Mutation-check** each
  static pin — assert *which* test goes red — since a static pin proves presence, not behaviour

⚠️ **Corrected 2026-07-28 (whole-branch adversarial reviews, rounds 1, 3, and 4; git-backup
upgrade noted in the plan's Task 6, commit `2acb4c69`).** Coverage this list does not show:

- The **Exporter** bullet predates three more failure modes exercised in
  `server/__tests__/glossaryExportRun.test.js`: the book-subject-mapping guard (resolves,
  refuses on `null`, propagates a throwing `subjectFn`), the malformed-`exportFn`-payload shape
  guard (`describeMalformedPayload`'s branches: `null`, non-object, array, missing `.terms`,
  `.terms` `null`/non-array — each asserted for a distinct message, not just "some error"), and
  book selection by `=== null` rather than truthiness (`book: ''` treated as one missing book,
  never "all books").
- A new `describe('parseArgs', ...)` suite is not listed at all: valid flag combinations, a
  missing `--book` value, an empty/whitespace `--book` value (trimmed when valid), and — the
  round-2 CRITICAL fix — **any** unrecognised token (not just a missing value) rejected by class,
  with `--help`-appears-before-vs-after-the-bad-token both pinned for the documented
  error-over-help precedence.
- **Static pin, upgraded, not just extended:** the plan's Task 6 deliberately replaced this
  bullet's "static byte-pin… matching file bytes" with **behavioural** tests instead —
  `vitest.workspace.js`'s `scripts` project drives the real `git-backup.sh` as a subprocess in a
  temp git repo, so containment is asserted by actually breaking it (mutation-verified: a bare
  `node …` call turns the `scripts` suite red, including every C11(b) heartbeat test) rather than
  by grepping for a string. `PATHSPECS`
  membership is still confirmed, but as a side effect of a real commit landing the file, not a
  standalone byte match.

Authoritative gate: `npm test` from the repo root. Whole-branch adversarial review before the
PR, per the campaign's standing process.

## 7. Out of scope — logged, not fixed here

Per the standing "log every out-of-scope find" rule. These go to the register on merge:

1. **`merge-glossary.js:533` writes to the dropped `terminology_terms` table** (V17.2) — its
   `--db` upsert path is dead and silently so (error swallowed at `:727`). Not fixed here
   because the fix is a product decision, not a repair: see (2).
2. **Two producers of one artifact** — `merge-glossary.js` (onboarding: 3 sources incl. OpenStax
   CNXML) and `export-terminology.js` (continuous: DB). The project's "one real code path" rule
   argues for resolving this, but the resolution is a lead call (retire merge-glossary? make it
   feed the new tables?) and needs prod data from §5 first.
3. **`lifraen-efnafraedi`'s glossary is a byte-identical copy of `efnafraedi-2e`'s** — same
   1117 terms, same `generated` timestamp, same 445,395 bytes. Plausibly deliberate (both
   chemistry), plausibly a copy-paste artifact. Unverified either way.
4. **`docs/editorial/terminology.md:220`** still calls the CSV files "the authoritative source
   for approved terminology" — a claim the DB redesign superseded. Tracked in the closure audit
   as `ed-dim-8` (documentation corpus), not re-homed here.

**Note (2026-07-28), not a correction:** the four items above are this design's own out-of-scope
list, frozen as of 2026-07-27 per CLAUDE.md § *One source of truth* (a design record is evidence,
not status) — all four are still accurate and still open. The four whole-branch review rounds
that ran after this spec was written surfaced five more out-of-scope items (untested
operator-facing messages in `export-terminology.js`/`git-backup.sh`) plus one excluded design
item (a `glossaryExportHealth.js`/`contentBackupHealth.js` shared-factory refactor); those are
**not** added here, since this section's job is a frozen record of what was known at design time,
not a live list. Current status of all of it lives in the register's §C14, per the same rule that
keeps this section from being edited to match.

## 8. Non-goals

- No second exporter (the register's explicit warning)
- No `git fetch`/rebase in the cron (register C11 standing rule)
- No change to `books/*/tm/` staging — that half stays in C3
- No change to `exportBookGlossary`'s item-18 strict subject scoping; if §5 shows it is the
  cause of a shortfall, that is a separate, evidence-led decision
- No `deploy.sh` change
