"""My own marker parser + visible-text normalizer (written independently).

parse(s, legacy=..., gate=...) -> list of nodes; node = str | (kind, attr, children)
Kinds: i b sub sup u sc em span term fn link xref docref  + placeholders MATH MEDIA TABLE BR SPACE
visible(s) -> normalized visible string for equality (generic placeholder tokens, self-closing link -> target token)
chars(s)   -> visible prose chars only (placeholders and self-closing links removed), whitespace collapsed
kinds(s)   -> Counter of marker kinds
"""
import re, html, collections

class ParseError(Exception):
    pass

BRACKET_OPEN = re.compile(r'\[\[([A-Za-z]+)(:|\]\])')
CONTENT_KINDS = {'i', 'b', 'sub', 'sup', 'u', 'sc', 'em', 'span', 'term', 'fn', 'link', 'xref', 'docref'}
PLACEHOLDERS = {'MATH', 'MEDIA', 'TABLE', 'BR', 'SPACE'}

def find_close(s, start):
    """s[start:] is inside a [[type: ... ; return index of matching ']]' (nesting-aware)."""
    depth = 1
    i = start
    n = len(s)
    while i < n:
        if s.startswith('[[', i):
            # only count as nested opener if it looks like a marker opener
            if BRACKET_OPEN.match(s, i):
                depth += 1
                i += 2
                continue
        if s.startswith(']]', i):
            depth -= 1
            if depth == 0:
                return i
            i += 2
            continue
        i += 1
    raise ParseError('unterminated marker at %d: %r' % (start, s[max(0, start-20):start+40]))

def split_last_pipe_toplevel(body):
    """Split body at the last top-level '|' (not inside nested [[..]]). Returns (text, attr) or (body, None)."""
    depth = 0; i = 0; last = -1
    while i < len(body):
        if body.startswith('[[', i) and BRACKET_OPEN.match(body, i):
            depth += 1; i += 2; continue
        if body.startswith(']]', i) and depth > 0:
            depth -= 1; i += 2; continue
        if body[i] == '|' and depth == 0:
            last = i
        i += 1
    if last < 0:
        return body, None
    return body[:last], body[last+1:]

def parse_brackets(s):
    """Parse bracket dialect. Non-marker text stays as str."""
    out = []
    i = 0
    buf = []
    while i < len(s):
        m = BRACKET_OPEN.match(s, i) if s.startswith('[[', i) else None
        if not m:
            buf.append(s[i]); i += 1; continue
        kind = m.group(1)
        if buf:
            out.append(''.join(buf)); buf = []
        if m.group(2) == ']]':
            out.append((kind, None, []))  # [[BR]] / [[SPACE]]
            i = m.end(); continue
        close = find_close(s, m.end())
        body = s[m.end():close]
        i = close + 2
        if kind in PLACEHOLDERS:
            out.append((kind, body, []))
        elif kind in ('em', 'span', 'term', 'fn', 'link'):
            text, attr = split_last_pipe_toplevel(body)
            out.append((kind, attr, parse_brackets(text)))
        elif kind in ('xref', 'docref'):
            text, attr = split_last_pipe_toplevel(body)
            if attr is None:
                out.append((kind, text, []))   # self-closing: attr = target
            else:
                out.append((kind, attr, parse_brackets(text)))
        else:
            out.append((kind, None, parse_brackets(body)))
    if buf:
        out.append(''.join(buf))
    return out

# ---------------- legacy -> bracket rewrite (my own rules, derived from cnxml-inject.js) -------------
API_MARKERS = re.compile(r'\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:|\[\[term:|\[\[fn:|\[\[u:|\[\[em:|\[\[span:|\[\[sc:')

OPN, CLS = '\ue011\ue011', '\ue010\ue010'   # masked "[[" and "]]"

def legacy_to_bracket(s, literal_asterisks=0, log=None):
    """Rewrite legacy dialect forms into bracket form (ids/classes left empty). Mirrors
    reverseInlineMarkup's ORDER and GATING as I read it. In the injector every bracket
    marker is already XML when the legacy regexes run, so they never see "[[" / "]]";
    I reproduce that by MASKING bracket delimiters (existing and produced) until the end."""
    def L(name, n=1):
        if log is not None and n:
            log[name] += n
    has_api = bool(API_MARKERS.search(s))
    t = s
    t2 = t.replace('\\[', '[').replace('\\]', ']').replace('\\*', '*'); L('escape', t2 != t); t = t2
    t = t.replace('[[', OPN).replace(']]', CLS)
    O, C = OPN, CLS
    t, n = re.subn(r'\{\{b\}\}([\s\S]*?)\{\{/b\}\}', O + r'b:\1' + C, t); L('{{b}}', n)
    t, n = re.subn(r'\{\{i\}\}([\s\S]*?)\{\{/i\}\}', O + r'i:\1' + C, t); L('{{i}}', n)
    t, n = re.subn(r'\{\{i:([^}]+)\}\}', O + r'i:\1' + C, t); L('{{i:}}', n)
    t, n = re.subn(r'\{\{b:([^}]+)\}\}', O + r'b:\1' + C, t); L('{{b:}}', n)
    t, n = re.subn(r'\+\+(.+?)\+\+', O + r'u:\1' + C, t); L('++u++', n)
    ast_literal = len(re.findall(r'\*', s)) <= literal_asterisks
    if not has_api and not ast_literal:
        t, n = re.subn(r'~\*\*([^*~]+)\*\*~', O + r'sub:' + O + r'b:\1' + C + C, t); L('~**~', n)
        t, n = re.subn(r'~\*([^*~]+)\*~', O + r'sub:' + O + r'i:\1' + C + C, t); L('~*~', n)
        t, n = re.subn(r'\^\*\*([^*^]+)\*\*\^', O + r'sup:' + O + r'b:\1' + C + C, t); L('^**^', n)
        t, n = re.subn(r'\^\*([^*^]+)\*\^', O + r'sup:' + O + r'i:\1' + C + C, t); L('^*^', n)
        t, n = re.subn(r'\*\*([^*]+)\*\*', O + r'b:\1' + C, t); L('**b**', n)
        t, n = re.subn(r'\*([^*]+)\*', O + r'i:\1' + C, t); L('*i*', n)
    t, n = re.subn(r'\{=(.+?)=\}', O + r'em:\1|' + C, t); L('{=em=}', n)
    t, n = re.subn(r'\{\{term\}\}([\s\S]*?)\{\{/term\}\}', O + r'term:\1' + C, t); L('{{term}}', n)
    if not has_api:
        t, n = re.subn(r'(?<!_)(?<!\\_)\\_\\_([^_]+)\\_\\_(?!\\?_)', O + r'term:\1' + C, t); L('\\_\\_term', n)
        t, n = re.subn(r'(?<!_)__([^_]+)__(?!_)', O + r'term:\1' + C, t); L('__term__', n)
    t, n = re.subn(r'\[(m\d+)#([^\]]+)\]', O + r'docref:\1#\2' + C, t); L('[m#id]', n)
    t, n = re.subn(r'\[doc:(m\d+)\]', O + r'docref:\1' + C, t); L('[doc:m]', n)
    t, n = re.subn(r'\[#([A-Za-z_][\w.-]+)\]', O + r'xref:\1' + C, t); L('[#id]', n)
    def mdlink(m):
        txt, url = m.group(1), m.group(2)
        if url.startswith('doc:m'):
            L('[t](doc:)'); return f'{O}docref:{txt}|{url[4:]}{C}'
        if url.startswith('#') and re.fullmatch(r'#[A-Za-z_][\w.-]+', url):
            L('[t](#id)'); return f'{O}xref:{txt}|{url[1:]}{C}'
        if re.match(r'm\d+#', url):
            L('[t](m#id)'); return f'{O}docref:{txt}|{url}{C}'
        if url.startswith('http://') or url.startswith('https://'):
            L('[t](url)'); return f'{O}link:{txt}|{url}{C}'
        return m.group(0)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', mdlink, t)
    if not has_api:
        t, n = re.subn(r'(\s)\^([0-9]+)\^([A-Z][a-z]?)', r'\1' + O + r'sup:\2' + C + r'\3', t); L('isotope^', n)
        t, n = re.subn(r'(?<=[^\s~])~([^\s~]{1,15})~', O + r'sub:\1' + C, t); L('~sub~', n)
        t, n = re.subn(r'(?<=[^\s^])\^([^\s^]{1,15})\^', O + r'sup:\1' + C, t); L('^sup^', n)
    t, n = re.subn(r'\{\{fn\}\}([\s\S]*?)\{\{/fn\}\}', O + r'fn:\1' + C, t); L('{{fn}}', n)
    t, n = re.subn(r' \[(?:footnote|neðanmálsgrein): ([\s\S]+?)\](?=\s|$|[.,;:<\[\ue011])', ' ' + O + r'fn:\1' + C, t); L('[footnote:]', n)
    return t.replace(OPN, '[[').replace(CLS, ']]')

LEGACY_RESIDUE = re.compile(r'\{\{/?(?:i|b|term|fn)\}\}|\{=|=\}|\+\+|\[#[A-Za-z_]|\[doc:m\d|\[m\d+#|\]\((?:#|doc:|m\d|https?:)')

# ---------------- visible text --------------------------------------------------------------
TOK = {'MATH': '\ue000', 'MEDIA': '\ue001', 'TABLE': '\ue002', 'BR': '\ue003'}

def _vis(nodes, mode):
    parts = []
    for nd in nodes:
        if isinstance(nd, str):
            parts.append(nd); continue
        kind, attr, ch = nd
        if kind in ('MATH', 'MEDIA', 'TABLE', 'BR'):
            parts.append('' if mode == 'chars' else (TOK[kind] if mode == 'generic' else TOK[kind] + (attr or '') + '\ue00f'))
            if mode == 'chars' and kind == 'BR':
                parts.append(' ')
        elif kind == 'SPACE':
            parts.append(' ')
        elif kind in ('xref', 'docref') and not ch:
            parts.append('' if mode == 'chars' else '\ue004' + (attr or '') + '\ue00f')
        else:
            parts.append(_vis(ch, mode))
    return ''.join(parts)

def norm_ws(s):
    return re.sub(r'\s+', ' ', s).strip()

def visible(s, mode='generic', legacy=True, literal_asterisks=0):
    t = legacy_to_bracket(s, literal_asterisks) if legacy else s
    nodes = parse_brackets(t)
    v = _vis(nodes, mode)
    v = html.unescape(v)
    return norm_ws(v)

def chars(s, legacy=True):
    return visible(s, mode='chars', legacy=legacy)

def kinds(nodes, c=None):
    if c is None:
        c = collections.Counter()
    for nd in nodes:
        if isinstance(nd, str):
            continue
        kind, attr, ch = nd
        if kind in ('xref', 'docref') and not ch:
            c[kind + '/'] += 1
        else:
            c[kind] += 1
        kinds(ch, c)
    return c

def targets(nodes, out=None):
    """multiset of link targets (xref/docref/link) and TABLE ids."""
    if out is None:
        out = collections.Counter()
    for nd in nodes:
        if isinstance(nd, str):
            continue
        kind, attr, ch = nd
        if kind in ('xref', 'docref', 'link', 'TABLE'):
            out[(kind, attr)] += 1
        targets(ch, out)
    return out

# ---------------- serializer (for exact-string comparison after attribute filling) ----------
def ser(nodes):
    out = []
    for nd in nodes:
        if isinstance(nd, str):
            out.append(nd); continue
        kind, attr, ch = nd
        if kind in ('MATH', 'MEDIA', 'TABLE'):
            out.append(f'[[{kind}:{attr}]]')
        elif kind in ('BR', 'SPACE'):
            out.append(f'[[{kind}]]' if attr is None else f'[[{kind}:{attr}]]')
        elif kind in ('xref', 'docref') and not ch:
            out.append(f'[[{kind}:{attr}]]')
        elif kind in ('em', 'span', 'link', 'xref', 'docref'):
            out.append(f'[[{kind}:{ser(ch)}|{attr if attr is not None else ""}]]')
        elif kind in ('term', 'fn'):
            out.append(f'[[{kind}:{ser(ch)}' + (f'|{attr}' if attr is not None else '') + ']]')
        else:
            out.append(f'[[{kind}:{ser(ch)}]]')
    return ''.join(out)

def preorder(nodes, kind_filter):
    for nd in nodes:
        if isinstance(nd, str):
            continue
        kind, attr, ch = nd
        if kind in kind_filter and not (kind in ('xref', 'docref') and not ch):
            yield nd
        yield from preorder(ch, kind_filter)

def map_nodes(nodes, fn):
    """Return a new tree with fn applied to each marker node (post-children)."""
    out = []
    for nd in nodes:
        if isinstance(nd, str):
            out.append(nd); continue
        kind, attr, ch = nd
        out.append(fn((kind, attr, map_nodes(ch, fn))))
    return out
