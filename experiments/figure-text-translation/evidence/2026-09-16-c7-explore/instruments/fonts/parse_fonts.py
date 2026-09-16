import json, re, sys, collections, os
def parse(txt):
    lines = txt.splitlines()
    if len(lines) < 2 or not lines[1].startswith('---'): return None
    sep = lines[1]; spans = [(m.start(), m.end()) for m in re.finditer(r'-+', sep)]
    fonts = []
    for ln in lines[2:]:
        parts = ln.split()
        name = ln[:spans[0][1]].strip()
        typ = ln[spans[1][0]:spans[2][0]].strip(); enc = ln[spans[2][0]:spans[3][0]].strip()
        fonts.append(dict(name=name, type=typ, encoding=enc, emb=parts[-5], sub=parts[-4], uni=parts[-3]))
    return fonts
rows = []
for l in open('stage_log.tsv'):
    st, src, out, key = l.rstrip('\n').split('\t')
    if st != 'OK': continue
    f = parse(open(f'fontsout/{key}.txt', errors='replace').read())
    rows.append(dict(src=src, staged=out, key=key, tree=key.split('__')[0], fonts=f))
json.dump(rows, open('eps_fonts.json','w'), indent=0)
def fam(n):
    return n[7:] if re.match(r'^[A-Z]{6}\+', n) else n
print('unparsed', sum(1 for r in rows if r['fonts'] is None))
c = collections.Counter((f['type'], f['encoding'], f['uni']) for r in rows if r['fonts'] for f in r['fonts'])
for k,v in c.most_common(): print(v, k)
print()
c = collections.Counter(); files = collections.defaultdict(set)
for r in rows:
    for f in r['fonts'] or []:
        if f['uni'] == 'no':
            k = (fam(f['name']), f['type'], f['encoding']); c[k] += 1; files[k].add((r['tree'], os.path.basename(r['src'])))
for k, v in sorted(c.items(), key=lambda x: -x[1]):
    trees = collections.Counter(t for t, _ in files[k])
    print(v, k, dict(trees))
