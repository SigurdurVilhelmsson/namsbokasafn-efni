import subprocess, re, sys, collections, json
REPO='/home/siggi/dev/repos/namsbokasafn-efni'
def git(*a): return subprocess.run(['git','-C',REPO,*a],capture_output=True,check=True).stdout.decode('utf-8')
def files(ref, sub, suffix):
    out=[]
    for f in git('ls-tree','-r','--name-only',ref,'--',f'books/efnafraedi-2e/{sub}').split('\n'):
        if not f: continue
        p=f.split('/')
        if not (re.match(r'^ch\d+$',p[3]) or p[3]=='appendices'): continue
        n=p[4]
        if re.match(r'^m\d+-segments\.'+suffix+r'\.md$',n) or n in (f'chapter-metadata-segments.{suffix}.md',f'exercises-segments.{suffix}.md'):
            out.append(f)
    return out
PATS={
 'bracket [[type:': re.compile(r'\[\[([A-Za-z][A-Za-z0-9_-]*)[:\]]'),
 'curly {{x}}': re.compile(r'\{\{/?([A-Za-z][A-Za-z0-9_-]*)'),
 'dunder __x__': re.compile(r'__[^_\s][^_]{0,80}?__'),
 'plusplus ++x++': re.compile(r'\+\+[^+\s][^+]{0,80}?\+\+'),
 'hash-link [#id]': re.compile(r'\[#[^\]\s]+\]'),
 'md-link ](url)': re.compile(r'\]\((?:https?:|#|/)[^)]*\)'),
 'star *x*': re.compile(r'(?<![*\w])\*[^*\s][^*]{0,60}?\*(?![*\w])'),
 'tilde ~x~': re.compile(r'~[^~\s][^~]{0,30}?~'),
 'caret ^x^': re.compile(r'\^[^^\s][^^]{0,30}?\^'),
}
for ref,label in (('9a69414d5','JUNE'),('98a5fe2ff','NEW')):
    for sub,suf in (('02-for-mt','en'),('02-mt-output','is')):
        c=collections.Counter(); types=collections.Counter(); curl=collections.Counter(); nf=0; filesWith=collections.Counter()
        for f in files(ref,sub,suf):
            t=git('show',f'{ref}:{f}'); nf+=1
            for k,p in PATS.items():
                ms=p.findall(t)
                if ms: filesWith[k]+=1
                c[k]+=len(ms)
                if k.startswith('bracket'): types.update(ms)
                if k.startswith('curly'): curl.update(ms)
        print(f'== {label} {sub} files={nf}')
        for k in PATS: print(f'   {k:18s} {c[k]:7d} in {filesWith[k]} files')
        print('   bracket types:', dict(types.most_common(25)))
        print('   curly types:', dict(curl.most_common(15)))
