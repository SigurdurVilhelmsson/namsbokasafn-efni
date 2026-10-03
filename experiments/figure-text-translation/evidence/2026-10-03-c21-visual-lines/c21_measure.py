#!/usr/bin/env python3
"""§C140 ㉑ - the 0-ISK before/after measurement of the visual line count, over COMMITTED sidecars.

    python3 -u c21_measure.py prepare --data DIR --tree BASE_TREE
    python3 -u c21_measure.py arm     --data DIR --name before --tree BASE_TREE
    python3 -u c21_measure.py arm     --data DIR --name before2 --tree BASE_TREE --only CNX_Chem_14_03_corresp
    python3 -u c21_measure.py arm     --data DIR --name after  --tree AFTER_TREE
    python3 -u c21_measure.py compare --data DIR

No money path: nothing here imports or spawns tools/figure-run.js, translate-blocks.mjs or
tools/publish-figure-svg.js. `prepare` runs figure-prepare.py on each figure's resolved artwork into
DIR/prep/<basename>; `arm` copies that directory to DIR/<name>/<basename> and runs the given tree's
compose.py IN-PROCESS on it, with the figure's committed sidecar as --translations - exactly the
input tools/figure-run.js hands figure-compose.py on a recompose - recording every figlayout.decide
call (block key, n_src, the drawn lines, size, anchor, top). Nothing is written outside DIR.

THE PREDICTION (design spec 2026-10-02 D3; register §C140 ㉑), registered before the run:
  * exactly 4 laid-out blocks in 2 figures change, each to ONE drawn line with n_src 1 -
    Nitrogen 'ammonium (NH4|+|)', 'nitrites (NO2|–', 'nitrates (NO3|–' and conjugate_img
    'NH4|+ (conjugate acid)';
  * every other decide record is identical by value, in all 27 figures;
  * every figure's run-exact <text> elements are identical, and every figure but those 2 has a
    byte-identical translated.svg.
Anything else is a FINDING to report, never a threshold to tune.

CONTROLS: `before2` re-runs the base composer on one figure, whose SVG must be byte-identical to
`before`'s - the determinism control that makes a byte comparison mean anything; it is part of the
VERDICT. `before` should also reproduce each figure's COMMITTED media/<b>_IS.svg <text> elements (the
copy the pass will replace) - the positive control that the arm runs the real composer on the real
inputs. It is reported on its own BASELINE line, not in the VERDICT: a miss there is a figure the '5'
pass will change for a reason OUTSIDE ㉑, which is a finding for the pass, not a defect of ㉑.
"""
import argparse
import json
import os
import re
import runpy
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# evidence/<this dir>/c21_measure.py -> the repository root, four levels up from this directory.
REPO = Path(os.environ.get('C21_REPO') or HERE.parents[3])
FTT = REPO / 'experiments' / 'figure-text-translation'
BOOK = REPO / 'books' / 'efnafraedi-2e'
PYLIBS = FTT / 'pylibs'

# The 13 rule-A figures with a sidecar (CNX_Chem_07_04_Ques11ans_img, the 14th, is retired and has none).
RULE_A = ['CNX_Chem_00_HH_chemform1_img', 'CNX_Chem_00_HH_chemform3_img', 'CNX_Chem_00_HH_chemform4_img',
          'CNX_Chem_00_HH_chemform9_img', 'CNX_Chem_11_05_detrg', 'CNX_Chem_13_00_Blood',
          'CNX_Chem_14_01_conjugate_img', 'CNX_Chem_14_03_ICETable3_img', 'CNX_Chem_14_03_ICETable5_img',
          'CNX_Chem_14_03_corresp', 'CNX_Chem_14_03_strengths', 'CNX_Chem_14_05_ICETable1_img',
          'CNX_Chem_18_07_Nitrogen']
# The DISCRIMINATING control: sidecar figures whose only rule-A merges are in KEPT blocks - the population
# that moves if the merge leaks into figcontainers.line_frames (sibling cues, free-box obstacles).
KEPT_MERGE = ['CNX_Chem_10_06_CbcCltPckd', 'CNX_Chem_11_05_soap', 'CNX_Chem_13_04_ICETable2_img',
              'CNX_Chem_14_01_NH3_img', 'CNX_Chem_14_03_FishLemon', 'CNX_Chem_14_06_ICETable16_img',
              'CNX_Chem_14_06_buffer', 'CNX_Chem_15_01_ICETable2_img', 'CNX_Chem_15_02_ICETable1_img',
              'CNX_Chem_17_02_Galvanicel', 'CNX_Chem_19_02_BalEnt']
# Three of the 34 originally bought figures (open, cell and box labels; code1-exposure A 0, B 0).
BOUGHT34 = ['CNX_Chem_04_01_rxn2', 'CNX_Chem_03_01_glycinemass_img', 'CNX_Chem_04_03_flowchart']
FIGURES = RULE_A + KEPT_MERGE + BOUGHT34
PREDICTED = {('CNX_Chem_18_07_Nitrogen', 'ammonium (NH4|+|)'), ('CNX_Chem_18_07_Nitrogen', 'nitrites (NO2|–'),
             ('CNX_Chem_18_07_Nitrogen', 'nitrates (NO3|–'), ('CNX_Chem_14_01_conjugate_img', 'NH4|+ (conjugate acid)')}


def child_env():
    return dict(os.environ, FIGTEXT_PYLIBS=str(PYLIBS), PYTHONDONTWRITEBYTECODE='1',
                SOURCE_DATE_EPOCH='1700000000')


def cmd_prepare(a):
    """Resolve with the WORKING tree's sources.py (config + sources.local.json), prepare with TREE's
    figure-prepare.py: both arms then compose the SAME prepared inputs, so only the composer differs."""
    data, tree = Path(a.data), Path(a.tree).resolve()
    (data / 'prep').mkdir(parents=True, exist_ok=True)
    r = subprocess.run([sys.executable, str(FTT / 'sources.py'), '--json', 'efnafraedi-2e'] + FIGURES,
                       capture_output=True, text=True, cwd=str(FTT), env=child_env())
    if r.returncode != 0:
        sys.exit(f'sources.py exited {r.returncode}: {r.stderr[-400:]}')
    res = json.loads(r.stdout)
    for b in FIGURES:
        path = (res.get(b) or {}).get('path')
        if not path:
            sys.exit(f'{b} does not resolve: {res.get(b)!r}')
        out = data / 'prep' / b
        if (out / 'prepare.json').exists():
            print(f'prepared already  {b}', flush=True)
            continue
        p = subprocess.run([sys.executable, str(tree / 'figure-prepare.py'), path, '--basename', b,
                            '--out', str(out)], capture_output=True, text=True, cwd=str(tree), env=child_env())
        if p.returncode != 0:
            sys.exit(f'figure-prepare.py exited {p.returncode} on {b}: {p.stderr[-400:]}')
        (out / f'{b}.pdf').unlink(missing_ok=True)       # the staged artwork copy; compose never reads it
        print(f'prepared  {b}  <- {path}', flush=True)
    print('PREPARE DONE', flush=True)


def cmd_arm(a):
    data, tree = Path(a.data), Path(a.tree).resolve()
    if not (tree / 'compose.py').exists():
        sys.exit(f'no compose.py in {tree}')
    for b in ([a.only] if a.only else FIGURES):
        src, out = data / 'prep' / b, data / a.name / b
        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(src, out)
        sidecar = BOOK / 'figure-text' / f'{b}.is.json'
        t = subprocess.run([sys.executable, '-u', str(Path(__file__).resolve()), 'trace', str(tree), str(out),
                            str(sidecar)], capture_output=True, text=True, env=child_env())
        (out / 'c21-compose.log').write_text(t.stdout + t.stderr)
        if t.returncode != 0 or not (out / 'c21-trace.json').exists():
            sys.exit(f'{a.name}: compose failed on {b} (exit {t.returncode}): {t.stderr[-600:]}')
        print(f'{a.name}  {b}  {len(json.loads((out / "c21-trace.json").read_text()))} laid-out blocks', flush=True)
    print(f'ARM {a.name} DONE', flush=True)


def cmd_trace(a):
    """Run TREE/compose.py in THIS process (its own figlayout, patched), on OUT with SIDECAR."""
    tree, out, sidecar = Path(a.tree), Path(a.out), a.sidecar
    os.environ['FIGTEXT_OUT'] = str(out)                 # before _deps is imported - it binds by value
    sys.path.insert(0, str(PYLIBS))
    sys.path.insert(0, str(tree))
    import figlayout
    orig = figlayout.decide
    rec = []

    def decide(words, width, container, cues, *args, **kw):
        lay = orig(words, width, container, cues, *args, **kw)
        g = sys._getframe(1).f_globals                   # compose.py's module frame: its loop variables
        rec.append(dict(block=g['BI'], key=g['key'], n_src=cues['n_src'], starts=cues['starts'],
                        ends=cues['ends'], projs=cues['projs'], cls=container.get('cls'),
                        align=lay['align'], step=lay['step'], size=lay['size'], anchor=lay['anchor'],
                        top=lay['top'], x0=lay['x0'],
                        lines=[''.join(ch for ch, _ in l) for l in lay['lines']]))
        return lay

    figlayout.decide = decide
    sys.argv = [str(tree / 'compose.py'), '--translations', sidecar, '--svg']
    runpy.run_path(str(tree / 'compose.py'), run_name='__main__')
    (out / 'c21-trace.json').write_text(json.dumps(rec, ensure_ascii=False, indent=1))


def text_elements(svg):
    return re.findall(r'<text [^>]*>[^<]*</text>', svg)


def cmd_compare(a):
    data = Path(a.data)
    changed, other_diffs, notes = set(), [], []
    det_ok = None
    for b in FIGURES:
        tb = json.loads((data / 'before' / b / 'c21-trace.json').read_text())
        ta = json.loads((data / 'after' / b / 'c21-trace.json').read_text())
        sb = (data / 'before' / b / 'translated.svg').read_text(encoding='utf-8')
        sa = (data / 'after' / b / 'translated.svg').read_text(encoding='utf-8')
        committed = (BOOK / 'media' / f'{b}_IS.svg').read_text(encoding='utf-8')
        pos = text_elements(sb) == text_elements(committed)
        if not pos:
            notes.append(f'POSITIVE CONTROL MISSED {b}: before <text> != committed _IS.svg <text>')
        if [r['key'] for r in tb] != [r['key'] for r in ta]:
            other_diffs.append(f'{b}: the laid-out key sequence differs')
            continue
        for rb, ra in zip(tb, ta):
            if rb != ra:
                changed.add((b, rb['key']))
                print(f"CHANGED {b} {rb['key']!r}: n_src {rb['n_src']}->{ra['n_src']}  lines {rb['lines']}"
                      f" -> {ra['lines']}  [{rb['cls']} {rb['step']} {rb['size']}] -> [{ra['cls']} {ra['step']}"
                      f" {ra['size']}]  top {rb['top']:.3f}->{ra['top']:.3f}  align {rb['align']}->{ra['align']}", flush=True)
        kb = [e for e in text_elements(sb) if 'font-kerning:none' not in e]
        ka = [e for e in text_elements(sa) if 'font-kerning:none' not in e]
        if kb != ka:
            other_diffs.append(f'{b}: run-exact <text> elements differ')
        same_bytes = sb == sa
        if b not in {f for f, _ in PREDICTED} and not same_bytes:
            other_diffs.append(f'{b}: translated.svg is not byte-identical')
        print(f"{b}: laid-out {len(tb)}  positive-control {'ok' if pos else 'MISSED'}  "
              f"svg {'identical' if same_bytes else 'differs'}", flush=True)
    d2 = data / 'before2'
    for b in (sorted(p.name for p in d2.iterdir()) if d2.exists() else []):
        det_ok = (d2 / b / 'translated.svg').read_bytes() == (data / 'before' / b / 'translated.svg').read_bytes()
        print(f'DETERMINISM {b}: before2 svg {"byte-identical" if det_ok else "DIFFERS"} to before', flush=True)
    for n in notes:
        print(n, flush=True)
    for d in other_diffs:
        print('UNPREDICTED', d, flush=True)
    for b, k in sorted(changed - PREDICTED):
        print('UNPREDICTED change', b, repr(k), flush=True)
    for b, k in sorted(PREDICTED - changed):
        print('PREDICTED but unchanged', b, repr(k), flush=True)
    after_ok = all(r['n_src'] == 1 and len(r['lines']) == 1
                   for b in {f for f, _ in PREDICTED}
                   for r in json.loads((data / 'after' / b / 'c21-trace.json').read_text())
                   if (b, r['key']) in PREDICTED)
    print(f'BASELINE before reproduces the committed _IS.svg <text> for {len(FIGURES) - len(notes)} of '
          f'{len(FIGURES)} figures', flush=True)
    ok = (changed == PREDICTED and not other_diffs and after_ok and det_ok is True)
    print(f"VERDICT {'PREDICTION HELD' if ok else 'PREDICTION FAILED'}: changed {len(changed)} "
          f"(predicted {len(PREDICTED)}), unpredicted {len(other_diffs) + len(changed - PREDICTED)}, "
          f"determinism {det_ok}, predicted-to-one-line {after_ok}",
          flush=True)
    sys.exit(0 if ok else 1)


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('prepare'); p.add_argument('--data', required=True); p.add_argument('--tree', required=True)
    p = sp.add_parser('arm'); p.add_argument('--data', required=True); p.add_argument('--name', required=True)
    p.add_argument('--tree', required=True); p.add_argument('--only')
    p = sp.add_parser('trace'); p.add_argument('tree'); p.add_argument('out'); p.add_argument('sidecar')
    p = sp.add_parser('compare'); p.add_argument('--data', required=True)
    a = ap.parse_args()
    {'prepare': cmd_prepare, 'arm': cmd_arm, 'trace': cmd_trace, 'compare': cmd_compare}[a.cmd](a)


if __name__ == '__main__':
    main()
