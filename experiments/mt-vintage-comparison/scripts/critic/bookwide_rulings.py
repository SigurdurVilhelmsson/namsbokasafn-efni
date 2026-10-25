#!/usr/bin/env python3
"""Critic check: book-wide ruling burden (all 53 houseStyleTerms rulings, ch01-ch21 module files)
for three bases, versus burden's 31-ruling, own-chapter-only count.

Bases (same EN segment population for NEW and HYBRIDc):
  NEW     : new EN key -> new IS
  HYBRIDc : carryover's actual proposal -> carried (converted June) IS where conv_status == 'clean'
            and the key is not a HAND REPAIR key; otherwise new IS
  JUNE    : June EN key -> June IS (its own population)
Instruments for "segment needs a change":
  strict  : not measure.carries(IS, stems(target))           (measure.py, upper bound on misses)
  lenient : no IS token contains every target content-word stem (cut 2 letters, a/ö tolerant)
            as a substring                                    (lower bound on misses)
Read-only: reads burden's corpus cache and carryover's classification; imports a COPY of measure.py.
"""
import sys, json, re, importlib.util, collections
sys.dont_write_bytecode = True
HERE = '/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts'
spec = importlib.util.spec_from_file_location('mcopy', HERE + '/critic/measure_copy.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)

C = json.load(open(HERE + '/burden/corpus.json'))
RUL = json.load(open(HERE + '/critic/rulings.json'))
CLS = {}
for l in open(HERE + '/carryover/classification.jsonl'):
    r = json.loads(l)
    CLS[(r['module'], r['key'])] = r
BURDEN_COUNTED = {('ch01', 'celsius'), ('ch01', 'dimensional analysis'), ('ch02', 'group'), ('ch05', 'hydrocarbon'),
                  ('ch07', 'bond length'), ('ch07', 'resonance hybrid'), ('ch07', 'bond angle'), ('ch08', 'hybrid orbital'),
                  ('ch08', 'hybridization'), ('ch08', 'bonding orbital'), ('ch09', 'torr'), ('ch10', 'dispersion force'),
                  ('ch10', 'hole'), ('ch12', 'reaction order'), ('ch12', 'elementary reaction'), ('ch12', 'reaction mechanism'),
                  ('ch14', 'poh'), ('ch16', 'microstate'), ('ch17', 'cell potential'), ('ch17', 'galvanic cell'),
                  ('ch18', 'representative metal'), ('ch18', 'carbonate'), ('ch18', 'hydroxide'), ('ch19', 'central metal'),
                  ('ch20', 'alcohol'), ('ch20', 'ether'), ('ch20', 'carbonyl group'), ('ch20', 'carboxylic acid'),
                  ('ch20', 'ketone'), ('ch21', 'radioactive decay'), ('ch21', 'chain reaction')}
# scope notes taken from each ruling's own `why` text
SCOPE = {'group': {'ch02'}, 'lewis': {'ch15'}, 'cell': {'ch17'}, 'hole': {'ch10'}, 'bent': {'ch07'}}
GLOSS = ('glossary-term:', 'glossary-def:')

def lenient_carries(is_text, target):
    toks = re.findall(r'\w+', M.plain(is_text).lower())
    words = M.stems(target)
    if not words:
        return False
    for w in words:
        s = w if len(w) <= 4 else w[:len(w) - 2]
        rx = re.compile(re.escape(s).replace('a', '[aö]'))
        if not any(rx.search(t) for t in toks):
            return False
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

rows = []
tot = collections.Counter()
for ru in RUL:
    target = ru['is']
    forms = [M.norm_en(x) for x in ru['en']]
    pats = [M.en_pattern(x) for x in forms if x]
    key = forms[0]
    scope = SCOPE.get(key)
    row = {'en': ru['en'], 'is': target}
    for b in ('june', 'new', 'hybrid'):
        prose = sm = lm = 0; sm_counted = sm_uncounted = 0
        for ch, m, k, pe, it in segs[b]:
            if scope and ch not in scope: continue
            if not any(p.search(pe) for p in pats): continue
            prose += 1
            s_miss = not M.carries(it, M.stems(target))
            l_miss = not lenient_carries(it, target)
            sm += s_miss; lm += l_miss
            counted = any((ch, fx) in BURDEN_COUNTED for fx in forms)
            if s_miss:
                if counted: sm_counted += 1
                else: sm_uncounted += 1
        row[b] = {'prose': prose, 'strictMiss': sm, 'lenientMiss': lm,
                  'strictMiss_inBurdenScope': sm_counted, 'strictMiss_outsideBurdenScope': sm_uncounted}
        for fld in ('prose', 'strictMiss', 'lenientMiss', 'strictMiss_inBurdenScope', 'strictMiss_outsideBurdenScope'):
            tot[(b, fld)] += row[b][fld]
    rows.append(row)

print('segments per base:', {b: len(v) for b, v in segs.items()})
print('TOTALS (53 rulings, scoped per why):')
for b in ('june', 'new', 'hybrid'):
    print(f"  {b:7s} prose {tot[(b,'prose')]:5d}  strictMiss {tot[(b,'strictMiss')]:5d}  lenientMiss {tot[(b,'lenientMiss')]:5d}"
          f"  | strict in burden scope {tot[(b,'strictMiss_inBurdenScope')]:4d}  outside {tot[(b,'strictMiss_outsideBurdenScope')]:4d}")
print()
rows.sort(key=lambda r: -(r['hybrid']['strictMiss'] + r['june']['strictMiss'] + r['new']['strictMiss']))
print(f"{'ruling':38s} {'target':18s} | JUNE prose/strict/lenient | NEW prose/strict/lenient | HYBc prose/strict/lenient | HYBc outside-burden")
for r in rows:
    j, n, h = r['june'], r['new'], r['hybrid']
    if j['prose'] + n['prose'] == 0: continue
    print(f"{'/'.join(r['en'])[:38]:38s} {r['is'][:18]:18s} | {j['prose']:4d}/{j['strictMiss']:4d}/{j['lenientMiss']:4d} | "
          f"{n['prose']:4d}/{n['strictMiss']:4d}/{n['lenientMiss']:4d} | {h['prose']:4d}/{h['strictMiss']:4d}/{h['lenientMiss']:4d} | {h['strictMiss_outsideBurdenScope']:4d}")
json.dump({'rows': rows, 'totals': {f'{b}|{f}': v for (b, f), v in tot.items()}, 'complete': True},
          open(HERE + '/critic/bookwide_rulings.json', 'w'), ensure_ascii=False, indent=1)
print('complete')
