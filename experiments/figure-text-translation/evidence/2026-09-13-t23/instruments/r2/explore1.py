import json, collections, sys
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.path.insert(0,'/home/siggi/dev/scratch-c140/c3b/tree')
import figtext as FT
C3='/home/siggi/dev/scratch-c140/c3'; PREP='/home/siggi/dev/scratch-c140/prep/figs'
R=[json.loads(l) for l in open(C3+'/blocks.jsonl')]
CEN=json.load(open('/home/siggi/dev/scratch-c140/c3b/census.json'))
print('n', len(R))
print('sz0', collections.Counter(r['src']['sz0'] for r in R))
cls=collections.Counter((r['container']['final'], r['container']['dark'], r['container']['textured']) for r in R)
print(cls)
tab=[r for r in R if r['container']['final']=='BOUNDED' and r['container']['dark']!='BOUNDED' and not r['container']['textured']]
print('table-like', len(tab), collections.Counter(r['basename'] for r in tab))
for r in tab:
    c=r['container']; a=r['align']
    print(f"{r['basename'][9:]:28} b{r['block']:<2} n{r['src']['n_lines']} {r['key'][:30]!r:34} ml {c['src_margin_left_pt']:6} mr {c['src_margin_right_pt']:6} inner {c['inner_along_pt']:6} fta {a['verdict']:6} amb {a['ambiguous']} sib L{len(a['sibling_edges']['left'])}C{len(a['sibling_edges']['center'])}R{len(a['sibling_edges']['right'])}")
br=[r for r in R if r['container']['textured']]
for r in br: print('TEXTURED', r['basename'], r['block'], r['key'], r['container']['final'], r['container']['dark'], r['container'].get('vector_bbox_pt'), r['src']['frame'], r['src']['n_lines'])
# bold mixing across lines
mix=[]
for b in sorted({r['basename'] for r in R}):
    meta=json.load(open(f'{PREP}/{b}/meta.json')); runs=json.load(open(f'{PREP}/{b}/runs.json'))
    blocks=FT.merge_blocks(FT.group(runs))
    BOLD={k for k,v in meta['fonts'].items() if 'bold' in v['base'].lower()}
    for r in R:
        if r['basename']!=b: continue
        ls=FT.lines(blocks[r['block']])
        bl=[l[0]['font'] in BOLD for l in ls]
        fills=[tuple(l[0]['fill'] or []) for l in ls]
        if len(set(bl))>1 or len(set(fills))>1: mix.append((b[9:], r['block'], bl, len(set(fills))))
print('mixed bold/fill across lines:', mix)
