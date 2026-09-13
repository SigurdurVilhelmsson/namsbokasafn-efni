"""Pixel fidelity of a Chromium render vs a cairo reference render at the same scale.
Unit: pixel of the reference grid (cropped to common size). Luminance 0-255.
Optional text mask: pairs a,b -> mask |a-b|>30 dilated 3 px (as c10 locate.py).
Prints: N px, masked px, mean |dL|, p99 |dL|, px with |dL|>20 (count, %), max per-channel |d|."""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
def rgb(p): return np.asarray(Image.open(p).convert('RGB')).astype(float)
def lum(a): return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
ref, ours = sys.argv[1], sys.argv[2]
R=rgb(ref); O=rgb(ours); h=min(R.shape[0],O.shape[0]); w=min(R.shape[1],O.shape[1]); R=R[:h,:w]; O=O[:h,:w]
mask=np.zeros((h,w),bool)
for pair in sys.argv[3:]:
    a,b=pair.split(','); A=lum(rgb(a))[:h,:w]; B=lum(rgb(b))[:h,:w]
    mask|=ndi.binary_dilation(np.abs(A-B)>30, iterations=3)
d=np.abs(lum(O)-lum(R))[~mask]; dc=np.abs(O-R)[~mask]
print(json.dumps({'ref':ref.split('/')[-1],'ours':ours.split('/')[-1],'N':int(d.size),'masked':int(mask.sum()),
  'meanAbsL':round(float(d.mean()),3),'p99AbsL':round(float(np.percentile(d,99)),2),
  'gt20':int((d>20).sum()),'gt20pct':round(100*float((d>20).mean()),3),'maxChan':int(dc.max())}))
