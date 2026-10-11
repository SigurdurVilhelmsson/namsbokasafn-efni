#!/usr/bin/env python3
"""Read-only extraction of segment files at the two refs (and EN-as-translated)
into the scratch dir. Uses only `git ls-tree`, `git log`, `git show` (read-only)."""
import json, os, re, subprocess, sys

REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
JUNE = '9a69414d5e7c0834c940f36ec14b49b654c2fb54'
NEW = '98a5fe2ff1e5dfb773829364f2863225a220b199'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw')
BOOK = 'books/efnafraedi-2e'

def git(*args, check=True):
    r = subprocess.run(['git', '-C', REPO, *args], capture_output=True)
    if check and r.returncode != 0:
        raise RuntimeError(f'git {args} failed: {r.stderr.decode()}')
    return r

def show(ref, path):
    r = git('show', f'{ref}:{path}', check=False)
    if r.returncode != 0:
        return None
    return r.stdout.decode('utf-8')

def ls(ref, sub):
    return git('ls-tree', '-r', '--name-only', ref, f'{BOOK}/{sub}/').stdout.decode().split('\n')

pat = re.compile(r'^' + re.escape(BOOK) + r'/02-for-mt/([^/]+)/((?:m\d+|chapter-metadata))-segments\.en\.md$')
new_files = []
for p in ls(NEW, '02-for-mt'):
    m = pat.match(p)
    if m:
        new_files.append((m.group(1), m.group(2)))
meta = []
for chdir, mod in sorted(new_files):
    rec = {'chdir': chdir, 'module': mod}
    en_path = f'{BOOK}/02-for-mt/{chdir}/{mod}-segments.en.md'
    is_path = f'{BOOK}/02-mt-output/{chdir}/{mod}-segments.is.md'
    for tag, ref, path in [('new_en', NEW, en_path), ('new_is', NEW, is_path),
                           ('june_en', JUNE, en_path), ('june_is', JUNE, is_path)]:
        txt = show(ref, path)
        rec[tag] = txt is not None
        if txt is not None:
            d = os.path.join(OUT, tag, chdir)
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, f'{mod}.md'), 'w', encoding='utf-8') as f:
                f.write(txt)
    # EN-as-translated: EN at the commit that last modified the June IS (<= JUNE)
    if rec['june_is']:
        r = git('log', '-1', '--format=%H %ad %s', '--date=short', JUNE, '--', is_path)
        line = r.stdout.decode().strip()
        c = line.split(' ', 1)[0]
        rec['june_is_commit'] = line
        r2 = git('log', '-1', '--format=%H %ad %s', '--date=short', JUNE, '--', en_path)
        rec['june_en_commit'] = r2.stdout.decode().strip()
        txt = show(c, en_path)
        rec['astrans_en'] = txt is not None
        if txt is not None:
            d = os.path.join(OUT, 'astrans_en', chdir)
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, f'{mod}.md'), 'w', encoding='utf-8') as f:
                f.write(txt)
    # NEW IS commit for reference
    if rec['new_is']:
        r = git('log', '-1', '--format=%H %ad %s', '--date=short', NEW, '--', is_path)
        rec['new_is_commit'] = r.stdout.decode().strip()
    # June provenance
    prov = show(JUNE, f'{BOOK}/02-mt-output/{chdir}/{mod}-provenance.json')
    rec['june_prov'] = json.loads(prov) if prov else None
    prov = show(NEW, f'{BOOK}/02-mt-output/{chdir}/{mod}-provenance.json')
    rec['new_prov'] = json.loads(prov) if prov else None
    meta.append(rec)
    print(chdir, mod, {k: rec[k] for k in ('new_en','new_is','june_en','june_is')}, file=sys.stderr)
with open(os.path.join(OUT, 'meta.json'), 'w') as f:
    json.dump(meta, f, indent=1, ensure_ascii=False)
print('modules:', len(meta))
