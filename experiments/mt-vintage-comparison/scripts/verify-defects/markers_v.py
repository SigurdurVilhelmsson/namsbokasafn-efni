import json,collections,re
from load_pairs import june,new
from canon_v import signature, legacy_to_bracket, parse_brackets
J=june(); N=new()
res={}
for name,V in [('June',J),('New',N)]:
    flags=[]; tot_en=collections.Counter(); tot_is=collections.Counter(); hybrid=[]
    for k,v in V.items():
        se=signature(v['en']); si=signature(v['is'])
        tot_en+=se; tot_is+=si
        if re.search(r'\{\{[A-Za-z]+:',v['is'] or ''): hybrid.append(k)
        if se!=si:
            d={t:si.get(t,0)-se.get(t,0) for t in set(se)|set(si) if si.get(t,0)!=se.get(t,0)}
            flags.append((k,d))
    res[name]={'flags':flags,'hybrid':hybrid}
    print(name,'segments with marker-type delta:',len(flags),f'({1000*len(flags)/len(V):.2f}/1000)','hybrid {{x:}} in IS:',len(hybrid))
    print('   delta types:',collections.Counter(t for _,d in flags for t in d).most_common(12))
    print('   corpus EN vs IS: i',tot_en['i'],tot_is['i'],' MATH',tot_en['MATH'],tot_is['MATH'],' sub',tot_en['sub'],tot_is['sub'],' sup',tot_en['sup'],tot_is['sup'],' term',tot_en['term'],tot_is['term'], ' BAD',tot_en['BAD'],tot_is['BAD'])
    print('   by type of segment:',collections.Counter(V[k]['type'] for k,_ in flags).most_common(8))
json.dump(res,open('markers_v.json','w'))
