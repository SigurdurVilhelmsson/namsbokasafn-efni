# §C148 — predictions, written BEFORE the real re-inject and re-render (2026-09-17)

> **Evidence, not status.** Status lives in the campaign register (§C148). Scored in `VERIFICATION.md`.

Code under test: `applyFigureCaptionDom` in `tools/cnxml-inject.js`, called from `buildNoteDom` (refactor), `buildExampleDom`
and `buildExerciseDom` (the fix). Delivery scope: the 4 modules on the PREPARED chemistry chapters, mt-preview track only.

## Already measured (not predictions)

- **Sentinel, `01-source`, before the fix** (`reports/sentinel-before-fix.txt`): chemistry `example/direct` 31/0/0,
  `exercise/para` 1/0/0; controls `top` 510/510/510, `note/direct` 83/83/83. Organic `example/direct` 3/0/0 (m00136,
  m00137, m00142 — latent, not in the committed-output census); controls `top` 457, `note/direct` 1.
- **Real inject CLI, whole corpus, old vs new code, same inputs** (`instruments/corpus-inject-old-vs-new.sh`):
  verdicts identical by module (written 69 · skipped 97 · failed 320); 6 CNXML differ, **7 lines, every one a
  `<caption>`**; the two residue reports and `translation-errors.json` differ only in timestamps (no caption trips the
  residue gate).
- **Drift:** old-code output is byte-identical to the committed file for m68702, m68703, m68713, and for m68700 under
  `--no-annotate-en` (⑰). So the real re-inject can move nothing but captions.

## Predictions

| #   | prediction                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `git diff` on `03-translated/mt-preview` after the 4 injects = exactly 5 lines, all `<caption>`: m68700 copper, m68702 hematite + BrewTank, m68703 vinegar, m68713 iodine. m68700 reports `[PERFECT fidelity]`.                                                                                                                                               |
| Q2  | m68700 opener-only `\[\[(?!MATH:\|MEDIA:)[A-Za-z]\w*:` = 0 (§C145), `<term>` 8, `<emphasis>` 8, `(e.` 0 — ⑰'s holding state preserved.                                                                                                                                                                                                                        |
| Q3  | `translation-errors.json` stays `green: true` with no count change; residue reports change at most in timestamps.                                                                                                                                                                                                                                             |
| Q4  | Rendered mt-preview pages that change: `3-1-formulumassi-og-molhugtakid`, `3-2-akvordun-reynsluformula-og-sameindaformula`, `3-3-molstyrkur`, `4-3-efnajofnuhlutfall` — and no other file under `05-publication/` except (possibly) generated timestamps. Each changed hunk is a `<figcaption>` text swap; each English caption x1 → 0, its Icelandic x0 → 1. |
| Q5  | No page rename; `slug-map.mt-preview.json` unchanged; no image file changes.                                                                                                                                                                                                                                                                                  |
| Q6  | `generate-index --track mt-preview`: at most the `generated` timestamp moves.                                                                                                                                                                                                                                                                                 |
| Q7  | `faithful/chapters/03/3-1-…` is NOT touched and keeps the English copper caption x1 — faithful segments for ch03 are not on this box (reach caveat, owed on prod).                                                                                                                                                                                            |
| Q8  | `caption_census.cjs efnafraedi-2e` on the committed tree: `example/direct` ENGLISH 31 → 26; ch03 4 → 0, ch04 1 → 0.                                                                                                                                                                                                                                           |
| Q9  | Committed-tree raw `[[` (opener-only) across `05-publication/mt-preview/chapters/{03,04}` stays 0.                                                                                                                                                                                                                                                            |
