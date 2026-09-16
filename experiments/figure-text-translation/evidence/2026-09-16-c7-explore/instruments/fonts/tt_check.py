import pikepdf, io, collections, re
from fontTools.ttLib import TTFont
from fontTools import agl
from pdfminer.latin_enc import ENCODING
from pdfminer.encodingdb import name2unicode
WIN = {win: name for name, std, mac, win, pdf in ENCODING if win is not None}
STD = {std: name for name, std, mac, win, pdf in ENCODING if std is not None}
def walk(res, out, seen):
    if res is None: return
    fonts = res.get('/Font')
    if fonts is not None:
        for n, f in fonts.items():
            if f.objgen not in seen: seen.add(f.objgen); out.append(f)
    xo = res.get('/XObject')
    if xo is not None:
        for n, x in xo.items():
            if str(x.get('/Subtype',''))=='/Form' and ('x',x.objgen) not in seen:
                seen.add(('x',x.objgen)); walk(x.get('/Resources'), out, seen)
st=collections.Counter(); mism=collections.Counter(); ex=collections.defaultdict(set); cmaps=collections.Counter(); posts=collections.Counter()
for l in open('struct_in.tsv'):
    label, src, p = l.rstrip('\n').split('\t')
    if label!='pdf': continue
    with pikepdf.open(p) as pdf:
        fl=[]; walk(pdf.pages[0].obj.get('/Resources'), fl, set())
        for f in fl:
            if '/ToUnicode' in f: continue
            sub=str(f.get('/Subtype')); d=f.get('/FontDescriptor')
            if d is None: continue
            base=re.sub(r'^[A-Z]{6}\+','',str(f.BaseFont)[1:])
            fc=int(f.get('/FirstChar',0)); widths=[float(w) for w in f.get('/Widths',[])]
            enc=f.get('/Encoding'); names=dict(WIN)
            if isinstance(enc, pikepdf.Dictionary):
                code=None
                for it in enc.get('/Differences', []):
                    if isinstance(it, pikepdf.Name): names[code]=str(it)[1:]; code+=1
                    else: code=int(it)
            codes=[fc+i for i,w in enumerate(widths) if w>0]
            if sub=='/TrueType' and '/FontFile2' in d:
                tt=TTFont(io.BytesIO(d.FontFile2.read_bytes()))
                posts[tt['post'].formatType]+=1
                c31=c30=c10=None
                for t in tt['cmap'].tables:
                    if (t.platformID,t.platEncID)==(3,1): c31=t.cmap
                    if (t.platformID,t.platEncID)==(3,0): c30=t.cmap
                    if (t.platformID,t.platEncID)==(1,0): c10=t.cmap
                cmaps[(c31 is not None, c30 is not None, c10 is not None, int(d.get('/Flags',0)) & 4)]+=1
                for code in codes:
                    n=names.get(code)
                    try: pm=name2unicode(n) if n else None
                    except Exception: pm=None
                    g=None
                    if c30 is not None: g=c30.get(0xF000+code) or c30.get(code)
                    elif c31 is not None and pm: g=c31.get(ord(pm[0]))
                    elif c10 is not None: g=c10.get(code)
                    st['codes']+=1
                    if g is None: st['no-glyph']+=1; continue
                    if g.startswith('glyph') or g.startswith('gid') or tt['post'].formatType==3: st['no-glyphname']+=1; continue
                    gu=agl.toUnicode(g)
                    if not gu: st['glyphname-not-agl']+=1; ex[('notagl',base,g)].add(src.split('/')[-1]); continue
                    if gu==pm: st['agree']+=1
                    else: st['disagree']+=1; mism[(base,code,n,pm,g,gu)]+=1; ex[(base,code,n,pm,g,gu)].add(src.split('/')[-1])
            elif sub=='/Type1' and '/FontFile3' in d:
                from fontTools.cffLib import CFFFontSet
                try:
                    cs=CFFFontSet(); cs.decompile(io.BytesIO(d.FontFile3.read_bytes()), None); top=cs[cs.fontNames[0]]
                    csn=set(top.charset)
                except Exception as e:
                    st['t1-cff-unparsable']+=1; ex[('cffunparse',base,str(d.FontFile3.get('/Subtype')),repr(e)[:60])].add(src.split('/')[-1]); continue
                for code in codes:
                    n=names.get(code)
                    try: pm=name2unicode(n) if n else None
                    except Exception: pm=None
                    st['t1-codes']+=1
                    # renderer: /Encoding present -> glyph named n from charset
                    if n in csn: st['t1-name-in-charset']+=1
                    else: st['t1-name-missing']+=1; ex[('t1missing',base,code,n)].add(src.split('/')[-1])
print(st); print('cmaps(31,30,10,symbolicflag)', cmaps); print('post formats', posts)
for k,v in mism.most_common(30): print(v,k,sorted(ex[k])[:3])
for k in list(ex):
    if k[0] in ("notagl","t1missing","cffunparse"): print(k, sorted(ex[k])[:3])
