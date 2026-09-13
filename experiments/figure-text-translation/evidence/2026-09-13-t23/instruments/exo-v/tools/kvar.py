import sys
base=open('/home/siggi/dev/scratch-c140/exo-v/fix/CNX_Chem_03_01_exocytosis-88f6_IS.mine.svg','rb').read()
i=base.find(b'</defs>\n<g filter="url(#filter-314)" transform="translate(-43.2, -24.1)">')
assert i>0
K=sys.argv[1]
old=b'</defs>\n<g filter="url(#filter-314)"'
v=base[:i]+b'</defs>\n<g filter="url(#%s)"'%K.encode()+base[i+len(old):]
open(sys.argv[2],'wb').write(v)
