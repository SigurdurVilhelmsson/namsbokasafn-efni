import json, sys, collections, math
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
import figtext as FT
PREP='/home/siggi/dev/scratch-c140/prep/figs/'
cen=json.load(open('/home/siggi/dev/scratch-c140/r2/census.json'))
TOLS=[float(x) for x in sys.argv[1:]] or [0.2]
FLUSH_TIGHT, FLUSH_RATIO = 4.75, 20.0
def ext_of(bl): return [(min(FT.along(r) for r in l), max(FT.along(r)+r['adv'] for r in l)) for l in FT.lines(bl)]
def align_open(blocks, bi, e, tol):
    bl=blocks[bi]; ls=FT.lines(bl)
    if len(ls)>=2:
        starts=[min(FT.along(r) for r in l) for l in ls]; ends=[max(FT.along(r)+r['adv'] for r in l) for l in ls]
        cents=[(s+t)/2 for s,t in zip(starts,ends)]
        sp={'left':max(starts)-min(starts),'center':max(cents)-min(cents),'right':max(ends)-min(ends)}
        k=min(sp,key=sp.get)
        return ('center','multi-ambiguous') if sp[k]<0.5 and False else (k,'multi')
    L,R=e['free_left_clear'],e['free_right_clear']
    tight,far=min(L,R),max(L,R); ratio=far/tight if tight>0 else float('inf')
    if tight<=FLUSH_TIGHT and ratio>=FLUSH_RATIO: return ('left' if L<=R else 'right'),'flush'
    (m0,m1),=ext_of(bl); rot=bl[0]['rot']
    cue=[False,False,False]
    for oj,ob in enumerate(blocks):
        if oj==bi or abs(ob[0]['rot']-rot)>3: continue
        for a0,a1 in ext_of(ob):
            if abs(a0-m0)<=tol: cue[0]=True
            if abs((a0+a1)/2-(m0+m1)/2)<=tol: cue[1]=True
            if abs(a1-m1)<=tol: cue[2]=True
    if cue==[True,False,False]: return 'left','cue'
    if cue==[False,False,True]: return 'right','cue'
    return 'center','cue%s'%''.join(str(int(c)) for c in cue)
for tol in TOLS:
    moved=[]
    for k,e in cen.items():
        if e['r2cls']!='open': continue
        b,bi=k.split('#'); bi=int(bi)
        blocks=FT.merge_blocks(FT.group(json.load(open(PREP+b+'/runs.json'))))
        got,why=align_open(blocks,bi,e,tol)
        if got!=e['open_align_r2']: moved.append((k,blocks[bi][0]['text'][:24],e['open_align_r2'],'->',got,why,e['open_align_r2_why']))
    print('TOL',tol,'moved',len(moved))
    for m in moved: print('  ',m)
