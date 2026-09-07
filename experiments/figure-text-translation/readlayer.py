"""The figure READ layer: a pdfplumber adapter producing positioned text runs.

    from readlayer import read
    runs, meta, outcome = read('/path/CNX_Chem_02_00_Biomarkers.pdf')

🔴 THE INTERFACE IS OWNED BY `read_layer_accept.py`'s MODULE DOCSTRING (§ CONTRACT FOR
TASK R2), not by this file. It is restated NOWHERE — read it there. What lives here is
only how each field is DERIVED, and why the obvious derivation is wrong.

This replaces the hand-written content-stream parser in `pdftext.py`, which was written
against ONE figure. That parser reads `page.Resources.Font` and nothing else, so it
raises `AttributeError: /Font` on all 274 form-text chemistry figures — the fonts live in
each `/Form` XObject's own `/Resources`, not on the page. pdfplumber (pdfminer.six)
descends into forms, which is the whole reason for the swap.

WHAT IS NOT CHANGED: the LAYOUT layer. `figtext.py` groups these runs into blocks,
`blockkey.py` derives the key that is bought, `compose.py` draws them. This module's
success criterion is NOT "the same runs" — the two readers segment differently by design
(ruling R-10) — it is the same BLOCK KEYS, which is what money is spent on.

────────────────────────────────────────────────────────────────────────────────────
THE FIVE DERIVATIONS THAT ARE NOT THE OBVIOUS ONE. Each was measured; each obvious
form is wrong on a large, silent slice of the corpus.

`size`  = reconstructed from the char's box, NEVER hypot(matrix[0], matrix[1]) and — the
    half the plan did not have — NEVER a bare char['size'] either. See `_visual_size`.
    hypot is perfectly bimodal (ruling R-5): on .pdf figures it agrees with char['size']
    283/283; on .eps — i.e. after ghostscript — it is 1.0 where the real size is 9.0,
    0 of 318, because gs leaves Tm/CTM unit-scaled and puts the size in the Tf operand,
    which pdfminer's `matrix` excludes. Verified again here on 5 EPS figures.
    char['size'] fixes that but is itself the axis-aligned bbox HEIGHT, so it is a
    per-glyph WIDTH on rotated text — measured 2.502..7.497 across one vertical axis
    label whose real size is 9.0 throughout.

`x`,`y` = matrix[4], matrix[5], NEVER x0/y0.
    x0 == matrix[4] exactly, but y0 is the DESCENDER, 2.727pt below the baseline on
    Biomarkers' first char. figtext's line splitting is on baselines.

`adv`   = derived from POSITIONS, never sum(char['adv']).
    A char's advance in USER space is `char['adv'] * hypot(m[0], m[1])` — measured equal
    to `x1 - x0` on BOTH producer idioms (Illustrator: Tf=1 with 9 in the matrix;
    ghostscript: Tf=9 with a unit matrix), which is why the scaling cannot be dropped and
    cannot be replaced by `size`. But a SUM of those omits Tc/Tw and TJ kerning, which is
    exactly what 23 figures in this corpus carry. So the run's advance is taken from where
    its chars actually LANDED — `along(last) - along(first) + adv(last)` — and only the
    final glyph's own width comes from `char['adv']`. An `adv` off by a constant silently
    moves where figtext CUTS blocks, so this is a block-key defect, not a cosmetic one.

`font`  = a SCOPE-QUALIFIED synthetic key, 'PAGE/TT0' or 'PAGE/Fm3/T1_0' (ruling R-4).
    A form's /Resources is its own scope, so a flat resource-key map is unsound in
    principle: measured, 7 of the 274 form-text figures have one bare key naming two
    different BaseFonts. Qualifying by scope DISSOLVES that rather than refusing it.
    `compose.py` needs no change — it derives its BOLD set from `meta['fonts']` keys and
    looks up `run['font']`, so both sides move together.

`text`  = char['text'] verbatim. pdfminer has ALREADY decoded through /Encoding,
    /Differences and /ToUnicode. Re-applying `pdftext.winansi()` would corrupt it — that
    function exists to repair the OLD reader's raw latin-1 decode of the content stream.
────────────────────────────────────────────────────────────────────────────────────

⚠️ THIS MODULE DOES NOT CATCH READ ERRORS, DELIBERATELY. `read_layer_accept.py`'s
`read_candidate` wraps the call and classifies a raise as the third outcome. Returning
`([], meta, 'raises')` instead would be re-derived by the harness as 'empty' and a real
crash would read as a textless figure — manufacturing the population from the candidate
side, which is the exact defect ruling R-1 exists to prevent. `[]` means textless (H8).
"""
import collections
import logging
import math
import os
import subprocess
import tempfile
from pathlib import Path

import _deps  # noqa: F401  — puts this directory and FIGTEXT_PYLIBS on sys.path

import pdfplumber  # noqa: E402
import pikepdf  # noqa: E402

# Run-splitting tolerances. Size and rotation MIRROR `figtext.group`'s own `same`
# predicate — a reader that splits where figtext would not merge moves block boundaries.
SIZE_TOL = 0.2      # pt, figtext.group: abs(r.size - p.size) < 0.2

# 🔴 ROTATION MUST MATCH EXACTLY, AND figtext's `< 3` DEGREES MUST NOT BE COPIED HERE
# EITHER — for the same reason as the gap window below: it is a RUN-level constant being
# asked a CHAR-level question. ARC TEXT is laid out glyph by glyph along a circle, and on
# `CNX_Chem_01_01_SciMethod` its per-glyph steps are 2.33-6.54 degrees — STRADDLING 3. So
# a 3-degree tolerance merges part of an arc and splits the rest: measured, the single arc
# label 'not consistent with' came out as 'no' 't ' 'consisten' 't ' 'w' 'it' 'h'.
# ▶ AND A HALF-MERGED ARC IS WORSE THAN EITHER EXTREME, because `figtext`'s arc rule
# requires SINGLE-CHARACTER runs (`len(p['text']) <= 1 and len(r['text']) <= 1`), so one
# merged pair stops the whole label from being recognised as an arc at all.
# Exact equality is not a guess: over 9,917 consecutive same-font same-size char pairs from
# a 160-figure sample, 9,881 have a rotation delta of EXACTLY 0 and the other 36 are >= 12
# degrees — there is no float noise to absorb. The epsilon is belt-and-braces.
ROT_TOL = 1e-6      # deg — identical, not "close"

PROJ_TOL = 0.25     # x size. TIGHTER than figtext's 0.5: a sub/superscript is a separate
                    # run (as it is a separate Tj for the old reader) so it keeps its own
                    # size and colour; figtext.group's `script` rule re-merges it into the
                    # same BLOCK, so the key is unaffected and the composer draws it right.

# 🔴 THE BASELINE-GAP WINDOW IS RELATIVE TO THE FONT SIZE, AND figtext's ABSOLUTE
# `-0.5 <= gap < 2.5` MUST NOT BE COPIED HERE. figtext applies that to whole RUNS, where
# intra-word kerning is already folded into the run's advance and therefore invisible.
# This module compares CHAR to CHAR, where a kern pair is exactly what the window has to
# admit — and `-0.5` does not admit it. Measured before the fix: `Periodic T|able of the
# Elements`, `T|emperature (°C)` and `Absorpti|on (1/m)` were all split by their own kern.
#
# Both bounds are MEASURED, not chosen. Over 8,098 same-line char pairs from a 160-figure
# sample (sizes >= 2pt), the relative gap `(along(cur) - along(prev) - prev.adv) / size` is
# sharply bimodal:
#   contiguous  -0.111 .. +0.075   (kern pairs below zero; non-zero Tc letterspacing above)
#   a real break  <= -0.520  or  >= +0.628
# and the band between is EMPTY. Every one of the 30 pairs in |rel| 0.2..1.2 was read with
# its context and is a genuine break between separate labels — `Se4p3|Te|Te` in a table,
# `Element|Quantity` in a header, `0|100|120` on an axis — so the window is deliberately
# TIGHT. Widening it glues neighbouring labels into one purchased block, which is the
# defect the old reader had.
GAP_LO_REL, GAP_HI_REL = -0.25, 0.30   # ~2x margin to the nearest member of either class

CID = '(cid:'       # pdfminer's marker for a glyph it could not map to Unicode

# H7 (ruling R-12). When pdfminer cannot parse a colour operand it logs this and leaves
# graphicstate.ncolor UNCHANGED, so the char silently carries the PREVIOUS colour —
# indistinguishable from a real one. There is no per-char signal, so the honest move is to
# COUNT the warnings per figure and say the fills on that figure are unreliable. Reporting
# "H7 occurrences: 0" from the char stream would be a count from a blind instrument.
H7_WARNING = 'Cannot set non-stroke color'
H7_NOTE = ('pdfminer leaves the previous colour in place when it cannot parse a colour '
           'operand, so fills on a figure with a non-zero count here are unreliable; '
           'there is no per-char signal.')

# Ghostscript argv, duplicated VERBATIM from read_layer_accept.py's `staged()`. It cannot
# be imported (the harness imports this module, so the dependency would be circular) and
# the two must not drift: a different -d flag is a different rasterisation, which reads as
# a reader difference.
GS_ARGV = ['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-dEPSCrop', '-sDEVICE=pdfwrite']
STAGED_EXTS = ('.eps', '.ai')


def _norm(name):
    """A PDF name as pdfminer reports it: no leading slash."""
    return str(name).lstrip('/')


def _join_names(fobj):
    """Every name a pdfminer `char['fontname']` could carry for this font object.

    pdfminer takes the fontname from /FontDescriptor/FontName, falling back to /BaseFont.
    Measured on this corpus: /BaseFont == /FontDescriptor/FontName on 6,119 of 6,119 font
    objects, so for a simple font either works. A /Type0 is the exception — its descriptor
    lives on the DESCENDANT font, so the page-level dict alone does not carry the name
    pdfminer will report. All candidates are registered rather than guessing which.
    """
    names = set()
    for k in ('/BaseFont', '/FontName'):
        v = fobj.get(k)
        if v is not None:
            names.add(_norm(v))
    desc = fobj.get('/FontDescriptor')
    if desc is not None:
        v = desc.get('/FontName')
        if v is not None:
            names.add(_norm(v))
    kids = fobj.get('/DescendantFonts')
    if kids is not None:
        for kid in kids:
            names |= _join_names(kid)
    return names


def _font_entry(fobj):
    """One `meta['fonts']` value.

    `first`/`last` are None for /Type0: those carry /W, not /FirstChar, and the OLD reader
    crashed on exactly that (`AttributeError: /FirstChar`, 8 figures). The subset signal a
    consumer wants is the 'ABCDEF+' BaseFont prefix, which survives either way.
    `decodable` is filled in later, from the text pdfminer actually produced.
    """
    def num(key):
        v = fobj.get(key)
        return None if v is None else int(v)

    return dict(base=str(fobj.get('/BaseFont', '')),
                first=num('/FirstChar'),
                last=num('/LastChar'),
                subtype=str(fobj.get('/Subtype', '')),
                encoding=str(fobj.get('/Encoding', '')),
                decodable=True)


def _font_table(page):
    """-> ({scope_key: entry}, {pdfminer_fontname: [scope_key, ...]})

    Walks the page's own /Resources/Font and then, recursively, every /Form XObject's own
    /Resources/Font — 4,765 of 5,097 form XObjects in the 274 form-text figures have one.
    The visited set is keyed on `objgen`: measured form nesting depth is 1, but a cycle is
    representable in the file format and a recursive walk without a guard hangs on it.
    """
    entries, by_name = {}, collections.defaultdict(list)
    seen = set()

    def walk(res, scope):
        fonts = res.get('/Font')
        if fonts is not None:
            for name, fobj in fonts.items():
                key = f'{scope}/{_norm(name)}'
                if key in entries:
                    continue
                entries[key] = _font_entry(fobj)
                for n in _join_names(fobj):
                    by_name[n].append(key)
        xobjects = res.get('/XObject')
        if xobjects is None:
            return
        for name, xobj in xobjects.items():
            if str(xobj.get('/Subtype', '')) != '/Form':
                continue
            objgen = xobj.objgen
            if objgen in seen:
                continue
            seen.add(objgen)
            sub = xobj.get('/Resources')
            if sub is not None:
                walk(sub, f'{scope}/{_norm(name)}')

    res = pikepdf.Page(page).obj.get('/Resources')
    if res is not None:
        walk(res, 'PAGE')
    return entries, by_name


def _fill(char, unknown):
    """Normalise ANY colour space to ('cmyk', c, m, y, k).

    `compose.cmyk` unpacks exactly five values — a 4-tuple and a 6-tuple both raise
    ValueError — and returns (0,0,0), i.e. black, for None. Measured over a 120-figure
    sample: DeviceCMYK 9,157 chars, DeviceRGB 37, DeviceGray 6, and no None. The
    conversions are exact round-trips through `compose.cmyk`.

    pdfminer's ncolor can also be a PATTERN NAME (a str) or a (base_color, pattern_name)
    tuple, neither of which is a colour. Those become None — black — rather than a
    malformed tuple that raises at draw time.
    """
    value = char.get('non_stroking_color')
    if value is None:
        return None
    if not isinstance(value, (list, tuple)):
        value = (value,)
    if not value or not all(isinstance(v, (int, float)) and not isinstance(v, bool)
                            for v in value):
        unknown[f'non-numeric:{str(char.get("ncs"))}'] += 1
        return None
    space = str(char.get('ncs') or '')
    vals = [float(v) for v in value]
    # 🔴 DISPATCH ON THE COLOUR SPACE, NEVER ON THE COMPONENT COUNT. A /Separation
    # carries ONE component exactly as DeviceGray does and means the OPPOSITE by it:
    # tint 1.0 is FULL colorant, where DeviceGray 1.0 is white. Under the arity branch
    # this file used to carry, `('cmyk',0,0,0,1.0-vals[0])` turned 91 solid-black
    # characters into ('cmyk',0,0,0,0) -> RGB (1,1,1), and `svgout.write_svg` published
    # `fill="#ffffff"` on labels whose English `strip-text.py` had already removed. The
    # purchased Icelandic would have been ABSENT, not merely mis-coloured. Measured on
    # the only three figures in this corpus carrying an unrecognised space:
    # CNX_Chem_14_07_titration2 (44 chars), _18_07_Nitrogen (45), _21_06_Penetrate (2);
    # their tint transform decodes to DeviceCMYK (0,0,0,t), i.e. 100% black ink at t=1.
    # ▶ An unrecognised space now returns None, which `compose.cmyk` and `svgout` render
    # BLACK — which is what the comment that stood here ("must be VISIBLE rather than
    # quietly turning black") was reaching for: black is visible, white is not. Pinned by
    # test_readlayer.py CASE 7c, whose positive control is a real DeviceCMYK k=1.0 run on
    # the SAME figure.
    if space == 'DeviceCMYK' and len(vals) == 4:
        return ('cmyk',) + tuple(vals)
    if space == 'DeviceRGB' and len(vals) == 3:
        r, g, b = vals
        k = 1.0 - max(r, g, b)
        if k >= 1.0:
            return ('cmyk', 0.0, 0.0, 0.0, 1.0)
        return ('cmyk', (1 - r - k) / (1 - k), (1 - g - k) / (1 - k),
                (1 - b - k) / (1 - k), k)
    if space == 'DeviceGray' and len(vals) == 1:
        return ('cmyk', 0.0, 0.0, 0.0, 1.0 - vals[0])
    # Two distinguishable records, because they are different faults: a space we do not
    # know (`Separation:1`), and a space we DO know arriving with the wrong number of
    # components (`arity:DeviceRGB:4`). Both are refused; neither is guessed at.
    if space in ('DeviceCMYK', 'DeviceRGB', 'DeviceGray'):
        unknown[f'arity:{space}:{len(vals)}'] += 1
    else:
        unknown[f'{space}:{len(vals)}'] += 1
    return None


def _visual_size(char, matrix):
    """The font's VISUAL size in user space, at any rotation.

    🔴 `char['size']` IS ONLY THE FONT SIZE FOR UPRIGHT TEXT. pdfminer sets
    `LTChar.size = self.height`, and `height` is the AXIS-ALIGNED bbox height — so on text
    rotated 90 degrees it is the glyph's WIDTH, which varies per glyph. Measured on
    `CNX_Chem_00_EE_Density_img`'s vertical axis label: pdfplumber reports 4.500 for 'k',
    5.004 for 'g', 2.502 for '/', 7.497 for 'm' where the real size is 9.0 throughout. On
    `CNX_Chem_01_01_SciMethod`'s arc text (rotations 84-100 degrees) it ranges 4.7-8.0.
    ▶ Taken at face value it makes every rotated LABEL look like a size change per
    character, which splits it into one run per glyph — and a 4+-run block of one-character
    runs is an ARC to `figtext.is_arc`, so the block key silently loses its '|' separators.
    That is a purchased-key defect, and no count can see it.

    pdfminer builds the char's box in TEXT space as (0, descent+rise) to (adv, +fontsize),
    then takes the axis-aligned bounds of its image. For a matrix (a, b, c, d, ., .) the
    extents of that parallelogram are therefore
        W = |adv*a| + |fontsize*c|      H = |adv*b| + |fontsize*d|
    and both W and H are given. Solving whichever equation has the larger denominator (the
    other is singular at 0 or 90 degrees) recovers the Tf-operand size, and multiplying by
    the length of the transformed 'up' vector gives the visual size.

    ⚠️ This does NOT reintroduce the hypot() error ruling R-5 forbids: it scales by
    hypot(m[2], m[3]) — the UP direction — where R-5's mistake was hypot(m[0], m[1]), the
    BASELINE direction, which ghostscript leaves unit-scaled. Where the two disagree is
    exactly the EPS case. `test_readlayer.py` pins agreement with `char['size']` on every
    upright char, which is the population R-5 measured.
    """
    a, b, c, d = matrix[0], matrix[1], matrix[2], matrix[3]
    adv = float(char['adv'])
    width = float(char['x1']) - float(char['x0'])
    height = float(char['y1']) - float(char['y0'])
    if abs(c) >= abs(d):
        size = (width - abs(adv * a)) / abs(c) if abs(c) > 1e-9 else 0.0
    else:
        size = (height - abs(adv * b)) / abs(d) if abs(d) > 1e-9 else 0.0
    size *= math.hypot(c, d)
    # A degenerate or skewed matrix can leave nothing to solve. `char['size']` is right for
    # upright text, which is what such a matrix almost always is.
    return size if size > 1e-6 else float(char['size'])


def _angle_delta(a, b):
    """Signed-shortest angular distance in degrees. A plain subtraction calls 179.9 and
    -179.9 a 359.8-degree turn and splits a run that never rotated."""
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _along(x, y, rot):
    a = math.radians(rot)
    return x * math.cos(a) + y * math.sin(a)


def _proj(x, y, rot):
    a = math.radians(rot)
    return -x * math.sin(a) + y * math.cos(a)


def _prepare(chars, resolve_font, unknown):
    """pdfplumber chars -> the per-char facts the run splitter needs."""
    out = []
    for char in chars:
        matrix = [float(v) for v in char['matrix']]
        out.append(dict(
            text=char.get('text') or '',
            font=resolve_font(char.get('fontname')),
            size=_visual_size(char, matrix),
            rot=math.degrees(math.atan2(matrix[1], matrix[0])),
            x=matrix[4], y=matrix[5],
            # The glyph's own advance in USER space. `char['adv']` is expressed in the
            # matrix's source space, so the matrix scale is what carries it into user
            # space — and that is true for BOTH producer idioms (see the header).
            adv=float(char['adv']) * math.hypot(matrix[0], matrix[1]),
            fill=_fill(char, unknown),
            tm=matrix))
    return out


def _continues(prev, cur):
    """Does `cur` belong to the run `prev` ends?

    Size and rotation mirror `figtext.group`'s own tests, so a run boundary here is one
    figtext would have drawn anyway. Colour is added because `compose.py` sets the pen
    once per RUN: merging two colours into one run would draw the second in the first's
    colour, which no count in the harness can see.
    """
    if cur['font'] != prev['font'] or cur['fill'] != prev['fill']:
        return False
    if abs(cur['size'] - prev['size']) >= SIZE_TOL:
        return False
    if _angle_delta(cur['rot'], prev['rot']) >= ROT_TOL:
        return False
    rot = prev['rot']
    size = max(prev['size'], 1e-6)
    if abs(_proj(cur['x'], cur['y'], rot) - _proj(prev['x'], prev['y'], rot)) \
            >= PROJ_TOL * size:
        return False
    gap = (_along(cur['x'], cur['y'], rot) - _along(prev['x'], prev['y'], rot)
           - prev['adv'])
    return GAP_LO_REL * size <= gap < GAP_HI_REL * size


def _to_runs(prepared):
    """Merge chars into runs. Rounding matches the old reader's, so a diff of the two
    readers' output is a diff of the DERIVATIONS and not of float formatting.

    ⚠️ Chars MUST merge into multi-char runs. `figtext.is_arc` is
    `len(b) > 3 and all(len(r['text'].strip()) <= 1 ...)`, so a reader that emitted one
    run per char would make every 4+-character block an ARC — and an arc's block key is
    the bare concatenation with no '|' line separators. The key would change on most of
    the corpus while every count stayed healthy.
    """
    runs = []
    group = []

    def flush():
        if not group:
            return
        first, last = group[0], group[-1]
        rot = first['rot']
        adv = (_along(last['x'], last['y'], rot) - _along(first['x'], first['y'], rot)
               + last['adv'])
        runs.append(dict(text=''.join(c['text'] for c in group),
                         font=first['font'],
                         size=round(first['size'], 4),
                         rot=round(rot, 3),
                         x=round(first['x'], 4),
                         y=round(first['y'], 4),
                         adv=round(adv, 3),
                         fill=first['fill'],
                         tm=[round(v, 5) for v in first['tm']]))

    for char in prepared:
        if group and _continues(group[-1], char):
            group.append(char)
            continue
        flush()
        group = [char]
    flush()
    return runs


def _looks_undecoded(text):
    """The predicate `read_layer_accept.classify_type0` judges by, deliberately the same:
    a reader whose `decodable` flag disagreed with the judge's `looks_undecoded` would
    declare a font readable and then be marked FAIL-silent for its output.

    ⚠️ LATENT DEFECT, RECORDED AND DELIBERATELY NOT FIXED (R4b). The control-byte test
    CAN CONDEMN CORRECTLY-READ TEXT. `_looks_undecoded('\x1f bond')` returns True, but
    under a /Differences font `\x1f` is a REAL GREEK ALPHA (see blockkey.py's docstring;
    '\x1f bond' is a genuine block key in this corpus), so that is a correct read being
    called garbage. Since R4b this predicate also decides SPEND via `figtext.sendable`,
    which makes the consequence "a real label is never bought" rather than merely "a
    font is flagged".

    MEASURED: 0 occurrences across 120 figures — latent, not firing. It is left alone
    because the fix must change the JUDGE's `classify_type0` in the same breath (the two
    are deliberately identical, and a reader that disagreed with the judge would be
    marked FAIL-silent), which is a larger change than R4b's decision-unit correction.
    """
    if CID in text:
        return True
    return any(ord(ch) < 0x20 and ch not in '\t\n\r' for ch in text)


def _mark_decodable(runs, fonts):
    """Set `decodable: False` on every font whose text pdfminer could not map to Unicode.

    The evidence is the OUTPUT, not the font structure. pdfminer's own
    `handle_undefined_char` returning '(cid:N)' IS the "cannot decode" event; a structural
    second detector would be a second opinion about the thing that already happened.

    ⚠️ A font that produced NO chars has no evidence either way and stays `True`. That is
    reported (`fonts_unexercised` in meta) rather than assumed away — a font table lists
    every font the file declares, and most figures draw with a few of them.
    """
    exercised = set()
    for run in runs:
        exercised.add(run['font'])
        if _looks_undecoded(run['text']) and run['font'] in fonts:
            fonts[run['font']]['decodable'] = False
    return len(fonts) - len(exercised & set(fonts))


def _stage(path):
    """.eps/.ai -> a temp .pdf via ghostscript. Returns (path_to_read, temp_to_unlink)."""
    if path.suffix.lower() not in STAGED_EXTS:
        return path, None
    handle = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    handle.close()
    result = subprocess.run(GS_ARGV + [f'-sOutputFile={handle.name}', str(path)],
                            capture_output=True, timeout=120)
    if result.returncode != 0 or os.path.getsize(handle.name) == 0:
        os.unlink(handle.name)
        raise RuntimeError(f'gs failed on {path.name}: exit {result.returncode}')
    return Path(handle.name), handle.name


def read(pdf_path):
    """-> (runs, meta, outcome). See § CONTRACT FOR TASK R2 in read_layer_accept.py.

    `pdf_path` may be a .pdf, or an .eps/.ai which is staged through ghostscript here.
    🔴 `meta['source']` is the path GIVEN — the ORIGINAL artwork, never the staged temp.
    `publish-figure-svg.js` cross-checks `basenameFromMeta` against the sidecar key and
    refuses AFTER payment, so a temp-file basename here is a bill with nothing to show.
    """
    source = Path(pdf_path)
    target, temp = _stage(source)
    unknown = collections.Counter()
    handler = _WarningCounter()
    logger = logging.getLogger('pdfminer')
    logger.addHandler(handler)
    try:
        with pikepdf.open(str(target)) as pdf:
            page = pdf.pages[0]
            fonts, by_name = _font_table(page)
            box = pikepdf.Page(page).mediabox
            # [box[2], box[3]] and not width/height: `compose.dev()` was calibrated
            # against exactly these two numbers from the reader being replaced.
            page_size = [float(box[2]), float(box[3])]

        unscoped = collections.Counter()

        def resolve_font(fontname):
            """pdfminer's fontname -> a key of `meta['fonts']`.

            Where several scopes share one BaseFont the first in walk order is taken:
            they resolve to the same `base`, so every consumer (compose's BOLD set, the
            harness's cross-reader join) sees the same answer whichever is picked. The
            case that MATTERS is the opposite one — one resource key naming two BaseFonts
            — and there the names differ, so the scopes separate correctly.
            """
            name = _norm(fontname or '')
            keys = by_name.get(name)
            if keys:
                return keys[0]
            # A font pdfminer used that the resource walk never saw. Minted so that
            # `run['font']` stays a key of `meta['fonts']` — the join property the
            # harness and compose.py both depend on — and COUNTED so that the fallback
            # firing is a number in the report rather than a silent repair.
            key = f'UNSCOPED/{name}'
            if key not in fonts:
                fonts[key] = dict(base=name, first=None, last=None, subtype='',
                                  encoding='', decodable=True)
            unscoped[key] += 1
            return key

        with pdfplumber.open(str(target)) as doc:
            # laparams stays at its default None. Any LAParams reorders chars into
            # textboxes and destroys content-stream order, which figtext.group depends on.
            chars = doc.pages[0].chars
        runs = _to_runs(_prepare(chars, resolve_font, unknown))
    finally:
        logger.removeHandler(handler)
        if temp:
            try:
                os.unlink(temp)
            except OSError:
                pass

    unexercised = _mark_decodable(runs, fonts)
    meta = dict(source=str(source), fonts=fonts, page=page_size, runs=len(runs),
                reader='pdfplumber', chars=len(chars),
                staged=bool(temp),
                color_warnings=handler.count, color_warning_note=H7_NOTE,
                fonts_unexercised=unexercised,
                unscoped_fonts=dict(unscoped),
                unknown_colorspaces=dict(unknown))
    return runs, meta, 'reads' if any(r['text'] for r in runs) else 'empty'


class _WarningCounter(logging.Handler):
    """Counts H7 warnings for ONE read. Attached before `.chars` is touched, because
    pdfplumber interprets lazily — nothing is parsed at open() time — and removed in a
    `finally`, so a raise cannot leave it attached to the global pdfminer logger."""

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.count = 0

    def emit(self, record):
        try:
            if H7_WARNING in record.getMessage():
                self.count += 1
        except Exception:      # a handler that raises would abort the read it observes
            pass
