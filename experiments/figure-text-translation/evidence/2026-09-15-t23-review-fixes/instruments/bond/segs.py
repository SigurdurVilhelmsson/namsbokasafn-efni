import sys
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from PIL import Image
def load(f):
    im=Image.open(f).convert('L').crop((0,0,3900,579)); return im
def segs(im,y,x0,x1):
    px=im.load(); out=[]; st=None
    for x in range(x0,x1):
        ink=px[x,y]<128
        if ink and st is None: st=x
        if not ink and st is not None: out.append((st,x-1)); st=None
    if st is not None: out.append((st,x1-1))
    return out
for f in sys.argv[1:]:
    im=load(f); px=im.load()
    rows=[y for y in range(579) if all(px[x,y]<128 for x in range(3462,3525))]
    print(f, 'bond rows', rows[:2], rows[-2:])
    for y in (rows[0], rows[-1]) if rows else ():
        print('   row',y, segs(im,y,3300,3700))
