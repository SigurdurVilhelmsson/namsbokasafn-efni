# §C140 ㉟ — predictions, written BEFORE the render (2026-09-17)
P1 gate: differ 0/26 (faithful 03), 0/28 (mt-preview 03), 0/21 (mt-preview 04); notInMedia still all identical to 01-source.
P2 pages: faithful/03 same 7 · mt-preview/04 same 11 · mt-preview/03 10 pages, ONE rename:
   3-2-akvordun-reynslu-og-sameindaformula.html -> 3-2-akvordun-reynsluformula-og-sameindaformula.html (m68702; §C133 re-MT title)
P3 slug-map.mt-preview.json: 5 rows; the ch03 row REVERSES to reynslu-og -> reynsluformula-og (recordedAt 2026-09-17), no self-map;
   the other 4 rows byte-unchanged; no faithful slug-map created.
   vefur origin/main sectionRedirects.ts has NO ch03 row and the live site serves reynsluformula-og -> no redirect needed for 3-2.
P4 badges data-figure-review="mt-preview": faithful/03 = 5 · mt-preview/03 = 6 · mt-preview/04 = 9 (= sidecarFigures before); 0 other states.
P5 mt-preview/03 text (§C133 run 2): tilbrigði 1->0 · sjálfkvæm 2->0 · ílend 1->0 · álagn 1->0 · hreint efni 1->1 (run 2's legit use) · mól 431->~430.
P6 mt-preview/04 text: unchanged — every normalised diff line explained by the badge attribute (03-translated unchanged since its render).
P7 faithful/03: section pages 3-0/3-1 from the SAME July CNXML (renderer delta since 2026-07-14 + badges); rollups now read
   September mt-preview CNXML for m68702-4 -> rollup text changes expected; faithful corruption tokens stay 0 (HEAD CNXML has 0).
P8 git status: only 05-publication/{faithful/chapters/03, mt-preview/chapters/03, mt-preview/chapters/04, mt-preview/slug-map.mt-preview.json}
   + mt-preview/index.json after generate-index --track mt-preview; index change confined to ch03 (m68702 sectionSlug).
