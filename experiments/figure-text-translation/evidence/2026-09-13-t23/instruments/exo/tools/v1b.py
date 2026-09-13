"""V1 'drop-L': for each cairo blend op whose lerp mask Ma is an opaque white rect covering the whole filter region
(so L = D masked by inverted alpha == 0 exactly), replace the use-site <g filter="url(#F_add)"> with
<g filter="url(#F_blend)" mask="url(#Ma)">, i.e. paint R directly. Byte-local attribute change; nothing else moves.
  v1.py in.svg out.svg [--head-op N]   (--head-op: bisect helper, retarget the body head to op N)
Prints a JSON report."""
import sys, re, json, xml.etree.ElementTree as ET
XL='{http://www.w3.org/1999/xlink}href'; NS='{http://www.w3.org/2000/svg}'
src, dst = sys.argv[1], sys.argv[2]
txt=open(src,encoding='utf-8').read()
root=ET.fromstring(txt.encode())
ids={e.get('id'):e for e in root.iter() if e.get('id')}
tag=lambda e:e.tag.replace(NS,'')
url=lambda v:(re.match(r'url\(#([^)]+)\)',v or '') or [None,None])[1]
ref=lambda e:(e.get(XL) or '')[1:]
def f2(v): return round(float(v),4)
rep={'addOps':0,'trivial':0,'nonTrivial':[],'mismatch':[]}
plan={}
for f in [e for e in root.iter() if tag(e)=='filter']:
    comps=[x for x in f if tag(x)=='feComposite' and x.get('operator')=='arithmetic']
    if not comps: continue
    rep['addOps']+=1
    fe=[x for x in f if tag(x)=='feImage']
    try:
        c=comps[0]; assert (c.get('k1'),c.get('k2'),c.get('k3'),c.get('k4'))==('0','1','1','0') and len(fe)==2 and len(list(f))==3
        R=ids[ref(fe[0])]; L=ids[ref(fe[1])]
        bf=ids[url(R.get('filter'))]; Ma=ids[url(R.get('mask'))]; Mb=ids[url(L.get('mask'))]
        bfe=[x for x in bf if tag(x)=='feImage']; assert len(bfe)==2 and sum(tag(x)=='feBlend' for x in bf)==1 and len(list(bf))==3
        D=bfe[1]; assert len(list(L))==1 and ref(list(L)[0])==ref(D)
        W=f2(fe[0].get('width')); H=f2(fe[0].get('height'))
        assert all(f2(x.get('width'))==W and f2(x.get('height'))==H and f2(x.get('x'))==0 and f2(x.get('y'))==0 for x in fe+bfe)
        rr=[x for x in R]; assert len(rr)==1 and tag(rr[0])=='rect' and (f2(rr[0].get('width')),f2(rr[0].get('height')))==(W,H)
        # Ma = <use href=#G/>, Mb = <use href=#G filter=invert-alpha/>
        mu=list(Ma); mb=list(Mb)
        assert len(mu)==1 and tag(mu[0])=='use' and not mu[0].get('filter') and not mu[0].get('transform')
        assert len(mb)==1 and ref(mb[0])==ref(mu[0]) and url(mb[0].get('filter'))=='filter-remove-color-and-invert-alpha'
        G=ids[ref(mu[0])]; kids=list(G)
        m=re.fullmatch(r'translate\(([-\d.]+), ([-\d.]+)\)', G.get('transform') or '')
        trivial = bool(m) and len(kids)>=1 and all(tag(k)=='rect' for k in kids) and \
            kids[-1].get('fill')=='rgb(100%, 100%, 100%)' and kids[-1].get('fill-opacity')=='1' and \
            (f2(kids[-1].get('x'))+f2(m.group(1)), f2(kids[-1].get('y'))+f2(m.group(2)), f2(kids[-1].get('width')), f2(kids[-1].get('height'))) == (0,0,W,H) and \
            all(k.get('fill-opacity')=='0' for k in kids[:-1])
    except (AssertionError, KeyError, TypeError) as e:
        rep['mismatch'].append(f.get('id')); continue
    if trivial:
        rep['trivial']+=1; plan[f.get('id')]=(bf.get('id'), Ma.get('id'))
    else:
        rep['nonTrivial'].append(f.get('id'))
out=txt; n=0
for fa,(fb,ma) in plan.items():
    a=f'<g filter="url(#{fa})"'
    k=out.count(a); rep.setdefault("useSites",0); rep["useSites"]+=k
    out=out.replace(a, (f"<g filter=\"url(#{fb})\" mask=\"url(#{ma})\"" if "--keep-mask" in sys.argv else f"<g filter=\"url(#{fb})\"")); n+=1
rep['rewritten']=n
open(dst,'w',encoding='utf-8').write(out)
print(json.dumps(rep))
