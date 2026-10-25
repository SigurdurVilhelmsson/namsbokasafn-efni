import sys, re, collections
sys.path.insert(0, '.')
from segs import parse, norm_en, git_show, git_ls
OLD, NEW, BOOK = '9a69414d5', '98a5fe2ff', 'books/efnafraedi-2e'
def files(ref):
    out = {}
    for f in git_ls(ref, f'{BOOK}/02-for-mt/'):
        m = re.match(rf'{BOOK}/02-for-mt/([^/]+)/([^/()]+)-segments\.en\.md$', f)
        if m: out[(m.group(1), m.group(2))] = f
    return out
fo, fn = files(OLD), files(NEW)
bymod = collections.Counter()
for key in sorted(fo):
    o = parse(git_show(OLD, fo[key])); n = parse(git_show(NEW, fn[key]))
    nn = set(norm_en(t) for _, t in n)
    for sid, t in o:
        if norm_en(t) not in nn:
            bymod[key] += 1
            if bymod[key] <= 3: print(key, sid, repr(t[:120]))
print(dict(bymod))
