import json,re,collections
from load_pairs import june,new
from canon_v import plain
J=june(); N=new(); cls=json.load(open('classes.json'))
al=json.load(open('alagning_hits.json'))
gir={nm:{k for k,v in V.items() if re.search(r'girðit',plain(v['is']),re.I) and re.search(r'\bvalen',plain(v['en']),re.I) and not re.search(r'coordinat',plain(v['en']),re.I)} for nm,V in [('J',J),('N',N)]}
untJ={'m68662:title:pref-sec-027-title#0','m68662:title:pref-sub-028-title#0','m68662:title:pref-sub-033-title#0','m68662:title:pref-sub-035-title#0','m68662:para:pref-p-029#0','m68662:para:pref-p-030#0','m68662:para:pref-p-031#0'}
untN={'m68744:para:fs-idp92007424#0','m68852:para:fs-idp10810528#0','m68852:para:fs-idm5999248#0','m68852:alt:fs-idp74884384-alt#0','m68852:para:fs-idp183438528#0','m68852:para:fs-idp1433408#0','m68852:item:fs-idp258853168-item-1#0','m68856:para:fs-idm211204656#0'}
mk=json.load(open('markers_v.json'))
mJ={k for k,_ in mk['June']['flags']}; mN={k for k,_ in mk['New']['flags']}
theirs=json.load(open('../defects/aggregate.json')) if False else None
rows=collections.defaultdict(collections.Counter)
for k,v in J.items(): rows[v['ch']]['segs_june']+=1
for k,v in N.items():
    r=rows[v['ch']]; r['segs_new']+=1; r[cls[k]]+=1
    if cls[k] in ('identical-raw','dialect-only'): r['reuse']+=1
for nm,V,A,G,U,M in [('J',J,set(al['J']),gir['J'],untJ,mJ),('N',N,set(al['N']),gir['N'],untN,mN)]:
    for k in A: rows[V[k]['ch']]['alag_'+nm]+=1
    for k in G: rows[V[k]['ch']]['gird_'+nm]+=1
    for k in U: rows[V[k]['ch']]['untr_'+nm]+=1
    for k in M: rows[V[k]['ch']]['mark_'+nm]+=1
tot=collections.Counter()
for ch in sorted(rows): tot+=rows[ch]
rows['TOTAL']=tot
cols=['segs_june','segs_new','reuse','identical-raw','dialect-only','markup-differs','content-changed','new-only','alag_J','alag_N','gird_J','gird_N','untr_J','untr_N','mark_J','mark_N']
print('ch\t'+'\t'.join(cols))
for ch in list(sorted(k for k in rows if k!='TOTAL'))+['TOTAL']:
    print(ch+'\t'+'\t'.join(str(rows[ch][c]) for c in cols))
json.dump({ch:dict(r) for ch,r in rows.items()},open('perchapter_v.json','w'),indent=0)
