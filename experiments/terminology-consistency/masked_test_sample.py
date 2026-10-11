#!/usr/bin/env python3
"""Draw the masked blind reading test's pairs (plan 2026-10-10 rev. 5, Stage 1, step 1.7).

The question: does the June MT read clearly better than the September MT, when terminology
cannot decide? (Plan §1 point 3: switch to the hybrid only on a clear June win; D1.)

POPULATION. The frozen carry-over instrument decides which pairs exist; this script never
re-implements its English-equality test (an asymmetric normaliser invents differences):
  1. copy experiments/mt-vintage-comparison/scripts/carryover/*.py and its handrepair_keys.json
     into a scratch directory and run `extract.py` then `classify.py` there (read-only git);
  2. pass that directory's classification.jsonl + raw/ to this script (--carry DIR).
Kept: class `1-same-key-same-en` (same key, same visible English at both refs), conversion
`clean`, not a table cell (`entry`), not a `glossary-term` (a key-terms headword IS a term), no
`HAND REPAIR` on the key, both sides translated, and the two displayed Icelandic texts differ.
June's side is the classifier's `carried_is`, already converted to September's marker dialect,
so marker syntax cannot tell the vintages apart. Both sides and the English go through ONE
display function.

MASKING BY SELECTION. A pair is dropped if the two texts make a different TERM CHOICE: some
term word is present in one text and absent from the other. Presence, over the whole text, not
"a differing word contains a term": two rewordings that both say `sameind` in different
inflections are not a term difference (that predicate was tried first and dropped 89% of pairs
on roots like `eind` and words like `með`).
Term words: per English headword, every Icelandic form it has been given (sources below); the
words NOT shared by all its forms (a headword with one form gives all its words), minus a short
list of function words. Each word becomes a pattern (see pattern()):
  - 6+ letters: the word less its last 2 letters, anywhere in a token (`frumeind` -> `frumei`,
    so `vetnisfrumeindir` matches);
  - 4-5 letters: the whole word, anywhere in a token (`atóm` catches `vetnisatóm`);
  - 3 letters: a token START with at most 3 more letters (`ker`, `kerið`; not `merki`).
  Patterns and tokens are both folded ö -> a (fold()), so `efnablanda` takes `efnablöndu`.
  A 3-letter word inside a compound (`...ker`) and other stem changes (i-umlaut) are not caught;
  an in-script assertion (no June-frumeind / September-atóm pair survives) and the per-pair
  September guess are the checks on what leaks.
Term sources (every Icelandic word on either side of every decided or contested term):
  - ruling-set-after-stage1.json: `before` rulings (is, competitor), stage 1 (is, pageWord,
    stored, storedAlternatives, storedTied);
  - verdicts-2026-10-10.json: julyEntry, newEntry, targetIcelandic;
  - undecided-217.json: Kold, Knew;
  - classified-common.json: every key-terms headword's July and September entry (K old/new),
    changed or not: the MT text drifts on a term whose entry stayed the same (TEXT-DRIFT), and a
    pair where one side uses the entry and the other does not is a term choice;
  - the three wrong-sense rows of 1.5 (álagning, girðitala, útblástur): a June fingerprint
    that 1.5 fixes whichever base wins, so terminology does not decide the base (plan §1.2).
Residual leakage (vintage fingerprints that are not terms) is caught by the per-pair
"which was September?" question; see masked_test_analyse.py.

SAMPLE. N pairs, seed fixed. Allocation to chapters is proportional to the eligible population
(largest remainder). Within a chapter, pairs are sorted by (type group, English length) and taken
by a systematic sample with a random start, so type and length are spread in proportion too.
A/B order is drawn per pair from the same seed.

OUTPUTS (into --out DIR):
  masked-test-pairs.json  what the page shows: pair_id, chapter, English, A, B. NO vintage.
  masked-test-key.json    pair_id -> which side is June. Do not show it to the reader until the
                          answers are frozen. Its sha256 is printed and stored in the pairs file,
                          so the key cannot be redrawn after the answers are seen.
  masked-test-census.json the funnel, every exclusion count, the top stems by pairs excluded,
                          the per-chapter/type/length allocation.

Usage:
  python3 experiments/terminology-consistency/masked_test_sample.py --carry DIR --out DIR [--n 150] [--seed S]
"""
import argparse, collections, hashlib, json, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, 'results')
RULINGS = os.path.join(RES, '2026-10-11', 'ruling-set-after-stage1.json')
VERDICTS = os.path.join(RES, '2026-10-10', 'verdicts-2026-10-10.json')
UNDECIDED = os.path.join(RES, '2026-10-11', 'undecided-217.json')
CLASSIFIED = os.path.join(RES, '2026-10-10', 'classified-common.json')
WRONG_SENSE = ['álagning', 'girðitala', 'útblástur']
SEED = 20261011

TYPE_GROUP = {
    'para': 'para', 'problem': 'exercise', 'solution': 'exercise', 'caption': 'caption',
    'glossary-def': 'definition', 'item': 'list', 'abstract-item': 'list', 'abstract': 'list',
    'title': 'heading', 'para-title': 'heading', 'note-title': 'heading', 'example-title': 'heading',
}


def display(s):
    """What a reader sees, as plain text. Applied identically to English, June and September."""
    s = s or ''
    s = re.sub(r'\[\[MATH:[^\]]*\]\]', '[formula]', s)
    s = re.sub(r'\[\[(?:MEDIA|TABLE)[^\]]*\]\]', '[figure]', s)
    s = re.sub(r'\[\[BR\]\]', ' ', s)
    s = re.sub(r'\[\[(?:xref|docref):[^\[\]|]*\]\]', '[ref]', s)  # label-less: the reader sees a number
    for _ in range(4):  # nested markers, innermost first; a footnote is dropped once it is flat
        s = re.sub(r'\[\[fn:[^\[\]]*\]\]', '', s)
        s = re.sub(r'\[\[(?!fn:)[a-zA-Z-]+:([^\[\]|]*)\|([^\[\]]*)\]\]', r'\2', s)
        s = re.sub(r'\[\[(?!fn:)[a-zA-Z-]+:([^\[\]]*)\]\]', r'\1', s)
    s = re.sub(r'\{\{/?[a-z]+\}\}', '', s)
    return re.sub(r'\s+', ' ', s).strip()


WORD = re.compile(r'[^\W\d_]+', re.UNICODE)


def norm_en(en):
    return re.sub(r'\s+', ' ', re.sub(r'\s*\([^)]*\)', '', display(en or ''))).strip().lower()


def term_forms():
    """English headword -> every Icelandic form it has been given by a ruling, a verdict, a
    competitor, or a key-terms entry that changed between July and September."""
    forms = collections.defaultdict(set)

    def add(en, text):
        t = display(text or '').strip().lower()
        if t:
            forms[norm_en(en)].add(t)

    for r in json.load(open(RULINGS.replace('after', 'before')))['rulings']:
        add(r['en'], r.get('is')); add(r['en'], r.get('competitor'))
    for r in json.load(open(RULINGS))['stage1']:
        for f in ('is', 'pageWord', 'stored'):
            add(r['en'], r.get(f))
        for f in ('storedAlternatives', 'storedTied'):
            for x in r.get(f) or []:
                add(r['en'], x if isinstance(x, str) else (x.get('text') or x.get('is')))
    for a in json.load(open(VERDICTS))['answers']:
        for f in ('julyEntry', 'newEntry', 'targetIcelandic', 'houseStyleRuling'):
            add(a['en'], a.get(f))
    for u in json.load(open(UNDECIDED))['undecided']:
        add(u['en'], u.get('Kold')); add(u['en'], u.get('Knew'))
    for ch in json.load(open(CLASSIFIED))['chapters']:
        for t in ch['terms']:
            add(t['en'], t['K'].get('old')); add(t['en'], t['K'].get('new'))
    for en, w in (('addition', 'álagning'), ('valence', 'girðitala'), ('emission', 'útblástur')):
        add(en, w)
    return forms


# Function words that appear in multi-word term forms (`stig á Celsíus`) but are not a term
# choice. Their presence differs between any two rewordings, so they are not term evidence.
FUNCTION_WORDS = {
    'með', 'fyrir', 'við', 'frá', 'til', 'um', 'sem', 'eða', 'og', 'hver', 'hvert', 'hvers', 'hverju',
    'hvern', 'sinn', 'sína', 'sitt', 'þess', 'þeirra', 'það', 'þar', 'hjá', 'undir', 'yfir', 'milli',
    'eftir', 'gegn', 'úr', 'að', 'af', 'en', 'ekki', 'hinn', 'hin', 'hið', 'einn', 'ein', 'eitt',
}


def distinctive_words(forms):
    """Per headword, the words that are NOT in every one of its forms: the words a choice between
    the forms changes. A headword with one form contributes all its words (no competitor known)."""
    out = collections.defaultdict(set)  # word -> headwords
    for en, fs in forms.items():
        sets = [{w for w in WORD.findall(f) if len(w) >= 3} for f in fs]
        common = set.intersection(*sets) if len(sets) > 1 else set()
        for w in set.union(*sets) - common - FUNCTION_WORDS:
            out[w].add(en)
    return out


def fold(t):
    """u-umlaut and its kin change a stem vowel mid-word (blanda -> blöndu, hvarf -> hvörf), which
    a cut-off stem cannot follow. Folded on BOTH sides, pattern and token alike."""
    return t.lower().replace('ö', 'a')


def pattern(w):
    """(kind, text) for one term word. kind: 'sub' = anywhere in a token, 'start' = token start
    with at most 3 more letters."""
    w = fold(w)
    if len(w) >= 6:
        return ('sub', w[:len(w) - 2])  # frumeind -> frumei: frumeindir, vetnisfrumeind
    if len(w) >= 4:
        return ('sub', w)               # atóm: vetnisatóm, atómi; hvarf no longer takes hvar
    return ('start', w)                 # ker: kerið, kerin; not merki


def matches(p, token):
    t = fold(token)
    return p[1] in t if p[0] == 'sub' else (t.startswith(p[1]) and len(t) <= len(p[1]) + 3)


def present(text, pats):
    """The term patterns a text carries, anywhere (presence, not count)."""
    toks = set(WORD.findall(text))
    return {p for p in pats if any(matches(p, t) for t in toks)}


def load_segmap(carry, tag, chdir, mod):
    sys.path.insert(0, carry)
    from segparse import parse, key_of  # the frozen instrument's parser
    p = os.path.join(carry, 'raw', tag, chdir, mod + '.md')
    d = {}
    if os.path.exists(p):
        for s, t in parse(open(p, encoding='utf-8').read()):
            d.setdefault(key_of(s), t)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--carry', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--n', type=int, default=150)
    ap.add_argument('--seed', type=int, default=SEED)
    a = ap.parse_args()

    forms = term_forms()
    tw = distinctive_words(forms)
    pats = sorted({pattern(w) for w in tw})

    rows = [json.loads(l) for l in open(os.path.join(a.carry, 'classification.jsonl'))]
    funnel = collections.OrderedDict(classifier_rows=len(rows))
    cache = {}
    elig, excluded_by_stem, stem_count, seen = [], 0, collections.Counter(), set()
    drop = collections.Counter()
    for r in rows:
        if not r['class'].startswith('1'):
            drop['not class 1 (same key, same English)'] += 1; continue
        if r['type'] == 'entry':
            drop['table cell'] += 1; continue
        if r['type'] == 'glossary-term':
            drop['glossary-term (the headword itself)'] += 1; continue
        if r.get('hand_repair'):
            drop['HAND REPAIR key'] += 1; continue
        if r.get('conv_status') != 'clean':
            drop['June conversion not clean'] += 1; continue
        k = (r['chdir'], r['module'])
        if k not in cache:
            cache[k] = (load_segmap(a.carry, 'new_en', *k), load_segmap(a.carry, 'new_is', *k))
        en_raw, sept_raw = cache[k][0].get(r['key']), cache[k][1].get(r['key'])
        if sept_raw is None or r.get('carried_is') is None:
            drop['a side missing'] += 1; continue
        en, june, sept = display(en_raw), display(r['carried_is']), display(sept_raw)
        if june == sept:
            drop['identical as displayed'] += 1; continue
        if june.lower() == en.lower() or sept.lower() == en.lower():
            drop['a side untranslated'] += 1; continue
        if not WORD.search(en):
            drop['no words in English'] += 1; continue
        hits = {p[1] for p in present(june, pats) ^ present(sept, pats)}
        if hits:
            excluded_by_stem += 1
            stem_count.update(hits)
            continue
        trip = (en, june, sept)
        if trip in seen:
            drop['duplicate of an eligible pair (same English and both texts)'] += 1; continue
        seen.add(trip)
        elig.append({'chapter': r['chdir'], 'module': r['module'], 'key': r['key'], 'type': r['type'],
                     'group': TYPE_GROUP.get(r['type'], 'other'), 'en': en, 'june': june, 'sept': sept})
    # Control (plan rev. 1 review): the June frumeind / September atóm contrast must not survive.
    leak = [e for e in elig if 'frumeind' in e['june'].lower() and 'atóm' in e['sept'].lower()]
    assert not leak, f'masking leaks the frumeind/atóm contrast in {len(leak)} pairs'
    differing = len(elig) + excluded_by_stem
    funnel['dropped'] = dict(drop)
    funnel['differing_as_displayed'] = differing
    funnel['excluded_term_in_difference'] = excluded_by_stem
    funnel['eligible'] = len(elig)

    # length tertiles over the eligible population (English characters as displayed)
    lens = sorted(len(e['en']) for e in elig)
    t1, t2 = lens[len(lens) // 3], lens[2 * len(lens) // 3]
    for e in elig:
        L = len(e['en'])
        e['length'] = 'short' if L < t1 else ('medium' if L < t2 else 'long')

    rng = random.Random(a.seed)
    bych = collections.defaultdict(list)
    for e in elig:
        bych[e['chapter']].append(e)
    quota = {c: a.n * len(v) / len(elig) for c, v in bych.items()}
    alloc = {c: int(q) for c, q in quota.items()}
    for c in sorted(quota, key=lambda c: (-(quota[c] - alloc[c]), c))[:a.n - sum(alloc.values())]:
        alloc[c] += 1
    order_len = {'short': 0, 'medium': 1, 'long': 2}
    picked = []
    for c in sorted(bych):
        v = sorted(bych[c], key=lambda e: (e['group'], order_len[e['length']], len(e['en']), e['module'], e['key']))
        m = alloc[c]
        if not m:
            continue
        step = len(v) / m
        start = rng.random() * step
        picked += [v[int(start + i * step)] for i in range(m)]
    rng.shuffle(picked)

    pairs, key = [], {}
    for i, e in enumerate(picked, 1):
        pid = f'p{i:03d}'
        june_is_a = rng.random() < 0.5
        pairs.append({'pair_id': pid, 'chapter': e['chapter'], 'group': e['group'], 'length': e['length'],
                      'en': e['en'], 'A': e['june'] if june_is_a else e['sept'],
                      'B': e['sept'] if june_is_a else e['june']})
        key[pid] = {'june': 'A' if june_is_a else 'B', 'module': e['module'], 'key': e['key'], 'type': e['type']}

    os.makedirs(a.out, exist_ok=True)
    key_doc = {'about': 'Masked test key: which side of each pair is the June MT. Written by masked_test_sample.py. '
                        'Not shown to the reader until the answers are frozen.',
               'seed': a.seed, 'key': key}
    key_bytes = json.dumps(key_doc, ensure_ascii=False, indent=1, sort_keys=True).encode()
    key_sha = hashlib.sha256(key_bytes).hexdigest()
    open(os.path.join(a.out, 'masked-test-key.json'), 'wb').write(key_bytes)

    census = {
        'about': 'Funnel and allocation behind masked-test-pairs.json (plan step 1.7).',
        'seed': a.seed, 'n': a.n, 'funnel': funnel,
        'headwords': len(forms), 'distinctiveWords': len(tw),
        'patterns': dict(collections.Counter(p[0] for p in pats)),
        'topStemsByPairsExcluded': stem_count.most_common(25),
        'lengthTertileCuts': [t1, t2],
        'eligibleByChapter': {c: len(v) for c, v in sorted(bych.items())},
        'allocationByChapter': dict(sorted(alloc.items())),
        'eligibleByGroup': dict(collections.Counter(e['group'] for e in elig)),
        'sampleByGroup': dict(collections.Counter(e['group'] for e in picked)),
        'eligibleByLength': dict(collections.Counter(e['length'] for e in elig)),
        'sampleByLength': dict(collections.Counter(e['length'] for e in picked)),
        'juneIsA': sum(1 for v in key.values() if v['june'] == 'A'),
    }
    json.dump(census, open(os.path.join(a.out, 'masked-test-census.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump({'about': 'The masked blind reading test (plan step 1.7). English shown, two Icelandic versions in '
                        'random order. Which is June and which September is in masked-test-key.json, '
                        'committed only after the answers are frozen; its sha256 is below.',
               'seed': a.seed, 'keySha256': key_sha, 'pairs': pairs},
              open(os.path.join(a.out, 'masked-test-pairs.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: census[k] for k in ('funnel', 'patterns', 'allocationByChapter', 'sampleByGroup', 'sampleByLength', 'juneIsA')}, ensure_ascii=False))
    print('top stems:', census['topStemsByPairsExcluded'][:15])
    print('key sha256:', key_sha)


if __name__ == '__main__':
    main()
