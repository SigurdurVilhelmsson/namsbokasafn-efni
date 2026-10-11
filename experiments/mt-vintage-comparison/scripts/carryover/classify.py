#!/usr/bin/env python3
"""Per-segment carry-over classification of NEW chemistry segments against the June MT.

Unit: unique segment key (type:elementId) per module, FIRST occurrence (mirrors
tools/lib/seg-markers.cjs parseSegmentsMap 'first').  The 285 duplicate occurrences are
present identically in all five corpora and are not classified separately.

Comparators for the June English:
  astrans = EN at the commit that last modified the June IS file (the English the June MT
            consumed; differs in raw text from the June-ref EN on 1,562 keys, visible text on 2)
  jref    = EN at the June ref 9a69414d5
Class 1 requires visible(NEW) == visible(astrans) == visible(jref).

Writes classification.jsonl and aggregate.json in this directory.
"""
import collections
import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segparse import parse as seg_parse, load, key_of  # noqa: E402
from markers import visible, loose  # noqa: E402
from convert import convert  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
MATHRES = '--math-resolved' in sys.argv
import hashlib
meta = json.load(open(os.path.join(BASE, 'raw', 'meta.json')))
hand = json.load(open(os.path.join(BASE, 'handrepair_keys.json')))
hand_keys = {(o['module'], o['key']): o for o in hand}

TOKEN = re.compile(r'⟦[^⟧]*⟧')


def chars(v):
    """Prose characters of a normalized visible text: placeholder and self-closing-link
    tokens removed, whitespace collapsed."""
    return len(re.sub(r'\s+', ' ', TOKEN.sub(' ', v)).strip())


def segmap(tag, r):
    d = {}
    order = []
    for s, t in seg_parse(load(BASE, tag, r['chdir'], r['module'])):
        k = key_of(s)
        if k not in d:
            d[k] = t
            order.append(k)
    return d, order


def eqstore(tag, r):
    p = os.path.join(BASE, 'raw', f'struct_{tag}', r['chdir'], f"{r['module']}-equations.json")
    return json.load(open(p)) if os.path.exists(p) else None


def resolver(store):
    if not MATHRES:
        return None
    def f(n):
        mm = ((store or {}).get(f'math-{n}') or {}).get('mathml')
        return hashlib.sha1(mm.encode()).hexdigest()[:10] if mm else f'missing-{n}'
    return f


def june_variants(text, res=None):
    """visible() of a June segment under both asterisk readings (see check in main)."""
    n = text.count('*')
    if n == 0:
        v = visible(text, 0, res)
        return {'conv': v, 'lit': v, 'n': 0}
    return {'conv': visible(text, 0, res), 'lit': visible(text, n, res), 'n': n}


def pick(var, lit_count):
    return var['lit'] if var['n'] <= lit_count else var['conv']


rows = []
for r in meta:
    chdir, mod = r['chdir'], r['module']
    NEN, norder = segmap('new_en', r)
    NIS, _ = segmap('new_is', r)
    AEN, jorder = segmap('astrans_en', r)
    JEN, _ = segmap('june_en', r)
    JIS, _ = segmap('june_is', r)
    eq_a, eq_n = eqstore('astrans', r), eqstore('new', r)

    # June visible texts (both asterisk readings) for text matching
    res_a, res_n = resolver(eq_a), resolver(eq_n)
    eq_j = eqstore('june', r)
    res_j = resolver(eq_j)
    AV = {k: june_variants(AEN[k], res_a) for k in jorder}

    # NEW visible texts
    NV = {k: visible(NEN[k], NEN[k].count('*'), res_n) for k in norder}

    # sequence alignment NEW order <-> June order on normalized text (astrans, literal reading
    # chosen per NEW segment is not possible inside SequenceMatcher; use the 'lit' reading
    # when the NEW counterpart would pick it -- approximated by the NEW text at the same key
    # if present, else 'conv')
    def jtext_for_align(k):
        lit = NEN[k].count('*') if k in NEN else 0
        return pick(AV[k], lit)
    a_seq = [jtext_for_align(k) for k in jorder]
    b_seq = [NV[k] for k in norder]
    sm = difflib.SequenceMatcher(None, a_seq, b_seq, autojunk=False)
    aligned = {}
    for blk in sm.get_matching_blocks():
        for t in range(blk.size):
            aligned[norder[blk.b + t]] = jorder[blk.a + t]

    # index of June visible text -> keys (for class 3), per asterisk reading
    idx_conv = collections.defaultdict(list)
    idx_lit = collections.defaultdict(list)
    for k in jorder:
        idx_conv[AV[k]['conv']].append(k)
        idx_lit[AV[k]['lit']].append(k)

    for pos, k in enumerate(norder):
        new_en, new_is = NEN[k], NIS.get(k)
        lit = new_en.count('*')
        vn = NV[k]
        stype = k.split(':')[0]
        row = {
            'chdir': chdir, 'module': mod, 'key': k, 'type': stype,
            'en_chars': chars(vn),
            'is_chars': chars(visible(new_is, new_is.count('*'))) if new_is else 0,
            'has_new_is': new_is is not None,
            'hand_repair': None,
        }
        hr = hand_keys.get((mod, k))
        if hr:
            row['hand_repair'] = {'commit': hr['commit'], 'date': hr['date'],
                                  'june_is_equals_repair': JIS.get(k) == hr['after']}
        source_key = None
        if k in JIS:
            va = pick(AV[k], lit)
            vj = visible(JEN[k], lit, res_j)
            row['agree_astrans'] = va == vn
            row['agree_jref'] = vj == vn
            if va == vn and vj == vn:
                row['class'] = '1-same-key-same-en'
                source_key = k
            elif va == vn and vj != vn:
                row['class'] = '1-same-key-same-en'
                row['note'] = 'june-ref EN differs but as-translated EN equals NEW'
                source_key = k
            elif vj == vn and va != vn:
                row['class'] = '2-same-key-en-changed'
                row['sub'] = 'as-translated-differs (IS translates different English)'
            else:
                row['class'] = '2-same-key-en-changed'
                row['loose_equal'] = loose(va) == loose(vn)
                al = aligned.get(k)
                if al is not None and al != k:
                    row['sub'] = 'shift-recoverable-by-alignment'
                    row['aligned_june_key'] = al
                    source_key = al
                else:
                    # does the NEW text exist elsewhere in June exactly once?
                    m = sorted(set(idx_conv.get(vn, [])) | set(idx_lit.get(vn, [])))
                    m = [x for x in m if x != k and pick(AV[x], lit) == vn]
                    row['sub'] = 'content-changed' if not m else f'text-elsewhere-x{len(m)}'
                    if len(m) == 1:
                        row['sub'] = 'text-elsewhere-unique'
                        row['aligned_june_key'] = m[0]
                        source_key = m[0]
                row['june_vis'] = va[:300]
                row['new_vis'] = vn[:300]
        else:
            # key absent in June: unique text match in the same module
            m = sorted(set(idx_conv.get(vn, [])) | set(idx_lit.get(vn, [])))
            m = [x for x in m if pick(AV[x], lit) == vn]
            if len(m) == 1:
                row['class'] = '3-text-match-other-key'
                row['matched_june_key'] = m[0]
                source_key = m[0]
            else:
                row['class'] = '4-no-june'
                al = aligned.get(k)
                if len(m) > 1:
                    row['sub'] = f'multi-match-x{len(m)}'
                    if al is not None and al in m:
                        row['sub'] += '+alignment-resolves'
                        row['aligned_june_key'] = al
                        source_key = al
                else:
                    row['sub'] = 'none'
        row['source_key'] = source_key
        if source_key is not None:
            c = convert(JIS[source_key], new_en, AEN[source_key], eq_a, eq_n)
            row['conv_status'] = c['status']
            row['conv_reasons'] = c['reasons']
            row['conv_flags'] = c['flags']
            row['needs_conversion'] = c['needs_conversion']
            row['conv_fired'] = c['fired']
            row['carried_is'] = c['converted']
            row['june_is_raw'] = JIS[source_key]
            row['june_is_chars'] = chars(visible(JIS[source_key], lit))
        rows.append(row)

with open(os.path.join(BASE, 'classification-mathres.jsonl' if MATHRES else 'classification.jsonl'), 'w', encoding='utf-8') as f:
    for row in rows:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
print('rows', len(rows))
