import sys, json
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, '/home/siggi/dev/scratch-c140/c2/proto')
import figtext as FT
from blockkey import block_key
import scripts as TS

def load(b):
    d = f'/home/siggi/dev/scratch-c140/c2/work/{b}/in'
    runs = json.load(open(f'{d}/runs.json')); meta = json.load(open(f'{d}/meta.json'))
    return {block_key(x): x for x in FT.merge_blocks(FT.group(runs))}, meta

def show(value, fmt):
    SUB = str.maketrans('0123456789+-–', '₀₁₂₃₄₅₆₇₈₉₊₋₋'); SUP = str.maketrans('0123456789+-–', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻')
    out = []
    for ch, f in zip(value, fmt):
        if f is None: out.append(ch)
        elif f[1] < -0.05: out.append(ch.translate(SUB))
        elif f[1] > 0.05: out.append(ch.translate(SUP))
        elif f[2]: out.append(f'_{ch}_')
        else: out.append(ch)
    return ''.join(out)

def probe(b, key, value, label, all_occ=True):
    blocks, meta = load(b)
    toks = TS.source_tokens(blocks[key], meta['fonts'])
    fmt, miss = TS.transfer(toks, value, all_occurrences=all_occ)
    words = TS.words(value, fmt)
    rejoined = ' '.join(w for w, _ in words)
    styled_chars = sum(1 for f in fmt if f)
    print(f'[{label}] {value!r}\n    -> {show(value, fmt)!r}  styled={styled_chars} unformatted={miss}\n    words-rejoined {rejoined!r} == split-join {" ".join(value.split())!r}: {rejoined == " ".join(value.split())}; '
          f'styles survive: {show(rejoined, [s for w, st in words for s in list(st) + [None]][:len(rejoined)])!r}')

S, C, H, CU = 'CNX_Chem_03_02_sacch_img-3278', 'CNX_Chem_04_05_combustion', 'CNX_Chem_04_02_HClsoln', 'CNX_Chem_03_02_copperMoles_img-a962'
M3 = 'CNX_Chem_04_03_map3_img'
print('== controls on committed values')
probe(S, 'Moles of|C7H5NO3S|(mol)', 'Mól af C7H5NO3S (mól)', 'real sacch')
probe(C, 'CO2, H2O, O2,|and other gases', 'CO2, H2O, O2 og aðrar lofttegundir', 'real combustion O2-in-CO2')
probe(CU, 'Multiply by|Avogadro’s|number (mol–1)', 'Margfaldaðu með tölu Avogadros (mól–1)', 'real anchored l–1')
print('== whitespace shapes (editor input is not trimmed)')
probe(S, 'Moles of|C7H5NO3S|(mol)', '  Mól af  C7H5NO3S (mól) ', 'leading/double/trailing space')
probe(S, 'Moles of|C7H5NO3S|(mol)', 'Mól af C7H5NO3S\t(mól)', 'NBSP and TAB')
probe(H, 'HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)', 'HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq) ', 'HClsoln identity + 1 trailing space (editor): 10-space gap')
probe(H, 'HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)', 'HCl(aq) + H2O(l)  →  H3O+(aq) + Cl–(aq)', 'HClsoln editor typed an arrow')
print('== editor edit shapes (must be NAMED, never misplaced)')
probe(S, 'Moles of|C7H5NO3S|(mol)', 'Mól af C₇H₅NO₃S (mól)', 'unicode subscripts typed')
probe(S, 'Moles of|C7H5NO3S|(mol)', 'Mól af sakkaríni (mól)', 'formula replaced by a name')
probe(C, 'CO2, H2O, O2,|and other gases', 'CO2, H2O og aðrar lofttegundir', 'O2 dropped (CO2 must not donate)')
probe(CU, 'Multiply by|Avogadro’s|number (mol–1)', 'Margfaldaðu með tölu Avogadros (mól−1)', 'U+2212 typed')
probe(S, 'Moles of|C7H5NO3S|(mol)', 'Mól af C7H5 NO3S (mól)', 'space inserted inside formula')
probe(C, 'CO2 absorber|such as NaOH', 'co2-gleypir eins og NaOH', 'lowercased formula')
probe(M3, 'Mass of |C8H18', 'Massi C8H18 og C8H18', 'repeated formula, all_occurrences=True (N4)')
probe(M3, 'Mass of |C8H18', 'Massi C8H18 og C8H18', 'repeated formula, 2b first-only (N4 silent partial)', all_occ=False)
probe(CU, 'Multiply by|Avogadro’s|number (mol–1)', 'Margfaldaðu (mól–1) með tölu Avogadros (mól–1)', 'anchored stretch now ambiguous')
print('== positive controls for the RULE (planted runs)')
# same-size superscript: 9pt '+' raised 3pt after 'NH4' (corpus: Nitrogen `NH4|+|)` is all 9pt)
base = dict(font='PAGE/F1', rot=0.0, fill=None, tm=[1,0,0,1,0,0])
line = [dict(base, text='NH', size=9.0, x=0.0, y=0.0, adv=13.5), dict(base, text='4', size=7.0, x=13.5, y=-3.0, adv=3.9),
        dict(base, text='+', size=9.0, x=17.4, y=3.0, adv=5.3)]
fonts = {'PAGE/F1': {'base': '/X+LiberationSans'}}
text, styles, b = TS.line_char_styles(line, fonts)
import statistics
maxsz = max(r['size'] for r in line); full=[r for r in line if r['size']==maxsz]; bp=statistics.median(FT.proj(r) for r in full)
print('planted NH4+ (same-size sup):', text, styles, '| 1b has_script flags:', [r['text'] for r in line if r['size'] < 0.9*maxsz and abs(FT.proj(r)-bp) > 0.5])
# STIX '+' 10pt on 9pt line, no shift (sandwich '=' shape): must NOT be styled
line2 = [dict(base, text='2 slices ', size=9.0, x=0.0, y=0.0, adv=30.0), dict(base, text='=', size=10.0, x=30.0, y=0.0, adv=5.8)]
print('planted size-only 10pt = on 9pt line:', TS.line_char_styles(line2, fonts)[1])
# stacked split token with no anchor: key line 1 is just '–'
toks = [dict(line=0, text='HCO3', styles=[None,None,None,(0.7778,-0.3333,False)]), dict(line=1, text='–', styles=[(0.7778,0.4444,False)])]
for v in ('Styrkur HCO3– jóna', 'HCO3 – jón', 'HCO3– og CO3–'):
    fmt, miss = TS.transfer(toks, v)
    print('stacked-split no-anchor probe', repr(v), '->', show(v, fmt), miss)
