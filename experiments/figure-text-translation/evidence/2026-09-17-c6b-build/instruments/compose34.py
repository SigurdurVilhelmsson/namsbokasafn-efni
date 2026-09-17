#!/usr/bin/env python3
"""Prepare + compose the 34 bought ch03/ch04 figures with a GIVEN composer tree. 0 ISK.

§C140 ⑥b COPY of evidence/2026-09-17-c6a-build/instruments/compose34.py. Two changes, nothing else:
  1. compose.py is run THROUGH compose_items.py (this folder), which executes the tree's UNMODIFIED
     compose.py with runpy and then writes <work>/items.json - the drawn ITEMS, one per <text>, in order.
  2. --prep-root: read (and, without --skip-prep, write) prep from this directory instead of <out>/prep,
     so an AFTER run composes from exactly the BEFORE run's preparation (⑥b changes no prepare code).

No MT, no tools/figure-run.js, nothing under books/ is written. Plain (uninstrumented) compose.py.

    python3 -u compose34.py --out <dir> [--tree <repo root>] [--only <b> ...] [--skip-prep]

  --tree       a REPOSITORY ROOT (default: /home/siggi/dev/repos/namsbokasafn-efni). The
               composer directory is <tree>/experiments/figure-text-translation;
               figure-prepare.py and compose.py are run FROM there (cwd = composer dir,
               FIGTEXT_PYLIBS = <composer dir>/pylibs).
  --out        output root. Writes <out>/prep/<b>/ (figure-prepare.py --out) and <out>/work/<b>/
               (compose.py with FIGTEXT_OUT; the six prep inputs are symlinked in from <out>/prep/<b>).
               <out>/rc.json holds {figure: {prep: rc, compose: rc}}.
  --only       restrict to these basenames (exocytosis still runs last if named).
  --skip-prep  reuse an existing <out>/prep/<b>/ (it must already hold the six inputs).

Per figure:
  source:  resolved with the TREE'S OWN sources.py (`resolve_detail`, precedence from the
           tree's figure-text.config.json, trees from the tree's sources.local.json), with a
           de-hash retry on a trailing `-xxxx` — exactly as
           evidence/2026-09-17-c4-build/instruments/prepare_corpus.py resolves it. A hole or a
           refusal SKIPS that figure's prep+compose (recorded, not fatal to the run).
  prep:    python3 -u figure-prepare.py <resolved source> --basename <b> --out <out>/prep/<b>
  compose: python3 -u compose.py --translations books/efnafraedi-2e/figure-text/<b>.is.json --svg
           env FIGTEXT_OUT=<out>/work/<b>  SOURCE_DATE_EPOCH=1700000000  PYTHONDONTWRITEBYTECODE=1
           (FIGTEXT_STIX_FONT is inherited from this process's own environment, if set)
           translated.png is deleted afterwards (it is not a prediction key; exocytosis's is large).

Sidecars (`--translations`) are ALWAYS read from the MAIN repository's
books/efnafraedi-2e/figure-text/, never from --tree — the sidecars are what was bought, and a
composer-only tree (a worktree at an older commit, holding no books/) has none of its own.

Terminal marker: the last stdout line is `DONE <n> figures prep_fail=<k> compose_fail=<m>`. Judge a
run by that line (a killed run prints none), never by a wrapper's exit code.
"""
import argparse, json, os, re, shutil, subprocess, sys, time
from pathlib import Path

sys.dont_write_bytecode = True
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
SIDECARS = REPO / 'books/efnafraedi-2e/figure-text'
LAST = 'CNX_Chem_03_01_exocytosis-88f6'
INPUTS = ('meta.json', 'runs.json', 'blocks.json', 'artwork.png', 'artwork.pdf', 'artwork.svg')
HASH_SUFFIX = re.compile(r'-[0-9a-f]{4}$')


def figure_names(only):
    ns = sorted(p.name[:-len('.is.json')] for p in SIDECARS.glob('*.is.json'))
    assert len(ns) == 34 and LAST in ns, f'expected 34 sidecars incl. exocytosis, found {len(ns)}'
    ns = [n for n in ns if n != LAST] + [LAST]
    if only:
        unknown = sorted(set(only) - set(ns))
        assert not unknown, f'--only names not among the 34: {unknown}'
        ns = [n for n in ns if n in only]
    return ns


def resolve_source(name, trees, cfg, S):
    """-> (path, status). Same shape as prepare_corpus.py's `lookup`: try the exact basename,
    then the de-hashed one (a trailing `-xxxx` the driver's naming adds and the delivery
    never has)."""
    for candidate in (name, HASH_SUFFIX.sub('', name)):
        d = S.resolve_detail(candidate, trees, cfg['editionPrecedence'],
                              superseded=cfg.get('supersededArtwork'))
        if d and d.get('path'):
            return d['path'], 'ok'
        if d and d.get('refused'):
            return None, f"refused:{d['refused']}"
    return None, 'unresolved'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--tree', default=str(REPO))
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', nargs='*', default=[])
    ap.add_argument('--skip-prep', action='store_true')
    ap.add_argument('--prep-root', default=None)
    a = ap.parse_args()
    tree = Path(a.tree).resolve()
    composer_dir = tree / 'experiments' / 'figure-text-translation'
    out = Path(a.out).resolve()
    for f in ('figure-prepare.py', 'compose.py'):
        assert (composer_dir / f).is_file(), f'{composer_dir}/{f} missing'

    # Import the TREE'S OWN sources.py, in the order that matters: FIGTEXT_PYLIBS must be in
    # THIS process's os.environ before `_deps` (which reads it at import time) is imported, and
    # `_deps` must be imported before `sources` (sources.py's own `import _deps` then hits the
    # already-cached module, so its sys.path additions — pikepdf, pdfplumber, pycairo, Pillow —
    # are the ones this composer_dir's pylibs/ provides, not some other tree's).
    os.environ.setdefault('FIGTEXT_PYLIBS', str(composer_dir / 'pylibs'))
    sys.path.insert(0, str(composer_dir))
    import _deps  # noqa: F401,E402
    import sources as S  # noqa: E402

    cfg = S.load_config()
    trees = S.load_trees('efnafraedi-2e', cfg)

    tmp = out / 'tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', SOURCE_DATE_EPOCH='1700000000', TMPDIR=str(tmp),
               FIGTEXT_PYLIBS=str(composer_dir / 'pylibs'))
    env.pop('FIGTEXT_OUT', None)
    rcpath = out / 'rc.json'
    rcs = json.loads(rcpath.read_text()) if rcpath.exists() else {}
    ns = figure_names(a.only)
    print(f'tree={tree} composer_dir={composer_dir} out={out} figures={len(ns)} '
          f'skip_prep={a.skip_prep}', flush=True)
    for b in ns:
        rc = rcs.setdefault(b, {})
        pd = (Path(a.prep_root).resolve() if a.prep_root else out / 'prep') / b
        if not a.skip_prep:
            shutil.rmtree(pd, ignore_errors=True)
            pd.mkdir(parents=True)
            src, status = resolve_source(b, trees, cfg, S)
            if src is None:
                rc['prep'] = None
                print(f'{b:40} prep    SKIPPED: source unresolved ({status})', flush=True)
                rc['compose'] = None
                print(f'{b:40} compose SKIPPED: no source', flush=True)
                rcpath.write_text(json.dumps(rcs, indent=1))
                continue
            t0 = time.perf_counter()
            p = subprocess.run([sys.executable, '-u', 'figure-prepare.py', src, '--basename', b, '--out', str(pd)],
                               capture_output=True, text=True, env=env, cwd=str(composer_dir), timeout=1800)
            (pd / 'prepare.stdout.txt').write_text(p.stdout)
            (pd / 'prepare.stderr.txt').write_text(p.stderr)
            rc['prep'] = p.returncode
            print(f'{b:40} prep    rc={p.returncode} secs={time.perf_counter() - t0:.1f}', flush=True)
        missing = [f for f in INPUTS if not (pd / f).is_file()]
        if missing:
            rc['compose'] = None
            print(f'{b:40} compose SKIPPED: prep inputs missing {missing}', flush=True)
            rcpath.write_text(json.dumps(rcs, indent=1))
            continue
        wd = out / 'work' / b
        shutil.rmtree(wd, ignore_errors=True)
        wd.mkdir(parents=True)
        for f in INPUTS:
            (wd / f).symlink_to(pd / f)
        t0 = time.perf_counter()
        p = subprocess.run([sys.executable, '-u', str(Path(__file__).resolve().parent / 'compose_items.py'), str(composer_dir / 'compose.py'), '--translations', str(SIDECARS / f'{b}.is.json'),
                            '--svg'], capture_output=True, text=True, env=dict(env, FIGTEXT_OUT=str(wd)),
                           cwd=str(composer_dir), timeout=1800)
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
