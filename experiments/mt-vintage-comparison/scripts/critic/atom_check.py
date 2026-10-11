import sys, json, re, importlib.util, collections
sys.dont_write_bytecode = True
HERE='/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts'
src=open(HERE+'/critic/bookwide_increment.py').read()
pre=src.split("def count(")[0]          # loads M, C, CLS, builds segs (june/new/hybrid)
exec(pre)
EN=re.compile(r'(?<![\w-])atoms?(?![\w-])', re.I)
def toks(t): return re.findall(r'\w+', M.plain(t).lower())
res={}
for b in ('june','new','hybrid'):
    c=collections.Counter(); bych=collections.defaultdict(collections.Counter)
    for ch,m,k,pe,it in segs[b]:
        if not EN.search(pe): continue
        T=toks(it)
        a=any('atóm' in x for x in T); f=any('frumeind' in x for x in T)
        cls='atóm only' if a and not f else 'frumeind only' if f and not a else 'both' if a and f else 'neither'
        c[cls]+=1; c['total']+=1; bych[ch][cls]+=1
    res[b]=c
    print(b, dict(c))
# control: segments with EN 'element' should rarely contain 'frumeind'... (frumefni=element; frumeind=atom)
for b in ('june','new'):
    n=sum(1 for ch,m,k,pe,it in segs[b] if re.search(r'(?<![\w-])elements?(?![\w-])',pe,re.I) and not EN.search(pe))
    fr=sum(1 for ch,m,k,pe,it in segs[b] if re.search(r'(?<![\w-])elements?(?![\w-])',pe,re.I) and not EN.search(pe) and any('frumeind' in x for x in toks(it)))
    print('control', b, 'EN has element, no atom:', n, 'IS contains frumeind:', fr)
