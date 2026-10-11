#!/usr/bin/env python3
"""Freeze [USER]'s stage 1 page answers into one dated, citable file (plan 2026-10-10 rev. 5, Stage 1).

The page (https://claude.ai/artifact/DgVvKPCVcWMaHsM9NVtF3w) keeps its answers in its own database,
which is not durable enough to cite. This script reads a dump of that database plus the page's
embedded DATA, and writes what was answered, what stood as a default, what is still open, and
three checks a ruling needs before it is applied:

  1. ANSWERS: one row per saved answer (collection `stage1_terms`), every field as saved, plus
     `target`: the word chosen (July entry, September entry, or the typed one); `null` for
     "either is fine", which records that the choice is inflection, not a word.
  2. NOT REVIEWED: the Defaults and Gained tabs' rows with no saved answer, with the page's own
     proposed word (`defaultWord` in stage1_page.template.html). The page said a default needs no
     action unless [USER] disagrees, but an empty row cannot tell "seen and accepted" from "not
     seen" ([USER], 2026-10-11: only the first tab was gone through). So these are PROPOSALS,
     labelled `not-reviewed`, and are never treated as answers, until [USER] presses the tab's
     "Confirm this list" (stage1_meta/confirm_defaults, confirm_gained); then `confirmed`.
  3. OPEN: wrong-sense rows with no answer, and the publication rule if `stage1_meta/criterion`
     is empty.

Checks (reported, never resolved here):
  - `containsRuled`: an answered or default headword that CONTAINS a headword already ruled
    (whole words, after stripping parentheticals), with the ruled target and whether that target
    occurs in the chosen word as a substring. A substring hit is not proof of agreement: `hol`
    is a substring of `ferflötungshola`, which is another lemma. A human reads this list.
  - `sameHeadwordTwoTargets`: one English headword answered in two chapters with two targets.
  - `containsAnswered`: the same containment test as `containsRuled`, but between the page's own
    answers and confirmed rows (including the wrong-sense rows), which `containsRuled` cannot see
    because neither side is ruled yet: `electrode potential -> troðspenna` inside `standard
    electrode potential -> staðalraftroðsspenna` is the shape. Reported where the shorter
    headword's word is not a substring of the longer one's.
  - `septemberCounts`: how often the chosen word occurs, as written (lower-cased), in the
    September text (books/efnafraedi-2e/02-mt-output) of its own chapter and book-wide. This is
    CLAUDE.md's unprompted control: 0 means the MT never produced that form unprompted. It
    counts the citation form only, so inflected uses are not counted and a 0 is a floor.

Usage:
  python3 experiments/terminology-consistency/export_stage1_answers.py <dump-dir> <page.html> <versions.json> <out.json>
<dump-dir> is an ArtifactData `out_dir` holding stage1_terms/*.json (and stage1_meta/*.json if any);
<versions.json> maps doc id -> the version the listing reported (the dump files do not carry it).
"""
import glob, hashlib, json, os, re, subprocess, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
RULINGS = os.path.join(HERE, 'results', '2026-10-11', 'ruling-set-before-stage1.json')
MT = os.path.join(REPO, 'books', 'efnafraedi-2e', '02-mt-output')
PAGE_URL = 'https://claude.ai/artifact/DgVvKPCVcWMaHsM9NVtF3w'
CARDS_PAGE_SHA = 'e810c6766af2a5c5834b2ab39d41ac3d71e6b50c4fbb077c2f66273d1824218b'  # Version 2's DATA, on which the 100 cards were answered


def norm(en):
    return re.sub(r'\s+', ' ', re.sub(r'\s*\([^)]*\)', '', en or '')).strip().lower()


def page_data(path):
    h = open(path, encoding='utf-8').read()
    m = re.search(r'const DATA = (\{.*?\});\n', h, re.S)
    if not m:
        sys.exit(f'no DATA block in {path}')
    raw = m.group(1).replace('<\\/', '</')
    return json.loads(raw), hashlib.sha256(raw.encode('utf-8')).hexdigest()


def default_word(t):
    """Mirror of defaultWord() in stage1_page.template.html."""
    if t['bucket'] == 'elsewhere':
        return t.get('ruledIs')
    if t['bucket'] in ('gained', 'gained-same'):
        return t.get('ruledIs') or t['Knew']
    return t['Kold'] if t.get('maj') == 'july' else t['Knew']


def target_of(a):
    return {'july': a['Kold'], 'new': a['Knew'], 'other': a['value'], 'default': a.get('defaultWord'),
            'keep': a.get('row')}.get(a['choice'])


def main():
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    dump, page, vers_path, out = sys.argv[1:]
    D, data_sha = page_data(page)
    versions = json.load(open(vers_path, encoding='utf-8'))
    saved = {}
    for f in sorted(glob.glob(os.path.join(dump, 'stage1_terms', '*.json'))):
        i = os.path.basename(f)[:-5]
        saved[i] = json.load(open(f, encoding='utf-8'))
    meta = {os.path.basename(f)[:-5]: json.load(open(f, encoding='utf-8'))
            for f in glob.glob(os.path.join(dump, 'stage1_meta', '*.json'))}
    missing_v = sorted(set(saved) - set(versions))
    if missing_v:
        sys.exit(f'no version recorded for {missing_v}')

    items = {t['id']: t for t in D['items'] + D['gainedSame']}
    ws = {w['id']: w for w in D['wrongSense']}
    unknown = sorted(set(saved) - set(items) - set(ws))
    if unknown:
        sys.exit(f'saved answers for ids the page does not carry: {unknown}')

    answers = []
    for i, a in sorted(saved.items()):
        answers.append({'id': i, 'version': versions[i], **a, 'target': target_of(a)})
    untouched = []
    for i, t in items.items():
        if t['bucket'] == 'card' or i in saved:
            continue
        untouched.append({'id': i, 'ch': t['ch'], 'en': t['en'], 'Kold': t['Kold'], 'Knew': t['Knew'],
                          'tab': 'gained' if t['bucket'] in ('gained', 'gained-same') else 'defaults',
                          'bucket': t['bucket'], 'proposed': default_word(t),
                          'status': 'confirmed' if f"confirm_{'gained' if t['bucket'] in ('gained', 'gained-same') else 'defaults'}" in meta else 'not-reviewed'})
    untouched.sort(key=lambda r: r['id'])
    cards_unanswered = sorted(i for i, t in items.items() if t['bucket'] == 'card' and i not in saved)
    open_items = {
        'cardsUnanswered': cards_unanswered,
        'defaultsNotReviewed': sum(r['tab'] == 'defaults' and r['status'] == 'not-reviewed' for r in untouched),
        'gainedNotReviewed': sum(r['tab'] == 'gained' and r['status'] == 'not-reviewed' for r in untouched),
        'wrongSense': [{'id': w['id'], 'en': w['en'], 'row': w['row']} for i, w in ws.items() if i not in saved],
        'publicationRule': 'open' if 'criterion' not in meta else None,
    }

    # Checks.
    R = json.load(open(RULINGS, encoding='utf-8'))
    ruled = defaultdict(set)
    for r in R['rulings']:
        if r['is']:
            ruled[r['enNorm']].add((r['is'], r['kind']))
    rows = [(r, 'answer', r['target']) for r in answers if r['id'] in items] + [(r, 'proposed', r['proposed']) for r in untouched]
    contains = []
    for r, how, word in rows:
        n = norm(r['en'])
        for h, ts in sorted(ruled.items()):
            if h != n and re.search(r'(?<!\w)' + re.escape(h) + r'(?!\w)', n):
                for is_, kind in sorted(ts):
                    lemma = norm(is_)
                    contains.append({'id': r['id'], 'en': r['en'], 'how': how, 'word': word,
                                     'ruledHeadword': h, 'ruledTarget': is_, 'ruledKind': kind,
                                     'substringHit': bool(word) and lemma in word.lower()})
    own = [(r['id'], r['en'], r['target'], 'answer') for r in answers if r['target']] + \
          [(r['id'], r['en'], r['proposed'], r['status']) for r in untouched if r['proposed']]
    contains_answered = []
    for ia, ea, ta, ha in own:
        a = norm(ea)
        for ib, eb, tb, hb in own:
            b = norm(eb)
            if a and ia != ib and a != b and re.search(r'(?<!\w)' + re.escape(a) + r'(?!\w)', b) \
                    and norm(ta) not in tb.lower():
                contains_answered.append({'shorter': {'id': ia, 'en': ea, 'word': ta, 'how': ha},
                                          'longer': {'id': ib, 'en': eb, 'word': tb, 'how': hb}})
    by_en = defaultdict(set)
    for r in answers:
        if r['id'] in items and r['target']:
            by_en[norm(r['en'])].add((r['ch'], r['target']))
    two = [{'en': k, 'answers': sorted(v)} for k, v in sorted(by_en.items())
           if len({t.lower() for _, t in v}) > 1]

    text = defaultdict(str)
    for f in glob.glob(os.path.join(MT, 'ch*', '*.is.md')):
        text[f.split(os.sep)[-2]] += open(f, encoding='utf-8').read().lower() + '\n'
    book = '\n'.join(text.values())
    counts = []
    for r in answers:
        if r['id'] not in items or not r['target']:
            continue
        w = norm(r['target'])
        counts.append({'id': r['id'], 'en': r['en'], 'choice': r['choice'], 'target': r['target'],
                       'chapter': text[r['ch']].count(w), 'book': book.count(w)})

    head = subprocess.run(['git', '-C', REPO, 'rev-parse', 'HEAD'], capture_output=True, text=True,
                          check=True).stdout.strip()
    res = {
        'about': ("[USER]'s stage 1 page answers, frozen (plan 2026-10-10 rev. 5, Stage 1). Written by "
                  'experiments/terminology-consistency/export_stage1_answers.py from a dump of the page\'s '
                  'database. `answers` were saved by [USER]. `untouched` are default and gained rows with no '
                  'saved answer: `confirmed` when [USER] pressed that tab\'s "Confirm this list" '
                  '(`meta.confirm_defaults` / `meta.confirm_gained`), so the proposed word stands as ruled; '
                  '`not-reviewed` otherwise, a proposal and never an answer (2026-10-11: silence is not '
                  'consent). `open` was not answered. `checks` are reported, never resolved. Nothing here is '
                  'applied: rulings reach houseStyleTerms.js, the concept model and the ruling set only '
                  'through later, separately recorded steps.'),
        'exportedAt': '2026-10-11',
        'page': {'url': PAGE_URL, 'collections': ['stage1_terms', 'stage1_meta'],
                 'dataSha256': data_sha,
                 'dataShaNote': (f'hash of the DATA in the page passed as <page.html>. The 100 cards were '
                                 f'answered on Version 2 (DATA sha256 {CARDS_PAGE_SHA}); the later tabs on '
                                 f'Version 4, whose DATA differs only in showing [[MATH:n]] as [formula]. '
                                 f'Item ids are identical across versions.'), 'generator': 'experiments/terminology-consistency/stage1_page.py'},
        'repoHead': head,
        'counts': {
            'answers': len(answers),
            'answersByChoice': {c: sum(r['choice'] == c for r in answers) for c in sorted({r['choice'] for r in answers})},
            'answersBySection': {s: sum(r['section'] == s for r in answers) for s in sorted({r['section'] for r in answers})},
            'defaultsNotReviewed': sum(r['tab'] == 'defaults' and r['status'] == 'not-reviewed' for r in untouched),
            'gainedNotReviewed': sum(r['tab'] == 'gained' and r['status'] == 'not-reviewed' for r in untouched),
            'defaultsConfirmed': sum(r['status'] == 'confirmed' for r in untouched),
            'cardsUnanswered': len(cards_unanswered),
            'wrongSenseOpen': len(open_items['wrongSense']),
            'scopeNotBook': sum((r.get('scope') or 'book') != 'book' for r in answers),
        },
        'open': open_items,
        'meta': meta,
        'checks': {'containsRuled': contains, 'containsAnswered': contains_answered, 'sameHeadwordTwoTargets': two, 'septemberCounts': counts},
        'answers': answers,
        'untouched': untouched,
    }
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(res['counts'], ensure_ascii=False))
    print(f"containsRuled {len(contains)} (substring misses {sum(not c['substringHit'] for c in contains)}), "
          f"containsAnswered {len(contains_answered)}, sameHeadwordTwoTargets {len(two)}, zero-in-book {sum(c['book'] == 0 for c in counts)} of {len(counts)} -> {out}")


if __name__ == '__main__':
    main()
