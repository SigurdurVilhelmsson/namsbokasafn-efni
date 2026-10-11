import re, sys, glob, os
S = sys.argv[1]
SEG = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def segs(path):
    try: t = open(path, encoding='utf-8').read()
    except FileNotFoundError: return {}
    parts = SEG.split(t); out = {}
    for i in range(1, len(parts)-1, 2):
        out[parts[i].split(':',1)[-1]] = parts[i+1].strip()
    return out
pats = [r'\{\{fn\}\}', r'\+\+', r'\]\((?!http)', r'\[\[link:', r'\[\[fn:', r'\[\[docref:', r'\[\[u:']
for p in pats:
    rp = re.compile(p); shown = 0
    for f in sorted(glob.glob(f'{S}/june/books/efnafraedi-2e/02-for-mt/ch*/m*-segments.en.md')):
        J = segs(f); N = segs(f.replace('/june/','/new/'))
        for k, t in J.items():
            if rp.search(t) and shown < 2:
                i = rp.search(t).start()
                print(f'--- {p} {os.path.basename(f)} {k}\n J: {t[max(0,i-80):i+120]!r}\n N: {N.get(k,"<absent>")[max(0,i-80):i+160]!r}')
                shown += 1
