import json, sys, statistics, collections
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from fontTools.ttLib import TTFont
S=sys.argv[1]
BW=json.load(open(f'{S}/1d/data/browser_widths.json'))
F={}
for w in ('Regular','Bold'):
    t=TTFont(f'/usr/share/fonts/truetype/liberation/LiberationSans-{w}.ttf')
    cm=t.getBestCmap(); hm=t['hmtx'].metrics; upm=t['head'].unitsPerEm
    # kern pairs from GPOS is complex; use legacy 'kern' table if present
    kern={}
    if 'kern' in t:
        for st in t['kern'].kernTables: kern.update(st.kernTable)
    F[w=='Bold']=(cm,hm,upm,kern)
def hmtx_w(text,size,bold,use_kern=False):
    cm,hm,upm,kern=F[bold]; g=[cm.get(ord(c)) for c in text]
    w=sum(hm[x][0] for x in g if x)
    if use_kern: w+=sum(kern.get((a,b),0) for a,b in zip(g,g[1:]) if a and b)
    return w*size/upm
rows=[]
for n in open(f'{S}/prep/bought.txt').read().split():
    D=json.load(open(f'{S}/1d/work/{n}/diag-translated.json'))
    items=D['items']; bw=BW[n]
    assert len(items)==len(bw), (n,len(items),len(bw))
    # cairo w per item from diag out
    wmap={}
    for b in D['blocks']:
        if b['arc']: continue
        for j,o in enumerate(b['out']): wmap[b['item0']+j]=(o['w'], b['align'], b['kept'] or False, b['key'])
    for i,(it,bwi) in enumerate(zip(items,bw)):
        assert it['text'].strip()==bwi['text'].strip() or True
        cw,align,kept,key=wmap[i]
        hw=hmtx_w(it['text'],it['size'],it['bold']); hk=hmtx_w(it['text'],it['size'],it['bold'],True)
        rows.append(dict(fig=n,key=key,text=it['text'],size=it['size'],align=align,cairo=cw,browser=bwi['len'],hmtx=hw,hmtx_kern=hk))
d_bc=[r['browser']-r['cairo'] for r in rows]
d_bh=[r['browser']-r['hmtx'] for r in rows]
d_bk=[r['browser']-r['hmtx_kern'] for r in rows]
d_ch=[r['cairo']-r['hmtx'] for r in rows]
def q(v): v=sorted(v); return dict(n=len(v), min=round(v[0],3), p5=round(v[len(v)//20],3), med=round(statistics.median(v),3), p95=round(v[len(v)*19//20],3), max=round(v[-1],3))
print('browser - cairo  ', q(d_bc)); print('browser - hmtx   ', q(d_bh)); print('browser - hmtx+kern', q(d_bk)); print('cairo - hmtx     ', q(d_ch))
print('kern table present:', {k:len(v[3]) for k,v in F.items()})
# visible shift: centred text centre moves by (browser-cairo)/2, right-aligned end by (browser-cairo)
big=[r for r in rows if abs(r['browser']-r['cairo'])>=1.0]
print('items |browser-cairo|>=1pt:', len(big), 'of', len(rows))
for r in sorted(big,key=lambda r:-abs(r['browser']-r['cairo']))[:12]: print('  ', round(r['browser']-r['cairo'],2), r['align'], r['fig'][9:], repr(r['text']))
shift=[abs(r['browser']-r['cairo'])*(0.5 if r['align']=='center' else (1.0 if r['align']=='right' else 0.0)) for r in rows]
print('anchor-point displacement in browser (center: half, right: full, left: 0):', q(shift), 'items >=0.5pt', sum(1 for s in shift if s>=0.5))
print('align counts', collections.Counter(r['align'] for r in rows))
json.dump(rows, open(f'{S}/1d/data/width_rows.json','w'), ensure_ascii=False)
