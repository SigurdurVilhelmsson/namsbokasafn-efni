import os,re,sys,glob,collections
S=os.path.dirname(os.path.abspath(__file__))
for ref in ['9a69414d5','98a5fe2ff']:
    B=f'{S}/tree-{ref}/books/efnafraedi-2e'
    for side,sub,suf in [('EN','02-for-mt','segments.en.md'),('IS','02-mt-output','segments.is.md')]:
        files=sorted(glob.glob(f'{B}/{sub}/*/*-{suf}'))
        c=collections.Counter()
        for f in files:
            t=open(f,encoding='utf-8').read()
            c['files']+=1
            c['html_seg']+=len(re.findall(r'<!--\s*SEG:',t))
            c['html_seg_nospace']+=len(re.findall(r'<!-- SEG:\S',t))
            c['brace_seg']+=len(re.findall(r'\{\{SEG:',t))
            c['nul']+=t.count('\x00')
            c['ctrl']+=len(re.findall(r'[\x01-\x08\x0b\x0c\x0e-\x1f]',t))
        print(ref,side,dict(c))
