"""§C140 ㊾ D5(a) - `heldBlockValues`: [USER]'s values for send:false figure labels, read and checked.

STDLIB ONLY, and it imports nothing from this experiment - in particular not `_deps` - so
figure-compose.py (which must stay free of pikepdf / cairo / Pillow) can import it, and compose.py
can too. Design: docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md (D-a,
D-b, D-e). Tests: test_heldvalues.py (HV1-HV8).

THE TABLE (figure-text.config.json `heldBlockValues`)
-----------------------------------------------------
    {"<figure basename>": {"<blocks.json key>": "<value>", ...}, ...}

A value is [USER]'s string, kept BYTE FOR BYTE - it is never re-encoded, normalised or localised.
Its lines are separated by '\\n' (never the key's '|', which a value may not contain at all), and
each line must be non-empty, equal to its own `.strip()`, and hold at least one character that is
not a format, combining or control character (INVISIBLE_CATEGORIES). figure-compose.py reads the
table once, takes THIS figure's entry by EXACT basename (`for_figure`) and hands it to compose.py in
`<out>/held-values.json` (`write_file` / `read_file`).

SCRIPT CHARACTERS ARE FORMATTING INTENT (D-a)
---------------------------------------------
The 24 characters of HELD_SCRIPT_CHARS are never drawn as their own glyphs - the pinned Liberation
faces have no ⁰, ⁻ or ⁺. `parse_value` decodes each to its base character and a KIND, 'sub' or
'sup', and the composer draws the base in the block's OWN source style of that kind:
  lowered  ₀-₉ (U+2080-2089) -> 0-9, ₊ -> '+', ₋ -> U+2013
  raised   ⁰ (U+2070), ¹ ² ³ (U+00B9/B2/B3), ⁴-⁹ (U+2074-2079) -> 0-9, ⁺ -> '+', ⁻ -> U+2013
⁻ and ₋ map to U+2013 EN DASH, never U+2212 (what NFKC gives): both ruled charges are U+2013, and
over the 465 committed sidecars formula dashes are U+2013 x43 and U+2212 x0. Any OTHER character in
U+2070-U+209F refuses (`unsupported-script-char`); every other character, Icelandic letters
included, is drawn as written. ⚠️ figure-config-validate.js holds a SECOND copy of
HELD_SCRIPT_CHARS; both test files pin the same literal.

REASONS - `HeldValueError.reason` is a CONTRACT: compose.py, figure-compose.py and their tests
key on these strings, and the message names the basename and key wherever one is known.
  parse_value   not-a-string, pipe, empty-line, edge-space, invisible-line, unsupported-script-char
  load_table    config-not-object, table-not-object
  for_figure    entry-not-object, entry-empty, key-empty, and parse_value's
  read_file     unreadable, unparsable, file-not-object, missing-field, bad-field, key-empty,
                and parse_value's
"""
import json
import os
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
# The policy config - the SAME file sources.load_config reads (test_heldvalues HV6 pins it).
CONFIG_PATH = HERE / 'figure-text.config.json'
TABLE = 'heldBlockValues'

HELD_SCRIPT_CHARS = '₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻'
EN_DASH = '–'
_SUB_DIGITS, _SUP_DIGITS = HELD_SCRIPT_CHARS[:10], HELD_SCRIPT_CHARS[12:22]
# char -> (the base character drawn, 'sub' | 'sup')
SCRIPT_MAP = {**{c: (str(i), 'sub') for i, c in enumerate(_SUB_DIGITS)}, '₊': ('+', 'sub'), '₋': (EN_DASH, 'sub'),
              **{c: (str(i), 'sup') for i, c in enumerate(_SUP_DIGITS)}, '⁺': ('+', 'sup'), '⁻': (EN_DASH, 'sup')}
# Unicode's Superscripts and Subscripts block: a character here that is not in SCRIPT_MAP is refused.
SCRIPT_BLOCK = (0x2070, 0x209F)
# The general categories that draw NOTHING on their own: format (U+200B, U+00AD, ...), non-spacing and
# enclosing combining marks (U+034F, U+0301, ...) and controls. A value line made only of these refuses
# `invisible-line` (a skeptic's finding, 2026-10-03): the pinned faces' cmap CARRIES 17 Cf, 187 Mn and
# 2 Me code points (2,327 in all, the same set in all four faces), so compose's no-glyph check passes
# them, the line fits, and the label would be erased under a `held` note. Invisible LETTERS (U+3164,
# U+115F) and U+2800 are not in the cmap, so compose refuses those `no-glyph`. ⚠️ figure-config-validate.js
# holds a SECOND copy of this rule, as \p{Cf}\p{Mn}\p{Me}\p{Cc}. Each reads its engine's own Unicode tables
# (measured 2026-10-03: Python 3.14's are 16.0, Node 22's 17.0), so they can disagree on a code point
# assigned in between.
INVISIBLE_CATEGORIES = ('Cf', 'Mn', 'Me', 'Cc')


class HeldValueError(ValueError):
    """A held value, table, entry or hand-off file that cannot be used. `reason` is one of the
    strings in the module docstring; `detail` says where and what."""

    def __init__(self, reason, detail=''):
        self.reason = reason
        self.detail = detail
        super().__init__(f'{reason}: {detail}' if detail else reason)


def _kind(v):
    return 'null' if v is None else type(v).__name__


def parse_value(value):
    """-> the value's lines, each a list of `(char, kind)`: `kind` is None for a character drawn as
    written, else 'sub' or 'sup' with `char` the decoded base ('2', '+', U+2013). Raises
    HeldValueError. The value itself is never altered - callers keep the raw string."""
    if not isinstance(value, str):
        raise HeldValueError('not-a-string', f'a value must be a string, not {_kind(value)}')
    if '|' in value:
        raise HeldValueError('pipe', f"{value!r}: a value's lines are separated by a newline; '|' is the KEY's notation")
    out = []
    for i, line in enumerate(value.split('\n')):
        if line == '':
            raise HeldValueError('empty-line', f'{value!r}: line {i} is empty')
        if line != line.strip():
            raise HeldValueError('edge-space', f'{value!r}: line {i} has leading or trailing whitespace')
        if all(unicodedata.category(c) in INVISIBLE_CATEGORIES for c in line):
            raise HeldValueError('invisible-line', f'{value!r}: line {i} has no visible character - only '
                                                   f'format, combining or control characters, which draw nothing')
        chars = []
        for c in line:
            if c in SCRIPT_MAP:
                chars.append(SCRIPT_MAP[c])
            elif SCRIPT_BLOCK[0] <= ord(c) <= SCRIPT_BLOCK[1]:
                raise HeldValueError('unsupported-script-char',
                                     f'{value!r}: {c} (U+{ord(c):04X}) is not a sub/superscript a held value can draw')
            else:
                chars.append((c, None))
        out.append(chars)
    return out


def load_table(config):
    """-> the config's `heldBlockValues` object as written (entries NOT parsed - `for_figure` parses
    only the entry it is asked for). An ABSENT table is {}; a table that is present but not an
    object (null included) refuses: a table that cannot be read is never read as empty."""
    if not isinstance(config, dict):
        raise HeldValueError('config-not-object', f'the config is {_kind(config)}, not an object')
    if TABLE not in config:
        return {}
    table = config[TABLE]
    if not isinstance(table, dict):
        raise HeldValueError('table-not-object', f'{TABLE} must be an object, not {_kind(table)}')
    return table


def for_figure(table, basename):
    """-> {blockKey: value} for the EXACT basename - no case fold, no prefix - with every value
    checked by `parse_value` and returned byte for byte. {} when the figure has no entry. Only this
    entry is read, so a malformed entry for another figure never breaks this one (the validator
    catches it in CI). Raises HeldValueError naming `heldBlockValues.<basename>[<key>]`."""
    if basename not in table:
        return {}
    entry = table[basename]
    where = f'{TABLE}.{basename}'
    if not isinstance(entry, dict):
        raise HeldValueError('entry-not-object', f'{where} must be an object of {{blockKey: value}}, not {_kind(entry)}')
    if not entry:
        raise HeldValueError('entry-empty', f'{where} must be a non-empty object of {{blockKey: value}}')
    out = {}
    for key, value in entry.items():
        if not isinstance(key, str) or key == '':
            raise HeldValueError('key-empty', f'{where}: a block key must be a non-empty string')
        try:
            parse_value(value)
        except HeldValueError as e:
            raise HeldValueError(e.reason, f'{where}[{key!r}]: {e.detail}') from None
        out[key] = value
    return out


def write_file(path, basename, config_path, values):
    """Write the hand-off file `{basename, configPath, values}` (values may be {}), atomically: a
    `.tmp` beside it, then a rename."""
    path = Path(path)
    doc = {'basename': basename, 'configPath': str(config_path), 'values': dict(values)}
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def read_file(path):
    """-> {'basename': str, 'configPath': str, 'values': {blockKey: value}}, every value re-checked
    by `parse_value`. Raises HeldValueError on a missing or unreadable file, invalid JSON, a missing
    or wrong-typed field, or a malformed value - never returns {} for a file it could not use."""
    try:
        raw = Path(path).read_bytes()
    except OSError as e:
        raise HeldValueError('unreadable', f'{path}: {e.strerror or e}') from None
    try:
        doc = json.loads(raw.decode('utf-8'))
    except ValueError as e:                     # JSONDecodeError and UnicodeDecodeError
        raise HeldValueError('unparsable', f'{path}: {e}') from None
    if not isinstance(doc, dict):
        raise HeldValueError('file-not-object', f'{path}: {_kind(doc)}, not an object')
    for field in ('basename', 'configPath', 'values'):
        if field not in doc:
            raise HeldValueError('missing-field', f'{path}: no {field!r}')
    if not isinstance(doc['basename'], str) or not doc['basename']:
        raise HeldValueError('bad-field', f'{path}: basename must be a non-empty string')
    if not isinstance(doc['configPath'], str):
        raise HeldValueError('bad-field', f'{path}: configPath must be a string')
    if not isinstance(doc['values'], dict):
        raise HeldValueError('bad-field', f'{path}: values must be an object')
    for key, value in doc['values'].items():
        if key == '':
            raise HeldValueError('key-empty', f'{path}: a block key must be a non-empty string')
        try:
            parse_value(value)
        except HeldValueError as e:
            raise HeldValueError(e.reason, f'{path} values[{key!r}]: {e.detail}') from None
    return {'basename': doc['basename'], 'configPath': doc['configPath'], 'values': dict(doc['values'])}
