# C14 ② step 4 — glossary export provenance guard + per-book outcome model (design)

**Date:** 2026-08-04 · **Register item:** C14 ② step 4 (P1, `[CODE]`) in
[`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md)
· **Baseline:** main `90cee56f`, suite green (265 files / 3,730 tests, measured 2026-08-04)
· **Predecessors:** [`2026-07-27-c14-glossary-export-runner-design.md`](2026-07-27-c14-glossary-export-runner-design.md)
(the runner this repairs) · [`2026-08-04-c18-glossary-collision-guard-design.md`](2026-08-04-c18-glossary-collision-guard-design.md)
(step 1, merged as #349)

---

## 1. What this is for

On **2026-08-03 12:00 UTC** the glossary export ran unattended inside the 2-hourly backup
cron for the first time, rewrote two committed glossaries and created a third, and pushed
all of it to `main` as `4fbbfa5f`. Nothing chose this; once the code reached production the
outcome was scheduled. The shrink guard passed it, and `/api/health` reported
`glossary_export: ok=false` throughout — *including across the run that wrote and pushed* —
so nothing announced it either.

The incident is **contained and reverted** (register §C14 ②). Containment is a commented-out
block on production, marked `#CONTAINED-2026-08-03#`, deliberately uncommitted. **This design
is what has to ship before that block can be lifted.**

Two defects, both live:

1. **The guard measures size, so it cannot see a producer swap.** `shrinkVerdict` compares
   term counts. A wholesale change of *which program wrote the file* is not a size change —
   chemistry's swap was −36.5%, comfortably under the 0.5 halving threshold, and biology's
   was **growth**, which a shrink ratio is structurally blind to.
2. **One process exit code collapses every book's outcome**, and the heartbeat sits behind
   it, so a book that refuses for a *correct* reason suppresses the health signal for all of
   them.

### 1.1 Measured starting state — the producer fingerprint is a clean partition

The premise of the fix is that the two producers are distinguishable **from the bytes
already on disk**, with no stamp and no external ledger. Measured 2026-08-04 across every
committed `books/*/glossary/glossary-unified.json`. **Counting unit: terms (rows), not
headwords.**

| Book | terms | carry `category`+`chapter` | carry `subjects` | `stats.disputed` |
|---|---:|---:|---:|---|
| `efnafraedi-2e` | 1117 | **1117** | **0** | absent |
| `liffraedi-2e` | 2262 | **2262** | **0** | absent |
| `lifraen-efnafraedi` | 1117 | **1117** | **0** | absent |
| **total** | **4496** | **4496 (100%)** | **0 (0%)** | — |

`exportBookGlossary` (`server/services/terminologyService.js:1562-1575`) emits the exact
complement: `english, icelandic, pos, definitionEn, definitionIs, status, source,
**subjects**, alternatives, notes` — no `category`, no `chapter`. It also always initialises
`stats.disputed` (`:1551`), which no committed file has.

**This is a partition, not a heuristic.** Two independent signals agree, and neither has a
single counter-example in 4,496 rows.

> ⚠️ **Both facts were measured, not read off the code.** `tools/merge-glossary.js`'s
> `writeJSON` (`:417-434`) passes `merged.terms` through verbatim, so the source of
> `category`/`chapter` is the merge stage upstream of it — the shape is only knowable by
> looking at what actually landed on disk. Re-measure before trusting this table; the
> command is in §7.4.

### 1.2 Why a ratio could never have caught it

Both producers emit `{generated, book, stats, terms}` where `terms` is an array. **A count
is the one dimension on which the two producers are indistinguishable.** The discriminating
information was always in the term *shape*, which no count can reach.

Worth stating plainly because the guard's own docblock (`glossaryExportDecision.js:13-26`)
**names the threat correctly** — "the committed files were produced by `tools/merge-glossary.js`,
not by this exporter, so cron-ing it SWAPS PRODUCERS rather than refreshing" — and then
implements a proxy for it. *The comment was right; the measurement it chose could not
express what the comment said.*

---

## 2. Decisions taken

Recorded with their reasoning, because each closes a live alternative.

| # | Decision | Why |
|---|---|---|
| **D1** | A producer swap refuses unless **`--adopt`**; `--force` keeps meaning "accept a shrink" only. | Two different risks deserve two deliberate acts. A single flag on an unfiltered run would migrate every book *and* wave through every shrink in one keystroke — and register C14 round 4 already records an argv typo silently widening `--force` to all books. |
| **D2** | `/api/health`'s `glossary_export` is not-ok on **stale heartbeat or a hard error only**. Refusals report but do not flip `ok`. | A refusal is a *correct* outcome. A check that is permanently red for expected reasons gets tuned out — which is exactly what happened on 2026-08-03, when `ok=false` had been the steady state for so long that a live incident hid inside it. |
| **D3** | **Keep the size ratio, unchanged at 0.5**, alongside the producer check. | They guard different failure modes. The ratio can't see a producer swap; the producer check can't see a same-producer collapse (a mass un-approval, a migration dropping rows) — which is the risk that remains live *forever after* every book is adopted. The register's word was "replacing"; this design says "and". |
| **D4** | Detection = **stamp going forward, fingerprint as the migration bridge**. | Exact for every book after its first adoption; the fingerprint only ever runs on legacy bytes. Also catches the **reverse** swap for free: re-running `merge-glossary.js` over an adopted book removes the stamp, and the next export refuses. |
| **D5** | A **corrupt/unreadable** existing file refuses (needs `--adopt`) instead of being silently replaced. | "We cannot tell what we would destroy" is precisely when a human should decide. This **changes existing behaviour** — see §6.1. |

**D3's synergy with D1, worth making explicit:** the register asked that chemistry's 408-term
drop "be a decision rather than a default". It now is, without tightening the ratio —
chemistry's **first** write is a producer swap, so it needs `--adopt`, and the lead sees
`1117 → 709` and decides. Tightening the ratio to catch the same case would have contradicted
`glossaryExportDecision.js:73-76`, which chose looseness deliberately on the grounds that
refusing on ordinary drift "would train people to pass `--force`".

---

## 3. Architecture

### 3.1 `server/lib/glossaryProducer.js` — NEW, pure

One detector, no I/O, no DB. Follows the precedent C18 set with
`tools/lib/glossary-collisions.js`: a single definition of the concept, shared by every
consumer rather than re-derived at each call site.

```
PRODUCER_EXPORT = 'export-terminology'
PRODUCER_MERGE  = 'merge-glossary'

detectProducer(payload) → 'export-terminology' | 'merge-glossary' | 'unknown'

  payload.producer === PRODUCER_EXPORT                     → export-terminology  (exact)
  no producer field, terms carry subjects
      and no category|chapter                              → export-terminology  (pre-stamp)
  no producer field, terms carry category|chapter
      and no subjects                                      → merge-glossary      (legacy)
  anything else                                            → unknown
```

**Both fingerprint clauses are exclusive, and a hybrid resolves to `unknown` on purpose.** A
payload carrying *both* `subjects` and `category`/`chapter` is a shape neither producer emits
today, so it means something has changed that this detector does not model. `unknown` differs
from the stamped `next`, so it **refuses and waits for `--adopt`** — the conservative outcome,
and consistent with D5: when we cannot tell what we would destroy, a human decides. The cost
of being wrong here is one book skipped and reported; the cost of guessing is a silent
overwrite. An empty `terms: []`, a non-object, or any unrecognised shape is likewise `unknown`.

**Why `unknown` is a distinct value and not folded into either producer:** an empty or
unrecognised payload is the case where we know least, and D5 routes it to a refusal. Folding
it into `merge-glossary` would give the same behaviour today by accident, and the wrong
behaviour the first time a third producer or a schema change appears.

### 3.2 `server/lib/glossaryExportDecision.js` — extended, existing logic untouched

`countApproved`, `countTerms`, `sameTerms`, `shrinkVerdict`, `SHRINK_RATIO` keep their
current behaviour **byte for byte**. Added:

```
producerVerdict(prev, next) → { refuse, prevProducer, nextProducer }
```

`refuse` is true when `prev` exists and `detectProducer(prev) !== detectProducer(next)`.

**Two boundary cases the signature alone does not settle, specified here so the call site is
not left to invent them:**

- **A corrupt existing file never reaches `producerVerdict`.** `readExisting` returns
  `{kind:'corrupt'}` with no payload (§6.1), so there is nothing to detect. The *call site*
  maps `kind === 'corrupt'` straight to `refused-producer`. `producerVerdict` stays pure over
  payloads and is never handed a sentinel — keeping "is this parseable" and "who wrote it" as
  separate questions, answered in separate places.
- **`detectProducer(next)` is always `export-terminology`** once §3.3 lands, so in production
  the verdict reduces to `detectProducer(prev) !== 'export-terminology'`. The two-argument
  form is kept anyway: it is what makes the function testable without the stamp, and it is
  what a second consumer (`merge-glossary.js` refusing to clobber an adopted file — §9)
  would need, with the arguments the other way round.

### 3.3 `server/services/terminologyService.js` — the stamp

`exportBookGlossary` returns `producer: PRODUCER_EXPORT` alongside `generated`, `book`,
`stats`, `terms`.

**This cannot cause a spurious rewrite.** `sameTerms` compares `JSON.stringify(prev.terms)`
against `JSON.stringify(next.terms)` (`glossaryExportDecision.js:69`) — a *top-level* key is
outside that comparison, so write-if-changed is unaffected. Confirmed against the function,
not assumed.

### 3.4 `server/scripts/export-terminology.js` — per-book outcome model

The `failures` counter is replaced by a per-book outcome. Gate order is **producer first,
shrink second**: a producer swap is categorical and a shrink is quantitative, and reporting
"1117 → 709, a 36.5% shrink" about a file another program wrote invites the operator to
reason about two numbers that count different things.

| outcome | when | exit contribution | heartbeat |
|---|---|---|---|
| `wrote` | changed, gates clear | 0 | ✅ |
| `adopted` | producer swap, `--adopt` given | 0 | ✅ |
| `unchanged` | `sameTerms` | 0 | ✅ |
| `refused-producer` | producer differs (incl. corrupt/unknown), no `--adopt` | 0 | ✅ |
| `refused-shrink` | ratio trips, no `--force` | 0 | ✅ |
| `refused-no-mapping` | no `book_subject_mapping` row | 0 | ✅ |
| `error` | throw, DB failure, malformed export payload | **1** | ❌ |

Exit is `0` unless at least one book hit `error`. Heartbeat rules are otherwise unchanged
from the C14 runner: written only on a non-dry-run, unfiltered (`book === null`) pass, so a
lead hand-running one book cannot stamp false green over the others.

**`refused-no-mapping` and the two `error` cases are RECLASSIFICATIONS of branches that
already exist, not new control flow.** Verified against the source, not inferred: the
no-mapping branch is `if (!subject) { logError('… no book_subject_mapping row — refusing to
export an unscoped, all-subjects glossary …'); failures++; continue; }`
(`export-terminology.js:240-247`), and `subjectFn` or `exportFn` throwing are two further
`failures++` sites (`:236`, `:245`). All three currently collapse into the same counter. The
work is to give them distinct outcomes, not to invent branches.

### 3.5 Status file + `server/lib/glossaryExportHealth.js`

The exporter writes `pipeline-output/.glossary-export-status.json` on every non-dry-run pass
— **including one that ends in `error`**, since the breakdown is most valuable exactly then:

```json
{
  "ran": "2026-08-04T12:00:04.117Z",
  "filtered": false,
  "errors": 0,
  "books": {
    "efnafraedi-2e":      { "outcome": "refused-producer", "detail": "committed file written by merge-glossary" },
    "liffraedi-2e":       { "outcome": "refused-producer", "detail": "committed file written by merge-glossary" },
    "lifraen-efnafraedi": { "outcome": "refused-no-mapping" },
    "stjornufraedi":      { "outcome": "refused-no-mapping" }
  }
}
```

`readGlossaryExportHealth` gains the breakdown and computes `ok = !stale && errors === 0`
(D2). `contentBackupHealth` is the precedent for a health check reading a status file
alongside a heartbeat; `glossaryExportHealth.js:18` currently documents the *absence* of one
as the reason it has no detail to show, and that comment must be updated rather than left
contradicting the code.

### 3.6 `scripts/git-backup.sh`

Its WARN branch (`:141`) keys on the exit status, whose meaning changes from "some book did
not write" to "a book errored". Message and surrounding comment updated to match.

**Out of scope here:** the `#CONTAINED-2026-08-03#` block is *production working-tree state*,
not repo state. This PR does not touch it. See §8.

### 3.7 `./scripts/deploy.sh` must print refusals, not just not-ok checks

**D2 and D5 combine into a hole that neither decision creates alone, and it must be closed
in this PR.** D5 routes an unreadable glossary to `refused-producer`; D2 says refusals do not
flip `ok`. Composed, a corrupt file on production yields **exit 0, heartbeat written,
`checks.glossary_export: ok: true`**, and the only trace is a `detail` string in a status
JSON — and **nothing polls `/api/health`** (CLAUDE.md § *Server Features*; the routine
surface is what `deploy.sh` prints). That is precisely the §C11(b) shape: a detector
reporting into a channel nobody reads, which went unnoticed for 13 days.

`deploy.sh` already prints the health verdict plus the names of any not-ok checks. It must
also print **any book whose outcome is a refusal**, even when the check is `ok`:

```
glossary export: ok (ran 1.2h ago)
  ⚠ efnafraedi-2e      refused — committed file written by merge-glossary (needs --adopt)
  ⚠ liffraedi-2e       refused — cannot read existing file (needs --adopt)
  ⚠ lifraen-efnafraedi refused — no book_subject_mapping row
```

This keeps D2 intact — a refusal still never blocks a deploy or reddens the check — while
making the one thing a refusal must never be: silent. **Without this, D5 converts a corrupt
file from "silently overwritten" into "silently skipped", which is not an improvement.**

---

## 4. Data flow

```
cron: scripts/git-backup.sh (every 2h)
  └─ node server/scripts/export-terminology.js          ← NO FLAGS, ever
       for each book in listBooks(booksDir).filter(hasGlossaryDir):
         readExisting(outPath)        → absent | corrupt | ok
         terminologyService.exportBookGlossary(slug)     → next (stamped)
         ├─ shape guard (unchanged)   → error
         ├─ producer gate  (D1, D5)   → refused-producer   unless --adopt
         ├─ sameTerms                 → unchanged
         ├─ shrink gate               → refused-shrink     unless --force
         └─ write
       write status JSON  (always, non-dry-run)
       write heartbeat    (unfiltered && errors === 0)
       exit 0 | 1
  └─ stage books/*/glossary/ → commit → push
GET /api/health → heartbeat mtime + status JSON → checks.glossary_export
```

**The safety property is that the cron passes no flags.** Both overrides are reachable only
by a human typing them. That is the structural answer to the register's durable lesson —
*"a guard that only gates the manual path is not a gate"* — inverted here so that the
unattended path is the one with no key.

---

## 5. Components changed

| File | Change | Risk |
|---|---|---|
| `server/lib/glossaryProducer.js` | **new**, pure | none — no callers until wired |
| `server/lib/glossaryExportDecision.js` | add `producerVerdict`; existing exports unchanged | low |
| `server/services/terminologyService.js` | `exportBookGlossary` emits `producer` | **payload-shape change — see §7.3** |
| `server/scripts/export-terminology.js` | outcome model, `--adopt`, status file, exit semantics | highest |
| `server/lib/glossaryExportHealth.js` | read status file; `ok` semantics | low |
| `scripts/git-backup.sh` | WARN text + comment | low |
| `scripts/deploy.sh` | print refusals even when the check is `ok` (§3.7) | low |

---

## 6. Error handling

### 6.1 `readExisting` stops conflating "no file" with "bad file"

Today it returns `null` for both, commented *"corrupt file — no usable baseline, and
replacing it is an improvement"* (`export-terminology.js:97-101`). That predates this work
and collides with it: a corrupt `merge-glossary` file would be silently replaced by an
export — the exact producer swap, ungated. Per **D5** it returns a discriminated result:

| input | result | outcome |
|---|---|---|
| `ENOENT` | `{kind:'absent'}` | write — correct, this is a first export |
| unparseable JSON | `{kind:'corrupt'}` | `refused-producer`, needs `--adopt` |
| readable | `{kind:'ok', payload}` | gate normally |
| any other fs error | throws (unchanged) | caught per book → `error` |

⚠️ **This changes tested behaviour.** An existing case in `glossaryExportRun.test.js` asserts
the corrupt-file-writes path. It must be *revised with the reason recorded in the test*, not
deleted — a deleted test leaves no trace that the behaviour was considered and changed.

### 6.2 Unchanged on purpose — but its docblock needs one sentence

The export-payload shape guard and `describeMalformedPayload` stay exactly as they are. They
cover a malformed **export**; §6.1 covers a malformed **existing file**. Different inputs,
different failures, and `describeMalformedPayload`'s docblock records four rounds of review
that should not be disturbed by this work.

⚠️ **The comment does need one added sentence, even though the code does not change.** That
docblock explains the guard as existing to prevent "the abort-the-loop failure mode", and
§6.1 now lands a second, *differently handled* malformed-input path directly beside it — one
that refuses rather than errors. Without a line distinguishing malformed-**export** from
malformed-**existing-file**, the next reader spends their time reconciling two guards that
look redundant and are not. This repo has already paid for that once: the "mathematically
dead" flag preserved at `glossaryExportDecision.js:95-109` was right about the code path and
wrong about the consequence, and only the written-out reasoning makes that recoverable.

### 6.3 Flag independence

`--adopt` does **not** imply `--force`. A book that is both a producer swap and a
catastrophic shrink needs both. Two risks, two acknowledgements.

`--adopt` must join the round-4 argv-trap coverage in `parseArgs`: a boolean flag positioned
so it swallows `--book`'s value leaves `book` at its `null` default — *"every book"* — which
is how a misspelling silently widens the blast radius at exactly the moment someone is
following a "run it with the flag" instruction.

### 6.4 Reporting must not take down the signal

A failure writing the status file logs and continues. The heartbeat is the primary signal and
must never be lost to a fault in its own reporting.

---

## 7. Testing

### 7.1 New — `server/__tests__/glossaryProducer.test.js`

Detection table across all four return cases, **plus the two that matter**:

> **The legacy fingerprint is asserted against the REAL committed files, and the export
> fingerprint against REAL `exportBookGlossary` output.** Not hand-authored fixtures.

This is a direct application of this project's own most expensive lesson: a fixture written
from prose is how ten `<!-- SEG: -->` fixtures acquired a shape the real parser returns `[]`
for. A hand-written "merge-glossary-shaped" object would pass a test while proving nothing
about the 4,496 rows actually on disk.

### 7.2 Extended suites

| Suite | Adds |
|---|---|
| `glossaryExportDecision.test.js` | `producerVerdict` matrix; existing `shrinkVerdict`/`sameTerms` cases must still pass **unmodified** |
| `glossaryExportRun.test.js` | full outcome matrix; exit 0 with refusals; exit 1 with an error; heartbeat written/withheld; status-file contents; `--adopt` gating; `--adopt` not implying `--force`; corrupt-file refusal (§6.1); absent-file write |
| `glossaryExportHealth.test.js` | `ok` true with refusals present; false with `errors > 0`; false when stale |
| `parseArgs` coverage | `--adopt`, including the argv-swap trap |

### 7.3 Pre-flight before adding the stamp

Re-verify there is no object-shape pin on the export payload. A grep on 2026-08-04 found only
`result.terms` / `out.terms.map(...)`-style assertions in `terminologyService.test.js` and no
whole-payload `toEqual` — **but confirm rather than inherit that**. CLAUDE.md's
`NON_RENDER_KEYS` warning is exactly this class: the item-17 licence key leaked through a
lossless passthrough into a golden `toEqual` oracle. Checking "the rendered output is
unchanged" would not have caught it; checking the **object shape and its tests** does.

### 7.4 Re-measure §1.1 rather than trusting it

```bash
node -e '
const fs=require("fs"),path=require("path");
for (const b of fs.readdirSync("books")) {
  const p=path.join("books",b,"glossary","glossary-unified.json");
  if(!fs.existsSync(p))continue;
  const d=JSON.parse(fs.readFileSync(p,"utf8")), t=d.terms||[];
  const has=(k)=>t.filter(x=>Object.prototype.hasOwnProperty.call(x,k)).length;
  console.log(b, t.length, "category="+has("category"), "chapter="+has("chapter"), "subjects="+has("subjects"));
}'
```

### 7.5 Mutation verification

Per C18's precedent: flip `detectProducer`'s return, and separately remove the producer gate
from the call site, and confirm a test fails in each case. **A guard nothing fails on is not
a guard** — and this register records three checks in one branch that passed for the wrong
reason.

### 7.6 Gate

Root `npm test` green, run from the repo root. There is no branch protection, so local green
is the authoritative proof, not CI. Whole-branch adversarial review before the PR.

---

## 8. Explicitly out of scope

Each already has a home; none is dropped.

| Excluded | Owner |
|---|---|
| Lifting `#CONTAINED-2026-08-03#` on prod | **[LEAD]**, after this merges. This PR touches no prod state. |
| Running `--adopt` on any book | **[LEAD]**, per book. §C14 ②'s standing positions still hold — biology and organic are "do not write" for reasons this design does not settle. |
| Per-book `approved` flips (§C14 ② steps 2/3) | Editorial; chemistry = 124 decisions |
| `hasGlossaryDir`'s silent skip (`edlisfraedi-2e` invisible; empty `books/orverufraedi/glossary/` still admitted) | Register §C14 ②, line 269 |
| C19 — `archiver@8` ESM break on the download route | Register §C19 |
| Resolving any competing term | C18 shipped the guard; resolution is §C14 ② |

**The single most important boundary:** shipping this does **not** make the export safe to
switch back on. It makes switching it back on a *decision with a visible outcome*. Adoption
is still per book, still `[LEAD]`, and still unmade.

---

## 9. Follow-ups to log (not built here)

1. **`merge-glossary.js` should refuse to overwrite an adopted file.** The reverse swap — the
   detector makes this ~5 lines, but it is a second tool with its own call sites and belongs
   in its own change. Register it against §C14 ②.
2. **`stats.disputed` as a corroborating signal is unused.** The design keys on
   `category`/`chapter`/`subjects` only. If the fingerprint ever needs hardening, the second
   signal is already measured (§1.1).

---

## 10. Definition of done

- [ ] §1.1's partition re-measured on the branch (§7.4) and still 4496/4496 · 0/4496
- [ ] `detectProducer` asserted against real committed files **and** real exporter output
- [ ] Producer gate refuses all three committed books without `--adopt`
- [ ] `--adopt` writes; `--adopt` alone does not bypass the shrink gate
- [ ] Exit 0 with refusals present; exit 1 only on `error`
- [ ] Heartbeat written across a refusals-only run; withheld on `error`
- [ ] `/api/health` shows the per-book breakdown and reads `ok: true` with refusals present
- [ ] Corrupt existing file refuses; the revised test records why
- [ ] **A refusal is visible in `./scripts/deploy.sh`'s output even when the check is `ok`** (§3.7) — the difference between a guard and a log line
- [ ] `describeMalformedPayload`'s docblock distinguishes malformed-export from malformed-existing-file (§6.2)
- [ ] Mutation-verified (§7.5)
- [ ] Root `npm test` green; whole-branch adversarial review passed

---

## 11. ⚠️ AMENDMENTS MADE DURING EXECUTION — appended 2026-08-05

**Everything above is the design as it stood on 2026-08-04 and is deliberately left
unrewritten.** Implementation review found three holes the design did not anticipate. Each was
decided while the branch was in flight, and each *changes* something §2–§7 asserts. A design
record should show what was decided when — including that a third of the decisions in this
document were forced by review rather than foreseen — so these are appended rather than
folded silently into the body.

**Read §2's table together with this section: D2 is amended by D6, and §3.5 is amended twice.**

### 11.1 D6 — a refusal is tolerated, but not forever (human ruling, 2026-08-05)

**Amends D2, does not replace it.** D2 said a refusal reports but never flips `ok`. That is
still right as far as it goes, and its reasoning stands: a check permanently red for expected
reasons gets tuned out, which is how a live incident hid inside `ok=false` on 2026-08-03.

**What D2 missed is that the *opposite* failure is the day-one state of this very branch.**
Every committed glossary is a `merge-glossary` file, so **the first cron run after this ships
refuses every book**. Under plain D2 that is a permanent, *silent* steady state — `ok: true`
forever, with the evidence only in a gitignored log — until a human runs `--adopt` per book.
A refusal must not be allowed to become a permanent silent state.

**D6:** the status file records **`since` per book** — when that book's *current* outcome was
first observed, carried forward while the outcome is unchanged — and `/api/health` goes
**not-ok** once any book has been refusing longer than **`GLOSSARY_REFUSAL_STALE_DAYS`
(default 7)**. This reuses the repo's existing staleness doctrine rather than inventing a
mechanism (`content_backup`, `offbox_backup`).

⚠️ **`since` must carry forward across `detail` drift, and this is load-bearing.** A refused
shrink's `detail` is `${prevTotal} → ${nextTotal}`, so for any book whose counts move, a
comparison that included `detail` would reset the clock **every 2 h** and the 7-day alarm
**would never fire**. The carry-forward compares `outcome` only. It is pinned by a test that
was added specifically because the property survived a mutation undetected.

### 11.2 Ruling (c) — a filtered run writes NO status file (2026-08-05)

§3.5's first form had the status file written on every non-dry-run pass, tagged with a
`filtered` field. **That is unsafe in a way that is correlated with the alarm's firing
window.** `withSince` stamps only the books in *this* run, so a `--book <slug>` run overwrote
the whole-corpus map; the next unfiltered run then found no previous entry for the untouched
books and **reset their stale-refusal clocks to now**. The moment a lead hand-runs
`--book <slug> --adopt` is *precisely* while working through adoption — i.e. exactly while the
other books are still refusing and their clocks are running — so the reset lands
preferentially on the runs that matter most.

**Ruling:** the status file is written only on an **unfiltered, non-dry-run** pass, making it
exactly parallel to the heartbeat — both whole-corpus signals, both withheld on a filtered
run, **one rule instead of two**. The `filtered` field is **deleted**, not left permanently
`false`: a dead field implying that filtered runs write is worse than no field at all.

They still differ in exactly one clause, and it must not be "unified" away: the status file is
**not** gated on `errors === 0`, because a run that ended in an error is when its per-book
breakdown is most valuable. The heartbeat remains gated, because it is the liveness signal.

**Accepted, documented cost:** after a `--book --adopt`, the status file shows that book's
stale outcome for ≤2 h. Harmless — it can only *delay* an alarm, never manufacture one — and
documented rather than engineered away.

### 11.3 `GET /api/health` must project the per-book map (security, 2026-08-05)

Not in the design at all; found by review. **`GET /api/health` is unauthenticated** on an
internet-facing server, and this repository is public. §3.5 had it return the per-book map,
and a book's **`detail` can embed `err.message` verbatim** — including absolute server
filesystem paths (`EACCES … open '/srv/.../glossary-unified.json'`).

**Amendment:** health projects each book down to **`{outcome, since}`** through an allowlist.
Two properties of *where* that lives are deliberate:

- It is in **`server/lib/glossaryExportHealth.js`, not in the route**, so a future second
  caller of `readGlossaryExportHealth` gets the projection for free instead of re-leaking
  `detail` by omission.
- The projection **fails closed**: a malformed (non-object) entry projects to `null` rather
  than being passed through. Unreachable today, but a fail-open branch inside the one function
  whose purpose is "detail must never leave this file" would undermine it.

`detail` remains available to an operator in the gitignored status file on the box.

⚠️ **Related, and deliberately NOT fixed here — it needs its own decision.** The `/api/health`
route's *own* catch branch (`{ok: false, error: err.message}`) can leak the same class of
absolute path if a lib throws. It is a repo-wide pattern with precedent elsewhere in the same
handler, so fixing it only here would be an inconsistent one-off. Logged in register §C14 ③.

### 11.4 Consequences for §10's checklist

§10 predates D6 and ruling (c). Two of its lines are now read as follows, and one item is
added:

- *"`/api/health` … reads `ok: true` with refusals present"* — still true, **but only until
  `GLOSSARY_REFUSAL_STALE_DAYS`**; past that the check is deliberately not-ok (D6).
- The plan's *"marks a `--book` run as filtered"* test is **superseded** by *"a `--book` run
  does not write the status file"* — and the shipped test goes further than the ruling
  required, asserting a filtered run does not **clobber** an existing file, since a
  presence-only assertion would pass even if the run truncated it.
- **Added:** `/api/health` exposes **no `detail`** for any book (§11.3).

### 11.5 The boundary in §8 is unchanged and is the most important line in this document

Shipping this does **not** make the export safe to switch back on. It makes switching it back
on *a decision with a visible outcome*. Adoption is still per book, still `[LEAD]`, and still
unmade; production still carries the uncommitted `#CONTAINED-2026-08-03#` edit.
