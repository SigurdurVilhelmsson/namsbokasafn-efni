#!/usr/bin/env python3
"""Plain assert checks for the normalizer and converter, on REAL segments from both
vintages (strings copied from the extracted files).  Run: python3 -u check_markers.py"""
import sys
sys.path.insert(0, '.')
from markers import visible, legacy_to_bracket, parse, serialize, residue
from convert import convert

fails = 0
def eq(a, b, label):
    global fails
    if a != b:
        fails += 1
        print(f'FAIL {label}\n   got : {a!r}\n   want: {b!r}')
    else:
        print(f'ok   {label}')
def ne(a, b, label):
    global fails
    if a == b:
        fails += 1
        print(f'FAIL (should differ) {label}: {a!r}')
    else:
        print(f'ok   {label} (differs, as it must)')

# ---------------- normalizer: legacy (as-translated June EN) vs NEW bracket -------------
pairs = [
 ('term __x__', 'you will be learning __chemistry__, the study', 'you will be learning [[term:chemistry|term-00001]], the study'),
 ('term {{term}}', 'the {{term}}kilogram (kg){{/term}}. The', 'the [[term:kilogram (kg)|term-00006]]. The'),
 ('term with legacy sup inside', 'A __cubic centimeter (cm^3^)__ is the volume', 'A [[term:cubic centimeter (cm[[sup:3]])|term-00014]] is the volume'),
 ('bold **', 'The abbreviation **cc** (for **c**ubic **c**entimeter) is', 'The abbreviation [[b:cc]] (for [[b:c]]ubic [[b:c]]entimeter) is'),
 ('xref [#id]', 'extend life ([#CNX_Chem_01_01_Alchemist]).', 'extend life ([[xref:CNX_Chem_01_01_Alchemist]]).'),
 ('italic *x*', '*Micro* comes from Greek (see [#CNX_Chem_01_01_WaterDom] (*b*)).', '[[i:Micro]] comes from Greek (see [[xref:CNX_Chem_01_01_WaterDom]] ([[i:b]])).'),
 ('sub ~x~', 'The formula H~2~O, which', 'The formula H[[sub:2]]O, which'),
 ('sup ^x^ + underline ++', '(b) ++Copper wire++ has a density of about 8 g/cm^3^.', '(b) [[u:Copper wire]] has a density of about 8 g/cm[[sup:3]].'),
 ('MATH renumbered + caret', 'weigh about 3 [[MATH:1]] 10^−13^ grams', 'weigh about 3 [[MATH:7]] 10[[sup:−13]] grams'),
 ('md link', 'Watch this [video](http://openstax.org/l/16plasma) to learn', 'Watch this [[link:video|http://openstax.org/l/16plasma]] to learn'),
 ('legacy docref', 'units in [m68674#fs-idm81346144]:', 'units in [[docref:m68674#fs-idm81346144]]:'),
 ('legacy footnote',
  '1 lb = 453.59 g [footnote: Strictly speaking, units of weight, *W* (a force, *W* = *mg*). For *g* at the surface.]',
  '1 lb = 453.59 g [[fn:Strictly speaking, units of weight, [[i:W]] (a force, [[i:W]] = [[i:mg]]). For [[i:g]] at the surface.|foot-00001]]'),
 ('{{fn}}', '453.59 g {{fn}}Strictly [[i:W]].{{/fn}}', '453.59 g [[fn:Strictly [[i:W]].|foot-00001]]'),
 ('{=em=}', '{=H[[sub:3]]=}AsO[[sub:4]]', '[[em:H[[sub:3]]|ionizable]]AsO[[sub:4]]'),
 ('{{i}}', 'the {{i}}SI units{{/i}} are', 'the [[i:SI units]] are'),
 ('nested bracket', 'is [[sup:[[i:x]]−1]] here', 'is [[sup:[[i:x]]−1]] here'),
 ('BR/SPACE', 'a[[BR]]b', 'a b'),
 ('entity', 'A &amp; B', 'A & B'),
]
for label, june, new in pairs:
    lit = new.count('*')
    eq(visible(june, lit), visible(new, new.count('*')), 'visible: ' + label)

# literal asterisks must SURVIVE on both sides
lit_new = 'to form molecular orbitals (σ, σ*, π, π*)'
eq(visible(lit_new, lit_new.count('*')), 'to form molecular orbitals (σ, σ*, π, π*)', 'literal asterisks kept')
# a table summary's literal bracket text is NOT a link
summ = 'Next is [C o (e n) subscript 3](C l O subscript 4) subscript 3 with values'
eq(visible(summ, 0), summ, 'literal [..](..) in a summary is not a link')
# placeholders are generic but KIND-specific
ne(visible('x [[MATH:1]] y'), visible('x [[MEDIA:1]] y'), 'MATH vs MEDIA token')
# a real content change must remain a difference
ne(visible('The formula H~2~O, which'), visible('The formula H[[sub:2]]O2, which'), 'content change detected')
# a different xref target is a difference
ne(visible('([#Fig_A])'), visible('([[xref:Fig_B]])'), 'xref target change detected')

# ---------------- converter: June IS -> NEW bracket ----------------------------------
r = convert('Þegar þú lærir munt þú læra __efnafræði__, fræðigreinina ([#CNX_Chem_01_01_Alchemist]).',
            'you will be learning [[term:chemistry|term-00001]], the study ([[xref:CNX_Chem_01_01_Alchemist]]).',
            'you will be learning __chemistry__, the study ([#CNX_Chem_01_01_Alchemist]).')
eq((r['status'], r['converted']), ('clean', 'Þegar þú lærir munt þú læra [[term:efnafræði|term-00001]], fræðigreinina ([[xref:CNX_Chem_01_01_Alchemist]]).'), 'convert term+xref')
r = convert('vegur um 3 [[MATH:1]] 10^−13^ grömm eða 3 [[MATH:2]] 10^14^',
            'weigh about 3 [[MATH:7]] 10[[sup:−13]] grams or 3 [[MATH:8]] 10[[sup:14]]',
            'weigh about 3 [[MATH:1]] 10^−13^ grams or 3 [[MATH:2]] 10^14^')
eq((r['status'], r['converted']), ('clean', 'vegur um 3 [[MATH:7]] 10[[sup:−13]] grömm eða 3 [[MATH:8]] 10[[sup:14]]'), 'convert MATH renumber + caret')
r = convert('Massi [[MATH:2]] og [[MATH:1]]', 'mass [[MATH:5]] and [[MATH:6]]', 'mass [[MATH:1]] and [[MATH:2]]')
eq((r['status'], r['converted']), ('clean', 'Massi [[MATH:6]] og [[MATH:5]]'), 'MATH renumbered through the ENGLISH alignment, IS order kept')
r = convert('Massi __a__ og __b__', 'mass [[term:a|term-00001]] and [[term:b|term-00002]]', 'mass __a__ and __b__')
eq((r['status'], 'positional-termx2' in r['flags']), ('clean', True), 'two terms -> clean but flagged positional')
r = convert('Massi __a__', 'mass [[term:a|term-00001]] and [[term:b|term-00002]]', 'mass __a__ and __b__')
eq(r['status'], 'fallback', 'dropped term -> fallback')
print('reason:', r['reasons'])
r = convert('(sjá [#Fig_B])', '(see [[xref:Fig_A]])', '(see [#Fig_B])')
eq(r['status'], 'fallback', 'xref target mismatch -> fallback')
r = convert('1 lb = 453,59 g [footnote: Strangt *W*.]', '1 lb = 453.59 g [[fn:Strictly [[i:W]].|foot-00001]]', '1 lb = 453.59 g [footnote: Strictly *W*.]')
eq((r['status'], r['converted']), ('clean', '1 lb = 453,59 g [[fn:Strangt [[i:W]].|foot-00001]]'), 'legacy footnote with nested italic')
r = convert('{=H[[sub:3]]=}AsO[[sub:4]]', '[[em:H[[sub:3]]|ionizable]]AsO[[sub:4]]', '{=H[[sub:3]]=}AsO[[sub:4]]')
eq((r['status'], r['converted']), ('clean', '[[em:H[[sub:3]]|ionizable]]AsO[[sub:4]]'), '{=em=} gets its class from NEW EN')
r = convert('Horfðu á [myndband](http://openstax.org/l/16plasma) hér', 'Watch this [[link:video|http://openstax.org/l/16plasma]] here', 'Watch this [video](http://openstax.org/l/16plasma) here')
eq((r['status'], r['converted']), ('clean', 'Horfðu á [[link:myndband|http://openstax.org/l/16plasma]] hér'), 'md link -> [[link:]]')
r = convert('Massi {{i}}x', 'mass [[i:x]]', 'mass {{i}}x{{/i}}')
eq(r['status'], 'fallback', 'unbalanced {{i}} -> fallback (legacy residue)')
print('reason:', r['reasons'])
# planted control: the parser must RAISE on an unterminated marker (so 0 corpus firings means something)
from markers import ParseError
try:
    parse('abc [[i:unterminated text')
    fails += 1; print('FAIL parser accepted an unterminated marker')
except ParseError:
    print('ok   parser raises on planted unterminated marker')
print('FAILURES:', fails)
sys.exit(1 if fails else 0)
