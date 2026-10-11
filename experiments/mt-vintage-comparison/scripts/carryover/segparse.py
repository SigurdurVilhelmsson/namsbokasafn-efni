import re, os, json
SEG = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def parse(text):
    """Mirror tools/lib/seg-markers.cjs parseSegmentRecords: content from marker to next marker, trimmed.
    Returns list of (id, content) keeping all occurrences."""
    out = []
    cur = None; start = 0
    for m in SEG.finditer(text):
        if cur is not None:
            out.append((cur, text[start:m.start()].strip()))
        cur = m.group(1); start = m.end()
    if cur is not None:
        out.append((cur, text[start:].strip()))
    return out
def key_of(segid):
    parts = segid.split(':')
    return ':'.join(parts[1:])  # type:elementId
def load(base, tag, chdir, mod):
    p = os.path.join(base, 'raw', tag, chdir, mod + '.md')
    if not os.path.exists(p): return None
    return open(p, encoding='utf-8').read()
