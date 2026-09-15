import json, sys, collections
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
import pdfplumber
PREP='/home/siggi/dev/scratch-c140/prep/figs/'
rows=[json.loads(l) for l in open('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-13-t23/data/c3-blocks.jsonl')]
def cls(r):
    c=r['container']
    if c['final']=='OPEN': return 'open'
    return 'box' if (c['dark']=='BOUNDED' and not c['textured']) else 'cell'
print(collections.Counter((cls(r), r['container']['vector_kind']) for r in rows))
# look at one box and one cell figure's vector objects around the frame
seen=set()
for r in rows:
    k=cls(r)
    if (k,) in seen: continue
    seen.add((k,))
    b=r['basename']; fr=r['src']['bbox_pt']
    with pdfplumber.open(PREP+b+'/artwork.pdf') as pdf:
        p=pdf.pages[0]
        print('\n==',k,b,r['block'],r['key'],'frame',fr,'vec',r['container']['vector_bbox_pt'],'page',p.width,p.height)
        for o in p.rects+p.curves+p.lines:
            if o['x0']<=fr[0]+30 and o['x1']>=fr[2]-30 and o['y0']<=fr[1]+30 and o['y1']>=fr[3]-30:
                print(' ',o['object_type'],[round(o[z],2) for z in ('x0','y0','x1','y1')],'stroke',o.get('stroke'),'fill',o.get('fill'),'lw',o.get('linewidth'),'sc',o.get('stroking_color'),'nsc',o.get('non_stroking_color'),'path',[s[0] for s in o.get('path',[])][:12])
