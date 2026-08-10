# §C36 B4b-1 — the `findTermsInSegments` matcher cut-over: design

**Status:** DESIGN, written 2026-08-10. **No plan, no code.**
**Slice:** §C36 Part B → B4 (editor) → B4b (matcher) → **B4b-1**. Predecessors `B4b-0a` (BÍN port, inert) and `B4b-0b` (pos-aware inflections onto `concept_term`) are merged and deployed.
**Register:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` §C36, Part B, B4 block. **The register owns status; this document owns the design.**

**Provenance of every number below.** Three classes, never mixed:

- **[measured-here]** — measured during this design session, against the working tree at `9628967b`, or against a scratch concept corpus rebuilt locally via `server/scripts/lib/scratchCorpus.js`.
- **[inherited-prod]** — taken from [`test-results/b4b-matcher-cutover-2026-08.md`](../../../test-results/b4b-matcher-cutover-2026-08.md), which self-describes as measured read-only against production `sessions.db` at HEAD `bc8989b6` on 2026-08-10. **Not re-measured here** — re-measuring needs prod.
- **[inferred]** — reasoning, not measurement. Marked as such every time.

Twelve agents produced the measurements (six measuring, six adversarially re-measuring). **The adversarial pass refuted at least one claim in every one of the six topics**, including two that would have shaped this design wrongly. Where a first measurement was overturned, the overturned version is kept in §11 — the errors are instructive and this project keeps them.

---

## 1. What this is, and what it deliberately is not

B4b-1 cuts `findTermsInSegments` (`server/services/terminologyService.js:1390`) over from the old terminology tables — `terminology_headwords`, `terminology_translations`, `terminology_translation_subjects` — to the concept model, via `server/lib/conceptResolver.js`.

**It is not a swap.** Four things the old matcher emits have **no counterpart** in the concept model (§2). Every one of them is a behaviour change that lands on editors, and none of them is currently named by any gate.

### 1.1 Non-goals

- **No editor UI.** The term popup, the panel, the write path — B4c. B4b-1 changes what the existing UI is *fed*, not the UI.
- **No write path.** Nothing in B4b-1 makes the concept model writable. That is the subject of the blocking decision **D1** below, not of the implementation.
- **No BÍN population run.** Writing `concept_term.inflections` in production is a separate [LEAD] data op on B2's precedent. See **D2** — whether it is a *precondition* is a lead call, and the answer changes B4b-1's acceptance criteria.
- **No compounder.** §C44, scheduled behind this slice.
- **No Part C.** The old tables are not dropped. **⚠️ But see §2.5 — they go *functionally* dead at cut-over regardless, which is not what §C42's guard says.**
- **No `[vantar]` corpus fix.** §C43 is a corpus defect. B4b-1 must *filter* it (D7); repairing the 201 concepts is separate.

---

## 2. Four things with no counterpart — the actual content of this slice

### 2.1 `status` does not exist in the concept model

The old matcher selects `WHERE t.status IN ('approved','proposed')` and emits `status` on every match and every translation sibling. **[measured-here]** `conceptResolver.js` contains zero occurrences of `status`, `approved` or `proposed`; `concept_term.lifecycle` is the only column that could carry one and it is **written and read nowhere**.

Two consequences, in opposite directions:

- **A loss.** After cut-over there is nowhere to represent *proposed*. The editor UI badges it today.
- **⚠️ A gain nobody has claimed, and it should be stated because it inverts the usual framing.** Today `status IN ('approved','proposed')` means a term becomes **matchable the instant any EDITOR-role user proposes it, with no head-editor approval**. The concept corpus is Árnastofnun's, imported by an operator. So on this one axis the cut-over *tightens* the gate rather than loosening it.

### 2.2 The `missing` check narrows from *any approved sibling* to *the one winner*

The old check is `approvedTranslations.some((t) => t.isRegex.test(seg.isContent))` — a segment passes if the editor used **any** approved Icelandic word for that headword. `resolve()` returns **one** winner. A legitimate rank-2 synonym therefore starts failing.

**This is the behaviour change that lands on editors as new warnings on text they already reviewed**, and it is what §C36 exists to enable — a book that has chosen its term should be held to it. `resolve()`'s `alsoInScope` already carries the material for a softer tier. **D5** decides whether that tier ships here.

### 2.3 The `translations[]` sibling array has no producer

Each match today carries `translations: [{id, icelandic, subjects, status, isPrimary, isFallback}]`, ranked. The resolver returns a winner plus `alsoInScope`. **[measured-here]** the golden pins 6 fields per sibling; `status` is unavailable (§2.1) and `subjects` maps onto domains only partially (§2.4).

### 2.4 `subjects` and `domains` are different vocabularies

**[measured-here]** The subject vocabulary and the domain vocabulary are **7 entries each and overlap on only 4**. `general` — which a test explicitly pins — has **no domain counterpart at all**.

So `translationTier()`'s three-way `primary` / `in-scope` / `fallback` partition, and the `isFallback` flag that suppresses `missing` issues for foreign-subject terms, do not survive as-is. The concept model's equivalent is `book_domain_priority` position.

**⚠️ `isFallback` is load-bearing for issue volume, not just for badging.** **[measured-here]** on the committed golden: 40 matches, **16 of them `isFallback`**, so only **24 (60%)** are even eligible for the IS-side check. A cut-over that loses the fallback concept would raise issue volume by ~67% on that fixture before any other effect.

### 2.5 ⚠️ §C42's guard does not cover the actual loss point

§C42 says *"Part C must not drop the old tables while this is open."* **[inferred, and it is the register's own reasoning I am contradicting]** That guard protects the **bytes**. It does not protect the **behaviour**: B4b-1 stops *reading* those tables, so every editorial write into them becomes unobservable at cut-over, whenever Part C physically drops them.

Keeping the tables is still right — it preserves the data for a later bridge — but the guard as written would read as "we are covered", and we are not.

---

## 3. 🔴 D1 — THE BLOCKING DECISION: the concept model has no writer, and the editor's contribution becomes unrepresentable

**[measured-here], reproduced twice, and this is the finding that should decide whether B4b-1 proceeds as scoped.**

There are **zero** `INSERT` / `UPDATE` / `DELETE` statements against `concept`, `concept_term`, `book_domain_priority` or `book_term_preference` anywhere in `server/routes/`, `server/services/` or `server/lib/`. `conceptResolver.js` is read-only. `book_term_preference` — the one table that could express *"this book prefers this Icelandic term"* — has **no production writer that can add a row**; its only writes are migration 048's one-time backfill, a `DELETE` in `import-concepts.js`'s prune, gate scripts, and tests.

Meanwhile the old tables have **15 write functions reachable from 16 authenticated endpoints** **[measured-here]**. (⚠️ A first census said "46 write lines"; the adversarial pass showed that to be a scan-window artifact — the real count is ~29–30 write *statements*. The endpoint count stands.)

So after the cut-over, an editorial write goes into a table nothing reads. Two branches:

- **Branch A — the dominant case.** The term still **matches**, because the automaton is keyed on **English** and English comes from the concept corpus. But the Icelandic the matcher demands is the corpus's, not the editor's. **The editor's decision becomes unrepresentable, not merely unmatched** — they can save it, and it changes nothing.
- **Branch B.** A term whose **English string is not in the Íðorðabankinn corpus** becomes **invisible to the matcher entirely** — no match, no highlight, no QA issue. `upsertHeadword` inserts `english` verbatim with no normalisation.

**⚠️ A refinement the adversarial pass forced, and it matters for how B4c must be designed:** the primary editor-facing create path `POST /api/terminology` **requires `english`** (400 without it) and treats `icelandic` as *optional* — the activity log literally writes `' (placeholder)'` when it is absent. So it is false that "the editor only contributes the Icelandic side". Editors mint English headwords too, which is exactly what makes Branch B reachable by ordinary use.

**The one mitigation that exists is out-of-band:** `server/scripts/import-concepts.js` is a shipped, operator-runnable writer of `concept`/`concept_term`. Nothing *in the running server* can write the model.

### D1 — the options, for the lead

| | What ships | Cost | Risk |
|---|---|---|---|
| **D1-a** | **B4b-1 as scoped; accept that editor terminology writes go dark until B4c.** Log it loudly; B4c restores a write path. | Cheapest. Keeps the slice order the register already ruled. | For the window between B4b-1 and B4c, the terminology editor is a **write-only UI**. Editors will not be told by anything. |
| **D1-b** | **Re-order: B4c (write path) before B4b-1.** | Re-opens a ruled slice order. B4c is the bigger diff and has no design yet. | The matcher keeps its C24-era read path longer; chemistry adoption waits. |
| **D1-c** | **B4b-1 ships with a read-side bridge**: when a concept lookup misses, fall back to the old tables for that English string. | Preserves editor writes with no new write path. | A second live read path — exactly the "two sources of truth" shape this project keeps paying for. **Not recommended.** |
| **D1-d** | **B4b-1 ships behind an env flag**, defaulting to the old path, flipped per-book after B4c. | Reversible; measurable in prod. | A prod escape hatch, which the standing feedback rule *robustness over expedience* argues against. |

**Recommendation: D1-a — but its cost must be stated honestly, because the obvious mitigation does not reach the people who lose the work.**

The natural "make it loud" is a startup warning plus an `/api/health` line. **⚠️ That is loud to the OPERATOR and silent to the EDITOR.** CLAUDE.md § Server Features records that **nothing polls `/api/health`** — the routine surface is what `./scripts/deploy.sh` prints. So the warning reaches whoever runs a deploy, while the editors whose terminology decisions stop being representable are told **nothing at all**, and the standing feedback rule *robustness over expedience* reads on that just as it reads on D1-d's flag.

**So the honest framing for the lead is:** between B4b-1 and B4c the terminology editor is a **write-only UI**, and under D1-a *nobody using it will be told*. If that is unacceptable, the mitigation has to be an editor-facing one — which is a UI change, which is B4c, which is D1-b. **The choice is therefore genuinely between "accept a silent window" and "re-order the slices", and no amount of operator-side logging collapses it.** **This is the lead's call, not the implementer's.**

### D1 has an unmeasured input, and it is cheap to get

**[measured-here — the absence itself]** No measurement anywhere compares the old `terminology_translations.icelandic` strings against `concept_term(lang='is')`. The recorded *"0 lost at cut-over"* covers the **English key only**.

**The Icelandic side has never been sized.** That is the number that says how much editorial work Branch A silently discards. It is a read-only query against prod. **§8 makes it a precondition.**

---

## 4. D2 — ordering against the [LEAD] BÍN population op

**[inherited-prod]** `concept_term.inflections IS NOT NULL` = **0** on production.
**[inherited-prod]** the old model has non-empty `inflections` on **9,715 of 28,903 rows (33.61%)**; the other **66.39%** already run base-form-only today.

So a B4b-1 that lands **before** the population op moves the matcher from *66.39% of rows base-form-only* to **100%**. That is a real, temporary regression in `missing`-check precision, not a steady state.

**The register already rules the behaviour** (campaign register, B4 block): *"the `missing` check will have no paradigm for roughly three of four terms and must degrade to **base-form matching** rather than reporting a fault."* **This design adopts that ruling and adds nothing to it** — see §5, where the degradation turns out to need no code.

**D2 is only about ORDER**, and the lead should say which:

- **D2-a** — population op **is a precondition** of B4b-1. No regression window.
- **D2-b** — B4b-1 lands first; the window is accepted and stated in the PR. **[inferred]** the window's cost is bounded and reversible, since the op is idempotent and can run any time.

**Recommendation: D2-a.** The op is a 3-second-to-schedule data run on B2's precedent, the deploy is already done, and it removes an acceptance criterion rather than adding one.

---

## 5. D3 — the "no paradigm" degradation needs NO new code, and that is a measurement

**[measured-here]** `buildInflectionRegex(icelandic, [])` produces a **correct base-form word-boundary regex**, not an empty or never-matching one. The never-matching `/(?!)/` branch is reachable only when the base form itself is falsy.

**[measured-here]** Every case in the Unicode word-boundary block (`terminologyService.test.js:1333+`) passes with an **empty** inflection list, plus controls that must fail and do.

**Therefore the 71.18% BÍN miss rate is an ACCEPTANCE STATEMENT about an already-exercised code path, not a design problem.** No machinery.

**⚠️ BUT BE PRECISE ABOUT WHAT "ALREADY EXERCISED" COVERS — §5 AND §7.1 ARE THE SAME FACT READ IN OPPOSITE DIRECTIONS, AND ONLY ONE READING IS SAFE.** The base-form path's coverage comes from the **Unicode word-boundary block specifically**, and from nothing else. The stripped-fixture experiment in §7.1 proves that the base-form path *runs*; it proves **nothing whatever** about the paradigm path, and in fact demonstrates the opposite — **no committed test anywhere discriminates paradigm-backed matching from base-form matching.** Strip every inflection and the suite is still green.

So the honest statement is two-part: **the degradation needs no new code, and the thing it degrades *from* is unpinned.** B4b-1 must not inherit that. **§7 gate 7** closes it.

⚠️ **Three qualifications, all measured, none of which change that conclusion:**

1. **`resolve()` cannot supply inflections.** **[measured-here]** its Icelandic-term query selects only `id`, `text`, `rank`. Reaching `concept_term.inflections` at all **is new code in B4b-1** — a column added to one `SELECT`, but it must be written deliberately, and it must not be routed through `resolve()`'s pure path (§6.3).
2. **The compiled regex carries the `g` flag** and the existing call site resets `lastIndex` before every `.test()`. **Any caching B4b-1 introduces must carry that reset** or it silently returns wrong answers on alternate calls.
3. **The value `'null'` (the four-byte string) breaks the `row.inflections ? JSON.parse(row.inflections) : []` idiom** — truthy, parses to non-iterable, `[icelandic, ...null]` throws. `'[]'` is safe (truthy, parses to `[]`, yields a correct base-form regex). B4b-0b's producer writes only non-empty JSON arrays, so this is a guard against a *future* writer, not a live defect. **[measured-here]**

### 5.1 ⚠️ The false-FAIL direction is real, but its magnitude is UNMEASURED and must not be asserted

A first measurement claimed the EN side gaining 40,770 strings raises the absolute count of false `missing` issues. **The adversarial pass refuted the mechanism**: `:1625` gates on `!term.isFallback && seg.isContent` and `:1627` on `approvedTranslations.length > 0`, so — **[measured-here]** — only 24 of the golden's 40 matches are even eligible.

**The direction is plausible; the magnitude is unestablished.** **§7 gate 3 measures it rather than predicting it.**

### 5.2 The unit of the `missing` check, stated because every prior figure got it wrong

**[measured-here]** The check fires per **(headword, segment)** *and* requires: the EN span not overlapping an already-consumed range, `!term.isFallback`, `seg.isContent` truthy, and ≥1 approved translation. **Neither 33.61% nor 71.18% is the rate at which the check actually runs base-form-only, and that rate is recorded nowhere.** Any acceptance criterion built on "per (headword, segment)" alone will over-count.

---

## 6. D4 — the id space: `concept_term.id` of the ENGLISH row

### 6.1 What the contract actually is

**[measured-here]** In the browser the matcher's `headwordId` is **write-only**: never persisted, never echoed to the server, never compared across two responses. `showTermPopup` re-finds the match **inside the same payload**.

**⚠️ Corrected by the adversarial pass, and the correction widens the blast radius:** a matcher-produced `headwordId` is serialised into **THREE** response payloads, not one — `GET …/terms`, the **save-path response's `termWarnings`**, and `GET …/terminology-report`'s `violations`. Only `/terms` has a client renderer that reads the id; the other two leak it over the wire unread.

Two hard constraints:

- **It must be a bare numeric literal.** `term-highlight.js:77` raw-interpolates it into `data-term-id` and an inline `onclick`, then compares with `===`. A numeric *string* silently breaks the popup; a composite id (`"c1234:t99"`) breaks the generated JS and makes the attribute an injection site.
- **`concept_term.id` preserves the 1:1 id ↔ English-string contract** that `termAutomaton` documents and relies on. **`concept.id` breaks it silently in three places** — one concept carries many English strings. **[measured-here]**

**D4: the automaton key and the emitted `headwordId` are `concept_term.id` of the `lang='en'` row.** Numeric, 1:1 with the keyword, no client change.

**⚠️ D4.2 — ONE ENTRY PER DISTINCT ENGLISH STRING, NOT ONE PER ROW. The homograph choice belongs to `resolve()`, not to the span tiler.**

**[measured-here], by reading the two functions rather than assuming:** `buildTermAutomaton` accumulates `byKeyword: Map<string, number[]>` and `findFirstOccurrences` iterates `for (const headwordId of automaton.byKeyword.get(hit.keyword))` — so several ids sharing one keyword do **not** silently collapse. Each gets its own first-occurrence entry. Good.

**But that is where the safety ends**, and §7.5 item 5 says the population is a fifth of the corpus: **11,553 of 61,042 EN strings (18.9%, GLOBAL rate) are carried by more than one concept**. Feed one id per *row* into the automaton and two ids match **the same span**; `findTermsInSegments`'s `consumed` tiler then drops the loser, because identical spans overlap. **Which one survives is decided by the order `terms` happens to be in** — a database row order deciding an editorial answer, which is §C18's defect verbatim.

**Resolving a homograph is precisely what `resolve()` exists to do** (domain priority → book preference → head form). So:

- the automaton is built over **distinct EN strings**, one entry each;
- the id carried is the **lowest `concept_term.id` for that string**, purely as a stable numeric handle;
- the winning concept is chosen by `resolve(scope, english)`, **after** the match, not by the tiler.

This also preserves the module's own stated contract — *"one english per headword ⇒ one keyword ⇒ constant length ⇒ begins ascending"* — which is what makes the `<` vs `<=` reduction in `findFirstOccurrences` unambiguous. **⚠️ `concept.id` would break that premise directly** (one concept, many English strings ⇒ one id, many keywords ⇒ tied begins become reachable and the two operators diverge). That is a third and sharper reason to reject `concept.id`, independent of the 1:1 argument above.

### 6.2 One thing that must change, and it is outside `npm test`

**[measured-here]** The E2E suite contains the only cross-response comparison of a matcher id anywhere: it asserts the matcher's `headwordId` equals the `term.id` returned by `POST /api/terminology`. **No concept-model id can satisfy both endpoints.** That spec must change, and **`npm test` will not tell you** — E2E is a separate CI job (CLAUDE.md § Notes for Code Reviewers).

**[measured-here]** `e2e/terminology-multibook.spec.js:68-81` **accepts a 500**, so it goes green if the cut-over breaks the `/terms` route outright. It must be tightened in the same PR or it is an alarm wired to nothing.

**[measured-here]** `server/views/terminology.html:1460`'s `it.headwordId` is **not** a matcher consumer — it is fed by `GET /api/terminology/review-queue`, a different producer over the old tables. **This corrects `test-results/b4b-matcher-cutover-2026-08.md:172`**, which lists that file among the matcher's consumers. Per § One source of truth the correction is recorded here, in the live design, not synced back into the frozen evidence doc.

### 6.3 🔴 D4.1 — THREE disagreeing string identities will be live in one code path, and nothing pins their agreement

**[measured-here], and this is the sharpest technical finding of the session.**

| Site | Fold | Source |
|---|---|---|
| `concept_term` English lookup | **binary-exact**, no fold | `conceptResolver.lookupCandidates` |
| the automaton keyword | **full Unicode `/iu` fold** | `foldString`, `server/lib/caseFold.js` |
| `book_term_preference.english` | **ASCII-only fold** | `nocaseKey`, `conceptResolver.js:49` |

`foldString` and `nocaseKey` are different functions and **disagree on non-ASCII input** — verified on a 13-string probe: they agree on `Accuracy`, `pH` and dotted capital I, and **differ** on `ANGSTROM`, `Ångström`, `ÉLAN`, Greek final sigma, and capital Mu (which `foldString` folds onto the micro sign).

Today this is harmless because the automaton and the term SQL share one array. **After the cut-over, an EN string can be found by the automaton and missed by the concept lookup**, or vice versa. **No test pins agreement between the three.**

**D4.1: B4b-1 must define exactly one lookup identity for the EN side and route all three through it, or prove — with a corpus gate, not an argument — that the three agree on the whole 61,042-string EN corpus.** §7 gate 5.

**⚠️ Do not "fix" this by making `nocaseKey` Unicode-aware.** Its ASCII-only behaviour is deliberate and load-bearing: it must match SQLite's `COLLATE NOCASE`, which is ASCII-only, and migration 048's collision detector groups by SQL `NOCASE` precisely to avoid re-implementing that fold in JS. Changing it re-opens §C18's defect.

---

## 7. Testing and gates

### 7.1 🔴 The C24 golden has ZERO discriminating power over inflections — measured, not suspected

**[measured-here], by experiment.** The C24 fixture was loaded twice — once verbatim, once with **every inflection stripped** — and `findTermsInSegments` run both ways. The baseline reproduces `c24-golden.json` byte-for-byte (a positive control, so the harness is real). **The stripped run is ALSO byte-identical** — same 40 matches, same issues.

**So the repo's flagship migration oracle cannot see the inflection path at all.** **[measured-here]** 324 of the 326 translation entries in the fixture carry no inflections, which is why.

This is the same shape as B4b-0b's three gate defects and the reason this design budgets a review pass for the instruments. **Any B4b-1 claim of the form "the golden still passes, so inflections are fine" is void.**

### 7.2 What survives, what goes green-forever

**[measured-here]** 88 runtime tests are in scope: `findTermsGolden.test.js` 43, `terminologyService.test.js` 32, `findTermsDifferential.test.js` 2, `migration044.test.js` 11.

**⚠️ The green-forever set does not exist yet — B4b-1 CREATES it.** Today `createTestDb()` builds 7 tables and none of the four concept tables, so a cut-over matcher run against it dies **loudly** (`no such table: concept`; and `buildScope` **throws** on the missing `book_domain_priority` rather than returning `{unscoped:'no-priorities'}`). The danger arrives the moment the helper is extended.

| Class | Count | What it is | What B4b-1 owes it |
|---|---|---|---|
| **(a1)** green-forever once tables exist but are **unseeded** | **≥9** | pure *absence* assertions — they pass on an all-empty matcher result | Each must gain a **positive control in the same test** that fails when the matcher returns nothing. |
| **(a2)** green-forever **unconditionally** | 12 | never call the service; assert only the shape of checked-in JSON fixtures | Honest as fixture-shape tests. **Rename so they stop reading as matcher coverage.** |
| **(b)** survives and still means something | the overlap tiler, longest-first precedence, Unicode boundaries, deterministic ordering | | Re-point, do not retire. ⚠️ The **second** tiler test's *mechanism* does not survive — it engineers its inversion via the subject tier partition. |
| **(c)** must change | any-approved semantics, `translations[]`, `status`, the `general` subject | §2 | Rewrite against the new semantics, in the same commit that changes them. |
| **(d)** the 4 automaton-cache tests | 4 | pin the **hash's** properties, never the coupling between the fingerprint's source and the automaton's source | **§7.3.** |

**[measured-here]** `findTermsDifferential.test.js`'s 2 tests survive the cut-over **intact — and that is exactly why they contribute zero evidence that it worked.**

**[measured-here]** All 11 `migration044` tests pass forever after the cut-over while **half of migration 044's own stated rationale becomes false**, and no assertion in the file can see it: `book_domain_priority` is seeded from hardcoded maps, entirely independent of `book_subject_mapping`.

**[measured-here] Two traps in the harness itself:**
- `terminologyService.test.js`'s `beforeEach` clears only the **four old tables**, so concept rows seeded by a ported test **leak forward through the whole file** — and `vitest.config.js` sets `fileParallelism: false`, so a leak poisons every later file too (CLAUDE.md § Notes for Code Reviewers).
- `capture-c24-golden.js`'s refusal guard **measures magnitude, not provenance**, so it would **not** refuse a concept-model recapture — the exact failure its own header warns about.

**[measured-here]** The seam to build on is **`server/__tests__/helpers/freshMigratedDb.js`**, which already runs every real migration and produces all four concept tables; 16 files consume it. Not `terminologyTestDb.js`.

### 7.3 🔴 The automaton fingerprint must move with the automaton

`fingerprintHeadwords` hashes `(id, english)` pairs read from **`terminology_headwords`**. Build the automaton from concept EN strings while the fingerprint still reads the old table and **editorial changes never invalidate the cache** — stale matches for the whole process lifetime.

**[measured-here]** The four existing cache tests pin the hash's properties (including the transposition test) and **would pass either way**. This is B4b-0b's gate-3 hazard (b) reappearing as a *production* bug rather than a gate bug.

**`_automatonCache` is a single module-level slot with no book, no chapter and no connection dimension** — correct today only because the term SQL is unfiltered and all scoping happens after the cache. **[measured-here]** All 13 golden invocations pass one slug, so **no existing test can see a cross-book or cross-connection leak.**

### 7.4 `server/scripts/verify-b4b1-gates.js` — the corpus gates

Built on `scratchCorpus.buildCorpusDb()` (**[measured-here]** 3.0–4.8 s recorded; the ~1.5 h in the usage text is the cost of *re-fetching* the raw directory, which exists at `~/idordabanki-raw-2026-08-07/`, 76 MB, 21 files). Copy `verify-b4b0-gates.js`'s structure: `record(id, verdict, measured)`, an `ok[]` of booleans, an exit-code contract, **and `--self-test`.**

**⚠️ The self-test must CALL the gate functions**, never re-implement their assertions alongside the planted defect — B4b-0b's recorded defect. **Plant every defect in the DATA on a copy of the scratch DB**, never by sabotaging the source.

**⚠️ Assert the corpus totals first and STOP on divergence** — `scratchCorpus.js`'s header mandates it, and b4b0 enforces it (`SETUP FAIL` → `return finish()`), which is what makes a reconstruction admissible.

| Gate | Measures | Its control (expected to FAIL) |
|---|---|---|
| **1** | corpus fidelity: `concept` 70,187 / `concept_term` 192,189 | divergence ⇒ stop before any other gate |
| **2** | EN coverage: every old headword resolves to a `concept_term` EN row | the reverse direction, which must **not** be 100% |
| **3** | **`missing`-issue volume, old vs new, on the same real segments** — §5.1's unmeasured magnitude | a run with the IS side blanked, which must report *more* issues |
| **4** | **the three folds (D4.1) agree across all 61,042 EN strings** | a planted `Ångström`/`ångström` pair, which must be **detected** |
| **5** | **the fingerprint tracks the automaton's source** — mutate a `concept_term` EN row in a **cold child process** and require the automaton to change | a mutation to a table the automaton does not read, which must **not** invalidate |
| **6** | **`[vantar]` never reaches a match or an issue** (D7) | the 201 known concepts, which must all be filtered |
| **7** | 🔴 **the paradigm path is actually reached** — a segment whose Icelandic uses a **declined** form that base-form matching must **MISS** and a stored paradigm must **CATCH** | the same segment with the paradigm removed, which must report `missing`. **This is the discrimination §7.1 proves the whole committed suite lacks.** |
| **8** | **one automaton entry per distinct EN string** (D4.2), and a homograph's winner comes from `resolve()`, not from arrival order | one of the 11,553 multi-concept strings, re-run with the `terms` order **reversed** — the emitted winner must not move |

⚠️ **Gate 5 must use cold child processes via `SESSIONS_DB_PATH`** — b4b0's recorded hazard (b): an in-process re-call against a warm cache re-reads nothing and byte-identity holds whatever the run did. **[measured-here]** `SESSIONS_DB_PATH` works today with zero code change, because `resolveDbPath()` reads it at call time; `verify-b4b0-gates.js` already uses exactly that route and its comment says why.

### 7.5 Memory and latency — a deliverable, not a footnote

**No ceiling exists and none may be derived from C24's.** The code comment is explicit that 264–269 MB is **not the trie's number**; **[measured-here]** the comment says the *split* is unmeasured, so it is also wrong to say the trie's share is nil.

**⚠️ [measured-here] The C24 benchmark's own scale is recorded as TWO different numbers and nobody has noticed:** `terminologyService.js:1527` says **20,073 headwords**, the register says **20,272** twice for the same benchmark, and the RSS ranges differ too (264–269 in code, 262–272 in the register). **Unresolvable from the tree** — there is no committed generator for either population. Logged as a doc defect in §10; B4b-1 must not quote either figure as a baseline.

The measurement plan:

1. **Isolate the trie.** A standalone script: open the scratch corpus, `SELECT` the distinct EN strings for one arm, take a baseline, call `buildTermAutomaton` **and nothing else**. **⚠️ Use `heapUsed` after a forced `global.gc()` under `--expose-gc`, not a bare RSS delta** — `bench-prepare-arms.js` runs two arms sequentially in one process and RSS does not shrink between them, so arm 2's delta is systematically understated while the script prints a ratio from exactly that.
2. **Budget on the BIOLOGY scope** — 47,568 in-scope distinct EN strings, not chemistry's 19,749.
3. **A production-scale old-vs-new A/B is NOT available locally.** **[measured-here]** the concept import writes nothing to the old tables, and the dev DB holds 6 headwords. A *fixture-scale* A/B **is** available — `verify-b4b0-gates.js:131-160`'s `seedC24(db)` already seeds the c24 fixture into a scratch DB's old tables against the real migrated schema. **Say which scale a number came from, every time.**
4. **Scope cache: ≤4 entries, keyed on the domain SET, not the ordered chain.** **[measured-here]** re-derived in code: 6 books → **4 distinct SETS, 5 distinct ORDERED CHAINS**. ⚠️ **The "three independent sources agree" claim is false** — all three reduce to one premise, `server/lib/domains.js`, which migration 047 enforces. The fact stands; its corroboration does not.
5. **[measured-here]** The tie rate **11,553 of 61,042 (18.9%)** is a **GLOBAL** rate over the whole EN corpus, **not** a scope rate. The rate within biology's 47,568 is unmeasured.

---

## 8. Preconditions

1. 🔴 **D1 is answered by the lead.** Nothing is implementable until it is — the options differ in slice *order*, not only in code.
2. 🔴 **The Icelandic-side sizing is measured** (§3): compare old `terminology_translations.icelandic` against `concept_term(lang='is')` on prod, read-only. It is D1's missing input.
3. **D2 is answered** — population op before or after.
4. ⬜ A locally rebuilt scratch concept corpus. Available: `~/idordabanki-raw-2026-08-07/` (76 MB, verified present), rebuild 3.0–4.8 s.
5. ✅ `server/__tests__/helpers/freshMigratedDb.js` exists and produces all four concept tables.

---

## 9. D5, D6, D7 — smaller decisions, recorded so they are not re-litigated

- **D5 — the `alsoInScope` "you used a known alternative" tier.** **Recommendation: ship the DATA in B4b-1, the UI in B4c.** Emit the softer tier as a distinct issue `type`; let the existing renderer ignore an unknown type. It makes §2.2's narrowing measurable in gate 3 without a UI change in a slice whose non-goal is UI.
- **D6 — chapter normalisation.** Normalise at the boundary via `chapterLabel`, and **reject null/undefined rather than casting**. **[measured-here]** the cast is what SQLite already does correctly (`'3'` and `3` return identical rows by column affinity); the hazard is the *sentinel word*: `'appendices'`, `null` and `undefined` all silently return **chapter-0 book-default rows with no throw**, dropping every appendices-scoped override. ⚠️ **Chapter 0 is a sentinel collision** — `buildScope` uses 0 for "book default" while `chapterLabel` says ch00 is a real chapter. Unreachable from the three terminology routes (their `validateBookChapter` rejects `< 1`), but **`routes/pipeline-status.js` declares a *different* `validateBookChapter` whose bound is `< -1`**, so chapter 0 passes there. Do not rely on the guard being global.
- **D7 — `[vantar]` is filtered at the matcher.** §C43: 201 concepts hold the placeholder as their **only** Icelandic term, so it is the head form and `resolve()` returns it with `integrity: []`. Piped into a match it renders as `„X" → „[vantar]" fannst ekki`. ⚠️ **The guard is `res.winner.text`, not `res.text`** — there is no top-level `text`, so the obvious spelling is permanently `undefined` and never fires. Filtering here does **not** close §C43; the corpus defect stays open and still blocks the first `--adopt`.

---

## 10. Logged out of this session — findings that belong to other items

1. 🔴 **DURABLE, and it is a new mechanism for an old failure class: two committed files contain raw NUL bytes, and plain `grep` reports NOTHING for strings they demonstrably contain.** **[measured-here]** `server/services/termMiningService.js` (1 NUL, line 120) and `server/scripts/verify-b4b0-gates.js` (2 NULs, line 272). Control: `grep -n proposeMinedTerm server/services/termMiningService.js` → **exit 1, no output**; `grep -an` → `210: … terminologyService.proposeMinedTerm(`. **No filter was chosen — the file itself causes the blindness**, so this evades the existing "a filter you chose manufactures an absence" heuristic entirely. Every census in this repo should use `grep -a`. → proposed as a CLAUDE.md durable rule.
2. **The C24 benchmark scale is recorded as 20,073 (code comment) and 20,272 (register), with two different RSS ranges, for the same benchmark.** Unresolvable from the tree; no committed generator for either population.
3. **`test-results/b4b-matcher-cutover-2026-08.md:172` lists `server/views/terminology.html` as a matcher consumer. It is not** (§6.2). The doc is frozen evidence; the correction lives here.
4. **§C42 is understated on two axes** (§3): two endpoints write `terminology_translations.inflections`, not one — `updateTranslation`'s `allowedFields` includes `inflections`, so `PUT /api/terminology/translations/:id` (EDITOR) is a second writer §C42 does not name. And its guard protects bytes, not behaviour (§2.5).
5. **Neither wrapper has any direct test coverage.** **[measured-here]** `grep -rn 'getSegmentTerminologyWarnings|getModuleTerminologyReport' server/__tests__/ server/e2e/` → **zero hits**. The two functions whose signatures D6 changes, and which hold the unforwarded `chapter`, are untested.
6. **`lookupTerm` is a second reader of the old `inflections` column** (`t.inflections LIKE ?`), distinct from the matcher and from §C42's write-path gap. ⚠️ A first measurement attributed this to `searchTerms`, which does **not** read inflections — the adversarial pass corrected it.
7. **`tools/fetch_idordabanki.py` writes all three old tables directly into `pipeline-output/sessions.db`**, bypassing `terminologyService`. ⚠️ It is `--execute`-gated with a dry-run default, so it is not a live unattended writer — but it is not archived and not test-only.
8. **`e2e/terminology-multibook.spec.js:68-81` accepts a 500** (§6.2).
9. **`importFromKeyTerms`'s path is §C16(b)'s known `ch`-prefix-on-a-publication-path bug** — the register already owns it; noted because it is why that write path resolves to a directory that never exists.

---

## 11. Where the first measurement was wrong — kept, because the errors are the method

The adversarial pass refuted at least one claim in **every** topic. The ones worth carrying:

- **The strongest finding of the session was an experiment, not an argument.** "The base-form path is well covered because the Unicode tests exercise it" was *reasoning*. Stripping every inflection from the fixture and getting a byte-identical golden was a *measurement*, and it inverted the conclusion (§7.1).
- **Two `[measured]` stamps sat on transcribed numbers.** Every figure the agent re-derived on the scratch corpus reproduced exactly; the two that failed were both recorded numbers copied rather than re-measured. **The rebuild costs 3 seconds.**
- **"Confirmed by three independent sources" reduced to one premise** (§7.5 item 4) — the same shape as *two implementations agreeing rules out transcription error, never a shared premise*.
- **A caller census that fixed a name-grep blind spot introduced a route-scoped one** — it enumerated the two GET routes and missed the **save path** (`POST …/edit` → `getSegmentTerminologyWarnings` → `checkSegmentConsistency`), a third HTTP entry point.
- **A replica built from a premise cannot test that premise** — one measurement hand-built an in-memory table from its own reading of migration 048 and ran raw SQL against it, when the real function (`buildPreferenceMap`) is not exported and could not be called.
- **A count with an unstated window** — "46 write lines" was a ±3-line scan artifact; the real figure is ~29–30 write statements.
- **Two counts presented side by side invited a bijection** — 16 endpoints and 15 functions are not paired 1:1.

---

## 12. Attribution

This design concerns work that builds on BÍN data.

> **Beygingarlýsing íslensks nútímamáls.** Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir. — <https://bin.arnastofnun.is>

🔴 **§C41 remains binding and B4b-1 does not touch it:** BÍN-derived forms must never enter `glossary-unified.json`. **[measured-here]** B4b-1 reads `concept_term.inflections` on the editor path only; it adds no export writer. **Neither export gate would catch a breach** (the producer gate fingerprints shape, the shrink guard measures size), so the constraint is carried by review, not by a gate.
