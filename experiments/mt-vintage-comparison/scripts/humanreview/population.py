"""Population control for the matcher (and a by-product): over EVERY chemistry module, how many OLD
(9a69414d5) EN segments have an identical normalised EN segment in the NEW (98a5fe2ff) same module,
and how many NEW segments have an old counterpart. Unit: segment occurrence; files: <mod>-segments.en.md
(legacy '(b)' split files excluded)."""
import sys, re, json, collections
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
print('modules old', len(fo), 'new', len(fn), 'common', len(set(fo) & set(fn)))
tot = collections.Counter(); bytype_old = collections.defaultdict(collections.Counter); bytype_new = collections.defaultdict(collections.Counter)
perch = collections.defaultdict(collections.Counter)
for key in sorted(set(fo) | set(fn)):
    o = parse(git_show(OLD, fo[key])) if key in fo else []
    n = parse(git_show(NEW, fn[key])) if key in fn else []
    on = collections.Counter(norm_en(t) for _, t in o)
    nn = collections.Counter(norm_en(t) for _, t in n)
    for sid, t in o:
        typ = sid.split(':')[1] if sid.count(':') >= 2 else '?'
        hit = norm_en(t) in nn
        tot['old segs'] += 1; tot['old matched'] += hit
        bytype_old[typ]['n'] += 1; bytype_old[typ]['matched'] += hit
        perch[key[0]]['old'] += 1; perch[key[0]]['oldMatched'] += hit
    for sid, t in n:
        typ = sid.split(':')[1] if sid.count(':') >= 2 else '?'
        hit = norm_en(t) in on
        tot['new segs'] += 1; tot['new with old counterpart'] += hit
        bytype_new[typ]['n'] += 1; bytype_new[typ]['matched'] += hit
        perch[key[0]]['new'] += 1; perch[key[0]]['newMatched'] += hit
print(dict(tot))
print('OLD by type (n, matched):')
for t, c in sorted(bytype_old.items(), key=lambda x: -x[1]['n']): print(f'   {t}: {c["n"]} {c["matched"]}')
print('NEW by type (n, with-old-counterpart):')
for t, c in sorted(bytype_new.items(), key=lambda x: -x[1]['n']): print(f'   {t}: {c["n"]} {c["matched"]}')
json.dump({k: dict(v) for k, v in perch.items()}, open('data/population-perchapter.json', 'w'), indent=1)
