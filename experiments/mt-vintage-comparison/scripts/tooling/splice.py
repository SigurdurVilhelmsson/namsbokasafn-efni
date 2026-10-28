# Read-only. Joins the verdict workload onto the June->new carryability test.
# For each of the 104 verdicts, over prose segments of the NEW vintage (EN contains the headword):
#   miss      = new IS does not carry the target (measure.py carries/stems)
#   spliceFix = miss AND June has same id + same plain EN AND June IS carries the target
#   spliceBreak = new carries target, but June (same id+EN) does not  -> a splice would break it
#   subst     = miss AND new IS carries the OTHER entry word (julyEntry/newEntry != target): a
#               term-for-term substitution is in principle targetable; the rest are paraphrase,
#               compounds, or matcher blind spots.
import sys, os, json, re, collections
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import tcmeasure as M
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'; os.chdir(REPO)
OLD, NEW, BOOK = '9a69414d5', '98a5fe2ff', 'efnafraedi-2e'
CONTENT = {'i','b','u','em','sub','sup','term','link','docref','fn','span'}
def plainx(s):  # same normaliser as hybrid.py (dialect-neutral EN comparison)
    s = re.sub(r'\{\{(/?)(\w+)\}\}', ' ', s); s = re.sub(r'\+\+([^+]+?)\+\+', r'\1', s)
    for _ in range(6):
        s2 = re.sub(r'\[\[(\w+):([^\[\]]*)\]\]', lambda m: (m.group(2).split('|')[0] if m.group(1) in CONTENT else ' ' + m.group(1).upper() + ' '), s)
        s2 = re.sub(r'\[\[(\w+)\]\]', ' ', s2)
        if s2 == s: break
        s = s2
    return re.sub(r'\s+', ' ', s).strip()
V = json.load(open('experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json'))['answers']
bych = collections.defaultdict(list)
for a in V: bych[a['chapter']].append(a)
T = collections.Counter(); byc = collections.defaultdict(collections.Counter)
for ch, answers in sorted(bych.items()):
    mods = sorted({n.split('-segments')[0] for n in M.git_ls(NEW, f'books/{BOOK}/02-mt-output/{ch}') if n.endswith('-segments.is.md') and n.startswith('m')})
    data = {m: {'old': M.load_vintage(OLD, BOOK, ch, m), 'new': M.load_vintage(NEW, BOOK, ch, m)} for m in mods}
    for a in answers:
        pat = M.en_pattern(M.norm_en(a['en'])); tst = M.stems(a['targetIcelandic'])
        others = {x for x in (a['julyEntry'], a['newEntry']) if x and M.norm_en(x) != M.norm_en(a['targetIcelandic'])}
        ost = [M.stems(x) for x in others]
        ch_ = a['interpretedChoice']
        for m, d in data.items():
            en_n, is_n = d['new']; en_o, is_o = d['old']
            for key, etxt in en_n.items():
                if key.startswith(('glossary-term:', 'glossary-def:')) or key not in is_n: continue
                if not pat or not pat.search(M.plain(etxt)): continue
                c_new = M.carries(is_n[key], tst)
                juneOK = key in en_o and key in is_o and is_o[key] and plainx(en_o[key]) == plainx(etxt)
                c_old = M.carries(is_o[key], tst) if juneOK else None
                T['prose_new'] += 1; byc[ch_]['prose_new'] += 1
                if juneOK: T['june_counterpart'] += 1
                if not c_new:
                    T['miss_new'] += 1; byc[ch_]['miss_new'] += 1
                    if juneOK and c_old: T['spliceFix'] += 1; byc[ch_]['spliceFix'] += 1
                    elif juneOK: T['miss_both'] += 1; byc[ch_]['miss_both'] += 1
                    else: T['miss_no_june_counterpart'] += 1; byc[ch_]['miss_no_june_counterpart'] += 1
                    if any(M.carries(is_n[key], s) for s in ost if s):
                        T['subst_candidate'] += 1; byc[ch_]['subst_candidate'] += 1
                else:
                    if juneOK and c_old is False: T['spliceBreak'] += 1; byc[ch_]['spliceBreak'] += 1
print(json.dumps({'totals': T, 'byChoice': byc}, ensure_ascii=False, indent=1))
