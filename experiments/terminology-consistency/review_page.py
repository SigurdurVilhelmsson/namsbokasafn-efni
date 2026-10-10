#!/usr/bin/env python3
"""Build the [USER] review page from classify.py's output (the common-id population).

Writes one self-contained HTML file: the per-chapter consistency table, then every term
whose class needs a look, with July/new key-terms entries, prose agreement and real
example segments. Answers go to the page's `db` (collections `verdicts`, `chapters`),
read back with ArtifactData. STABLE and LOW-N terms are counted, not listed.

Usage: python3 experiments/terminology-consistency/review_page.py <classified-common.json> <out.html>
"""
import json, re, sys
from collections import Counter

SHOW = ['RULING-BROKEN-NEW', 'TEXT-DRIFT', 'KEYTERM-SPLIT', 'TEXT-RENAMED', 'KEYTERM-OTHER',
        'RULING-BROKEN-BOTH', 'KEYTERM-FIXED', 'RULED-APPLIED', 'TEXT-GAIN']


def clean(s):
    s = re.sub(r'\[\[(?:sub|sup):([^\]|]*)\]\]', r'\1', s or '')
    s = re.sub(r'\[\[[a-zA-Z]+:([^\]|]*)(?:\|[^\]]*)?\]\]', r'\1', s)
    return re.sub(r'\{\{/?[a-z]+\}\}', '', s).replace('^', '').strip()


def main():
    r = json.load(open(sys.argv[1], encoding='utf-8'))
    th = r['thresholds']
    chapters, terms = [], []
    for c in r['chapters']:
        lost = gained = 0
        for t in c['terms']:
            o, n = t['old'], t['new']
            if o['prose'] < th['MIN_N'] or n['prose'] < th['MIN_N']:
                continue
            co = o['own'] / o['prose'] >= th['RULED']
            cn = n['own'] / n['prose'] >= th['RULED']
            lost += co and not cn
            gained += cn and not co
        cnt = Counter(t['class'] for t in c['terms'])
        arm = ', '.join(f'{k}' for k in c['arms'])
        chapters.append({'ch': c['chapter'], 'arm': arm, 'old': c['consistent']['old'][0],
                         'new': c['consistent']['new'][0], 'of': c['consistent']['old'][1],
                         'lost': lost, 'gained': gained, 'counts': dict(cnt), 'n': len(c['terms'])})
        for t in c['terms']:
            ok = o_n = None
            if t['old']['prose'] >= th['MIN_N'] and t['new']['prose'] >= th['MIN_N']:
                ok = t['old']['own'] / t['old']['prose'] >= th['RULED']
                o_n = t['new']['own'] / t['new']['prose'] >= th['RULED']
            if t['class'] not in SHOW and not (ok and not o_n):
                continue
            ex = lambda v: [{'en': clean(m['en'])[:240], 'is': clean(m['is'])[:240]} for m in t[v]['misses'][:2]]
            terms.append({
                'id': f"{c['chapter']}_{t['definitionId']}", 'ch': c['chapter'], 'en': clean(t['en']),
                'cls': t['class'], 'Kold': clean(t['K']['old']), 'Knew': clean(t['K']['new']),
                'po': [t['old']['own'], t['old']['prose']], 'pn': [t['new']['own'], t['new']['prose']],
                'keep': t.get('oldKeep_new'), 'ruling': t['ruling']['is'] if t.get('ruling') and t['ruling']['exact'] else None,
                'ruledNew': t.get('ruled_new'),
                'dOld': [clean(k) for k in t['old']['defSites']], 'dNew': [clean(k) for k in t['new']['defSites']],
                'sameK': not t['renderingChanged'], 'lost': bool(ok and not o_n), 'exOld': ex('old'), 'exNew': ex('new')})
    data = {'oldRef': r['oldRef'][:9], 'newRef': r['newRef'][:9], 'chapters': chapters, 'terms': terms,
            'book': {'old': sum(c['old'] for c in chapters), 'new': sum(c['new'] for c in chapters),
                     'of': sum(c['of'] for c in chapters), 'lost': sum(c['lost'] for c in chapters),
                     'gained': sum(c['gained'] for c in chapters), 'total': sum(c['n'] for c in chapters)}}
    tpl = open(__file__.replace('review_page.py', 'review_page.template.html'), encoding='utf-8').read()
    payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    open(sys.argv[2], 'w', encoding='utf-8').write(tpl.replace('/*__DATA__*/null', payload))
    print(f'{len(terms)} terms listed, {len(chapters)} chapters → {sys.argv[2]}')


if __name__ == '__main__':
    main()
