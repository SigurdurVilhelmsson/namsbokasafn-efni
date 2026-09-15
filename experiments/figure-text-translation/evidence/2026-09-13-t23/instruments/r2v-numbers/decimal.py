#!/usr/bin/env python3
"""Decimal toggle, both directions, from items.json (kept = path != 'layout').
- changed kept items between V5_p2.0_f7.5 and _dec: count, fields that differ, char-level diff only '.'->','
- per-figure counts, value multiset vs c9's inherited 35-value list (c9-decimal.md, Population A)
- MISS direction: any digit-flanked '.' left in a kept item of the dec run (and positive control: the same scan on the
  non-dec run must find the 35); also thousands-group commas and bare 'N.' fragments in kept items
- layout items: untouched by the toggle
- report multisets (compose-report blocks/missing/translated/identity/runExact) unchanged, and 'decimal' entries count
- regex pattern strings in r2dec.py vs c9/rules_eval.py
"""
import json, re, collections, sys, ast
from pathlib import Path
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; PREP = ROOT / 'prep'
names = [f['basename'] for f in json.loads((PREP / 'manifest.json').read_text())['figures']]
C9 = (['1.008'] * 4 + ['12.01'] * 4 + ['16.00'] * 3 + ['35.45'] * 3 + ['14.007'] * 2 + ['22.99'] * 2 +
      ['26.98', '32.06', '53.96', '96.18', '192.00', '342.14', '108.09', '8.064', '64.00', '180.15', '106.35', '119.37',
       '24.02', '5.040', '32.00', '75.07', '58.44'])
assert len(C9) == 35
C9FIG = {'CNX_Chem_03_01_alsulfatemass_img': 7, 'CNX_Chem_03_01_aspirin': 7, 'CNX_Chem_03_01_chloroform': 7,
         'CNX_Chem_03_01_glycinemass_img': 9, 'CNX_Chem_03_01_saltMass': 5}
changed = []; perfig = collections.Counter(); other_field = []; not_dot_comma = []
miss_dec = []; ctrl_off = []; th_left = []; frag_left = []; layout_diff = 0; rep_bad = []; dec_entries = 0
DD = re.compile(r'(?<=\d)\.(?=\d)')
for b in names:
    off = json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'items.json').read_text())
    on = json.loads((R2 / 'work/V5_p2.0_f7.5_dec' / b / 'items.json').read_text())
    ko = [i for i in off if i['path'] != 'layout']; kn = [i for i in on if i['path'] != 'layout']
    assert len(ko) == len(kn)
    for a, c in zip(ko, kn):
        if a != c:
            fields = [f for f in set(a) | set(c) if a.get(f) != c.get(f)]
            if fields != ['text']:
                other_field.append((b, fields))
            if len(a['text']) != len(c['text']) or any(x != y and not (x == '.' and y == ',') for x, y in zip(a['text'], c['text'])):
                not_dot_comma.append((b, a['text'], c['text']))
            changed.append((b, a['text'], c['text'])); perfig[b] += 1
    for i in kn:
        if DD.search(i['text']): miss_dec.append((b, i['text']))
        if re.search(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d,])', i['text']): th_left.append((b, i['text']))
        if re.fullmatch(r'\s*\d+\.\s*', i['text']): frag_left.append((b, i['text']))
    for i in ko:
        if DD.search(i['text']): ctrl_off.append((b, i['text']))
    lo = [i for i in off if i['path'] == 'layout']; ln = [i for i in on if i['path'] == 'layout']
    layout_diff += lo != ln
    ro = json.loads((R2 / 'work/V5_p2.0_f7.5' / b / 'compose-report.json').read_text())
    rn = json.loads((R2 / 'work/V5_p2.0_f7.5_dec' / b / 'compose-report.json').read_text())
    pr = json.loads((PREP / 'figs' / b / 'compose-report.json').read_text())
    for k in ('blocks', 'missing', 'translated', 'identity', 'runExact'):
        if not (ro[k] == rn[k] == pr[k]):
            rep_bad.append((b, k))
    dec_entries += len(rn.get('decimal', []))
    if ro.get('decimal'):
        rep_bad.append((b, 'decimal entries in the OFF run', len(ro['decimal'])))
print('kept items changed by the toggle:', len(changed))
print('per figure:', {k.replace('CNX_Chem_', ''): v for k, v in perfig.items()}, 'equals c9 per-figure:', dict(perfig) == C9FIG)
print('changed-in-other-fields:', other_field, ' non-dot->comma char changes:', not_dot_comma)
print('value multiset == c9 35:', sorted(a for _, a, _ in changed) == sorted(C9), 'extra', sorted((collections.Counter(a for _, a, _ in changed) - collections.Counter(C9)).elements()), 'missing', sorted((collections.Counter(C9) - collections.Counter(a for _, a, _ in changed)).elements()))
print('MISS scan dec run, digit-flanked "." left in kept items:', len(miss_dec), miss_dec[:10])
print('positive control, same scan on the OFF run:', len(ctrl_off))
print('thousands-group commas left in kept items (dec run):', th_left, ' bare N. fragments:', frag_left)
print('layout items differ on/off (figures):', layout_diff, ' report multisets bad:', rep_bad, ' decimal report entries (on):', dec_entries)
# translated (layout) decimals are out of the toggle's scope; list any digit-flanked '.' drawn in layout items
lay = []
for b in names:
    for i in json.loads((R2 / 'work/V5_p2.0_f7.5_dec' / b / 'items.json').read_text()):
        if i['path'] == 'layout' and (DD.search(i['text']) or re.search(r'\d,\d', i['text'])):
            lay.append((b.replace('CNX_Chem_', ''), i['text']))
print('layout (translated) items holding a digit-flanked separator (out of scope, for the record):', lay)
# regex strings
src_r2 = (R2 / 'tree/r2dec.py').read_text(); src_c9 = (ROOT / 'c9/rules_eval.py').read_text()
def pats(src):
    return sorted(set(re.findall(r"r'([^']*)'", src)))
p2, p9 = pats(src_r2), pats(src_c9)
print('raw-regex strings in r2dec not in c9:', [p for p in p2 if p not in p9])
print('c9 R2/R3/TUPLE regexes not in r2dec:', [p for p in p9 if p not in p2 and p in (r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?=(?:\.\d+)?(?![\d,]))', r'(?<=\d)\.(?=\d)', r'\d\.\d+\s*,\s*[–−-]?\d', r'\s*\d+\.\s*', r'(?<=\d)\.')])
