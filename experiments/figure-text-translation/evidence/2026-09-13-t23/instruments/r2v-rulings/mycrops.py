"""Native-resolution crops (SOURCE | V0 | V5 2.0/7.5 dec [| V5 2.0/7.0]) for blocks the builder's crops do not cover.
One sheet per figure, blocks stacked vertically. Written only under r2v-rulings/crops."""
import json, sys, math
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
from PIL import ImageDraw
R2 = Path('/home/siggi/dev/scratch-c140/r2'); OUT = Path('/home/siggi/dev/scratch-c140/r2v-rulings/crops')
ROWS = {(r['basename'], r['block']): r for r in map(json.loads, open(C3 / 'blocks.jsonl'))}
T5 = 'V5_p2.0_f7.5_dec'
want = {}   # basename -> list of (block, label)
for b in names():
    dg = json.loads((R2 / 'work' / T5 / b / 'diag.json').read_text())
    for x in dg:
        if x.get('r2', {}).get('transfer'):
            want.setdefault(b, []).append((x['block'], 'token'))
extra = [('CNX_Chem_03_01_alsulfatemass_img', 13), ('CNX_Chem_03_01_aspirin', 13), ('CNX_Chem_03_01_chloroform', 13),
         ('CNX_Chem_03_01_glycinemass_img', 13), ('CNX_Chem_03_01_saltMass', 10), ('CNX_Chem_03_01_brain-ec0b', 0),
         ('CNX_Chem_04_01_rxn2', 12), ('CNX_Chem_04_01_rxn2', 9), ('CNX_Chem_04_04_sandwich', 0), ('CNX_Chem_04_04_sandwich', 6),
         ('CNX_Chem_03_01_exocytosis-88f6', 0), ('CNX_Chem_03_01_exocytosis-88f6', 1), ('CNX_Chem_03_01_exocytosis-88f6', 2),
         ('CNX_Chem_03_01_exocytosis-88f6', 4), ('CNX_Chem_04_03_etheneBr_img', 1), ('CNX_Chem_04_03_flowchart', 5),
         ('CNX_Chem_04_03_flowchart', 15), ('CNX_Chem_04_03_flowchart', 18), ('CNX_Chem_04_05_map7_img', 6)]
for b, bi in extra:
    want.setdefault(b, []).append((bi, 'extra'))
only = sys.argv[1:]  # optional basename filter
for b, lst in want.items():
    if only and b not in only:
        continue
    fig = Fig(b, items_dir=R2 / 'work' / T5, diag_dir=R2 / 'work' / T5)
    src = Image.open(fig.d / 'source.png').convert('RGB')
    v0 = Image.open(R2 / 'work/V0' / b / 'translated.png').convert('RGB')
    v5 = Image.open(R2 / 'work' / T5 / b / 'translated.png').convert('RGB')
    rows = []
    for bi, lab in sorted(set(lst)):
        r = ROWS[(b, bi)]; fr = r['src']['frame']
        its = [it for it in fig.items if it['block'] == bi]
        xs, ys = [], []
        for it in its:
            px, py = fig.dev(it['x'], it['y']); xs += [px, px + len(it['text']) * it['size'] * 0.6 * S]; ys += [py - it['size'] * S, py + 0.3 * it['size'] * S]
        t = math.radians(fr['rot'])
        for a, n in ((fr['a0'], fr['n0']), (fr['a1'], fr['n1'])):
            x = a * math.cos(t) - n * math.sin(t); y = a * math.sin(t) + n * math.cos(t); px, py = fig.dev(x, y); xs.append(px); ys.append(py)
        pad = 30
        x0 = max(0, int(min(xs) - pad)); x1 = min(fig.w, int(max(xs) + pad)); y0 = max(0, int(min(ys) - pad)); y1 = min(fig.h, int(max(ys) + pad))
        panels = [im.crop((x0, y0, x1, y1)) for im in (src, v0, v5)]
        w = sum(p.width for p in panels) + 16; h = panels[0].height + 14
        row = Image.new('RGB', (w, h), (255, 255, 255)); d = ImageDraw.Draw(row)
        xo = 0
        for p, nm in zip(panels, ('SOURCE', 'V0', 'V5 2.0/7.5dec')):
            row.paste(p, (xo, 14)); d.text((xo + 2, 1), f'{nm} b{bi} {lab}', fill=(200, 0, 0)); xo += p.width + 8
        rows.append(row)
    W = max(r.width for r in rows); H = sum(r.height + 6 for r in rows)
    sheet = Image.new('RGB', (W, H), (255, 255, 255)); yo = 0
    for r in rows:
        sheet.paste(r, (0, yo)); yo += r.height + 6
    sheet.save(OUT / f'{b}.png'); print(b, sheet.size, len(rows))
