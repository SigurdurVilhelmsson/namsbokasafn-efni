import json, sys, collections, math
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
import figtext as FT
PREP='/home/siggi/dev/scratch-c140/prep/figs/'
cen=json.load(open('/home/siggi/dev/scratch-c140/r2/census.json'))
gaps=[]
for k,e in cen.items():
    if e['r2cls']!='open' or e['n_src']!=1: continue
    b,bi=k.split('#'); bi=int(bi)
    runs=json.load(open(PREP+b+'/runs.json')); blocks=FT.merge_blocks(FT.group(runs))
    ext={j:[(min(FT.along(r) for r in l), max(FT.along(r)+r['adv'] for r in l), bl[0]['rot']) for l in FT.lines(bl)] for j,bl in enumerate(blocks)}
    (m0,m1,rot),=ext[bi]
    for oj,oth in ext.items():
        if oj==bi or abs(oth[0][2]-rot)>3: continue
        for a0,a1,_ in oth:
            for kind,g in (('left',abs(a0-m0)),('center',abs((a0+a1)/2-(m0+m1)/2)),('right',abs(a1-m1))):
                if g<=3.0: gaps.append((round(g,3),kind,b,bi,e.get('open_align_r2'),blocks[bi][0]['text'][:20],blocks[oj][0]['text'][:20]))
gaps.sort()
hist=collections.Counter(math.floor(g[0]/0.05)*0.05 for g in gaps)
for lo in [x*0.05 for x in range(0,61)]:
    n=hist.get(round(lo,2),0) or hist.get(lo,0)
    print(f'{lo:4.2f}-{lo+0.05:4.2f} {"#"*n} {n}')
for g in gaps:
    if g[0]<=0.8: print(g)
