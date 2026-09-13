"""Ring visibility on exocytosis: V1 (unhealed) vs V1+heal, both Chromium <img> at 200 dpi.
Unit: pixel of 1200x669 render; luminance. Reference: artwork.png (cairo, text-free)."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
L=lambda p: (lambda a: 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2])(np.asarray(Image.open(p).convert('RGB')).astype(float))[:669,:1200]
U=L('bis/v1.png'); H=L('heal/h_v1.png'); C=L('/home/siggi/dev/scratch-c140/prep/figs/CNX_Chem_03_01_exocytosis-88f6/artwork.png')
d=H-U
print('px changed (|dL|>0):', int((np.abs(d)>0).sum()), ' >8:', int((np.abs(d)>8).sum()), ' >20:', int((np.abs(d)>20).sum()), ' max |dL| %.1f'%np.abs(d).max())
lab,n=ndi.label(ndi.binary_dilation(np.abs(d)>0, iterations=3)); sl=ndi.find_objects(lab)
print('clusters:', n)
for i,s in enumerate(sl):
    m=(lab[s]==i+1)&(np.abs(d[s])>0)
    eu=np.abs(U[s]-C[s])[m]; eh=np.abs(H[s]-C[s])[m]
    print(f'  y{s[0].start}-{s[0].stop} x{s[1].start}-{s[1].stop} changed {int(m.sum())} px, >8: {int((np.abs(d[s])[m]>8).sum())}, '
          f'mean|unhealed-cairo| {eu.mean():.1f} -> mean|healed-cairo| {eh.mean():.1f}; max|unhealed-cairo| {eu.max():.0f} -> {eh.max():.0f}; '
          f'unhealed brighter than cairo by >20: {int(((U[s]-C[s])[m]>20).sum())} -> {int(((H[s]-C[s])[m]>20).sum())}')
# crops x4 of each cluster: cairo / unhealed / healed
tiles=[]
for s in sl:
    y0=max(0,s[0].start-6); y1=min(669,s[0].stop+6); x0=max(0,s[1].start-6); x1=min(1200,s[1].stop+6)
    t=np.concatenate([C[y0:y1,x0:x1],U[y0:y1,x0:x1],H[y0:y1,x0:x1]],1)
    tiles.append(np.kron(t,np.ones((4,4))))
W=max(t.shape[1] for t in tiles)
img=np.concatenate([np.pad(t,((0,8),(0,W-t.shape[1])),constant_values=128) for t in tiles],0)
Image.fromarray(np.clip(img,0,255).astype(np.uint8)).save('heal/ring_crops_cairo_unhealed_healed_x4.png')
print('crops', img.shape)
