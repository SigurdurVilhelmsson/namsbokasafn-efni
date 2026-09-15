import re, html, glob, collections
PUB='/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/05-publication/mt-preview/chapters'
REF=re.compile(r'(Mynd|Myndir|Dæmi|Tafla|Töflu|kafla|Kafli|kafli|æfingu|æfing|Jafna|jöfnu|mynd|dæmi|töflu)\s*$')
out=collections.Counter(); named=collections.defaultdict(list)
for ch in ('03','04'):
    for f in sorted(glob.glob(f'{PUB}/{ch}/*.html')):
        s=open(f,encoding='utf-8').read()
        body=re.sub(r'<svg\b.*?</svg>', ' ', s, flags=re.S)
        body=re.sub(r'<(script|style)\b.*?</\1>', ' ', body, flags=re.S)
        text=html.unescape(re.sub(r'<[^>]+>', ' ', body))
        text=re.sub(r'\s+', ' ', text)
        for m in re.finditer(r'(?<![\d.,])\d+(?:[.,]\d+)+(?![\d])', text):
            tok=m.group(); pre=text[max(0,m.start()-25):m.start()]; post=text[m.end():m.end()+20]
            if '.' in tok and ',' not in tok:
                if REF.search(pre) or re.match(r'\s[A-ZÁÉÍÓÚÝÞÆÖ]', post) and re.fullmatch(r'\d{1,2}\.\d{1,2}', tok):
                    k='point: ref/section number'
                elif re.fullmatch(r'\d{1,3}(\.\d{3})+', tok) and not re.fullmatch(r'\d\.\d{3}', tok):
                    k='point: thousands-shaped (period groups)'
                elif 'doi' in pre or '/' in post[:1]:
                    k='point: doi/url'
                else:
                    k='point: other (named)'
                    named[k].append((f.split('/')[-1], pre+'['+tok+']'+post))
                if k=='point: thousands-shaped (period groups)': named[k].append((f.split('/')[-1], pre+'['+tok+']'+post))
            elif ',' in tok and '.' not in tok:
                if re.fullmatch(r'\d{1,3}(,\d{3})+', tok):
                    k='comma: 3-digit groups (decimal or US thousands; ambiguous by shape)'
                else:
                    k='comma: decimal (non-3-digit)'
            else:
                k='both'
                named[k].append((f.split('/')[-1], pre+'['+tok+']'+post))
            out[(ch,k)]+=1
        for m in re.finditer(r'(?<![\d.,])\d{1,3}(?:[    ]\d{3})+(?![\d.,])', text):
            out[(ch,'space-grouped candidate')]+=1
            named['space-grouped candidate'].append((f.split('/')[-1], text[max(0,m.start()-25):m.end()+15]))
for k,v in sorted(out.items()): print(v, k)
for k,v in named.items():
    print('==', k, len(v))
    for x in v[:60]: print('   ', x)
