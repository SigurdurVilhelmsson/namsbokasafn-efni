"""Reference-graph cost of an SVG under a no-sharing renderer.
cost(e) = 1 (leaf paint) for path/rect/image/text ... + children + use target + mask + clip-path + filter's feImage targets.
Memoised per id; reports log2 of root cost and the filter-chain depth. Unit: 'paint invocations' (a model, not a measurement)."""
import sys, re, math, xml.etree.ElementTree as ET
sys.setrecursionlimit(100000)
XL='{http://www.w3.org/1999/xlink}href'; NS='{http://www.w3.org/2000/svg}'
tree=ET.parse(sys.argv[1]); root=tree.getroot()
ids={e.get('id'):e for e in root.iter() if e.get('id')}
memo={}; dmemo={}
def url(v):
    m=re.match(r'url\(#([^)]+)\)',v or ''); return m and m.group(1)
def ref(e):
    h=e.get(XL) or e.get('href'); return h[1:] if h and h.startswith('#') else None
LEAF={'path','rect','image','text','circle','ellipse','line','polygon','polyline'}
def tag(e): return e.tag.replace(NS,'')
def cost(e, stack=()):
    i=e.get('id')
    if i and i in memo: return memo[i]
    c = 1 if tag(e) in LEAF else 0
    d = 0
    for ch in e:
        if tag(ch) in ('mask','clipPath','filter','linearGradient','radialGradient','defs') and e is root: pass
        if tag(e)=='defs': break
        cc,dd=cost(ch); c+=cc; d=max(d,dd)
    if tag(e)=='use':
        t=ids.get(ref(e)); 
        if t is not None: cc,dd=cost(t); c+=cc; d=max(d,dd)
    if tag(e)=='feImage':
        t=ids.get(ref(e))
        if t is not None: cc,dd=cost(t); c+=cc; d=max(d,dd+1)
    for attr in ('mask','clip-path','filter'):
        t=ids.get(url(e.get(attr)))
        if t is not None: cc,dd=cost(t); c+=cc; d=max(d,dd)
    if tag(e) in ('mask','clipPath','filter'):
        pass
    if i: memo[i]=(c,d)
    return c,d
# root children except defs
tot=0; dep=0
for ch in root:
    if tag(ch)=='defs': continue
    c,d=cost(ch); tot+=c; dep=max(dep,d)
print('elements',sum(1 for _ in root.iter()),'ids',len(ids))
print('root cost (paint invocations, no sharing) =', tot, ' log2 = %.1f' % math.log2(max(tot,1)))
print('max feImage nesting depth =', dep)
# shared model: each id'd element painted once
if len(sys.argv)>2:
    fl=sorted([k for k in ids if re.fullmatch(r'filter-\d+',k)], key=lambda k:int(k.split('-')[1]))
    prev=0
    for k in fl:
        c,d=cost(ids[k]); lg=math.log2(max(c,1))
        imgs=[ref(x) for x in ids[k].iter() if tag(x)=='feImage']
        mode=[x.get('mode') or x.get('operator') for x in ids[k].iter() if tag(x) in('feBlend','feComposite')]
        print(k, 'log2cost=%.1f'%lg, 'depth',d, 'd+%.1f'%(lg-prev), imgs, mode)
        prev=lg
