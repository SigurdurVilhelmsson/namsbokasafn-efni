# G1.7 step 2, the cut (2026-11-22): landing conditions and reads

**🧊 FROZEN 2026-11-22.** Evidence, never status. Status lives in the active register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`, the 2026-11-19 G1.7 entry's "Step 2" bullet). If this
directory and the register disagree, the register wins.

- **Design:** [docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md](../../docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md)
  §8 (the cut), §6.3–§6.5 (the script, the manifest, the tag), §9 (production).
- **The manifest** (data only, draft PR #775): `books/efnafraedi-2e/freeze/freeze-efnafraedi-2e-2026-11-22/`, on
  branch `data/g17-freeze-manifest` (`2649821b6`), cut from `origin/main` at `ae833a0d1`, the commit production
  runs. `segments.jsonl` sha256 `55b34c8326414131ec1d6304f000659f0b7c2bf3bbcc82a2d5670cf85b88fdd1`, `freeze.json`
  sha256 `94b8a91ee8ed44bc946baa218ed0a341be25f4b23d3f92282fe7ffe7fb61c2e8`.
- The scripts carry the absolute paths of the session that ran them (a scratchpad and a worktree); change those to
  re-run.

## Landing condition 1: a fresh extraction reproduces the English

| File | What |
|---|---|
| `cut-make-tree.sh` | Builds a throwaway copy of `ae833a0d1` with `git archive` (tools, `server/lib`, the two `package.json`, chemistry's `01-source` chapter directories, `02-for-mt`, `02-structure`, `02-mt-output`) and links `node_modules`. No `pipeline-output/`: `tools/lib/safeWrite.js`'s `logBackup` inserts into a `sessions.db` it finds there, so the copy gives it none. |
| `cut-extract-run.sh` | Runs `tools/cnxml-extract.js --book efnafraedi-2e --chapter <N>` for ch00–ch21 and `appendices`, with the copy as working directory (`BOOKS_DIR` is cwd-relative), never with `--output-dir`. Writes `extract-logs/start-epoch` first. |
| `extract-logs/` | Each chapter's stdout and stderr, and the start time. All 23 runs exited 0. The stderr logs report 170 units held by the study freeze in total (the §C110 warnings) and hold nothing else; the stdout logs report the files written. |
| `cut-extract-verify.cjs` | Takes the units from `server/lib/studyUnits.js`'s `listStudyUnits` (the freeze's own enumeration), and for each requires its `02-for-mt` file to be rewritten after the start time (the control that "byte-identical" is not "never rewritten") and byte-identical to the committed file. Also reports every other changed file in the two generated trees. |
| `cut-extract-verify.json` | Its output: 170 units, 170 rewritten and identical, 0 different, 0 untouched, 0 missing; the only other changes are `extractedAt` in 149 `02-structure` manifests (as on 2026-11-19). `LANDING CONDITION 1: PASS`. |

The real worktree's `02-for-mt` and `02-structure` equalled `ae833a0d1` (`git diff --quiet`) when compared, and
`git status --porcelain` was unchanged by the run.

## Landing condition 2: `manifest` passes its preconditions

| File | What |
|---|---|
| `manifest-dry-1.txt`, `manifest-dry-2.txt` | Two dry runs of `node server/scripts/study-freeze.js manifest` on the branch at `ae833a0d1`: no refusal, byte-identical. |
| `manifest-write.txt` | `manifest --write --tag freeze-efnafraedi-2e-2026-11-22`: the written `segments.jsonl` sha256 equals the dry runs'. |

## Production, read-only (2026-11-22, at `ae833a0d1`)

| File | What |
|---|---|
| `prod-cut-preconditions.cjs`, `.out` | Counts only, through better-sqlite3 `readonly`: 0 chemistry module openings, 0 in flight, 0 chapter assignments; the control `registered_books` = 6. So the cut lands before any unit opens and before G1.13 assigns (§8). |
| `prod-check.txt` | `study-freeze.js check`: `PASS`, 170/170 markers, no manifest yet. |
| `prod-manifest-dry.txt` | The `manifest` dry run on production: the **same** `segments.jsonl` sha256 (`55b34c83…`), 170 units, 22,591 segments; `git status --porcelain` 0 lines before and after. This predicts the post-deploy `check`. |
| `prod-reads-at.txt` | When the saved production reads ran. |

Also run, not saved here: `study-freeze.js check` on the branch reported `PASS`, comparing 170 units by English and MT
file hash and 22,591 segments by served hash, and the six freeze test files passed.
