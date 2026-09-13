import json, re, sys, collections
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c9')
src = open('/home/siggi/dev/scratch-c140/c9/rules_eval.py').read()
ns = {'re': re}
exec(src[src.index('def r1_run'):src.index('def fake(run):')], ns)
M = [json.loads(l) for l in open('/home/siggi/dev/scratch-c140/c9/out/matches.jsonl')]
aux = json.load(open('/home/siggi/dev/scratch-c140/c9/out/aux_hits.json'))
PT = {'CNX_Chem_00_AA_PeriodicPU_img', 'CNX_Chem_01_03_PeriodicPU', 'CNX_Chem_02_05_PerTable1',
      'CNX_Chem_18_01_PeriodicPU3', 'CNX_Chem_19_01_PeriodicEConfig'}
def short(b): return b.replace('CNX_Chem_', '')
def esc(s): return s.replace('|', '\\|').replace('`', "'")
def row_for(pop):
    lines = collections.OrderedDict()
    for m in M:
        if m['pop'] != pop: continue
        k = m['line_text']
        d = lines.setdefault(k, dict(n=0, figs=collections.Counter(), cls=set(), ctx=set(), straddle=0, keys=set(), bought=False, blocks=set()))
        d['figs'][m['basename']] += 0
        d['blocks'].add((m['basename'], m['block'], m['line']))
        d['cls'].add(m['cls']); d['ctx'].update(m['ctx']); d['straddle'] += m['n_runs'] > 1
        d['keys'].add(m['key']); d['bought'] |= m['bought']
    for k, d in lines.items():
        d['n'] = len(d['blocks'])
        d['figs'] = collections.Counter(b for b, _, _ in d['blocks'])
    return lines
out = []
# Population B kept, excluding periodic tables (listed separately)

ch = json.load(open('/home/siggi/dev/scratch-c140/c9/out/rules_changed.json'))
le = json.load(open('/home/siggi/dev/scratch-c140/c9/out/rules_left.json'))
RO = {k: {} for k in ch}; CNT = collections.Counter(); B34 = set()
for k in ch:
    for a, o, bb, n in ch[k]:
        RO[k][a] = o
        if k == 'R1': CNT[a] += n
        if bb: B34.add(a)
    for a, bb, n in le[k]:
        RO[k].setdefault(a, a)
        if k == 'R1': CNT[a] += n
        if bb: B34.add(a)
Lm = row_for('kept-sendfalse'); Li = row_for('kept-identity')
figs_of = collections.defaultdict(collections.Counter)
cls_of = collections.defaultdict(set); ctx_of = collections.defaultdict(set)
for L in (Lm, Li):
    for k, d in L.items():
        figs_of[k].update(d['figs']); cls_of[k] |= d['cls']; ctx_of[k] |= d['ctx']
for p, b, t, i in aux['trail']:
    if p.startswith('kept'):
        figs_of[t][b] += 0
        cls_of[t].add('trailing-separator' if not cls_of[t] else next(iter(cls_of[t])))
out.append('### B1. KEPT lines (`send:false` + identity) in composed figures that carry a separator next to a digit — every distinct line\n')
out.append('`n` = drawn LINE instances. Periodic-table-only values are collapsed into B2. R1 is applied per RUN (the draw unit); R2/R3 per line (identical to per run on this population — measured). `=` means unchanged. `[34]` = occurs in a bought figure.\n')
out.append('| n | line text (runs joined) | class | context | figures | R1 | R2 | R3 |')
out.append('|---|---|---|---|---|---|---|---|')
tot = 0; ptonly = collections.Counter(); ptfig = set()
for k in sorted(CNT, key=lambda a: (sorted(figs_of[a])[0] if figs_of[a] else '', a)):
    fg = figs_of[k]
    if fg and all(b in PT for b in fg):
        ptonly[k] += CNT[k]; continue
    f = ', '.join(short(b) for b in sorted(fg))
    cells = ['=' if RO[r][k] == k else '`' + esc(RO[r][k]) + '`' for r in ('R1', 'R2', 'R3')]
    extra = '' if RO['R2coded'][k] == RO['R2'][k] else f" (R2 as coded in mathml-to-latex.js: `{esc(RO['R2coded'][k])}`)"
    out.append(f"| {CNT[k]} | `{esc(k)}`{' [34]' if k in B34 else ''} | {'/'.join(sorted(cls_of[k])) or '?'} | {', '.join(sorted(ctx_of[k])) or '—'} | {f} | {cells[0]} | {cells[1]}{extra} | {cells[2]} |")
    tot += CNT[k]
out.append(f'\nB1 line instances: {tot}. Figure lists name each figure once; the per-figure multiplicity is in `n`.\n')
out.append('### B2. Values that occur ONLY in the 5 periodic tables — all plain-decimal, single-run, and changed identically by R1, R2 and R3 (`.`→`,`)\n')
assert all(RO['R1'][k] == RO['R2'][k] == RO['R3'][k] != k for k in ptonly)
out.append(f"figures: {', '.join(sorted(short(b) for b in PT))}; line instances: {sum(ptonly.values())}; distinct values: {len(ptonly)}\n")
out.append('value ×instances: ' + ' · '.join(f"`{k}`×{v}" for k, v in sorted(ptonly.items(), key=lambda kv: float(kv[0]))) + '\n')
out.append(f'B1 + B2 line instances: {tot + sum(ptonly.values())}\n')
# other populations
for pop, title in (('send-true-unbought', 'C. `send:true` lines in composed figures NOT yet bought (MT decides; kept only if the reply is identity)'),
                   ('noncomposed', 'D. Lines in NON-composed figures (never redrawn; no compose-time rule can reach them)'),
                   ('send-translated', 'E. Translated blocks in the 34 (MT output is in the sidecar; listed for the EN side)')):
    L = row_for(pop)
    out.append(f'### {title}\n')
    out.append('| n | line text | class | context | runs straddled | figures |')
    out.append('|---|---|---|---|---|---|')
    for k, d in sorted(L.items(), key=lambda kv: (sorted(kv[1]['figs'])[0], kv[0])):
        f = ', '.join(f"{short(b)}{'×%d' % c if c > 1 else ''}" for b, c in sorted(d['figs'].items()))
        out.append(f"| {d['n']} | `{esc(repr(k)[1:-1])}` | {'/'.join(sorted(d['cls']))} | {', '.join(sorted(d['ctx'])) or '—'} | {d['straddle']} | {f} |")
    out.append('')
out.append('### F. Digit followed by a separator with NO digit after it (kept + identity populations) — hazard for any rule that does not require a following digit\n')
tc = collections.Counter((p, short(b), t) for p, b, t, i in aux['trail'])
out.append('| n | population | figure | line text |'); out.append('|---|---|---|---|')
for (p, b, t), n in sorted(tc.items()):
    out.append(f'| {n} | {p} | {b} | `{esc(t)}` |')
open('/home/siggi/dev/scratch-c140/c9/out/appendix.md', 'w').write('\n'.join(out) + '\n')
print('written', len(out), 'lines')
