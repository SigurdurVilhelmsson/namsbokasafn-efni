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
