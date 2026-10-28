"""Build the decided-term list: (a) 104 verdicts, (b) exact house-style rulings not in (a), (c) undecided K_old != K_new."""
import json, subprocess, sys
sys.path.insert(0, sys.argv[1])
import lib
M = lib.M
C, S = lib.load(sys.argv[2])
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
V = json.load(open(f'{REPO}/experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json'))
src = subprocess.run(['git', '-C', REPO, 'show', f"{C['new']}:server/lib/houseStyleTerms.js"], capture_output=True, text=True).stdout
js = ('const m={exports:{}};(function(module,exports){' + src + '})(m,m.exports);'
      'process.stdout.write(JSON.stringify(m.exports.HOUSE_STYLE_TERMS.map(e=>({en:e.en,is:e.is,ruled:e.ruled,why:e.why}))))')
R = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True).stdout)
ans = {(a['chapter'], a['definitionId']): a for a in V['answers']}
terms = []
for ch in C['chapters']:
    for m in C['modules'][ch]['new']:
        en_n, is_n = S[(ch, m, 'new')]; en_o, is_o = S[(ch, m, 'old')]
        for key, txt in en_n.items():
            if not key.startswith('glossary-term:'): continue
            did = key.split(':', 1)[1].rsplit('-term', 1)[0]
            t = {'chapter': ch, 'module': m, 'key': key, 'definitionId': did, 'en': M.plain(txt).strip(),
                 'enNorm': M.norm_en(txt), 'Kold': is_o.get(key), 'Knew': is_n.get(key),
                 'enOld': en_o.get(key)}
            t['changed'] = M.norm_en(t['Kold'] or '') != M.norm_en(t['Knew'] or '')
            a = ans.get((ch, did))
            if a:
                t['src'] = 'verdict'; t['target'] = a['targetIcelandic']; t['choice'] = a['interpretedChoice']
                assert a['en'] == t['en'], (a['en'], t['en'])
            else:
                hits = [r for r in R for f in r['en'] if f.lower() == t['enNorm']]
                if hits:
                    t['src'] = 'ruling'; t['target'] = hits[0]['is']; t['ruledBy'] = hits[0]['ruled']
                    t['rulingWhy'] = hits[0]['why']
                elif t['changed']:
                    t['src'] = 'undecided'; t['target'] = None
                else:
                    t['src'] = None; t['target'] = None
            terms.append(t)
from collections import Counter
print('taught terms', len(terms), Counter(t['src'] for t in terms))
missing = [k for k in ans if not any((t['chapter'], t['definitionId']) == k for t in terms)]
print('verdicts not matched to a taught term:', missing)
print('\n(b) exact rulings not in (a):')
for t in terms:
    if t['src'] == 'ruling':
        print(f"  {t['chapter']} {t['en']!r}: Kold={t['Kold']!r} Knew={t['Knew']!r} -> {t['target']!r} ({t['ruledBy']})")
print('\nrulings with an exact headword that IS in (a):')
for t in terms:
    if t['src'] == 'verdict':
        hits = [r for r in R for f in r['en'] if f.lower() == t['enNorm']]
        if hits: print(f"  {t['chapter']} {t['en']!r}: ruling={hits[0]['is']!r} verdict target={t['target']!r} choice={t['choice']}")
dup = Counter((t['chapter'], t['enNorm']) for t in terms)
print('\nsame headword twice in one chapter:', [k for k, v in dup.items() if v > 1])
json.dump({'terms': terms, 'rulings': R}, open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
