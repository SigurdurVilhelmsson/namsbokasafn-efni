#!/usr/bin/env python3
"""Which MT vintage does each LIVE key-terms page carry? Kept apart from measure.py
so the MT-vs-MT measurement never depends on the website.

For every taught term whose key-terms entry differs between vintages, look for the
OLD entry and the NEW entry in the page text. A page carrying the old vintage shows
old-only hits and no new-only hits.

  --control  read the locally rendered mt-preview pages instead of the live site.
             They are the NEW vintage, so new-only must be > 0 there. Without that
             control, a zero on the live site could mean an instrument that sees nothing.

Usage: python3 experiments/terminology-consistency/live_check.py <classified.json> <scratch-dir> [--control]
The live content URL is /content/<book>/chapters/<NN>/<file>.html; a page URL would return
the SPA shell for any path (CLAUDE.md § Content delivery).
"""
import html, json, os, re, subprocess, sys, time

BASE = 'https://namsbokasafn.is/content/efnafraedi-2e'


def page_text(raw):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', raw))).lower()


def norm(s):
    s = re.sub(r'\[\[[a-z]+:([^\]|]*)(?:\|[^\]]*)?\]\]', r'\1', s or '')
    return re.sub(r'\s+', ' ', s.replace('^', '')).strip().lower()


def main():
    cl = json.load(open(sys.argv[1], encoding='utf-8'))
    scratch = sys.argv[2]
    control = '--control' in sys.argv
    os.makedirs(scratch, exist_ok=True)
    toc = None
    if not control:
        p = os.path.join(scratch, 'toc.json')
        subprocess.run(['curl', '-sf', '-o', p, f'{BASE}/toc.json'], check=True)
        toc = json.load(open(p, encoding='utf-8'))
    for c in cl['chapters']:
        n = int(c['chapter'][2:])
        if control:
            f = f'{n}-key-terms.html'
            raw = open(f'books/efnafraedi-2e/05-publication/mt-preview/chapters/{n:02d}/{f}', encoding='utf-8').read()
        else:
            ch = next(x for x in toc['chapters'] if x['number'] == n)
            f = next(s['file'] for s in ch['sections'] if s.get('type') == 'glossary')
            p = os.path.join(scratch, f)
            subprocess.run(['curl', '-sf', '-o', p, f'{BASE}/chapters/{n:02d}/{f}'], check=True)
            raw = open(p, encoding='utf-8', errors='replace').read()
            time.sleep(0.3)
        low = page_text(raw)
        old = new = both = 0
        for t in c['terms']:
            if not t['renderingChanged']:
                continue
            a, b = norm(t['K']['old']) in low, norm(t['K']['new']) in low
            both += a and b
            old += a and not b
            new += b and not a
        print(f"{'CONTROL ' if control else ''}{c['chapter']} {f} {len(raw)} bytes  old-only {old}  new-only {new}  both {both}")


if __name__ == '__main__':
    main()
