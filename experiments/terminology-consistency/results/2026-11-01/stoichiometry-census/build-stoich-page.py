"""Build the stoichiometry sense-check page from stoich-census.json.

Usage: python3 -I build-stoich-page.py <census.json> <template.html> <out.html> <items-out.json>
The sense sort below is a PROPOSAL (Claude's reading of each English context, 2026-11-01);
[USER] confirms or flips it on the page.
"""
import html, json, re, sys

census, template, out, items_out = sys.argv[1:5]
d = json.load(open(census))
rows = [r for r in d['rows'] if 'stoichiometry' in r['matching']]
assert len(rows) == 78, len(rows)

TOPIC = {1, 2, 5, 6, 11, 18, 21, 23, 25, 26, 28, 29, 30, 31, 35, 56, 64, 77}
MIXED = {4, 20, 27}
HEAD = {8}
NOTES = {
    3: 'The sentence that introduces the word: it names the reaction’s relationships, then explains the term.',
    4: 'Two uses: “a reaction of known stoichiometry” (ratios) and “the practical application of stoichiometry” (subject).',
    11: '“predicted by stoichiometry”: by the method, not by one reaction’s ratios.',
    20: 'First use names the subject; the next two are one titration’s and one process’s ratios.',
    27: '“turn to chemical stoichiometry” and “such use of stoichiometry” name the subject; “assessing the stoichiometry of pure gases” leans to ratios.',
    30: '“the stoichiometry of gases”: calculations with gases in general, read here as the subject.',
    32: 'A section title, but the section is about the ion ratios in ionic crystals (1:1 and so on).',
    33: 'One of your two blind-check items: you chose plain “hlutfallið”.',
    34: 'One of your two blind-check items: you chose plain “hlutfallið”.',
}

def sense_of(i):
    if i in HEAD: return 'head'
    if i in TOPIC: return 'topic'
    if i in MIXED: return 'mixed'
    return 'ratio'

MARK = re.compile(r'\[\[(\w+):([^\]]*)\]\]')

def clean(text):
    """Escape, then turn bracket markers into readable text."""
    out, pos = [], 0
    for m in MARK.finditer(text):
        out.append(html.escape(text[pos:m.start()]))
        kind, body = m.group(1), m.group(2)
        label = body.split('|')[0]
        if kind == 'sub': out.append(f'<sub>{html.escape(label)}</sub>')
        elif kind == 'sup': out.append(f'<sup>{html.escape(label)}</sup>')
        elif kind == 'MATH': out.append('<span class="ph">[formula]</span>')
        elif kind in ('xref', 'docref'):
            shown = body.split('|')[1] if '|' in body else ''
            out.append(html.escape(shown) if shown else '<span class="ph">[ref]</span>')
        else: out.append(html.escape(label))
        pos = m.end()
    out.append(html.escape(text[pos:]))
    return ''.join(out).replace('\n', ' ')

EN_HI = re.compile(r'\b([Ss]toichiometr\w*)')
IS_HI = re.compile(r'(?<![\wáéíóúýþæöð])(\w*(?:hlutfall|hlutföll|hlutf|magnhlut|efnajöfnu|efnajafn|efnamagn|efnismagn)\w*)', re.I)

def hi(text_html, rx):
    # Highlight only outside tags.
    parts = re.split(r'(<[^>]+>)', text_html)
    return ''.join(p if p.startswith('<') else rx.sub(r'<ins>\1</ins>', p) for p in parts)

items = []
for i, r in enumerate(rows, 1):
    is_txt = r['is'] or ''
    items.append({
        'id': f's{i:02d}',
        'n': i,
        'chapter': r['chapterDir'],
        'key': r['key'],
        'kind': r['key'].split(':')[1],
        'sense': sense_of(i),
        'carries': 'hlutfallaefnafr' in is_txt.lower(),
        'candidate': r['stoichCandidate'],
        'note': NOTES.get(i, ''),
        'en': hi(clean(r['en']), EN_HI),
        'is': hi(clean(is_txt), IS_HI),
    })

counts = {s: sum(1 for x in items if x['sense'] == s) for s in ('head', 'topic', 'mixed', 'ratio')}
keep_ratio = sum(1 for x in items if x['sense'] == 'ratio' and x['candidate'])
facts = {
    'matched': len(items),
    'candidates': sum(1 for x in items if x['candidate']),
    'carries': sum(1 for x in items if x['carries']),
    'counts': counts,
    'keepRatio': keep_ratio,
    'adjOnly': sum(1 for r in d['rows'] if 'stoichiometry' not in r['matching']),
    'adjFactor': sum(1 for r in d['rows'] if r['matching'] == ['stoichiometric-factor']),
    'adjNone': sum(1 for r in d['rows'] if r['matching'] == []),
    'rulingSet': d['rulingSet'],
    'sha256': d['sha256'],
}
json.dump({'facts': facts, 'items': items}, open(items_out, 'w'), ensure_ascii=False, indent=1)
page = open(template).read()
page = page.replace('/*ITEMS*/[]', json.dumps(items, ensure_ascii=False))
page = page.replace('/*FACTS*/{}', json.dumps(facts, ensure_ascii=False))
assert '/*ITEMS*/' not in page and '/*FACTS*/' not in page
open(out, 'w').write(page)
print(json.dumps(facts, ensure_ascii=False))
