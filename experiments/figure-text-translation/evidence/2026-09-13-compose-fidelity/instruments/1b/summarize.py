#!/usr/bin/env python3
"""Summaries for the 1b census. Reads figs2.jsonl (per-figure, nested blocks+runs).
Writes ../findings/1b-census.jsonl (flattened rows) and prints tables as markdown
fragments into ../findings/1b-tables.md (hand-edited prose lives in 1b-census.md)."""
import json, re, sys
from pathlib import Path
from collections import Counter, defaultdict

HERE = Path(__file__).resolve().parent
FIND = HERE.parent / 'findings'
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from fontTools.ttLib import TTFont

rows = [json.loads(l) for l in open(HERE / 'figs2.jsonl')]
RATIO = 0.9

# ---- derived detectors recomputed from stored runs -------------------------------
# run = [text, size, along, proj, adv, rot, fontkey]
def lines_of(runs):
    out = [[runs[0]]]
    for x, y in zip(runs, runs[1:]):
        if abs(y[3] - x[3]) < 0.5 * max(x[1], y[1]):
            out[-1].append(y)
        else:
            out.append([y])
    return out

def dom(l):
    nb = [r for r in l if r[0].strip()] or l
    M = max(r[1] for r in nb)
    ps = sorted(r[3] for r in nb if r[1] >= RATIO * M)
    return ps[len(ps) // 2], M

def derive(b):
    runs = b['runs']; arc = b['arc']
    ls = lines_of(runs)
    bmax = max(r[1] for r in runs)
    # reconstruction self-check: spec detectors recomputed must equal stored flags
    has_script = False; shift075 = False
    for l in ls:
        nb = [r for r in l if r[0].strip()] or l
        M = max(r[1] for r in nb)
        ps = sorted(r[3] for r in nb if r[1] >= RATIO * M)
        base = ps[len(ps) // 2]
        for r in nb:
            off = r[3] - base
            if r[1] < RATIO * M and abs(off) > 0.5:
                has_script = True
            if not arc and abs(off) > 0.75:
                shift075 = True
    spec = best = False
    for i in range(len(ls) - 1):
        x, y = ls[i][-1], ls[i + 1][0]
        d = abs(y[3] - x[3])
        smaller = x[1] < RATIO * bmax or y[1] < RATIO * bmax
        if smaller and d < 0.6 * bmax * 1.222:
            spec = True
        gap = y[2] - x[2] - x[4]
        geom = (not arc) and -0.6 * bmax <= gap <= 2.5 and d < 0.9 * bmax * 1.222 and abs(x[5] - y[5]) < 3
        ret = i + 2 < len(ls) and abs(dom(ls[i + 2])[0] - dom(ls[i])[0]) < 1.0
        if geom and (smaller or ret):
            best = True
    return dict(n_lines_re=len(ls), has_script_re=has_script, stacked_split_re=spec,
                shift_any_075=shift075, stacked_split_best=best)

# ---- population ----------------------------------------------------------------
fig = {r['basename']: r for r in rows}
mismatch = []
blocks = []   # (figrow, block)
for r in rows:
    if r['status'] != 'read-ok':
        continue
    for b in r['blocks']:
        d = derive(b)
        if (d['n_lines_re'] != b['n_lines'] or d['has_script_re'] != b['has_script']
                or d['stacked_split_re'] != b['stacked_split']):
            mismatch.append((r['basename'], b['key']))
        b.update(shift_any_075=d['shift_any_075'], stacked_split_best=d['stacked_split_best'])
        b['script_union'] = bool(b['has_script'] or d['shift_any_075'] or d['stacked_split_best']
                                 or b['stacked_split'])
        b['any4_spec'] = bool(b['has_script'] or b['has_italic'] or b['has_multispace'] or b['stacked_split'])
        b['any_corrected'] = bool(b['script_union'] or b['has_italic'] or b['has_multispace'])
        blocks.append((r, b))

def composed(r):
    return r.get('sendable', 0) > 0

# ---- flattened jsonl ---------------------------------------------------------------
FIND.mkdir(exist_ok=True)
with open(FIND / '1b-census.jsonl', 'w') as fh:
    for r in rows:
        fr = {k: v for k, v in r.items() if k != 'blocks'}
        fr['row'] = 'figure'
        fr['composed'] = composed(r) if r['status'] == 'read-ok' else False
        fh.write(json.dumps(fr, ensure_ascii=False) + '\n')
    for r, b in blocks:
        br = dict(row='block', basename=r['basename'], chapter=r['chapter'], moduleId=r['moduleId'],
                  figure_sendable=r['sendable'], figure_composed=composed(r))
        br.update(b)
        fh.write(json.dumps(br, ensure_ascii=False) + '\n')

out = []
P = out.append

# ---- funnel ------------------------------------------------------------------------
st = Counter(r['status'] for r in rows)
ok = [r for r in rows if r['status'] == 'read-ok']
tb = [r for r in ok if r['outcome'] == 'reads' and r['n_blocks'] > 0]
comp = [r for r in tb if composed(r)]
unres = [r for r in rows if r['status'] == 'unresolved']
P('## Funnel\n')
P(f"- enumerated (driver `enumerateChapterImages`, 23 chapter dirs incl. ch00 + appendices): **{len(rows)}**")
P(f"- resolved (sources.py + supersededArtwork, de-hash lookup-only, contest + collision guards): **{len(ok) + sum(1 for r in rows if r['status'] not in ('read-ok','unresolved'))}** "
  f"(via basename {sum(1 for r in ok if r['via']=='basename')}, de-hashed {sum(1 for r in ok if r['via']=='de-hashed')}); "
  f"unresolved {len(unres)} (of which superseded-refused {sum(1 for r in unres if r.get('superseded'))}, contested {sum(1 for r in unres if r.get('contest'))})")
P(f"- read OK: **{len(ok)}** (status counts {dict(st)}; ext {dict(Counter(r['ext'] for r in ok))})")
P(f"- text-bearing (outcome 'reads' and >=1 block): **{len(tb)}** ({sum(1 for r in ok if r['outcome']=='empty')} read empty)")
P(f"- would be COMPOSED (figure sendable > 0, `figure-classify.js:143`): **{len(comp)}**")
nb_all = len(blocks); nb_comp = sum(1 for r, b in blocks if composed(r))
nb_send = sum(1 for r, b in blocks if b['send'])
P(f"- blocks: {nb_all} in {len(tb)} text-bearing figures; {nb_comp} in the {len(comp)} composed figures "
  f"(send:true {nb_send}, send:false-but-redrawn {nb_comp - nb_send}); {nb_all - nb_comp} in non-composed figures (never redrawn)")
P(f"- run-to-run reconstruction self-check: {len(mismatch)} blocks where detectors recomputed from stored runs disagree with the in-read flags")
P('')

# ---- per feature ----------------------------------------------------------------
FEATS = [
    ('any4_spec', 'ANY of script|italic|multispace|stacked (task definitions)'),
    ('any_corrected', 'ANY, corrected (script_union|italic|multispace)'),
    ('has_script', 'has_script (size<0.9 of line max AND baseline offset >0.5pt)'),
    ('script_union', 'script_union (has_script | shift>0.75pt | stacked_split | stacked_best)'),
    ('shift_any_075', 'baseline shift >0.75pt at ANY size (non-arc)'),
    ('has_mixed_size', 'mixed size within a line (compose draws the block at b[0] size)'),
    ('first_run_smaller', "block has a run larger than its FIRST run (compose draws all at b[0] size; mostly an 11pt STIX symbol in 9pt text, real shrink e.g. '35Br')"),
    ('has_italic', 'has_italic (font base /italic|oblique/i)'),
    ('has_oblique_tm', 'synthetic oblique (sheared text matrix >2deg)'),
    ('has_bold', 'has_bold (compose BOLD rule)'),
    ('has_mixed_weight_line', 'bold and regular mixed in ONE line (compose: first run wins)'),
    ('has_multispace', 'has_multispace (2+ spaces inside a line; wrap() collapses)'),
    ('stacked_split', 'stacked_split (task rule: boundary pair, smaller run, <0.6*max*1.222)'),
    ('stacked_split_baseline', 'stacked_split_baseline (dominant baselines within 0.5*size)'),
    ('stacked_split_best', 'stacked_split_best (continues rightward, <0.9 leading, + smaller run or baseline return)'),
    ('has_multifill_line', 'two fills in ONE line (compose: first run colour wins)'),
    ('has_mixed_font_line', 'two font resources in ONE line'),
    ('rot_nonzero', 'rotated (|rot|>0.5deg)'),
    ('arc', 'arc (figtext.is_arc)'),
    ('arc_mixed_size', 'arc with size variation (formula read as single-glyph runs)'),
    ('undecoded', 'undecoded text (held)'),
]
P('## Per feature\n')
P('Columns: figures = text-bearing figures with >=1 such block (of %d) / of those composed (of %d). '
  'Blocks: all (of %d) / send:true (of %d) / send:false in a composed figure (of %d) / in a NON-composed figure (of %d, never redrawn).\n'
  % (len(tb), len(comp), nb_all, nb_send, nb_comp - nb_send, nb_all - nb_comp))
P('| feature | figs | figs composed | blocks | send:true | send:false redrawn | not redrawn |')
P('|---|---:|---:|---:|---:|---:|---:|')
feat_nums = {}
for f, label in FEATS:
    fb = [(r, b) for r, b in blocks if b.get(f)]
    figs = {r['basename'] for r, b in fb}
    figs_c = {r['basename'] for r, b in fb if composed(r)}
    s_t = sum(1 for r, b in fb if b['send'])
    s_f = sum(1 for r, b in fb if composed(r) and not b['send'])
    nc = sum(1 for r, b in fb if not composed(r))
    feat_nums[f] = dict(figs=len(figs), figs_composed=len(figs_c), blocks=len(fb), send_true=s_t,
                        send_false_redrawn=s_f, not_redrawn=nc)
    P(f'| {label} | {len(figs)} | {len(figs_c)} | {len(fb)} | {s_t} | {s_f} | {nc} |')
P('')

# ---- per chapter ----------------------------------------------------------------
P('## Per chapter\n')
P('enum/res/text/comp = figures enumerated / resolved / text-bearing / composed. Block columns are for COMPOSED figures only (what the composer redraws). '
  'ANY = any_corrected; spec = any4_spec. figsANY = composed figures carrying >=1 ANY block.\n')
P('| ch | enum | res | text | comp | blocks redrawn | send:true | ANY (T/F) | spec | script_union | italic | multispace | stacked_best | figsANY |')
P('|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|')
chs = sorted({r['chapter'] for r in rows}, key=lambda c: (c == 'appendices', c))
chap = {}
for c in chs:
    cr = [r for r in rows if r['chapter'] == c]
    cres = [r for r in cr if r['status'] == 'read-ok']
    ctb = [r for r in cres if r['outcome'] == 'reads' and r['n_blocks'] > 0]
    ccomp = [r for r in ctb if composed(r)]
    cb = [(r, b) for r, b in blocks if r['chapter'] == c and composed(r)]
    anyT = sum(1 for r, b in cb if b['any_corrected'] and b['send'])
    anyF = sum(1 for r, b in cb if b['any_corrected'] and not b['send'])
    d = dict(enum=len(cr), res=len(cres), text=len(ctb), comp=len(ccomp), redrawn=len(cb),
             send=sum(1 for r, b in cb if b['send']), anyT=anyT, anyF=anyF,
             spec=sum(1 for r, b in cb if b['any4_spec']),
             script=sum(1 for r, b in cb if b['script_union']),
             italic=sum(1 for r, b in cb if b['has_italic']),
             multi=sum(1 for r, b in cb if b['has_multispace']),
             stack=sum(1 for r, b in cb if b['stacked_split_best'] or b['stacked_split']),
             figsany=len({r['basename'] for r, b in cb if b['any_corrected']}))
    chap[c] = d
    P(f"| {c} | {d['enum']} | {d['res']} | {d['text']} | {d['comp']} | {d['redrawn']} | {d['send']} | {anyT+anyF} ({anyT}/{anyF}) | {d['spec']} | {d['script']} | {d['italic']} | {d['multi']} | {d['stack']} | {d['figsany']} |")
P('')
P('### Top 10 chapters by redrawn blocks with has_script|has_italic|has_multispace|stacked_split (task definition, composed figures)\n')
P('| rank | ch | spec blocks | of redrawn | share | send:true among them | composed figs | figs with >=1 |')
P('|---:|---|---:|---:|---:|---:|---:|---:|')
for i, (c, d) in enumerate(sorted(chap.items(), key=lambda kv: -kv[1]['spec'])[:10], 1):
    cb = [(r, b) for r, b in blocks if r['chapter'] == c and composed(r) and b['any4_spec']]
    P(f"| {i} | {c} | {d['spec']} | {d['redrawn']} | {100*d['spec']/max(d['redrawn'],1):.0f}% | {sum(1 for r,b in cb if b['send'])} | {d['comp']} | {len({r['basename'] for r,b in cb})} |")
P('')

# ---- fonts ------------------------------------------------------------------------
P('## Font families\n')
famB = Counter(); famBc = Counter(); famF = defaultdict(set)
for r, b in blocks:
    for f in b['font_families']:
        famB[f] += 1; famF[f].add(r['basename'])
        if composed(r): famBc[f] += 1
P('| family (normalised) | blocks | blocks in composed figs | figures |')
P('|---|---:|---:|---:|')
for f, n in famB.most_common():
    P(f'| {f} | {n} | {famBc[f]} | {len(famF[f])} |')
P('')
baseB = Counter(re.sub(r'^/?[A-Z]{6}\+', '', x) for r, b in blocks for x in b['font_bases'])
P('Raw base names (subset prefix removed), blocks: ' + ', '.join(f'`{k}` {v}' for k, v in baseB.most_common()))
P('')

# ---- glyphs -------------------------------------------------------------------------
P('## Non-ASCII glyphs and Liberation Sans coverage\n')
cm = {k: TTFont(f'/usr/share/fonts/truetype/liberation/LiberationSans-{k}.ttf').getBestCmap()
      for k in ('Regular', 'Bold')}
chB = Counter(); chBc = Counter(); chBs = Counter(); chF = defaultdict(set); ntg = set()
for r, b in blocks:
    for ch in b['nonascii_chars']:
        chB[ch] += 1; chF[ch].add(r['basename'])
        if composed(r): chBc[ch] += 1
        if b['send']: chBs[ch] += 1
    ntg |= set(b['non_text_glyphs'])
P('| char | U+ | non-Latin (task set) | blocks | redrawn blocks | send:true | figures | Regular cmap | Bold cmap | example figures |')
P('|---|---|---|---:|---:|---:|---:|---|---|---|')
for ch, n in sorted(chB.items(), key=lambda kv: -kv[1]):
    ex = ', '.join(sorted(chF[ch])[:3])
    P(f"| {ch} | {ord(ch):04X} | {'yes' if ch in ntg else ''} | {n} | {chBc[ch]} | {chBs[ch]} | {len(chF[ch])} | {ord(ch) in cm['Regular']} | {ord(ch) in cm['Bold']} | {ex} |")
P('')

# ---- ch13 / ch16 ----------------------------------------------------------------------
for c in ('ch13', 'ch16'):
    P(f'## {c} in detail\n')
    d = chap[c]
    P(f"enumerated {d['enum']}, resolved {d['res']}, text-bearing {d['text']}, composed {d['comp']}; redrawn blocks {d['redrawn']} (send:true {d['send']}); "
      f"ANY {d['anyT']+d['anyF']} (send:true {d['anyT']}, send:false {d['anyF']}); spec {d['spec']}\n")
    P('| figure | blocks | sendable | composed | script_union | italic | multispace | stacked | examples (key) |')
    P('|---|---:|---:|---|---:|---:|---:|---:|---|')
    for r in [x for x in rows if x['chapter'] == c]:
        if r['status'] != 'read-ok':
            P(f"| {r['basename']} | - | - | {r['status']} | | | | | |"); continue
        bs = r['blocks']
        ex = [b['key'] for b in bs if b['any_corrected']][:3]
        P(f"| {r['basename']} | {len(bs)} | {r['sendable']} | {composed(r)} | {sum(b['script_union'] for b in bs)} | {sum(b['has_italic'] for b in bs)} | {sum(b['has_multispace'] for b in bs)} | {sum(b['stacked_split_best'] or b['stacked_split'] for b in bs)} | {'; '.join(repr(k)[:60] for k in ex)} |")
    P('')

# ---- bought 34 -------------------------------------------------------------------------
bought = set(Path(HERE.parent / 'prep' / 'bought.txt').read_text().split())
bb = [(r, b) for r, b in blocks if r['basename'] in bought]
P('## The 34 bought figures, same instrument\n')
P(f"blocks {len(bb)}; any_corrected {sum(b['any_corrected'] for r,b in bb)} (send:true {sum(b['any_corrected'] and b['send'] for r,b in bb)}); "
  f"script_union {sum(b['script_union'] for r,b in bb)}; italic {sum(b['has_italic'] for r,b in bb)}; multispace {sum(b['has_multispace'] for r,b in bb)}; "
  f"stacked {sum(b['stacked_split_best'] or b['stacked_split'] for r,b in bb)}; figures with >=1 any: {len({r['basename'] for r,b in bb if b['any_corrected']})} of 34\n")

# ---- misc lists --------------------------------------------------------------------------
P('## Lists\n')
P('### Multispace blocks (all)\n')
for r, b in blocks:
    if b['has_multispace']:
        P(f"- {r['chapter']} {r['basename']} {b['key']!r} run={b['max_space_run']} send={b['send']} composed={composed(r)}")
P('\n### Stacked-split blocks (union of task rule and best rule)\n')
for r, b in blocks:
    if b['stacked_split'] or b['stacked_split_best']:
        P(f"- {r['chapter']} {r['basename']} {b['key']!r} task={b['stacked_split']} best={b['stacked_split_best']} baseline={b['stacked_split_baseline']} send={b['send']} composed={composed(r)}")
P('\n### Formula-bearing blocks that are BOUGHT (script_union and send:true), per chapter\n')
P(', '.join(f'{c} {n}' for c, n in sorted(Counter(r['chapter'] for r, b in blocks if b['script_union'] and b['send']).items())))
P('\n### Symbol / non-Liberation fonts (all blocks)\n')
for r, b in blocks:
    if any(f not in ('LiberationSans', 'STIXGeneral') for f in b['font_families']):
        P(f"- {r['chapter']} {r['basename']} {b['key']!r} fonts={b['font_families']} send={b['send']} composed={composed(r)}")
P('\n### Fill kinds as the reader reports them (instrument fact: readlayer._fill normalises every space to cmyk or None)\n')
P('kinds (blocks): ' + str(dict(Counter(tuple(b['fill_kinds']) for r, b in blocks))))
P('classes (blocks): ' + str(dict(Counter(tuple(b['fill_classes']) for r, b in blocks).most_common())))
cw = [r for r in ok if r.get('color_warnings')]
uc = [r for r in ok if r.get('unknown_colorspaces')]
P(f"figures with color_warnings>0: {len(cw)} {[r['basename'] for r in cw]}; with unknown_colorspaces: {len(uc)} {[(r['basename'], r['unknown_colorspaces']) for r in uc]}")

(FIND / '1b-tables.md').write_text('\n'.join(out) + '\n')
json.dump(dict(feat=feat_nums, chap=chap, mismatch=mismatch[:20], n_mismatch=len(mismatch)),
          open(HERE / 'summary.json', 'w'), indent=1, ensure_ascii=False)
print('\n'.join(out[:60]))
print('mismatch', len(mismatch), mismatch[:5])
