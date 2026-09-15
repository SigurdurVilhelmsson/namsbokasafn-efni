# §C140 ② ③ ⑨ + exocytosis — formulas and re-flow in translated figure labels, decimal commas, loadable blend chains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `compose.py` draws translated figure labels with their source formula formatting (②), lays them out against their own box / table cell / open space with a 7.5 pt floor and named overflow (③), draws English-kept numbers with Icelandic separators (⑨), and `strip-text.py` collapses cairo's blend chains so exocytosis loads in a browser; then the 34 bought ch03/ch04 figures are recomposed at 0 ISK and [USER] looks at them before merge.

**Architecture:** Five helpers beside `compose.py` (spec R8): `svgfix.py` (artwork bytes), `figscripts.py` (source styles → tokens → transfer), `numloc.py` (one-line number localisation), `figcontainers.py` (box / cell / open detection from `artwork.pdf`, free space from `artwork.png`) and `figlayout.py` (a pure line / size / anchor decision). `compose.py` keeps every cairo call and changes in three stages in the spec's commit order. `figure-compose.py` and the driver pass the new report lists through as `NOTE (not a failure)` lines. `COMPOSER_VERSION` → `'3'` recomposes every committed sidecar with `--stale`.

**Tech Stack:** Python 3 (pycairo, fontTools, pdfplumber, Pillow from the gitignored `pylibs/`; stdlib `xml.etree`), plain-assert test scripts (no pytest), Node 22 driver `tools/figure-run.js`, Vitest, Playwright Chromium.

**Spec:** [`docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md`](../specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md) — read all of it, **including "Amendments — 2026-09-14"**, before any task.

> **Addendum 2026-09-15 (end of this file): Tasks 13–19 — [USER]'s review fixes — run after Task 11 and BEFORE Task 12.** Read the spec's "Amendments — 2026-09-15" first.

**Reference build — read this before Task 1.** Every module, test, fixture, patch and `compose.py` stage in this plan was built and verified in scratch before the plan was written: five module builders, an integrator that ran each stage RED/GREEN against the unchanged composer and on the 34 real figures, a predictor, and adversarial reviewers over two rounds (reports in `EXP/evidence/2026-09-14-t23-build/reports/`). The verified files are committed byte-exact under `REF` = `EXP/evidence/2026-09-14-t23-build/reference/`, checked by `MANIFEST.sha256`, and **tasks install them by `cp` or `git apply`, never by retyping** — a builder measured the Write tool turning an escape into an invisible character, and ~8,000 lines of markdown transcription would reintroduce exactly that class. Each task still states the rules the code implements, shows each new assertion FAIL before the change and PASS after, and gives the executor a named mutation for every pure module. `EXP/evidence/2026-09-14-t23-build/PREDICTIONS.md` holds every real-figure number Task 9 is held to; it was written before the repository implementation exists. **If a reference file does not install cleanly or a predicted result does not reproduce, STOP and report — never edit the reference to make it fit.** **Dress-rehearsed 2026-09-14:** Tasks 1–9 and Task 10's pre-flights were executed verbatim in a throwaway detached worktree at `BASE`; every install, every stage `cmp`, every expected RED set and every real-figure number reproduced, and the plan text was corrected wherever a command did not run literally (report: `EXP/evidence/2026-09-14-t23-build/reports/rehearsal.md`).

## Global Constraints

- **Branch:** `feat/c140-t23-scripts-reflow-decimals`. **`BASE`** = the commit that adds this plan. At `BASE`, `compose.py`, `figtext.py`, `strip-text.py`, `figure-prepare.py`, `figure-compose.py`, `svgout.py`, `blockkey.py` and `tools/` are byte-identical to `origin/main` `adac26ab` (only docs and evidence differ — verified 2026-09-14).
- **`EXP`** = `experiments/figure-text-translation`. Every Python command runs in `EXP` with `FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1`; `python3 -u` for anything longer than a few seconds.
- **Shell variables** (state does not persist between tool calls — `export` them at the top of every command that uses them): `REPO=/home/siggi/dev/repos/namsbokasafn-efni` · `EXP=$REPO/experiments/figure-text-translation` · `REF=$EXP/evidence/2026-09-14-t23-build/reference` · `SCRATCH=/home/siggi/dev/scratch-c140/build` (real disk — **never `/tmp`**, a ~4.9 GB RAM tmpfs; exocytosis alone is 25 MB per compose). Set `TMPDIR=$SCRATCH/tmp` for anything that makes temp files.
- **Do not delete `/home/siggi/dev/scratch-c140/` before Task 9 is complete.** Task 9 reads the session scratch the predictions were derived in — `prep/figs`, `plan/pred2` (and the `plan/pred` it reads as `PREV`), `r2`, `c3b`, `c3/pylibs-np` — through `reproduce.sh`, whose paths are absolute. If that tree is gone the predictions cannot be re-derived, and Task 9 must be re-planned, not improvised. Only `build/` under it is this plan's own.
- **Nothing under `books/` is written before Task 10**, and there only by `tools/figure-run.js --stale`. `books/*/01-source/` is never touched. **No MT, no spend:** never run `figure-run.js` without `--stale`; never run `translate-blocks.mjs`.
- **Test style:** plain asserts through `check(label, ok, detail)`; each file prints `ALL PASS` or `N FAILED: …` and exits `1 if fails else 0`. `HERE = Path(__file__).resolve().parent`, never `os.getcwd()`.
- **RED first.** Every new assertion is seen FAIL before the change that makes it pass. For an end-to-end assertion that is the unchanged composer; for a pure module it is the named mutation in its task (golden copy first, restore from the golden, `cmp`). Tests that are **pins or controls by design** — they pass on the unchanged code — are listed as such in their task with the mutation that kills them.
- **Source geometry is the PDF's own advances (`run['adv']`), never cairo `measure`**: a source line spans `min(FT.along(r))` … `max(FT.along(r) + r['adv'])`; a block's frame adds, per RUN, the normal range `proj − 0.21·size` … `proj + 0.73·size`. Translated text is measured by the one width function — hinted `measure` at stage A/B, linear metrics (`HINT_METRICS_OFF`) from stage C.
- **Constants are owned by the modules and pinned by their tests — never restated elsewhere.** The reference values are in the spec's Amendments and the module docstrings.
- **Arcs never go through `figlayout`.** A translated arc keeps today's glyph-on-circle path; a kept arc is drawn run-exact. `--control` never localises and lays nothing out.
- **Block keys never move:** nothing in `figtext.lines / group / merge_blocks / is_arc` or `blockkey` changes; `blocks.json` byte-identity on the 34 is checked in Task 9.
- **`grep -a`** for every census in this tree (NUL-bearing files).
- **Baselines by name (Task 1):** Python in the REPO layout (a copied tree cannot run `test_figure_compose.py` section 10); JS with `npx vitest run --reporter=json`. **A failure not in a task's expected set stops the work; an expected failure is not "fixed" in passing.**
- **Mutation-probe restore rule:** `cp` to a golden before the first mutation; restore from it (never `git checkout --`); `cmp` after every round and at the end; `git status --porcelain` whenever an agent that mutates files goes quiet.
- **Chromium survivors:** Playwright's processes are named `chrome-headless` — `pgrep -a chrome-headless`, never `headless_shell` / `chrome`.
- **Commit messages** end with the two lines `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X`.
- **Coordination:** a cloud session ("README and docs review") is editing the README and `docs/` on its own branch; it was told on 2026-09-14 which paths this branch touches. Do not move or rename docs; resolve any conflict in `docs/plans/2026-07-21-post-item17-followup-campaign.md` by keeping both sides' content.
- **[USER] facts for this plan:** the spec is approved with the floor at 7.5 pt (2026-09-14); **R9 binds symbols only** — a lowercase alphabetic 1–2 character word (`af`, `og`, `á`, `í`) may end a line (ruled 2026-09-14); buying stays stopped; the PR is not merged until [USER] has looked at the recomposed figures.

---

## File Structure

| file | change | task | responsibility |
|---|---|---|---|
| `EXP/svgfix.py`, `EXP/test_svgfix.py` | create | 2 | collapse cairo's blend lerp in artwork bytes; the reference-cost sentinel |
| `EXP/strip-text.py`, `EXP/figure-prepare.py`, `EXP/test_figure_prepare.py` | modify | 2 | call the collapse after `pdftocairo -svg` (+ `svgfix.json`); warn above 2^20 |
| `EXP/figcontainers.py`, `EXP/test_figcontainers.py` | create | 3 | box / cell / open per block; inner geometry; free space; alignment cues; never raises |
| `EXP/figlayout.py` | create | 3 (module) | the pure layout decision — installed early because `test_figcontainers.py` §9b imports it; `compose.py` uses it from Task 6 |
| `EXP/test_compose_t23.py`, `EXP/fixtures/compose-t23-golden.json` | create | 3 | end-to-end arms for ② ⑨ ③ on planted runs and a planted artwork page; goldens from the unchanged composer |
| `EXP/figscripts.py`, `EXP/test_figscripts.py` | create | 4 | script rule, body size, tokens, transfer, words / segments |
| `EXP/compose.py` | modify ×3 | 4, 5, 6 | stage A ② · stage B ⑨ · stage C ③ + `containerErrors` |
| `EXP/numloc.py`, `EXP/test_numloc.py` | create | 5 | rule R3 on one line, length-preserving |
| `EXP/figtext.py` | modify | 5 | `is_identity` also accepts the localised English token |
| `tools/__tests__/figure-consistency-parity.test.js` | create | 5 | the panel's `DECIMAL` agrees with R3 on the plain-decimal census strings |
| `EXP/test_figlayout.py` | create | 6 | `figlayout` unit tests |
| `EXP/test_compose_runexact.py` | modify | 6 | E's C1 control re-scoped (arc byte-identical; plain labels still draw their words) |
| `EXP/figure-compose.py`, `EXP/test_figure_compose.py` | modify ×2 | 6, 7 | `artwork.pdf` is a required input (6); the four note lists reach `compose.json` (7) |
| `tools/figure-run.js`, `tools/lib/figure-outcomes.js`, `tools/__tests__/figure-outcomes.test.js`, `tools/__tests__/figure-run-paid.test.js` | modify | 7 | NOTE reasons and named report sections |
| `tools/lib/figure-text-sidecar.cjs` | modify | 8 | `COMPOSER_VERSION` `'2'` → `'3'` |
| `EXP/evidence/2026-09-14-t23-build/VERIFICATION.md` | create | 9 | the real-figure measurements against `PREDICTIONS.md`, frozen |
| `books/efnafraedi-2e/media/*_IS.svg`, `books/efnafraedi-2e/figure-text/*.is.json` | data | 10 | 34 recomposed figures + restamped sidecars |
| campaign register, `EXP/REGISTER.md`, `EXP/README.md`, memory | modify | 12 | docs |

---

### Task 1: Baselines by name, and the reference build is intact

**Files:** none in the repo (scratch only).

**Interfaces:**
- Produces: `$SCRATCH/suite.py` (used by every later task), `$SCRATCH/baseline/py/by-name.json`, `$SCRATCH/baseline/js-failing-by-name.txt`.

- [ ] **Step 1: Check the reference build against its manifest**

```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
mkdir -p "$SCRATCH/tmp" && cd "$REF" && sha256sum -c MANIFEST.sha256 | grep -av ': OK$'; echo "manifest-check exit=${PIPESTATUS[0]}"
cd "$REPO" && git status --porcelain && git log --oneline -1
```
Expected: no non-OK line and `manifest-check exit=0`; a clean status; HEAD is `BASE`.

- [ ] **Step 2: Write the suite runner**

Create `$SCRATCH/suite.py`:

```python
#!/usr/bin/env python3
"""Run every EXP/test_*.py and record failures BY NAME.

    python3 -u suite.py run <outdir>                       -> <outdir>/by-name.json (+ one .out per file)
    python3 -u suite.py compare <baseline-dir> <now-dir>   -> NEWLY RED / NEWLY GREEN / NEW FILES, by name
"""
import json, subprocess, sys
from pathlib import Path

EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')


def run(out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    res = {}
    for t in sorted(EXP.glob('test_*.py')):
        r = subprocess.run([sys.executable, '-u', t.name], cwd=str(EXP), capture_output=True, text=True,
                           timeout=3600)
        (out / f'{t.stem}.out').write_text(r.stdout + '\n--- stderr ---\n' + r.stderr)
        fails = [l[8:].split(':')[0] for l in r.stdout.splitlines() if l.startswith('  FAIL  ')]
        last = (r.stdout.strip().splitlines() or [''])[-1]
        res[t.name] = dict(rc=r.returncode, fails=fails, last=last)
        print(f'{t.name:34} rc={r.returncode} fails={len(fails)} last={last[:70]!r}', flush=True)
    (out / 'by-name.json').write_text(json.dumps(res, indent=1, ensure_ascii=False))


def compare(base, now):
    b = json.loads((Path(base) / 'by-name.json').read_text())
    n = json.loads((Path(now) / 'by-name.json').read_text())
    for f in sorted(set(b) | set(n)):
        if f not in b:
            print(f'NEW FILE {f}: rc={n[f]["rc"]} fails={n[f]["fails"]} last={n[f]["last"][:60]!r}')
            continue
        if f not in n:
            print(f'GONE FILE {f}')
            continue
        red = sorted(set(n[f]['fails']) - set(b[f]['fails']))
        green = sorted(set(b[f]['fails']) - set(n[f]['fails']))
        crashed = n[f]['rc'] != 0 and not n[f]['fails'] and 'FAILED' not in n[f]['last']
        if red or green or crashed or (b[f]['rc'] == 0) != (n[f]['rc'] == 0):
            print(f'{f}: NEWLY RED {red} NEWLY GREEN {green} rc {b[f]["rc"]}->{n[f]["rc"]}'
                  + (' CRASHED (no FAIL lines)' if crashed else ''))
    print('compare done')


if __name__ == '__main__':
    {'run': lambda: run(sys.argv[2]), 'compare': lambda: compare(sys.argv[2], sys.argv[3])}[sys.argv[1]]()
```

- [ ] **Step 3: Python baseline, repo layout**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/baseline/py" 2>&1 | tail -20
```
Expected: one line per `test_*.py`. Record, do not fix, any non-zero rc (the scratch build measured every file ALL PASS in a repo-shaped layout). **A file that CRASHES here must be understood before Task 2** — its checks after the crash are invisible to every later compare.

- [ ] **Step 4: JS baseline by name**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build; cd /home/siggi/dev/repos/namsbokasafn-efni
npx vitest run --reporter=json --outputFile="$SCRATCH/baseline/js.json" > "$SCRATCH/baseline/js.log" 2>&1; echo "exit=$?"
python3 - "$SCRATCH" <<'EOF'
import json, sys
S = sys.argv[1]
d = json.load(open(f'{S}/baseline/js.json'))
names = sorted(tr['name'].split('namsbokasafn-efni/')[-1] + ' :: ' + a['fullName']
               for tr in d['testResults'] for a in tr['assertionResults'] if a['status'] == 'failed')
open(f'{S}/baseline/js-failing-by-name.txt', 'w').write('\n'.join(names) + '\n')
loadfail = sorted(tr['name'].split('namsbokasafn-efni/')[-1] for tr in d['testResults']
                  if tr['status'] == 'failed' and not tr['assertionResults'])
open(f'{S}/baseline/js-loadfail.txt', 'w').write('\n'.join(loadfail) + '\n')
print(len(names), 'failing;', d['numTotalTests'], 'tests; suites failing to LOAD:', loadfail)
EOF
```
(tool timeout 600000 — the full run measured 7 min.) Expected: `36 failing; 6480 tests; suites failing to LOAD: []` (rehearsal 2026-09-14; `main` is not green). **A suite that fails to load has no assertions, so the by-name list cannot see it — that is why it is recorded separately.** Every later JS check compares against both files.

---

### Task 2: `svgfix.py` — the blend-chain collapse and the reference-cost sentinel (spec commit (1))

**Files:**
- Create: `EXP/svgfix.py`, `EXP/test_svgfix.py` (from `REF/1-svgfix/`)
- Modify: `EXP/strip-text.py`, `EXP/figure-prepare.py`, `EXP/test_figure_prepare.py` (patches in `REF/1-svgfix/`)

**Interfaces:**
- Produces: `svgfix.collapse_blend_lerp(data: bytes) -> (bytes, dict)` with report keys `addOps, collapsed, useSitesRewritten, clipped, unmatched, modes`; `svgfix.reference_cost(data: bytes) -> (log2_cost: float, max_depth: int)`; `svgfix.REFCOST_WARN_LOG2 = 20`; `strip-text.collapse_svg(out_svg)` writing `OUT/'svgfix.json'` on every `--svg` run; `figure-prepare.reference_cost_warnings(svg)` feeding `prepare.json` `warnings`.

What the code does (spec §3 + Amendments): for each `feComposite` arithmetic add (`k = 0,1,1,0`) over two `feImage`s, it checks semantically that R is a group with only `filter`+`mask` whose filter is a two-input `feBlend` over the same subregion, that Ma is an opaque white cover over that subregion, and that L is masked by the inverted Ma; then it rewrites the use site `filter="url(#F_add)"` → `filter="url(#F_blend)"` with the blend id **resolved from R**, by one regex pass over the raw bytes with a count cross-check — it never serialises the tree. A paint whose Ma is a real clip is `clipped`; any other shape is `unmatched`; no change returns the same bytes. `reference_cost` is the memoised no-sharing reference walk (iterative, cycle-safe).

- [ ] **Step 1: Install the unit test and see it RED against a stub**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference
cd "$EXP" && cp "$REF/1-svgfix/test_svgfix.py" .
cat > svgfix.py <<'EOF'
REFCOST_WARN_LOG2 = 20
def collapse_blend_lerp(data):
    return data + b'<!--stub-->', dict(addOps=0, collapsed=0, useSitesRewritten=0, clipped=0, unmatched=0, modes={})
def reference_cost(data):
    return float('nan'), -1
EOF
PYTHONDONTWRITEBYTECODE=1 python3 test_svgfix.py | tail -1
```
Expected: `26 FAILED: …` (the scratch build measured 26 FAIL / 2 PASS against this stub; the 2 passes are the precondition `1a` and the constant control `7d`).

- [ ] **Step 2: Install the module and see it GREEN**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference
cd "$EXP" && cp "$REF/1-svgfix/svgfix.py" svgfix.py && cmp svgfix.py "$REF/1-svgfix/svgfix.py" && PYTHONDONTWRITEBYTECODE=1 python3 test_svgfix.py | tail -1
```
Expected: `ALL PASS`.

- [ ] **Step 3: Named mutation — the blend id must be resolved, not assumed**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && mkdir -p "$SCRATCH/golden" && cp svgfix.py "$SCRATCH/golden/svgfix.py"
python3 - <<'EOF'
p = 'svgfix.py'; s = open(p).read(); old = "    fb_id = _urlref(R.get('filter'))"
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "    fb_id = None"))
EOF
PYTHONDONTWRITEBYTECODE=1 python3 test_svgfix.py | grep -a '^  FAIL' | head -3; cp "$SCRATCH/golden/svgfix.py" svgfix.py && cmp svgfix.py "$SCRATCH/golden/svgfix.py" && echo restored
```
Expected: FAIL lines including `1b the use site is retargeted to the blend id RESOLVED from R …`; then `restored`.

- [ ] **Step 4: Apply the strip-text / prepare patches; the prepare test's new section is RED first**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/1-svgfix/test_figure_prepare.py.diff"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_prepare.py | tail -1
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/1-svgfix/strip-text.py.diff" "$REF/1-svgfix/figure-prepare.py.diff"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_prepare.py | tail -1
```
Expected: first run `4 FAILED: 6 PRECONDITION figure-prepare.py exposes reference_cost_warnings, 6a …, 6b …, 6c …`; second run `ALL PASS`.

- [ ] **Step 5: Whole Python suite by name**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t2/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/baseline/py" "$SCRATCH/t2/py"
```
Expected: `NEW FILE test_svgfix.py: rc=0 fails=[] …` and nothing else before `compare done`.

- [ ] **Step 6: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{svgfix.py,test_svgfix.py,strip-text.py,figure-prepare.py,test_figure_prepare.py}
git commit -m "feat(figures): collapse cairo's blend-chain lerp so exocytosis loads (§C140, spec commit 1)

cairo's SVG surface writes every blend-mode paint as add(blend(S,D)·Ma, D·(1−Ma)),
referencing everything painted so far twice: exocytosis's 158 paints are a 2^116
reference tree no browser finishes. Where Ma covers the subregion the second term
is zero, so the use site points at the blend filter directly. svgfix.json is
written on every run; figure-prepare warns above a 2^20 reference cost whatever
the collapse matched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 3: The end-to-end harness — `figcontainers.py`, `test_compose_t23.py`, goldens from the UNCHANGED composer

**Files:**
- Create: `EXP/figcontainers.py`, `EXP/test_figcontainers.py`, `EXP/test_compose_t23.py`, `EXP/fixtures/compose-t23-golden.json` (from `REF/2-harness/`); `EXP/figlayout.py` (from `REF/5-reflow/`)

**Interfaces:**
- Produces: `figcontainers.source_frame(block) -> (a0, a1, n0, n1)`; `page_bbox(block) -> (x0, y0, x1, y1)`; `load_page(pdf_path) -> dict`; `classify(page, bbox) -> (cls, inner, why)`; `container_for(index, blocks, page, dark, page_h) -> dict` (never raises; box/cell `{cls, why, L, R, D, U, src_*_margin, align, align_why}`, open `{cls, why, FL, FR, room_up, room_down, free_left_clear, free_right_clear, align, align_why}`, error → open with `why` `error: <Type>`).
- ⚠️ `figcontainers.py` lands here, before the composer uses it (Task 6), because `test_compose_t23.py` imports it to classify its planted artwork pages; `figlayout.py` lands here too, because `test_figcontainers.py` §9b (an error container is visible only through its layout) imports it. Nothing in `compose.py` imports either until Task 6. (Rehearsal 2026-09-14: without `figlayout.py`, `test_figcontainers.py` crashes at §9b from Task 3 to Task 6.)

What `figcontainers` does (spec §4 + Amendments): per block, from the stripped `artwork.pdf` via pdfplumber — **box** = the smallest closed stroked path enclosing the source frame (+0.5 pt) with area < 25 % of the page and no side within 0.25 pt of the page edge; **cell** = a fill-only rect enclosing it, or the nearest rule on each of four sides from ≥ 2 paths where **every rule spans the cell** (within 1.0 pt); otherwise **open**. Every container side is pulled in by `max(linewidth, 1.0)/2`. Open blocks get a free box by ray-marching `artwork.png` (Pillow, dark = L < 128) and other blocks' per-run source frames, in the block's rotation. Alignment: box → centre; cell → multi-line FT alignment with adv widths (ambiguous → centre) or single-line margins (far/tight ≥ 20 → flush); open → multi-line as cell, single-line flush-to-obstacle (tight ≤ 4.75 pt and far/tight ≥ 20), else a sibling edge within 0.2 pt (left-only / right-only), else centre.

- [ ] **Step 1: Install `figcontainers` + its unit test; named mutation shows the SPAN test can fail**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp "$REF/2-harness/figcontainers.py" "$REF/2-harness/test_figcontainers.py" "$REF/5-reflow/figlayout.py" .
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 test_figcontainers.py | tail -1
cp figcontainers.py "$SCRATCH/golden/figcontainers.py"
python3 - <<'EOF'
p = 'figcontainers.py'; s = open(p).read(); old = "SPAN = 1.0  "
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "SPAN = 1e9  "))
EOF
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 test_figcontainers.py | grep -a '^  FAIL'
cp "$SCRATCH/golden/figcontainers.py" figcontainers.py && cmp figcontainers.py "$REF/2-harness/figcontainers.py" && echo restored
```
Expected: `ALL PASS`; then exactly `FAIL  bracketing, non-spanning rules -> open` and `FAIL  ... and the why names the refusal`; then `restored`. (Pins in this file that pass on any version — the hostile-input `[F7]` cases, the precondition and two controls — are killed by the builder's mutants M7a–M7d, recorded in `reports/round2-4-fix-verify.md`.)

- [ ] **Step 2: Install the end-to-end test and capture the golden from the UNCHANGED composer**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp "$REF/2-harness/test_compose_t23.py" .
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_compose_t23.py --capture-golden | tail -3
cmp fixtures/compose-t23-golden.json "$REF/2-harness/compose-t23-golden.json" && echo "golden == reference"
```
Expected: `wrote compose-t23-golden.json`, `ALL PASS`, `golden == reference` (the clock is pinned with `SOURCE_DATE_EPOCH`, so the capture is deterministic). **A golden that differs from the reference: STOP** — the composer here is not the one the build was verified against.

- [ ] **Step 3: The whole end-to-end file on the unchanged composer — exactly the expected 23 RED**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_compose_t23.py > "$SCRATCH/t3-e2e.out" 2>&1; echo "exit=$?"
cat > "$SCRATCH/e2e_ids.py" <<'EOF'
"""e2e_ids.py <output> <expected id>... : the FAIL lines of test_compose_t23.py, by id, against the expected multiset."""
import collections, sys
got = collections.Counter(l[8:].split()[0] for l in open(sys.argv[1], encoding='utf-8') if l.startswith('  FAIL  '))
want = collections.Counter(sys.argv[2:])
print('FAILED ids:', ' '.join(sorted(got.elements())) or '(none)')
print('MATCH' if got == want else f'MISMATCH extra={dict(got - want)} missing={dict(want - got)}')
EOF
python3 "$SCRATCH/e2e_ids.py" "$SCRATCH/t3-e2e.out" S1 S1 S2 S3 D1 D2 L1 L2 L3 L4 L5 L6 L7 L8 X0 X1 X2 X3 X5 LG1 LG2 R9a R9b
```
Expected: `exit=1` and `MATCH`. These are the RED-first evidence for every ② ⑨ ③ end-to-end assertion. **By design never RED:** the controls `G1 G2 G3 D3 T2 L4c`, the sentinels `T1 T3`, and the pins `L0` (the prototype's crash, which `compose.py` never had) and `X4`. A PRECONDITION failure, or any other id: STOP.

- [ ] **Step 4: Suite by name, then commit**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t3/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t2/py" "$SCRATCH/t3/py"
```
Expected: `NEW FILE test_figcontainers.py: rc=0 …` and `NEW FILE test_compose_t23.py: rc=1 fails=[…23 labels…]`, nothing else.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{figcontainers.py,figlayout.py,test_figcontainers.py,test_compose_t23.py,fixtures/compose-t23-golden.json}
git commit -m "test(figures): §C140 end-to-end harness and goldens from the unchanged composer

test_compose_t23.py plants runs on the committed fixture and plants artwork pages
(a box, a table grid, an arrow) for the ② ⑨ ③ arms; 23 assertions are RED on the
unchanged composer and turn green by stage. figcontainers.py and figlayout.py land
with it because the harness and figcontainers' tests import them; compose.py uses
neither until ③.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 4: ② — formula formatting in translated labels, on today's layout (spec commit (2))

**Files:**
- Create: `EXP/figscripts.py`, `EXP/test_figscripts.py` (from `REF/3-scripts/`)
- Modify: `EXP/compose.py` (`REF/3-scripts/compose.py.A.diff`; result must equal `REF/stages/compose.A.py`)

**Interfaces:**
- Produces: `figscripts.SourceStyle(ratio, frac, italic)` (a namedtuple); `is_symbol_run(run, fonts)`; `body_size(block, fonts) -> float`; `line_styles(line, fonts) -> (text, styles, base, inverted)`; `token_lines(block, fonts=None)`; `source_tokens(block, fonts) -> (tokens, misses)`; `transfer(tokens, value) -> (fmt, misses)`; `words(value, fmt) -> [(word, styles)]`; `segments(chars)`; `split_at_word_edges(segs)`. Miss reasons: `absent ambiguous no-base partial stacked inverted-base arc`.
- `compose.py` stage A: the report gains `unformatted: [{key, token, stretch, reason, candidates}]` (draw order, multiplicity); ITEMS entries gain `path` (`run-exact` | `arc` | `layout`) and, on layout items, `line` / `seg`; the block loop is `for BI, b in enumerate(blocks)`; a legacy list value gets ONE transfer over the joined string with styles sliced back per paragraph.

What the code does (spec §1 + Amendments): per `FT.lines` line (stacked charge lines attached for tokens only), base size = most letters among non-symbol runs; letter-weighted baseline; a run is a script iff `|Δproj| ≥ 0.075·base` when `size < 0.9·base`, else `≥ 0.13·base`; an inverted base resolves to the largest non-symbol letter-bearing run or is named `inverted-base`; body size uses each line's resolved base. Tokens are `\S+` stretches holding a styled char, edge punctuation trimmed, de-duplicated; transfer places every clean occurrence, longest first, with the anchored fallback and `partial` on glued repeats; the value is never altered. Stage A draws one `<text>` per equal-style segment at `sz·ratio`, baseline `+ sz·frac`, plain text cut at the adjacent space — on **today's** hinted measure, wrap, `BOXW` and anchor, so a label with nothing to style draws byte-identically.

- [ ] **Step 1: Install `figscripts` + its unit test; named mutation (the flat-threshold defect)**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp "$REF/3-scripts/figscripts.py" "$REF/3-scripts/test_figscripts.py" .
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 python3 test_figscripts.py | tail -1
cp figscripts.py "$SCRATCH/golden/figscripts.py"
python3 - <<'EOF'
p = 'figscripts.py'; s = open(p).read(); old = "SMALL_SHIFT = 0.075"
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "SMALL_SHIFT = 0.12"))
EOF
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 python3 test_figscripts.py | grep -a '^  FAIL'
cp "$SCRATCH/golden/figscripts.py" figscripts.py && cmp figscripts.py "$REF/3-scripts/figscripts.py" && echo restored
```
Expected: `ALL PASS`; then `FAIL  S3b the 2 at -1.0 pt (0.111) is styled` (the real `CNX_Chem_19_03_Dorbital` `dz2` run a flat 0.12 rule misses); then `restored`.

- [ ] **Step 2: Apply stage A to `compose.py`**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/3-scripts/compose.py.A.diff" && cmp "$EXP/compose.py" "$REF/stages/compose.A.py" && echo "stage A installed"
```
Expected: `stage A installed`. The load-bearing excerpt of the draw (read it in the file, do not retype it):

```python
        for k, (t, st) in enumerate(segs):
            aa = a_ + off
            pp = p_ if st is None else p_ + sz * st.frac
            x = aa * math.cos(rad) - pp * math.sin(rad)
            y = aa * math.sin(rad) + pp * math.cos(rad)
            px, py = dev(x, y)
            setfont_st(fr, sz, st)
            ITEMS.append(dict(path='layout', line=j, seg=k, text=t, x=px / S, y=H_PT - py / S,
                              rot=rot, size=sz if st is None else sz * st.ratio,
                              bold=fr['font'] in BOLD, italic=st is not None and st.italic,
                              rgb=cmyk(fr['fill']), dx=0.0))
            ...
            off += seg_advance(t, fr, sz, st)
```

- [ ] **Step 3: End-to-end — exactly the expected 17 RED**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_compose_t23.py > "$SCRATCH/t4-e2e.out" 2>&1; echo "exit=$?"
python3 "$SCRATCH/e2e_ids.py" "$SCRATCH/t4-e2e.out" D1 D2 L1 L2 L3 L4 L5 L6 L7 L8 X0 X1 X2 X3 X5 R9a R9b
```
Expected: `exit=1`, `MATCH`. Turned GREEN by this task: `S1`×2 (the `3` and `4` of `Na3PO4` are their own `<text>` at 8.000 pt, 3.000 below), `S2`, `S3` (a formula replaced by a name names both stretches), `LG1`, `LG2`. `G2` still passes on its byte-identity arm.

- [ ] **Step 4: Suite by name, then commit**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t4/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t3/py" "$SCRATCH/t4/py"
```
Expected: `NEW FILE test_figscripts.py: rc=0 …`; `test_compose_t23.py: NEWLY RED [] NEWLY GREEN [6 labels]`; nothing else. (`test_figure_compose.py`'s `drawn_text` substring checks do not move: the fixture's labels carry no formula and stay one `<text>` each — measured.)

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{figscripts.py,test_figscripts.py,compose.py}
git commit -m "feat(figures): ② translated labels keep their formula formatting (§C140, spec commit 2)

Source runs are classified once per line (size-conditional script thresholds,
letter-weighted baseline, a guard against an inverted base); formatted tokens are
transferred onto the sidecar value by clean occurrence and drawn one <text> per
styled segment. Misses are named in compose-report unformatted, never silent.
Layout is untouched: a label with nothing to style draws byte-identically.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 5: ⑨ — decimal commas in English-kept labels (spec commit (3))

**Files:**
- Create: `EXP/numloc.py`, `EXP/test_numloc.py` (from `REF/4-numloc/`); `tools/__tests__/figure-consistency-parity.test.js`
- Modify: `EXP/figtext.py` (`REF/4-numloc/figtext.py.diff`), `EXP/compose.py` (`REF/4-numloc/compose.py.B.diff`; result must equal `REF/stages/compose.B.py`)

**Interfaces:**
- Produces: `numloc.localize(text) -> str` (asserts `len(out) == len(text)`); `numloc.localize_runs(texts) -> list`; `figtext.is_identity(value, english, arc)` now also true when each token equals the same token of `numloc.localize(english)`; compose report `localized: [key…]`.

What the code does (spec §2): R3 on ONE line — a line holding a coordinate tuple is left alone; every thousands group becomes `.` across all groups; a digit-flanked `.` becomes `,`; a bare overprint fragment `\d+\.` converts; a leading point (`.625`) is left. Stage B applies it in the kept branch per `FT.lines` line on the RAW run texts (joined, localised, split back by length) before `run_draw_text`, never under `--control`. R3 is not idempotent (`1.008 → 1,008 → 1.008`), so it runs only on source text.

- [ ] **Step 1: Install `numloc` + its unit test; named mutation**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp "$REF/4-numloc/numloc.py" "$REF/4-numloc/test_numloc.py" .
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/4-numloc/figtext.py.diff" && cd "$EXP"
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 python3 test_numloc.py | tail -1
cp numloc.py "$SCRATCH/golden/numloc.py"
python3 - <<'EOF'
p = 'numloc.py'; s = open(p).read(); old = "    out = _r2_line(text)\n"
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "    out = text\n"))
EOF
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 python3 test_numloc.py | tail -1
cp "$SCRATCH/golden/numloc.py" numloc.py && cmp numloc.py "$REF/4-numloc/numloc.py" && echo restored
```
Expected: `ALL PASS`; then `13 FAILED: 1a every B1 line R3 CONVERTS gives the census R3 output (202), …`; then `restored`.

- [ ] **Step 2: The parity vitest**

```bash
export REF=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-14-t23-build/reference
cd /home/siggi/dev/repos/namsbokasafn-efni && cp "$REF/4-numloc/figure-consistency-parity.test.js.ref" tools/__tests__/figure-consistency-parity.test.js
npx vitest run tools/__tests__/figure-consistency-parity.test.js 2>&1 | grep -a "Tests \|Test Files"
npx prettier --check tools/__tests__/figure-consistency-parity.test.js && npx eslint tools/__tests__/figure-consistency-parity.test.js && echo lint-ok
```
Expected: `Tests  3 passed (3)`; `lint-ok`. (This is a parity pin between two implementations that already agree — its RED evidence is a planted disagreement: change one expected value in a scratch copy and see it fail, then delete the copy.)

- [ ] **Step 3: Apply stage B; end-to-end — exactly the expected 15 RED**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/4-numloc/compose.py.B.diff" && cmp "$EXP/compose.py" "$REF/stages/compose.B.py" && echo "stage B installed"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_compose_t23.py > "$SCRATCH/t5-e2e.out" 2>&1; echo "exit=$?"
python3 "$SCRATCH/e2e_ids.py" "$SCRATCH/t5-e2e.out" L1 L2 L3 L4 L5 L6 L7 L8 X0 X1 X2 X3 X5 R9a R9b
```
Expected: `stage B installed`, `exit=1`, `MATCH`. Turned GREEN: `D1` (a planted kept `26.98` draws `26,98` at the unchanged composer's x and y) and `D2` (`localized` names it). `D3` (`--control` draws `26.98`) stays green.

- [ ] **Step 4: Suite and JS by name, then commit**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t5/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t4/py" "$SCRATCH/t5/py"
```
Expected: `NEW FILE test_numloc.py: rc=0 …`; `test_compose_t23.py: NEWLY RED [] NEWLY GREEN [D1…, D2…]`; nothing else (`test_figtext_*` unchanged).

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{numloc.py,test_numloc.py,figtext.py,compose.py} tools/__tests__/figure-consistency-parity.test.js
git commit -m "feat(figures): ⑨ English-kept numbers drawn with Icelandic separators (§C140, spec commit 3)

Rule R3 per drawn line on the source run text: every thousands group becomes a
period, a digit-flanked point a comma; tuples and a leading point are left alone.
Keys, blocks.json and sidecars never change; --control never localises. An
identity reply that an editor localised with the panel's Nota stays identity.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 6: ③ — per-block wrap budget, anchor and size (spec commit (4))

**Files:**
- Create: `EXP/test_figlayout.py` (from `REF/5-reflow/`; `figlayout.py` itself was installed in Task 3)
- Modify: `EXP/compose.py` (`REF/5-reflow/compose.py.C.diff`; result must equal `REF/stages/compose.C.py`), `EXP/test_compose_runexact.py`, `EXP/figure-compose.py`, `EXP/test_figure_compose.py` (patches in `REF/5-reflow/`)

**Interfaces:**
- Produces: `figlayout.decide(words, width, container, cues, floor=7.5, pad=2.0) -> Layout` with `lines, size, align, anchor, x0, top, lead, disp, vdisp, step, overflow, widths, budget, bound, heightFit, cls`; `overflow` is `None` or `{word, needPt, budgetPt, sizePt, axis}` plus `linePt` (width axis) and `heightNeedPt`/`heightBudgetPt` (a width entry whose glyph box also misses height). Steps: box/cell `fit` | `floor-overflow`; open `i ii iii-anchor iii-displaced iv-gain v-overflow`.
- `compose.py` stage C: the report gains `overflow` (`{key, block, word, needPt, budgetPt, sizePt, axis}` + the optional fields) and `containerErrors: [{key, block, why}]`; stdout gains NOTE sections (each starting with `\n`); the per-block report line names `[<cls> <step>]`. `BOXW`, `maxw` and `wrap()` leave the translated path.
- `figure-compose.py`: `artwork.pdf` joins `REQUIRED_INPUTS` (compose now reads it; a missing one is refused before compose runs — even for a figure with nothing translated).

What `figlayout.decide` does (spec §4 + Amendments): sizes from body size down by 0.25 to `min(7.5, body size)` (the floor itself always tried); min-max balanced partitions per line count; **R9: never cut directly after a 1–2 character word unless it is lowercase alphabetic** — for the chosen count only, never changing count or size; box: centre every line, width and height budgets = inner − 2·PAD, every count ≤ the source's tried down to the floor before a larger count; cell: source alignment and anchor, displaced only to stay inside; open: steps (i)–(v) against the free box; a word that does not fit at the floor overhangs and is named.

- [ ] **Step 1: Install `figlayout` + its unit test; named mutation (R9)**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cmp figlayout.py "$REF/5-reflow/figlayout.py" && cp "$REF/5-reflow/test_figlayout.py" .
PYTHONDONTWRITEBYTECODE=1 python3 test_figlayout.py | tail -1
cp figlayout.py "$SCRATCH/golden/figlayout.py"
python3 - <<'EOF'
p = 'figlayout.py'; s = open(p).read(); old = "        return len(w) > SHORT_TOKEN or (w.isalpha() and w.islower())"
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "        return True"))
EOF
PYTHONDONTWRITEBYTECODE=1 python3 test_figlayout.py | tail -1
cp "$SCRATCH/golden/figlayout.py" figlayout.py && cmp figlayout.py "$REF/5-reflow/figlayout.py" && echo restored
```
Expected: `ALL PASS`; then `9 FAILED: [F1] a symbol '2' still binds to the word after it, …`; then `restored`.

- [ ] **Step 2: Apply stage C, the `runexact` re-scope and the `artwork.pdf` pre-flight**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/5-reflow/test_figure_compose.py.diff"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_compose.py > "$SCRATCH/t6-fc-red.out" 2>&1; grep -a '^  FAIL' "$SCRATCH/t6-fc-red.out" | cut -c9- | cut -d: -f1
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/5-reflow/compose.py.C.diff" "$REF/5-reflow/test_compose_runexact.py.diff" "$REF/5-reflow/figure-compose.py.diff"
cmp "$EXP/compose.py" "$REF/stages/compose.C.py" && echo "stage C installed"
```
Expected: the first run's FAIL ids start with `4g` / `4h` / `4i` (a missing `artwork.pdf` refused before compose runs — RED against the stage-B composer, whose unchanged wrapper does not pre-flight it); then `stage C installed`.

- [ ] **Step 3: End-to-end — ALL PASS; the prepare / wrapper / runexact files by name**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_compose_t23.py > "$SCRATCH/t6-e2e.out" 2>&1; echo "exit=$?"
python3 "$SCRATCH/e2e_ids.py" "$SCRATCH/t6-e2e.out"
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t6/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t5/py" "$SCRATCH/t6/py"
```
Expected: `exit=0`, `FAILED ids: (none)`, `MATCH`. Turned GREEN: `L1`–`L8` (boxed label centred in its box; right-flush cell stays right-flush; an arrow label keeps two lines and clears the arrow — `L4` was re-planted so the unchanged composer collides; the floor word drawn at 7.5 pt and named on the width axis with `linePt`; the edited identity label laid out; every report line names class and step), `X0 X1 X2 X3 X5` (`containerErrors` present, empty when nothing raised, naming exactly a planted failure with a stdout NOTE after a blank line), `R9a R9b` (`Mól af | CO2`; `Massi | A atóma`). Suite compare: `NEW FILE test_figlayout.py: rc=0 …`; `test_compose_t23.py: NEWLY RED [] NEWLY GREEN [15 labels] rc 1->0`; nothing else. `test_compose_runexact.py` stays `rc=0` because its C1 is re-scoped in this commit (the arc must stay byte-identical; C1b: the two plain labels still draw exactly their words) — without the re-scope, C1 would fail here, since ③ re-lays those two labels (measured). `test_figure_compose.py` stays `rc=0` with its new `4f`–`4j` passing (Step 2 showed `4g 4h 4i` RED).

- [ ] **Step 4: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{test_figlayout.py,compose.py,test_compose_runexact.py,figure-compose.py,test_figure_compose.py}
git commit -m "feat(figures): ③ translated labels laid out against their own box, cell or open space (§C140, spec commit 4)

One width function in linear metrics; containers detected per block from the
stripped artwork; line count first, min-max balance, symbols bound to the next
word ([USER] R9, symbols only), centred in boxes, source-aligned in cells, the
open path's five steps; nothing below 7.5 pt, and every overhang named on its
axis. A container detection that raises is laid out as open and named in
containerErrors. figure-compose.py now requires artwork.pdf.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 7: The report reaches the driver — `compose.json` note lists and `NOTE (not a failure)` (spec commit (5))

**Files:**
- Modify: `EXP/figure-compose.py`, `EXP/test_figure_compose.py` (`REF/6-notes/*.py.diff`); `tools/figure-run.js`, `tools/lib/figure-outcomes.js`, `tools/__tests__/figure-outcomes.test.js`, `tools/__tests__/figure-run-paid.test.js` (`REF/6-notes/tools.diff`)

**Interfaces:**
- Produces: `compose.json` on success = `{outputPath, unformatted, overflow, localized, containerErrors}` copied verbatim from the report (`[]` when absent); `rec.composeNotes` on each record; one verdict reason per non-empty list — `NOTE (not a failure): N translated figure(s) carry formula formatting the composer could not place — the report names each` · `N figure(s) carry label(s) drawn at the floor that overhang their space — the report names each` · `N figure(s) had English-kept numbers drawn with a decimal comma` · `N figure(s) had container detection fail — those labels were laid out as open` — and one named report section per list (overflow lines print a height overhang as a glyph box). `translated` figures only.

- [ ] **Step 1: Tests first — RED against the current wrapper and driver**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply --include='experiments/figure-text-translation/test_figure_compose.py' "$REF/6-notes/test_figure_compose.py.diff"
git apply --include='tools/__tests__/*' "$REF/6-notes/tools.diff"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_compose.py > "$SCRATCH/t7-fc-red.out" 2>&1; grep -a '^  FAIL' "$SCRATCH/t7-fc-red.out" | cut -c9- | cut -d: -f1
cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js 2>&1 | grep -a "Tests \|×" | head -20
```
Expected: Python FAIL ids exactly `2h 11a 11b 11d` (the scratch verifier measured these RED on the unchanged wrapper; `11 PRECONDITION` and `11c` are controls that pass). JS: every new case fails except the control `says nothing when every count is zero` (the verifier measured 13 of the 14 round-two cases RED; the height-overhang formatting case added afterwards was seen RED on the unchanged formatter).

- [ ] **Step 2: Apply the sources; GREEN; lint and format**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation; export REF=$EXP/evidence/2026-09-14-t23-build/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF/6-notes/figure-compose.py.diff" && git apply --exclude='tools/__tests__/*' "$REF/6-notes/tools.diff"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_compose.py | tail -1
cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js tools/__tests__/figure-run-free.test.js 2>&1 | grep -a "Tests \|Test Files"
npx prettier --check tools/figure-run.js tools/lib/figure-outcomes.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js && npx eslint tools/figure-run.js tools/lib/figure-outcomes.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js && echo lint-ok
```
Expected: `ALL PASS`; the three JS files' failures are exactly the baseline's failures in those files (Step 3 checks by name); `lint-ok`.

- [ ] **Step 3: JS by name against the baseline, then commit**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build; cd /home/siggi/dev/repos/namsbokasafn-efni
npx vitest run --reporter=json --outputFile="$SCRATCH/t7-js.json" > "$SCRATCH/t7-js.log" 2>&1; echo "exit=$?"
python3 - "$SCRATCH" t7-js.json <<'EOF'
import json, sys
S = sys.argv[1]
d = json.load(open(f'{S}/{sys.argv[2]}'))
now = sorted(tr['name'].split('namsbokasafn-efni/')[-1] + ' :: ' + a['fullName']
             for tr in d['testResults'] for a in tr['assertionResults'] if a['status'] == 'failed')
base = [l for l in open(f'{S}/baseline/js-failing-by-name.txt').read().splitlines() if l]
loadfail = sorted(tr['name'].split('namsbokasafn-efni/')[-1] for tr in d['testResults']
                  if tr['status'] == 'failed' and not tr['assertionResults'])
print('tests', d['numTotalTests'])
print('NEWLY RED:', sorted(set(now) - set(base)))
print('NEWLY GREEN:', sorted(set(base) - set(now)))
print('suites failing to LOAD:', loadfail, '| baseline:', [l for l in open(f'{S}/baseline/js-loadfail.txt').read().splitlines() if l])
EOF
```
(tool timeout 600000 — measured 7 min.) Expected: `tests` = the baseline count + 18 (3 parity + 15 note tests; rehearsal: 6498); `NEWLY RED: []`; `NEWLY GREEN: []`; `suites failing to LOAD` equal to the baseline's (`[]`).

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{figure-compose.py,test_figure_compose.py} tools/figure-run.js tools/lib/figure-outcomes.js tools/__tests__/figure-outcomes.test.js tools/__tests__/figure-run-paid.test.js
git commit -m "feat(figures): the composer's notes reach the driver as NOTE lines (§C140, spec commit 5)

compose.json now carries unformatted, overflow, localized and containerErrors
verbatim; figure-run names each per figure and key, and each list is a NOTE in
the verdict, never a failure.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 8: `COMPOSER_VERSION` `'2'` → `'3'`, checked against the JS baseline by name (spec commit (6))

**Files:**
- Modify: `tools/lib/figure-text-sidecar.cjs` (the `COMPOSER_VERSION` docblock and constant)

**Interfaces:**
- Produces: `COMPOSER_VERSION === '3'`, which makes `isStale` select every committed sidecar (Task 10). **A server change** — `server/services/figureReviewService.js` requires it: merge → `deploy.sh` → verify the figures route.

- [ ] **Step 1: Bump**

Append to the docblock above the constant, and change the value:

```js
 * '3' (2026-09-14, §C140 ② ③ ⑨): translated labels keep their formula formatting and are laid
 * out against their own container; English-kept numbers are drawn with a decimal comma; the
 * artwork's cairo blend chains are collapsed so a browser can load them.
 */
const COMPOSER_VERSION = '3';
```

- [ ] **Step 2: JS by name**

Run the Task 7 Step 3 commands with `--outputFile="$SCRATCH/t8-js.json"` and the snippet's second argument `t8-js.json` (tool timeout 600000). Expected (rehearsal: 2 NEWLY RED — `skips exactly the figures that really do have a current sidecar …` and `names an unresolved figure instead of failing the run over it (R9)` — and 7 NEWLY GREEN, all in that file): every NEWLY RED / NEWLY GREEN name is in `tools/__tests__/figure-run-free.test.js`, and every moved test reads the COMMITTED sidecars' `composedVersion` (E's bump moved 7 baseline reds to green and 2 greens to red there; the direction depends on the baseline — read each moved test). **Any other file, or a moved test that does not read committed sidecars: STOP and report.** Record both lists in `$SCRATCH/t8-delta.txt` — Task 10 checks the reverse.

- [ ] **Step 3: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add tools/lib/figure-text-sidecar.cjs
git commit -m "feat(figures): COMPOSER_VERSION 3 — every committed figure recomposes

Formulas, re-flow, decimal commas and the blend-chain collapse alter pixels for
unchanged text, which is this constant's contract. All 34 efnafraedi sidecars go
stale until the recompose data commit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 9: The 34 real figures against `PREDICTIONS.md`, 0 ISK

**Files:**
- Create (scratch only): `$SCRATCH/t9/*.py`
- Create (committed): `EXP/evidence/2026-09-14-t23-build/VERIFICATION.md`

**Interfaces:**
- Consumes: `PREDICTIONS.md`; the predictor's pipeline `/home/siggi/dev/scratch-c140/plan/pred2/reproduce.sh` (copies in `EXP/evidence/2026-09-14-t23-build/instruments/predict/`); the prepared inputs `/home/siggi/dev/scratch-c140/prep/figs/<basename>/` (BASE artwork); numpy/scipy from `/home/siggi/dev/scratch-c140/c3/pylibs-np` (the repo `pylibs` has none).
- Produces: `VERIFICATION.md`; `$SCRATCH/t9/*.json` used by Task 11's cards.

- [ ] **Step 1: The composer, byte for byte, against the verified build — and the frozen instruments against the predictions**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
rm -rf "$SCRATCH/t9/repo-exp" && mkdir -p "$SCRATCH/t9" && rsync -a --exclude pylibs --exclude out --exclude evidence --exclude __pycache__ "$EXP/" "$SCRATCH/t9/repo-exp/" && ln -s "$EXP/pylibs" "$SCRATCH/t9/repo-exp/pylibs"
timeout 1800 bash /home/siggi/dev/scratch-c140/plan/pred2/reproduce.sh "$SCRATCH/t9/repo-exp" REPO 2>&1 | tail -14
python3 - <<'EOF'
import json, glob, os
P = '/home/siggi/dev/scratch-c140/plan/pred2'
a = json.load(open(f'{P}/out/analysis-final.json'))['per_tag']['FINAL']
b = json.load(open(f'{P}/out/analysis-final-REPO.json'))['per_tag']['REPO']
print('analysis per_tag REPO == FINAL:', a == b)
diff = [os.path.basename(d.rstrip('/')) for d in sorted(glob.glob(P + '/work/FINAL/*/'))
        if any(open(d + f, 'rb').read() != open(f"{P}/work/REPO/{os.path.basename(d.rstrip('/'))}/{f}", 'rb').read()
               for f in ('items.json', 'compose-report.json'))]
print('figures whose items.json or compose-report.json differ from the verified build:', diff or 'none')
EOF
```
Expected: the controls print `byte-identical to frozen` five times and `fires 3 of 3`; `REPO rank (4, 4, 7, 7, 6.0, 0)`; `analysis per_tag REPO == FINAL: True`; `… differ from the verified build: none`. **Byte-equal items and reports on 34/34 means every number in `PREDICTIONS.md` holds for the repository implementation** (they are computed from those files). A difference: STOP, name the figures, and read `PREDICTIONS.md` § Hazards before calling it a miss (an instrument failure — a patch anchor that stopped matching — is not a prediction miss).

- [ ] **Step 2: Artwork on the 34 — re-prepare with the repo, compare with the BASE preparation**

Create `$SCRATCH/t9/artwork34.py`:

```python
#!/usr/bin/env python3
"""Re-prepare the 34 with the repository's figure-prepare.py; compare with prep/figs (BASE). One at a time."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni'); EXP = REPO / 'experiments/figure-text-translation'
PREP = Path('/home/siggi/dev/scratch-c140/prep/figs'); T9 = Path(__file__).resolve().parent
env = dict(os.environ, FIGTEXT_PYLIBS=str(EXP / 'pylibs'), PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(T9.parent / 'tmp'))
names = sorted(p.name[:-len('.is.json')] for p in (REPO / 'books/efnafraedi-2e/figure-text').glob('*.is.json'))
HASH = re.compile(r'-[0-9a-f]{4}$')
def sources(ns):
    return json.loads(subprocess.run([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', *ns],
                                     capture_output=True, text=True, env=env, cwd=str(EXP)).stdout)
src = sources(names)
for n in [n for n in names if not src.get(n)]:
    src[n] = sources([HASH.sub('', n)]).get(HASH.sub('', n))
rows = []
for b in names:
    o = T9 / 'prep' / b
    shutil.rmtree(o, ignore_errors=True)
    r = subprocess.run([sys.executable, 'figure-prepare.py', src[b]['path'], '--basename', b, '--out', str(o)],
                       capture_output=True, text=True, env=env, cwd=str(EXP), timeout=900)
    assert r.returncode == 0, (b, r.stderr[-600:])
    new, old = (o / 'artwork.svg').read_bytes(), (PREP / b / 'artwork.svg').read_bytes()
    changed = sum(x != y for x, y in zip(new, old)) if len(new) == len(old) else None
    row = dict(basename=b, svg_identical=new == old, bytes_changed=changed, len_equal=len(new) == len(old),
               blocks_identical=(o / 'blocks.json').read_bytes() == (PREP / b / 'blocks.json').read_bytes(),
               svgfix=json.loads((o / 'svgfix.json').read_text()),
               refcost_warnings=[w for w in json.loads((o / 'prepare.json').read_text())['warnings'] if 'reference cost' in w])
    rows.append(row); print(json.dumps(row), flush=True)
    if b != 'CNX_Chem_03_01_exocytosis-88f6':
        shutil.rmtree(o, ignore_errors=True)            # keep exocytosis for Step 3
(T9 / 'artwork34.json').write_text(json.dumps(rows, indent=1))
print('svg identical', sum(r['svg_identical'] for r in rows), '| blocks identical', sum(r['blocks_identical'] for r in rows),
      '| changed', {r['basename']: r['bytes_changed'] for r in rows if not r['svg_identical']},
      '| refcost warnings', sum(bool(r['refcost_warnings']) for r in rows))
```
Run: `export SCRATCH=/home/siggi/dev/scratch-c140/build PYTHONDONTWRITEBYTECODE=1; cd "$SCRATCH/t9" && python3 -u artwork34.py 2>&1 | tail -1` (tool timeout 600000; the script is not resumable — if it times out, re-run it).
Expected: `svg identical 31 | blocks identical 34 | changed {'CNX_Chem_03_01_exocytosis-88f6': 155, 'CNX_Chem_04_02_HClsoln': 2, 'CNX_Chem_04_04_sandwich': 52} | refcost warnings 0`.

- [ ] **Step 3: exocytosis loads through `<img>` now, and did not before**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
B=CNX_Chem_03_01_exocytosis-88f6; O=$SCRATCH/t9/prep/$B; I=$EXP/evidence/2026-09-13-t23/instruments/exo/tools/render-exo.mjs
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u figure-compose.py --out "$O" --translations /home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text/$B.is.json | tail -1
pgrep -a chrome-headless; W=$(python3 -c "import json;print(round(json.load(open('$O/meta.json'))['page'][0]*2))"); H=$(python3 -c "import json;print(round(json.load(open('$O/meta.json'))['page'][1]*2))")
node "$I" "$O/translated.svg" "$SCRATCH/t9/exo-after.png" $W $H 60000
git -C /home/siggi/dev/repos/namsbokasafn-efni show HEAD:books/efnafraedi-2e/media/${B}_IS.svg > "$SCRATCH/t9/exo-before.svg"
node "$I" "$SCRATCH/t9/exo-before.svg" "$SCRATCH/t9/exo-before.png" $W $H 30000
pgrep -a chrome-headless || echo "no chromium survivors"
```
Expected: the first JSON line `"complete":true`, `"naturalW"` > 0, `"loadMs"` a few thousand at most (the spike measured ~2.1 s); the second (the committed E media) `"loadMs":null` with a `load:` timeout error — the control that the instrument can see the defect; `no chromium survivors`. Then `rm -rf "$SCRATCH/t9/prep"`.

- [ ] **Step 4: Two corpus carriers of the blend chain render pixel-identically after the collapse**

Create `$SCRATCH/t9/carriers.py`:

```python
#!/usr/bin/env python3
"""IcePack and HybrdOrbit: prepare with the repo (collapse on) and with svgfix disabled; render both through <img>; compare."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni'); EXP = REPO / 'experiments/figure-text-translation'
T9 = Path(__file__).resolve().parent; I = EXP / 'evidence/2026-09-13-t23/instruments/exo/tools/render-exo.mjs'
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
import svgfix
from PIL import Image, ImageChops
env = dict(os.environ, FIGTEXT_PYLIBS=str(EXP / 'pylibs'), PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(T9.parent / 'tmp'))
for b in ('CNX_Chem_05_02_IcePack', 'CNX_Chem_08_02_HybrdOrbit'):
    src = json.loads(subprocess.run([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', b], capture_output=True,
                                    text=True, env=env, cwd=str(EXP)).stdout).get(b)
    if not src:
        print(b, 'UNRESOLVED by sources.py - record it, do not guess a path'); continue
    o = T9 / 'carriers' / b; shutil.rmtree(o, ignore_errors=True)
    subprocess.run([sys.executable, 'figure-prepare.py', src['path'], '--basename', b, '--out', str(o)],
                   check=True, capture_output=True, env=env, cwd=str(EXP), timeout=900)
    after = (o / 'artwork.svg').read_bytes()
    meta = json.loads((o / 'meta.json').read_text()); W, H = (round(v * 2) for v in meta['page'])
    rep = json.loads((o / 'svgfix.json').read_text())
    # the BEFORE arm: re-run pdftocairo exactly as strip-text does, without the collapse
    subprocess.run(['pdftocairo', '-svg', str(o / 'artwork.pdf'), str(o / 'before.svg')], check=True, timeout=600)
    before = (o / 'before.svg').read_bytes()
    redo, _ = svgfix.collapse_blend_lerp(before)
    outs = {}
    for tag, path in (('before', o / 'before.svg'), ('after', o / 'artwork.svg')):
        r = subprocess.run(['node', str(I), str(path), str(o / f'{tag}.png'), str(W), str(H), '120000'],
                           capture_output=True, text=True, timeout=300)
        outs[tag] = json.loads(r.stdout.strip().splitlines()[-1])
    same = None
    if all(outs[t]['complete'] for t in outs):
        same = ImageChops.difference(Image.open(o / 'before.png').convert('RGB'),
                                     Image.open(o / 'after.png').convert('RGB')).getbbox() is None
    print(json.dumps(dict(basename=b, svgfix=rep, collapse_reproduces_prepare=redo == after,
                          cost_before=svgfix.reference_cost(before), cost_after=svgfix.reference_cost(after),
                          load_before=outs['before']['loadMs'], load_after=outs['after']['loadMs'],
                          pixels_identical=same)), flush=True)
    shutil.rmtree(o, ignore_errors=True)
```
Run: `export SCRATCH=/home/siggi/dev/scratch-c140/build PYTHONDONTWRITEBYTECODE=1; cd "$SCRATCH/t9" && python3 -u carriers.py 2>&1 | tee carriers.log; pgrep -a chrome-headless || echo "no chromium survivors"`.
Expected (the spike measured both, `reports/exo-spike.md` §corpus): IcePack `collapsed 129`, `unmatched 2` (an arithmetic add with no `feBlend`, left alone); HybrdOrbit `collapsed 74`, `unmatched 0`; for both `collapse_reproduces_prepare: true`, `cost_after` log2 below `cost_before`, `pixels_identical: true`, and, for IcePack, `load_after` below `load_before` (rehearsal: 4130 → 590 ms). HybrdOrbit's load pair is recorded, not a gate — the rehearsal measured 852 → 787 ms, inside single-shot noise (the spike had 8.6 s → 1.3 s). An `UNRESOLVED` carrier is recorded in VERIFICATION.md as not measured, not guessed.

- [ ] **Step 5: Write the frozen evidence note and commit**

Create `EXP/evidence/2026-09-14-t23-build/VERIFICATION.md`: a 🧊 FROZEN banner (cited, never synced; status lives in the campaign register and `REGISTER.md`); the BASE and HEAD shas; Step 1's controls, the `rank` line and the two byte-equality results; Step 2's totals line and the per-figure `svgfix` counts of the three changed figures; Step 3's two JSON lines; Step 4's two JSON lines (or the unresolved note); the Python and JS by-name results of Tasks 2–8 (file names and counts, from the `compare` outputs); the corpus script-threshold comparison and inverted-base census as already measured during planning (cite `reports/round1-3-build-figscripts.md` and `reports/round2-0-fix-modules.md` — do not re-derive); and the commands used. The scripts above are reproduced in full under an "Instruments" heading so the note does not depend on scratch.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-14-t23-build/VERIFICATION.md
git commit -m "docs(figures): §C140 ② ③ ⑨ verified on the 34 bought figures at 0 ISK

<paste Step 1's two result lines, Step 2's totals line and Step 3's after-load line>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```
(Replace the `<…>` with the measured lines before committing.)

---

### Task 10: The repair run — recompose the 34, 0 ISK, a separate data commit (spec commit (7))

**Files:**
- Data: `books/efnafraedi-2e/media/<basename>_IS.svg` ×34, `books/efnafraedi-2e/figure-text/<basename>.is.json` ×34 (written by `tools/figure-run.js` only)

**Interfaces:**
- Consumes: `COMPOSER_VERSION === '3'` (Task 8); the composer (Tasks 2–7).
- Produces: recomposed media used by Task 11.

- [ ] **Step 1: Pre-flight — editorial state on the remote, with a positive control**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git fetch origin
git grep -c '"state"' origin/main -- 'books/*/figure-text/*.json'; echo "state-grep exit=$?"
git grep -l '"composedVersion"' origin/main -- 'books/efnafraedi-2e/figure-text/*.json' | wc -l
```
Expected: no output and `state-grep exit=1`, then `34`. **A non-zero `state` count means prod has approved or edited a figure since the plan was written: STOP and report** — a recompose would send an approved figure back to `mt-preview`, and [USER] decides.

- [ ] **Step 2: Pre-flight — dry runs (free)**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run 2>&1 | tee "$SCRATCH/t10-dry-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --dry-run 2>&1 | tee "$SCRATCH/t10-dry-ch04.log" | tail -40
```
Expected in ch03: `15 figure(s) across …`; `--stale: 26 figure(s) in this chapter have no sidecar and were not selected`; tally `15 translated`, no `failed-*` / `unresolved` / `unreadable-text` / `copied-*` rows; `15 = enumerated`; `VERDICT ok`. ch04: **19** / **11** / `19 translated` / `19 = enumerated`. `15 + 19 = 34`. **Any other tally row: STOP and report.**

- [ ] **Step 3: Live run, in the foreground, one chapter at a time**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale 2>&1 | tee "$SCRATCH/t10-live-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale 2>&1 | tee "$SCRATCH/t10-live-ch04.log" | tail -40
```
(tool timeout 600000 each.) Expected per chapter: `MT spawned for 0 figure(s)` (or no MT line), all `translated` (15, then 19), `VERDICT ok`; ch03 carries the `localized` NOTE (5 figures) and ch04 the `overflow` NOTE naming flowchart and combmap keys exactly as `PREDICTIONS.md` lists them. **An `unformatted` or `containerErrors` NOTE on any figure: STOP** (both predictions are empty).
**Fallback only if a run is killed or times out:** re-run the same chapter; recomposed figures read `skipped-current`. If it dies again, batch with `--figure <b1>,<b2>,…` (≤ 8 names).

- [ ] **Step 4: Check exactly what changed**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git status --porcelain | awk '{print $2}' | sed -E 's#(books/efnafraedi-2e/(media|figure-text))/.*#\1/…#' | sort | uniq -c
node -e '
const {execSync}=require("child_process"),fs=require("fs");
const files=execSync("git diff --name-only -- books/efnafraedi-2e/figure-text").toString().trim().split("\n").filter(Boolean);
let bad=0;
for(const f of files){const a=JSON.parse(execSync(`git show HEAD:${f}`));const b=JSON.parse(fs.readFileSync(f,"utf8"));
 const keys=new Set([...Object.keys(a),...Object.keys(b)]);
 for(const k of keys){const same=JSON.stringify(a[k])===JSON.stringify(b[k]);
  if(k==="composedVersion"){if(!(a[k]==="2"&&b[k]==="3")){bad++;console.log("VERSION",f,a[k],b[k]);}}
  else if(!same){bad++;console.log("OTHER FIELD",f,k);}}}
console.log("sidecars changed:",files.length,"unexpected:",bad);'
```
Expected: `34 books/efnafraedi-2e/figure-text/…`, `34 books/efnafraedi-2e/media/…`, nothing else; `sidecars changed: 34 unexpected: 0`.

- [ ] **Step 5: Convergence control**

```bash
export TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run 2>&1 | grep -a "skipped-current\|translated\|VERDICT"
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --dry-run 2>&1 | grep -a "skipped-current\|translated\|VERDICT"
```
Expected: `15 skipped-current`, `19 skipped-current`, no `translated` row, `VERDICT ok`.

- [ ] **Step 6: Commit the data**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add books/efnafraedi-2e/media/*_IS.svg books/efnafraedi-2e/figure-text/*.is.json
git commit -m "feat(figures): recompose the 34 ch03/ch04 figures — formulas, re-flow, decimal commas, loadable exocytosis

figure-run --stale under COMPOSER_VERSION 3: 34 recomposed, 0 MT calls,
sidecars changed only in composedVersion 2 -> 3; a second --stale run reads
34 skipped-current. Not rendered or synced - publication is [USER]'s call.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

- [ ] **Step 7: The JS failing set returns to the baseline**

Re-run Task 7 Step 3's commands with `--outputFile="$SCRATCH/t10-js.json"` and the snippet's second argument `t10-js.json` (tool timeout 600000). Expected: `NEWLY RED: []`, `NEWLY GREEN: []` — Task 8's delta reversed. **Anything else: STOP and report.**

---

### Task 11: Acceptance — [USER] looks at the 34 figures

**Files:**
- Create (scratch only): `$SCRATCH/t11/t11_stacks.py`, `$SCRATCH/t11/site/index.html`, `$SCRATCH/t11/site/img/*.jpg`

**Interfaces:**
- Consumes: `BASE` media (E's composed SVGs at `BASE`), working-tree media (Task 10), `PREDICTIONS.md`, `$SCRATCH/t9/artwork34.json`, `EXP/evidence/2026-09-13-t23/reports/c3-containers.md` §4, `EXP/render-check.mjs`.
- Produces: a private artifact URL for [USER].

- [ ] **Step 1: Render the stacks**

Create `$SCRATCH/t11/t11_stacks.py`:

```python
#!/usr/bin/env python3
"""source raster / before (BASE media, composer 2) / after (working-tree media, composer 3), per figure, as one JPEG."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
EXP = REPO / 'experiments/figure-text-translation'
sys.path.insert(0, str(EXP / 'pylibs'))
from PIL import Image, ImageDraw

T11 = Path(__file__).resolve().parent
BASE = sys.argv[1]
SITE = T11 / 'site' / 'img'
SITE.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, FIGTEXT_PYLIBS=str(EXP / 'pylibs'), PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(T11.parent / 'tmp'))
names = sorted(p.name[:-len('.is.json')] for p in (REPO / 'books/efnafraedi-2e/figure-text').glob('*.is.json'))
HASH_SUFFIX = re.compile(r'-[0-9a-f]{4}$')


def sources(ns):
    return json.loads(subprocess.run([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', *ns],
                                     capture_output=True, text=True, env=env, cwd=str(EXP)).stdout)


src = sources(names)
for n in [n for n in names if not src.get(n)]:          # the driver's lookup-only de-hash
    src[n] = sources([HASH_SUFFIX.sub('', n)]).get(HASH_SUFFIX.sub('', n))
assert all(src.get(n) for n in names), [n for n in names if not src.get(n)]
done, failed = [], []
for b in names:
    if (SITE / f'{b}.jpg').exists():                     # resumable
        done.append(b); continue
    w = T11 / 'work' / b
    w.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(EXP / 'figure-prepare.py'), src[b]['path'], '--basename', b,
                    '--out', str(w / 'prep')], check=True, capture_output=True, env=env, cwd=str(EXP))
    staged = w / 'prep' / f'{b}.pdf'
    assert staged.exists(), f'prepare staged no {staged.name} for {b}'
    subprocess.run(['pdftocairo', '-png', '-r', '150', '-singlefile', str(staged), str(w / 'source')],
                   check=True, timeout=300)
    srcimg = Image.open(w / 'source.png').convert('RGB')
    W, H = srcimg.size
    (w / 'before.svg').write_bytes(subprocess.run(
        ['git', '-C', str(REPO), 'show', f'{BASE}:books/efnafraedi-2e/media/{b}_IS.svg'],
        capture_output=True, check=True).stdout)
    (w / 'after.svg').write_bytes((REPO / f'books/efnafraedi-2e/media/{b}_IS.svg').read_bytes())
    panels = [('SOURCE — the OpenStax PDF', srcimg)]
    for tag, label in (('before', 'BEFORE — E (composer 2)'), ('after', 'AFTER — composer 3')):
        (w / f'{tag}.png').unlink(missing_ok=True)
        try:
            r = subprocess.run(['node', str(EXP / 'render-check.mjs'), str(w / f'{tag}.svg'),
                                str(w / f'{tag}.png'), str(W), str(H)],
                               capture_output=True, text=True, timeout=180)
            err = r.stderr[-300:] if r.returncode != 0 else ''
        except subprocess.TimeoutExpired:
            err = 'timed out after 180 s'
        if err or not (w / f'{tag}.png').exists():
            print('RENDER FAILED', b, tag, err, flush=True)
            failed.append((b, tag))
            panels.append((label + ' — NOT RENDERABLE IN HEADLESS CHROMIUM', Image.new('RGB', (W, 40), 'white')))
        else:
            panels.append((label, Image.open(w / f'{tag}.png').convert('RGB')))
    band = 28
    out = Image.new('RGB', (W, sum(p.size[1] + band for _, p in panels)), 'white')
    y = 0
    d = ImageDraw.Draw(out)
    for label, p in panels:
        d.rectangle([0, y, W, y + band], fill=(40, 40, 40))
        d.text((8, y + 8), label, fill='white')
        out.paste(p, (0, y + band))
        y += p.size[1] + band
    if out.size[0] > 1400:
        out = out.resize((1400, round(out.size[1] * 1400 / out.size[0])))
    out.save(SITE / f'{b}.jpg', quality=85)
    shutil.rmtree(w, ignore_errors=True)
    done.append(b)
    print('ok', b, flush=True)
print('rendered', len(done), 'of', len(names), 'render failures', failed)
```

Run: `export SCRATCH=/home/siggi/dev/scratch-c140/build; mkdir -p "$SCRATCH/t11" && cd "$SCRATCH/t11" && python3 -u t11_stacks.py <BASE sha> 2>&1 | tee -a t11.log | tail -5` (tool timeout 600000; it resumes from the JPEGs already written, so re-run until `rendered 34 of 34`). Before and after: `pgrep -a chrome-headless` and kill survivors.
Expected: `rendered 34 of 34`; render failures at most `('CNX_Chem_03_01_exocytosis-88f6', 'before')`. **An `after` failure for exocytosis is a Task 2 regression: STOP and report.**

- [ ] **Step 2: Build the page — load the design skill first**

Invoke the `artifact-design` skill before writing the page. Then write `$SCRATCH/t11/site/index.html`: title **"Figure labels — composer 3"**; a short intro (what changed: formulas in translated labels, re-flow against boxes / cells / open space with a 7.5 pt floor and named overhangs, decimal commas in English-kept labels, exocytosis loadable; what did not: MT wording ⑪, arrowhead colour ④, brain's outline ⑩; that this page is the merge gate); one card per figure in chapter order with the stack image, the basename, and three kinds of note:
1. **"should now show"** — every [USER] review row mapped to this figure in `c3-containers.md` §4 with what the rule does to that block (class, step, size, lines from `PREDICTIONS.md`); the ② formulas on this figure; the ⑨ decimals on this figure; for the 11 R9 blocks, the new line break (`Mól af | Cu atómum (mól)`, `Massi | Ar atóma (g)`, …); exocytosis: "visible at all";
2. **"named, not fixed"** — every `overflow` key on this figure with its word and need/budget, and the floor consequences from `PREDICTIONS.md` (empform b8 fits by 0.11 pt; flowchart `Mólstyrkur` ×2 and combmap `Prósentusamsetning` overhang);
3. **"out of scope"** — ⑪ wording rows from `USER-REVIEW.md` on this figure (one line), ④ on combustion, ⑩ on brain.
Keep images in `img/` as separate files (a multi-file artifact), `loading="lazy"`, `max-width:100%`.

- [ ] **Step 3: Publish privately and hand it over**

Publish with the `Artifact` tool: `file_path: $SCRATCH/t11/site/index.html`, `files: {"img/<b>.jpg": "$SCRATCH/t11/site/img/<b>.jpg", …}` for all rendered figures, `favicon: "🧪"`, `description: "Source / E / composer-3 stacks of the 34 ch03/ch04 figures — the merge gate for §C140 ② ③ ⑨."`.
Send [USER] the link with one paragraph: look at the "should now show" notes first, then the named overhangs; exocytosis should now be visible; and the question **"Do these pass — may the PR be merged?"**

- [ ] **Step 4: STOP until [USER] answers**

Do not start Task 12's push/PR until [USER] has looked and said yes. A problem [USER] finds goes back through systematic debugging on this branch — never merged around.

---

### Task 12: Documentation, push, PR

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (new ⏩ RESUME block; §C140 rows ② ③ ⑨ ⑫)
- Modify: `EXP/REGISTER.md` (new ⏩ RESUME block; component rows `compose.py`, `strip-text.py`, new rows `svgfix.py`, `figscripts.py`, `numloc.py`, `figcontainers.py`, `figlayout.py`)
- Modify: `EXP/README.md` (the five helpers in the file list)
- Modify: project memory `figure-compose-damages-formulas.md` + its `MEMORY.md` pointer line

**Interfaces:**
- Consumes: Task 9's VERIFICATION.md, Task 11's artifact URL and [USER]'s answer.
- Produces: the PR.

- [ ] **Step 1: Campaign register**

`git fetch origin` and check whether the docs session changed this file on `main` (`git log origin/main -- docs/plans/2026-07-21-post-item17-followup-campaign.md`). Add `## ⏩ RESUME — state as of **<date>** (supersedes every block below)` above the current top block and mark that block `(superseded by the block above)`. Content: ② ③ ⑨ and the exocytosis load fix are built and verified (cite `experiments/figure-text-translation/evidence/2026-09-14-t23-build/VERIFICATION.md` and `PREDICTIONS.md` — no numbers restated), the 34 are recomposed on the branch, [USER] accepted the pictures on <date> (artifact link); **SINGLE NEXT ACTION: merge → `./scripts/deploy.sh` (the `.cjs` bump is a server change; verify the figures route) → [USER]'s publication decision for ch03/ch04**, which still waits on ⑩ for brain and ⑭ (Firefox/WebKit never measured); buying stays stopped. In §C140's table set ②, ③, ⑨ and ⑫ status cells to `✅ built + verified on feat/c140-t23-scripts-reflow-decimals; [USER] accepted <date>`. Add one logged line (not fixed): the height budget and centring ignore a subscript's drop (spec Amendments' known limit).

- [ ] **Step 2: Figure-text REGISTER.md and README**

`REGISTER.md`: a dated ⏩ RESUME block pointing at the spec, PREDICTIONS.md, VERIFICATION.md and the campaign register §C140 (no status restated beyond "built on the branch"); component rows as listed under Files, each one line naming what the unit owns (no counts). `README.md`: add the five helpers to the file list with one line each.

- [ ] **Step 3: Memory (pointers only, no file:line, no status)**

In `figure-compose-damages-formulas.md` append: `▶ §C140 ② ③ ⑨ (translated-label formulas, container re-flow, decimal commas) and the exocytosis blend-chain fix were built 2026-09 — design docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md; what is next lives in the campaign register.` Run `grep -nE '[a-z0-9_-]+\.(js|sh|md|json|yml):[0-9]+' <memory>/MEMORY.md` → no output.

- [ ] **Step 4: Commit docs**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add docs/plans/2026-07-21-post-item17-followup-campaign.md experiments/figure-text-translation/{REGISTER.md,README.md}
git commit -m "docs(figures): §C140 ② ③ ⑨ built, verified and accepted — next is merge, deploy, publication call

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

- [ ] **Step 5: Push and open the PR**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build; cd /home/siggi/dev/repos/namsbokasafn-efni
git push -u origin feat/c140-t23-scripts-reflow-decimals
gh pr create --title "§C140 ② ③ ⑨: formulas and re-flow in translated figure labels, decimal commas, loadable exocytosis; recompose the 34" --body-file "$SCRATCH/pr-body.md"
```
`pr-body.md`: summary (what each of ② ③ ⑨ and the collapse does; what is out of scope), links to spec / plan / PREDICTIONS.md / VERIFICATION.md / acceptance artifact, the Python result (every `test_*.py` by name) and the JS result (failing set identical to the baseline by name — `main` is not green, and this PR does not change that), the **deploy note** (`figure-text-sidecar.cjs` is required by `figureReviewService.js`: merge → `deploy.sh` → verify the figures route; ⚠️ pushing to `main` strands prod's content backup until the next deploy), and "not rendered or synced — publication is a separate [USER] decision". End with:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X
```

- [ ] **Step 6: Hand over**

Report the PR URL. **Merge only on [USER]'s instruction** (a merge commit, not a squash — the register cites individual SHAs). `./scripts/deploy.sh` runs on prod and needs a human for `sudo`.

---

## Addendum — 2026-09-15: [USER]'s review fixes (Tasks 13–19, run BEFORE Task 12)

**Why.** At Task 11 [USER] looked at the 34 and did not accept. They reported a missing space in `afBr₂` and `viðH₂O`, the etheneBr double bond sitting left of centre, text that looks bolder than the source, and `Fjöldi / agna / af / A`. Each was root-caused, and [USER] ruled R12–R15 — read the spec's **"Amendments — 2026-09-15"** before any task below. Task 11's Step 4 gate therefore moves to Task 19, and **Task 12 runs only after [USER] says yes at Task 19**. Task 12 then also cites this addendum's evidence folder, logs the spec amendment's known limits, and logs [USER]'s "correcting translations and splitting long words" as future work.

**Reference build — read before Task 13.** The fixes were built in scratch before this addendum was written, over three rounds:
- Round 1: four builders, an integrator and an adversarial reviewer — ready-with-minors, 0 defects.
- Round 2: a fixer and a scoped re-reviewer — ready-with-minors, 0 defects.
- An assembler and a verifier, who captured every install step below on a fresh copy of the tree — ready-with-minors, 0 defects.

Everything is committed under `EV2` = `EXP/evidence/2026-09-15-t23-review-fixes/`:
- `reference/` holds 16 per-file patches and 3 new files, with `MANIFEST.sha256`.
- `PREDICTIONS.json` / `PREDICTIONS.md` hold per-figure values.
- `instruments/` holds `regen34.py`, `figparts.py`, `predict.py`, `census/`, `bond/` and `rehearse.py`.
- `reports/install-rehearsal.md` holds the verbatim output of every step below.

As before, **tasks install by `git apply` / `cp`, never by retyping. A patch that does not apply or an expected result that does not reproduce: STOP and report — never edit the reference.**

### Addendum Global Constraints

- **`BASE2`** = the commit that adds this addendum. Every Global Constraint above still binds.
- **Shell variables**, exported in every command that uses them:
  - `REPO`, `EXP`, `SCRATCH` as above;
  - `EV2=$EXP/evidence/2026-09-15-t23-review-fixes`;
  - `REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference` — written out in full, because `export EV2=… REF2=$EV2/…` expands `$EV2` before assigning it, so `REF2` silently becomes `/reference`.
- **Install order is W → S → C → L** (Tasks 13–16). The patch numbers are not the order.
- **Do not delete `/home/siggi/dev/scratch-c140/`** before Task 19 is complete. The instruments read, by absolute path:
  - `prep/sources.json`;
  - `fix2/final/work`, the census item pairing for the final build;
  - `plan/pred2/work/REPO`, the census item pairing for the pre-fix media.
- **`books/` is written only in Task 18**, and only by `node tools/figure-run.js … --stale --force`.
  - `COMPOSER_VERSION` stays `'3'` (spec amendment: one bump per PR, and `'3'` never left this branch).
  - `--force` is read only where it suppresses the skipped-current check; it cannot make a figure spendable.
  - Never run `figure-run.js` without `--stale`. **No MT, no spend.**
- **Test command:** `cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u <test_file>`. Below it is written `T <test_file>`, and `| tail -1` means the last line.
- **Mutation-probe restore rule** as above: golden copy, restore from it, `cmp`. The anchors below each occur exactly once; assert `count == 1` before replacing.
- **Timeouts:** long commands run in the foreground with the tool timeout at 600000. A Python batch uses `-u` and is judged by its terminal line (`DONE …`, `CENSUS-DONE`, `BOND-DONE`), never by an exit code.

---

### Task 13: Baseline at `BASE2`, then R15 — the artwork shift (`-noshrink -nocenter` + the prepare guard)

**Files:**
- Modify (patches `REF2/04, 01, 02, 03`): `EXP/test_figure_prepare.py`, `EXP/strip-text.py`, `EXP/svgfix.py`, `EXP/figure-prepare.py`

**Interfaces:**
- Produces:
  - `svgfix.PDFTOCAIRO_SVG_FLAGS = ('-noshrink', '-nocenter')` and `svgfix.pdftocairo_svg_argv(pdf, svg)`, used by `strip-text.py`;
  - `figure-prepare.artwork_transform_refusal(pdf_path, flags=None) -> str | None`;
  - `figure-prepare.TRANSFORM_TOL_PT`;
  - `prepare()` exits 1 with the refusal in `prepare.json` when the guard refuses.

What the code does (spec amendment R15): `strip-text.py` builds its `pdftocairo -svg` argument list from `svgfix`, with both flags. The guard runs the same argument list on a probe copy of `artwork.pdf`, with the page dictionary untouched and one planted stroke through known points. It refuses when cairo draws a point more than `TRANSFORM_TOL_PT` away from `(x, MediaBox[3] − y)`, the convention `svgout` uses for `<text>`.

- [ ] **Step 1: The reference build is intact; the tree is clean**

```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
export EV2=$EXP/evidence/2026-09-15-t23-review-fixes REF2=$EXP/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
mkdir -p "$SCRATCH/tmp" && cd "$REF2" && sha256sum -c MANIFEST.sha256 | grep -av ': OK$'; echo "manifest-check exit=${PIPESTATUS[0]}"
cd "$REPO" && git status --porcelain && git log --oneline -1
```
Expected:
- no non-OK line, then `manifest-check exit=0`;
- an empty status;
- HEAD is `BASE2`.

- [ ] **Step 2: Python baseline by name at `BASE2`**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t13/base" 2>&1 | tail -20
```
Expected: 18 lines, every one `rc=0 fails=0` with last line `'ALL PASS'` (`test_readlayer.py`'s is `'  ALL PASS'`). **A non-zero rc here must be understood before Step 3.** Every later `compare` in Tasks 13–16 uses `$SCRATCH/t13/base`.

- [ ] **Step 3: The test first — RED on the unchanged code**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/04-test_figure_prepare.patch"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_prepare.py | tail -1
```
Expected: `3 FAILED: 7c prepare's artwork.svg of a FRACTIONAL page draws every point exactly where the <text> convention (x, page_h - y) puts it, 7 PRECONDITION figure-prepare.py exposes artwork_transform_refusal, 7g PRECONDITION svgfix exposes PDFTOCAIRO_SVG_FLAGS for the guard to read`.
- The `7c` detail reads `max displacement 1.394… pt`.
- Controls `7a`/`7b` pass: the bare `pdftocairo -svg` on a 468 × 69.5 pt page is displaced 1.394 pt, and on 468 × 70 pt it is not.

- [ ] **Step 4: The implementation — GREEN**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/01-strip-text.patch" "$REF2/02-svgfix.patch" "$REF2/03-figure-prepare.patch"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_prepare.py | tail -1
```
Expected: `ALL PASS`.

- [ ] **Step 5: Named mutation — prepare stops calling the guard**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && mkdir -p "$SCRATCH/golden" && cp figure-prepare.py "$SCRATCH/golden/figure-prepare.py"
python3 - <<'EOF'
p = 'figure-prepare.py'; s = open(p).read(); old = "    refusal = artwork_transform_refusal(out_dir / 'artwork.pdf')"
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "    refusal = None"))
EOF
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figure_prepare.py | tail -1
cp "$SCRATCH/golden/figure-prepare.py" figure-prepare.py && cmp figure-prepare.py "$SCRATCH/golden/figure-prepare.py" && echo restored
```
Expected: `1 FAILED: 7g prepare EXITS 1 when the guard refuses, with the refusal in prepare.json`, then `restored`.

- [ ] **Step 6: Whole Python suite by name**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t13/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t13/base" "$SCRATCH/t13/py"
```
Expected: `compare done` and nothing before it.

- [ ] **Step 7: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{strip-text.py,svgfix.py,figure-prepare.py,test_figure_prepare.py}
git commit -m "fix(figures): draw the artwork where the text is — pdftocairo -svg -noshrink -nocenter + a prepare guard (R15)

Without the two flags pdftocairo scales a page with a fractional dimension by
min(w/ceil w, h/ceil h) and centres it, while compose places text at true
coordinates: 24 of the 34 bought figures were shifted, worst 2.66 pt (etheneBr's
double bond sat 1.3 pt left). Every PNG-based check was blind to it. cairo writes
no page transform to read back, so prepare probes the same argv on a copy of the
page and refuses a displaced point; 0 of 817 in-scope sources refuse.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 14: R12 — `text-rendering="geometricPrecision"` on the text group

**Files:**
- Create (patch `REF2/13`): `EXP/test_svgout.py`
- Modify (patches `REF2/12, 16`): `EXP/svgout.py`, `EXP/figscripts.py` (docstring only)

**Interfaces:**
- Produces: `svgout.write_svg` opens the text group as `<g text-rendering="geometricPrecision">`; each `<text>` element stays byte-identical, so the raw-string goldens of `test_compose_runexact.py` and `test_compose_t23.py` stay valid.

What the code does (spec amendment R12): one inherited presentation attribute on the `<g>` that holds every `<text>`, layout and run-exact alike. In an `<img>` render it is pixel-identical to the attribute on each `<text>`. Chromium then draws with the same linear advances `compose.py` measured, so the space before a styled segment is no longer lost or doubled.

- [ ] **Step 1: The test first — RED**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/13-test_svgout.patch" && cmp "$EXP/test_svgout.py" "$REF2/test_svgout.py" && echo test-installed
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_svgout.py | tail -1
```
Expected: `test-installed`, then `1 FAILED: S1 every one of the 8 <text> elements resolves to text-rendering=geometricPrecision (layout segments, the subscript, run-exact bold/italic, the rotated glyph)`.

- [ ] **Step 2: The implementation — GREEN, and the raw goldens still hold**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/12-svgout.patch" "$REF2/16-figscripts.patch"
cd "$EXP" && for t in test_svgout.py test_compose_runexact.py test_compose_t23.py; do printf '%s: ' $t; FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u $t | tail -1; done
```
Expected: `ALL PASS` three times.

- [ ] **Step 3: Named mutation — the group loses the attribute**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp svgout.py "$SCRATCH/golden/svgout.py"
python3 - <<'EOF'
p = 'svgout.py'; s = open(p).read(); old = "'<g text-rendering=\"geometricPrecision\">'"
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "'<g>'"))
EOF
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_svgout.py | tail -1
cp "$SCRATCH/golden/svgout.py" svgout.py && cmp svgout.py "$SCRATCH/golden/svgout.py" && echo restored
```
Expected: the same `1 FAILED: S1 …` line, then `restored`.

- [ ] **Step 4: Suite by name, then commit**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t14/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t13/base" "$SCRATCH/t14/py"
```
Expected: `NEW FILE test_svgout.py: rc=0 fails=[] …` and nothing else before `compare done`.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{svgout.py,test_svgout.py,figscripts.py}
git commit -m "fix(figures): render figure text with geometricPrecision so spaces survive at every zoom (R12)

compose places each segment of a split line at an absolute x from cairo's linear
advances; Chromium's default rendering rounds advances per glyph at the display
scale, so the drift of a whole plain prefix landed in the space before a styled
segment (afBr2, viðH2O) or collided subscripts. One attribute on the text group:
the browser census over the 34 at 7 scales goes from 16 lost spaces, 94
collisions and 36 browser-only overhangs to 0, 0, 0.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 15: R14 — text colour the way poppler draws it

**Files:**
- Create (patches `REF2/05, 08`): `EXP/figcolour.py`, `EXP/test_figcolour.py`
- Modify (patches `REF2/09, 10, 11, 06, 07`): `EXP/test_readlayer.py`, `EXP/test_compose_runexact.py`, `EXP/test_compose_t23.py`, `EXP/compose.py`, `EXP/readlayer.py`

**Interfaces:**
- Produces:
  - `figcolour.fill_rgb(fill) -> (r, g, b)` in 0..1: `('cmyk', c, m, y, k)` goes through `poppler_cmyk_rgb`; `('rgb', r, g, b)` and `('gray', g)` pass through exactly; `None` draws black; an unknown tag raises `ValueError`.
  - `compose.cmyk` draws through `figcolour.fill_rgb`.
  - `readlayer._fill` keeps the `rgb` / `gray` tags instead of folding them into `cmyk`.

What the code does (spec amendment R14): DeviceCMYK text now gets the same RGB that pdftocairo gives the artwork (K=1 → `#231f20`), where before it was the naive `(1−c)(1−k)` that drew `#000000`. DeviceRGB and DeviceGray text keep their own colour. That is why `readlayer` must stop folding: under the new table a folded Gray 0 would draw `#231f20`. A `runs.json` written before this change must be re-prepared; `figure-run.js` re-prepares on every run.

- [ ] **Step 1: Module and tests first, composer not wired — RED in four files**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/05-figcolour.patch" "$REF2/08-test_figcolour.patch" "$REF2/09-test_readlayer.patch" "$REF2/10-test_compose_runexact.patch" "$REF2/11-test_compose_t23.patch"
cmp "$EXP/figcolour.py" "$REF2/figcolour.py" && cmp "$EXP/test_figcolour.py" "$REF2/test_figcolour.py" && echo installed
cd "$EXP" && for t in test_figcolour.py test_readlayer.py test_compose_runexact.py test_compose_t23.py; do printf '%s: ' $t; FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u $t | tail -1; done
```
Expected: `installed`, then four RED lines:
- `test_figcolour.py: 8 FAILED: 1e K=1 (DeviceCMYK (0, 0, 0, 1)) draws pdftocairo's bytes, 1e rich black (corpus) …, 1e CMYK blue …, 1e CMYK red …, 1a K=1 draws (35,31,32) = #231f20 …, 1b the corpus rich black draws (33,28,29) …, 2a translated 'Observation and curiosity' …, 2d kept 'H2O (g)' …` — the composer draws (0, 0, 0) where pdftocairo gives (35, 31, 32);
- `test_readlayer.py:   2 FAILED: 7a PIN — compose.cmyk draws through figcolour.fill_rgb, the one conversion, 7b2 a DeviceGray/RGB glyph in this population keeps its OWN space - not folded into cmyk` (7b2 reads `{'cmyk': 804}`);
- `test_compose_runexact.py: 1 FAILED: C1 CONTROL the translated ARC is byte-identical to the unchanged composer but for ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill` (expected `#415e9f`, drawn `#3366cc`);
- `test_compose_t23.py: 1 FAILED: G1 CONTROL the kept population is byte-identical to the unchanged composer - except the planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill` (expected `#231f20`, drawn `#000000`).

Verbatim: `EV2/reports/install-rehearsal.md` § T-C.

- [ ] **Step 2: Wire the composer and readlayer — GREEN**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/06-compose.patch" "$REF2/07-readlayer.patch"
cd "$EXP" && for t in test_figcolour.py test_readlayer.py test_compose_runexact.py test_compose_t23.py; do printf '%s: ' $t; FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u $t | tail -1; done
```
Expected: `ALL PASS` four times (`test_readlayer.py`'s line is `  ALL PASS`).

- [ ] **Step 3: Named mutation on the pure module — AFTER wiring (before wiring it cannot be told from the unwired RED)**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp figcolour.py "$SCRATCH/golden/figcolour.py"
python3 - <<'EOF'
p = 'figcolour.py'; s = open(p).read(); old = "        return poppler_cmyk_rgb(c, m, y, k)"
assert s.count(old) == 1; open(p, 'w').write(s.replace(old, "        return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))"))
EOF
for t in test_figcolour.py test_compose_runexact.py test_compose_t23.py; do printf '%s: ' $t; FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u $t | tail -1; done
cp "$SCRATCH/golden/figcolour.py" figcolour.py && cmp figcolour.py "$SCRATCH/golden/figcolour.py" && echo restored
```
Expected:
- `test_figcolour.py: 8 FAILED:` with the same eight names as Step 1;
- `test_compose_runexact.py: 1 FAILED: C1 CONTROL …`;
- `test_compose_t23.py: 1 FAILED: G1 CONTROL …`;
- then `restored`.

- [ ] **Step 4: Trap mutation — the old folding `readlayer.py` under the wired composer**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp readlayer.py "$SCRATCH/golden/readlayer.py"
git -C /home/siggi/dev/repos/namsbokasafn-efni show HEAD:experiments/figure-text-translation/readlayer.py > readlayer.py
FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figcolour.py | tail -1
cp "$SCRATCH/golden/readlayer.py" readlayer.py && cmp readlayer.py "$SCRATCH/golden/readlayer.py" && echo restored
```
(`HEAD` is Task 14's commit, whose `readlayer.py` is the folding one.)

Expected: `8 FAILED: 1e Gray 0 (DeviceGray (0,)) draws pdftocairo's bytes, 1e Gray 0.5 …, 1e RGB blue …, 1e RGB black …, 1c DeviceGray 0 stays PURE black (0,0,0), exactly, 1d a DeviceRGB value is drawn unchanged, exactly (no table, no fixed-point), 2b translated 'Form a hypothesis' …, 2c kept 'Test the hypothesis' …`, then `restored`.

- [ ] **Step 5: Suite by name, then commit**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t15/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t13/base" "$SCRATCH/t15/py"
```
Expected: `NEW FILE test_figcolour.py: rc=0 fails=[] …` and `NEW FILE test_svgout.py: rc=0 fails=[] …`, and nothing else before `compare done`.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{figcolour.py,test_figcolour.py,compose.py,readlayer.py,test_readlayer.py,test_compose_runexact.py,test_compose_t23.py}
git commit -m "fix(figures): draw DeviceCMYK text in poppler's colour, keep RGB/Gray exact (R14)

compose.cmyk was the naive (1-c)(1-k), so K=1 text drew #000000 beside artwork
pdftocairo draws #231f20 - translated labels read bolder than the source with
identical font and geometry. figcolour.fill_rgb is the one conversion (checked
against pdftocairo on 1,504 CMYK values, 0 8-bit mismatches); readlayer keeps
its rgb/gray tags, because a folded DeviceGray 0 would now draw #231f20.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 16: R13 — rules A and E for box and cell labels

**Files:**
- Modify (patches `REF2/15, 14`): `EXP/test_figlayout.py`, `EXP/figlayout.py`

**Interfaces:**
- Produces: `figlayout.decide(words, width, container, cues, floor=7.5, pad=2.0, *, _r9=True, _height=True, _ae=True)`. `_ae=False` switches both rules off for the prototype-equivalence harness.

What the code does (spec amendment R13), for box and cell labels only:
- **(E)** Inside the size search, a count `n` is rejected when `minmax(s, n−1) <= minmax(s, n) + EPS` (`useless(n, s)`), and the next count is tried from full size down. A rejected count therefore never decides the size. In the height floor-overflow branch the same check runs, and `fewer()` re-checks at the drawn size. The width floor-overflow branch steps down with `fewer()`.
- **(A)** When a 1–2 character symbol ends the label (`lone_tail`), the selection first runs constrained to partitions that keep it with the previous word (`select(True)`). It falls back to the unconstrained selection only when that one does not fit.

Open labels are untouched.

- [ ] **Step 1: The tests first — RED**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/15-test_figlayout.patch"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figlayout.py | tail -1
```
Expected: `10 FAILED:`, naming:
- `[L] flowchart b10: 'Fjöldi agna af A' -> Fjöldi / agna / af A at 9.0, fit, no overflow`
- `[L] flowchart b7: 'Massi A' -> one line at 9.0`
- `[L] flowchart b15: 'Rúmmál lausnar A' -> Rúmmál / lausnar A at 9.0`
- `[L] flowchart b9: 'Rúmmál hreins efnis A' -> Rúmmál / hreins / efnis A at 9.0`
- `[L] E alone (no symbol): 'Fjöldi agna af xy' -> Fjöldi / agna / af xy`
- `[L] A: a binding count that fits only when shrunk (1 line at 8.0) beats a lone symbol at full size`
- `[L] E in the width floor-overflow path: aaaaaaaaaaaaaaa / bb cc, the long word still named`
- `[L] E in the height floor-overflow path: aaaaaaaa / b c at 7.5, height overhang named 18.048 > 6`
- `[L] E does not keep the size of the count it rejects: 'Massi af cu' -> Massi / af cu at 9.0, fit`
- `[L] CONTROL E's surviving count takes the largest size where it fits: Massi / af cu at 8.0`

- [ ] **Step 2: The implementation — GREEN**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation REF2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference SCRATCH=/home/siggi/dev/scratch-c140/build
cd /home/siggi/dev/repos/namsbokasafn-efni && git apply "$REF2/14-figlayout.patch"
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figlayout.py | tail -1
```
Expected: `ALL PASS`.

- [ ] **Step 3: Three named mutations — both rules off, E alone off, A alone off**

```bash
export EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation SCRATCH=/home/siggi/dev/scratch-c140/build
cd "$EXP" && cp figlayout.py "$SCRATCH/golden/figlayout.py"
for pair in "_height=True, _ae=True):|_height=True, _ae=False):" \
            "                return bool(_ae) and n > 1 and P.minmax(s, n - 1, tail=tl) <= P.minmax(s, n, tail=tl) + EPS|                return False" \
            "    lone = bool(_ae) and cls in ('box', 'cell') and P.lone_tail()|    lone = False"; do
  OLD="${pair%%|*}" NEW="${pair#*|}" python3 - <<'EOF'
import os
p = 'figlayout.py'; s = open(p).read(); old, new = os.environ['OLD'], os.environ['NEW']
assert s.count(old) == 1, old; open(p, 'w').write(s.replace(old, new))
EOF
  echo "== ${pair#*|}"; FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u test_figlayout.py | grep -a '^  FAIL' | cut -c1-110
  cp "$SCRATCH/golden/figlayout.py" figlayout.py && cmp figlayout.py "$SCRATCH/golden/figlayout.py" && echo restored
done
```
Expected, in order:
1. **`_ae=False`** fails the same 10 cases as Step 1, then `restored`.
2. **`return False`** (E off, A on) fails exactly the 6 E cases, then `restored`:
   - `E alone`
   - `E in the width floor-overflow path`
   - `E in the height floor-overflow path`
   - `E does not keep the size of the count it rejects`
   - `case pair: 'Massi af cu' and 'Massi af Cu' get the same size, line count and step`
   - `CONTROL E's surviving count takes the largest size where it fits`
3. **`lone = False`** (A off, E on) fails exactly the 4 A cases, then `restored`:
   - `flowchart b7`
   - `flowchart b15`
   - `flowchart b9`
   - `A: a binding count that fits only when shrunk`
   
   b10 still passes, because E alone joins `af A`.

(The `case pair` check passes on HEAD code, where neither rule touches either label; it fails only when A is on and E is off, so it appears in the E-off set but not in Step 1's RED set.)

- [ ] **Step 4: Suite by name; every touched file matches the verified build; commit**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u "$SCRATCH/suite.py" run "$SCRATCH/t16/py" > /dev/null 2>&1; python3 "$SCRATCH/suite.py" compare "$SCRATCH/t13/base" "$SCRATCH/t16/py"
python3 - <<'EOF'
import hashlib, json, os
EXP = os.environ['EXP']; meta = json.load(open(os.environ['EV2'] + '/PREDICTIONS.json'))['meta']['tree_files_sha256']
bad = [f for f, h in meta.items() if hashlib.sha256(open(f'{EXP}/{f}', 'rb').read()).hexdigest() != h]
print('composer files matching the verified build:', len(meta) - len(bad), 'of', len(meta), 'differ:', bad)
EOF
```
Expected:
- `NEW FILE test_figcolour.py …` and `NEW FILE test_svgout.py …`, and nothing else before `compare done`;
- `composer files matching the verified build: 9 of 9 differ: []`.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/{figlayout.py,test_figlayout.py}
git commit -m "fix(figures): no lone symbol, no useless line in box and cell labels (R13)

Chasing the source line count drew 'Fjöldi / agna / af / A'. In a box or cell
a count whose one-fewer partition is no wider is rejected inside the size search
(so it never decides the size), and a 1-2 character symbol that ends the label
stays with the word before it whenever some partition fits. On the 34 exactly 8
flowchart boxes change, all at 9 pt; open labels are untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 17: The 34 in scratch with the repository composer — against `PREDICTIONS.json`, 0 ISK

**Files:**
- Create (scratch only): `$SCRATCH/t17/`

**Interfaces:**
- Consumes: `EV2/PREDICTIONS.json`, `EV2/instruments/{regen34.py,predict.py,census/,bond/}`.
- Produces: `$SCRATCH/t17/{regen,census,census-control,bond}`, used by Task 18's VERIFICATION.md.

- [ ] **Step 1: Prepare and compose the 34 with the repository tree, in two halves**

```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
cd "$REPO" && CH03=$(ls books/efnafraedi-2e/figure-text | grep -a '^CNX_Chem_03_' | sed 's/\.is\.json$//')
python3 -u "$EV2/instruments/regen34.py" --out "$SCRATCH/t17/regen" --only $CH03 2>&1 | tail -3
```
```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
cd "$REPO" && REST=$(ls books/efnafraedi-2e/figure-text | grep -av '^CNX_Chem_03_' | sed 's/\.is\.json$//')
python3 -u "$EV2/instruments/regen34.py" --out "$SCRATCH/t17/regen" --only $REST 2>&1 | tail -3
```
Expected: `DONE 15 figures prep_fail=0 compose_fail=0`, then `DONE 19 figures prep_fail=0 compose_fail=0`. A half that prints no `DONE` line was killed: re-run it, since it rewrites only the figures it names.

- [ ] **Step 2: By value, every key, 34/34**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
python3 "$EV2/instruments/predict.py" check "$EV2/PREDICTIONS.json" --dir "$SCRATCH/t17/regen" | tail -9
```
Expected: eight lines `<key> 34/34 MATCH` (artwork_svg, blocks, runs, compose_report, media_artwork, media_textgroup, text_count, style_font_faces), then `34/34 MATCH`. **A MISMATCH: STOP and name the figures and keys.** `compose_report_sha256` embeds the sidecar's absolute path, so run from this repository path.

- [ ] **Step 3: Browser census and the bond — the result, and the control that the instrument sees the defect**

```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
pgrep -a chrome-headless
python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t17/census" "$SCRATCH"/t17/regen/work/*/translated.svg 2>&1 | tail -10
MEDIA34=$(ls "$REPO/books/efnafraedi-2e/figure-text" | sed "s#\.is\.json\$#_IS.svg#; s#^#$REPO/books/efnafraedi-2e/media/#"); echo $MEDIA34 | wc -w
python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t17/census-control" --items-root /home/siggi/dev/scratch-c140/plan/pred2/work/REPO $MEDIA34 2>&1 | tail -10
python3 -u "$EV2/instruments/bond/bond.py" --out "$SCRATCH/t17/bond" "$REPO/books/efnafraedi-2e/media/CNX_Chem_04_03_etheneBr_img_IS.svg" "$SCRATCH/t17/regen/work/CNX_Chem_04_03_etheneBr_img/translated.svg" 2>&1 | tail -8
pgrep -a chrome-headless || echo "no chromium survivors"
```
(`books/efnafraedi-2e/media/` holds hundreds of `_IS.svg` files, so the 34 are passed by name from the sidecar list; the `wc -w` line must print `34`.)

Expected:
- **Census on the repository build:** `boundaries 164, space-bearing 24`; `lost`, `added`, `narrowed`, `collision` and `overhang` all `total 0`; `CONTROL … worst |delta| pt = 0.0`; `CENSUS-DONE`.
- **Control census on the committed pre-fix media:** `lost … total 16`, `collision … total 94`, `overhang … total 36`, `worst |delta| pt = 8.9688`.
- **Bond:** the source segment `(3454, 3540)`; the committed media `(3443, 3528)` on rows 200…232; the repository build `(3454, 3539)` on rows 201…233; `BOND-DONE`.
- `no chromium survivors`.

---

### Task 18: The repair run — recompose the 34 with `--stale --force`, verify the media BY VALUE, commit data and evidence

**Files:**
- Data: `books/efnafraedi-2e/media/<basename>_IS.svg` ×34, written by `tools/figure-run.js` only
- Create (committed): `EV2/VERIFICATION.md`

**Interfaces:**
- Consumes: Tasks 13–16's composer; `EV2/PREDICTIONS.json`; Task 17's outputs; Task 1's JS baseline (`$SCRATCH/baseline/js-failing-by-name.txt`, `js-loadfail.txt`).
- Produces: the recomposed media for Task 19.

- [ ] **Step 1: Pre-flight — editorial state on the remote, with a positive control**

Run Task 10 Step 1's commands verbatim. Expected: no output with `state-grep exit=1`, then `34`. **A non-zero `state` count: STOP and report** — a recompose would send an approved figure back to `mt-preview`.

- [ ] **Step 2: Pre-flight — dry runs (free)**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --force --dry-run 2>&1 | tee "$SCRATCH/t18-dry-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --force --dry-run 2>&1 | tee "$SCRATCH/t18-dry-ch04.log" | tail -40
```
Expected (measured 2026-09-15 at `433f9a2e`; the tallies do not depend on the composer):
- ch03 opens with `DRY RUN — nothing bought, nothing written under books/`, then:
  - `efnafraedi-2e ch03: 15 figure(s) across 5 module(s)`
  - `--stale: 26 figure(s) in this chapter have no sidecar and were not selected. …`
  - `15  translated`
  - `15  = enumerated`
  - `VERDICT ok`
- ch04 reads `19 figure(s) across 6 module(s)` / `11 figure(s) … not selected` / `19  translated` / `19  = enumerated` / `VERDICT ok`.
- Both chapters list `figure-prepare.py warnings` of the `subset font` kind only, as before.

`translated` is the driver's name for a recomposed figure; with `--force` no figure reads `skipped-current`. **Any `failed-*`, `unresolved`, `unreadable-text` or `copied-*` row, or a prepare warning naming the artwork guard (`artwork.svg transform …`): STOP and report.**

- [ ] **Step 3: Live run, in the foreground, one chapter at a time**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --force 2>&1 | tee "$SCRATCH/t18-live-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --force 2>&1 | tee "$SCRATCH/t18-live-ch04.log" | tail -40
```
(tool timeout 600000 each.)

Expected per chapter:
- `MT spawned for 0 figure(s)`, or no MT line;
- the same outcome tallies as that chapter's dry run in Step 2;
- `VERDICT ok`;
- ch03 carries the `localized` NOTE and ch04 the `overflow` NOTE, as in Task 10.

**Any `failed-*`, `unresolved` or `unreadable-text` row, an `MT spawned` count above 0, or an `unformatted` / `containerErrors` NOTE: STOP.** If a run is killed or times out, re-run the same chapter: `--force` recomposes every figure again, which is idempotent at 0 ISK.

- [ ] **Step 4: Exactly the 34 media changed — no sidecar, no mapping, nothing else**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git status --porcelain | awk '{print $1, $2}' | sed -E 's#(books/efnafraedi-2e/media)/.*#\1/…#' | sort | uniq -c
git status --porcelain -- books/efnafraedi-2e/figure-text books/efnafraedi-2e/media/image-mapping.json | wc -l
```
Expected: `34 M books/efnafraedi-2e/media/…` and nothing else, then `0`. The sidecars are rewritten only when `composedVersion` or `composedHash` differs, and neither does.

- [ ] **Step 5: The recomposed media equal the prediction, by value**

```bash
export EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
python3 "$EV2/instruments/predict.py" check "$EV2/PREDICTIONS.json" --media | tail -5
```
Expected: `media_artwork_sha256 34/34 MATCH`, `media_textgroup_sha256 34/34 MATCH`, `text_count 34/34 MATCH`, `style_font_faces 34/34 MATCH`, `34/34 MATCH`.

This is the check a version stamp could not make: every figure's artwork and every label, byte for byte, as the verified build drew them. The `<style>` bytes differ, because the woff2 `head.modified` is not pinned in a `figure-run.js` compose.

- [ ] **Step 6: Census and bond on the committed media**

```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
MEDIA34=$(ls "$REPO/books/efnafraedi-2e/figure-text" | sed "s#\.is\.json\$#_IS.svg#; s#^#$REPO/books/efnafraedi-2e/media/#"); echo $MEDIA34 | wc -w
python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t18/census" $MEDIA34 2>&1 | tail -10
python3 -u "$EV2/instruments/bond/bond.py" --out "$SCRATCH/t18/bond" "$REPO/books/efnafraedi-2e/media/CNX_Chem_04_03_etheneBr_img_IS.svg" 2>&1 | tail -5
pgrep -a chrome-headless || echo "no chromium survivors"
```
Expected:
- `34`;
- census: every class `total 0`, `worst |delta| pt = 0.0`, `CENSUS-DONE`;
- bond: `(3454, 3539)` on rows 201…233, `BOND-DONE`;
- `no chromium survivors`.

- [ ] **Step 7: The JS failing set is the baseline**

Re-run Task 7 Step 3's commands with `--outputFile="$SCRATCH/t18-js.json"` and the snippet's second argument `t18-js.json` (tool timeout 600000). Expected: `NEWLY RED: []`, `NEWLY GREEN: []`. **Anything else: STOP and report.**

- [ ] **Step 8: Commit the data**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add books/efnafraedi-2e/media/*_IS.svg
git commit -m "feat(figures): recompose the 34 ch03/ch04 figures with [USER]'s review fixes

figure-run --stale --force (COMPOSER_VERSION stays 3, which never left this
branch): 34 media recomposed, 0 MT calls, 0 sidecars changed. Every figure's
artwork part and text group equal the verified build byte for byte
(predict.py --media 34/34); browser census 0 lost spaces, 0 collisions, 0
overhangs at 7 scales; etheneBr's bond back at the source's pixel columns.
Not rendered or synced - publication is [USER]'s call.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

- [ ] **Step 9: Write the frozen VERIFICATION.md and commit**

Create `EV2/VERIFICATION.md` with:
- a 🧊 FROZEN banner (cited, never synced; status lives in the campaign register and `REGISTER.md`);
- the `BASE2` and HEAD shas;
- Tasks 13–16: each RED line, GREEN line and mutation result, and each `compare` output;
- Task 17: the two `DONE` lines, the eight `34/34 MATCH` lines, and the census, control census and bond lines;
- Task 18: the dry-run and live tallies, Step 4's two outputs, Step 5's five lines, Step 6's census and bond lines, and Step 7's JS result;
- the commands used.

Cite `PREDICTIONS.md` and `reports/` rather than restating their numbers.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/VERIFICATION.md
git commit -m "docs(figures): [USER]'s review fixes verified on the recomposed 34 at 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

### Task 19: Acceptance again — [USER] looks at the review fixes

**Files:**
- Create (scratch only): `$SCRATCH/t19/`

**Interfaces:**
- Consumes:
  - `BASE2` media: exactly what [USER] reviewed at Task 11, unchanged until Task 18;
  - the working-tree media (Task 18);
  - `EV2/PREDICTIONS.md`;
  - `$SCRATCH/t11/` (Task 11's stack script and page builder);
  - `/home/siggi/dev/scratch-c140/fix2/artwork/rows.jsonl` (per-figure artwork transforms);
  - `/home/siggi/dev/scratch-c140/label-context-mt/verdicts.json` (the 2026-09-15 figure-label MT comparison).
- Produces: the same acceptance artifact URL, republished, and [USER]'s answer.

- [ ] **Step 1: Render the stacks — source / what you reviewed / after the fixes**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build
mkdir -p "$SCRATCH/t19" && cp "$SCRATCH/t11/t11_stacks.py" "$SCRATCH/t19/t19_stacks.py" && cd "$SCRATCH/t19"
python3 - <<'EOF'
p = 't19_stacks.py'; s = open(p).read()
for old, new in (("'BEFORE — E (composer 2)'", "'BEFORE — what you reviewed'"), ("'AFTER — composer 3'", "'AFTER — your review fixes'")):
    assert s.count(old) == 1, old; s = s.replace(old, new)
open(p, 'w').write(s)
EOF
pgrep -a chrome-headless; python3 -u t19_stacks.py <BASE2 sha> 2>&1 | tee -a t19.log | tail -3
```
(tool timeout 600000; resumable, so re-run until `rendered 34 of 34`.)

Expected: `rendered 34 of 34`, `render failures []`.

- [ ] **Step 2: Notes and page (controller; the page's design is Task 11's)**

Build `$SCRATCH/t19/site/index.html` from `$SCRATCH/t11/build_page.py` (copy it, point it at `t19`). Keep the title "Composer 3 figure check" and the chapter layout. The intro says what changed since [USER]'s review (R12–R15 in one line each) and that this page is again the merge gate.

Per figure, a "Since your review" note list derived from `PREDICTIONS.md`:
- the fill change, on every figure;
- the artwork correction in pt, for the 24 figures, from `rows.jsonl`'s old transform (the worst displacement);
- the new line breaks, for the 8 flowchart boxes;
- the space and bond, for etheneBr and ethene.

Also, per figure, a "Wording — not changed by this branch" list: the labels the 2026-09-15 MT comparison judged `wrong` in the committed sidecars (e.g. `Element` → `Þáttur`, `Molecular mass` → `Mólmassi`), each with the judged-correct alternative. These are editorial fixes [USER] can make in figure review.

Keep Task 11's own notes below, collapsed under "First review".

- [ ] **Step 3: Republish to the same artifact and hand it over**

Publish with the `Artifact` tool to the Task 11 artifact (same file path in the same session, or `url` = the Task 11 artifact URL), with `files` for the 34 images. Send [USER] the link with one paragraph:
- the four fixes;
- where to look first: etheneBr (space and bond), ethene (space), flowchart (line breaks), and any figure for colour against the artwork;
- the wording list;
- the question **"Do these pass — may the PR be merged?"**

- [ ] **Step 4: STOP until [USER] answers**

Task 12 runs only after a yes. A new problem goes back through systematic debugging on this branch.
