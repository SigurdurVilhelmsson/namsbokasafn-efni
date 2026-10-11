# Read-only. Which verdict targets / house-style words exist as BÍN LEMMAS (SHsnid field 0)?
# Streams the 377 MB CSV once; keeps only membership of our own candidate words (no BÍN data saved).
import json, re, subprocess, os, sys, collections
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
V = json.load(open(f'{REPO}/experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json'))['answers']
js = ('const m={exports:{}};(function(module,exports){' + open(f'{REPO}/server/lib/houseStyleTerms.js').read() +
      '})(m,m.exports);process.stdout.write(JSON.stringify(m.exports.HOUSE_STYLE_TERMS.map(e=>e.is)))')
H = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True).stdout)
def clean(t): return re.sub(r'\s*\([^)]*\)', '', t).strip()
targets = [clean(a['targetIcelandic']) for a in V]
words = set()
for t in targets + [clean(h) for h in H]:
    for w in re.split(r'[\s]+', t):
        if w: words.add(w.lower())
found = set(); forms_found = set()
with open(f'{REPO}/tools/data/SHsnid.csv', encoding='utf-8', errors='replace') as f:
    for line in f:
        p = line.split(';', 5)
        if len(p) < 6: continue
        l = p[0].lower()
        if l in words: found.add(l)
        fm = p[4].lower()
        if fm in words: forms_found.add(fm)
def reach(lst):
    single = [t for t in lst if ' ' not in t]
    multi = [t for t in lst if ' ' in t]
    s_lemma = [t for t in single if t.lower() in found]
    s_formonly = [t for t in single if t.lower() not in found and t.lower() in forms_found]
    s_none = [t for t in single if t.lower() not in found and t.lower() not in forms_found]
    m_allwords = [t for t in multi if all(w.lower() in found or w.lower() in forms_found for w in t.split())]
    return {'total': len(lst), 'singleWord': len(single), 'single_isBinLemma': len(s_lemma), 'single_onlyAsForm': len(s_formonly),
            'single_absent': len(s_none), 'single_absent_examples': s_none[:25], 'multiWord': len(multi),
            'multi_everyWordInBin': len(m_allwords), 'multi_examples_notAll': [t for t in multi if t not in m_allwords][:15]}
print(json.dumps({'verdictTargets': reach(targets), 'houseStyle': reach([clean(h) for h in H])}, ensure_ascii=False, indent=1))
