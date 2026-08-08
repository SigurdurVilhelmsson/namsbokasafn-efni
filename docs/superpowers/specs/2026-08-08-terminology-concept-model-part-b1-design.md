# §C36 Part B1 — `resolve()`, inert

**Written:** 2026-08-08 · **Status:** design, frozen on approval · **Register:** §C36
**Parent spec:** [`2026-08-07-terminology-concept-model-design.md`](2026-08-07-terminology-concept-model-design.md)
**Predecessors:** Part A (17 commits to `main`, merged + deployed 2026-08-08; **no PR number** —
`gh pr list` shows #370 as C30 and #371 as C14) · Part B0 ([PR #372](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/372) → `main` `fc2d7258`, merged + deployed + verified on prod)

> **This document is evidence, never status.** Where it disagrees with the active register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`), **the register wins.**

---

## 1. What this is, and what it deliberately is not

Part B, as the parent spec §9 writes it, is one step: *"`terminologyService.js` is rewritten
around `resolve`; consumers updated (export, MT, editor routes)."* Measured on disk
2026-08-08, **nine non-doc files read the old terminology tables** — `terminologyService.js`,
`export-terminology.js`, `capture-c24-golden.js`, `e2e/seed-fixture.js`, migrations 032 / 033 /
044 / 046, `scripts/verify-db-backup.sh` (a **production monthly cron** that `exit 1`s when the
table is gone), and the two Python tools. That is not one reviewable PR.

**Part B is therefore sliced, and this spec covers B1 only.**

| | Scope | Ships |
|---|---|---|
| **B1** | `resolve()` + `buildScope()`, tested, **inert** | this spec |
| B2 | Populate production (import replay) — a data op | own plan |
| B3 | Glossary export writes a resolved view — **unblocks chemistry** | own spec |
| B4 | Editor cuts over (parent spec §7.2 panel) | own spec |
| B5 | Stragglers: `capture-c24-golden`, `e2e/seed-fixture`, `verify-db-backup.sh`, Python tools | own plan |
| Part C | Drop the old tables | own spec |

**B1 is inert by construction**, the same posture that let Part A and B0 deploy to production
as verified no-ops: it reads only tables Part A created, which hold **0 / 0 / 0 rows on
production** (verified after the B0 deploy). No consumer changes. No table dropped. No write.

### Non-goals

- **Do not regenerate `c24-golden.json`.** Nothing cuts over in B1, so the golden cannot
  legitimately move. Its own header warns that re-running the capture from HEAD "would certify
  the new implementation against itself and destroy the oracle."
- **Do not touch `terminologyService.js`.** It is already past 2,000 lines; adding the resolver
  to it buries the seam B3/B4 need.
- **Do not resolve the `book_domain_priority` user-writable question.** Migration 047's header
  records the measurement (*"nothing writes `book_domain_priority` except migration 046 and
  tests — no route, no service, no admin control"*) and defers the decision to **Part C**. B1
  only reads the table, so the every-boot re-assert stays correct.
- **Do not choose terms for any book.** Parent spec §11 — the model makes choice expressible;
  editors make it.

### Prerequisite belonging to B3, not here

B0 deferred finding 5 — `server/scripts/export-terminology.js`'s `parseArgs` swallows the next
flag as a value (measured: `--db --allow-zero-yield` consumed the flag as a path and created a
0-byte SQLite file **named after the flag**). It is tagged `blocks: Part B`. It is in the
**export**, which B1 does not touch, so it is **B3's precondition**. It deserves its own review
rather than a drive-by: `export-terminology.js` is cron-invoked on production.

---

## 2. Decisions taken (lead, 2026-08-08)

Three decisions the register required before a line of `resolve()` was written. Each contradicts
or extends the frozen parent spec; **the parent spec is not edited** — it is evidence, and this
is the live correction.

### D1 — Out-of-scope concepts survive as a soft, badged tier

Parent spec §6 step 2 drops any candidate whose domain is absent from
`book_domain_priority(book)`. **That would remove behaviour the editor has today.**

Measured at source: `terminologyService.js:1489-1498` keeps out-of-subject terms, stamps
`isFallback: true` and sorts them last; `:1625` then excludes them from missing-term issues
(`if (!term.isFallback && seg.isContent)`); `term-highlight.js:73` renders them with a
`cross-subject` class and `segment-editor.js:2486` adds a note. So a fallback match is
**surfaced but never enforced** — "chemistry has no term for this, but biology does," as a
suggestion, not a violation. **16 of the C24 golden's 40 matches carry `isFallback: true`**
(measured, not quoted).

**Decision: `resolve()` returns out-of-scope candidates in a separate `outOfScope` list**, below
every in-scope one, flagged so callers can badge them and refuse to enforce them.

⚠️ **The 16 is not a prediction of loss.** The golden was captured under the old model, where a
book had **one** subject. The new model gives `efnafraedi-2e` three in-scope domains
(chemistry › physics › biology), so some of those 16 become genuinely in-scope. What is at stake
is only concepts whose domain is in *no* position for the book — for chemistry that is
`astronomy`, `anatomy-physiology`, `mathematics`, `earth-science`, and `anatomy-physiology`
alone is 46% of the corpus (LAEKN, 33,568 concepts).

### D2 — A nominal tie resolves, and is still reported

Parent spec §7.1 says flatly *"tied → omit, and count it."* The corpus census found **two
different things** wearing that label. For `efnafraedi-2e`, restricted to English strings that
actually appear in the book's `01-source`: **2,001 resolve outright (82.1%) · 126 nominal ties
(5.2%) · 310 real ties (12.7%)**.

- A **nominal tie** is two distinct concepts at the same position whose rank-1 Icelandic head
  forms are *the identical string*. There is nothing to guess — both candidates answer with the
  same word. §7.1's flat rule discards them for nothing.
- A **real tie** is `antibiotic` → *fúkalyf* / *sýklalyf*: genuinely two answers.

**Decision: a nominal tie sets `winner` to the agreed form AND populates `nominalTie`**, so the
editor can see two concepts that may want merging. Decision 1 of the parent spec (import never
merges; merging is editorial) is untouched — `resolve()` merges nothing, it reports.

⚠️ The real ties **cluster** and are not 310 independent decisions:
`cns → {miðtaugakerfi | MTK}` and `dna → {DKS | deoxýríbósakjarnsýra}` are abbreviation/expansion
pairs; `north pole → {norðurpóll himins | norðurskaut | …}` is a genuine sense split.

### D3 — A book with no priority rows gets a distinct `unscoped` state

On a fresh clone **4 of 6 books have no `book_domain_priority` rows**: `019-register-new-books.js`
omits the `NOT NULL registered_by` column that migration `003` declares, so its two
`INSERT OR IGNORE`s are silently discarded (**§C35**), and no migration registers `efnafraedi-2e`
or `stjornufraedi` at all. Parent spec §10 calls "a book silently scoped to nothing" the exact
failure the design exists to remove.

**Decision: `buildScope` returns an explicit unscoped result** rather than an empty scope. A miss
and a misconfiguration must never look alike. Callers decide: the **export refuses** (matching
today's `refused-no-mapping` posture, surfaced in `/api/health` and printed by `deploy.sh`); the
**editor degrades** to badged out-of-scope suggestions rather than throwing, so a config gap in
an un-onboarded book does not 500 a read-only panel.

⚠️ **And it names WHICH misconfiguration — two distinct faults reach this state and they have
different remedies.** `buildScope` must first resolve the slug against `registered_books`, so:

```js
{ unscoped: 'unregistered' }    // no registered_books row for this slug
{ unscoped: 'no-priorities' }   // registered, but zero book_domain_priority rows
```

- **`unregistered`** is §C35: the book was never registered, so *nothing* about it works and the
  remedy is the admin route (after which migrations 046/047 seed its rows on the next boot).
- **`no-priorities`** is a registered book that migration 046's frozen `PRIORITIES` map does not
  name — the remedy is a migration, not an admin action.

Collapsing them would repeat, one level down, exactly the failure D3 exists to prevent: this
spec insists a tie be told apart from a miss, and must hold itself to the same rule.

---

## 3. Architecture

Two units in a new `server/lib/conceptResolver.js`, following the `termAutomaton.js` precedent —
a pure module, data in, data out, no singleton connection:

```
server/lib/conceptResolver.js
  ├─ buildScope(db, bookSlug, chapter)  → Scope | { unscoped: 'unregistered' | 'no-priorities' }
  └─ resolve(scope, englishString)      → Resolution
```

`resolve()` never opens a database. Everything DB-shaped that does **not** vary per string is
hoisted into `Scope`, built once per (book, chapter).

**This split is the performance design.** Parent spec risk 4: *"`resolve` is now on the hot path
that C24 just spent a branch making fast."* §C24 was an availability incident, not a slow page —
`findTermsInSegments` compiled 48,976 regexes per call and blocked the event loop for ~100 s, so
one editor pressing "back" took the server down for ~3 minutes. Biology's scoped corpus is
**47,568** distinct English terms against C24's current ~20,073. A per-string function that
queries the DB, called in a loop over 47,568 items, reproduces §C24 exactly.

`db` is passed **explicitly**, never taken from `terminologyService`'s singleton. That keeps the
module testable against an in-memory fixture and honours the durable rule against resolving
resources through ambient state.

---

## 4. Components

### `Scope`

```js
{
  bookId, chapter,
  positionOf: Map<domain, position>,          // from book_domain_priority
  preference: Map<conceptId, {termId, tier}>, // chapter override merged over book default
                                              // tier: 'chapter' | 'book'
  unscoped: false                             // else 'unregistered' | 'no-priorities'  (D3)
}
```

**`preference` is pre-merged at build time**, chapter rows written over `chapter = 0` rows. So
parent spec §6 step 3's three-way fall-through collapses, inside `resolve()`, to *"preference,
else the concept's rank-1 `is` term"* — one `Map.get`, no precedence logic in the hot function.
The chapter-override rule is then tested once, at the scope level, instead of in every
resolution case.

**`tier` is carried through the merge rather than discarded**, because parent spec §7.2 requires
the editor panel to show *which* rule fired — "chapter override / book default / head form of
domain X". Collapsing both preference tiers into one flag would make that display underivable,
and `buildScope` is the only place that still knows.

### `Resolution`

One shape; every outcome is nameable and no two are confusable:

```js
{
  winner:     { conceptId, termId, text, domain, position } | null,
  reason:     'chapter-preference' | 'book-preference' | 'head-form' | null,
  nominalTie: [conceptId, …],                      // D2 — winner IS set; INCLUDES the winner's own id
  tied:       [{ conceptId, text, domain }, …],    // real tie — winner is null
  outOfScope: [{ conceptId, text, domain }, …],    // D1 — badged, never enforced
  integrity:  [],                                  // 0..n of 'merge-cycle' | 'orphan-preference'
  unscoped:   false                                // else 'unregistered' | 'no-priorities'  (D3)
}
```

Two shape choices that exist to remove ambiguity rather than to be elegant:

- **`reason` has three values, not two.** `'preference'` alone cannot drive parent spec §7.2's
  panel, which distinguishes a chapter override from a book default. `domain` and `position` on
  the winner supply the "of domain X" half.
- **`integrity` is an array, not a nullable string.** A `merge-cycle` and an
  `orphan-preference` can both occur in one resolution; a single-valued field would force one to
  be silently dropped, which is the failure mode this whole shape exists to prevent. Empty array
  = clean.

Read the states apart:

| Observation | Means |
|---|---|
| `winner` set, `nominalTie` empty | ordinary resolution |
| `winner` set, `nominalTie` populated | D2 — two concepts agree; offer a merge |
| `winner: null`, `tied` populated | real tie — report, never guess |
| `winner: null`, everything empty | genuine miss |
| `unscoped: 'unregistered'` | book absent from `registered_books` — fix via the admin route |
| `unscoped: 'no-priorities'` | registered, but migration 046's map does not name it — fix via a migration |

**Three different things must never share one empty result** — parent spec §10 states it for
ties, and this repo's standing lesson generalises it: an absence tells you whether you observed,
never whether the thing is there.

---

## 5. Data flow

```
buildScope(db, 'efnafraedi-2e', 3)
   ├─ SELECT id FROM registered_books WHERE slug = ?
   │     └─ no row → return { unscoped: 'unregistered' }     (D3, §C35)
   ├─ SELECT domain, position FROM book_domain_priority WHERE book_id = ?
   │     └─ 0 rows → return { unscoped: 'no-priorities' }    (D3)
   └─ SELECT concept_id, term_id, chapter FROM book_concept_preference
        WHERE book_id = ? AND chapter IN (0, 3)
              chapter-3 rows overwrite chapter-0 rows;
              the winning row's chapter becomes `tier`       → preference

resolve(scope, 'cell')
   1. candidates ← concepts having an 'en' term matching the string,
                   following merged_into to the surviving concept
   2. partition by positionOf.has(domain)      → inScope | outOfScope    (D1)
   3. per in-scope candidate, choose its term:
         preference.get(conceptId)  else  rank-1 'is' term
      ── DROP any candidate that yields no term ──                       (§6)
   4. winner ← lowest position among what survives step 3
   5. tie on position → compare the CHOSEN TEXTS of ALL tied candidates
         ALL identical      → winner + nominalTie (all tied ids)         (D2)
         ANY two differ     → winner: null, tied: [all of them]
```

⚠️ **Step 5 is all-or-nothing across the whole tied set, deliberately.** With three candidates
tied at one position where two agree and one differs, there is still a real choice to make, so
the resolution is a real tie and **every** tied candidate is reported — including the two that
agreed. A rule that resolved to the majority form would be guessing, which parent spec §6 step 5
forbids in as many words: *"Report; never guess."*

Step 1 is the single query `resolve()` cannot hoist — it depends on the string. In B1 it is a
prepared statement held on the scope. **B4 will replace it with a bulk pre-fetch keyed off C24's
automaton hits**, which is why the automaton survives B1 unchanged: `buildTermAutomaton` takes
only `{headwordId, english}` and its cache is fingerprinted on those pairs, so the seam is the
row-reconstruction block, not the matcher.

Following `merged_into` in step 1 is load-bearing beyond tidiness. Import never sets it
(parent spec decision 1), so `antibiotic`'s two concepts stay separate until an editor merges
them — and after that merge, existing preference rows still name the absorbed concept.
Resolving *through* `merged_into` is what makes an editorial merge take effect with no data
migration.

---

## 6. Error handling

| Condition | Outcome | Why it is not an empty result |
|---|---|---|
| Book absent from `registered_books` | `{ unscoped: 'unregistered' }` from `buildScope` | D3 — §C35; remedy is the admin route |
| Book registered, 0 priority rows | `{ unscoped: 'no-priorities' }` from `buildScope` | D3 — remedy is a migration, not an admin action |
| `merged_into` cycle (A→B→A, or self) | Follow with a visited set; stop at the last unvisited concept, push `'merge-cycle'` onto `integrity` | Import never writes `merged_into`, so a cycle is editorial corruption. Must terminate; must be visible |
| Preference `term_id` belongs to a different concept | Ignore it, use the head form, push `'orphan-preference'` onto `integrity` | A wrong preference must not silently become the answer, nor break the panel |
| In-scope concept with an `en` term but **no** `is` term | Drop from candidates **between steps 3 and 4** | See below |
| No candidates at all | `winner: null`, all lists empty, `integrity: []` | The genuine miss |

**⚠️ The term-less-candidate ordering is a real defect in the parent spec's step order, not a
detail.** §6 runs *choose each candidate's term (3) → lowest position wins (4)*, which reads
correctly until a chosen term is `undefined`. Chemistry is position 1 for `efnafraedi-2e`, so a
chemistry concept with no Icelandic head form would **win the position race and then resolve to
nothing** — while `biology`'s perfectly good word sat at position 3, never consulted. Filtering
must happen *between* steps 3 and 4. The parent spec's numbered list cannot show this, because
the failure only appears once you ask what an empty term does to the ordering.

⚠️ **Whether this case is OBSERVABLE is a measurement, and gate 5 takes it.** B0's finding 4 is
the model: it quantified its hazard as *"Latent: the measured corpus has 0 nulls and 70,187
distinct ids"* — which is not proof of impossibility, but it does tell a reviewer whether the
guard is pinning a live case or a latent one. **A guard whose triggering population is unknown
is untested by definition.**

✅ **MEASURED 2026-08-08 (gate 5) — the population is 0, so the guard IS a deliberate
latent-case pin, and this spec now says so in as many words** (which is what the §8 gate-5
outcome asked for). Over the real 70,187-concept corpus, concepts with an `en` term and no
`is` term: **0**. Two consequences the gate text called for, both now settled: gates 1 and 2
are **independent of this guard** and can be read as standalone results, and §6's filter is
pinned by construction in the pure test suite rather than by any corpus case. Reproduced on
an independently rebuilt corpus after the original scratch DB was lost. Evidence:
[test-results/b1-resolve-gates-2026-08.md](../../../test-results/b1-resolve-gates-2026-08.md).

⚠️ Related, and deferred to B2 rather than guarded here: **re-importing a collection
cascade-deletes every editor term preference** (`import-concepts.js:32` clears
`concept_term` and re-inserts with new autoincrement ids;
`book_concept_preference.term_id … ON DELETE CASCADE`). It is inert in B1 because
`book_concept_preference` is empty, and B1 writes nothing. **It must be resolved before B2
populates production.** → register §C36 finding 1.

---

## 7. Testing

### Pure layer — no database

`resolve(scope, string)` takes a literal `Scope`, so parent spec §10's table-driven cases are
plain data: chapter override, book default, head-form fall-through, cross-domain fallback,
merged concept, nominal tie, real tie, unscoped, plus each of §6's five rows.

### Scope layer — real in-memory DB

`buildScope` is tested against a `better-sqlite3` fixture built by running **the real
migrations**, not a hand-written schema. Pinned specifically: chapter rows override `chapter = 0`
rows; a book with 0 priority rows returns `unscoped`.

### Two guards this repo's history requires

- **A tie test must assert the tie is REPORTED**, not that nothing came back — parent spec §10
  says so outright, because an empty return is also what a lookup miss produces. So
  `expect(r.tied).toHaveLength(2)`, never only `expect(r.winner).toBeNull()`.
- **Mutation controls.** For each of `rank`, `position`, and the preference merge, a deliberate
  perturbation that must redden a *named* test. §C20's lesson: removing a load-bearing line
  turned **nothing** red across the whole server suite, and the branch's adversarial review then
  found three more silent mutations. **"No check went red" is an unanswered question until you
  have shown a check that can go red.**

### Runner facts that bear on writing these

`vitest.config.js` sets **`fileParallelism: false` globally** (the workspace file cannot load
under the installed vitest), so nothing runs in parallel and a test mutating shared module state
poisons every **later** file in the run. `npm test` is `vitest run` and does **not** run
Playwright. Run it from the repo root.

---

## 8. Acceptance gate — measured on the real corpus

Fixtures cannot evidence this. Run against a scratch DB built by
`node server/scripts/run-concept-import.js --dir ~/idordabanki-raw-2026-08-07/ --db <scratch>`
— B0 measured 70,187 concepts / 192,189 terms in **3.8 s**.

⚠️ **The raw 20-collection fetch (72,482 entries, ~1.5 h at Árnastofnun's mandated 1 req/s)
lives OUTSIDE the repo** at `~/idordabanki-raw-2026-08-07/` with a `PROVENANCE.md`. It is not
committed (76 MB, and it is Árnastofnun's data). **This is a replay, not a re-fetch** — unless
that directory is lost.

1. **Chemistry's fallback works.** `pH`, `bond`, `carbon dioxide` resolve via `biology`;
   `nitrogen` via `physics` — each asserted with the domain and position it resolved through.
   This is the measurable form of "unblocks chemistry."
   ⚠️ **Capture this before Part C drops the old tables**, or the gate becomes unmeasurable.
2. **The tie census reproduces**: `efnafraedi-2e` → **2,001 outright / 126 nominal / 310 real**.
   A different number is **a finding to explain, not a constant to update** — which only holds
   if the method is reproduced too, so it is part of the assertion, not a footnote:
   - **restricted to English strings that actually appear in that book's `01-source`** (complete,
     per the parent spec's own trap warning), **not** to the whole corpus; and
   - **a tie counted only in the best available domain** per §6 step 4 — a tie at position 3 is
     not a tie if anything resolved at position 1.

   ⚠️ Without both restrictions recorded, the first run differs **for methodology reasons** and a
   session is spent explaining a phantom finding.

   ⚠️ **AMENDED 2026-08-08 — the gate reads `02-for-mt`, NOT `01-source`, and that is a
   deliberate deviation from the line above.** It is recorded here rather than quietly
   normalised, because the first run recorded it the wrong way round: the brief's *code*
   read `02-for-mt` while its *label* said `01-source`, and Task 9 corrected the **label**
   and filed it as fixing a brief defect — turning a real spec deviation into an apparent
   correction. **Ruling: keep `02-for-mt`.** It holds the extracted EN segments — the exact
   text `filterGlossaryForText` filters the MT glossary against, and the text B3 and B4 will
   actually run the resolver over. `01-source` is raw CNXML (149 `.cnxml` against 249 `.md`),
   so censusing it would count markup this resolver never sees. Script and spec now agree.

   ⚠️ **AND THE EXTRACTION GRAMMAR IS PART OF THE METHOD — this is the trap the paragraph
   above warns about, sprung.** The first run's harvester matched two-word terms
   **non-overlappingly**, so whether `carbon dioxide` was seen depended on its byte offset,
   and it measured **1,398/67/176** — a 30–46% shortfall that was written up as a register
   discrepancy. With overlapping adjacent pairs and nothing else changed: **1,999/120/299**,
   within ~1% of the figure above. **A census's tokenisation is a load-bearing part of its
   method, not an implementation detail.** Evidence:
   [test-results/b1-resolve-gates-2026-08.md](../../../test-results/b1-resolve-gates-2026-08.md).
3. **Biology's scope is the size the register measured** — **47,568** distinct English terms for
   `liffraedi-2e`, driven by `anatomy-physiology` at position 2.
4. **Performance is recorded, not asserted against a guessed number.** One `buildScope` plus a
   full sweep over biology's 47,568 terms. **B1 publishes the measurement; B4's threshold is set
   from it, not before it.**

   ⚠️ **`bench-c24.js` CANNOT be reused for this.** It takes `<book> <chapter> <moduleId>` and
   calls `findTermsInSegments` — the matcher, which B1 does not touch, against production book
   data B1 has no path to. **B1 adds its own `server/scripts/bench-resolve.js`**, against the
   scratch DB, reporting **RSS as well as latency** in bench-c24's output shape: ~85 MB resident
   for the automaton is a real cost on a small Linode, and a claim reporting only time is
   half-measured. Reusing bench-c24's *shape* is the point; reusing the *script* is not possible.

5. **The term-less-candidate population is COUNTED, not assumed.** Report, over the scratch
   corpus, how many concepts have an `en` term and **no** `is` term, and how many of those are
   in scope for `efnafraedi-2e` / `liffraedi-2e`. Two outcomes, both useful and each changing
   what §6's guard means:
   - **0** → the guard is a deliberate latent-case pin, and the spec says so in as many words.
   - **non-zero** → the case is live, gate 1's chemistry assertions may already depend on the
     guard, and the tie census in gate 2 shifts with it. **Re-derive gate 1 and 2 knowing this,
     rather than reading them as independent results.**

### Controls — so a clean result means something

- A book whose priorities are set but match nothing must return `unscoped: false` with an empty
  `winner`, **distinguishable from both unscoped causes**. Without this control, D3 is untested:
  a passing suite would look identical either way. Three cases, three distinct results —
  registered-with-priorities-but-no-match, `'no-priorities'`, and `'unregistered'`.
- The tie census must be re-run **with `rank` collapsed**, and the numbers must change. If they
  do not, the census is not measuring what it claims.

  ⚠️ **AMENDED 2026-08-08 — THIS CONTROL AS WRITTEN IS VOID ON THIS CORPUS, and obeying it
  literally produces a FALSE ACCUSATION.** `conceptFromEntry.js:74-76` assigns `rank` in array
  order and `import-concepts.js:108` inserts in that same order, so autoincrement `id` rises in
  lockstep with `rank` — making `ORDER BY rank ASC, id ASC` identical to `ORDER BY id ASC`.
  Measured: of **17,356** concepts with two or more Icelandic terms, collapsing rank moves the
  head form in **zero**. The census is unchanged, and the inference rule above would then
  condemn a census that is in fact correct. **Use the form that can actually move the head
  form — REVERSE rank within each concept** — which does move it (nominal −7, real +7). The
  gate script runs the reversal inside a rolled-back transaction so the scratch corpus stays
  idempotent. **A control must be shown capable of firing before its silence is evidence.**

⚠️ **Two values clipped by the same limit agree, and their agreement proves nothing.** Where a
census number comes back suspiciously round, treat it as the signature of a limit until shown
otherwise.

---

## 9. Where the measurements live

| Number | Source | Do not re-derive from prose |
|---|---|---|
| 2,001 / 126 / 310 tie census | register §C36 Part B0 block | — |
| 47,568 biology scope · 19,749 chemistry | register §C36 Part B0 block | — |
| 709 kept / 19,057 rehomed / 9,137 excluded | register §C36 "acceptance gate" | ⚠️ These count **DB rows passing the export filter**, NOT the §C14 ② "408 net / 112 chemistry terms", which diffs against the committed `glossary-unified.json` **file**. Different units; neither derivable from the other. **Say which you mean.** |
| 70,187 concepts / 192,189 terms | [`test-results/concept-import-2026-08.md`](../../../test-results/concept-import-2026-08.md) | — |
| 16 of 40 golden matches `isFallback` | measured 2026-08-08 from `c24-golden.json` | — |

---

## 10. Risks

1. **`resolve()` is on the hot path C24 just fixed.** Mitigated by the scope/resolve split
   (§3) and gate 4 (§8). Not eliminated — B4 is where it is proven.
2. **B1 is validated against a scratch corpus, and production has 0 concepts.** The gate is
   real but it is not production. **B2 must re-verify on prod** before B3 cuts anything over.
3. **The parent spec is frozen and partly refuted.** Two of its claims are contradicted here
   (§7.1's "No new plumbing" — `translateChunk` calls `filterGlossaryForText` with neither a
   book slug nor a chapter in scope, `tools/api-translate.js:885`, so `resolve(book, chapter, …)`
   is unreachable from that call site; and §2.1's consumer list). A reader who consults the
   parent spec without this document will design the wrong thing. **The register is the index
   of which claims still stand.**
4. **`concept_term` has no `status` column, and `buildGlossaryMap` drops any term where
   `status !== 'approved'`** (`tools/lib/math-label-substitute.js:20`). The result reaches
   published CNXML through `substituteMathLabels` → `cnxml-inject.js`. **A resolved export that
   stops stamping `status: 'approved'` silently puts English into published math.** Inert in B1
   — B1 writes no file — and **load-bearing the moment B3 writes.** Carry it forward.
