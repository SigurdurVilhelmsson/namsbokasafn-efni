#!/usr/bin/env python3
"""Subset a font and rename it so that it names no Reserved Font Name: the ONE implementation both embedded faces use.

- FigSym (figsym.py, §C140 ⑥a): STIX 1.1.0, CFF.
- FigIS (figis.py, §C140 ㉗): Liberation Sans 2.1.5, TrueType.

Both follow the strict reading of the SIL Open Font License that [USER] ruled on 2026-09-16 (STIX) and 2026-09-26 (ruling
4a, Liberation): no Reserved Font Name, nor an individual word of one, anywhere a font is named (name IDs 1-6, 16, 17, 21,
22 and, for CFF, the font names), while the copyright (0), trademark (7) and licence (13, 14) records are kept verbatim.

One implementation, so a fix to the options or the rename reaches both faces. This file computes no hash: integrity
checks of the font files and licence texts belong to their owners (figsym.py, figis.py), and
tools/__tests__/figure-text-sidecar.test.js pins exactly which files may hash.
"""
import io

import _deps  # noqa: F401

# The name records a subset keeps. 0 copyright, 1-6 names, 7 trademark, 13-14 licence description and URL.
KEEP_NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 13, 14]
# The records a font is NAMED by, which may not carry a reserved name or word.
NAMED_IDS = (1, 2, 3, 4, 5, 6, 16, 17, 21, 22)


def name_violations(font, forbidden):
    """Every place `font` is named that contains a match of `forbidden` (a compiled regex). [] is clean."""
    out = []
    for rec in font['name'].names:
        if rec.nameID in NAMED_IDS and forbidden.search(rec.toUnicode()):
            out.append(f'name ID {rec.nameID} ({rec.platformID},{rec.platEncID},{rec.langID}): {rec.toUnicode()}')
    if 'CFF ' in font:
        cff = font['CFF '].cff
        top = cff.topDictIndex[0]
        for label, value in (('CFF fontNames', ' '.join(cff.fontNames)), ('CFF FullName', getattr(top, 'FullName', '')),
                             ('CFF FamilyName', getattr(top, 'FamilyName', ''))):
            if value and forbidden.search(value):
                out.append(f'{label}: {value}')
    return out


def subset_renamed(font_bytes, chars, *, renamed, forbidden, error, cff_names=None):
    """A subset of the font in `font_bytes` holding `chars`, renamed, as woff2 bytes.

    `renamed` maps a name ID to its new string on every platform; `cff_names` (CFF fonts only) is
    (fontName, FullName, FamilyName). Raises `error` rather than return a subset that still names a reserved name or
    word. The font is parsed FRESH from `font_bytes` on every call: `Subsetter.subset` mutates the font in place.
    recalcTimestamp=False: the save time must never reach the output bytes (§C159 - a byte that moves with the clock
    turns every recompose into a spurious media/ diff).
    """
    from fontTools import subset as fsubset
    from fontTools.ttLib import TTFont
    font = TTFont(io.BytesIO(font_bytes), recalcTimestamp=False)
    opt = fsubset.Options()
    opt.layout_features = ['*']
    opt.desubroutinize = True
    opt.drop_tables += ['DSIG']
    opt.notdef_outline = True
    opt.name_IDs = list(KEEP_NAME_IDS)
    opt.name_languages = ['*']
    opt.name_legacy = True
    sub = fsubset.Subsetter(options=opt)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    for rec in font['name'].names:
        if rec.nameID in renamed:
            rec.string = renamed[rec.nameID]
    if cff_names is not None:
        cff = font['CFF '].cff
        cff.fontNames = [cff_names[0]]
        top = cff.topDictIndex[0]
        top.FullName = cff_names[1]
        top.FamilyName = cff_names[2]
    left = name_violations(font, forbidden)
    if left:
        raise error(f'renamed subset still names a reserved name or word: {left}')
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()
