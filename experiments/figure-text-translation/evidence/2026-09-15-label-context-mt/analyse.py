import json, re, collections, glob, os
REPO='/home/siggi/dev/repos/namsbokasafn-efni'
rs=[json.loads(l) for l in open('results.jsonl')]
units=sum((r.get('usage') or {}).get('units',0) for r in rs); cost=sum((r.get('usage') or {}).get('cost',0) for r in rs)
committed={}
for f in glob.glob(f'{REPO}/books/efnafraedi-2e/figure-text/*.is.json'):
    d=json.load(open(f)); committed[d['basename']]=d['blocks']
P_={}; J={}
for r in rs:
    if r['arm']=='P': P_[(r['fig'],r['key'])]=dict(en=r['en'],is_=r['is'].strip(),idx=r['idx'])
    else: J[(r['fig'],r['arm'])]=r
SUBSUP=re.compile('[₀-ₜ⁰-ⁿ]')
def kept_tokens(en):
    # tokens that should survive MT unchanged: anything with a digit, or a formula-like token (2+ capitals / cap+digit), symbols
    toks=re.findall(r"[^\s]+", en)
    out=[]
    for t in toks:
        t2=t.strip('.,;:()[]“”"\'')
        if re.search(r'\d',t2) or re.fullmatch(r'(?:[A-Z][a-z]?\d*)+[+\-–]?',t2) and sum(c.isupper() for c in t2)>=1 and (len(t2)<=6 and not t2.isalpha() or sum(c.isupper() for c in t2)>=2):
            out.append(t2)
    return out
labels=[]
split=collections.Counter(); splitbad=[]
for fig in sorted(committed):
    keys=[k for (f,k) in P_ if f==fig]
    keys.sort(key=lambda k:P_[(fig,k)]['idx'])
    jl={}
    for arm in ('J1','J2'):
        r=J.get((fig,arm))
        if not r: continue
        lines=[l.strip() for l in r['is'].strip().replace('\r','').split('\n')]
        lines=[l for l in lines if l!='']
        ok=len(lines)==len(keys)
        split[(arm,ok)]+=1
        if not ok: splitbad.append((fig,arm,len(keys),len(lines),r['is']))
        jl[arm]=lines if ok else None
    for i,k in enumerate(keys):
        p=P_[(fig,k)]
        row=dict(fig=fig,key=k,en=p['en'],C=committed[fig][k],P=p['is_'],
                 J1=(jl.get('J1') or [None]*len(keys))[i] if jl.get('J1') else None,
                 J2=(jl.get('J2') or [None]*len(keys))[i] if jl.get('J2') else None,
                 multi=len(keys)>1)
        labels.append(row)
def integrity(en,is_):
    if is_ is None: return None
    issues=[]
    if SUBSUP.search(is_) and not SUBSUP.search(en): issues.append('unicode-sub/sup')
    for t in kept_tokens(en):
        if t not in is_: issues.append(f'missing:{t}')
    return issues
for row in labels:
    for a in ('C','P','J1','J2'):
        row['int_'+a]=integrity(row['en'],row[a])
multi=[r for r in labels if r['multi']]
full=[r for r in multi if r['J1'] is not None and r['J2'] is not None]
def cnt(pred,pop): return sum(1 for r in pop if pred(r))
out=dict(
 billed=dict(units=units,cost=round(cost,2),requests=len(rs)),
 population=dict(figures=len(committed),labels=len(labels),multi_label_labels=len(multi),multi_figs=len({r['fig'] for r in multi})),
 split={f'{a} {"ok" if ok else "BROKEN"}':n for (a,ok),n in sorted(split.items())},
 split_broken=[dict(fig=f,arm=a,labels=n,lines=m,raw=raw) for f,a,n,m,raw in splitbad],
 per_label_drift=dict(P_vs_C_differ_all=cnt(lambda r:r['P']!=r['C'],labels),P_vs_C_differ_multi=cnt(lambda r:r['P']!=r['C'],multi),of_all=len(labels),of_multi=len(multi)),
 joined=dict(labels_with_both_joined=len(full),
   J1_vs_J2_differ=cnt(lambda r:r['J1']!=r['J2'],full),
   J1_vs_P_differ=cnt(lambda r:r['J1']!=r['P'],full),
   J2_vs_P_differ=cnt(lambda r:r['J2']!=r['P'],full),
   stable_joined_change=cnt(lambda r:r['J1']==r['J2']!=r['P'],full),
   joined_equals_C_where_P_differs_from_C=cnt(lambda r:r['P']!=r['C'] and r['J1']==r['C'],full)),
 integrity={a:dict(labels_with_issue=cnt(lambda r,a=a:bool(r['int_'+a]),multi),
                   unicode=cnt(lambda r,a=a:bool(r['int_'+a]) and 'unicode-sub/sup' in r['int_'+a],multi)) for a in ('C','P','J1','J2')},
)
json.dump(labels,open('labels.json','w'),ensure_ascii=False,indent=1)
json.dump(out,open('summary.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(out,ensure_ascii=False,indent=1))
