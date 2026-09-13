"""Re-strip one staged PDF two ways (original strip vs strip that KEEPS graphics-state ops inside BT..ET),
render both at 200 dpi, and count px differing from the source raster outside text boxes."""
import sys, subprocess, importlib.util, json
from pathlib import Path
sys.path.insert(0,'/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.path.insert(0,str(Path(__file__).parent/'lib'))
import pikepdf
spec=importlib.util.spec_from_file_location('st', str(Path(__file__).parent/'lib/strip_text_orig.py')); st=importlib.util.module_from_spec(spec); spec.loader.exec_module(st)
TEXT_OPS={'Tc','Tw','Tz','TL','Tf','Tr','Ts','Td','TD','Tm','T*','Tj','TJ',"'",'"'}
def strip_keep_gstate(source):
    owner=None
    if isinstance(source,(bytes,bytearray)):
        owner=pikepdf.new(); source=owner.make_stream(bytes(source))
    out=[]; depth=0; removed=0
    for ins in pikepdf.parse_content_stream(source):
        if isinstance(ins,pikepdf.ContentStreamInlineImage):
            out.append(ins); continue
        op=str(ins.operator)
        if op=='BT': depth+=1; removed+=1; continue
        if op=='ET': depth=max(0,depth-1); continue
        if depth and op in TEXT_OPS: continue
        out.append(ins)
    r=pikepdf.unparse_content_stream(out); del owner; return r, removed
src_pdf=Path(sys.argv[1]); outdir=Path(sys.argv[2]); outdir.mkdir(parents=True, exist_ok=True)
for variant in ('orig','keepgs'):
    if variant=='keepgs': st.strip_text_ops=strip_keep_gstate
    pdf=pikepdf.open(str(src_pdf)); st.strip_text(pdf)
    page=pdf.pages[0]
    for k in ('/PieceInfo','/LastModified','/Metadata','/Thumb'):
        if k in page.obj: del page.obj[k]
    pdf.remove_unreferenced_resources()
    o=outdir/f'art_{variant}.pdf'; pdf.save(str(o))
    subprocess.run(['pdftocairo','-png','-r','200','-singlefile',str(o),str(outdir/f'art_{variant}')],check=True)
print('ok')
