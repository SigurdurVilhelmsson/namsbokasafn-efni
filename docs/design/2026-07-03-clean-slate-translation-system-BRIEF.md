# Task: Clean-slate, first-principles design spec for the CNXML→Icelandic translation system

> **This file is a BRIEF (a prompt for a fresh session), not the design itself.** Point a new session
> at this file. Its job is to produce `docs/design/2026-07-03-clean-slate-translation-system-design.md`.

You are designing, from the ground up, the *ideal* best-practice architecture for a system that
translates OpenStax textbooks from English to Icelandic:

    CNXML-English  →  Erlendur (Miðeind "Málstaður") API  →  CNXML-Icelandic  →  editorial review + HTML publication

Then you compare that ideal design to the system that already exists in this repo, and document how
they correlate — what the current system got essentially right, what is historical sediment, and
whether a re-architecture would be worth it.

## HARD CONSTRAINTS — do not violate
- **READ-ONLY except for the design doc you write.** Do NOT edit or run any pipeline code
  (extract/inject/render/api-translate), do NOT modify anything under `books/`, `tools/`, `server/`,
  and do NOT call the Erlendur API for real (no spend; `--dry-run` only if you must, but you should
  not need to run anything). Your ONLY writes are new markdown file(s) under `docs/design/`.
- This is an **analysis + design deliverable**, not an implementation. Produce a written spec. Do not
  build, fix, or refactor anything.
- Cite file:line evidence for every claim about the current system or the API. Verify facts from
  source; the summary below is a starting map, not gospel.

## The two givens to study first (design BEFORE anchoring on the current pipeline)
To avoid anchoring bias, first derive the ideal design from ONLY these two inputs, and write it down,
*before* you read the current pipeline's internals in depth:

1. **The Erlendur API.** Read `tools/lib/malstadur-api.js` in full and
   `test-results/api-marker-survival.md`. Known facts (verify): it is a **plain text-in / text-out**
   translator — `POST /v1/translate` (sync, ≤10,000 chars), `POST /v1/translate/tasks` + poll (async),
   JSON body `{text, targetLanguage, glossaries}`; server-side glossaries with `{sourceWord, targetWord}`
   pairs; price 1 ISK / 100 chars. **There is no HTML/XML/document mode** in the client. Empirically it
   **preserves inline delimiters** — `[[TYPE:content]]` bracket markers, `<!-- SEG:id -->` comments,
   `[[MATH:N]]` — at ~98.6–100% survival. Treat "what structure can ride through the API intact" as an
   empirical capability you reason about, and note where you'd want to *probe* it (design the probe;
   don't run it).
2. **The source format, CNXML.** Read 2–3 real modules, including the hard ones below. Note that a
   `<para>` is **mixed content**: text interleaved with `<emphasis>`, `<m:math>`, `<link>`, `<sub>`,
   `<sup>`, `<term>`. Note that the files carry `id`/attributes and that **remerge-grade fidelity to
   OpenStax** matters — attribute order and whitespace of *untouched* regions, not just tag structure.
   Sample sources: `books/efnafraedi-2e/01-source/ch03/m68702.cnxml`,
   `books/efnafraedi-2e/01-source/ch12/m68789.cnxml`.

From those two inputs alone, design 2–3 candidate architectures (e.g. in-place DOM text-node
translation; protected-skeleton markers that ride through the API; whole-document protected
translate). For each, state what it sends to the API, what it gets back, and how it produces
Icelandic CNXML.

## Then study the current system and correlate
Only after writing your from-scratch design, read enough of the current pipeline to correlate:
- `tools/api-translate.js` (header + flow), `tools/cnxml-extract.js`, `tools/cnxml-inject.js`,
  `tools/cnxml-fidelity-check.js`.
- The re-prioritization history and bug catalogue:
  `docs/audit/2026-07-02-fable5-fidelity-provenance-review.md`,
  `docs/plans/2026-07-01-chemistry-clean-slate-design.md`,
  `docs/plans/2026-07-02-f1-extract-section-order-design.md`,
  `docs/plans/2026-07-02-f456-marker-residue-design.md` (esp. its "Split outcome" section).

Key facts about the current system (verify): it holds **three parallel representations** of each
module — flat segments (`02-for-mt/*-segments.en.md`), a structure sidecar
(`02-structure/*-structure.json`), and the original CNXML — and **reconciles them at inject** to rebuild
Icelandic CNXML. Historically it grew by accretion: Word docs → manual upload → Markdown → manual
upload → de/reconstruct CNXML, re-plumbing each turn. **Every hard bug in the recent clean-up lives in
that reconstruction step**: F1 (section content reordered), F4 (a table double-modelled as both a
structure element and an inline `[[TABLE:]]` ref → duplicates on rebuild), F5/F6 (inline marker residue),
nested para/list.

## Guardrails against the obvious traps (a rigorous design must address all of these)
1. **Honest bug scorecard, not a sales pitch.** Inline mixed-content protection (the F5/F6 class —
   protecting `<emphasis>`/`<math>`/`<link>` through a text API) is **intrinsic to ANY text-API
   design** and does NOT go away in a rewrite. Block-reconstruction bugs (F1/F4/nested) are the ones a
   structure-preserving design can eliminate. Score each candidate as "kills X, keeps Y" — expect
   roughly 3-of-4, and say so. Overclaiming "eliminates all the bugs" is a failure of this task.
2. **Byte-level fidelity risk.** A full DOM parse→serialize can normalize/reflow *untouched* regions
   (attribute order, whitespace, entity encoding), which would **hurt** OpenStax remerge even while
   fixing structure. The current pipeline dodges this by extracting-from-original. Any candidate must
   state how it preserves untouched bytes, and your validation plan must *measure* it.
3. **The editorial product is real.** Segment-level review, translation memory, concordance, and
   terminology priming are the actual deliverables, not incidental. A design that "just translates the
   DOM" must still yield reviewable EN↔IS segment pairs. The strongest framing to evaluate: **CNXML DOM
   as the single source of truth, with segments as a non-destructive *view/projection* over its text
   nodes** — one representation, not three.
4. **The decision criterion is BIOLOGY, not elegance.** This whole effort exists to onboard biology (and
   ~3 more books) cleanly. The current pipeline is ~80% cleaned (F1/F2/F5/F6 done; F3 + F4 remain — ~2
   PRs). A rewrite resets *known* bugs to zero but not *actual* bugs to zero. So the question your
   recommendation must answer is: **would onboarding biology + the next books be *dramatically* cheaper
   on the ideal design than on the now-mostly-fixed current one?** If merely comparable, the honest
   recommendation is "finish F3/F4, onboard biology, revisit later."
5. **Name your bias.** Anyone reviewing this is primed to cast "inject" as the villain. Your validation
   plan must be **measured against an oracle, not intuition**: `tools/cnxml-fidelity-check.js`
   (`compareTagCounts` + `compareElementOrder`) already lets you translate a module both ways and diff.
   Design (do not run) a spike that runs the **hard modules** through that oracle:
   - `m68789` — table-in-exercise (the F4 double-model): does the ideal design handle it with zero
     special-casing?
   - `m68811` — nested `[[i:[[link:…]]]]`: proves the inline-marker problem you still own.
   - `m68702` or `m68833` — interleaved prose + subsection (the F1 reorder case).
   And it must measure byte round-trip of *untouched* nodes.

## Using Fable
You may dispatch the Fable model (`model: "fable"`) where it adds value — e.g. generating 2–3
*independent* from-scratch architectures in parallel (diversity), then an adversarial critique pass that
tries to *break* each candidate against the hard cases and the byte-fidelity risk. Synthesize; don't
just concatenate. Keep spend proportionate to a design memo.

## Deliverable
Write `docs/design/2026-07-03-clean-slate-translation-system-design.md` containing:
1. **Erlendur capability model** — what the API can and cannot do; what structure survives it.
2. **From-first-principles design** — the ideal architecture (2–3 candidates → a recommended one),
   derived from CNXML + the API, with data flow.
3. **Honest bug scorecard** — per candidate, which bug classes it eliminates vs. inherits (with the
   F5/F6-is-intrinsic point made explicitly).
4. **Byte-fidelity analysis** — the parse→serialize normalization risk and how the design handles it.
5. **Correlation with the current system** — what the current design got essentially right, what is
   accretion sediment, what is irreducible essential complexity.
6. **Validation plan (spike design, NOT executed)** — the oracle-measured experiment on the hard
   modules, including the byte round-trip check and go/no-go thresholds.
7. **Recommendation** — framed on the biology-onboarding economics of guardrail #4, with an explicit
   "don't rewrite if…" condition. Flag your own inject-is-villain bias.

Keep it evidence-based and decision-useful. The point is to know whether a fresh design is worth it —
not to assume it is.
