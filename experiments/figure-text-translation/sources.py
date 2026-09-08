#!/usr/bin/env python3
"""Resolve a figure basename to its authoritative source file.

    FIGTEXT_PYLIBS=./pylibs python3 sources.py [--json] <book> [basename ...]

The OpenStax delivery is TWO trees: every 1st-edition image, and a second tree
holding ONLY the images updated or added for the 2nd edition. A figure present in
the updates tree MUST be taken from there. Sourcing a superseded illustration is
invisible in the output - it is a correct-looking translation of the wrong picture -
which is why this precedence is code with a test, not a note in a README.

Precedence comes from figure-text.config.json; local paths from sources.local.json.
"""
import sys, json
from pathlib import Path
import _deps
from _deps import HERE

# Formats we can extract live text from, best first. EPS is converted to PDF by
# ghostscript before extraction (see README).
SOURCE_EXTS = ('.pdf', '.eps', '.ai')


def load_config():
    return json.loads((HERE / 'figure-text.config.json').read_text())


def load_trees(book, cfg=None):
    cfg = cfg or load_config()
    local = HERE / cfg['sourceTreesFile']
    if not local.exists():
        raise SystemExit(
            f"{local.name} not found. Copy {local.name}.example and fill in the tree paths."
        )
    trees = json.loads(local.read_text()).get(book)
    if not trees:
        raise SystemExit(f"No source trees configured for book {book!r} in {local.name}.")
    return trees


def resolve(basename, trees, precedence, exts=SOURCE_EXTS):
    """-> (Path, edition_key) for the authoritative source, or (None, None).

    Precedence is over EDITIONS first, then over formats within an edition: a
    2nd-edition EPS beats a 1st-edition PDF, because the edition is a question of
    WHICH PICTURE and the format only of how we read it.
    """
    for key in precedence:
        root = trees.get(key)
        if not root:
            # NOT configured for this book. A book that legitimately has one tree must
            # still resolve, so this one falls through — unlike the case below.
            continue
        root = Path(root).expanduser()
        if not root.is_dir():
            # CONFIGURED but ABSENT. Falling through here is the exact failure this
            # module exists to prevent: with 'updates-2e' unmounted every figure
            # silently resolves to its superseded 1st-edition artwork, and the output
            # is a correct-looking translation of the wrong picture. Nothing downstream
            # can see it — the file resolves, reads, composes and publishes.
            # SystemExit, not a caught exception: it is BaseException, so a per-figure
            # `except Exception` in a batch loop cannot swallow it into a skip.
            raise SystemExit(
                f"Source tree {key!r} is configured for this book but is not a "
                f"directory: {root}\n"
                f"  Refusing to resolve {basename!r} — falling back to a lower-precedence "
                f"tree would silently source superseded artwork.\n"
                f"  Mount the tree, or remove {key!r} from sources.local.json if it is "
                f"genuinely gone."
            )
        for ext in exts:
            for cand in root.rglob(basename + ext):
                return cand, key
    return None, None


def resolve_report(names, trees, precedence, exts=SOURCE_EXTS):
    """-> {name: {'path': str, 'edition': key} or None}, for a machine caller.

    The JSON half of this tool's CLI, kept as a pure function so it can be tested against
    temporary trees like `resolve` itself. `None` is a per-figure FACT — the artwork
    delivery has a hole here — and deliberately NOT an exit code: `tools/figure-run.js`
    tallies it as the `unresolved` outcome, which [USER] ruling R9 says is counted and
    named but never fails a run.

    ⚠️ A configured-but-unmounted tree still raises SystemExit out of `resolve`, and that
    MUST keep travelling: it is the difference between "this figure is missing" and "every
    figure is about to silently resolve to superseded artwork".
    """
    out = {}
    for n in names:
        p, key = resolve(n, trees, precedence, exts)
        out[n] = {'path': str(p), 'edition': key} if p else None
    return out


def main(book, names):
    cfg = load_config()
    trees = load_trees(book, cfg)
    prec = cfg['editionPrecedence']
    missing = 0
    for n in names:
        p, key = resolve(n, trees, prec)
        if p:
            print(f"  {key:14} {n:36} {p}")
        else:
            missing += 1
            print(f"  {'NOT FOUND':14} {n:36} -")
    if missing:
        print(f"\n  {missing} of {len(names)} not found in any configured tree")
    return 1 if missing else 0


if __name__ == '__main__':
    argv = sys.argv[1:]
    as_json = bool(argv) and argv[0] == '--json'
    if as_json:
        argv = argv[1:]
    if len(argv) < 2:
        sys.exit(__doc__)
    if as_json:
        cfg = load_config()
        trees = load_trees(argv[0], cfg)
        report = resolve_report(argv[1:], trees, cfg['editionPrecedence'])
        print(json.dumps(report, ensure_ascii=False))
        # Exit 0 even when names went unresolved: see resolve_report's docstring. A
        # non-zero exit here is reserved for a failure of the RESOLVER, which the caller
        # must treat as fatal.
        sys.exit(0)
    sys.exit(main(argv[0], argv[1:]))
