"""Figure text model: group positioned runs into blocks/lines, detect alignment,
and lay translated text back with the block's own geometry. Pure geometry -
no assumption that text is centred, and lines are split on the text NORMAL so
rotated blocks work the same as horizontal ones."""
import math, json, re, unicodedata
import numloc   # stdlib-only sibling (§C140 ⑨); imports nothing from this experiment

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

# §C140 ㉑: two `lines` whose first runs sit closer than this fraction of a LEAD (1.222 x size) along the
# text normal are ONE visual line. MEASURED, NOT CHOSEN: over the 2,925 send:true non-arc blocks of the
# 2026-09-13 census the merges are flat at 21 blocks in 14 figures for every fraction 0.5-0.8 and jump to
# 29 in 19 at 0.9; the nearest genuine two-line labels sit 0.806 and 0.837 of a lead apart, the widest
# charge/superscript split 0.409 (design spec docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-
# design.md, D3). `visual_lines` IS instrument A of the frozen
# evidence/2026-09-15-t23-review-fixes/instruments/code1_exposure.py (`visual_a`), plus the arc carve-out
# and the blank-line fold (§C140 '6', M2: a line of only U+0020 is no line - see `visual_lines`).
# Re-measure before moving it; do not tune it.
VISUAL_LEAD_FRACTION = 0.6


def visual_lines(b):
    """`lines(b)` with consecutive lines that sit on ONE visual line merged - §C140 ㉑.

    `lines` splits on a baseline jump >= 0.5 x size, so a one-line source label with a stacked charge
    or a same-size superscript - `nitrites (NO2|–`, `ammonium (NH4|+|)`, `NH4|+ (conjugate acid)` -
    reads as 2-3 lines, and a layout that counts source lines with it draws the translation on 2-3
    lines. Line i+1 merges onto the ACCUMULATED line when its first run's proj differs from the
    accumulated line's FIRST run's proj by < VISUAL_LEAD_FRACTION x 1.222 x the larger of the two
    first-run sizes; chains merge onto the accumulated line. An arc (`is_arc`) is returned as
    `lines(b)`: its runs are not lines. A merged line's first run is the run that opens the source
    line, and compose.py reads that line's baseline (`projs`), font and colour from it: on all 21
    measured merges it is the body run, never the script.

    A line whose runs draw only U+0020 (`is_blank_line`: the next row's indent space, attached to the
    block above by group()'s `nl` rule) is no line of its own: it folds into the line before it (the
    next, when first). Identity when no line is blank or every line is. The fold's geometry-free view is
    `visual_ink`; the pre-fold lines are `visual_lines_unfolded`.

    🔴 FOR THE LAYOUT'S OWN LINE COUNT AND SOURCE CUES ONLY - compose.py's `n_src` and, through
    `visual_ink`, its `starts` / `ends` / `projs` and per-line font index; heldplan's `line-count`.
    figcontainers' `own_line_frames` (the block's OWN cell / open alignment) reads
    `visual_lines_unfolded`. NEVER the block key: `blockkey.block_lines` stays on `lines`, so no
    bought key, sidecar value or renderHash moves. NEVER another block's frames: `line_frames` (sibling
    cues, free-box obstacles) stays on `lines`, because this rule merges a genuine diagonal kept label
    (CNX_Chem_10_06_CbcCltPckd `C|B|A`: 3 lines -> 2) and would move the frames neighbouring labels align against and avoid in up to 18
    bought figures (measured 2026-10-03, applied to every block: ONE drawn label moves,
    CNX_Chem_17_02_Galvanicel `Flow of cations`, align right -> center)."""
    return _visual(b)[0]


def visual_ink(b):
    """Per visual line, its runs WITHOUT the blank lines `visual_lines` folded into it - the runs that carry the
    line's geometry (start, end, baseline, first run). == visual_lines(b) on every block with no blank visual
    line (all but 3 of 11,200 chemistry blocks, census 2026-10-05: FoodLabel `(cid:127) 5% or less| `,
    `(cid:127) 20% or| `, `more is| `)."""
    return _visual(b)[1]


def visual_lines_unfolded(b):
    """The visual lines BEFORE the blank-line fold - what `visual_lines` returned before it. Read ONLY by
    figcontainers.own_line_frames (the ALIGNMENT decision): a blank line is the next row's indent space, and
    its left edge is real evidence of the label's text column (FoodLabel: the bullets and `more is` are
    decided left from it, and drawn at their source x 385.611 / 389.611). Folding it there too moved those 3
    blocks to the single-line margin rule (right / center / center) - measured, 2026-10-05."""
    return _visual(b)[2]


def is_blank_line(l):
    """A line whose runs draw only U+0020. NOT `.strip()`: '\\x1f' is a glyph (blockkey.py), and NBSP is not
    measured blank anywhere in the corpus (all 8 whitespace-only FT.lines are U+0020)."""
    t = ''.join(r['text'] for r in l)
    return t != '' and set(t) == {' '}


def _visual(b):
    ls = lines(b)
    if is_arc(b) or len(ls) < 2:
        return ls, ls, ls
    out = [ls[0]]
    for l in ls[1:]:
        p = out[-1]
        s = max(p[0]['size'], l[0]['size'])
        if abs(proj(l[0]) - proj(p[0])) < VISUAL_LEAD_FRACTION * 1.222 * s:
            out[-1] = p + l
        else:
            out.append(l)
    # A BLANK visual line (only U+0020 - the next row's indent space, attached by group()'s `nl` rule to
    # the block above) is never a line of its own: it folds into the line before it (the next, when first),
    # keeping the slices consecutive, and carries none of that line's geometry. Identity when no line is
    # blank, or when every line is.
    if not any(is_blank_line(l) for l in out) or all(is_blank_line(l) for l in out):
        return out, out, out
    vls, ink, lead = [], [], []
    for l in out:
        if is_blank_line(l):
            if vls:
                vls[-1] = vls[-1] + l
            else:
                lead = lead + l
        else:
            vls.append(lead + l)
            ink.append(l)
            lead = []
    return vls, ink, out

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

    §C140 '6' R-5a: an LF (U+000A) inside a str value is NOT whitespace to wrap - it is
    an editor's EXPLICIT line break, which compose.py honours (`explicit_lines`, below)
    or refuses by name. This function passes it through untouched.
    """
    if arc:
        return value if isinstance(value, str) else ''.join(value)
    return [value] if isinstance(value, str) else list(value)


def explicit_lines(raw, fmt, n_src, arc, joint=None):
    """§C140 '6' R-5a ([USER] 2026-10-05): -> (counts, error) for a translated value `raw` that may carry
    an editor's explicit line breaks (LF, U+000A). Pure; compose.py is the one caller.

    `fmt` is figscripts.transfer's per-character style list for `raw` with each LF read as a space (the
    same length, so every offset is the value's own), BEFORE compose elides its JOINT positions; None
    means no styles. `n_src` is the block's VISUAL source line count (figtext.visual_lines, blank lines
    folded). `joint` is figscripts.JOINT, passed in because this module may not import figscripts.

      (None, None)            no LF: not an explicit-break value - laid out as before, byte for byte
      (counts, None)          honoured: the number of words drawn on each line, counted on the string
                              figscripts.words is run on (JOINT positions elided), so the counts
                              partition the label's words
      (None, (reason, line))  refused: the label is drawn as if each LF were a space and figure-compose.py
                              refuses the figure. `line` is a 0-based line index, or None for a reason
                              about the whole value. Checked in this order, first refusal wins:
        'arc'             an arc block is drawn glyph by glyph along a circle and has no lines
        'empty-line'      a line that is empty or spaces only
        'edge-space'      a line with leading or trailing whitespace - a CR included ('a\r\nb')
        'invisible-line'  a line of only format, combining or control characters
                          (heldvalues.INVISIBLE_CATEGORIES; str.strip() keeps U+200B), which draws nothing
        'line-count'      more lines than the block has visual source lines: every drawn line sits on
                          a source row, so no height budget is needed and a one-line block takes no LF
        'break-at-joint'  the break falls on a position transfer marked JOINT (the MT wire's own joint
                          space, `NO2 –`), which compose ELIDES; `line` is the line the break would open
    """
    if '\n' not in raw:
        return None, None
    if arc:
        return None, ('arc', None)
    import heldvalues   # function-local: only an LF value reaches it, and heldplan's import set stays pure (HP0)
    segs = raw.split('\n')
    for i, sg in enumerate(segs):
        if not sg.strip():
            return None, ('empty-line', i)
        if sg != sg.strip():
            return None, ('edge-space', i)
        if all(unicodedata.category(c) in heldvalues.INVISIBLE_CATEGORIES for c in sg):
            return None, ('invisible-line', i)
    if len(segs) > n_src:
        return None, ('line-count', None)
    fmt = [None] * len(raw) if fmt is None else fmt
    counts, start = [], 0
    for i, sg in enumerate(segs):
        end = start + len(sg)
        if i and joint is not None and fmt[start - 1] is joint:
            return None, ('break-at-joint', i)
        drawn = ''.join(c for c, f in zip(sg, fmt[start:end]) if joint is None or f is not joint)
        counts.append(len(re.findall(r'\S+', drawn)))
        start = end + 1
    return counts, None


# pdfminer's placeholder for a glyph it could not map to Unicode: `(cid:127)`.
# ⚠️ TWO REPRESENTATIONS OF ONE TOKEN, IN TWO MODULES, AND THEY MUST NOT DRIFT.
# `readlayer.CID` is the DETECTOR ('(cid:' as a substring, which is what `_looks_undecoded`
# and therefore `sendable` key on); this is the REMOVER, and it has to match everything the
# detector finds or a held block is drawn with its placeholder anyway. The remover is
# `run_draw_text`; asserted against `readlayer.CID` - test_figure_compose.py 9i, test_figtext_runexact.py 4d.
_CID_TOKEN = re.compile(r'\(cid:\d+\)')


def is_identity(value, english, arc):
    """Did the MT give back what went on the wire?

    `value` is the RAW translations entry (a str, or a legacy list of lines); `english` is
    `blockkey.block_english(block)` - what emit-blocks.py SENT; `arc` is compose.py's
    draw-shape decision, used only to shape `value` the way the composer would draw it.

    TOKEN equality, not byte equality, and that is the equivalence already in force:
    `translate-blocks.mjs` `.trim()`s every reply, and compose.py's translated path reads a
    value only through `para.split()`, so two token-equal values already drew identically.

    🔴 AN IDENTITY BLOCK STAYS IN compose-report `translated`. It was bought, and
    `figure-compose.py` assertion 2 requires `missing` to equal exactly the `send:false`
    keys - moving it would refuse a correct figure. It is ALSO listed in `identity`, and
    drawn run-exact, because re-laying English it could draw exactly is the defect E fixes.

    Callers decide identity only AFTER the empty/whitespace check: an empty value is
    `missing`, never identity.

    🔴 A TOKEN ALSO MATCHES ITS LOCALISED FORM (§C140 ⑨). Each whitespace token of the value
    may equal the English token OR the same token of `numloc.localize(english)` - only the
    ENGLISH side is localised, token by token, so a value mixing both forms is identity too.
    WHY: every kept label is drawn with `numloc`'s separators, and the review panel offers
    `Nota` on a numeric identity reply (`373.15 K` -> `373,15 K`). Without this, an editor
    accepting that suggestion turns the block into a TRANSLATION, and the composer re-lays on
    the layout path English it can draw run-exact - undoing E's fix for exactly that label, to
    reach the text it would have drawn anyway. `localize` exchanges only `.` and `,`, so the
    English and localised token lists always have the same length.
    ⚠️ NEVER LOCALISE THE VALUE: `localize` is not idempotent (`1,008` -> `1.008`), and the
    value may already be Icelandic.
    ⚠️ `english` is localised as ONE string where the composer localises each drawn LINE, so
    a coordinate-tuple or fragment guard can see a different span (a two-line `0.` / `x`
    block converts its fragment when drawn and not here). Measured on the 14,962-block
    chemistry census: 0 blocks whose token lists differ between the two.
    """
    shaped = normalise_block_value(value, arc)
    text = shaped if arc else ' '.join(shaped)
    got, sent = text.split(), english.split()
    if got == sent:
        return True
    local = numloc.localize(english).split()
    return (len(got) == len(sent) == len(local)
            and all(g == s or g == l for g, s, l in zip(got, sent, local)))


def run_face(run, fonts):
    """(bold, italic) for ONE run, from that run's own BaseFont.

    `fonts` is `meta['fonts']`. The base looks like `/ABCDEF+LiberationSans-Italic`: the
    leading '/' and a subset prefix are dropped before matching. 'oblique' counts as italic
    (Helvetica names its slanted face that way).

    ⚠️ NEVER KEY ON THE RESOURCE NAME (`/TT0`, `/R9`, `PAGE/F1`) - it is per file. The same
    rule as compose.py's BOLD set.

    ⚠️ A font key absent from `fonts` draws REGULAR rather than raising. `runs.json` and
    `meta.json` out of step is a plumbing fault that `sendable` (`missing_fonts`) already
    reports and holds back from the MT, so such a block only ever reaches the composer as
    kept English - failing the whole figure over it would turn a report into a lost figure.
    """
    base = fonts.get(run['font'], {}).get('base', '')
    name = base.lstrip('/').split('+')[-1].lower()
    return ('bold' in name, 'italic' in name or 'oblique' in name)


def run_draw_text(run):
    """(text, token_removed) for ONE run that is about to be DRAWN run-exact.

    Removes pdfminer's `(cid:N)` placeholders with `_CID_TOKEN`, the one remover regex, and
    nothing else. `token_removed` is `text != run['text']`.

    🔴 A PLACEHOLDER IS NEVER READER-FACING CONTENT, AND THE DRAW SITE IS THE ONLY PLACE IT
    CAN REACH A READER. A block whose own text did not decode is held back from the MT by
    `sendable`, so it is KEPT - and `strip-text.py` has already removed every glyph from the
    artwork, so the label is redrawn from this text or not at all. Measured 2026-09-07 on
    CNX_Chem_05_02_FoodLabel: two live `<text>` elements reading `(cid:127) 5% or less`
    under the driver's VERDICT ok.

    ⚠️ IT IS NOT DONE AT EXTRACTION, DELIBERATELY: the token is the POSITIVE EVIDENCE the hold
    is keyed on (`readlayer._looks_undecoded`); removing it upstream would make an
    undecodable block read as clean prose and send it to the paid MT.

    ⚠️ NO `.strip()`. A run's edge spaces are glyph POSITIONS the source typed. The `.strip()`
    in the remover this replaces named 19 keys in 8 figures as undecodable when they carried
    no `(cid:` at all, only an edge space (COMPOSE-FIDELITY.md). A run that becomes '' is
    skipped by the caller.

    ⚠️ The glyphs after a removed token keep the run's origin, so they sit one token-width
    left of where the source drew them. Accepted: 0 such runs in the 34 bought figures, and
    the block is named in compose-report `undecodable`.
    """
    text = _CID_TOKEN.sub('', run['text'])
    return text, text != run['text']
