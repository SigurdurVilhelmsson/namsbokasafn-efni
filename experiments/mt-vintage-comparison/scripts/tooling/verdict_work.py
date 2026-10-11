# Read-only. For [USER]'s 104 verdicts: how many prose segments in each vintage do NOT carry the
# target word (= occurrence edits an editor would make), using measure.py's own matcher (copied).
import sys, os, json, collections
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tcmeasure as M
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
os.chdir(REPO)  # measure.py's git_show uses cwd; reads only
OLD, NEW, BOOK = '9a69414d5', '98a5fe2ff', 'efnafraedi-2e'
V = json.load(open('experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json'))['answers']
bych = collections.defaultdict(list)
for a in V: bych[a['chapter']].append(a)
tot = collections.Counter(); rows = []
for ch, answers in sorted(bych.items()):
    mods = sorted({n.split('-segments')[0] for n in M.git_ls(NEW, f'books/{BOOK}/02-mt-output/{ch}') if n.endswith('-segments.is.md') and n.startswith('m')})
    data = {m: {'old': M.load_vintage(OLD, BOOK, ch, m), 'new': M.load_vintage(NEW, BOOK, ch, m)} for m in mods}
    for d in data.values():
        d['common'] = (d['old'][0].keys() & d['old'][1].keys()) & (d['new'][0].keys() & d['new'][1].keys())
    for a in answers:
        pat = M.en_pattern(M.norm_en(a['en'])); tst = M.stems(a['targetIcelandic'])
        r = {'ch': ch, 'en': a['en'], 'target': a['targetIcelandic'], 'choice': a['interpretedChoice']}
        for v in ('old', 'new'):
            n_all = miss_all = n_c = miss_c = 0; key_ok = None
            for m, d in data.items():
                en, is_ = d[v]
                gk = f"glossary-term:{a['definitionId']}-term"
                if gk in is_: key_ok = M.carries(is_[gk], tst)
                for key, etxt in en.items():
                    if key.startswith(('glossary-term:', 'glossary-def:')) or key not in is_: continue
                    if not pat or not pat.search(M.plain(etxt)): continue
                    c = M.carries(is_[key], tst)
                    n_all += 1; miss_all += (not c)
                    if key in d['common']: n_c += 1; miss_c += (not c)
            r[v] = {'prose_all': n_all, 'miss_all': miss_all, 'prose_common': n_c, 'miss_common': miss_c, 'keyterm_carries_target': key_ok}
            tot[f'{v}_prose_all'] += n_all; tot[f'{v}_miss_all'] += miss_all; tot[f'{v}_prose_common'] += n_c; tot[f'{v}_miss_common'] += miss_c
            tot[f'{v}_keyterm_wrong'] += (key_ok is False); tot[f'{v}_keyterm_missing'] += (key_ok is None)
        rows.append(r)
by_choice = collections.defaultdict(collections.Counter)
for r in rows:
    for v in ('old', 'new'):
        by_choice[r['choice']][f'{v}_miss_all'] += r[v]['miss_all']; by_choice[r['choice']][f'{v}_prose_all'] += r[v]['prose_all']
        by_choice[r['choice']][f'{v}_keyterm_wrong'] += (r[v]['keyterm_carries_target'] is False)
    by_choice[r['choice']]['terms'] += 1
print(json.dumps({'terms': len(rows), 'totals': tot, 'byChoice': by_choice}, ensure_ascii=False, indent=1))
json.dump(rows, open(os.path.join(HERE, 'verdict_work.rows.json'), 'w'), ensure_ascii=False, indent=1)
# top 12 by new-vintage misses
for r in sorted(rows, key=lambda r: -r['new']['miss_all'])[:12]:
    print(r['ch'], r['en'], '->', r['target'], r['choice'], 'new miss', r['new']['miss_all'], '/', r['new']['prose_all'], '| old miss', r['old']['miss_all'], '/', r['old']['prose_all'])
