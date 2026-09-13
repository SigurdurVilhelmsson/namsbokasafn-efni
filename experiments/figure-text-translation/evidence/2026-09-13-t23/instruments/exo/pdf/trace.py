"""Trace blend/transparency constructs in a PDF: ExtGState dicts (BM, SMask, ca/CA), transparency groups (/Group /S /Transparency, /I, /K),
and how many times a gs with a non-Normal BM is INVOKED in content streams (page + forms, each form counted per Do invocation from its parent once)."""
import sys, collections, pikepdf
pdf=pikepdf.open(sys.argv[1]); page=pdf.pages[0]
gsdefs=collections.Counter(); groups=collections.Counter(); inv=collections.Counter(); forms_seen=set()
def bm(g):
    b=g.get('/BM'); 
    if b is None: return None
    if isinstance(b,pikepdf.Array): b=b[0]
    return str(b)
def walk(obj, res, path, depth=0):
    xo=res.get('/XObject',{}) if res is not None else {}
    gss=res.get('/ExtGState',{}) if res is not None else {}
    for name,g in (gss.items() if gss else []):
        key=(g.objgen if g.is_indirect else None)
        if key and key in forms_seen: continue
        if key: forms_seen.add(key)
        gsdefs[('BM='+str(bm(g)), 'SMask' if g.get('/SMask') not in (None, pikepdf.Name('/None')) else '-', 'ca<1' if float(g.get('/ca',1))<1 else '-', 'CA<1' if float(g.get('/CA',1))<1 else '-')]+=1
    try:
        ops=pikepdf.parse_content_stream(obj)
    except Exception as e:
        print('parse fail',path,e); return
    for operands,op in ops:
        o=str(op)
        if o=='gs':
            g=gss.get(operands[0]) if gss else None
            if g is not None:
                b=bm(g)
                if b and b not in ('/Normal','/Compatible'): inv[('gs BM', b, path.split('/')[0])]+=1
                if g.get('/SMask') not in (None, pikepdf.Name('/None')): inv[('gs SMask', path.split('/')[0])]+=1
        elif o=='Do':
            x=xo.get(operands[0]) if xo else None
            if x is not None and x.get('/Subtype')=='/Form':
                grp=x.get('/Group')
                if grp is not None: groups[('Group', str(grp.get('/S')), 'I='+str(grp.get('/I',False)), 'K='+str(grp.get('/K',False)))]+=1
                walk(x, x.get('/Resources', res), path+'/'+str(operands[0]), depth+1)
walk(page, page.obj.get('/Resources'), 'PAGE')
print('ExtGState dict kinds (unique objects):'); [print('  ',k,v) for k,v in gsdefs.most_common()]
print('Form Do with /Group (per invocation):'); [print('  ',k,v) for k,v in groups.most_common()]
print('gs invocations:'); [print('  ',k,v) for k,v in inv.most_common()]
print('total non-Normal BM gs invocations:', sum(v for k,v in inv.items() if k[0]=='gs BM'))
