#!/usr/bin/env python3
"""Patch r2/tree/compose.py (a cmp-verified copy of c3b/tree/compose.py: repo compose + prep tag patch +
c3 DIAG patch + c3b variant patch) with the r2 switches. Every anchor is asserted to occur exactly once.

  R2_VARIANT  V0 (default: the unchanged composer path) | V5 (r2v5.layout_block draws the layout block)
  R2_DECIMAL  0 (default) | 1  -> ⑨ R3 per run in draw_run_exact (kept branch), drawn text only
  R2_PAD, R2_FLOOR  REQUIRED when V5 (no silent default)
  R2_TRANSFER 1 (default) | 0
  R2_CENSUS   r2/census.json;  R2_BASENAME the figure's basename (census keyed basename#block)

With R2_VARIANT=V0 and R2_DECIMAL=0 no r2 module is imported, no statement on the draw path changes,
and compose-report.json gains no key.
"""
import sys
from pathlib import Path

p = Path(sys.argv[1])
s = p.read_text()

HEAD_OLD = "C3B_ASC, C3B_DESC = 0.73, 0.21\n"
HEAD_NEW = '''C3B_ASC, C3B_DESC = 0.73, 0.21
# ---- r2 switches ----
R2_VARIANT = _os.environ.get('R2_VARIANT', 'V0')
assert R2_VARIANT in ('V0', 'V5'), R2_VARIANT
assert not (R2_VARIANT == 'V5' and C3B_VARIANT != 'V0'), 'r2 V5 runs only with the c3b variants off'
R2_DECIMAL = _os.environ.get('R2_DECIMAL', '0')
assert R2_DECIMAL in ('0', '1'), R2_DECIMAL
R2_DECIMAL = R2_DECIMAL == '1'
R2_ACTIVE = R2_VARIANT != 'V0' or R2_DECIMAL
R2_BASENAME = _os.environ.get('R2_BASENAME', '')
R2_OUT = dict(unformatted=[], overflow=[], open_fallback=[], decimal=[])
R2_CFG = dict(variant=R2_VARIANT, decimal=R2_DECIMAL)
R2_CENSUS = {}
if R2_ACTIVE:
    import r2dec
if R2_VARIANT == 'V5':
    import r2v5
    R2_CENSUS = json.loads(Path(_os.environ['R2_CENSUS']).read_text())
    R2_CFG.update(pad=float(_os.environ['R2_PAD']), floor=float(_os.environ['R2_FLOOR']),
                  transfer={'1': True, '0': False}[_os.environ.get('R2_TRANSFER', '1')])
'''

DISP_OLD = "    _vinfo.update(align=align, anchor=anchor, maxw=maxw, srcflat=_srcflat)\n"
DISP_NEW = '''    _vinfo.update(align=align, anchor=anchor, maxw=maxw, srcflat=_srcflat)
    if R2_VARIANT == 'V5':
        r2v5.layout_block(globals(), BI, b, ls, key, new, R2_CENSUS[f"{R2_BASENAME}#{BI}"], R2_CFG, R2_OUT)
        continue
'''

DEC_OLD = "        removed = removed or gone\n"
DEC_NEW = '''        removed = removed or gone
        if R2_DECIMAL and not CONTROL:
            _t2 = r2dec.r3_run(text)
            if _t2 != text:
                R2_OUT['decimal'].append(dict(block=globals().get('BI'), key=block_key(block), run=text, drawn=_t2))
                text = _t2
'''

REP_OLD = "    'runExact': run_exact,\n}, indent=1, ensure_ascii=False))"
REP_NEW = '''    'runExact': run_exact,
    **({'unformatted': R2_OUT['unformatted'], 'overflow': R2_OUT['overflow'],
        'openFallback': R2_OUT['open_fallback'], 'decimal': R2_OUT['decimal'], 'r2': R2_CFG} if R2_ACTIVE else {}),
}, indent=1, ensure_ascii=False))'''

for old, new in [(HEAD_OLD, HEAD_NEW), (DISP_OLD, DISP_NEW), (DEC_OLD, DEC_NEW), (REP_OLD, REP_NEW)]:
    n = s.count(old)
    assert n == 1, f'anchor occurs {n} times: {old!r}'
    s = s.replace(old, new, 1)
# positive control on the patch: the dispatch sits AFTER the c3b variant block and BEFORE the wrap
i_disp = s.index("r2v5.layout_block(")
assert s.index("_vinfo.update(cls='OPEN')") < i_disp < s.index("# WRAP before shrinking"), 'dispatch misplaced'
assert s.index("def draw_run_exact") < s.index("r2dec.r3_run(text)") < s.index("\ndef setfont"), 'decimal misplaced'
p.write_text(s)
print('r2-patched', p)
