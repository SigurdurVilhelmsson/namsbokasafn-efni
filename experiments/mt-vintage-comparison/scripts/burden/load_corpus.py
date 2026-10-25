#!/usr/bin/env python3
"""Load EN/IS segment files for both vintages into one JSON cache (read-only on the repo:
only `git ls-tree` and `git cat-file --batch`)."""
import json, re, subprocess, sys
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
OLD, NEW = '9a69414d5e7c0834c940f36ec14b49b654c2fb54', '98a5fe2ff1e5dfb773829364f2863225a220b199'
BOOK = 'efnafraedi-2e'
OUT = sys.argv[1]

def ls(ref, path):
    r = subprocess.run(['git', '-C', REPO, 'ls-tree', '--name-only', f'{ref}:{path}'], capture_output=True, text=True)
    return r.stdout.split('\n') if r.returncode == 0 else []

chs = sorted(c for c in ls(NEW, f'books/{BOOK}/02-mt-output') if re.fullmatch(r'ch\d\d', c) and c != 'ch00')
want = []  # (ref, ch, mod, lang, path)
mods = {}
for ch in chs:
    mset = {}
    for tag, ref in (('old', OLD), ('new', NEW)):
        ms = sorted({n.split('-segments')[0] for n in ls(ref, f'books/{BOOK}/02-mt-output/{ch}')
                     if n.endswith('-segments.is.md') and n.startswith('m')})
        mset[tag] = ms
    mods[ch] = mset
    allm = sorted(set(mset['old']) | set(mset['new']))
    for m in allm:
        for tag, ref in (('old', OLD), ('new', NEW)):
            want.append((tag, ch, m, 'en', f'{ref}:books/{BOOK}/02-for-mt/{ch}/{m}-segments.en.md'))
            want.append((tag, ch, m, 'is', f'{ref}:books/{BOOK}/02-mt-output/{ch}/{m}-segments.is.md'))
p = subprocess.Popen(['git', '-C', REPO, 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
data = {}
for tag, ch, m, lang, spec in want:
    p.stdin.write((spec + '\n').encode()); p.stdin.flush()
    header = p.stdout.readline().decode()
    if header.strip().endswith('missing'):
        txt = None
    else:
        size = int(header.split()[2])
        txt = p.stdout.read(size).decode('utf-8'); p.stdout.read(1)
    data.setdefault(ch, {}).setdefault(m, {}).setdefault(tag, {})[lang] = txt
p.stdin.close(); p.wait()
json.dump({'old': OLD, 'new': NEW, 'chapters': chs, 'modules': mods, 'files': data}, open(OUT, 'w'), ensure_ascii=False)
missing = [(t, c, m, l) for t, c, m, l, s in want if data[c][m][t][l] is None]
print('chapters', len(chs), 'files', len(want), 'missing', len(missing))
for x in missing: print('MISSING', x)
for ch in chs:
    if mods[ch]['old'] != mods[ch]['new']:
        print('MODSET DIFFERS', ch, set(mods[ch]['old']) ^ set(mods[ch]['new']))
