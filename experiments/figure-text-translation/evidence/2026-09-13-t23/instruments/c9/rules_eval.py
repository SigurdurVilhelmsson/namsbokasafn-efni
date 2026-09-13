#!/usr/bin/env python3
"""Apply candidate decimal/thousands rules to every KEPT line in the census; list changed and left."""
import json, re, sys, collections
EXP = '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation'
sys.path.insert(0, EXP); sys.dont_write_bytecode = True
import figtext as FT
C = '/home/siggi/dev/scratch-c140/c9/inherited/1b-census.jsonl'
two = [json.loads(l) for l in open(EXP + '/evidence/2026-09-13-compose-fidelity/data/2b-translated.jsonl')]
BOUGHT = {r['basename'] for r in two}
STATE = {(r['basename'], r['block']): r['state'] for r in two}

def r1_run(t):   # panel rule (figure-consistency.cjs DECIMAL) per whitespace token, whitespace preserved
    return re.sub(r'(?<!\S)(\d+)\.(\d+)(?!\S)', r'\1,\2', t)

TH = re.compile(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?=(?:\.\d+)?(?![\d,]))')
def r2_line(t):  # digit-flanked decimal + ALL thousands groups -> '.'
    t = TH.sub(lambda m: m.group().replace(',', '\u2800'), t)
    t = re.sub(r'(?<=\d)\.(?=\d)', ',', t)
    return t.replace('\u2800', '.')

def r2coded_line(t):  # literal port of mathml-to-latex.js localizeNumberFull (multi-group bug included)
    t = re.sub(r'(\d),(\d{3})(?!\d)', '\\1\u2800\\2', t)
    t = re.sub(r'(\d)\.(\d)', r'\1,\2', t)
    return t.replace('\u2800', '.')

TUPLE = re.compile(r'\d\.\d+\s*,\s*[–−-]?\d')
def r3_line(t, block_key):
    if TUPLE.search(t):            # coordinate tuple "(10.0, 19.5)": leave for a human
        return t
    t = r2_line(t)
    if re.fullmatch(r'\s*\d+\.\s*', block_key):   # overprint fragment "0." -> "0,"
        t = re.sub(r'(?<=\d)\.', ',', t)
    return t

def fake(run):
    text, size, along, proj, adv, rot, font = run
    return dict(text=text, size=size, x=along, y=proj, rot=0.0, adv=adv)

RULES = ['R1', 'R2', 'R2coded', 'R3']
changed = {k: collections.Counter() for k in RULES}
left = {k: collections.Counter() for k in RULES}
blocks_changed = collections.Counter(); figs_changed = collections.defaultdict(set)
changed34 = {k: collections.Counter() for k in RULES}
face = collections.Counter()
bi = collections.defaultdict(int)
nkept = 0
SEPNUM = re.compile(r'\d*[.,]\d|\d[.,](?!\d)')
for l in open(C):
    r = json.loads(l)
    if r.get('row') != 'block':
        continue
    b = r['basename']; idx = bi[b]; bi[b] += 1
    if not r['figure_composed']:
        continue
    st = STATE.get((b, idx))
    kept = (not r['send']) or st == 'identical'
    if not kept:
        continue
    nkept += 1
    runs = [fake(x) for x in r['runs']]
    groups = [runs] if FT.is_arc(runs) else FT.lines(runs)
    anyc = set()
    for g in groups:
        line = ''.join(x['text'] for x in g)
        if not SEPNUM.search(line):
            continue
        outs = {}
        # R1 per run
        outs['R1'] = ''.join(r1_run(x['text']) for x in g)
        outs['R2'] = r2_line(line)
        outs['R2coded'] = r2coded_line(line)
        outs['R3'] = r3_line(line, r['key'])
        for k in RULES:
            assert len(outs[k]) == len(line), (k, line, outs[k])   # length-preserving: runs keep their text length
            tag = (line, outs[k], b in BOUGHT)
            if outs[k] != line:
                changed[k][tag] += 1; anyc.add(k); figs_changed[k].add(b)
                if b in BOUGHT: changed34[k][line] += 1
            else:
                left[k][(line, b in BOUGHT)] += 1
    for k in anyc:
        blocks_changed[k] += 1
res = dict(kept_blocks=nkept,
           blocks_changed=dict(blocks_changed),
           figs_changed={k: len(v) for k, v in figs_changed.items()},
           changed_instances={k: sum(v.values()) for k, v in changed.items()},
           left_instances={k: sum(v.values()) for k, v in left.items()},
           changed34={k: sum(v.values()) for k, v in changed34.items()})
print(json.dumps(res, indent=1))
json.dump({k: [[a, o, bb, n] for (a, o, bb), n in sorted(changed[k].items())] for k in RULES},
          open('/home/siggi/dev/scratch-c140/c9/out/rules_changed.json', 'w'), ensure_ascii=False, indent=0)
json.dump({k: [[a, bb, n] for (a, bb), n in sorted(left[k].items())] for k in RULES},
          open('/home/siggi/dev/scratch-c140/c9/out/rules_left.json', 'w'), ensure_ascii=False, indent=0)
# differences between rules
def outmap(k): return {a: o for (a, o, bb) in changed[k]}
m = {k: outmap(k) for k in RULES}
alllines = set().union(*[set(x) for x in m.values()]) | {a for k in RULES for (a, bb) in left[k]}
print('lines where rules disagree:')
for a in sorted(alllines):
    vals = [m[k].get(a, a) for k in RULES]
    if len(set(vals)) > 1:
        print('  ', repr(a), ' | '.join(f'{k}={v!r}' for k, v in zip(RULES, vals)))
