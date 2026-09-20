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
