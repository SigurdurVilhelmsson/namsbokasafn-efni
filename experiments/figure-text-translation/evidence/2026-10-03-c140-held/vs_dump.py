"""Dump geometry for the value-sheet target blocks (read-only, scratch outputs)."""
import json, sys, os
from pathlib import Path
O = Path(os.environ['HOME']) / '.cache/namsbokasafn-audit/2026-10-03-step2/vs-prepare'
TARGETS = {
 'CNX_Chem_01_02_MattType': ['No'],
 'CNX_Chem_07_04_HNO2_img': ['or'],
 'CNX_Chem_20_04_amide1_img': ['R or H', 'C|H or R'],
 'CNX_Chem_09_05_MolSpeed1': ['02 at T = 300 K'],
 'CNX_Chem_14_02_phscale': ['100 or 1'],
 'CNX_Chem_14_06_buffer': ['[CH3CO2H] is 11% of [CH3CO2|–]'],
 'CNX_Chem_18_04_OxStNonmts': ['4+|To|4–', '5+|To|3–'],
 'CNX_Chem_01_04_MYdCmIn': ['1 in. = 2.54 cm'],
}
import _deps
import figtext as FT, figscripts as FS, figcontainers as FC
from blockkey import block_key
from PIL import Image
for b, keys in TARGETS.items():
    d = O / b
    meta = json.loads((d / 'meta.json').read_text()); runs = json.loads((d / 'runs.json').read_text())
    bj = json.loads((d / 'blocks.json').read_text())
    sendmap = {}
    for x in bj: sendmap.setdefault(x['key'], []).append(x.get('send'))
    blocks = FT.merge_blocks(FT.group(runs))
    page = FC.load_page(d / 'artwork.pdf')
    dark = Image.open(d / 'artwork.png').convert('L')
    H = meta['page'][1]
    print(f"\n######## {b}  ({len(blocks)} blocks; page {meta['page']})")
    hits = 0
    for BI, blk in enumerate(blocks):
        k = block_key(blk)
        if k not in keys: continue
        hits += 1
        ls = FT.lines(blk)
        vl = FT.visual_lines(blk) if hasattr(FT, 'visual_lines') else None
        cont = FC.container_for(BI, blocks, page, dark, H)
        print(f"-- block {BI} key={k!r} send={sendmap.get(k)} arc={FT.is_arc(blk)} n_lines={len(ls)} cls={cont.get('cls')} align={cont.get('align')} why={cont.get('why')}")
        for li, l in enumerate(ls):
            st = FS.line_styles(l, meta['fonts'])
            print(f"   line {li}: proj0={FT.proj(l[0]):.2f}")
            for r in l:
                bold, ital = FT.run_face(r, meta['fonts'])
                print(f"      run {r['text']!r:14} size={r['size']:.2f} along={FT.along(r):.2f} adv={r['adv']:.2f} proj={FT.proj(r):.2f} rot={r['rot']} font={meta['fonts'][r['font']]['base']} it={ital} fill={r['fill']}")
            print(f"      line_styles: {st}")
        toks, miss = FS.source_tokens(blk, meta['fonts'])
        print(f"   tokens={[(t['text'], t['styles']) for t in toks]} misses={miss}")
        print(f"   body_size={FS.body_size(blk, meta['fonts'])}")
    print(f"   [{hits} matching block(s)]")
