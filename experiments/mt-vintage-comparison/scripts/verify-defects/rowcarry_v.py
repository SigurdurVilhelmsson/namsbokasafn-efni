import json,re,collections
from load_pairs import june,new
from canon_v import plain
J=june(); N=new(); cls=json.load(open('classes.json'))
reuse=[k for k,c in cls.items() if c in ('identical-raw','dialect-only')]
gl=json.load(open('gl-5db701c92.json'))
rows=[(t['english'],t['icelandic']) for t in gl['terms'] if t.get('status')=='approved']
P={k:(plain(N[k]['en']),plain(J[k]['is']).lower(),plain(N[k]['is']).lower()) for k in reuse}
IS_B='(?<![a-záéíóúýþæöð])'
tot_j=tot_n=0; nrows=0; per=[]
for hw,tg in rows:
    try: pe=re.compile(r'(?<![A-Za-z])'+re.escape(hw)+r'(?:s|es)?(?![A-Za-z])',re.I)
    except re.error: continue
    seg=[k for k in reuse if pe.search(P[k][0])]
    if len(seg)<5: continue
    pt=re.compile(IS_B+re.escape(tg.lower()))
    j=sum(1 for k in seg if pt.search(P[k][1])); n=sum(1 for k in seg if pt.search(P[k][2]))
    tot_j+=j; tot_n+=n; nrows+=1; per.append((hw,tg,len(seg),j,n))
print('rows with >=5 EN segs:',nrows,' June carried:',tot_j,' new carried:',tot_n, f' change {100*(tot_n-tot_j)/tot_j:.1f}%')
per.sort(key=lambda r: r[3]-r[4], reverse=True)
print('largest June-over-new:',[(h,t,s,j,n) for h,t,s,j,n in per[:12]])
print('largest new-over-June:',[(h,t,s,j,n) for h,t,s,j,n in per[-12:]])
json.dump(per,open('rowcarry_v.json','w'),ensure_ascii=False)
