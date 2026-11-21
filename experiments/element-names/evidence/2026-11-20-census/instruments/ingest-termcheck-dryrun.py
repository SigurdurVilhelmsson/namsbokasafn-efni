"""Turn a term-check dry run's raw output (one JSON line + END-OF-REPORT, as production printed it) into the
committed data file of measurement 14: BÍN form lists become counts, and a _meta block is added.

BÍN is CC BY-SA and is not committed (docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md),
so no list may survive under a `bin` key; this script asserts it. Words in segment text (`magnesíums` in an MT
sentence, say) are the book's own text, not BÍN data, and stay.

Usage (from this folder):
  python3 -I ingest-termcheck-dryrun.py <raw output> <out.json> <script name> "<what>"
"""
import json
import sys

raw_path, out_path, script, what = sys.argv[1:5]
raw = open(raw_path, encoding='utf-8').read().rstrip()
assert raw.endswith('END-OF-REPORT'), 'not a complete run: no END-OF-REPORT marker'
r = json.loads(raw[:-len('END-OF-REPORT')])
assert r['fileUnchanged'] is True, 'the database file changed during the run'


def strip(node, under_bin=False):
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            if under_bin and k == 'forms' and isinstance(v, list):
                out['nForms'] = len(v)
            elif under_bin and k == 'forms' and v is None:
                out['nForms'] = 0
            else:
                out[k] = strip(v, under_bin or k == 'bin')
        return out
    if isinstance(node, list):
        return [strip(x, under_bin) for x in node]
    return node


def assert_clean(node, under_bin=False):
    if isinstance(node, dict):
        for k, v in node.items():
            assert_clean(v, under_bin or k == 'bin')
    elif isinstance(node, list):
        assert not under_bin, 'a list survives under a bin key'
        for x in node:
            assert_clean(x, under_bin)


r = strip(r)
assert_clean(r)
if 'entry' in r:
    assert r['entry']['isTerm']['inflections'] is None, 'state A must show no stored paradigm'
meta = {'measured': '2026-11-21', 'book': r['book'], 'prodHead': r['head'][:9], 'readOnly': True,
        'method': 'the entries were added to an in-memory copy of the database (file opened read-only, serialized, '
                  'reopened from the buffer); the file\'s size and mtime were unchanged after the run, and the '
                  'checkout stayed clean', 'script': f'instruments/{script}', 'what': what}
json.dump({'_meta': meta, **r}, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ingested', out_path)
