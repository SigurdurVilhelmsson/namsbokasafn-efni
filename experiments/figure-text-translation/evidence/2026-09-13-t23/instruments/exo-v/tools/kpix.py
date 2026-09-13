import sys, numpy as np
from PIL import Image
ld=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(int)
L=lambda x:0.2126*x[...,0]+0.7152*x[...,1]+0.0722*x[...,2]
v=ld(sys.argv[1]); s=ld('/home/siggi/dev/scratch-c140/prep/figs/CNX_Chem_03_01_exocytosis-88f6/source.png')
box=(slice(166,246),slice(222,262))
print(sys.argv[1], 'px(240,240)',v[240,240].tolist(),'px(206,252)',v[206,252].tolist(),'px(203,249)',v[203,249].tolist(),'box lum mean',L(v)[box].mean().round(1),'src',L(s)[box].mean().round(1), 'box darker-than-60 px', (L(v)[box]<60).sum(), 'src', (L(s)[box]<60).sum())
