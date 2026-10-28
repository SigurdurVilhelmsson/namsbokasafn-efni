# D11: the buy runbook (Wed 28 Oct 2026)

The paid part of D11: 3 arms × 2 runs, both modules in every run, up to ISK 5,000. The design is
[`DESIGN.md`](DESIGN.md); the arms were decided in
[`docs/decisions/2026-10-25-d11-three-arms-junes-wire-primary.md`](../../docs/decisions/2026-10-25-d11-three-arms-junes-wire-primary.md);
the free checks are in [`results/2026-10-26/free-checks.md`](results/2026-10-26/free-checks.md).

- **Nothing here buys until you type a buy line** (§3, step 2). Every other step is free.
- **`--update-status` appears nowhere in this runbook.** Never add it: it writes the real server database.
- **When a Claude session runs a buy line, the repo's paid-MT guard hook asks first.** The buy lines call
  `api-translate.js` directly, never through a script, so the hook sees them. A line typed in a plain terminal
  gets no prompt; steps 1 and 3 of §3 are the gates either way.
- **Each run gets a fresh scratch tree,** because `api-translate` skips a module whose MT file already exists.
  `prepare-run.sh` refuses an existing directory.
- **The run's verdict is its provenance, not its exit code:** `parseArgs` drops a mistyped flag silently, so a
  wrong run can exit 0. `check-run.mjs` reads the sidecars.

## 1. Before the first run (free)

From the repository root:

```bash
REPO=$(git rev-parse --show-toplevel)
D11=$HOME/d11-buy-2026-10-28     # on disk, outside the repo: these trees are the raw data
mkdir -p "$D11"

git -C "$REPO" log --oneline -1                                       # 9c9853d09 or later (the merge that added the scripts)
test -f "$REPO/experiments/d11-glossary-test/prepare-run.sh" && echo ok # the runbook's scripts are in this checkout
node "$REPO/tools/api-translate.js" --help | grep -c -- '--june-wire' # 1 or more: the June-wire mode is there
grep -c '^MALSTADUR_API_KEY=' "$REPO/.env"                            # 1: the key is in .env (prints no value)
git -C "$REPO" status --porcelain | wc -l                             # 0
```

The billing check (DESIGN §9) and the go are [USER]'s.

## 2. The order

Six runs, in this order: **`r1-M`, `r1-S`, `r1-none`, `r2-none`, `r2-S`, `r2-M`.** Mirroring the order (ABC, then
CBA) cancels a steady drift over the sitting. The design does not prescribe an order; this is the runbook's choice.
Each run takes a few minutes.

## 3. Each run (the same steps six times)

**Step 1, prepare (free).** Set the run's name and arm, then build its tree:

```bash
RUN=r1-M; ARM=M        # then: r1-S S · r1-none none · r2-none none · r2-S S · r2-M M
bash "$REPO/experiments/d11-glossary-test/prepare-run.sh" "$D11/$RUN" "$ARM"
```

It must end with `READY:`. It builds a fresh tree and checks the March glossary and the re-extracted English
against their pinned hashes. It then dry-runs both modules with the arm's flags and checks the glossary size, the
wire and `To translate: 1`. It writes the flags into `ARM_FLAGS`, which the buy lines read, so the flags cannot be
mistyped. **If it says `REFUSED`, do not buy:** read the message; nothing has been spent.

**Step 2, buy (paid; under a Claude session the guard hook asks first).** First run the budget check in §5. Buy
only if it prints `GO ON`.

```bash
cd "$D11/$RUN"
env -u MALSTADUR_API_KEY node "$REPO/tools/api-translate.js" --book efnafraedi-2e --chapter 11 --module m68781 $(cat ARM_FLAGS) > logs/buy-m68781.log 2>&1; echo "exit=$?"
env -u MALSTADUR_API_KEY node "$REPO/tools/api-translate.js" --book efnafraedi-2e --chapter 1 --module m68667 $(cat ARM_FLAGS) > logs/buy-m68667.log 2>&1; echo "exit=$?"
```

`env -u` makes sure the key comes from `.env`, not from a fake one left in the shell. `$(cat ARM_FLAGS)` is
unquoted on purpose: `--full-glossary --june-wire` is two arguments. **Under a Claude session, run the `cd` and
both buy lines as one command:** the working directory resets between commands, and from the repo root
`ARM_FLAGS` is not found, so the buy is refused for having no arm (exit 2, nothing spent). The hook then asks
once for the whole command, not once per line.

**Expect the hook's prompt to say `⚠ STALE ENGLISH … Re-extract before buying`, and approve it.** The hook dates
the *real* repo's `02-for-mt` against the extractor's code. It never looks at this tree, whose English step 1 has
just re-extracted and checked against the pinned hashes. Measured 2026-10-26 on the exact buy line: the warning
appears for m68781.

`exit=1` on a buy line means the module was held back (a failure, an id-reattach mismatch, a bracket-marker delta
or a lost Greek letter; the log's `Held back` line says which). Step 3 decides whether the run must be redone.

**Step 3, check (free):**

```bash
node "$REPO/experiments/d11-glossary-test/check-run.mjs" .; echo "check exit=$?"
cd "$D11"
```

It must end with `PASS` and `check exit=0`. It writes `check.json` into the tree.

## 4. What the check asserts

For each module's sidecar (`02-mt-output/<ch>/<module>-provenance.json` in the tree):

| field | M (June's wire) | S (today's wire) | no glossary |
|---|---|---|---|
| `tool` | `api-translate` | `api-translate` | `api-translate` |
| `run.glossary.arm` | `glossary` | `glossary` | `no-glossary` |
| `run.glossary.wire` (the key must be present) | `june` | `today` | `null` |
| `run.glossary.termCount` | 617 | 590 | `null` |
| `run.glossary.contentHash` | `f15401b2…735c` | `9071d852…7252` | `null` |
| `run.glossary.chunksTotal` | m68781 1, m68667 2 | the same | the same |
| `run.glossary.chunksWithGlossary` | `= chunksTotal` | `= chunksTotal` | 0 |
| `run.mismatchCount` | 0 | 0 | 0 |

It also checks that each MT file carries the same SEG id **set** as its English (a set, not a count: the MT can
rewrite an id's digits). It also prints each module's `run.usage`, but **do not count the bill from it:** when a
chunk is retried, `run.usage` keeps only the retry's usage and drops the first attempt's, though both were
billed. The bill is counted from the logs (§5).

`chunksWithGlossary` below `chunksTotal` means a chunk came back truncated and was retried without the glossary
(DESIGN §7). That module is then a no-glossary sample under a glossary label, so the run must be redone.

`mismatchCount` above 0 means a segment was held back: its markers did not line up after the MT, so `api-translate`
wrote the **English source** into the MT file under that segment's id. The id set still matches, so only this
field shows it. **[USER] ruled 2026-10-26: such a run is redone in a fresh tree (§5).** It has happened in 4 of
180 earlier module buys.

## 5. When a run fails

- **A run has failed when step 3 prints `FAIL`:** a missing file, a wrong sidecar value, a truncated chunk
  (`chunksWithGlossary`), or a held-back segment (`mismatchCount`; [USER] 2026-10-26).
- **Do not rerun in the same tree, and do not use `--force` there.** Keep the failed tree: it is evidence, and what
  it bought counts toward the cap.
- **Redo the whole run in a fresh tree** named `<run>-retry1` (for example `RUN=r1-M-retry1; ARM=M`), steps 1 to 3.
  The retry replaces the failed run in the analysis, and the failed run is reported.
- **Exception: if every `r1-M` request is refused with a 4xx, stop and ask [USER]; do not redo.** `r1-M` makes the
  first live requests, so it is the first to meet two things the rehearsal could not: the real key from `.env`, and
  whether the live API still accepts June's duplicate headwords (the March buys sent them; nothing has since
  4 August). A refusal looks like `❌ API POST /v1/translate/tasks returned 4…` in both buy logs (for example 401
  for the key, or 400 for the payload). A 4xx other than 429 is not retried and costs nothing, but a redo in a fresh
  tree would only repeat it. (A 429 or a 5xx is retried by the client and is not this case.) To check:

  ```bash
  grep -ah 'returned 4' "$D11/r1-M/logs/buy-"*.log
  ```
- **The cap is ISK 5,000, counted from the logs.** Each buy log ends with an `API usage:` line. It comes from the
  API client's own tally of every call, so unlike the sidecar it includes the first attempt of a retried chunk. A
  truncation retry re-sends a chunk once, and only a chunk that carried a glossary, so the most one run can cost is
  2 × 606 = 1,213 ISK (606 is one run's ceiling). **A run may start only while the running total is at most
  3,787 ISK** (5,000 − 1,213). Run this before step 2 of every run, and once more at the end:

  ```bash
  : "${D11:?set D11 to the buy directory first}"
  total=0
  for f in "$D11"/*/logs/buy-*.log; do
    [ -e "$f" ] || continue
    u=$(grep -a -m1 'API usage:' "$f" | tr -dc '0-9')
    if [ -z "$u" ]; then   # the run died before its summary: count that module at its ceiling
      case "$f" in *m68781*) u=15357 ;; *) u=45279 ;; esac
      echo "no 'API usage:' line, counted at its ceiling: $f"
    fi
    total=$((total + u))
  done
  isk=$(( (total + 50) / 100 ))
  echo "API usage so far in $D11: $total chars ≈ $isk ISK"
  if [ ! -d "${D11:-}" ]; then
    echo "STOP: \$D11 is not an existing directory ('${D11:-}'); set it and run this again"
  elif [ "$isk" -le 3787 ]; then
    echo "GO ON: room for one more run"
  else
    echo "STOP: no room for another run under ISK 5,000; ask [USER]"
  fi
  ```

  The first line stops a script or a Claude session when `$D11` is unset. Pasted into a terminal it only prints an
  error and the following lines still run, so the verdict also checks that `$D11` is an existing directory. That
  check catches a mistyped path too.

  It counts every tree in `$D11`, failed and retried ones included. The `API usage:` figure is the API's billed
  units, and 0.01 ISK a unit is the invoice rate with VAT (kr. 8.06 a thousand before 24% VAT, 9.99 after). The six planned runs come to
  about 2,915 ISK at that rate, so about two retries fit. **If a log shows an API error or a timeout, count that
  module at its ceiling as well**, because a call that never returned a result may still have been billed.

## 6. After the six runs

```bash
for t in "$D11"/*/; do printf '%-16s ' "$(basename "$t")"; grep -o '"pass": [a-z]*' "$t/check.json" || echo "no check.json"; done
git -C "$REPO" status --porcelain | wc -l     # still 0: the real tree is untouched
```

Then run the running total in §5 once more: its last figure is the bill.

- **The trees are the primary data:** pure MT as received, with its sidecars and logs. Never edit them; an AI or
  human revision belongs in its own layer (CLAUDE.md § Purpose). Copy `$D11` somewhere backed up before the
  analysis.
- **Whether the raw MT is committed to the repo is [USER]'s call.** Chemistry is CC BY 4.0, and `experiments/` is
  MIT-licensed. There is one precedent: `test-results/c-ch05-glossary-arm-probe-2026-09-19/`.
- Record the buy in the register (runs, retries, and the final running total from §5), then run the analysis in
  DESIGN §8.

## 7. Rehearsed 2026-10-26 (free)

The whole runbook was run once, in the order of §2, against an echo of the Málstaður API:
`tools/__tests__/helpers/echo-malstadur-fetch.js`, loaded with `node --import`. It returns each request's text and
logs its glossary. The key was fake, so a request that reached the real API would have been refused. The only
differences from §3 are the preload, the fake key and `--rate-delay 0`. The billed units printed in the rehearsal
are the echo's text lengths, not Miðeind's.

- **All six runs passed `check-run.mjs`.** Per request, through the whole command line, the wire carried:

  | arm | m68781 | m68667 chunk 1 + 2 | `atom` |
  |---|---:|---:|---|
  | M | 56 | 55 + 61 | both values, `atóm/frumeind` |
  | S | 49 | 51 + 55 | withheld |
  | no glossary | 0 | 0 + 0 | — |

  This is [`results/2026-10-24/wire-compare.json`](results/2026-10-24/wire-compare.json), measured end to end.
- **Each check was seen failing.** `prepare-run.sh` refused an existing directory, an unknown arm, a wrong English
  hash, and the M arm's flag mistyped as `--june_wire`. That dry run loaded today's 590 rows, which is exactly the
  silent-drop hazard. `check-run.mjs` failed four damaged copies of a passing tree on the right lines: the arm
  relabelled S (wire, term count and hash), one `chunksWithGlossary` lowered by one, one segment deleted from an
  MT file (the id set), and the `wire` key removed. The untouched tree still passed. Added the same day: a
  held-back-shaped tree (one segment's English written back into the MT file, `mismatchCount: 1`) passed the
  earlier checker and fails the current one, as does a sidecar with no `mismatchCount` key.
- **The real tree was unchanged:** a path, size and mtime listing of `01-source`, `02-for-mt`, `02-structure`,
  `02-mt-output`, `glossary` and `sessions.db` was identical before and after.
- **Not exercised: the real key path.** Every rehearsal buy set a fake key. On Wednesday, `env -u` makes
  `api-translate` read the key from the repository's `.env`, found from its own location. That is the path every
  earlier buy used.
