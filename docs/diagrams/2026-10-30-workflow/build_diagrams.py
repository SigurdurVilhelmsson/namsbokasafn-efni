"""Build the four workflow diagrams as SVG.

Writes, into OUT_DIR:
  <name>.inline.svg  - classed SVG for the artifact page (styled by page CSS, themes both ways)
  <name>.svg         - standalone SVG with an embedded light-theme <style>, for slides
"""
import os
import sys
from html import escape

OUT_DIR = sys.argv[1]
LANG = sys.argv[2] if len(sys.argv) > 2 else 'en'
WARN = []
SEEN = []

try:
    from strings_is import IS
except ImportError:
    IS = {}


def T(s):
    """Translate a visible string. Code names and paths have no entry and pass through unchanged."""
    if s not in SEEN:
        SEEN.append(s)
    if LANG == 'is':
        return IS.get(s, s)
    return s

SANS_W = 0.57   # rough advance per px of font size
MONO_W = 0.61


def tw(s, size, mono=False):
    return len(s) * size * (MONO_W if mono else SANS_W)


class D:
    def __init__(self, name, w, h, label, top=0):
        self.name, self.w, self.h, self.label, self.top = name, w, h, label, top
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    # ---- primitives -------------------------------------------------
    def text(self, x, y, s, cls='s', anchor='start', rot=None):
        tr = f' transform="rotate({rot} {x} {y})"' if rot is not None else ''
        s = T(s)
        self.add(f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}"{tr}>{escape(s)}</text>')

    def box(self, x, y, w, h, kind, title, lines=(), num=None, tag=None, dashed=False):
        dc = ' dash' if dashed else ''
        self.add(f'<g class="k-{kind}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" class="bx{dc}"/>')
        tx = x + 12
        ty = y + 22
        if num is not None:
            self.add(f'<circle cx="{x + 18}" cy="{y}" r="10" class="num"/>')
            self.add(f'<text x="{x + 18}" y="{y + 4}" class="numt" text-anchor="middle">{num}</text>')
            ty = y + 30
        title = T(title)
        if tw(title, 13) > (x + w - tx - 8):
            WARN.append(f'{self.name}: title too wide: {title!r}')
        self.add(f'<text x="{tx}" y="{ty}" class="t">{escape(title)}</text>')
        ly = ty + 19
        for ln in lines:
            mono = ln.startswith('`')
            s = ln[1:] if mono else T(ln)
            cls = 'm' if mono else 's'
            size = 10.5 if mono else 11.5
            if tw(s, size, mono) > w - 20:
                WARN.append(f'{self.name}: line too wide ({int(tw(s, size, mono))}>{w - 20}): {s!r}')
            self.add(f'<text x="{x + 12}" y="{ly}" class="{cls}">{escape(s)}</text>')
            ly += 15
        if ly - 15 + 10 > y + h:
            WARN.append(f'{self.name}: box overflow: {title!r}')
        if tag:
            tag = T(tag)
            tww = tw(tag, 9.5) + 14
            self.add(f'<rect x="{x + w - tww - 8}" y="{y + 8}" width="{tww}" height="17" rx="8.5" class="tag"/>')
            self.add(f'<text x="{x + w - tww / 2 - 8}" y="{y + 20}" class="tagt" text-anchor="middle">{escape(tag)}</text>')
        self.add('</g>')

    def arrow(self, pts, label=None, lx=None, ly=None, anchor='middle', dash=False, cls=''):
        p = ' '.join(f'{a},{b}' for a, b in pts)
        dc = ' dash' if dash else ''
        self.add(f'<polyline points="{p}" class="ar{dc} {cls}" marker-end="url(#ah-{self.name}-{LANG})"/>')
        if label:
            for i, ln in enumerate(T(label).split('\n')):
                self.text(lx, ly + i * 14, ln, 'lbl', anchor)

    def line(self, pts, cls='ln'):
        p = ' '.join(f'{a},{b}' for a, b in pts)
        self.add(f'<polyline points="{p}" class="{cls}"/>')

    def gate(self, x, y1, y2, w=10, label=None, label_y=None, rot_label=None, rot_cy=None):
        self.add(f'<rect x="{x - w / 2}" y="{y1}" width="{w}" height="{y2 - y1}" class="gate"/>')
        if label:
            self.text(x, label_y, label, 'gatet', 'middle')
        if rot_label:
            cy = rot_cy if rot_cy is not None else (y1 + y2) / 2
            self.text(x + 4, cy, rot_label, 'gater', 'middle', rot=-90)

    def legend(self, x, y, items):
        cx = x
        for kind, name in items:
            self.add(f'<g class="k-{kind}"><rect x="{cx}" y="{y - 10}" width="14" height="14" rx="3" class="bx"/></g>')
            self.text(cx + 20, y + 1, name, 'lg')
            cx += 20 + tw(T(name), 11) + 26

    # ---- output -----------------------------------------------------
    def svg(self, standalone):
        defs = (f'<defs><marker id="ah-{self.name}-{LANG}" viewBox="0 0 10 10" refX="9" refY="5" '
                f'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                f'<path d="M0,0 L10,5 L0,10 z" class="ahp"/></marker></defs>')
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {self.top} {self.w} {self.h - self.top}" '
                f'class="wf" role="img" aria-label="{escape(T(self.label))}">')
        body = '\n'.join(self.parts)
        if standalone:
            bg = f'<rect y="{self.top}" width="{self.w}" height="{self.h - self.top}" class="bg"/>'
            return f'{head}\n<style>{STANDALONE_CSS}</style>\n{defs}\n{bg}\n{body}\n</svg>\n'
        return f'{head}\n{defs}\n{body}\n</svg>\n'


STANDALONE_CSS = """
.bg{fill:#f7f9fb}
text{font-family:'Schibsted Grotesk','Helvetica Neue',Arial,sans-serif;fill:#18222e}
.t{font-size:13px;font-weight:650}.s{font-size:11.5px;fill:#465364}
.m{font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:10.5px;fill:#465364}
.lbl{font-size:11px;fill:#465364;paint-order:stroke;stroke:#f7f9fb;stroke-width:4px;stroke-linejoin:round}
.hdr{font-size:11px;font-weight:700;letter-spacing:.08em;fill:#465364}
.lg{font-size:11px;fill:#465364}.ax{font-size:10.5px;fill:#465364}
.gatet{font-size:10.5px;font-weight:700;letter-spacing:.08em;fill:#b53d22}
.gater{font-size:10.5px;font-weight:700;letter-spacing:.06em;fill:#b53d22}
.numt{font-size:11px;font-weight:700;fill:#ffffff}
.tagt{font-size:9.5px;font-weight:700;letter-spacing:.04em;fill:#ffffff}
.bx{stroke-width:1.4}.bx.dash{stroke-dasharray:5 4}
.ar{fill:none;stroke:#5d6b7c;stroke-width:1.5}.ar.dash{stroke-dasharray:5 4}
.ahp{fill:#5d6b7c}.ln{fill:none;stroke:#9aa6b4;stroke-width:1;stroke-dasharray:3 3}
.gate{fill:#f6d9cf;stroke:#c4452a;stroke-width:1.2}
.band{fill:#eef2f6}.bar{rx:3}
.k-src .bx{fill:#eceff3;stroke:#8592a2}.k-src .num,.k-src .tag{fill:#6b7787}
.k-mt .bx{fill:#e1ebfa;stroke:#3a6cb4}.k-mt .num,.k-mt .tag,.k-mt .bar{fill:#3a6cb4}
.k-ai .bx{fill:#ede5fa;stroke:#7549c0}.k-ai .num,.k-ai .tag,.k-ai .bar{fill:#7549c0}
.k-hum .bx{fill:#dff2e7;stroke:#2c8656}.k-hum .num,.k-hum .tag,.k-hum .bar{fill:#2c8656}
.k-out .bx{fill:#fbedd5;stroke:#b0731b}.k-out .num,.k-out .tag,.k-out .bar{fill:#b0731b}
.k-term .bx{fill:#fae3e9;stroke:#b3426a}.k-term .num,.k-term .tag,.k-term .bar{fill:#b3426a}
.k-meas .bx{fill:#ddf0f3;stroke:#24828f;stroke-dasharray:5 3}.k-meas .tag,.k-meas .bar{fill:#24828f}
.k-note .bx{fill:none;stroke:#9aa6b4;stroke-dasharray:4 4}
.k-warn .bx{fill:none;stroke:#c4452a;stroke-dasharray:4 4}
.warnt{font-size:10.5px;fill:#b53d22}
.ar.prev{stroke:#3a6cb4;stroke-dasharray:6 3}
.ms{fill:none;stroke:#c4452a;stroke-width:1.2;stroke-dasharray:4 3}
"""

LEG_NOW = [('src', 'Source / structure'), ('mt', 'Machine translation'), ('hum', 'Human editing'),
           ('term', 'Terminology'), ('out', 'Published output')]
LEG_PLAN = [('src', 'Source'), ('mt', 'Machine translation'), ('ai', 'Machine-revised suggestions'),
            ('hum', 'Human editing'), ('meas', 'Measurement'), ('term', 'Terminology'), ('out', 'Output')]


# =====================================================================
# 1. NOW - overview
# =====================================================================
def now_overview():
    d = D('now-overview', 1280, 600, top=80, label=
          'Current workflow: OpenStax source is split into segments, machine translated, reviewed by editors, '
          'approved by a head editor and rebuilt as web pages; machine translation is published as a preview first.')
    X = [30 + i * 208 for i in range(6)]
    W, Y, H = 180, 210, 112
    specs = [
        ('src', 'OpenStax textbook', ['English source files', '(CNXML)']),
        ('src', 'Split into segments', ['sentences, paragraphs,', 'each with a fixed id']),
        ('mt', 'Machine translation', ['Málstaður API', '(Miðeind)']),
        ('hum', 'Editors review', ['in Ritstjóri, the', 'web-based editor']),
        ('hum', 'Head editor signs off', ['saved as the faithful', 'translation']),
        ('out', 'Web pages built', ['Icelandic text put', 'back into the book’s', 'structure']),
    ]
    for i, (k, t, ls) in enumerate(specs):
        d.box(X[i], Y, W, H, k, t, ls, num=i + 1)
    for i in range(5):
        d.arrow([(X[i] + W, Y + 56), (X[i + 1] - 2, Y + 56)])
    # MT preview bypass
    c2, c5 = X[2] + W / 2, X[5] + W / 2
    d.arrow([(c2, Y), (c2, 140), (c5, 140), (c5, Y - 2)],
            'MT preview goes online straight away, marked “Vélþýðing – ekki yfirfarin”.\n'
            'Each module switches to the reviewed text once its review is approved.',
            (c2 + c5) / 2, 112)
    # bottom row
    BY, BH = 430, 96
    d.box(X[2], BY, X[3] + W - X[2], BH, 'term', 'Term base and glossary',
          ['approved Icelandic terms, sent with the', 'MT request and checked in the editor'])
    d.arrow([(c2, BY), (c2, Y + H + 2)], 'terms', c2 + 8, 380, 'start')
    c3 = X[3] + W / 2
    d.arrow([(c3, BY), (c3, Y + H + 2)], 'term check', c3 + 8, 380, 'start')
    c4 = X[4] + W / 2
    d.box(X[4], BY, W, BH, 'out', 'Translation memory', ['EN–IS sentence pairs', '(TMX), rebuilt after', 'each approval'])
    d.arrow([(c4, Y + H), (c4, BY - 2)], 'rebuilt', c4 + 8, 380, 'start')
    d.box(X[5], BY, W, BH, 'out', 'namsbokasafn.is', ['the reader website,', 'updated by a manual', 'sync and deploy'])
    d.arrow([(c5, Y + H), (c5, BY - 2)], 'manual sync', c5 + 8, 380, 'start')
    d.box(X[0], BY, X[1] + W - X[0], BH, 'note', 'Who does what',
          ['About five editors and a head editor work', 'in the browser. The project lead runs the', 'command-line tools, syncs and deploys.'])
    d.legend(30, 580, LEG_NOW)
    return d


# =====================================================================
# 2. NOW - technical
# =====================================================================
def now_technical():
    d = D('now-technical', 1530, 1000,
          'Current workflow, technical: files under books/<slug>/ flow from 01-source through cnxml-extract and '
          'api-translate to 02-mt-output, into the Ritstjóri segment editor and sessions.db, are applied to '
          '03-faithful-translation, injected and rendered to 05-publication, pushed by cron and synced by hand to the reader.')
    W, G = 210, 66
    C = [140 + i * (W + G) for i in range(6)]
    R = [60, 300, 540, 780]
    H = 130
    bands = [('MACHINE', 'CLI tools'), ('EDITING', 'Ritstjóri server'), ('BUILD', 'books/<slug>/'),
             ('DELIVERY', 'git + reader')]
    for i, (a, b) in enumerate(bands):
        d.add(f'<rect x="10" y="{R[i] - 22}" width="1510" height="{H + 44}" rx="8" class="band"/>')
        d.text(24, R[i] + 6, a, 'hdr')
        d.text(24, R[i] + 22, b, 's')

    def gl(i, row, text, y_off=42):   # label centred in the gap right of column i
        d.text(C[i] + W + G / 2, R[row] + y_off, text, 'lbl', 'middle')

    # row 1
    d.box(C[0], R[0], W, H, 'src', '01-source/', ['OpenStax CNXML, English', 'read-only: the licence', 'copy (CC BY vintage)'])
    d.box(C[1], R[0], W, H, 'src', '02-for-mt/ · 02-structure/',
          ['EN segments, SEG-id markers', '`[[i:…]] [[xref:…]] [[MATH:n]]', 'structure + equations JSON'])
    d.box(C[2], R[0], W, H, 'mt', '02-mt-output/', ['pure MT, *.is.md', '*-provenance.json: arm,', 'term count, cost · read-only'])
    d.box(C[3], R[0], W, H, 'term', 'glossary-unified.json',
          ['exported from the concept', 'model by the 2-hourly cron', '(three write gates)'])
    d.box(C[4], R[0], W, H, 'out', 'Translated figures',
          ['label text translated into', 'new image files in media/', '`image-mapping.json'])
    d.box(C[5], R[0], W, H, 'note', 'Free checks (0 ISK)',
          ['source-roundtrip-check', 'render-oracle-check', 'validate · fidelity check'])
    d.arrow([(C[0] + W, R[0] + 50), (C[1] - 2, R[0] + 50)]); gl(0, 0, 'extract')
    d.arrow([(C[1] + W, R[0] + 50), (C[2] - 2, R[0] + 50)]); gl(1, 0, 'translate')
    d.arrow([(C[3], R[0] + 80), (C[2] + W + 2, R[0] + 80)]); gl(2, 0, 'terms', 72)
    d.text(C[2] + W + G / 2, R[0] + 98, '1 arm', 'lbl', 'middle')
    d.text(C[1] + W + G / 2, R[0] + 66, 'Málstaður', 'lbl', 'middle')
    # row 2
    d.box(C[0], R[1], W, H, 'hum', 'Editors (~5)', ['Microsoft Entra sign-in', 'chapter assignments', 'head editors per book'])
    d.box(C[1], R[1], W, H, 'hum', 'Segment editor  /editor',
          ['loads faithful if present,', 'else pure MT', 'term check · concordance', 'Beita víðar propagation'])
    d.box(C[2], R[1], W, H, 'hum', 'sessions.db',
          ['segment_edits (before/after)', 'segment_acceptances', 'activity_log · concept model'])
    d.box(C[3], R[1], W, H, 'hum', 'Head editor review',
          ['approve · reject · discuss', '`requireHeadEditor'])
    d.box(C[5], R[1], W, H, 'warn', 'Being built: ai-review/',
          ['rule + AI term-pass runs,', 'logged in ledger.jsonl;', 'not yet shown to editors'], dashed=True)
    d.arrow([(C[0] + W, R[1] + 50), (C[1] - 2, R[1] + 50)]); gl(0, 1, 'edit')
    d.arrow([(C[1] + W, R[1] + 50), (C[2] - 2, R[1] + 50)]); gl(1, 1, 'save')
    d.arrow([(C[2] + W, R[1] + 50), (C[3] - 2, R[1] + 50)]); gl(2, 1, 'submit')
    d.arrow([(C[2] + 40, R[0] + H), (C[2] + 40, R[0] + H + 54), (C[1] + 150, R[0] + H + 54), (C[1] + 150, R[1] - 2)],
            'loadModuleForEditing', C[1] + 158, R[0] + H + 48, 'start')
    d.arrow([(C[2] + 170, R[1]), (C[2] + 170, R[0] + H + 40), (C[3] + 60, R[0] + H + 40), (C[3] + 60, R[0] + H + 2)],
            'export-terminology', C[3] + 68, R[0] + H + 34, 'start')
    # row 3
    d.box(C[1], R[2], W, H, 'note', 'Status', ['status.json + DB stages:', 'extraction → mtOutput →', 'review → inject → render'])
    d.box(C[2], R[2], W, H, 'out', 'tm/ · corpus/',
          ['generate-tm.js pairs EN+IS', 'by SEG id (TMX), run by', 'tmService · export-corpus'])
    d.text(C[2] + 12, R[2] + H + 16, 'counts every faithful segment as human', 'warnt')
    d.box(C[3], R[2], W, H, 'hum', '03-faithful-translation/',
          ['reviewed *.is.md', '+ -review-status.json', 'chemistry: held (PR #556)'])
    d.text(C[3] + 12, R[2] + H + 16, 'first approval writes the whole module', 'warnt')
    d.box(C[4], R[2], W, H, 'src', '03-translated/',
          ['translated CNXML per', 'module, figures swapped in'])
    d.box(C[5], R[2], W, H, 'out', '05-publication/',
          ['mt-preview/ and faithful/', 'semantic HTML, MathJax', 'pre-rendered to SVG'])
    d.arrow([(C[3] + 110, R[1] + H), (C[3] + 110, R[2] - 2)])
    d.text(C[3] + 102, R[1] + H + 40, 'applyApprovedEdits()', 'lbl', 'end')
    d.text(C[3] + 102, R[1] + H + 54, 'Vista í skrár / Vista + Birta', 'lbl', 'end')
    d.arrow([(C[3], R[2] + 50), (C[2] + W + 2, R[2] + 50)]); gl(2, 2, 'regen')
    d.arrow([(C[3] + W, R[2] + 50), (C[4] - 2, R[2] + 50)]); gl(3, 2, 'inject')
    d.arrow([(C[4] + W, R[2] + 50), (C[5] - 2, R[2] + 50)]); gl(4, 2, 'render')
    # figures -> 03-translated, straight down through the empty slot
    d.arrow([(C[4] + 130, R[0] + H), (C[4] + 130, R[2] - 2)], 'swap <image src>', C[4] + 138, R[1] + 60, 'start')
    # mt-preview: pure MT straight to inject (over the top of row 1, down the gap)
    gx = C[3] + W + G / 2
    d.arrow([(C[2] + 180, R[0]), (C[2] + 180, R[0] - 12), (gx, R[0] - 12), (gx, R[2] - 20),
             (C[4] + 40, R[2] - 20), (C[4] + 40, R[2] - 2)], cls='prev')
    d.text(gx - 6, R[0] - 16, 'mt-preview: inject pure MT, skip review', 'lbl', 'end')
    # row 4 (right to left)
    d.box(C[5], R[3], W, H, 'src', 'git-backup.sh', ['cron every 2 h: commits', 'books/ and pushes to', 'GitHub main'])
    d.box(C[4], R[3], W, H, 'src', 'GitHub · efni main', ['public repository', 'the sync Action has', 'never succeeded'])
    d.box(C[3], R[3], W, H, 'out', 'vefur sync-content.js',
          ['run by hand', 'PUBLISHED_BOOKS allowlist', 'then build + deploy.yml'])
    d.box(C[2], R[3], W, H, 'out', 'namsbokasafn.is',
          ['MT preview, or faithful', 'once a module is approved'])
    d.arrow([(C[5] + 105, R[2] + H), (C[5] + 105, R[3] - 2)], 'on disk', C[5] + 113, R[2] + H + 40, 'start')
    d.arrow([(C[5], R[3] + 50), (C[4] + W + 2, R[3] + 50)]); gl(4, 3, 'push')
    d.arrow([(C[4], R[3] + 50), (C[3] + W + 2, R[3] + 50)]); gl(3, 3, 'by hand')
    d.arrow([(C[3], R[3] + 50), (C[2] + W + 2, R[3] + 50)]); gl(2, 3, 'deploy')
    d.legend(140, 975, LEG_NOW + [('note', 'Note / check')])
    return d


# =====================================================================
# 3. PLANNED - overview
# =====================================================================
def plan_overview():
    d = D('plan-overview', 1280, 880, top=96, label=
          'Planned workflow: pure MT is kept, machine-revised term suggestions are prepared, editors review behind '
          'an editing gate with measurement on, approved segments pass an apply gate to the reviewed book, '
          'and open releases pass a release gate; audio is generated from reviewed chapters.')
    X = [30 + i * 208 for i in range(6)]
    W, Y, H = 180, 220, 122
    specs = [
        ('src', 'OpenStax textbook', ['English source,', 're-extracted'], None),
        ('mt', 'Machine translation', ['kept exactly as', 'received'], 'LAYER 1'),
        ('ai', 'Suggestions', ['house-style term rules', 'and a narrow AI pass', 'on ruled terms'], 'LAYER 2'),
        ('hum', 'Editors review', ['accept or reject each', 'suggestion, edit the', 'rest by hand'], None),
        ('hum', 'Approved text', ['only what an editor', 'changed or accepted', 'counts as human'], 'LAYER 3'),
        ('out', 'Reviewed book', ['online chapter by', 'chapter, MT banner', 'removed'], None),
    ]
    for i, (k, t, ls, tag) in enumerate(specs):
        d.box(X[i], Y, W, H, k, t, ls, num=i + 1)
        if tag:
            d.add(f'<g class="k-{k}"><rect x="{X[i] + 12}" y="{Y + H - 26}" width="{tw(T(tag), 9.5) + 14:.0f}" height="17" rx="8.5" class="tag"/></g>')
            d.text(X[i] + 19, Y + H - 14, tag, 'tagt')
    for i in range(5):
        d.arrow([(X[i] + W, Y + 56), (X[i + 1] - 2, Y + 56)])
    # gates on the main flow
    g1 = X[3] - 14
    g2 = X[4] - 14
    d.gate(g1, 190, Y + H + 20, 8, 'EDITING GATE', 180)
    d.gate(g2, 190, Y + H + 20, 8, 'APPLY GATE', 180)
    # preview bypass
    c1, c5 = X[1] + W / 2, X[5] + W / 2
    d.arrow([(c1, Y), (c1, 140), (c5, 140), (c5, Y - 2)],
            'The MT preview stays online until a chapter’s review is published.', (c1 + c5) / 2, 128)
    # bottom row
    BY, BH = 450, 104
    d.box(X[2], BY, W, BH, 'term', 'Term tools', ['find terms by lemma', 'and word class; push a', 'decision into every', 'inflected form'])
    c3 = X[3] + W / 2
    d.arrow([(X[2] + W / 2, BY), (X[2] + W / 2, 410), (X[3] + 40, 410), (X[3] + 40, Y + H + 2)],
            'B2 · B3', X[2] + W / 2 + 8, 402, 'start')
    d.box(X[3], BY, W, BH, 'meas', 'Measurement', ['active editing time and', 'edit distance; reported', 'only in aggregate'])
    d.arrow([(c3 + 30, Y + H), (c3 + 30, BY - 2)], 'B1 records', c3 + 38, 430, 'start', dash=True)
    c4 = X[4] + W / 2
    d.box(X[4], BY, W, BH, 'out', 'Open releases', ['TMX, parallel corpus,', 'chemistry term', 'collection · CC BY 4.0'])
    d.arrow([(c4, Y + H), (c4, BY - 2)])
    d.add(f'<rect x="{c4 - 22}" y="{Y + H + 46}" width="44" height="8" class="gate"/>')
    d.text(c4 + 28, Y + H + 54, 'RELEASE GATE', 'gatet', 'start')
    c5 = X[5] + W / 2
    d.box(X[5], BY, W, BH, 'out', 'Audio', ['speech synthesis of', 'reviewed chapters,', 'self-hosted'])
    d.arrow([(c5, Y + H), (c5, BY - 2)], 'C', c5 + 8, 430, 'start')
    d.box(X[0], BY, X[1] + W - X[0], BH, 'note', 'Research comparison',
          ['Layers 1, 2 and 3 are stored apart, so a paper', 'can compare pure MT, AI-revised MT and', 'human-edited text, with cost and editing time.'])
    d.legend(30, 610, LEG_PLAN)
    # timeline
    x0, mw = 200, 84
    ty = 660
    d.text(30, ty - 8, 'THE PROJECT YEAR', 'hdr')
    d.text(160, ty - 8, 'S = 1 November 2026 · final report due 1 December 2027', 's')
    months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
    for i, m in enumerate(months):
        d.text(x0 + i * mw + mw / 2, ty + 14, m, 'ax', 'middle')
        d.line([(x0 + i * mw, ty + 20), (x0 + i * mw, ty + 160)], 'ln')
    d.line([(x0 + 12 * mw, ty + 20), (x0 + 12 * mw, ty + 160)], 'ln')
    rows = [('mt', 'Measurement (B1)', 1, 3), ('term', 'Term detection (B2)', 1, 4), ('hum', 'Editing (A)', 2, 10),
            ('term', 'Term propagation (B3)', 5, 9), ('out', 'Audio (C)', 7, 12)]
    for j, (k, name, a, b) in enumerate(rows):
        yy = ty + 30 + j * 24
        kk = 'meas' if j == 0 else k
        d.text(x0 - 10, yy + 12, name, 'ax', 'end')
        d.add(f'<g class="k-{kk}"><rect x="{x0 + (a - 1) * mw + 2}" y="{yy + 2}" width="{(b - a + 1) * mw - 4}" height="14" rx="3" class="bar"/></g>')
    yy = ty + 30 + 5 * 24
    d.text(x0 - 10, yy + 12, 'Open releases (D)', 'ax', 'end')
    dx = x0 + 12 * mw - 8
    d.add(f'<g class="k-out"><path d="M{dx},{yy + 1} l8,8 l-8,8 l-8,-8 z" class="bar"/></g>')
    d.text(dx - 14, yy + 13, 'by the end of month 12', 'ax', 'end')
    # milestones
    m1 = x0 + 0.95 * mw
    d.line([(m1, ty + 22), (m1, ty + 170)], 'ms')
    d.text(m1 + 4, ty + 182, 'editing gate ≈ 29 Nov–6 Dec', 'ax')
    m3 = x0 + 3 * mw
    d.line([(m3, ty + 22), (m3, ty + 170)], 'ms')
    d.text(m3 + 4, ty + 198, 'apply gate + dress rehearsal by month 3', 'ax')
    d.text(x0 + 12 * mw + 6, ty + 14, '→ report', 'ax')
    return d


# =====================================================================
# 4. PLANNED - technical
# =====================================================================
def plan_technical():
    d = D('plan-technical', 1430, 1110,
          'Planned workflow, technical: pure MT (layer 1) and selected MT (layer 1s) feed the editor as base text; '
          'a ruling set drives a rule layer and a gated AI term pass into layer 2, shown to editors only as suggestions; '
          'an editing gate, an apply gate and a release gate separate preparation, editing, publishing and the open releases; '
          'measurement, term tools and audio run alongside.')
    H = 120
    R = [70, 240, 410, 580, 750, 920]
    c1, w1 = 30, 220
    c2, w2 = 290, 200
    c3, w3 = 570, 230
    c4, w4 = 900, 210
    c5, w5 = 1180, 220
    G1, G2, G3 = 545, 865, 1145
    hdrs = [(c1 + w1 / 2, 'SOURCE AND MT'), (c2 + w2 / 2, 'MACHINE LAYERS · PREP'), (c3 + w3 / 2, 'EDITING IN RITSTJÓRI'),
            (c4 + w4 / 2, 'APPLY AND PUBLISH'), (c5 + w5 / 2, 'OPEN RELEASES (D)')]
    for x, s in hdrs:
        d.text(x, 36, s, 'hdr', 'middle')
    d.gate(G1, 50, 1050, 18, rot_label='EDITING GATE · measurement live · consent · write and scope guards · editor privacy · BÍN credit', rot_cy=340)
    d.gate(G2, 50, 1050, 18, rot_label='APPLY GATE · base-text guard · per-segment “human” in TM + corpus · sidecar privacy · completion rule · hold lifted', rot_cy=690)
    d.gate(G3, 50, 1050, 18, rot_label='RELEASE GATE · rights on file · BÍN contained · licence and credit fields', rot_cy=790)
    # col 1
    d.box(c1, R[0], w1, H, 'src', '01-source/', ['OpenStax CNXML, read-only', 'never refreshed from', 'upstream without consent'])
    d.box(c1, R[1], w1, H, 'src', '02-for-mt/ · 02-structure/', ['re-extracted EN segments', 'one marker dialect'])
    d.box(c1, R[2], w1, H, 'mt', 'Layer 1 · 02-mt-output/', ['pure Málstaður output', 'never overwritten', 'provenance per module'])
    d.box(c1, R[3], w1, H, 'mt', 'Layer 1s · 02-mt-selected/', ['per-segment choice of API', 'runs + manifest; re-request', 'mode for untranslated ones'])
    d.box(c1, R[4], w1, H, 'out', 'MT preview', ['layer 1s injected and', 'rendered; readers see it', 'until a chapter is reviewed'])
    d.box(c1, R[5], w1, H, 'note', 'Free checks', ['round-trip + render oracle', 'marker census, sentinel', 'before any preview ships'])
    for a, b, lab in [(0, 1, 'cnxml-extract'), (1, 2, 'api-translate'), (2, 3, 'select / re-request')]:
        d.arrow([(c1 + 60, R[a] + H), (c1 + 60, R[b] - 2)], lab, c1 + 68, R[a] + H + 30, 'start')
    d.arrow([(c1 + 60, R[3] + H), (c1 + 60, R[4] - 2)], 'inject + render', c1 + 68, R[3] + H + 30, 'start')
    # col 2
    d.box(c2, R[0], w2, H, 'term', 'Ruling set', ['project lead’s term rulings', 'compiled into one dated', 'artifact with scopes'])
    d.box(c2, R[1], w2, H, 'ai', 'Rule layer', ['deterministic edits: key-', 'term headwords, markup,', 'computed exact swaps'])
    d.box(c2, R[2], w2, H, 'ai', 'AI term pass', ['`ai-review/ · edit ops','find, replace, ruling id;', 'code gate checks scope'])
    d.box(c2, R[3], w2, H, 'ai', 'Layer 2 · 02-mt-revised/', ['per-change log; hashes of', 'inputs, prompt and model', 'refuse on any change'])
    d.box(c2, R[4], w2, H, 'src', 'Freeze', ['git tag + manifest of', 'every layer, before the', 'first unit opens'])
    d.arrow([(c2 + 100, R[0] + H), (c2 + 100, R[1] - 2)], 'rulings', c2 + 108, R[0] + H + 30, 'start')
    # ruling set -> AI pass via left corridor
    d.arrow([(c2, R[0] + 90), (c2 - 18, R[0] + 90), (c2 - 18, R[2] + 30), (c2 - 2, R[2] + 30)])
    # 1s -> AI pass (reads 1s, not rule output)
    d.arrow([(c1 + w1, R[3] + 30), (c2 - 8, R[3] + 30), (c2 - 8, R[2] + 90), (c2 - 2, R[2] + 90)])
    d.text(c1 + w1 + 3, R[3] + 48, 'reads', 'lbl', 'start')
    d.arrow([(c2 + 100, R[2] + H), (c2 + 100, R[3] - 2)], 'accepted ops', c2 + 108, R[2] + H + 30, 'start')
    # rule layer -> layer 2 via right corridor
    d.arrow([(c2 + w2, R[1] + 60), (c2 + w2 + 22, R[1] + 60), (c2 + w2 + 22, R[3] + 30), (c2 + w2 + 2, R[3] + 30)])
    d.arrow([(c2 + 100, R[3] + H), (c2 + 100, R[4] - 2)], 'recorded in', c2 + 108, R[3] + H + 30, 'start')
    # col 3
    d.box(c3, R[0], w3, H, 'hum', 'Editors sign in', ['written consent recorded', 'chapters assigned', 'organic + withheld books refused'])
    d.box(c3, R[1], w3, H, 'hum', 'Head editor approves', ['approve · reject · discuss', 'approved edits wait in the', 'database until the apply gate'])
    d.box(c3, R[2], w3, H, 'hum', 'sessions.db', ['segment_edits + acceptances', 'served-version record + origin', 'revision history'])
    d.box(c3, R[3], w3, H, 'hum', 'Segment editor', ['base: human › 1s › pure MT', 'rule + AI edits as suggestions', 'ch01–02 reviewer notes shown'])
    d.box(c3, R[4], w3, H, 'meas', 'B1 · measurement', ['active-time ticks every 5 s', 'pseudonymous editor key', 'distance pure → served → final'])
    d.box(c3, R[5], w3, H, 'term', 'B2 · B3 · term tools', ['Nefnir + ABLTagger lemmas', '≥ 4 lemma-based change types', 'decision → BÍN forms, book-wide'])
    d.arrow([(c3 + 115, R[3]), (c3 + 115, R[2] + H + 2)], 'saves', c3 + 123, R[2] + H + 30, 'start')
    d.arrow([(c3 + 115, R[2]), (c3 + 115, R[1] + H + 2)], 'submits', c3 + 123, R[1] + H + 30, 'start')
    d.arrow([(c3 + 115, R[3] + H), (c3 + 115, R[4] - 2)], 'ticks', c3 + 123, R[3] + H + 30, 'start', dash=True)
    # layer 2 -> editor (suggestions), across gate 1
    d.arrow([(c2 + w2, R[3] + 80), (c3 - 2, R[3] + 80)])
    # 1s -> editor (base text) along the gap under row 4
    d.arrow([(c1 + 180, R[3] + H), (c1 + 180, R[3] + H + 18), (c3 + 30, R[3] + H + 18), (c3 + 30, R[3] + H + 2)])
    d.text(c2 + 10, R[3] + H + 14, 'base text', 'lbl', 'start')
    # term tools -> editor via right corridor
    d.arrow([(c3 + w3, R[5] + 60), (c3 + w3 + 24, R[5] + 60), (c3 + w3 + 24, R[3] + 60), (c3 + w3 + 2, R[3] + 60)])
    d.text(c3 + w3 + 16, (R[3] + R[5]) / 2 + 60, 'propagate decisions', 'lbl', 'middle', rot=-90)
    # col 4
    d.box(c4, R[1], w4, H, 'hum', '03-faithful-translation/', ['human text per segment', 'review-status sidecar', 'without usernames'])
    d.box(c4, R[2], w4, H, 'out', 'Inject + render', ['faithful: 03-translated', '→ 05-publication', 'dress rehearsal by month 3'])
    d.box(c4, R[3], w4, H, 'out', 'Sync to the reader', ['by book, timed with classes', 'chapter hold-back if staged', 'credit sentence on pages'])
    d.box(c4, R[4], w4, H, 'out', 'namsbokasafn.is', ['reviewed chapters', 'MT banner removed only', 'when the module is complete'])
    d.box(c4, R[5], w4, H, 'out', 'C · audio', ['Regína → IceG2P → voice', 'formula pronunciation layer', 'self-hosted audio files'])
    d.arrow([(c3 + w3, R[1] + 60), (c4 - 2, R[1] + 60)])
    d.text(c3 + w3 + 6, R[1] + 52, 'apply', 'lbl', 'start')
    for a, b, lab in [(1, 2, ''), (2, 3, ''), (3, 4, 'deploy'), (4, 5, 'reviewed chapters')]:
        d.arrow([(c4 + 105, R[a] + H), (c4 + 105, R[b] - 2)], lab or None, c4 + 113, R[a] + H + 30, 'start')
    # col 5
    d.box(c5, R[1], w5, H, 'out', 'TMX', ['human-only segments', 'licence + both credits', 'in the header'])
    d.box(c5, R[2], w5, H, 'out', 'Parallel corpus', ['tiers: pure, selected,', 'revised, human', 'no editor keys or times'])
    d.box(c5, R[3], w5, H, 'out', 'Term collection', ['chemistry terms with', 'definitions and sources', 'no BÍN forms · CC BY 4.0'])
    d.box(c5, R[4], w5, H, 'out', 'Deposit + report', ['outputs posted and', 'deposited, both grants', 'credited'])
    d.box(c5, R[5], w5, H, 'note', 'Research paper', ['three conditions compared:', 'pure MT · AI-revised · human', 'with B1 time and distance'])
    d.arrow([(c4 + w4, R[1] + 60), (c5 - 2, R[1] + 60)])
    d.arrow([(c4 + w4, R[1] + 95), (c4 + w4 + 18, R[1] + 95), (c4 + w4 + 18, R[2] + 60), (c5 - 2, R[2] + 60)])
    d.legend(30, 1088, LEG_PLAN + [('note', 'Note / check')])
    return d


os.makedirs(OUT_DIR, exist_ok=True)
for fn in (now_overview, now_technical, plan_overview, plan_technical):
    dg = fn()
    suffix = '' if LANG == 'en' else '.' + LANG
    with open(os.path.join(OUT_DIR, dg.name + suffix + '.inline.svg'), 'w') as f:
        f.write(dg.svg(False))
    with open(os.path.join(OUT_DIR, dg.name + suffix + '.svg'), 'w') as f:
        f.write(dg.svg(True))
for w in WARN:
    print('WARN', w)
if '--strings' in sys.argv:
    import json
    print(json.dumps(SEEN, ensure_ascii=False, indent=0))
print('done')
