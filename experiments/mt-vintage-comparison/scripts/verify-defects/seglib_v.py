"""Independent segment parser (verify-defects). Segment = text after a
<!-- SEG:mod:type:id --> marker up to the next marker, stripped."""
import re
SEG_RE = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def parse(text):
    out=[]
    ms=list(SEG_RE.finditer(text))
    for i,m in enumerate(ms):
        end = ms[i+1].start() if i+1<len(ms) else len(text)
        key=m.group(1)
        parts=key.split(':')
        mod=parts[0]; typ=parts[1] if len(parts)>1 else ''; eid=':'.join(parts[2:]) if len(parts)>2 else ''
        out.append({'key':key,'mod':mod,'type':typ,'eid':eid,'text':text[m.end():end].strip()})
    return out
def occ_keys(segs):
    """occurrence-keyed ids: key#n for the n-th repeat of a key"""
    seen={}; res=[]
    for s in segs:
        n=seen.get(s['key'],0); seen[s['key']]=n+1
        res.append(f"{s['key']}#{n}")
    return res
