#!/usr/bin/env python3
"""Census of inline-marker dialects in both vintages, EN and IS."""
import json, re, sys
from collections import Counter, defaultdict
C = json.load(open(sys.argv[1]))
SEG = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
pats = {
  'bracket[[type:': re.compile(r'\[\[([A-Za-z]+):'),
  'bracket-noncolon[[x]]': re.compile(r'\[\[(?![A-Za-z]+:)([^\]]{0,20})'),
  'paired{{x}}': re.compile(r'\{\{(/?)([A-Za-z]+)\}\}'),
  'colon{{X:': re.compile(r'\{\{([A-Za-z]+):'),
  'other{{': re.compile(r'\{\{(?!/?[A-Za-z]+\}\})(?![A-Za-z]+:)(.{0,12})'),
  '__x__': re.compile(r'__([^_\n]{1,60}?)__'),
  '++x++': re.compile(r'\+\+([^+\n]{1,60}?)\+\+'),
  '[#id]': re.compile(r'\[#([^\]\s]+)\]'),
  '[text](url)': re.compile(r'\[([^\]\n]{1,80})\]\(([^)\s]{1,200})\)'),
  '~sub~': re.compile(r'~([^~\s]{1,20})~'),
  '^sup^': re.compile(r'\^([^\^\s]{1,20})\^'),
  '**b**': re.compile(r'\*\*([^*\n]{1,80}?)\*\*'),
  '*i*': re.compile(r'(?<![*\w])\*([^*\n]{1,80}?)\*(?![*\w])'),
  '<tag': re.compile(r'<(/?[a-zA-Z][a-zA-Z0-9:-]*)'),
  '&ent;': re.compile(r'&(#?\w+);'),
  '\\(latex': re.compile(r'\\\(|\\\[|\$\$'),
  '[MATH/MEDIA bare': re.compile(r'(?<!\[)\[(MATH|MEDIA|TABLE|IMG|FIG|EQ)[:_ ]?\d*'),
  '{#id}': re.compile(r'\{#([^}\s]+)\}'),
  '[^fn]': re.compile(r'\[\^([^\]]+)\]'),
  'bare[x]': re.compile(r'(?<![\[\w])\[(?!\[)(?!#)([^\]\n]{1,40})\](?!\()'),
}
res = defaultdict(Counter)
examples = defaultdict(list)
segcount = Counter()
for ch, mods in C['files'].items():
    for m, vs in mods.items():
        for v, langs in vs.items():
            for lang, txt in langs.items():
                if txt is None: continue
                k = f'{v}-{lang}'
                body = SEG.sub('\n', txt)
                segcount[k] += len(SEG.findall(txt))
                for name, p in pats.items():
                    for mm in p.finditer(body):
                        sub = name
                        if name in ('bracket[[type:', 'colon{{X:'):
                            sub = name + mm.group(1)
                        elif name == 'paired{{x}}':
                            sub = name + mm.group(2)
                        elif name == '<tag':
                            sub = name + mm.group(1).lstrip('/')
                        elif name == '&ent;':
                            sub = name + mm.group(1)
                        elif name == '[MATH/MEDIA bare':
                            sub = name + mm.group(1)
                        res[sub][k] += 1
                        if len(examples[(sub, k)]) < 2:
                            s = max(0, mm.start() - 30)
                            examples[(sub, k)].append(body[s:mm.end() + 40].replace('\n', ' '))
print('segments', dict(segcount))
keys = ['old-en', 'old-is', 'new-en', 'new-is']
for sub in sorted(res, key=lambda s: -sum(res[s].values())):
    print(f'{sub:32s}', '  '.join(f'{k}:{res[sub][k]:6d}' for k in keys))
print('\nEXAMPLES')
for sub in sorted(res, key=lambda s: -sum(res[s].values())):
    for k in keys:
        for e in examples.get((sub, k), [])[:1]:
            print(f'{sub} [{k}] ...{e}...')
