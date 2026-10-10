#!/usr/bin/env python3
"""Taught-term consistency, old MT vintage vs new, per chapter.

Question ([USER] 2026-10-10): "consistent translation of terms being taught in
each chapter is vital in a textbook." Does the 2026-09 re-MT translate the terms
a chapter teaches less consistently than the MT readers have now?

Method (see README.md for the full statement and the blind spots):
  * TAUGHT TERMS = the chapter's own end-of-chapter key-terms list, i.e. the
    CNXML <glossary><definition> entries OpenStax wrote. They reach the segment
    files as `glossary-term:<definitionId>-term` segments, whose ids are stable
    across vintages. Nothing is hand-curated, and glossary-unified.json is NOT
    consulted (it is blind where an approved row is itself wrong).
  * For each vintage v (old, new) and each taught term t:
      K_v   = the Icelandic headword the key-terms page gives t
      prose = segments whose English contains t's headword (word-bounded,
              plural-tolerant), outside the glossary entries themselves
      own   = of those, segments whose Icelandic carries K_v (stem match)
      other = of those, segments whose Icelandic carries the OTHER vintage's K
      defs  = the Icelandic at t's bold in-text definition site(s), paired
              positionally with the English term marker in the same segment
  * Each vintage's Icelandic is paired with the English from the SAME commit.
This measures CONSISTENCY, not correctness: a vintage that is consistently
wrong scores well. The K_old != K_new list is what a human rules on.

Usage:
  python3 -u experiments/terminology-consistency/measure.py \
      --book efnafraedi-2e --old-ref <sha> [--new-ref HEAD] --out result.json
"""
import argparse, json, re, subprocess, sys
from collections import Counter

SEG = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
# The three term-marker syntaxes in the corpus, in source order within a segment:
#   new EN + new IS   [[term:X|term-00001]]
#   old EN            {{term}}X{{/term}}
#   old IS            __X__
TERM_SPAN = re.compile(
    r'\[\[term:([^|\]]*)(?:\|[^\]]*)?\]\]'
    r'|\{\{term\}\}(.*?)\{\{/term\}\}'
    r'|__(.+?)__')
BRACKET = re.compile(r'\[\[[a-zA-Z]+:([^\]|]*)(?:\|[^\]]*)?\]\]')
PAIRED = re.compile(r'\{\{/?[a-zA-Z]+\}\}')
PAREN = re.compile(r'\s*\([^)]*\)')


def git_show(ref, path):
    r = subprocess.run(['git', 'show', f'{ref}:{path}'], capture_output=True)
    return r.stdout.decode('utf-8') if r.returncode == 0 else None


def git_ls(ref, path):
    r = subprocess.run(['git', 'ls-tree', '--name-only', f'{ref}:{path}'],
                       capture_output=True, text=True)
    return r.stdout.split() if r.returncode == 0 else []


def parse_segments(text):
    """{ 'type:elementId': raw segment text } — the parser contract is the
    no-space `<!-- SEG:… -->` marker (CLAUDE.md § SEG marker)."""
    if text is None:
        return {}
    parts = SEG.split(text)
    out = {}
    for i in range(1, len(parts) - 1, 2):
        key = parts[i].split(':', 1)[-1]  # drop the module id
        out[key] = parts[i + 1].strip()
    return out


def plain(s):
    s = BRACKET.sub(r'\1', s)
    s = PAIRED.sub('', s)
    return s.replace('__', '')


def term_spans(s):
    return [next(g for g in m.groups() if g is not None) for m in TERM_SPAN.finditer(s)]


def norm_en(h):
    return re.sub(r'\s+', ' ', PAREN.sub('', plain(h))).strip().lower()


def en_pattern(h):
    words = [re.escape(w) for w in h.split(' ') if w]
    if not words:
        return None
    return re.compile(r'(?<![\w-])' + r'[\s-]+'.join(words) + r'(?:s|es)?(?![\w-])', re.I)


def stems(is_head):
    """Content-word stems of an Icelandic headword. A stem is the word minus its
    last two letters (min 4); a u-umlaut variant (first a→ö) is also accepted so
    that stafur/stöfum both match. Inflection that changes the root otherwise
    (ablaut, i-umlaut) is a documented blind spot."""
    out = []
    for w in re.findall(r'\w+', PAREN.sub('', plain(is_head)).lower()):
        if len(w) <= 2:
            continue
        st = w[:max(4, len(w) - 2)] if len(w) > 5 else w[:4]
        out.append({st, st.replace('a', 'ö', 1)})
    return out


def carries(is_text, stem_sets):
    if not stem_sets:
        return False
    low = plain(is_text).lower()
    return all(any(s in low for s in alts) for alts in stem_sets)


def load_vintage(ref, book, ch, mod):
    en = parse_segments(git_show(ref, f'books/{book}/02-for-mt/{ch}/{mod}-segments.en.md'))
    is_ = parse_segments(git_show(ref, f'books/{book}/02-mt-output/{ch}/{mod}-segments.is.md'))
    return en, is_


def provenance_arm(ref, book, ch, mod):
    t = git_show(ref, f'books/{book}/02-mt-output/{ch}/{mod}-provenance.json')
    if not t:
        return None
    try:
        p = json.loads(t)
    except ValueError:
        return None
    g = ((p.get('run') or {}).get('glossary') or {})
    return {'tool': p.get('tool'), 'generatedAt': p.get('generatedAt'),
            'arm': g.get('arm'), 'termCount': g.get('termCount')}


def load_rulings(ref):
    """House-style rulings ([USER]'s, the ONE owner is server/lib/houseStyleTerms.js),
    read at the NEW ref so the comparison uses the rulings in force for it."""
    src = git_show(ref, 'server/lib/houseStyleTerms.js')
    if src is None:
        return []
    js = ('const m={exports:{}};(function(module,exports){' + src + '})(m,m.exports);'
          'process.stdout.write(JSON.stringify(m.exports.HOUSE_STYLE_TERMS.map(e=>({en:e.en,is:e.is}))))')
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else []


def ruling_for(en_norm, rulings):
    """The ruling whose English form is the term, else the longest one that is a
    word-bounded part of it (radioactive decay series <- radioactive decay)."""
    best = None
    for r in rulings:
        for f in r['en']:
            f = f.lower()
            if f == en_norm:
                return {'en': f, 'is': r['is'], 'exact': True}
            if re.search(r'(?<![\w-])' + re.escape(f) + r'(?![\w-])', en_norm) and (not best or len(f) > len(best['en'])):
                best = {'en': f, 'is': r['is'], 'exact': False}
    return best


def measure_chapter(book, ch, old_ref, new_ref, max_examples, rulings):
    mods = sorted({n.split('-segments')[0] for n in git_ls(new_ref, f'books/{book}/02-mt-output/{ch}')
                   if n.endswith('-segments.is.md') and n.startswith('m')})
    data = {}
    for m in mods:
        data[m] = {'old': load_vintage(old_ref, book, ch, m), 'new': load_vintage(new_ref, book, ch, m)}

    # Pairing quality: ids present in EN and IS of one vintage, and ids in only one.
    quality = {}
    for m, d in data.items():
        q = {}
        for v in ('old', 'new'):
            en, is_ = d[v]
            q[v] = {'paired': len(en.keys() & is_.keys()), 'enOnly': len(en.keys() - is_.keys()),
                    'isOnly': len(is_.keys() - en.keys())}
        q['changed'] = d['old'][1] != d['new'][1]
        quality[m] = q

    # Taught terms: glossary-term segments, keyed by definition id, from the new EN
    # (OpenStax's list does not move between vintages; ids are the same).
    terms = []
    for m, d in data.items():
        en_new = d['new'][0]
        for key, txt in en_new.items():
            if not key.startswith('glossary-term:'):
                continue
            terms.append({'module': m, 'key': key, 'en': plain(txt).strip(), 'enNorm': norm_en(txt)})

    rows = []
    for t in terms:
        pat = en_pattern(t['enNorm'])
        K = {v: data[t['module']][v][1].get(t['key']) for v in ('old', 'new')}
        Kst = {v: stems(K[v]) if K[v] else [] for v in ('old', 'new')}
        row = {'module': t['module'], 'definitionId': t['key'].split(':', 1)[1].rsplit('-term', 1)[0],
               'en': t['en'], 'K': K,
               'renderingChanged': (norm_en(K['old'] or '') != norm_en(K['new'] or '')),
               'ruling': ruling_for(t['enNorm'], rulings)}
        Rst = stems(row['ruling']['is']) if row['ruling'] else []
        for v in ('old', 'new'):
            other = 'new' if v == 'old' else 'old'
            n = own = oth = rul = 0
            defs = []
            misses = []
            for m, d in data.items():
                en, is_ = d[v]
                for key, etxt in en.items():
                    if key.startswith(('glossary-term:', 'glossary-def:')) or key not in is_:
                        continue
                    itxt = is_[key]
                    # In-text definition sites: an English term span naming t.
                    es = term_spans(etxt)
                    hit_idx = [i for i, s in enumerate(es) if norm_en(s) == t['enNorm']]
                    if hit_idx:
                        isp = term_spans(itxt)
                        for i in hit_idx:
                            defs.append(isp[i] if len(isp) == len(es) else None)
                    if not pat or not pat.search(plain(etxt)):
                        continue
                    n += 1
                    c_own = carries(itxt, Kst[v])
                    own += c_own
                    if row['renderingChanged']:
                        oth += carries(itxt, Kst[other])
                    if Rst:
                        rul += carries(itxt, Rst)
                    if not c_own and len(misses) < max_examples:
                        misses.append({'seg': f'{m}:{key}', 'en': plain(etxt)[:300], 'is': plain(itxt)[:300]})
            paired = [x for x in defs if x is not None]
            row[v] = {'prose': n, 'own': own, 'other': oth if row['renderingChanged'] else None,
                      'ruled': rul if Rst else None,
                      'keyTermRuled': carries(K[v] or '', Rst) if Rst else None,
                      'defSites': Counter(x if x is not None else '<unpaired>' for x in defs),
                      # does the bold in-text definition carry the key-terms entry's word?
                      'defAgree': [sum(carries(x, Kst[v]) for x in paired), len(paired)],
                      'misses': misses}
        rows.append(row)

    arms = {m: provenance_arm(new_ref, book, ch, m) for m in mods}
    return {'chapter': ch, 'modules': mods, 'quality': quality, 'newArms': arms, 'terms': rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--book', required=True)
    ap.add_argument('--old-ref', required=True)
    ap.add_argument('--new-ref', default='HEAD')
    ap.add_argument('--chapters', default='', help='comma list, e.g. ch01,ch02 (default: all chNN)')
    ap.add_argument('--max-examples', type=int, default=3)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    chs = [c for c in a.chapters.split(',') if c] or sorted(
        c for c in git_ls(a.new_ref, f'books/{a.book}/02-mt-output') if re.fullmatch(r'ch\d\d', c) and c != 'ch00')
    resolve = lambda r: subprocess.run(['git', 'rev-parse', r], capture_output=True, text=True).stdout.strip()
    rulings = load_rulings(a.new_ref)
    if not rulings:
        sys.exit('could not load server/lib/houseStyleTerms.js at the new ref')
    result = {'book': a.book, 'oldRef': resolve(a.old_ref), 'newRef': resolve(a.new_ref), 'rulingCount': len(rulings), 'chapters': []}
    for ch in chs:
        print(f'… {ch}', file=sys.stderr)
        result['chapters'].append(measure_chapter(a.book, ch, a.old_ref, a.new_ref, a.max_examples, rulings))
    result['complete'] = True  # terminal marker: judge a run by this, never by the exit code
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f'wrote {a.out}: {sum(len(c["terms"]) for c in result["chapters"])} taught terms '
          f'across {len(chs)} chapters', file=sys.stderr)


if __name__ == '__main__':
    main()
