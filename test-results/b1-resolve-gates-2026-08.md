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

### Gate 1 — chemistry fallback: **PASS, matches expectation**

All four named terms (`pH`, `bond`, `carbon dioxide`, `nitrogen`) resolve with a
winner. `pH` and `carbon dioxide` resolve via `biology @3`; `bond` and `nitrogen`
resolve via `physics @2` — none via `chemistry @1`, i.e. all four are genuinely
fallback cases, consistent with `domains.js`'s own comment that these four are exactly
what the fallback is for (chemistry's strict scope discards 19,057 of 19,766
production translations; these four are among the discarded set the fallback
recovers).

### Gate 2 — tie census: **DOES NOT MATCH the register's 2,001/126/310 — methodology difference, not a resolver bug**

Measured: **outright 1,398 · nominal 67 · real 176** (of 80,037 candidate strings
considered, 249 files read). The register's number (§C36: 2,001/126/310, summing to
2,437 positive outcomes) was never recorded with its extraction method, so this run is
a reconstruction, not a replay, exactly as the brief warned.

**Most likely explanation:** the two runs considered different *sets* of candidate
strings. This run's `collectSourceEnglish` harvests every regex-matched
word/word-pair from cleaned `02-for-mt` text — a broad, noisy net (80,037 distinct
strings) of which only ~2.1% (1,641) match any concept term at all; the remaining
~78,396 are ordinary prose (articles, connectives, non-terminology words) that were
never going to resolve. If §C36's original method instead iterated over a narrower,
already-terminology-filtered set (e.g. strings already known to be glossary/dictionary
candidates, or output of `filterGlossaryForText`) rather than a raw regex sweep, a
*smaller* candidate set could plausibly produce *more* matches, exactly the pattern
seen here (2,437 matches from an unknown-but-presumably-smaller N vs. 1,641 matches
from this run's 80,037). This is offered as the likeliest cause, not a confirmed one —
per the task instructions, **neither number was edited**; both are recorded here as a
finding to investigate, not resolved.

The *proportions* are roughly consistent regardless of method: nominal ties are the
smallest bucket and real ties are ~2.5–3× nominal ties in both this run (67 vs 176,
ratio 2.6) and the register (126 vs 310, ratio 2.5) — mild circumstantial support that
the resolver's tie-detection logic itself is not the source of the discrepancy, only
the input set is.

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

## Summary

| Gate | Result |
|---|---|
| 1 — chemistry fallback | ✅ PASS — all four terms resolve |
| 2 — tie census | ⚠️ DIFFERS from register (1,398/67/176 vs 2,001/126/310) — methodology difference, flagged as a finding, not corrected |
| 3 — scope sizes | ✅ EXACT MATCH (47,568 / 19,749) |
| 5 — term-less candidates | ✅ 0 — confirms the §6 filter is currently a latent-case pin |
| Controls | ✅ PASS — unscoped causes distinguishable, a miss ≠ unscoped |
| Mutation controls (Task 8) | ✅ All 4 reddened exactly their named test |

Script exit code: **0** (all in-script assertions — Gate 1's resolution requirement and
the two controls — passed; Gate 2's divergence from the register does not fail the
script, by design, since the brief treats it as a finding to record, not a pass/fail
condition).
