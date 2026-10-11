"""Deterministic June-IS -> NEW-bracket conversion, used here only to MEASURE how many
carriable segments convert cleanly.  Nothing is written to the repository."""
import collections
import copy
from markers import (legacy_to_bracket, residue, parse, walk, serialize, Marker, ParseError,
                     CONTENT_KINDS, EMPTY_KINDS)


def kind_key(m):
    """Kind used for the one-to-one count check.  A self-closing xref/docref and a
    text-bearing one render differently, so they are distinct kinds."""
    if m.kind in ('xref', 'docref'):
        return m.kind + ('-self' if not m.children else '-text')
    return m.kind


def _seq(markers, kind):
    return [m for m in markers if m.kind == kind]


def convert(june_is, new_en, june_en, eq_june=None, eq_new=None):
    """Try to carry `june_is` (translation of `june_en`) onto the NEW English `new_en`.

    Returns dict(status='clean'|'fallback', reasons=[...], flags=[...], needs_conversion=bool,
                 converted=str|None, fired=[...]).
    """
    out = {'status': 'fallback', 'reasons': [], 'flags': [], 'needs_conversion': False,
           'converted': None, 'fired': []}
    lit = new_en.count('*')
    bis, fired = legacy_to_bracket(june_is, lit)
    out['fired'] = fired
    if fired:
        out['needs_conversion'] = True
    res = residue(bis, lit, new_en)
    if res:
        out['reasons'].append('legacy-residue:' + ','.join(res))
        return out
    try:
        is_nodes = parse(bis)
    except ParseError:
        out['reasons'].append('is-parse-error')
        return out
    try:
        en_nodes = parse(new_en)
        jen_nodes = parse(legacy_to_bracket(june_en, lit)[0])
    except ParseError:
        out['reasons'].append('en-parse-error')
        return out
    is_m, en_m, jen_m = walk(is_nodes), walk(en_nodes), walk(jen_nodes)
    cis = collections.Counter(kind_key(m) for m in is_m)
    cen = collections.Counter(kind_key(m) for m in en_m)
    if cis != cen:
        diff = []
        for k in sorted(set(cis) | set(cen)):
            if cis[k] != cen[k]:
                diff.append(f'{k}:{cis[k]}vs{cen[k]}')
        out['reasons'].append('kind-count-mismatch:' + ';'.join(diff))
        return out

    # ---- attribute assignment ---------------------------------------------------
    # MATH / MEDIA: renumber via the ENGLISH alignment (June EN order <-> NEW EN order).
    for kind in ('MATH', 'MEDIA'):
        a = [m.attr for m in _seq(jen_m, kind)]
        b = [m.attr for m in _seq(en_m, kind)]
        ism = _seq(is_m, kind)
        if not ism:
            continue
        if len(a) != len(b):
            out['reasons'].append(f'{kind}-en-count-differs')
            return out
        mp = {}
        for x, y in zip(a, b):
            if x in mp and mp[x] != y:
                out['reasons'].append(f'{kind}-ambiguous-renumber')
                return out
            mp[x] = y
        for m in ism:
            if m.attr not in mp:
                out['reasons'].append(f'{kind}-number-not-in-june-en')
                return out
            if mp[m.attr] != m.attr:
                out['needs_conversion'] = True
            m.attr = mp[m.attr]
        if kind == 'MATH' and eq_june is not None and eq_new is not None:
            for x, y in zip(a, b):
                mj = (eq_june.get(f'math-{x}') or {}).get('mathml')
                mn = (eq_new.get(f'math-{y}') or {}).get('mathml')
                if mj is None or mn is None:
                    out['flags'].append('math-store-missing')
                    break
                if mj != mn:
                    out['flags'].append('math-mathml-differs')
                    break
    # Self-carried targets: xref / docref / link / TABLE -- multisets must agree.
    for kind, key in (('xref-self', None), ('xref-text', None), ('docref-self', None),
                      ('docref-text', None), ('link', None), ('TABLE', None)):
        ia = sorted(m.attr or '' for m in is_m if kind_key(m) == kind)
        ea = sorted(m.attr or '' for m in en_m if kind_key(m) == kind)
        if ia != ea:
            out['reasons'].append(f'{kind}-target-mismatch')
            return out
    # Positional attributes: term / fn / em (and span) -- assign by order.
    for kind in ('term', 'fn', 'em', 'span'):
        ism = _seq(is_m, kind)
        esm = _seq(en_m, kind)
        if not ism:
            continue
        en_attrs = [m.attr for m in esm]
        is_attrs = [m.attr for m in ism]
        if all(x == '?' or x is None for x in is_attrs):
            out['needs_conversion'] = True
            if len(ism) >= 2 and len(set(en_attrs)) > 1:
                out['flags'].append(f'positional-{kind}x{len(ism)}')
            for m, a in zip(ism, en_attrs):
                m.attr = a
        else:
            # already id-bearing (B4-era June MT): ids must be the NEW ids as a set
            if sorted(x or '' for x in is_attrs) != sorted(x or '' for x in en_attrs):
                if len(ism) >= 2 and len(set(en_attrs)) > 1:
                    out['flags'].append(f'positional-{kind}x{len(ism)}')
                out['flags'].append(f'{kind}-ids-renumbered')
                out['needs_conversion'] = True
                for m, a in zip(ism, en_attrs):
                    m.attr = a
    # soft check: sub/sup CONTENT multisets (chemical subscripts are language-neutral)
    for kind in ('sub', 'sup'):
        ic = sorted(serialize(m.children) for m in _seq(is_m, kind))
        ec = sorted(serialize(m.children) for m in _seq(en_m, kind))
        if ic != ec:
            out['flags'].append(f'{kind}-content-differs')
    conv = serialize(is_nodes)
    if '|?]]' in conv:
        out['reasons'].append('unassigned-attr')
        return out
    # final re-parse + kind check of the converted text
    try:
        c2 = collections.Counter(kind_key(m) for m in walk(parse(conv)))
    except ParseError:
        out['reasons'].append('converted-parse-error')
        return out
    if c2 != cen:
        out['reasons'].append('converted-kind-mismatch')
        return out
    out['status'] = 'clean'
    out['converted'] = conv
    return out
