import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
D = load()
for v in ('new', 'june'):
    for lang in ('en', 'is'):
        ok = bad = perr = 0; ex = []
        for p, txt in D[v][lang].items():
            d, _ = parse_first(txt)
            for k, s in d.items():
                try:
                    t = s if v == 'new' else legacy_to_bracket(s)
                    r = ser(parse_brackets(t))
                except ParseError as e:
                    perr += 1; ex.append(('PERR', k, s[:120])); continue
                if r == t: ok += 1
                else:
                    bad += 1
                    if len(ex) < 6: ex.append(('DIFF', k, t[:150], r[:150]))
        print(v, lang, 'roundtrip ok', ok, 'diff', bad, 'parse errors', perr)
        for e in ex[:6]: print('   ', e)
