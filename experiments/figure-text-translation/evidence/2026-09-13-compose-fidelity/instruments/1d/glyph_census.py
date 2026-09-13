import json, collections, re, sys, unicodedata, html
from pathlib import Path
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from fontTools.ttLib import TTFont
P=Path(sys.argv[1]); names=P.joinpath('bought.txt').read_text().split()
R='/home/siggi/dev/repos/namsbokasafn-efni'
cm={w:set(TTFont(f'/usr/share/fonts/truetype/liberation/LiberationSans-{w}.ttf').getBestCmap()) for w in ('Regular','Bold','Italic')}
# positive control: U+21CC should be missing, 'A' present
print('control U+21CC in Regular?', 0x21CC in cm['Regular'], "'A' in Regular?", ord('A') in cm['Regular'], 'U+2192', 0x2192 in cm['Regular'], 'U+27F6', 0x27F6 in cm['Regular'])
stix=collections.Counter(); allsrc=collections.Counter(); miss_src=collections.Counter()
for n in names:
    m=json.loads((P/n/'meta.json').read_text()); runs=json.loads((P/n/'runs.json').read_text())
    for r in runs:
        b=m['fonts'][r['font']]['base']
        for ch in r['text']:
            allsrc[ch]+=1
            if 'STIX' in b: stix[ch]+=1
            if ord(ch) not in cm['Regular']: miss_src[(ch,n)]+=1
print('STIX chars:', {f"{c}(U+{ord(c):04X} {unicodedata.name(c,'?')})":k for c,k in stix.items()})
print('source chars missing from Liberation Regular cmap:', dict(miss_src))
print('non-ASCII source chars:', {f"{c} U+{ord(c):04X}":k for c,k in allsrc.items() if ord(c)>126 or ord(c)<32})
# published svg text
txt=re.compile(r'<text ([^>]*)>(.*?)</text>', re.S)
miss_pub=collections.Counter(); nitems=0; pubchars=collections.Counter(); sc_chars=collections.Counter()
for n in names:
    s=Path(f'{R}/books/efnafraedi-2e/media/{n}_IS.svg').read_text()
    for a,t in txt.findall(s):
        t=html.unescape(t); nitems+=1
        bold='font-weight="700"' in a
        for ch in t:
            pubchars[ch]+=1
            if ord(ch) not in cm['Bold' if bold else 'Regular']: miss_pub[(ch,n)]+=1
    sc=json.loads(Path(f'{R}/books/efnafraedi-2e/figure-text/{n}.is.json').read_text())
    for k,v in sc['blocks'].items():
        for ch in v: sc_chars[ch]+=1
print('published <text> items', nitems, 'chars', sum(pubchars.values()), 'missing from embedded face cmap:', dict(miss_pub))
print('non-ASCII published chars:', {f"{c} U+{ord(c):04X}":k for c,k in pubchars.items() if ord(c)>126})
print('non-ASCII sidecar chars:', {f"{c} U+{ord(c):04X}":k for c,k in sc_chars.items() if ord(c)>126})
