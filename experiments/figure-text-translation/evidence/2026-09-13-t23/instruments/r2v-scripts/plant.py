#!/usr/bin/env python3
"""(6) Edge-case plants into COPIES of sidecar values, composed through the r2 tree (V5, PAD 2.0, F 7.5, decimal 0).

usage: plant.py            (runs every plant below)
Each plant: plant/<name>/<b>/ (symlinks to prep's inputs), plant/<name>/<b>.is.json (edited copy), compose --svg.
Reports rc, stderr tail, unformatted, overflow, and per edited block: drawn lines / styled <text> from the SVG.
Unedited blocks are compared item-for-item against the committed cell (regen V5_p2.0_f7.5_svg)."""
import json, os, subprocess, sys, shutil
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from svgitems import *

ME = Path('/home/siggi/dev/scratch-c140/r2v-scripts')
BASECELL = ME / 'regen/work/V5_p2.0_f7.5_svg'
SACCH = 'CNX_Chem_03_02_sacch_img-3278'; MAP3 = 'CNX_Chem_04_03_map3_img'; HCL = 'CNX_Chem_04_02_HClsoln'

PLANTS = {
    'P1_unicode_subscripts': (SACCH, {'Moles of|C7H5NO3S|(mol)': 'Mól af C₇H₅NO₃S (mól)', 'Mass of|C7H5NO3S|(g)': 'Massi C₇H₅NO₃S (g)'}),
    'P2_formula_replaced_by_name': (SACCH, {'Number of|C7H5NO3S|molecules': 'Fjöldi sakkarínsameinda'}),
    'P3_repeated_formula': (SACCH, {'Mass of|C7H5NO3S|(g)': 'Massi C7H5NO3S og C7H5NO3S (g)'}),
    'P4_double_space': (SACCH, {'Moles of|C7H5NO3S|(mol)': 'Mól af  C7H5NO3S  (mól)', 'Multiply by|Avogadro’s|number (mol–1)': 'Margfalda  með tölu Avogadros  (mól–1)'}),
    'P5_glued_anchored_repeat': (SACCH, {'Multiply by|Avogadro’s|number (mol–1)': 'Margfalda með tölu Avogadros (mól–1mól–1)'}),
    'P6_shrink_scripted': (SACCH, {'Moles of|C7H5NO3S|(mol)': 'Mól af C7H5NO3S-sameindum (mól)'}),
    'P7_repeated_two_digit': (MAP3, {'Mass of |C8H18': 'Massi C8H18 og C8H18'}),
    'P8_tab_newline_nbsp': (MAP3, {'Moles of |C8H18': 'Mól af\tC8H18\n', 'Moles of O2': 'Mól af O2'}),
    'P9_unicode_in_one_of_two': (MAP3, {'Mass of O2': 'Massi O₂ (O2)'}),
    'P10_identity_block_edited_italic': (HCL, {'HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)': 'HCl(aq) + H2O(l) gefur H3O+(aq) + Cl–(aq)'}),
}


def run(name, b, edits, census=None):
    root = ME / 'plant' / name
    w = root / b
    if w.exists():
        shutil.rmtree(w)
    w.mkdir(parents=True)
    for f in ('meta.json', 'runs.json', 'artwork.png', 'blocks.json', 'artwork.svg'):
        (w / f).symlink_to(PREP / 'figs' / b / f)
    side = json.loads((SIDE / f'{b}.is.json').read_text())
    for k, v in edits.items():
        assert k in side['blocks'], (name, k)
        side['blocks'][k] = v
    (root / f'{b}.is.json').write_text(json.dumps(side, ensure_ascii=False, indent=1))
    env = dict(os.environ, FIGTEXT_PYLIBS=str(R2 / 'tree/pylibs'), PYTHONDONTWRITEBYTECODE='1',
               PYTHONPYCACHEPREFIX=str(ME / 'pyc'), R2_VARIANT='V5', R2_DECIMAL='0', R2_TRANSFER='1',
               R2_CENSUS=str(census or (R2 / 'census.json')), R2_PAD='2.0', R2_FLOOR='7.5', FIGTEXT_OUT=str(w), R2_BASENAME=b)
    env.pop('C3B_VARIANT', None)
    r = subprocess.run([sys.executable, '-u', str(R2 / 'tree/compose.py'), '--translations', str(root / f'{b}.is.json'), '--svg'],
                       env=env, capture_output=True, text=True, timeout=300)
    (w / 'compose.stdout.txt').write_text(r.stdout); (w / 'compose.stderr.txt').write_text(r.stderr)
    row = dict(name=name, b=b, rc=r.returncode, stderr_tail=r.stderr[-700:], edits=edits)
    if r.returncode != 0 or not (w / 'compose-report.json').exists():
        row['report'] = None
        return row
    rep = json.loads((w / 'compose-report.json').read_text())
    row['unformatted'] = rep.get('unformatted'); row['overflow'] = rep.get('overflow')
    H = json.loads((w / 'meta.json').read_text())['page'][1]
    items = json.loads((w / 'items.json').read_text())
    svg = parse_svg(w / 'translated.svg', H)
    zi, bad = zip_items(svg, items)
    row['zip_bad'] = len(bad)
    runs = json.loads((w / 'runs.json').read_text())
    blocks = FT.merge_blocks(FT.group(runs)); keys = [block_key(x) for x in blocks]
    base = json.loads((BASECELL / b / 'items.json').read_text())
    row['blocks'] = {}
    for bi, k in enumerate(keys):
        mine = [it for it in zi if it['block'] == bi]
        ref = [it for it in base if it['block'] == bi]
        if k in edits:
            row['blocks'][f'b{bi}'] = dict(key=k, value=edits[k], path=sorted({it['path'] for it in mine}),
                                           texts=[(it['text'], round(it['size'], 3), round(it['y'], 3), it['italic']) for it in mine],
                                           diag=None)
        else:
            strip = lambda L: [{kk: vv for kk, vv in it.items() if kk not in ('space', 'fill')} for it in L]
            mi = [it for it in items if it['block'] == bi]
            if mi != ref:
                row.setdefault('UNEDITED_BLOCK_CHANGED', []).append(bi)
    return row


if __name__ == '__main__':
    rows = []
    only = sys.argv[1:] or list(PLANTS)
    for name in only:
        b, ed = PLANTS[name]
        row = run(name, b, ed)
        rows.append(row)
        print(json.dumps(dict(name=name, rc=row['rc'], unformatted=row.get('unformatted'), overflow=row.get('overflow'),
                              unedited_changed=row.get('UNEDITED_BLOCK_CHANGED'), zip_bad=row.get('zip_bad'),
                              err=row['stderr_tail'][-300:] if row['rc'] else ''), ensure_ascii=False))
    (ME / 'out/plants.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1))
