"""The one owner of the glyph-name repair table for fonts every reader misreads (§C140 ⑦).

A Mathematical Pi font in some EPS sources names its glyphs with the foundry's own H-numbers
(`H11034`) and carries no ToUnicode map. pdfminer cannot map such a name, keeps the base
encoding's character for the code, and so reads `°` as `8`; poppler and PDFium agree, so no
reader swap fixes it. `readlayer` repairs a character only through this table.

🔴 AN ENTRY IS ADDED ONLY WITH A RASTER THAT SHOWS THE TRUE CHARACTER. A guessed entry turns a
visible, named hold into a silent wrong character. Evidence for the three below, 200-dpi crops:
`evidence/2026-09-16-c7-explore/crops/mpi_crops.png` (PentIso `36 °C`, Amontons2 `−100`,
the Color Contrast Modified Blackbody `λ maximum`).
"""

GLYPH_REPAIRS = {
    'H11034': '°',   # DEGREE SIGN — CNX_Chem_10_01_PentIso, code 56 read as '8'
    'H11002': '−',   # MINUS SIGN — CNX_Chem_09_02_Amontons2, code 50 read as '2'
    'H9261': 'λ',    # GREEK SMALL LETTER LAMDA — CNX_Chem2e_06_01_Blackbody, code 108 read as 'l'
}
