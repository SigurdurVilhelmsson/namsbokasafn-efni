"""§C140 '6' R-15a - `artworkEdits`: per-figure, operator-level edits to the STAGED artwork PDF.

[USER]'s R-15a (2026-10-05): widen a figure's coloured comment boxes outward so translated text fits
"without altering the content of the image"; R-15a2 (2026-10-06) adds moving the circle column and
lengthening the green arrow. This module is the one place such an edit happens. It runs in
figure-prepare.py AFTER stage_artwork() and BEFORE emit-blocks.py, on the staged `<basename>.pdf`, so
runs.json, blocks.json, artwork.pdf, artwork.png and artwork.svg are ALL derived from the edited page -
one edit, five consistent artefacts (a compose-time edit would need four separate transforms).

THE TABLE (figure-text.config.json `artworkEdits`; its `_artworkEdits` doc string owns the staleness
route and is not restated here)
-------------------------------------------------------------------------------------------------
    {"<figure basename>": [<op>, ...], ...}

The entry is taken by EXACT basename - no case fold, no prefix - and only that entry is read, so a
malformed entry for another figure never breaks this one (tools/lib/figure-config-validate.js catches
it in CI). Coordinates are PDF PAGE SPACE (user space after the CTM), in pt, y UP - not the SVG frame
(y down). Colours are the PDF's OWN colour operator and operands (`["k", 0.2, 0.04, 0.4, 0]`), never
the RGB an SVG renders them as: the operands are exact, the RGB is a conversion.

    {"op": "move-paths", "dx": <pt>, "select": [<path>, ...]}
        translate each selected painted path by dx (wrapped in `q 1 0 0 1 ux 0 cm ... Q`).
    {"op": "move-edge", "edge": "left"|"right", "to": <pt> | "dx": <pt>, "select": [<path>, ...]}
        move the named edge of each selected rectangle to `to` (absolute) or by `dx`. The path must be
        ONE `re` followed directly by its paint op, and it stays an `re`: pdfplumber reports it as
        object_type 'rect', which is the only thing that makes it a table CELL (figcontainers' fill-rect
        branch). A rewrite as a general path would silently turn the label inside it `open`.
    {"op": "move-text", "dx": <pt>, "dy": <pt>, "select": [<line>, ...]}
        shift each selected text LINE (the show operators between two positioning operators) by dx
        and/or dy - at least one of them, both allowed (one line can sit in only ONE op, so a line that
        needs both axes needs both in one op). Done through the Tm/Td/TD/T* operands only (`cm` is
        illegal inside BT/ET); every later line in the same BT is compensated, so an unselected line
        never moves. A TD also SETS the leading (TL = -ty) and TL outlives the BT, so a TD whose ty
        changes becomes a Td followed by `<the original leading> TL`: every later T*, ' and " - in this
        BT or after it - still steps by the leading the source drew it with. A dx-only move never
        touches a TD's ty, so it adds no instruction.
    {"op": "move-line-end", "edge": "left"|"right", "dx": <pt>, "select": [<path>, ...]}
        move ONE END of each selected straight line by dx: the end at the named PAGE side (min-x or
        max-x, whatever the drawing order). The path must be exactly one `m` and one `l`, painted by a
        stroke whose operator directly follows the `l` (`not-a-line` otherwise: an `re`, a curve, a fill
        or a three-point path all refuse), and horizontal - both points on one y (`not-horizontal`: a
        dx-only move of a slanted line would change its angle). Only that end's x operand is rewritten,
        so the other end and the line's `cm` stay as they are. The geometric endpoint moves; the cap
        style is unchanged. `dx` only - an absolute `to` is an unknown field here.

    <path> = {"paint": "fill"|"stroke", "colour": [op, n...], "bbox": [x0, y0, x1, y1]}
             bbox = the path's points INCLUDING Bezier control points, in page space (no line width).
    <line> = {"text": "<the line's string bytes, latin-1 decoded>", "origin": [x, y]}

`python3 artworkedits.py --inventory <staged pdf>` prints every painted path and text line of page 1
with its selector in exactly this shape, so an entry is authored from repo tooling.

REFUSALS - `ArtworkEditError.reason` is a CONTRACT (figure-prepare.py reports `artworkEdits refused:
<reason>: <detail>` and the figure fails `failed-prepare`; test_artworkedits.py keys on these strings):
  the config   config-unusable (figconfig.load could not read it, or it repeats a key at ANY depth -
               figconfig's own wording, verbatim; so a broken config fails EVERY figure's prepare, as
               it fails every figure's compose), config-not-object, table-not-object
  the entry    entry-not-list, op-not-object, unknown-op, unknown-field, missing-field, bad-field
  selection    select-none / select-ambiguous (0 or more than 1 object matches, tolerance 0.01 pt),
               select-overlap (one object selected twice, in one op or across ops)
  the rewrite  not-a-rect, not-a-line, not-horizontal, not-axis-aligned (a rotated, skewed or flipped
               CTM or text matrix),
               no-positioning-op, edge-inverts (an edge or line end reaching or crossing the other one),
               clip-path (move-paths on a path that also sets the clip: `W`/`W*` before its paint)
  the check    verify-failed

FAIL CLOSED, AND VERIFIED: after rewriting, the stream is re-parsed and EVERY painted path and text
line is compared with the original - the selected ones must have moved exactly as asked and every
other one must be exactly where it was - and the leading (TL) in force at every text-showing operator
and every `Do` must be unchanged, which is what covers the TL readers the line comparison cannot see
(a `'`/`"`, and a form XObject's text) (`verify-failed` otherwise, and nothing is saved). That check
is what proves the Td compensation: FoodLabel's right column is drawn by the same BT as circle 5's
digit, through relative moves. A figure with no entry is not touched at all: its staged PDF stays the
bytes stage_artwork wrote, and its prepare.json carries no `artworkEdits` key.

LIMITS, STATED:
  - Only the page's own content stream is read: a path or line inside a form XObject matches nothing
    and refuses `select-none`.
  - A fill+stroke paint (`B`, `b`, ...) is not selectable, nor is a path painted with no colour
    operator in force, nor one whose colour operands are names (a pattern).
  - Selectors are matched against the STAGED PDF: for a `.pdf` artwork that is the source, byte for
    byte; for `.eps`/`.ai` it is ghostscript's output, so author those selectors from the staged copy
    (`--inventory` on `<out>/<basename>.pdf`), never from the source file.
  - Selectors are absolute page coordinates: a new artwork vintage, or an artworkPins redirect to a
    different file, makes them refuse `select-none`, which fails the figure closed.
  - A `'` or `"` STARTS a line (step 2c, [USER] 2026-10-08): it moves to the next line as T* does, then
    shows its string. `--inventory` prints it with `quote: true` and its own operator. A rewritten quote
    line becomes `Td` + `Tj` (a `"` keeps its aw/ac as `Tw` + `Tc` before them).
  - An entry on a figure the driver classifies `copied-photo` or `unreadable-text` is prepared and
    never recomposed, so it is silently unused. So is one on a `copied-textless` figure that embeds a
    raster (`imageXObjects > 0`, e.g. ibuprofenmass): tools/figure-run.js `isRecomposableTextless`
    declines it, and CI cannot see that prepare-time fact.
"""
import argparse
import json
import math
import os
import sys
from decimal import Decimal
from pathlib import Path

import figconfig            # §C140 '6' G7: the ONE parse of the policy config; stdlib only, no _deps

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
CONFIG_PATH = figconfig.CONFIG_PATH
TABLE = 'artworkEdits'
TOL = Decimal('0.01')
VERIFY_TOL = Decimal('0.000001')

OPS = {
    'move-paths': ({'op', 'dx', 'select'}, {'note'}),
    'move-edge': ({'op', 'edge', 'select'}, {'note', 'to', 'dx'}),
    'move-text': ({'op', 'select'}, {'note', 'dx', 'dy'}),
    'move-line-end': ({'op', 'edge', 'dx', 'select'}, {'note'}),
}
PATH_FIELDS = {'paint', 'colour', 'bbox'}
LINE_FIELDS = {'text', 'origin'}

PATH_CONSTRUCT = {'m', 'l', 'c', 'v', 'y', 'h', 're'}
PAINT = {'S': 'stroke', 's': 'stroke', 'f': 'fill', 'F': 'fill', 'f*': 'fill',
         'B': 'fill+stroke', 'B*': 'fill+stroke', 'b': 'fill+stroke', 'b*': 'fill+stroke', 'n': None}
FILL_COLOUR_OPS = {'k', 'rg', 'g', 'sc', 'scn', 'cs'}
STROKE_COLOUR_OPS = {'K', 'RG', 'G', 'SC', 'SCN', 'CS'}
SHOW_OPS = {'Tj', 'TJ', "'", '"'}
POS_OPS = {'Tm', 'Td', 'TD', 'T*'}
QUOTE_OPS = {"'", '"'}             # `'` = T* + Tj; `"` = aw Tw + ac Tc + `'` - each STARTS a line (step 2c)


class ArtworkEditError(ValueError):
    def __init__(self, reason, detail=''):
        self.reason = reason
        self.detail = detail
        super().__init__(f'{reason}: {detail}' if detail else reason)


def _kind(v):
    return 'null' if v is None else type(v).__name__


def _num(v):
    # finite, as the JS twin's isNum (Number.isFinite): Python's json accepts NaN/Infinity and reads 1e400 as
    # inf, which pikepdf cannot write - it would surface as a raw ValueError outside the reason contract.
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _D(v):
    return v if isinstance(v, Decimal) else Decimal(str(v))


# ── the table ────────────────────────────────────────────────────────────────────────

def load_table(config):
    """-> the `artworkEdits` object. ABSENT -> {}; present but not an object (null included) refuses."""
    if not isinstance(config, dict):
        raise ArtworkEditError('config-not-object', f'the config is {_kind(config)}')
    if TABLE not in config:
        return {}
    table = config[TABLE]
    if not isinstance(table, dict):
        raise ArtworkEditError('table-not-object', f'{TABLE} must be an object, not {_kind(table)}')
    return table


def _check_bbox(v, where):
    if not (isinstance(v, list) and len(v) == 4 and all(_num(x) for x in v) and v[0] <= v[2] and v[1] <= v[3]):
        raise ArtworkEditError('bad-field', f'{where}.bbox must be [x0, y0, x1, y1] numbers with x0<=x1, y0<=y1')


def for_figure(table, basename):
    """-> the validated op list for the EXACT basename, or [] when it has no entry. Only this entry is read."""
    if basename not in table:
        return []
    entry = table[basename]
    where = f'{TABLE}.{basename}'
    if not isinstance(entry, list) or not entry:
        raise ArtworkEditError('entry-not-list', f'{where} must be a non-empty list of ops')
    for i, op in enumerate(entry):
        w = f'{where}[{i}]'
        if not isinstance(op, dict):
            raise ArtworkEditError('op-not-object', f'{w} is {_kind(op)}')
        name = op.get('op')
        if not isinstance(name, str) or name not in OPS:      # G21 #11: a list/dict op is unhashable
            raise ArtworkEditError('unknown-op', f'{w}.op {name!r} is not one of {sorted(OPS)}')
        required, optional = OPS[name]
        extra = set(op) - required - optional
        if extra:
            raise ArtworkEditError('unknown-field', f'{w} has {sorted(extra)} (allowed {sorted(required | optional)})')
        missing = required - set(op)
        if missing:
            raise ArtworkEditError('missing-field', f'{w} lacks {sorted(missing)}')
        if 'note' in op and not isinstance(op['note'], str):
            raise ArtworkEditError('bad-field', f'{w}.note must be a string')
        if name in ('move-edge', 'move-line-end') and op['edge'] not in ('left', 'right'):
            raise ArtworkEditError('bad-field', f'{w}.edge must be left or right')
        if name == 'move-edge':
            if ('to' in op) == ('dx' in op):
                raise ArtworkEditError('bad-field', f'{w} needs exactly one of to / dx')
            if not _num(op.get('to', op.get('dx'))):
                raise ArtworkEditError('bad-field', f'{w}.to/dx must be a number')
        elif name == 'move-text':
            if 'dx' not in op and 'dy' not in op:
                raise ArtworkEditError('bad-field', f'{w} needs dx or dy (or both)')
            for axis in ('dx', 'dy'):
                if axis in op and not _num(op[axis]):
                    raise ArtworkEditError('bad-field', f'{w}.{axis} must be a number')
        elif not _num(op['dx']):
            raise ArtworkEditError('bad-field', f'{w}.dx must be a number')
        sel = op['select']
        if not isinstance(sel, list) or not sel:
            raise ArtworkEditError('bad-field', f'{w}.select must be a non-empty list')
        for j, s in enumerate(sel):
            ws = f'{w}.select[{j}]'
            if not isinstance(s, dict):
                raise ArtworkEditError('bad-field', f'{ws} is {_kind(s)}')
            fields = LINE_FIELDS if name == 'move-text' else PATH_FIELDS
            if set(s) != fields:
                raise ArtworkEditError('unknown-field' if set(s) - fields else 'missing-field',
                                       f'{ws} must have exactly {sorted(fields)}, has {sorted(s)}')
            if name == 'move-text':
                if not isinstance(s['text'], str) or not s['text']:
                    raise ArtworkEditError('bad-field', f'{ws}.text must be a non-empty string')
                o = s['origin']
                if not (isinstance(o, list) and len(o) == 2 and all(_num(x) for x in o)):
                    raise ArtworkEditError('bad-field', f'{ws}.origin must be [x, y]')
            else:
                if s['paint'] not in ('fill', 'stroke'):
                    raise ArtworkEditError('bad-field', f'{ws}.paint must be fill or stroke')
                c = s['colour']
                if not (isinstance(c, list) and c and isinstance(c[0], str) and all(_num(x) for x in c[1:])):
                    raise ArtworkEditError('bad-field', f'{ws}.colour must be [operator, numbers...]')
                _check_bbox(s['bbox'], ws)
    return entry


# ── the inventory: every painted path and every text line on page 1 ─────────────────────

def _mul(m, n):
    a, b, c, d, e, f = m
    A, B, C, D_, E, F = n
    return (a * A + b * C, a * B + b * D_, c * A + d * C, c * B + d * D_, e * A + f * C + E, e * B + f * D_ + F)


def _apply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


IDENT = (Decimal(1), Decimal(0), Decimal(0), Decimal(1), Decimal(0), Decimal(0))


def _ops(pikepdf, page):
    out = []
    for ins in pikepdf.parse_content_stream(page):
        if isinstance(ins, pikepdf.ContentStreamInlineImage):
            out.append(ins)
        else:
            out.append(ins)
    return out


def _string_text(pikepdf, operand):
    if isinstance(operand, pikepdf.String):
        return bytes(operand).decode('latin-1')
    if isinstance(operand, pikepdf.Array):
        return ''.join(bytes(x).decode('latin-1') for x in operand if isinstance(x, pikepdf.String))
    return ''


def inventory(pikepdf, instructions):
    """-> (paths, lines). paths: [{start, end, paint, fill, stroke, bbox, ctm, ops:[idx]}] for every PAINTED
    path (an `n` path is not painted). lines: [{bt, pos (idx of its positioning op or None), text, origin,
    tlm, ctm, tl, quote}] for every text line, in stream order."""
    ctm, fill, stroke, tl = IDENT, None, None, Decimal(0)
    stack = []
    paths, lines = [], []
    cur = None                     # path under construction
    in_bt, tlm, bt_id, line = False, None, -1, None
    for i, ins in enumerate(instructions):
        if isinstance(ins, pikepdf.ContentStreamInlineImage):
            continue
        op = str(ins.operator)
        args = list(ins.operands)
        if op == 'q':
            stack.append((ctm, fill, stroke, tl))
        elif op == 'Q':
            ctm, fill, stroke, tl = stack.pop() if stack else (ctm, fill, stroke, tl)
        elif op == 'cm':
            ctm = _mul(tuple(_D(x) for x in args), ctm)
        elif op in FILL_COLOUR_OPS:
            fill = (op, tuple(_D(x) if not isinstance(x, pikepdf.Name) else str(x) for x in args))
        elif op in STROKE_COLOUR_OPS:
            stroke = (op, tuple(_D(x) if not isinstance(x, pikepdf.Name) else str(x) for x in args))
        elif op in PATH_CONSTRUCT:
            if cur is None:
                cur = dict(start=i, ops=[], pts=[], ctm=ctm)
            cur['ops'].append(i)
            nums = [_D(x) for x in args]
            if op == 're':
                x, y, w, h = nums
                local = [(x, y), (x + w, y), (x, y + h), (x + w, y + h)]
            else:
                local = list(zip(nums[0::2], nums[1::2]))
            cur['pts'].extend(_apply(ctm, px, py) for px, py in local)
        elif op in ('W', 'W*'):
            if cur is not None:
                cur['clip'] = op          # G21 #10: this path ALSO sets the clip (W/W* before its paint)
        elif op in PAINT:
            if cur is not None and PAINT[op] is not None and cur['pts']:
                xs = [p[0] for p in cur['pts']]
                ys = [p[1] for p in cur['pts']]
                paths.append(dict(start=cur['start'], end=i, paint=PAINT[op], fill=fill, stroke=stroke,
                                  bbox=(min(xs), min(ys), max(xs), max(ys)), ctm=cur['ctm'], ops=cur['ops'],
                                  paintop=op, pts=cur['pts'], clip=cur.get('clip')))
            cur = None
        elif op == 'TL':
            tl = _D(args[0])
        elif op == 'BT':
            in_bt, tlm, bt_id, line = True, IDENT, bt_id + 1, None
        elif op == 'ET':
            in_bt, line = False, None
        elif in_bt and op in QUOTE_OPS:
            # PR-B step 2c: a quote moves to the next line exactly as T* does, then shows its string. Folding
            # it into the line before (as this walk once did) left every later origin in the BT wrong by
            # the leading - Nitrogen's label by 33 pt = 3 x TL 11.
            tlm = _mul((Decimal(1), Decimal(0), Decimal(0), Decimal(1), Decimal(0), -tl), tlm)
            line = dict(bt=bt_id, pos=i, posop=op, text=_string_text(pikepdf, args[-1]), tlm=tlm, ctm=ctm, tl=tl,
                        quote=True, origin=_apply(_mul(tlm, ctm), Decimal(0), Decimal(0)))
            lines.append(line)
        elif in_bt and op in POS_OPS:
            if op == 'Tm':
                tlm = tuple(_D(x) for x in args)
            else:
                if op == 'T*':
                    tx, ty = Decimal(0), -tl
                else:
                    tx, ty = _D(args[0]), _D(args[1])
                    if op == 'TD':
                        tl = -ty
                tlm = _mul((Decimal(1), Decimal(0), Decimal(0), Decimal(1), tx, ty), tlm)
            line = dict(bt=bt_id, pos=i, posop=op, text='', tlm=tlm, ctm=ctm, tl=tl, quote=False,
                        origin=_apply(_mul(tlm, ctm), Decimal(0), Decimal(0)))
            lines.append(line)
        elif in_bt and op in SHOW_OPS:
            if line is None:
                line = dict(bt=bt_id, pos=None, posop=None, text='', tlm=tlm, ctm=ctm, tl=tl, quote=False,
                            origin=_apply(_mul(tlm, ctm), Decimal(0), Decimal(0)))
                lines.append(line)
            line['text'] += _string_text(pikepdf, args[-1])
    return paths, lines


def _close(a, b, tol):
    return abs(_D(a) - _D(b)) <= tol


def _colour_eq(have, want):
    if have is None or have[0] != want[0] or len(have[1]) != len(want) - 1:
        return False
    return all(not isinstance(h, str) and abs(h - _D(w)) <= Decimal('1e-9') for h, w in zip(have[1], want[1:]))


def _match_path(p, s):
    if p['paint'] != s['paint']:
        return False
    if not _colour_eq(p['fill'] if s['paint'] == 'fill' else p['stroke'], s['colour']):
        return False
    return all(_close(a, b, TOL) for a, b in zip(p['bbox'], s['bbox']))


def _match_line(l, s):
    return l['text'] == s['text'] and all(_close(a, b, TOL) for a, b in zip(l['origin'], s['origin']))


def _axis(m, where):
    if m[1] != 0 or m[2] != 0 or m[0] <= 0 or m[3] <= 0:
        raise ArtworkEditError('not-axis-aligned', f'{where}: matrix {[str(x) for x in m]} is rotated, skewed or flipped')


def _fmt(v):
    return [float(x) for x in v]


def plan(pikepdf, instructions, ops, where):
    """-> (paths, lines, path_dx {path index: dx}, edges {path index: (edge, new page coord)},
    text_d {line index: (dx, dy)}, line_ends {path index: (instruction index, new page x)}, summary).
    `edges` holds every moved edge - a rect's AND a line end's - because that is what `_verify` checks;
    `line_ends` says which of them `rewrite` must treat as a line end rather than an `re`. Every selector
    must match exactly one object; no object may be selected twice."""
    paths, lines = inventory(pikepdf, instructions)
    path_dx, edges, text_d, line_ends, taken, summary = {}, {}, {}, {}, {}, []
    for k, op in enumerate(ops):
        w = f'{where}[{k}]'
        done = []
        for j, s in enumerate(op['select']):
            pool = lines if op['op'] == 'move-text' else paths
            hits = [n for n, o in enumerate(pool) if (_match_line(o, s) if op['op'] == 'move-text' else _match_path(o, s))]
            if not hits:
                raise ArtworkEditError('select-none', f'{w}.select[{j}] {s!r} matches nothing on page 1')
            if len(hits) > 1:
                raise ArtworkEditError('select-ambiguous', f'{w}.select[{j}] {s!r} matches {len(hits)} objects')
            n = hits[0]
            tag = ('line' if op['op'] == 'move-text' else 'path', n)
            if tag in taken:
                raise ArtworkEditError('select-overlap', f'{w}.select[{j}] selects the object {taken[tag]} already selected')
            taken[tag] = f'{w}.select[{j}]'
            if op['op'] == 'move-paths':
                if paths[n]['clip']:
                    # G21 #10: the `q cm ... Q` wrap would END the clip `W` sets at the inserted `Q`, so
                    # every later object would be drawn unclipped - a change _verify cannot see.
                    raise ArtworkEditError('clip-path', f'{w}.select[{j}] is also a clipping path (its '
                                                        f'`{paths[n]["clip"]}` precedes the paint): a move '
                                                        f'would unclip every later object')
                path_dx[n] = _D(op['dx'])
                done.append(dict(bbox=_fmt(paths[n]['bbox'])))
            elif op['op'] == 'move-text':
                text_d[n] = (_D(op.get('dx', 0)), _D(op.get('dy', 0)))
                done.append(dict(text=lines[n]['text'], origin=_fmt(lines[n]['origin'])))
            elif op['op'] == 'move-line-end':
                p = paths[n]
                if (len(p['ops']) != 2 or [str(instructions[i].operator) for i in p['ops']] != ['m', 'l']
                        or p['end'] != p['ops'][1] + 1 or p['paint'] != 'stroke'):
                    raise ArtworkEditError('not-a-line', f'{w}.select[{j}] is not ONE `m` + ONE `l` painted by a '
                                                         f'stroke directly after the `l`')
                _axis(p['ctm'], f'{w}.select[{j}] CTM')
                (xa, ya), (xb, yb) = ([_D(v) for v in instructions[i].operands] for i in p['ops'])
                if ya != yb:
                    raise ArtworkEditError('not-horizontal', f'{w}.select[{j}] is not horizontal: a dx-only move '
                                                             f'would change its angle')
                if xa == xb:
                    raise ArtworkEditError('not-a-line', f'{w}.select[{j}] has zero length')
                x0, _, x1, _ = p['bbox']
                old = x0 if op['edge'] == 'left' else x1
                new = old + _D(op['dx'])
                if (op['edge'] == 'left' and new >= x1) or (op['edge'] == 'right' and new <= x0):
                    raise ArtworkEditError('edge-inverts', f'{w}.select[{j}]: the {op["edge"]} end {new} reaches '
                                                           f'or crosses the other end')
                # The CTM is axis-aligned with a > 0, so the smaller LOCAL x is the page's left end.
                at = p['ops'][0] if (xa < xb) == (op['edge'] == 'left') else p['ops'][1]
                edges[n] = (op['edge'], new)
                line_ends[n] = (at, new)
                done.append(dict(bbox=_fmt(p['bbox']), edge=op['edge'], to=float(new)))
            else:
                p = paths[n]
                if len(p['ops']) != 1 or str(instructions[p['ops'][0]].operator) != 're' or p['end'] != p['ops'][0] + 1:
                    raise ArtworkEditError('not-a-rect', f'{w}.select[{j}] is not ONE `re` followed by its paint op')
                _axis(p['ctm'], f'{w}.select[{j}] CTM')
                x0, _, x1, _ = p['bbox']
                old = x0 if op['edge'] == 'left' else x1
                new = _D(op['to']) if 'to' in op else old + _D(op['dx'])
                if (op['edge'] == 'left' and new >= x1) or (op['edge'] == 'right' and new <= x0):
                    raise ArtworkEditError('edge-inverts', f'{w}.select[{j}]: {op["edge"]} edge {new} crosses the other edge')
                edges[n] = (op['edge'], new)
                done.append(dict(bbox=_fmt(p['bbox']), edge=op['edge'], to=float(new)))
        summary.append(dict(op=op['op'], selected=len(done), objects=done))
    return paths, lines, path_dx, edges, text_d, line_ends, summary


def rewrite(pikepdf, instructions, paths, lines, path_dx, edges, text_d, line_ends=None):
    """-> the new instruction list (pikepdf.ContentStreamInstruction / inline images). `line_ends` is
    plan's: an edge listed there is a line end, rewritten as one x operand of its `m` or `l`."""
    line_ends = line_ends or {}
    CSI = pikepdf.ContentStreamInstruction
    new_operands = {}                 # idx -> operands list
    replace_op = {}                   # idx -> (operands, operator) replacing the instruction
    replace_multi = {}                # idx -> [instructions] replacing it (a rewritten quote, step 2c)
    before, after = {}, {}
    for n, dx in path_dx.items():
        p = paths[n]
        _axis(p['ctm'], f'path {n} CTM')
        ux = dx / p['ctm'][0]
        before.setdefault(p['start'], []).extend([CSI([], pikepdf.Operator('q')),
                                                  CSI([1, 0, 0, 1, ux, 0], pikepdf.Operator('cm'))])
        after.setdefault(p['end'], []).append(CSI([], pikepdf.Operator('Q')))
    for n, (at, new) in line_ends.items():
        p = paths[n]
        operands = [_D(v) for v in instructions[at].operands]
        operands[0] = (new - p['ctm'][4]) / p['ctm'][0]      # the new end in user space; y unchanged
        new_operands[at] = operands
    for n, (edge, new) in edges.items():
        if n in line_ends:
            continue
        p = paths[n]
        i = p['ops'][0]
        x, y, w, h = (_D(v) for v in instructions[i].operands)
        a, e = p['ctm'][0], p['ctm'][4]
        nu = (new - e) / a                      # the new edge in user space
        if edge == 'left':
            if w >= 0:
                x, w = nu, (x + w) - nu
            else:
                w = nu - x                       # x is the RIGHT edge and stays
        else:
            if w >= 0:
                w = nu - x
            else:
                x, w = nu, (x + w) - nu          # x was the right edge; x+w the left
        new_operands[i] = [x, y, w, h]
    # text: per BT, the (dx, dy) shift each line carries; compensate at every positioning op whose shift
    # differs from the previous line's
    ZERO = (Decimal(0), Decimal(0))
    by_bt = {}
    for n, l in enumerate(lines):
        by_bt.setdefault(l['bt'], []).append(n)
    for bt, idxs in by_bt.items():
        shifts = [text_d.get(n, ZERO) for n in idxs]
        if not any(any(s) for s in shifts):
            continue
        prev = ZERO
        prev_tlm = IDENT
        for n, s in zip(idxs, shifts):
            l = lines[n]
            delta = (s[0] - prev[0], s[1] - prev[1])
            # Tm is ABSOLUTE: it needs the line's own shift whenever that is non-zero, whatever came before.
            # Td/TD/T* are RELATIVE: they need the CHANGE of shift from the previous line.
            if any(s if l['posop'] == 'Tm' else delta):
                if l['pos'] is None:
                    raise ArtworkEditError('no-positioning-op', f'line {l["text"]!r} has no positioning operator')
                _axis(l['ctm'], f'CTM at {l["text"]!r}')
                ins = instructions[l['pos']]
                # a quote's operands are (aw, ac,) string - not a position; it is rebuilt below instead
                ops_ = None if l['posop'] in QUOTE_OPS else [_D(v) for v in ins.operands]
                if l['posop'] == 'Tm':
                    _axis(tuple(ops_), f'Tm at {l["text"]!r}')
                    ops_[4] += s[0] / l['ctm'][0]    # absolute: the line's own shift, in user space
                    ops_[5] += s[1] / l['ctm'][3]
                    new_operands[l['pos']] = ops_
                else:
                    lin = _mul(prev_tlm, l['ctm'])
                    _axis(lin, f'text matrix before {l["text"]!r}')
                    dtx, dty = delta[0] / lin[0], delta[1] / lin[3]
                    if l['posop'] == 'T*':
                        replace_op[l['pos']] = ([dtx, -l['tl'] + dty], 'Td')
                    elif l['posop'] in QUOTE_OPS:
                        # `'` = T* + Tj, so it becomes `Td` + `Tj` with the T* compensated; `"` first keeps
                        # its aw/ac as Tw/Tc (they persist, as the `"` set them). The string object is reused.
                        q = list(ins.operands)
                        head = ([CSI([q[0]], pikepdf.Operator('Tw')), CSI([q[1]], pikepdf.Operator('Tc'))]
                                if l['posop'] == '"' else [])
                        replace_multi[l['pos']] = head + [CSI([dtx, -l['tl'] + dty], pikepdf.Operator('Td')),
                                                          CSI([q[-1]], pikepdf.Operator('Tj'))]
                    elif l['posop'] == 'TD' and dty != 0:
                        # TD = `-ty TL` + `tx ty Td`. Its new ty would set a new leading, and TL outlives
                        # the BT, so every later T*/'/" the delta walk leaves alone would move. Write a Td
                        # and re-assert the leading this TD set (inventory recorded it: l['tl'] = -ty).
                        replace_op[l['pos']] = ([ops_[0] + dtx, ops_[1] + dty], 'Td')
                        after.setdefault(l['pos'], []).append(CSI([l['tl']], pikepdf.Operator('TL')))
                    else:
                        ops_[0] += dtx
                        ops_[1] += dty
                        new_operands[l['pos']] = ops_
            prev, prev_tlm = s, l['tlm']
    out = []
    for i, ins in enumerate(instructions):
        out.extend(before.get(i, []))
        if i in replace_multi:
            out.extend(replace_multi[i])
        elif i in replace_op:
            operands, opname = replace_op[i]
            out.append(CSI(operands, pikepdf.Operator(opname)))
        elif i in new_operands:
            out.append(CSI(new_operands[i], ins.operator))
        else:
            out.append(ins)
        out.extend(after.get(i, []))
    return out


def _tl_trace(pikepdf, instructions):
    """-> the leading (TL) in force at every text-showing operator and every `Do`, in stream order. A rewrite
    may change WHERE a line starts, never the leading anything later steps by: a TD whose ty changes is
    followed by a TL re-assert, and this is what proves it held. It has to be its own walk, because the
    readers of TL that matter most here are invisible to `inventory()`: a `'` or `"` continues the line
    before it (no origin of its own to compare) and a form XObject's text is not inventoried at all, while
    the form inherits the TL in force at its `Do`."""
    tl, stack, in_bt, out = Decimal(0), [], False, []
    for ins in instructions:
        if isinstance(ins, pikepdf.ContentStreamInlineImage):
            continue
        op = str(ins.operator)
        if op == 'q':
            stack.append(tl)
        elif op == 'Q':
            tl = stack.pop() if stack else tl
        elif op == 'TL':
            tl = _D(ins.operands[0])
        elif op == 'BT':
            in_bt = True
        elif op == 'ET':
            in_bt = False
        elif in_bt and op == 'TD':
            tl = -_D(ins.operands[1])
        elif (in_bt and op in SHOW_OPS) or op == 'Do':
            out.append(tl)
    return out


def _verify(pikepdf, old_paths, old_lines, new_instr, path_dx, edges, text_d, old_instr=None):
    paths, lines = inventory(pikepdf, new_instr)
    if len(paths) != len(old_paths) or len(lines) != len(old_lines):
        raise ArtworkEditError('verify-failed', f'{len(old_paths)}/{len(old_lines)} paths/lines became {len(paths)}/{len(lines)}')
    for n, (o, p) in enumerate(zip(old_paths, paths)):
        want = list(o['bbox'])
        if n in path_dx:
            want[0] += path_dx[n]
            want[2] += path_dx[n]
        if n in edges:
            want[0 if edges[n][0] == 'left' else 2] = edges[n][1]
        if not all(_close(a, b, VERIFY_TOL) for a, b in zip(p['bbox'], want)) or p['paint'] != o['paint'] \
                or p['fill'] != o['fill'] or p['stroke'] != o['stroke']:
            raise ArtworkEditError('verify-failed', f'path {n}: bbox {_fmt(p["bbox"])} expected {_fmt(want)}')
    for n, (o, l) in enumerate(zip(old_lines, lines)):
        dx, dy = text_d.get(n, (Decimal(0), Decimal(0)))
        want = (o['origin'][0] + dx, o['origin'][1] + dy)
        if l['text'] != o['text'] or not all(_close(a, b, VERIFY_TOL) for a, b in zip(l['origin'], want)):
            raise ArtworkEditError('verify-failed', f'line {n} {l["text"]!r}: origin {_fmt(l["origin"])} expected {_fmt(want)}')
    # Last, so a moved LINE is reported by name; this catches the TL readers the line comparison cannot see.
    if old_instr is not None:
        old_t, new_t = _tl_trace(pikepdf, old_instr), _tl_trace(pikepdf, new_instr)
        if old_t != new_t:
            k = next((i for i, (a, b) in enumerate(zip(old_t, new_t)) if a != b), min(len(old_t), len(new_t)))
            raise ArtworkEditError('verify-failed', f'the leading (TL) in force at show/Do operator {k} changed: '
                                                    f'{old_t[k] if k < len(old_t) else None} became '
                                                    f'{new_t[k] if k < len(new_t) else None}')


def apply_to_pdf(pdf_path, ops, where):
    """Rewrite page 1 of `pdf_path` IN PLACE (via a .tmp + rename) under `ops`. -> the summary list."""
    import pikepdf
    pdf_path = Path(pdf_path)
    tmp = pdf_path.with_name(pdf_path.name + '.edit.tmp')
    with pikepdf.open(str(pdf_path)) as pdf:
        page = pdf.pages[0]
        instr = list(pikepdf.parse_content_stream(page))
        paths, lines, path_dx, edges, text_d, line_ends, summary = plan(pikepdf, instr, ops, where)
        new = rewrite(pikepdf, instr, paths, lines, path_dx, edges, text_d, line_ends)
        _verify(pikepdf, paths, lines, new, path_dx, edges, text_d, instr)
        page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(new))
        pdf.save(str(tmp), deterministic_id=True)
    os.replace(tmp, pdf_path)
    return summary


def apply_for_figure(pdf_path, basename, config_path=CONFIG_PATH):
    """figure-prepare.py's entry point. -> None when the figure has no entry (the staged PDF is NOT
    touched - byte for byte what stage_artwork wrote), else the summary list. Raises ArtworkEditError.
    The config is read through figconfig.load (G7): one parse, one wording, a repeated key refused at
    any depth - so a config that cannot be used fails every figure, with or without an entry."""
    try:
        config = figconfig.load(config_path)
    except figconfig.ConfigError as exc:
        raise ArtworkEditError('config-unusable', str(exc)) from None
    ops = for_figure(load_table(config), basename)
    if not ops:
        return None
    return apply_to_pdf(pdf_path, ops, f'{TABLE}.{basename}')


# ── --inventory: author selectors from repo tooling ─────────────────────────────────────

def _selector_of(p):
    """-> (the selector that picks path `p`, None) or (None, why it cannot be selected)."""
    if p['paint'] not in ('fill', 'stroke'):
        return None, f"a {p['paint']} paint is not selectable"
    colour = p['fill'] if p['paint'] == 'fill' else p['stroke']
    if colour is None:
        return None, 'no colour operator is in force, so there are no operands to match'
    if any(isinstance(v, str) for v in colour[1]):
        return None, f'its colour operands include a name ({colour[0]}), which a selector cannot carry'
    if p.get('clip'):
        return None, f"it is also a clipping path ({p['clip']}): no op can move it (`clip-path`)"
    return {'paint': p['paint'], 'colour': [colour[0], *[float(v) for v in colour[1]]],
            'bbox': _fmt(p['bbox'])}, None


def inventory_report(pdf_path):
    """-> {pdf, paths, lines}: every painted path and text line of page 1, each with the selector an
    `artworkEdits` op would use to pick it (null and a `why` when it cannot be selected)."""
    import pikepdf
    with pikepdf.open(str(pdf_path)) as pdf:
        instr = list(pikepdf.parse_content_stream(pdf.pages[0]))
    paths, lines = inventory(pikepdf, instr)
    out_paths = []
    for n, p in enumerate(paths):
        rec = {'index': n, 'shape': ' '.join(str(instr[i].operator) for i in p['ops'])}
        sel, why = _selector_of(p)
        rec['select'] = sel
        if why:
            rec['why'] = why
        out_paths.append(rec)
    out_lines = [{'index': n, 'bt': ln['bt'], 'positioning': ln['posop'], 'quote': ln['quote'],
                  'select': {'text': ln['text'], 'origin': _fmt(ln['origin'])}}
                 for n, ln in enumerate(lines)]
    return {'pdf': str(pdf_path), 'paths': out_paths, 'lines': out_lines}


def main(argv):
    parser = argparse.ArgumentParser(
        description='Print every painted path and text line of a STAGED artwork PDF with its '
                    'artworkEdits selector (PDF page space, pt, y up).')
    parser.add_argument('--inventory', required=True, metavar='PDF',
                        help="the staged artwork, i.e. figure-prepare.py's <out>/<basename>.pdf")
    # argparse exits 2 on an unknown flag and on a missing --inventory: the required behaviour.
    args = parser.parse_args(argv)
    # The pylibs bootstrap figure-prepare.py does, for a standalone run.
    sys.path.insert(0, str(HERE / 'pylibs'))
    os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
    try:
        report = inventory_report(Path(args.inventory).expanduser().resolve())
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        print(f'artworkedits --inventory: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
