import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
def L(p):
    a=np.asarray(Image.open(p).convert('RGB')).astype(float); return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2], a
r,ra=L(sys.argv[1]); s,sa=L(sys.argv[2]); ca,_=L(sys.argv[3]); cr,_=L(sys.argv[4])
h=min(r.shape[0],s.shape[0]); w=min(r.shape[1],s.shape[1]); r,s,ca,cr=(x[:h,:w] for x in (r,s,ca,cr))
mask=ndi.binary_dilation((np.abs(s-ca)>10)|(np.abs(r-cr)>10), iterations=3)
d=np.abs(r-s); d[mask]=0
g=d>20
lab,n=ndi.label(ndi.binary_dilation(g,iterations=2))
sizes=[]
for i,sl in enumerate(ndi.find_objects(lab),1):
    cnt=int((g[sl]&(lab[sl]==i)).sum()); sizes.append((cnt,sl[0].start,sl[0].stop,sl[1].start,sl[1].stop))
sizes.sort(reverse=True)
tot=sum(x[0] for x in sizes)
print(json.dumps({'gt20':int(g.sum()),'clusters':n,'top10':sizes[:10],'top10share':round(sum(x[0] for x in sizes[:10])/max(tot,1),3),
 'signed_mean_render_minus_source_on_gt20': round(float((r-s)[g].mean()),2) if g.any() else None}))
vis=np.stack([np.clip(255-d*4,0,255)]*3,-1).astype(np.uint8)
Image.fromarray(vis).save(sys.argv[5])
