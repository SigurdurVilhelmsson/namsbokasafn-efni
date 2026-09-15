#!/usr/bin/env python3
"""Compose the 34 bought figures with the FINAL scratch build (stage C) and dump what the frozen r2
instruments read. 0 ISK: compose.py only, no MT, nothing written outside plan/pred2.

    PYTHONDONTWRITEBYTECODE=1 python3 -u run_final.py [TREE [TAG]]     (defaults: plan/tree-fix  FINAL)

TREE may be ANY copy of experiments/figure-text-translation (e.g. a scratch copy of the repository implementation):
the three patch anchors must each occur exactly once in its compose.py or the run refuses. Only TAG == FINAL is
compared against c-fix/rd/C (the fix round's stage-C realdata run of fixsnap/C == tree-fix) and against
plan/pred/work/FINAL (the PREVIOUS prediction build, tree-int stage C).

1. Copy tree-fix (cmp-equal to fixsnap/C on compose/figlayout/figcontainers/figscripts/numloc/figtext/svgout/blockkey)
   to plan/pred2/inst-C and apply the SAME two ITEMS patches as c-fix/rd/realdata.py (the E plan's
   _TagList block tag + `styled`), plus ONE DIAG patch that dumps the Layout and container per laid-out
   block. Every anchor asserted to occur exactly once. The DIAG patch reads variables only; it never
   touches ITEMS, so items.json must be byte-equal to c-fix/rd/C/<b>/items.json (checked below).
2. For each figure, ONE at a time: symlink prep's inputs into plan/pred2/work/FINAL/<b>/ and run the
   instrumented compose.py --translations <committed sidecar> --svg (as realdata.py did).
3. Controls: items.json and compose-report.json byte-equal to c-fix/rd/C 34/34; the diag's
   realdata fields equal c-fix/rd/C's diag rows 34/34. Recorded, not asserted: items/report byte-equal to
   plan/pred/work/FINAL (the previous build) - compare_prev.py names every difference by block.
"""
import json, os, shutil, subprocess, sys, time
from pathlib import Path

sys.dont_write_bytecode = True
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
SNAP = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path('/home/siggi/dev/scratch-c140/plan/tree-fix')   # PRED2 ADAPTATION B2
TAGNAME = sys.argv[2] if len(sys.argv) > 2 else 'FINAL'
INTC = Path('/home/siggi/dev/scratch-c140/plan/c-fix/rd/C')   # PRED2 ADAPTATION B2: the fix round's stage-C realdata run
PREVF = Path('/home/siggi/dev/scratch-c140/plan/pred/work/FINAL')   # PRED2: the previous prediction build
PREP = Path('/home/siggi/dev/scratch-c140/prep/figs')
SIDECARS = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
LAST = 'CNX_Chem_03_01_exocytosis-88f6'
inst = PRED / ('inst-C' if TAGNAME == 'FINAL' else f'inst-{TAGNAME}')
out_root = PRED / 'work' / TAGNAME

if inst.exists():
    shutil.rmtree(inst)
shutil.copytree(SNAP, inst, symlinks=True, ignore=shutil.ignore_patterns('__pycache__', 'out', 'diffs*', 'stages', 'START.marker'))
src = (inst / 'compose.py').read_text()
TAG = '''
class _TagList(list):
    """Instrument: every drawn item carries the index of the block being drawn."""
    def append(self, it):
        super().append(dict(it, block=globals().get('BI')))
DIAG = []
'''
REP = ('\n    report.append(f"  {align:6} {sz0}->{size:.2f}pt  {key!r}  '
       '[{container[\'cls\']} {layout[\'step\']}]")')
# HAZARD for a TREE other than snap/C: the DIAG row reads compose.py's translated-path LOCALS by name - BI, key,
# container, layout, cues, ls, sz0, rot, width - and Layout keys beyond the fixed interface only through .get()
# (widths falls back to the caller's own width function, identical values). A renamed local passes the anchor
# check and then dies with NameError mid-run: that is an instrument failure, not a prediction miss.
# realdata.py's DIAG fields verbatim, then the fields measure.py / sentinels.py / analyse.py read
# (sz, rot, drawn_widths, r2) and the rest of the Layout + the container, for delta attribution.
DIAG_ROW = ('\n    DIAG.append(dict(block=BI, key=key, cls=container["cls"], why=container["why"], '
            'align=layout["align"], align_why=container.get("align_why"), step=layout["step"], '
            'size=layout["size"], sz0=sz0, n_lines=len(layout["lines"]), n_src=len(ls), '
            'overflow=layout["overflow"], bound=layout.get("bound"), heightFit=layout.get("heightFit"), '
            'lines=["".join(c for c, _ in l) for l in layout["lines"]], '
            'sz=layout["size"], rot=rot, drawn_widths=(layout.get("widths") or [width(lc, layout["size"], j) for j, lc in enumerate(layout["lines"])]), '
            'wrapped=["".join(c for c, _ in l) for l in layout["lines"]], '
            'x0=layout["x0"], top=layout["top"], lead=layout["lead"], anchor=layout["anchor"], budget=layout.get("budget"), '
            'cues=cues, container=container, '
            'r2=dict(cls=container["cls"], step=layout["step"], pad=2.0, floor=7.5, disp_pt=layout["disp"], '
            'vdisp_pt=layout["vdisp"], align=layout["align"], anchor=layout["anchor"], top=layout["top"], size=layout["size"])))')
patches = [('\nITEMS = []', TAG + '\nITEMS = _TagList()'),
           ('line=j, seg=k,', 'line=j, seg=k, styled=st is not None,'),
           (REP, DIAG_ROW + REP)]
for old, new in patches:
    n = src.count(old)
    assert n == 1, f'anchor occurs {n} times, need exactly 1: {old!r}'
    src = src.replace(old, new, 1)
src += "\n(OUT / 'items.json').write_text(json.dumps(ITEMS, ensure_ascii=False))\n"
src += "(OUT / 'diag.json').write_text(json.dumps(DIAG, ensure_ascii=False))\n"
(inst / 'compose.py').write_text(src)
for f in (('figlayout.py', 'figcontainers.py', 'figscripts.py', 'numloc.py', 'figtext.py', 'svgout.py', 'blockkey.py') if TAGNAME == 'FINAL' else ()):
    assert (inst / f).read_bytes() == (Path('/home/siggi/dev/scratch-c140/plan/tree-fix') / f).read_bytes(), f   # PRED2 ADAPTATION B2

names = sorted(p.name[:-len('.is.json')] for p in SIDECARS.glob('*.is.json'))
assert len(names) == 34 and LAST in names, len(names)
names = [n for n in names if n != LAST] + [LAST]
env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', FIGTEXT_PYLIBS=str(inst / 'pylibs'),
           SOURCE_DATE_EPOCH='1700000000')
res = {}
REALDATA_FIELDS = ('block', 'key', 'cls', 'why', 'align', 'align_why', 'step', 'size', 'sz0', 'n_lines', 'n_src',
                   'overflow', 'bound', 'heightFit', 'lines')
for b in names:
    d = out_root / b
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    for f in ('meta.json', 'runs.json', 'blocks.json', 'artwork.png', 'artwork.pdf', 'artwork.svg'):
        (d / f).symlink_to(PREP / b / f)
    t0 = time.perf_counter()
    p = subprocess.run([sys.executable, '-u', str(inst / 'compose.py'), '--translations',
                        str(SIDECARS / f'{b}.is.json'), '--svg'], capture_output=True, text=True,
                       env=dict(env, FIGTEXT_OUT=str(d)), cwd=str(inst), timeout=1800)
    (d / 'compose.stdout.txt').write_text(p.stdout)
    (d / 'compose.stderr.txt').write_text(p.stderr)
    r = dict(rc=p.returncode, secs=round(time.perf_counter() - t0, 2))
    if p.returncode == 0 and TAGNAME == 'FINAL':
        r['itemsByteEqualIntC'] = (d / 'items.json').read_bytes() == (INTC / b / 'items.json').read_bytes()
        r['reportByteEqualIntC'] = (d / 'compose-report.json').read_bytes() == (INTC / b / 'compose-report.json').read_bytes()
        r['itemsByteEqualPrev'] = (d / 'items.json').read_bytes() == (PREVF / b / 'items.json').read_bytes()
        r['reportByteEqualPrev'] = (d / 'compose-report.json').read_bytes() == (PREVF / b / 'compose-report.json').read_bytes()
        mine = json.loads((d / 'diag.json').read_text())
        theirs = json.loads((INTC / b / 'diag.json').read_text())
        r['diagRealdataFieldsEqual'] = [{k: m[k] for k in REALDATA_FIELDS} for m in mine] == theirs
        r['diagRows'] = len(mine)
    (d / 'translated.png').unlink(missing_ok=True)
    res[b] = r
    print(f'{b:40} {r}', flush=True)
(PRED / 'out' / f'run-{TAGNAME}.json').write_text(json.dumps(res, indent=1))
print('\nrc0', sum(r['rc'] == 0 for r in res.values()), '/', len(res),
      '| items byte-equal to c-fix/rd/C', sum(bool(r.get('itemsByteEqualIntC')) for r in res.values()),
      '| compose-report byte-equal', sum(bool(r.get('reportByteEqualIntC')) for r in res.values()),
      '| diag realdata fields equal', sum(bool(r.get('diagRealdataFieldsEqual')) for r in res.values()),
      '| diag rows', sum(r.get('diagRows', 0) for r in res.values()),
      '| items byte-equal to PREVIOUS build', sum(bool(r.get('itemsByteEqualPrev')) for r in res.values()),
      '| report byte-equal to PREVIOUS build', sum(bool(r.get('reportByteEqualPrev')) for r in res.values()))
