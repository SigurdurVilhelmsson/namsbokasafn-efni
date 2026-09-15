import sys, numpy as np; from PIL import Image
a=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int); b=np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
d=np.abs(a-b).max(-1); w=np.asarray(Image.open(sys.argv[2]).convert('L'))
print(sys.argv[1].split('/')[-1], 'vs', sys.argv[2].split('/')[-1], 'identical px', int((d==0).sum()), 'of', d.size, 'maxChanDiff', int(d.max()), 'px>2', int((d>2).sum()), 'nonwhite(<250) px in 2nd', int((w<250).sum()))
