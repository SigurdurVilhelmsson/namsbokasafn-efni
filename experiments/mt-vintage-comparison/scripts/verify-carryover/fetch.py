#!/usr/bin/env python3
"""Fetch all chemistry segment files at both refs via `git show` into a JSON cache.
Read-only on the repo: only git ls-tree / git show / git log."""
import subprocess, json, os, re, sys
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw')
JUNE, NEW = '9a69414d5', '98a5fe2ff'
B = 'books/efnafraedi-2e'

def git(*args, check=True):
    r = subprocess.run(['git', '-C', REPO, *args], capture_output=True, check=check)
    return r.stdout

def ls(ref, sub):
    return git('ls-tree', '-r', '--name-only', ref, f'{B}/{sub}/').decode().splitlines()

def show(ref, path):
    r = subprocess.run(['git', '-C', REPO, 'show', f'{ref}:{path}'], capture_output=True)
    if r.returncode != 0:
        return None
    return r.stdout.decode('utf-8')

data = {}
for label, ref in (('june', JUNE), ('new', NEW)):
    en = [p for p in ls(ref, '02-for-mt') if re.search(r'/[^/()]+-segments\.en\.md$', p)]
    isf = [p for p in ls(ref, '02-mt-output') if re.search(r'/[^/()]+-segments\.is\.md$', p)]
    d = {'en': {}, 'is': {}}
    for p in en:
        d['en'][p] = show(ref, p)
    for p in isf:
        d['is'][p] = show(ref, p)
    data[label] = d
    print(label, 'en files', len(en), 'is files', len(isf), file=sys.stderr)
# also list excluded (b)-style files for the record
for label, ref in (('june', JUNE), ('new', NEW)):
    ex = [p for p in ls(ref, '02-for-mt') + ls(ref, '02-mt-output') if '(' in p]
    print(label, 'paren files excluded:', len(ex), file=sys.stderr)
with open(os.path.join(OUT, 'segfiles.json'), 'w') as f:
    json.dump(data, f)
