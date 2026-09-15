import sys, subprocess
exec(open('/home/siggi/dev/scratch-c140/exo/heal/heal_fn.py').read())
src='/home/siggi/dev/scratch-c140/prep/figs/CNX_Chem_03_01_exocytosis-88f6/artwork.svg'
t=open(src,encoding='utf-8').read()
h,rep=heal_soft_mask_rings(t); print('heal on orig', rep)
open('heal/h.svg','w',encoding='utf-8').write(h)
print('heal equals c10 heal/artwork.svg:', h==open('/home/siggi/dev/scratch-c140/c10/fix/exocytosis/heal/artwork.svg',encoding='utf-8').read())
subprocess.run([sys.executable,'tools/v1.py','heal/h.svg','heal/h_v1.svg'],check=True)
v=open('bis/v1.svg',encoding='utf-8').read()
vh,rep2=heal_soft_mask_rings(v); print('heal on V1', rep2)
print('V1(heal(x)) == heal(V1(x)):', vh==open('heal/h_v1.svg',encoding='utf-8').read())
