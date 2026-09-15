# Handoff — §C140 ⑩ to a session on the LOCAL BOX

**Written 2026-09-15 from a remote container, for the next session on `~/dev/repos/namsbokasafn-efni`.**
Status lives in the campaign register's ⏩ RESUME and §C140 — this document carries none. It exists
because the remaining work needs **things the remote container does not have**, and says exactly what
those are so the next session does not rediscover it.

> **AMENDED 2026-09-15, by the local-box session that ran it.** Executed; the result is the
> register's, the measurements are [`evidence/2026-09-15-c10-local-run/`](../../experiments/figure-text-translation/evidence/2026-09-15-c10-local-run/README.md).
> Two corrections to what follows, both measured:
> - 🔴 **Do not run §2's whole-chapter control as `--chapter N --force`.** `--force` suppresses only
>   the skipped-current skip and **does not narrow the selection**, so it sends every text figure in
>   the chapter WITHOUT a sidecar to the paid MT. ch03 happened to have 0 such figures (a plain
>   `--dry-run` showed it), so the instruction was harmless there and is not safe as a pattern.
>   ⚠️ **Adding `--stale` stops the spend but is still not a clean control:** run live it recomposes
>   and rewrites EVERY sidecar figure's SVG (15 in ch03), each with compose-time font stamps; and run
>   with `--dry-run` it reports candidates only (`not gated in a dry run`), so it cannot show a
>   refusal. What worked: `--chapter N --stale --force --dry-run` to see the census, then a LIVE run
>   per `--figure` (brain, exocytosis), each diffed by value and the timestamp-only one restored.
> - ⚠️ **The table below omits numpy.** This box had poppler, the PDFs and `server/node_modules`, and
>   the first live attempt still healed nothing: `pylibs/` is gitignored and lacked numpy, so the
>   gate failed closed and printed `VERDICT ok`.

---

## Why this handoff exists at all

§C140 ⑩ is built, tested and pushed. What is left is **one 0-ISK run**, and it cannot happen in a
remote container. Verified there, not assumed:

| needed | remote container | your box |
|---|---|---|
| `pdftocairo` (poppler) | **absent** — `which pdftocairo` empty | present |
| the OpenStax source PDFs | **absent** — no `CNX_Chem_03_01_brain*.pdf` anywhere on the filesystem | `sources.local.json` resolves them |
| `server/node_modules` (better-sqlite3) | **absent** — the full `npm test` suite dies on it | present |
| project memory | **absent** — no memory directory for this repo in that container | present, auto-loaded |

⚠️ **`books/*/media/` is pipeline output.** The healed figure is produced by re-running the driver,
never by hand-editing the SVG — CLAUDE.md § *Pipeline operations*. That is why this is a run and not
a patch.

## 1. First, the thing that is still owed from PR #471

`./scripts/deploy.sh` on prod, then verify the figures route, then push the content commit the deploy
re-bases. It needs `sudo`, so it is a human's. Until it runs, prod is behind `main` and the two-hourly
content-backup tick is **expected** to fail (CLAUDE.md § *Content delivery*) — that alarm is not a new
defect.

## 2. Then §C140 ⑩'s one run

```bash
node tools/figure-run.js --book efnafraedi-2e --chapter 3 \
     --figure CNX_Chem_03_01_brain-ec0b --force      # 0 ISK, spawns no MT
```

`--force` recomposes; it never buys. `isStale` keys on `COMPOSER_VERSION` and the render hashes and
**never on the artwork**, so `--force` is what makes the driver pick the healed artwork up. No
`COMPOSER_VERSION` bump is wanted — the composer did not change, and a bump would restage all 34
figures for a 2-figure artwork change.

**Expect in the run summary:** a `soft-mask ring gate (§C140 ⑩)` section naming
`CNX_Chem_03_01_brain-ec0b: healed mask-2`.

🔴 **Run it over the whole of ch03 as well, and read the refusal line — it is the half of this item
that protects a picture.** A whole-chapter run must ALSO name `CNX_Chem_03_01_exocytosis-88f6` with
**8 refused candidates, healed none**. If brain heals and exocytosis is not mentioned, the refusal
channel is not working, and the gate is the only thing standing between a heal and the destruction of
that figure's axon shading.

Then look at the picture, and the ch03/ch04 publication call is yours.

## 3. What the gate does, in one paragraph

`pdftocairo -svg` rasterises a soft mask over the whole-number extents of its clip and fills that
surface with the mask's `/BC` backdrop, so a clip-cut outer row keeps the backdrop and the browser
spreads it into a light outline. **The byte signature that finds this is not the defect**: 9 masks in
2 figures carry it corpus-wide and only ONE ring is visible; healing the other 8 destroys picture
content. So the decision is interventional — heal a side only when healing it demonstrably removes a
light line — and it is fail-closed: any failure leaves the artwork byte-identical and says so.

Design, plan and frozen measurements are linked from §C140 ⑩. Nothing is restated here.

## 4. PR [#472](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/472) — merged

Merged 2026-09-15 on [USER]'s instruction, as a **merge commit** (the evidence cites individual
SHAs, so a squash would break those citations). Lint ✅ · Security Audit ✅ · Documentation Check ✅
· **Tests ❌ on `main`'s own pre-existing baseline** — red on `main` at both `8e697c6a` and
`0895fd7e` before this branch existed, and the failing set was compared **by name**, not by count.
Two comments on the PR carry that comparison.

⚠️ **A regression happened on this branch and was fixed before the merge** (`4b25b8d9` →
`ede5eb81`): the new driver step broke all 63 tests in `figure-run-paid.test.js`, because that
file's fake prepare writes an `artwork.svg` and its harness threw on the unrecognised stage.
**The cause of the miss is worth more than the bug**: `figure-run-free.test.js` was checked, found
unchanged, and that was generalised to "the driver tests are fine" — and the difference between
the two files is exactly what the new step keys on. On the local box the full suite actually runs,
so **`npm test` and compare failing names** rather than sampling files.

## 5. Memory — apply this on your box

The remote container has no memory for this repo, so this could not be written there. Per
CLAUDE.md § *One source of truth*, memory carries **pointers and durable hints only — no repo
`file:line`, no item status**. Suggested additions, in that shape:

- **figure soft-mask rings** — `pdftocairo -svg` writes a clip-cut backdrop ring into a soft-mask
  raster. The byte signature is a DETECTOR, never the decision: corpus-wide it fires on nine masks
  and only one ring is visible, and healing the rest destroys picture content. The decision is
  interventional and lives in the figure driver.
- **engineering-lessons** — *a detector that finds a defect is not the defect.* Two gates that looked
  obviously right were measured to fail before the third worked; a picture of the defect and a
  picture of ordinary content were indistinguishable until an intervention separated them.
- **engineering-lessons** — *checking one file of a pair and generalising is the subset trap.* Two
  test files exercised the same driver; only one wrote the input the new step keys on. The one that
  was checked was the one that could not fail.
- **environment** — a remote Claude Code container for this repo has no poppler, no OpenStax source
  PDFs, no `server/node_modules` and no project memory. Figure preparation and the full test suite
  are local-box-only.

## 6. What NOT to do

- **Do not hand-edit anything under `books/`.** The heal is produced by the driver.
- **Buying stays stopped** ([USER], 2026-09-13). `--stale` and `--force` spend nothing; only a figure
  with no sidecar file can reach the paid stage.
- **Do not bump `COMPOSER_VERSION`** for this.
- **Do not build the two-way figure-label MT** (§C140 ㉔) as part of this — it is its own item, and it
  must land before the next paid figure purchase.
