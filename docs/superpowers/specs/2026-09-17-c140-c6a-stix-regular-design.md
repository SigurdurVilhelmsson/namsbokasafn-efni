# §C140 ⑥a — kept STIX symbols are drawn in STIX 1.1.0, meeting the strict licence readings

**Date:** 2026-09-17 · **Item:** campaign register §C140 ⑥ (the STIX half) · **Cost:** 0 ISK
**Approval:** [USER], 2026-09-16 (register ⏩ RESUME, "[USER] RULES THE OVERNIGHT SCOPE"): ⑥ runs end to end to a PR without
check-ins; bought figures whose output changes may be recomposed at 0 ISK on the branch; no merge; and answer 4 — *accept
subsetting STIX 1.1.0 into the composed SVGs with a font-family name containing neither "STIX" nor "TM Math", keeping its
copyright and trademark notices, with OFL licensing information in each SVG.*
**Evidence (frozen):** [`experiments/figure-text-translation/evidence/2026-09-17-c6-explore/`](../../../experiments/figure-text-translation/evidence/2026-09-17-c6-explore/README.md) (read-only exploration and critic),
`evidence/2026-09-16-stix-licence/` (the licence record), `evidence/2026-09-13-compose-fidelity/` (the "Plus" prototype).
**Stacked on:** `feat/c140-c4-strip-keeps-gstate` (④). Every before/after comparison here is against ④'s recomposed media.

## 0. Rulings

| # | ruling | why | cost if wrong |
|---|---|---|---|
| T1 | **⑥ is split. This PR is the STIX half only; per-run kerning is a separate item** (logged with the exploration's findings, § 7). | The halves share no evidence and no risk class: STIX changes fonts on kept runs and is ruled on; kerning is an unruled choice between rendering and layout changes on translated labels, and its per-run form reaches 0 kept runs on the 34 as published. STIX 1.1.0 has no kern pair among the source glyphs, so they do not interact. | kerning waits one more PR |
| T2 | **Only KEPT, run-exact runs** (never-sent and identity blocks) whose source BaseFont, subset prefix removed, is exactly `STIXGeneral-Regular`, and whose every character is in the official 1.1.0 cmap, are drawn in STIX. Translated labels, arc runs, other STIX faces and other symbol fonts are unchanged and **counted in the compose report**. | Kept runs are positioned from the source's own advances, so changing their face moves no layout. `figscripts.is_symbol_run` also matches MathematicalPi, Symbol and cmsy, whose glyphs are different characters, so it is not the key. Only the Regular face was compared with the official file; the 34 bought figures use no other STIX face. | the 3 translated STIX blocks (sandwich) stay in Liberation — a visible inconsistency inside one figure, named |
| T3 | **The font file is the official `STIXGeneral-Regular.otf` 1.1.0, pinned by sha256 in committed config and read from a local, never-committed path.** A missing or mismatched file makes compose **refuse** any figure that has an eligible STIX run, naming the reason; figures without one compose as before. | Committing the whole font would be a second distribution with its own licence obligations and a carve-out in root `LICENSE` (experiments/ is MIT); the figure driver is already local-box only with local prerequisites (`pylibs/`, `sources.local.json`). The composed SVGs carry only the subset, which is what [USER] accepted. | another box cannot compose STIX figures until the file is provisioned — loudly, per figure |
| T4 | **The subset carries no reserved name or reserved word anywhere a font is named**: family `FigSym`. Name IDs 1, 3, 4, 6 (and 16, 17, 21, 22 when present) and the CFF `fontNames[0]`, `FullName` and `FamilyName` are rewritten; none may contain `STIX`, `Fonts`, `TM` or `Math` (case-insensitive). Name IDs **0 (copyright) and 7 (trademark)** and the CFF `Notice` are kept verbatim; IDs 13/14 (licence description/URL) are kept. | [USER]'s answer names the family; the strict readings the answer was put against (condition 3; FAQ 5.3 "other mechanisms that specify a font"; FAQ 5.4 individual words) reach the internal records too. Doing both is the only way the ruling's "meets the strict readings" is true. | none known |
| T5 | **Licensing information goes in each STIX-bearing SVG as an escaped `<metadata>` element**: the font's name and version, the copyright and trademark notices, a statement that the subset is renamed from STIX Fonts 1.1.0 and licensed under the SIL Open Font License 1.1, and the full licence text — **never an XML comment** (the OFL text contains `--`, illegal in a comment, and an ill-formed SVG does not render in `<img>`). The licence text is **the STIX 1.1.0 release's own licence document** (`archive/STIXv1.1.0/License/STIX Font License 2010.pdf` in the official stipub/stixfonts repository — the OFL 1.1 under the STI Pub Companies' copyright header, naming both reserved font names), as text: fetched 2026-09-17, PDF sha256 `f9e7dfa5f80b16145050794cf430c2473b6c060d2adbbef61bbb335d063e5680`, its `pdftotext -layout` text sha256 `69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3` (98 lines, 4 containing `--`). The text file is small and is committed beside the config (it is a licence document, not font software); both hashes are pinned. | [USER]'s answer: OFL licensing information in each SVG. | ~5 KB per STIX figure |
| T6 | **No `COMPOSER_VERSION` bump; recompose, one `--figure` at a time with `figure-run.js --stale --force` (0 ISK), exactly the bought figures whose composed `<text>` list changes** (decided by § 4.2's compose-only diff), as ④ did. The PR puts the exception to [USER]. | The constant's contract ("bump when a composer change alters pixels for unchanged text … sends every approved figure back to mt-preview") protects review approvals — and **0 of the 34 committed sidecars carry a review state**, so there is nothing in the tree for a bump to protect (④'s final review, which measured it). A bump's real cost is a server deploy (server code requires the constant) and a 0-ISK recompose of all 34 with woff2 byte churn on the figures whose pixels do not move. Whether prod's database holds an approval for any of the changed figures is not visible from the tree; the PR names the figures so [USER] can re-open their review if so. | a DB-only approval on prod survives over new pixels until [USER] re-opens it |

## 1. What is wrong today

The composer draws every run in one family (`compose.py` `FAMILY = 'Liberation Sans'`, `svgout.py` `FAMILY = 'FigIS'`),
whatever the source used. Source figures draw `+ = × − <` and similar in STIXGeneral; drawn in Liberation they sit about 2 px
off. Exposure on the 34 bought figures (exploration, from `evidence/2026-09-13-compose-fidelity/data/1a-blocks.jsonl`): **45
blocks with a STIX run in 10 figures — 41 never sent, 1 identity, 3 translated (all in `CNX_Chem_04_04_sandwich`)**, all
`STIXGeneral-Regular`. Corpus-wide the census counted 883 STIX blocks, 739 in composed figures, of which only 468 are Regular.

## 2. The change

- **`svgout.py`:** a second face table entry for `FigSym` built from the official file; `subset_face` gains the renaming and
  name-ID retention of T4 for that face (the Liberation faces are unchanged); `write_svg` emits the `FigSym` `@font-face` rule only
  when a STIX item exists, **after** the FigIS rules, and the `<metadata>` of T5; FigIS character sets are computed from non-STIX
  items only.
- **`compose.py`:** `draw_run_exact` marks an eligible run (T2) so its item carries `font-family="FigSym"`; the cairo raster path
  (`translated.png`) is unchanged (cairo's toy API cannot load an uninstalled font; nothing publishes that PNG).
- **Config:** the pinned hash, filename, version and source URL of the font and the licence text in `figure-text.config.json`;
  the local path in the gitignored local config.
- **Report:** per figure, STIX runs drawn / skipped by reason (translated, other face, character outside cmap, font unavailable).

## 3. Tests

- **Renamed subset:** no name record (IDs 1–6, 16, 17, 21, 22) and no CFF name contains `STIX`, `Fonts`, `TM` or `Math`; IDs 0 and 7
  and the CFF `Notice` equal the official file's; **positive control:** the same check fails on an unrenamed subset.
- **SVG:** every composed test SVG parses as XML with the metadata present; the metadata contains the notices and the pinned licence
  text; the `FigSym` rule is absent from a figure with no eligible run, and today's rules keep their order.
- **Eligibility:** a Regular STIX kept run → FigSym; a translated STIX run, an Italic STIX run, a MathematicalPi run and a run with a
  character outside the cmap → FigIS, each counted by reason.
- **Refusal:** a wrong-hash font file refuses a figure with an eligible run and composes one without.
- The existing Python suites and the root vitest (by name) as before.

## 4. Verification — 0 ISK, predictions first, `evidence/2026-09-17-c6a-build/`

1. **Free re-count on the current prepare:** 42 kept + 3 translated STIX blocks on the 34, Regular only; every STIX character in the
   official cmap; `blocks.json` keys byte-identical.
2. **Compose only (no publish) on the 34 (R-a):** the `<text>` list identical in text, x, y, size, weight, style and fill; only
   `font-family` changes, and only on the kept STIX runs; FigIS subsets lose exactly the characters now drawn in FigSym; figures with
   no STIX run draw identical `<text>` lists.
3. **Chromium (R-b):** the 10 STIX figures, before and after, against the source raster at the STIX runs, with the control that
   removing the `FigSym` rule changes the render (a mis-named family falls back silently).
4. **Recompose (T6):** `figure-run.js --stale --force --figure <b>` for each figure whose `<text>` list changed, at 0 ISK;
   `MT spawned for 0 figure(s)`; no sidecar or mapping change; media artwork parts identical to ④'s; text groups differ exactly on
   the recomposed figures, and only in `font-family`.

## 5. Out of scope — logged

- **Kerning** (⑥b): option (a) `font-kerning:none` on translated layout items (browser matches cairo's measure; no layout decision
  moves) vs (b) kern pairs inside `lin_advance` (source typography; line breaks and sizes can move); the register's "a gap can only
  widen" is contradicted by Liberation's positive `r’`/`f’` pairs; the per-run kept-run form reaches 0 kept runs on the 34.
- STIX **Italic, Bold, BoldItalic** (444 corpus blocks) and the 6 TrueType STIX objects: compare with official files before buying
  beyond ch03/ch04.
- The 3 translated STIX blocks in sandwich.
- **㉗:** the existing FigIS Liberation subsets keep "Liberation" in name IDs 1/4/6 — the same strict reading would apply.

## 6. Known limits

- Firefox and WebKit are not measured.
- The licence text's sufficiency in `<metadata>` ("easily viewed by the user") is the residual risk [USER] accepted.
