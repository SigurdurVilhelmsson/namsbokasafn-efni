"""Parse the Vísindavefur element table (argv[1]) and compare with the prod resolver report (argv[2]).
Writes comparison JSON to argv[3].
Usage (from this folder): python3 -I compare.py page.html ../data/resolver-121-names.json out.json
Fetch the page first: curl -sS -o page.html 'https://www.visindavefur.is/svar.php?id=89909'"""
import html
import json
import re
import sys
import unicodedata

page = open(sys.argv[1], encoding='utf-8').read()
rows = re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.S | re.I)
table = {}
copies = {}
for r in rows:
    cells = [unicodedata.normalize('NFC', html.unescape(re.sub(r'<[^>]+>', '', c)).strip())
             for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S | re.I)]
    if len(cells) != 4 or not cells[0].isdigit():
        continue
    n = int(cells[0])
    copies.setdefault(n, []).append(tuple(cells))
    table.setdefault(n, cells)
disagree = {n: c for n, c in copies.items() if len(set(c)) > 1}

# Accepts the raw stdin output (one JSON line + END-OF-REPORT) or the committed, pretty-printed copy.
raw = open(sys.argv[2], encoding='utf-8').read().rstrip()
if raw.endswith('END-OF-REPORT'):
    raw = raw[:-len('END-OF-REPORT')]
rep = json.loads(raw)
prod = {r['english']: r for r in rep['rows']}


def eng_keys(cell):
    # "aluminium (aluminum)" -> ["aluminium", "aluminum"]; "sodium (natrium)" -> ["sodium", "natrium"]
    return [k.strip().lower() for k in re.split(r'[()]', cell) if k.strip()]


def is_names(cell):
    return [x.strip() for x in cell.split('/') if x.strip()]


out = []
for n in sorted(table):
    num, sym, en, isl = table[n]
    official = is_names(isl)
    hits = [prod[k] for k in eng_keys(en) if k in prod]
    res = [{'english': h['english'], 'icelandic': h['icelandic'], 'domain': h['domain'],
            'reason': h['reason'], 'outOfScope': h['outOfScope'], 'alsoInScope': h['alsoInScope']}
           for h in hits]
    resolved = [r for r in res if r['icelandic']]
    if not hits:
        status = 'not-checked'
    elif not resolved:
        status = 'unresolved'
    elif all(r['icelandic'] in official for r in resolved):
        status = 'match'
    else:
        status = 'differs'
    out.append({'n': n, 'symbol': sym, 'en': en, 'official': official, 'status': status, 'prod': res})

json.dump({'parsedRows': len(table), 'rowCopies': {n: len(c) for n, c in copies.items() if len(c) != 1},
           'copiesDisagree': disagree, 'items': out}, open(sys.argv[3], 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
from collections import Counter
print('parsed', len(table), 'missing', [n for n in range(1, 119) if n not in table],
      'copy-count set', sorted({len(c) for c in copies.values()}), 'copies disagree', len(disagree))
print(Counter(i['status'] for i in out))
