#!/usr/bin/env python3
"""Compile the chemistry term-ruling set that is in force BEFORE the stage 1 page is answered.

Plan 2026-10-10 (rev. 5) §5 Stage 1, "Where rulings live": the rulings are spread over four
places, and whatever compiles the ruling set must list entry and no-entry rulings alike, each
with its target and its competitor. This script is that compiler. It merges:

  1. server/lib/houseStyleTerms.js at HEAD: the rulings that differ from the stored lemma
     (kind `entry`). Read through node, so the file the code reads is the one compiled.
  2. The no-entry rulings the 2026-09-21 test pins absent (kind `no-entry`): ALREADY_CORRECT,
     REVERSED_TO_STORED (trigonal planar, D4b) and HELD (kept off the wire, no target).
     Their targets are the 2026-09-21 decision record's values, copied below with that source.
  3. results/2026-10-10/verdicts-2026-10-10.json: [USER]'s 104 review-page answers (kind
     `verdict`). FROZEN: read, never edited. The D4 answers of 2026-10-11 are applied OVER it:
     Lewis structure -> Lewis-mynd (the frozen card says Lewis-bygging), and the trigonal planar
     card's stale `houseStyleRuling: þríhyrnt flatt` is dropped.
  4. results/2026-10-11/prod-book-term-preference.json: prod's book-scoped preference rows
     (kind `book-preference`), chemistry's only.

Scope (D2, answered yes): every ruling applies book-wide unless an exception list says
otherwise. No exception lists exist yet; the stage 1 page collects them. Scope is therefore
emitted as {"kind": "book"} everywhere, plus the chapter a verdict was ruled in.

A headword ruled in two places with two different targets is reported under `conflicts`,
never resolved here. The run fails (exit 1) if there is a conflict the D4 overrides do not
explain, so a new disagreement cannot slip into the artifact.

Usage: python3 experiments/terminology-consistency/compile_ruling_set.py <out.json>
"""
import hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
HOUSE = os.path.join(REPO, 'server', 'lib', 'houseStyleTerms.js')
VERDICTS = os.path.join(HERE, 'results', '2026-10-10', 'verdicts-2026-10-10.json')
PROD_PREF = os.path.join(HERE, 'results', '2026-10-11', 'prod-book-term-preference.json')
D4_RECORD = 'docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md'
RULINGS_0921 = 'docs/decisions/2026-09-21-chemistry-terminology-rulings.md'

# [USER] 2026-10-11, D4 (record above). Applied over the frozen verdicts.
D4 = {
    'lewis structure': {'is': 'Lewis-mynd', 'competitor': 'Lewis-bygging',
                        'why': 'D4a: overrides the ch07 review-page verdict Lewis-bygging.'},
    'trigonal planar': {'is': 'þríhyrningslaga flatt', 'competitor': 'þríhyrnt flatt',
                        'why': 'D4b: reverses the 2026-09-21 ruling þríhyrnt flatt; official glossary form.'},
}

# Pinned absent from houseStyleTerms.js by server/__tests__/houseStyleTerms2026-09-21.test.js.
# Targets from the 2026-09-21 record's ruling table (lines "porous = gropinn" etc.).
NO_ENTRY = [
    ('porous', 'gropinn', 'ALREADY_CORRECT'),
    ('complementary color', 'fyllingarlitur', 'ALREADY_CORRECT'),
    ('square planar', 'ferningslaga flatt', 'ALREADY_CORRECT'),
    ('decay', 'sundrun', 'ALREADY_CORRECT'),
    ('trigonal planar', 'þríhyrningslaga flatt', 'REVERSED_TO_STORED'),
]
HELD = ['substituted', 'fissionable', 'fissile', 'radioactive material']


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def norm(en):
    return re.sub(r'\s+', ' ', re.sub(r'\s*\([^)]*\)', '', en or '')).strip().lower()


def git_head():
    return subprocess.run(['git', '-C', REPO, 'rev-parse', 'HEAD'], capture_output=True, text=True,
                          check=True).stdout.strip()


def house_terms():
    js = ("const h=require(process.argv[1]);"
          "process.stdout.write(JSON.stringify(h.HOUSE_STYLE_TERMS))")
    out = subprocess.run(['node', '-e', js, HOUSE], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    rulings = []
    for t in house_terms():
        for en in t['en']:
            rulings.append({'en': en, 'enNorm': norm(en), 'is': t['is'], 'competitor': None,
                            'kind': 'entry', 'source': 'server/lib/houseStyleTerms.js',
                            'ruled': t.get('ruled'), 'scope': {'kind': 'book'}})
    for en, is_, why in NO_ENTRY:
        rulings.append({'en': en, 'enNorm': norm(en), 'is': is_, 'competitor': None, 'kind': 'no-entry',
                        'source': f'{RULINGS_0921} ({why})' + (f'; {D4_RECORD} (D4b)' if why == 'REVERSED_TO_STORED' else ''),
                        'ruled': '2026-10-11 [USER]' if why == 'REVERSED_TO_STORED' else '2026-09-21 [USER]',
                        'scope': {'kind': 'book'}})
    for en in HELD:
        rulings.append({'en': en, 'enNorm': norm(en), 'is': None, 'competitor': None, 'kind': 'held',
                        'source': f'{RULINGS_0921} (HELD: off the wire, no target)', 'ruled': '2026-09-21 [USER]',
                        'scope': {'kind': 'book'}})
    V = json.load(open(VERDICTS, encoding='utf-8'))
    overridden = []
    for a in V['answers']:
        n = norm(a['en'])
        target, comp = a['targetIcelandic'], None
        others = {a['julyEntry'], a['newEntry']} - {target}
        if others:
            comp = sorted(others)[0]
        r = {'en': a['en'], 'enNorm': n, 'is': target, 'competitor': comp, 'kind': 'verdict',
             'source': f"experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json#{a['id']}",
             'ruled': '2026-10-10 [USER]', 'ruledIn': a['chapter'], 'scope': {'kind': 'book'},
             'note': a.get('note') or ''}
        if n in D4:
            r.update({'frozenTarget': target, 'is': D4[n]['is'], 'competitor': D4[n]['competitor'],
                      'ruled': '2026-10-11 [USER] (D4)', 'override': f"{D4_RECORD}: {D4[n]['why']}"})
            overridden.append(n)
        rulings.append(r)
    P = json.load(open(PROD_PREF, encoding='utf-8'))
    for row in P['rows']:
        if row['book'] != 'efnafraedi-2e':
            continue
        rulings.append({'en': row['english'], 'enNorm': norm(row['english']), 'is': row['text'], 'competitor': None,
                        'kind': 'book-preference', 'source': 'prod book_term_preference (read 2026-10-11)',
                        'ruled': None, 'scope': {'kind': 'book'} if row['chapter'] == 0 else {'kind': 'chapters', 'chapters': [row['chapter']]}})
    missing = sorted(set(D4) - set(overridden))
    if missing:
        sys.exit(f'D4 override found no verdict for {missing}; the frozen input changed?')

    by = {}
    for r in rulings:
        if r['is'] is not None:
            by.setdefault(r['enNorm'], []).append(r)
    conflicts = []
    for n, rs in sorted(by.items()):
        targets = {r['is'].lower() for r in rs}
        if len(targets) > 1:
            conflicts.append({'enNorm': n, 'targets': sorted({r['is'] for r in rs}),
                              'sources': [f"{r['kind']}: {r['is']} ({r['source']})" for r in rs]})
    out = {
        'about': ('Chemistry term-ruling set in force before the stage 1 page (plan 2026-10-10 rev. 5, '
                  'Stage 1). Compiled by experiments/terminology-consistency/compile_ruling_set.py. '
                  'Kinds: entry = houseStyleTerms.js; no-entry = ruled to the stored lemma, pinned absent; '
                  'held = off the wire, no target; verdict = review-page answer (frozen, D4 applied over it); '
                  'book-preference = prod book_term_preference. Scope is book-wide by D2 until the stage 1 '
                  'page collects exceptions. A verdict\'s `competitor` is the other key-terms entry on its card.'),
        'compiledAt': '2026-10-11',
        'repoHead': git_head(),
        'inputs': {
            'server/lib/houseStyleTerms.js': sha256(HOUSE),
            'experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json': sha256(VERDICTS),
            'experiments/terminology-consistency/results/2026-10-11/prod-book-term-preference.json': sha256(PROD_PREF),
        },
        'counts': {k: sum(r['kind'] == k for r in rulings) for k in ('entry', 'no-entry', 'held', 'verdict', 'book-preference')},
        'headwordsWithTarget': len(by),
        'conflicts': conflicts,
        'rulings': rulings,
    }
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(out['counts']), f"{len(by)} headwords with a target, {len(conflicts)} conflicts -> {sys.argv[1]}")
    for c in conflicts:
        print('  CONFLICT', c['enNorm'], c['targets'])
    if conflicts:
        sys.exit(1)


if __name__ == '__main__':
    main()
