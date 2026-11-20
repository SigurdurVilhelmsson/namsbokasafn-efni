"""Extract the BÍN word forms of every official element name (plus lanþaníð and rúþeníum) from YOUR OWN
copy of BÍN (SHsnid.csv.zip). The output is BÍN data, CC BY-SA 4.0: it is NOT committed here
(docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md). Get BÍN from Árni
Magnússon Institute's download page.
Usage: python3 -I extract-bin-forms.py <SHsnid.csv.zip> ../data/comparison-official-vs-resolver.json <out.json>"""
import io
import json
import sys
import zipfile

zip_path, cmp_path, out_path = sys.argv[1:4]
cmp_ = json.load(open(cmp_path, encoding='utf-8'))
want = {o for i in cmp_['items'] for o in i['official']} | {'lanþaníð', 'rúþeníum'}
hits = {}
z = zipfile.ZipFile(zip_path)
with z.open(z.namelist()[0]) as raw:
    for line in io.TextIOWrapper(raw, encoding='utf-8', errors='replace'):
        p = line.rstrip('\n').split(';')
        if len(p) >= 6 and p[0] in want:
            hits.setdefault(p[0], set()).add(p[4].lower())
json.dump({k: sorted(v) for k, v in hits.items()}, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False)
print('lemmas wanted', len(want), 'found in BÍN', len(hits), '| not in BÍN:', sorted(want - set(hits)))
