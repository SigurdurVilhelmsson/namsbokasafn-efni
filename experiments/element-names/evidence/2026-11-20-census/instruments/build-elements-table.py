"""Build data/elements-table.json (the census targets plus every competitor) from the comparison.
Usage (from this folder): python3 -I build-elements-table.py ../data/comparison-official-vs-resolver.json ../data/elements-table.json
Targets = elements with no chemistry glossary row, plus aluminum (US spelling, used by OpenStax),
which has no row although 'aluminium' resolves to ál."""
import json, re, sys

d = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
for i in d['items']:
    aliases = [k.strip().lower() for k in re.split(r'[()]', i['en']) if k.strip()]
    extra = i['n'] == 13
    out.append({'n': i['n'], 'symbol': i['symbol'].replace('*', '').strip(), 'english': aliases,
                'official': i['official'], 'target': i['status'] == 'unresolved' or extra,
                'note': 'aluminum (US) only; aluminium resolves to ál' if extra else None,
                'searchEnglish': ['aluminum'] if extra else aliases})
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print('elements', len(out), 'targets', sum(o['target'] for o in out))
