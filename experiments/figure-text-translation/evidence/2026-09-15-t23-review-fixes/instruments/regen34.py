#!/usr/bin/env python3
"""Prepare + compose the 34 bought ch03/ch04 figures with a GIVEN composer tree. 0 ISK.

No MT, no tools/figure-run.js, nothing under books/ is written. Plain (uninstrumented) compose.py.

    python3 -u regen34.py --out <dir> [--tree <composer dir>] [--only <b> ...] [--skip-prep]

  --tree       composer directory (default: the repository's experiments/figure-text-translation).
               figure-prepare.py and compose.py are run FROM this directory (cwd = tree,
               FIGTEXT_PYLIBS = <tree>/pylibs).
  --out        output root. Writes <out>/prep/<b>/ (figure-prepare.py --out) and <out>/work/<b>/
               (compose.py with FIGTEXT_OUT; the six prep inputs are symlinked in from <out>/prep/<b>).
               <out>/rc.json holds {figure: {prep: rc, compose: rc}}.
  --only       restrict to these basenames (exocytosis still runs last if named).
  --skip-prep  reuse an existing <out>/prep/<b>/ (it must already hold the six inputs).

Per figure:
  prep:    python3 -u figure-prepare.py <source> --basename <b> --out <out>/prep/<b>
           (<source> = /home/siggi/dev/scratch-c140/prep/sources.json [b].record.path, exactly as
           /home/siggi/dev/scratch-c140/fix2/integrated/regen.py prep() reads it)
  compose: python3 -u compose.py --translations books/efnafraedi-2e/figure-text/<b>.is.json --svg
           env FIGTEXT_OUT=<out>/work/<b>  SOURCE_DATE_EPOCH=1700000000  PYTHONDONTWRITEBYTECODE=1
           translated.png is deleted afterwards (it is not a prediction key; exocytosis's is large).

Terminal marker: the last stdout line is `DONE <n> figures prep_fail=<k> compose_fail=<m>`. Judge a run
by that line (a killed run prints none), never by a wrapper's exit code.
"""
import argparse, json, os, shutil, subprocess, sys, time
from pathlib import Path

sys.dont_write_bytecode = True
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
SOURCES = Path('/home/siggi/dev/scratch-c140/prep/sources.json')
SIDECARS = REPO / 'books/efnafraedi-2e/figure-text'
LAST = 'CNX_Chem_03_01_exocytosis-88f6'
INPUTS = ('meta.json', 'runs.json', 'blocks.json', 'artwork.png', 'artwork.pdf', 'artwork.svg')


def figure_names(only):
    ns = sorted(p.name[:-len('.is.json')] for p in SIDECARS.glob('*.is.json'))
    assert len(ns) == 34 and LAST in ns, f'expected 34 sidecars incl. exocytosis, found {len(ns)}'
    ns = [n for n in ns if n != LAST] + [LAST]
    if only:
        unknown = sorted(set(only) - set(ns))
        assert not unknown, f'--only names not among the 34: {unknown}'
        ns = [n for n in ns if n in only]
    return ns


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--tree', default=str(REPO / 'experiments/figure-text-translation'))
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', nargs='*', default=[])
    ap.add_argument('--skip-prep', action='store_true')
    a = ap.parse_args()
    tree = Path(a.tree).resolve()
    out = Path(a.out).resolve()
    for f in ('figure-prepare.py', 'compose.py'):
        assert (tree / f).is_file(), f'{tree}/{f} missing'
    sources = json.loads(SOURCES.read_text())
    tmp = out / 'tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', SOURCE_DATE_EPOCH='1700000000', TMPDIR=str(tmp),
               FIGTEXT_PYLIBS=str(tree / 'pylibs'))
    env.pop('FIGTEXT_OUT', None)
    rcpath = out / 'rc.json'
    rcs = json.loads(rcpath.read_text()) if rcpath.exists() else {}
    ns = figure_names(a.only)
    print(f'tree={tree} out={out} figures={len(ns)} skip_prep={a.skip_prep}', flush=True)
    for b in ns:
        rc = rcs.setdefault(b, {})
        pd = out / 'prep' / b
        if not a.skip_prep:
            shutil.rmtree(pd, ignore_errors=True)
            pd.mkdir(parents=True)
            src = sources[b]['record']['path']
            t0 = time.perf_counter()
            p = subprocess.run([sys.executable, '-u', 'figure-prepare.py', src, '--basename', b, '--out', str(pd)],
                               capture_output=True, text=True, env=env, cwd=str(tree), timeout=1800)
            (pd / 'prepare.stdout.txt').write_text(p.stdout)
            (pd / 'prepare.stderr.txt').write_text(p.stderr)
            rc['prep'] = p.returncode
            print(f'{b:40} prep    rc={p.returncode} secs={time.perf_counter() - t0:.1f}', flush=True)
        missing = [f for f in INPUTS if not (pd / f).is_file()]
        if missing:
            rc['compose'] = None
            print(f'{b:40} compose SKIPPED: prep inputs missing {missing}', flush=True)
            continue
        wd = out / 'work' / b
        shutil.rmtree(wd, ignore_errors=True)
        wd.mkdir(parents=True)
        for f in INPUTS:
            (wd / f).symlink_to(pd / f)
        t0 = time.perf_counter()
        p = subprocess.run([sys.executable, '-u', 'compose.py', '--translations', str(SIDECARS / f'{b}.is.json'),
                            '--svg'], capture_output=True, text=True, env=dict(env, FIGTEXT_OUT=str(wd)),
                           cwd=str(tree), timeout=1800)
        (wd / 'compose.stdout.txt').write_text(p.stdout)
        (wd / 'compose.stderr.txt').write_text(p.stderr)
        (wd / 'translated.png').unlink(missing_ok=True)
        rc['compose'] = p.returncode
        print(f'{b:40} compose rc={p.returncode} secs={time.perf_counter() - t0:.1f}', flush=True)
        rcpath.write_text(json.dumps(rcs, indent=1))
    rcpath.write_text(json.dumps(rcs, indent=1))
    pf = sum(1 for b in ns if not a.skip_prep and rcs[b].get('prep') != 0)
    cf = sum(1 for b in ns if rcs[b].get('compose') != 0)
    print(f'DONE {len(ns)} figures prep_fail={pf} compose_fail={cf}', flush=True)


if __name__ == '__main__':
    main()
