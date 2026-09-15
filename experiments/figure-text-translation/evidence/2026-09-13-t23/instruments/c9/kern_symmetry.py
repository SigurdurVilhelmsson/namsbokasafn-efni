import sys
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.dont_write_bytecode=True
from fontTools.ttLib import TTFont
import collections
FACES = {'Regular':'LiberationSans-Regular.ttf','Bold':'LiberationSans-Bold.ttf','Italic':'LiberationSans-Italic.ttf','BoldItalic':'LiberationSans-BoldItalic.ttf'}
for n,p in FACES.items():
    f=TTFont('/usr/share/fonts/truetype/liberation/'+p)
    kt={}
    for t in f['kern'].kernTables: kt.update(t.kernTable)
    gp={}; fmts=collections.Counter()
    for lk in f['GPOS'].table.LookupList.Lookup:
        for st in lk.SubTable:
            lt=lk.LookupType
            if lt==9: lt=st.ExtensionLookupType; st=st.ExtSubTable
            if lt!=2: continue
            fmts[st.Format]+=1
            if st.Format==1:
                for g1,ps in zip(st.Coverage.glyphs, st.PairSet):
                    for r in ps.PairValueRecord:
                        gp[(g1,r.SecondGlyph)]=getattr(r.Value1,'XAdvance',0) or 0
            else:
                cd1=st.ClassDef1.classDefs; cd2=st.ClassDef2.classDefs
                allg=f.getGlyphOrder()
                for g1 in st.Coverage.glyphs:
                    c1=cd1.get(g1,0)
                    for g2 in allg:
                        v=st.Class1Record[c1].Class2Record[cd2.get(g2,0)].Value1
                        xa=getattr(v,'XAdvance',0) if v else 0
                        if xa: gp[(g1,g2)]=xa
    def asym(d):
        bad=[]
        for (a,b),v in d.items():
            for x,y in (('period','comma'),('comma','period')):
                if a==x and d.get((y,b),0)!=v: bad.append(((a,b),v,d.get((y,b),0)))
                if b==x and d.get((a,y),0)!=v: bad.append(((a,b),v,d.get((a,y),0)))
        return bad
    digits={'zero','one','two','three','four','five','six','seven','eight','nine'}
    dig_pairs=[(k,v) for k,v in list(kt.items())+list(gp.items()) if (k[0] in ('period','comma') and k[1] in digits) or (k[1] in ('period','comma') and k[0] in digits)]
    print(n, 'kern pairs', len(kt), 'GPOS pair subtable formats', dict(fmts), 'GPOS pairs', len(gp),
          '| asym kern', asym(kt), '| asym GPOS', asym(gp)[:5], '| digit<->period/comma pairs', dig_pairs,
          '| positive control (T,period) kern', kt.get(('T','period')), 'GPOS', gp.get(('T','period')))
