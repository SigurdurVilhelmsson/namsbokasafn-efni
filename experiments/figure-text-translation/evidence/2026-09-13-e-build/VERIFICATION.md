# VERIFICATION — E vs the unchanged composer, on the 34 bought figures, 0 ISK

> 🧊 **FROZEN.** Cited by `REGISTER.md` and the campaign register, never synced. Nothing here
> is status — a later run at a later sha does not update this file; it gets its own dated note.

**Date:** 2026-09-13. **Task:** T3 (spec `docs/superpowers/specs/2026-09-13-c140-e-run-exact-kept-text-design.md`, §T3).

**BASE** (unchanged composer, byte-identical to `main` per the plan's global constraints):
`b805d64f`
**HEAD** (E — run-exact drawing of kept text): `4612f3e4bd8afc95e8ec19151f64532729a81c83`
(`git rev-parse HEAD` on `feat/c140-e-run-exact-kept-text` at run time; passed to `t3_verify.py`
as the literal sha, not the ref `HEAD`, so this note stays reproducible after later commits.)

Every step below composed each of the **34 real, committed figures**
(`books/efnafraedi-2e/figure-text/*.is.json`) against BASE and against HEAD, both from the same
committed sidecar. No MT was called anywhere — `compose.py` and `figure-prepare.py` never call
it, and `translate-blocks.mjs` / `tools/figure-run.js` were never run. `books/` was never
written. `git status --porcelain` was empty before, during (checked between runs) and after
every step in this repo's working tree.

---

## Step 2 — T3 verifier: `t3_verify.py b805d64f 4612f3e4bd8afc95e8ec19151f64532729a81c83`

One run, zero resumes — the whole batch (34 figures × 2 trees × {prepare, compose}) completed
inside a single foreground call.

**Measured TOTALS line (verbatim):**

```
TOTALS {"figures": 34, "blocks_json_identical": 34, "multisets_equal": 34, "identity": 7, "runExact": 191, "population_items_equal": 34, "population_nonempty": 31, "kept_changed": 20}
```

| Measure | Predicted | Measured | Match |
|---|---|---|---|
| figures | 34 | 34 | ✅ |
| blocks_json_identical | 34 | 34 | ✅ |
| multisets_equal | 34 | 34 | ✅ |
| identity | 7 | 7 | ✅ |
| runExact | 191 | 191 | ✅ |
| population_items_equal | 34 | 34 | ✅ |
| population_nonempty | 31 | 31 | ✅ |
| kept_changed | *(no prediction — recorded)* | 20 | — |

**No miss on any predicted number.** Nothing was STOP-blocked.

### `population_items_equal 34` is not 34 non-vacuous checks

`population_items_equal` compares the items drawn in the *population* blocks (translated, not
identity) between BASE and HEAD — this is the check that the untranslated/translated population
draws the same way it always did (E only changes how *kept* text is drawn). 31 of the 34
figures have a non-empty population (`population_nonempty`), so 31 of the 34 `true` values are
real `[items…] == [items…]` comparisons over 1–19 blocks each. The remaining **3 figures have
an empty population** (every block in the figure is either identity or not sent for translation
at all — every block was *kept*), so their `population_items_equal` is the vacuous `[] == []`:

| Figure | population_blocks | identity | kept_changed |
|---|---|---|---|
| `CNX_Chem_04_01_basehyd_img` | 0 | 1 | 2 |
| `CNX_Chem_04_02_HClsoln` | 0 | 3 | 7 |
| `CNX_Chem_04_04_GreenChem` | 0 | 1 | 2 |

These three are exactly the figures where E's effect is largest relative to the figure's size —
every drawn block in them is a *kept* block, so `kept_changed` (2, 7, 2) reflects almost the
whole figure switching from re-laid-out to run-exact drawing.

### `kept_changed` per figure (all 34, from `t3.jsonl`)

`kept_changed` counts kept blocks (not in the translated population) whose drawn items differ
between BASE and HEAD — i.e. where E actually changed what gets drawn for text that was left
alone. Total **20** across **6** figures; the other 28 figures drew every kept block identically
under both composers.

| basename | identity | runExact | population_blocks | kept_changed |
|---|---|---|---|---|
| CNX_Chem_03_01_alsulfatemass_img | 0 | 19 | 5 | 0 |
| CNX_Chem_03_01_aspirin | 0 | 19 | 5 | 0 |
| CNX_Chem_03_01_brain-ec0b | 0 | 2 | 1 | 0 |
| CNX_Chem_03_01_chloroform | 0 | 19 | 5 | 0 |
| CNX_Chem_03_01_exocytosis-88f6 | 0 | 2 | 5 | 0 |
| CNX_Chem_03_01_glycinemass_img | 0 | 25 | 5 | 0 |
| CNX_Chem_03_01_saltMass | 0 | 13 | 5 | 0 |
| CNX_Chem_03_02_argon_img-9025 | 0 | 0 | 3 | 0 |
| CNX_Chem_03_02_copperMoles_img-a962 | 0 | 0 | 5 | 0 |
| CNX_Chem_03_02_glycine_img-7c96 | 0 | 0 | 3 | 0 |
| CNX_Chem_03_02_potassium_img-f1d1 | 0 | 0 | 3 | 0 |
| CNX_Chem_03_02_sacch_img-3278 | 0 | 0 | 5 | 0 |
| CNX_Chem_03_02_vitC_img-e537 | 0 | 0 | 3 | 0 |
| CNX_Chem_03_03_empform | 0 | 0 | 10 | 0 |
| CNX_Chem_03_05_Example2_img | 0 | 0 | 5 | 0 |
| **CNX_Chem_04_01_basehyd_img** | 1 | 26 | 0 | **2** |
| **CNX_Chem_04_01_rxn2** | 0 | 8 | 8 | **4** |
| CNX_Chem_04_01_rxn3 | 0 | 0 | 2 | 0 |
| **CNX_Chem_04_02_HClsoln** | 3 | 9 | 0 | **7** |
| CNX_Chem_04_03_etheneBr_img | 0 | 14 | 3 | 0 |
| CNX_Chem_04_03_ethene_img | 0 | 16 | 2 | 0 |
| CNX_Chem_04_03_flowchart | 0 | 0 | 19 | 0 |
| CNX_Chem_04_03_map2_img | 0 | 0 | 7 | 0 |
| CNX_Chem_04_03_map3_img | 0 | 0 | 7 | 0 |
| CNX_Chem_04_03_moleratio1_img | 0 | 0 | 3 | 0 |
| CNX_Chem_04_03_moleratio2_img | 0 | 0 | 5 | 0 |
| **CNX_Chem_04_04_GreenChem** | 1 | 10 | 0 | **2** |
| CNX_Chem_04_04_limiting | 0 | 0 | 4 | 0 |
| CNX_Chem_04_04_sandwich | 0 | 0 | 7 | 0 |
| CNX_Chem_04_05_combmap_img | 0 | 0 | 15 | 0 |
| **CNX_Chem_04_05_combustion** | 0 | 1 | 6 | **1** |
| CNX_Chem_04_05_map7_img | 0 | 0 | 7 | 0 |
| CNX_Chem_04_05_map8_img | 0 | 0 | 9 | 0 |
| **CNX_Chem_14_03_FishLemon** | 2 | 8 | 4 | **4** |
| **TOTAL** | **7** | **191** | **160** | **20** |

Across all 34 figures, `blocks_json_identical` and `multisets_equal` were both `true` — E never
changes the block layout `compose.py` emits, only how the *kept*-text items within those blocks
are drawn.

---

## Step 3 — Arc fidelity on real artwork: `t3_arcs.py CNX_Chem_14_03_corresp CNX_Chem_01_01_SciMethod`

Uses `evidence/2026-09-13-compose-fidelity/instruments/1a/fidelity.py` (copied into scratch,
re-pointed at `SCRATCH/t3/arcs`), scored against real (non-planted) chemistry artwork.
Translations were the **empty set** (`{"blocks": {}}`), so every block in each figure is *kept*
— this isolates exactly what E's run-exact path changes for text that formerly went through the
composer's re-layout.

`CNX_Chem_14_03_corresp` — the brief's named figure — listed **2** arc blocks with mixed run
sizes on the first try (`H3O+`, `C2H5O–`); the fallback (`census.py` over chapter 14) was not
needed. A second figure, `CNX_Chem_01_01_SciMethod`, was run alongside it and also carries arc
blocks (2 mixed, 2 not) — recorded for extra coverage, not required by the STOP rule.

### STOP rule: head `iou1` lower than base by ≥ 0.17 on any kept arc block

**Not triggered on any block.** Every measured block moved in the *opposite* direction — head's
`iou1` is dramatically **higher** than base's, because base is the defect this whole plan exists
to fix (re-laid-out arc text throwing sub/superscript positions off) and head (E) draws kept
arc runs exactly where the source PDF put them.

| Figure | Block (key) | formula-arc (mixed sizes) | base `iou1` | head `iou1` | Δ (head−base) | base `c_no` | head `c_no` | base `h_ratio` | head `h_ratio` |
|---|---|---|---|---|---|---|---|---|---|
| CNX_Chem_14_03_corresp | `H3O+` | **yes** | 0.2099 | 0.8956 | **+0.6857** | −8.750 | 0.224 | 1.187 | 1.026 |
| CNX_Chem_14_03_corresp | `C2H5O–` | **yes** | 0.2649 | 0.8803 | **+0.6154** | −6.203 | 0.387 | **1.520** | 1.040 |
| CNX_Chem_01_01_SciMethod | `Next ...` | **yes** | 0.5282 | 0.9280 | +0.3998 | 1.250 | 0.138 | 0.891 | 0.998 |
| CNX_Chem_01_01_SciMethod | `prediction` | no | 0.4035 | 0.9102 | +0.5067 | 3.531 | −0.058 | 0.859 | 1.013 |
| CNX_Chem_01_01_SciMethod | `not consistent with` | **yes** | 0.4184 | 0.9082 | +0.4899 | 9.350 | 0.690 | 0.862 | 1.004 |
| CNX_Chem_01_01_SciMethod | `Results` | no | 0.4299 | 0.9158 | +0.4859 | 1.171 | −0.067 | 0.899 | 0.972 |

Reading `CNX_Chem_14_03_corresp`'s `H3O+`/`C2H5O–` rows together: base's `h_ratio` of **1.52**
on `C2H5O–` (the composed ink spans 52% more of the block's normal extent than the source does —
a flattened/expanded subscript run) collapses to **1.04** under head, and base's large negative
`c_no` (the composed centroid sits ~6–9 px off the source centroid along the block's normal)
shrinks to well under 1 px under head. This is the C140 defect (`kept text re-laid out, not
drawn run-exact`) measured directly on real artwork, and E fixing it, in the same table.

---

## Python and JS results (Tasks 4–6; cited, not re-measured here)

Per the Task 4/5/6 reports:

- **Python** — all 12 `test_*.py` files under `experiments/figure-text-translation/` print
  `ALL PASS` at `d1f9a724` / `c0bfbdcd` (verified present: `ls test_*.py | wc -l` → 12).
- **JS** — at `4612f3e4` the vitest failing set moved only inside
  `tools/__tests__/figure-run-free.test.js` (7 newly green, 2 newly red), data-coupled to the
  committed sidecars and expected to return to the 36-name baseline recorded at `0c339b9d`
  (`SCRATCH/baseline-main/js-failing-by-name.txt`) after the recompose data commit.

This note does not re-run either suite; it cites Tasks 4–6's own committed results.

---

## Instruments

Both scripts are reproduced in full below so this note does not depend on the scratch directory.

### Setup this run needed that the brief's script text does not itself install

`t3_verify.py` needed nothing beyond the repo's own `experiments/figure-text-translation/pylibs`
(already on disk, MIT-tooling pure-Python deps for the CNXML pipeline). `t3_arcs.py`'s
`fidelity.py`, however, imports `numpy` and `scipy.ndimage`, and neither is in that `pylibs`
directory or installed system-wide in this environment (first run of `t3_arcs.py` died with
`ModuleNotFoundError: No module named 'numpy'` before any block was scored). This is the same
gap the earlier `1a` fidelity investigation records (`evidence/2026-09-13-compose-fidelity/
reports/1a-instrument.md`: *"Python deps numpy/scipy installed to `scratchpad/pylibs-np`"*) —
the fidelity QA instrument, unlike the pipeline it measures, needs a numeric stack the pipeline
itself does not. Installed scratch-only, via `uv` (already present on this machine), never
touching the repo:

```bash
uv pip install --python 3.14 --target "$SCRATCH/t3/pylibs-np" numpy scipy
# Installed 2 packages: numpy==2.5.3, scipy==1.18.1
export PYTHONPATH="$SCRATCH/t3/pylibs-np"
```

`t3_arcs.py` was then re-run in full (idempotent — the first, numpy-less attempt had already
produced `CNX_Chem_14_03_corresp`'s `prep/` and both `.base.png`/`.head.png`, which were simply
overwritten) with `PYTHONPATH` exported ahead of it, so the script's own
`env = dict(os.environ, FIGTEXT_PYLIBS=...)` carried `PYTHONPATH` into every subprocess call
unchanged. No line of `t3_arcs.py` itself was edited for this.

### `t3_verify.py`

```python
#!/usr/bin/env python3
"""T3: compose the 34 bought figures with the UNCHANGED (BASE) and the E (HEAD) composer,
each with its committed sidecar. Scratch only; resumable; 0 ISK (no MT anywhere)."""
import collections, json, os, re, shutil, subprocess, sys
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
REL = 'experiments/figure-text-translation'
T3 = Path(__file__).resolve().parent
REVS = {'base': sys.argv[1], 'head': sys.argv[2]}
SIDECARS = REPO / 'books/efnafraedi-2e/figure-text'
RESULTS = T3 / 't3.jsonl'
TAG = '''
class _TagList(list):
    """Instrument: every drawn item carries the index of the block being drawn."""
    def append(self, it):
        super().append(dict(it, block=globals().get('BI')))
'''


def tree(side):
    d = T3 / side
    if (d / 'compose.py').exists():
        return d
    d.mkdir(parents=True, exist_ok=True)
    names = subprocess.run(['git', '-C', str(REPO), 'ls-tree', '--name-only', REVS[side], REL + '/'],
                           capture_output=True, text=True, check=True).stdout.split()
    for n in names:
        if n.endswith(('.py', '.mjs', '.json')):
            blob = subprocess.run(['git', '-C', str(REPO), 'show', f'{REVS[side]}:{n}'],
                                  capture_output=True, check=True).stdout
            (d / Path(n).name).write_bytes(blob)
    (d / 'pylibs').symlink_to(REPO / REL / 'pylibs')
    (d / 'sources.local.json').symlink_to(REPO / REL / 'sources.local.json')
    s = (d / 'compose.py').read_text()
    assert s.count('\nITEMS = []') == 1 and s.count('\nfor b in blocks:\n') == 1, side
    s = s.replace('\nITEMS = []', TAG + '\nITEMS = _TagList()', 1)
    s = s.replace('\nfor b in blocks:\n', '\nfor BI, b in enumerate(blocks):\n', 1)
    s += ("\n(OUT / 'items.json').write_text(json.dumps(ITEMS, ensure_ascii=False))\n")
    (d / 'compose.py').write_text(s)
    return d


def sh(argv, env=None, cwd=None, timeout=900):
    return subprocess.run(argv, capture_output=True, text=True, env=env, cwd=cwd, timeout=timeout)


HASH_SUFFIX = re.compile(r'-[0-9a-f]{4}$')


def resolve(names, env, cwd):
    """basename -> source record, with the driver's LOOKUP-ONLY de-hash fallback.

    8 of the 34 sidecar basenames carry a CNXML hash suffix (`…brain-ec0b`) that sources.py
    cannot resolve; tools/figure-run.js strips `-[0-9a-f]{4}` for the LOOKUP only. The
    figure's identity - the `--basename` passed to prepare - stays the UNSTRIPPED name."""
    got = json.loads(sh([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', *names],
                        env=env, cwd=cwd).stdout)
    missing = [n for n in names if not got.get(n)]
    if missing:
        alt = json.loads(sh([sys.executable, 'sources.py', '--json', 'efnafraedi-2e',
                             *[HASH_SUFFIX.sub('', n) for n in missing]], env=env, cwd=cwd).stdout)
        for n in missing:
            got[n] = alt.get(HASH_SUFFIX.sub('', n))
    bad = [n for n in names if not got.get(n)]
    assert not bad, f'unresolved even after the de-hash fallback: {bad}'
    return got


def item_key(it):
    return (it['text'], round(it['x'], 6), round(it['y'], 6), it['size'], round(it['rot'], 6),
            bool(it['bold']), tuple(round(c, 6) for c in it['rgb']))


def main():
    done = set()
    if RESULTS.exists():
        done = {json.loads(l)['basename'] for l in RESULTS.read_text().splitlines() if l.strip()}
    trees = {s: tree(s) for s in REVS}
    env = dict(os.environ, FIGTEXT_PYLIBS=str(REPO / REL / 'pylibs'))
    names = sorted(p.name[:-len('.is.json')] for p in SIDECARS.glob('*.is.json'))
    assert len(names) == 34, len(names)
    src = resolve(names, env, str(trees['head']))       # 17 .pdf + 9 .eps + 8 de-hashed
    for b in names:
        if b in done:
            continue
        row = dict(basename=b)
        out = {}
        for side, d in trees.items():
            o = T3 / 'prep' / side / b
            shutil.rmtree(o, ignore_errors=True)
            p = sh([sys.executable, 'figure-prepare.py', src[b]['path'], '--basename', b, '--out', str(o)],
                   env=env, cwd=str(d))
            assert p.returncode == 0, (b, side, p.stderr[-400:])
            c = sh([sys.executable, 'compose.py', '--translations', str(SIDECARS / f'{b}.is.json'), '--svg'],
                   env=dict(env, FIGTEXT_OUT=str(o)), cwd=str(d))
            assert c.returncode == 0, (b, side, c.stderr[-400:])
            out[side] = dict(blocks=(o / 'blocks.json').read_bytes(),
                             rep=json.loads((o / 'compose-report.json').read_text()),
                             items=json.loads((o / 'items.json').read_text()))
        rb, rh = out['base']['rep'], out['head']['rep']
        C = collections.Counter
        row['blocks_json_identical'] = out['base']['blocks'] == out['head']['blocks']
        row['multisets_equal'] = all(C(rb[k]) == C(rh[k]) for k in ('blocks', 'missing', 'translated'))
        row['identity'] = len(rh['identity'])
        row['runExact'] = len(rh['runExact'])
        ident = set(rh['identity'])
        trans = set(rh['translated'])
        pop = [i for i, k in enumerate(rh['blocks']) if k in trans and k not in ident]
        kept = [i for i, k in enumerate(rh['blocks']) if i not in pop]

        def items_of(side, idx):
            return [item_key(it) for it in out[side]['items'] if it['block'] in idx]

        row['population_blocks'] = len(pop)
        row['population_items_equal'] = items_of('base', set(pop)) == items_of('head', set(pop))
        row['kept_changed'] = sum(1 for i in kept if items_of('base', {i}) != items_of('head', {i}))
        with RESULTS.open('a') as fh:
            fh.write(json.dumps(row) + '\n')
        print(json.dumps(row), flush=True)
        shutil.rmtree(T3 / 'prep' / 'base' / b, ignore_errors=True)
        shutil.rmtree(T3 / 'prep' / 'head' / b, ignore_errors=True)

    rows = [json.loads(l) for l in RESULTS.read_text().splitlines() if l.strip()]
    tot = dict(figures=len(rows),
               blocks_json_identical=sum(r['blocks_json_identical'] for r in rows),
               multisets_equal=sum(r['multisets_equal'] for r in rows),
               identity=sum(r['identity'] for r in rows),
               runExact=sum(r['runExact'] for r in rows),
               population_items_equal=sum(r['population_items_equal'] for r in rows),
               population_nonempty=sum(1 for r in rows if r['population_blocks']),
               kept_changed=sum(r['kept_changed'] for r in rows))
    print('TOTALS', json.dumps(tot))


main()
```

Run:
```bash
mkdir -p "$SCRATCH/t3" && cd "$SCRATCH/t3"
python3 -u t3_verify.py b805d64f "$(git -C /home/siggi/dev/repos/namsbokasafn-efni rev-parse HEAD)" 2>&1 | tee t3.log | tail -5
```

### `t3_arcs.py`

```python
#!/usr/bin/env python3
"""Per-block ink fidelity of KEPT arc blocks, unchanged vs E, on real artwork.
Uses evidence/.../1a/fidelity.py (copied, re-pointed). Empty translations => every block kept."""
import json, os, shutil, subprocess, sys
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
REL = 'experiments/figure-text-translation'
T3 = Path(__file__).resolve().parent
ROOT = T3 / 'arcs'
INSTR = REPO / REL / 'evidence/2026-09-13-compose-fidelity/instruments/1a'
sys.path.insert(0, str(REPO / REL)); sys.path.insert(0, str(REPO / REL / 'pylibs'))
import figtext as FT
from blockkey import block_key

ROOT.mkdir(exist_ok=True)
(ROOT / 'tools').mkdir(exist_ok=True)
shutil.copy(INSTR / 'runexact_png.py', ROOT / 'tools' / 'runexact_png.py')
fid = (INSTR / 'fidelity.py').read_text().splitlines()
fid = [f"SP = Path('{ROOT}')" if l.startswith('SP = Path(') else l for l in fid]
(ROOT / 'fidelity.py').write_text('\n'.join(fid) + '\n')

env = dict(os.environ, FIGTEXT_PYLIBS=str(REPO / REL / 'pylibs'))
empty = ROOT / 'empty.json'
empty.write_text('{"blocks": {}}')
for b in sys.argv[1:]:
    src = json.loads(subprocess.run([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', b],
                     capture_output=True, text=True, env=env, cwd=str(T3 / 'head')).stdout)[b]['path']
    prep = ROOT / 'prep' / b
    shutil.rmtree(prep, ignore_errors=True)
    subprocess.run([sys.executable, 'figure-prepare.py', src, '--basename', b, '--out', str(prep)],
                   check=True, capture_output=True, env=env, cwd=str(T3 / 'head'))
    runs = json.loads((prep / 'runs.json').read_text())
    arcs = {block_key(x): len({r['size'] for r in x}) > 1
            for x in FT.merge_blocks(FT.group(runs)) if FT.is_arc(x)}
    print(b, 'arc blocks (key -> mixed sizes):', arcs)
    for side in ('base', 'head'):
        subprocess.run([sys.executable, 'compose.py', '--translations', str(empty)], check=True,
                       capture_output=True, env=dict(env, FIGTEXT_OUT=str(prep)), cwd=str(T3 / side))
        shutil.copy(prep / 'translated.png', ROOT / f'{b}.{side}.png')
    for side in ('base', 'head'):
        r = subprocess.run([sys.executable, str(ROOT / 'fidelity.py'), b, str(ROOT / f'{b}.{side}.png')],
                           capture_output=True, text=True, env=env, cwd=str(ROOT))
        assert r.returncode == 0, r.stderr[-800:]
        for line in r.stdout.splitlines()[:-1]:
            row = json.loads(line)
            if row['key'] in arcs:
                print(f"  {side:4} {row['key']!r:28} mixed={arcs[row['key']]} iou1={row.get('iou1')} "
                      f"c_no={row.get('c_no')} h_ratio={row.get('h_ratio')}")
```

Run (after the `uv pip install` / `PYTHONPATH` setup above):
```bash
cd "$SCRATCH/t3" && python3 -u t3_arcs.py CNX_Chem_14_03_corresp CNX_Chem_01_01_SciMethod 2>&1 | tee arcs.log
```

---

## Repo state

`git status --porcelain` in `/home/siggi/dev/repos/namsbokasafn-efni` was empty before this run,
between the two steps, and after — the only write to the repository is this file. No file under
`books/` was touched. No MT was called.
