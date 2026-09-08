"""Figure text model: group positioned runs into blocks/lines, detect alignment,
and lay translated text back with the block's own geometry. Pure geometry -
no assumption that text is centred, and lines are split on the text NORMAL so
rotated blocks work the same as horizontal ones."""
import math, json, re

def proj(r):
    """distance along the text normal (which line of the block a run sits on)"""
    a = math.radians(r['rot'])
    return -r['x']*math.sin(a) + r['y']*math.cos(a)

def along(r):
    a = math.radians(r['rot'])
    return r['x']*math.cos(a) + r['y']*math.sin(a)

def group(runs):
    # A figure with no live text is a REAL corpus state, not a caller error:
    # CNX_Chem_06_01_Vibrstring reads 0 runs (outcome 'empty'), and this line used to
    # take emit-blocks.py down with an IndexError on it. Returning [] lets the caller
    # write an empty blocks.json and say "nothing to buy" instead of crashing.
    if not runs: return []
    blocks=[]; cur=[runs[0]]
    for p,r in zip(runs, runs[1:]):
        same = abs(r['size']-p['size'])<0.2 and abs(r['rot']-p['rot'])<3
        adjacent = -0.5 <= along(r)-along(p)-p['adv'] < 2.5
        cont = same and abs(proj(r)-proj(p))<0.5*p['size'] and adjacent
        # Sub/superscripts are a SIZE change plus a small baseline shift, and they
        # are the same line: H2O(g) is drawn as 'H'(9pt) '2'(7pt, -2pt) 'O('(9pt,
        # +2pt) ... Splitting them makes a chemical formula look like five separate
        # translatable labels - and translating any of them wrecks it.
        script = (adjacent and abs(r['rot']-p['rot'])<3
                  and abs(proj(r)-proj(p)) < 0.45*max(p['size'], r['size'])
                  and 0.4 <= r['size']/p['size'] <= 2.5)
        nl   = same and abs((proj(p)-proj(r)) - p['size']*1.222) < 2.0 and abs(along(r)-along(p))<45
        arc  = (abs(r['size']-p['size'])<0.2 and len(p['text'])<=1 and len(r['text'])<=1
                and abs(r['rot']-p['rot'])<12
                and math.hypot(r['x']-p['x'], r['y']-p['y']) < p['size']*1.6)
        if cont or script or nl or arc: cur.append(r)
        else: blocks.append(cur); cur=[r]
    blocks.append(cur)
    return blocks

def is_arc(b):
    return len(b)>3 and all(len(r['text'].strip())<=1 for r in b)

def merge_blocks(blocks):
    """join blocks that are consecutive LINES of one visual block - they get split
    when a line changes colour (emphasis) or font."""
    if not blocks: return []          # group([]) is [] - see the note there
    out=[blocks[0]]
    for b in blocks[1:]:
        p=out[-1]
        if is_arc(p) or is_arc(b): out.append(b); continue
        if (abs(b[0]['size']-p[0]['size'])<0.2 and abs(b[0]['rot']-p[0]['rot'])<3
            and abs((proj(p[-1])-proj(b[0])) - p[0]['size']*1.222) < 2.0
            and abs(along(b[0])-along(p[0])) < 60):
            out[-1] = p + b
        else: out.append(b)
    return out

def lines(b):
    out=[]; buf=[b[0]]
    for x,y in zip(b,b[1:]):
        if abs(proj(y)-proj(x)) < 0.5*max(x['size'], y['size']): buf.append(y)
        else: out.append(buf); buf=[y]
    out.append(buf); return out

def alignment(b, measure):
    """'left' | 'center' | 'right', decided from the ORIGINAL line geometry"""
    ls=lines(b)
    if len(ls)<2: return 'center'
    starts=[along(l[0]) for l in ls]
    widths=[sum(measure(r['text'], r) for r in l) for l in ls]
    ends=[s+w for s,w in zip(starts,widths)]
    cents=[s+w/2 for s,w in zip(starts,widths)]
    spread=lambda v: max(v)-min(v)
    cands={'left':spread(starts), 'center':spread(cents), 'right':spread(ends)}
    return min(cands, key=cands.get)


VERBATIM = None  # see looks_verbatim


def looks_verbatim(text):
    """Heuristic: does this block look like a formula / symbol / number rather
    than prose?  H2O(g), 25, mL, (a), Fe2O3 must NEVER be sent to the MT - they
    are identical in Icelandic and translating them corrupts chemistry.

    A block counts as prose if it contains a run of 3+ letters. This is a triage
    aid for the census, NOT an authority - a human confirms before anything is
    bought."""
    import re as _re
    return not _re.search(r'[A-Za-z\u00C0-\u017F]{3,}', text)



def undecodable_fonts(block, fonts):
    """The fonts this block draws with that are NOT known-decodable (ruling R-8).

    `fonts` is `meta['fonts']` as `readlayer.read` produced it: keyed by the scope-
    qualified font key that `run['font']` also carries, with `decodable: False` set on
    any font whose bytes pdfminer could not map to Unicode.

    ⚠️ A font key that is ABSENT from `fonts` counts as undecodable. It means
    `runs.json` and `meta.json` are out of step — `readlayer.resolve_font` mints an
    `UNSCOPED/...` entry precisely so this cannot happen — and the cheap direction of a
    spend gate is to hold money back and say so. The caller REPORTS the names; a silent
    fail-closed would be a gate nobody can debug.
    """
    return sorted({r['font'] for r in block
                   if fonts.get(r['font'], {}).get('decodable') is not True})


def missing_fonts(block, fonts):
    """The fonts this block draws with that meta.json does not describe AT ALL.

    A PLUMBING fault, not a text fault, and deliberately kept separate from the
    decodability decision below: it means `runs.json` and `meta.json` are out of step
    (`readlayer.resolve_font` mints an `UNSCOPED/...` entry precisely so this cannot
    happen), and the cheap direction of a spend gate is to hold money back and say so.
    """
    return sorted({r['font'] for r in block if r['font'] not in fonts})


def sendable(block, joined, fonts):
    """Should this block be BOUGHT?  (ruling R-8, COMPLETED by R4b)

    Three independent reasons to hold money back, and they catch different things:
      * `looks_verbatim` — it is a formula/symbol/number, identical in Icelandic;
      * the block's OWN TEXT did not decode — it is control-byte garbage, so
        translating it buys mojibake;
      * a font it draws with is missing from meta.json — the plumbing is broken.

    🔴 THE DECODABILITY CLAUSE JUDGES THE BLOCK, NOT THE FONT — R4b, and R-8 is
    COMPLETED rather than overturned. R-8 said `decodable` must be CONSUMED; it did not
    say at what unit, and R4 read it conservatively as per-font. But `decodable: False`
    is a property of a FONT, set the moment that font produces one unreadable run
    ANYWHERE in the figure, while the unit of PURCHASE is a BLOCK. Measured on
    CNX_Chem_05_02_FoodLabel — the only figure in 120 carrying an undecodable font —
    the per-font rule held 24 blocks where a per-block rule holds 2: 22 FALSE
    POSITIVES, 92% of all holds. The 2 real ones carry a bullet glyph
    ('(cid:127) 5% or less'); the 22 withheld are clean English — 'Nutrition Facts',
    'Calories 250', 'Total Fat 12g', '% Daily Value*'. Refusing to buy those is not
    caution, it is a figure that silently ships in English.

    The FLAG stays per-font (it is a font property, and the judge's `classify_type0`
    expects it); only the DECISION moves. `undecodable_fonts` is unchanged and is what
    emit-blocks.py REPORTS with, so a held block still names the font responsible.

    🔴 The decodability clause is not redundant with `looks_verbatim`, and the ORDER OF
    EVENTS is why. Before the pdfplumber reader, undecodable text arrived as bytes like
    '\x00\x0b\x00D' which `looks_verbatim` calls verbatim — TRUE, but by luck: it
    contains no run of 3+ letters. Nothing was gating on decodability; the garbage was
    held back by an accident of the prose heuristic. A reader that decodes more will
    eventually decode something PARTIALLY, and a partially-decoded block reads as prose
    and becomes sendable. This clause is what makes the hold deliberate.

    ⚠️ The predicate is IMPORTED from readlayer, never copied. `readlayer._looks_undecoded`
    is deliberately identical to the judge's `classify_type0`, and a third implementation
    is how the two drift apart. The import is function-local on purpose: `readlayer`
    pulls in pdfplumber at module scope, and `read_layer_accept.py` imports it LAZILY so
    that "readlayer.py is not importable" stays a reportable contract failure rather than
    a crash at line 66.
    """
    from readlayer import _looks_undecoded
    return (not looks_verbatim(joined)
            and not _looks_undecoded(joined)
            and not missing_fonts(block, fonts))


def normalise_block_value(value, arc):
    """A sidecar block value is ONE STRING; the composer wraps it itself.

    Accepts a list for backward compatibility with the placeholder translation
    files, but never requires one. Pre-split lines are exactly what let a wrap
    defect hide during the placeholder era: the composer was always handed line
    breaks somebody else had already decided, so the one thing the real MT does
    differently was the one thing never exercised.

    An ARC block is laid out glyph by glyph along a fitted circle, so it stays a
    single string; a non-arc block becomes a list of lines.
    """
    if arc:
        return value if isinstance(value, str) else ''.join(value)
    return [value] if isinstance(value, str) else list(value)


# pdfminer's placeholder for a glyph it could not map to Unicode: `(cid:127)`.
# ⚠️ TWO REPRESENTATIONS OF ONE TOKEN, IN TWO MODULES, AND THEY MUST NOT DRIFT.
# `readlayer.CID` is the DETECTOR ('(cid:' as a substring, which is what `_looks_undecoded`
# and therefore `sendable` key on); this is the REMOVER, and it has to match everything the
# detector finds or a held block is drawn with its placeholder anyway. Asserted against
# `readlayer.CID` rather than described - test_figure_compose.py case 9i.
_CID_TOKEN = re.compile(r'\(cid:\d+\)')


def strip_undecodable(value):
    """Remove pdfminer's `(cid:N)` placeholders from text that is about to be DRAWN.

    🔴 A PLACEHOLDER IS NEVER READER-FACING CONTENT, AND THE DRAW SITE IS THE ONLY PLACE
    IT CAN REACH A READER. A block whose own text did not decode is held back from the MT
    by `sendable`, so it takes compose.py's ENGLISH-KEPT branch - and `strip-text.py` has
    already removed EVERY glyph from the artwork, so the label is redrawn from this text or
    not at all. Measured 2026-09-07 on CNX_Chem_05_02_FoodLabel (47 blocks, 28 sendable,
    2 undecoded): figure-compose.py exited 0 and translated.svg carried two live elements
    reading `(cid:127) 5% or less` and `(cid:127) 20% or`, under the driver's VERDICT ok.

    ⚠️ IT IS NOT DONE AT EXTRACTION, DELIBERATELY. The token is the POSITIVE EVIDENCE the
    hold is keyed on (`readlayer._looks_undecoded`); removing it upstream would make an
    undecodable block read as clean prose and send it to the paid MT.

    ⚠️ IT REMOVES THE TOKEN, NOT THE LABEL. On the measured figure the surrounding text
    ('5% or less') is ordinary English that DID decode, and blanking the line would erase
    it - a silent deletion, which compose.py's own ENGLISH-KEPT branch exists to avoid.

    `value` is a str (an arc block, laid out glyph by glyph) or a list of line strings;
    the shape is preserved so the caller's arc/straight branch stays the one decision.
    """
    if isinstance(value, str):
        return _CID_TOKEN.sub('', value).strip()
    return [_CID_TOKEN.sub('', line).strip() for line in value]
