"""My own SEG parser (independent of the other investigator's markers.py)."""
import re, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
SEG = re.compile(r'<!--\s*SEG:(\S+?)\s*-->')

def parse_records(text):
    """All occurrences in order: list of (fullid, content)."""
    out = []
    if not text:
        return out
    ms = list(SEG.finditer(text))
    for i, m in enumerate(ms):
        end = ms[i+1].start() if i+1 < len(ms) else len(text)
        out.append((m.group(1), text[m.end():end].strip()))
    return out

def parse_first(text):
    """Map fullid -> content, first occurrence wins (seg-markers.cjs default)."""
    d = {}
    order = []
    for k, v in parse_records(text):
        if k not in d:
            d[k] = v
            order.append(k)
    return d, order

def load():
    with open(os.path.join(HERE, 'raw', 'segfiles.json')) as f:
        return json.load(f)

def chapter_of(path):
    # books/efnafraedi-2e/02-for-mt/ch01/m68664-segments.en.md
    return path.split('/')[3]

def module_of(path):
    return os.path.basename(path).split('-segments')[0]

def pair_path(enpath):
    return enpath.replace('/02-for-mt/', '/02-mt-output/').replace('-segments.en.md', '-segments.is.md')
