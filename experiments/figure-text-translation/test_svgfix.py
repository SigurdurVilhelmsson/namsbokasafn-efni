#!/usr/bin/env python3
"""`svgfix.py` - the post-`pdftocairo -svg` blend-lerp collapse and the reference-cost sentinel.

    PYTHONDONTWRITEBYTECODE=1 python3 test_svgfix.py

Plain asserts and a module-level `fails` list, like the sibling suites - there is no pytest
in this tree. Pure: no cairo, no pdfplumber, no network, no file IO.

WHAT THE FIXTURES ARE. `PAINT` is ONE real cairo blend paint, cut out of the prepared
`CNX_Chem_04_02_HClsoln` artwork.svg (paint `filter-1` = add, `filter-0` = blend,
`compositing-group-0..4`, `mask-54`/`mask-55`) and reduced to the elements the semantic checks
read, with cairo's attribute spellings kept byte for byte. Two deliberate departures, both so a
wrong implementation cannot pass by luck:
  - the blend filter is `filter-7` and the add filter `filter-3`: cairo always numbers the blend
    F_add - 1, so an implementation that ASSUMES that instead of resolving R's `filter`
    attribute passes on every real figure and fails here;
  - `filter-2` (= F_add - 1) exists and is a SCREEN blend over the same subregion, so the
    assuming implementation does not merely dangle - it rewrites to a real filter with the
    wrong mode, and both the bytes and `modes` see it.

🔴 EVERY NULL IS PAIRED. "Zero collapses returns identical bytes" is run on a file the pass
INSPECTED and refused (addOps 1), with the collapsing twin beside it; "clipped" and
"unmatched" each carry the precedence case that tells them apart; the sentinel's "< 20" is the
collapsed version of the very chain whose "> 20" it fires on.
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

import svgfix                                    # noqa: E402

RECURSION_LIMIT_AT_START = sys.getrecursionlimit()
fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''),
          flush=True)
    if not ok:
        fails.append(label)


def attempt(fn, *args):
    """A crash becomes a named FAIL, never an exit that hides every later assertion."""
    try:
        return fn(*args), None
    except Exception as exc:                     # noqa: BLE001
        return None, exc


REPORT_KEYS = {'addOps', 'collapsed', 'useSitesRewritten', 'clipped', 'unmatched', 'modes'}

# ── the fixture: one real cairo lerp paint, reduced ───────────────────────────────────
PAINT = b'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="351pt" height="199.333pt" viewBox="0 0 351 199.333">
<defs>
<filter id="filter-remove-color-and-invert-alpha" x="0%" y="0%" width="100%" height="100%">
<feColorMatrix color-interpolation-filters="sRGB" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -1 1"/>
</filter>
<filter id="filter-2" x="0%" y="0%" width="100%" height="100%">
<feImage xlink:href="#compositing-group-1" result="source" x="0" y="0" width="421.2" height="239.1996"/>
<feImage xlink:href="#compositing-group-2" result="destination" x="0" y="0" width="421.2" height="239.1996"/>
<feBlend in="source" in2="destination" mode="screen" color-interpolation-filters="sRGB"/>
</filter>
<filter id="filter-7" x="0%" y="0%" width="100%" height="100%">
<feImage xlink:href="#compositing-group-1" result="source" x="0" y="0" width="421.2" height="239.1996"/>
<feImage xlink:href="#compositing-group-2" result="destination" x="0" y="0" width="421.2" height="239.1996"/>
<feBlend in="source" in2="destination" mode="multiply" color-interpolation-filters="sRGB"/>
</filter>
<filter id="filter-9" x="0%" y="0%" width="100%" height="100%">
<feImage xlink:href="#compositing-group-1" result="source" x="0" y="0" width="421.2" height="239.1996"/>
<feImage xlink:href="#compositing-group-2" result="destination" x="0" y="0" width="421.2" height="239.1996"/>
<feComposite in="source" in2="destination" operator="in" color-interpolation-filters="sRGB"/>
</filter>
<filter id="filter-3" x="0%" y="0%" width="100%" height="100%">
<feImage xlink:href="#compositing-group-3" result="source" x="0" y="0" width="421.2" height="239.1996"/>
<feImage xlink:href="#compositing-group-4" result="destination" x="0" y="0" width="421.2" height="239.1996"/>
<feComposite in="source" in2="destination" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" color-interpolation-filters="sRGB"/>
</filter>
<g id="compositing-group-0" transform="translate(35.1, 19.9333)">
<rect x="-35.1" y="-19.9333" width="421.2" height="239.1996" fill="rgb(0%, 0%, 0%)" fill-opacity="0"/>
@COVER@
</g>
<mask id="mask-54">
<use xlink:href="#compositing-group-0"/>
</mask>
<mask id="mask-55">
<use xlink:href="#compositing-group-0" filter="url(#filter-remove-color-and-invert-alpha)"/>
</mask>
<g id="compositing-group-1">
<path fill-rule="evenodd" fill="rgb(52.832031%, 24.737549%, 11.676025%)" fill-opacity="1" d="M 10 10 L 60 10 L 60 60 Z"/>
</g>
<g id="compositing-group-2" transform="translate(35.1, 19.9333)">
<path fill-rule="evenodd" fill="rgb(77.926636%, 35.995483%, 15.58075%)" fill-opacity="1" d="M 0 0 L 100 0 L 100 100 Z"/>
</g>
<g id="compositing-group-3" filter="url(#@BLEND@)" mask="url(#mask-54)">
<rect x="0" y="0" width="421.2" height="239.1996" fill="rgb(0%, 0%, 0%)" fill-opacity="1"/>
</g>
<g id="compositing-group-4" @LATTR@mask="url(#mask-55)">
<use xlink:href="#compositing-group-2"/>
</g>
</defs>
@USES@
</svg>
'''

COVER_FULL = (b'<rect x="-35.1" y="-19.9333" width="421.2" height="239.1996" '
              b'fill="rgb(100%, 100%, 100%)" fill-opacity="1"/>')
# Ma's white rect is narrower than the subregion: coverage < 1 somewhere on SR.
COVER_SHORT = (b'<rect x="-35.1" y="-19.9333" width="200" height="239.1996" '
               b'fill="rgb(100%, 100%, 100%)" fill-opacity="1"/>')
# The real rxn3 shape: the white rect is under a clipPath (verifier: "E last child not plain
# opaque white rect: <g clip-path=...>").
COVER_RXN3 = (b'<clipPath id="clip-7">\n'
              b'<path clip-rule="nonzero" d="M 16.46875 39.191406 L 55.324219 39.191406 L '
              b'55.324219 76.386719 L 16.46875 76.386719 Z M 16.46875 39.191406 "/>\n'
              b'</clipPath>\n<g clip-path="url(#clip-7)">\n' + COVER_FULL + b'\n</g>')

USE_SITE = (b'<g filter="url(#filter-3)" transform="translate(-35.1, -19.9333)">\n'
            b'<rect x="0" y="0" width="421.2" height="239.1996" fill="rgb(0%, 0%, 0%)" '
            b'fill-opacity="1"/>\n</g>')


def paint(cover=COVER_FULL, blend=b'filter-7', lattr=b'', uses=USE_SITE):
    return (PAINT.replace(b'@COVER@', cover).replace(b'@BLEND@', blend)
            .replace(b'@LATTR@', lattr).replace(b'@USES@', uses))


def report_is_well_formed(rep):
    return (isinstance(rep, dict) and set(rep) == REPORT_KEYS
            and all(type(rep[k]) is int for k in REPORT_KEYS - {'modes'})
            and isinstance(rep['modes'], dict))


# ── 1. one real lerp paint collapses onto its RESOLVED blend filter ───────────────────
data = paint()
res, exc = attempt(svgfix.collapse_blend_lerp, data)
out, rep = res if res else (None, None)
expected = data.replace(b'<g filter="url(#filter-3)"', b'<g filter="url(#filter-7)"')
check('1a PRECONDITION the fixture differs from its expected output in exactly one byte',
      len(expected) == len(data) and sum(a != b for a, b in zip(data, expected)) == 1)
check('1b the use site is retargeted to the blend id RESOLVED from R (filter-7), '
      'not assumed F_add-1 (filter-2); nothing else moves', exc is None and out == expected,
      f'{exc!r}; {len(out) if out is not None else None} bytes; filter-2 at use site: '
      f'{out is not None and b"url(#filter-2)" in out}')
check('1c report: exactly the six keys, ints, addOps 1 / collapsed 1 / useSitesRewritten 1 / '
      'clipped 0 / unmatched 0', report_is_well_formed(rep)
      and [rep.get(k) for k in ('addOps', 'collapsed', 'useSitesRewritten', 'clipped',
                                'unmatched')] == [1, 1, 1, 0, 0], repr(rep))
check('1d modes counts the RESOLVED blend\'s mode (multiply), not filter-2\'s (screen)',
      rep is not None and rep.get('modes') == {'multiply': 1}, repr(rep and rep.get('modes')))

# ── 2. a real clip is left alone and counted CLIPPED ──────────────────────────────────
for label, cover in (('2 (Ma rect narrower than SR)', COVER_SHORT),
                     ('2r (rxn3 shape: white rect under a clipPath)', COVER_RXN3)):
    d = paint(cover=cover)
    res, exc = attempt(svgfix.collapse_blend_lerp, d)
    o, r = res if res else (None, None)
    check(f'{label} left byte-identical', exc is None and o == d, repr(exc))
    check(f'{label} counted clipped 1 / unmatched 0 / collapsed 0 / addOps 1',
          r is not None and [r.get(k) for k in ('clipped', 'unmatched', 'collapsed', 'addOps',
                                                'useSitesRewritten')] == [1, 0, 0, 1, 0]
          and r.get('modes') == {}, repr(r))

# ── 3. any other shape is left alone and counted UNMATCHED ────────────────────────────
for label, kw in (('3a R filter is not a feBlend (IcePack: feComposite operator="in")',
                   dict(blend=b'filter-9')),
                  ('3b L carries an attribute cairo never writes there',
                   dict(lattr=b'opacity="0.5" ')),
                  # PRECEDENCE: "clipped" asserts the scaffolding was recognised, so a clipped
                  # Ma on a broken shape is unmatched - whichever check the shape breaks, and in
                  # particular one (L) that a check-in-file-order implementation reaches AFTER Ma.
                  ('3c PRECEDENCE clipped Ma + broken R filter is unmatched, not clipped',
                   dict(blend=b'filter-9', cover=COVER_SHORT)),
                  ('3d PRECEDENCE clipped Ma + broken L is unmatched, not clipped',
                   dict(lattr=b'opacity="0.5" ', cover=COVER_SHORT))):
    d = paint(**kw)
    res, exc = attempt(svgfix.collapse_blend_lerp, d)
    o, r = res if res else (None, None)
    check(f'{label}: byte-identical', exc is None and o == d, repr(exc))
    check(f'{label}: unmatched 1 / clipped 0 / collapsed 0 / addOps 1',
          r is not None and [r.get(k) for k in ('unmatched', 'clipped', 'collapsed', 'addOps')]
          == [1, 0, 0, 1], repr(r))

# ── 4. zero collapses returns the input unchanged ─────────────────────────────────────
d = paint(cover=COVER_SHORT)                     # inspected (addOps 1), refused
res, exc = attempt(svgfix.collapse_blend_lerp, d)
check('4a zero collapses on an INSPECTED file (addOps 1): identical bytes',
      exc is None and res is not None and (res[0] is d or res[0] == d)
      and res[1].get('addOps') == 1 and res[1].get('collapsed') == 0, repr(exc or res[1]))
plain = (b'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" '
         b'width="10pt" height="10pt" viewBox="0 0 10 10">\n<path d="M 0 0 L 5 5"/>\n</svg>\n')
res, exc = attempt(svgfix.collapse_blend_lerp, plain)
check('4b no add filter at all: identical bytes, addOps 0, report well-formed',
      exc is None and res is not None and (res[0] is plain or res[0] == plain)
      and res[1].get('addOps') == 0 and report_is_well_formed(res[1]), repr(exc or res[1]))

# ── 5. use-site accounting ────────────────────────────────────────────────────────────
d = paint(uses=USE_SITE + b'\n' + USE_SITE)
res, exc = attempt(svgfix.collapse_blend_lerp, d)
check('5a an add filter used at TWO sites: both rewritten, one paint collapsed',
      exc is None and res is not None
      and res[0] == d.replace(b'filter="url(#filter-3)"', b'filter="url(#filter-7)"')
      and res[0].count(b'url(#filter-3)') == 0
      and [res[1].get(k) for k in ('collapsed', 'useSitesRewritten')] == [1, 2],
      repr(exc or res[1]))
# The byte substitution is cross-checked against the parse: a use site the parser sees but
# the byte pattern cannot (single quotes) must fail LOUDLY, never collapse half the users.
d = paint(uses=USE_SITE + b'\n' + USE_SITE.replace(b'filter="url(#filter-3)"',
                                                   b"filter='url(#filter-3)'"))
res, exc = attempt(svgfix.collapse_blend_lerp, d)
check('5b a byte/parse count mismatch raises ValueError (nothing half-rewritten is returned)',
      res is None and isinstance(exc, ValueError), repr(exc or res and res[1]))


# ── 6. reference cost: the refgraph.py model, pinned on exact integers ────────────────
def svg(defs, body):
    return (b'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" '
            b'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">\n<defs>\n'
            + defs + b'\n</defs>\n' + body + b'\n</svg>\n')


# no sharing: two `use` of a 2-leaf group cost 4; a filter's feImage costs its target and adds
# one level of depth; a mask costs its content; an unreferenced defs child costs nothing - at the
# root AND nested (refgraph.py skips the root <defs> in its root loop and every other <defs>'s
# children inside cost()).
tiny = svg(b'<g id="a"><rect width="1" height="1"/><rect width="1" height="1"/></g>\n'
           b'<filter id="f"><feImage xlink:href="#a"/></filter>\n'
           b'<mask id="m"><rect width="1" height="1"/></mask>\n'
           b'<path id="unused" d="M 0 0"/>',
           b'<use xlink:href="#a"/>\n<use xlink:href="#a"/>\n'
           b'<g filter="url(#f)"><rect width="1" height="1"/></g>\n'
           b'<g mask="url(#m)"><rect width="1" height="1"/></g>\n'
           b'<g><defs><path d="M 0 0"/></defs><rect width="1" height="1"/></g>')
res, exc = attempt(svgfix.reference_cost, tiny)
check('6a tiny: cost 10 paint invocations (2+2+3+2+1), feImage depth 1',
      exc is None and res is not None and res[1] == 1
      and abs(res[0] - math.log2(10)) < 1e-12, repr(exc or res))

N = 3000                                         # far past Python's default recursion limit
deep = svg(b'<g id="g0"><rect width="1" height="1"/></g>\n' + b'\n'.join(
    b'<filter id="f%d"><feImage xlink:href="#g%d"/></filter>\n'
    b'<g id="g%d" filter="url(#f%d)"><rect width="1" height="1"/></g>' % (k, k - 1, k, k)
    for k in range(1, N + 1)), b'<use xlink:href="#g%d"/>' % N)
res, exc = attempt(svgfix.reference_cost, deep)
check(f'6b a {N}-deep feImage chain: no RecursionError, cost {N + 1}, depth {N}',
      exc is None and res is not None and res[1] == N
      and abs(res[0] - math.log2(N + 1)) < 1e-12, repr(exc or res))
check('6c ... and after that deep walk the recursion limit is what it was before any call',
      exc is None and res is not None and res[1] == N
      and sys.getrecursionlimit() == RECURSION_LIMIT_AT_START,
      f'{sys.getrecursionlimit()} vs {RECURSION_LIMIT_AT_START}')

cyc = svg(b'<g id="c"><use xlink:href="#c"/><rect width="1" height="1"/></g>',
          b'<use xlink:href="#c"/>')
res, exc = attempt(svgfix.reference_cost, cyc)
check('6d a reference cycle returns a finite cost instead of raising',
      exc is None and res is not None and math.isfinite(res[0]) and res[1] == 0,
      repr(exc or res))


# ── 7. the sentinel on a synthetic doubling chain, and on its collapsed version ───────
def chain(n):
    """n cairo-shaped lerp paints; paint k's destination holds paint k-1's use site."""
    defs = [b'<filter id="filter-remove-color-and-invert-alpha" x="0%" y="0%" width="100%" '
            b'height="100%">\n<feColorMatrix color-interpolation-filters="sRGB" '
            b'values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -1 1"/>\n</filter>']
    wh = b'width="421.2" height="239.1996"'
    for k in range(n):
        fb, fa = 2 * k, 2 * k + 1
        e, s, dd, r, l = (5 * k + i for i in range(5))
        ma, mb = 2 * k, 2 * k + 1
        for fid, a, b, op in (
                (fb, s, dd, b'<feBlend in="source" in2="destination" mode="multiply" '
                            b'color-interpolation-filters="sRGB"/>'),
                (fa, r, l, b'<feComposite in="source" in2="destination" operator="arithmetic" '
                           b'k1="0" k2="1" k3="1" k4="0" color-interpolation-filters="sRGB"/>')):
            defs.append(b'<filter id="filter-%d" x="0%%" y="0%%" width="100%%" height="100%%">\n'
                        b'<feImage xlink:href="#compositing-group-%d" result="source" x="0" y="0" '
                        b'%b/>\n<feImage xlink:href="#compositing-group-%d" result="destination" '
                        b'x="0" y="0" %b/>\n%b\n</filter>' % (fid, a, wh, b, wh, op))
        defs.append(b'<g id="compositing-group-%d" transform="translate(35.1, 19.9333)">\n'
                    b'<rect x="-35.1" y="-19.9333" %b fill="rgb(0%%, 0%%, 0%%)" fill-opacity="0"/>\n'
                    b'<rect x="-35.1" y="-19.9333" %b fill="rgb(100%%, 100%%, 100%%)" '
                    b'fill-opacity="1"/>\n</g>' % (e, wh, wh))
        defs.append(b'<mask id="mask-%d">\n<use xlink:href="#compositing-group-%d"/>\n</mask>\n'
                    b'<mask id="mask-%d">\n<use xlink:href="#compositing-group-%d" '
                    b'filter="url(#filter-remove-color-and-invert-alpha)"/>\n</mask>'
                    % (ma, e, mb, e))
        defs.append(b'<g id="compositing-group-%d">\n<path d="M 10 10 L 60 60"/>\n</g>' % s)
        prev = (b'<g filter="url(#filter-%d)" transform="translate(-35.1, -19.9333)">\n'
                b'<rect x="0" y="0" %b fill="rgb(0%%, 0%%, 0%%)" fill-opacity="1"/>\n</g>'
                % (fa - 2, wh)) if k else b'<path d="M 0 0 L 100 100"/>'
        defs.append(b'<g id="compositing-group-%d" transform="translate(35.1, 19.9333)">\n%b\n</g>'
                    % (dd, prev))
        defs.append(b'<g id="compositing-group-%d" filter="url(#filter-%d)" mask="url(#mask-%d)">\n'
                    b'<rect x="0" y="0" %b fill="rgb(0%%, 0%%, 0%%)" fill-opacity="1"/>\n</g>\n'
                    b'<g id="compositing-group-%d" mask="url(#mask-%d)">\n'
                    b'<use xlink:href="#compositing-group-%d"/>\n</g>' % (r, fb, ma, wh, l, mb, dd))
    body = (b'<g filter="url(#filter-%d)" transform="translate(-35.1, -19.9333)">\n'
            b'<rect x="0" y="0" %b fill="rgb(0%%, 0%%, 0%%)" fill-opacity="1"/>\n</g>'
            % (2 * n - 1, wh))
    return svg(b'\n'.join(defs), body)


C30 = chain(30)
res, exc = attempt(svgfix.reference_cost, C30)
before = res
check('7a the 30-lerp doubling chain costs MORE than 2^20 (the sentinel fires)',
      exc is None and res is not None and res[0] > svgfix.REFCOST_WARN_LOG2, repr(exc or res))
res, exc = attempt(svgfix.collapse_blend_lerp, C30)
collapsed, crep = res if res else (None, None)
check('7b the chain collapses 30 of 30 paints at 30 use sites',
      crep is not None and [crep.get(k) for k in ('addOps', 'collapsed', 'useSitesRewritten',
                                                  'clipped', 'unmatched')] == [30, 30, 30, 0, 0]
      and crep.get('modes') == {'multiply': 30}, repr(exc or crep))
res, exc = attempt(svgfix.reference_cost, collapsed) if collapsed is not None else (None, None)
check('7c ... and its collapsed version costs LESS than 2^20 (the sentinel is quiet)',
      exc is None and res is not None and res[0] < svgfix.REFCOST_WARN_LOG2, repr(exc or res))
check('7d CONTROL the threshold constant is the contract\'s 2^20', svgfix.REFCOST_WARN_LOG2 == 20,
      repr(svgfix.REFCOST_WARN_LOG2))
print(f'      (chain cost before 2^{before[0]:.1f} depth {before[1]}, after '
      f'2^{res[0]:.1f} depth {res[1]})' if before and res else '', flush=True)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
