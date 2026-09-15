## Commit (5): report pass-through and driver NOTEs

Done in the scratch worktree `/home/siggi/dev/scratch-c140/plan/wt` (detached at `135c08ae`, nothing committed). The diff is `/home/siggi/dev/scratch-c140/plan/wt-commit5.diff` (sha256 `6a3052df…`, 6 files, +511/−12). Nothing newly red and nothing newly green in the full JS suite; every new assertion was RED on the unchanged code first.

### J1 — `figure-compose.py`
- **`artwork.pdf` is now a required input.** A missing or empty one is refused before `compose.py` runs.
- **`compose.json` on success** is `{outputPath, unformatted, overflow, localized, containerErrors}`.
  - Each list is copied verbatim from the report; absent or non-list becomes `[]`.
  - `read_report` and `verify` are unchanged. `compose()` now returns `(svg, report)`.
- **Tests in `test_figure_compose.py`:**
  - **4f–4j:** the missing-`artwork.pdf` case, with a restore control.
  - **2h:** a real run's `compose.json` lists equal the report's (or `[]`).
  - **Section 11:** runs `main()` with a planted child. It checks non-empty lists copied verbatim (11a), no report leakage (11b), and that an older report without the lists gives four `[]` (11c/11d).
- **Results, run in a 2×2 matrix** (`tmp-c5/matrix/`):

| | unchanged wrapper | new wrapper |
|---|---|---|
| worktree (pre-③) composer | 7 FAILED: 2h, 4g, 4h, 4i, 11a, 11b, 11d | ALL PASS, 104 checks |
| stage-C composer (repo-shaped nest) | 6 FAILED: 2h, 4h, 4i, 11a, 11b, 11d | ALL PASS, 104 checks |

- **Why 4g is not RED on stage C:** the ③ composer itself crashes on a missing `artwork.pdf`, so the old wrapper already exits 1, and its message quotes a stderr tail naming the file. So 4h requires no traceback and 4i requires the pre-flight's own wording; both are RED there.
- **Baseline:** 93 checks, ALL PASS. Section 10 runs in the worktree.

### J2 — the driver and `verdict`
- **`processFigureLive`** stores `rec.composeNotes` from `compose.json`; a missing list becomes `[]`. The record template starts it at `null`.
- **`verdict`** gets four new counts through `extra`: `unformattedFigures`, `overflowFigures`, `localizedFigures`, `containerErrorFigures`.
  - Each count is the number of *translated* figures with a non-empty list.
  - Each non-empty one adds exactly the task's `NOTE (not a failure): …` text, and `ok` is unaffected.
- **`summarise`** adds one `nameList` section per non-empty list, naming the figure basename and the JSON-quoted keys.
  - Overflow lines show word, `needPt` and `budgetPt` to 2 dp, the axis when present, and the block number.
  - A null word prints as "a line".
- **Tests:**
  - `figure-outcomes.test.js`: 7 new, 6 RED on the old code (the seventh is a zero-count control).
  - `figure-run-paid.test.js`: the fake compose stage accepts `{__notes}`; 7 new tests, all 7 RED on the old code.
  - Final state: 117/117 pass in the two files.
- **Why not `figure-run-free.test.js`:** its fake spawn has no compose stage (it throws on one) and every run there is a dry run, so the compose step is never reached.
- **Mutation probes** (`tmp-c5/mutate.out`): M1–M8 and MP1–MP4 were all killed, and every restore compared clean.
  - Removing the `Array.isArray` guard (M6) fails 36 paid tests: the guard is what keeps every older `compose.json` working.
- **Lint and format:** `prettier --check` and `eslint` exit 0 on the 4 touched JS files.

### J3 — full JS suite, by name
| | tests | passed | failed |
|---|---|---|---|
| before | 6480 | 6387 | 36 |
| after | 6494 | 6401 | 36 |

- The failing set is identical by name; the 14 new tests all pass (`tmp-c5/js-byname.txt`).
- One comment-only edit to `figure-outcomes.js` landed while the after-run was in progress. A targeted rerun on the final tree passed 194/203; the 9 failures are the 9 already failing in `figure-run-free.test.js` before any edit.

### What it will print on the 34 figures
No block moves. I passed the 34 real stage-C `compose-report.json` files through the new `success_payload` offline (figure-run.js was not run); output in `tmp-c5/realnotes.out`:
- **ch03:** a `localized` NOTE, 5 figures / 35 keys.
- **ch04:** an `overflow` NOTE, 2 figures / 7 entries (flowchart 2, combmap 5).
- **Neither chapter:** no `unformatted` NOTE (0 entries), and no `containerErrors` NOTE — that list is absent from all 34 reports, so it reads as `[]` until the next phase adds it.

### Evidence (all under `/home/siggi/dev/scratch-c140/plan/`)
- **Python:** `tmp-c5/py-before.txt`, `tmp-c5/py-red.txt`, `tmp-c5/py-green.txt`, `tmp-c5/matrix/*.txt`
- **JS:** `tmp-c5/js-red-final.json`, `tmp-c5/js-green-final.json`, `wt-js-before.json`, `wt-js-after.json`, `tmp-c5/js-byname.txt`, `tmp-c5/js-before-failing.txt`
- **Other:** `tmp-c5/mutate.out`, `tmp-c5/realnotes.out`, `tmp-c5/sample/sample.mjs`
- **Before-copies:** `tmp-c5/before/`