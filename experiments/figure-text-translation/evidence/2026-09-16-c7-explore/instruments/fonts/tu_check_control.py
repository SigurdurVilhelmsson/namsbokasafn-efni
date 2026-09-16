import pikepdf, io, json, collections, re, sys
from pdfminer.cmapdb import CMapParser, FileUnicodeMap
from pdfminer.encodingdb import name2unicode, EncodingDB
from pdfminer.latin_enc import ENCODING
WIN = {code+1: name for name, std, mac, win, pdf in ENCODING if win is not None for code in [win]}
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
stats=collections.Counter(); mism=collections.Counter(); examples=collections.defaultdict(set)
for l in open('struct_in.tsv'):
    label, src, pdfp = l.rstrip('\n').split('\t')
    if label!='eps-staged': continue
    with pikepdf.open(pdfp) as pdf:
        fl=[]; walk(pdf.pages[0].obj.get('/Resources'), fl, set())
        for f in fl:
            if '/ToUnicode' not in f or str(f.get('/Subtype'))!='/Type1': continue
            names=dict(WIN)
            enc=f.get('/Encoding')
            if isinstance(enc, pikepdf.Dictionary):
                code=None
                for it in enc.get('/Differences', []):
                    if isinstance(it, pikepdf.Name): names[code]=str(it)[1:]; code+=1
                    else: code=int(it)
            um=FileUnicodeMap(); CMapParser(um, io.BytesIO(f.ToUnicode.read_bytes())).run()
            base=re.sub(r'^[A-Z]{6}\+','',str(f.BaseFont)[1:])
            for code,u in um.cid2unichr.items():
                stats['entries']+=1
                n=names.get(code)
                if n is None: stats['no-name']+=1; continue
                try: exp=name2unicode(n)
                except Exception: stats['name-unmappable']+=1; examples[('unmappable',base,n)].add(src.split('/')[-1]); continue
                if exp==u: stats['agree']+=1
                else:
                    stats['disagree']+=1; mism[(base,code,n,exp,u)]+=1; examples[(base,code,n,exp,u)].add(src.split('/')[-1])
print(stats)
for k,v in mism.most_common(40): print(v,k, sorted(examples[k])[:3])
for k in examples:
    if k[0]=='unmappable': print(k, sorted(examples[k])[:3])
