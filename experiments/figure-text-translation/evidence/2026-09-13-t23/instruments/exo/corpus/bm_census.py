"""Corpus census (PDF sources only): non-Normal blend-mode paints per cairo SURFACE.
Surface = page, or a Form XObject carrying /Group (cairo pushes a group for it); non-group forms add to their parent's surface.
Unit: one gs invocation whose ExtGState has /BM not Normal/Compatible, counted per invocation path. Also records SMask gs count.
Per-file alarm 60 s. Output: one JSON line per unique artwork path."""
import sys, json, signal, collections, pikepdf
def bm(g):
    b=g.get('/BM')
    if b is None: return None
    if isinstance(b,pikepdf.Array): b=b[0] if len(b) else None
    return str(b) if b is not None else None
class TO(Exception): pass
def alarm(*a): raise TO()
signal.signal(signal.SIGALRM, alarm)
def census(path):
    pdf=pikepdf.open(path); page=pdf.pages[0]
    surf=collections.Counter(); modes=collections.Counter(); smask=[0]; groups=[0]
    def walk(obj,res,sid,depth):
        if depth>40: return
        gss=(res.get('/ExtGState') if res is not None else None) or {}
        xo=(res.get('/XObject') if res is not None else None) or {}
        for operands,op in pikepdf.parse_content_stream(obj):
            o=str(op)
            if o=='gs' and operands:
                g=gss.get(operands[0])
                if g is None: continue
                b=bm(g)
                if b and b not in ('/Normal','/Compatible'): surf[sid]+=1; modes[b]+=1
                sm=g.get('/SMask')
                if sm is not None and sm!=pikepdf.Name('/None'): smask[0]+=1
            elif o=='Do' and operands:
                x=xo.get(operands[0])
                if x is not None and x.get('/Subtype')=='/Form':
                    isg=x.get('/Group') is not None
                    if isg: groups[0]+=1
                    walk(x, x.get('/Resources',res), (sid+'>'+str(operands[0])+'#'+str(groups[0])) if isg else sid, depth+1)
    walk(page, page.obj.get('/Resources'), 'PAGE', 0)
    return {'bmTotal':sum(surf.values()),'bmMaxPerSurface':max(surf.values()) if surf else 0,'surfacesWithBM':len(surf),'modes':dict(modes),'smaskGs':smask[0],'groupDo':groups[0]}
rows=[json.loads(l) for l in open(sys.argv[1])]
seen=set()
for r in rows:
    a=r.get('artwork')
    if not a or not a.lower().endswith('.pdf') or a in seen: continue
    seen.add(a)
    out={'basename':r['basename'],'artwork':a}
    signal.alarm(60)
    try: out.update(census(a))
    except TO: out['error']='timeout60'
    except Exception as e: out['error']=type(e).__name__+': '+str(e)[:100]
    finally: signal.alarm(0)
    print(json.dumps(out), flush=True)
print('DONE', len(seen), flush=True)
