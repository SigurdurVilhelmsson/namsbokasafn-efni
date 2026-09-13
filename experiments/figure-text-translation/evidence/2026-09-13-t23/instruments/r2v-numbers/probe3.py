import json, sys, collections, copy, math, re
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; ME = ROOT / 'r2v-numbers'
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
def proj(it):
    t = math.radians(it['rot']); return it['x'] * math.cos(t) + it['y'] * math.sin(t), -it['x'] * math.sin(t) + it['y'] * math.cos(t)
def group(its, sz0):
    w = collections.Counter()
    for it in its: w[round(it['size'], 6)] += len(it['text'])
    base = max(w.items(), key=lambda kv: (kv[1], kv[0]))[0]
    bas = sorted([it for it in its if abs(it['size'] - base) < 1e-6], key=lambda it: -proj(it)[1]); cl = []
    for it in bas:
        n = proj(it)[1]
        if cl and abs(proj(cl[-1][-1])[1] - n) < 0.3 * sz0: cl[-1].append(it)
        else: cl.append([it])
    cen = [float(np.median([proj(i)[1] for i in c])) for c in cl]; lines = [[] for _ in cl]
    for it in its: lines[min(range(len(cen)), key=lambda j: abs(cen[j] - proj(it)[1]))].append(it)
    return [''.join(i['text'] for i in sorted(l, key=lambda it: proj(it)[0])) for l in lines]
def ok(its, val, sz0):
    t = group(its, sz0); return ' '.join(t) == ' '.join(val.split()) and all(x == ' '.join(x.split()) for x in t)
# a) positive control for my text check on a styled multi-item block (sacch b4) in V5_p2.0_f7.0
b = 'CNX_Chem_03_02_sacch_img-3278'; fig = Fig(b, items_dir=R2 / 'work/V5_p2.0_f7.0', diag_dir=R2 / 'work/V5_p2.0_f7.0')
tr = json.loads((SIDE / f'{b}.is.json').read_text())['blocks']
bi = 4; its = fig.block_items(bi); val = tr[fig.keys[bi]]; sz0 = fig.blocks[bi][0]['size']
c1 = copy.deepcopy(its); c1[0]['text'] = c1[0]['text'][:-1]
c2 = copy.deepcopy(its); c2[2]['x'], c2[3]['x'] = c2[3]['x'], c2[2]['x']
c3 = copy.deepcopy(its) + [copy.deepcopy(its[1])]
c4 = copy.deepcopy(its); c4[1]['y'] += 11.0  # move line 2 onto line 1
print('a) text check clean', ok(its, val, sz0), '| plants fire (expect False):', ok(c1, val, sz0), ok(c2, val, sz0), ok(c3, val, sz0), ok(c4, val, sz0))
# b) word counts of the fewer-lines blocks
m = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out/mym-V5_p2.0_f7.0.jsonl'))}
few = [(k, r['words'], r['src_lines'], r['lines']) for k, r in m.items() if r['lines'] < r['src_lines']]
print('b) fewer-lines blocks:', len(few), 'words==1:', sum(1 for x in few if x[1] == 1), 'others:', [(x[0][0][9:], x[0][1], x[1], x[2], x[3]) for x in few if x[1] != 1])
# c) ANCHOR checks
UF = json.loads((C3 / 'userflags.json').read_text()); v0 = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out/mym-V0.jsonl'))}
for k, fl in UF.items():
    for f in fl:
        if 'ANCHOR' in f['mechanism']:
            kk = (k.rsplit('#', 1)[0], int(k.rsplit('#', 1)[1])); r = m[kk]
            print('c) ANCHOR row', f['row'], kk[0][9:], kk[1], 'mechs', f['mechanism'], 'src_left', round(r['src_left_edge'], 2), 'V0 a0', round(v0[kk]['frame']['a0'], 2), 'V5 a0', round(r['frame']['a0'], 2), 'lines src/V5', r['src_lines'], r['lines'], '| note:', f['note'][:90])
# d) italic source runs in layout blocks; drawn italic; unformatted; styled item counts per tag
ital_src = []
for b2 in names():
    f2 = Fig(b2, items_dir=R2 / 'work/V0', diag_dir=R2 / 'work/V0')
    for bi2 in f2.layout_blocks():
        for r in f2.blocks[bi2]:
            base = f2.meta['fonts'][r['font']]['base'].lower()
            if 'italic' in base or 'oblique' in base: ital_src.append((b2[9:], bi2, r['text']))
print('d) italic source runs inside layout blocks:', len(ital_src), ital_src[:10])
for T in ('V5_p2.0_f7.0', 'V5_p2.0_f7.5', 'V5_p2.5_f8.0', 'V5_p2.0_f7.5_notr'):
    unf = 0; ita = 0; styled = 0
    for b2 in names():
        rp = json.loads((R2 / 'work' / T / b2 / 'compose-report.json').read_text()); unf += len(rp.get('unformatted', []))
        for it in json.loads((R2 / 'work' / T / b2 / 'items.json').read_text()):
            if it['path'] == 'layout':
                ita += bool(it['italic']); styled += bool(it.get('r2styled'))
    mm = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl'))}
    print(f'd) {T}: unformatted {unf}, italic layout items {ita}, r2styled items {styled}, my styled items (size != base or italic) {sum(r["styled_items"] for r in mm.values())} in {sum(1 for r in mm.values() if r["styled_items"])} blocks')
# e) exocytosis b4 spill
for T in ('V0', 'V5_p2.0_f7.0', 'V5_p2.5_f8.0'):
    r = {(x['basename'], x['block']): x for x in map(json.loads, open(ME / 'out' / f'mym-{T}.jsonl'))}[('CNX_Chem_03_01_exocytosis-88f6', 4)]
    print('e) exocytosis b4', T, 'spill', r['spill'], 'ink_on_dark', r['ink_on_dark'], 'size', r['size'], 'text', r['text'], 'lines', r['lines'], 'src', r['src_lines'])
