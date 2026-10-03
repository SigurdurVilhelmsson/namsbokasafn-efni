#!/usr/bin/env python3
"""§C140 ㊾ D5(a) - heldvalues.py, the `heldBlockValues` reader, tested alone.

    PYTHONDONTWRITEBYTECODE=1 python3 test_heldvalues.py

Plain checks and a module-level `fails` list, like its siblings - there is no pytest in this tree.
STDLIB ONLY: no cairo, no pdfplumber, no network. File IO only under a TemporaryDirectory (TMPDIR)
and one read of the committed figure-text.config.json (HV6).

Design: docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md, D-a, D-b, D-e,
D-i (HV1-HV6). Values are ASCII sentinels (QZX, QZQ) plus the 24 script characters; no Icelandic.

WHAT IS PINNED, AND WHY EACH ONE CAN FAIL
----------------------------------------
* HV1 the 24 script characters and their decoding: ⁻ and ₋ both become U+2013 EN DASH. Kills ⁻
  mapped to U+2212 MINUS SIGN or ASCII '-' (what NFKC gives), and the Python literal drifting from
  the JS validator's (figure-config-validate.js exports a second copy; both tests pin this literal).
* HV2 parse_value: '\\n' separates lines; a script character decodes to (base, 'sub'|'sup'); '|',
  an empty line, edge whitespace, an unsupported U+2070-U+209F character and a non-string refuse,
  each by its own reason. Kills splitting on '|' and drawing ⁽ literally.
* HV3 load_table: an absent table is {}; null, a list or a string refuses; entries are NOT parsed
  here. Kills an unreadable table being read as empty.
* HV4 for_figure: exact basename only, and only that entry is parsed - with the positive control
  that the other entry WOULD refuse if it were this figure's. Kills one bad entry failing every
  figure, and fold or prefix matching.
* HV5 write_file / read_file round-trip (empty values included); read_file refuses a missing
  file, an unparsable one, a missing field and a malformed value. Kills a missing file read as {}.
* HV6 (CONTROL) the committed config's table loads and equals the raw table, CONFIG_PATH is the
  file sources.load_config reads, and every committed entry parses. Vacuous while the table is
  empty or absent; holds either way.
* HV7 heldvalues imports nothing from this experiment (no _deps), so figure-compose.py's
  isolation is unchanged.
"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))

_BEFORE = set(sys.modules)
import heldvalues as HV                         # noqa: E402
_NEW = set(sys.modules) - _BEFORE

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    if not ok:
        fails.append(label)


def attempt(label, fn):
    """Run one arm; an exception is a FAIL of that arm, never a crash of the file."""
    try:
        fn()
    except Exception as e:                      # noqa: BLE001 - reported, not swallowed
        check(label + ' (raised)', False, f'{type(e).__name__}: {e}')


def reason(fn, *args):
    """-> the HeldValueError reason fn(*args) raises, or 'NO-RAISE'. Any other exception propagates."""
    try:
        fn(*args)
    except HV.HeldValueError as e:
        return e.reason
    return 'NO-RAISE'


def message(fn, *args):
    try:
        fn(*args)
    except HV.HeldValueError as e:
        return str(e)
    return 'NO-RAISE'


# The literal the JS test (tools/__tests__/figure-config-validate.test.js) pins too.
LITERAL = '₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻'
# ... and the same 24 characters by code point, so an editor that normalises the literal cannot hide.
CODEPOINTS = ([*range(0x2080, 0x208A), 0x208A, 0x208B, 0x2070, 0x00B9, 0x00B2, 0x00B3, *range(0x2074, 0x207A),
               0x207A, 0x207B])

# --------------------------------------------------------------------------------------------
print('HV1 the 24 script characters, and ⁻ / ₋ -> U+2013')


def hv1():
    check('HV1a the literal is the 24 code points', LITERAL == ''.join(map(chr, CODEPOINTS)) and len(LITERAL) == 24,
          ' '.join(f'U+{ord(c):04X}' for c in LITERAL))
    check('HV1b HELD_SCRIPT_CHARS equals the literal', HV.HELD_SCRIPT_CHARS == LITERAL, repr(HV.HELD_SCRIPT_CHARS))
    want = {chr(0x2080 + i): (str(i), 'sub') for i in range(10)}
    want.update({'₊': ('+', 'sub'), '₋': ('–', 'sub')})
    for i, cp in enumerate([0x2070, 0x00B9, 0x00B2, 0x00B3, *range(0x2074, 0x207A)]):
        want[chr(cp)] = (str(i), 'sup')
    want.update({'⁺': ('+', 'sup'), '⁻': ('–', 'sup')})
    check('HV1c SCRIPT_MAP: ₀-₉ ₊ ₋ lowered, ⁰ ¹ ² ³ ⁴-⁹ ⁺ ⁻ raised, onto digits, + and U+2013',
          HV.SCRIPT_MAP == want, repr(sorted(set(HV.SCRIPT_MAP.items()) ^ set(want.items()))))
    check('HV1d ⁻ and ₋ both decode to U+2013 EN DASH (never U+2212, never ASCII -)',
          HV.SCRIPT_MAP['⁻'][0] == HV.SCRIPT_MAP['₋'][0] == '–',
          f"{HV.SCRIPT_MAP['⁻'][0]!r} {HV.SCRIPT_MAP['₋'][0]!r}")


attempt('HV1', hv1)

# --------------------------------------------------------------------------------------------
print('HV2 parse_value: lines on newline, scripts decoded, every malformed value refused by name')


def hv2():
    check('HV2a two lines on a newline', HV.parse_value('a\nb') == [[('a', None)], [('b', None)]],
          repr(HV.parse_value('a\nb')))
    check('HV2b ₂ -> (2, sub)', HV.parse_value('₂') == [[('2', 'sub')]], repr(HV.parse_value('₂')))
    check('HV2c ⁰ -> (0, sup)', HV.parse_value('⁰') == [[('0', 'sup')]], repr(HV.parse_value('⁰')))
    check('HV2d ¹²³ (U+00B9/B2/B3) decode as raised', HV.parse_value('¹²³') == [[('1', 'sup'), ('2', 'sup'), ('3', 'sup')]],
          repr(HV.parse_value('¹²³')))
    check('HV2e a mixed line: O₂ QZX -> O plain, 2 sub, the rest plain',
          HV.parse_value('O₂ QZX') == [[('O', None), ('2', 'sub'), (' ', None), ('Q', None), ('Z', None), ('X', None)]],
          repr(HV.parse_value('O₂ QZX')))
    check('HV2f U+2013 itself (outside U+2070-209F) is drawn as written', HV.parse_value('4–') == [[('4', None), ('–', None)]],
          repr(HV.parse_value('4–')))
    check('HV2g a value is never split on | : a|b refuses as pipe', reason(HV.parse_value, 'a|b') == 'pipe',
          reason(HV.parse_value, 'a|b'))
    check('HV2h an empty line refuses', reason(HV.parse_value, 'a\n\nb') == 'empty-line', reason(HV.parse_value, 'a\n\nb'))
    check('HV2i the empty value refuses as an empty line', reason(HV.parse_value, '') == 'empty-line',
          reason(HV.parse_value, ''))
    check('HV2j leading whitespace refuses', reason(HV.parse_value, ' a') == 'edge-space', reason(HV.parse_value, ' a'))
    check('HV2k trailing whitespace on an inner line refuses', reason(HV.parse_value, '4+ \nQZQ') == 'edge-space',
          reason(HV.parse_value, '4+ \nQZQ'))
    check('HV2l ⁽ (U+207D) refuses as unsupported-script-char', reason(HV.parse_value, '⁽') == 'unsupported-script-char',
          reason(HV.parse_value, '⁽'))
    check('HV2m ₜ (U+209C, the top of the range) refuses too', reason(HV.parse_value, 'QZₜ') == 'unsupported-script-char',
          reason(HV.parse_value, 'QZₜ'))
    check('HV2n the refusal names the code point', 'U+207D' in message(HV.parse_value, '⁽'), message(HV.parse_value, '⁽'))
    check('HV2o a non-string refuses (a number, null, a legacy list)',
          [reason(HV.parse_value, v) for v in (7, None, ['a', 'b'])] == ['not-a-string'] * 3,
          repr([reason(HV.parse_value, v) for v in (7, None, ['a', 'b'])]))
    check('HV2p HeldValueError is a ValueError', issubclass(HV.HeldValueError, ValueError))


attempt('HV2', hv2)

# --------------------------------------------------------------------------------------------
print('HV3 load_table: absent is empty; an unreadable table is never read as empty')


def hv3():
    check('HV3a an absent table is {}', HV.load_table({'locale': 'is'}) == {}, repr(HV.load_table({'locale': 'is'})))
    check('HV3b an empty table is {}', HV.load_table({'heldBlockValues': {}}) == {})
    raw = {'CNX_A': {'k': 'QZX'}, 'CNX_B': 'garbage, parsed only by for_figure'}
    check('HV3c a table is returned as written, its entries NOT parsed', HV.load_table({'heldBlockValues': raw}) == raw)
    got = [reason(HV.load_table, {'heldBlockValues': v}) for v in (None, [], 'x')]
    check('HV3d null, a list and a string refuse as table-not-object', got == ['table-not-object'] * 3, repr(got))
    check('HV3e a config that is not an object refuses', reason(HV.load_table, []) == 'config-not-object',
          reason(HV.load_table, []))


attempt('HV3', hv3)

# --------------------------------------------------------------------------------------------
print('HV4 for_figure: the EXACT basename, and only its entry is parsed')

MATT = 'CNX_Chem_01_02_MattType'


def hv4():
    table = {MATT: {'No': 'QZX'}, 'CNX_Other': 'not-an-object', 'CNX_Bad': {'k': 'a|b'}}
    check('HV4a this figure gets its entry, while two malformed entries sit under other basenames',
          HV.for_figure(table, MATT) == {'No': 'QZX'}, repr(HV.for_figure(table, MATT)))
    # the positive control: those entries DO refuse when they are the figure's own
    check('HV4b control: the non-object entry refuses as its own figure\'s',
          reason(HV.for_figure, table, 'CNX_Other') == 'entry-not-object', reason(HV.for_figure, table, 'CNX_Other'))
    check('HV4c control: the bad value refuses as its own figure\'s, naming basename and key',
          reason(HV.for_figure, table, 'CNX_Bad') == 'pipe'
          and "heldBlockValues.CNX_Bad['k']" in message(HV.for_figure, table, 'CNX_Bad'),
          message(HV.for_figure, table, 'CNX_Bad'))
    check('HV4d a fold twin does not match (the config key lower-cased)',
          HV.for_figure({MATT.lower(): {'No': 'QZX'}}, MATT) == {})
    check('HV4e ... nor the other way round', HV.for_figure(table, MATT.lower()) == {})
    check('HV4f a prefix does not match, in either direction',
          HV.for_figure({'CNX_Chem_01_02_Matt': {'No': 'QZX'}}, MATT) == {}
          and HV.for_figure({MATT + '_img': {'No': 'QZX'}}, MATT) == {})
    check('HV4g a figure with no entry gets {}', HV.for_figure(table, 'CNX_Chem_02_05_PerTable1') == {})
    check('HV4h an empty entry refuses', reason(HV.for_figure, {MATT: {}}, MATT) == 'entry-empty',
          reason(HV.for_figure, {MATT: {}}, MATT))
    check('HV4i an empty block key refuses', reason(HV.for_figure, {MATT: {'': 'QZX'}}, MATT) == 'key-empty',
          reason(HV.for_figure, {MATT: {'': 'QZX'}}, MATT))
    v = '10⁰ QZ 1\nQZQ'
    check('HV4j the value comes back byte for byte (script characters are not decoded here)',
          HV.for_figure({MATT: {'k': v}}, MATT)['k'] == v)


attempt('HV4', hv4)

# --------------------------------------------------------------------------------------------
print('HV5 write_file / read_file: the hand-off file round-trips, and a broken one refuses')


def hv5():
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / 'held-values.json'
        values = {'No': 'QZX', '4+|To|4–': '4+\nQZQ\n4–', '100 or 1': '10⁰ QZ 1', 'k': 'O₂ QZX'}
        HV.write_file(p, MATT, HV.CONFIG_PATH, values)
        got = HV.read_file(p)
        check('HV5a round-trip: basename, configPath (a string) and values, byte for byte',
              got == {'basename': MATT, 'configPath': str(HV.CONFIG_PATH), 'values': values}, repr(got))
        HV.write_file(p, MATT, HV.CONFIG_PATH, {})
        check('HV5b an EMPTY values object is written and read back', HV.read_file(p)['values'] == {},
              repr(HV.read_file(p)))
        check('HV5c write_file leaves no .tmp beside the file', sorted(x.name for x in Path(td).iterdir()) == [p.name],
              repr(sorted(x.name for x in Path(td).iterdir())))
        for field in ('basename', 'configPath', 'values'):
            doc = {'basename': MATT, 'configPath': 'x', 'values': {}}
            del doc[field]
            p.write_text(json.dumps(doc), encoding='utf-8')
            check(f'HV5d a file without {field} refuses as missing-field', reason(HV.read_file, p) == 'missing-field',
                  reason(HV.read_file, p))
        p.write_text(json.dumps({'basename': 7, 'configPath': 'x', 'values': {}}), encoding='utf-8')
        check('HV5e a non-string basename refuses as bad-field', reason(HV.read_file, p) == 'bad-field',
              reason(HV.read_file, p))
        p.write_text(json.dumps({'basename': MATT, 'configPath': 'x', 'values': {'No': 'a|b'}}), encoding='utf-8')
        check('HV5f a malformed value in the file refuses, naming the key',
              reason(HV.read_file, p) == 'pipe' and "values['No']" in message(HV.read_file, p), message(HV.read_file, p))
        p.write_text('{"basename": ', encoding='utf-8')
        check('HV5g an unparsable file refuses', reason(HV.read_file, p) == 'unparsable', reason(HV.read_file, p))
        p.write_text('[]', encoding='utf-8')
        check('HV5h a file that is not an object refuses', reason(HV.read_file, p) == 'file-not-object',
              reason(HV.read_file, p))
        check('HV5i a MISSING file refuses (never read as {})', reason(HV.read_file, Path(td) / 'nope.json') == 'unreadable',
              reason(HV.read_file, Path(td) / 'nope.json'))


attempt('HV5', hv5)

# --------------------------------------------------------------------------------------------
print('HV6 CONTROL: the committed config - its table loads, and CONFIG_PATH is the file sources.py reads')


def hv6():
    import sources                              # stdlib-transitive (its _deps import only edits sys.path)
    cfg = json.loads(HV.CONFIG_PATH.read_text(encoding='utf-8'))
    table = HV.load_table(cfg)
    check('HV6a load_table(committed config) == the raw table (absent -> {})',
          table == cfg.get('heldBlockValues', {}), f'{len(table)} entr(ies)')
    check('HV6b CONFIG_PATH is the file sources.load_config reads',
          HV.CONFIG_PATH.resolve() == (sources.HERE / 'figure-text.config.json').resolve()
          and sources.load_config() == cfg, str(HV.CONFIG_PATH))
    parsed = {b: HV.for_figure(table, b) for b in table}
    check(f'HV6c every committed entry parses ({len(parsed)} figure(s); vacuous while 0)',
          all(parsed[b] for b in parsed), repr(sorted(parsed)))


attempt('HV6', hv6)

# --------------------------------------------------------------------------------------------
print('HV7 heldvalues imports nothing from this experiment - no _deps')


def hv7():
    local = sorted(m for m in _NEW if m != 'heldvalues'
                   and str(getattr(sys.modules.get(m), '__file__', None) or '').startswith(str(HERE)))
    check('HV7 importing heldvalues loaded no experiment module (_deps included)', local == [] and '_deps' not in _NEW,
          repr(local))


attempt('HV7', hv7)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
