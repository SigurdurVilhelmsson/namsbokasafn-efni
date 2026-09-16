import pikepdf, json, sys, re, collections, os
from pdfminer.encodingdb import name2unicode
def walk(res, scope, out, seen):
    if res is None: return
    fonts = res.get('/Font')
    if fonts is not None:
        for n, f in fonts.items(): out.append((scope+'/'+str(n), f))
    xo = res.get('/XObject')
    if xo is not None:
        for n, x in xo.items():
            if str(x.get('/Subtype',''))=='/Form' and x.objgen not in seen:
                seen.add(x.objgen); walk(x.get('/Resources'), scope+'/'+str(n), out, seen)
def fam(n):
    n=n.lstrip('/'); return n[7:] if re.match(r'^[A-Z]{6}\+', n) else n
paths=[l.rstrip('\n').split('\t') for l in open(sys.argv[1])]
out=open(sys.argv[2],'w')
for label, src, pdfpath in paths:
    try:
        with pikepdf.open(pdfpath) as pdf:
            fl=[]; walk(pdf.pages[0].obj.get('/Resources'), 'PAGE', fl, set())
            for scope, f in fl:
                st=str(f.get('/Subtype',''))
                rec=dict(label=label, src=src, scope=scope, base=fam(str(f.get('/BaseFont',''))), subtype=st,
                         tounicode='/ToUnicode' in f)
                enc=f.get('/Encoding')
                if isinstance(enc, pikepdf.Dictionary):
                    rec['base_enc']=str(enc.get('/BaseEncoding','(none)'))
                    diffs=[]; code=None
                    for it in enc.get('/Differences', []):
                        if isinstance(it, int) or (hasattr(it,'__int__') and not isinstance(it,pikepdf.Name)):
                            try: code=int(it); continue
                            except Exception: pass
                        name=str(it).lstrip('/')
                        try: u=name2unicode(name); ok=True
                        except Exception: u=None; ok=False
                        diffs.append((code, name, u, ok)); code+=1
                    rec['diffs']=diffs
                    rec['unmapped']=[(c,n) for c,n,u,ok in diffs if not ok]
                elif enc is not None:
                    rec['base_enc']=str(enc); rec['diffs']=[]; rec['unmapped']=[]
                else:
                    rec['base_enc']='(absent)'; rec['diffs']=[]; rec['unmapped']=[]
                desc=f.get('/FontDescriptor')
                if desc is not None:
                    rec['fontfile']=[k for k in ('/FontFile','/FontFile2','/FontFile3') if k in desc]
                    rec['flags']=int(desc.get('/Flags',0))
                out.write(json.dumps(rec)+'\n')
    except Exception as e:
        out.write(json.dumps(dict(label=label, src=src, error=repr(e)))+'\n')
