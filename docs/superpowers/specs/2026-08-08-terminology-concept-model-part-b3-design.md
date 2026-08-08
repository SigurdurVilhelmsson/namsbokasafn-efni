# §C36 Part B3 — the glossary export cut-over

**Written 2026-08-08.** Design record for one item, owned by register
`docs/plans/2026-07-21-post-item17-followup-campaign.md` §C36. Per CLAUDE.md § *One source of
truth*: **this document is evidence, never status.** If it ever disagrees with the register,
the register wins. Freeze it when B3 merges; corrections go in the register, not here.

Parent spec: [`2026-08-07-terminology-concept-model-design.md`](2026-08-07-terminology-concept-model-design.md)
(**frozen — not edited**). Sibling: [`2026-08-08-terminology-concept-model-part-b1-design.md`](2026-08-08-terminology-concept-model-part-b1-design.md).

---

## 1. What this is, and what it deliberately is not

Parent spec §7.3, in full:

> `exportBookGlossary` emits one entry per resolved English string, with the concept's other
> terms as `alternatives`. This is the change that makes adoption non-destructive: the export
> stops being a subject-filtered dump and becomes a resolved view.

B3 builds exactly that. B1 shipped `resolve()` and nothing calls it; B2 populated production
and nothing reads it. **B3 is the first slice with a consumer** — and therefore the first that
could change reader-visible output. It is scoped so that it does not.

### What B3 changes

The payload `runGlossaryExport` writes. Nothing else. The gates (producer · shrink ·
absent-baseline), the status file, `since` carry-forward, `/api/health`, and the 2-hourly cron
are untouched, because none of them was ever coupled to where the payload came from.

### Non-goals

- **Do not adopt any book.** B3 changes what the export *would* write. Every book keeps
  refusing until a human runs `--adopt --book <slug>`. Chemistry becomes **unblocked**, not
  adopted. (Lead decision, 2026-08-08 — §2 D6 below.)
- **Do not touch `terminologyService.js`.** B1's non-goal, unchanged and for the same reason:
  it is past 2,000 lines, and burying the seam is what B3/B4 cannot afford.
  `exportBookGlossary` becomes dead code at the default flip; **Part C deletes it with the
  tables it reads.** Leaving it in place also keeps the old implementation available as a
  comparison oracle for the adoption decision, which is evidence B3 cannot generate any other
  way.
- **Do not change `buildGlossaryMap` or anything else under `tools/`.** The render path is
  reached, not edited. Widening B3 into published output is how a gated change becomes an
  ungated one.
- **Do not regenerate `c24-golden.json`.** Nothing the matcher uses moves. Its header's warning
  stands: re-capturing from HEAD "would certify the new implementation against itself and
  destroy the oracle."
- **Do not resolve any tie.** Parent spec §11 — the model makes choice expressible; editors
  make it.

### Prerequisite, and it is not a drive-by

**B0 deferred finding 5** — `server/scripts/export-terminology.js`'s `parseArgs` swallows the
next flag as a value. Measured in B0's own two parsers: `--db --allow-zero-yield` consumed the
flag as a path and created a 0-byte SQLite file **named after the flag**. It is in the export,
which B1 did not touch, so it is B3's precondition.

**It lands as its own first commit with its own tests.** `export-terminology.js` is
cron-invoked on production; the parser that decides whether `--adopt` was passed is not a file
to fix in passing. `run-concept-import.js`'s `parseImportArgs` is the model to copy — it
returns an `error` string for anything unrecognised rather than silently dropping it, and its
`need()` helper refuses a value beginning with `--`.

---

## 2. Decisions taken (lead, 2026-08-08)

### D1 — The export is census-scoped, not scope-wide

The export emits an entry only for English strings that **actually appear in the book's
extracted source** (`books/<slug>/02-for-mt/**/*.md`).

Measured against the populated corpus on 2026-08-08 — the whole-scope alternative:

| book | priority chain | strings in scope |
|---|---|---|
| `efnafraedi-2e` | chemistry → physics → biology | 19,749 |
| `liffraedi-2e` | biology → anatomy-physiology → chemistry | 47,568 |
| `lifraen-efnafraedi` | chemistry → biology → physics | 19,749 |
| `edlisfraedi-2e` | physics → astronomy → mathematics → earth-science | 15,867 |

Chemistry's export emits **709** terms today. Whole-scope would be **28×** that.

**Why census.** A term the book never uses can help neither MT (which filters by chunk text
anyway, via `filterGlossaryForText`) nor the render path. It can only add substitution
surface. `02-for-mt` is the right source and not `01-source` — it holds the extracted EN
segments the glossary is actually filtered against, a ruling B1 already took and recorded as an
amendment to its §8.2.

⚠️ **A consequence to state rather than discover: biology's census is nearly empty.**
`git ls-files` counts **333** tracked `02-for-mt` files for `efnafraedi-2e` and **13** for
`liffraedi-2e` — most biology modules were never extracted (register, biology track). A
census-scoped biology export is therefore small, and that is **correct**: it reflects what
exists. Biology is deliberately unadopted, so nothing depends on it today. It must not be read
as a defect in B3 when someone measures it later.

⚠️ **The tokenisation is part of the method, not an implementation detail.** B1's first census
came in **30–46% low** (1,398/67/176 against 2,001/126/310) and was written up as a register
discrepancy before the cause was found: a **non-overlapping** two-word regex, which made a
term's visibility depend on its byte offset. The corrected extractor uses **overlapping
bigrams** and excludes the ~700 `<name>.md.backup.<timestamp>` files sitting beside the real
ones. Both traps are documented at `collectSourceEnglish`.

### D2 — Every resolved winner is stamped `approved`, and carries `reason`

`concept_term` has no status column. `buildGlossaryMap` (`tools/lib/math-label-substitute.js`)
drops every term where `status !== 'approved'`, and the survivors are substituted into
published CNXML by `cnxml-inject.js`'s `substituteMathLabels`. **An export that stops stamping
`approved` silently puts English into published math** (B0 precondition).

So: `status: "approved"` on every emitted term, plus `reason` — `'head-form'` |
`'book-preference'` | `'chapter-preference'` — carried alongside.

**This is not a widening.** The lead ruled on 2026-08-07 that preferring the Íðorðabankinn head
form is *the default, with a per-term override*; `reason: 'head-form'` is that ruling, made
legible. The alternative — `approved` only for editor-chosen terms — was rejected because
`book_concept_preference` holds **0 rows** today, so every book's glossary map would be empty
and every math label would fall back to English: the exact failure B0 warned about, shipped
deliberately.

⚠️ **`reason` is provenance; `status` is the selector.** Keeping them as separate fields is
§C18's lesson applied in advance — that entry exists because one column was read as both. The
render path asks one yes/no question and gets one field to ask it of; anything wanting to know
*how* a term was chosen reads `reason` and never infers it from `status`.

### D3 — A distinct producer stamp

`PRODUCER_RESOLVED = 'export-terminology-resolved'`, recognised by `detectProducer` in the same
short-circuit position as the existing stamp.

**Why it is needed.** B0 measured that the producer gate is blind to this reshape:
`detectProducer` checks `payload.producer === PRODUCER_EXPORT` **before** it ever looks at
`payload.terms`, and `exportBookGlossary` emits that stamp unconditionally. A book adopted
under the old shape would silently receive a completely different payload with no gate firing —
the failure class §C14 and §C21 exist to prevent, arriving through the door they left open.

**Fingerprints stay disjoint, and that is a design constraint on the payload:**

| producer | per-term fingerprint |
|---|---|
| `merge-glossary` | `category` + `chapter` |
| `export-terminology` (old) | `subjects` |
| `export-terminology-resolved` | **`domain`** |

The resolved term therefore carries **`domain` (singular)** and **never `subjects`**. An
unstamped resolved payload infers to `unknown`, which refuses — fail-closed, and consistent
with the hybrid rule already documented in `glossaryProducer.js`.

### D4 — Real ties are not emitted; nominal ties are

`resolve()` returns `winner: null` for a real tie (`antibiotic → fúkalyf`/`sýklalyf`). There is
nothing to substitute, so **no term entry is written**. It is counted in `stats.ties` and named
in the run log.

A **nominal** tie (D2 of the B1 spec — two concepts whose rank-1 head forms are the identical
string) emits normally, because nothing is being guessed, and is counted separately.

**The detailed tie list is deliberately NOT in the committed payload.** `sameTerms` compares
only `.terms`, so a tie list that changed while terms did not would never trigger a rewrite and
would rot in place. Ties are live data; B4's editor surface reads them from the DB.

### D5 — Out-of-scope concepts (D1 of the B1 spec) are not exported

The badged soft tier is an **editor** affordance — `isFallback`, the `cross-subject` class,
the segment-editor note. The export is the MT-and-render artifact. Recorded here as a decision
so B4 does not have to re-derive it, and so its absence is not read as an oversight.

### D6 — B3 ends at code and gates; adoption is separate

B3 proves what the export *would* write, per book, by dry-run against the real corpus. **No
committed glossary moves.** Every book keeps refusing. Chemistry's adoption — the reader-visible
step — is a subsequent, deliberate `--adopt --book efnafraedi-2e`.

This is the posture Part A, B0 and B1 all shipped in, and it keeps a reader-visible change out
of a PR whose correctness is argued from code.

### D7 — `glossaryCollisionBaseline` is RETIRED, not re-pointed — and it retires per book, at adoption

The collision baseline is **not** re-pointed at the tie population. Competition and ties are
different questions with different owners: a collision is *two Icelandic strings already
committed under one English key*, which the resolved format cannot represent; a tie is *two
concepts at one priority position*, which `resolve()` reports and B4's editor surface acts on.
Aiming an old fence at a new field would produce a test that looks like continuity and asserts
something nobody designed.

⚠️ **B0's note said this test "goes green-but-vacuous" under the resolved export. Measured
2026-08-08, that is true of ONE of its two `describe`s, and not yet.**

- `describe('diffAgainstBaseline semantics')` builds its own collision objects in-file and
  touches no committed glossary. **It is unaffected by B3 and by adoption, permanently.** It
  does not retire.
- `describe('committed glossaries have no competitions beyond their baseline')` sweeps
  `it.each(booksWithGlossaries)` over **committed files**. Its subject disappears **per book,
  at the moment that book adopts** — not at B3. At B3's merge all four committed payloads are
  still merge-glossary files carrying real collisions, so retiring anything then would delete
  live protection before the condition for retiring it exists.

**The retirement is therefore built in B3 and takes effect on its own**: the sweep skips any
payload whose `producer` is `export-terminology-resolved` — a format in which a collision is
unrepresentable — and keeps sweeping every book that has not adopted.

⚠️ **And the non-vacuity guard must be strengthened in the same change, or the retirement
becomes the bug.** Today's guard asserts only `booksWithGlossaries.length > 0`; once skipping
exists, every book could be skipped and that assertion would still pass. It must assert that
**at least one book was actually swept**, so a fully-adopted corpus fails loudly rather than
reporting green over an empty sweep. That is this test's own cited principle — *absence of a
baseline is not approval*, the C11(b) lesson — applied to the mechanism that retires it.

---

## 3. Architecture

```
books/<slug>/02-for-mt/**/*.md
        │  collectSourceEnglish(slug)          ← lifted from verify-resolve-gates.js
        ▼
  candidate EN strings ──► resolve(scope, english)      ← B1, unchanged
        │                    buildScope(db, slug, 0)
        ▼
  buildResolvedGlossary(db, slug) ──► payload ──► runGlossaryExport ──► glossary-unified.json
                                                  producer · shrink · absent
```

**Chapter 0, always.** `glossary-unified.json` is one file per book, so the scope is the book
default. `book_concept_preference` chapter rows exist and are simply not consulted here; a
chapter-scoped glossary is not a thing this artifact can express, and pretending otherwise
would silently pick one chapter's answers for the whole book.

---

## 4. Components

### `server/lib/sourceEnglish.js` — new

`collectSourceEnglish(slug)` lifted verbatim out of `server/scripts/verify-resolve-gates.js`,
which then imports it. **One owner for the tokenisation**, so the gates script and the export
cannot drift apart on the method — the specific way B1's census first went wrong.

Signature and behaviour unchanged; its two documented traps (the `.md.backup.*` files, the
overlapping-bigram requirement) move with it, including the measurement that made the
overlapping form correct.

### `server/lib/resolvedGlossary.js` — new

```js
/**
 * @param {Database} db      an open better-sqlite3 connection
 * @param {string}   bookSlug
 * @returns {{producer, generated, book, stats, terms: Array}}
 * @throws  when the book is unscoped, or its census is empty
 */
function buildResolvedGlossary(db, bookSlug)
```

All of B3's logic. Takes an open connection — it does **not** open one — so it is testable
against a scratch DB with no filesystem beyond `02-for-mt` and no cron.

⚠️ **`resolve(scope, english)` takes no `db`.** The scope carries its own connection and
prepared statements. B1's spec Interfaces block was amended to say so; its code snippets were
not. Do not reintroduce a `db` argument.

### `server/lib/glossaryProducer.js` — edit

Add `PRODUCER_RESOLVED`; recognise it in `detectProducer` before shape inference; export it.

### `server/scripts/export-terminology.js` — edit

`exportFn` default becomes the resolved builder; `parseArgs` fixed per the prerequisite; help
text updated.

⚠️ **The connection needs somewhere to come from, and today there is nowhere.** Verified on disk
2026-08-08: `export-terminology.js` opens **no** database — it never requires `better-sqlite3`,
never calls `resolveDbPath()`. Today's `exportFn` (`terminologyService.exportBookGlossary`)
reaches a **lazy module-level singleton** (`getDb()`), which is why the script appears not to
need one. `buildResolvedGlossary(db, slug)` takes an explicit connection, so B3 must introduce
the lifetime the script has never had.

**How:** `resolvedGlossary.js` also exports a factory —

```js
function createResolvedExportFn(dbPath = resolveDbPath()) // → (slug) => buildResolvedGlossary(db, slug)
```

— opening **one** connection and closing over it, and `runGlossaryExport`'s signature becomes
`exportFn = createResolvedExportFn()`. A default parameter is evaluated only when the argument
is `undefined`, so a test that injects its own `exportFn` **never opens a database** — the same
posture the lazy singleton gives today, without the singleton.

⚠️ Resolve the path with `resolveDbPath()`, never against `process.cwd()` (CLAUDE.md, durable).
The cron invokes this script from the repo root and `systemd` runs the server from `server/`;
a cwd-relative path is right in one and wrong in the other.

---

## 5. Payload shape

```json
{
  "producer": "export-terminology-resolved",
  "generated": "2026-08-08T21:00:00.000Z",
  "book": "efnafraedi-2e",
  "stats": {
    "total": 2119, "approved": 2119,
    "ties": 299, "nominalTies": 120, "outOfScopeOnly": 57,
    "censusStrings": 80037
  },
  "terms": [
    {
      "english": "pH",
      "icelandic": "sýrustig",
      "status": "approved",
      "reason": "head-form",
      "domain": "biology",
      "position": 3,
      "conceptId": 41902,
      "alternatives": ["pH-gildi"]
    }
  ]
}
```

`terms` is sorted by `english`. `alternatives` is the concept's other Icelandic terms in `rank`
order, excluding the winner. `stats.outOfScopeOnly` counts census strings that matched only
out-of-scope concepts — visible, per D5, without being exported.

⚠️ **The counts above are ILLUSTRATIVE and must not be quoted as expected values.** The real
ones come from the acceptance gate in §8. They are drawn from B1's reproduced chemistry census
(1,999 outright + 120 nominal + 299 real) purely so the block is *internally* consistent with
D4 — 1,999 + 120 = 2,119 emitted, the 299 real ties omitted. Whether the census run inside the
export reproduces those three numbers is a question §8 answers by measuring, not one this block
settles by asserting.

---

## 6. Error handling — two states that must not look like success

**Unscoped book.** `buildScope` returns `{unscoped:'unregistered'}` (no `registered_books` row;
remedy is the admin route) or `{unscoped:'no-priorities'}` (registered, absent from migration
046's frozen map; remedy is a migration). The builder **throws**, naming which fault, and
`runGlossaryExport`'s existing `catch` records a per-book `error` outcome.

It must **never** return a valid-shaped empty payload. B1's D3 exists precisely because
collapsing two faults with different remedies is the failure being guarded against; returning
`{terms: []}` collapses both into a third thing that looks like a legitimate export.

**Empty census.** No `02-for-mt` directory, or nothing extracted → **throw**. An unextracted
book is an environment fact, not a zero-term glossary.

⚠️ **The aggregate case is checked FIRST**, before any per-item filter. B0's exact lesson:
`stats.filter(s => s.imported === 0)` finds nothing in an *empty* array, so a directory holding
no input printed "TOTAL: 0" and exited 0 — a green runbook over a run that moved nothing.

On a downstream note, neither throw is load-bearing for safety today — an empty payload would
still be caught by the shrink gate (existing baseline) or the absent-baseline gate (no
baseline). They exist so the failure is **named at its cause** rather than diagnosed from a
gate three steps away.

---

## 7. Testing

**Unit — `buildResolvedGlossary`, scratch DB, small seeded corpus.** Head-form default ·
book-preference override · nominal tie emitted · real tie omitted · out-of-scope excluded ·
`alternatives` in rank order excluding the winner · `status` stamped on every term · `domain`
present and `subjects` absent · sorted by `english` · both throws.

**Unit — `sourceEnglish`.** Overlapping-bigram tokenisation (with the non-overlapping form as
an explicit counter-case, since that is the defect that shipped once) and the `.md.backup.*`
exclusion.

**Unit — `detectProducer`.** Recognises the new stamp; the three fingerprints stay mutually
exclusive; an **unstamped** resolved payload infers `unknown`.

**Integration — the regression pin.** `runGlossaryExport` with the new default produces
**identical per-book outcomes to today** for all four glossary-bearing books: three
`refused-producer`, `edlisfraedi-2e` `refused-absent-baseline`. This is the evidence for D6 —
that B3 moves nothing — and it is the test most worth writing first.

### Controls, so a clean result means something

Per [[engineering-lessons]] and this repo's standing rule that every passing check needs one
expected to fail:

- An **empty census** must refuse, not write. (Positive measurement, not an absence.)
- Removing the `status` stamp must turn a test **red**. An unforced render-path pin is
  decorative — §C20 measured a load-bearing line whose deletion turned nothing red.
- Removing the new stamp from `detectProducer` must turn the regression pin red.

### ⚠️ `glossaryCollisionBaseline.test.js` goes green-but-VACUOUS

Measured by B0: `findGlossaryCollisions` needs **≥2 Icelandic values per English key**, and the
resolved export emits **one entry per English string**. Its `toEqual` will pass while its
subject has ceased to exist.

**Decided (lead, 2026-08-08): RETIRE it, do not re-point it — see D7 below, which also corrects
when the retirement is due.**

---

## 8. Acceptance gate — measured on the real corpus

Run per book against a **scratch copy of production's DB** (B2's method: `db.backup()`, not a
`cp` of a live file), never fixtures:

1. **Per-book term counts**, reported not asserted, with chemistry's compared against today's
   **709**.
2. **The four fallback terms B1 measured must appear in chemistry's payload** with the recorded
   domains: `pH → biology`, `bond → physics`, `carbon dioxide → biology`, `nitrogen → physics`.
   These are the terms the old export's strict subject filter discards for want of a fallback,
   and they are the concrete content of "B3 unblocks chemistry."
3. **Tie and nominal-tie counts** against B1's recorded 299/120 for chemistry — reproducing the
   **method** (source directory *and* tokenisation), not only the numbers.
4. **The regression pin on production's own data**: all four books still refuse, unchanged.
5. **A dry-run diff** old payload vs new for chemistry, kept as evidence for the adoption
   decision that follows in a separate step.

⚠️ **Quoting the numbers without the method makes the first run differ for methodology
reasons** — B1 lost a session to exactly that.

---

## 9. Where the measurements live

`test-results/b3-export-cutover-2026-08.md`, following
[`b1-resolve-gates-2026-08.md`](../../../test-results/b1-resolve-gates-2026-08.md) and
[`b2-prod-population-2026-08.md`](../../../test-results/b2-prod-population-2026-08.md):
dated snapshots, evidence not status, re-measure rather than trust.

**No count from this spec belongs in the register**, and no status verb belongs in this spec.

---

## 10. Risks

| risk | mitigation |
|---|---|
| The census silently shrinks a book's glossary (biology: 13 extracted files) | Refuses rather than writes — shrink gate on an existing baseline, absent-baseline gate otherwise. D1 states the biology consequence up front so it is not later mistaken for a defect. |
| The reshape passes the producer gate unnoticed | D3's distinct stamp, plus a control test that removing it reddens the regression pin. |
| English reaches published math | D2 stamps `approved` on every term; a test that fails when the stamp is removed. |
| Two export implementations coexist until Part C | `exportBookGlossary` is unreferenced after the default flip; Part C deletes it. The regression pin covers the flip itself. |
| `parseArgs` fixed carelessly on a prod cron script | Own commit, own tests, `parseImportArgs` as the model. |
| The acceptance gate is run on fixtures and proves nothing | §8 mandates a scratch copy of production's DB, by B2's snapshot method. |
