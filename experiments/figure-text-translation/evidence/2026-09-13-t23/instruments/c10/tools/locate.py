"""Locate straight-line artefacts present in OUR render and absent from the source render.
Population: pixels of 975x484 renders at 200 dpi. Unit: pixel / column / row."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
def lum(p):
    a=np.asarray(Image.open(p).convert('RGB')).astype(float)
    return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
ref, ours = sys.argv[1], sys.argv[2]
T=float(sys.argv[3]) if len(sys.argv)>3 else 20
R=lum(ref); O=lum(ours)
h=min(R.shape[0],O.shape[0]); w=min(R.shape[1],O.shape[1]); R=R[:h,:w]; O=O[:h,:w]
# text-ink mask: from source vs artwork (pdftocairo both) and from ours vs its artwork, passed as optional 4th/5th args
mask=np.zeros((h,w),bool)
for pair in sys.argv[4:]:
    a,b=pair.split(',')
    A=lum(a)[:h,:w]; B=lum(b)[:h,:w]
    mask|=ndi.binary_dilation(np.abs(A-B)>30, iterations=3)
D=O-R
for sign,name in ((1,'BRIGHTER in ours'),(-1,'DARKER in ours')):
    hit=(sign*D>T)&~mask
    colc=hit.sum(0); rowc=hit.sum(1)
    # a straight line = a column/row whose hit count exceeds its neighbours' by a lot
    def spikes(c, axis):
        med=ndi.median_filter(c.astype(float), size=15)
        idx=np.where((c-med)>=30)[0]
        return [(int(i), int(c[i]), float(med[i])) for i in idx]
    print(name, f'T={T}', 'hit px (text masked):', int(hit.sum()), 'masked px:', int(mask.sum()))
    print('  column spikes (x, hits, local median):', spikes(colc,0))
    print('  row spikes (y, hits, local median):', spikes(rowc,1))
