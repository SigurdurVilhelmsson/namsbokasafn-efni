"""Draft the editors' fixes for the 8 ruthenium and 18 lanthanide segments, applying [USER]'s rulings of
2026-11-20: (1) masculine lanþaníð-, as in the glossary, with `lanþaníðarnir` in the problem segment;
(2) drop the óíð alternatives, lanthanide and actinide; (3) fix every other off-list element name to the
official list (Vísindavefur 89909). Deterministic; each step is verified on its own.

Writes <out>.json (data), <out>.md (review) and <out>-paste.txt (one block per segment).
Usage (from this folder):
  measurement 7 (ruthenium + lanthanide segments):
  python3 -I build-editor-fixes.py ../data/fix-targets.json ../data/comparison-official-vs-resolver.json \\
      ../data/render-census-69-names.json ../data/dry-counts-9-names.json <bin-official.json> ../reports/editor-fixes
  measurement 8 (the never-official segments; the measurement-7 drafts mark the overlap):
  python3 -I build-editor-fixes.py ../data/never-official-targets.json ../data/comparison-official-vs-resolver.json \\
      ../data/render-census-69-names.json ../data/dry-counts-9-names.json <bin-official.json> \\
      ../reports/editor-fixes-never-official ../reports/editor-fixes.json
  measurement 9 (the mixed names' segments; both earlier sets of drafts mark the overlap):
  python3 -I build-editor-fixes.py ../data/mixed-targets.json ../data/comparison-official-vs-resolver.json \\
      ../data/render-census-69-names.json ../data/dry-counts-9-names.json <bin-official.json> \\
      ../reports/editor-fixes-mixed ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json
<bin-official.json> comes from extract-bin-forms.py and your own BÍN download; it is not committed
(docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md)."""
import difflib
import json
import re
import sys

tgt_path, cmp_path, census_path, nine_path, bin_path, out = sys.argv[1:7]
prior_paths = sys.argv[7:]
LIST_SETS = ('never-official', 'mixed')


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


MARKER_RE = re.compile(r'\[\[(\w+):|\|([^\[\]|]+)\]\]')


def markers(text):
    """Every marker's type and every id after a '|': must not change in a word-level step."""
    return sorted(m.group(0) for m in MARKER_RE.finditer(text))


def verified(before, after, pairs, step, sid):
    assert markers(before) == markers(after), (sid, step, 'a marker or its id changed')
    d = token_diff(before, after)
    assert sorted(d) == sorted(pairs), (sid, step, d, pairs)
    return after


# ── Step A: the requested stem substitutions ─────────────────────────────────────────────
RU = {'rúþen': 'rúþeníum', 'rúþeni': 'rúþeníum', 'rúþens': 'rúþeníums',
      'rúþenið': 'rúþeníumið', 'rúþeninu': 'rúþeníuminu', 'rúþensins': 'rúþeníumsins'}


def step_a(text, kind):
    if kind in LIST_SETS:  # both stem rules, wherever they occur
        t1, p1 = step_a(text, 'ruthenium')
        t2, p2 = step_a(t1, 'lanthanide')
        return t2, p1 + p2
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
    # Measurement 9: the actinide series' glossary definition, the counterpart of the one above.
    'm68842:glossary-def:fs-idm98560816-def': [('(einnig, aktínóíðaröð) ', '', 'D2')],
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
# Census bases that are not element names (README, blind spots): limestone, the actinide series, aluminate.
for noise in ('kalkstein', 'aktiníðaröðin', 'alúmín'):
    BASES.pop(noise, None)
# Beryllium misspelt with one l: the census lists these in its weak tier (a 3-letter match), which the
# rule script does not otherwise take. Added by name; the weak tier's other words are not element names.
BASES.setdefault('berillíum', 'beryllíum')
BASES.setdefault('berillín', 'beryllíum')
# The nine entries' short forms: a compound on one can be an ordinary word (german → germanskur), so those
# compounds are flagged for review, never changed.
SHORT = {sp['resolvesTo'].lower() for sp in nine['specs']}
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
        if x.startswith(('íð', 'óíð')):
            return ('', f'compound or derived word, not changed: {word}')
        if b in SHORT or len(x) < 3:
            return ('', f'compound on a short form, not changed (check by hand): {word}')
        # A compound on an -ín/-íum base: only the element part changes (litíumklóríð → liþíumklóríð).
        return (keepcase(word, off + x), f'compound, element part replaced: {word}')
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
    pairs, notes, compounds = [], [], []
    def rep(m):
        w = m.group(0)
        r = map_name(w)
        if r is None:
            return w
        new, note = r
        if not new:
            notes.append(note); return w
        if note and note.startswith('compound, element part replaced'):
            compounds.append((w, new)); pairs.append((w, new)); return new
        if note:
            notes.append(f'{new}: {note}')
        pairs.append((w, new)); return new
    return re.sub(r'\w+', rep, text), pairs, notes, compounds


# ── Step H: hand fixes, one-off corrections of MT garbles that match no rule ─────────────
# [USER] 2026-11-21: `hafnfn` (hafnium in the four periodic-table alts) is an MT garble; read it as hafníum.
HAND = {'hafnfn': 'hafníum'}


def step_hand(text):
    pairs = []
    def rep(m):
        w = m.group(0)
        n = keepcase(w, HAND[w.lower()]); pairs.append((w, n)); return n
    t = re.sub(W + '(?:' + '|'.join(map(re.escape, HAND)) + ')' + WE, rep, text, flags=re.I)
    return t, pairs


res = []
for s in segs:
    sid, cur = s['segmentId'], s['current']
    a, pa = step_a(cur, s['set'])
    a = verified(cur, a, pa, 'A', sid)
    b, phrases = step_phrases(a, sid)
    c, pc, notes, comps = step_d3(b)
    c = verified(b, c, pc, 'D3', sid)
    h, ph = step_hand(c)
    c = verified(c, h, ph, 'H', sid)
    assert not re.search(r'(?i)hafnfn', c), (sid, 'a garble the hand fixes name is still there')
    left_re = {'ruthenium': [r'rúþen(?!íum)\w*'], 'lanthanide': [r'lantan(?:íð|óíð)\w*'],
               'never-official': [r'rúþen(?!íum)\w*', r'lantan(?:íð|óíð)\w*'],
               'mixed': [r'rúþen(?!íum)\w*', r'lantan(?:íð|óíð)\w*']}[s['set']]
    for lr in left_re:
        assert not re.findall(W + lr + WE, c, flags=re.I), (sid, lr)
    assert 'lanþanóíð' not in c and 'aktínóíð' not in c, (sid, 'an óíð alternative needs a ruling-2 phrase rule')
    if s['set'] in LIST_SETS and any(n.lower().startswith('lanþaníð') for o, n in pa):
        notes.append('holds lanþaníð-: check agreement (ruling 1, masculine)')
    masc = sorted({w for w in re.findall(r'\w+', c) if re.fullmatch(r'(?i)lanþaníð(ar|inn|arnir)', w)})
    res.append({'set': s['set'], 'chapter': s['chapter'], 'moduleId': s['moduleId'], 'segmentId': sid,
                'current': cur, 'proposed': c, 'stem': pa, 'phrases': phrases, 'names': pc,
                'notes': sorted(set(notes)), 'masculineKept': masc, 'length': len(cur),
                **({'compounds': comps} if comps else {}), **({'hand': ph} if ph else {})})

# The nine book entries' expected worklists, before and after these fixes are saved.
by_id = {r['segmentId']: r for r in res}
impact = []
for sp in nine['specs']:
    ids = [i['segmentId'] for i in sp['items']]
    fixed = [i for i in ids if i in by_id and not any(
        re.search(W + re.escape(f) + WE, by_id[i]['proposed'], re.I) for f in sp['oldForms'])]
    impact.append((sp['english'], len(ids), len(ids) - len(fixed)))

NEVER = any(r['set'] in LIST_SETS for r in res)
MIXED = any(r['set'] == 'mixed' for r in res)
if NEVER:
    prior, prior_file = {}, {}
    for pp in prior_paths:
        for r in json.load(open(pp, encoding='utf-8'))['segments']:
            if r['segmentId'] not in prior:
                prior[r['segmentId']] = r
                prior_file[r['segmentId']] = pp.rsplit('/', 1)[-1].replace('.json', '.md')
    overlap = [r['segmentId'] for r in res if r['segmentId'] in prior]
    for sid in overlap:
        assert by_id[sid]['proposed'] == prior[sid]['proposed'], (sid, 'differs from the measurement-7 draft')
    combined = {**{k: v['proposed'] for k, v in prior.items()}, **{k: v['proposed'] for k, v in by_id.items()}}
    impact = []
    for sp in nine['specs']:
        ids = [i['segmentId'] for i in sp['items']]
        still = lambda t: t is None or any(re.search(W + re.escape(f) + WE, t, re.I) for f in sp['oldForms'])
        this = [i for i in ids if not (i in by_id and not still(by_id[i]['proposed']))]
        both = [i for i in ids if still(combined.get(i))]
        impact.append((sp['english'], len(ids), len(this), len(both)))
    unchanged = [r['segmentId'] for r in res if not (r['stem'] or r['names'] or r['phrases'] or r.get('hand'))]
    if MIXED:
        json.dump({'segments': res, 'overlapWithEarlierSets': {k: prior_file[k] for k in overlap},
                   'nothingToFix': unchanged, 'worklistImpact': impact},
                  open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    else:
        json.dump({'segments': res, 'overlapWithMeasurement7': overlap, 'worklistImpact': impact},
                  open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
else:
    json.dump({'segments': res, 'worklistImpact': impact}, open(out + '.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

if not NEVER:
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
            if r.get('hand'):
                md.append('- **Hand fix ([USER] 2026-11-21):** ' + '; '.join(f'`{o}` → `{n}`' for o, n in r['hand']))
            if r['length'] <= 1200:
                md += ['', 'Current:', '```', r['current'], '```', 'Proposed:', '```', r['proposed'], '```', '']
            else:
                md += [f"- *{r['length']} characters; the full proposed text is in the paste file.*", '']
            paste += [f"=== {r['segmentId']} (ch {ch(r['chapter'])}) ===", r['proposed'], '']
    open(out + '.md', 'w', encoding='utf-8').write('\n'.join(md))
    open(out + '-paste.txt', 'w', encoding='utf-8').write('\n'.join(paste))
else:
    ch = lambda c: 'App.' if c == -1 else str(c)
    if MIXED:
        md = ["# Editors' fixes: the segments of the 49 mixed element names", '',
              "Drafted 2026-11-20/21 from the effective Icelandic on production (read-only; no segment had a live edit), with the same "
              "rule script and [USER]'s rulings of 2026-11-20 as `editor-fixes.md`: (1) masculine `lanþaníð-`, as in the glossary; "
              "(2) the `óíð` alternatives dropped; (3) every off-list element name in the segment fixed to the official list "
              "(Vísindavefur 89909). Each step is a fixed rule, verified word by word; nothing else differs, and no marker or id changes.", '',
              f"- **{len(res)} segments**: every distinct segment of the 49 mixed names' dry lists (measurement 9), including the ones "
              "that also hold the official name, since an editor fixes the non-official form there too.",
              f"- **{len(overlap)} of them are already drafted in an earlier set** (`editor-fixes.md` or `editor-fixes-never-official.md`); "
              "this run's text for them is identical, and they are left out of the paste file, so nothing is pasted twice.",
              f"- **{len(unchanged)} have nothing to fix**: they were listed by a near match that is not an element name "
              "(`röðina`, `talin`, `kalksteinn`, `Seaborg`, …) or by an excluded noise base. They are named below and left out of the paste file.",
              "- Ruthenium cases and `-ín` → `-íum` datives follow BÍN's main dative; names whose official form is not in BÍN follow the "
              "`-íum` pattern, and each such form is noted.", '',
              f"Full texts for pasting: `editor-fixes-mixed-paste.txt`, one block per segment ({len(res) - len(overlap) - len(unchanged)} blocks).", '',
              "## Order of work with the nine book entries", '',
              "The worklist reads pending edits too, so saved fixes shrink the nine entries' expected worklists:", '',
              '| Entry | Entries first | after these fixes | after all three sets of fixes |', '|---|---:|---:|---:|']
    else:
      md = ["# Editors' fixes: the segments of the 14 never-official element names", '',
          "Drafted 2026-11-20 from the effective Icelandic on production (read-only; no segment had a live edit), with the same "
          "rule script and [USER]'s rulings of 2026-11-20 as `editor-fixes.md`: (1) masculine `lanþaníð-`, as in the glossary; "
          "(2) the `óíð` alternatives dropped; (3) every off-list element name in the segment fixed to the official list "
          "(Vísindavefur 89909). Each step is a fixed rule, verified word by word; nothing else differs.", '',
          f"- **{len(res)} segments**: every distinct segment of the 14 names' dry lists (measurement 6). "
          f"**{len(overlap)} of them are already drafted in `editor-fixes.md`** (the periodic-table alts), and this run's text for "
          "them is identical; they are listed below but left out of the paste file, so nothing is pasted twice.",
          "- Ruthenium cases and `-ín` → `-íum` datives follow BÍN's main dative (`rúþeni` → `rúþeníum`, `osmíni` → `osmíum`).",
          "- Names whose official form is not in BÍN keep the official form in the nominative and follow the `-íum` pattern "
          "otherwise; each such form is noted.", '',
          f"Full texts for pasting: `editor-fixes-never-official-paste.txt`, one block per segment ({len(res) - len(overlap)} blocks).", '',
          "## Order of work with the nine book entries", '',
          "The worklist reads pending edits too, so saved fixes shrink the nine entries' expected worklists:", '',
          '| Entry | Entries first | after these fixes | after these and `editor-fixes.md` |', '|---|---:|---:|---:|']
    md += [f'| {e} | {b} | {t} | {a} |' for e, b, t, a in impact] + ['']
    paste = []
    md += [f'## Segments ({len(res)})', '']
    for r in sorted(res, key=lambda x: (x['chapter'] == -1, x['chapter'], x['segmentId'])):
        dup = r['segmentId'] in overlap
        idle = r['segmentId'] in unchanged
        md.append(f"### ch {ch(r['chapter'])} · `{r['segmentId']}`"
                  + (f" — already in `{prior_file[r['segmentId']]}` (identical)" if dup else '')
                  + (' — nothing to fix' if idle and not dup else ''))
        if r['stem']:
            md.append('- **Stem (rúþen / lantan-):** ' + '; '.join(f'`{o}` → `{n}`' for o, n in r['stem']))
        for tag, old, new in r['phrases']:
            label = {'D1': 'Masculine (ruling 1)', 'D2': 'Drop óíð (ruling 2)'}[tag]
            md.append(f'- **{label}:** `{old}` → ' + (f'`{new}`' if new else '*(removed)*'))
        comp = set(map(tuple, r.get('compounds', [])))
        if comp:
            md.append('- **Compounds, element part replaced (ruling 3):** ' + '; '.join(f'`{o}` → `{n}`' for o, n in sorted(comp)))
        if r['names']:
            pairs = {}
            for o, n in r['names']:
                if (o, n) in comp:
                    continue
                pairs[(o, n)] = pairs.get((o, n), 0) + 1
        if r['names'] and pairs:
            md.append(f"- **Names (ruling 3, {sum(pairs.values())}):** "
                      + '; '.join(f'`{o}` → `{n}`' + (f' ×{c}' if c > 1 else '') for (o, n), c in pairs.items()))
        if r['notes']:
            md.append('- **Notes:** ' + '; '.join(r['notes']))
        if r.get('hand'):
            md.append('- **Hand fix ([USER] 2026-11-21):** ' + '; '.join(f'`{o}` → `{n}`' for o, n in r['hand']))
        if dup or idle:
            md.append('')
            continue
        if r['length'] <= 1200:
            md += ['', 'Current:', '```', r['current'], '```', 'Proposed:', '```', r['proposed'], '```', '']
        else:
            md += [f"- *{r['length']} characters; the full proposed text is in the paste file.*", '']
        paste += [f"=== {r['segmentId']} (ch {ch(r['chapter'])}) ===", r['proposed'], '']
    open(out + '.md', 'w', encoding='utf-8').write('\n'.join(md))
    open(out + '-paste.txt', 'w', encoding='utf-8').write('\n'.join(paste))
print('segments', len(res), '| stem', sum(len(r['stem']) for r in res), '| phrases', sum(len(r['phrases']) for r in res),
      '| names', sum(len(r['names']) for r in res), '| hand', sum(len(r.get('hand', [])) for r in res), '| impact', impact)
