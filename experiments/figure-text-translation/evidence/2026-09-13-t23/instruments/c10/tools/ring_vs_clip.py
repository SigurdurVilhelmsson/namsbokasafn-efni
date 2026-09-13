"""For every device-scale soft-mask raster (cairo pattern: <mask><g filter=remove-color><use href=#img/></g></mask>,
untransformed), relate each side's ring excess (outer row/col alpha minus next row/col in) to the fraction of that
outer pixel lying OUTSIDE the clip rect that wraps the masked group. Unit: one side of one mask."""
import sys, re, base64, io
import numpy as np
from PIL import Image
PAT=re.compile(r'<mask id="(mask-\d+)">\n<g filter="url\(#filter-remove-color\)">\n<use xlink:href="#(source-\d+)"/>\n</g>\n</mask>')
rows=[]
for path in sys.argv[1:]:
    s=open(path).read()
    for m in PAT.finditer(s):
        mid,sid=m.group(1),m.group(2)
        im=re.search(r'<image id="%s" x="0" y="0" width="(\d+)" height="(\d+)" xlink:href="data:image/png;base64,([A-Za-z0-9+/=]+)"'%sid, s)
        w,h=int(im.group(1)),int(im.group(2))
        a=np.asarray(Image.open(io.BytesIO(base64.b64decode(im.group(3)))).convert('RGBA')).astype(float)[...,3]
        c=re.search(r'<g clip-path="url\(#(clip-\d+)\)">\n<g mask="url\(#%s\)">'%mid, s)
        cp=re.search(r'<clipPath id="%s">\n<path clip-rule="nonzero" d="M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) Z'%c.group(1), s) if c else None
        uses=len(re.findall(r'href="#%s"'%sid, s))
        if cp:
            xs=[float(cp.group(i)) for i in (1,3,5,7)]; ys=[float(cp.group(i)) for i in (2,4,6,8)]
            x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
            out={'left':max(0,min(1,x0-0)), 'right':max(0,min(1,w-x1)), 'top':max(0,min(1,y0-0)), 'bottom':max(0,min(1,h-y1))}
        else:
            out={k:float('nan') for k in ('left','right','top','bottom')}
        ex={'top':a[0,1:-1].mean()-a[1,2:-2].mean(),'bottom':a[-1,1:-1].mean()-a[-2,2:-2].mean(),
            'left':a[1:-1,0].mean()-a[2:-2,1].mean(),'right':a[1:-1,-1].mean()-a[2:-2,-2].mean()}
        for side in ('left','right','top','bottom'):
            rows.append((path.split('/')[-1][:30],mid,sid,f'{w}x{h}',uses,side,out[side],ex[side]))
print(f"{'figure':30s} {'mask':9s} {'image':11s} {'size':6s} uses side    outsideFrac ringExcess")
for r in rows: print(f"{r[0]:30s} {r[1]:9s} {r[2]:11s} {r[3]:6s} {r[4]:4d} {r[5]:6s} {r[6]:10.3f} {r[7]:10.1f}")
o_all=np.array([r[6] for r in rows]); e_all=np.array([r[7] for r in rows]); k=~np.isnan(o_all); o=o_all[k]; e=e_all[k]
print('sides with NO clip wrapper (pattern differs):', int((~k).sum()), 'ringExcess of those:', [round(x,1) for x in e_all[~k]])
print('sides:',len(rows),'masks:',len(rows)//4,' corr(outsideFrac, ringExcess)=%.3f'%np.corrcoef(o,e)[0,1])
print('sides with outsideFrac<0.05: n=%d, ringExcess max %.1f' % ((o<0.05).sum(), e[o<0.05].max() if (o<0.05).any() else float('nan')))
print('sides with outsideFrac>=0.2: n=%d, ringExcess min %.1f' % ((o>=0.2).sum(), e[o>=0.2].min() if (o>=0.2).any() else float('nan')))
