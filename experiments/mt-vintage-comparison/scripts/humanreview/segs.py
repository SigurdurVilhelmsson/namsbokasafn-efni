"""Segment-file parsing helpers (read-only analysis, scratch only).

Parser mirrors the permissive recognizer the server uses
(tools/lib/seg-markers.cjs: /<!--\\s*SEG:([^\\s]+?)\\s*-->/g): the text after a
marker up to the next marker is that segment, trimmed.
"""
import re
import subprocess

REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
SEG_RE = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')


def parse(text):
    """Return ordered list of (segment_id, content)."""
    out = []
    ms = list(SEG_RE.finditer(text))
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        out.append((m.group(1), text[m.end():end].strip()))
    return out


def git_show(ref, path):
    r = subprocess.run(['git', '-C', REPO, 'show', f'{ref}:{path}'],
                       capture_output=True)
    if r.returncode != 0:
        return None
    return r.stdout.decode('utf-8')


def git_ls(ref, path):
    r = subprocess.run(['git', '-C', REPO, 'ls-tree', '-r', '--name-only', ref, '--', path],
                       capture_output=True)
    return [l for l in r.stdout.decode('utf-8').splitlines() if l]


# ---------------------------------------------------------------- normaliser
# Reduce every inline-marker dialect to its VISIBLE prose, and every opaque
# placeholder (math, media, xref ids, ...) to a typed token whose numbering is
# dropped (placeholder numbering is per-extraction and not content).

PH = {
    'MATH': '⟨M⟩', 'MEDIA': '⟨IMG⟩', 'TABLE': '⟨TBL⟩',
}


def _bracket(m):
    body = m.group(1)
    if ':' in body:
        typ, rest = body.split(':', 1)
    else:
        typ, rest = body, ''
    t = typ.strip()
    tl = t.lower()
    if t in PH:
        return PH[t]
    if t.upper() in ('MATH', 'MEDIA', 'TABLE'):
        return PH[t.upper()]
    if t.upper() in ('BR', 'SPACE'):
        return ' '
    if tl == 'xref':
        return '⟨REF⟩'
    if tl in ('docref', 'link', 'cite', 'footnote-ref', 'fnref'):
        # link-ish: "label|target" keeps its visible label; a bare target is a ref
        if '|' in rest:
            return rest.split('|', 1)[0]
        return '⟨REF⟩'
    # paired-content types: term, i, b, em, sup, sub, u, span, fn, code, ...
    if '|' in rest:
        rest = rest.split('|', 1)[0]
    return rest


def norm_en(s):
    x = s
    # legacy emphasis dialect {=X=} (old appendix m68866; new form is [[em:X|emphasis-one]])
    x = re.sub(r'\{=(.+?)=\}', r'\1', x)
    # nested brackets: resolve innermost first, repeatedly
    for _ in range(6):
        y = re.sub(r'\[\[([^\[\]]*?)\]\]', _bracket, x)
        if y == x:
            break
        x = y
    # legacy opaque curly refs {{XREF:n}}, then paired curly markers {{term}}X{{/term}} etc.
    x = re.sub(r'\{\{XREF:[^}]*\}\}', '⟨REF⟩', x)
    x = re.sub(r'\{\{/?[a-zA-Z0-9_-]+(?:[: ][^}]*)?\}\}', '', x)
    # legacy ++text++ (underline?) and __X__
    x = re.sub(r'\+\+(.+?)\+\+', r'\1', x)
    x = re.sub(r'__(.+?)__', r'\1', x)
    # markdown links [text](url) -> text ; [#id] -> ref
    x = re.sub(r'\[([^\]]+)\]\((?:[^)]+)\)', r'\1', x)
    x = re.sub(r'\[#[^\]]+\]', '⟨REF⟩', x)
    # markdown emphasis *x* / **x**
    x = re.sub(r'\*\*(.+?)\*\*', r'\1', x)
    x = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'\1', x)
    # legacy ~sub~ and ^sup^
    x = re.sub(r'~([^~\s]+)~', r'\1', x)
    x = re.sub(r'\^([^\^\s]+)\^', r'\1', x)
    # unify quotes/dashes/whitespace
    x = (x.replace('’', "'").replace('‘', "'")
          .replace('“', '"').replace('”', '"')
          .replace(' ', ' ').replace(' ', ' ').replace(' ', ' '))
    x = x.replace('\\', '')
    x = re.sub(r'\s+', ' ', x).strip()
    return x
