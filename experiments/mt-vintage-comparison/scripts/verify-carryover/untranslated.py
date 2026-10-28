"""Clean carried segments whose June Icelandic is (still) English: visible(June IS) == visible(EN), or mostly English."""
import sys, os, json, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__))
D = load()
NE, NI, JI = {}, {}, {}
for p in D['new']['en']:
    NE.update(parse_first(D['new']['en'][p])[0]); NI.update(parse_first(D['new']['is'][pair_path(p)])[0]); JI.update(parse_first(D['june']['is'][pair_path(p)])[0])
rows = [json.loads(l) for l in open(os.path.join(HERE, 'my_classes_gated-newen-reuse.jsonl'))]
EN_WORDS = set('the and of to in is that for with are as be by this from or an which on at it their can when these more than also has have'.split())
def eng_share(s):
    w = re.findall(r'[A-Za-zÁÉÍÓÚÝÞÆÖáéíóúýþæöðÐ]+', s.lower())
    if len(w) < 6: return None
    return sum(1 for x in w if x in EN_WORDS) / len(w)
by = collections.Counter(); chars = collections.Counter(); ex = collections.defaultdict(list)
newc = collections.Counter(); newchars = collections.Counter()
for r in rows:
    k = r['key']; ch = r['ch']
    vNE = visible(NE[k])
    if r.get('src_ext') and r['clean']:
        vJ = visible(r['carried'], legacy=False)
        es = eng_share(vJ)
        if (vJ == vNE and re.search(r'[A-Za-z]{4,}', vJ) and len(vJ) > 30) or (es is not None and es > 0.15):
            by[ch] += 1; chars[ch] += r['en_chars']
            if len(ex[ch]) < 2: ex[ch].append((k, vJ[:90]))
    vN = visible(NI[k]); es2 = eng_share(vN)
    if (vN == vNE and re.search(r'[A-Za-z]{4,}', vN) and len(vN) > 30) or (es2 is not None and es2 > 0.15):
        newc[ch] += 1; newchars[ch] += r['en_chars']
print('clean carried June segments that look untranslated (IS==EN, or >15% English function words, >=6 words):')
print('  total segs', sum(by.values()), 'EN chars', sum(chars.values()), dict(by))
for ch, e in ex.items(): print('   ', ch, e)
print('NEW IS segments (all keys) that look untranslated:', sum(newc.values()), 'EN chars', sum(newchars.values()), dict(newc))
