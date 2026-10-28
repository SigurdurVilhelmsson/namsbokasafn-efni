"""Shared helpers: corpus access, measure.py machinery, cross-dialect English normalization."""
import importlib.util, html, json, re, unicodedata
MEASURE = '/home/siggi/dev/repos/namsbokasafn-efni/experiments/terminology-consistency/measure.py'
_spec = importlib.util.spec_from_file_location('measure', MEASURE)
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)   # defines functions only; main() is guarded by __name__

def load(path):
    C = json.load(open(path))
    seg = {}
    for ch, mods in C['files'].items():
        for m, vs in mods.items():
            for v in ('old', 'new'):
                seg[(ch, m, v)] = (M.parse_segments(vs[v]['en']), M.parse_segments(vs[v]['is']))
    return C, seg

PLACEHOLDER = '⟨P⟩'
_B_PH = re.compile(r'\[\[(?:MATH|MEDIA|TABLE|IMG|EQ):[^\]]*\]\]')
_B_XREF = re.compile(r'\[\[xref:[^\]]*\]\]')
_B_DOCREF2 = re.compile(r'\[\[docref:([^\]|]*)\|[^\]]*\]\]')   # [[docref:text|target]] -> text
_B_DOCREF1 = re.compile(r'\[\[docref:[^\]|]*\]\]')             # [[docref:target]] -> generated label
_B_LINK = re.compile(r'\[\[link:([^\]|]*)(?:\|[^\]]*)?\]\]')
_B_ANY = re.compile(r'\[\[[A-Za-z]+:([^\]|]*)(?:\|[^\]]*)?\]\]')  # term/i/b/u/em/sub/sup/fn/... -> content
_B_BR = re.compile(r'\[\[BR\]\]')
_C_PAIRED = re.compile(r'\{\{/?[A-Za-z]+\}\}')
_C_COLON = re.compile(r'\{\{[A-Za-z]+:([^}]*)\}\}')
_PLUS = re.compile(r'\+\+(.+?)\+\+')
_UND = re.compile(r'__(.+?)__')
_HASHREF = re.compile(r'\[#[^\]\s]+\]')
_MDLINK = re.compile(r'\[([^\]\n]+)\]\((?:https?://|/)[^)\s]*\)')
_TILDE = re.compile(r'~([^~\s]{1,20})~')
_CARET = re.compile(r'\^([^\^\s]{1,20})\^')
_STAR2 = re.compile(r'\*\*([^*\n]+?)\*\*')
_STAR1 = re.compile(r'(?<![*\w])\*([^*\n]+?)\*(?![*\w])')
_TAG = re.compile(r'</?[A-Za-zÀ-ſ][\wÀ-ſ:-]*>')

def norm_en_seg(s):
    """Reduce every observed marker dialect to its visible text; placeholders -> one token."""
    if s is None:
        return None
    t = s
    t = _B_PH.sub(PLACEHOLDER, t)
    t = _B_XREF.sub(PLACEHOLDER, t)
    t = _B_DOCREF2.sub(r'\1', t)
    t = _B_DOCREF1.sub(PLACEHOLDER, t)
    t = _B_LINK.sub(r'\1', t)
    t = _B_BR.sub(' ', t)
    for _ in range(3):  # nested brackets, innermost first
        t2 = _B_ANY.sub(r'\1', t)
        if t2 == t: break
        t = t2
    t = _C_COLON.sub(r'\1', t)
    t = _C_PAIRED.sub('', t)
    t = _PLUS.sub(r'\1', t)
    t = _UND.sub(r'\1', t)
    t = _HASHREF.sub(PLACEHOLDER, t)
    t = _MDLINK.sub(r'\1', t)
    t = _TILDE.sub(r'\1', t)
    t = _CARET.sub(r'\1', t)
    t = _STAR2.sub(r'\1', t)
    t = _STAR1.sub(r'\1', t)
    t = _TAG.sub('', t)
    t = html.unescape(t)
    t = unicodedata.normalize('NFC', t).replace(' ', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return t
