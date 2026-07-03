# Design — fresh-output order-cause characterization

**Date:** 2026-07-03. **Status:** design — awaiting lead review.
**Type:** read-only measurement tool + committed analysis report. **No** gate flip, allowlist, or
extraction/inject change.

Part of the chemistry clean-slate oracle-hardening gate
(`docs/plans/2026-07-01-chemistry-clean-slate-design.md`). Gate item 2 is "promote the id-order/LCS
check warn-only → hard-fail." Investigation showed that is **not** a one-line flip: on *fresh*
(post-F1, post-F4) inject output the order check still flags reorders from causes beyond the
section-order bug F1 fixed. This deliverable produces the grounded per-cause breakdown that decides,
for each cause, whether it is benign (filter) or a real bug (fix) — before any gate change.

Branched off `feat/chem-f4-table-double-model` (PR #223) so the measurement reflects the post-F4
pipeline (F4's table dedup changes element order for 6 modules); rebase when #223 merges.

## Why this exists (the finding that reframed gate item 2)

The order check (`cnxml-fidelity-check.js` `compareElementOrder`, added warn-only by F1) currently
flags **51 / 149** efnafraedi modules against the *committed* `03-translated`. But:
- Its **exit code gates nothing automated** — it is a manual CLI, absent from `npm test` and CI;
  consumers import the `compareTagCounts` function, not the CLI exit. So a bare flip protects nothing
  on its own; the value of a hard gate is against *fresh* output (WS5 re-inject, biology).
- The 51 are measured on **stale** committed output that WS5 wholesale-replaces. Measuring *fresh*
  output (in-memory `extractSegments` → `buildCnxml`, no writes) split them into two populations:
  a **transient** set (the section bug — F1's fix collapses it: m68702 75→**0**) and a **persistent**
  residual set that survives F1 (m68710 125→39, m68833 94→9, m68814 2→2). Spot-checks show the
  residual moved ids are `<equation>`, `<term>` (glossary), and `<media>` — i.e. **≥3 more reorder
  causes** distinct from the section bug.

Designing an allowlist or a flip against the 51 stale modules would target a baseline WS5 deletes.
The correct object of study is the **persistent residual on fresh output**, bucketed by cause. This
tool produces that.

## What it does

For each module in a book:
1. Read `01-source/<ch>/<module>.cnxml`.
2. In memory: `extractSegments(source)` → round-trip segments via
   `formatSegmentsMarkdown` → `parseSegments` → `buildCnxml(...)` (the exact F4 Task-5 harness).
3. `compareElementOrder(source, fresh)` → the list of moved ids (out of relative document order).
4. For each moved id, classify by its **source element type**: match `<(\w[\w:-]*)\b[^>]*\bid="<id>"`
   in the source CNXML → the tag name (`equation`, `term`, `media`, `note`, `table`, `figure`,
   `para`, `list`, `section`, `exercise`, `example`, `link`, …). The element type is the proxy for
   the responsible extract/inject code path (the "cause").
5. Aggregate: per-cause totals (# modules touched, # moved ids) and a per-module summary
   (module → total moved, breakdown by element type).

**Read-only, in-memory.** Writes nothing under `books/`. No committed pipeline artifact changes.

### Classification notes
- A moved id that appears on a `<term>` element → **glossary/term-block** cause.
- `<equation>` → **block-equation positioning** cause.
- `<media>` → **inline-media positioning** cause.
- An id whose tag can't be resolved in source (should be rare) is bucketed as `unresolved` and listed
  explicitly — never silently dropped (fail-loud on surprising input).
- The tool reports, separately, the modules whose fresh output is **fully clean** (moved=0) — these
  are the transient/section-bug wins, confirming F1 and bounding the real problem set.

## Components & isolation

| Unit | Purpose | Depends on |
|---|---|---|
| `tools/analyze-order-causes.js` (new) | per-module fresh build + moved-id classification + aggregate | `extractSegments`, `formatSegmentsMarkdown` (`cnxml-extract.js`); `buildCnxml`, `parseSegments` (`cnxml-inject.js`); `compareElementOrder` (`cnxml-fidelity-check.js`) |
| `classifyMovedIds(source, movedIds)` (exported pure fn, in the tool) | map each moved id → source element tag; return `{ tag: count }` + `unresolved[]` | — (pure, unit-testable) |
| report `docs/audit/2026-07-03-fresh-order-cause-breakdown.md` (committed) | the run's findings + per-cause triage recommendation | tool output |

The pure `classifyMovedIds` is the one piece with real logic → it is exported and unit-tested in
isolation; the CLI orchestration around it is thin.

## CLI

```
node tools/analyze-order-causes.js --book <slug> [--chapter <n>] [--module <id>] [--json]
```
- `--book` required (parameterized so biology can reuse it; run/report only efnafraedi-2e now).
- default: human-readable summary to stdout (per-cause table + per-module lines + clean-module count).
- `--json`: machine-readable aggregate (for re-running as causes get fixed, to watch the residual
  shrink).
- Resolve `books/` against `import.meta.url`, never `process.cwd()` (project rule; the server runs
  cwd=`server/`).
- Exit 0 on successful analysis regardless of how many reorders are found — this is a **diagnostic,
  not a gate** (the gate decision comes later, informed by its output). Exit non-zero only on a real
  error (unreadable source, build throw).

## Testing

- **Unit (`classifyMovedIds`)**: a synthetic source with `<equation id=e1>`, `<term id=t1>`,
  `<media id=m1>`, `<para id=p1>` and moved-id list `[e1, t1, x-unknown]` → returns
  `{ equation: 1, term: 1 }` and `unresolved: ['x-unknown']`. One assertion per behavior.
- **Integration (small, real)**: run the analyzer on one real module known to be fully clean on fresh
  output (m68702) → asserts moved=0, no causes; and one known-residual module (m68814) → asserts its
  moved ids classify to the expected tags (`equation`, `media`). Uses the in-memory harness, no writes.
- The tool must not write under `books/` — assert (or structurally guarantee) that.

## Definition of done

- `tools/analyze-order-causes.js` runs on `--book efnafraedi-2e` and prints a per-cause breakdown +
  per-module summary + clean-module count; `--json` emits the aggregate; `classifyMovedIds` unit-tested;
  a small real-module integration test passes.
- `docs/audit/2026-07-03-fresh-order-cause-breakdown.md` committed, containing: the per-cause table
  (element type → # modules, # moved ids) for all 149 modules on fresh output, the clean/transient vs
  persistent split, representative modules per cause, and a **per-cause triage recommendation**
  (benign→filter candidate vs real-bug→fix candidate) — the input to the next decision.
- `npm test` + `npm run validate` green from repo root. No committed `books/` bytes changed.

## Explicitly out of scope

Gate flip, order-allowlist, `compareElementOrder` filtering, and any extraction/inject fix for a
reorder cause. Those are downstream of this report's findings and each their own item.

## Workflow

brainstorming → writing-plans → subagent-driven-development; one PR off `feat/chem-f4-table-double-model`
(rebase to main when #223 merges); TDD for `classifyMovedIds`; `npm test` from repo root is the gate.
Log any out-of-scope finds to `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`.
