import re,collections,json
from load_pairs import june,new
from canon_v import plain
J=june(); N=new()
EN_SW=set('the of and to in is are was were be been for with that this which by on as at from it its an or not can will has have had their these those than into such when where how what also may more most other'.split())
IS_SW=set('og í að á er sem um við til með af fyrir eru var ekki það en eða þegar þar hvað einnig sem þessi þetta þess hún hann þau þær þeir sig'.split())
def toks(t): return re.findall(r"[A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+",t)
def stats(en,is_):
    te=toks(en); ti=toks(is_)
    lw=[w.lower() for w in ti]
    en_sw=sum(1 for w in lw if w in EN_SW); is_sw=sum(1 for w in lw if w in IS_SW)
    ice=bool(re.search(r'[ÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]',is_))
    same=re.sub(r'\s+',' ',en).strip().lower()==re.sub(r'\s+',' ',is_).strip().lower()
    content=[w for w in ti if len(w)>=3]
    return dict(n=len(ti),en_sw=en_sw,is_sw=is_sw,ice=ice,same=same,content=len(content))
out={}
for name,V in [('June',J),('New',N)]:
    flags={'identical':[], 'en_stopword_heavy':[]}
    for k,v in V.items():
        en=plain(v['en']); is_=plain(v['is'])
        s=stats(en,is_)
        if s['same'] and s['content']>=3 and s['en_sw']>=1: flags['identical'].append(k)
        elif s['n']>=6 and s['en_sw']>=3 and s['en_sw']>=0.25*s['n'] and s['is_sw']<=s['en_sw']/2: flags['en_stopword_heavy'].append(k)
    out[name]={f:l for f,l in flags.items()}
    print(name,{f:len(l) for f,l in flags.items()})
json.dump(out,open('untrans_v.json','w'))
