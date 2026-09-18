Evidence, frozen 2026-09-18 — §C140 ㉔ branch at 86cc7720e. Status lives in the campaign register.

## Commands run

Branch full suite (from `/home/siggi/dev/repos/namsbokasafn-efni`, branch `feat/c140-c24-joined-label-mt` at `86cc7720e`):

```
npx vitest run --reporter=json --outputFile=<scratch>/branch.vitest.json > <scratch>/branch.log 2>&1
echo "exit $?" >> <scratch>/branch.log
```

`<scratch>/branch.log`'s own tail: `JSON report written to …/branch.vitest.json` then `exit 1` (expected — the
suite carries pre-existing failures on both `main` and this branch; judged by the JSON, never by the wrapper).

`main` floor was supplied pre-measured, not re-run per the task instructions: `/home/siggi/dev/repos/efni-wt-c24-floor.vitest.json`
(vitest JSON reporter output, run at merge-base `f5dcfe9e5`).

Comparison built with a small Python script reading both JSON reports, stripping each root
(`/home/siggi/dev/repos/namsbokasafn-efni/` from branch paths, `/home/siggi/dev/repos/efni-wt-c24-floor/` from
floor paths) and building the set `<file relative to repo root> :: <fullName>` per failing assertion.

## Counts

| | branch | floor (main @ f5dcfe9e5) |
|---|---|---|
| Failing tests | 37 | 36 |
| Failing files | 14 | 13 |
| Total tests | 6720 | 6667 |

Branch has more total tests (6720 vs 6667, +53) — expected, this branch added tests (mutation-guard tests for
splitJoined/formulaGuard/joinable/wireChars/selectWording, the sidecar carry-forward test, the consistency
warning test, the review-panel apply-control tests, etc.).

## By-name comparison

**ONLY-FLOOR tests (0):** none. Every floor failure is also present on the branch — nothing this branch fixed
that the floor still reports, and no floor failure disappeared unaccounted for.

**ONLY-BRANCH tests (1) — the bar is 0, NOT MET:**

```
server/__tests__/figureCardClientPins.test.js :: the decimal suggestion can be applied in one click offers NO apply control for a caption warning
```

### Investigation of the one only-branch failure

This is deterministic, not flaky (re-run twice, same failure both times). Root cause, read from the test and
the diff:

- `figureCardClientPins.test.js` (pre-existing, NOT touched by this branch — last commit `5c8cb2521`, feature ⑭)
  has a test `offers NO apply control for a caption warning` that slices `renderFigureBlock`'s source from
  `region.indexOf('warnings.caption')` **to the end of the function** and asserts nothing in that slice contains
  `data-block-apply`.
- This branch's own commit `86cc7720e` ("the figure review panel offers the per-label MT wording in one click
  where the joined wording was kept") added a **new** `data-block-apply` control, inside `renderFigureBlock`,
  in a `for (const w of warnings.mt)` loop that runs **after** the `warnings.caption` loop the pre-existing
  test anchors on.
- So the pre-existing test's implicit assumption — "nothing after the caption-warning loop in this function has
  an apply control" — is now false, because of this branch's own new, intentional feature (the per-label-MT
  apply button, which is unrelated to captions and is not itself in question). The test was written before ㉔
  existed and never anticipated a second, later apply-control loop.
- This is a genuine conflict for [USER]/reviewer to resolve — either narrow the pre-existing test's slice to
  stop at the caption loop's own end (e.g. `region.slice(start, region.indexOf('warnings.mt'))`) or otherwise
  scope it — not a flake and not something already covered by the floor. **Left unfixed here per controller
  ruling R10 (Steps 1–2 only, no code changes beyond the committed evidence file).**

## Verdict

0-only-branch bar **NOT met** (1 only-branch failing test, real and reproducible, caused by this branch's own
㉔ feature colliding with a pre-existing test's over-broad assertion scope). Everything else — total-test-count
increase, 0 only-floor, lint, format, full E2E (see task report) — is clean. Report this to the reviewer before
merge; the test needs updating in the same PR that merges ㉔ (or a fast-follow) to narrow its slice past the
new `warnings.mt` apply-control loop.

---

## Addendum — after fix `b774fb653` (same day, appended; the record above is unchanged)

The one only-branch failure above (`server/__tests__/figureCardClientPins.test.js` :: "offers NO apply
control for a caption warning") was a source pin whose slice ran from the caption-warning loop to the
end of `renderFigureBlock`, and so swallowed ㉔'s new MT-alternative loop. Fixed by bounding the slice
to the caption loop (`b774fb653`), with order controls and a mutation proof (a `data-block-apply`
placed inside the caption loop turns it RED).

Re-run on the branch at `b774fb653`, compared by name with `compare-failing-by-name.cjs` (committed
beside this file; its first line of output is a parser control — it must reproduce each report's own
failure count):

```
node compare-failing-by-name.cjs <floor.json> <floorRoot> <branch.json> <branchRoot>
parser control: true true
{ floorTotal: 6667, floorFailed: 36, branchTotal: 6720, branchFailed: 36 }
only-branch tests: []
only-floor tests: []
files floor/branch: 13 13
only-branch files: []
only-floor files: []
```

▶ **Failing sets identical by name at test and file level; the branch adds 53 tests.** Floor = merge-base
`f5dcfe9e5`, run in an on-disk worktree with both `node_modules` trees present.
