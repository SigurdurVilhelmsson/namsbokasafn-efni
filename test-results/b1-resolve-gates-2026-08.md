# B1 resolver acceptance gates 1/2/3/5 — measured on the real corpus, 2026-08-08

Evidence for the Part B1 resolver (`server/lib/conceptResolver.js`,
docs/superpowers/sdd/2026-08-08-terminology-concept-model-part-b1). Dated snapshot,
following the precedent of `test-results/concept-import-2026-08.md`: this is
**evidence, not status**. Re-measure rather than trusting these numbers later.

**How it was run.** Against the pre-built scratch DB `/tmp/claude-1000/b1-scratch.db`
(all 47 real migrations, then `run-concept-import.js` against the 20-collection raw
fetch at `~/idordabanki-raw-2026-08-07/`; 70,187 concepts / 192,189 terms, matching the
register exactly). Not rebuilt for this task. No production database or file under
`books/` was modified. `server/scripts/verify-resolve-gates.js` writes only into the
scratch DB's `registered_books` / `book_domain_priority` tables (expected and fine per
the brief).

---

## ⚠️ Two brief defects found

### Defect 1 (blocking) — `seedBooks` crashes on the very first book

The brief's `seedBooks` inserted with
`INSERT OR IGNORE INTO registered_books (slug, registered_by) VALUES (?, 'gate')`,
omitting `title_is`. The real `registered_books` schema (created by the 47 migrations,
not by the script's own `CREATE TABLE IF NOT EXISTS`, which is a no-op against this DB)
declares **`title_is TEXT NOT NULL`** with no default:

```
CREATE TABLE registered_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalogue_id INTEGER REFERENCES openstax_catalogue(id),
  slug TEXT UNIQUE NOT NULL,
  title_is TEXT NOT NULL,
  registered_by TEXT NOT NULL,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active', source_commit_hash TEXT, source_fetched_at DATETIME, source_repo TEXT,
  FOREIGN KEY (catalogue_id) REFERENCES openstax_catalogue(id)
)
```

SQLite's `OR IGNORE` conflict resolution **silently swallows a NOT NULL violation** —
no exception is thrown, and no row is inserted. Confirmed empirically in isolation
before touching the real script:

```
$ node -e "
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title_is TEXT NOT NULL, registered_by TEXT NOT NULL)');
try {
  db.prepare(\"INSERT OR IGNORE INTO t (slug, registered_by) VALUES ('foo', 'gate')\").run();
  console.log('no throw');
} catch (e) { console.log('threw:', e.message); }
console.log('rows:', db.prepare('SELECT * FROM t').all());
"
no throw
rows: []
```

The brief's next line, `const { id } = db.prepare('SELECT id ... WHERE slug = ?').get(slug)`,
then destructures `undefined`. Reproduced against a scratch copy of the real DB, running
the brief's `seedBooks` code **exactly as written**:

```
$ node -e "
const Database = require('better-sqlite3');
const { BOOK_DOMAIN_PRIORITY } = require('./lib/domains');
const db = new Database('/tmp/b1-defect-repro/repro.db');
db.exec(\`CREATE TABLE IF NOT EXISTS registered_books (...)\`);
const insBook = db.prepare(\"INSERT OR IGNORE INTO registered_books (slug, registered_by) VALUES (?, 'gate')\");
const insPrio = db.prepare('INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, ?)');
for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
  console.log('registering', slug);
  insBook.run(slug);
  const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  console.log('  row:', row);
  const { id } = row;
  domains.forEach((d, i) => insPrio.run(id, d, i + 1));
}
"
registering efnafraedi-2e
  row: undefined
[eval]:19
  const { id } = row;
          ^
TypeError: Cannot destructure property 'id' of 'row' as it is undefined.
```

`efnafraedi-2e` is the **first** key `Object.entries(BOOK_DOMAIN_PRIORITY)` yields in
`server/lib/domains.js`, and it is the book Gates 1 and 2 both depend on entirely. Only
2 of the 6 books (`lifraen-efnafraedi`, `edlisfraedi-2e`) are pre-registered by
`run-concept-import.js`'s own §C35 seed — so this is not an edge case, it kills the
script before Gate 1 ever runs, on a completely fresh scratch DB built exactly as the
brief's prerequisite instructs.

**Fix applied** (in `server/scripts/verify-resolve-gates.js`, committed): supply
`title_is` in the insert, using the slug itself as the value — this is a synthetic gate
registration and `registered_by = 'gate'` already marks it as such, so a real Icelandic
title would be *more* misleading, not more correct, than the slug.

### Defect 2 (minor, cosmetic) — Gate 2's printed method label contradicts its own code

The brief's Gate 2 log line said `strings from books/efnafraedi-2e/01-source`, but
`collectSourceEnglish()` — in the very same brief — reads `books/<slug>/02-for-mt`
(the extracted EN segments), never `01-source` (raw CNXML). Left as specified, the
script would have printed a method claim contradicted by its own implementation, in a
script whose sole purpose is precise measurement. Fixed the printed label to say
`02-for-mt`, matching the actual code; the extraction logic itself is unchanged from
the brief.

> ⚠️ **RE-CLASSIFIED 2026-08-08 (review finding 7): this was not a brief defect, it was a
> SPEC DEVIATION, and calling it "cosmetic" filed it under the wrong heading.** Spec §8.2
> mandates `01-source`. The brief's code read `02-for-mt` and its label said `01-source`;
> changing the **label** made the script self-consistent while moving it *further* from the
> spec, and recorded a deviation as a correction. The deviation is now ruled on and recorded
> in the spec itself: **`02-for-mt` is kept deliberately**, because it holds the extracted EN
> segments the resolver will actually run over, whereas `01-source` is raw CNXML (149 `.cnxml`
> against 249 `.md`). Script and spec agree again — but the right fix was to amend the spec,
> not to relabel the script and move on.

### Defect 3 (found during Step 3's spot-check, informational, zero impact)

Step 3 asks to confirm no marker debris survives, spot-checking for `SEG`, `xref`,
`docref`, `abstract`. It does **not** come back clean:

```
marker debris: [ 'SEG' ]
```

Traced to source: 49 of the 249 `.md` files under `books/efnafraedi-2e/02-for-mt` use a
**legacy `{{SEG:...}}` curly-brace marker form** instead of the current
`<!-- SEG:... -->` HTML-comment form the brief's regex (`/<!--[\s\S]*?-->/g`) targets —
3,567 occurrences across those 49 files, e.g.
`books/efnafraedi-2e/02-for-mt/appendices/m68865-segments(b).en.md`:
`{{SEG:m68865:entry:auto-1435}}`. This is a fourth trap the brief's docstring doesn't
list. **Measured impact: zero.** `SEG` collapses to one spurious distinct string out of
80,037 considered (Set semantics), and it matches no `concept_term` row:

```
$ node -e "... SELECT * FROM concept_term WHERE lang='en' AND text='SEG' ..."
concept_term rows matching literal SEG: []
```

So it changes none of Gate 2's outright/nominal/real counts. Left unfixed in the
script — fixing the regex to also cover `{{SEG:...}}` wouldn't move the register's
target numbers and risks scope creep on a script the brief itself calls "a
reconstruction, not a replay." Recorded here as a finding for whoever next revisits
Gate 2's extraction method.

---

## Exact commands and verbatim output

### Step 2 — full gate run

```
$ node server/scripts/verify-resolve-gates.js --db /tmp/claude-1000/b1-scratch.db
── Gate 1: chemistry fallback ──
  pH               biology @3 -> sýrustig
  bond             physics @2 -> tengi
  carbon dioxide   biology @3 -> koltvíoxíð
  nitrogen         physics @2 -> nitur

── Gate 2: tie census (efnafraedi-2e) ──
  method: strings from books/efnafraedi-2e/02-for-mt, exact binary match
  files read: 249
  strings considered: 80037
  outright 1398 · nominal 67 · real 176
  register recorded: outright 2001 · nominal 126 · real 310

── Gate 3: scoped corpus size ──
  liffraedi-2e       47568 distinct English terms
  efnafraedi-2e      19749 distinct English terms
  register recorded: liffraedi-2e 47568 · efnafraedi-2e 19749

── Gate 5: term-less candidates ──
  concepts with an EN term and NO IS term: 0
  -> the §6 filter is a LATENT-case pin. Say so in the spec.

── Controls ──
  unregistered -> unregistered · registered-no-priorities -> no-priorities
  a genuine miss -> winner null · unscoped false

ALL GATES REPORTED. Record the numbers in test-results/.
$ echo $?
0
```

Re-ran the whole script a second time against the same (now-seeded) scratch DB to
confirm idempotency — `diff` of the two runs' full output was empty (identical),
exit 0 both times.

### Step 3 — file-count check and marker-debris spot-check

```
$ find books/efnafraedi-2e/02-for-mt -name '*.md' | wc -l
249
$ find books/efnafraedi-2e/02-for-mt -name '*.md.backup.*' | wc -l
3092
```

The script's own `files read: 249` matches the first number exactly, not the sum
(3341) — the `.md.backup.<timestamp>` files were correctly excluded.

Marker-debris spot-check (temporary, then removed):

```
$ node -e "... [...words].filter(w => /^(SEG|xref|docref|abstract)/.test(w)) ..."
marker debris: [ 'SEG' ]
```

Not empty — see Defect 3 above. `xref`, `docref`, `abstract` did **not** leak (the
brief's traps 2/3 hold for the HTML-comment and `[[type:...]]` forms); only the
legacy `{{SEG:...}}` form leaked, with zero effect on the resolved counts.

### Step 4 — swallowed-flag control

```
$ node server/scripts/verify-resolve-gates.js --db --help
error: --db needs a path as the next argument
$ echo $?
2
$ ls -- --help
ls: cannot access '--help': No such file or directory
```

Matches the brief's expectation exactly: the `--db` value is never swallowed from the
next flag, and no file named `--help` was created.

### Formatting / lint

```
$ npx prettier --check server/scripts/verify-resolve-gates.js
[warn] Code style issues found (brief's inline snippet not Prettier-wrapped)
$ npx prettier --write server/scripts/verify-resolve-gates.js
$ npx prettier --check server/scripts/verify-resolve-gates.js
All matched files use Prettier code style!
$ npx eslint server/scripts/verify-resolve-gates.js
(no output, exit 0)
```

Re-ran the full gate script after the Prettier rewrite — identical output, exit 0
(purely re-wrapping, no semantic change, consistent with every prior task's finding
about the brief's inline snippets).

---

## Per-gate assessment

### Gate 1 — chemistry fallback: **PASS on the property — but the gate could not see it, and the spec predicted one term wrong**

All four named terms (`pH`, `bond`, `carbon dioxide`, `nitrogen`) resolve with a
winner. `pH` and `carbon dioxide` resolve via `biology @3`; `bond` and `nitrogen`
resolve via `physics @2` — none via `chemistry @1`, i.e. all four are genuinely
fallback cases, consistent with `domains.js`'s own comment that these four are exactly
what the fallback is for (chemistry's strict scope discards 19,057 of 19,766
production translations; these four are among the discarded set the fallback
recovers).

> ⚠️ **This heading used to read "PASS, matches expectation". Two corrections, 2026-08-08.**
>
> **(a) The gate could not detect loss of the property it is named for.** It asserted only
> `if (!r.winner)`. Inserting a `chemistry`-domain concept answering `pH` printed
> `pH  chemistry @1 -> …` — the fallback destroyed — and the gate still **exited 0**. That
> is naming trap #7 on this branch: a gate called "chemistry **fallback**" that stays green
> with the fallback gone. It now asserts the `(domain, position)` **pair** spec §8.1
> requires. Verified red: the same mutation now produces
> `gate1: 'pH' resolved via chemistry @1, expected biology @3 — THE FALLBACK IS GONE`,
> exit 1.
>
> **(b) The spec's specific prediction is wrong for `bond`, and "matches expectation" hid
> it.** Spec §8.1 predicts `pH`, `bond` and `carbon dioxide` all resolve via **`biology`**.
> Measured, `bond` resolves via **`physics @2`**. The *fallback* claim survives untouched —
> physics @2 is still past chemistry @1, which is the property that unblocks chemistry —
> but the prediction is not what happened, and recording it as "matches expectation" made a
> spec error look like a confirmation.

### Gate 2 — tie census: **CLOSED 2026-08-08. The divergence was OUR extractor, and the register reproduces to within ~1%**

> ⚠️ **This section replaces an earlier one that recorded the divergence as an open
> finding with an unconfirmed cause.** The conclusion it reached — *methodology
> difference, not a resolver bug* — was right. Its stated reason was wrong, and the
> divergence was closeable rather than merely explainable. Superseded text is preserved
> in git history (commit `63a9ae09`); the numbers it recorded are all restated below, so
> nothing is lost by not reading it.

**First measurement: outright 1,398 · nominal 67 · real 176** (80,037 candidate strings,
249 files). Against §C36's **2,001 / 126 / 310** that is a 30–46% shortfall per bucket.

**The mechanism, found by the Task 9 review.** `collectSourceEnglish` harvested with a
single regex, `/[A-Za-z][A-Za-z-]+(?: [a-z]+)?/g`, whose two-word alternative matches
**non-overlappingly**. Whether a bigram is ever seen therefore depends on its byte offset:

```
"The carbon dioxide molecule is stable."  ->  'The carbon', 'dioxide molecule'   ← term LOST
"a carbon dioxide molecule"               ->  'carbon dioxide', 'molecule'       ← term seen
```

and consuming the following word into a bigram **also prevents that word being emitted as
a unigram at all**. The net was not merely noisy — it was **destructive**.

**Primary evidence, needing no reference to the register.** Unigrams alone score *higher*
than the shipped bigram version:

| Arm | Strings | outright · nominal · real | Total |
|---|---|---|---|
| A — as shipped (offset-locked bigrams) | 80,037 | 1,398 · 67 · 176 | 1,641 |
| C — unigrams only, bigram layer deleted | 22,100 | 1,558 · 90 · 285 | 1,933 |

**Deleting the bigram layer beat shipping it.** That establishes lossiness on its own.

**Corroboration — one variable changed** (overlapping adjacent pairs; same token grammar,
same files, same resolver, same DB):

| Arm | Strings | outright · nominal · real |
|---|---|---|
| B — reviewer's overlapping extractor | 163,474 | 2,008 · 120 · 300 |
| **D — the shipped fix (this script, now)** | **118,749** | **1,999 · 120 · 299** |
| §C36 recorded | — | 2,001 · 126 · 310 |

Arm D is within **0.1% / 4.8% / 3.5%** of the register, against a 30–46% shortfall before.
Arms B and D are *independent implementations* — they differ on what counts as adjacency
(D requires exactly one space in the source, which is why its N is 27% smaller) — and they
land within 9 resolutions of each other. Two different nets converging on the same census
is a stronger signal than either alone.

**Two guards on the claim, both worth keeping:**
- This shows §C36's figure **reproduces to within ~1% under a single-variable correction**.
  It does **not** show §C36 used overlapping bigrams; its method remains unrecorded.
- CLAUDE.md warns that two agreeing numbers can be an artifact of a shared limit. Not
  applicable: outright, nominal and real are three *independent* counts produced by three
  different branches of `resolveCandidates`, and all three converge simultaneously. A
  clipping limit does not do that.

**Why the original stated cause was backwards.** It hypothesised that §C36 used a
*narrower, pre-filtered* set, reasoning that a smaller candidate set could yield more
matches. The measured cause is the opposite: **our net was lossy**, not theirs narrow. The
retention asymmetry the first pass never computed cuts against the subset hypothesis too —
outright retained 70% (1,398/2,001), nominal 53% (67/126), real 57% (176/310); a subset
would shrink the buckets roughly proportionally, and these do not. This is the branch's
**right-conclusion / wrong-stated-reason** pattern, 4th instance.

**Correction to a second figure.** The first pass reported that "only ~2.1% (1,641) match
any concept term at all" and that the remaining ~78,396 "were never going to resolve".
1,641 is the count that **resolved**, which is not the same thing: **2,309 strings (2.88%)
match at least one `lang='en'` concept term**. The 668-string gap is exactly the **D1
out-of-scope population**, confirmed positively rather than by elimination (668 of 668 have
a non-empty `outOfScope`). The script now reports that population as its own line — under
the corrected extractor it is **1,168** — because D1 makes `outOfScope` a first-class part
of `Resolution`, and a census that never printed it was hiding the very tier D1 exists for.

#### Control: the census is RANK-SENSITIVE (spec §8 Controls)

Spec §8 requires the census be re-run "with `rank` collapsed, and the numbers **must
change**." **That control is void on this corpus, and running it naively produces a false
accusation.** `conceptFromEntry.js:74-76` assigns rank in array order and
`import-concepts.js:108` inserts in that order, so autoincrement `id` rises in lockstep
with `rank` and `ORDER BY rank ASC, id ASC` is identical to `ORDER BY id ASC`. Measured: of
**17,356** concepts with 2+ Icelandic terms, collapsing rank moves the head form in **0**.

The control is therefore run in the form that *can* move the head form — **reversing** rank
within each concept — and it does:

```
              outright 1999 · nominal 120 · real 299
CONTROL:      outright 1999 · nominal 113 · real 306      (nominal −7, real +7)
```

It runs inside a transaction that is always rolled back, so the scratch DB stays
idempotent: after two consecutive full runs the data is unchanged (row counts, a
`SUM(rank*id)` signature over Icelandic terms, and a text-length signature all identical)
and the two runs' stdout is byte-identical. ⚠️ **Do not measure that with `md5sum` on the
`.db` file** — a rolled-back transaction still bumps SQLite's header change counter, so the
file bytes differ while the data does not.

### Gate 3 — scope sizes: **EXACT MATCH**

```
liffraedi-2e       47568 distinct English terms   (register: 47568)
efnafraedi-2e      19749 distinct English terms   (register: 19749)
```

Both numbers match the register exactly. This gate queries the scratch DB directly (no
file-corpus reconstruction involved), so an exact match here is expected and is a
meaningful corroboration that the scratch DB's import and this task's `seedBooks`
seeding reproduce the same registered scope the register's number was measured
against.

> ⚠️ **The "✅ EXACT MATCH" above was, until 2026-08-08, a human reading two adjacent
> lines.** The gate printed its measurement and, on the very next line, a hardcoded
> `register recorded:` target — and **never compared them**. Demonstrated by deleting the
> `anatomy-physiology` domain's English terms: `liffraedi-2e` collapsed by a third,
> printed directly above the number it missed, and the script **exited 0**. It now compares
> against the recorded constants and fails on mismatch; verified red at
> `gate3: liffraedi-2e measured 15878, register recorded 47568`, exit 1.
>
> Gate 5 deliberately does **not** get the same treatment: spec §8.5 frames it as a
> measurement with "two outcomes, both useful", so it has no target to miss. Gate 3 named
> an explicit target, which is what made not comparing a defect rather than a design choice.

### Gate 5 — term-less-candidate population: **0 — the §6 filter is a LATENT-case pin**

```
concepts with an EN term and NO IS term: 0
```

Per the brief's own interpretation: since this is 0, the `if (!term) continue;` filter
in `resolveCandidates` (pinned by Task 8's mutation control, see below) is a
**deliberate latent-case pin** against the current corpus, not a live filter shaping
any of the numbers above. Gates 1 and 2's counts are therefore independent of this
filter on the current data — but the filter still matters: it is what keeps a future
corpus update (or an editorial merge that empties a concept's Icelandic terms) from
silently promoting a term-less candidate to a false winner.

### Controls: **PASS**

```
unregistered -> unregistered · registered-no-priorities -> no-priorities
a genuine miss -> winner null · unscoped false
```

The two unscoped causes are distinguishable (`unregistered` vs `no-priorities`, per
`buildScope`'s D3 design), and a genuine lookup miss reports `unscoped: false` (not
conflated with an unscoped-book condition). Both control assertions in the script
passed (script exit 0, no entries in its internal `failures` array).

---

## Mutation-control results (from Task 8, `task-8-report.md` Step 3)

Reproduced here per the brief's Step 5 instruction. All four controls, run against a
scratch dotfile copy of `server/lib/conceptResolver.js` (never the tracked file, byte-
diffed clean after every restore):

| Guard | Mutation | Result |
|---|---|---|
| **RANK** | `headForm` returns `isTerms[isTerms.length - 1]` instead of `isTerms[0]` | Reddened exactly `RANK matters: swapping rank 1 and 2 changes the resolved term` (1/6 failed), nothing else |
| **THE TERM-LESS FILTER** | Deleted `if (!term) continue;` | Reddened exactly `THE TERM-LESS FILTER matters: removing chemistry's term moves the winner to biology` (1/6 failed, via a thrown `TypeError` reading `null.termId`), nothing else |
| **THE TIE TEXT COMPARISON** | `texts.size === 1` → `texts.size >= 1` | Reddened exactly `THE TIE TEXT COMPARISON matters: changing one character flips nominal to real` (1/6 failed), nothing else |
| **CANDIDATE ORDER** (sort) | Deleted `.sort((a, b) => a.conceptId - b.conceptId)` from `atBest` | Reddened exactly `the nominal-tie winner is DETERMINISTIC — lowest conceptId, never row order` in `conceptResolverResolve.test.js` (1/23 failed), nothing else. A follow-up fix round (commit `fdd32e9e`) also strengthened `CANDIDATE ORDER does NOT matter` in the mutation file itself, which the original whole-branch review found never reached a tie (and therefore never reached the sort) — before/after verification against the same sort-deleted mutant showed the old test shape stayed green and the fixed shape reddened correctly |

All four guards reddened exactly their named test and nothing else; no control was
found unobserved. Full detail, verbatim vitest output and the fix-round evidence are
in `task-8-report.md`.

---

## Reproducibility — gates 1/2/3/5 re-measured on an INDEPENDENTLY REBUILT corpus

**2026-08-08, after a console crash destroyed the original scratch DB.** The corpus was
rebuilt from scratch — real migrations, then a replay of `~/idordabanki-raw-2026-08-07/`
— and verified against all four recorded shape numbers *before* being used: **70,187
concepts · 192,189 terms · `registered_books` 2 rows · `book_domain_priority` 8 rows**
(edlisfraedi-2e 5 + lifraen-efnafraedi 3).

`verify-resolve-gates.js` then reproduced **every gate number exactly** — 1,398/67/176,
47,568/19,749, 0 term-less, all four Gate 1 fallbacks, exit 0.

This was not planned; the crash bought it. It matters for **Gate 2**: the divergence from
the register's 2,001/126/310 survived a full corpus rebuild unchanged, so it was never
non-determinism in the import or the resolver.

⚠️ **Narrowed 2026-08-08 — this paragraph originally added "that is positive evidence for
the methodology diagnosis", and it is not.** Ruling out non-determinism says nothing about
*which* methodology differed, and the cause first recorded turned out to be backwards (see
Gate 2 below: our extractor was lossy, not the register's set narrow). What the
reproduction establishes is exactly one thing — the census is deterministic across a full
corpus rebuild — which is what made the single-variable extractor comparison meaningful
when it was run.

---

## Gate 4 — performance

**Machine (state it, per the brief): a DEV BOX, not production.** 12th Gen Intel Core
i5-1245U, 12 cores, 15 GiB RAM, WSL2 kernel 6.18.33.2, Node v22.22.2, better-sqlite3
13.0.2. **The production Linode is smaller — treat every number here as a floor.**

### ⚠️ The first measurement found a spec deviation, so there are two

Measured as originally written, `lookupCandidates` re-prepared its statements on **every
call**. Spec §5 says the opposite, in as many words: *"In B1 it is a prepared statement
held on the scope."* The first bench made the cost visible rather than theoretical — and
would have handed B4 a budget derived from code the spec says should not exist. Fixed in
Task 11; both measurements are recorded, because the before is the evidence for the fix.

**Before (commit `63a9ae09`, statements prepared per call):**

```
liffraedi-2e: 47568 distinct scoped English terms
  buildScope: 0.5 ms
  cold: 6609.9 ms for 47568 resolves (0.139 ms each), 44861 winners, rss 816.7 MB
  warm: 9743.9 ms for 47568 resolves (0.205 ms each), 44861 winners, rss 1511.8 MB
  single resolve: 0.400 ms
  rss delta: 1462.0 MB
efnafraedi-2e: 19749 distinct scoped English terms
  buildScope: 0.7 ms
  cold: 4861.9 ms for 19749 resolves (0.246 ms each), 18398 winners, rss 404.9 MB
  warm: 3857.4 ms for 19749 resolves (0.195 ms each), 18398 winners, rss 693.2 MB
  single resolve: 0.323 ms
  rss delta: 643.4 MB
```

⚠️ **Read the pathology, not just the averages: the WARM run is SLOWER than the cold one
on the larger book** (9,743.9 ms against 6,609.9 ms) while RSS nearly doubles. A second
pass over identical data getting slower is GC pressure, not measurement noise.

**Cause, isolated by measurement rather than inferred.** `db.prepare` was wrapped with a
memoiser so `conceptResolver.js` ran byte-identical in both arms and the only variable was
prepare-once vs prepare-per-call:

| Book | Arm | Prepares | Time | Per resolve | RSS delta |
|---|---|---|---|---|---|
| liffraedi-2e | as shipped | 190,275 | 14,432.7 ms | 0.303 ms | 762.8 MB |
| liffraedi-2e | memoised | **7** | 3,400.8 ms | 0.071 ms | **35.2 MB** |
| efnafraedi-2e | as shipped | 78,999 | 5,119.0 ms | 0.259 ms | 354.7 MB |
| efnafraedi-2e | memoised | **7** | 1,984.5 ms | 0.100 ms | **29.7 MB** |

**Control: winner counts were identical in both arms** (44,861 and 18,398) — the change is
to cost, not behaviour.

**After (Task 11, statements hoisted onto the scope):**

```
$ node server/scripts/bench-resolve.js --db /tmp/claude-1000/b1-bench.db --book liffraedi-2e
liffraedi-2e: 47568 distinct scoped English terms
  buildScope: 0.7 ms
  cold: 2101.4 ms for 47568 resolves (0.044 ms each), 44861 winners, rss 83.8 MB
  warm: 2353.5 ms for 47568 resolves (0.049 ms each), 44861 winners, rss 86.8 MB
  single resolve: 0.072 ms
  rss delta: 37.2 MB

$ node server/scripts/bench-resolve.js --db /tmp/claude-1000/b1-bench.db --book efnafraedi-2e
efnafraedi-2e: 19749 distinct scoped English terms
  buildScope: 0.9 ms
  cold: 1194.3 ms for 19749 resolves (0.060 ms each), 18398 winners, rss 78.7 MB
  warm: 1139.1 ms for 19749 resolves (0.058 ms each), 18398 winners, rss 78.7 MB
  single resolve: 0.077 ms
  rss delta: 28.6 MB
```

**3.2× faster and 39× less resident memory on the larger book**, with cold and warm now
within 12% of each other and RSS flat across runs — the GC pathology is gone. Winner
counts unchanged (44,861 / 18,398), and gates 1/2/3/5 re-run after the fix produced
byte-identical numbers.

### The number B4 must budget against

**0.044 ms per resolve, and ~84 MB resident, for `liffraedi-2e`'s 47,568 terms — a
2.1-second full-book pass on this dev box.** Use the larger book; `efnafraedi-2e` is 2.4×
smaller and flatters the figure.

Three cautions on using it:
1. **This is a dev box.** The production Linode is smaller and shared. Budget with headroom.
2. **~84 MB resident is a real cost on a small Linode**, and it sits alongside C24's
   automaton (~85 MB) rather than replacing it. Time-only budgeting is half-measured.
3. **B1 asserts no threshold, deliberately.** A number invented before it was measured is
   not a budget. This section publishes the measurement; B4 sets the budget from it.

---

## Verbatim output after the review fix wave (2026-08-08)

Run on a pristine copy of the independently rebuilt corpus:

```
$ node server/scripts/verify-resolve-gates.js --db /tmp/claude-1000/b1-final.db
── Gate 1: chemistry fallback ──
  pH               biology @3 -> sýrustig
  bond             physics @2 -> tengi
  carbon dioxide   biology @3 -> koltvíoxíð
  nitrogen         physics @2 -> nitur

── Gate 2: tie census (efnafraedi-2e) ──
  method: strings from books/efnafraedi-2e/02-for-mt, exact binary match
          overlapping bigrams (see collectSourceEnglish trap 4)
  files read: 249
  strings considered: 118749
  outright 1999 · nominal 120 · real 299
  out-of-scope only (D1, resolves to nothing in THIS book): 1168
  register recorded: outright 2001 · nominal 126 · real 310
  CONTROL, rank reversed: outright 1999 · nominal 113 · real 306

── Gate 3: scoped corpus size ──
  liffraedi-2e       47568 distinct English terms (register: 47568)
  efnafraedi-2e      19749 distinct English terms (register: 19749)

── Gate 5: term-less candidates ──
  concepts with an EN term and NO IS term: 0
  -> the §6 filter is a LATENT-case pin. Say so in the spec.

── Controls ──
  unregistered -> unregistered · registered-no-priorities -> no-priorities
  a genuine miss -> winner null · unscoped false

ALL GATES REPORTED. Record the numbers in test-results/.
EXIT=0
```

### Every gate that now asserts was shown able to FAIL

An assertion never seen red is an untested assertion. Both new ones were forced, on scratch
database copies (the tracked script was never mutated):

| Forced condition | Result |
|---|---|
| Insert a `chemistry @1` concept answering `pH` (destroys the fallback) | `gate1: 'pH' resolved via chemistry @1, expected biology @3 — THE FALLBACK IS GONE`, **exit 1** |
| Delete the `anatomy-physiology` domain's English terms | `gate3: liffraedi-2e measured 15878, register recorded 47568`, **exit 1** |
| Rank-reversal control (does the census depend on rank at all?) | numbers move: nominal −7, real +7 — the census **is** rank-sensitive |

**Idempotency re-verified after adding the rank control**, and measured on the right
property: two consecutive full runs leave row counts, a `SUM(rank*id)` signature over
Icelandic terms and a text-length signature all identical, with byte-identical stdout.
⚠️ `md5sum` on the `.db` file is the WRONG instrument here — a rolled-back transaction
still bumps SQLite's header change counter, so the file differs while the data does not.

---

## Summary

| Gate | Result |
|---|---|
| 1 — chemistry fallback | ✅ PASS — all four resolve via a fallback domain. Gate now asserts the (domain, position) pair; spec §8.1's `bond → biology` prediction is wrong (measured `physics @2`) |
| 2 — tie census | ✅ **CLOSED** — 1,999/120/299 against the register's 2,001/126/310 (~1%). The 1,398/67/176 shortfall was our own non-overlapping-bigram extractor, now fixed |
| 2 — control | ✅ Census is rank-SENSITIVE (reversal moves it: nominal −7, real +7). The spec's *collapse* form is void on this corpus — rank rises in lockstep with autoincrement id |
| 3 — scope sizes | ✅ EXACT MATCH (47,568 / 19,749), and the gate now actually compares against those constants |
| 4 — performance | ✅ MEASURED, no threshold asserted — 0.044 ms/resolve, ~84 MB RSS (dev box). Found and fixed a spec §5 deviation on the way: 3.2× faster, 39× less memory |
| 5 — term-less candidates | ✅ 0 — confirms the §6 filter is currently a latent-case pin |
| Reproducibility | ✅ All of 1/2/3/5 reproduced exactly on an independently rebuilt corpus |
| Controls | ✅ PASS — unscoped causes distinguishable, a miss ≠ unscoped |
| Mutation controls (Task 8) | ✅ All 4 reddened exactly their named test |

Script exit code: **0**. What that now covers, after the review fix wave — the list matters,
because the earlier version of this line described a script with far less discriminating
power than the sentence implied:

- **Gate 1** — each term's `(domain, position)` pair, so destroying the fallback exits 1
- **Gate 2** — the rank-sensitivity control (the census must depend on rank at all)
- **Gate 3** — measured scope sizes against the register's constants
- **Controls** — the two unscoped causes stay distinguishable; a genuine miss is not unscoped

Still **reported rather than asserted**, deliberately: Gate 2's census counts (the register's
figure is evidence, not a constant to gate on), Gate 4's latency and RSS (B4 sets the budget
from the measurement, not before it), and Gate 5's population (spec §8.5 frames it as a
measurement with two useful outcomes, so it has no target to miss).
