"""§C140 ㊾ D5(a) - plan a HELD block: [USER]'s value for a send:false figure label, laid out per VISUAL
source line, all or nothing, before anything is drawn.

PURE: it imports figtext, figscripts, figlayout and heldvalues (and, through figtext, the stdlib-only
numloc) - no cairo, no pdfplumber, no Pillow, no _deps, no file IO. compose.py measures (`width`),
fetches the container (`container`), checks glyph coverage (`has_glyph`) and draws the plan, so every
refusal below is unit-testable (test_heldplan.py, HP0-HP18); compose.py itself draws at import time and
cannot be imported (test_blockkey_consumers says so).

Design: docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md, D-a (encoding),
D-b (lines), D-c (this route). Real geometry: evidence/2026-10-03-c140-held/held-geometry.json.

THE ROUTE (D-c)
---------------
The value's lines replace the block's VISUAL lines one for one (`figtext.visual_lines`, §C140 ㉑ - never
`figtext.lines`, which splits buffer's stacked charge off its line). A value line is UNCHANGED when its
decoded text, script marks ignored, equals the joined text of the visual line's INK runs
(`figtext.visual_ink`: without a folded U+0020-only line, which no value line can say - it may not carry
an edge space), source or as localised in `drawn` (compose.localise_block(b): the source with Icelandic
number separators). An unchanged
line is planned as its `drawn` runs, so compose draws it with draw_run_exact - the same call, on the same
runs, as today. A CHANGED line is laid out by figlayout.decide with that ONE visual line's INK cues (n_src 1,
sz0 = figscripts.body_size of the line, its own start, end and baseline) inside the BLOCK's container,
measured by `width` with the line's first run, and is accepted only when it fits at source size on one
line:
    len(lines) == 1 and size == sz0 and overflow is None and step in ACCEPT_STEPS ('i', 'ii', 'fit')
Displacement is allowed (open step ii, the cell clamp); shrink, wrap and overhang are refused - a held
value is a ruling measured to fit, and a size change is a fidelity change for [USER] to decide. Exact
float equality is safe: figlayout.size_steps(sz0)[0] IS sz0. R-16 ([USER] 2026-10-05) lengthens the ladder
below sz0 for a source under 7.5 pt, but this clause still refuses every shrink, so a held line that fits
only shrunk is refused as before (test_heldplan HP11c2/HP11c3). figlayout sets `overflow` on every
'floor-overflow' and never on 'i' / 'ii' / 'fit', so the step and overflow clauses are belts for each
other; both are kept, as the design says.
numloc is NEVER applied to a changed line: the value already carries [USER]'s separators, and
`numloc.localize` is not idempotent (1.008 -> 1,008 -> 1.008).

THE GUARDS, IN THIS ORDER - each a HeldRefusal(reason, **detail), fatal for the figure
--------------------------------------------------------------------------------------
  arc                          figtext.is_arc(block), degenerate or not: the arc path has no lines
  line-count {value, visual}   the value's line count differs from the block's visual line count
  no-change                    every line decodes as unchanged - the entry draws nothing ruled
  box-multiline {visual}       a box container and more than one visual line: decide's box branch
                               centres the glyph box in the box and never reads the source baselines.
                               Only an UNSHARED box: a box that also holds another block's source
                               line is a shared box, which figcontainers lays out on the cell path
                               (cls 'cell', why '+shared') - that path reads the source baselines, so
                               it is not refused here (§C140 '6', M7). Nor is a box in a figure in
                               `sourceAlignedBoxes` (R-5c2): every box there is a cell too (why
                               '+source-boxes'), read on the same source baselines
  container-error {why}        container detection raised (`why` starts 'error:')
then for each CHANGED line, in line order:
  opens-styled {line}          the visual line's first run carries a style (a script or italic)
  italic-not-carried {line}    the line holds an italic-only styled run - the encoding cannot express it
  no-source-script:<kind> {line, found}          the value uses sub / sup and the block has no style of it
  ambiguous-source-script:<kind> {line, found}   ... or two or more - refused, never guessed
  no-glyph:U+XXXX {line, char, bold, italic}     has_glyph says the face the character draws in lacks it
  does-not-fit {line, step, size, lines}         the acceptance predicate above failed
The container is fetched lazily and at most once: never for an arc, line-count or no-change refusal. A
malformed value raises heldvalues.HeldValueError - it cannot reach here past heldvalues.read_file, and it
must never become a refusal that draws English quietly or a value drawn anyway. Every detail value is
JSON-serialisable: compose.py writes it into compose-report.json `heldErrors`.

"STYLED", FOR opens-styled AND italic-not-carried
-------------------------------------------------
A run's style is figscripts.line_styles of the `figtext.lines` line that holds it - each FT line of the
visual line analysed on its own. That is the unit figscripts.body_size votes in and the unit the design's
probe measured the 13 value-sheet lines with. Where the two units differ it is the FAIL-CLOSED reading:
an ITALIC stacked charge (2 FT.lines, 1 visual line) is italic-only on its own FT line and refuses, where
analysed with its whole visual line it would read as an italic script (test_heldplan HP12d).

SCRIPT CHARACTERS (D-a)
-----------------------
heldvalues.parse_value decodes ₂ / ⁰ / ⁻ ... to (base, 'sub' | 'sup'). The base is drawn in the block's
OWN source style of that kind, never a constant (figscripts' principle): `script_pool` collects every
distinct SourceStyle in figscripts.source_tokens(block) that figscripts.is_script_style accepts - distinct by
GEOMETRY, a STIX face alone never splitting one (script_pool says which face it keeps) - split by the sign of
frac, and a kind the value uses must have exactly one. compose then draws such a segment as
the translated path draws a transferred style: size x ratio, baseline shifted size x frac, italic as the
style says. (figscripts.transfer cannot be reused: it styles 0 characters of MolSpeed1's value, whose
source token is DIGIT `02` and whose value has a LETTER O.)

THE PLAN - HeldPlan(lines, changed)
-----------------------------------
`lines` holds one entry per visual line, in order:
  ('runs', drawn_slice)       an unchanged line: its runs from `drawn` - the SAME dicts, localised
  ('layout', layout, vl)      a changed line: figlayout.decide's Layout dict, and the SOURCE runs of the
                              visual line, a folded blank run included (compose draws in the font and
                              fill of the line's first INK run, figtext.visual_ink; its STIX runs are the
                              ones compose names `held`)
The entries partition the block in order - a 'runs' entry spans len(drawn_slice) runs and a 'layout'
entry len(vl) - so a caller derives each entry's source offset by summing. `changed` lists the changed
visual-line indices, ascending.
"""
import collections

import figtext as FT
import figscripts as FS
import figlayout as FL
import heldvalues

ACCEPT_STEPS = ('i', 'ii', 'fit')

HeldPlan = collections.namedtuple('HeldPlan', 'lines changed')


class HeldRefusal(Exception):
    """A held block that cannot be drawn as [USER] wrote it. `reason` is one of the strings in the module
    docstring; `detail` is a dict of JSON values (compose.py reports it as `{key, block, reason, **detail}`)."""

    def __init__(self, reason, **detail):
        self.reason = reason
        self.detail = detail
        super().__init__(reason + (' ' + ', '.join(f'{k}={v!r}' for k, v in detail.items()) if detail else ''))


def script_pool(block, fonts):
    """-> {'sub': [SourceStyle], 'sup': [SourceStyle]}: every DISTINCT style figscripts.source_tokens
    emits for `block` that figscripts.is_script_style accepts, split by the sign of frac (down = sub),
    each list sorted. An italic-only style (OxStNonmts' STIX charges, (1.0, 0.0714, italic)) is not a
    script and never enters it.

    DISTINCT means distinct GEOMETRY (ratio, frac, italic): two styles that differ only in `serif` (the
    STIX face figscripts records, §C140 '6' M6) are ONE script style for pooling - review-fix round G21 #5;
    pooling them apart made a Liberation `2` and a STIX `+` of one size and rise two `sup` entries (an
    `ambiguous-source-script` refusal composer 5 never made, or a TypeError sorting None against a tuple).
    The pooled style keeps a `serif` face only when every source style of that geometry agrees on it (a held
    mark then draws in that STIX face, as before); when they disagree it is None, and the mark draws FigIS,
    as every held mark did under composer 5. Sorted on the geometry alone, so None never meets a tuple."""
    tokens, _ = FS.source_tokens(block, fonts)
    pool = {'sub': {}, 'sup': {}}
    for t in tokens:
        for st in t['styles']:
            if FS.is_script_style(st):
                pool['sub' if st.frac < 0 else 'sup'].setdefault(tuple(st)[:3], set()).add(st.serif)
    return {k: [FS.SourceStyle(*g, serif=next(iter(f)) if len(f) == 1 else None) for g, f in sorted(v.items())]
            for k, v in pool.items()}


def _run_styles(vl, fonts):
    """[(run, style)] for the runs of ONE visual line, each figtext.lines line of it analysed on its own
    by figscripts.line_styles (see the module docstring). A run's style is its first character's - one
    style per run; an empty run has none."""
    out = []
    for line in FT.lines(vl):
        _, styles, _, _ = FS.line_styles(line, fonts)
        i = 0
        for r in line:
            out.append((r, styles[i] if r['text'] else None))
            i += len(r['text'])
    return out


def plan_block(block, value, fonts, drawn, *, is_bold, container, width, has_glyph):
    """-> HeldPlan for one held block, or raise HeldRefusal (see the module docstring for both).

    block      the block's runs (compose.py's `b`)
    value      [USER]'s RAW value string, byte for byte (heldvalues.for_figure / read_file return raw
               strings); parsed here with heldvalues.parse_value, whose HeldValueError propagates
    fonts      meta['fonts']
    drawn      compose.localise_block(block): aligned 1:1 with `block`
    is_bold    is_bold(run) -> bool: the weight a line is measured and drawn in, from its first run
    container  a THUNK: container() -> the block's figcontainers.container_for dict; called at most once
    width      width(chars, size, run) -> pt: compose's seg_width for ONE drawn line, measured with `run`
    has_glyph  has_glyph(char, bold, italic) -> bool: is `char` in the face it would be drawn in
    """
    if FT.is_arc(block):
        raise HeldRefusal('arc')
    vlines = heldvalues.parse_value(value)
    vls = FT.visual_lines(block)
    if len(vlines) != len(vls):
        raise HeldRefusal('line-count', value=len(vlines), visual=len(vls))
    assert len(drawn) == len(block), (len(drawn), len(block))
    # Visual lines are consecutive slices of the block (FT.lines buffers consecutive runs and visual_lines
    # merges consecutive lines), so each line's offset is the cumulative len(vl).
    assert [id(r) for vl in vls for r in vl] == [id(r) for r in block]
    spans, off = [], 0
    for vl in vls:
        spans.append((off, off + len(vl)))
        off += len(vl)
    texts = [''.join(c for c, _ in line) for line in vlines]
    # A line is unchanged when it equals its INK text (source or localised) - a folded blank line's
    # space is no part of what a value can say (a value line may not carry an edge space).
    inks = FT.visual_ink(block)
    pos = {id(r): i for i, r in enumerate(block)}
    unchanged = [t == ''.join(r['text'] for r in ink) or t == ''.join(drawn[pos[id(r)]]['text'] for r in ink)
                 for t, ink in zip(texts, inks)]
    if all(unchanged):
        raise HeldRefusal('no-change')

    box = container()
    if box.get('cls') == 'box' and len(vls) > 1:
        raise HeldRefusal('box-multiline', visual=len(vls))
    why = box.get('why')
    if isinstance(why, str) and why.startswith('error:'):
        raise HeldRefusal('container-error', why=why)

    pool = None
    out, changed = [], []
    for i, (line, vl, (a, e)) in enumerate(zip(vlines, vls, spans)):
        if unchanged[i]:
            out.append(('runs', drawn[a:e]))
            continue
        vfull, vl = vl, inks[i]
        styled = _run_styles(vl, fonts)
        if styled[0][1] is not None:
            raise HeldRefusal('opens-styled', line=i)
        if any(st is not None and st.italic and not FS.is_script_style(st) for _, st in styled):
            raise HeldRefusal('italic-not-carried', line=i)
        fmt = []
        for _, kind in line:
            if kind is None:
                fmt.append(None)
                continue
            if pool is None:
                pool = script_pool(block, fonts)
            kinds = pool[kind]
            if len(kinds) != 1:
                raise HeldRefusal(f"{'ambiguous' if kinds else 'no'}-source-script:{kind}",
                                  line=i, found=len(kinds))
            fmt.append(kinds[0])
        run0 = vl[0]
        bold = bool(is_bold(run0))
        for (ch, _), st in zip(line, fmt):
            italic = bool(st is not None and st.italic)
            if not has_glyph(ch, bold, italic):
                raise HeldRefusal(f'no-glyph:U+{ord(ch):04X}', line=i, char=ch, bold=bold, italic=italic)
        sz0 = FS.body_size(vl, fonts)
        cues = dict(n_src=1, sz0=sz0,
                    starts=[min(FT.along(r) for r in vl)],
                    ends=[max(FT.along(r) + r['adv'] for r in vl)],
                    projs=[FT.proj(run0)])
        layout = FL.decide(FS.words(texts[i], fmt), lambda chars, size, j: width(chars, size, run0), box, cues)
        if not (len(layout['lines']) == 1 and layout['size'] == sz0 and layout['overflow'] is None
                and layout['step'] in ACCEPT_STEPS):
            raise HeldRefusal('does-not-fit', line=i, step=layout['step'], size=layout['size'],
                              lines=len(layout['lines']))
        out.append(('layout', layout, vfull))
        changed.append(i)
    return HeldPlan(out, changed)
