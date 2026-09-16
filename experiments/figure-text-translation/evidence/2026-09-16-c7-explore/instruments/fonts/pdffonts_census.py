import subprocess, sys, json, re, collections
paths = [l.strip() for l in open(sys.argv[1]) if l.strip()]
out = open(sys.argv[2], 'w')
fails = 0
for p in paths:
    r = subprocess.run(['pdffonts', p], capture_output=True, text=True, errors='replace')
    if r.returncode != 0:
        fails += 1
        out.write(json.dumps(dict(path=p, error=r.stderr[:200])) + '\n'); continue
    lines = r.stdout.splitlines()
    hdr = lines[0]; sep = lines[1]
    # column spans from the dashes line
    spans = [(m.start(), m.end()) for m in re.finditer(r'-+', sep)]
    fonts = []
    for ln in lines[2:]:
        cols = [ln[s:(spans[i+1][0] if i+1 < len(spans) else len(ln))].strip() for i,(s,e) in enumerate(spans)]
        # name may be long and overflow; fallback: split from right
        parts = ln.split()
        # right-anchored: uni obj gen => last 3 are uni? actually 'uni objnum gen'
        uni, sub, emb = parts[-3], parts[-4], parts[-5]
        fonts.append(dict(name=cols[0], type=cols[1], encoding=cols[2], emb=emb, sub=sub, uni=uni, raw=ln))
    out.write(json.dumps(dict(path=p, fonts=fonts)) + '\n')
print('files', len(paths), 'fails', fails)
