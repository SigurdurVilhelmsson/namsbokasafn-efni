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
c = collections.Counter(); modsShift = collections.Counter()
for key in sorted(fo):
    o = parse(git_show(OLD, fo[key])); n = parse(git_show(NEW, fn[key]))
    nmap = collections.defaultdict(list)
    for i, t in n: nmap[i].append(norm_en(t))
    nn = set(norm_en(t) for _, t in n)
    for sid, t in o:
        x = norm_en(t)
        if sid in nmap:
            if x in nmap[sid]: c['same id, same content'] += 1
            else:
                c['same id, DIFFERENT content'] += 1; modsShift[key[1]] += 1
                c['  ...of which content exists under another id'] += (x in nn)
        else:
            c['id gone'] += 1
            c['  ...of which content exists under another id (gone)'] += (x in nn)
print(dict(c)); print('modules with same-id/different-content:', len(modsShift), 'top:', modsShift.most_common(8))
