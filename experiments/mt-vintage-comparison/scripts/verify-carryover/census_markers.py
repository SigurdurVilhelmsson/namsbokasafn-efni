import sys, os, re, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
D = load()
PATS = {
  'bracket_type': re.compile(r'\[\[([A-Za-z]+)(?::|\]\])'),
  '{{x}}': re.compile(r'\{\{(/?[a-z]+)\}\}'),
  '{{x:': re.compile(r'\{\{([a-z]+):'),
  '__x__': re.compile(r'(?<!_)__[^_\n]+?__(?!_)'),
  r'\_\_': re.compile(r'\\_\\_'),
  '++x++': re.compile(r'\+\+[^+\n]+?\+\+'),
  '[#id]': re.compile(r'\[#[A-Za-z_][\w.-]+\]'),
  '[mNNN#id]': re.compile(r'\[m\d+#[^\]]+\]'),
  '[doc:m]': re.compile(r'\[doc:m\d+\]'),
  '[t](url)': re.compile(r'\[[^\[\]]+\]\([^)\s]+\)'),
  '^x^': re.compile(r'\^[^\s^]{1,15}\^'),
  '~x~': re.compile(r'(?<=[^\s~])~[^\s~]{1,15}~'),
  '{=x=}': re.compile(r'\{=.+?=\}'),
  '*x*': re.compile(r'(?<![*\w])\*[^*\s][^*\n]*?\*(?![*\w])'),
  '[footnote:': re.compile(r'\[(?:footnote|neðanmálsgrein): '),
  'MATH': re.compile(r'\[\[MATH:\d+\]\]'),
  'html-ish <x': re.compile(r'<(?!!--)[a-zA-Z/][^>]{0,30}>'),
  'entity &x;': re.compile(r'&#?\w+;'),
  r'\[ escaped': re.compile(r'\\\['),
}
for v in ('june', 'new'):
    for lang in ('en', 'is'):
        c = collections.Counter(); bt = collections.Counter(); bx = collections.Counter(); bxc = collections.Counter(); ht = collections.Counter()
        for p, txt in D[v][lang].items():
            recs, _ = parse_first(txt)
            for k, s in recs.items():
                for name, pat in PATS.items():
                    ms = pat.findall(s)
                    if not ms: continue
                    if name == 'bracket_type':
                        bt.update(ms)
                    elif name == '{{x}}':
                        bx.update(ms)
                    elif name == '{{x:':
                        bxc.update(ms)
                    elif name == 'html-ish <x':
                        ht.update(m[:12] for m in ms)
                    else:
                        c[name] += len(ms)
        print(f'== {v} {lang}')
        print('  bracket types:', dict(bt.most_common()))
        print('  {{x}}:', dict(bx.most_common()), ' {{x:', dict(bxc))
        print('  other:', dict(c.most_common()))
        print('  html-ish:', dict(ht.most_common(12)))
