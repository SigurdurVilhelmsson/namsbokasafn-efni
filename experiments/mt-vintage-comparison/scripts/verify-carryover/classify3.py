"""Full independent classification + conversion gate (verify-carryover).
Usage: classify2.py [gated|ungated] [lit=newen|zero]"""
import sys, os, json, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
import norm as N
HERE = os.path.dirname(os.path.abspath(__file__))
MODE = sys.argv[1] if len(sys.argv) > 1 else 'gated'
LIT = sys.argv[2] if len(sys.argv) > 2 else 'lit=newen'
D = load()
A = json.load(open(os.path.join(HERE, 'raw', 'astrans.json')))

if MODE == 'ungated':
    # force the gated legacy branches on: pretend no API markers
    N.API_MARKERS = re.compile(r'(?!x)x')

def lcs_pairs(a, b):
    """a, b: lists of hashable; return list of (i, j) matched pairs (classic DP LCS)."""
    n, m = len(a), len(b)
    if n == 0 or m == 0: return []
    dp = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n-1, -1, -1):
        ai = a[i]; row = dp[i]; nxt = dp[i+1]
        for j in range(m-1, -1, -1):
            row[j] = nxt[j+1] + 1 if (ai is not None and ai == b[j]) else max(nxt[j], row[j+1])
    out = []; i = j = 0
    while i < n and j < m:
        if a[i] is not None and a[i] == b[j]:
            out.append((i, j)); i += 1; j += 1
        elif dp[i+1][j] >= dp[i][j+1]:
            i += 1
        else:
            j += 1
    return out

def nums(nodes, kind):
    return [nd[1] for nd in preorder_all(nodes) if nd[0] == kind]

def preorder_all(nodes):
    for nd in nodes:
        if isinstance(nd, str): continue
        yield nd
        yield from preorder_all(nd[2])

rows = []
REUSE = 'reuse' in sys.argv
r_reused = set()
for p in sorted(D['new']['en']):
    ch = chapter_of(p); mod = module_of(p); ip = pair_path(p)
    ne, norder = parse_first(D['new']['en'][p]); ni, _ = parse_first(D['new']['is'][ip])
    je, jorder = parse_first(D['june']['en'][p]); ji, _ = parse_first(D['june']['is'][ip])
    ae, _ = parse_first(A[p]['en'])
    nv = {k: visible(ne[k]) for k in norder}
    jv = {k: visible(je[k]) for k in jorder}
    av = {k: visible(ae[k]) for k in jorder}
    # June key "text identity": both Englishes must agree, else the key cannot serve as a text source
    jtext = {k: (jv[k] if jv[k] == av[k] else None) for k in jorder}
    bytext = collections.defaultdict(list)
    for k in jorder:
        bytext[jv[k]].append(k)
    cls = {}; src = {}
    for k in norder:
        if k in je:
            if nv[k] == jv[k] and nv[k] == av[k]:
                cls[k] = '1'; src[k] = k
            else:
                cls[k] = '2'
        else:
            c = bytext.get(nv[k], [])
            cls[k] = '3' if len(c) == 1 else '4'
            if len(c) == 1 and jtext[c[0]] is not None:
                src[k] = c[0]
    # extended recovery: LCS over the non-class-1 remainder
    used = {src[k] for k in norder if cls[k] == '1'}
    remN = [k for k in norder if cls[k] != '1' and k.split(':')[1] not in ('alt', 'table-summary')]
    remJ = [k for k in jorder if k not in used]
    pairs = lcs_pairs([nv[k] for k in remN], [jtext[k] for k in remJ])
    ext = {remN[i]: remJ[j] for i, j in pairs}
    if REUSE:
        jpos = {k: i for i, k in enumerate(jorder)}; npos = {k: i for i, k in enumerate(norder)}
        anchors = sorted([(npos[k], jpos[src[k]]) for k in norder if cls[k] == '1'] + [(npos[a], jpos[b]) for a, b in ext.items()])
        jt_index = collections.defaultdict(list)
        for kk in jorder:
            if jtext[kk] is not None: jt_index[jtext[kk]].append(kk)
        for k in remN:
            if k in ext: continue
            c = jt_index.get(nv[k], [])
            if not c: continue
            prev = [a for a in anchors if a[0] < npos[k]]
            expect = (prev[-1][1] + (npos[k] - prev[-1][0])) if prev else npos[k]
            ext[k] = min(c, key=lambda x: (abs(jpos[x] - expect), jpos[x]))
            r_reused.add(k)
    for k in norder:
        typ = k.split(':')[1]
        r = {'ch': ch, 'mod': mod, 'key': k, 'type': typ, 'cls': cls[k], 'en_chars': len(chars(ne[k]))}
        s = src.get(k) if cls[k] in ('1', '3') else None
        if cls[k] == '3' and s is None:
            r['cls3_astrans_disagree'] = True
        se = s if s is not None else ext.get(k)
        r['src_strict'] = s; r['src_ext'] = se
        if cls[k] == '3' and ext.get(k) is not None and ext.get(k) != s:
            r['cls3_lcs_differs'] = ext.get(k)
        if se is not None:
            jis = ji[se]
            log = collections.Counter()
            lit = ne[k].count('*') if LIT == 'lit=newen' else 0
            conv = N.legacy_to_bracket(jis, literal_asterisks=lit, log=log)
            reasons = []
            try:
                cn = parse_brackets(conv)
            except ParseError:
                cn = None; reasons.append('parse')
            en_nodes = parse_brackets(ne[k])
            if cn is not None:
                kc, ke = kinds(cn), kinds(en_nodes)
                if kc != ke:
                    reasons.append('kinds')
                    r['kind_delta'] = {x: kc[x]-ke[x] for x in set(kc)|set(ke) if kc[x] != ke[x]}
                tc = collections.Counter({x: v for x, v in targets(cn).items() if x[0] != 'TABLE'})
                te = collections.Counter({x: v for x, v in targets(en_nodes).items() if x[0] != 'TABLE'})
                # MATH/MEDIA/TABLE are renumbered; xref/docref/link must match exactly
                if tc != te and 'kinds' not in reasons:
                    reasons.append('targets')
            if N.LEGACY_RESIDUE.search(conv):
                reasons.append('residue')
            elif (re.search(r'(?<=[^\s^])\^[^\s^]{1,15}\^', conv) and '^' not in ne[k]) or (re.search(r'(?<=[^\s~])~[^\s~]{1,15}~', conv) and '~' not in ne[k]):
                reasons.append('residue-gated')
            r['legacy_fired'] = sorted(x for x in log if x != 'escape')
            r['escape'] = bool(log.get('escape'))
            r['conv_reasons'] = reasons
            r['clean'] = not reasons
            if not reasons:
                # attribute fill by order from NEW EN; MATH/MEDIA renumber via English alignment
                amap = {}
                for kind in ('MATH', 'MEDIA'):
                    a_seq = nums(parse_brackets(N.legacy_to_bracket(ae[se])), kind)
                    n_seq = nums(en_nodes, kind)
                    mp = {}
                    if len(a_seq) == len(n_seq):
                        for x, y in zip(a_seq, n_seq):
                            mp.setdefault(x, y)
                    amap[kind] = mp
                attrs = {kd: [nd[1] for nd in preorder(en_nodes, {kd})] for kd in ('term', 'fn', 'em', 'span')}
                ctr = collections.Counter()
                renum = {'MATH': False, 'MEDIA': False}; miss = []
                def fill(nd):
                    kind, attr, ch2 = nd
                    if kind in attrs and not (kind in ('xref', 'docref') and not ch2):
                        i = ctr[kind]; ctr[kind] += 1
                        return (kind, attrs[kind][i], ch2)
                    if kind in ('MATH', 'MEDIA'):
                        y = amap[kind].get(attr)
                        if y is None:
                            miss.append((kind, attr)); return nd
                        if y != attr: renum[kind] = True
                        return (kind, y, ch2)
                    return nd
                filled = map_nodes(cn, fill)
                out = ser(filled)
                r['math_renum'] = renum['MATH']; r['media_renum'] = renum['MEDIA']; r['num_miss'] = miss
                r['identical_new_is'] = (out == ni[k])
                r['vis_identical_new_is'] = (visible(jis) == visible(ni[k]))
                r['carried'] = out
        r['reused_twin'] = k in r_reused
        rows.append(r)

tag = f'{MODE}-{LIT.split("=")[1]}' + ('-reuse' if REUSE else '')
with open(os.path.join(HERE, f'my_classes_{tag}.jsonl'), 'w') as f:
    for r in rows: f.write(json.dumps(r, ensure_ascii=False) + '\n')
c = collections.Counter(r['cls'] for r in rows)
car = [r for r in rows if r.get('src_ext')]
car_s = [r for r in rows if r.get('src_strict')]
clean = [r for r in car if r['clean']]
print(tag, 'classes', dict(sorted(c.items())))
print('  carried ext', len(car), 'strict', len(car_s), '| clean ext', len(clean), 'strict', sum(1 for r in car_s if r['clean']))
print('  fallback reasons', collections.Counter(tuple(r['conv_reasons']) for r in car if not r['clean']))
print('  cls2 recovered', sum(1 for r in rows if r['cls']=='2' and r.get('src_ext')), 'cls4 aligned', sum(1 for r in rows if r['cls']=='4' and r.get('src_ext')),
      'cls3 strict', sum(1 for r in rows if r['cls']=='3' and r.get('src_strict')), 'cls3 astrans-disagree', sum(1 for r in rows if r.get('cls3_astrans_disagree')),
      'cls3 lcs differs from unique-match', sum(1 for r in rows if r.get('cls3_lcs_differs')))
need_legacy = sum(1 for r in clean if r['legacy_fired'])
need_math_only = sum(1 for r in clean if not r['legacy_fired'] and (r['math_renum'] or r['media_renum']))
print('  clean needing legacy rewrite', need_legacy, '| math/media renumber only', need_math_only, '| escape-only', sum(1 for r in clean if not r['legacy_fired'] and r['escape'] and not r['math_renum']),
      '| num_miss', sum(1 for r in clean if r['num_miss']))
ident = [r for r in clean if r['identical_new_is']]; vident = [r for r in clean if r['vis_identical_new_is']]
tot = sum(r['en_chars'] for r in rows); cch = sum(r['en_chars'] for r in clean)
print('  total NEW EN prose chars', tot, '| clean chars', cch, f'({100*cch/tot:.1f}%)',
      '| excl alt+summary', f"{100*cch/sum(r['en_chars'] for r in rows if r['type'] not in ('alt','table-summary')):.2f}%")
print('  identical-to-NEW-IS (byte):', len(ident), 'segs', sum(r['en_chars'] for r in ident), 'chars',
      '| visible-identical:', len(vident), 'segs', sum(r['en_chars'] for r in vident), 'chars')
