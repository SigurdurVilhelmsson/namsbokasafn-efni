import os,glob,json
from seglib_v import parse, occ_keys
S=os.path.dirname(os.path.abspath(__file__))
def load_vintage(en_root, is_root):
    """returns dict occkey -> {chapter, mod, type, eid, en, is}"""
    out={}
    for enf in sorted(glob.glob(f'{en_root}/*/*-segments.en.md')):
        rel=os.path.relpath(enf,en_root)
        ch=rel.split('/')[0]
        isf=os.path.join(is_root,rel.replace('segments.en.md','segments.is.md'))
        en=parse(open(enf,encoding='utf-8').read())
        is_=parse(open(isf,encoding='utf-8').read()) if os.path.exists(isf) else []
        ek=occ_keys(en); ik=occ_keys(is_)
        imap=dict(zip(ik,[s['text'] for s in is_]))
        for k,s in zip(ek,en):
            out[k]={'ch':ch,'mod':s['mod'],'type':s['type'],'eid':s['eid'],'en':s['text'],'is':imap.get(k),'file':rel}
        for k in ik:
            if k not in out: out[k]={'ch':ch,'mod':'?','type':'?','eid':'?','en':None,'is':imap[k],'file':rel}
    return out
def june():
    return load_vintage(f'{S}/june_sent_v', f'{S}/tree-9a69414d5/books/efnafraedi-2e/02-mt-output')
def june_now_en():
    return load_vintage(f'{S}/tree-9a69414d5/books/efnafraedi-2e/02-for-mt', f'{S}/tree-9a69414d5/books/efnafraedi-2e/02-mt-output')
def new():
    return load_vintage(f'{S}/tree-98a5fe2ff/books/efnafraedi-2e/02-for-mt', f'{S}/tree-98a5fe2ff/books/efnafraedi-2e/02-mt-output')
