#!/usr/bin/env python3
"""Compose ONE figure and return a verdict a driver can act on.

    python3 figure-compose.py --out <dir> --translations <path> [--config <path>]

Reads the directory `figure-prepare.py` wrote (`runs.json`, `meta.json`, `blocks.json`,
`artwork.pdf`, `artwork.png`, `artwork.svg`) and writes `<dir>/translated.svg` plus
`<dir>/compose.json`:

    {"outputPath": "<dir>/translated.svg",
     "unformatted": [...], "overflow": [...],
     "localized": [...], "containerErrors": [...], "held": [...],
     "relaid": [...], "belowSource": [...], "anchorExcluded": [...]}  exit 0
    {"error": "...", "keys": ["<block key>", ...]}  exit 1

Exit 2 is a usage error. The lists are the composer's NOTES, copied from
compose-report.json (see `COMPOSE_NOTES`); none of them is a verdict.

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

THE THREE ASSERTIONS, AND WHY THEY ARE DIFFERENT ANCHORS
--------------------------------------------------------
1. `Counter(report.blocks) == Counter(blocks.json keys)` - the two sides derive the key
   through the same `blockkey.block_key`, so this is NOT a test of the derivation rule
   (that is `blockkey.py` by construction, and `test_blockkey_consumers.py` end to end).
   What it catches is a STALE OR WRONG-FIGURE `--out`: a directory whose `blocks.json` was
   written for one figure and whose `runs.json` belongs to another. That is exactly the
   failure that had a sidecar asserting another figure's labels.
1a. EXPLICIT BREAKS (§C140 '6' R-5a, [USER] 2026-10-05). An LF in a translated value is an editor's
   line break. compose.py draws each line from the block's first source baseline at its mean
   source pitch (a box: its glyph box centred at that pitch) or, when it cannot (an arc,
   an empty / edge-space / invisible line, more lines than the block has visual source lines, a
   break on an R3 joint - figtext.explicit_lines), draws the label as if each LF were a space and
   names it in `explicitBreakErrors`. Any entry refuses the figure, naming key, block and reason:
   it was drawn without the breaks the editor typed. `explicitBreaks` (the honoured ones) is
   compose-report.json only - neither list is one of COMPOSE_NOTES.
2. THE HELD CONTRACT (§C140 ㊾ D5(a)). Any `heldErrors` entry refuses the figure, naming every
   key and reason; then `Counter(report.held keys) == Counter(blocks.json keys this figure's
   heldBlockValues configure)`. The count compose is held to comes from blocks.json, not from
   compose, so a composer that ignored --held-values, dropped a twin or drew a key nobody
   configured cannot grade its own homework.
3. `Counter(report.missing) == Counter(blocks.json keys where not send) - the held labels
   drawn` - the money assertion. A key on the left that is not on the right ships in English
   and nothing downstream can see it. A held label drawn over a send:true block is refused
   first, in its own words - never as "translated anyway".

heldBlockValues (§C140 ㊾ D5(a))
--------------------------------
Design docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md (D-d, D-e).
[USER]'s values for send:false labels live in figure-text.config.json `heldBlockValues`, and THIS
FILE IS THEIR ONE READER. `--config` overrides the path for tests only: the driver never passes
it, so every route - sidecar recompose, textless, buy - reads the committed file with no JS
plumbing. `load_held` takes this figure's entry by EXACT basename (meta.json's `source` stem, the
rule the publisher's `basenameFromMeta` applies) and refuses, BEFORE anything is spawned or
written: a `source` that names no basename, a config that repeats a key at any depth (JSON keeps
only the last of two equal keys, so an earlier entry or value would vanish with no error), a table
or entry that cannot be read, a key that matches no block (renamed or re-extracted - the ruled
value would never be drawn), a key blocks.json marks send:true, and a key the --translations file
also translates (two authors for one label). The values reach compose.py in `<out>/held-values.json` (heldvalues.py owns the
format), written on EVERY run - `{}` included - after the stale outputs are removed, and
`--held-values` is always passed. A value compose refuses (`heldErrors`) refuses the figure in
assertion 2: readers keep the previous copy, and the fix is one config edit and a 0-ISK rerun.
`heldvalues` is stdlib only, so this file still imports no pikepdf, cairo, Pillow or `_deps`.

anchorExclusions (§C140 '6', ruling R-20)
-----------------------------------------
figure-text.config.json `anchorExclusions`, `{basename: {blockKey: reason}}`, turns off M1 - figlayout's
source-anchored cuts - for every block carrying that key in that figure (anchorexclusions.py owns the
format). The config is parsed ONCE per run, by figconfig.load (one repeated-key hook, one wording), and
both tables are read from that one object. The pre-flight (`load_anchor_exclusions`) refuses, BEFORE
anything is spawned or written, an entry that cannot be read, a key that matches no block in blocks.json,
and a key no send:true block carries (a send:false label is never laid out by figlayout, so the exclusion
could never act). The entry reaches compose.py in `<out>/anchor-exclusions.json`, written on EVERY run -
`{}` included - after the stale outputs are removed, and `--anchor-exclusions` is always passed. `verify`
then requires compose-report.json `anchorExcluded` to name every configured key once per block carrying
it (the held contract's multiset rule), so a composer that ignored the flag cannot pass. Once verify has
accepted it, `anchorExcluded` is copied into compose.json as one of COMPOSE_NOTES (§C140 '6' T11, G8), so the
driver can name each excluded label; `changed: false` (an exclusion that no longer changes the cut) is a note,
never a refusal.
⚠️ The table sits outside `renderHash`/`composedVersion`, like heldBlockValues: a change reaches a sidecar
figure's media only at the next COMPOSER_VERSION bump.

🔴 ASSERTION 3 REPORTS WHAT THE FILE SHOWS, NEVER WHAT IT GUESSES WAS BOUGHT. It used to
say a key on the left "was BOUGHT and came back with no usable translation", and that is
false on the case that actually happens: on the driver's recompose path `--translations`
is the figure's SIDECAR, block keys are content-addressed, and a re-extraction or a
read-layer change MOVES them - so a key can be absent from the file because it was bought
at an earlier vintage, never because an API lost it. The two conditions are distinguished
and worded separately (NO ENTRY at all vs an entry that is empty or whitespace-only), and
the remedy is conditional on whether the file carries a `state`: deleting a sidecar is what
makes a figure eligible to be bought again, and deleting an APPROVED one destroys a head
editor's ruling.

⚠️ ASSERTION 3 STILL ASSUMES THE TRANSLATIONS FILE CARRIES ONLY `send:true` KEYS, which is
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

import anchorexclusions     # §C140 '6' R-20; stdlib only, no _deps (its docstring)
import figconfig            # §C140 '6' G7: the ONE parse of the policy config; stdlib only, no _deps
import heldvalues           # §C140 ㊾ D5(a); stdlib only, no _deps (its docstring; test_heldvalues HV7)

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule

# The child needs pdfplumber / pycairo / fontTools, which are not on this box's system
# path. `setdefault` so an operator who already exported it keeps their own tree.
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))

# Everything `compose.py` reads out of the directory before it draws a single glyph.
# Validated HERE, because compose.py writes translated.png BEFORE it reads artwork.svg
# (compose.py:259 vs :263) - so a missing or truncated SVG otherwise crashes it after a
# partial write, leaving a PNG that describes a compose nothing verified.
# ⚠️ `artwork.pdf` is read for CONTAINER DETECTION (§C140 ③), lazily, on the first translated
# label compose.py lays out - and that load is outside the detector's never-raises boundary. So a
# missing one crashes the child with no compose-report.json, but ONLY on a figure that carries a
# translation: a figure with none composes fine, which hides it until the figure that matters.
# This catches a missing or empty file; a corrupt one still reaches the child, and is refused
# below as "wrote no compose-report.json" rather than published.
REQUIRED_INPUTS = ('runs.json', 'meta.json', 'blocks.json', 'artwork.pdf', 'artwork.png',
                   'artwork.svg')

# The composer's NOTES: lists compose-report.json carries beside its key sets, copied into
# compose.json on success so the driver can name them without reading a second file.
#   unformatted      formula formatting a translated label could not carry (§C140 ②)
#   overflow         a word drawn at the floor that overhangs its space (§C140 ③, R5; the floor is
#                    `figlayout.size_steps`'s - R4's 7.5 pt, or 0.8 x a smaller source size, R-16)
#   localized        English-kept labels drawn with a decimal comma (§C140 ⑨)
#   containerErrors  blocks whose container detection failed, laid out as open (§C140 ③)
#   held             labels drawn from heldBlockValues ([USER]'s values), {key, block, changed},
#                    draw order with multiplicity (§C140 ㊾ D5(a))
#   relaid           labels laid out on the source's own row breaks (M1, rule source-breaks, with shrunkFromPt)
#                    or drawn on its own rows (M3, rule source-rows) - {key, block, rule, sizePt, ...} (§C140 '6', G8)
#   belowSource      labels the source set below the 7.5 pt floor, drawn smaller than that size (R-16) -
#                    {key, block, sizePt, sourcePt} (§C140 '6', G8)
#   anchorExcluded   labels laid out without M1's cuts by anchorExclusions (R-20) - {key, block, changed};
#                    verify checks it against blocks.json before it is copied, like `held` (§C140 '6', G8)
# 🔴 NONE OF THEM IS A VERDICT, SO NONE IS CHECKED HERE. A figure with a note is drawn and every
# label is in it; `verify` stays the only thing that refuses. `held` is no exception: verify checks
# it against blocks.json (assertion 2) before it is copied, and `heldErrors` - which IS a verdict -
# is never a note. A report written by an older composer lacks the lists, and that reads as EMPTY
# lists - never a refusal, while nothing is configured for the figure (see verify).
COMPOSE_NOTES = ('unformatted', 'overflow', 'localized', 'containerErrors', 'held', 'relaid', 'belowSource',
                 'anchorExcluded')

# Written by this run, and only by this run. Removed before the child starts so their
# presence afterwards MEANS "this run produced them" rather than "a file with this name is
# in the directory" - the same lesson as figure-prepare.py's stale artwork.svg.
# `held-values.json` (§C140 ㊾ D5(a)) is the hand-off compose.py reads: written AFTER this removal,
# on every run, so it always holds this run's config. The removal comes BEFORE the heldBlockValues
# pre-flight too, so a refusal leaves none of a previous run's files behind (see compose()).
# `anchor-exclusions.json` (§C140 '6' R-20) is the same kind of hand-off, written the same way.
DERIVED_OUTPUTS = ('compose.json', 'compose-report.json', 'translated.svg', 'held-values.json',
                   'anchor-exclusions.json')

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


def figure_basename(out_dir):
    """-> this figure's basename: meta.json's `source` stem, the rule the publisher's
    `basenameFromMeta` applies. It picks the figure's entry in every per-figure table. Raises
    ComposeError when `source` names no file."""
    meta = json.loads((out_dir / 'meta.json').read_text(encoding='utf-8'))
    source = meta.get('source') if isinstance(meta, dict) else None
    basename = Path(source).stem if isinstance(source, str) else ''
    if not basename:
        raise ComposeError(
            f'meta.json in {out_dir} has no string `source` naming a file (got {source!r}) - '
            f"its stem is this figure's basename, which picks its heldBlockValues entry and which "
            f'the publisher checks; run figure-prepare.py for this figure again')
    return basename


def load_config(config_path):
    """-> the policy config, parsed ONCE per run by figconfig.load (§C140 '6' G7). Raises ComposeError
    in figconfig's own words. A REPEATED KEY IS REFUSED at any depth, before any table is read: JSON
    keeps only the last of two equal keys, so a heldBlockValues entry or value written twice would
    otherwise drop the first silently - that key stays send:false, lands in `missing` where verify
    expects it, and ships in English with exit 0 (a skeptic's finding, 2026-10-03; figconfig.py)."""
    try:
        return figconfig.load(config_path)
    except figconfig.ConfigError as exc:
        raise ComposeError(str(exc)) from exc


def load_held(blocks, tr, config_path, basename, config):
    """§C140 ㊾ D5(a): the heldBlockValues pre-flight. -> {blockKey: value}: this figure's entry,
    every value byte for byte, {} when it has none. Raises ComposeError.

    Runs BEFORE anything is spawned or written. `blocks` is blocks.json, `tr` the `Translations`
    record, `config_path` the policy config (heldvalues.CONFIG_PATH unless --config; named in
    messages only), `basename` figure_basename's, `config` load_config's parsed object. Only THIS
    figure's entry is parsed (heldvalues.for_figure), so a malformed entry for another figure never
    refuses this one - the config validator catches that in CI. Every key problem is reported at
    once, each naming `heldBlockValues.<basename>[<key>]`."""
    try:
        values = heldvalues.for_figure(heldvalues.load_table(config), basename)
    except heldvalues.HeldValueError as exc:
        raise ComposeError(f'{config_path}: {exc}') from exc

    declared = collections.Counter(b['key'] for b in blocks)
    sendable = {b['key'] for b in blocks if b.get('send')}
    where = f'{heldvalues.TABLE}.{basename}'
    problems, keys = [], set()
    for key in values:
        if not declared[key]:
            problems.append(f'{where}[{key!r}] matches no block in blocks.json - renamed or '
                            f're-extracted, so the ruled value would never be drawn')
            keys.add(key)
        elif key in sendable:
            problems.append(f'{where}[{key!r}] is a send:true block in blocks.json - a held value '
                            f'is only for a label that is never bought, and never masks a bought '
                            f'or buyable one')
            keys.add(key)
        if key in tr.keys:
            problems.append(f'{where}[{key!r}] is also in the --translations file {tr.path} - two '
                            f'authors for one label; a held value never overrides a translation')
            keys.add(key)
    if problems:
        raise ComposeError(
            'figure-compose.py refuses the heldBlockValues for this figure, before composing '
            'anything: ' + '; '.join(problems), keys=sorted(keys))
    return values


def load_anchor_exclusions(blocks, config_path, basename, config):
    """§C140 '6' R-20: the anchorExclusions pre-flight. -> {blockKey: reason}: this figure's entry, {}
    when it has none. Raises ComposeError. Runs BEFORE anything is spawned or written.

    Only THIS figure's entry is parsed (anchorexclusions.for_figure). A key that matches no block
    (renamed or re-extracted - the exclusion would never act) and a key no send:true block carries
    (a send:false label is drawn run-exact or from heldBlockValues, never laid out by figlayout) are
    refused, every problem at once, each naming `anchorExclusions.<basename>[<key>]`. A key that reaches
    the layout but changes nothing there is NOT refused here: compose.py names it `changed: false`."""
    try:
        excl = anchorexclusions.for_figure(anchorexclusions.load_table(config), basename)
    except anchorexclusions.AnchorExclusionError as exc:
        raise ComposeError(f'{config_path}: {exc}') from exc
    declared = collections.Counter(b['key'] for b in blocks)
    sendable = {b['key'] for b in blocks if b.get('send')}
    where = f'{anchorexclusions.TABLE}.{basename}'
    problems, keys = [], set()
    for key in excl:
        if not declared[key]:
            problems.append(f'{where}[{key!r}] matches no block in blocks.json - renamed or re-extracted, '
                            f'so the exclusion would never act')
            keys.add(key)
        elif key not in sendable:
            problems.append(f'{where}[{key!r}] is a send:false block in blocks.json - such a label is '
                            f'never laid out by figlayout, so M1 never reaches it')
            keys.add(key)
    if problems:
        raise ComposeError(
            'figure-compose.py refuses the anchorExclusions for this figure, before composing '
            'anything: ' + '; '.join(problems), keys=sorted(keys))
    return excl


def run_compose(out_dir, translations, held_path, anchor_path=None):
    """Spawn compose.py with this figure's own FIGTEXT_OUT. -> the CompletedProcess.

    `cwd=HERE` and absolute paths for the same reason figure-prepare.py uses them: the
    driver stands wherever the operator does, and _deps resolves a relative FIGTEXT_OUT
    against the CHILD's cwd.

    `--held-values` is ALWAYS passed (§C140 ㊾ D5(a)): `held_path` is the file compose() has just
    written, `{}` values included, so a configured figure is never composed without its values,
    and an unconfigured one draws exactly as with no flag (test_compose_held CH7).
    `--anchor-exclusions` (§C140 '6' R-20) is passed whenever `anchor_path` is given, and compose()
    always gives it - `{}` included, which draws byte for byte as with no flag (test_compose_anchors
    A4). The parameter is optional only so a unit caller (test_figure_compose F11) keeps its shape.

    The child's stdout and stderr are passed through rather than swallowed: the block
    report and the ENGLISH KEPT warning are what a human reads, and a driver log that
    hides them is blind for exactly the failure this tool exists to catch."""
    env = dict(os.environ)
    env['FIGTEXT_OUT'] = str(out_dir)
    argv = [sys.executable, str(HERE / 'compose.py'),
            '--translations', str(translations), '--held-values', str(held_path)]
    if anchor_path is not None:
        argv += ['--anchor-exclusions', str(anchor_path)]
    result = subprocess.run(
        argv + ['--svg'],
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
        # money assertion below would compare [] against the send:false blocks and
        # refuse a correct figure. This tool never passes --control, so a control report
        # means the file is left over from a hand-run - i.e. stale.
        raise ComposeError(
            'compose-report.json is from a --control run; this wrapper never passes '
            '--control, so the report is stale')
    return report


def verify(report, blocks, translations, held=None, anchor=None):
    """The three assertions (blocks; the held contract; money), plus explicit breaks (1a, R-5a) and the
    anchorExclusions contract.
    Raises ComposeError naming the offending keys.

    `translations` is REQUIRED - a default would silently pick one of the two wordings
    below, and picking wrong is the defect this argument exists to close.

    `held` is this figure's heldBlockValues entry, {blockKey: value} (§C140 ㊾ D5(a)). Its default is
    {}, which is fail-closed: a caller that forgets it refuses any label compose drew from a held
    value.

    `anchor` is this figure's anchorExclusions entry, {blockKey: reason} (§C140 '6' R-20). Default {}:
    a report that names an excluded block while nothing is configured is refused the same way."""
    held = {} if held is None else held
    anchor = {} if anchor is None else anchor
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

    # 1a. EXPLICIT BREAKS (§C140 '6' R-5a): a value whose explicit line breaks compose.py could not honour was
    # drawn WITHOUT them - the layout the reviewer did not ask for. Refused by name, never published.
    if report.get('explicitBreakErrors'):
        listed = '; '.join(f"{e.get('key')!r} block {e.get('block')}: {e.get('reason')} (line {e.get('line')})"
                           for e in report['explicitBreakErrors'])
        raise ComposeError(f"{len(report['explicitBreakErrors'])} translated value(s) carry line breaks that "
                           f'were not honoured: {listed}',
                           keys=sorted({e.get('key') for e in report['explicitBreakErrors']}))

    # 2. THE HELD CONTRACT (§C140 ㊾ D5(a)). `heldErrors` is in the trigger so that a report carrying
    # refusals but no `held` list cannot pass when nothing is configured. A refusal raises BEFORE the
    # multiplicity check, so each one - a compose-side `no-block` or `in-translations` included, which
    # only a hand-run reaches (load_held refuses both before any spawn) - has ONE verdict.
    drawn_held = collections.Counter()
    if held or report.get('held') or report.get('heldErrors'):
        for name in ('held', 'heldErrors'):
            entries = report.get(name)
            if not isinstance(entries, list) or not all(
                    isinstance(e, dict) and isinstance(e.get('key'), str) for e in entries):
                raise ComposeError(
                    f'compose-report.json has no `{name}` list of {{key, ...}} entries, while '
                    f'heldBlockValues are configured for this figure or the report names held '
                    f'labels - compose.py and this wrapper have drifted')
        if report['heldErrors']:
            listed = '; '.join(f"{e['key']!r} block {e.get('block')}: {e.get('reason')}"
                               for e in report['heldErrors'])
            raise ComposeError(
                f"{len(report['heldErrors'])} heldBlockValues entr(ies) were NOT drawn - compose.py "
                f"refused them, and [USER]'s ruled label is never published in English: {listed}. "
                f'Readers keep the previous copy; fix the value in figure-text.config.json and '
                f'rerun (0 ISK).',
                keys=sorted({e['key'] for e in report['heldErrors']}))
        drawn_held = collections.Counter(h['key'] for h in report['held'])
        configured = collections.Counter({k: declared[k] for k in held if declared[k]})
        if drawn_held != configured:
            delta = (drawn_held - configured) + (configured - drawn_held)
            raise ComposeError(
                f'compose.py drew {sum(drawn_held.values())} label(s) from heldBlockValues where '
                f'blocks.json carries {sum(configured.values())} block(s) under the configured '
                f'key(s) - it ignored --held-values, dropped a twin, or drew a key nobody '
                f'configured. multiset delta {sorted(delta.items())}',
                keys=sorted(delta))

    # THE anchorExclusions CONTRACT (§C140 '6' R-20), the held contract's shape: compose names EVERY block
    # carrying a configured key - laid out or not - so the count it is held to comes from blocks.json, and a
    # composer that ignored --anchor-exclusions (and so drew M1's cut) cannot grade its own homework.
    if anchor or report.get('anchorExcluded'):
        entries = report.get('anchorExcluded')
        if not isinstance(entries, list) or not all(
                isinstance(e, dict) and isinstance(e.get('key'), str) for e in entries):
            raise ComposeError(
                'compose-report.json has no `anchorExcluded` list of {key, ...} entries, while '
                'anchorExclusions are configured for this figure or the report names excluded labels - '
                'compose.py and this wrapper have drifted')
        drawn_excl = collections.Counter(e['key'] for e in entries)
        configured_excl = collections.Counter({k: declared[k] for k in anchor if declared[k]})
        if drawn_excl != configured_excl:
            delta = (drawn_excl - configured_excl) + (configured_excl - drawn_excl)
            raise ComposeError(
                f'compose.py excluded {sum(drawn_excl.values())} label(s) from M1 where blocks.json carries '
                f'{sum(configured_excl.values())} block(s) under the configured anchorExclusions key(s) - it '
                f'ignored --anchor-exclusions, dropped a twin, or excluded a key nobody configured. multiset '
                f'delta {sorted(delta.items())}',
                keys=sorted(delta))

    # 3. MONEY. A held label is subtracted from the send:false keys expected in `missing` - but only
    # once a held label drawn over a send:true block has been refused, in its own words.
    kept_english = collections.Counter(report['missing'])
    never_bought = collections.Counter(b['key'] for b in blocks if not b.get('send'))
    over = drawn_held - never_bought
    if over:
        raise ComposeError(
            f'{sum(over.values())} label(s) were drawn from heldBlockValues for block(s) blocks.json '
            f'marks send:true: {sorted(over)} - a held value is only for a label that is never '
            f'bought, and never masks a bought or buyable one.',
            keys=sorted(over))
    expected = never_bought - drawn_held
    if kept_english != expected:
        english_but_sendable = sorted((kept_english - expected))
        held_but_drawn = sorted((expected - kept_english))
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


def success_payload(svg, report):
    """compose.json on the success path. -> the dict to write.

    Each note list is copied VERBATIM - draw order and multiplicity kept, because `localized`
    names one key twice when a figure draws it twice. A list the report does not carry, or
    carries as something other than a list, is written as []: the driver reads these as lists,
    and a malformed note must not be able to fail a figure `verify` accepted."""
    payload = {'outputPath': str(svg)}
    for name in COMPOSE_NOTES:
        value = report.get(name)
        payload[name] = value if isinstance(value, list) else []
    return payload


def compose(out_dir, translations, config_path=heldvalues.CONFIG_PATH):
    """-> (the path to translated.svg, the compose-report.json payload `verify` accepted).
    Raises ComposeError on a per-figure failure.

    blocks.json is read ONCE, right after validate_inputs: the pre-flights need it before the spawn,
    and verify checks the report against the same list after it. The policy config is parsed ONCE too
    (load_config), and both per-figure tables are read from that one object."""
    tr = validate_inputs(out_dir, translations)
    blocks = json.loads((out_dir / 'blocks.json').read_text(encoding='utf-8'))
    # The stale outputs go BEFORE the heldBlockValues pre-flight (a skeptic's finding, 2026-10-03):
    # measured, a pre-flight refusal in a reused --out left the previous run's compose-report.json and
    # held-values.json in place, and a later direct `compose.py --held-values <out>/held-values.json`
    # would draw the PREVIOUS config's values (same basename, so its cross-check passes).
    # test_figure_compose.py F13.
    for name in DERIVED_OUTPUTS:
        (out_dir / name).unlink(missing_ok=True)
    basename = figure_basename(out_dir)
    config = load_config(config_path)
    held = load_held(blocks, tr, config_path, basename, config)
    anchor = load_anchor_exclusions(blocks, config_path, basename, config)
    held_path = out_dir / 'held-values.json'
    heldvalues.write_file(held_path, basename, config_path, held)
    anchor_path = out_dir / 'anchor-exclusions.json'
    anchorexclusions.write_file(anchor_path, basename, config_path, anchor)

    child = run_compose(out_dir, translations, held_path, anchor_path)
    report = read_report(out_dir, child)
    verify(report, blocks, tr, held, anchor)

    svg = out_dir / 'translated.svg'
    if not svg.is_file() or svg.stat().st_size == 0:
        raise ComposeError(
            f'compose.py produced no usable {svg.name} (child exit '
            f'{child.returncode}). This is the file that gets published, so reporting '
            f'success here would publish nothing.')
    return svg, report


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog='figure-compose.py', description=__doc__.splitlines()[0])
    parser.add_argument('--out', required=True,
                        help="this figure's own directory, as figure-prepare.py wrote it")
    parser.add_argument('--translations', required=True,
                        help='the MT payload or a committed sidecar; either shape')
    # §C140 ㊾ D5(a): TEST-ONLY. The driver never passes it, so composeFigure's argv - and the paid
    # and free harness pins on it - do not move, and every route reads the committed config.
    parser.add_argument('--config', default=None,
                        help='the policy config whose heldBlockValues and anchorExclusions to read '
                             '(default: figure-text.config.json beside this file; for tests)')
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
    config = (heldvalues.CONFIG_PATH if args.config is None
              else Path(args.config).expanduser().resolve())

    try:
        svg, report = compose(out_dir, translations, config)
    except ComposeError as exc:
        _write_failure(out_dir, str(exc), exc.keys)
        return 1
    except Exception as exc:                      # noqa: BLE001 - an unattended driver
        # reads compose.json, not a traceback. The type is kept so the cause survives.
        _write_failure(out_dir, f'{type(exc).__name__}: {exc}', [])
        return 1

    (out_dir / 'compose.json').write_text(
        json.dumps(success_payload(svg, report), indent=1, ensure_ascii=False))
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
