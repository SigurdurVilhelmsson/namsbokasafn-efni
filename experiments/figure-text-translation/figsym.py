#!/usr/bin/env python3
"""§C140 ⑥a — the STIX font the composer draws kept STIX symbols in. One owner for all of it.

[USER] 2026-09-16 (campaign register ⏩ RESUME): accept subsetting STIX 1.1.0 into composed SVGs meeting the strict
licence readings — a family name containing neither "STIX" nor "TM Math", the copyright and trademark notices kept, OFL
licensing information in each SVG. Evidence: evidence/2026-09-16-stix-licence/, evidence/2026-09-17-c6-explore/.

- The font files are the OFFICIAL STIXGeneral-Regular.otf, and STIXGeneral-Italic.otf, -Bold.otf and -BoldItalic.otf,
  from STIX Fonts 1.1.0, never extracted from a PDF and NEVER COMMITTED. ([USER] R-12, 2026-10-05, extended the
  2026-09-16 acceptance to the three further faces, under the same strict OFL reading and the same FigSym subset.)
- ONE locator: Regular is read from $FIGTEXT_STIX_FONT, else ~/.cache/namsbokasafn-figtext/stix-1.1.0/STIXGeneral-Regular.otf;
  the three further faces are its SIBLINGS - the same directory, each under its own official file name (`face_path`).
  Every file is REFUSED unless its sha256 matches its pin in FACES: a figure that needs it then fails loudly instead of
  silently drawing Liberation. Where to get each: its own URL in FACES (the STIX 1.1.0 archive directory in the official
  stipub/stixfonts repository; Regular's is FONT_SOURCE_URL); both refusals - missing and wrong hash - name it. The one
  read-and-verify step is `_read_pinned`, shared by `load()` and `load_face()`.
- The bytes are read ONCE and hashed; every later use reads a font parsed from those verified bytes (`covers` and
  `metadata_element` the cached one, `subset_woff2` a fresh parse; per face, `load_face`'s cache) - never the path again,
  so switching $FIGTEXT_STIX_FONT after a load cannot reach an unhashed file.
- Which face a source run may be drawn in is `verified_face`: Regular by name alone (⑥a), the three further faces only
  from a Type 1 (CFF) font object - the kind §C140 ㉞ compared outline for outline with the official files.
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
import fontsubset

HERE = Path(__file__).resolve().parent
FAMILY = 'FigSym'
FONT_SHA256 = '5add3f3f2bd7fd897d2fa5ccbe468607c52111dc44cdfaaf2d851a574f5357a7'
FONT_SOURCE_DIR = 'https://raw.githubusercontent.com/stipub/stixfonts/master/archive/STIXv1.1.0/Fonts/STIX-General/'
FONT_SOURCE_URL = FONT_SOURCE_DIR + 'STIXGeneral-Regular.otf'
LICENCE_FILE = HERE / 'fonts' / 'STIX-1.1.0-LICENSE.txt'
LICENCE_SHA256 = '69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3'
DEFAULT_PATH = Path.home() / '.cache' / 'namsbokasafn-figtext' / 'stix-1.1.0' / 'STIXGeneral-Regular.otf'
# §C140 '6' M6: every face of STIX 1.1.0 General, keyed (bold, italic) like figis.FACES ->
# (official file name, subfamily, pinned sha256, where the official file is). Regular keeps FONT_SHA256 and FONT_SOURCE_URL.
FACES = {(False, False): ('STIXGeneral-Regular.otf', 'Regular', FONT_SHA256, FONT_SOURCE_URL),
         (False, True): ('STIXGeneral-Italic.otf', 'Italic', '7f6bf9cab728febe4ce111bbfbcd16253806dcab0bbe1940ede2782cfc319a72',
                         FONT_SOURCE_DIR + 'STIXGeneral-Italic.otf'),
         (True, False): ('STIXGeneral-Bold.otf', 'Bold', '7e4dfb4979e9bb79a0bdedc56f055eab615fb9a3dff8788a52992ae65e8f572d',
                         FONT_SOURCE_DIR + 'STIXGeneral-Bold.otf'),
         (True, True): ('STIXGeneral-BoldItalic.otf', 'BoldItalic', '4585fcdd3aa1a6f3451c03d4f587134b9fc8a0835380ffec25f3105908ddf31a',
                        FONT_SOURCE_DIR + 'STIXGeneral-BoldItalic.otf')}
_FACES_LOADED = {}
ELIGIBLE_BASE = 'STIXGeneral-Regular'
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
    """Forget every loaded face and the advances measured with them (tests switch $FIGTEXT_STIX_FONT)."""
    global _font, _font_bytes
    _font = None
    _font_bytes = None
    _FACES_LOADED.clear()
    _ADV.clear()


def font_path():
    return Path(os.environ['FIGTEXT_STIX_FONT']) if os.environ.get('FIGTEXT_STIX_FONT') else DEFAULT_PATH


def _read_pinned(p, sha, url, what, hint):
    """The bytes of `p`, REFUSED (FontUnavailable) unless the file exists and its sha256 is `sha`. THE one place a STIX
    font file is read and verified - `load()` and `load_face()` both call it - so both refusals name where the
    official file comes from (`url`) for every face alike."""
    if not p.is_file():
        raise FontUnavailable(f'{what} not found at {p} (download {url} there, or {hint}; see figsym.py)')
    data = p.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != sha:
        raise FontUnavailable(f'{p} sha256 {digest} is not the pinned {what.replace(" font", " file")} {sha} '
                              f'(the official file is {url})')
    return data


def load():
    global _font, _font_bytes
    if _font is None:
        from fontTools.ttLib import TTFont
        data = _read_pinned(font_path(), FONT_SHA256, FONT_SOURCE_URL, 'STIX 1.1.0 font',
                            'set FIGTEXT_STIX_FONT to where it is')
        # Parsed from the hashed bytes, not the path: TTFont(path) keeps the file open and reads tables lazily, so
        # the font in use could otherwise differ from the one that was hashed.
        _font = TTFont(io.BytesIO(data))
        _font_bytes = data
    return _font


def face_path(face):
    """Where face `face` = (bold, italic) is read from: Regular is `font_path()` itself; the three further faces are
    its SIBLINGS, each under its own official file name. ONE locator ($FIGTEXT_STIX_FONT, else the default directory)
    for all four - no second variable."""
    if face == (False, False):
        return font_path()
    return font_path().parent / FACES[face][0]


def load_face(face):
    """(TTFont, verified bytes) of STIX 1.1.0 General face `face` = (bold, italic), hash-pinned (`_read_pinned`).
    Regular IS `load()`; each further face is read and verified once, then served from the cache."""
    if face == (False, False):
        return load(), _font_bytes
    if face not in _FACES_LOADED:
        from fontTools.ttLib import TTFont
        name, _, sha, url = FACES[face]
        data = _read_pinned(face_path(face), sha, url, f'STIX 1.1.0 face {name}',
                            'put it beside the Regular file $FIGTEXT_STIX_FONT names, or in the default directory')
        _FACES_LOADED[face] = (TTFont(io.BytesIO(data)), data)
    return _FACES_LOADED[face]


_GENERAL = re.compile(r'^STIXGeneral-(Regular|Italic|Bold|BoldItalic)$')
_FACE_OF = {'Regular': (False, False), 'Italic': (False, True), 'Bold': (True, False), 'BoldItalic': (True, True)}


def eligible_face(base):
    """(bold, italic) when `base` (prefix stripped as eligible_base does) is a STIX 1.1.0 General face, else None."""
    m = _GENERAL.match(_PREFIX.sub('', base or ''))
    return _FACE_OF[m.group(1)] if m else None


def verified_face(run, fonts):
    """M6 (v4): the STIX 1.1.0 General face (bold, italic) a source RUN may be drawn in, or None.

    Regular keeps ⑥a's name-only rule unchanged. Italic, Bold and BoldItalic also require the run's
    font object to be Type 1 (CFF): §C140 ㉞ compared every such object in the corpus (PDF, and EPS
    through gs staging, with Regular as the gs-path control) with the official 1.1.0 files and all
    matched; the TrueType / CID TrueType objects (HeatMeas, HeatTrans2, Blackbody) could not be
    compared, so their runs stay FigIS, as under composer '5'."""
    entry = fonts.get(run['font'], {})
    face = eligible_face(entry.get('base', ''))
    if face is None or face == (False, False):
        return face
    return face if entry.get('subtype') == '/Type1' else None


def covers_face(text, face):
    """`covers` for any of the four faces: every character of `text` is in that face's official cmap."""
    cmap = load_face(face)[0].getBestCmap()
    return all(ord(c) in cmap for c in text)


_ADV = {}


def advance(text, face, size):
    """LINEAR advance of `text` in STIX face `face` at `size` pt: hmtx, unkerned (as compose.lin_advance's
    contract requires - drawn with font-kerning:none)."""
    k = (text, face)
    if k not in _ADV:
        f = load_face(face)[0]
        cmap, hmtx, upm = f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm
        _ADV[k] = sum(hmtx[cmap[ord(c)]][0] for c in text) / upm
    return _ADV[k] * size


def subset_woff2_face(chars, face):
    """`subset_woff2` for any of the four faces: a renamed FigSym subset of the face's VERIFIED bytes (`load_face`),
    its subfamily (name ID 2, 17, 22) the face's own, checked by `name_violations` like Regular's."""
    if face == (False, False):
        return subset_woff2(chars)
    _, data = load_face(face)
    sub = FACES[face][1]
    renamed = {1: 'FigSym', 3: f'FigSym-{sub}:1.1.0-subset', 4: f'FigSym {sub}', 6: f'FigSym-{sub}',
               16: 'FigSym', 17: sub, 21: 'FigSym', 22: sub, 2: {'BoldItalic': 'Bold Italic'}.get(sub, sub)}
    return fontsubset.subset_renamed(data, chars, renamed=renamed, forbidden=FORBIDDEN, error=FontUnavailable,
                                     cff_names=(f'FigSym-{sub}', f'FigSym {sub}', 'FigSym'))


def eligible_base(base):
    """True only for STIXGeneral-Regular, with or without a leading '/' and a six-letter subset prefix."""
    return _PREFIX.sub('', base or '') == ELIGIBLE_BASE


def covers(text):
    cmap = load().getBestCmap()
    return all(ord(c) in cmap for c in text)


def name_violations(font):
    """Every place a font is named that contains a reserved name or word. [] is clean."""
    return fontsubset.name_violations(font, FORBIDDEN)


def subset_woff2(chars):
    """A FigSym subset of the official font holding `chars`, as woff2 bytes. Refuses to return a subset that still names
    a reserved name or word. The subsetting, renaming and check are fontsubset.subset_renamed, shared with FigIS (§C140 ㉗)."""
    load()                                   # hash check first (once per process; see load())
    # A FRESH parse of the VERIFIED bytes on every call (subset_renamed parses what it is given): subsetting the cached
    # `_font` would corrupt `covers()` for the rest of the process - and re-opening `font_path()` here would read a
    # file that was never hashed if $FIGTEXT_STIX_FONT changed after load().
    return fontsubset.subset_renamed(_font_bytes, chars, renamed=RENAMED, forbidden=FORBIDDEN, error=FontUnavailable,
                                     cff_names=('FigSym-Regular', 'FigSym Regular', 'FigSym'))


def _esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def metadata_element(faces=((False, False),)):
    """The licensing information for an SVG that embeds a FigSym subset: an escaped <metadata> element. `faces` names
    every (bold, italic) face the SVG embeds, in its @font-face order - ONE element for the family either way. The
    copyright and trademark notices are read from Regular: name IDs 0 and 7 are byte-equal across the four official
    faces (test_figsym.py 6h measures that premise, with a control that the comparison can fail)."""
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
    _nm = {(False, False): 'STIXGeneral-Regular', (False, True): 'STIXGeneral-Italic', (True, False): 'STIXGeneral-Bold',
           (True, True): 'STIXGeneral-BoldItalic'}
    body = (f"Font: {FAMILY} is a subset of {', '.join(_nm[f] for f in faces)} from STIX Fonts 1.1.0, renamed as its licence requires.\n"
            f"Copyright notice: {name.getDebugName(0)}\n"
            f"Trademark notice: {name.getDebugName(7)}\n"
            f"The font software is licensed under the SIL Open Font License, Version 1.1. Its licence follows.\n\n"
            f"{lic_text}")
    bad = _XML_ILLEGAL.search(body)
    if bad:
        raise FontUnavailable(f'metadata body contains {bad.group(0)!r} (U+{ord(bad.group(0)):04X}), which XML 1.0 forbids')
    return f'<metadata>{_esc(body)}</metadata>'
