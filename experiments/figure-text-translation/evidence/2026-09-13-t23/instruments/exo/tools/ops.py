"""Census cairo's blend-op constructs: for every add-filter (feComposite arithmetic k2=1 k3=1 over feImage R, L),
check R = <g filter=blend mask=Ma><rect/></g>, L = <g mask=Mb><use D/></g>, blend = feBlend(S, D), and classify Ma's content."""
import sys, re, collections, xml.etree.ElementTree as ET
XL='{http://www.w3.org/1999/xlink}href'; NS='{http://www.w3.org/2000/svg}'
root=ET.parse(sys.argv[1]).getroot()
ids={e.get('id'):e for e in root.iter() if e.get('id')}
tag=lambda e:e.tag.replace(NS,'')
url=lambda v:(re.match(r'url\(#([^)]+)\)',v or '') or [None,None])[1]
ref=lambda e:(e.get(XL) or '')[1:]
parent={c:p for p in root.iter() for c in p}
stats=collections.Counter(); modes=collections.Counter(); macls=collections.Counter(); ex={}
addfilters=[f for k,f in ids.items() if tag(f)=='filter' and any(tag(x)=='feComposite' and x.get('operator')=='arithmetic' for x in f)]
uses=collections.Counter(url(e.get('filter')) for e in root.iter() if e.get('filter'))
for f in addfilters:
    fe=[x for x in f if tag(x)=='feImage']; comp=[x for x in f if tag(x)=='feComposite'][0]
    ok = (comp.get('k1'),comp.get('k2'),comp.get('k3'),comp.get('k4'))==('0','1','1','0') and len(fe)==2
    R=ids.get(ref(fe[0])); L=ids.get(ref(fe[1]))
    bf=ids.get(url(R.get('filter'))) if R is not None else None
    Ma=ids.get(url(R.get('mask'))) if R is not None else None
    Mb=ids.get(url(L.get('mask'))) if L is not None else None
    Luse=[x for x in L] if L is not None else []
    bfe=[x for x in bf if tag(x)=='feImage'] if bf is not None else []
    blend=[x for x in bf if tag(x)=='feBlend'] if bf is not None else []
    ok = ok and bf is not None and len(bfe)==2 and len(blend)==1 and Ma is not None and Mb is not None and len(Luse)==1 and tag(Luse[0])=='use'
    D = ids.get(ref(bfe[1])) if ok else None
    ok = ok and D is not None and ref(Luse[0])==D.get('id')
    stats['pattern ok' if ok else 'pattern MISMATCH']+=1
    stats[f'add filter used {uses[f.get("id")]}x']+=1
    if not ok: continue
    modes[blend[0].get('mode')]+=1
    # Ma content: <use href=#G/> where G is a group of rects
    mu=[x for x in Ma]
    cls='other'
    if len(mu)==1 and tag(mu[0])=='use' and not mu[0].get('filter'):
        G=ids.get(ref(mu[0])); kids=[x for x in G]
        sig=[(tag(k),k.get('fill'),k.get('fill-opacity'),k.get('x'),k.get('width')) for k in kids]
        if all(tag(k)=='rect' for k in kids) and kids and kids[-1].get('fill')=='rgb(100%, 100%, 100%)' and kids[-1].get('fill-opacity')=='1':
            # full-surface opaque white as last paint = m==1 on the surface rect
            cls='full-white-rect(last)'
        else:
            cls='non-trivial:'+';'.join(tag(k)+':'+str(k.get('fill'))+':'+str(k.get('fill-opacity')) for k in kids)[:120]
    macls[cls]+=1; ex.setdefault(cls, f.get('id'))
    # Mb must be inverted-alpha of same G
print(dict(stats)); print(dict(modes)); print(dict(macls)); print(ex)
print('feBlend filters total', sum(1 for k,f in ids.items() if tag(f)=='filter' and any(tag(x)=='feBlend' for x in f)))
