"""Census of NON-text operators inside BT..ET (graphics state persists past ET, so strip-text deletes it)."""
import sys, collections, json
from pathlib import Path
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
import pikepdf
from _deps import read_content
TEXT_OPS={'BT','ET','Tc','Tw','Tz','TL','Tf','Tr','Ts','Td','TD','Tm','T*','Tj','TJ',"'",'"'}
# graphics-state operators whose effect OUTLIVES ET
GSTATE={'g','G','rg','RG','k','K','cs','CS','sc','SC','scn','SCN','gs','w','J','j','M','d','ri','i'}
def scan(stream, acc, detail, where):
    owner=None
    if isinstance(stream,(bytes,bytearray)):
        owner=pikepdf.new(); stream=owner.make_stream(bytes(stream))
    depth=0; after_colour=None; painted_after=0
    ops=list(pikepdf.parse_content_stream(stream))
    for i,ins in enumerate(ops):
        if isinstance(ins,pikepdf.ContentStreamInlineImage): continue
        op=str(ins.operator)
        if op=='BT': depth+=1; continue
        if op=='ET': depth=max(0,depth-1); continue
        if depth and op not in TEXT_OPS:
            acc[op]+=1
            if op in GSTATE and len(detail)<12:
                # what is the next painting op after this text object, and is the state reset before it?
                j=i; 
                while j<len(ops) and not (not isinstance(ops[j],pikepdf.ContentStreamInlineImage) and str(ops[j].operator)=='ET'): j+=1
                nxt=[str(o.operator) for o in ops[j+1:j+8] if not isinstance(o,pikepdf.ContentStreamInlineImage)]
                detail.append((where, op, [str(a) for a in ins.operands], 'next ops after ET:', nxt))
    del owner
res={}
for a in sys.argv[1:]:
    p=Path(a); acc=collections.Counter(); detail=[]
    with pikepdf.open(str(p)) as pdf:
        page=pdf.pages[0]
        scan(read_content(page).encode('latin-1'), acc, detail, 'PAGE')
        seen=set()
        def walk(r):
            xo=r.get('/XObject')
            if xo is None: return
            for nm,x in xo.items():
                if x.objgen in seen or str(x.get('/Subtype',''))!='/Form': continue
                seen.add(x.objgen); scan(x.read_bytes(), acc, detail, 'FORM'+str(nm)); 
                if x.get('/Resources') is not None: walk(x.get('/Resources'))
        r=pikepdf.Page(page).obj.get('/Resources')
        if r is not None: walk(r)
    res[p.stem]=dict(ops=dict(acc), gstate=sum(v for k,v in acc.items() if k in GSTATE))
    print(p.stem, dict(acc), 'gstate-ops-inside-BT:', res[p.stem]['gstate'])
    for d in detail[:4]: print('    ', d)
