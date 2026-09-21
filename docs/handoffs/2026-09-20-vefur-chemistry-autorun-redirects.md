# vefur redirect rows — chemistry autorun (2026-09-20 →)

**For `../namsbokasafn-vefur/src/lib/data/sectionRedirects.ts`.** One section per chapter, appended
as the run renames pages. Each row is `from` → `to` with the module id.

🔴 **Order matters: land these BEFORE the next chemistry sync.** vefur gates each entry on
`exactSectionExists`, so an entry is inert until its target is published — which makes
redirect-then-sync the only ordering with no 404 window (CLAUDE.md § Prune-on-rename).

## ch01 — 3 rows

| from | to | moduleId |
|---|---|---|
| `chapters/01/1-2-efnishamur-og-flokkun-efnis.html` | `chapters/01/1-2-astandsform-og-flokkun-efnis.html` | m68667 |
| `chapters/01/1-5-ovissa-i-maelingum-hittni-og-nakvaemni.html` | `chapters/01/1-5-maeliovissa-nakvaemni-og-genkvaemni.html` | m68690 |
| `chapters/01/1-6-staerdfraedileg-medferd-nidurstadna-maelinga.html` | `chapters/01/1-6-staerdfraedileg-medferd-maelinidurstadna.html` | m68683 |

_The live URLs are the `from` side; the re-MT retitled each section._

## ch02 — 3 rows

| from | to | moduleId |
|---|---|---|
| `chapters/02/2-3-bygging-atoms-og-taknmal.html` | `chapters/02/2-3-atombygging-og-taknmal.html` | m68692 |
| `chapters/02/2-6-jona-og-sameindaefnasambond.html` | `chapters/02/2-6-jona-og-sameindasambond.html` | m68696 |
| `chapters/02/2-7-nafnakerfi-efna.html` | `chapters/02/2-7-nafnakerfi-efnafraedinnar.html` | m68698 |

## ch08 — 4 rows

| from | to | moduleId |
|---|---|---|
| `chapters/08/8-1-kenning-um-gildistengi.html` | `chapters/08/8-1-gildisrafeindatengjakenningin.html` | m68744 |
| `chapters/08/8-2-blendingssvigrum-frumeinda.html` | `chapters/08/8-2-blendingssvigrum-atoma.html` | m68745 |
| `chapters/08/8-3-fjolfold-tengi.html` | `chapters/08/8-3-margfold-tengi.html` | m68746 |
| `chapters/08/8-4-sameindasvigrumakenningin.html` | `chapters/08/8-4-sameindasvigrumskenningin.html` | m68747 |

## ch09 — 5 rows

| from | to | moduleId |
|---|---|---|
| `chapters/09/9-2-samband-thrystings-rummals-efnismagns-og-hitastigs.html` | `chapters/09/9-2-samband-thrystings-rummals-magns-og-hitastigs.html` | m68751 |
| `chapters/09/9-3-hlutfallaefnafraedi-loftkenndra-efna-blanda-og.html` | `chapters/09/9-3-efnismagnsfraedi-loftkenndra-efna-blanda-og.html` | m68752 |
| `chapters/09/9-4-utstreymi-og-sveim-gasa.html` | `chapters/09/9-4-utstreymi-og-flaedi-lofttegunda.html` | m68754 |
| `chapters/09/9-5-hreyfiorkukenningin.html` | `chapters/09/9-5-hreyfi-sameindakenningin.html` | m68758 |
| `chapters/09/9-6-fravik-fra-kjorgaseiginleikum.html` | `chapters/09/9-6-hegdun-raungass.html` | m68759 |

_Two independent instruments agree on this set: five `Pruned superseded page` lines from the render,
and five new rows in `05-publication/mt-preview/slug-map.mt-preview.json` carrying the same
`moduleId`s. The page count is unchanged at 12, which is the control against a render that empties
the directory instead of renaming within it._

## ch10 — 6 rows (5 renames + 1 chain collapse)

| from | to | moduleId |
|---|---|---|
| `chapters/10/10-1-addrattarkraftar-milli-sameinda.html` | `chapters/10/10-1-millikraftar.html` | m68761 |
| `chapters/10/10-3-fasabreytingar.html` | `chapters/10/10-3-hamskipti.html` | m68768 |
| `chapters/10/10-4-fasarit.html` | `chapters/10/10-4-fasamyndir.html` | m68769 |
| `chapters/10/10-5-fastur-efnishamur.html` | `chapters/10/10-5-fast-efni.html` | m68770 |
| `chapters/10/10-5-fast-astand-efnis.html` | `chapters/10/10-5-fast-efni.html` | m68770 |
| `chapters/10/10-6-grindargerdir-i-kristalkenndum-fastefnum.html` | `chapters/10/10-6-grindarformgerdir-i-kristolludum-fostum-efnum.html` | m68773 |

🔴 **SIX ROWS AGAINST FIVE `Pruned superseded page` LINES, AND THE SIXTH IS THE ONE THAT WOULD HAVE
BEEN MISSED.** `10-5-fast-astand-efnis.html` was already in the slug map, pointing at
`10-5-fastur-efnishamur.html`; this render renamed *that* page again, so the map **collapsed the
chain** and rewrote the older entry's target to the current file. ▶ **Filing only the render's new
renames would have left `10-5-fast-astand-efnis.html` pointing at a page that no longer exists** —
and vefur does ONE lookup with no transitive walk (CLAUDE.md § Prune-on-rename), so it would have
404'd. **Diff the slug map before and after; do not transcribe the render log.**

## ch11 — 3 rows

| from | to | moduleId |
|---|---|---|
| `chapters/11/11-2-rafkleyfar.html` | `chapters/11/11-2-rafleidar.html` | m68781 |
| `chapters/11/11-4-samthynningareiginleikar.html` | `chapters/11/11-4-sameiginlegir-eiginleikar.html` | m68783 |
| `chapters/11/11-5-svif.html` | `chapters/11/11-5-kolloidar.html` | m68784 |

_Both instruments agree at 3: three `Pruned superseded page` lines in the render log, and a
before/after diff of `slug-map.mt-preview.json` showing **added=3, changed=0, removed=0** (27 → 30
rows). **The diff is the instrument that matters** — ch10 had six rows against five pruned lines
because a chain collapsed and rewrote an OLDER entry the log never mentioned. This chapter had no
collapse, but that was established by diffing, not by trusting the count to match._

⚠️ **FOR AN EDITOR, NOT A BLOCKER — `11-4` is a terminology regression in the section title.**
The MT retitled *colligative properties* from `samthynningareiginleikar` to
`sameiginlegir eiginleikar`, which reads as "shared/common properties" and loses the technical
sense (colligative = depending on the NUMBER of solute particles, not their identity). The old
slug was closer. The page slug follows the title, so fixing the title in the editor will rename
the page again and produce a further redirect row.

## ch12 — 6 rows

| from | to | moduleId |
|---|---|---|
| `chapters/12/12-1-hvarfhradi-efnahvarfa.html` | `chapters/12/12-1-hradi-efnahvarfa.html` | m68786 |
| `chapters/12/12-2-thaettir-sem-hafa-ahrif-a-hvarfhrada.html` | `chapters/12/12-2-thaettir-sem-hafa-ahrif-a-efnahvarfshrada.html` | m68787 |
| `chapters/12/12-3-hradajofnur.html` | `chapters/12/12-3-hradalogmal.html` | m68789 |
| `chapters/12/12-4-heildud-hradalogmal.html` | `chapters/12/12-4-heildunarhradalogmal.html` | m68791 |
| `chapters/12/12-6-hvarfgangar-efnahvarfa.html` | `chapters/12/12-6-hvarfgangar.html` | m68794 |
| `chapters/12/12-7-hvotun.html` | `chapters/12/12-7-hvorf.html` | m68795 |

_Both instruments agree at 6: six `Pruned superseded page` lines and a slug-map diff of
**added=6, changed=0, removed=0** (30 → 36). No chain collapse this time — established by
diffing, not by the counts happening to match._

🔴 **FOR AN EDITOR — `12-7` IS A TITLE REGRESSION AND THE OLD SLUG WAS RIGHT.** The English
section title is **`Catalysis`**; the re-MT rendered it **`Hvörf`**, which means *reactions*.
The superseded slug was `hvotun` — **`hvötun` is the correct word and the previous MT had it.**
▶ **Confined to the title: the body is correct**, using `hvati`/`hvata` (catalyst) 47 times.
There is **no glossary row for `catalysis` or `catalyst`**, so this is the model unprompted —
§C73's control — getting the running text right and the heading wrong. Fixing the title renames
the page again and produces a further redirect row.

## ch13 — 1 row

| from | to | moduleId |
|---|---|---|
| `chapters/13/13-3-tilfaersla-jafnvaegis-logmal-le-chteliers.html` | `chapters/13/13-3-jafnvaegisbreytingar-logmal-le-chteliers.html` | m68799 |

_Both instruments agree at 1: one `Pruned superseded page` line and a slug-map diff of added=1,
changed=0, removed=0 (36 → 37)._

## ch14 — 2 rows

| from | to | moduleId |
|---|---|---|
| `chapters/14/14-5-fjolvirkar-syrur.html` | `chapters/14/14-5-fjolroteindasyrur.html` | m68807 |
| `chapters/14/14-6-studpudar.html` | `chapters/14/14-6-jafnalausnir.html` | m68808 |

_Both instruments agree at 2 (37 → 39, added=2, changed=0, removed=0)._

⚖️ **`14-6` is a TERMINOLOGY SHIFT for [USER] to rule on, not a regression like `12-7`.** English is
`Buffers`; the superseded slug was `studpudar` (*stuðpúðar*) and the new one is `jafnalausnir`.
**Unlike §12.7's catalysis, the MT is internally CONSISTENT here** — `jafnalausn` appears 56x through
the body, the key-term definition reads *"jafnalausn, eða buffer"*, and `Jafnalausnargeta (e. buffer
capacity)` uses the house `(e. …)` convention correctly. **One residual `stuðpúðaþátta` remains in an
exercise** and should be unified whichever way it is ruled. Which of *jafnalausn* / *stuðpúðalausn*
is the right Icelandic is a chemistry-teacher call, not a pipeline one.

## ch15 — 1 row

| from | to | moduleId |
|---|---|---|
| `chapters/15/15-3-tengd-jafnvaegi.html` | `chapters/15/15-3-tengt-jafnvaegi.html` | m68814 |

_Both instruments agree at 1 (39 → 40, added=1, changed=0, removed=0)._

## 🔴 RETRACTION — three rows published above are now INVERTED. Do not implement them.

The tier-A terminology re-buy (2026-09-21) restored the house terms, and three pages **returned to
the slugs they had before the re-MT drifted away from them**. The rows previously published in the
ch12 and ch14 sections are therefore backwards:

| ❌ published earlier — DO NOT USE | ✅ correct now |
|---|---|
| `12-7-hvotun.html` → `12-7-hvorf.html` | `12-7-hvorf.html` → `12-7-hvotun.html` |
| `14-5-fjolvirkar-syrur.html` → `14-5-fjolroteindasyrur.html` | `14-5-fjolroteindasyrur.html` → `14-5-fjolvirkar-syrur.html` |
| `14-6-studpudar.html` → `14-6-jafnalausnir.html` | `14-6-jafnalausnir.html` → `14-6-studpudar.html` |

⚠️ **The practical risk is LOW but the record must not stand.** Vefur gates each entry on
`exactSectionExists`, so a row whose target no longer exists is **inert** — an implemented stale row
would not fire. But it points from a LIVE page to a DELETED one, which is the opposite of what a
redirect is for, and nothing would flag it.

🔴 **THE DURABLE LESSON, AND IT IS NOT THE CHAIN-COLLAPSE ONE: A RE-BUY CAN *INVERT* A RENAME, AND
A REDIRECT ROW PUBLISHED FROM THE EARLIER RUN BECOMES WRONG.** The ch10 note above teaches that a
chain collapses and an OLDER entry gets rewritten. This is different: the slug map **REMOVED** three
rows outright and wrote their reverses, because the pages moved back. ▶ **And the render log cannot
show you this** — it printed only the three NEW renames and said nothing about the three removals.
**Only a before/after diff of the slug map sees a removal.**

## ch10 / ch12 / ch14 / ch15 — tier-A terminology re-buy, 2026-09-21

| from | to | moduleId |
|---|---|---|
| `chapters/12/12-7-hvorf.html` | `chapters/12/12-7-hvotun.html` | m68795 |
| `chapters/14/14-3-hlutfallslegur-styrkur-syra-og-basa.html` | `chapters/14/14-3-afstaedur-styrkur-syra-og-basa.html` | m68805 |
| `chapters/14/14-5-fjolroteindasyrur.html` | `chapters/14/14-5-fjolvirkar-syrur.html` | m68807 |
| `chapters/14/14-6-jafnalausnir.html` | `chapters/14/14-6-studpudar.html` | m68808 |

_Slug map 40 → 41: **added=4, changed=0, removed=3**. ch10 and ch15 produced no renames._

## ch16 — prepared 2026-09-21 (the C171 fidelity unblock; no new MT was bought)

| from | to | moduleId |
|---|---|---|
| `chapters/16/16-1-sjalfsprotti.html` | `chapters/16/16-1-sjalfgengi.html` | m68816 |

_Slug map 41 → 42: **added=1, changed=0, removed=0** — computed by diffing the map before and
against `HEAD`, not transcribed from the render log. No chain collapsed and no row inverted, so
this single row is the whole of ch16's redirect work._

## ch17 — prepared 2026-09-21 (~1,132 ISK all in)

| from | to | moduleId |
|---|---|---|
| `chapters/17/17-1-yfirlit-yfir-oxunar-afoxunarefnafraedi.html` | `chapters/17/17-1-yfirlit-yfir-oxunar-afoxunarfraedi.html` | m68821 |
| `chapters/17/17-2-rafefnafrumur.html` | `chapters/17/17-2-galvaniker.html` | m68822 |
| `chapters/17/17-3-raftrods-og-kerspenna.html` | `chapters/17/17-3-rafskauts-og-kerspenna.html` | m68823 |

_Slug map 42 → 45: **added=3, changed=0, removed=0** — from a before/after diff against `HEAD`,
not transcribed from the render log. No chain collapsed and no row inverted._

⚠️ **The second row is the `galvanic cell → galvaníker` ruling reaching a reader-facing URL**
(`rafefnafrumur` → `galvaniker`), and the third is `cell potential → kerspenna` doing the same.
A terminology ruling on this chapter moves page slugs, so the redirect rows are not optional
hygiene here — they are how the ruling lands without breaking links.

## ch18 — prepared 2026-09-21 (~2,615 ISK all in)

| from | to | moduleId |
|---|---|---|
| `chapters/18/18-2-tilvist-og-framleidsla-daemigerdra-malma.html` | `chapters/18/18-2-tilvist-og-framleidsla-adalflokkamalma.html` | m68830 |
| `chapters/18/18-3-uppbygging-og-almennir-eiginleikar-halfmalma.html` | `chapters/18/18-3-bygging-og-almennir-eiginleikar-malmunga.html` | m68831 |
| `chapters/18/18-12-tilvist-framleidsla-og-eiginleikar-edalgastegunda.html` | `chapters/18/18-12-tilvist-framleidsla-og-eiginleikar-edallofttegunda.html` | m68840 |

_Slug map 45 → 48: **added=3, changed=0, removed=0**, from a before/after diff. The first row is the
`representative metal → aðalflokkamálmur` ruling reaching a URL._

## ch19 — prepared 2026-09-21 (~1,761 ISK all in)

| from | to | moduleId |
|---|---|---|
| `chapters/19/19-1-tilvist-framleidsla-og-eiginleikar-hlidarmalma-og.html` | `chapters/19/19-1-tilvist-framleidsla-og-eiginleikar-hlidarfrumefna.html` | m68842 |
| `chapters/19/19-3-litrofs-og-segulfraedilegir-eiginleikar-hnitfloka.html` | `chapters/19/19-3-litrofs-og-seguleiginleikar-girdisambanda.html` | m68844 |

_Slug map 48 → 50: **added=2, changed=0, removed=0**, from a before/after diff._
