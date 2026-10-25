import sys, os, json, collections, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
rows = [json.loads(l) for l in open(os.path.join(HERE, sys.argv[1]))]
# hand repair keys (my recount), revert = carried != ruled text
def show(ref, path): return subprocess.run(['git','-C',REPO,'show',f'{ref}:{path}'],capture_output=True).stdout.decode()
ruled = {}
for c in ('6417625c9','42536323b','f313fee32','8271886b0'):
    for f in [f for f in subprocess.run(['git','-C',REPO,'show','--name-only','--format=',c],capture_output=True,text=True).stdout.split() if f.startswith('books/efnafraedi-2e/02-mt-output/') and f.endswith('segments.is.md')]:
        b,_ = parse_first(show(c+'^', f)); a,_ = parse_first(show(c, f))
        for k in a:
            if a[k] != b.get(k): ruled[(chapter_of(f), k)] = a[k]
agg = collections.defaultdict(collections.Counter)
for r in rows:
    for ch in (r['ch'], 'ALL'):
        c = agg[ch]
        c['newSegments'] += 1; c['newEnProseChars'] += r['en_chars']
        if r['type'] not in ('alt', 'table-summary'): c['_chars_noalt'] += r['en_chars']
        cl = r['cls']
        if cl == '1': c['class1'] += 1
        if cl == '2':
            if r.get('src_ext'): c['class2_recovered'] += 1
            else: c['class2_unrecoverable'] += 1
        if cl == '3': c['class3'] += 1
        if cl == '4':
            if r['type'] == 'alt': c['class4_alt'] += 1
            elif r['type'] == 'table-summary': c['class4_tableSummary'] += 1
            elif r.get('src_ext'): c['class4_alignedEntries'] += 1
        if r.get('src_ext'):
            c['carried'] += 1
            if r['clean']:
                c['clean'] += 1; c['_clean_chars'] += r['en_chars']
                if r['legacy_fired'] or r['math_renum'] or r['media_renum']: c['cleanNeedingConversion'] += 1
                if not r['identical_new_is']: c['cleanEnCharsDifferingFromNewIS'] += r['en_chars']
                if (r['ch'], r['key']) in ruled and r['carried'] != ruled[(r['ch'], r['key'])]: c['handRepairWouldUndo'] += 1
            else:
                c['fallback'] += 1
        if r.get('src_strict'):
            c['strictCarriable_c1c3'] += 1
            if r['clean']: c['strictClean_c1c3'] += 1
out = {}
for ch, c in agg.items():
    o = {k: v for k, v in c.items() if not k.startswith('_')}
    o['pctSegmentsClean'] = round(100 * c['clean'] / c['newSegments'], 1)
    o['pctEnCharsClean'] = round(100 * c['_clean_chars'] / c['newEnProseChars'], 1)
    o['pctEnCharsClean_exclAltSummary'] = round(100 * c['_clean_chars'] / c['_chars_noalt'], 1) if c['_chars_noalt'] else None
    out[ch] = o
json.dump(out, open(os.path.join(HERE, 'my_perchapter.json'), 'w'), indent=1)
# compare with theirs
T = json.load(open('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts/carryover/perchapter_values.json'))
tv = {x['chapter']: x['values'] for x in (T if isinstance(T, list) else T.get('perChapter', T.get('rows', [])))} if not isinstance(T, dict) or 'ch01' not in T else T
fields = ['newSegments','class1','class2_recovered','class2_unrecoverable','class3','class4_alt','class4_tableSummary','class4_alignedEntries','carried','clean','fallback','cleanNeedingConversion','strictCarriable_c1c3','strictClean_c1c3','pctSegmentsClean','newEnProseChars','pctEnCharsClean','pctEnCharsClean_exclAltSummary','cleanEnCharsDifferingFromNewIS','handRepairWouldUndo']
mism = collections.Counter(); exact = 0; total = 0; details = []
for ch in sorted(k for k in out if k != 'ALL'):
    t = tv.get(ch)
    if t is None: print('no theirs for', ch); continue
    alias = {'class1': 'class1_sameKeySameEN', 'class2_recovered': 'class2_recoveredByAlignment', 'class3': 'class3_textMatchOtherKey',
             'class4_alignedEntries': 'class4_entriesResolvedByAlignment', 'carried': 'carried_ext', 'clean': 'clean_ext'}
    for f in fields:
        total += 1
        mv, tvv = out[ch].get(f, 0), t.get(alias.get(f, f), 'MISSING')
        if mv == tvv: exact += 1
        else:
            mism[f] += 1; details.append((ch, f, mv, tvv))
print('per-chapter field comparisons:', total, 'exact', exact, 'mismatching fields by name:', dict(mism))
for d in details: print('  ', d)
