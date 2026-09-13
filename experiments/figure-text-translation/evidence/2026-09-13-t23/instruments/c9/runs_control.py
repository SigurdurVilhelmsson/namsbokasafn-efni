import json, sys, os
EXP='/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation'
sys.path.insert(0, EXP); sys.path.insert(0, EXP+'/pylibs')
os.environ.setdefault('FIGTEXT_PYLIBS', EXP+'/pylibs')
sys.dont_write_bytecode = True
import _deps
import figtext as FT
from blockkey import block_key
from readlayer import read
C='/home/siggi/dev/scratch-c140/c9/inherited/1b-census.jsonl'
want={'CNX_Chem_03_01_alsulfatemass_img','CNX_Chem_03_01_aspirin','CNX_Chem_04_02_HClsoln'}
res={r['basename']:r for r in json.load(open('/home/siggi/dev/scratch-c140/c9/inherited/resolved.json'))}
cen={}
for l in open(C):
    r=json.loads(l)
    if r.get('row')=='block' and r['basename'] in want:
        cen.setdefault(r['basename'],[]).append((r['key'], [tuple(x[:1])+tuple(x[1:6]) for x in r['runs']]))
for b in sorted(want):
    runs, meta, outcome = read(res[b]['artwork'])
    blocks = FT.merge_blocks(FT.group(runs))
    fresh=[(block_key(bl), [(r['text'], round(r['size'],2), round(FT.along(r),2), round(FT.proj(r),2), round(r['adv'],2), round(r['rot'],1)) for r in bl]) for bl in blocks]
    c=cen[b]
    print(b, 'blocks fresh', len(fresh), 'census', len(c), 'identical', fresh==c,
          'runs', sum(len(x[1]) for x in fresh))
    if fresh!=c:
        for i,(x,y) in enumerate(zip(fresh,c)):
            if x!=y: print('  first diff', i, x, y); break
