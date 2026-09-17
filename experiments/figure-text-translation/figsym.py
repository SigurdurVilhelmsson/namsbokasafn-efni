#!/usr/bin/env python3
"""§C140 ⑥a — the STIX font the composer draws kept STIX symbols in. One owner for all of it.

[USER] 2026-09-16 (campaign register ⏩ RESUME): accept subsetting STIX 1.1.0 into composed SVGs meeting the strict
licence readings — a family name containing neither "STIX" nor "TM Math", the copyright and trademark notices kept, OFL
licensing information in each SVG. Evidence: evidence/2026-09-16-stix-licence/, evidence/2026-09-17-c6-explore/.

- The font file is the OFFICIAL STIXGeneral-Regular.otf 1.1.0, never extracted from a PDF and NEVER COMMITTED. It is read
  from $FIGTEXT_STIX_FONT, else ~/.cache/namsbokasafn-figtext/stix-1.1.0/STIXGeneral-Regular.otf, and REFUSED unless its
  sha256 matches: a figure that needs it then fails loudly instead of silently drawing Liberation. Where to get it:
  FONT_SOURCE_URL (the STIX 1.1.0 archive in the official stipub/stixfonts repository); both refusals name it.
- The bytes are read ONCE and hashed; every later use reads a font parsed from those verified bytes (`covers` and
  `metadata_element` the cached one, `subset_woff2` a fresh parse) - never the path again, so switching
  $FIGTEXT_STIX_FONT after a `load()` cannot reach an unhashed file.
- The subset is renamed FigSym in every record a font is named by (name IDs 1-6, 16, 17, 21, 22 and the CFF names), and
  keeps name IDs 0 (copyright) and 7 (trademark) and the CFF Notice verbatim. `name_violations` is the check, run on every
  subset before it is returned.
- The licence text is the release's own licence document as text, committed in fonts/ and hash-checked. It goes into a
  <metadata> element, escaped — NEVER an XML comment: it contains "--", which is illegal inside a comment, and an ill-formed
  SVG does not render in <img> at all.
"""
import hashlib, io, os, re
from pathlib import Path
import _deps  # noqa: F401

HERE = Path(__file__).resolve().parent
FAMILY = 'FigSym'
FONT_SHA256 = '5add3f3f2bd7fd897d2fa5ccbe468607c52111dc44cdfaaf2d851a574f5357a7'
FONT_SOURCE_URL = ('https://raw.githubusercontent.com/stipub/stixfonts/master/archive/STIXv1.1.0/Fonts/STIX-General/'
                   'STIXGeneral-Regular.otf')
LICENCE_FILE = HERE / 'fonts' / 'STIX-1.1.0-LICENSE.txt'
LICENCE_SHA256 = '69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3'
DEFAULT_PATH = Path.home() / '.cache' / 'namsbokasafn-figtext' / 'stix-1.1.0' / 'STIXGeneral-Regular.otf'
ELIGIBLE_BASE = 'STIXGeneral-Regular'
NAMED_IDS = (1, 2, 3, 4, 5, 6, 16, 17, 21, 22)
FORBIDDEN = re.compile(r'stix|fonts|tm|math', re.I)
RENAMED = {1: 'FigSym', 3: 'FigSym-Regular:1.1.0-subset', 4: 'FigSym Regular', 6: 'FigSym-Regular',
           16: 'FigSym', 17: 'Regular', 21: 'FigSym', 22: 'Regular'}
_PREFIX = re.compile(r'^/?(?:[A-Z]{6}\+)?')
# Characters XML 1.0's Char production forbids everywhere (not just in comments): C0 controls
# other than tab/newline/CR, U+FFFE, U+FFFF, and unpaired surrogates. See metadata_element().
_XML_ILLEGAL = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff\ud800-\udfff]')
_font = None
_font_bytes = None   # the VERIFIED bytes `_font` was parsed from; `subset_woff2` re-parses these, never the path


class FontUnavailable(Exception):
    """The official STIX file is missing or is not the pinned one. RAISED, never worked around."""


def _reset():
    """Forget the loaded font (tests switch $FIGTEXT_STIX_FONT)."""
    global _font, _font_bytes
    _font = None
    _font_bytes = None


def font_path():
    return Path(os.environ['FIGTEXT_STIX_FONT']) if os.environ.get('FIGTEXT_STIX_FONT') else DEFAULT_PATH


def load():
    global _font, _font_bytes
    if _font is None:
        from fontTools.ttLib import TTFont
        p = font_path()
        if not p.is_file():
            raise FontUnavailable(f'STIX 1.1.0 font not found at {p} (download {FONT_SOURCE_URL} there, or set '
                                  f'FIGTEXT_STIX_FONT to where it is; see figsym.py)')
        data = p.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != FONT_SHA256:
            raise FontUnavailable(f'{p} sha256 {digest} is not the pinned STIX 1.1.0 file {FONT_SHA256} '
                                  f'(the official file is {FONT_SOURCE_URL})')
        # Parsed from the hashed bytes, not the path: TTFont(path) keeps the file open and reads tables lazily, so
        # the font in use could otherwise differ from the one that was hashed.
        _font = TTFont(io.BytesIO(data))
        _font_bytes = data
    return _font


def eligible_base(base):
    """True only for STIXGeneral-Regular, with or without a leading '/' and a six-letter subset prefix."""
    return _PREFIX.sub('', base or '') == ELIGIBLE_BASE


def covers(text):
    cmap = load().getBestCmap()
    return all(ord(c) in cmap for c in text)


def name_violations(font):
    """Every place a font is named that contains a reserved name or word. [] is clean."""
    out = []
    for rec in font['name'].names:
        if rec.nameID in NAMED_IDS and FORBIDDEN.search(rec.toUnicode()):
            out.append(f'name ID {rec.nameID} ({rec.platformID},{rec.platEncID},{rec.langID}): {rec.toUnicode()}')
    if 'CFF ' in font:
        cff = font['CFF '].cff
        top = cff.topDictIndex[0]
        for label, value in (('CFF fontNames', ' '.join(cff.fontNames)), ('CFF FullName', getattr(top, 'FullName', '')),
                             ('CFF FamilyName', getattr(top, 'FamilyName', ''))):
            if value and FORBIDDEN.search(value):
                out.append(f'{label}: {value}')
    return out


def subset_woff2(chars):
    """A FigSym subset of the official font holding `chars`, as woff2 bytes. Refuses to return a subset that still names
    a reserved name or word."""
    from fontTools import subset as fsubset
    from fontTools.ttLib import TTFont
    load()                                   # hash check first (once per process; see load())
    # A FRESH parse of the verified bytes on every call: `sub.subset(font)` mutates the font in place, so subsetting
    # the cached `_font` would corrupt `covers()` for the rest of the process - and re-opening `font_path()` here
    # would read a file that was never hashed if $FIGTEXT_STIX_FONT changed after load().
    font = TTFont(io.BytesIO(_font_bytes))
    opt = fsubset.Options()
    opt.layout_features = ['*']
    opt.desubroutinize = True
    opt.drop_tables += ['DSIG']
    opt.notdef_outline = True
    opt.name_IDs = [0, 1, 2, 3, 4, 5, 6, 7, 13, 14]
    opt.name_languages = ['*']
    opt.name_legacy = True
    sub = fsubset.Subsetter(options=opt)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    for rec in font['name'].names:
        if rec.nameID in RENAMED:
            rec.string = RENAMED[rec.nameID]
    cff = font['CFF '].cff
    cff.fontNames = ['FigSym-Regular']
    top = cff.topDictIndex[0]
    top.FullName = 'FigSym Regular'
    top.FamilyName = 'FigSym'
    left = name_violations(font)
    if left:
        raise FontUnavailable(f'renamed subset still names a reserved name or word: {left}')
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def _esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def metadata_element():
    """The licensing information for an SVG that embeds a FigSym subset: an escaped <metadata> element."""
    lic = LICENCE_FILE.read_bytes()
    digest = hashlib.sha256(lic).hexdigest()
    if digest != LICENCE_SHA256:
        raise FontUnavailable(f'{LICENCE_FILE} sha256 {digest} is not the pinned licence text {LICENCE_SHA256}')
    name = load()['name']
    # `pdftotext -layout` (no -nopgbrk) wrote U+000C page-break markers between pages of the
    # source PDF. A page break is layout, not licence content, and the committed file keeps the
    # extraction's bytes verbatim (do not re-extract or edit it) — so the normalization happens
    # only here, building the in-memory <metadata> body. XML 1.0 forbids U+000C in text content
    # in any form (literal, entity, numeric character reference, or CDATA; verified against
    # expat), so it is replaced with a newline rather than dropped, keeping a visible seam.
    lic_text = lic.decode('utf-8').replace('\f', '\n')
    body = (f"Font: {FAMILY} is a subset of STIXGeneral-Regular from STIX Fonts 1.1.0, renamed as its licence requires.\n"
            f"Copyright notice: {name.getDebugName(0)}\n"
            f"Trademark notice: {name.getDebugName(7)}\n"
            f"The font software is licensed under the SIL Open Font License, Version 1.1. Its licence follows.\n\n"
            f"{lic_text}")
    bad = _XML_ILLEGAL.search(body)
    if bad:
        raise FontUnavailable(f'metadata body contains {bad.group(0)!r} (U+{ord(bad.group(0)):04X}), which XML 1.0 forbids')
    return f'<metadata>{_esc(body)}</metadata>'
