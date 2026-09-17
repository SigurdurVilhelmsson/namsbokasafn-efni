# §C140 ㉟ — ch03/ch04 re-render: verification (frozen 2026-09-17)

> **Evidence, not status.** Open work and its state live in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㉟). If this file disagrees with
> the register, the register wins. Nothing here was synced; the sync stays [USER]'s.

**Branch** `content/c140-c35-rerender-ch03-ch04`, forked from `66612e43d` (docs branch
`docs/c140-c36-deployed-rerender-next`, which rides along). **Cost: 0 ISK** (no MT).

| commit | what |
|---|---|
| `6ee4232a6` | the ㉟ render: `cnxml-render --chapter 3` (mt-preview), `--chapter 4` (mt-preview), `--chapter 3 --track faithful`, then `generate-index --track mt-preview` |
| `1b82049ef` | repair found by verification: `cnxml-inject --chapter 3 --module m68700 --no-annotate-en` (register ⑰'s holding state), re-render ch03 mt-preview, re-run `generate-index --track mt-preview` |

Files: `PREDICTIONS.md` (written before the render) · `instruments/snapshot.mjs` · `reports/{before,after-render,after-fix}.report.json`
· `reports/verify-lenses.json` (the 5-lens verification, with 2 adversarial refuters per non-info finding) · `logs/`.

---

## 1. Premises checked before rendering

- **Gate premise held:** published image sha256 vs `books/efnafraedi-2e/media/` differed **13/26 · 15/28 · 19/21**
  (faithful 03 · mt-preview 03 · mt-preview 04) — exactly the register's figures.
- **The gate's blind spot was clean:** every published image *not* in `media/` (31 · 53 · 35) is byte-identical to `01-source/media`.
- **Render alone is enough for figures:** 0 figures have an `image-mapping.json` entry while the injected CNXML still
  names the English file; the `_IS` reference counts (26 · 28 · 21) equal the gate's denominators.
- **Not in ㉟'s row, found here:** `03-translated/mt-preview/ch03` changed **after** its 09-05 render (`5dbc9a6be`, §C133
  run 2, 5 modules / 309 lines), so the render also moves that chapter's TEXT onto the no-glossary re-MT.
- **Rename predicted from current inputs:** `buildModuleSections` gives m68702 `3-2-akvordun-reynsluformula-og-sameindaformula`
  — the reverse of the 09-05 rename, and the name the live site still serves.
- **Faithful overlay:** section pages iterate only the 2 faithful modules; rollups fall back to mt-preview CNXML for
  m68702–4 (`translatedCnxmlPath`). So no faithful section page is added, and rollup text changes.
- **The "free checks" cannot see this output.** `render-oracle-check.js` and `source-roundtrip-check.js` reference
  `05-publication` **0** times — they render `01-source` in memory. `render-oracle-check ch03 --control`: **CONTROL PASSES**;
  main run: **27 anchor gaps of 424** (the pre-existing figure); ch04 is not in the oracle manifest.

## 2. Predictions vs measurement (final state, after `1b82049ef`)

| # | prediction | measured |
|---|---|---|
| P1 | gate 0/26 · 0/28 · 0/21 | **0/26 · 0/28 · 0/21**; confirmed by an independent python hashlib instrument whose control on `66612e43d` finds 13/15/19 = the commit's 47 changed images |
| P2 | one rename, m68702 → `…reynsluformula-og…` | **exactly that** |
| P3 | slug-map ch03 row reverses, no self-map, other 4 rows unchanged | **exactly that** (`recordedAt 2026-09-17`) |
| P4 | badges `data-figure-review="mt-preview"` 5 · 6 · 9 | **5 · 6 · 9**, by name = the `<figure>`s whose image has a sidecar, 0 mismatches either way |
| P5 | mt-preview 03: tilbrigði 1→0 · sjálfkvæm 2→0 · ílend 1→0 · álagn 1→0 · hreint efni 1→1 · mól 431→~430 | **0 · 0 · 0 · 0 · 1 · 430** |
| P6 | mt-preview 04: every change is the badge | **9 hunks, 9 badge, 0 unexplained**; +32 bytes per badge; structural counts identical under two instruments |
| P7 | faithful 03: sections same CNXML; rollups read September MT | 3-0 byte-identical; 3-1 gained only attributes (+4 `data-en`, +5 badges); rollups +20 `data-en` and 68 text changes, **68/68 contained in the September CNXML** (crossed-vintage control 0/0); no structural loss (exercise numbering 80, answer pairing 40) |
| P8 | only the 3 dirs + slug-map + index change | held, **except** `faithful/rollups-complete` (timestamp marker written by every full faithful render — missed by the prediction, no reader effect) |

Index: `generate-index` diff at `6ee4232a6` was m68702's 2 entries + `generated`. After the repair, `termEn: null` is
**18 of 763** (see §3).

## 3. The defect verification found, and its repair

**What:** the render prepared `mt-preview/chapters/03/3-1-formulumassi-og-molhugtakid.html` with the literal text
`[[term:tala Avogadros (NA (e. avogadro’s number (na)|term-00003` in running prose and one `<dfn>` lost (4 → 3).
The only raw `[[` across all three directories; 0 before.

**Cause (the render only carried it):** `5dbc9a6be` injected ch03 with the default command, which re-enabled
`annotateInlineTerms` and reintroduced register ⑰'s two-level-nested-term corruption in m68700 — CNXML `[[term:` 0 → 1,
`<term>` 8 → 7, `<emphasis>` 8 → 9 (source 8 / 8). `02-mt-output` was clean throughout. That commit also flipped
`translation-errors.json` mt-preview to `green: false` (m68700 term −1, emphasis +1) and was committed past it. The
render's `terms: 3/3 <dfn id> carry data-en` line could not see the loss: its denominator is the rendered `<dfn>` count.

**Refuter split, resolved:** 2 refuters rated the literal marker *needs-attention* (vefur overlays faithful on
mt-preview, and faithful 3-1 is clean, so a reader would likely not see it); 2 rated the fidelity-gate finding a
*blocker*. It was repaired either way — it cost 0 ISK and the register already prescribes the command.

**Repair and result (`1b82049ef`):** m68700 CNXML `[[term:` 0 · `<term>` 8 · `<emphasis>` 8 · `(e.` 0; inject
`[PERFECT fidelity]`; `translation-errors.json` `green: true`, unexplained 2 → 0; 3-1 `[[` 0, `<dfn>` 4; ch03 `data-en` 40;
**0 raw `[[` in all three dirs (control: 371 in the MT source)**. Faithful unaffected (its 3-1 renders the faithful CNXML).

**The known ⑰ trade, re-incurred:** m68700 loses its 8 `(e. …)` glosses (one of them was inside the corrupt marker). Key-terms page `(e.` 40 → 32 — predicted 36,
wrong multiplier: each term's gloss appears twice (the `<dt>` and the page-data JSON), 4 × 2 = 8. Index `termEn: null`
14 → 18, the 09-05 value: `generate-index` parses `(e. …)` back out of the Icelandic, so the 14 existed only because of the
corrupting inject.

## 4. Reach — what a chemistry sync would now ship (measured live, byte-size probes, nonsense control 162 B)

- **Live** serves `3-2-akvordun-reynsluformula-og-sameindaformula` (499,575 B); `reynslu-og` is 404 and never went live.
  So this render **removed** the need for a ch03 redirect. vefur's warn-only detector reads the slug map and will still
  suggest `reynslu-og → reynsluformula-og` for m68702 — harmless and unneeded.
- **ch04 still needs exactly 2 redirect rows before a sync** (pre-existing, unchanged): m68713
  `4-3-hlutfallaefnafraedi-efnahvarfa → 4-3-efnajofnuhlutfall`, m68716 `4-5-magnbundin-efnagreining → 4-5-megindleg-efnagreining`.
  vefur `origin/main` (`45f1299`) has neither.
- **The badge shows nothing on vefur:** no CSS/Svelte/TS in vefur `origin/main` reads `data-figure-review`.
- After a sync, readers get the faithful copies of ch03 3-0, 3-1 and the rollups (the overlay), so the faithful rollups'
  September MT text is what they read for §3.2–3.4 summaries, key terms and exercises.

## 5. Pre-existing defects the lenses surfaced (not caused by ㉟; logged in the register)

1. **Raw CNXML `<para>` inside table cells** — mt-preview 4-2 Table 4.1 (18 elements) and 17-4 (6 lines); unknown HTML
   element, no vefur CSS; present since `7658de896` (2026-03-21). Refuters: real; info / needs-attention.
2. **Two September MT defects now on faithful ch03 rollups:** summary `fs-idm67554336` *"Styrkur má mæla með ýmsum
   einingum"* (should be accusative *Styrk*; July read *"Hægt er að mæla styrk"*); key-terms meaning of *empirical formula
   mass* *"meðalatómassa"* (one `m`; already in July's section body, now in the key-terms slot). Other listed drifts were
   refuted or minor.
3. **9 orphaned `_IS.svg` in mt-preview ch05/06/08** — in no source dir, linked from no page, synced as dead files;
   `copyChapterImages` never prunes. 8 deleted from `media/` in `34402e8a6`.
4. **19 of 34 sidecar images are inline (not `<figure>`) and carry no badge** — already logged (the register's
   render-side-badge note); ㉟'s row phrase "every published sidecar figure" was too broad.
5. **Scope critic:** 0 figure drift in all 25 efnafraedi-2e chapter dirs (2,290 images) and lifraen ch03 (89 images).
