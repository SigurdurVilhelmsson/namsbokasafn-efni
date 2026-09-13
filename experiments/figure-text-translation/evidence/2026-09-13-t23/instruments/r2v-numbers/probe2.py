import json, sys
sys.dont_write_bytecode = True
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c3b/scripts')
from c3lib import *
ROOT = Path('/home/siggi/dev/scratch-c140'); R2 = ROOT / 'r2'; ME = ROOT / 'r2v-numbers'
mctx = cairo.Context(cairo.ImageSurface(cairo.FORMAT_A8, 8, 8))
for b, bi in (('CNX_Chem_03_01_glycinemass_img', 13), ('CNX_Chem_03_01_saltMass', 10), ('CNX_Chem_03_01_aspirin', 13)):
    fig = Fig(b, items_dir=R2 / 'work/V5_p2.0_f7.0', diag_dir=R2 / 'work/V5_p2.0_f7.0')
    for r in fig.blocks[bi]:
        lw = measure_adv(mctx, r['text'], r['size'], r['font'] in fig.bold_fonts)
        print(b, bi, repr(r['text']), 'font', fig.meta['fonts'][r['font']]['base'], 'size', r['size'], 'along', round(FT.along(r), 2), 'adv', round(r['adv'], 2), 'liberation', round(lw, 2), 'right(adv)', round(FT.along(r) + r['adv'], 2), 'right(lib)', round(FT.along(r) + lw, 2))
    print('   drawn items', [(it['text'], round(it['x'], 2), it['size']) for it in fig.block_items(bi)])
mine = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out/mym-V5_p2.0_f7.0.jsonl'))}
v0 = {(r['basename'], r['block']): r for r in map(json.loads, open(ME / 'out/mym-V0.jsonl'))}
for b, bi in (('CNX_Chem_03_02_argon_img-9025', 2), ('CNX_Chem_03_02_copperMoles_img-a962', 1), ('CNX_Chem_03_02_copperMoles_img-a962', 4), ('CNX_Chem_03_02_vitC_img-e537', 1), ('CNX_Chem_03_05_Example2_img', 1), ('CNX_Chem_03_02_glycine_img-7c96', 1), ('CNX_Chem_03_02_potassium_img-f1d1', 1), ('CNX_Chem_03_02_sacch_img-3278', 1), ('CNX_Chem_03_05_Example2_img', 3), ('CNX_Chem_04_03_ethene_img', 0), ('CNX_Chem_04_04_sandwich', 2), ('CNX_Chem_04_04_sandwich', 5), ('CNX_Chem_03_02_vitC_img-e537', 0)):
    k = (b, bi); print(b.replace('CNX_Chem_', ''), bi, 'src_lines', mine[k]['src_lines'], 'V0 lines', v0[k]['lines'], 'V5 lines', mine[k]['lines'], 'size', mine[k]['size'], 'text', mine[k]['text'])
