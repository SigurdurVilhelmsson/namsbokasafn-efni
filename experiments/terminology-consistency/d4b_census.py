#!/usr/bin/env python3
"""How the September MT renders *trigonal planar*, per segment (D4b, 2026-10-11).

Question: [USER] reversed the 2026-09-21 ruling *þríhyrnt flatt* to the official
glossary's *þríhyrningslaga flatt* (docs/decisions/2026-10-11-chemistry-finish-
preparation-answers.md, D4b). Which segments need work, and does the model
produce the official form on its own?

Method:
  * Pair each 02-mt-output segment with the 02-for-mt English of the SAME commit
    by SEG id. A duplicate id inside one module is paired by position.
  * Population: segments whose English matches /trigonal\\s+planar/i.
  * Instrument columns, raw: the adjective *þríhyrndur* in any inflection
    ([Þþ]ríhyrn[dt]\\w*), the indeclinable *þríhyrningslaga*, and any other
    *þríhyrnings-* compound.
  * The class of each segment's *trigonal planar* rendering was assigned by
    READING it in context, and is committed beside this script
    (results/2026-10-11/d4b-trigonal-planar-reviewed.json). That is needed
    because the same adjective also renders *trigonal pyramidal* and
    *trigonal bipyramidal*, so the raw columns overcount inside mixed segments.
  * With --reviewed, the script refuses unless the reviewed keys are exactly the
    population it finds, so a re-extraction or a re-buy cannot silently reuse
    a stale classification.

Blind spots: a rendering that uses none of these stems (e.g. a paraphrase) is
counted in its segment's class only through the reading. Positional ids
(entry:auto-N) renumber when a module gains a segment.

Usage:
  python3 -I experiments/terminology-consistency/d4b_census.py --repo . \\
      [--ref <sha>] [--reviewed <json>]
"""
import argparse, collections, json, os, re, subprocess, sys

BOOK = 'books/efnafraedi-2e'
SEG = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
EN_TP = re.compile(r'trigonal\s+planar', re.I)
ADJ = re.compile(r'[Þþ]ríhyrn[dt]\w*')
LAGA = re.compile(r'[Þþ]ríhyrningslaga')
COMPOUND = re.compile(r'[Þþ]ríhyrnings(?!laga)\w*')
MODULE_FILE = re.compile(r'(m\d+|chapter-metadata)-segments\.is\.md')


def lister(repo, ref):
    def ls(rel):
        if ref:
            out = subprocess.run(['git', '-C', repo, 'ls-tree', '--name-only', f'{ref}:{rel}'],
                                 capture_output=True, text=True)
            return out.stdout.split() if out.returncode == 0 else []
        path = os.path.join(repo, rel)
        return sorted(os.listdir(path)) if os.path.isdir(path) else []
    return ls


def reader(repo, ref):
    def read(rel):
        if ref:
            out = subprocess.run(['git', '-C', repo, 'show', f'{ref}:{rel}'], capture_output=True)
            return out.stdout.decode('utf-8') if out.returncode == 0 else None
        path = os.path.join(repo, rel)
        return open(path, encoding='utf-8').read() if os.path.exists(path) else None
    return read


def segments(text):
    parts = SEG.split(text)
    return [(parts[i], parts[i + 1]) for i in range(1, len(parts), 2)]


def census(repo, ref):
    ls, read = lister(repo, ref), reader(repo, ref)
    rows = []
    for ch in ls(f'{BOOK}/02-mt-output'):
        for name in ls(f'{BOOK}/02-mt-output/{ch}'):
            if not MODULE_FILE.fullmatch(name):
                continue
            module = name.split('-segments')[0]
            en = read(f'{BOOK}/02-for-mt/{ch}/{module}-segments.en.md')
            is_text = read(f'{BOOK}/02-mt-output/{ch}/{name}')
            if en is None or is_text is None:
                continue
            by_id = collections.defaultdict(list)
            for sid, body in segments(is_text):
                by_id[sid].append(body)
            seen = collections.Counter()
            for sid, body in segments(en):
                pos = seen[sid]
                seen[sid] += 1
                if not EN_TP.search(body):
                    continue
                cands = by_id.get(sid, [])
                is_body = cands[pos] if pos < len(cands) else ''
                rows.append({
                    'chapter': ch, 'module': module, 'id': sid, 'position': pos,
                    'englishOccurrences': len(EN_TP.findall(body)),
                    'icelandicMissing': pos >= len(cands),
                    'adjectiveTokens': ADJ.findall(is_body),
                    'lagaTokens': len(LAGA.findall(is_body)),
                    'compoundTokens': COMPOUND.findall(is_body),
                })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--ref', default=None)
    ap.add_argument('--reviewed', default=None)
    args = ap.parse_args()
    process_failed = 1
    rows = census(args.repo, args.ref)
    key = lambda r: (r['module'], r['id'], r['position'])
    report = {'ref': args.ref or 'working tree', 'segments': rows}
    if args.reviewed:
        reviewed = json.load(open(args.reviewed, encoding='utf-8'))['segments']
        found = {key(r) for r in rows}
        given = {key(r) for r in reviewed}
        if found != given:
            print(json.dumps({'error': 'reviewed keys differ from the population',
                              'onlyFound': sorted(map(list, found - given)),
                              'onlyReviewed': sorted(map(list, given - found))},
                             ensure_ascii=False, indent=1))
            sys.exit(process_failed)
        cls = {key(r): r for r in reviewed}
        distinct = {}
        for r in rows:
            distinct.setdefault((r['module'], r['id']), cls[key(r)])
        def table(items):
            t = collections.defaultdict(collections.Counter)
            for r in items:
                t[r['class']][r['chapter']] += 1
            return {c: dict(sorted(v.items())) | {'total': sum(v.values())} for c, v in sorted(t.items())}
        report['summary'] = {
            'positions': len(rows),
            'distinctSegments': len(distinct),
            'englishOccurrences': sum(r['englishOccurrences'] for r in rows),
            'byClassDistinct': table(distinct.values()),
            'lagaFollowedByFlaturDistinct': sum(1 for r in distinct.values()
                                                if r['class'] == 'laga' and r.get('flatur')),
            'literalThrihyrntSegmentsDistinct': len({(r['module'], r['id']) for r in rows
                                                     if any(t.lower().startswith('þríhyrnt')
                                                            for t in r['adjectiveTokens'])}),
        }
    json.dump(report, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == '__main__':
    main()
