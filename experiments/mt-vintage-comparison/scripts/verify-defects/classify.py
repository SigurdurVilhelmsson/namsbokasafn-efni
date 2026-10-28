import json,collections,re,os
from load_pairs import june,new
from canon_v import canon,plain
S=os.path.dirname(os.path.abspath(__file__))
J=june(); N=new()
cls={}
for k,v in N.items():
    if k not in J: cls[k]='new-only'; continue
    je=J[k]['en']; ne=v['en']
    if je==ne: cls[k]='identical-raw'
    elif canon(je)==canon(ne): cls[k]='dialect-only'
    elif plain(je)==plain(ne): cls[k]='markup-differs'
    else: cls[k]='content-changed'
c=collections.Counter(cls.values()); print(c, sum(c.values()))
print('EN-unchanged (identical+dialect):',c['identical-raw']+c['dialect-only'])
json.dump(cls,open(f'{S}/classes.json','w'))
# per chapter
pc=collections.defaultdict(collections.Counter)
for k,cl in cls.items(): pc[N[k]['ch']][cl]+=1
for ch in sorted(pc): print(ch, dict(pc[ch]))
