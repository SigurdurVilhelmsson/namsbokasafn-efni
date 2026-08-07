# MT glossary adherence — measurement (design)

**Date:** 2026-08-07 · **Register item:** new, feeds §C14 ② · **Baseline:** main `a46df553`
· **Status:** design — the measurement itself was performed 2026-08-07 during feasibility
work; this spec exists to make it **re-runnable, recorded and citable**, not to plan it.

---

## 1. What this is for

Everything the project wants to build on top of terminology — a per-book preferred term,
a resolver, an editor override, a post-hoc term sweep — rests on one unmeasured premise:

> **Does Málstaður actually honour the glossary we send it?**

Nothing in the repo answered that. `loadGlossary`/`formatGlossary` build the payload and
`--no-glossary` exists to suppress it, but there is no `test-results/` artifact for
adherence the way `api-marker-survival.md` exists for markers. CLAUDE.md's standing rule
is that API evidence is **per-endpoint** and must never be generalised; adherence had no
evidence at all, per-endpoint or otherwise.

The premise matters in a specific way that is easy to state backwards. The pre-MT term
choice is worth making **not because it is likely to be right**, but because it makes the
output **uniform** — and uniformity is what makes a later reversal a mechanical sweep
instead of an archaeology project. A consistently wrong term can be swept; a mixture of
*frumeind* and *atóm* scattered across a chapter cannot, because you cannot enumerate
what you never controlled.

**Non-goal:** this design does not choose any term, change any schema, or touch the
resolver. Those are the follow-on piece ("term resolution"), which gets its own brainstorm
cycle. This spec measures one fact and records it.

## 2. The result (already obtained)

### 2.1 Design — the control is built in

The measurement uses the **96 chemistry headwords that (a) carry more than one non-rejected
translation, (b) occur in the book's English source, and (c) had exactly one side of the
competition present in the glossary actually sent.** Both Icelandic terms are attested
Íðorðabankinn entries, so the machine had a genuine choice, and **the rival term is what
should appear if the glossary were ignored.**

This is why the design was changed mid-feasibility. The first design compared two books —
`efnafraedi-2e` (glossary on disk since 2026-03-11) against `orverufraedi` (no glossary
file until 2026-08-03), both MT'd 2026-06-30. It was abandoned on measurement: only **57**
glossary headwords occur in both corpora, and microbiology's English is **176,994**
characters against chemistry's **3,997,830** — 4.4%. Recorded because the reasoning
generalises: *a natural experiment with a plausible control can still be too thin to run,
and only counting tells you.*

⚠️ **Both figures in the paragraph above count `*.en.md` files only**, which is the
comparable unit for two books. §2.2's `02-for-mt` figure counts **every `*.md`** in the
tree and is therefore larger for the same book. The two are not interchangeable, and the
tool must label which filter produced any character count it prints — an unlabelled size
is the shape that later reads as a contradiction.

A second candidate control was also measured and is **empty**. The idea was to compare
chemistry DB terms that occur in the English source and **were** sent against those that
occur and **were not** — same corpus, same run, same API, differing only in glossary
membership. There is no second group: **546 such terms occur in the source and all 546
were sent; 0 were not.** Re-checked under `approvedOnly: true` — the restriction that
actually applied — and the split is unchanged, because all 546 are approved.

That emptiness is precisely why the competing-pairs design is the only viable control here,
and it is recorded so nobody re-derives it. ⚠️ It also disposes of the tempting headline
this corpus offers: **adherence over those 546 sent terms is 81.3% exact / 91.0% stem —
and it means nothing on its own**, because there is no unsent group to compare it against.
A term may match the glossary because the glossary was honoured or because it was the
obvious translation, and with an empty control those two are indistinguishable. *A number
with no control is not a weak measurement; it is not a measurement.*

### 2.2 Corpus

| | |
|---|---|
| Book | `efnafraedi-2e`, 139 modules |
| MT run | 2026-06-30, `tool: api-translate` per `*-provenance.json` |
| Glossary on disk | committed 2026-03-11 (`5db701c9`), 1,117 terms / 617 approved |
| Actually sent | **approved only** — `approvedOnly: true`, `tools/api-translate.js:647` — 602 headwords |
| English source | `02-for-mt`, 4,831,806 chars (**all `*.md`** — cf. §2.1's `*.en.md`-only figure) |
| MT output | `02-mt-output`, 3,454,750 chars (all `*.md`) — **read only, never written by this work** |

### 2.3 Two methods, opposite biases

| Method | Glossary term used | Rival used | Decisive of 96 | Adherence |
|---|---:|---:|---:|---:|
| Exact + listed inflections | 66 | **0** | 66 | 100% |
| Stem (6-char prefix), inflection-blind, both sides | 28 | **2** | 30 | **93.3%** |

The exact method is **biased toward the glossary side by construction**: sent rows carry
inflections 34.7% of the time, rival rows only 22.9%, so sent terms are simply easier to
find. The stem method removes that bias and pays for it in precision.

**Headline: adherence is 93.3%–100%, and the low end is unconfirmed.** Both stem
rival-wins fail inspection:

- `gibbs free energy` — sent *Gibbs fríorka*; "rival" *fríorka Gibbs*. **The same words
  reordered**, not a different term.
- `node` — sent *nóða*; "rival" *hnútur*. **`hnútur` is an everyday Icelandic word**; a
  6-character stem hits it in ordinary prose.

### 2.4 Counting unit — state it or the number goes stale wrong

**93.3% is "of the 30 headwords the stem method could discriminate"**, not "of all terms"
and not "of all occurrences". 64 of 96 collapsed into *both present* and were discarded.
Per CLAUDE.md's census rule the unit is part of the number. This matters here specifically:
§C14's "chemistry is 124 decisions" was a *correct count whose meaning nobody re-derived*,
and this spec should not manufacture a second one.

### 2.5 What the result closes on its own

The premise "the chemistry run actually sent a glossary" could not be proved directly —
`*-provenance.json` records only `{schemaVersion, tool, generatedAt}`, never glossary use,
and the file's presence on disk is necessary but not sufficient (`--no-glossary` exists).
**66–0 toward the sent side cannot occur if no glossary was sent.** The result retroactively
establishes its own premise.

### 2.6 Verified corrections made during the measurement

Recorded because each could have shipped a wrong number:

1. **`approvedOnly: true`** — the first run built the sent-set from all 772 usable
   headwords in the file. Only 602 approved ones were sent. **Re-run under the restriction:
   identical, 28/2/64/2.** The correction did not move the result, and that is worth
   recording, not omitting.
2. **The inflection-coverage bias** was suspected and then confirmed (34.7% vs 22.9%). The
   naive run reported **100%**; the bias-corrected run reports **93.3%**. Reporting only the
   first would have been a measurement that passed for the wrong reason.

## 3. Deliverables

### 3.1 `tools/measure-glossary-adherence.js`

The scratchpad analysis, made re-runnable and committed. Requirements:

- **Read-only.** Reads `02-for-mt`, `02-mt-output`, a committed glossary (optionally at a
  given git rev), and a terminology export. Writes nothing under `books/`.
- **Both matching modes in one run**, reported as a bracket. Never emit a single adherence
  figure without its counting unit and its discard count.
- **Flags declared in `parseArgs`** and nowhere else — CLAUDE.md records that
  `tools/lib/parseArgs.js` silently drops unknown flags, so an undeclared flag is a
  no-op, not an error.
- Resolve paths against `import.meta.url`, never `process.cwd()`.
- Take the terminology snapshot as an **input file**, not a live DB read, so the tool runs
  on a dev box with no production database.

### 3.2 Per-segment predicate

Corpus-level presence ("the term appears somewhere in 3.4M characters") is what forced 64
cases into *both present*. Add the predicate a reader will assume: **for each segment whose
English contains the headword, does that segment's Icelandic contain the glossary term?**

⚠️ **The `SEG` marker takes no space after the colon.** `<!-- SEG:m001:para:fs-id1 -->`
parses; the spaced form parses to `[]` — an empty list, silently, not an error. Prose across
this repo writes it spaced for readability. **Verify any fixture against the real parser
before building on it.**

This sharpens the number; it does not change the decision, which the comparative design
already settles.

### 3.3 `test-results/mt-glossary-adherence.md`

Follows `api-marker-survival.md`'s precedent, and carries the same mandatory caveat:

> This measures **`/v1/translate`**, on the model behind it on **2026-06-30**. It
> generalises to no other endpoint and to no later model. Miðeind's commercial tools carry
> an LLM layer and the model behind them changes — `/v1/grammar` corrupts markers that
> `/v1/translate` preserves.

### 3.4 Record the durable fact

The register (feeding §C14 ②) and project memory `[[malstadur-api]]` both gain the finding.
Neither restates the numbers — they point at the artifact, per CLAUDE.md § *One source of
truth*.

## 4. What follows from the result

A decision rule was **fixed in advance of seeing any number**: floor ≥ 70% → the glossary
is honoured and the term-resolution work is justified; ≤ 40% → pivot to flag-and-review;
between → run a paid controlled A/B.

**The worst-case floor is 93.3%. The rule fires: the glossary is honoured.** No paid A/B is
needed, and the follow-on term-resolution piece is justified on pre-registered evidence.

Two consequences worth carrying into that piece:

- **C18 currently omits contested terms from the MT request.** For all 124 competing
  chemistry headwords, Málstaður is receiving no guidance today and choosing per segment.
  Given adherence this high, that is not a neutral safe default — it is actively forfeiting
  control over the one property that makes a reversal cheap.
- **A term reversal during editing does not need new write machinery.**
  `buildModuleTerminologyReport` already reports *"approved terms still violated in the
  module's to-be-published content, grouped by term — advisory, no block"*, so flipping the
  preferred term makes every affected segment surface for the editor automatically. An
  automated sweep is the better end state but is gated on inflection coverage: only
  **9,715 of 28,903** translations (33.6%) carry inflections, and in Icelandic a
  base-form-only sweep under-replaces **silently**, leaving a half-swept book that reads as
  finished.

## 5. Testing

- Unit tests for both matchers against fixtures with a **known** answer, including a case
  the stem matcher is expected to get **wrong** (a common Icelandic word as rival) — the
  `node`/*hnútur* shape, pinned so the method's known weakness cannot be quietly "fixed"
  into invisibility.
- A test asserting the tool **never writes** under `books/`.
- The bias check is itself a test: assert the reported bracket has both ends, and that a
  single-figure output is impossible.
- ⚠️ **Mutation-verify the discrimination logic.** The finding here rests on 28 vs 2; a
  matcher bug that silently classified everything as *both present* would produce an empty
  decisive set and a vacuous pass. Assert a **non-zero** decisive count.

## 6. Non-goals

- Choosing any term, for any book. That is §C14 ②'s editorial work.
- Any schema change (`book_term_preference` and per-book precedence belong to the
  follow-on piece).
- Re-translating anything. `02-mt-output` is 🔒 READ ONLY, and `api-translate.js` has **no
  `--output-dir`** — verified against its `parseArgs`; its flags are `--force --dry-run
  --no-glossary --rate-delay --max-chunk --update-status`. A "safe rehearsal into a scratch
  directory" would run at full strength over the real tree.
- Measuring any endpoint other than `/v1/translate`.
