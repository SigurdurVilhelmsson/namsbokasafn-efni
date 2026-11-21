"""Check that every name fix in a set of editors' fix drafts sits in a segment whose ENGLISH names that
element. The rule script fixes every off-list name in a segment, and a few non-official bases are also
ordinary words (serín is serine too), so an unanchored change would be a wrong one. A change maps to its element by
the official form the new word starts with; failing that (a name inside a compound, measurement 13), by the longest
official form of at least 5 letters it contains, so short names like `ál` cannot match inside ordinary words.
Usage (from this folder):
  python3 -I check-anchoring.py ../data/comparison-official-vs-resolver.json ../../../../../books/efnafraedi-2e/02-for-mt \\
      ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json ../reports/editor-fixes-mixed.json \\
      ../reports/editor-fixes-inner.json
Prints the count of unanchored changes per file and exits 1 if any exist."""
import glob
import json
import re
import sys

cmp_path, en_dir, *drafts = sys.argv[1:]
EN = {}
for f in sorted(glob.glob(f'{en_dir}/*/*-segments.en.md')):
    parts = re.split(r'<!--\s*SEG:([^\s]+?)\s*-->', open(f, encoding='utf-8').read())
    for i in range(1, len(parts), 2):
        EN.setdefault(parts[i], parts[i + 1])
off2en = {}
for it in json.load(open(cmp_path, encoding='utf-8'))['items']:
    aliases = [a.strip().lower() for a in re.split(r'[()]', it['en']) if a.strip()]
    for o in it['official']:
        off2en[o.lower()] = aliases
bad_total = 0
for path in drafts:
    bad = []
    for r in json.load(open(path, encoding='utf-8'))['segments']:
        en = EN.get(r['segmentId'], '').lower()
        for old, new in r['names'] + r.get('hand', []):  # hand fixes too (step H)
            off = max((o for o in off2en if new.lower().startswith(o)), key=len, default=None)
            if off is None:  # a name inside a compound
                off = max((o for o in off2en if len(o) >= 5 and o in new.lower()), key=len, default=None)
            if off is None or not any(re.search(r'(?<![a-z])' + re.escape(a) + r'(?![a-z])', en) for a in off2en[off]):
                bad.append((r['segmentId'], old, new))
    print(f'{path.rsplit("/", 1)[-1]}: {len(bad)} unanchored name changes')
    for b in bad:
        print('   ', b)
    bad_total += len(bad)
sys.exit(1 if bad_total else 0)
