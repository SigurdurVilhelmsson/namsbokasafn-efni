#!/usr/bin/env python3
"""§C140 ㉗ — the Liberation Sans faces the composer draws figure text in (family FigIS). One owner for all of it.

[USER] 2026-09-26, ruling 4a (docs/decisions/2026-09-26-pre-editor-pivot-translation-rulings.md): the strict font-licence
reading, consistent with the 2026-09-16 STIX ruling (figsym.py) — remove "Liberation" from the FigIS subset's internal
names and add the copyright and OFL notice. Liberation Sans 2.1.5 is licensed under the SIL OFL 1.1 with TWO sets of
Reserved Font Names: "Liberation" (Red Hat) and "Arimo, Tinos and Cousine" (Google).

- THE FACES ARE THE FILES CAIRO MEASURES WITH. compose.py lays text out through cairo's toy API, which asks fontconfig
  for "Liberation Sans"; svgout.write_svg embeds a subset of the files named here. So each face is refused unless
  (a) its sha256 is the pinned one AND (b) fontconfig resolves cairo's request for that weight and slant to exactly
  this file. Otherwise a box could measure every label with one font and embed another, or embed a font the licence
  text below does not describe. Both refusals are FontUnavailable, raised and never worked around.
- The pinned files are Ubuntu 26.04's fonts-liberation 1:2.1.5-3build1. They are NOT byte-identical to the upstream
  2.1.5 TTF release: Debian builds them from the release's sources. Measured 2026-09-29 (evidence/2026-09-29-c27-c14/):
  every name record and every advance width is identical, and exactly one glyph outline differs (U+25D5 ◕, Regular
  and Italic), so the licence and every notice are upstream's.
- The directory is $FIGTEXT_LIBERATION_DIR, else /usr/share/fonts/truetype/liberation. The override exists for tests;
  on a real box it only ever REFUSES (fontconfig does not resolve to it), which is the point.
- The subset is renamed FigIS in every record a font is named by and keeps IDs 0 (copyright), 7 (trademark), 13 and 14
  (licence description and URL) verbatim — fontsubset.subset_renamed, shared with FigSym.
- The licence text is the 2.1.5 release's own LICENSE, committed in fonts/ and hash-checked. Release:
  https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5, asset liberation-fonts-ttf-2.1.5.tar.gz
  (sha256 7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0). It goes into a <metadata> element, escaped.
"""
import hashlib, io, os, re, shutil, subprocess
from pathlib import Path
import _deps  # noqa: F401
import fontsubset

HERE = Path(__file__).resolve().parent
FAMILY = 'FigIS'
VERSION = 'Version 2.1.5'
DEFAULT_DIR = Path('/usr/share/fonts/truetype/liberation')
# (bold, italic) -> (file, subfamily, sha256 of Ubuntu 26.04's fonts-liberation 1:2.1.5-3build1 file)
FACES = {
    (False, False): ('LiberationSans-Regular.ttf', 'Regular',
                     '075e71be4c58beda172ecb574a799308f04c3d054c6a5b7434954d3b0f1b28d8'),
    (True, False): ('LiberationSans-Bold.ttf', 'Bold',
                    'b72c65e551d653b54217ffad0d1454ce0657e4e8d4a28bcc79e0acd2598f4bf3'),
    (False, True): ('LiberationSans-Italic.ttf', 'Italic',
                    '4ccb79043bd3a6d131b5a53901abb21261b1417f6052b38a9fa9716a4e5a3d81'),
    (True, True): ('LiberationSans-BoldItalic.ttf', 'Bold Italic',
                   '64263238517af60213cdb469165fc7e9acd0c09c35f4155f924a379f97125a57'),
}
# What cairo's toy API asks fontconfig for (cairo-ft: NORMAL -> FC_WEIGHT_MEDIUM 100, BOLD -> FC_WEIGHT_BOLD 200,
# NORMAL slant -> FC_SLANT_ROMAN 0, ITALIC -> FC_SLANT_ITALIC 100). compose.py's family is 'Liberation Sans'.
FC_PATTERN = {(bold, italic): f"Liberation Sans:weight={200 if bold else 100}:slant={100 if italic else 0}"
              for bold, italic in FACES}
FORBIDDEN = re.compile(r'liberation|arimo|tinos|cousine', re.I)
LICENCE_FILE = HERE / 'fonts' / 'Liberation-2.1.5-LICENSE.txt'
LICENCE_SHA256 = '93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b'
_XML_ILLEGAL = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f￾￿\ud800-\udfff]')
_bytes = {}   # key -> the VERIFIED bytes; every later use parses these, never the path again
_fonts = {}


class FontUnavailable(Exception):
    """A Liberation face is missing, is not the pinned file, or is not the file cairo measures with. RAISED."""


def _reset():
    """Forget the loaded faces (tests switch $FIGTEXT_LIBERATION_DIR)."""
    _bytes.clear()
    _fonts.clear()


def face_dir():
    return Path(os.environ['FIGTEXT_LIBERATION_DIR']) if os.environ.get('FIGTEXT_LIBERATION_DIR') else DEFAULT_DIR


def face_path(key):
    return face_dir() / FACES[key][0]


def _fontconfig_file(key):
    exe = shutil.which('fc-match')
    if exe is None:
        raise FontUnavailable('fc-match is not installed, so the file cairo measures "Liberation Sans" with cannot be '
                              'checked against the file svgout embeds (install fontconfig)')
    out = subprocess.run([exe, '-f', '%{file}', FC_PATTERN[key]], capture_output=True, text=True, check=False)
    return out.stdout.strip()


def _verified(key):
    if key not in _bytes:
        p = face_path(key)
        if not p.is_file():
            raise FontUnavailable(f'Liberation Sans face not found at {p} (the composer needs fonts-liberation 2.1.5; '
                                  f'see figis.py)')
        data = p.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != FACES[key][2]:
            raise FontUnavailable(f'{p} sha256 {digest} is not the pinned Liberation Sans 2.1.5 {FACES[key][1]} file '
                                  f'{FACES[key][2]} (re-verify a new build\'s name records and metrics before re-pinning; '
                                  f'see figis.py)')
        resolved = _fontconfig_file(key)
        if not resolved or Path(resolved).resolve() != p.resolve():
            raise FontUnavailable(f'fontconfig resolves "{FC_PATTERN[key]}" to {resolved or "nothing"}, not {p}: cairo '
                                  f'would measure the labels with a different file from the one embedded')
        _bytes[key] = data
    return _bytes[key]


def load(key):
    """The verified face as a TTFont, parsed from the hashed bytes (never the path)."""
    if key not in _fonts:
        from fontTools.ttLib import TTFont
        _fonts[key] = TTFont(io.BytesIO(_verified(key)))
    return _fonts[key]


def _renamed(key):
    """The new name records of face `key`. They mirror Liberation's own shape (its Regular face's full name is
    'Liberation Sans' and its PostScript name 'LiberationSans', with no style suffix); ID 2, the subfamily, is kept."""
    style = FACES[key][1]
    regular = key == (False, False)
    compact = style.replace(' ', '')
    return {1: FAMILY, 3: f'{FAMILY}-{compact}:2.1.5-subset', 4: FAMILY if regular else f'{FAMILY} {style}',
            6: FAMILY if regular else f'{FAMILY}-{compact}', 16: FAMILY, 17: style, 21: FAMILY, 22: style}


def subset_woff2(key, chars):
    """A FigIS subset of face `key` holding `chars`, as woff2 bytes, named by no Reserved Font Name."""
    return fontsubset.subset_renamed(_verified(key), chars, renamed=_renamed(key), forbidden=FORBIDDEN,
                                     error=FontUnavailable)


def _esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def metadata_element(keys):
    """The licensing information for an SVG embedding the FigIS faces `keys`: an escaped <metadata> element naming each
    face and carrying its own copyright and trademark notices verbatim, then the pinned licence text."""
    lic = LICENCE_FILE.read_bytes()
    digest = hashlib.sha256(lic).hexdigest()
    if digest != LICENCE_SHA256:
        raise FontUnavailable(f'{LICENCE_FILE} sha256 {digest} is not the pinned licence text {LICENCE_SHA256}')
    keys = [k for k in FACES if k in set(keys)]
    lines = [f"Font: {FAMILY} is a subset of Liberation Sans 2.1.5 ({', '.join(FACES[k][1] for k in keys)}), renamed "
             f"as its licence requires."]
    for k in keys:
        name = load(k)['name']
        lines.append(f"Copyright notice ({FACES[k][1]}): {name.getDebugName(0)}")
        lines.append(f"Trademark notice ({FACES[k][1]}): {name.getDebugName(7)}")
    lines.append("The font software is licensed under the SIL Open Font License, Version 1.1. Its licence follows.")
    body = '\n'.join(lines) + '\n\n' + lic.decode('utf-8')
    bad = _XML_ILLEGAL.search(body)
    if bad:
        raise FontUnavailable(f'metadata body contains U+{ord(bad.group(0)):04X}, which XML 1.0 forbids')
    return f'<metadata>{_esc(body)}</metadata>'
