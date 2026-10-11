#!/usr/bin/env python3
"""Per-chapter aggregation of classification(.jsonl) -> aggregate-<variant>.json + tables."""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segparse import parse, load, key_of  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
fn = sys.argv[1] if len(sys.argv) > 1 else 'classification.jsonl'
rows = [json.loads(l) for l in open(os.path.join(BASE, fn))]

# rescue set from the second-stage re-wrap rule (computed by rewrap.py logic, recomputed here)
import re  # noqa: E402
from markers import parse as bp, walk, serialize, legacy_to_bracket, Marker  # noqa: E402
from convert import convert  # noqa: E402
_cache = {}


def seg(tag, chdir, mod, key):
    k = (tag, chdir, mod)
    if k not in _cache:
        _cache[k] = {key_of(x): t for x, t in parse(load(BASE, tag, chdir, mod))}
    return _cache[k].get(key)


def _vis(nodes):
    return ''.join(n if isinstance(n, str) else _vis(n.children) for n in nodes)


def rewrap_rescues(r):
    if r.get('conv_status') != 'fallback' or not r['conv_reasons'][0].startswith('kind-count-mismatch'):
        return False
    en = seg('new_en', r['chdir'], r['module'], r['key'])
    out, _ = legacy_to_bracket(r['june_is_raw'], en.count('*'))
    runs, cur = [], []
    for n in bp(en) + ['\0']:
        if isinstance(n, Marker) and n.kind in {'i', 'b', 'sub', 'sup'}:
            cur.append(n)
        else:
            if cur:
                runs.append(cur)
                cur = []
    for run in runs:
        text, markup = _vis(run), serialize(run)
        if markup in out:
            continue
        hits = list(re.finditer(r'(?<![\w\[|:])' + re.escape(text) + r'(?![\w\]|])', out))
        if len(hits) == 1:
            out = out[:hits[0].start()] + markup + out[hits[0].end():]
    c = convert(out, en, seg('astrans_en', r['chdir'], r['module'], r['source_key']))
    return c['status'] == 'clean'


def chap(r):
    return r['chdir']


ORDER = ['ch00'] + [f'ch{n:02d}' for n in range(1, 22)] + ['appendices']
agg = collections.OrderedDict()
for ch in ORDER + ['ALL ch01-ch21', 'ALL']:
    agg[ch] = collections.Counter()


def add(ch, key, v=1):
    agg[ch][key] += v
    if ch.startswith('ch') and ch != 'ch00':
        agg['ALL ch01-ch21'][key] += v
    agg['ALL'][key] += v


for r in rows:
    ch = chap(r)
    cls = r['class'][0]
    sub = r.get('sub') or ''
    ext = None  # extended carriable class label
    if cls == '1':
        ext = '1'
    elif cls == '3':
        ext = '3'
    elif cls == '2' and r.get('source_key'):
        ext = '2r'   # shift / unique elsewhere, recovered
    elif cls == '4' and r.get('source_key'):
        ext = '4r'   # multi-match resolved by alignment
    add(ch, 'segments')
    add(ch, f'class{cls}')
    add(ch, 'en_chars', r['en_chars'])
    add(ch, 'is_chars', r['is_chars'])
    if r['type'] not in ('alt', 'table-summary'):
        add(ch, 'segments_noalt')
        add(ch, 'en_chars_noalt', r['en_chars'])
        add(ch, 'is_chars_noalt', r['is_chars'])
    if cls == '4' and not r.get('source_key'):
        add(ch, f'class4_none_{r["type"]}')
    if cls == '2' and not r.get('source_key'):
        add(ch, 'class2_unrecoverable')
    if ext:
        strict = ext in ('1', '3')
        clean = r.get('conv_status') == 'clean'
        rescued = (not clean) and rewrap_rescues(r)
        for tag, on in (('strict', strict), ('ext', True)):
            if not on:
                continue
            add(ch, f'{tag}_carriable')
            if r.get('needs_conversion'):
                add(ch, f'{tag}_needs_conversion')
            if clean:
                add(ch, f'{tag}_clean')
                add(ch, f'{tag}_clean_en_chars', r['en_chars'])
                add(ch, f'{tag}_clean_is_chars', r['is_chars'])
                if r['type'] not in ('alt', 'table-summary'):
                    add(ch, f'{tag}_clean_en_chars_noalt', r['en_chars'])
                if r.get('needs_conversion'):
                    add(ch, f'{tag}_clean_converted')
                else:
                    add(ch, f'{tag}_clean_noconv')
                if r['carried_is'] == seg('new_is', r['chdir'], r['module'], r['key']):
                    add(ch, f'{tag}_clean_identical_to_new_is')
            else:
                add(ch, f'{tag}_fallback')
                reason = r['conv_reasons'][0].split(':')[0]
                add(ch, f'{tag}_fallback_{reason}')
                if rescued:
                    add(ch, f'{tag}_rescued_by_rewrap')
                    add(ch, f'{tag}_rescued_en_chars', r['en_chars'])
            if r.get('hand_repair'):
                add(ch, f'{tag}_hand_repair_collisions')
                if not r['hand_repair']['june_is_equals_repair']:
                    add(ch, f'{tag}_hand_repair_would_undo')
    if r.get('hand_repair'):
        add(ch, 'hand_repaired_keys')

out = {ch: dict(c) for ch, c in agg.items()}
json.dump(out, open(os.path.join(BASE, 'aggregate-' + fn.replace('.jsonl', '.json')), 'w'), indent=1)


def pct(a, b):
    return f'{100.0 * a / b:5.1f}' if b else '  n/a'


print(f'{"chapter":13s} {"segs":>6s} {"c1":>6s} {"c2":>5s} {"c3":>4s} {"c4":>5s} | {"strict":>6s} {"clean":>6s} {"%":>5s} | {"ext":>6s} {"clean":>6s} {"%seg":>5s} {"fb":>3s} {"resc":>4s} | {"%EN":>5s} {"%ENna":>5s} {"%IS":>5s} | {"conv":>5s} {"same":>5s} {"HRund":>5s}')
for ch, c in agg.items():
    print(f'{ch:13s} {c["segments"]:6d} {c["class1"]:6d} {c["class2"]:5d} {c["class3"]:4d} {c["class4"]:5d} | '
          f'{c["strict_carriable"]:6d} {c["strict_clean"]:6d} {pct(c["strict_clean"], c["segments"])} | '
          f'{c["ext_carriable"]:6d} {c["ext_clean"]:6d} {pct(c["ext_clean"], c["segments"])} {c["ext_fallback"]:3d} {c["ext_rescued_by_rewrap"]:4d} | '
          f'{pct(c["ext_clean_en_chars"], c["en_chars"])} {pct(c["ext_clean_en_chars_noalt"], c["en_chars_noalt"])} {pct(c["ext_clean_is_chars"], c["is_chars"])} | '
          f'{c["ext_clean_converted"]:5d} {c["ext_clean_identical_to_new_is"]:5d} {c["ext_hand_repair_would_undo"]:5d}')
