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
import sys, json, re, struct
from pathlib import Path
import _deps
from _deps import HERE

# Formats we can extract live text from, best first. EPS is converted to PDF by
# ghostscript before extraction (see README).
SOURCE_EXTS = ('.pdf', '.eps', '.ai')


def load_config():
    return json.loads((HERE / 'figure-text.config.json').read_text())


# §C140 ⑦. A resolved artwork whose page box is a standard paper size, in either orientation, is a
# production page — a placement or dialogue SHEET — not a figure. Measured 2026-09-16 over 910
# resolved artworks: exactly 2 (rvosmosis, N2O5; both Letter), still 2 at ±10 pt; the next
# largest is 468×576 pt. Aspect ratio, creator and embedded-raster size were measured and rejected
# (evidence/2026-09-16-c7-explore/README.md).
# 🔴 THE TABLE LIVES IN figure-text.config.json (`paperSizes`, `paperTolerancePt`) AND ONLY THERE:
# tools/figure-run.js reads the same keys to name a live translated copy whose viewBox is a whole
# sheet, so a size written here as a literal would be a second copy free to drift from the first.
_CONFIG = load_config()
PAPER_SIZES = {name: (float(w), float(h)) for name, (w, h) in _CONFIG['paperSizes'].items()}
PAPER_TOL_PT = float(_CONFIG['paperTolerancePt'])
_BBOX = rb'%%{}:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)'


def _eps_size(path):
    with open(path, 'rb') as fh:
        head = fh.read(4)
        offset, length = 0, 65536
        if head == b'\xc5\xd0\xd3\xc6':         # DOS EPS: PostScript offset + length follow
            offset, length = struct.unpack('<II', fh.read(8))
        fh.seek(offset)
        data = fh.read(min(length, 65536))
    m = (re.search(_BBOX.replace(b'{}', b'HiResBoundingBox'), data)
         or re.search(_BBOX.replace(b'{}', b'BoundingBox'), data))
    if not m:
        return None
    x0, y0, x1, y1 = (float(v) for v in m.groups())
    return (round(abs(x1 - x0), 2), round(abs(y1 - y0), 2))


def page_size(path):
    """-> (w, h) in points, or None when the size cannot be read. PDF and PDF-compatible AI:
    the first page's CropBox (MediaBox when absent); EPS, and an AI pikepdf cannot open:
    %%HiResBoundingBox, else %%BoundingBox."""
    path = Path(path)
    if path.suffix.lower() in ('.pdf', '.ai'):
        try:
            import pikepdf
            with pikepdf.open(str(path)) as pdf:
                box = [float(v) for v in pikepdf.Page(pdf.pages[0]).cropbox]
            return (round(abs(box[2] - box[0]), 2), round(abs(box[3] - box[1]), 2))
        except Exception:                          # noqa: BLE001 — an unreadable size is None
            if path.suffix.lower() == '.pdf':
                return None
    # 🔴 UNREADABLE MEANS None, WHATEVER THE BYTES DO. A truncated DOS-EPS header makes
    # `struct.unpack` raise `struct.error`, and a `%%BoundingBox` number `float()` rejects
    # (`612.0.1`: `[-\d.]+` matches it) raises ValueError. Either escaping would abort
    # `resolve_report` — and with it the driver's whole chapter — over one bad file, where the
    # contract is that the figure resolves and is flagged `pageUnknown`.
    try:
        return _eps_size(path)
    except (OSError, struct.error, ValueError):
        return None


def paper_size_name(size):
    """-> the PAPER_SIZES name `size` matches in either orientation within PAPER_TOL_PT, or None."""
    if not size:
        return None
    w, h = size
    for name, (pw, ph) in PAPER_SIZES.items():
        if ((abs(w - pw) <= PAPER_TOL_PT and abs(h - ph) <= PAPER_TOL_PT)
                or (abs(w - ph) <= PAPER_TOL_PT and abs(h - pw) <= PAPER_TOL_PT)):
            return name
    return None


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


# Our own translated output lives inside the delivery tree. It must never be
# sourced back in as input, and the fuzzy pass below is what would otherwise
# make that possible.
_OWN_OUTPUT_DIRS = {'Translated_IS'}

# 🔴 NO MODULE-LEVEL CACHE, AND THAT IS DELIBERATE. A memo that outlives the call
# cannot see a tree that changed under it, and the first version of this code was
# caught by exactly that: an empty index cached for the updates tree, then a file
# added, then a resolve that returned the SUPERSEDED first-edition artwork with
# every appearance of success. The memo is therefore CALL-SCOPED — `resolve_report`
# passes one shared dict so a batch builds each tree once (0.17s over both real
# trees, ~2.7k vector files), and a lone `resolve` gets a fresh one.


def _normkey(stem):
    """Fold the differences a hand-assembled delivery actually contains.

    🔴 CASE AND PUNCTUATION ONLY. It must NOT strip an `_img` suffix:
    CNX_Chem_08_02_sp3d and CNX_Chem_08_02_sp3d_img are two DIFFERENT figures in
    this corpus, and folding them would silently publish one in place of the
    other — a correct-looking translation of the wrong picture, which is the
    failure this whole module exists to prevent.
    """
    return ''.join(c for c in stem.lower() if c.isalnum())


def _norm_index(root, exts, memo):
    key = (str(root), exts)
    hit = memo.get(key)
    if hit is not None:
        return hit
    idx = {}
    for path in root.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in exts:
            continue
        if _OWN_OUTPUT_DIRS.intersection(path.parts):
            continue
        idx.setdefault(_normkey(path.stem), []).append(path)
    # Stable within a key so an ambiguous set is reported identically every run.
    for v in idx.values():
        v.sort(key=lambda q: (exts.index(q.suffix.lower()), str(q)))
    memo[key] = idx
    return idx


def resolve_detail(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
                   size_of=page_size):
    """-> {'path', 'edition'[, 'pageUnknown']} | None (a hole) | a refusal dict (see below).

    Precedence is over EDITIONS first, then over formats within an edition: a 2nd-edition EPS
    beats a 1st-edition PDF, because the edition is a question of WHICH PICTURE and the format
    only of how we read it.

    A refusal is {'path': None, 'refused': 'superseded'|'production-page', 'edition',
    'candidates': [{'path', 'page', 'paper'}], 'reason'}.
    """
    # 🔴 KNOWN-SUPERSEDED ARTWORK IS REFUSED BEFORE ANY LOOKUP. The delivery can hold a figure the
    # published book has since redrawn; sourcing it produces correct Icelandic on the WRONG
    # ARRANGEMENT. Verified instance: CNX_Chem_19_03_Pattern_img.
    # ⚠️ Refusing is not the same as fixing, and it does NOT always mean the reader gets English:
    # nothing is composed or published for a refused figure, so whatever `_IS.svg` and
    # image-mapping row an EARLIER run left stay live (CNX_Chem_19_01_BlastFurn is one). Only
    # where no such copy exists does the reader get OpenStax's English raster. The driver names a
    # still-mapped copy (§C140 ⑦).
    if superseded:
        folded = {_normkey(k): v for k, v in superseded.items()}
        reason = folded.get(_normkey(basename))
        if reason is not None:
            return {'path': None, 'refused': 'superseded', 'edition': None,
                    'candidates': [], 'reason': reason}

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

        def candidates():
            found = False
            for ext in exts:
                for cand in root.rglob(basename + ext):
                    found = True
                    yield cand
            if found:
                return
            # Case/punctuation tolerance, AFTER every exact form in this edition and
            # BEFORE any lower-precedence tree: a filename that differs only in case
            # is the same picture, so edition still decides WHICH picture.
            cands = _norm_index(root, exts, {} if _memo is None else _memo).get(_normkey(basename))
            # ⚠️ AMBIGUITY IS TWO DIFFERENT *STEMS*, NOT TWO FILES. The same stem
            # shipped as both .pdf and .eps is one picture in two formats, and
            # the exact path already resolves that by format precedence — the
            # first version of this check called it ambiguous and threw away a
            # verified-good recovery (CNX_Chem_18_04_buckyball, which ships as
            # both). `cands` is pre-sorted by the caller's `exts` order. Genuinely
            # ambiguous — two differently-named delivery files folding onto one
            # key — yields nothing: picking either is a coin flip on what a
            # reader sees, so this resolves to nothing and the figure reports
            # `unresolved` — visible and counted, rather than silently wrong.
            if cands and len({c.stem for c in cands}) == 1:
                yield from cands

        pages = []
        for cand in candidates():
            size = size_of(cand)
            paper = paper_size_name(size)
            if paper:
                pages.append({'path': str(cand), 'page': [size[0], size[1]], 'paper': paper})
                continue
            hit = {'path': str(cand), 'edition': key}
            if size is None:
                hit['pageUnknown'] = True
            return hit
        if pages:
            # 🔴 NO FALL-THROUGH TO A LOWER-PRECEDENCE EDITION: the edition decides WHICH picture,
            # and a 1st-edition file standing in for a 2nd-edition sheet is the superseded-artwork
            # failure this module exists to prevent.
            return {'path': None, 'refused': 'production-page', 'edition': key,
                    'candidates': pages,
                    'reason': (f"every candidate in {key!r} is a {pages[0]['paper']}-size page — "
                               f"a production sheet, not a figure")}
    return None


def resolve(basename, trees, precedence, exts=SOURCE_EXTS, superseded=None, _memo=None,
            size_of=page_size):
    """-> (Path, edition_key) for the authoritative source, or (None, None) for a hole or a
    refusal. `resolve_detail` says which."""
    d = resolve_detail(basename, trees, precedence, exts, superseded=superseded, _memo=_memo,
                       size_of=size_of)
    if d and d.get('path'):
        return Path(d['path']), d['edition']
    return None, None


def resolve_report(names, trees, precedence, exts=SOURCE_EXTS, superseded=None):
    """-> {name: resolve_detail(...)} — a hit, `None` for a hole, or a refusal dict.

    The JSON half of this tool's CLI, kept as a pure function so it can be tested against
    temporary trees like `resolve` itself. `None` is a per-figure FACT — the artwork
    delivery has a hole here — and deliberately NOT an exit code: `tools/figure-run.js`
    tallies it as the `unresolved` outcome, which [USER] ruling R9 says is counted and
    named but never fails a run.

    ⚠️ A configured-but-unmounted tree still raises SystemExit out of `resolve_detail`, and
    that MUST keep travelling: it is the difference between "this figure is missing" and
    "every figure is about to silently resolve to superseded artwork".
    """
    out = {}
    memo = {}  # call-scoped: each tree indexed once for the whole batch
    for n in names:
        out[n] = resolve_detail(n, trees, precedence, exts, superseded=superseded, _memo=memo)
    return out


def human_report(names, trees, precedence, superseded=None):
    """-> (lines, missing, refused) — the operator-facing half of this tool's CLI.

    🔴 A REFUSAL IS NOT "NOT FOUND" (§C140 ⑦). The file is in the delivery and was declined, and
    the operator's next action differs: a hole is fixed in the artwork delivery, a refusal is
    read and ruled on. Printing a refusal as NOT FOUND is the misreport §3.4 of the ⑦ design
    corrects in the driver, so the two are printed and counted apart.
    """
    lines, missing, refused = [], 0, 0
    report = resolve_report(names, trees, precedence, superseded=superseded)
    for n in names:
        d = report[n]
        if d and d.get('path'):
            lines.append(f"  {d['edition']:14} {n:36} {d['path']}")
        elif d and d.get('refused'):
            refused += 1
            lines.append(f"  {'REFUSED':14} {n:36} REFUSED — {d['refused']}: {d['reason']}")
            for c in d.get('candidates') or []:
                lines.append(f"  {'':14} {'':36}   {c['path']}  "
                             f"{c['page'][0]:g}×{c['page'][1]:g} pt ({c['paper']})")
        else:
            missing += 1
            lines.append(f"  {'NOT FOUND':14} {n:36} -")
    if missing or refused:
        lines.append('')
    if missing:
        lines.append(f"  {missing} of {len(names)} not found in any configured tree")
    if refused:
        lines.append(f"  {refused} of {len(names)} REFUSED — found in a configured tree and "
                     f"declined; see each reason above")
    return lines, missing, refused


def main(book, names):
    cfg = load_config()
    trees = load_trees(book, cfg)
    lines, missing, refused = human_report(names, trees, cfg['editionPrecedence'],
                                           superseded=cfg.get('supersededArtwork'))
    print('\n'.join(lines))
    # Non-zero whenever a name did not resolve, as before; the two count lines say which kind.
    return 1 if (missing or refused) else 0


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
        report = resolve_report(argv[1:], trees, cfg['editionPrecedence'],
                                superseded=cfg.get('supersededArtwork'))
        print(json.dumps(report, ensure_ascii=False))
        # Exit 0 even when names went unresolved: see resolve_report's docstring. A
        # non-zero exit here is reserved for a failure of the RESOLVER, which the caller
        # must treat as fatal.
        sys.exit(0)
    sys.exit(main(argv[0], argv[1:]))
