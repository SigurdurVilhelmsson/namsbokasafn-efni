#!/usr/bin/env python3
"""figrings: the §C140 ⑩ soft-mask ring detector, its gate, and the heal it gates.

    FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py

WHY THIS FILE IS SHAPED THE WAY IT IS.  The thing under test is a DETECTOR plus a
DECISION, and both fail silently in the two ways this repo keeps re-learning:

  * a detector that finds nothing reads exactly like a corpus that is clean.  So every
    planted negative is paired with a planted positive run through the SAME code path,
    and the corpus anchors assert a NON-EMPTY population before asserting anything about
    it.  A harness that broke everything equally cannot read as a pass here.

  * a gate calibrated on one picture is a number, not a rule.  The gate's own separation
    is therefore asserted against BOTH real carriers in this corpus — the one where the
    ring is visible and the one where the identical byte signature is picture content —
    and the per-side numbers are pinned loosely (the decision), not exactly (the render,
    which moves with the browser build).

⚠️ Since the 2026-09-15 local-box run the committed brain SVG carries the HEAL, not the
ring, so its corpus anchor asserts the healed state with a reachability witness; exocytosis
remains the real-bytes carrier the detector must still fire on.

The corpus anchors need the committed SVGs under books/.  They SKIP when those are
absent, and the skip is counted and printed, because a silent skip would turn this file
into the empty-result failure it exists to prevent.
"""
import base64
import io
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() — repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
_extra = os.environ.get('FIGTEXT_PYLIBS')
if _extra:
    sys.path.insert(0, str(Path(_extra).expanduser().resolve()))

import figrings                                  # noqa: E402

FAILED = []
SKIPPED = []
REPO = HERE.parent.parent
MEDIA = REPO / 'books' / 'efnafraedi-2e' / 'media'


def check(name, cond, detail=''):
    if cond:
        print(f'  ok   {name}')
    else:
        print(f'  FAIL {name}  {detail}')
        FAILED.append(f'{name}: {detail}')


def skip(name, why):
    print(f'  skip {name}  ({why})')
    SKIPPED.append(name)


# ---------------------------------------------------------------------------
# Planted fixtures — cairo's exact emitted shape, built byte by byte
# ---------------------------------------------------------------------------

def _png(w, h, fn):
    from PIL import Image
    im = Image.new('RGBA', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = fn(x, y)
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def ring_mask_png(w=90, h=24, ring=250, inner=20):
    """A feather that fades to ~0 at the edge, with poppler's backdrop ring on top."""
    def fn(x, y):
        edge = x == 0 or y == 0 or x == w - 1 or y == h - 1
        a = ring if edge else min(255, inner + 4 * min(x, y, w - 1 - x, h - 1 - y))
        return (255, 255, 255, a)
    return _png(w, h, fn)


def flat_mask_png(w=90, h=24, inner=20):
    """The SAME feather with NO ring — the negative control for the detector."""
    def fn(x, y):
        return (255, 255, 255, min(255, inner + 4 * min(x, y, w - 1 - x, h - 1 - y)))
    return _png(w, h, fn)


def svg_with_mask(b64, w=90, h=24, clip='0.765625 0.238281 89.292969 23.132812',
                  place='direct', shared=False, mask_id=2, src_id=29):
    """A minimal document in cairo's exact emitted shape.

    `place` = 'direct'  the masked group hangs off the root, as on brain;
              'feImage' it is reachable ONLY through a filter's feImage, as on
                        exocytosis, where cairo emulates PDF blend modes.
    """
    cx0, cy0, cx1, cy1 = clip.split()
    clip_path = (f'<clipPath id="clip-{mask_id}">\n<path clip-rule="nonzero" '
                 f'd="M {cx0} {cy0} L {cx1} {cy0} L {cx1} {cy1} L {cx0} {cy1} Z '
                 f'M {cx0} {cy0} "/>\n</clipPath>')
    content = (f'<g id="source-{src_id - 1}">\n<path fill-rule="nonzero" '
               f'fill="rgb(97%, 97%, 97%)" fill-opacity="1" '
               f'd="M {cx1} {cy1} L {cx0} {cy1} L {cx0} {cy0} L {cx1} {cy0} Z "/>\n</g>')
    shared_use = (f'<g id="source-{src_id + 90}">\n<use xlink:href="#source-{src_id}"/>\n</g>'
                  if shared else '')
    inner = (f'<g id="source-{src_id + 3}">\n<g clip-path="url(#clip-{mask_id})">\n'
             f'<g mask="url(#mask-{mask_id})">\n<use xlink:href="#source-{src_id - 1}"/>\n'
             f'</g>\n</g>\n</g>')
    if place == 'direct':
        body = f'<g>\n<use xlink:href="#source-{src_id + 3}" transform="matrix(1, 0, 0, 1, 227, 93)"/>\n</g>'
        extra = ''
    else:
        body = f'<g filter="url(#filter-900)" transform="translate(-227, -93)">\n<rect x="0" y="0" width="1" height="1"/>\n</g>'
        extra = (f'<filter id="filter-900" x="0%" y="0%" width="100%" height="100%">\n'
                 f'<feImage xlink:href="#cg-1" result="source" x="0" y="0" width="351" height="174"/>\n'
                 f'</filter>\n'
                 f'<g id="cg-1" transform="translate(227, 93)">\n'
                 f'<use xlink:href="#source-{src_id + 3}" '
                 f'transform="matrix(1, 0, 0, 1, 227, 93)"/>\n</g>')
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
        ' width="351pt" height="174pt" viewBox="0 0 351 174">\n<defs>\n'
        '<filter id="filter-remove-color" x="0%" y="0%" width="100%" height="100%">\n'
        '<feColorMatrix color-interpolation-filters="sRGB" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />\n'
        '</filter>\n'
        f'{clip_path}\n'
        f'<image id="source-{src_id}" x="0" y="0" width="{w}" height="{h}" '
        f'xlink:href="data:image/png;base64,{b64}"/>\n'
        f'<mask id="mask-{mask_id}">\n<g filter="url(#filter-remove-color)">\n'
        f'<use xlink:href="#source-{src_id}"/>\n</g>\n</mask>\n'
        f'{content}\n{inner}\n{shared_use}\n{extra}\n'
        '</defs>\n'
        f'{body}\n'
        '</svg>\n')


# ---------------------------------------------------------------------------
# 1. The detector: it fires on a ring, and it does NOT fire without one
# ---------------------------------------------------------------------------

def test_detector():
    print('1. detector — planted positive and its control')
    pos, _ = figrings.find_candidates(svg_with_mask(ring_mask_png()))
    check('planted ring is found', len(pos) == 1, f'got {len(pos)}')
    if pos:
        c = pos[0]
        check('ring excess is large on every side',
              all(v >= figrings.RING_BYTES for v in c.ring.values()),
              str(c.ring))
        check('geometry lands on the clip rect in root user units',
              c.rect and abs(c.rect[0] - 227.765625) < 1e-3 and abs(c.rect[1] - 93.238281) < 1e-3
              and abs(c.rect[2] - 316.292969) < 1e-3 and abs(c.rect[3] - 116.132812) < 1e-3,
              str(c.rect))
        check('all four sides are cut by the clip',
              c.cut == {'left': True, 'right': True, 'top': True, 'bottom': True}, str(c.cut))
        check('nothing is refused', c.refuse is None, str(c.refuse))

    # CONTROL.  Same document, same code path, feather without the backdrop ring.
    # If this also returned a candidate the positive above would mean nothing.
    neg, _ = figrings.find_candidates(svg_with_mask(flat_mask_png()))
    check('CONTROL: no ring -> no candidate', len(neg) == 0, f'got {len(neg)}')


# ---------------------------------------------------------------------------
# 2. Reachability through cairo's blend emulation
# ---------------------------------------------------------------------------

def test_feimage_reachability():
    print('2. reachability — a masked group reachable ONLY through <filter><feImage>')
    text = svg_with_mask(ring_mask_png(), place='feImage')
    # The premise of the test, asserted rather than assumed: outside <defs> there is no
    # <g mask=...> and no <use> of the masked group, so a walker that ignores filters
    # genuinely cannot reach it.
    body = text.split('</defs>')[1]
    check('premise: nothing outside defs references the masked group',
          'mask="url(#mask-2)"' not in body and 'source-32' not in body, body.strip()[:120])
    found, _ = figrings.find_candidates(text)
    check('candidate is still found', len(found) == 1, f'got {len(found)}')
    if found:
        check('and with the same geometry as the direct placement',
              found[0].rect and abs(found[0].rect[0] - 227.765625) < 1e-3, str(found[0].rect))


# ---------------------------------------------------------------------------
# 3. Fail-closed refusals, and a heal that will not honour an approval it cannot verify
# ---------------------------------------------------------------------------

def test_refusals():
    print('3. refusals — untested branches fail closed')
    shared, _ = figrings.find_candidates(svg_with_mask(ring_mask_png(), shared=True))
    check('an image referenced more than once is REFUSED',
          len(shared) == 1 and shared[0].refuse == 'shared-image',
          str([c.refuse for c in shared]))

    uncut, _ = figrings.find_candidates(
        svg_with_mask(ring_mask_png(), clip='0 0 90 24'))
    check('a clip that cuts no side is REFUSED',
          len(uncut) == 1 and uncut[0].refuse == 'clip-uncut',
          str([c.refuse for c in uncut]))

    # The heal re-derives the pairing itself: approving a mask it cannot verify does
    # nothing, so a bad approval list cannot damage a picture.
    text = svg_with_mask(ring_mask_png(), shared=True)
    healed, rep = figrings.heal(text, {'mask-2'})
    check('heal refuses an approved-but-shared image',
          healed == text and rep['sharedImage'] == ['source-29'], str(rep))

    text2 = svg_with_mask(ring_mask_png())
    healed2, rep2 = figrings.heal(text2, set())
    check('heal with an empty approval set is a byte-identical no-op',
          healed2 == text2 and rep2['healed'] == 0 and rep2['notApproved'] == ['mask-2'],
          str(rep2))


# ---------------------------------------------------------------------------
# 4. The heal touches only what it says it touches
# ---------------------------------------------------------------------------

def test_heal_is_local():
    print('4. heal — only the approved mask\'s payload moves')
    text = svg_with_mask(ring_mask_png())
    healed, rep = figrings.heal(text, {'mask-2'})
    check('it healed one mask on four sides',
          rep['healed'] == 1 and rep['sidesHealed'] == 4, str(rep))
    check('the document changed', healed != text)

    def strip_payloads(s):
        import re
        return re.sub(r'(base64,)[A-Za-z0-9+/=]+', r'\1<PAYLOAD>', s)
    check('every byte outside the base64 payloads is identical',
          strip_payloads(healed) == strip_payloads(text))

    from PIL import Image
    import re as _re

    def alpha(s):
        b64 = _re.search(r'base64,([A-Za-z0-9+/=]+)', s).group(1)
        im = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA')
        return im, im.load()

    im0, p0 = alpha(text)
    im1, p1 = alpha(healed)
    w, h = im0.size
    check('the ring row is replaced by its inner neighbour',
          all(p1[x, 0] == p0[x, 1] for x in range(1, w - 1)), 'top row interior')
    # The corners are NOT the row's own neighbour, and that is the write order, not a bug:
    # left/right run before top/bottom, so column 0 is already healed when row 0 copies it.
    # Pinned because it is the one place the result depends on the order of four statements.
    check('a corner takes its DIAGONAL inner neighbour', p1[0, 0] == p0[1, 1],
          f'{p1[0, 0]} vs {p0[1, 1]}')
    check('and the interior is untouched',
          all(p1[x, y] == p0[x, y] for y in range(2, h - 2) for x in range(2, w - 2)))
    # CONTROL: the ring really was different before, or "replaced" means nothing.
    check('CONTROL: the ring differed from its neighbour before the heal',
          any(p0[x, 0] != p0[x, 1] for x in range(w)))


# ---------------------------------------------------------------------------
# 5. edgeline is one-sided on purpose
# ---------------------------------------------------------------------------

def test_edgeline_one_sided():
    print('5. edgeline — a light line scores, a dark boundary does not')
    import numpy as np
    base = np.full(60, 128.0)
    bright = base.copy(); bright[30] = 200.0
    dark = base.copy(); dark[30] = 40.0
    vb = figrings.edgeline(bright, 30)
    vd = figrings.edgeline(dark, 30)
    check('a light line scores high', vb is not None and vb > 60, str(vb))
    check('a dark line does NOT score high', vd is not None and vd <= 0.5, str(vd))
    check('off the end of the profile returns None',
          figrings.edgeline(base, 1) is None and figrings.edgeline(base, 59) is None)


# ---------------------------------------------------------------------------
# 6. The gate is interventional, not a threshold
# ---------------------------------------------------------------------------

def _planted_gate_case(after_removes_line):
    """One mask, a bright line on all four sides of its rect; the `after` render either
    removes that line or leaves it exactly where it was."""
    import numpy as np
    W = H = 120
    rect = [20.0, 20.0, 100.0, 100.0]
    before = np.full((H, W), 128.0)
    for i in range(20, 101):
        for c in (20, 100):
            before[i, c] = 210.0
            before[c, i] = 210.0
    after = before.copy()
    if after_removes_line:
        for i in range(20, 101):
            for c in (20, 100):
                after[i, c] = 128.0
                after[c, i] = 128.0
    cand = figrings.Candidate(mask='mask-2', image='source-29', px=[80, 80],
                              transformed=False, rect=rect, raster_rect=rect,
                              ring={'top': 200, 'bottom': 200, 'left': 200, 'right': 200},
                              cut={'left': True, 'right': True, 'top': True, 'bottom': True},
                              refuse=None)
    return figrings.gate([cand], before, after, 1.0)['mask-2']


def test_gate_is_interventional():
    print('6. gate — the same `before` decides differently on what the heal does')
    yes = _planted_gate_case(True)
    no = _planted_gate_case(False)
    check('healing removes the line -> APPROVED',
          yes['approved'] and yes['sidesPassed'] == 4, str(yes))
    check('identical `before`, healing changes nothing -> refused',
          not no['approved'] and no['sidesPassed'] == 0, str(no))
    check('and the refusal names the rule it failed',
          no['reason'] and 'sides' in no['reason'], str(no['reason']))
    # A refused candidate must stay refused even on the picture that WOULD approve it:
    # the gate is conjunctive and fail-closed, not a score with an override.
    import numpy as np
    W = H = 120
    before = np.full((H, W), 128.0)
    for i in range(20, 101):
        for c in (20, 100):
            before[i, c] = 210.0
            before[c, i] = 210.0
    after = np.full((H, W), 128.0)
    refused = figrings.Candidate(
        mask='mask-2', image='source-29', px=[80, 80], transformed=False,
        rect=[20.0, 20.0, 100.0, 100.0], raster_rect=[20.0, 20.0, 100.0, 100.0],
        ring={'top': 200, 'bottom': 200, 'left': 200, 'right': 200},
        cut={'left': True, 'right': True, 'top': True, 'bottom': True},
        refuse='shared-image')
    v = figrings.gate([refused], before, after, 1.0)['mask-2']
    check('a refused candidate is never approved, on the very picture that would approve it',
          not v['approved'] and v['reason'] == 'shared-image', str(v))


# ---------------------------------------------------------------------------
# 7. Corpus anchors — the two real carriers, and the corpus-wide count
# ---------------------------------------------------------------------------

def test_corpus_anchors():
    print('7. corpus anchors — the real bytes, not a fixture')
    brain = MEDIA / 'CNX_Chem_03_01_brain-ec0b_IS.svg'
    exo = MEDIA / 'CNX_Chem_03_01_exocytosis-88f6_IS.svg'
    if not brain.exists() or not exo.exists():
        skip('corpus anchors', 'committed media SVGs not present')
        return
    # 🔴 BRAIN IS NO LONGER A CARRIER: THE DRIVER HEALED ITS RING (§C140 ⑩, local-box run
    # 2026-09-15, evidence/2026-09-15-c10-local-run/). This anchor used to assert exactly one
    # candidate, which was a COUNTDOWN — true only until the fix it gates was first used. So it
    # now asserts the heal, and the zero is paired with a WITNESS: at an unbounded threshold the
    # walker must still reach mask-2, or "no candidate" would read the same as a walker that no
    # longer finds the mask at all. The visible-ring positive on real bytes lives on in the
    # planted fixture above and in git history (38f60765); it is not read here, because a
    # history lookup is vacuous on a depth-1 clone.
    brain_text = brain.read_text(encoding='utf-8')
    bc, _ = figrings.find_candidates(brain_text)
    check('brain carries no candidate — its ring was healed', len(bc) == 0,
          f'got {[c.mask for c in bc]}')
    reach, _ = figrings.find_candidates(brain_text, ring_bytes=float('-inf'))
    check('WITNESS: the walker still reaches brain mask-2 (source-29, 90x24, nothing refused)',
          [(c.mask, c.image, c.px, c.refuse) for c in reach] == [('mask-2', 'source-29', [90, 24], None)],
          repr(reach))
    if reach:
        check('and every side of mask-2 is now below the byte threshold',
              max(reach[0].ring.values()) < figrings.RING_BYTES, repr(reach[0].ring))

    ec, _ = figrings.find_candidates(exo.read_text(encoding='utf-8'))
    check('exocytosis carries eight candidates — reachable only through feImage',
          len(ec) == 8, f'got {len(ec)}')
    check('and mask-491 is among them (the measured false positive)',
          any(c.mask == 'mask-491' for c in ec), str([c.mask for c in ec]))

    others = sorted(p for p in MEDIA.glob('*_IS.svg')
                    if p.name not in (brain.name, exo.name))
    if not others:
        skip('corpus sweep', 'no other media SVGs')
        return
    # NON-VACUITY: the sweep must actually have looked at a large population, or
    # "0 candidates elsewhere" is an absence manufactured by an empty glob.
    check('CONTROL: the sweep covered a non-trivial population', len(others) > 100,
          f'{len(others)} files')
    hits = []
    for p in others:
        cs, _ = figrings.find_candidates(p.read_text(encoding='utf-8'))
        if cs:
            hits.append((p.name, len(cs)))
    check('no third carrier exists in this corpus today', hits == [], str(hits[:5]))


# ---------------------------------------------------------------------------
# 8. The gate separates the two real carriers — pinned as a DECISION, not a pixel
# ---------------------------------------------------------------------------

def test_gate_separation_is_documented():
    print('8. the separation the gate rests on is recorded where a reader will find it')
    doc = figrings.__doc__ or ''
    check('the module names the false-positive carrier',
          'exocytosis' in doc and 'mask-491' in doc)
    src = (HERE / 'figrings.py').read_text(encoding='utf-8')
    for const in ('RING_BYTES', 'SIDE_FLOOR', 'SIDE_DROP', 'MASK_MIN_SIDES', 'MASK_MIN_DELTA'):
        i = src.find(f'{const} =')
        head = src[max(0, i - 900):i]
        check(f'{const} is justified in the lines above it',
              i > 0 and ('easured' in head or 'MECHANISM' in head), '')


def main():
    for fn in (test_detector, test_feimage_reachability, test_refusals, test_heal_is_local,
               test_edgeline_one_sided, test_gate_is_interventional,
               test_corpus_anchors, test_gate_separation_is_documented):
        fn()
    print()
    if SKIPPED:
        print(f'SKIPPED {len(SKIPPED)}: {", ".join(SKIPPED)}')
    if FAILED:
        print(f'FAILED {len(FAILED)}')
        for f in FAILED:
            print('  -', f)
        return 1
    print('ALL PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
