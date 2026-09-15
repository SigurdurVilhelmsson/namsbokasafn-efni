import sys
exec(open('/home/siggi/dev/scratch-c140/exo/heal/heal_one.py').read())
t=open('bis/v1b.svg',encoding='utf-8').read()
out,rep=heal_soft_mask_rings(t, only=sys.argv[1])
open(sys.argv[2],'w',encoding='utf-8').write(out); print(sys.argv[1], rep['healed'], rep['sidesHealed'])
