#!/usr/bin/env python3
"""§C140 ㊱ B6 addendum — WHICH `head` fields differ between a recomposed figure's woff2 blobs and the committed ones.
Read-only. Needs the recomposed files: run BEFORE the restore, or point it at a scratch copy.

    python3 -u head_fields.py <recomposed-dir> <rev>     # every <b>_IS.svg in <recomposed-dir> vs `git show <rev>:books/efnafraedi-2e/media/<b>_IS.svg`

Prints the set of differing `head` attributes over all blob pairs, and a count. Terminal line `HEAD-FIELDS-DONE`.
"""
import base64, io, re, subprocess, sys, collections
from pathlib import Path
REPO = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(REPO / 'experiments/figure-text-translation/pylibs'))
from fontTools.ttLib import TTFont
BLOB = re.compile(rb'base64,([A-Za-z0-9+/=]+)\)')
FIELDS = ('tableVersion', 'fontRevision', 'checkSumAdjustment', 'magicNumber', 'flags', 'unitsPerEm', 'created', 'modified',
          'xMin', 'yMin', 'xMax', 'yMax', 'macStyle', 'lowestRecPPEM', 'fontDirectionHint', 'indexToLocFormat', 'glyphDataFormat')
diff = collections.Counter(); pairs = 0
for f in sorted(Path(sys.argv[1]).glob('*_IS.svg')):
    old = subprocess.run(['git', 'show', f'{sys.argv[2]}:books/efnafraedi-2e/media/{f.name}'], capture_output=True, check=True, cwd=REPO).stdout
    for x, y in zip(BLOB.findall(old), BLOB.findall(f.read_bytes())):
        hx, hy = TTFont(io.BytesIO(base64.b64decode(x)))['head'], TTFont(io.BytesIO(base64.b64decode(y)))['head']
        pairs += 1
        for k in FIELDS:
            if getattr(hx, k) != getattr(hy, k):
                diff[k] += 1
print(f'blob pairs: {pairs}'); print('head fields that differ (count of pairs):', dict(diff))
print('HEAD-FIELDS-DONE')
