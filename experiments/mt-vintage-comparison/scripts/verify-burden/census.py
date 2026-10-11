import re, sys, glob, os
from collections import Counter
S = sys.argv[1]
def files(v, kind):
    sub = '02-for-mt' if kind=='en' else '02-mt-output'
    pat = '*-segments.en.md' if kind=='en' else '*-segments.is.md'
    return sorted(f for f in glob.glob(f'{S}/{v}/books/efnafraedi-2e/{sub}/ch*/{pat}') if os.path.basename(f).startswith('m'))
pats = {
 'bracket': re.compile(r'\[\[([A-Za-z]+):'),
 'curly_open': re.compile(r'\{\{([A-Za-z]+)\}\}'),
 'curly_other': re.compile(r'\{\{(?!/?[A-Za-z]+\}\})([^}]{0,30})\}\}'),
 'dunder': re.compile(r'__[^_\n]+?__'),
 'plusplus': re.compile(r'\+\+[^+\n]+?\+\+'),
 'hashlink': re.compile(r'\[#[^\]]+\]'),
 'mdlink': re.compile(r'\]\([^)]+\)'),
 'star2': re.compile(r'\*\*[^*\n]+?\*\*'),
 'star1': re.compile(r'(?<!\*)\*[^*\n ]+[^*\n]*?\*(?!\*)'),
 'dollar': re.compile(r'\$[^$\n]+\$'),
 'caret': re.compile(r'\^[^^\n]+\^'),
 'tilde': re.compile(r'~[^~\n]+~'),
 'html': re.compile(r'<(?!!--)([a-zA-Z/][^>]{0,20})>'),
 'placeholder_MATH': re.compile(r'\[\[MATH:'),
 'oldmath': re.compile(r'\[(?:MATH|math|EQ|MEDIA|TABLE)[^\]]*\]'),
 'bracesingle': re.compile(r'(?<!\{)\{(?!\{)[^{}\n]{0,30}\}(?!\})'),
}
for v in ('june','new'):
    for kind in ('en','is'):
        fs = files(v, kind)
        c = Counter(); sub = Counter(); ex = {}
        for f in fs:
            t = open(f, encoding='utf-8').read()
            for name, p in pats.items():
                for m in p.finditer(t):
                    c[name] += 1
                    if name in ('bracket','curly_open','html','curly_other'):
                        sub[(name, m.group(1) if m.groups() else m.group(0))] += 1
                    ex.setdefault(name, m.group(0)[:80])
        print(f'== {v} {kind}: {len(fs)} files')
        for name in pats:
            if c[name]: print(f'   {name:16s} {c[name]:7d}  e.g. {ex[name]!r}')
        print('   subtypes:', sorted(((k[0][:6]+':'+k[1], n) for k, n in sub.items()), key=lambda x:-x[1])[:60])
