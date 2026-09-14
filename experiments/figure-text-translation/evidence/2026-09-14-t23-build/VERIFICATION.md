# Verification — §C140 ② ③ ⑨: the repository implementation on the 34 bought figures, 0 ISK

> 🧊 **FROZEN, 2026-09-14.** Cited, never synced. Status lives in the campaign register (§C140, ⏩ RESUME)
> and in `../../REGISTER.md`. This measures the repository implementation — branch
> `feat/c140-t23-scripts-reflow-decimals` — against `PREDICTIONS.md` (written before that implementation
> existed) and against the byte-frozen scratch build `PREDICTIONS.md` was derived from. If this folder
> disagrees with `PREDICTIONS.md` or the design/plan it implements, they win, per the rule in the sibling
> `README.md`. **Cost of everything here: 0 ISK** — no MT call; nothing under `books/` written; the composer
> ran only against the 34 already-bought figures and one already-committed media file (exocytosis IS SVG,
> read via `git show`).

**BASE** (the plan commit): `d760672d1307574e0ffa069e2e5b79417b052784`
**HEAD** (verified here): `d453e8bfbfa531b1a264df395a4271e739bb6191`
**Implementation range** `d760672d..d453e8bf` (7 commits):

```
d453e8bf feat(figures): COMPOSER_VERSION 3 — every committed figure recomposes
98d81b0b feat(figures): the composer's notes reach the driver as NOTE lines (§C140, spec commit 5)
3e0fdf20 feat(figures): ③ translated labels laid out against their own box, cell or open space (§C140, spec commit 4)
5d0f62ca feat(figures): ⑨ English-kept numbers drawn with Icelandic separators (§C140, spec commit 3)
1635373d feat(figures): ② translated labels keep their formula formatting (§C140, spec commit 2)
ff97caf1 test(figures): §C140 end-to-end harness and goldens from the unchanged composer
69a8d258 feat(figures): collapse cairo's blend-chain lerp so exocytosis loads (§C140, spec commit 1)
```

At the start of this task, `HEAD` was `d453e8bf` and `git status --porcelain` was empty, as required. At the
end, `git status --porcelain` is empty again (confirmed after Steps 1–4 below, before this file was staged) —
the only untracked paths under `experiments/figure-text-translation/` are the pre-existing gitignored ones
(`__pycache__/`, `census-out/`, `out/`, `pylibs/`, `sources.local.json`), unchanged by this task.

---

## Step 1 — the composer, byte for byte, against the verified build; the frozen instruments against the predictions

**Command** (see § Instruments/Commands below for the full block). Copies the repository's
`experiments/figure-text-translation` into scratch (excluding `pylibs`, `out`, `evidence`, `__pycache__`;
`pylibs` re-linked), then runs the predictor's `reproduce.sh` against that copy under tag `REPO`.

**Output** (the five frozen-instrument controls, the compose line, the measure/sentinel/analyse line, and the
rank):

```
== controls: the adapted instruments reproduce the frozen r2 outputs
   measure-V0.jsonl byte-identical to frozen
   measure-V5_p2.0_f7.5.jsonl byte-identical to frozen
   sentinels-V5_p2.0_f7.5.json byte-identical to frozen
   sentinels --control on V5: fires 3 of 3; clean fires: 0
   analysis.json byte-identical to frozen
   tables.md byte-identical to frozen
== compose the 34 with .../t9/repo-exp as REPO
rc0 34 / 34 | items byte-equal to c-fix/rd/C 0 | compose-report byte-equal 0 | diag realdata fields equal 0 | diag rows 0 | items byte-equal to PREVIOUS build 0 | report byte-equal to PREVIOUS build 0
== measure / sentinels / analyse REPO
REPO blocks 176 TEXT fail 0 adjacency 34 | styled blocks 34 stretches placed 52 / 52 drawn-styled mismatch 0 unformatted 0 | box 66 fail 0 | cell 26 fail 1 displaced 4 | open steps {'ii': 7, 'iii-displaced': 4, 'i': 65, 'iii-anchor': 2, 'v-overflow': 6}
   sentinels --control on REPO: fires 3 of 3
REPO rank (4, 4, 7, 7, 6.0, 0) totals {'hit': 1, 'offpage': 0, 'spill': 2, 'contact': 1, 'text_coll': 0, 'shrunk': 14, 'lines_differ': 18, 'more_lines': 0, 'fewer_lines': 18, 'ink_sum': 41, 'census_union': 14}
best by rule V5_p2.0_f7.0
analysis per_tag REPO == FINAL: True
figures whose items.json or compose-report.json differ from the verified build: none
```

**On the "byte-equal … 0" fields in the compose line.** These read as zero rather than 34, and that is an
instrument shape, not a deviation — confirmed by reading `run_final.py`'s own docstring and code, not
inferred: "Only TAG == FINAL is compared against c-fix/rd/C … and against plan/pred/work/FINAL (the PREVIOUS
prediction build)" (lines 8–10), and the per-figure fields (`itemsByteEqualIntC`, `reportByteEqualIntC`,
`itemsByteEqualPrev`, `reportByteEqualPrev`) are only populated `if p.returncode == 0 and TAGNAME == 'FINAL'`
(line 103). Under tag `REPO` those fields are never set, so the sums are 0/34 by construction, independent of
whether REPO's outputs are correct. The rehearsal's own Task 9 Step 1 record (`reports/rehearsal.md` line 106)
names only the rank tuple, the `analysis per_tag … True` line and the 0-figures-differ line as the checked
results, consistent with this reading.

The number that actually decides Step 1 is the Python control at the end, comparing REPO's `work/REPO/*/`
against the verified `work/FINAL/*/` byte for byte: `analysis per_tag REPO == FINAL: True` and `figures whose
items.json or compose-report.json differ from the verified build: none`. **Byte-equal items and reports on
34/34 means every number in `PREDICTIONS.md` holds for the repository implementation.**

**Expected:** the controls print `byte-identical to frozen` five times and `fires 3 of 3`; `REPO rank (4, 4,
7, 7, 6.0, 0)`; `analysis per_tag REPO == FINAL: True`; `… differ from the verified build: none`.
**Verdict: MATCH.**

---

## Step 2 — artwork on the 34: re-prepare with the repo, compare with the BASE preparation

**Command:** `python3 -u artwork34.py` (script in § Instruments), one figure at a time, comparing each
`artwork.svg` and `blocks.json` against `/home/siggi/dev/scratch-c140/prep/figs/<basename>/` (the BASE
preparation the predictions were measured against).

**Totals line:**

```
svg identical 31 | blocks identical 34 | changed {'CNX_Chem_03_01_exocytosis-88f6': 155, 'CNX_Chem_04_02_HClsoln': 2, 'CNX_Chem_04_04_sandwich': 52} | refcost warnings 0
```

**Per-figure `svgfix` counts of the three changed figures** (from the per-row JSON; all changes are inside
`svgfix`'s blend-lerp collapse, which touches only `artwork.svg`, never `blocks.json`):

| figure | addOps | collapsed | useSitesRewritten | clipped | unmatched | modes |
|---|---|---|---|---|---|---|
| `CNX_Chem_03_01_exocytosis-88f6` | 158 | 155 | 155 | 3 | 0 | multiply 110, screen 45 |
| `CNX_Chem_04_02_HClsoln` | 2 | 2 | 2 | 0 | 0 | multiply 2 |
| `CNX_Chem_04_04_sandwich` | 52 | 52 | 52 | 0 | 0 | screen 52 |

All 34 figures: `blocks_identical: true` and `refcost_warnings: []`. `bytes_changed` for the three above is the
raw byte count from a same-length diff (155 / 2 / 52 respectively — not a percentage), consistent with the
totals line. `svg_identical: true` (0 bytes changed) on the other 31.

**Expected:** `svg identical 31 | blocks identical 34 | changed {'CNX_Chem_03_01_exocytosis-88f6': 155,
'CNX_Chem_04_02_HClsoln': 2, 'CNX_Chem_04_04_sandwich': 52} | refcost warnings 0`.
**Verdict: MATCH.**

Full per-figure rows are kept at `/home/siggi/dev/scratch-c140/build/t9/artwork34.json` (scratch; Task 11
reads it for its cards).

---

## Step 3 — exocytosis loads through `<img>` now, and did not before

**Command:** recompose `CNX_Chem_03_01_exocytosis-88f6` with the repository's `figure-compose.py`; render the
resulting `translated.svg` and the committed `HEAD` media (`books/efnafraedi-2e/media/CNX_Chem_03_01_exocytosis-88f6_IS.svg`)
through the same headless-Chrome `<img>` harness (`evidence/2026-09-13-t23/instruments/exo/tools/render-exo.mjs`).

**Two JSON lines:**

```
{"src":"translated.svg","bytes":24921349,"loadMs":2360,"complete":true,"naturalW":576,"shotMs":635,"error":null,"totalMs":3339}
{"src":"exo-before.svg","bytes":24921365,"loadMs":null,"complete":false,"naturalW":0,"shotMs":null,"error":"load: page.waitForFunction: Timeout 30000ms exceeded.","totalMs":30279}
```

**Chromium survivors:** `pgrep -a chrome-headless` before Step 3 — none. Mid-run (right after compose, before
either render) — none. After both renders — none (`pgrep -a chrome-headless` printed nothing; `no chromium
survivors` echoed).

**Expected:** the first JSON line `"complete":true`, `"naturalW"` > 0, `"loadMs"` a few thousand at most (the
spike measured ~2.1 s — 2360 ms here); the second (the committed E media) `"loadMs":null` with a `load:`
timeout error; `no chromium survivors`. **Verdict: MATCH.**

`$SCRATCH/t9/prep` was removed after these two lines were recorded, keeping `artwork34.json` (per the task's
scratch-retention instruction for Task 11).

---

## Step 4 — two corpus carriers of the blend chain render pixel-identically after the collapse

**Command:** `python3 -u carriers.py` (script in § Instruments) — prepares `CNX_Chem_05_02_IcePack` and
`CNX_Chem_08_02_HybrdOrbit` with the repository's `figure-prepare.py` (collapse on), re-derives the
pre-collapse `before.svg` by re-running `pdftocairo` on the same `artwork.pdf` exactly as `strip-text` does,
renders both through the same `<img>` harness, and compares pixels.

**Two JSON lines:**

```
{"basename": "CNX_Chem_05_02_IcePack", "svgfix": {"addOps": 131, "collapsed": 129, "useSitesRewritten": 129, "clipped": 0, "unmatched": 2, "modes": {"multiply": 129}}, "collapse_reproduces_prepare": true, "cost_before": [133.1395513523982, 259], "cost_after": [10.166163082646113, 130], "load_before": 4077, "load_after": 614, "pixels_identical": true}
{"basename": "CNX_Chem_08_02_HybrdOrbit", "svgfix": {"addOps": 74, "collapsed": 74, "useSitesRewritten": 74, "clipped": 0, "unmatched": 0, "modes": {"multiply": 74}}, "collapse_reproduces_prepare": true, "cost_before": [84.5289457773174, 148], "cost_after": [13.759992179981, 74], "load_before": 737, "load_after": 694, "pixels_identical": true}
```

(`cost_before`/`cost_after` are the exact two-element lists `svgfix.reference_cost()` printed — not relabelled;
this task did not read `reference_cost`'s internals to name the elements.)

**Chromium survivors:** none before Step 4, none after (`pgrep -a chrome-headless` printed nothing; `no
chromium survivors` echoed).

**Expected** (`reports/exo-spike.md` § corpus): IcePack `collapsed 129`, `unmatched 2`; HybrdOrbit `collapsed
74`, `unmatched 0`; for both `collapse_reproduces_prepare: true`, `cost_after` below `cost_before`,
`pixels_identical: true`; for IcePack, `load_after` below `load_before` (rehearsal: 4130 → 590 ms — measured
here 4077 → 614). HybrdOrbit's load pair is recorded, not a gate (rehearsal: 852 → 787 ms, inside single-shot
noise; measured here 737 → 694 ms, same noise band). No `UNRESOLVED` carrier. **Verdict: MATCH.**

`$SCRATCH/t9/carriers/<basename>/` was removed by the script itself after each figure's line was printed.

---

## Python and JS by-name results, Tasks 1–8 (from scratch; nothing re-run)

**Python baseline** (`$SCRATCH/baseline/py/by-name.json`): 12 test files, every one `rc=0`, `fails=[]` — the
Python suite was fully green before any §C140 module or end-to-end test file existed (`test_blockkey_consumers`,
`test_c4b_multiset`, `test_compose_runexact`, `test_figtext_normalise`, `test_figtext_out`,
`test_figtext_runexact`, `test_figure_compose`, `test_figure_prepare`, `test_make_fixture`, `test_readlayer`,
`test_sendable`, `test_sources`).

**JS baseline** (`$SCRATCH/baseline/js-failing-by-name.txt` + `js-loadfail.txt`): 36 named failing tests,
spread across pre-existing suites unrelated to figures (`bracket-delta-corpus`, `remt-checks-mt`,
`remt-sweep`, and others) — this is the whole-repo JS red baseline this task's Tasks 7–8 deltas are measured
against, not a figures-specific baseline. `js-loadfail.txt` is one blank line: 0 named load failures.

| file (Python compare) | new/changed test file | result |
|---|---|---|
| `t2-compare.txt` | `test_svgfix.py` (NEW) | `rc=0 fails=[] last='ALL PASS'` |
| `t3-compare.txt` | `test_compose_t23.py` (NEW) | `rc=1`, 23 named fails (RED-first e2e baseline) |
| `t4-compare.txt` | `test_compose_t23.py` NEWLY GREEN 6 (rc still 1); `test_figscripts.py` (NEW) | figscripts `rc=0 fails=[] ALL PASS` |
| `t5-compare.txt` | `test_compose_t23.py` NEWLY GREEN 2 (rc still 1); `test_numloc.py` (NEW) | numloc `rc=0 fails=[] ALL PASS` |
| `t6-compare.txt` | `test_compose_t23.py` NEWLY GREEN 15 (rc 1→0, now fully green); `test_figlayout.py` (NEW) | figlayout `rc=0 fails=[] ALL PASS` |

6 + 2 + 15 = 23 — the 23 fails Task 3 established are fully closed by Task 6, with no other file moving.

**Task 7 (no Python compare file; Python evidence is `$SCRATCH/t7-fc-green.out`, vs `$SCRATCH/t7-fc-red.out`
before it):** `t7-fc-red.out` — 4 FAILED (`2h`, `11a`, `11b`, `11d`, all about `compose.json` carrying the
composer's four note lists). `t7-fc-green.out` — `ALL PASS`, all 4 now pass alongside the pre-existing checks.
JS after Task 7 (`$SCRATCH/t7-compare.txt`): `tests 6498`, `NEWLY RED: []`, `NEWLY GREEN: []`, `suites failing
to LOAD: [] | baseline: []` — no JS-visible change at this task.

**JS after Task 8** (`$SCRATCH/t8-delta.txt`): `tests 6498`, `NEWLY RED: [2]` (`figure-run-free.test.js`:
"skips exactly the figures that really do have a current sidecar — no more, no fewer" and "names an
unresolved figure instead of failing the run over it (R9)"), `NEWLY GREEN: [7]` (renamed/rebehaved
`figure-run-free.test.js` cases covering the same de-hash and pre-flight-refusal mechanisms), `suites failing
to LOAD: [] | baseline: []`. Task 8's own report (`task-8-report.md` line 59) records this exact 2-item
NEWLY RED set as its Expected and calls it MATCH — cited here, not re-adjudicated.

---

## Corpus script-threshold comparison and inverted-base census (measured during planning; not re-derived)

Per the task instruction, these numbers are cited from the planning reports, not re-run.

**Script-threshold comparison** (`reports/round1-3-build-figscripts.md`, "Real data (b) — the corpus census"
table): comparing the size-conditional script-size rule against a flat 0.12 threshold, held at the fixed base,
over the full corpus (non-arc, rot-0 blocks: 2,814 send:true / 11,835 send:false): **send:true 0 / send:false
4** blocks move; at the resolved base, 4 more send:false blocks move (send:true still 0). The 4 threshold-diff
send:false runs are all a 7 pt `2` at −0.11 to −0.1111 pt (Oshapes `d2`/`dx2–y2` ×2, Dorbital `dz2`, CFSE
`dz2` at the letter-vote base; Ex9soln `dx2–y2` ×2 and Dorbital `dx2–y2` ×2 more at the resolved base). None of
the 34 bought figures are affected (0 of 34).

**Inverted-base census** (same table, "inversion lines: detected / resolved / left" row): **send:true 19
detected / 13 resolved / 6 left inverted; send:false 43 detected / 25 resolved / 18 left inverted.** The 6
left-inverted send:true lines (Systemqw ×4, rvosmosis, CFSE Δoct) and the 18 left-inverted send:false lines
share one shape — a STIX capital at 11 pt over a 7 pt subscript word — which the shipped `F6` fix
(`round2-0-fix-modules.md`, "F6 — `body_size`") does not attempt to resolve further: its corpus census
(Manometer ×4, Relation E°cell, Dorbital ×3, MolSpeed1 ×2, CFSE ×3 on send:true; Ex9soln, Dorbital, pMOsigma
×2 on send:false) **equals the builder's ALT vote on every block, so counting inverted lines changed nothing**
— i.e. `F6` moves 0 decisions on the 176 blocks, matching `PREDICTIONS.md`'s "F2-F7 and the compose changes
move 0 decisions on the 176 blocks" and control 6's "F6 `body_size` old = new on 176/176".

---

## Instruments

### `artwork34.py` (Step 2, run from `$SCRATCH/t9`)

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

Run: `export SCRATCH=/home/siggi/dev/scratch-c140/build PYTHONDONTWRITEBYTECODE=1; cd "$SCRATCH/t9" && python3 -u artwork34.py`

### `carriers.py` (Step 4, run from `$SCRATCH/t9`)

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

Run: `export SCRATCH=/home/siggi/dev/scratch-c140/build PYTHONDONTWRITEBYTECODE=1; cd "$SCRATCH/t9" && python3 -u carriers.py`

### Commands (Steps 1 and 3, verbatim)

```bash
# Step 1
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

# Step 3
export SCRATCH=/home/siggi/dev/scratch-c140/build EXP=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
B=CNX_Chem_03_01_exocytosis-88f6; O=$SCRATCH/t9/prep/$B; I=$EXP/evidence/2026-09-13-t23/instruments/exo/tools/render-exo.mjs
cd "$EXP" && FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$SCRATCH/tmp python3 -u figure-compose.py --out "$O" --translations /home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text/$B.is.json | tail -1
pgrep -a chrome-headless; W=$(python3 -c "import json;print(round(json.load(open('$O/meta.json'))['page'][0]*2))"); H=$(python3 -c "import json;print(round(json.load(open('$O/meta.json'))['page'][1]*2))")
node "$I" "$O/translated.svg" "$SCRATCH/t9/exo-after.png" $W $H 60000
git -C /home/siggi/dev/repos/namsbokasafn-efni show HEAD:books/efnafraedi-2e/media/${B}_IS.svg > "$SCRATCH/t9/exo-before.svg"
node "$I" "$SCRATCH/t9/exo-before.svg" "$SCRATCH/t9/exo-before.png" $W $H 30000
pgrep -a chrome-headless || echo "no chromium survivors"
```

---

## Result

All four measurement steps MATCH their Expected line. The repository implementation at `d453e8bf` reproduces
the verified scratch build byte-for-byte on the 34 bought figures (Step 1), its re-prepared artwork agrees
with the BASE preparation except the three figures the blend-chain collapse is meant to touch, by exactly the
predicted byte counts (Step 2), the exocytosis regression is fixed and the control that could see the old
defect still can (Step 3), and the blend-chain collapse reproduces `figure-prepare.py`'s own output and
renders pixel-identically on two more corpus carriers, with IcePack's load time improved as measured in the
spike (Step 4). No Chromium survivors at any checkpoint. No deviation was found; nothing here required
consulting `PREDICTIONS.md` § Hazards as a reason to discount a result.
