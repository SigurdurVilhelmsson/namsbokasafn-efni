#!/usr/bin/env python3
"""Per-chapter terminology-repair burden under three bases (JUNE / NEW / HYBRID).

Decided terms: (a) [USER]'s 104 review-page answers (target = targetIcelandic); (b) house-style
rulings whose English form equals a chapter's key-terms headword after measure.py's norm_en
(the comparison measure.py's ruling_for() calls exact), not already in (a).
Undecided (c): key-terms entries that differ between vintages, no target.

Uses measure.py's own plain/norm_en/en_pattern/stems/carries so the counts are comparable with the
published 2026-10-10 measurement. Read-only on the repository."""
import json, re, sys
from collections import Counter, defaultdict
sys.path.insert(0, sys.argv[1])
import lib
M = lib.M
C, S = lib.load(sys.argv[2])
T = json.load(open(sys.argv[3]))
VAR = json.load(open(sys.argv[4]))
OUT = sys.argv[5]
terms = T['terms']
GLOSS = ('glossary-term:', 'glossary-def:')

# citation-form lexicon: every word of every key-terms entry, both vintages (for the ending rule)
LEX = set()
for t in terms:
    for K in (t['Kold'], t['Knew']):
        if K: LEX.update(M.stems(K))

def build_segments(ch):
    segs = {'june': [], 'new': [], 'hybrid': []}
    for m in C['modules'][ch]['new']:
        en_o, is_o = S[(ch, m, 'old')]; en_n, is_n = S[(ch, m, 'new')]
        for k, e in en_o.items():
            if k.startswith(GLOSS) or k not in is_o: continue
            segs['june'].append({'mod': m, 'key': k, 'en': e, 'is': is_o[k], 'src': 'june',
                                 'common': k in en_n and k in is_n})
        for k, e in en_n.items():
            if k.startswith(GLOSS) or k not in is_n: continue
            common = k in en_o and k in is_o
            same = common and lib.norm_en_seg(en_o[k]) == lib.norm_en_seg(e)
            segs['new'].append({'mod': m, 'key': k, 'en': e, 'is': is_n[k], 'src': 'new', 'common': common})
            segs['hybrid'].append({'mod': m, 'key': k, 'en': e, 'is': is_o[k] if same else is_n[k],
                                   'src': 'june' if same else 'new', 'common': common})
    for b in segs:
        for s in segs[b]:
            s['plainEn'] = M.plain(s['en'])
    return segs

def headword(t, base):
    """The key-terms entry a base shows for this definition id."""
    if base == 'june': return t['Kold'], 'june'
    if base == 'new': return t['Knew'], 'new'
    eo, en = t.get('enOld'), None
    ch, m, key = t['chapter'], t['module'], t['key']
    en_o, is_o = S[(ch, m, 'old')]; en_n, is_n = S[(ch, m, 'new')]
    if key in en_o and key in is_o and lib.norm_en_seg(en_o[key]) == lib.norm_en_seg(en_n[key]):
        return t['Kold'], 'june'
    return t['Knew'], 'new'

def last2(form):
    st = M.stems(form)
    return st[-1][-2:] if st else ''

def competing(t, target):
    tst = M.stems(target)
    out = []
    for f, src, n in VAR[f"{t['chapter']}|{t['definitionId']}"]:
        if not M.stems(f): continue
        if M.norm_en(f) == M.norm_en(target): continue
        if M.carries(f, tst): continue          # the variant itself carries the target: not competing
        cit = (not src.startswith('defsite')) or M.stems(f)[-1] in LEX
        out.append({'form': f, 'src': src, 'n': n, 'citation': cit, 'stems': M.stems(f)})
    # merge duplicates by normalized form, keep the most authoritative source
    merged = {}
    for v in out:
        k = M.norm_en(v['form'])
        if k not in merged or (v['citation'] and not merged[k]['citation']):
            merged[k] = v
    return list(merged.values())

def classify(is_text, target, comp):
    tst = M.stems(target)
    hit = [v for v in comp if M.carries(is_text, v['stems'])]
    if hit:
        hit.sort(key=lambda v: (-len(v['stems']), not v['citation'], -v['n']))
        v = hit[0]
        cls = 'SWAP-PARALLEL' if last2(v['form']) == last2(target) else 'SWAP-AGREEMENT'
        return cls, v
    toks = re.findall(r'\w+', M.plain(is_text).lower())
    present = [w for w in tst if any(M.word_matches(tk, f) for tk in toks for f in M.word_forms(w))]
    sub = 'PARTIAL' if (len(tst) > 1 and present) else 'NONE'
    return 'ABSENT', {'sub': sub, 'present': present}

records = []          # one per (base, decided term, prose segment needing change)
prose_rows = []       # per (base, term): prose, ok
headword_rows = []
undecided_rows = []
for ch in C['chapters']:
    segs = build_segments(ch)
    chterms = [t for t in terms if t['chapter'] == ch]
    decided_heads = {}
    for t in chterms:
        if t['src'] in ('verdict', 'ruling'):
            decided_heads.setdefault(t['enNorm'], t)
    seen_decided = set(); seen_undec = set()
    for t in chterms:
        # resolve the target: own decision, else a decision on the same headword in this chapter
        target, how = t.get('target'), t['src']
        if t['src'] not in ('verdict', 'ruling') and t['enNorm'] in decided_heads:
            target, how = decided_heads[t['enNorm']]['target'], 'same-headword-in-chapter'
        if target is not None:
            # key-terms headword fix, per base
            for b in ('june', 'new', 'hybrid'):
                K, ksrc = headword(t, b)
                exact_ok = K is not None and M.norm_en(K) == M.norm_en(target)
                carry_ok = K is not None and M.carries(K, M.stems(target))
                headword_rows.append({'base': b, 'chapter': ch, 'definitionId': t['definitionId'], 'en': t['en'],
                                      'target': target, 'K': K, 'Ksrc': ksrc, 'exactOk': exact_ok,
                                      'carriesOk': carry_ok, 'how': how})
            dk = (t['enNorm'], M.norm_en(target))
            if dk in seen_decided: continue      # duplicate headword with the same target: prose counted once
            seen_decided.add(dk)
            pat = M.en_pattern(t['enNorm'])
            comp = competing(t, target)
            tst = M.stems(target)
            for b in ('june', 'new', 'hybrid'):
                n = ok = 0; n_common = ok_common = 0
                for s in segs[b]:
                    if not pat or not pat.search(s['plainEn']): continue
                    n += 1; n_common += s['common']
                    if M.carries(s['is'], tst):
                        ok += 1; ok_common += s['common']; continue
                    cls, info = classify(s['is'], target, comp)
                    rec = {'base': b, 'chapter': ch, 'definitionId': t['definitionId'], 'en': t['en'], 'target': target,
                           'how': how, 'choice': t.get('choice'), 'mod': s['mod'], 'key': s['key'],
                           'segType': s['key'].split(':', 1)[0], 'isSrc': s['src'], 'common': s['common'],
                           'class': cls, 'enText': s['plainEn'][:400], 'isText': M.plain(s['is'])[:400]}
                    if cls.startswith('SWAP'):
                        rec.update({'variant': info['form'], 'variantSrc': info['src'], 'variantCitation': info['citation']})
                    else:
                        rec.update({'absentSub': info['sub'], 'present': info['present']})
                    records.append(rec)
                prose_rows.append({'base': b, 'chapter': ch, 'definitionId': t['definitionId'], 'en': t['en'],
                                   'target': target, 'how': how, 'prose': n, 'ok': ok, 'proseCommon': n_common,
                                   'okCommon': ok_common, 'competing': [v['form'] for v in comp]})
        elif t['changed']:
            uk = t['enNorm']
            if uk in seen_undec: continue
            seen_undec.add(uk)
            pat = M.en_pattern(t['enNorm'])
            so, sn = M.stems(t['Kold'] or ''), M.stems(t['Knew'] or '')
            for b in ('june', 'new', 'hybrid'):
                c = Counter()
                for s in segs[b]:
                    if not pat or not pat.search(s['plainEn']): continue
                    c['prose'] += 1
                    co, cn = M.carries(s['is'], so), M.carries(s['is'], sn)
                    c['both' if co and cn else 'old' if co else 'new' if cn else 'neither'] += 1
                    if s['common']: c['proseCommon'] += 1
                K, ksrc = headword(t, b)
                undecided_rows.append({'base': b, 'chapter': ch, 'definitionId': t['definitionId'], 'en': t['en'],
                                       'Kold': t['Kold'], 'Knew': t['Knew'], 'K': K, 'Ksrc': ksrc, **c})
json.dump({'records': records, 'prose': prose_rows, 'headwords': headword_rows, 'undecided': undecided_rows,
           'complete': True}, open(OUT, 'w'), ensure_ascii=False, indent=0)
print('records', len(records), 'prose rows', len(prose_rows), 'headword rows', len(headword_rows),
      'undecided rows', len(undecided_rows), file=sys.stderr)
