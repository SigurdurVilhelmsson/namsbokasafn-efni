"""Draft the editors' fixes for the 8 ruthenium and 18 lanthanide segments, applying [USER]'s rulings of
2026-11-20: (1) masculine lanþaníð-, as in the glossary, with `lanþaníðarnir` in the problem segment;
(2) drop the óíð alternatives, lanthanide and actinide; (3) fix every other off-list element name to the
official list (Vísindavefur 89909). Deterministic; each step is verified on its own.

Writes <out>.json (data), <out>.md (review) and <out>-paste.txt (one block per segment).
Usage (from this folder):
  python3 -I build-editor-fixes.py ../data/fix-targets.json ../data/comparison-official-vs-resolver.json \\
      ../data/render-census-69-names.json ../data/dry-counts-9-names.json <bin-official.json> <out-prefix>
<bin-official.json> comes from extract-bin-forms.py and your own BÍN download; it is not committed
(docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md)."""
import difflib
import json
import re
import sys

tgt_path, cmp_path, census_path, nine_path, bin_path, out = sys.argv[1:7]


def load_report(path):
    """The raw stdin output (one JSON line + END-OF-REPORT) or the committed, pretty-printed copy."""
    raw = open(path, encoding='utf-8').read().rstrip()
    if raw.endswith('END-OF-REPORT'):
        raw = raw[:-len('END-OF-REPORT')]
    return json.loads(raw)


segs = load_report(tgt_path)['segments']
cmp_ = json.load(open(cmp_path, encoding='utf-8'))
census = json.load(open(census_path, encoding='utf-8'))
nine = json.load(open(nine_path, encoding='utf-8'))
BIN = {k: set(v) for k, v in json.load(open(bin_path, encoding='utf-8')).items()}

OFFICIAL = sorted({o.lower() for i in cmp_['items'] for o in i['official']}, key=len, reverse=True)
W, WE = r'(?<![\w])', r'(?![\w])'
INFL = {'', 's', 'i', 'ið', 'inu', 'sins'}
keepcase = lambda old, new: (new[0].upper() + new[1:]) if old[:1].isupper() else new


def token_diff(a, b):
    ta, tb = re.findall(r'\w+|\W', a), re.findall(r'\w+|\W', b)
    sm = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    return [(''.join(ta[i1:i2]), ''.join(tb[j1:j2])) for t, i1, i2, j1, j2 in sm.get_opcodes() if t != 'equal']


def verified(before, after, pairs, step, sid):
    d = token_diff(before, after)
    assert sorted(d) == sorted(pairs), (sid, step, d, pairs)
    return after


# ── Step A: the requested stem substitutions ─────────────────────────────────────────────
RU = {'rúþen': 'rúþeníum', 'rúþeni': 'rúþeníum', 'rúþens': 'rúþeníums',
      'rúþenið': 'rúþeníumið', 'rúþeninu': 'rúþeníuminu', 'rúþensins': 'rúþeníumsins'}


def step_a(text, kind):
    pairs = []
    if kind == 'ruthenium':
        def rep(m):
            w = m.group(0)
            assert w.lower() in RU, w
            n = keepcase(w, RU[w.lower()]); pairs.append((w, n)); return n
        t = re.sub(W + r'rúþen\w*' + WE, rep, text, flags=re.I)
    else:
        def rep(m):
            w = m.group(0); n = w[0] + 'anþan' + w[6:]; pairs.append((w, n)); return n
        t = re.sub(W + r'lantan(?:íð|óíð)\w*' + WE, rep, text, flags=re.I)
    return t, pairs


# ── Steps D1 and D2: rulings that change more than one word (exact match, once each) ─────
PHRASES = {
    # D1: masculine as in the glossary.
    'm68842:para:fs-idm265281664': [('mynda öll lanþaníð stöðugar', 'mynda allir lanþaníðar stöðugar', 'D1')],
    'm68842:problem:fs-idm214633312': [('finnast lanþaníð frumefnin ekki', 'finnast lanþaníðarnir ekki', 'D1')],
    # D2: drop the óíð alternatives, lanthanide and actinide (each also drops a term marker).
    'm68842:para:fs-idm9696240': [(' (eða [[term:lanþanóíðaröðina|term-00008]])', '', 'D2'),
                                  (' (eða [[term:aktínóíðaröðina|term-00010]])', '', 'D2')],
    'm68842:glossary-def:fs-idm108395328-def': [('(einnig lanþanóíðaröð) ', '', 'D2')],
}


def step_phrases(text, sid):
    done = []
    for old, new, tag in PHRASES.get(sid, []):
        assert text.count(old) == 1, (sid, old)
        i = text.index(old)
        text2 = text[:i] + new + text[i + len(old):]
        # Only that span changed: the text before it and after it is byte-identical.
        assert text2[:i] == text[:i] and text2[i + len(new):] == text[i + len(old):]
        done.append((tag, old.strip(), new.strip()))
        text = text2
    return text, done


# ── Step D3: every other off-list element name ───────────────────────────────────────────
BASES = {}  # non-official base -> official
for r in census['rows']:
    off = r['official'][0]
    for b, v in r['bases'].items():
        if not v['official']:
            BASES.setdefault(b.lower(), off)
for sp in nine['specs']:
    BASES.setdefault(sp['resolvesTo'].lower(), sp['official'])
BASES_BY_LEN = sorted(BASES, key=len, reverse=True)


def map_name(word):
    """(new, note) for an off-list element name, ('', note) for one left alone, or None."""
    lw = word.lower()
    if any(lw.startswith(o) for o in OFFICIAL):
        return None
    b = next((x for x in BASES_BY_LEN if lw.startswith(x)), None)
    if b is None:
        return None
    off = BASES[b]
    x = lw[len(b):]
    if x not in INFL:
        return ('', f'compound or derived word, not changed: {word}')
    if b.endswith('íum') and off.endswith('íum'):
        new = off + x                      # a spelling fix keeps the MT's ending (litíumi → liþíumi)
    elif off.endswith('íum'):
        new = off + {'i': ''}.get(x, x)    # -ín or short form → -íum; dative = BÍN's main dative
    else:
        new = off + x                      # lanþan, astatín: same paradigm shape as the old form
    new = keepcase(word, new)
    forms = BIN.get(off)
    if forms is None:
        note = f'{off} is not in BÍN; form follows the -íum pattern' if off.endswith('íum') else f'{off} is not in BÍN'
    elif new.lower() not in forms:
        note = f'NOT a BÍN form of {off}'
    else:
        note = None
    return (new, note)


def step_d3(text):
    pairs, notes = [], []
    def rep(m):
        w = m.group(0)
        r = map_name(w)
        if r is None:
            return w
        new, note = r
        if not new:
            notes.append(note); return w
        if note:
            notes.append(f'{new}: {note}')
        pairs.append((w, new)); return new
    return re.sub(r'\w+', rep, text), pairs, notes


res = []
for s in segs:
    sid, cur = s['segmentId'], s['current']
    a, pa = step_a(cur, s['set'])
    a = verified(cur, a, pa, 'A', sid)
    b, phrases = step_phrases(a, sid)
    c, pc, notes = step_d3(b)
    c = verified(b, c, pc, 'D3', sid)
    assert not re.findall(W + (r'rúþen(?!íum)\w*' if s['set'] == 'ruthenium' else r'lantan(?:íð|óíð)\w*') + WE, c, flags=re.I), sid
    assert 'lanþanóíð' not in c and 'aktínóíð' not in c, sid
    masc = sorted({w for w in re.findall(r'\w+', c) if re.fullmatch(r'(?i)lanþaníð(ar|inn|arnir)', w)})
    res.append({'set': s['set'], 'chapter': s['chapter'], 'moduleId': s['moduleId'], 'segmentId': sid,
                'current': cur, 'proposed': c, 'stem': pa, 'phrases': phrases, 'names': pc,
                'notes': sorted(set(notes)), 'masculineKept': masc, 'length': len(cur)})

# The nine book entries' expected worklists, before and after these fixes are saved.
by_id = {r['segmentId']: r for r in res}
impact = []
for sp in nine['specs']:
    ids = [i['segmentId'] for i in sp['items']]
    fixed = [i for i in ids if i in by_id and not any(
        re.search(W + re.escape(f) + WE, by_id[i]['proposed'], re.I) for f in sp['oldForms'])]
    impact.append((sp['english'], len(ids), len(ids) - len(fixed)))

json.dump({'segments': res, 'worklistImpact': impact}, open(out + '.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

ch = lambda c: 'App.' if c == -1 else str(c)
md = ["# Editors' fixes: ruthenium, the lanthanide words, and every other off-list element name in the same 26 segments", '',
      "Drafted 2026-11-20 from the effective Icelandic on production (read-only; no segment had a live edit). [USER]'s rulings "
      "of 2026-11-20: (1) masculine `lanþaníð-`, as in the glossary, with `lanþaníðarnir` in the problem segment; (2) the "
      "`óíð` alternatives dropped, lanthanide and actinide; (3) every other off-list element name fixed to the official list "
      "(Vísindavefur 89909). Each step is a fixed rule, verified word by word; nothing else differs.", '',
      "- Ruthenium cases follow BÍN: `rúþeni` (dative) → `rúþeníum`, BÍN's main dative. Other `-ín` names turned `-íum` take the "
      "same main dative (`osmíni` → `osmíum`).",
      "- Names whose official form is not in BÍN (mostly superheavies) occur here only in the nominative, in the periodic-table "
      "alts, so the form is the official name itself.",
      "- Not changed: derived words already on the official stem (`aktíníðaröðina`, `aktíníðaröðinni`), and `aktiníð` "
      "(no accent; a derived word no ruling covers).", '',
      'Full texts for pasting: `editor-fixes-paste.txt`, one block per segment.', '',
      "## Order of work with the nine book entries", '',
      "The worklist reads pending edits too, so these fixes shrink the nine entries' expected worklists as soon as they are saved:", '',
      '| Entry | Expected worklist if the entries go in first | after these fixes are saved |', '|---|---:|---:|']
md += [f'| {e} | {b} | {a} |' for e, b, a in impact] + ['']
paste = []
for setname, title in (('ruthenium', '## Ruthenium segments (8)'), ('lanthanide', '## Lanthanide segments (18)')):
    md += [title, '']
    for r in [x for x in res if x['set'] == setname]:
        md.append(f"### ch {ch(r['chapter'])} · `{r['segmentId']}`")
        md.append('- **Requested:** ' + '; '.join(f'`{o}` → `{n}`' for o, n in r['stem']))
        for tag, old, new in r['phrases']:
            label = {'D1': 'Masculine (ruling 1)', 'D2': 'Drop óíð (ruling 2)'}[tag]
            term = re.search(r'term-\d+', old)
            md.append(f'- **{label}:** `{old}` → ' + (f'`{new}`' if new else '*(removed)*')
                      + (f' — also removes term marker `{term.group(0)}`' if term else ''))
        if r['names']:
            pairs = {}
            for o, n in r['names']:
                pairs[(o, n)] = pairs.get((o, n), 0) + 1
            md.append(f"- **Other names (ruling 3, {len(r['names'])}):** "
                      + '; '.join(f'`{o}` → `{n}`' + (f' ×{c}' if c > 1 else '') for (o, n), c in pairs.items()))
        if r['masculineKept']:
            md.append('- **Masculine (ruling 1):** ' + ', '.join(f'`{w}`' for w in r['masculineKept']))
        if r['length'] <= 1200:
            md += ['', 'Current:', '```', r['current'], '```', 'Proposed:', '```', r['proposed'], '```', '']
        else:
            md += [f"- *{r['length']} characters; the full proposed text is in the paste file.*", '']
        paste += [f"=== {r['segmentId']} (ch {ch(r['chapter'])}) ===", r['proposed'], '']
open(out + '.md', 'w', encoding='utf-8').write('\n'.join(md))
open(out + '-paste.txt', 'w', encoding='utf-8').write('\n'.join(paste))
print('segments', len(res), '| stem', sum(len(r['stem']) for r in res), '| phrases', sum(len(r['phrases']) for r in res),
      '| names', sum(len(r['names']) for r in res), '| impact', impact)
