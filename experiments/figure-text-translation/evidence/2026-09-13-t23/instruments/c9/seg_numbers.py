import re, glob, collections, os
B='/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e'
SEG=re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def parse(p):
    s=open(p,encoding='utf-8').read(); parts=SEG.split(s); d={}
    for i in range(1,len(parts),2): d[parts[i]]=parts[i+1]
    return d
US_TH=re.compile(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d.,]*\d)')   # US thousands, no decimal part
US_DEC=re.compile(r'(?<![\d.,])\d*\.\d+(?![\d.,]*\d)')
out=collections.Counter(); ex=collections.defaultdict(list)
for ch in ('ch03','ch04'):
    for en in sorted(glob.glob(f'{B}/02-for-mt/{ch}/m*-segments.en.md')):
        mod=os.path.basename(en).split('-')[0]
        isp=f'{B}/02-mt-output/{ch}/{mod}-segments.is.md'
        if not os.path.exists(isp): continue
        E=parse(en); I=parse(isp)
        for sid,et in E.items():
            it=I.get(sid)
            if it is None: continue
            et2=re.sub(r'\[\[(MATH|MEDIA|TABLE)[^\]]*\]\]','',et); it2=re.sub(r'\[\[(MATH|MEDIA|TABLE)[^\]]*\]\]','',it)
            for m in US_TH.finditer(et2):
                tok=m.group(); dig=tok.replace(',','')
                forms={'period':tok.replace(',','.'),'space':tok.replace(',',' '),'nbsp':tok.replace(',',' '),'thin':tok.replace(',',' '),'none':dig,'comma-kept':tok}
                hit=[k for k,v in forms.items() if re.search(r'(?<![\d.,])'+re.escape(v)+r'(?![\d])', it2)]
                k=('thousands', ch, ','.join(hit) if hit else 'not-found')
                out[k]+=1; ex[k].append((sid,tok,it2[:0]))
            for m in US_DEC.finditer(et2):
                tok=m.group()
                com=tok.replace('.',',')
                if re.search(r'(?<![\d.,])'+re.escape(com)+r'(?![\d])', it2): k=('decimal',ch,'comma')
                elif re.search(r'(?<![\d.,])'+re.escape(tok)+r'(?![\d])', it2): k=('decimal',ch,'point-kept')
                else: k=('decimal',ch,'not-found')
                out[k]+=1
                if k[2]!='comma': ex[k].append((sid,tok))
for k,v in sorted(out.items()): print(v,k)
for k,v in ex.items():
    if k[0]=='thousands' or k[2]=='point-kept':
        print('==',k,len(v)); [print('   ',x) for x in v[:40]]
