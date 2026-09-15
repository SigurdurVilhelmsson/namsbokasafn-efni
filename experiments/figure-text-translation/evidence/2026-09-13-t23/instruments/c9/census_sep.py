#!/usr/bin/env python3
"""c9 census: numbers carrying a separator in figure label text, LINE level, with run-boundary
straddle detection. Reader over the inherited 1b census (runs per block). No compose, no MT."""
import json, re, sys, os, collections
EXP = '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation'
sys.path.insert(0, EXP); sys.path.insert(0, EXP + '/pylibs')
sys.dont_write_bytecode = True
import figtext as FT

C = '/home/siggi/dev/scratch-c140/c9/inherited/1b-census.jsonl'
D2B = EXP + '/evidence/2026-09-13-compose-fidelity/data/2b-translated.jsonl'
OUT = '/home/siggi/dev/scratch-c140/c9/out'

two = [json.loads(l) for l in open(D2B)]
BOUGHT = {r['basename'] for r in two}
STATE34 = {(r['basename'], r['block']): r['state'] for r in two}

# A numeric chunk that carries at least one separator between/before digits.
NUM = re.compile(r'\d*[.,]\d+(?:[.,]\d+)*')
# trailing separator after digits with no following digit (hazard for naive regexes)
TRAIL = re.compile(r'\d[.,](?!\d)')
COLON = re.compile(r'\d:\d')
SPACEGROUP = re.compile(r'\d{1,3}(?:[ \u00A0\u2009\u202F]\d{3})+(?!\d)')
REF = re.compile(r'(Figure|Fig\.|Section|Table|Chapter|Equation|Eq\.|Example|Step|Appendix|Mynd|Tafla|Kafli)\s*$', re.I)

def classify(tok, pre, post):
    has_c, has_p = ',' in tok, '.' in tok
    cls = None
    if tok.startswith(('.', ',')):
        cls = 'leading-point' if tok[0] == '.' else 'leading-comma'
    elif has_c and has_p:
        cls = 'both'
    elif has_c:
        if re.fullmatch(r'\d{1,3}(,\d{3})+', tok):
            cls = 'thousands'
        elif post.startswith('-') or post.startswith('–'):
            cls = 'locant'
        else:
            cls = 'comma-other'
    elif tok.count('.') >= 2:
        cls = 'multi-dot'
    else:
        cls = 'plain-decimal'
    ctx = []
    if re.match(r'\s*[×x]\s*10', post):
        ctx.append('scientific')
    if REF.search(pre):
        ctx.append('ref-number')
    if re.search(r'[A-Za-z)\]]$', pre):
        ctx.append('attached-left-letter')   # formula context: CuSO4.5H2O, Fe0.95O
    if re.match(r'[A-Za-z(]', post):
        ctx.append('attached-right-letter')
    if re.search(r'[–\-−]$', pre) and re.search(r'\d[.,]?\d*\s*$', pre[:-1] or ''):
        ctx.append('range-right')
    if re.match(r'\s*[–\-−]\s*\d', post) or re.match(r'\s*to\s+\d', post):
        ctx.append('range-left')
    if re.search(r'[–\-−]$', pre) and not re.search(r'\d\s*[–\-−]$', pre):
        ctx.append('negative')
    return cls, ctx

def fake(run):
    text, size, along, proj, adv, rot, font = run
    return dict(text=text, size=size, x=along, y=proj, rot=0.0, adv=adv)

figs = {}
blocks = []
for l in open(C):
    r = json.loads(l)
    if r.get('row') == 'figure':
        figs[r['basename']] = r
    elif r.get('row') == 'block':
        blocks.append(r)

matches = []
funnel = collections.Counter()
key_mismatch = []
trail_hits = []
colon_hits = []
space_hits = []
bi = collections.defaultdict(int)
for r in blocks:
    b = r['basename']
    idx = bi[b]; bi[b] += 1
    composed = bool(r['figure_composed'])
    if not composed:
        pop = 'noncomposed'
    elif not r['send']:
        pop = 'kept-sendfalse'
    else:
        st = STATE34.get((b, idx)) if b in BOUGHT else None
        pop = {'identical': 'kept-identity', 'translated': 'send-translated'}.get(st, 'send-true-unbought')
    funnel[pop] += 1
    runs = [fake(x) for x in r['runs']]
    arc = FT.is_arc(runs)
    if arc != r['arc']:
        key_mismatch.append((b, idx, 'arc', r['key']))
    groups = [runs] if arc else FT.lines(runs)
    rebuilt = ''.join(x['text'] for x in runs) if arc else '|'.join(''.join(x['text'] for x in g) for g in groups)
    if rebuilt != r['key']:
        key_mismatch.append((b, idx, rebuilt, r['key']))
    for li, g in enumerate(groups):
        text = ''.join(x['text'] for x in g)
        bounds = []  # run start offsets
        o = 0
        for x in g:
            bounds.append((o, o + len(x['text']))); o += len(x['text'])
        def runs_of(s, e):
            return [k for k, (a, z) in enumerate(bounds) if a < e and z > s]
        for m in NUM.finditer(text):
            s, e = m.span(); tok = m.group()
            pre, post = text[:s], text[e:]
            cls, ctx = classify(tok, pre, post)
            rs = runs_of(s, e)
            sep_pos = [s + i for i, ch in enumerate(tok) if ch in '.,']
            sep_runs = sorted({k for p in sep_pos for k in runs_of(p, p + 1)})
            # separator isolated at a run edge: the char before or after the separator lives in a different run
            sep_at_edge = any(runs_of(p - 1, p) != runs_of(p, p + 1) or runs_of(p + 1, p + 2) != runs_of(p, p + 1)
                              for p in sep_pos)
            # the whitespace token containing the match
            ws_s = max(text.rfind(' ', 0, s) + 1, 0); ws_e = text.find(' ', e); ws_e = len(text) if ws_e < 0 else ws_e
            wstok = text[ws_s:ws_e]
            run_texts = [g[k]['text'] for k in rs]
            matches.append(dict(pop=pop, basename=b, chapter=figs[b]['chapter'], block=idx, key=r['key'],
                                arc=arc, line=li, line_text=text, tok=tok, cls=cls, ctx=ctx,
                                n_runs=len(rs), run_texts=run_texts, sep_at_run_edge=sep_at_edge,
                                ws_token=wstok, sizes=sorted({g[k]['size'] for k in rs}),
                                fonts=sorted({r['runs'][0][6]}), bought=b in BOUGHT))
        for m in TRAIL.finditer(text):
            trail_hits.append((pop, b, text, m.start()))
        for m in COLON.finditer(text):
            colon_hits.append((pop, b, text))
        for m in SPACEGROUP.finditer(text):
            space_hits.append((pop, b, text, m.group()))

json.dump(dict(funnel=funnel, key_mismatch=key_mismatch[:50], n_key_mismatch=len(key_mismatch),
               n_blocks=len(blocks), n_figs=len(figs)), open(OUT + '/census_meta.json', 'w'), ensure_ascii=False, indent=1)
with open(OUT + '/matches.jsonl', 'w') as fh:
    for m in matches:
        fh.write(json.dumps(m, ensure_ascii=False) + '\n')
json.dump(dict(trail=trail_hits, colon=colon_hits, space=space_hits), open(OUT + '/aux_hits.json', 'w'), ensure_ascii=False)
print('blocks', len(blocks), 'figs', len(figs), 'funnel', dict(funnel))
print('key mismatches', len(key_mismatch), key_mismatch[:5])
print('matches', len(matches), collections.Counter(m['pop'] for m in matches))
print('trail', collections.Counter(t[0] for t in trail_hits), 'colon', collections.Counter(t[0] for t in colon_hits),
      'space', collections.Counter(t[0] for t in space_hits))
