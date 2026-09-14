import json, sys, collections, math, statistics
exec(open('cls_v2.py').read().split("out=[]; conf")[0].replace("SPAN=float(sys.argv[1]) if len(sys.argv)>1 else 1.0","SPAN=1.0"))
from PIL import Image
cen=json.load(open('/home/siggi/dev/scratch-c140/r2/census.json'))
S=200/72.0; STEP=0.25
def line_boxes(block):
    out=[]
    for l in FT.lines(block):
        a0=FT.along(l[0]); a1=max(FT.along(r)+r['adv'] for r in l)
        sz=l[0]['size']; pj=FT.proj(l[0])
        out.append((a0,a1,pj-DESC*sz,pj+ASC*sz,block[0]['rot']))
    return out
def inside_any(x,y,boxes):
    for a0,a1,n0,n1,rot in boxes:
        t=math.radians(rot); a=x*math.cos(t)+y*math.sin(t); n=-x*math.sin(t)+y*math.cos(t)
        if a0<=a<=a1 and n0<=n<=n1: return True
    return False
def march(px,Wpx,Hpx,Wpt,Hpt,others,a,n,rot,da,dn,limit=600):
    t=math.radians(rot); d=0.0
    while d<limit:
        aa=a+da*d; nn=n+dn*d
        x=aa*math.cos(t)-nn*math.sin(t); y=aa*math.sin(t)+nn*math.cos(t)
        ix=math.floor(x*S); iy=math.floor((Hpt-y)*S)
        if not (0<=ix<Wpx and 0<=iy<Hpx): return max(d-STEP,0.0),'page'
        if px[ix,iy]<128 or inside_any(x,y,others): return d,'hit'
        d+=STEP
    return d,'page'
def samples(lo,hi,k):
    if hi-lo<1e-6: return [lo]
    return [lo+0.15*(hi-lo)+i*(0.7*(hi-lo))/(k-1) for i in range(k)]
devs=collections.defaultdict(list); worst=[]
byfig=collections.defaultdict(list)
for r in rows: byfig[r['basename']].append(r)
for b,rs in byfig.items():
    runs=json.load(open(PREP+b+'/runs.json'))
    blocks=FT.merge_blocks(FT.group(runs))
    img=Image.open(PREP+b+'/artwork.png').convert('L'); px=img.load(); Wpx,Hpx=img.size
    meta=json.load(open(PREP+b+'/meta.json')); Wpt,Hpt=meta['page']
    allboxes={i:line_boxes(bl) for i,bl in enumerate(blocks)}
    for r in rs:
        e=cen[f"{b}#{r['block']}"]
        if e['r2cls']!='open': continue
        bi=r['block']; blk=blocks[bi]; rot=blk[0]['rot']
        others=[x for j,bx in allboxes.items() if j!=bi for x in bx]
        lb=allboxes[bi]
        a0=min(x[0] for x in lb); a1=max(x[1] for x in lb); n0=min(x[2] for x in lb); n1=max(x[3] for x in lb)
        L=min(march(px,Wpx,Hpx,Wpt,Hpt,others,a0,n,rot,-1,0)[0] for n in samples(n0,n1,7))
        R=min(march(px,Wpx,Hpx,Wpt,Hpt,others,a1,n,rot,+1,0)[0] for n in samples(n0,n1,7))
        U=min(march(px,Wpx,Hpx,Wpt,Hpt,others,a,n1,rot,0,+1)[0] for a in samples(a0,a1,11))
        D=min(march(px,Wpx,Hpx,Wpt,Hpt,others,a,n0,rot,0,-1)[0] for a in samples(a0,a1,11))
        FL,FR=a0-L,a1+R
        d=dict(FL=FL-e['FL'],FR=FR-e['FR'],up=U-e['room_up'],down=D-e['room_down'])
        for k,v in d.items(): devs[k].append(v)
        worst.append((max(abs(v) for v in d.values()),b,bi,r['key'],{k:round(v,2) for k,v in d.items()}))
print({k:(round(min(v),2),round(statistics.median(v),2),round(max(v),2), sum(abs(x)>0.3 for x in v)) for k,v in devs.items()})
worst.sort(reverse=True)
for w in worst[:15]: print(w)
