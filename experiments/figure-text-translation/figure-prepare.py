#!/usr/bin/env python3
"""Turn ONE artwork file into ONE output directory, and say enough about it for the
classifier to decide what to do with it.

    python3 figure-prepare.py <artwork-path> --basename <b> --out <dir>

Writes into <dir>: `<b>.pdf` (the staged artwork), `runs.json`, `meta.json`,
`blocks.json`, `artwork.pdf`, `artwork.png`, `artwork.svg`, and `prepare.json`.

Exit 0 on success INCLUDING zero blocks (a text-less vector is a real corpus state, not a
failure); 1 on failure, with `{"error": ..., "warnings": []}` in prepare.json; 2 on a
usage error.

WHY A WRAPPER AND NOT A LIBRARY
-------------------------------
`emit-blocks.py` has no `if __name__ == '__main__'` guard - it reads `sys.argv[1]` at
module scope - so it can only be driven as a subprocess. It also spawns `extract.py` by a
RELATIVE path with no `cwd=`, so both children must be started with `cwd=HERE`, and the
artwork path handed to them must be ABSOLUTE. The driver that calls this tool stands
wherever the operator does.

WHY `--basename` IS REQUIRED
----------------------------
`meta['source']` is the path the reader was GIVEN, and `tools/publish-figure-svg.js`
(`basenameFromMeta`, :60-68) cross-checks its basename against the sidecar key, refusing
`basename-mismatch`. That refusal happens AFTER the figure has been paid for. Two real
populations mismatch if the source file's own stem is used: the 7 ch04 `.eps` figures
(whose staged temp had a random name) and the 9 hashed ch03 figures, where the CNXML
basename `CNX_Chem_03_02_moles-6296` resolves to a file called `CNX_Chem_03_02_moles`.
Staging the artwork as `<out>/<basename>.pdf` and reading THAT makes `meta['source']`
carry the CNXML basename by construction, for every input format at once.

⚠️ CONSEQUENCE, so nobody reads it as a defect: because this tool stages `.eps`/`.ai`
itself, `readlayer.read` has nothing left to stage and `meta['staged']` is **False** on
an EPS figure. `prepare.json`'s own `source` is the ORIGINAL artwork path;
`meta.json`'s `source` is the staged PDF. They differ on purpose.

WHY THE THREE HOLD-REASONS ARE COUNTED SEPARATELY
-------------------------------------------------
`blocks.json` carries one boolean per block, `send`, and `figtext.sendable` collapses
THREE independent reasons into it: the block is verbatim (a formula - identical in
Icelandic), its own text did not decode (buying it buys mojibake), or a font it draws
with is missing from meta.json (the plumbing is broken). The classifier has to tell
"there is no text to translate" from "there is text we could not read" - the first is
`copied-textless` and costs nothing, the second is a read-layer regression - and one
boolean cannot express that. So they are counted here, from the same `blocks.json` the
spend decision was written into, using the SAME predicates imported from the same
modules. Never re-implemented: `looks_verbatim` from `figtext`, `_looks_undecoded` from
`readlayer`, `is_subset` from `extract`.

`missingFontBlocks` is the RESIDUE and cannot be anything else: `sendable()` is
`not verbatim and not undecoded and not missing_fonts`, so a block that is held while
being neither verbatim nor undecoded is held by `missing_fonts`. It is computed as a
residue rather than directly because `blocks.json` records no per-run font. The residue
going negative would mean `emit-blocks.py` marked a block sendable that these predicates
call held - i.e. the two have drifted - and that is raised, not rounded away.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule

# Self-bootstrap, copied from text-coverage-census.py:17-19. pdfplumber and fontTools are
# NOT on this box's system path; `os.environ.setdefault` is the half that reaches the
# SPAWNED children, which is the half a wrapper needs.
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))

import pikepdf                                  # noqa: E402  - after the bootstrap
from _deps import read_content                  # noqa: E402

# ⚠️ deliberately NOT `from _deps import OUT`. This tool never reads the shared output
# directory; it passes FIGTEXT_OUT to its CHILDREN and computes its own paths from
# --out. `test_figtext_out.py`'s OUT_IMPORTERS pin records that decision.

STAGED_EXTS = ('.eps', '.ai')

# A bare filename, and nothing that could reach outside --out. This value becomes a path
# segment, and it arrives from a CLI flag.
SAFE_BASENAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')

# `strip-text.py` saves the de-texted artwork as OUT/'artwork.pdf' and renders
# OUT/'artwork.png' and OUT/'artwork.svg' beside it, so a figure called "artwork" would
# have its staged source and its stripped output be the same file.
RESERVED_BASENAMES = {'artwork'}

# Path-painting operators. `sh` (shading) paints too. `n` is DELIBERATELY ABSENT: it ends
# a path WITHOUT painting it, and its overwhelmingly common use is `W n`, the clipping
# idiom. MEASURED, not reasoned: of the 49 photographs in chemistry's no-text population
# that report paintOps 0, **29 carry at least one `n`** - so counting it would drop the
# `imageXObjects > 0 && paintOps == 0` rule from 49 of 71 photographs to 20 of 71.
PAINT_OPS = frozenset({'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'sh'})

# 🔴 WHAT paintOps CAN AND CANNOT DO - MEASURED 2026-09-07 OVER ALL 895 RESOLVED
# CHEMISTRY FIGURES, BECAUSE THE PLAN'S CALIBRATION DID NOT REPRODUCE.
#
# The plan this tool comes from said: "Measured cleanly separable on ch04: 0 images /
# 13-31 paint ops for line art versus 1-20 images / 0-4 paint ops for photographs."
# Nothing in the repo produced a paintOps figure, so that could not be re-derived; it is
# now measured, and **neither range holds**. On ch04's 28 resolved figures:
#   image-free figures  paintOps [7, 11, 13, 14, 15, 15, 15, 19, 24, 24, 31, 41, 50, 312]
#   image-bearing ones  paintOps [0, 0, 0, 0, 0, 0, 0, 2, 2, 4, 12, 42, 94, 314]
# 7-312 against 0-314. The two distributions OVERLAP, so **no paintOps threshold
# separates line art from photographs**, and the "13-31 vs 0-4" reading is wrong in both
# halves. Do not tune the definition until it reproduces - the claim is what was wrong.
#
# What DOES hold, over the 79 figures where poppler finds no words at all - the
# population where the copied-photo / copied-textless split actually runs:
#   image-bearing (71): paintOps 0 on 49, 1-4 on 17, >=5 on 5, max 20
#   image-free     (8): paintOps 10 .. 2508, min 10, NONE at 0
# So `imageXObjects > 0 && paintOps == 0` is CONSERVATIVE: it selected 49 of the 71 and
# **never selected an image-free vector**. Every error is in one direction - 22
# photographs (31%) fall through to `copied-textless`, typically because a leader line
# or a panel rule is drawn over the photo (CNX_Chem_04_03_iodine: one image `Do`, plus
# 2 strokes and 2 fills). On ch04's own 10 zero-sendable figures the rule is right on 9.
# ▶ THAT ERROR COSTS NOTHING IN MONEY: both branches are `copied-*`, neither spends and
# both copy the artwork, so a mislabelled photograph is a reporting defect. It would be a
# spend defect only if a `copied-*` branch ever started buying.


class PrepareError(Exception):
    """A per-figure failure. Reported into prepare.json and exits 1 - never a traceback,
    because the driver reads the file, not the stderr."""


# ── the pikepdf counters ─────────────────────────────────────────────────────────────

def _scan_stream(source, owner_needed=False):
    """-> (paint_ops, has_text) for ONE content stream.

    `source` is a `pikepdf.Stream` or raw `bytes`. Bytes are wrapped in a throwaway Pdf
    because `pikepdf.parse_content_stream` refuses them, and `owner` MUST be a named
    local: an inline `pikepdf.new().make_stream(...)` drops the only reference to the Pdf
    the moment the expression ends and the stream dies with it. Same idiom, same reason,
    as `strip-text.py:77-84`.

    `has_text` is TOKEN-AWARE - a real `BT` operator, not the two bytes `BT`. ⚠️ THIS
    DIFFERS FROM `text-coverage-census.py:65`, WHICH BYTE-SCANS, and the difference is
    not drift: `BT` occurs by chance inside the FLATE payload of an inline image, which
    is why `strip-text.py`'s own strip had to become token-aware (measured: 8 such
    matches on 6 `.eps` figures). Expect this count to be LOWER than the census's on
    those figures. Inline images (`BI ... ID ... EI`) are one instruction and are never
    scanned for operators, which is the point.
    """
    owner = None
    if isinstance(source, (bytes, bytearray)):
        owner = pikepdf.new()
        source = owner.make_stream(bytes(source))
    paint, has_text = 0, False
    for instruction in pikepdf.parse_content_stream(source):
        if isinstance(instruction, pikepdf.ContentStreamInlineImage):
            continue
        op = str(instruction.operator)
        if op in PAINT_OPS:
            paint += 1
        elif op == 'BT':
            has_text = True
    del owner                       # explicit: nothing below may reference it
    return paint, has_text


def count_page_features(pdf_path):
    """-> {imageXObjects, paintOps, formTextXObjects, formXObjects, unparsableStreams}

    THE COUNTING UNIT, stated because two defensible units give different numbers:

    * `imageXObjects` and `formTextXObjects` count DISTINCT REACHABLE XObjects, keyed on
      `objgen`, not `Do` invocations. A form drawn three times counts once.
    * `paintOps` is summed over page 1's content stream plus each distinct reachable
      /Form stream, once each - so it is "paint operators present in the reachable
      artwork", not "paint operations executed when the page renders".
    * The walk is RECURSIVE through `/Resources/XObject`, with an `objgen` cycle guard.
      Depth 1 is not enough: `strip-text.py:170-175` measured nesting to depth 3, with 64
      of 817 in-scope figures deeper than 1, and `text-coverage-census.py:60-69` - the
      only prior implementation - stops at the page.
    * The page stream is read through `_deps.read_content`, which concatenates an ARRAY
      `/Contents`. The census's `pg.Contents.read_bytes()` raises on that shape; it is
      why 38 chemistry figures are bucketed `ours-crashes` and carry no counts at all.

    A stream that cannot be tokenised is NAMED in `unparsableStreams` and falls back to a
    byte scan for the text question only. Silence there would mean a form whose English
    may still be drawn, counted as clean.
    """
    imgs = forms = formtext = paint = 0
    unparsable = []
    seen = set()

    with pikepdf.open(str(pdf_path)) as pdf:
        page = pdf.pages[0]
        content = read_content(page).encode('latin-1')
        try:
            page_paint, _bt = _scan_stream(content)
            paint += page_paint
        except Exception as exc:                  # noqa: BLE001 - named, not swallowed
            unparsable.append(f'page content: {type(exc).__name__}: {exc}')

        def walk(res):
            nonlocal imgs, forms, formtext, paint
            xobjects = res.get('/XObject')
            if xobjects is None:
                return
            for _name, xobj in xobjects.items():
                objgen = xobj.objgen
                if objgen in seen:
                    continue
                seen.add(objgen)
                subtype = str(xobj.get('/Subtype', ''))
                if subtype == '/Image':
                    imgs += 1
                    continue
                if subtype != '/Form' or not isinstance(xobj, pikepdf.Stream):
                    continue
                forms += 1
                try:
                    form_paint, has_text = _scan_stream(xobj)
                    paint += form_paint
                except Exception as exc:          # noqa: BLE001
                    unparsable.append(f'{objgen}: {type(exc).__name__}: {exc}')
                    try:
                        has_text = b'BT' in bytes(xobj.read_bytes())
                    except Exception:             # noqa: BLE001
                        has_text = False
                if has_text:
                    formtext += 1
                sub = xobj.get('/Resources')
                if sub is not None:
                    walk(sub)

        res = pikepdf.Page(page).obj.get('/Resources')
        if res is not None:
            walk(res)

    return dict(imageXObjects=imgs, paintOps=paint, formTextXObjects=formtext,
                formXObjects=forms, unparsableStreams=unparsable)


# ── staging ──────────────────────────────────────────────────────────────────────────

def stage_artwork(artwork, out_dir, basename):
    """Put a readable PDF at `<out_dir>/<basename>.pdf`. -> that path.

    `.eps`/`.ai` go through ghostscript; anything else is copied. The copy is not
    ceremony: `strip-text.py:216` does `pikepdf.open(pdf_path)` on whatever it is handed
    and cannot open an EPS, and the de-hashed case needs the rename even for a PDF.
    """
    dst = out_dir / f'{basename}.pdf'
    if artwork.suffix.lower() in STAGED_EXTS:
        # Imported, never copied: readlayer's own comment says the two copies of this
        # argv must not drift, because a different -d flag is a different rasterisation.
        from readlayer import GS_ARGV
        result = subprocess.run(GS_ARGV + [f'-sOutputFile={dst}', str(artwork)],
                                capture_output=True, timeout=300)
        if result.returncode != 0 or not dst.exists() or dst.stat().st_size == 0:
            raise PrepareError(
                f'ghostscript failed on {artwork.name}: exit {result.returncode}: '
                f'{result.stderr.decode("utf-8", "replace").strip()[-300:]}')
    else:
        shutil.copyfile(artwork, dst)
    return dst


def run_child(script, staged, out_dir, extra=()):
    """Spawn one of the existing stages with its own FIGTEXT_OUT.

    `cwd=HERE` and an ABSOLUTE artwork path are both load-bearing - see the module
    docstring. The env is inherited, so `extract.py`, spawned in turn by
    `emit-blocks.py`, lands in the same directory.
    """
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    # A timeout, because the caller is an unattended driver walking a whole chapter: a
    # wedged `gs` or `pdftocairo` on one figure must become that figure's exit 1, not a
    # run that never returns. TimeoutExpired lands in main()'s generic handler and is
    # written into prepare.json like any other per-figure failure.
    result = subprocess.run([sys.executable, script, str(staged), *extra],
                            capture_output=True, text=True, env=env, cwd=str(HERE),
                            timeout=900)
    if result.returncode != 0:
        raise PrepareError(
            f'{script} exited {result.returncode}: '
            f'{(result.stderr or result.stdout).strip()[-600:]}')
    return result


# ── the report ───────────────────────────────────────────────────────────────────────

def classify_holds(blocks, meta):
    """-> (sendable, verbatim, undecoded, missingFont), a PARTITION of `blocks`.

    Precedence is verbatim, then undecoded, then missing-font, and it is the same
    precedence `emit-blocks.py:49-51` uses when it decides what to PRINT: a block that is
    both a formula and undecoded is a formula, and was never going to be bought.
    """
    from figtext import looks_verbatim
    from readlayer import _looks_undecoded

    sendable = verbatim = undecoded = missing_font = 0
    for block in blocks:
        text = block.get('english', '')
        is_verbatim = looks_verbatim(text)
        is_undecoded = (not is_verbatim) and _looks_undecoded(text)
        if block.get('send'):
            if is_verbatim or is_undecoded:
                raise PrepareError(
                    'emit-blocks.py marked a block sendable that figtext.looks_verbatim '
                    'or readlayer._looks_undecoded holds back - the spend gate and this '
                    f'report have drifted: {text!r}')
            sendable += 1
        elif is_verbatim:
            verbatim += 1
        elif is_undecoded:
            undecoded += 1
        else:
            missing_font += 1
    return sendable, verbatim, undecoded, missing_font


def build_warnings(meta, features):
    """Machine-readable, one string per fact, each carrying the word that names it.

    ⚠️ These are STRINGS, not bare font keys. A caller asking `any('subset' in w.lower())`
    - which the acceptance test does - can never be satisfied by a key like `PAGE/TT0`.
    The subset predicate is IMPORTED from extract.py: it is a TWO-signal function, and the
    one-signal `d['last'] < 200` form raises `TypeError` on every /Type0 font, because
    /Type0 carries /W and has no /LastChar at all (11 chemistry figures).
    """
    from extract import is_subset

    warnings = []
    fonts = meta.get('fonts') or {}
    warnings += [f'subset font {key}' for key, entry in sorted(fonts.items())
                 if is_subset(entry)]
    warnings += [f'undecodable font {key}' for key, entry in sorted(fonts.items())
                 if entry.get('decodable') is False]
    warnings += [f'unscoped font {key} ({count} run(s))'
                 for key, count in sorted((meta.get('unscoped_fonts') or {}).items())]
    if meta.get('color_warnings'):
        warnings.append(f"{meta['color_warnings']} unparsable colour operand(s); "
                        f"fills on this figure are unreliable")
    warnings += [f'unrecognised colour space {name} ({count})'
                 for name, count in sorted((meta.get('unknown_colorspaces') or {}).items())]
    warnings += [f'unparsable content stream {detail}'
                 for detail in features.get('unparsableStreams', [])]
    return warnings


def prepare(artwork, out_dir, basename):
    """-> the prepare.json payload. Raises PrepareError on a per-figure failure."""
    if not artwork.is_file():
        raise PrepareError(f'artwork not found: {artwork}')

    staged = stage_artwork(artwork, out_dir, basename)
    run_child('emit-blocks.py', staged, out_dir)
    # `--svg` is not optional: `artworkSvgPath` must be non-null on success. A prepare
    # that returned 0 with a null svg path would classify as `translated`, the MT would
    # be PAID, and only then would composition fail on the missing input.
    run_child('strip-text.py', staged, out_dir, extra=('--svg',))

    blocks = json.loads((out_dir / 'blocks.json').read_text())
    meta = json.loads((out_dir / 'meta.json').read_text())
    sendable, verbatim, undecoded, missing_font = classify_holds(blocks, meta)
    features = count_page_features(staged)

    svg = out_dir / 'artwork.svg'
    if not svg.is_file() or svg.stat().st_size == 0:
        raise PrepareError(
            f'strip-text.py produced no usable {svg.name}. Composition reads this file, '
            f'so returning success here would buy a translation nothing can render.')

    return {
        'basename': basename,
        # The ORIGINAL artwork, absolute. meta.json's `source` is the staged PDF.
        'source': str(artwork),
        'blocks': len(blocks),
        'sendable': sendable,
        'undecodedBlocks': undecoded,
        'verbatimBlocks': verbatim,
        'missingFontBlocks': missing_font,
        # 0 means the reader saw NO text at all, which is a different fact from
        # "0 blocks survived grouping".
        'chars': meta.get('chars', 0),
        'artworkSvgPath': str(svg),
        'imageXObjects': features['imageXObjects'],
        'paintOps': features['paintOps'],
        'formTextXObjects': features['formTextXObjects'],
        'warnings': build_warnings(meta, features),
    }


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog='figure-prepare.py', description=__doc__.splitlines()[0])
    parser.add_argument('artwork', help='path to the figure (.pdf, .eps or .ai)')
    parser.add_argument('--basename', required=True,
                        help='the CNXML basename; the sidecar key this figure will get')
    parser.add_argument('--out', required=True,
                        help='this figure\'s own output directory (created if needed)')
    # argparse exits 2 on an unknown flag and on a valued flag with no value, which is
    # the required behaviour - `tools/lib/parseArgs.js` silently DROPS unknown flags and
    # must not be imitated here.
    args = parser.parse_args(argv)
    if not SAFE_BASENAME.match(args.basename):
        parser.error(f'--basename must be a bare filename matching '
                     f'{SAFE_BASENAME.pattern}: {args.basename!r}')
    if args.basename in RESERVED_BASENAMES:
        parser.error(f'--basename {args.basename!r} collides with strip-text.py\'s own '
                     f'{args.basename}.pdf in the same directory')
    return args


def main(argv):
    args = parse_args(argv)
    # Resolved against THIS process's cwd - the operator's - before it becomes
    # FIGTEXT_OUT. `_deps.py:45-46` resolves a relative value against the CHILD's cwd,
    # and the children are started with cwd=HERE, so a relative --out would otherwise
    # land inside this experiment directory.
    out_dir = Path(args.out).expanduser().resolve()
    # parents=True: extract.py and strip-text.py each do `OUT.mkdir(exist_ok=True)` -
    # one level, no parents - so a driver writing <root>/<chapter>/<figure> needs this
    # tool to have made the tree already.
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        payload = prepare(Path(args.artwork).expanduser().resolve(), out_dir,
                          args.basename)
    except PrepareError as exc:
        (out_dir / 'prepare.json').write_text(
            json.dumps({'error': str(exc), 'warnings': []}, indent=1,
                       ensure_ascii=False))
        print(f'FAILED {args.basename}: {exc}', file=sys.stderr)
        return 1
    except Exception as exc:                      # noqa: BLE001 - an unattended driver
        # reads prepare.json, not a traceback. The type is kept so the cause survives.
        (out_dir / 'prepare.json').write_text(
            json.dumps({'error': f'{type(exc).__name__}: {exc}', 'warnings': []},
                       indent=1, ensure_ascii=False))
        print(f'FAILED {args.basename}: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1

    (out_dir / 'prepare.json').write_text(
        json.dumps(payload, indent=1, ensure_ascii=False))
    print(f"{payload['basename']}: {payload['blocks']} blocks, "
          f"{payload['sendable']} sendable "
          f"(held: {payload['verbatimBlocks']} verbatim, "
          f"{payload['undecodedBlocks']} undecoded, "
          f"{payload['missingFontBlocks']} missing-font) | "
          f"{payload['chars']} chars, {payload['imageXObjects']} images, "
          f"{payload['paintOps']} paint ops, "
          f"{payload['formTextXObjects']} form-text XObjects")
    for warning in payload['warnings']:
        print(f'  !! {warning}')
    print(f"  -> {out_dir}")
    return 0


if __name__ == '__main__':
    # `process.exitCode`, not an exit that discards queued stdout. Python's sys.exit
    # flushes, but the same discipline keeps the verdict in one place.
    sys.exit(main(sys.argv[1:]))
