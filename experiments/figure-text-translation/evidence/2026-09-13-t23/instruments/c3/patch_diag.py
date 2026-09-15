#!/usr/bin/env python3
"""Patch the SCRATCH copy of compose.py: prep's item tagging + a per-layout-block DIAG dump.

Every anchor asserted to occur exactly once. Drawing statements untouched; the only extra
cairo calls (measure for natural width / flattened English widths / wrap at sz0) run AFTER the
block's own draw loop, and run.py checks translated.png is pixel-identical to prep's.
"""
import sys, subprocess
from pathlib import Path

p = Path(sys.argv[1])
# 1. prep's own patch (tags block index + draw path, writes items.json)
subprocess.run([sys.executable, '/home/siggi/dev/scratch-c140/prep/patch_compose.py', str(p)], check=True)
s = p.read_text()

DIAG_INIT = "\nDIAG = []\n"
DIAG_REC = '''
    # ---- c3 DIAG (after the block's own draw loop) ----
    _ends = [s_ + w_ for s_, w_ in zip(starts, widths)]
    _cents = [s_ + w_ / 2 for s_, w_ in zip(starts, widths)]
    _spr = lambda v: max(v) - min(v)
    _vjoin = ' '.join(' '.join(value).split())
    _wrap0 = wrap(value, sz0)
    DIAG.append(dict(
        block=BI, key=key, align=align, rot=rot, sz0=sz0, sz=sz, maxw=maxw, boxw=BOXW,
        n_src_lines=len(ls), starts=starts, widths=widths, projs=projs, centre=centre,
        spreads={'left': _spr(starts), 'center': _spr(_cents), 'right': _spr(_ends)} if len(ls) > 1 else None,
        anchor=anchor, lead=lead, top=top,
        value=value, wrapped=new, n_out_lines=len(new),
        natural_w_sz0=measure(_vjoin, ref, sz0),
        wrap_sz0=_wrap0, wrap_sz0_maxline=max((measure(t, ref, sz0) for t in _wrap0), default=0),
        drawn_widths=[measure(t, ls[min(j, len(ls) - 1)][0], sz) for j, t in enumerate(new)],
        src_flat_widths=[measure(''.join(r['text'] for r in l), ref, sz0) for l in ls],
        src_line_text=[''.join(r['text'] for r in l) for l in ls],
        bold=[ls[min(j, len(ls) - 1)][0]['font'] in BOLD for j in range(len(new))],
    ))
'''
anchor_rep = '    report.append(f"  {align:6} {sz0}->{sz:.2f}pt  {key!r}")'
for old, new in [('\nBOXW = 63.0', DIAG_INIT + '\nBOXW = 63.0'),
                 (anchor_rep, DIAG_REC + anchor_rep)]:
    n = s.count(old)
    assert n == 1, f'anchor occurs {n} times: {old!r}'
    s = s.replace(old, new, 1)
s += "\n(OUT / 'diag.json').write_text(json.dumps(DIAG, ensure_ascii=False, indent=0))\n"
p.write_text(s)
print('diag-patched', p)
