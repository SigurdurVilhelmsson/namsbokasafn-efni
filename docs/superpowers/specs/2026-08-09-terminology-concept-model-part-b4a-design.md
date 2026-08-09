# §C36 Part B4a — the term preference: an editor's answer for one English string

**Written 2026-08-09.** Design record for one item, owned by register
`docs/plans/2026-07-21-post-item17-followup-campaign.md` §C36 / §C38. Per CLAUDE.md § *One
source of truth*: **this document is evidence, never status.** If it ever disagrees with the
register, the register wins. Freeze it when B4a merges; corrections go in the register, not
here.

Parent spec: [`2026-08-07-terminology-concept-model-design.md`](2026-08-07-terminology-concept-model-design.md)
(**frozen — not edited**). Siblings:
[`…-part-b1-design.md`](2026-08-08-terminology-concept-model-part-b1-design.md) ·
[`…-part-b3-design.md`](2026-08-08-terminology-concept-model-part-b3-design.md).

> **⚠️ This spec's first draft was falsified before it was committed.** It designed a
> "preference tier" over the existing `book_concept_preference` table and claimed no schema
> change was needed. A verification pass measured **18 wrong claims out of 47**, three of them
> design-breaking, and the design below is the replacement. The first draft was never
> committed; §12 records what it got wrong and why, because the error is instructive.

---

## 1. What this is, and what it deliberately is not

**§C36 B4 — "the editor cuts over" — is sliced into three, and this spec covers only the
first.** The lead took that decision on 2026-08-09, for the same reason Part B itself was
sliced: B4 as originally scoped bundles a resolver semantics change, a rewrite of the
C24-hardened matcher, and a new editor panel into one diff.

| Slice | What it does | Posture |
|---|---|---|
| **B4a** *(this spec)* | An editor's choice for one English string becomes expressible, and becomes the answer | **Inert on production** (§1.2) |
| **B4b** | `findTermsInSegments` cuts over from the old terminology tables to `resolve()` | The performance-critical one |
| **B4c** | Parent spec §7.2's editor panel, plus the write path that makes a preference exist | The first slice with a UI |

### 1.1 What B4a changes

1. **A new `book_term_preference` table**, keyed `(book_id, chapter, english)`, replacing the
   empty `book_concept_preference`. Migration 048.
2. **`resolve()` honours it as an override** applied *after* the position walk, so an editor's
   answer wins regardless of which domain the term's concept belongs to.
3. **`resolve()` reports in-scope concepts that lost** (`alsoInScope`), which today vanish
   silently.
4. **Three preference failures that would be silent are reported**, through a channel that
   survives the export's write-if-changed guard.

### 1.2 Non-goals

- **No write path.** Nothing in this slice creates a preference. That is B4c.
- **No editor surface.** No route, no template, no client code.
- **No matcher change.** `findTermsInSegments` and the C24 automaton are untouched — B4b.
- **No adoption decision.** Chemistry's adoption is §C14 ②'s and is the lead's.
- **No chapter-tier exercise.** See §6.3: the chapter tier is *implemented* and structurally
  *unreachable* in B4a. It is not tested against the corpus, and this spec says so rather than
  implying coverage it does not have.

---

## 2. The defect, and the deeper one under it

### 2.1 §C38 as reported

Register §C38, found by the lead on 2026-08-09 from domain knowledge — not by any test, and not
by either whole-branch reviewer of B3.

*Accuracy* (closeness to the true value) and *precision* (repeatability) are the pair a
measurements chapter exists to distinguish. **Chemistry's export resolves both to `nákvæmni`.**

Six concepts carry the English `accuracy`. **Five give `hittni` as the head form** — biology ×2,
mathematics ×2, plus one biology concept ranking `nákvæmni` 1 / `hittni` 2. The sixth, physics
(EDLISFR), says `nákvæmni`. Chemistry's chain is `1.chemistry → 2.physics → 3.biology`, and
chemistry has no `accuracy` concept at all, so **physics@2 decides and biology's `hittni` at
position 3 is never consulted.**

Seeding a `book_concept_preference` row on the biology concept and re-resolving still returns
`nákvæmni [physics @2]`: the map is consulted at **step 3**, *inside* a candidate, to pick which
of **that concept's** terms to use, and **step 4** then picks the lowest position, ignoring it.

### 2.2 ⚠️ The deeper defect — a key mismatch, and it is §C38's own shape one level down

**`book_concept_preference` is keyed on `concept_id`. An editor acts on an English string. One
concept carries many English strings.**

Measured during verification, on a patched tree: a book preference on the **physics** concept
selecting its rank-2 term `hittni` — the purely within-concept use the field has today —
against an unpreferred **chemistry@1** candidate.

| | Winner | Reason |
|---|---|---|
| Today | `efnaord [chemistry @1]` | `head-form` |
| Under the first draft's tier design | `hittni [physics @2]` | `book-preference` |

**The editor asked "when physics wins, use `hittni`" and would have been given "physics now
beats chemistry"** — for every English string that concept carries, including strings they never
looked at. The existing narrow meaning is real and is pinned:
`server/__tests__/resolvedGlossary.test.js:89` ("honours an editor book-preference over the head
form") uses a preference to choose `atóm` over head-form `frumeind` **within the already-winning
concept**.

This is **§C38's own defect shape**: the model is keyed differently from how the person using it
thinks. A fix that kept the concept key would have reproduced, one level down, the fault it was
written to close.

### 2.3 The register already ruled for the table this spec builds

§C36's decision 6, taken by the lead before Part A shipped:

> **Preference is PER BOOK — ✅ RULED.** A new **`book_term_preference`** table, not a flag on
> the translation row and not on `(translation, subject)`. `status` reverts to its real question
> — *is this translation legitimate?* — and preference becomes a separate per-book one. **Two
> questions, two columns, neither overloaded.**

Migration 045 shipped `book_concept_preference`. **B4a is not a new direction; it restores the
ruled one** — and "neither overloaded" is precisely the property §2.2 shows the concept key
lacks.

### 2.4 Three things that hid §C38, all structural

1. **`alternatives` is empty.** `buildResolvedGlossary` builds it from the *winning concept's*
   other Icelandic terms (`resolvedGlossary.js:101-104`), and the physics concept has only
   `nákvæmni` — so `hittni` appears nowhere in the exported entry. ⚠️ **B4a does not fix this**
   (§10, R5).
2. **Losing in-scope answers are not reported.** `resolve()` surfaces `outOfScope` but a
   lower-position **in-scope** concept that loses the race vanishes. D3 closes this.
3. **Árnastofnun's own data conflates them** — concept 6524 carries both English terms on one
   concept, `nákvæmni` rank 1 / `hittni` rank 2.

**Why no check caught it:** every layer behaved correctly. **A wrong-but-well-formed translation
is not a shape defect** — the fault is in the relationship between two entries. →
`[[engineering-lessons]]`.

---

## 3. Decisions

### D1 — The override reaches IN-SCOPE concepts only *(lead, 2026-08-09)*

An editor may promote any term whose concept is **already in the book's domain chain**.
Out-of-scope concepts stay unreachable.

This closes §C38's measured case: biology sits at position 3 for `efnafraedi-2e`, so it is in
scope and promotable. It does **not** reach the two mathematics `hittni` concepts chemistry's
priority list excludes.

**Rejected — any concept in the corpus.** The domain chain would stop being a boundary and
become advisory. It is the mechanism that keeps 70,187 concepts from being candidates for every
book.

**Rejected — free-text Icelandic.** It abandons the property the concept model exists to
establish: that every published term traces to a source with a domain and a rank. That is §C18's
untraceable-value problem, re-introduced.

⚠️ **D1 has a consequence that must not be silent** — see D4(c).

### D2 — The preference is keyed on `(book_id, chapter, english)` *(lead, 2026-08-09)*

A row means exactly one thing: **"for this book and chapter, this English string resolves to
this term."**

Three properties follow from the key, not from code — which is why this is a schema decision and
not a resolver decision:

1. **The two intents of §2.2 collapse into one.** Choosing `atóm` over `frumeind` and choosing
   `hittni` over `nákvæmni` are the same act: *naming this book's answer for one English
   string*. There is no second meaning to disambiguate.
2. **Competing preferences become unrepresentable.** The primary key permits exactly one row per
   `(book, chapter, english)`. The first draft needed a whole tier mechanism to break ties among
   competing preferences; that problem does not exist here.
3. **A preference cannot leak onto strings the editor never saw.** The blast radius of a row is
   exactly the string named in it.

⚠️ **This reverses the first draft's "no schema change is needed" claim.** That claim was
*true* — the concept-keyed map is reachable at resolve time — and it was the wrong trade. The
table holds **0 rows on production** and is written by no production code (§7), so the migration
is a drop-and-create. **This is the cheapest moment the change will ever be**; after B4c ships a
write path it is a consumer-wide refactor. The same argument stripped the `db` parameter from
`resolve()` during B1, for the same reason, at the same kind of moment.

### D3 — The preference is an OVERRIDE applied after the position walk

Steps 2–5 run **exactly as today**, producing `winner` / `nominalTie` / `tied` / `outOfScope`.
The preference then replaces the winner.

**Why after, and not instead.** A short-circuit that returns the preferred term immediately
would skip step 5 — and verification measured what that costs: with two same-position concepts
carrying the identical text where one is preferred, `nominalTie` collapsed from `[1,2]` to
`[]`, destroying the duplicate-concept merge hint that step 5 exists to produce, and moving
`stats.nominalTies` (which §9's census gate reads). Applying the preference as an override
leaves every existing report intact and changes only the answer.

Determinism needs no sort: **the key guarantees at most one preference per English string**, and
a `term_id` belongs to exactly one concept, so at most one candidate can carry it.

### D4 — A preference that cannot be honoured is reported, with the fault distinguished

Three distinct faults, each with a different remedy, each with its own code. ⚠️ **They are
separate codes on purpose**: verification found that the first draft's design gave a dangling
`term_id` and a term-less concept the *same* code, "which undercuts D4's stated diagnostic
purpose."

| Code | Condition | Remedy |
|---|---|---|
| `preference-term-missing` | `term_id` matches no `concept_term` row at all | Delete the stale row |
| `preference-out-of-scope` | The term's concept is real but its domain is absent from `positionOf` | Re-order the book's domain priority, or withdraw the preference (D1 says the resolver will not honour it) |
| `preference-not-a-candidate` | The term's concept is in scope, but does not carry the English string being resolved | The row is misfiled — almost certainly written against a different string |

⚠️ **`preference-out-of-scope` must be detectable, which constrains the implementation.** Step
2's out-of-scope arm **drops term-less candidates before recording them**
(`conceptResolver.js:261-264`, pinned by `conceptResolverResolve.test.js:118`), so a check
written against the `outOfScope` *output* would stay silent for exactly the concepts most likely
to be broken. **Resolve the preference against the full candidate list, before partitioning.**

### D5 — The integrity report does not travel in `stats`

⚠️ **Measured, and it is the finding that most changes the implementation.**
`glossaryExportDecision.sameTerms` is `JSON.stringify(prev.terms) === JSON.stringify(next.terms)`
and reads **nothing else** (`glossaryExportDecision.js:68-72`); `export-terminology.js:765`
`continue`s on a match, before the write at `:801`. So a payload differing only in a new
`stats.integrity` key is classified `unchanged` and **never written**.

And the condition leaves `terms` byte-identical **by construction**: a preference that cannot be
honoured falls through to the head form and emits the same entry a book with no preference row
produces. **The one condition the report exists to surface is exactly the condition under which
the report would never reach disk.**

Therefore the counts go to **`export-terminology.js`'s per-book log line and `outcomes[b]` in the
status file** — channels that do not depend on the write. **Nothing is added to the payload**,
which also keeps B4a's export output genuinely unchanged (§9).

### D6 — B4a ends at the resolver

No write path, no editor surface, no matcher change. The slice is complete when the resolver
behaves correctly and the export is proven unchanged.

---

## 4. Why it is inert on production — measured, and narrower than it looks

**Two independent blocks, both verified rather than assumed:**

1. **No production code creates a preference.** Measured 2026-08-09 across `*.js`, `*.sh`,
   `*.py`, excluding `node_modules`: **no `INSERT` into `book_concept_preference` exists outside
   `server/__tests__/`.** Production held **0 rows** at the B2 population (register §C36 Part B,
   asserted there as a control).
   ⚠️ **The precise claim is "no production code INSERTs", not "only tests touch the table".**
   `server/scripts/import-concepts.js:50` holds a production `DELETE` (the prune), executed at
   `:121`; `:35` is a `COUNT`. Migration 045 is DDL. The first draft said "the only writers are
   test files" and that was wrong.
2. **The export writes nothing new.** Under D5 the payload is unchanged, so `sameTerms` is true
   and the write is skipped — and today all four in-loop books refuse before reaching that point
   anyway (3× `refused-producer`, `edlisfraedi-2e` `refused-absent-baseline`).

⚠️ **Do not generalise "inert" past this slice.** The moment B4c ships a write path this
behaviour is live and reader-visible: the export writes `glossary-unified.json`, and approved
terms from it are substituted into published CNXML by `tools/lib/math-label-substitute.js`.

---

## 5. Migration 048

```sql
CREATE TABLE IF NOT EXISTS book_term_preference (
  book_id  INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
  chapter  INTEGER NOT NULL,              -- 0 = book default · 1..n · -1 = appendices
  english  TEXT    NOT NULL,              -- EXACT, as resolve() receives it
  term_id  INTEGER NOT NULL REFERENCES concept_term(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, chapter, english)
);
```

`chapter` keeps 045's `NOT NULL` + `0` sentinel and the comment that explains it: SQLite NULLs
do not compare equal inside a primary key, so a nullable chapter would permit two conflicting
book defaults. `-1` remains the appendices sentinel (CLAUDE.md, durable).

`ON DELETE CASCADE` on `term_id` is carried forward deliberately — and the importer still
deletes preferences **explicitly** rather than relying on it, because a cascade yields no count
for `preferencesDropped` and the behaviour must not depend on `PRAGMA foreign_keys`
(`importConcepts.test.js` pins this over default/ON/OFF).

### Carrying rows forward

The migration **expands** any existing `book_concept_preference` row into one
`book_term_preference` row per English term on that concept, and **logs the expansion count**.

⚠️ **Expansion materialises the very blast radius D2 removes** — one concept row becoming N
English rows *is* the leak, written down explicitly. That is the point: it converts an implicit,
invisible reach into rows a reviewer can read and delete. **On production it is a no-op (0
rows)**, and the migration must report `0` there; a non-zero count on any box is a finding to
look at, not a success.

`book_concept_preference` is then dropped. ⚠️ **Check `verify-db-backup.sh` before dropping any
table** — it is a production monthly cron that `exit 1`s on a missing table, and it is the reason
Part B was sliced at all. Verified 2026-08-09: it references the *old* terminology tables, not
`book_concept_preference`. **Re-verify at implementation time rather than trusting this line.**

---

## 6. The resolver

### 6.1 `buildPreferenceMap` → keyed on english

```js
SELECT english, term_id, chapter
  FROM book_term_preference
 WHERE book_id = ? AND chapter IN (0, ?)
```

Returns `Map<english, {termId, tier}>`, chapter rows winning over chapter-0 rows exactly as
today. `tier` is still **carried, not discarded** — parent spec §7.2 requires the panel to say
which rule fired, and this is the only place that knows.

### 6.2 `resolveCandidates` gains the English string, and one override step

`resolveCandidates(scope, candidates, integrity = [], english = null)`.

⚠️ **The fourth parameter is optional so the function stays pure and the existing call sites keep
working** — `conceptResolverResolve.test.js` imports no database at all, and that must remain
true.

**Step 3 loses its per-candidate preference lookup.** Under D2 a preference names a term
directly, so the within-concept selection and the cross-concept promotion are one mechanism.
Every candidate now chooses its head form; `reason` on an unpreferred resolution is `head-form`.

**New step 6 — the override**, after steps 4–5 have produced their result:

```js
const pref = english == null ? undefined : scope.preference.get(english);
if (pref) {
  // Search ALL candidates, in-scope and out — D4's out-of-scope code is
  // undetectable from the `outOfScope` OUTPUT, which drops term-less concepts.
  const owner = candidates.find((c) => c.isTerms.some((t) => t.termId === pref.termId));
  if (!owner)                                  codes.push('preference-not-a-candidate');
  else if (!scope.positionOf.has(owner.domain)) codes.push('preference-out-of-scope');
  else { /* owner becomes the winner; `tied` is cleared; `nominalTie` is preserved */ }
}
```

- **`tied` is cleared** when the override fires: a real tie that an editor has answered is no
  longer a tie. That *is* the answer.
- **`nominalTie` is preserved**: it reports duplicate *concepts* to merge, which is true
  independently of which term the book uses.
- **`preference-term-missing`** is distinguished from `preference-not-a-candidate` by one extra
  lookup on `concept_term`; the scope's statement bundle gains a `termById`.

### 6.3 ⚠️ The chapter tier is implemented and unreachable in B4a

`buildResolvedGlossary` hardcodes chapter 0 with a comment forbidding otherwise
(`resolvedGlossary.js:29-32`), pinned by `resolvedGlossary.test.js:103`; `buildScope`'s own
default is `chapter = 0` (`conceptResolver.js:110`). With chapter 0, `chapter IN (0, ?)` binds
`(0, 0)`, so **every row resolves to `tier: 'book'` on every path B4a ships.**

The chapter tier is therefore exercised **only by hand-built unit scopes**, and §9's corpus gate
structurally cannot reach it. It is implemented because 045 already models chapters and B4b is
its first consumer — but this spec claims no corpus evidence for it, and a reviewer should not
read §8's chapter rows as production coverage.

### 6.4 `alsoInScope`

```js
alsoInScope: [{conceptId, termId, text, domain, position}]
```

**Every chosen candidate not already reported as `winner`, in `tied`, or in `nominalTie`** —
ordered by `position` then `conceptId`, deterministic for the same reason step 4's sort is.

- **`termId` is included** because it is the field B4c needs in order to *write* a preference.
  Without it B4c would have to re-derive term ids from display text. (`tied` has the same gap
  today; B4a does not fix it — §10, R4.)
- **`nominalTie` members are excluded.** They carry a string identical to the winner's, so
  offering them as alternatives is noise; they are already reported, as duplicates to merge.
  ⚠️ The first draft's rule ("not the winner and not in `tied`") left this undecided, and its
  §5 and §8 answered differently.
- Built from `chosen` — **after** term-selection and **after** the term-less filter — so every
  entry is a real, offerable answer.
- `[]` on every early-return path, including `emptyResolution`. **The shape is total**; a field
  present on some paths and absent on others is what makes a consumer's optional-chaining look
  correct until it isn't.

---

## 7. ⚠️ Five `toEqual` assertions go red, in two files, and that is the pin working

**Measured, not predicted.** A verifier patched `alsoInScope: []` into all four return shapes
and ran the full suite: **`Tests 5 failed | 4253 passed (4258)`**, every failure
`expected { … (6) } to deeply equal { … (5) }`.

| File | Lines |
|---|---|
| `server/__tests__/conceptResolverIntegrity.test.js` | **135, 154, 166, 178** |
| `server/__tests__/conceptResolverResolve.test.js` | **127** — *"a genuine miss returns empty everything, integrity []"*, which pins the `emptyResolution` path |

`toEqual` is a shape pin, not a value check — CLAUDE.md's `NON_RENDER_KEYS` rule says so. The
fix is to add the field to each expectation with the value that path should produce; line 166
(out-of-scope candidate alone) and line 127 (no candidates at all) both assert `alsoInScope: []`.

**Do not "fix" it by dropping the field, switching to `toMatchObject`, or making `alsoInScope`
conditional.** Any of those retires five pins the suite is currently paying for.

⚠️ **The first draft named four, in one file** — it reasoned from a grep instead of running the
mutation, and the fifth would have arrived as a surprise in a file it said nothing about.

---

## 8. Testing

Red first. Every new pin mutation-verified, per the B1 precedent.

### The anchor — §C38 reproduced

Seed `(efnafraedi-2e, 0, 'accuracy')` → the `hittni` term on the biology concept.
`resolve(scope, 'accuracy')` must return `hittni [biology @3]`, `reason: 'book-preference'`.
**Before the change it returns `nákvæmni [physics @2]`** — assert the red state first.

### The control that must stay green

`resolve(scope, 'precision')`, unpreferred, must still return `nákvæmni [physics @2]`.

⚠️ **This control is the point.** A change that broke position ordering generally would **pass
the anchor and fail this**. An anchor without a control proves only that some code ran.
*(→ `[[engineering-lessons]]`: give every passing check a control you expect to fail.)*

### The control that pins §2.2 — the leak is gone

Seed a preference for `accuracy` on a concept that **also** carries the English string
`exactness`. `resolve(scope, 'exactness')` must be **unaffected**. Under the concept key it
would have moved; under D2 it cannot. **This is the regression test for the defect that caused
the rewrite**, and no other test in the suite would catch its return.

### D3 — the override, and what it preserves

| Case | Expected |
|---|---|
| Preferred term on a losing in-scope concept | It wins; the position-winner moves to `alsoInScope` |
| Preferred term on the concept that already won | Same winner, `reason` becomes `book-preference` |
| Preference fires while there was a real `tied` | Winner set, **`tied` cleared** |
| Preference fires while there was a `nominalTie` | Winner set, **`nominalTie` preserved** ⚠️ the case the first draft's design destroyed |
| Chapter preference vs book preference, same string | Chapter wins *(unit-scope only — §6.3)* |
| No preference at all | Winner, reason, `tied`, `nominalTie`, `outOfScope` all unchanged |

⚠️ **That last row is about the WINNER and the existing fields, not the whole object.** The
object changes for every resolution with more than one in-scope candidate, because `alsoInScope`
is added unconditionally — which is exactly why §7's five pins go red. The first draft claimed
"byte-identical to pre-change behaviour" here while §7 said five tests would fail; the two
contradicted each other.

### D4 — the three codes

Each asserted in **both halves** — the code is reported **and** the resolution is otherwise the
unpreferred one. The second half is what a naive implementation gets wrong.

- `preference-term-missing` — `term_id` deleted from under the row.
- `preference-out-of-scope` — term on a mathematics concept for `efnafraedi-2e`. ⚠️ **Include a
  term-less out-of-scope concept**, which step 2 drops before recording; a check written against
  the `outOfScope` output stays silent there and the test must catch that.
- `preference-not-a-candidate` — term on an in-scope concept that does not carry this English
  string.

### D5 — the channel

The counts appear in `export-terminology.js`'s per-book log line and in `outcomes[b]`. **Assert
the payload is unchanged** — no `stats.integrity`, no new key — since that is what keeps §9's
gate meaningful.

⚠️ **State the counting unit in the log line.** `resolveCandidates` de-duplicates each code per
resolution, so a count is *"census strings whose resolution reported this code"* — never *"faulty
rows"*. One broken row hit by twelve strings counts twelve; twelve broken rows on one string
count one. A bare integer that means neither is worse than none.

### Mutation verification

At minimum, each must turn a test red: dropping the `preference-out-of-scope` check; searching
only in-scope candidates for the preferred term; clearing `nominalTie` along with `tied`;
building `alsoInScope` from `inScope` rather than `chosen`; omitting `termId` from
`alsoInScope`.

---

## 9. Acceptance gate — measured on the real corpus

Run against a **writable copy** of production's populated database.

⚠️ **The first draft's gate was unrunnable**, in two independent ways worth carrying:
`createResolvedExportFn` opens the DB `{ readonly: true }` (`resolvedGlossary.js:171`), so a
seeded row needs the gate's own connection; and **`scope.preference` is a snapshot taken at
`buildScope` time**, so a preference seeded after the scope exists is invisible to `resolve()`
— every re-check needs a fresh `buildScope`.

1. **The export is unchanged — gated on `terms`, not on bytes.** `buildResolvedGlossary` for
   `efnafraedi-2e` must produce **2,119 terms** and a census reproducing **1,999 outright / 120
   nominal / 299 real ties** ([b3-export-cutover](../../test-results/b3-export-cutover-2026-08.md)
   §1 and its census table). Compare `JSON.stringify(prev.terms) === JSON.stringify(next.terms)`
   — the export's own equality — plus an assertion that `stats` gains **no** key.
   ⚠️ **Literal byte-identity is impossible and must not be asserted**: `generated:
   new Date().toISOString()` (`resolvedGlossary.js:129`) differs on every build. The first draft
   titled this gate "byte-identity" and then contradicted itself in its own body.
   ⚠️ **A term count alone is not the gate** — two payloads can agree on 2,119 and differ in
   which 2,119. Same shape of error as B2's `updatedTerms`-vs-`terms` lesson.
2. **The zero-preference precondition, asserted as a control.** `SELECT COUNT(*) FROM
   book_term_preference` = **0** on the corpus gate 1 runs against, and migration 048's expansion
   count = **0**. If either is non-zero, gate 1 is measuring something else.
3. **§C38 closes on the real corpus.** On a writable copy: insert the `accuracy` preference,
   **rebuild the scope**, resolve, assert `hittni`; then delete, rebuild, assert `nákvæmni`
   returns. The second half is the control.
4. **The §2.2 leak is closed on the real corpus.** Find a production concept carrying ≥2 English
   strings both present in chemistry's census, prefer one, assert the other does not move.
   ⚠️ **If no such concept exists in the census, say so and mark the gate not-run** — do not
   report a vacuous pass. *(→ an absence is not an answer.)*
5. **No performance regression.** Re-run `server/scripts/bench-resolve.js` against B1's recorded
   0.044 ms/resolve on the same box. ⚠️ **A dev-box figure**; it is a regression check against
   itself, never a production budget. The production question belongs to B4b, where biology's
   47,568-term scope bites.

---

## 10. Risks

**R1 — The override changes resolution for books that later gain preferences, and the export is
reader-visible.** Deliberate; it is the point. Mitigated by the slicing — B4a cannot create a
preference. ⚠️ **B4c must not treat this as already-reviewed**: the first preference ever written
on production changes a published glossary.

**R2 — `alsoInScope` grows the resolution object, and B4b calls `resolve()` per matched string
over a 47,568-term scope.** Cheap per call ≠ cheap at matcher scale. B4a builds it
unconditionally because a conditional shape is worse (§6.4); **B4b must measure it** and may need
a resolve-lite path. Logged as a known input to B4b, not a surprise.

**R3 — 🆕 A pre-existing latent bug that B4a does NOT fix, and that the re-key defuses rather
than closes.** `buildPreferenceMap` keyed on the **raw** `concept_id` while `lookupCandidates`
reports the post-`followMerge` **survivor** id — so a preference on a concept later merged away
was silently ignored: no promotion, **no integrity code at all**, because both the `if (pref)`
branch and the out-of-scope check keyed on `c.conceptId`. Measured on a real in-memory DB during
verification. **It also falsifies the resolver's own docstring at `conceptResolver.js:139-140`**,
which states the opposite in as many words: *"Resolving THROUGH `merged_into` is what makes an
editorial merge take effect with no data migration: preference rows still naming the absorbed
concept keep working."* They do not — `buildPreferenceMap` keys on the absorbed id and
`lookupCandidates` reports the survivor's, so the lookup misses. Re-verified on disk 2026-08-09.
Under D2 the lookup no longer goes through a concept id, so the skew cannot swallow a preference
— it surfaces as `preference-not-a-candidate` instead. **Log it to the register as its own
finding**: the docstring correction is owed regardless, and Part C's merge tooling will meet the
same skew.

**R4 — `tied` still carries no `termId`.** `alsoInScope` gains one (§6.4); `tied` does not, so
B4c must re-derive term ids from text for tied entries. Deliberately out of scope — changing
`tied`'s shape touches the four `conceptResolverIntegrity` pins a second time. **B4c's problem,
recorded here so it is not rediscovered.**

**R5 — `alternatives` still comes from the winner's concept only** (§2.4 ①). After B4a an
editor's preferred term wins, so `alternatives` becomes *its* concept's siblings — better, but a
good answer on a *different* concept still never appears. **B4c's panel must read `alsoInScope`,
not `alternatives`, to show the real choice.**

---

## 11. Where the measurements live

- §C38's measurement, the six `accuracy` concepts, the failed preference experiment → register
  §C38.
- Chemistry's 2,119 terms and the 1,999/120/299 census →
  [b3-export-cutover-2026-08.md](../../test-results/b3-export-cutover-2026-08.md).
- B1's resolve-rate and scope sizes →
  [b1-resolve-gates-2026-08.md](../../test-results/b1-resolve-gates-2026-08.md).
- Production's concept population and the 0-row control →
  [b2-prod-population-2026-08.md](../../test-results/b2-prod-population-2026-08.md).

**This spec restates none of them as fact.** Where a number appears above it is an acceptance
gate to be re-measured, and it names its source.

---

## 12. What the first draft got wrong

Kept because the pattern is the instructive part, not the individual errors. Verified against
the tree by five independent agents: **47 claims checked, 18 wrong.**

**Three design-breaking:**

1. **It reproduced the defect it was fixing.** It built a promotion mechanism on the concept key,
   so an editor's choice would have leaked onto every other English string on that concept —
   §C38's own key-mismatch shape, one level down. **The fix and the fault shared a blind spot.**
2. **Its central justification was false.** D2 preferred a "tier filter" over a short-circuit
   partly because the tier "falls through into the tie machinery that already exists". Measured:
   the tier filter *destroys* `nominalTie` when tie members straddle the tier boundary
   (`[1,2] → []`).
3. **Its integrity report could never reach disk.** `stats.integrity` is invisible to
   `sameTerms`, and the condition it reports leaves `terms` byte-identical by construction.

**And a category worth naming: claims that were right about the code and wrong about the
system.** The first draft correctly established that the preference map is reachable at resolve
time, and concluded "no schema change is needed." True, and the wrong trade — because the
question was not *can it be read* but *is it keyed the way it is used*.

**Two process notes:**

- **Every one of the three design-breaking findings came from the single agent asked to review
  the design adversarially**, not from the four asked to check facts. Fact-checking finds
  transcription errors; only an adversarial reading finds a design that is internally consistent
  and wrong.
- **Two verifiers contradicted each other** on whether B4a would rewrite every book's glossary
  unattended. Adjudicated by reading `export-terminology.js:765` — the write is guarded by
  `sameTerms`, and one agent had read the write site without its guard. **A verifier's prose is
  not a measurement either.** → `[[engineering-lessons]]`.
