import re,sys,collections
p=sys.argv[1]
s=open(p,encoding='utf-8').read()
print('bytes',len(s.encode()))
tags=collections.Counter(re.findall(r'<([a-zA-Z][\w:]*)',s))
print('tags',dict(tags.most_common()))
print('filters',len(re.findall(r'<filter ',s)))
print('feImage',len(re.findall(r'<feImage',s)))
print('feBlend modes',collections.Counter(re.findall(r'<feBlend[^>]*mode="(\w+)"',s)))
print('feComposite ops',collections.Counter(re.findall(r'<feComposite[^>]*operator="(\w+)"',s)))
print('filter= uses',collections.Counter(re.findall(r'filter="url\(#([\w-]+)\)"',s)).most_common(5), len(re.findall(r'filter="url\(#',s)))
print('compositing-group ids',len(re.findall(r'id="compositing-group-',s)))
imgs=re.findall(r'<image ([^>]*)>',s)
print('images',len(imgs))
for a in imgs[:40]:
    w=re.search(r'width="([\d.]+)"',a);h=re.search(r'height="([\d.]+)"',a);i=re.search(r'id="([^"]+)"',a)
    href=re.search(r'href="data:([^;]+);base64,([^"]*)"',a)
    print('  img',i and i.group(1),w and w.group(1),h and h.group(1),href and href.group(1), href and len(href.group(2)))
d=re.findall(r' d="([^"]*)"',s)
print('path d count',len(d),'total d bytes',sum(map(len,d)))
print('opacity attrs',len(re.findall(r' opacity="',s)),'fill-opacity',len(re.findall(r'fill-opacity="',s)),'stroke-opacity',len(re.findall(r'stroke-opacity="',s)))
print('mask= uses',len(re.findall(r'mask="url\(#',s)),'clip-path uses',len(re.findall(r'clip-path="url\(#',s)))
# depth
depth=0;maxd=0
for m in re.finditer(r'<(/?)(g|mask|clipPath|pattern|filter|defs|svg|symbol)\b[^>]*?(/?)>',s):
    if m.group(1): depth-=1
    elif not m.group(3):
        depth+=1; maxd=max(maxd,depth)
print('max container depth',maxd)
