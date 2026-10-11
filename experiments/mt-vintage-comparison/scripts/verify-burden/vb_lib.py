"""verify-burden: independent loader + normaliser. Uses measure.py ONLY for the published
matcher primitives (plain, norm_en, en_pattern, stems, carries) so counts stay comparable."""
import re, os, glob, json, importlib.util
from collections import defaultdict
S = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
BOOK = 'efnafraedi-2e'
spec = importlib.util.spec_from_file_location('measure_vb', f'{REPO}/experiments/terminology-consistency/measure.py')
M = importlib.util.module_from_spec(spec)
import sys
sys.dont_write_bytecode = True
spec.loader.exec_module(M)
assert all(M.carries(t, M.stems(k)) == e for k, t, e in M.SELFTEST), 'measure.py selftest failed'

SEGRE = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')

def read_segs(path):
    """{key 'type:elementId': text}; key = marker minus module id. Later duplicates overwrite
    (same as measure.parse_segments) -- duplicates are counted separately by dup_count()."""
    try:
        t = open(path, encoding='utf-8').read()
    except FileNotFoundError:
        return {}
    parts = SEGRE.split(t)
    out = {}
    for i in range(1, len(parts) - 1, 2):
        out[parts[i].split(':', 1)[-1]] = parts[i + 1].strip()
    return out

def dup_count(path):
    try:
        t = open(path, encoding='utf-8').read()
    except FileNotFoundError:
        return 0
    ks = [m.group(1) for m in SEGRE.finditer(t)]
    return len(ks) - len(set(ks))

def chapters():
    return sorted(d for d in os.listdir(f'{S}/new/books/{BOOK}/02-mt-output') if re.fullmatch(r'ch\d\d', d) and d != 'ch00')

def modules(ch):
    d = f'{S}/new/books/{BOOK}/02-mt-output/{ch}'
    return sorted({n.split('-segments')[0] for n in os.listdir(d) if n.endswith('-segments.is.md') and n.startswith('m')})

def load(v, ch, mod):
    en = read_segs(f'{S}/{v}/books/{BOOK}/02-for-mt/{ch}/{mod}-segments.en.md')
    is_ = read_segs(f'{S}/{v}/books/{BOOK}/02-mt-output/{ch}/{mod}-segments.is.md')
    return en, is_

# ---- my own English normaliser for the HYBRID splice (all dialects -> visible text) ----
INNER_BR = re.compile(r'\[\[([A-Za-z]+):([^\[\]|]*)(?:\|[^\[\]]*)?\]\]')
BARE_BR = re.compile(r'\[\[([A-Za-z]+)\]\]')          # [[BR]]
CURLY = re.compile(r'\{\{([A-Za-z]+)\}\}((?:(?!\{\{).)*?)\{\{/\1\}\}', re.S)
STRAY_CURLY = re.compile(r'\{\{/?[A-Za-z]+\}\}')
PLUS = re.compile(r'\+\+(.+?)\+\+')
PH_TYPES = {'MATH', 'MEDIA', 'TABLE'}

def _br(m):
    t, c = m.group(1), m.group(2)
    if t in PH_TYPES:
        return ' ⁣PH⁣ '
    return c

def norm_seg_en(s):
    prev = None
    while prev != s:
        prev = s
        s = INNER_BR.sub(_br, s)
        s = CURLY.sub(lambda m: m.group(2), s)
    s = BARE_BR.sub(' ', s)
    s = STRAY_CURLY.sub('', s)
    s = PLUS.sub(r'\1', s)
    return re.sub(r'\s+', ' ', s).strip()
