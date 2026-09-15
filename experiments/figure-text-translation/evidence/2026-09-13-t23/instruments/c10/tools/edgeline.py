"""Edge-line contrast at the brain glow form's BBox (Fm0: PDF x 227.766..316.293, y 57.868..80.762 pt).
Unit: luminance (0..255) of a 1-px line relative to the median of its +-6 px neighbourhood,
averaged along the edge run. Controls: the same statistic at 4 positions with no edge."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
S=200/72
X0,X1=227.766*S, 316.293*S
Y0,Y1=(174-80.762)*S, (174-57.868)*S     # top-down
def lum(p):
    a=np.asarray(Image.open(p).convert('RGB')).astype(float)
    return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
def vline(L,xc,y0,y1):
    P=L[y0:y1,:].mean(0)
    xs=range(int(round(xc))-2,int(round(xc))+3)
    return max(P[x]-np.median(P[x-6:x+7]) for x in xs)
def hline(L,yc,x0,x1):
    P=L[:,x0:x1].mean(1)
    ys=range(int(round(yc))-2,int(round(yc))+3)
    return max(P[y]-np.median(P[y-6:y+7]) for y in ys)
ya,yb=int(Y0)+6,int(Y1)-6; xa,xb=int(X0)+12,int(X1)-12
print(f'rect px: x {X0:.1f}..{X1:.1f}  y {Y0:.1f}..{Y1:.1f}')
print(f"{'render':34s} {'left':>6s} {'right':>6s} {'top':>6s} {'bottom':>6s} | {'ctlV1':>6s} {'ctlV2':>6s} {'ctlH1':>6s} {'ctlH2':>6s}")
for p in sys.argv[1:]:
    L=lum(p)
    e=[vline(L,X0,ya,yb),vline(L,X1,ya,yb),hline(L,Y0,xa,xb),hline(L,Y1,xa,xb)]
    c=[vline(L,X0+60,ya,yb),vline(L,X1-45,ya,yb),hline(L,Y0+25,xa,xb),hline(L,Y1+30,xa,xb)]
    print(f"{p.split('/')[-1]:34s} "+' '.join(f'{v:6.1f}' for v in e)+' | '+' '.join(f'{v:6.1f}' for v in c))
