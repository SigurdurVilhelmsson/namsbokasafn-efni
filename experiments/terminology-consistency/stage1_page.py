#!/usr/bin/env python3
"""Build the stage 1 page (plan 2026-10-10 rev. 5, Stage 1): one review page that closes the
chemistry term-ruling set, answers saved as [USER] goes.

This first version carries 1.1 (decided, shown), 1.3 (the 68 gained terms), 1.4 (the 217
unruled headwords), the three definite rows of 1.5, 1.7 (the masked reading test: pairs from
masked_test_sample.py, rule and arithmetic from masked_test_analyse.py), 1.8, and (2026-10-17)
1.6's ten clean pending edits (freeze_pending_edits.py). 1.5's AI pre-screen comes later.

Inputs (all paths fixed below, so a re-run is the same command):
  - the cached burden run's undecided set, base `new` (the September text). It is the
    instrument behind the plan's "217 headwords / 64 with under 3 occurrences", re-run
    2026-10-11 and reproduced exactly. Its per-headword fields are copied into
    results/2026-10-11/undecided-217.json, so the page rebuilds from the repo;
  - results/2026-10-10/classified-common.json: examples, bold definitions, and the gained set;
  - results/2026-10-11/ruling-set-before-stage1.json (compile_ruling_set.py): what is decided;
  - the September segment files at HEAD, for 1.5's examples.

Buckets for 1.4, assigned in this order so each headword lands in exactly one:
  1. decided elsewhere: its English (parenthetical stripped, lower-cased) has a target in the
     ruling set. Under D2 (book-wide by default) that ruling applies here unless [USER]
     marks this chapter an exception;
  2. spelling-only: the two key-terms entries differ only in case, hyphens, spaces, inline
     markup or a trailing definite article. This is stricter than the plan's "22" (an
     agent's count with no script behind it): a looser rule (edit distance) also swept in real
     word choices (ofurgild/ofgild, tengjaorka/tengisorka, álagningarhvarf/áleggingarhvarf);
  3. low text: under 3 prose segments in the September text (the plan's 64);
  4. gained: in classified-common's gained set (the September text agrees with its own entry
     at >= 80% and the July text did not). These go to 1.3 with "keep" as the default;
  5. everything else: a card.
Buckets 2 and 3 take the BOOK-WIDE MAJORITY (D3): summed over every chapter where the same
headword is unruled, the entry more prose segments carry alone; a tie goes to the September
entry (D1: September is the base).

Usage: python3 experiments/terminology-consistency/stage1_page.py <out.html>
"""
import glob, importlib.util, json, os, re, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
BURDEN = os.path.expanduser('~/.cache/namsbokasafn-audit/2026-10-10-plan-facts/burden/burden.json')
UNDECIDED = os.path.join(HERE, 'results', '2026-10-11', 'undecided-217.json')
CLASSIFIED = os.path.join(HERE, 'results', '2026-10-10', 'classified-common.json')
RULINGS = os.path.join(HERE, 'results', '2026-10-11', 'ruling-set-before-stage1.json')
READING = os.path.join(HERE, 'results', '2026-10-11', 'masked-test-pairs.json')
READING_CENSUS = os.path.join(HERE, 'results', '2026-10-11', 'masked-test-census.json')
PENDING = os.path.join(HERE, 'results', '2026-10-17', 'pending-edits-2026-10-17.json')  # freeze_pending_edits.py
BOOK = os.path.join(REPO, 'books', 'efnafraedi-2e')
LOW_N = 3
ARTICLE = ('ið', 'inn', 'in', 'ins', 'inu', 'inni', 'innar', 'num', 'nir', 'nar', 'na', 'nn', 'ns', 'nu', 'nni', 'ð', 'n')

_spec = importlib.util.spec_from_file_location('measure', os.path.join(HERE, 'measure.py'))
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)
_spec = importlib.util.spec_from_file_location('analyse', os.path.join(HERE, 'masked_test_analyse.py'))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)  # the reading test's rule: the page shows the analyser's own arithmetic

# 1.5: the three wrong-sense rows the plan names. Counts are the 2026-10-10 verifier's FLOORS in
# the June text (experiments/mt-vintage-comparison/README.md §2); none were censused in September.
WRONG_SENSE = [
    {'id': 'ws_addition', 'en': 'addition', 'row': 'álagning', 'meaning': 'a levy or surcharge',
     'floor': '66 segments in the reusable June text', 'pattern': r'\baddition\b', 'stem': 'álagn'},
    {'id': 'ws_valence', 'en': 'valence', 'row': 'girðitala', 'meaning': 'coordination number',
     'floor': '11 segments (girðit-) in the reusable June text', 'pattern': r'\bvalence\b', 'stem': 'girðit'},
    {'id': 'ws_emission', 'en': 'emission', 'row': 'útblástur', 'meaning': 'exhaust',
     'floor': '25 segments in the reusable June text (26 of 27 book-wide), spectral and nuclear senses', 'pattern': r'\bemission\b', 'stem': 'útblást'},
]


def clean(s):
    # A formula placeholder has no visible text; shown bare, [[MATH:56]] read as a number "(56)".
    s = re.sub(r'\[\[MATH:[^\]]*\]\]', '[formula]', s or '')
    s = re.sub(r'\[\[(?:sub|sup):([^\]|]*)\]\]', r'\1', s)
    s = re.sub(r'\[\[[a-zA-Z]+:([^\]|]*)(?:\|[^\]]*)?\]\]', r'\1', s)
    return re.sub(r'\{\{/?[a-z]+\}\}', '', s).replace('^', '').strip()


def en_display(u):
    """The English headword as shown. The burden run's English carries a formula as its bare
    placeholder number (`standard electrode potential (56)`); the September entry still holds the
    marker (`[[MATH:56]]`), so that number is shown as [formula]. Display only: no key uses it."""
    en = clean(u['en'])
    for n in re.findall(r'\[\[MATH:(\d+)\]\]', u.get('Knew') or ''):
        en = re.sub(r'(?<![\w.])' + n + r'(?![\w.])', '[formula]', en)
    return en


def norm_en(en):
    return re.sub(r'\s+', ' ', re.sub(r'\s*\([^)]*\)', '', en or '')).strip().lower()


def spell_key(s):
    return re.sub(r'[\s\-‐–]', '', clean(s).lower())


def spelling_only(a, b):
    a, b = spell_key(a), spell_key(b)
    if a == b:
        return True
    lo, hi = sorted((a, b), key=len)
    return len(lo) >= 4 and hi.startswith(lo) and hi[len(lo):] in ARTICLE


def write_undecided():
    """Copy the instrument's per-headword fields into the repo (no grant data in them)."""
    B = json.load(open(BURDEN, encoding='utf-8'))
    keep = ('chapter', 'definitionId', 'en', 'Kold', 'Knew', 'prose', 'old', 'new', 'both', 'neither')
    U = [{k: u.get(k, 0 if k in ('prose', 'old', 'new', 'both', 'neither') else None) for k in keep}
         for u in B['undecided'] if u['base'] == 'new']
    json.dump({'about': ('The 217 unruled chemistry headwords (key-terms entry changed between July and September, '
                         'no review-page verdict, no exact house-style ruling), base = the September text. Copied '
                         '2026-10-11 from the plan-facts burden run (off-repo, ~/.cache/namsbokasafn-audit/'
                         '2026-10-10-plan-facts/burden/burden.json, `undecided` where base == "new"); re-running its '
                         'undecided.py printed 217 headwords, 64 with prose < 3. Counts are prose segments whose '
                         'Icelandic carries the July entry only (old), the September entry only (new), both, or neither.'),
               'count': len(U), 'undecided': U}, open(UNDECIDED, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)


def september_census(pattern, stem, n=3):
    """Segments whose English uses the word, and how many of their Icelandic carry the row's stem.

    A census of the September text, which the 2026-10-10 investigation did not do. The stem test
    is a substring match, so it over-counts (any word containing the stem) and cannot see a wrong
    sense rendered some other way; examples are shown for both halves so the reading is checkable.
    """
    rx = re.compile(pattern, re.I)
    hit, miss = [], []
    for en_path in sorted(glob.glob(os.path.join(BOOK, '02-for-mt', 'ch*', 'm*-segments.en.md'))):
        is_path = en_path.replace('02-for-mt', '02-mt-output').replace('.en.md', '.is.md')
        if not os.path.exists(is_path):
            continue
        en = M.parse_segments(open(en_path, encoding='utf-8').read())
        is_ = M.parse_segments(open(is_path, encoding='utf-8').read())
        for k, v in en.items():
            if k in is_ and rx.search(clean(v)):
                row = {'ch': en_path.split(os.sep)[-2], 'en': clean(v)[:420], 'is': clean(is_[k])[:420]}
                (hit if stem in clean(is_[k]).lower() else miss).append(row)
    pick = lambda xs: xs[::max(1, len(xs) // n)][:n]
    return {'sepTotal': len(hit) + len(miss), 'sepRow': len(hit), 'exRow': pick(hit), 'exOther': pick(miss)}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    if os.path.exists(BURDEN):
        write_undecided()
    U = json.load(open(UNDECIDED, encoding='utf-8'))['undecided']
    R = json.load(open(RULINGS, encoding='utf-8'))
    C = json.load(open(CLASSIFIED, encoding='utf-8'))
    th = C['thresholds']
    ruled = {}
    for r in R['rulings']:
        if r['is']:
            ruled.setdefault(r['enNorm'], r)

    cls = {}
    gained = set()
    for c in C['chapters']:
        for t in c['terms']:
            key = (c['chapter'], t['definitionId'])
            cls[key] = t
            o, n = t['old'], t['new']
            if o['prose'] >= th['MIN_N'] and n['prose'] >= th['MIN_N'] \
                    and n['own'] / n['prose'] >= th['RULED'] and o['own'] / o['prose'] < th['RULED']:
                gained.add(key)

    # Book-wide majority per English headword, over every chapter where it is unruled.
    tally = defaultdict(lambda: defaultdict(int))
    for u in U:
        tally[norm_en(u['en'])][('old', clean(u['Kold']))] += u['old']
        tally[norm_en(u['en'])][('new', clean(u['Knew']))] += u['new']

    def majority(u):
        t = tally[norm_en(u['en'])]
        o, n = t[('old', clean(u['Kold']))], t[('new', clean(u['Knew']))]
        return ('july', o, n) if o > n else ('new', o, n)

    def ex(t, side):
        return [{'en': clean(m['en'])[:240], 'is': clean(m['is'])[:240]} for m in t[side]['misses'][:2]] if t else []

    items = []
    for u in U:
        key = (u['chapter'], u['definitionId'])
        t = cls.get(key)
        n = norm_en(u['en'])
        if n in ruled:
            bucket = 'elsewhere'
        elif spelling_only(u['Kold'], u['Knew']):
            bucket = 'spelling'
        elif u['prose'] < LOW_N:
            bucket = 'lown'
        elif key in gained:
            bucket = 'gained'
        else:
            bucket = 'card'
        maj, mo, mn = majority(u)
        r = ruled.get(n)
        items.append({
            'id': f"{u['chapter']}_{u['definitionId']}", 'ch': u['chapter'], 'en': en_display(u),
            'Kold': clean(u['Kold']), 'Knew': clean(u['Knew']), 'bucket': bucket,
            'pr': u['prose'], 'o': u['old'], 'n': u['new'], 'b': u['both'], 'x': u['neither'],
            'maj': maj, 'majO': mo, 'majN': mn,
            'ruledIs': r['is'] if r else None, 'ruledKind': r['kind'] if r else None,
            'ruledIn': r.get('ruledIn') if r else None,
            'po': [t['old']['own'], t['old']['prose']] if t else None,
            'pn': [t['new']['own'], t['new']['prose']] if t else None,
            'dOld': [clean(k) for k in t['old']['defSites']] if t else [],
            'dNew': [clean(k) for k in t['new']['defSites']] if t else [],
            'exOld': ex(t, 'old'), 'exNew': ex(t, 'new')})

    ukeys = {(u['chapter'], u['definitionId']) for u in U}
    same_word_gained = []
    for c in C['chapters']:
        for t in c['terms']:
            key = (c['chapter'], t['definitionId'])
            if key in gained and key not in ukeys:
                same_word_gained.append({
                    'id': f"{c['chapter']}_{t['definitionId']}", 'ch': c['chapter'], 'en': clean(t['en']),
                    'Kold': clean(t['K']['old']), 'Knew': clean(t['K']['new']), 'bucket': 'gained-same',
                    'po': [t['old']['own'], t['old']['prose']], 'pn': [t['new']['own'], t['new']['prose']],
                    'changed': bool(t['renderingChanged']), 'cls': t['class'],
                    'ruledIs': ruled[norm_en(t['en'])]['is'] if norm_en(t['en']) in ruled else None})

    ws = []
    for w in WRONG_SENSE:
        ws.append({**{k: v for k, v in w.items() if k not in ('pattern', 'stem')}, 'stem': w['stem'],
                   **september_census(w['pattern'], w['stem'])})

    # 1.7: the pre-registered pairs (masked_test_sample.py). No vintage is in this file.
    RP, RC = json.load(open(READING)), json.load(open(READING_CENSUS))
    reading = {'pairs': [{'id': p['pair_id'], 'ch': p['chapter'], 'en': p['en'], 'A': p['A'], 'B': p['B']}
                         for p in RP['pairs']],
               'keySha': RP['keySha256'][:12], 'eligible': RC['funnel']['eligible'],
               'differing': RC['funnel']['differing_as_displayed'],
               'excluded': RC['funnel']['excluded_term_in_difference'],
               'minWins': [[n, A.min_wins(n)] for n in (40, 60, 80, 100, 120, 150)]}

    # 1.6: prod's pending edits (freeze_pending_edits.py; editor names already removed). Only the
    # 'clean' rows are asked: [USER] ruled 2026-10-17 that the base-changed ones become editor notes.
    PE = json.load(open(PENDING))
    pending = {'byClass': PE['byClass'], 'readAt': PE['readAt'][:10],
               'rows': [{'id': f"e{r['id']}", 'ch': r['chapter'], 'module': r['module'], 'segment': r['segment'],
                         'created': r['created'][:10], 'editor': r['editor'], 'note': r['editorNote'],
                         'en': clean(r['en']), 'before': clean(r['currentMt']), 'after': clean(r['edited'])}
                        for r in PE['rows'] if r['class'] == 'clean']}

    counts = defaultdict(int)
    for it in items:
        counts[it['bucket']] += 1
    data = {
        'rulingSet': {'head': R['repoHead'][:9], 'counts': R['counts'], 'headwords': R['headwordsWithTarget'],
                      'conflicts': len(R['conflicts'])},
        'd4': [{'en': r['en'], 'is': r['is'], 'competitor': r['competitor'], 'frozen': r.get('frozenTarget'),
                'why': r.get('override')} for r in R['rulings'] if r.get('override')],
        'items': items, 'gainedSame': same_word_gained, 'wrongSense': ws, 'reading': reading, 'pending': pending,
        'counts': dict(counts), 'gainedTotal': len(gained),
        'gainedElsewhere': sum(1 for it in items if (it['ch'], it['id'].split('_', 1)[1]) in gained and it['bucket'] != 'gained'), 'total': len(items), 'lowN': sum(u['prose'] < LOW_N for u in U),
        'chapters': sorted({it['ch'] for it in items} | {g['ch'] for g in same_word_gained}),
    }
    tpl = open(os.path.join(HERE, 'stage1_page.template.html'), encoding='utf-8').read()
    payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    open(sys.argv[1], 'w', encoding='utf-8').write(tpl.replace('/*__DATA__*/null', payload))
    print(f"{len(items)} unruled headwords: {dict(counts)}; low-text (<{LOW_N}) {data['lowN']}; "
          f"gained, same word {len(same_word_gained)}; wrong-sense rows {len(ws)} "
          f"(September segments, carrying the row stem: {[(w['sepTotal'], w['sepRow']) for w in ws]}) -> {sys.argv[1]}")


if __name__ == '__main__':
    main()
