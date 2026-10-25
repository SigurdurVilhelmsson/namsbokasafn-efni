#!/usr/bin/env python3
"""Critic check, part 2: what burden's chapter-scoped decided-term count leaves out.

(1) RULINGS: occurrences of all 53 houseStyleTerms rulings (scoped per their `why`) in (chapter, term)
    pairs burden did NOT count (burden counted 31 rulings and the 104 verdicts, each only in the chapter
    whose key-terms list carries the headword).
(2) VERDICTS book-wide (a SCENARIO, since verdict scope is [USER]'s call): each verdict's target applied
    to its headword's occurrences in the OTHER chapters, excluding (chapter, term) pairs burden counted and
    headwords that are also rulings (conflict or duplicate) or carry conflicting verdicts.
Same bases and instruments as bookwide_rulings.py. Read-only.
"""
import sys, json, re, importlib.util, collections
sys.dont_write_bytecode = True
HERE = '/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts'
spec = importlib.util.spec_from_file_location('mcopy', HERE + '/critic/measure_copy.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
exec(open(HERE + '/critic/bookwide_rulings.py').read().split("rows = []")[0].split("BURDEN_COUNTED =")[0])  # M, C, RUL, CLS
T = json.load(open(HERE + '/burden/terms.json'))['terms']
counted = set()       # (chapter, enNorm) burden counted (verdicts + rulings)
verdicts = collections.defaultdict(set)
for t in T:
    if t['src'] in ('verdict', 'ruling'):
        counted.add((t['chapter'], t['enNorm']))
    if t['src'] == 'verdict':
        verdicts[t['enNorm']].add((t['chapter'], t['target']))
SCOPE = {'group': {'ch02'}, 'lewis': {'ch15'}, 'cell': {'ch17'}, 'hole': {'ch10'}, 'bent': {'ch07'}}
GLOSS = ('glossary-term:', 'glossary-def:')

def lenient_carries(is_text, target):
    toks = re.findall(r'\w+', M.plain(is_text).lower())
    words = M.stems(target)
    if not words: return False
    for w in words:
        s = w if len(w) <= 4 else w[:len(w) - 2]
        rx = re.compile(re.escape(s).replace('a', '[aö]'))
        if not any(rx.search(tk) for tk in toks): return False
    return True

segs = {'june': [], 'new': [], 'hybrid': []}
for ch in C['chapters']:
    for m in sorted(set(C['modules'][ch]['old']) | set(C['modules'][ch]['new'])):
        f = C['files'][ch][m]
        en_o, is_o = M.parse_segments(f['old']['en']), M.parse_segments(f['old']['is'])
        en_n, is_n = M.parse_segments(f['new']['en']), M.parse_segments(f['new']['is'])
        for k, e in en_o.items():
            if k.startswith(GLOSS) or k not in is_o: continue
            segs['june'].append((ch, m, k, M.plain(e), is_o[k]))
        for k, e in en_n.items():
            if k.startswith(GLOSS) or k not in is_n: continue
            pe = M.plain(e)
            segs['new'].append((ch, m, k, pe, is_n[k]))
            r = CLS.get((m, k))
            if r and r.get('conv_status') == 'clean' and r.get('carried_is') is not None and not r.get('hand_repair'):
                segs['hybrid'].append((ch, m, k, pe, r['carried_is']))
            else:
                segs['hybrid'].append((ch, m, k, pe, is_n[k]))

def count(pats, target, chapter_ok):
    out = {}
    for b in ('june', 'new', 'hybrid'):
        prose = sm = lm = 0
        for ch, m, k, pe, it in segs[b]:
            if not chapter_ok(ch): continue
            if not any(p.search(pe) for p in pats): continue
            prose += 1
            sm += not M.carries(it, M.stems(target))
            lm += not lenient_carries(it, target)
        out[b] = (prose, sm, lm)
    return out

ruling_en = set()
tot1 = collections.Counter(); rows1 = []
for ru in RUL:
    forms = [M.norm_en(x) for x in ru['en']]
    ruling_en.update(forms)
    pats = [M.en_pattern(x) for x in forms if x]
    scope = SCOPE.get(forms[0])
    ok = lambda ch, forms=forms, scope=scope: (not scope or ch in scope) and not any((ch, fx) in counted for fx in forms)
    r = count(pats, ru['is'], ok)
    rows1.append((ru['en'], ru['is'], r))
    for b, (p, s, l) in r.items():
        tot1[(b, 'prose')] += p; tot1[(b, 'strict')] += s; tot1[(b, 'lenient')] += l

tot2 = collections.Counter(); rows2 = []; skipped = []
for h, vs in verdicts.items():
    targets = {M.norm_en(t) for _, t in vs}
    if h in ruling_en:
        skipped.append((h, 'also a ruling')); continue
    if len(targets) > 1:
        skipped.append((h, 'conflicting verdicts')); continue
    target = sorted(vs)[0][1]
    own = {c for c, _ in vs}
    pats = [M.en_pattern(h)]
    ok = lambda ch, h=h, own=own: ch not in own and (ch, h) not in counted
    r = count(pats, target, ok)
    rows2.append((h, target, sorted(own), r))
    for b, (p, s, l) in r.items():
        tot2[(b, 'prose')] += p; tot2[(b, 'strict')] += s; tot2[(b, 'lenient')] += l

print('segments per base:', {b: len(v) for b, v in segs.items()})
print('(1) RULING occurrences burden did not count (all 53, scoped):')
for b in ('june', 'new', 'hybrid'):
    print(f"   {b:7s} prose {tot1[(b,'prose')]:5d}  strictMiss {tot1[(b,'strict')]:5d}  lenientMiss {tot1[(b,'lenient')]:5d}")
print('(2) VERDICT targets applied in OTHER chapters (scenario):')
for b in ('june', 'new', 'hybrid'):
    print(f"   {b:7s} prose {tot2[(b,'prose')]:5d}  strictMiss {tot2[(b,'strict')]:5d}  lenientMiss {tot2[(b,'lenient')]:5d}")
print('   skipped verdict headwords:', skipped)
rows2.sort(key=lambda x: -(x[3]['hybrid'][1] + x[3]['new'][1]))
print('   top verdict headwords by other-chapter strict misses (JUNE | NEW | HYBc: prose/strict/lenient):')
for h, t, own, r in rows2[:25]:
    j, n, hy = r['june'], r['new'], r['hybrid']
    print(f"     {h[:28]:28s} -> {t[:22]:22s} own {','.join(own):10s} | {j[0]:4d}/{j[1]:4d}/{j[2]:4d} | {n[0]:4d}/{n[1]:4d}/{n[2]:4d} | {hy[0]:4d}/{hy[1]:4d}/{hy[2]:4d}")
json.dump({'rulings_uncounted': [(a, b, c) for a, b, c in rows1], 'verdicts_otherchapters': rows2,
           'tot_rulings_uncounted': {f'{b}|{f}': v for (b, f), v in tot1.items()},
           'tot_verdicts_otherchapters': {f'{b}|{f}': v for (b, f), v in tot2.items()}, 'skipped': skipped,
           'complete': True}, open(HERE + '/critic/bookwide_increment.json', 'w'), ensure_ascii=False, indent=1)
print('complete')
