#!/usr/bin/env python3
"""Read-only census: which fonts are embedded in every translated figure SVG, and where the files are used.

Run from the repo root with PYTHONPATH=experiments/figure-text-translation/pylibs.
Prints a JSON summary to stdout and writes per-file rows to the path given as argv[1].
"""
import base64, glob, hashlib, io, json, os, re, sys
from collections import Counter, defaultdict
from fontTools.ttLib import TTFont

ROOT = os.getcwd()
out_rows = sys.argv[1]
FACE = re.compile(rb'@font-face\s*\{(.*?)\}', re.S)
FAMILY = re.compile(rb"font-family\s*:\s*['\"]?([^;'\"]+)['\"]?")
DATA = re.compile(rb'url\(\s*[\'"]?data:([a-z0-9/+.-]+)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=\s]+)[\'"]?\s*\)')
FEIMAGE = re.compile(rb'<feImage\b[^>]*?(?:xlink:)?href="#', re.S)
FEIMAGE_ANY = re.compile(rb'<feImage\b', re.S)

def names(font):
    out = {}
    for r in font['name'].names:
        if r.platformID == 3 and r.langID == 0x409:
            try:
                out[r.nameID] = r.toUnicode()
            except Exception:
                out[r.nameID] = '<undecodable>'
    return out

def pub_copies(book_dir, name):
    res = {}
    for track in ('mt-preview', 'faithful'):
        hits = glob.glob(os.path.join(book_dir, '05-publication', track, 'chapters', '*', 'images', 'media', name)) + \
               glob.glob(os.path.join(book_dir, '05-publication', track, '**', name), recursive=True)
        res[track] = sorted(set(hits))
    return res

rows = []
files = sorted(glob.glob('books/*/media/*_IS.svg'))
for f in files:
    book = f.split('/')[1]
    book_dir = os.path.join('books', book)
    data = open(f, 'rb').read()
    sha = hashlib.sha256(data).hexdigest()
    faces = []
    for m in FACE.finditer(data):
        body = m.group(1)
        fam = FAMILY.search(body)
        d = DATA.search(body)
        rec = {'family': fam.group(1).decode().strip() if fam else None}
        if d:
            rec['mime'] = d.group(1).decode()
            raw = base64.b64decode(re.sub(rb'\s+', b'', d.group(2)))
            try:
                font = TTFont(io.BytesIO(raw), lazy=True)
                n = names(font)
                rec['flavor'] = font.flavor
                rec['ids'] = sorted(n)
                rec['version'] = n.get(5)
                rec['n1'] = n.get(1); rec['n3'] = n.get(3); rec['n4'] = n.get(4); rec['n6'] = n.get(6)
                rec['has7'] = 7 in n; rec['has13'] = 13 in n
                rec['cff'] = 'CFF ' in font
            except Exception as e:
                rec['error'] = repr(e)[:200]
        faces.append(rec)
    rows.append({
        'file': f, 'book': book, 'bytes': len(data), 'sha': sha,
        'basename': os.path.basename(f)[:-len('_IS.svg')],
        'faces': faces,
        'feimage_indoc': len(FEIMAGE.findall(data)),
        'feimage_any': len(FEIMAGE_ANY.findall(data)),
        'has_metadata': b'<metadata>' in data,
    })

# joins
mapping = {}
for mp in glob.glob('books/*/media/image-mapping.json'):
    book = mp.split('/')[1]
    try:
        for e in json.load(open(mp)):
            mapping.setdefault(book, set()).add(e.get('outputName'))
    except Exception as e:
        print('mapping unreadable', mp, e, file=sys.stderr)

for r in rows:
    r['mapped'] = r['file'].split('/')[-1] in mapping.get(r['book'], set())
    r['sidecar'] = os.path.exists(os.path.join('books', r['book'], 'figure-text', r['basename'] + '.is.json'))
    fams = sorted({(fc.get('family'), fc.get('version'), fc.get('flavor')) for fc in r['faces']}, key=str)
    r['fontsig'] = ' | '.join(f'{a}/{b}/{c}' for a, b, c in fams) or 'NO-FONT'

# publication copies (one walk, not per-file globs)
pub = defaultdict(list)
for root, dirs, fs in os.walk('books'):
    if '05-publication' not in root:
        continue
    for fn in fs:
        if fn.endswith('_IS.svg'):
            pub[(root.split('/')[1], fn)].append(os.path.join(root, fn))
for r in rows:
    copies = pub.get((r['book'], r['file'].split('/')[-1]), [])
    r['pub_copies'] = len(copies)
    same = 0
    for c in copies:
        if os.path.getsize(c) == r['bytes'] and hashlib.sha256(open(c, 'rb').read()).hexdigest() == r['sha']:
            same += 1
    r['pub_identical'] = same

with open(out_rows, 'w') as fh:
    for r in rows:
        fh.write(json.dumps(r, ensure_ascii=False) + '\n')

summary = {
    'files': len(rows),
    'by_fontsig': Counter(r['fontsig'] for r in rows).most_common(),
    'by_fontsig_x_sidecar': Counter((r['fontsig'].split(' | ')[0].split('/')[1] if r['faces'] else 'NO-FONT', r['sidecar'], r['mapped']) for r in rows).most_common(),
    'feimage_indoc_files': sum(1 for r in rows if r['feimage_indoc']),
    'feimage_any_files': sum(1 for r in rows if r['feimage_any']),
    'metadata_files': sum(1 for r in rows if r['has_metadata']),
    'liberation_in_names_files': sum(1 for r in rows if any('Liberation' in (fc.get('n1') or '') + (fc.get('n3') or '') + (fc.get('n4') or '') + (fc.get('n6') or '') for fc in r['faces'])),
    'errors': [(r['file'], fc['error']) for r in rows for fc in r['faces'] if 'error' in fc][:10],
    'pub_copies_total': sum(r['pub_copies'] for r in rows),
    'pub_identical_total': sum(r['pub_identical'] for r in rows),
}
print(json.dumps(summary, indent=1, ensure_ascii=False, default=str))
