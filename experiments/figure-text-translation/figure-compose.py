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
   assertion. A key on the left that is not on the right ships in English and nothing
   downstream can see it.

🔴 ASSERTION 2 REPORTS WHAT THE FILE SHOWS, NEVER WHAT IT GUESSES WAS BOUGHT. It used to
say a key on the left "was BOUGHT and came back with no usable translation", and that is
false on the case that actually happens: on the driver's recompose path `--translations`
is the figure's SIDECAR, block keys are content-addressed, and a re-extraction or a
read-layer change MOVES them - so a key can be absent from the file because it was bought
at an earlier vintage, never because an API lost it. The two conditions are distinguished
and worded separately (NO ENTRY at all vs an entry that is empty or whitespace-only), and
the remedy is conditional on whether the file carries a `state`: deleting a sidecar is what
makes a figure eligible to be bought again, and deleting an APPROVED one destroys a head
editor's ruling.

⚠️ ASSERTION 2 STILL ASSUMES THE TRANSLATIONS FILE CARRIES ONLY `send:true` KEYS, which is
true of `translate-blocks.mjs` output (it filters to `send` before it buys). A sidecar that
had acquired a translation for a `send:false` block - an editor adding one through the
review UI, say - would leave that key out of `missing` and refuse a CORRECT recompose. That
direction is reported with its own wording; making it non-fatal is a behaviour change and
is not this wrapper's to take.

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


# What `validate_inputs` LEARNED about the --translations file, carried forward so the
# refusal can describe the file it actually read instead of guessing at its provenance.
# `keys` is the key set the composer will look up; `has_state` says whether the file is a
# sidecar a human has ruled on, which decides whether "delete it" is safe advice.
Translations = collections.namedtuple('Translations', 'path keys has_state')


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
    """Everything that can be known before spending a subprocess. Raises ComposeError.

    -> the `Translations` record. The payload is parsed here anyway, and `verify` cannot
    tell "never sold" from "sold and unusable" without it."""
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
    # `state` is only a REVIEW STATE when the file is the sidecar/MT shape - i.e. when it
    # has a `blocks` object around the translations. In the flat shape a top-level 'state'
    # would be a BLOCK KEY, and reading it as an editor's ruling would suppress the
    # deletion remedy on a file that carries no ruling at all.
    return Translations(path=translations, keys=frozenset(inner),
                        has_state=isinstance(payload.get('blocks'), dict)
                        and 'state' in payload)


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


def verify(report, blocks, translations):
    """The two multiset assertions. Raises ComposeError naming the offending keys.

    `translations` is REQUIRED - a default would silently pick one of the two wordings
    below, and picking wrong is the defect this argument exists to close."""
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
        english_but_sendable = sorted((kept_english - never_bought))
        held_but_drawn = sorted((never_bought - kept_english))
        # 🔴 THE SPLIT IS THE WHOLE POINT, AND IT IS OBSERVATIONAL. This wrapper knows
        # what the --translations FILE contains and nothing else; it has no idea what was
        # ever sent to an API. A single "were BOUGHT and came back with no usable
        # translation" sentence covered both branches and was FALSE on the one that
        # actually happens: on the driver's recompose path the file is the SIDECAR, and a
        # key can be absent from it simply because it was bought at an earlier extraction
        # vintage. Block keys are content-addressed, so a re-extraction or a read-layer
        # change moves them - and the message sent the operator hunting the paid MT for a
        # translation it had never been sold.
        # ⚠️ The MT is not the author of the other branch either: `normaliseTranslations`
        # (tools/figure-run.js) DROPS empty values before the sidecar is written and step 8
        # then refuses the figure, so an empty value cannot reach compose on the buy path.
        absent = [k for k in english_but_sendable if k not in translations.keys]
        unusable = [k for k in english_but_sendable if k in translations.keys]
        parts = []
        if absent:
            parts.append(
                f'{len(absent)} block(s) marked send:true in blocks.json have NO ENTRY '
                f'at all in {translations.path}, so nothing in that file was ever bought '
                f'for them and the figure ships them in English: {absent}. Block keys are '
                f'content-addressed, so a re-extraction or a read-layer change moves them: '
                f'on the driver this file is the figure\'s sidecar, and a sidecar bought '
                f'at an earlier vintage no longer covers the figure. ' + (
                    'A figure is eligible to be bought again only once it has NO sidecar - '
                    'but this file carries a `state`, i.e. an editor has already ruled on '
                    'it, and deleting it discards that decision.'
                    if translations.has_state else
                    'A figure is eligible to be bought again only once it has no sidecar; '
                    'this file carries no `state`, so deleting it discards no editorial '
                    'decision.'))
        if unusable:
            parts.append(
                f'{len(unusable)} block(s) HAVE an entry in {translations.path} that is '
                f'empty or whitespace-only, which compose.py keeps in English rather than '
                f'letting it erase the label: {unusable}.')
        if held_but_drawn:
            parts.append(
                f'{len(held_but_drawn)} block(s) blocks.json holds back as send:false '
                f'were translated anyway: {held_but_drawn}.')
        raise ComposeError(
            f'the blocks compose.py kept in ENGLISH are not the blocks blocks.json '
            f'held back as send:false. '
            + ' '.join(parts),
            keys=english_but_sendable + held_but_drawn)


def compose(out_dir, translations):
    """-> the path to translated.svg. Raises ComposeError on a per-figure failure."""
    tr = validate_inputs(out_dir, translations)
    for name in DERIVED_OUTPUTS:
        (out_dir / name).unlink(missing_ok=True)

    child = run_compose(out_dir, translations)
    report = read_report(out_dir, child)
    blocks = json.loads((out_dir / 'blocks.json').read_text(encoding='utf-8'))
    verify(report, blocks, tr)

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
