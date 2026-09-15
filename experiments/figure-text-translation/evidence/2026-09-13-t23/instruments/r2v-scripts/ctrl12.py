#!/usr/bin/env python3
"""Positive controls for check12.py: plant corruptions into COPIES of one figure's items.json + SVG (same
change in both, so the 1:1 zip still holds and the corruption reaches the checks), then run check12 --only.
Each plant must fire the check it targets; the clean copy must pass."""
import json, shutil, subprocess, sys, os, re, copy
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from svgitems import *

SRC = R2 / 'work/V5_p2.0_f7.5_dec'
B = 'CNX_Chem_03_02_sacch_img-3278'
ROOT = Path('/home/siggi/dev/scratch-c140/r2v-scripts/ctrl12')
H = json.loads((PREP / 'figs' / B / 'meta.json').read_text())['page'][1]
svg0 = (R2 / 'svg' / f'{B}.svg').read_text(encoding='utf-8')
items0 = json.loads((SRC / B / 'items.json').read_text())
texts = list(TEXT_RE.finditer(svg0))
assert len(texts) == len(items0)


def write(tag, items, edits):
    """edits: {index: (new_text|None, dx, dy, new_size|None)} applied to BOTH items and SVG."""
    d = ROOT / tag / B
    d.mkdir(parents=True, exist_ok=True)
    shutil.copy(SRC / B / 'compose-report.json', d / 'compose-report.json')
    s = svg0; its = copy.deepcopy(items)
    for k in sorted(edits, reverse=True):
        m = texts[k]; nt, dx, dy, nsz = edits[k]
        it = its[k]
        if nt is not None:
            it['text'] = nt
        it['x'] += dx; it['y'] += dy
        if nsz is not None:
            it['size'] = nsz
        a = m.group(1)
        a = re.sub(r'(?<![\w:-])x="[^"]*"', f'x="{it["x"] + it["dx"]:.3f}"', a)
        a = re.sub(r'(?<![\w:-])y="[^"]*"', f'y="{H - it["y"]:.3f}"', a)
        a = re.sub(r'(?<![\w:-])font-size="[^"]*"', f'font-size="{it["size"]:.3f}"', a)
        s = s[:m.start()] + f'<text {a}>{it["text"]}</text>' + s[m.end():]
    (d / 'items.json').write_text(json.dumps(its, ensure_ascii=False))
    (ROOT / tag / 'svg').mkdir(exist_ok=True)
    (ROOT / tag / 'svg' / f'{B}.svg').write_text(s, encoding='utf-8')
    return ROOT / tag


idx = {i: it for i, it in enumerate(items0)}
k7 = next(i for i, it in idx.items() if it['block'] == 0 and it['text'] == '7')
kNO = next(i for i, it in idx.items() if it['block'] == 0 and it['text'] == 'NO')
kmol = next(i for i, it in idx.items() if it['block'] == 4 and it['text'] == '–1')
plants = {
    'clean': {},
    'script_baseline_+0.6pt': {k7: (None, 0, 0.6, None)},
    'script_size_to_base': {k7: (None, 0, 3.0, 9.0)},
    'superscript_to_subscript': {kmol: (None, 0, -6.0, None)},
    'deleted_char': {kNO: ('N', 0, 0, None)},
    'item_moved_to_next_line': {kNO: (None, 0, -11.0, None)},
}
out = {}
for tag, ed in plants.items():
    root = write(tag, items0, ed)
    r = subprocess.run([sys.executable, str(Path(__file__).parent / 'check12.py'), str(root), str(root / 'svg'),
                        str(root / 'res.json'), '--only', B], capture_output=True, text=True,
                       env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
    res = json.loads((root / 'res.json').read_text())
    out[tag] = dict(text_fail=len(res['text_fail']), style_fail=len(res['style_fail']), seg_gran=len(res['seg_granularity']),
                    zip_bad=len(res['zip_bad']), stdout=r.stdout.strip()[:400], err=r.stderr[-300:])
    print(tag, out[tag]['text_fail'], out[tag]['style_fail'], out[tag]['seg_gran'], out[tag]['zip_bad'], r.stderr[-300:])
(ROOT / 'summary.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
