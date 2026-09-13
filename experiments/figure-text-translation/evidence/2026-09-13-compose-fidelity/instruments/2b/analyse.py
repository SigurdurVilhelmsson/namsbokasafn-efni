#!/usr/bin/env python3
"""2b: translated blocks - source formatting census + transfer feasibility.

Read-only. Imports COPIES of figtext.py / blockkey.py (scratchpad/2b/lib), byte-identical
to the repo's (cmp'd in the shell before running). Writes one JSONL row per DRAWN block
(all states; translated rows carry `first` = first occurrence of that key in the figure).
"""
import sys, json, re, collections, unicodedata, statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'lib'))
import figtext as FT
from blockkey import block_key

S = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/d293cd29-19d8-4ccc-a2b3-244bf111501b/scratchpad')
PREP = S / 'prep'
SIDECAR = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
OUTJ = S / 'findings' / '2b-translated.jsonl'

SCRIPT_RATIO = 0.9     # a run this much smaller than the line's base size is "script-sized"
SHIFT_FRAC = 0.12      # baseline shift (fraction of base size) that makes it sub/sup


def font_style(meta, fk):
    base = meta['fonts'].get(fk, {}).get('base', '').lower()
    return ('italic' in base or 'oblique' in base, 'bold' in base,
            'stix' in base or 'symbol' in base)


def char_attrs(line, meta):
    """Per-character attribute list for one visual line, aligned with ''.join(texts)."""
    # BASE size: the size carrying the most LETTERS (element symbols / words sit on the
    # baseline; digits and charges are what get scripted). Weighting by all chars
    # mis-based 'C8H18' on its 7pt digits (3 of 5 chars) - measured in run 1, fixed.
    by_size = collections.Counter()
    for r in line:
        by_size[round(r['size'], 1)] += sum(c.isalpha() for c in r['text'])
    if not any(by_size.values()):
        by_size = collections.Counter()
        for r in line:
            by_size[round(r['size'], 1)] += max(1, len(r['text']))
    base_size = max(by_size.items(), key=lambda kv: (kv[1], kv[0]))[0]
    base_runs = [r for r in line if abs(r['size'] - base_size) < 0.2]
    base_proj = statistics.median(FT.proj(r) for r in base_runs)
    out = []
    for r in line:
        it, bd, sym = font_style(meta, r['font'])
        shift = FT.proj(r) - base_proj
        small = r['size'] < SCRIPT_RATIO * base_size
        if shift < -SHIFT_FRAC * base_size:
            sc = 'sub'
        elif shift > SHIFT_FRAC * base_size:
            sc = 'sup'
        elif small:
            sc = 'small'
        else:
            sc = None
        a, b, c, d = r['tm'][:4] if r.get('tm') else (1, 0, 0, 1)
        shear = abs(a * c + b * d) / max(1e-9, (a * a + b * b)) if (a or b) else 0.0
        for ch in r['text']:
            out.append(dict(ch=ch, script=sc, italic=it, bold=bd, sym=sym, size=r['size'],
                            fill=tuple(r['fill']) if r.get('fill') else None,
                            shear=round(shear, 3)))
    return out, base_size


def mask(attrs):
    m = []
    for a in attrs:
        if a['script'] == 'sub': m.append('v')
        elif a['script'] == 'sup': m.append('^')
        elif a['italic']: m.append('i')
        elif a['script'] == 'small': m.append('s')
        else: m.append('.')
    return ''.join(m)


def is_formatted(a):
    return a['script'] in ('sub', 'sup') or a['italic']


EDGE_PUNCT = ',.;:!?'   # sentence punctuation, never part of a formula ('(' ')' '+' '–' are)


def tokens(attrs):
    """Formatted source tokens: maximal non-whitespace stretches that contain a script or
    italic char, with sentence punctuation trimmed off both edges (only if unformatted)."""
    spans, i, n = [], 0, len(attrs)
    while i < n:
        if attrs[i]['ch'].isspace():
            i += 1; continue
        j = i
        while j < n and not attrs[j]['ch'].isspace():
            j += 1
        s_, e_ = i, j
        while s_ < e_ and attrs[s_]['ch'] in EDGE_PUNCT and not is_formatted(attrs[s_]):
            s_ += 1
        while e_ > s_ and attrs[e_ - 1]['ch'] in EDGE_PUNCT and not is_formatted(attrs[e_ - 1]):
            e_ -= 1
        if any(is_formatted(a) for a in attrs[s_:e_]):
            spans.append((s_, e_))
        i = j
    return spans


def stretches(m):
    """maximal runs of formatted mask chars inside a token mask -> (start, end, kind)"""
    out = []
    for mm in re.finditer(r'v+|\^+|i+', m):
        out.append((mm.start(), mm.end(), mm.group()[0]))
    return out


DASHES = '–−‐‑‒—-'
SUBS = str.maketrans('₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻', '0123456789' '0123456789' '+-')


def norm(t):
    t = unicodedata.normalize('NFKC', t).translate(SUBS)
    t = re.sub('[' + re.escape(DASHES) + ']', '-', t)
    return re.sub(r'\s+', '', t)


def occurrences(hay, needle):
    pos, i = [], hay.find(needle)
    while i >= 0:
        pos.append(i); i = hay.find(needle, i + 1)
    return pos


def is_clean(hay, i, n):
    """clean = the occurrence is not glued to a LETTER or DIGIT on either side.
    ('CO2-sameindir' -> 'CO2' clean; 'CO2' contains 'O2' -> embedded.)"""
    before = hay[i - 1] if i > 0 else ''
    after = hay[i + n] if i + n < len(hay) else ''
    return not (before.isalnum() or after.isalnum())


def match_token(tok, tmask, value):
    """Tiered: exact (with clean/embedded split) > modified (normalised) >
    anchored-script (the formatted stretches, each with its left base char, survive) > vanished."""
    occ = occurrences(value, tok)
    if occ:
        clean = sum(is_clean(value, i, len(tok)) for i in occ)
        return dict(kind='exact', n=len(occ), clean=clean, embedded=len(occ) - clean)
    nv, nt = norm(value), norm(tok)
    if nt and nt in nv:
        why = []
        if tok in re.sub(r'\s+', '', value): why.append('whitespace')
        if norm(tok) != re.sub(r'\s+', '', tok) or norm(value) != re.sub(r'\s+', '', value):
            why.append('dash/unicode')
        return dict(kind='modified', n=nv.count(nt), why=why or ['nfkc'])
    if nt.lower() in nv.lower():
        return dict(kind='modified', n=nv.lower().count(nt.lower()), why=['case'])
    anch = []
    for s_, e_, k in stretches(tmask):
        left = tok[s_ - 1] if s_ > 0 else ''
        needle = left + tok[s_:e_]
        anch.append(dict(needle=needle, kind=k, n=len(occurrences(value, needle))))
    if anch and all(a['n'] >= 1 for a in anch):
        return dict(kind='anchored', stretches=anch)
    return dict(kind='vanished', n=0, stretches=anch)


def line_gaps(line, attrs):
    """literal multi-space runs, and geometric gaps (runs spaced apart with no space char)"""
    s = ''.join(a['ch'] for a in attrs)
    lit = [(m.start(), m.end() - m.start()) for m in re.finditer(' {2,}', s)]
    geo, alongs = [], []
    for p, r in zip(line, line[1:]):
        g = FT.along(r) - FT.along(p) - p['adv']
        alongs.append(g)
        if g > 0.3 * max(p['size'], r['size']) and not (p['text'][-1:].isspace() or r['text'][:1].isspace()):
            geo.append(dict(after=p['text'], before=r['text'], gap_pt=round(g, 2)))
    return lit, geo, s, alongs


def describe_block(b, meta):
    arc = FT.is_arc(b)
    ls = [b] if arc else FT.lines(b)
    row = dict(arc=arc, lines=len(ls), script=False, italic=False, bold=False, symfont=False,
               max_shear=0.0, masks=[], multispace=[], geogaps=[], tokens=[],
               bold_by_line=[], fill_by_line=[], mixed_bold_in_line=False, mixed_fill_in_line=False,
               max_along_gap=None)
    allg = []
    for li, l in enumerate(ls):
        attrs, base = char_attrs(l, meta)
        row['masks'].append(mask(attrs))
        row['script'] |= any(a['script'] in ('sub', 'sup') for a in attrs)
        row['italic'] |= any(a['italic'] for a in attrs)
        row['bold'] |= any(a['bold'] for a in attrs)
        row['symfont'] |= any(a['sym'] for a in attrs)
        row['max_shear'] = max([row['max_shear']] + [a['shear'] for a in attrs])
        vis = [a for a in attrs if not a['ch'].isspace()]
        bset = {a['bold'] for a in vis}; fset = {a['fill'] for a in vis}
        row['bold_by_line'].append(sorted(bset))
        row['fill_by_line'].append(len(fset))
        row['mixed_bold_in_line'] |= len(bset) > 1
        row['mixed_fill_in_line'] |= len(fset) > 1
        s = ''.join(a['ch'] for a in attrs)
        for s_, e_ in tokens(attrs):
            row['tokens'].append(dict(line=li, text=s[s_:e_], mask=mask(attrs[s_:e_])))
        lit, geo, s2, alongs = line_gaps(l, attrs)
        allg += alongs
        row['multispace'] += [dict(line=li, at=i, spaces=n, context=s2[max(0, i - 12):i + n + 12]) for i, n in lit]
        row['geogaps'] += [dict(line=li, **g) for g in geo]
    row['max_along_gap'] = round(max(allg), 2) if allg else None
    # first line's first run decides font+colour for wrapped line j via ls[min(j, len-1)][0]
    row['line_first_run_bold'] = [bool(font_style(meta, l[0]['font'])[1]) for l in ls]
    row['line_first_run_fill'] = [l[0].get('fill') for l in ls]
    return row


def main():
    names = (PREP / 'bought.txt').read_text().split()
    rows, keycheck = [], []
    OUTJ.parent.mkdir(exist_ok=True)
    with OUTJ.open('w') as fo:
        for bn in names:
            d = PREP / bn
            runs = json.loads((d / 'runs.json').read_text())
            meta = json.loads((d / 'meta.json').read_text())
            prepared = json.loads((d / 'blocks.json').read_text())
            sc = json.loads((SIDECAR / f'{bn}.is.json').read_text())['blocks']
            blocks = FT.merge_blocks(FT.group(runs))
            keys = [block_key(b) for b in blocks]
            keycheck.append((bn, collections.Counter(keys) == collections.Counter(p['key'] for p in prepared),
                             set(sc) == {p['key'] for p in prepared if p['send']}, len(keys)))
            seen = set()
            for bi, b in enumerate(blocks):
                key = keys[bi]
                state = ('never-sent' if key not in sc else
                         'identical' if sc[key] == key else 'translated')
                row = dict(basename=bn, block=bi, key=key, state=state, value=sc.get(key),
                           first=key not in seen)
                seen.add(key)
                row.update(describe_block(b, meta))
                if state != 'never-sent':
                    v = sc[key]
                    for t in row['tokens']:
                        t['match'] = match_token(t['text'], t['mask'], v)
                        t['en_occ'] = len(occurrences(key, t['text']))
                        t['en_occ_clean'] = sum(is_clean(key, i, len(t['text'])) for i in occurrences(key, t['text']))
                    row['value_multispace'] = [len(m.group()) for m in re.finditer(' {2,}', v)]
                fo.write(json.dumps(row, ensure_ascii=False) + '\n')
                rows.append(row)
    return rows, keycheck


if __name__ == '__main__':
    rows, keycheck = main()
    bad = [k for k in keycheck if not (k[1] and k[2])]
    print('figures', len(keycheck), 'key-multiset / sent-set mismatches', bad)
    c = collections.Counter(r['state'] for r in rows)
    print('drawn blocks', len(rows), dict(c))
