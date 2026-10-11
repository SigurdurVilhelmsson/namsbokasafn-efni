import re, sys, collections
sys.path.insert(0, '.')
from segs import git_show, git_ls, parse

def shapes(text):
    c = collections.Counter()
    for m in re.finditer(r'\[\[([A-Za-z_-]+)(?=[:\]])', text): c['[[%s' % m.group(1)] += 1
    for m in re.finditer(r'\{\{(/?)([A-Za-z0-9_-]+)', text): c['{{%s%s' % (m.group(1), m.group(2))] += 1
    c['__x__'] += len(re.findall(r'__[^_\s][^_]*?__', text))
    c['++x++'] += len(re.findall(r'\+\+[^+]+?\+\+', text))
    c['[#id]'] += len(re.findall(r'\[#[^\]]+\]', text))
    c['[t](u)'] += len(re.findall(r'\[[^\]\[]+\]\([^)]+\)', text))
    c['*x*'] += len(re.findall(r'(?<![\w*])\*(?!\s)[^*\n]+?(?<!\s)\*(?![\w*])', text))
    c['~x~'] += len(re.findall(r'~[^~\s]+~', text))
    c['^x^'] += len(re.findall(r'\^[^\^\s]+\^', text))
    c['<tag'] += len(re.findall(r'<(?!!--)[a-zA-Z/][^>]*>', text))
    c['\\['] += text.count('\\[')
    return c

for ref, sub, ext in [('9a69414d5','02-for-mt','.en.md'),('98a5fe2ff','02-for-mt','.en.md'),('9a69414d5','02-mt-output','.is.md'),('98a5fe2ff','02-mt-output','.is.md')]:
    files = [f for f in git_ls(ref, f'books/efnafraedi-2e/{sub}/') if f.endswith(ext)]
    tot = collections.Counter()
    nseg = 0
    for f in files:
        t = git_show(ref, f)
        tot += shapes(t)
        nseg += len(parse(t))
    print(f'== {ref} {sub} files={len(files)} segs={nseg}')
    for k, v in tot.most_common():
        if v: print(f'   {k}: {v}')
