# D2 — Pre-intake Structural Probe (Design)

**Status:** approved by lead 2026-06-29, ready for implementation plan.
**Roadmap item:** D2 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md)
(Track D — cross-book onboarding; `blocks all` D work). Second biology-onboarding foundation, after D1.
**Guiding directive:** robustness & future-proofing over expedience (`feedback-robustness-over-expedience`).

## Purpose

A **read-only** diagnostic over a candidate book's raw CNXML that flags content-structural risks which
would silently corrupt the book after intake — each check tied to a *proven* failure mode. Output is a
**go/no-go fitness checklist**. Onboarding a book becomes "run the probe, resolve/accept the gaps" instead
of discovering them three pipeline stages downstream.

Deliberately **content-only**: config-file presence is `validate`'s job (D1); structural fidelity is A3's.

## Input & output

- `--book <slug>` → scans `books/<slug>/01-source/**/*.cnxml` (the acceptance-test path).
- `--source <dir>` → scans an arbitrary CNXML folder — a candidate not yet committed to `books/` (true
  pre-intake). Exactly one of `--book` / `--source` is required.
- `--json` machine-readable output; `--verbose` per-file detail; `-h/--help`. CLI style mirrors
  `tools/audit-render-output.js`.
- Exit non-zero on **NO-GO**.

## The checks (each → a known failure)

| # | Check | Detects (failure) | Severity |
|---|-------|-------------------|----------|
| 1 | `<link class="os-embed">` present | exercises resolve to untranslated English; no extraction/translation path (D3) | **BLOCK** |
| 2 | `<iframe>`, or `<media>` whose child is not `<image>` | PhET/YouTube embeds dropped at extract + render (D4) | WARN |
| 3 | any `<term>` used but **zero** `<glossary>` elements book-wide | compiled key-terms page renders empty (D5) | WARN |
| 4 | note `class` ∉ candidate's `book-config.json.noteTypeLabels` (+ `SHARED_NOTE_LABELS`) | note renders an auto-generated English label | WARN |
| 5 | inline child element (in `<para>`/`<title>`/`<entry>`/…) whose tag ∉ the extractor's handled set | element stripped by `stripTags`, semantics lost | WARN |

**Check 3 is a single glossary-absence WARN** (lead decision): it does not separately classify
`<section class="key-terms">` presence — D5 owns choosing the alternative glossary source.

**Check 4 doubles as an onboarding to-do generator:** it lists exactly which note classes the candidate
uses that are not yet in its `book-config.json`, i.e. the `noteTypeLabels` entries the onboarder must add.

## Go/no-go model

- **BLOCK** = known content corruption with no path → any BLOCK ⇒ overall **NO-GO** (exit 1).
- **WARN** = degrades but recoverable/trackable → **GO-WITH-GAPS** (onboard, track the gap).
- No findings → **GO**.
- Severities track the audit: os-embed = critical (#20); iframe (#22/#35); checks 3–5 medium/low.

## Known baselines (the "unknown" detectors)

- **Note classes (check 4):** the candidate's `book-config.json.noteTypeLabels` keys ∪ `SHARED_NOTE_LABELS`.
  In `--source` mode with no `book-config.json` yet, compare against `SHARED_NOTE_LABELS` only and report
  every book-specific class as "to configure".
- **Inline elements (check 5):** flag a text-container's direct element child only when its tag is in
  **neither** `HANDLED_INLINE` (emphasis, sub, sup, link, term, footnote, newline, space, math) **nor**
  `HANDLED_BLOCK` (figure, list, media, table, equation, … — block elements OpenStax legitimately nests
  inside `<para>` and the pipeline builds). Both are explicit, documented constants; the pipeline exposes
  no single importable list — see the drift caveat in Out of scope. *(HANDLED_BLOCK was added after the
  real-data smoke test showed block-in-para nesting; genuine unknowns like `span`/`quote`/`foreign` still
  surface.)*
- **Note classes (check 4) mirror render's resolution:** a class is "configured" if a known key equals it
  **or is a substring of it** (so the compound `chemistry chemist-portrait` resolves via the un-prefixed
  key `chemist-portrait`), matching `getNoteTypeLabel`.

## Architecture (isolation)

- **`tools/lib/preintake-checks.js`** — pure check functions, each
  `checkX(cnxml, ctx) → { status: 'ok'|'warn'|'block', count, samples: string[], items: string[] }`.
  No I/O; unit-tested on inline-CNXML fixtures.
- **`tools/preintake-probe.js`** — thin CLI: resolve source dir, glob `**/*.cnxml`, run each check per
  file, aggregate per-book (load `book-config.json` for check 4's baseline), print the checklist (+ JSON),
  exit non-zero on NO-GO. Mirrors `audit-render-output.js`.

## Testing

- Unit tests per check function: each fires on a positive fixture and stays clean on a negative one
  (os-embed present/absent; iframe vs image-only media; term-with-glossary vs term-without; configured vs
  unconfigured note class; handled vs unrecognized inline element).
- **Acceptance test** (the plan's criterion, automated): run the probe over all 5 in-repo books and assert
  it reproduces their known gaps — efnafraedi-2e → GO; lifraen-efnafraedi (organic) → NO-GO (os-embed) +
  glossary WARN; edlisfraedi-2e (physics) & liffraedi-2e (biology) → iframe WARN; orverufraedi
  (microbiology) → glossary WARN.

## Out of scope (deliberate — documented per `feedback-log-out-of-scope-issues`)

- **Auto-fixing / mutating anything** — the probe is strictly read-only; it *detects*, never repairs.
- **Config-file presence** (missing `book-config.json` / `collection-order.json`) — owned by `npm run
  validate` (D1 PR-B). D2 does not re-check it.
- **Structural fidelity** (element-count / MathML / drop detection) — owned by A3
  (`cnxml-render-fidelity-check.js`). D2 is a *shape* probe, not a fidelity diff.
- **Implementing the translation/render paths for the gaps it finds** — os-embed extraction (D3), iframe
  extract+render (D4), alternative glossary extractor (D5) are their own scheduled items. D2 only flags
  the need.
- **Check-5 baseline drift risk** — `HANDLED_INLINE` is a hand-maintained mirror of the extractor's
  handled inline tags because `cnxml-extract.js` exposes no single importable list. If the extractor's
  inline handling changes, the probe can over/under-report unrecognized inline elements until the constant
  is updated. Logged to the out-of-scope register for the lead to weigh a future "single source of inline
  tags" refactor.
