import sys, re, json
import xml.etree.ElementTree as ET
SVG='{http://www.w3.org/2000/svg}'; XL='{http://www.w3.org/1999/xlink}href'
t=lambda e: e.tag.replace(SVG,'')
root=ET.parse(sys.argv[1]).getroot()
ids={e.get('id'):e for e in root.iter() if e.get('id')}
qx0,qy0,qx1,qy1=map(float,sys.argv[2:6])
def u(v):
    m=re.fullmatch(r'url\(#([^)]+)\)',v or ''); return m and m.group(1)
def tr(s):
    if not s: return (0,0)
    m=re.search(r'translate\(([-\d.]+),\s*([-\d.]+)\)',s)
    if m: return float(m.group(1)),float(m.group(2))
    m=re.search(r'matrix\(([^)]*)\)',s)
    v=[float(x) for x in re.split(r'[\s,]+',m.group(1).strip())]; return v[4],v[5]
def uses(e, off=(0,0), depth=0):
    # collect (source id, offset) for use elements reachable in e's subtree
    out=[]
    for ch in e.iter():
        if t(ch)=='use':
            out.append(((ch.get(XL) or '')[1:], tr(ch.get('transform'))))
    return out
def extent(sid):
    s=ids.get(sid)
    if s is None: return None
    cp=u(s.get('clip-path'))
    if cp and cp in ids:
        r=ids[cp].find(SVG+'rect')
        if r is not None: return float(r.get('width')),float(r.get('height'))
    return None
rows=[]
adds=[f for f in ids if t(ids[f])=='filter' and ids[f].find(SVG+'feComposite') is not None and ids[f].find(SVG+'feComposite').get('operator')=='arithmetic']
for fa in sorted(adds,key=lambda s:int(s.split('-')[1])):
    R=ids[ids[fa][0].get(XL)[1:]]
    fb=u(R.get('filter')); FB=ids[fb]
    S=ids[FB[0].get(XL)[1:]]
    mode=FB.find(SVG+'feBlend').get('mode')
    gtr=(0,0)
    inner=[ch for ch in S.iter() if t(ch)=='g' and ch.get('transform')]
    for sid,(ox,oy) in uses(S):
        ex=extent(sid)
        # the use sits inside <g transform=translate(43.2,24.1)> in S; offsets in the use are page-space pt
        if ex:
            bx=(ox,oy,ox+ex[0],oy+ex[1])
            hit = not (bx[2]<qx0 or bx[0]>qx1 or bx[3]<qy0 or bx[1]>qy1)
            rows.append((fa,fb,mode,sid,bx,hit))
hits=[r for r in rows if r[5]]
print('adds',len(adds),'S-uses with extents',len(rows))
for r in hits: print(r)
