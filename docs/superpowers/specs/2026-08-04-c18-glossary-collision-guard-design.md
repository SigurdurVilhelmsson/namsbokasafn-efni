# C18 — glossary collision guard (design)

**Date:** 2026-08-04 · **Register item:** C18 (P1, `[CODE]`) in
[`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md)
· **Baseline:** main `9d1f9f05`

---

## 1. What this is for

Two approved Icelandic translations can compete for one English headword. The render
path resolves that competition **silently, by database/array row order**; the MT path
does not resolve it at all and sends both contradictory instructions to Málstaður.

This design makes the competition **visible** everywhere it occurs, and stops the MT
path from acting on an unresolved one. It **does not decide** which term wins — that is
editorial work owned by register §C14 ②, where the fix is per-book and small
(chemistry: 124 decisions).

### 1.1 Measured starting state — the defect is live, not latent

Measured 2026-08-04 against the committed glossaries, replicating `buildGlossaryMap`'s
own filter (`status === 'approved'` and both sides non-empty after trim). **Counting
unit: distinct lowercased English keys**, not rows.

| Book | approved-usable terms | distinct EN | **collisions** | exact-dupes | comma-list values |
|---|---:|---:|---:|---:|---:|
| `efnafraedi-2e` | 617 | 602 | **13** | 1 | 0 |
| `lifraen-efnafraedi` | 617 | 602 | **13** | 1 | 0 |
| `liffraedi-2e` | 0 | 0 | 0 | 0 | 0 |

`lifraen-efnafraedi`'s file is a byte-identical copy of chemistry's (register §C14 ②);
its 13 are the same 13. `liffraedi-2e` has no approved terms — consistent with the
register's "2262 terms, all needs_review".

**Of chemistry's 13, twelve are NOT masked** by `math-label-map.json` (133 keys), so the
glossary alone decides them:

```
aggregate           → þyrpast saman | þyrping
body-centered cubic → miðjusetinn teningur | miðlæg teningslaga
deposition          → hélun | útfelling
dilute              → þunnur | þynna
emission            → ljómun | útblástur
excess              → umfram- | umframmagn
face-centered cubic → hliðarsetinn teningur | hliðlæg teningslaga
group               → flokkur | hópur
octahedral          → áttflötungslaga | áttflötungur
resonance           → samhrif | vok | vok mynd
simple cubic        → einfaldur teningur | einföld teningslaga
tetrahedral         → ferflötungslaga | ferflötungur
```

`atom` — the register's own worked example — is the **one** case the overlay currently
masks.

### 1.2 Two findings that correct the register's framing

**(a) The mechanism predates the Íðorðabankinn import.** §C18 attributes the collision
to the bulk import and the DB export. That is true of *scale* but not of *cause*:
`tools/merge-glossary.js`'s homograph branch (`:263-289`) pushes multiple entries under
one English key, each `status: 'approved'`, and `merge-glossary.js` wrote **every
committed glossary**. Two independent producers converge on the same defect because the
defect is in the **consumer's** assumption that English is a unique key.

Consequence: C18 is **not** gated on the glossary export being switched back on. It
affects chemistry renders today.

**(b) `pos` cannot discriminate genuine homographs.** `merge-glossary.js`'s `inferPos`
(`:216`) is a suffix heuristic that tagged *miðlæg teningslaga* `verb` merely because it
ends in `-a`. Three of the 13 are "pos-distinct" and at least the cubic-lattice ones are
heuristic misfires, not homographs. **The detector must not use `pos`.**

Both classes are nevertheless present and must not be conflated in the reader's mind:
`aggregate → þyrpast saman | þyrping` is a real verb/noun homograph;
`group → flokkur | hópur` is a real editorial preference (periodic-table group vs. a
general set). The guard reports both identically and resolves neither — deciding
requires a human either way, and the two need different humans' attention.

## 2. Scope

**In scope**

1. A shared pure detector for term competitions and comma-list values.
2. `buildGlossaryMap` reports competitions as data (render path).
3. `cnxml-inject.js` warns once per book.
4. `formatGlossary` **omits** competing headwords and comma-list values from the MT
   glossary, and reports what it omitted.
5. A standalone `tools/validate-glossary.js` + `npm run validate:glossary`, with a
   committed per-book baseline and an `--update-baseline` flag.
6. A test fence over the committed glossaries that fails on any collision beyond the
   baseline.

**Explicitly out of scope**

- **Choosing any term.** Register §C18:551: *"Do not 'fix' it by picking a stable
  tiebreak and stopping — a deterministic-but-arbitrary choice is still an unreviewed
  editorial decision."*
- **Demoting surplus rows in the database** (§C14 ②'s sequenced fix step 2) — a data op,
  not this PR.
- **The export's producer/provenance guard** (§C14 ② step 4) — a separate defect with a
  separate fix; the shrink-ratio guard is not touched here.
- **Íðorðabankinn's single-candidate quality errors** (`polypeptide` → `fjölpeðtíð`).
  §C18:550 records that those headwords have exactly **one** translation, so no
  collision exists and this guard will never surface them. Different problem, different
  owner (`[[idordabanki-biology-seeding]]`'s per-term adoption rule).

## 3. Architecture

### 3.1 New module — `tools/lib/glossary-collisions.js`

Pure, no I/O, no `process.cwd()`, no logging.

```js
/**
 * @param {Array<{english?:string, icelandic?:string, status?:string}>} terms
 * @param {{approvedOnly?: boolean}} [opts]
 * @returns {{competitions: Array<{english:string, candidates:string[], chosen:string}>,
 *            commaLists:  Array<{english:string, value:string, parts:string[]}>}}
 */
export function findGlossaryCollisions(terms, { approvedOnly = true } = {})
```

- **Key:** `english.trim().toLowerCase()`. Matches `buildGlossaryMap`'s key exactly.
- **A competition** is a key with **≥2 distinct** trimmed Icelandic values in the
  filtered set. Exact duplicates are not competitions and are not reported (chemistry
  has 1; it is noise).
- **`chosen`** records what last-write-wins currently selects — i.e. the **last**
  qualifying entry in input order. The report states the status quo; it does not propose
  a change.
- **`commaLists`** is any single value containing `,`. `parts` is provided for the
  reader's benefit; **nothing in this PR consumes it to split a value.**
- A value may appear in **both** arrays (a comma-list that also competes). They are
  independent findings, deliberately not merged.

**Why one shared module rather than three in-place checks:** three definitions of
"competition" would drift. CLAUDE.md already documents the cost of that pattern in the
two on-disk chapter-dir conventions, where a fourth site got it wrong precisely because
the rule lived in several places.

### 3.2 Render path — `tools/lib/math-label-substitute.js`

`buildGlossaryMap` returns `{ map, collisions }` instead of a bare `Map`.

Blast radius is one production call site: `loadMathLabelResolver:144`. It destructures
and passes the report up in its own return object:

```js
return { resolve, overlay, glossaryMap, collisions };
```

**`loadMathLabelResolver` annotates each competition with `masked`.** `buildGlossaryMap`
sees the glossary only, so it reports all **13** chemistry competitions.
`loadMathLabelResolver` is the first point that holds *both* the glossary and the
overlay, so it marks the 1 competition whose key `math-label-map.json` overrides
(`atom`) as `masked: true` and the other 12 as `masked: false`. Masking is computed with
`resolveLabel`'s own key rules (exact key, then lowercase for pure-alphabetic words ≥3
chars) — **not** a plain lowercase lookup, or the annotation would disagree with the
resolution it describes.

Only `masked: false` competitions actually decide rendered output. Both are reported;
the distinction is what makes the count actionable rather than alarming.

**⚠️ Byte-neutrality is a requirement of this PR, not an accident.** `buildGlossaryMap`
keeps last-write-wins unchanged. Switching to first-wins or sorted order would silently
change 12 chemistry terms in published output — a *different* arbitrary decision wearing
a fix's clothing. **The rendered bytes this PR produces must be identical to the bytes
produced before it.**

### 3.3 Inject path — `tools/cnxml-inject.js`

`getMathLabelResolver` (`:4167`) caches the resolver per `bookDir`. The warning is
emitted **on cache-miss only** — once per book per process.

This is deliberate: a whole-book chemistry inject touches ~90 modules, so per-module
warning would print ~1,080 lines and train the reader to ignore it. Once per book is a
signal; 1,080 lines is noise that fails the same way silence does.

Format:

```
⚠️  glossary: 13 English keys have more than one approved Icelandic term;
    12 are not covered by math-label-map.json, so row order is deciding
    which one readers see.
      resonance → samhrif | vok | vok mynd   (using: vok mynd)
      group     → flokkur | hópur            (using: hópur)
      ... 10 more — run `npm run validate:glossary -- --book efnafraedi-2e`
```

The two numbers are both stated on purpose. **13** is what exists in the data and what
the baseline must carry; **12** is what currently reaches readers. Printing only the
second would make the overlay look like a fix rather than a coincidence — `atom` is
masked because someone happened to add it to the overlay for an unrelated reason, and
that could be removed tomorrow.

### 3.4 MT path — `tools/lib/malstadur-api.js`

`formatGlossary` runs the detector over the **post-filter** set — i.e. over exactly what
that call is about to send — and omits:

- **every candidate of a competing headword** (not one of them: an unresolved
  competition must not prime MT at all), and
- **every comma-list value** (`targetWord: "anjón, mínusjón, neijón"` is a glossary
  *instruction*; §C18:549 notes this path is worse-scoped than the render one because it
  affects all prose, not only math labels).

Detecting post-filter matters because callers disagree on `approvedOnly`:
`api-translate.js:645` passes `true`; `translate-chapter-titles.js:118,127` and
`test-malstadur-api.js:465` pass `false`. Detecting on `status` alone would report
competitions that are not real for a given call and miss ones that are.

**Measured impact on chemistry (2026-08-04), so this is not a blind behaviour change:**

| `approvedOnly` | terms sent today | competitions | rows omitted |
|---|---:|---:|---:|
| `true` (`api-translate.js`) | 617 | 13 | **27 (4.4%)** |
| `false` (`translate-chapter-titles.js`) | 787 | 13 | **27 (3.4%)** |

The competition count is identical at both settings — the 500-odd non-approved terms add
no new competitions — so relaxing `approvedOnly` does not balloon the omission. Losing
27 of 617 glossary hints costs MT far less than sending 13 contradictions does.

**Key-casing divergence, resolved deliberately.** `buildGlossaryMap` lowercases (`:20`);
`formatGlossary` only trims (`:206`), so `Atom` and `atom` are one key on the render
path and two on the MT path. The detector lowercases for **both**. Over-reporting a
competition is harmless; missing one is not. This gets a code comment — it is the kind
of silent asymmetry this register exists to catch.

**Reporting follows the existing `onSkipped` idiom**, including its hard-won constraint.
`tools/api-translate.js:638-644` documents why the caller's callback is wrapped in a
non-throwing inner callback: handing it straight to `formatGlossary` means a throwing
caller callback is swallowed by the surrounding `catch` and returned as `null`,
indistinguishable from corrupt JSON — a fail-quiet violation. A new `onOmitted` callback
inherits that constraint exactly. **A reporting callback that can be swallowed would
reintroduce a fail-quiet path in the very PR that claims to remove one.**

### 3.5 The gate — `tools/validate-glossary.js`

Follows the established baseline idiom of `tools/cnxml-render-fidelity-check.js`
(`baselinePath:378`, `loadBaseline:382`, `--update-baseline:393`):

- Baseline file: `books/<slug>/glossary/glossary-collisions-baseline.json`
- `npm run validate:glossary` → exit 1 on any finding **not** in the baseline
- `--update-baseline` rewrites it

**The baseline records the chosen term per key, not a count.** A bare count would be a
number in prose — the exact thing CLAUDE.md § *One source of truth* forbids — and it
would hide *which* term changed when one flipped.

```json
{
  "_note": "Accepted term competitions. This file is a WORKLIST, not an approval. Every entry is an unresolved editorial decision (register C14 ②) that row order is currently making. Shrink it by resolving terms in the DB; do not grow it to silence the gate.",
  "competitions": {
    "resonance": { "candidates": ["samhrif", "vok", "vok mynd"], "chosen": "vok mynd" },
    "group":     { "candidates": ["flokkur", "hópur"],           "chosen": "hópur" }
  },
  "commaLists": {}
}
```

**⚠️ The `_note` is load-bearing.** The fidelity baseline's own note warns that *"a
baseline taken from output containing a render bug blesses the bug."* That hazard is
acute here, because the 12 chemistry entries **are** the defect. Wording the file as an
accepted-for-now worklist — with the currently-chosen term visible — makes it double as
the checklist for §C14 ②'s per-book flips, and makes a growing file obviously wrong.

**A changed `chosen` for an unchanged candidate set fails the gate.** That is the drift
this fence exists to catch: it means row order shifted and readers silently got a
different word.

**Two baseline files are needed at the outset**, both with the same 13 entries:
`efnafraedi-2e` and `lifraen-efnafraedi` (whose glossary is a byte-identical copy —
§1.1). `liffraedi-2e` has no approved terms, so it gets **no baseline file**, and the
fence's "findings without a baseline fails" rule means biology's competitions announce
themselves the moment its terminology lands rather than being silently absorbed.

## 4. Error handling

- The detector never throws. Malformed entries (missing/blank sides) are filtered by the
  same rules `buildGlossaryMap` and `formatGlossary` already apply.
- `buildGlossaryMap` and `formatGlossary` never throw on a collision. Chemistry has 12
  live ones; throwing would block the chemistry pipeline on pre-existing data, and the
  resolution is editorial and cannot be rushed.
- `validate-glossary.js` exits 1 on findings beyond baseline, 0 otherwise — matching
  `cnxml-render-fidelity-check.js`.
- `onOmitted` is wrapped so a throwing caller callback propagates rather than being
  swallowed (§3.4).

## 5. Testing

TDD, red first.

**`tools/__tests__/glossary-collisions.test.js` (new)**
- two distinct values for one key → one competition
- two identical values → **no** competition
- three candidates → all three in `candidates`
- `Atom` / `atom` fold to one key
- `approvedOnly: true` excludes non-approved; `false` includes them
- a comma value → one `commaLists` entry, `parts` split, **`map` unaffected**
- a value that is both a comma-list and competing → appears in both arrays

**`tools/__tests__/math-label-substitute.test.js` (extend)**
- new `{ map, collisions }` shape; existing assertions move to `.map`
- **mutation check: `chosen` equals what `map.get(key)` actually returns.** Asserting
  them independently lets the report drift from reality and lie in a way no other
  assertion catches — the report would be confidently wrong, which is worse than silence.
- byte-neutrality: for a colliding fixture, `map.get(key)` returns the same value it
  returned before the change

**`tools/__tests__/malstadur-glossary-guard.test.js` (extend)**
- a competing headword is omitted **entirely** — neither candidate sent
- a comma-list value is omitted
- non-competing, non-comma terms are untouched
- `onOmitted` fires with both categories
- **a throwing `onOmitted` propagates** (the `api-translate.js` invariant)

**`tools/__tests__/glossaryCollisionBaseline.test.js` (new — the fence)**
- every committed `books/*/glossary/glossary-unified.json` has no competition or
  comma-list beyond its baseline file
- a book with no baseline file and no findings passes
- a book with findings and no baseline **fails** (absence of a baseline must not read as
  approval — the C11(b) lesson that staleness is the alarm)

Root `npm test` is the authoritative gate (CLAUDE.md: no branch protection, so local
green is the real proof).

## 6. Delivery

**This PR changes no published page.** Substitution runs at inject time, so even the
render-path report reaches readers only after a re-inject, a re-render **and** a manual
vefur sync. The MT-path omission affects only future translation calls. Nothing here
requires a deploy, a data op, or a sync.

**What it unblocks:** it is the first step of §C14 ②'s sequenced fix, and the register
names it as the thing standing between the glossary export and being switched back on.
Prod currently carries an uncommitted `#CONTAINED-2026-08-03#` edit to
`scripts/git-backup.sh` disabling the export leg; lifting that re-runs the unattended
write within 2h. **This PR does not lift it and does not make it safe to lift** — that
needs the producer/provenance guard (§C14 ② step 4), which is out of scope here.
