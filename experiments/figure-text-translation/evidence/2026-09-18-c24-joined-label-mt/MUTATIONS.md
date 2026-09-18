Evidence, frozen 2026-09-18 — §C140 ㉔ branch at 86cc7720e. Status lives in the campaign register.

## Discipline

Before the first mutation of each file: `cp <file> .superpowers/sdd/2026-09-18-c140-c24-joined-label-mt/mut/golden-<name>`.
Each mutant: apply minimal edit → `timeout 300 npx vitest run <test file>` → record red/green + first failing
test name → restore with `cp <golden> <file>` (never `git checkout --`) → `cmp <golden> <file>`.

Two of the nine target test files carry pre-existing floor failures unrelated to this branch's own
suite (the `main` floor at merge-base f5dcfe9e5 is 13 failed files / 36 failed tests of 6667 —
`/home/siggi/dev/repos/efni-wt-c24-floor.vitest.json`). Where that applies (M6, `figure-run-free.test.js`),
"red" is judged as **the mutant adding a new failure on top of the pre-existing baseline**, not as the
file going from all-green to some-red — recorded explicitly in that row.

## Mutation table

| # | File | Mutation | Test run | Red/Green | First failing test | Restore `cmp` |
|---|---|---|---|---|---|---|
| M1 | `experiments/figure-text-translation/translate-blocks.mjs` | `splitJoined`: `lines.length === n` → `true` | `tools/__tests__/figure-mt-joined.test.js` | **RED** (4 failed / 31 passed, was 0 failed / 35 passed) | `splitJoined > refuses one line too few` | OK, identical |
| M2 | `experiments/figure-text-translation/translate-blocks.mjs` | `formulaGuard`: drop the `digits` push (gated behind `false &&`) | `tools/__tests__/figure-mt-joined.test.js` | **RED** (3 failed / 32 passed) | `formulaGuard — measured 0/501 on the 2026-09-15 answers > fires on a dropped digit` | OK, identical |
| M3 | `experiments/figure-text-translation/translate-blocks.mjs` | `formulaGuard`: drop the `subsup` push (gated behind `false &&`) | `tools/__tests__/figure-mt-joined.test.js` | **RED** (1 failed / 34 passed) | `formulaGuard — measured 0/501 on the 2026-09-15 answers > fires on a new subscript — the alt-probe damage — and a subscript is NOT the digit 2` | OK, identical |
| M4 | `experiments/figure-text-translation/translate-blocks.mjs` | `formulaGuard`: drop the formula-token loop (loop body made unreachable via `false ? … : []`) | `tools/__tests__/figure-mt-joined.test.js` | **RED** (2 failed / 33 passed) | `formulaGuard — measured 0/501 on the 2026-09-15 answers > fires on a new subscript — the alt-probe damage — and a subscript is NOT the digit 2` | OK, identical |
| M5 | `experiments/figure-text-translation/translate-blocks.mjs` | `joinable`: drop the `\n` check (`send.length >= 2` only) | `tools/__tests__/figure-mt-joined.test.js` | **RED** (2 failed / 33 passed) | `joinable / a label containing a newline makes the figure unjoinable — nothing is sent joined` | OK, identical |
| M6 | `experiments/figure-text-translation/translate-blocks.mjs` | `wireChars`: `joined` → `0` unconditionally | `tools/__tests__/figure-run-free.test.js` | **RED** — pre-existing floor in this file is 9 failed / 96 passed of 105 (unrelated to this branch); mutant raised it to 10 failed / 95 passed, i.e. +1 new failure | `§C140 ⑦ — the dry run says what a live run would buy > lists each would-buy figure with de-duplicated billable characters and an ISK total` (expected `{blocks: 2, chars: 31}`, got `{blocks: 2, chars: 15}`) | OK, identical |
| M7 | `server/services/figureReviewService.js` | `applyApprovedFigureEdits`'s sidecar `data`: drop `...(mtAlternatives ? { mtAlternatives } : {})` | `server/__tests__/figureReviewService.test.js` | **RED** (1 failed / 16 passed, was 0 failed / 17 passed) | `applyApprovedFigureEdits > CARRIES mtAlternatives and mtJoined FORWARD — an approval must not erase the MT verdicts (§C140 ㉔)` | OK, identical |
| M8 | `tools/lib/figure-consistency.cjs` | `mtAlternativeWarnings`: drop `current !== (mtBlocks \|\| {})[blockKey]`, keep only the `typeof current !== 'string'` guard | `tools/__tests__/figure-consistency.test.js` | **RED** (2 failed / 16 passed, was 0 failed / 18 passed) | `mtAlternativeWarnings (§C140 ㉔) > goes silent once the alternative has been applied` | OK, identical |
| M9 | `experiments/figure-text-translation/translate-blocks.mjs` | `selectWording`: disagreement branch returns `alt: null` instead of `{ kept: 'joined', other: p, reason: 'disagree' }` | `tools/__tests__/figure-mt-joined.test.js` | **RED** (3 failed / 32 passed) | `main — the joined arm > disagreement: keeps JOINED and offers per-label` | OK, identical |

## Final verification

Final `cmp` of every golden against its live file, after the last mutant was restored:

```
cmp .superpowers/sdd/2026-09-18-c140-c24-joined-label-mt/mut/golden-translate-blocks.mjs experiments/figure-text-translation/translate-blocks.mjs
→ (no output — identical)
cmp .superpowers/sdd/2026-09-18-c140-c24-joined-label-mt/mut/golden-figureReviewService.js server/services/figureReviewService.js
→ (no output — identical)
cmp .superpowers/sdd/2026-09-18-c140-c24-joined-label-mt/mut/golden-figure-consistency.cjs tools/lib/figure-consistency.cjs
→ (no output — identical)
```

`git status --porcelain` after the last restore:

```
(empty — clean tree)
```

## Verdict

9 of 9 mutants turned their named test red. No mutant survived. No finding of an unguarded branch.
