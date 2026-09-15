import re, html
from pathlib import Path
E = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media')
J = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/05-publication/mt-preview/chapters/03/images/media')
figs = ['CNX_Chem_03_01_alsulfatemass_img','CNX_Chem_03_01_aspirin','CNX_Chem_03_01_chloroform','CNX_Chem_03_01_glycinemass_img','CNX_Chem_03_01_saltMass']
TXT = re.compile(r'<text\b[^>]*>(.*?)</text>', re.S)
def texts(p):
    s = p.read_text(errors='replace')
    return [html.unescape(re.sub(r'<[^>]+>', '', t)) for t in TXT.findall(s)]
tp = tc = jp = jc = 0
for f in figs:
    for root, lab in ((E,'E'),(J,'J')):
        p = root/f'{f}_IS.svg'
        if not p.exists():
            print('MISSING', lab, p); continue
        ts = texts(p)
        pts = [t for t in ts if re.search(r'\d\.\d', t)]
        cms = [t for t in ts if re.search(r'\d,\d', t)]
        print(lab, f, 'texts', len(ts), 'point', len(pts), 'comma', len(cms))
        if lab=='E': tp+=len(pts); tc+=len(cms)
        else: jp+=len(pts); jc+=len(cms)
print('E point/comma', tp, tc, ' June point/comma', jp, jc)
# positive control: translated decimal commas in etheneBr/ethene E SVGs
for f in ['CNX_Chem_04_03_etheneBr_img','CNX_Chem_04_03_ethene_img']:
    ts = texts(E/f'{f}_IS.svg'); print('control', f, [t for t in ts if re.search(r'\d[.,]\d', t)])
