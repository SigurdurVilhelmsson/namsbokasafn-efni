#!/usr/bin/env python3
"""Compile the chemistry term-ruling set AFTER the stage 1 page (plan 2026-10-10 rev. 5, Stage 1, Outputs).

Layers stage 1 over the set compiled before it, which this script reads and never changes
(results/2026-10-11/ruling-set-before-stage1.json, from compile_ruling_set.py), so that file
stays reproducible. Inputs:

  1. ruling-set-before-stage1.json: the rulings in force before the page.
  2. stage1-answers-2026-10-11.json: [USER]'s page answers, and the default and gained rows
     [USER] confirmed with "Confirm this list" (`untouched`, status `confirmed`).
  3. stage1-chat-answers-2026-10-11.json: the seven chat answers. A row there SUPERSEDES the
     page answer for the same id.
  4. prod-term-resolutions-2026-10-11.json: what prod's concept model resolves each headword
     to (read-only). This is the STORED word.

Each stage 1 row gets a `class`, from comparing its target with the stored word:
  - matches-stored: same word (case ignored). No code entry: the ruling keeps the stored word.
  - spelling-vs-stored: differs only by the page's spelling-only rule (stage1_page.spelling_only:
    case, hyphens, spaces, markup, a trailing definite article), after parentheticals are removed.
  - word-change: a different word.
  - tied: prod holds competing concepts at the same position, so the export drops the headword.
  - unstored: prod has no concept for the headword at all.
and a `proposedMechanism`, which is a PROPOSAL, never applied here:
  - none: matches-stored, or a wrong-sense row [USER] kept.
  - preference: the target already exists as a term (on the winning concept, or among the tied
    ones), so a book_term_preference row pointing at it is enough, as for atom -> atóm.
  - entry: a houseStyleTerms.js entry (code; a deploy is needed).
  - replace-entry: an entry exists and the ruling reverses it (bonding orbital).
  - concept-model-script: a wrong-sense row (plan 1.5), fixed by a committed script [USER] runs
    on prod, never by an entry; `emission` also needs the tie broken for the ruled word.
  - record-only: an unstored headword. [USER] 2026-10-11 (chat, answer "a"): the ruling lives in
    this file only, with no entry, so the editors' term flags and the glossary (which also feeds
    math-label substitution on the render path) do not grow by these headwords. The compliance
    check and the AI pass read this file, so they still see the ruling. One can still be given an
    entry later, case by case.

`is` is the target with any [formula] placeholder and a trailing parenthetical removed (a symbol
such as (Eker) or (n) stays English under the 2026-09-04 short-label ruling); `pageWord` keeps
the answer as given.

Conflicts: a stage 1 target that differs from a ruling in force for the same headword, or two
stage 1 rows for one headword with two targets. Each must be explained by an explicit override
below or the run exits 1.

Usage: python3 experiments/terminology-consistency/compile_stage1_rulings.py <out.json>
"""
import hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from stage1_page import spelling_only, spell_key  # noqa: E402  the page's own rule, not a copy

R = os.path.join(HERE, 'results', '2026-10-11')
BEFORE = os.path.join(R, 'ruling-set-before-stage1.json')
ANSWERS = os.path.join(R, 'stage1-answers-2026-10-11.json')
CHAT = os.path.join(R, 'stage1-chat-answers-2026-10-11.json')
PROD = os.path.join(R, 'prod-term-resolutions-2026-10-11.json')
REL = lambda p: os.path.relpath(p, REPO)

UNSTORED = ('record-only', '[USER] 2026-10-11 in chat, answer "a" to: house-style entries for the 155 '
            'unstored headwords, or record only?')

# A stage 1 ruling that reverses a ruling in force, with the record that says so.
OVERRIDES = {
    'bonding orbital': {'from': 'bindandi svigrúm', 'to': 'tengisvigrúm',
                        'record': 'stage1-chat-answers-2026-10-11.json, question 3 (choice a)'},
}


def sha256(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'\s*\([^)]*\)', '', s or '')).strip().lower()


def target(word):
    if word is None:
        return None
    w = re.sub(r'\s*\[formula\](\s+(eða|or)\s+\[formula\])?', '', word)
    w = re.sub(r'\s*\([^()]*\)\s*$', '', w).strip()
    return w or None


def stored_of(ids_queries, results):
    for q in ids_queries:
        if results[q]['winner']:
            return 'winner', results[q]
    for q in ids_queries:
        if results[q]['tied']:
            return 'tied', results[q]
    return 'absent', None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    B = json.load(open(BEFORE, encoding='utf-8'))
    A = json.load(open(ANSWERS, encoding='utf-8'))
    C = json.load(open(CHAT, encoding='utf-8'))
    P = json.load(open(PROD, encoding='utf-8'))
    chat = {r['id']: (q['q'], r['ruled']) for q in C['questions'] for r in q['rows']}

    src = []  # (row, origin, pageWord)
    for a in A['answers']:
        src.append((a, 'page-answer', a['target']))
    for u in A['untouched']:
        if u['status'] != 'confirmed':
            sys.exit(f"{u['id']} is {u['status']}: only confirmed defaults are rulings")
        src.append((u, 'page-default-confirmed', u['proposed']))

    rows, notes = [], []
    for r, origin, page_word in src:
        if r.get('choice') == 'either':
            notes.append({'id': r['id'], 'en': r['en'], 'ch': r.get('ch'), 'note': r.get('note') or '',
                          'kind': 'inflection-note', 'why': '"either is fine": the choice is inflection, not a word'})
            continue
        word, how = page_word, origin
        if r['id'] in chat:
            word, how = chat[r['id']][1], f"chat (question {chat[r['id']][0]})"
        is_ = target(word)
        kind, res = stored_of(P['queryMap'][r['id']], P['results'])
        stored = res['winner']['text'] if kind == 'winner' else None
        tied = [t.get('text') for t in res['tied']] if kind == 'tied' else []
        alts = res['alternatives'] if kind == 'winner' else []
        wrong = r['id'].startswith('ws_')
        if kind == 'absent':
            cls = 'unstored'
        elif kind == 'tied':
            cls = 'tied'
        elif is_.lower() == stored.lower():
            cls = 'matches-stored'
        elif spelling_only(norm(is_), norm(stored)) or spell_key(norm(is_)) == spell_key(norm(stored)):
            cls = 'spelling-vs-stored'
        else:
            cls = 'word-change'
        n = norm(r['en'])
        if wrong:
            mech = 'none' if r.get('choice') == 'keep' else 'concept-model-script'
        elif n in OVERRIDES:
            mech = 'replace-entry'
        elif cls == 'matches-stored':
            mech = 'none'
        elif cls == 'unstored':
            mech = UNSTORED[0]
        elif cls == 'tied':
            mech = 'preference' if is_.lower() in {t.lower() for t in tied if t} else 'entry'
        else:
            mech = 'preference' if is_.lower() in {a_.lower() for a_ in alts} else 'entry'
        row = {'id': r['id'], 'en': r['en'], 'enNorm': n, 'ch': r.get('ch'), 'is': is_, 'pageWord': word if how.startswith('chat') else page_word,
               'origin': how, 'stored': stored, 'storedTied': tied, 'storedAlternatives': alts,
               'storedDomain': res['winner']['domain'] if kind == 'winner' else None,
               'class': cls, 'proposedMechanism': mech, 'scope': {'kind': (r.get('scope') or 'book')},
               'ruled': '2026-10-11 [USER]'}
        if how.startswith('chat'):
            row['pageAnswer'] = page_word
        if wrong:
            row['wrongSenseRow'] = r.get('row')
            if r['id'] == 'ws_emission':
                row['mechanismNote'] = ('the stored tie is ljómun / útblástur and the ruling is útgeislun, neither of them: '
                                        'removing the útblástur row alone would leave ljómun winning, so the fix also has to '
                                        'make útgeislun win (a house-style concept wins a real tie at its own position, §C164)')
        rows.append(row)

    # Conflicts.
    before = {}
    for r in B['rulings']:
        if r['is'] is not None:
            before.setdefault(r['enNorm'], set()).add(norm(r['is']))
    conflicts, explained = [], []
    for row in rows:
        old = before.get(row['enNorm'])
        if old and norm(row['is']) not in old:
            o = OVERRIDES.get(row['enNorm'])
            if o and norm(o['to']) == norm(row['is']) and norm(o['from']) in old:
                explained.append({'enNorm': row['enNorm'], 'from': o['from'], 'to': row['is'], 'record': o['record']})
            else:
                conflicts.append({'enNorm': row['enNorm'], 'inForce': sorted(old), 'stage1': row['is'], 'id': row['id']})
    seen = {}
    for row in rows:
        seen.setdefault(row['enNorm'], set()).add(norm(row['is']))
    for n, ts in sorted(seen.items()):
        if len(ts) > 1:
            conflicts.append({'enNorm': n, 'stage1Targets': sorted(ts)})
    missing = sorted(set(OVERRIDES) - {e['enNorm'] for e in explained})
    if missing:
        sys.exit(f'override found nothing to override: {missing}; an input changed?')

    count = lambda k: {v: sum(r[k] == v for r in rows) for v in sorted({r[k] for r in rows})}
    head = subprocess.run(['git', '-C', REPO, 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    out = {
        'about': ('Chemistry term-ruling set AFTER the stage 1 page (plan 2026-10-10 rev. 5, Stage 1, Outputs). Compiled by '
                  'experiments/terminology-consistency/compile_stage1_rulings.py. `before` is the set in force before the page, '
                  'unchanged; `stage1` is every ruling the page and the chat answers made, each with the word prod stores today, '
                  'a class and a PROPOSED mechanism. Nothing here is applied: houseStyleTerms.js, book_term_preference and the '
                  'concept model change only through later, separately recorded steps. `supersededInBefore` names the rulings '
                  'in `before` that stage 1 reverses.'),
        'compiledAt': '2026-10-11',
        'repoHead': head,
        'inputs': {REL(p): sha256(p) for p in (BEFORE, ANSWERS, CHAT, PROD)},
        'storedRead': {'prodHead': P['head'], 'readAt': P['readAt']},
        'unstoredRuling': {'mechanism': UNSTORED[0], 'record': UNSTORED[1]},
        'counts': {'stage1': len(rows), 'byClass': count('class'), 'byMechanism': count('proposedMechanism'),
                   'inflectionNotes': len(notes), 'before': len(B['rulings'])},
        'conflicts': conflicts,
        'supersededInBefore': explained,
        'stage1': rows,
        'inflectionNotes': notes,
        'before': B['rulings'],
    }
    json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(out['counts'], ensure_ascii=False))
    print(f"superseded {len(explained)}, conflicts {len(conflicts)} -> {sys.argv[1]}")
    for c in conflicts:
        print('  CONFLICT', c)
    if conflicts:
        sys.exit(1)


if __name__ == '__main__':
    main()
