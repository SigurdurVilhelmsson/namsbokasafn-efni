# Instruments — E build, 2026-09-13

> 🧊 **FROZEN.** Copied out of a session scratch directory (a tmpfs that does not survive) so the next
> picture review and the next "do the reds match main?" check do not have to be rebuilt. Status lives in
> `../../REGISTER.md` and the campaign register, never here. The T3 scripts are reproduced in full in
> `../VERIFICATION.md` and are not duplicated here.

| file | what it does | reuse note |
|---|---|---|
| `review_stacks.py` | per figure: SOURCE (prepare's staged PDF, so `.eps` works) / BEFORE (media at a given commit) / AFTER (working-tree media), rendered in Chromium through `<img>` via `render-check.mjs`, stacked into one JPEG | resumable (skips existing JPEGs); de-hashes CNXML basenames for lookup only; **paths point at the 2026-09-13 scratch dir — change `T9`/output paths first** |
| `review_page.py` | builds the review page (`index.html`) from `t3.jsonl`: "drawn differently" vs "should look the same" groups, per-figure notes, a per-viewer "looked at" checkbox | the published page: `https://claude.ai/code/artifact/847fef68-e1e2-44fa-8c8d-7f4655f8e515`; **paths are the scratch dir's** |
| `vitest_by_name.py` | diffs a vitest JSON report's failing set **by name** against a baseline list | the check that showed the version bump moved only sidecar-coupled tests, and that they moved back after the data commit |
| `ci_failing_by_name.py` | compares the failing test names of two CI `test` job logs | pair it with `wc -c` on both logs — an empty log is an empty set |

⚠️ **What the review page cannot show:** `CNX_Chem_03_01_exocytosis-88f6` (24 MB artwork) times out headless Chromium,
so its card had only the SOURCE panel. A future review needs another way to show that figure.
