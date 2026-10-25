import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from norm import *
cases = [
  ('learning {{term}}chemistry{{/term}}, the', 'learning [[term:chemistry|term-00001]], the', True),
  ('life ([#CNX_Chem_01_01_Alchemist]).', 'life ([[xref:CNX_Chem_01_01_Alchemist]]).', True),
  ('H[[sub:2]]O and 10^3^ m', 'H[[sub:2]]O and 10[[sup:3]] m', True),   # no api marker? [[sub: IS api -> ^3^ stays literal
  ('8 g/cm^3^.', '8 g/cm[[sup:3]].', True),
  ('++Copper wire++ has', '[[u:Copper wire]] has', True),
  ('a {=note=} here', 'a [[em:note|os-teacher]] here', True),
  ('[[MATH:3]] x', '[[MATH:7]] x', True),
  ('[[MATH:3]] x', '[[MATH:7]] y', False),
  ('see [text](https://x.org/a) now', 'see [[link:text|https://x.org/a]] now', True),
  ('[[sup:[[i:x]]−1]]', 'x−1', True),
  ('{{i}}a{{/i}} b', '[[i:a]] b', True),
  ('[[xref:fig1]]', '[[xref:fig2]]', False),
  ('A &amp; B', 'A & B', True),
  ('A  \n B', 'A B', True),
  ('[[docref:m68674#fs-1]]', '[m68674#fs-1]', True),
  ('[[term:Lögmál|term-00003]] vísindanna', '__Lögmál__ vísindanna', True),
  ('an em [[em:x|y]] and term [[term:a [[sub:2]] b|term-1]]', 'an em x and term a 2 b', True),
]
bad = 0
for a, b, exp in cases:
    got = visible(a) == visible(b)
    flag = 'ok' if got == exp else 'FAIL'
    if got != exp: bad += 1
    print(flag, repr(visible(a)), '<->', repr(visible(b)))
# planted unterminated marker must raise
try:
    visible('foo [[i:bar baz')
    print('FAIL: no raise'); bad += 1
except ParseError:
    print('ok: unterminated raises')
print('kinds:', kinds(parse_brackets(legacy_to_bracket('{{term}}a{{/term}} [#x] [t](#y) ++u++ {=e=} 10^3^ {{fn}}f{{/fn}}'))))
print('BAD', bad)
