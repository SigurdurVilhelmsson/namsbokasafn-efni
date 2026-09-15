import sys
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.dont_write_bytecode=True
from fontTools.ttLib import TTFont
FACES = {'Regular':'/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
 'Bold':'/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
 'Italic':'/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf',
 'BoldItalic':'/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf'}
CH=[('.',0x2E),(',',0x2C),('space',0x20),('NBSP',0xA0),('NNBSP',0x202F),('THIN',0x2009),('0',0x30),('1',0x31),('7',0x37)]
for name,p in FACES.items():
    f=TTFont(p); upm=f['head'].unitsPerEm; cmap=f.getBestCmap(); hmtx=f['hmtx']; glyf=f['glyf']
    row=[]
    for lab,cp in CH:
        g=cmap.get(cp)
        if g is None: row.append(f'{lab}=ABSENT'); continue
        adv=hmtx[g][0]; gl=glyf[g]
        bb=(gl.xMin,gl.yMin,gl.xMax,gl.yMax) if gl.numberOfContours else None
        row.append(f'{lab}:{g}:adv={adv}:bbox={bb}')
    print(name, 'upm', upm, 'version', f['name'].getDebugName(5))
    for r in row: print('   ', r)
    # kerning: legacy kern table and GPOS pair adjustments involving period/comma
    kern_pairs=[]
    if 'kern' in f:
        for t in f['kern'].kernTables:
            for (a,b),v in t.kernTable.items():
                if a in ('period','comma') or b in ('period','comma'): kern_pairs.append((a,b,v))
    print('    kern-table pairs with period/comma:', len(kern_pairs), kern_pairs[:10])
    gpos_hits=[]
    if 'GPOS' in f:
        gpos=f['GPOS'].table
        feats=sorted({fr.FeatureTag for fr in gpos.FeatureList.FeatureRecord})
        print('    GPOS features:', feats)
        for li,lk in enumerate(gpos.LookupList.Lookup):
            for st in lk.SubTable:
                if lk.LookupType==9: st=st.ExtSubTable
                if getattr(st,'LookupType',lk.LookupType)!=2: continue
                cov=st.Coverage.glyphs
                if st.Format==1:
                    for g1,ps in zip(cov, st.PairSet):
                        for pvr in ps.PairValueRecord:
                            if g1 in ('period','comma') or pvr.SecondGlyph in ('period','comma'):
                                gpos_hits.append((li,g1,pvr.SecondGlyph,getattr(pvr.Value1,'XAdvance',None)))
                elif st.Format==2:
                    cd1=st.ClassDef1.classDefs; cd2=st.ClassDef2.classDefs
                    for g in ('period','comma'):
                        for g2 in ('zero','one','seven','period','comma','space'):
                            for a,b in ((g,g2),(g2,g)):
                                if a in cov or (st.Format==2 and False):
                                    c1=cd1.get(a,0); c2=cd2.get(b,0)
                                    v=st.Class1Record[c1].Class2Record[c2].Value1
                                    xa=getattr(v,'XAdvance',0) if v else 0
                                    if xa: gpos_hits.append((li,a,b,xa))
    print('    GPOS pair adjustments involving period/comma (sampled vs digits/space/punct):', len(gpos_hits), gpos_hits[:12])
