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

git -C "$REPO" log --oneline -1                                       # d7ffabb10 or later
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

**Step 2, buy (paid; the hook asks before each line):**

```bash
cd "$D11/$RUN"
env -u MALSTADUR_API_KEY node "$REPO/tools/api-translate.js" --book efnafraedi-2e --chapter 11 --module m68781 $(cat ARM_FLAGS) > logs/buy-m68781.log 2>&1; echo "exit=$?"
env -u MALSTADUR_API_KEY node "$REPO/tools/api-translate.js" --book efnafraedi-2e --chapter 1 --module m68667 $(cat ARM_FLAGS) > logs/buy-m68667.log 2>&1; echo "exit=$?"
```

`env -u` makes sure the key comes from `.env`, not from a fake one left in the shell. `$(cat ARM_FLAGS)` is
unquoted on purpose: `--full-glossary --june-wire` is two arguments. **Under a Claude session, run the `cd` and
both buy lines as one command:** the working directory resets between commands, and from the repo root
`ARM_FLAGS` is not found, so the buy is refused for having no arm (exit 2, nothing spent).

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

It also checks that each MT file carries the same SEG id **set** as its English (a set, not a count: the MT can
rewrite an id's digits). It prints each module's billed units from `run.usage`.

`chunksWithGlossary` below `chunksTotal` means a chunk came back truncated and was retried without the glossary
(DESIGN §7). That module is then a no-glossary sample under a glossary label, so the run must be redone.

## 5. When a run fails

- **Do not rerun in the same tree, and do not use `--force` there.** Keep the failed tree: it is evidence, and what
  it bought counts toward the cap.
- **Redo the whole run in a fresh tree** named `<run>-retry1` (for example `RUN=r1-M-retry1; ARM=M`), steps 1 to 3.
  The retry replaces the failed run in the analysis, and the failed run is reported.
- **The cap allows at most 8 full runs.** At the ceiling estimate (606 ISK for one run of both modules),
  8 × 606 = 4,848, under ISK 5,000. The six planned runs leave room for two retries. Count a run that bought only
  one module as a full run. **If a ninth run would be needed, stop and ask [USER].**

## 6. After the six runs

```bash
for t in "$D11"/*/; do printf '%-16s ' "$(basename "$t")"; grep -o '"pass": [a-z]*' "$t/check.json" || echo "no check.json"; done
node -e 'const fs=require("fs"),p=require("path");let u=0;for(const d of fs.readdirSync(process.argv[1])){const f=p.join(process.argv[1],d,"check.json");if(!fs.existsSync(f))continue;for(const m of JSON.parse(fs.readFileSync(f,"utf8")).modules)u+=Number(m.usage)||0;}console.log("billed units, all trees:",u,"≈",Math.round(u*0.01),"ISK")' "$D11"
git -C "$REPO" status --porcelain | wc -l     # still 0: the real tree is untouched
```

- **The trees are the primary data:** pure MT as received, with its sidecars and logs. Never edit them; an AI or
  human revision belongs in its own layer (CLAUDE.md § Purpose). Copy `$D11` somewhere backed up before the
  analysis.
- **Whether the raw MT is committed to the repo is [USER]'s call.** Chemistry is CC BY 4.0, and `experiments/` is
  MIT-licensed. There is one precedent: `test-results/c-ch05-glossary-arm-probe-2026-09-19/`.
- Record the buy in the register (runs, retries, billed units), then run the analysis in DESIGN §8.

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
  MT file (the id set), and the `wire` key removed. The untouched tree still passed.
- **The real tree was unchanged:** a path, size and mtime listing of `01-source`, `02-for-mt`, `02-structure`,
  `02-mt-output`, `glossary` and `sessions.db` was identical before and after.
- **Not exercised: the real key path.** Every rehearsal buy set a fake key. On Wednesday, `env -u` makes
  `api-translate` read the key from the repository's `.env`, found from its own location. That is the path every
  earlier buy used.
