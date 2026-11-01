# The full AI term-pass run, 2026-11-01: how it was driven

Evidence for the register's 2026-11-01 entries "full run in progress" and "full run done"
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`). The run records themselves are in
`books/efnafraedi-2e/ai-review/runs/` (22 runs from `20261101T183602Z-201860ac` to
`20261101T203233Z-04274179`) and the spend is in `books/efnafraedi-2e/ai-review/ledger.jsonl`.

| File | What it is |
|---|---|
| `driver.py` | The script that ran each chapter, checked it and stopped on anything outside its rules. **This is its final version, used from ch09 on** (see below). |
| `progress.tsv` | One row per chapter: run id, requests, usable answers, cost, the ledger total, the cap checks, the token limit, and incomplete answers. Rows marked `(manual)` were written by hand from the same checks. |
| `worst-64000.json` | Each remaining chapter's batch worst case at `--max-tokens 64000`, from `term-pass.js plan` (0 USD), which the driver's k64 check reads. |
| `logs/<chapter>.txt` | The runner's own output for each chapter, with its exit code (`.txt` because the repository ignores `*.log`). |
| `logs/driver*.out` | The driver's output for its three runs (from ch05, ch08 and ch09). |

## How each chapter was run

Every chapter ran the same command, `node tools/ai-review/term-pass.js run --chapter <ch> --mode
batch --yes` (with `--max-tokens 64000` added from ch08), at the frozen prompt and ruling set (`2026-11-01-ai-term-pass-prompt-freeze`), with
layer 1 at `0093d8da4` throughout. What changed was who ran it, the token limit, and the checks:

| Chapters | Run by | `--max-tokens` | Checks after each chapter |
|---|---|---|---|
| ch00–ch04 | by hand | 32,000 (default) | `cap_projection.py --since`, twice: the observed ratio and the fixed 0.1853 |
| ch05–ch07 | driver, first version | 32,000 | as above, plus a strict reading of the runner's result line; it stopped on any cut-off answer |
| ch08 | driver, second version | 64,000 | k64 (reservations at 64,000) instead of the projection's k; a cut-off was recorded, not a stop |
| ch09–appendices | driver, final version | 64,000 | as above, plus coverage from a dry `apply` (no `--write`), counting cut-off and segment-skipping answers alike |

The two changes of version follow [USER]'s two rulings that day: after ch07 (two answers cut off
at 32,000), xhigh at 64,000 from ch08; after ch08 (one answer that skipped 7 of its 8 segments),
such answers are recorded and re-sent after the run. Both are in the register.

## Known limits of these checks

- From ch08 the observed ratio in `progress.tsv` is settled cost over reservations made at 64,000,
  so it is not comparable with the rows above it, and the k64 built on it overstated the margin.
  The column at the fixed 0.1853 against the 32,000 worst case has no such flaw. It was the lower
  of the two in every row from ch09, so it is the one the pause rule used.
- The dry `apply` reports the driver wrote are not kept here: they can be regenerated from the
  committed run records with `term-pass.js apply --chapter <ch> --run <id> --report <file>`.
- `driver.py` names absolute paths on the machine it ran on; it is kept as it ran.
