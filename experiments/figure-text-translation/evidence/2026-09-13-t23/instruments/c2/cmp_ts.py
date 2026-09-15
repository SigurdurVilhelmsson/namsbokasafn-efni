import json, re, sys, glob, os, collections
PUB='/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media'
def els(p):
    return re.findall(r'<text [^>]*>[^<]*</text>', open(p, encoding='utf-8').read())
tot = collections.Counter()
for d in sorted(glob.glob('work/*/')):
    b = os.path.basename(d.rstrip('/'))
    base, ts = els(d+'base/translated.svg'), els(d+'ts/translated.svg')
    pub = els(f'{PUB}/{b}_IS.svg')
    rep = json.load(open(d+'ts/compose-report.json'))
    rb = json.load(open(d+'base/compose-report.json'))
    only_base = list((collections.Counter(base) - collections.Counter(ts)).elements())
    only_ts = list((collections.Counter(ts) - collections.Counter(base)).elements())
    print(f'== {b}: base==published {base==pub}; base {len(base)} ts {len(ts)} elements; common {len(base)-len(only_base)}; removed {len(only_base)} added {len(only_ts)}; unformatted {rep["unformatted"]}; report keys equal except unformatted: {all(rep[k]==rb[k] for k in rb)}')
    for e in only_base: print('   -', re.sub(r' font-family="FigIS"| fill="#[0-9a-f]+"| xml:space="preserve"', '', e))
    for e in only_ts: print('   +', re.sub(r' font-family="FigIS"| fill="#[0-9a-f]+"| xml:space="preserve"', '', e))
    tot['figs'] += 1; tot['removed'] += len(only_base); tot['added'] += len(only_ts); tot['unformatted'] += len(rep['unformatted'])
    # non-text parts identical?
    strip = lambda p: re.sub(r'<style>.*?</style>|<text [^>]*>[^<]*</text>', '', open(p, encoding='utf-8').read(), flags=re.S)
    if strip(d+'base/translated.svg') != strip(d+'ts/translated.svg'): print('   !! non-<text> SVG content differs')
print(tot)
