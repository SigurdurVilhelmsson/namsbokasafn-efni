"""Figure text model: group positioned runs into blocks/lines, detect alignment,
and lay translated text back with the block's own geometry. Pure geometry -
no assumption that text is centred, and lines are split on the text NORMAL so
rotated blocks work the same as horizontal ones."""
import math, json

def proj(r):
    """distance along the text normal (which line of the block a run sits on)"""
    a = math.radians(r['rot'])
    return -r['x']*math.sin(a) + r['y']*math.cos(a)

def along(r):
    a = math.radians(r['rot'])
    return r['x']*math.cos(a) + r['y']*math.sin(a)

def group(runs):
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


def stamp_composed_hash(sidecar_path):
    """Record that the artwork just written was composed from THESE blocks.

    The sidecar already carries `renderHash` - "the hash of the blocks an editor
    approved". This copies it into `composedHash` - "the hash of the blocks the
    image on disk was actually composed from". effectiveState() then reports
    'approved' only when the two agree, so approving and never re-composing
    leaves the figure at mt-preview instead of claiming the published SVG
    carries approved text.

    🔴 IT COPIES. IT MUST NEVER COMPUTE.
    computeRenderHash lives in tools/lib/figure-text-sidecar.cjs and is JS
    (sha256 over the composer version, then each sorted key and value, NUL
    separated). Reimplementing that here would be two implementations of one
    rule in two languages, which CLAUDE.md says must then be proved equal on the
    corpus rather than on a fixture. Copying leaves nothing to disagree with.
    If you are reaching for hashlib, you have taken the wrong branch.

    ⚠️ Byte discipline matters: this file is COMMITTED and read as a diff.
    json.dumps defaults to ensure_ascii=True, which would escape every Icelandic
    character and turn a one-field stamp into a whole-file rewrite. indent=1 and
    the trailing newline match writeSidecar()'s JSON.stringify(data, null, 1).

    Written temp+rename, like the JS writer: a crash mid-write must not leave a
    half sidecar, which readSidecar() would then report as ABSENT.

    :param sidecar_path: the book's committed sidecar, i.e. what --translations
        pointed at. A plain translations.json has no renderHash.
    :returns: the value stamped, or None if there was nothing to stamp (in which
        case the file is left byte-identical).
    """
    from pathlib import Path
    p = Path(sidecar_path)
    data = json.loads(p.read_text(encoding='utf-8'))
    render_hash = data.get('renderHash') if isinstance(data, dict) else None
    if not render_hash:
        # A translations.json, or a sidecar nobody has approved yet. Composing
        # is legitimate either way; there is simply no approval to record.
        return None
    if data.get('composedHash') == render_hash:
        return render_hash          # idempotent: re-composing must not churn the file
    # Directly after renderHash, matching the key order applyApprovedFigureEdits
    # writes. Two tools rewrite this committed file in alternation; if they
    # disagreed about where the key goes, every approve/compose cycle would move
    # a line and churn the diff for no reason.
    out = {}
    for k, v in data.items():
        out[k] = v
        if k == 'renderHash':
            out['composedHash'] = render_hash
    out.setdefault('composedHash', render_hash)  # renderHash absent is handled above
    data = out
    tmp = p.with_suffix(p.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    tmp.replace(p)
    return render_hash
