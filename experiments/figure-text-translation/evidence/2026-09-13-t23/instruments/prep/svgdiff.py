#!/usr/bin/env python3
"""Compare two SVGs: <text> element list (sorted and ordered), @font-face blobs, and the
artwork part (everything before the appended <style>). Read-only."""
import re, sys, hashlib
a, b = (open(p, encoding='utf-8').read() for p in sys.argv[1:3])
def parts(s):
    i = s.rfind('<style>@font-face') if '<style>@font-face' in s else s.rfind('<style>')
    art, tail = s[:i], s[i:]
    texts = re.findall(r'<text [^>]*>.*?</text>', tail, flags=re.S)
    faces = re.findall(r'@font-face\{[^}]*\}', tail)
    return art, texts, faces
A, B = parts(a), parts(b)
h = lambda x: hashlib.sha256(x.encode()).hexdigest()[:12]
print('artwork part equal:', A[0] == B[0], len(A[0]), len(B[0]))
print('text elems:', len(A[1]), len(B[1]), 'ordered equal:', A[1] == B[1], 'sorted equal:', sorted(A[1]) == sorted(B[1]))
print('font faces:', len(A[2]), len(B[2]), 'equal:', A[2] == B[2], [len(f) for f in A[2]], [len(f) for f in B[2]])
for x, y in zip(A[1], B[1]):
    if x != y:
        print('  A:', x[:300]); print('  B:', y[:300])
if A[0] != B[0]:
    import difflib
    al, bl = A[0].splitlines(), B[0].splitlines()
    d = [l for l in difflib.unified_diff(al, bl, lineterm='', n=0)]
    print('artwork diff lines:', len(d)); print('\n'.join(x[:200] for x in d[:20]))
