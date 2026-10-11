"""Marker dialect handling for the carry-over measurement (scratch, read-only analysis).

Three functions matter:

  legacy_to_bracket(text, literal_asterisks=0)
      Rewrite every LEGACY inline-marker form into the bracket dialect, mirroring the
      order and the gating of tools/cnxml-inject.js reverseInlineMarkup (the injector
      that published the June text).  Attributes the legacy form does not carry are
      written as the placeholder '?'  (e.g. __x__ -> [[term:x|?]]).  Bracket markers
      already present are left untouched.

  parse(text) -> list of nodes
      A recursive-descent parser for the bracket dialect.  Node = str | Marker.

  visible(text) -> str
      The NORMALIZER used to compare English across vintages: legacy_to_bracket, then
      every marker reduced to its visible text, placeholders replaced by generic tokens,
      self-closing links replaced by their target, entities decoded, whitespace collapsed.
"""
import html
import re
from dataclasses import dataclass, field

# Bracket kinds known to the injector (tools/cnxml-inject.js) + api-translate.
CONTENT_KINDS = {'i', 'b', 'sub', 'sup', 'sc', 'u'}          # [[k:content]]
ATTR_KINDS = {'span', 'em', 'term', 'fn', 'xref', 'docref', 'link'}  # [[k:content|attr]] (attr optional for some)
PLACEHOLDER_KINDS = {'MATH', 'MEDIA', 'TABLE'}              # [[K:n]]
EMPTY_KINDS = {'BR', 'SPACE'}                                # [[BR]] / [[SPACE]] / [[SPACE:n]]
ALL_KINDS = CONTENT_KINDS | ATTR_KINDS | PLACEHOLDER_KINDS | EMPTY_KINDS

# Same test as reverseInlineMarkup's hasApiMarkers.
API_MARKERS = re.compile(
    r'\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:|'
    r'\[\[term:|\[\[fn:|\[\[u:|\[\[em:|\[\[span:|\[\[sc:'
)


@dataclass
class Marker:
    kind: str
    children: list = field(default_factory=list)   # content nodes (str | Marker)
    attr: object = None                              # str or None


# --------------------------------------------------------------------------------------
# Legacy -> bracket rewrite (syntax only)
# --------------------------------------------------------------------------------------
_LINK_URL_OK = re.compile(r'^(doc:m\d+|#[A-Za-z_][\w.-]+|m\d+#.+|https?://.+)$')


def _md_link(m):
    text, url = m.group(1), m.group(2)
    if url.startswith('doc:m'):
        return f'[[docref:{text}|{url[4:]}]]'
    if url.startswith('#') and re.match(r'^#[A-Za-z_][\w.-]+$', url):
        return f'[[xref:{text}|{url[1:]}]]'
    if re.match(r'^m\d+#', url):
        return f'[[docref:{text}|{url}]]'
    if url.startswith('http://') or url.startswith('https://'):
        return f'[[link:{text}|{url}]]'
    return m.group(0)


_FN_OPEN = re.compile(r' \[(?:footnote|neðanmálsgrein): ')


def _legacy_footnotes(r, fired):
    """` [footnote: X]` -> ` [[fn:X|?]]`, scanning X with BALANCED brackets so a nested
    bracket marker ([[i:W]], [[MATH:3]]) or chemical [NO] inside X does not end it early.
    (The injector's lazy regex works only because it runs after every bracket marker has
    already become XML.)"""
    out, i, n = [], 0, 0
    while True:
        m = _FN_OPEN.search(r, i)
        if not m:
            out.append(r[i:])
            break
        depth, j = 1, m.end()
        while j < len(r) and depth:
            if r[j] == '[':
                depth += 1
            elif r[j] == ']':
                depth -= 1
            j += 1
        if depth:  # unterminated: leave as is (residue check will see it)
            out.append(r[i:])
            break
        out.append(r[i:m.start()])
        out.append(' [[fn:' + r[m.end():j - 1] + '|?]]')
        n += 1
        i = j
    if n:
        fired.append(f'[footnote:]x{n}')
    return ''.join(out)


def legacy_to_bracket(text, literal_asterisks=0):
    """Rewrite legacy marker forms into bracket syntax (mirrors reverseInlineMarkup's order
    and gating).  Returns (rewritten_text, list_of_rule_names_that_fired)."""
    fired = []
    has_api = bool(API_MARKERS.search(text))
    asterisks_literal = text.count('*') <= literal_asterisks
    r = text

    def sub(pattern, repl, s, name, flags=0):
        new, n = re.subn(pattern, repl, s, flags=flags)
        if n:
            fired.append(f'{name}x{n}')
        return new

    # MT backslash escapes (the injector removes \[ \] \*; \_\_ handled with terms)
    r = sub(r'\\\[', '[', r, 'esc[')
    r = sub(r'\\\]', ']', r, 'esc]')
    r = sub(r'\\\*', '*', r, 'esc*')
    # {{b}}..{{/b}} / {{i}}..{{/i}} (lazy; loop for nesting of different tags)
    for _ in range(5):
        before = r
        r = sub(r'\{\{b\}\}([\s\S]*?)\{\{/b\}\}', r'[[b:\1]]', r, '{{b}}')
        r = sub(r'\{\{i\}\}([\s\S]*?)\{\{/i\}\}', r'[[i:\1]]', r, '{{i}}')
        if r == before:
            break
    r = sub(r'\{\{i:([^}]+)\}\}', r'[[i:\1]]', r, '{{i:}}')
    r = sub(r'\{\{b:([^}]+)\}\}', r'[[b:\1]]', r, '{{b:}}')
    # ++text++ underline (unconditional in the injector)
    r = sub(r'\+\+(.+?)\+\+', r'[[u:\1]]', r, '++')
    # legacy markdown emphasis -- only for non-API segments whose asterisks are not literal
    if not has_api and not asterisks_literal:
        r = sub(r'~\*\*([^*~]+)\*\*~', r'[[sub:[[b:\1]]]]', r, '~**~')
        r = sub(r'~\*([^*~]+)\*~', r'[[sub:[[i:\1]]]]', r, '~*~')
        r = sub(r'\^\*\*([^*^]+)\*\*\^', r'[[sup:[[b:\1]]]]', r, '^**^')
        r = sub(r'\^\*([^*^]+)\*\^', r'[[sup:[[i:\1]]]]', r, '^*^')
        r = sub(r'\*\*([^*]+)\*\*', r'[[b:\1]]', r, '**')
        r = sub(r'\*([^*]+)\*', r'[[i:\1]]', r, '*')
    # {=text=} class-only emphasis (unconditional)
    r = sub(r'\{=(.+?)=\}', r'[[em:\1|?]]', r, '{==}')
    # {{term}}..{{/term}}
    r = sub(r'\{\{term\}\}([\s\S]*?)\{\{/term\}\}', r'[[term:\1|?]]', r, '{{term}}')
    # legacy __term__ (guarded) -- non-API only
    if not has_api:
        r = sub(r'(?<!_)(?<!\\_)\\_\\_([^_]+)\\_\\_(?!\\?_)', r'[[term:\1|?]]', r, r'\_\_')
        r = sub(r'(?<!_)__([^_]+)__(?!_)', r'[[term:\1|?]]', r, '__')
    # legacy sup/sub INSIDE terms (unconditional in the injector)
    def _term_inner(m):
        inner = m.group(1)
        inner2 = re.sub(r'\^([^^]{1,15})\^', r'[[sup:\1]]', inner)
        inner2 = re.sub(r'~([^~]{1,15})~', r'[[sub:\1]]', inner2)
        if inner2 != inner:
            fired.append('term-inner-supsub')
        return f'[[term:{inner2}|{m.group(2)}]]'
    r = re.sub(r'\[\[term:((?:(?!\[\[|\]\])[^|])+)\|([^\]]*)\]\]', _term_inner, r)
    # legacy links (unconditional)
    r = sub(r'\[(m\d+)#([^\]]+)\]', r'[[docref:\1#\2]]', r, '[m#]')
    r = sub(r'\[doc:(m\d+)\]', r'[[docref:\1]]', r, '[doc:]')
    r = sub(r'(?<!\[)\[#([A-Za-z_][\w.-]+)\](?!\])', r'[[xref:\1]]', r, '[#]')
    new = re.sub(r'(?<!\[)\[([^\]\[]+)\]\(([^)]+)\)', _md_link, r)
    if new != r:
        fired.append('[t](u)')
    r = new
    # legacy sub/sup outside terms -- non-API only
    if not has_api:
        r = sub(r'(\s)\^([0-9]+)\^([A-Z][a-z]?)', r'\1[[sup:\2]]\3', r, 'isotope^')
        r = sub(r'(?<=[^\s~\[])~([^\s~]{1,15})~', r'[[sub:\1]]', r, '~')
        r = sub(r'(?<=[^\s^\[])\^([^\s^]{1,15})\^', r'[[sup:\1]]', r, '^')
    # footnotes
    r = sub(r'\{\{fn\}\}([\s\S]*?)\{\{/fn\}\}', r'[[fn:\1|?]]', r, '{{fn}}')
    r = _legacy_footnotes(r, fired)
    return r, fired


# Residue that should not survive a legacy->bracket rewrite.
RESIDUE = [
    ('{{', re.compile(r'\{\{')), ('}}', re.compile(r'\}\}')),
    ('{=', re.compile(r'\{=')), ('=}', re.compile(r'=\}')),
    ('__x__', re.compile(r'(?<!_)__[^_]+__(?!_)')),
    ('++x++', re.compile(r'\+\+.+?\+\+')),
    ('[#id]', re.compile(r'(?<!\[)\[#[A-Za-z_][\w.-]+\]')),
    ('~x~', re.compile(r'(?<=[^\s~])~[^\s~]{1,15}~')),
    ('^x^', re.compile(r'(?<=[^\s^])\^[^\s^]{1,15}\^')),
    ('**x**', re.compile(r'\*\*[^*]+\*\*')),
    ('[footnote:', re.compile(r'\[(?:footnote|neðanmálsgrein):')),
]


def residue(text, literal_asterisks=0, literal_text=''):
    """Legacy residue left in an (already rewritten) text.  A pattern also present in
    `literal_text` (the NEW English) the same number of times is treated as literal."""
    out = []
    for name, p in RESIDUE:
        n = len(p.findall(text))
        if n and n > len(p.findall(literal_text)):
            out.append(name)
    return out


# --------------------------------------------------------------------------------------
# Bracket parser
# --------------------------------------------------------------------------------------
_OPEN = re.compile(r'\[\[([A-Za-z]+)(:|\]\])')


class ParseError(Exception):
    pass


def _parse(s, i, depth):
    nodes, buf = [], []
    n = len(s)
    while i < n:
        if s.startswith('[[', i):
            m = _OPEN.match(s, i)
            if m and m.group(1) in ALL_KINDS:
                if buf:
                    nodes.append(''.join(buf)); buf = []
                kind = m.group(1)
                if m.group(2) == ']]':
                    nodes.append(Marker(kind, [], None))
                    i = m.end()
                    continue
                children, i = _parse(s, m.end(), depth + 1)
                nodes.append(_finish(kind, children))
                continue
        if depth > 0 and s.startswith(']]', i):
            # A ']]]' run closes at its LAST pair only when the inner text ends with an
            # unmatched single '['.  Keep the simple rule (first ']]' closes) -- it is the
            # injector's rule too (its leaf regexes stop at the first ']]').
            if buf:
                nodes.append(''.join(buf))
            return nodes, i + 2
        buf.append(s[i]); i += 1
    if depth > 0:
        raise ParseError('unterminated marker')
    if buf:
        nodes.append(''.join(buf))
    return nodes, i


def _split_last_pipe(children):
    """Split children on the LAST top-level '|' inside a str node."""
    for idx in range(len(children) - 1, -1, -1):
        c = children[idx]
        if isinstance(c, str) and '|' in c:
            pos = c.rfind('|')
            left = children[:idx] + ([c[:pos]] if c[:pos] else [])
            right = c[pos + 1:]
            # the attr must be plain text with no further markers after it
            if any(not isinstance(x, str) for x in children[idx + 1:]):
                return children, None
            right += ''.join(children[idx + 1:])
            return left, right
    return children, None


def _finish(kind, children):
    if kind in PLACEHOLDER_KINDS or kind in EMPTY_KINDS:
        return Marker(kind, [], ''.join(c if isinstance(c, str) else '' for c in children))
    if kind in CONTENT_KINDS:
        return Marker(kind, children, None)
    # attribute kinds
    content, attr = _split_last_pipe(children)
    if kind in ('xref', 'docref') and attr is None:
        # self-closing form: the whole payload is the target
        if all(isinstance(c, str) for c in children):
            return Marker(kind, [], ''.join(children))
    return Marker(kind, content, attr)


def parse(text):
    nodes, _ = _parse(text, 0, 0)
    return nodes


def walk(nodes):
    """Pre-order list of Marker objects."""
    out = []
    for n in nodes:
        if isinstance(n, Marker):
            out.append(n)
            out.extend(walk(n.children))
    return out


def serialize(nodes):
    out = []
    for n in nodes:
        if isinstance(n, str):
            out.append(n)
            continue
        k = n.kind
        if k in EMPTY_KINDS:
            out.append(f'[[{k}]]' if not n.attr else f'[[{k}:{n.attr}]]')
        elif k in PLACEHOLDER_KINDS:
            out.append(f'[[{k}:{n.attr}]]')
        elif k in CONTENT_KINDS:
            out.append(f'[[{k}:{serialize(n.children)}]]')
        else:
            body = serialize(n.children)
            if n.attr is None:
                out.append(f'[[{k}:{body}]]')
            elif not n.children and k in ('xref', 'docref'):
                out.append(f'[[{k}:{n.attr}]]')
            else:
                out.append(f'[[{k}:{body}|{n.attr}]]')
    return ''.join(out)


# --------------------------------------------------------------------------------------
# Normalizer (visible text)
# --------------------------------------------------------------------------------------
def _visible_nodes(nodes, math_resolver=None):
    out = []
    for n in nodes:
        if isinstance(n, str):
            out.append(n)
        elif n.kind == 'MATH':
            if math_resolver is not None:
                out.append(' \u27e6M:' + math_resolver(n.attr) + '\u27e7 ')
            else:
                out.append(' \u27e6M\u27e7 ')
        elif n.kind == 'MEDIA':
            out.append(' \u27e6F\u27e7 ')
        elif n.kind == 'TABLE':
            out.append(' \u27e6T\u27e7 ')
        elif n.kind in EMPTY_KINDS:
            out.append(' ')
        elif n.kind in ('xref', 'docref') and not n.children:
            out.append(f'\u27e6{n.kind[0].upper()}:{n.attr}\u27e7')
        else:
            out.append(_visible_nodes(n.children, math_resolver))
    return ''.join(out)


def visible(text, literal_asterisks=0, math_resolver=None):
    """Normalized visible text of a segment in ANY dialect.  With `math_resolver`
    (n -> str), a MATH placeholder becomes a token carrying the resolver's value (e.g. a
    hash of the equation's MathML) instead of the generic token."""
    t, _ = legacy_to_bracket(text, literal_asterisks)
    try:
        nodes = parse(t)
        v = _visible_nodes(nodes, math_resolver)
    except ParseError:
        # fall back: strip marker syntax crudely so the comparison still runs
        v = re.sub(r'\[\[[A-Za-z]+:?|\]\]', ' ', t)
    v = html.unescape(v)
    v = re.sub(r'\s+', ' ', v).strip()
    # A placeholder token glued to punctuation normalizes identically on both sides
    v = re.sub(r' ?(\u27e6[MFT](?::[^\u27e7]*)?\u27e7) ?', r' \1 ', v).strip()
    v = re.sub(r'\s+', ' ', v)
    return v


def loose(v):
    """A LOOSER comparison layer, used only to characterize class-2 residue:
    NBSP/thin spaces -> space, curly quotes -> straight, dashes unified, spaces before
    punctuation removed, case folded."""
    v = v.replace('\u00a0', ' ').replace('\u2009', ' ').replace('\u202f', ' ')
    v = re.sub(r'[\u2018\u2019\u201a\u2032]', "'", v)
    v = re.sub(r'[\u201c\u201d\u201e\u2033]', '"', v)
    v = re.sub(r'[\u2013\u2014\u2212]', '-', v)
    v = re.sub(r'\s+([.,;:!?)\]])', r'\1', v)
    v = re.sub(r'([(\[])\s+', r'\1', v)
    v = re.sub(r'\s+', ' ', v).strip().casefold()
    return v
