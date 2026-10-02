# §C140 ㊵ branch review — 2026-10-02

> **FROZEN EVIDENCE — banner-dated 2026-10-02.** Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊵ and ㊻). The design under review is
> [`docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`](../../../../docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md).
> The design-stage evidence is in the sibling [`2026-10-01-c40-design/`](../2026-10-01-c40-design/README.md).

These are the three reviews the `feat/c140-c40-retire-and-alias` branch passed before its PR, all taken at `c2a4d5f74`.

**Cost:** 0 ISK. Nothing was bought, written under `books/`, or synced. Every run was read-only or ran on throwaway
fixtures. The mutation runs changed one code file at a time and restored each from a golden copy, checked with `cmp`.

## What is here

| file | what |
|---|---|
| `final-review.md` | The final whole-branch review: 0 Critical, 1 Important, 8 Minor. The Important one, I1, was that `--retire` read a mapping missing from the working tree as "no rows". It also triages the 57 minors deferred by the per-task reviews: 7 must-fix, 2 to log, 48 to drop. |
| `lens-review.json` | The four-lens adversarial review: resolver, deletion safety, reference predicate and test vacuity. Each lens reviewer's findings come with an independent verifier's verdict. There were 23 findings and all were CONFIRMED; after verification, DS-1 and F2 were Important. It also proposes 29 candidate mutants. |
| `mutation-pass.md` | The mutation pass on the real tree: 129 mutants, of which 92 were killed and 37 survived (31 real gaps, 6 equivalent); 0 timed out. Its §7 lists the tests to add. |

## What happened next (in git, not here)

- **The fix wave.** One fix wave of 8 commits, `82172e2df`…`055f76ea3`, took:
  - every lens finding (F4 and F7 by a documented no-change);
  - I1;
  - the 7 must-fix minors and four optional ones.

  It added a test for every real-gap survivor and saw each one fail against its mutant first.
- **The re-review.** It re-planted 47 mutants on the real checkout and the tests caught 46. The last, a write-only retire
  over a dirty mapping, was closed by `edf3bcf21`.
- **The local gate at `edf3bcf21`:**
  - `npm test`, lint, `format:check` and `docs:check` are clean;
  - 25 of the 26 composer Python suites pass. `test_figrings` was not run: its corpus sweep is §C140 ㊸.

## How it was produced

- `lens-review.json` is the return value of a Workflow run with 8 agents: a reviewer and a verifier per lens. Every agent
  was read-only on the repository and confirmed `git status --porcelain` empty at the end.
- `final-review.md` and `mutation-pass.md` are single agents' reports.
- **Each file is the agents' output as written, with one change:** absolute local paths were replaced with
  placeholders, because this repository is public.
  - `<repo>` is this repository's checkout.
  - `<scratch>` is the session's temporary directory.
  - `<td>` in `lens-review.json` is the verifiers' own placeholder for a throwaway tree.
- The scratch artefacts the files cite were not kept: probe scripts, harness copies and golden copies. They lived
  outside the repository and are not needed to read the conclusions.
