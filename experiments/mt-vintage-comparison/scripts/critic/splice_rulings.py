#!/usr/bin/env python3
"""Critic check: tooling's targeted splice (491 segments, '556 fixes / 2 breaks') re-scored against the
53 houseStyleTerms rulings, which tooling did not check. Replicates splice_net.py's selection rule on
burden's corpus cache, then counts ruling breaks (NEW carries the ruling target, June does not) and
ruling fixes in the spliced segments. Read-only."""
import sys, json, re, importlib.util, collections
sys.dont_write_bytecode = True
HERE = '/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts'
spec = importlib.util.spec_from_file_location('mcopy', HERE + '/critic/measure_copy.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
C = json.load(open(HERE + '/burden/corpus.json'))
RUL = json.load(open(HERE + '/critic/rulings.json'))
V = json.load(open('/home/siggi/dev/repos/namsbokasafn-efni/experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json'))['answers']
CONTENT = {'i', 'b', 'u', 'em', 'sub', 'sup', 'term', 'link', 'docref', 'fn', 'span'}
def plainx(s):   # tooling's normaliser, verbatim
    s = re.sub(r'\{\{(/?)(\w+)\}\}', ' ', s); s = re.sub(r'\+\+([^+]+?)\+\+', r'\1', s)
    for _ in range(6):
        s2 = re.sub(r'\[\[(\w+):([^\[\]]*)\]\]', lambda m: (m.group(2).split('|')[0] if m.group(1) in CONTENT else ' ' + m.group(1).upper() + ' '), s)
        s2 = re.sub(r'\[\[(\w+)\]\]', ' ', s2)
        if s2 == s: break
        s = s2
    return re.sub(r'\s+', ' ', s).strip()
def lenient(is_text, target):
    toks = re.findall(r'\w+', M.plain(is_text).lower()); words = M.stems(target)
    if not words: return False
    for w in words:
        s = w if len(w) <= 4 else w[:len(w) - 2]
        rx = re.compile(re.escape(s).replace('a', '[aö]'))
        if not any(rx.search(t) for t in toks): return False
    return True
SCOPE = {'group': {'ch02'}, 'lewis': {'ch15'}, 'cell': {'ch17'}, 'hole': {'ch10'}, 'bent': {'ch07'}}
rul = []
for r in RUL:
    forms = [M.norm_en(x) for x in r['en']]
    rul.append((forms, [M.en_pattern(x) for x in forms if x], r['is'], SCOPE.get(forms[0])))
bych = collections.defaultdict(list)
for a in V: bych[a['chapter']].append(a)
T = collections.Counter(); per_rule = collections.Counter(); spliced = []
for ch, answers in sorted(bych.items()):
    terms = [(M.en_pattern(M.norm_en(a['en'])), M.stems(a['targetIcelandic'])) for a in answers]
    for m in C['modules'][ch]['new']:
        f = C['files'][ch][m]
        en_n, is_n = M.parse_segments(f['new']['en']), M.parse_segments(f['new']['is'])
        en_o, is_o = M.parse_segments(f['old']['en']), M.parse_segments(f['old']['is'])
        for key, etxt in en_n.items():
            if key.startswith(('glossary-term:', 'glossary-def:')) or key not in is_n: continue
            pe = M.plain(etxt)
            hits = [(p, s) for p, s in terms if p and p.search(pe)]
            if not hits: continue
            juneOK = key in en_o and key in is_o and is_o[key] and plainx(en_o[key]) == plainx(etxt)
            if not juneOK: continue
            new_c = [M.carries(is_n[key], s) for _, s in hits]
            old_c = [M.carries(is_o[key], s) for _, s in hits]
            fix = sum(1 for n, o in zip(new_c, old_c) if not n and o)
            brk = sum(1 for n, o in zip(new_c, old_c) if n and not o)
            if fix <= brk: continue
            T['spliced'] += 1; T['verdict_fixes'] += fix; T['verdict_breaks'] += brk
            seg_breaks = 0
            for forms, pats, target, scope in rul:
                if scope and ch not in scope: continue
                if not any(p.search(pe) for p in pats): continue
                T['ruling_occ'] += 1
                n_s, o_s = M.carries(is_n[key], M.stems(target)), M.carries(is_o[key], M.stems(target))
                n_l, o_l = lenient(is_n[key], target), lenient(is_o[key], target)
                if n_s and not o_s: T['ruling_breaks_strict'] += 1; per_rule[('break', forms[0])] += 1; seg_breaks += 1
                if o_s and not n_s: T['ruling_fixes_strict'] += 1; per_rule[('fix', forms[0])] += 1
                if n_l and not o_l: T['ruling_breaks_lenient'] += 1
                if o_l and not n_l: T['ruling_fixes_lenient'] += 1
            if seg_breaks: T['spliced_segments_with_a_ruling_break'] += 1
print(json.dumps(T, indent=1))
print('per ruling (strict):', sorted(per_rule.items(), key=lambda x: -x[1])[:15])
print('complete')
