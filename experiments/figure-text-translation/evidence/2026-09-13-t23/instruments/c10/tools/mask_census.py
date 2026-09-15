"""Census of raster soft masks in cairo-emitted SVGs, and their perimeter ring.
Population: every <mask> in each SVG given. Unit: one <mask>; a figure is 'flagged' if any of its masks is.
For each mask whose content references an <image> (via <use>), decode the PNG and compute, per side,
mean alpha of the outermost row/col (excluding corners) minus mean alpha of the next row/col in.
FLAG threshold: any side >= 50 (0..255 alpha units)."""
import sys, re, base64, io, json
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
NS={'s':'http://www.w3.org/2000/svg','x':'http://www.w3.org/1999/xlink'}
XH='{http://www.w3.org/1999/xlink}href'
THR=50
out=[]
for path in sys.argv[1:]:
    root=ET.parse(path).getroot()
    ids={e.get('id'):e for e in root.iter() if e.get('id')}
    masks=[e for e in root.iter('{%s}mask'%NS['s'])]
    rec={'svg':path.split('/')[-1],'masks':len(masks),'imageMasks':[], 'otherMasks':0, 'flagged':False}
    for m in masks:
        uses=[u for u in m.iter('{%s}use'%NS['s'])]
        imgs=[]
        for u in uses:
            ref=(u.get(XH) or u.get('href') or '')[1:]
            el=ids.get(ref)
            if el is not None and el.tag.endswith('image'):
                imgs.append((ref,el,u))
        if not imgs:
            rec['otherMasks']+=1; continue
        for ref,el,u in imgs:
            href=el.get(XH) or el.get('href')
            b=base64.b64decode(href.split('base64,',1)[1])
            im=Image.open(io.BytesIO(b)).convert('RGBA'); a=np.asarray(im).astype(float)
            # mask value as the SVG computes it: filter-remove-color => alpha; filter-color-to-alpha => luminance*alpha
            flt=(u.get('filter') or '')
            if 'color-to-alpha' in flt:
                v=(0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2])/255*a[...,3]
            else:
                v=a[...,3]
            h,w=v.shape
            d={}
            if h>=4 and w>=4:
                d={'top':v[0,1:-1].mean()-v[1,2:-2].mean(),'bottom':v[-1,1:-1].mean()-v[-2,2:-2].mean(),
                   'left':v[1:-1,0].mean()-v[2:-2,1].mean(),'right':v[1:-1,-1].mean()-v[2:-2,-2].mean()}
            flag=any(x>=THR for x in d.values())
            rec['imageMasks'].append({'mask':m.get('id'),'image':ref,'size':[w,h],'transformed':bool(u.get('transform')),
                                      'filter':flt,'ringMinusInner':{k:round(x,1) for k,x in d.items()},'flag':flag})
            rec['flagged'] |= flag
    out.append(rec)
json.dump(out, open(sys.stdout.fileno(),'w'), indent=1) if '--json' in sys.argv else None
for r in out:
    fl=[f"{i['mask']}:{i['image']} {i['size'][0]}x{i['size'][1]}{' T' if i['transformed'] else ''} {i['ringMinusInner']}" for i in r['imageMasks'] if i['flag']]
    print(f"{r['svg']:48s} masks={r['masks']:3d} imageMasks={len(r['imageMasks']):3d} other={r['otherMasks']:3d} FLAG={'YES' if r['flagged'] else 'no '} {fl}")
print('figures:',len(out),'with any mask:',sum(1 for r in out if r['masks']),'with image masks:',sum(1 for r in out if r['imageMasks']),'flagged:',sum(1 for r in out if r['flagged']))
