import json
C='/home/siggi/dev/scratch-c140/c9/inherited/1b-census.jsonl'
D='/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-13-compose-fidelity/data/2b-translated.jsonl'
two=[json.loads(l) for l in open(D)]
names=sorted({r['basename'] for r in two})
seq2={}
for r in two: seq2.setdefault(r['basename'],[]).append((r['key'], r['state']!='never-sent'))
seq1={}
for l in open(C):
    r=json.loads(l)
    if r.get('row')=='block' and r['basename'] in seq2:
        seq1.setdefault(r['basename'],[]).append((r['key'], r['send']))
ok=0; blocks=0; bad=[]
for n in names:
    a=seq1.get(n); b=seq2[n]
    if a==b: ok+=1; blocks+=len(b)
    else: bad.append((n, len(a or []), len(b)))
print('figures', len(names), 'equal', ok, 'blocks', blocks, 'bad', bad)
