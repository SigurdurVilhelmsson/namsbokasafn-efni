#!/usr/bin/env python3
"""Compose ONE figure and return a verdict a driver can act on.

    python3 figure-compose.py --out <dir> --translations <path>

Reads the directory `figure-prepare.py` wrote (`runs.json`, `meta.json`, `blocks.json`,
`artwork.png`, `artwork.svg`) and writes `<dir>/translated.svg` plus `<dir>/compose.json`:

    {"outputPath": "<dir>/translated.svg"}          exit 0
    {"error": "...", "keys": ["<block key>", ...]}  exit 1

Exit 2 is a usage error.

🔴 WHY THIS WRAPPER EXISTS: `compose.py` KEEPS THE ENGLISH FOR ANY KEY IT CANNOT MATCH,
REPORTS IT ONLY ON STDOUT, AND EXITS 0. It has no exit call at all - it falls off the end.
Measured on the committed fixture with one bought key left out of the translations file:
exit **0**, and the English still in `translated.svg`. A wrapper that reads `returncode`
or `stderr` therefore tallies `translated` for a figure that ships untranslated, which is
half of §C137's headline. NOTHING HERE MAY DEPEND ON THE CHILD'S EXIT CODE OR STDERR.

🔴 AND THE OBVIOUS FIX IS DEFEATED: A CORRECT RUN PRINTS THE SAME WARNING. Every
`send:false` block - a formula, an undecodable run, a block drawn with a font meta.json
does not describe - was deliberately never bought, so it takes the `key not in TR` branch
and lands in `!! N block(s) with no translation - ENGLISH KEPT`. A check keyed on the
warning's presence, or on its COUNT, refuses a perfectly good figure. So this compares KEY
SETS, and only key sets.

🔴 AND IT COMPARES THEM AS MULTISETS (ruling R-13, READ-LAYER-ACCEPTANCE.md:229). A figure
may carry one key twice and `compose.py` DRAWS BOTH; a candidate producing one where the
baseline produced two leaves a label undrawn with the key *set* identical. The acceptance
table records 5,375 duplicate keys corpus-wide, so this is the common case, not an edge.

THE TWO ASSERTIONS, AND WHY THEY ARE DIFFERENT ANCHORS
------------------------------------------------------
1. `Counter(report.blocks) == Counter(blocks.json keys)` - the two sides derive the key
   through the same `blockkey.block_key`, so this is NOT a test of the derivation rule
   (that is `blockkey.py` by construction, and `test_blockkey_consumers.py` end to end).
   What it catches is a STALE OR WRONG-FIGURE `--out`: a directory whose `blocks.json` was
   written for one figure and whose `runs.json` belongs to another. That is exactly the
   failure that had a sidecar asserting another figure's labels.
2. `Counter(report.missing) == Counter(blocks.json keys where not send)` - the money
   assertion. A key on the left that is not on the right was BOUGHT and came back with no
   usable translation; the label is in English and nothing downstream can see it.

⚠️ ASSERTION 2 ASSUMES THE TRANSLATIONS FILE CARRIES EXACTLY THE `send:true` KEYS, which
is true of `translate-blocks.mjs` output (it filters to `send` before it buys). A sidecar
that had acquired a translation for a `send:false` block - an editor adding one through the
review UI, say - would leave that key out of `missing` and refuse a CORRECT recompose. The
recompose path is Task 6b's; this is flagged there rather than guessed at here.

WHY `FIGTEXT_OUT` AND NOT `--out`
---------------------------------
`compose.py` has no `--out` and is not being given one. It reads `OUT` from `_deps`, which
honours `FIGTEXT_OUT`, so this tool's `--out` becomes the child's environment. Mixed
mechanisms are deliberate: `--out` to Node, `FIGTEXT_OUT=` to Python.

⚠️ This file deliberately does NOT `from _deps import OUT` - `test_figtext_out.py`'s
`OUT_IMPORTERS` pin records that binding as a decision about isolation, and a wrapper that
computes its own paths from `--out` has no business inheriting the shared one.
"""
import argparse
import collections
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule

# The child needs pdfplumber / pycairo / fontTools, which are not on this box's system
# path. `setdefault` so an operator who already exported it keeps their own tree.
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))

# Everything `compose.py` reads out of the directory before it draws a single glyph.
# Validated HERE, because compose.py writes translated.png BEFORE it reads artwork.svg
# (compose.py:259 vs :263) - so a missing or truncated SVG otherwise crashes it after a
# partial write, leaving a PNG that describes a compose nothing verified.
REQUIRED_INPUTS = ('runs.json', 'meta.json', 'blocks.json', 'artwork.png', 'artwork.svg')

# Written by this run, and only by this run. Removed before the child starts so their
# presence afterwards MEANS "this run produced them" rather than "a file with this name is
# in the directory" - the same lesson as figure-prepare.py's stale artwork.svg.
DERIVED_OUTPUTS = ('compose.json', 'compose-report.json', 'translated.svg')

COMPOSE_TIMEOUT_S = 900         # an unattended driver must not wedge on one figure


class ComposeError(Exception):
    """A per-figure failure. Reported into compose.json and exits 1 - never a traceback,
    because the driver reads the file, not the stderr.

    `keys` names the offending BLOCK KEYS when there are any. They are block keys
    ('Boiling|point|of water'), never the `english` field ('Boiling point of water'):
    those coincide on a single-line block and differ on every multi-line one, and the
    driver looks them up in a dict keyed the first way."""

    def __init__(self, message, keys=()):
        super().__init__(message)
        self.keys = list(keys)


def validate_inputs(out_dir, translations):
    """Everything that can be known before spending a subprocess. Raises ComposeError."""
    if not out_dir.is_dir():
        raise ComposeError(f'--out is not a directory: {out_dir}')

    for name in REQUIRED_INPUTS:
        path = out_dir / name
        if not path.is_file():
            raise ComposeError(
                f'{name} is missing from {out_dir} - run figure-prepare.py for this '
                f'figure first')
        if path.stat().st_size == 0:
            raise ComposeError(f'{name} is empty in {out_dir}')

    # svgout.write_svg is a bare `assert art.rstrip().endswith('</svg>')`, and it runs
    # AFTER translated.png has been written. Checking the same property here turns a
    # post-write AssertionError into a pre-flight refusal at the same cost.
    artwork_svg = out_dir / 'artwork.svg'
    if not artwork_svg.read_text(encoding='utf-8', errors='replace') \
            .rstrip().endswith('</svg>'):
        raise ComposeError(
            f'artwork.svg does not end with </svg> - truncated or not an SVG: '
            f'{artwork_svg}')

    # compose.py:38 reads a NONEXISTENT --translations path as an EMPTY translation set
    # and then keeps every label in English, exit 0. That is the single loudest way to
    # ship a whole chapter untranslated, and it must never reach the child.
    if not translations.is_file():
        raise ComposeError(f'--translations file does not exist: {translations}')
    try:
        payload = json.loads(translations.read_text(encoding='utf-8'))
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        raise ComposeError(
            f'--translations is not valid JSON ({type(exc).__name__}: {exc}): '
            f'{translations}') from exc
    if not isinstance(payload, dict):
        raise ComposeError(
            f'--translations must be a JSON object, got {type(payload).__name__}: '
            f'{translations}')
    # compose.py:39 is `TR = _tr.get('blocks', _tr)`, so either shape is accepted - the
    # MT payload and a committed sidecar both work - but a non-object `blocks` would make
    # every lookup miss with no error.
    inner = payload.get('blocks', payload)
    if not isinstance(inner, dict):
        raise ComposeError(
            f'--translations `blocks` must be a JSON object, got '
            f'{type(inner).__name__}: {translations}')


def run_compose(out_dir, translations):
    """Spawn compose.py with this figure's own FIGTEXT_OUT. -> the CompletedProcess.

    `cwd=HERE` and absolute paths for the same reason figure-prepare.py uses them: the
    driver stands wherever the operator does, and _deps resolves a relative FIGTEXT_OUT
    against the CHILD's cwd.

    The child's stdout and stderr are passed through rather than swallowed: the block
    report and the ENGLISH KEPT warning are what a human reads, and a driver log that
    hides them is blind for exactly the failure this tool exists to catch."""
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    result = subprocess.run(
        [sys.executable, str(HERE / 'compose.py'),
         '--translations', str(translations), '--svg'],
        capture_output=True, text=True, env=env, cwd=str(HERE),
        timeout=COMPOSE_TIMEOUT_S)
    if result.stdout:
        sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    return result


def read_report(out_dir, child):
    """-> the compose-report.json payload. Raises ComposeError.

    The child's returncode is quoted in the message but is NEVER the verdict - it is 0 on
    every failure mode this tool exists for. It is included only because a human staring
    at a missing report wants to know whether the process died."""
    path = out_dir / 'compose-report.json'
    if not path.is_file():
        raise ComposeError(
            f'compose.py wrote no compose-report.json (child exit {child.returncode}). '
            f'stderr: {(child.stderr or "").strip()[-600:]}')
    try:
        report = json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc:                      # noqa: BLE001
        raise ComposeError(
            f'compose-report.json is unparsable ({type(exc).__name__}: {exc})') from exc
    for field in ('blocks', 'missing', 'translated'):
        if not isinstance(report.get(field), list):
            raise ComposeError(
                f'compose-report.json has no `{field}` list - compose.py and this '
                f'wrapper have drifted')
    if report.get('control'):
        # A --control run re-injects the ENGLISH and never populates `missing`, so the
        # second assertion below would compare [] against the send:false blocks and
        # refuse a correct figure. This tool never passes --control, so a control report
        # means the file is left over from a hand-run - i.e. stale.
        raise ComposeError(
            'compose-report.json is from a --control run; this wrapper never passes '
            '--control, so the report is stale')
    return report


def verify(report, blocks):
    """The two multiset assertions. Raises ComposeError naming the offending keys."""
    drawn = collections.Counter(report['blocks'])
    declared = collections.Counter(b['key'] for b in blocks)
    if drawn != declared:
        delta = (drawn - declared) + (declared - drawn)
        raise ComposeError(
            f'compose.py drew a different set of blocks from the one blocks.json '
            f'declares - the output directory is stale or holds two figures. '
            f'drew {sum(drawn.values())}, declared {sum(declared.values())}; '
            f'multiset delta {sorted(delta.items())}',
            keys=sorted(delta))

    kept_english = collections.Counter(report['missing'])
    never_bought = collections.Counter(b['key'] for b in blocks if not b.get('send'))
    if kept_english != never_bought:
        bought_but_english = sorted((kept_english - never_bought))
        held_but_drawn = sorted((never_bought - kept_english))
        if bought_but_english:
            detail = (f'{len(bought_but_english)} block(s) were BOUGHT and came back '
                      f'with no usable translation, so the figure ships them in '
                      f'English: {bought_but_english}')
        else:
            detail = (f'{len(held_but_drawn)} block(s) blocks.json holds back as '
                      f'send:false were translated anyway: {held_but_drawn}')
        raise ComposeError(
            f'the English-kept blocks are not the blocks that were never bought. '
            f'{detail}',
            keys=bought_but_english + held_but_drawn)


def compose(out_dir, translations):
    """-> the path to translated.svg. Raises ComposeError on a per-figure failure."""
    validate_inputs(out_dir, translations)
    for name in DERIVED_OUTPUTS:
        (out_dir / name).unlink(missing_ok=True)

    child = run_compose(out_dir, translations)
    report = read_report(out_dir, child)
    blocks = json.loads((out_dir / 'blocks.json').read_text(encoding='utf-8'))
    verify(report, blocks)

    svg = out_dir / 'translated.svg'
    if not svg.is_file() or svg.stat().st_size == 0:
        raise ComposeError(
            f'compose.py produced no usable {svg.name} (child exit '
            f'{child.returncode}). This is the file that gets published, so reporting '
            f'success here would publish nothing.')
    return svg


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog='figure-compose.py', description=__doc__.splitlines()[0])
    parser.add_argument('--out', required=True,
                        help="this figure's own directory, as figure-prepare.py wrote it")
    parser.add_argument('--translations', required=True,
                        help='the MT payload or a committed sidecar; either shape')
    # argparse exits 2 on an unknown flag and on a valued flag with no value, which is the
    # required behaviour - `tools/lib/parseArgs.js` silently DROPS unknown flags, and a
    # misremembered safety flag that is silently dropped is how a rehearsal becomes a
    # full-strength run.
    return parser.parse_args(argv)


def main(argv):
    args = parse_args(argv)
    # Resolved against THIS process's cwd - the operator's - before it becomes
    # FIGTEXT_OUT, which _deps resolves against the CHILD's cwd (which is HERE).
    out_dir = Path(args.out).expanduser().resolve()
    translations = Path(args.translations).expanduser().resolve()

    try:
        svg = compose(out_dir, translations)
    except ComposeError as exc:
        _write_failure(out_dir, str(exc), exc.keys)
        return 1
    except Exception as exc:                      # noqa: BLE001 - an unattended driver
        # reads compose.json, not a traceback. The type is kept so the cause survives.
        _write_failure(out_dir, f'{type(exc).__name__}: {exc}', [])
        return 1

    (out_dir / 'compose.json').write_text(
        json.dumps({'outputPath': str(svg)}, indent=1, ensure_ascii=False))
    print(f'  -> {svg}')
    return 0


def _write_failure(out_dir, message, keys):
    """compose.json on the failure path, plus a stderr line for a human.

    ⚠️ `translated.svg` IS REMOVED, so its presence means exit 0 and nothing else. On an
    assertion failure compose.py has already written one - with English in it - and a
    driver that published by looking for the file rather than reading this verdict would
    ship exactly the figure this tool just refused."""
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / 'translated.svg').unlink(missing_ok=True)
        (out_dir / 'compose.json').write_text(
            json.dumps({'error': message, 'keys': keys}, indent=1, ensure_ascii=False))
    except OSError as exc:
        print(f'could not write compose.json in {out_dir}: {exc}', file=sys.stderr)
    print(f'FAILED compose: {message}', file=sys.stderr)


if __name__ == '__main__':
    # `sys.exit` with a code computed by main(), never an exit part-way through a write.
    sys.exit(main(sys.argv[1:]))
