import re, html, glob, collections, json, os
PUB='/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/05-publication/mt-preview/chapters'
SRC='/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/01-source'
MN=re.compile(r'<g data-mml-node="(mn|mtext)"([^>]*)>(.*?)</g>', re.S)
USE=re.compile(r'data-c="([0-9A-Fa-f]+)"')
DP=re.compile(r'\d\.\d'); DC=re.compile(r'\d,\d')
res={}
residual=collections.Counter(); thousands_prose=collections.Counter(); comma_prose_samples=collections.Counter()
for ch in ('03','04'):
    c=collections.Counter()
    for f in sorted(glob.glob(f'{PUB}/{ch}/*.html')):
        s=open(f,encoding='utf-8').read()
        for m in MN.finditer(s):
            kind, attrs, body = m.groups()
            txt=''.join(chr(int(h,16)) for h in USE.findall(body))
            if not re.search(r'\d', txt): continue
            loc='data-localized="is"' in attrs
            c[f'{kind} with digit']+=1
            if DP.search(txt): c[f'{kind} digit.digit']+=1
            if DC.search(txt): c[f'{kind} digit,digit']+=1
            if loc: c[f'{kind} data-localized']+=1
            if kind=='mn' and DP.search(txt): residual[('mn', txt)]+=1
        lat=re.findall(r'data-latex="([^"]*)"', s)
        for v in lat:
            v=html.unescape(v)
            c['latex digit.digit']+=len(DP.findall(v)); c['latex digit,digit']+=len(DC.findall(v))
        alts=[html.unescape(a) for a in re.findall(r'\balt="([^"]*)"', s)]
        for a in alts:
            c['alt digit.digit']+=len(DP.findall(a)); c['alt digit,digit']+=len(DC.findall(a))
            for mm in re.finditer(r'\d+\.\d+', a): residual[('alt', a[max(0,mm.start()-40):mm.end()+20])]+=1
        body=re.sub(r'<svg\b.*?</svg>', ' ', s, flags=re.S)
        body=re.sub(r'<(script|style)\b.*?</\1>', ' ', body, flags=re.S)
        text=html.unescape(re.sub(r'<[^>]+>', ' ', body))
        c['prose digit.digit']+=len(DP.findall(text)); c['prose digit,digit']+=len(DC.findall(text))
        for mm in re.finditer(r'\d[\d.,]*\.\d[\d.,]*', text):
            residual[('prose', os.path.basename(f), text[max(0,mm.start()-30):mm.end()+15].replace('\n',' '))]+=1
        for mm in re.finditer(r'\d{1,3}(?:[.,    ]\d{3})+(?![\d])', text):
            thousands_prose[mm.group()]+=1
    res[ch]=dict(c)
# source control: m:mn in 01-source for ch03/ch04
for ch in ('ch03','ch04'):
    c=collections.Counter()
    for f in glob.glob(f'{SRC}/{ch}/*.cnxml'):
        s=open(f,encoding='utf-8').read()
        for v in re.findall(r'<m:mn[^>]*>([^<]*)</m:mn>', s):
            c['src mn']+=1
            if DP.search(v): c['src mn digit.digit']+=1
            if DC.search(v): c['src mn digit,digit']+=1
    res[ch+'-source']=dict(c)
print(json.dumps(res, indent=1))
print('RESIDUAL point-decimals (kind, context): count')
for k,v in sorted(residual.items()): print(v, k)
print('thousands-like groups in prose:', thousands_prose.most_common(40))
