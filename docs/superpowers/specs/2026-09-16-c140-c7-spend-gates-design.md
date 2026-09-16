# §C140 ⑦ — spend gates: glyphs every reader misreads, and production pages resolved as figures — design

**Date:** 2026-09-16 · **Status:** design, awaiting [USER]'s review of this document.
**Owner of:** the DESIGN of how the figure pipeline repairs misread symbol glyphs, refuses production pages, and
reports what a run would buy. Nothing else in §C140.
**Status of the work lives in** the campaign register's ⏩ RESUME and §C140 ⑦; figure-text status in
`experiments/figure-text-translation/REGISTER.md`. **This document carries no status verbs.**
**Evidence it rests on (frozen, cited, never restated):**
[`evidence/2026-09-16-c7-explore/`](../../../experiments/figure-text-translation/evidence/2026-09-16-c7-explore/README.md)
(this item's own measurements — the font census and detector, the page census, the driver map) ·
[`COMPOSE-FIDELITY.md` § Spend hazards](../../../experiments/figure-text-translation/COMPOSE-FIDELITY.md)
(where both hazards were first found).

---

## Rulings this design is built on — do not re-litigate

| # | ruling | by |
|---|---|---|
| S1 | **Fix + gate.** Correct the misread glyphs where the text is read, and stop production pages at resolve time. The two live June sheets are **named** in the run report, **not retired** — retiring them is a publication step [USER] times | [USER] 2026-09-16 |
| S2 | **rvosmosis: refuse and name it.** Nothing bought or composed; cropping the sheet is logged as a possible later item | [USER] 2026-09-16 |
| S3 | **The dry run lists what a live run would buy**, with billable characters and an ISK estimate | [USER] 2026-09-16 |
| S4 | Approaches approved: glyph repair in the read layer (1A); production pages refused at artwork resolution with fall-through inside the same edition (2A) | [USER] 2026-09-16 |
| — | Carried: buying stays stopped · a sidecar is never re-bought (R8) · `unresolved` is counted and named but never fails a run (R9) · the hold decision is per BLOCK (R-8 completed by R4b) · **block keys of bought figures must not move** | earlier [USER] rulings |

## 1. The two defects

**Misread glyphs.** MathematicalPi fonts in some EPS sources carry a `/Differences` encoding with Mathematical Pi's
own glyph names (`H11034`, `H11002`, `H9261`) and no ToUnicode map. pdfminer cannot map those names, silently keeps
the base WinAnsi character for the code, and reads `°` as `8`, `−` as `2`, `λ` as `l`; poppler and PDFium agree, so no
reader swap helps. PentIso's three `boiling point: 36 8C` labels are `send:true` and would be bought wrong.
**A spend hold alone does not fix it:** a held block is kept and redrawn from its read text, so `2100` reaches
readers unbought.

**Production pages.** The resolver takes the first file by format order, so a Letter-size sheet can win: N2O5's
InDesign placement page beats the real EPS in the same folder, and rvosmosis's only vector is an Art Dialogue
Sheet. Both classify `translated`, so a paid run would buy sheet chrome and a filename, and compose whole sheets —
which is what the June SVGs readers see today already are.

## 2. Part A — misread glyphs repaired where the text is read

### 2.1 Font facts, recorded structurally

`readlayer._font_entry` gains two fields beside the existing ones:

- `tounicode`: whether the font dictionary has `/ToUnicode`.
- `unmapped_glyphs`: `[[code, name], …]` — every `/Differences` entry whose glyph name
  `pdfminer.encodingdb.name2unicode` cannot map (it raises), recorded **only when `tounicode` is false**. For a
  `/Type0` font or a font with no `/Differences`, `[]`.

Both use pdfminer's own functions, **imported, never copied** (the rule `sendable` already follows for
`_looks_undecoded`). The existing `encoding` field — a pikepdf repr string — is left unchanged and **nothing parses
it**. Measured over the corpus, `tounicode == false and unmapped_glyphs != []` fires on exactly 4 font records in 3
files; the one MathematicalPi font whose text is correct (Carbon's space) has a ToUnicode map and is skipped.

### 2.2 The repair table — one owner

A new module `experiments/figure-text-translation/figglyphs.py` owns:

```python
GLYPH_REPAIRS = {'H11034': '°', 'H11002': '−', 'H9261': 'λ'}
```

Each entry cites the raster that confirms it (`evidence/2026-09-16-c7-explore/crops/mpi_crops.png`). **An entry is
added only with a raster**; what other Mathematical Pi H-numbers mean is not known, and the design fails closed on
them (§ 2.3 b).

### 2.3 Where the repair runs, and its three cases

In `readlayer._prepare`, per character, for a character whose font entry has `unmapped_glyphs`. The character
pdfminer emitted for code *c* is recomputed with pdfminer's own
`EncodingDB.get_encoding(base_encoding, differences)`. ⚠️ **The `/Differences` names must be passed as pdfminer
`PSLiteral` objects (`pdfminer.psparser.LIT`)** — a list of plain strings is silently ignored (measured:
`degree` as a string comes back as `'8'`, as `LIT('degree')` as `'°'`). ⚠️ **`base_encoding` is the one pdfminer's
simple-font code selects for that font dictionary** (its `/BaseEncoding`, or pdfminer's own default when absent) —
read from pdfminer's selection logic, never assumed to be WinAnsi. The affected fonts measured all declare
`/WinAnsiEncoding`.

For each `[c, name]` in `unmapped_glyphs`, with `emitted = get_encoding(...)[c]`:

- **(a) repaired** — `name` is in `GLYPH_REPAIRS` and no other code of the same font decodes to `emitted`: every
  character of that font whose text is `emitted` becomes `GLYPH_REPAIRS[name]`. Counted in
  `meta['glyph_repairs'][font_key][name]`.
- **(b) unrepaired** — `name` is not in the table: the character becomes pdfminer's own placeholder `(cid:c)`.
  That **reuses the existing undecoded path unchanged**: `_mark_decodable` marks the font, `sendable` holds the
  block, `classify_holds` counts it as `undecoded`, the driver report names it under "blocks the read layer could
  not read", and `run_draw_text` strips the placeholder so the wrong character is not drawn. Counted in
  `meta['glyph_unrepaired'][font_key][name]`. No fourth hold reason is added, so the residue trap in
  `classify_holds` (an unknown reason silently counted as `missingFont`) cannot fire.
- **(c) ambiguous** — another code of the same font also decodes to `emitted`, so a character cannot be attributed:
  treated as (b) for that emitted character, counted in `meta['glyph_ambiguous']`. Measured corpus instances: 0
  (each affected subset holds one glyph).

A repair cannot touch another font's text: every character carries its own font key, and `_continues` splits a run
whenever the font changes.

### 2.4 What changes downstream

- **Block text and keys change only where a repair fires:** PentIso (3 blocks, `36 °C` …) and Amontons2 (2,
  `−100`, `−50`). Neither is bought. The 34 bought figures use no affected font, so their `blocks.json` must come out
  byte-identical — that is a verification gate (§ 6), not an assumption.
- `sendable`, `classify_holds`, `emit-blocks.py` and `compose.py` are **unchanged**; they see corrected text.
- The composer draws with Liberation Sans, and all four faces have `°`, `−`, `λ` (measured on this box).
- `figure-prepare.py` copies the three counters into `prepare.json` (`glyphRepairs`, `glyphUnrepaired`,
  `glyphAmbiguous`, each `{name: count}`); the driver stores them on the record and the summary prints a named
  section: `glyphs repaired by the read layer: <basename> 3× H11034 → °`. Unrepaired and ambiguous glyphs are
  added by name to the existing "could not read" line.

## 3. Part B — production pages refused at artwork resolution

### 3.1 Page size

A new `sources.page_size(path) -> (w, h) | None`:

- `.pdf` and PDF-compatible `.ai`: first page's CropBox, else MediaBox (pikepdf).
- `.eps` (and an `.ai` pikepdf cannot open): `%%HiResBoundingBox`, else `%%BoundingBox`, from the PostScript header —
  following a DOS EPS binary header (`C5 D0 D3 C6`) to its PostScript section.
- Unreadable → `None`. **An unknown size is not a page**: the candidate resolves as today, and the resolve report
  flags it (`pageUnknown`) so it is visible. Measured corpus instances: 0 of 910.

### 3.2 The signal

`PAPER_SIZES` in `sources.py` — Letter, A4, Legal, Tabloid, A3, in points — matched in either orientation within
±2 pt. Measured: exactly 2 of 910 resolved artworks (rvosmosis, N2O5; both Letter), still 2 at ±10 pt; the next
largest artwork is 468×576 pt. Aspect ratio, creator application and embedded-raster size were measured and
rejected (evidence README).

### 3.3 The resolution rule

Inside one edition, candidates are tried in format order (`.pdf`, `.eps`, `.ai`), exact names first, then the
existing case/punctuation-tolerant lookup. **A paper-size candidate is skipped and recorded, and the next candidate
is tried** — so N2O5 resolves to its EPS. If every candidate the highest-precedence edition offers is a page, the
figure is **refused** with reason `production-page` and the candidates with their sizes. **It does not fall through
to a lower-precedence edition**: the edition decides *which picture*, and a 1st-edition file standing in for a
2nd-edition sheet is the superseded-artwork failure this module exists to prevent.

### 3.4 The report contract, and superseded refusals on the same channel

`resolve()` keeps its `(path, edition)` signature for existing callers. A new `resolve_detail()` returns the refusal
too, and `resolve_report` emits per name one of:

- `{"path": …, "edition": …}` — resolved;
- `null` — a hole in the delivery (unchanged meaning);
- `{"path": null, "refused": "production-page" | "superseded", "edition": …, "candidates": [{"path": …, "page": [w, h]}], "reason": …}`.

Superseded refusals move onto this channel: today they arrive as `null` and the driver prints them as
"no artwork in any configured source tree", which is false.

### 3.5 The driver

- `resolveArtwork` accepts the new value; a refusal is stored as `rec.artworkRefusal`. The outcome is `unresolved`
  (**the closed outcome vocabulary is unchanged**, and R9 keeps it a non-fatal NOTE) with a reason naming the
  refusal.
- The de-hash retry **skips refused records** — a refusal is not a hole to be filled by a stripped name.
- The summary lists refusals **apart from** the "artwork delivery has a hole here" list, as contests already are:
  `⚠️ REFUSED — production page: <basename>  <path>  612×792 pt (Letter)` and
  `⚠️ REFUSED — superseded: <basename>: <reason>`.
- A resolved artwork whose page size could not be read (`pageUnknown`) is named in its own summary line, so an
  unmeasurable candidate is visible rather than silently waved through.
- **Still-mapped line.** For every refused figure (production page, superseded, contest), if
  `books/<slug>/media/image-mapping.json` has a row for it or `media/<basename>_IS.svg` exists, the summary says
  `readers still see an earlier translated copy: <file> (mapping row present) — refusing does not retire it`.
  Read-only.

### 3.6 Premises corrected

The claims that a refused figure "ships in English" (`sources.py` at the superseded refusal;
`figure-text.config.json` `_supersededArtwork`) and that for a copy "the reader keeps OpenStax's own artwork"
(`tools/figure-run.js`, the `PUBLISH_BOUND` comment) are false whenever a June `_IS.svg` and mapping row exist. They
are rewritten to say what happens.

## 4. Part C — the dry run says what a live run would buy

- For each record still `translated` after every guard and with **no sidecar**, the driver reads the prepared
  `blocks.json` before the output directory is removed and computes
  `dedupeSendBlocks(blocks.filter(b => b.send))` — **imported from `translate-blocks.mjs`**, the function that
  decides what is billed (its `main` is guarded, so the import runs nothing). It records `billableBlocks` and
  `billableChars`.
- **Dry run:** `would buy N figure(s): C billable characters, est X ISK at list rate`, then one line per figure
  (basename, blocks, characters). **Live run:** the same numbers are added to the existing "MT spawned" line and
  "bought this run" list.
- The estimate is `estimateIsk` from `tools/lib/malstadur-api.js`, which owns the rate; this design does not restate
  it. It is labelled a list-rate estimate.
- The misleading comment above the spend line ("printed on a dry run too") is corrected.
- **§C140 ㉔ will change what is sent** (each label both alone and joined). Because the count is derived from the
  translate leg's own export, ㉔ changes it in one place; a test pins that the driver's count equals the translate
  leg's plan count for the same `blocks.json`.

## 5. Testing

**Python** (script tests in `experiments/figure-text-translation/`; not run in CI, so `ALL PASS` is recorded in the
evidence):

- `test_readlayer.py`, planted fonts: `[56 /H11034]` with no ToUnicode reads `°` and counts a repair ·
  **controls:** the same font with a ToUnicode map, and `/degree` (which pdfminer maps) — no repair · an unknown
  H-name gives `(cid:56)` and the block is held through the existing path · an ambiguous code fails closed · a second
  font in the same figure is untouched.
- `test_sources.py`: Letter PDF + same-stem EPS → the EPS · Letter only → refused with candidates · A4 landscape →
  refused · a 468×576 pt figure resolves (control) · a page in `updates-2e` with a figure in `first-edition` →
  refused, no cross-edition fall-through · superseded → refused with its reason · DOS EPS header · unreadable size →
  resolves and is flagged.
- `test_figure_prepare.py`: the glyph counters reach `prepare.json`.

**JavaScript** (CI): extend both fake spawns so `resolve` can return a refusal and `prepare` can write
`blocks.json` with send flags and the glyph counters.

- A refused figure is `unresolved`, named apart from holes, and `countOf('translate') === 0`, **paired with a
  control figure bought in the same run** · the de-hash retry skips it · the still-mapped line appears with a mapping
  row and not without one (control).
- The dry-run list and total come from a `blocks.json` holding a duplicate key (the de-duplication is the control),
  and equal the translate leg's own plan count for that file · the live line carries the same numbers.

## 6. Verification on the corpus — 0 ISK, frozen, predictions first

A `PREDICTIONS.md` is written before each run, and amended rather than overwritten.

1. **Keys do not move:** re-prepare all 34 bought figures before and after the change; `blocks.json` byte-identical,
   and zero glyph repairs.
2. **Detector unchanged:** the corpus census still finds exactly the 4 font records; repairs fire in PentIso (3) and
   Amontons2 (2).
3. **Dry runs:** ch10 (PentIso `36 °C` sendable, repair named, would-buy list) · ch09 (Amontons2 `−100`, `−50`) ·
   ch11 (rvosmosis refused as a production page, still-mapped line) · ch18 (N2O5 resolves to its EPS → `copied-photo`,
   still-mapped line) · **control:** ch05, no refusals, and a would-buy list whose figures are exactly its
   `translated` figures without a sidecar.
4. Python `ALL PASS`; the full root `npm test` compared **by name** with `main`'s baseline.

## 7. Out of scope — logged, not built

- Retiring the two live June sheets — a publication step [USER] times (S1).
- Cropping rvosmosis to its figure region (S2).
- The `CNX_Chem2e_`-prefixed revisions in `updates-2e` are unreachable by basename lookup (the Color Contrast
  Modified Blackbody among them; `H9261` is already in the table if it becomes reachable).
- Three ch01 figures resolve from a `_preptest` folder.
- BlastFurn's June copy stays mapped although the figure is refused — § 3.5 names it once a run touches ch19.

## 8. Known limits

- The page signal sees only standard paper sizes; a production page saved at a non-standard size is invisible to
  it. Measured instances: 0.
- The repair table knows 3 glyph names; any other fails closed and ships that glyph unbought and undrawn.
- Native TrueType fonts cannot be checked by glyph name (1,088 of 1,092 use `post` format 3); their safety rests on
  the `(3,1)` cmap argument in the evidence, not a per-glyph measurement.
- Python tests are not in CI.

## 9. Documentation

Campaign register §C140 ⑦ and ⏩ RESUME · `experiments/figure-text-translation/REGISTER.md` (the "driver spend gate"
row) · the experiment README (read-layer repair, resolver refusal) · `figure-text.config.json` `_supersededArtwork` ·
a frozen evidence folder for the build, citing only files that are in it (§C140 ㉓).

## Amendments — 2026-09-16 (build)

Three refinements the build (Tasks 1–8) made to this design; none change its rulings or its verification plan.

- **(a) `prepare.json`'s glyph fields are lists, not maps.** § 2.4 describes `glyphRepairs`, `glyphUnrepaired`,
  `glyphAmbiguous` as `{name: count}`. The shipped shape (Task 3, `figure-prepare.py`'s `glyph_summary`) is a list
  of objects instead: `glyphRepairs` is `[{glyph, to, count}]` (carrying the replacement so the driver can print
  `H11034 → °` without a second copy of `GLYPH_REPAIRS`); `glyphUnrepaired` and `glyphAmbiguous` are each
  `[{glyph, count}]`. Chosen because a list is stable to iterate and print in the driver without an object-key
  sort, and because `glyphRepairs` needs a third field (`to`) that a bare count map has nowhere to put.
- **(b) Unrepaired and ambiguous glyphs get their own named summary section; the FIGURE still appears on the
  existing "could not read" line.** § 2.4 says the summary prints repairs; it does not say what happens to case (b)/(c)
  glyphs. Task 6 (`tools/figure-run.js`) adds `glyphs NOT repaired — held back and not drawn; add a figglyphs
  entry only with a raster (N):`, listing each figure's unrepaired and ambiguous glyphs by name — separately from,
  not instead of, the pre-existing `blocks the read layer could not read (N) — never bought, so these labels
  ship in English:` line, which an unrepaired glyph still triggers (§ 2.3(b)'s "reuses the existing undecoded path
  unchanged" already implied this). ⚠️ **Only the figure is named on that "could not read" line** — its outcome,
  undecodable and missing-font block counts, and basename — **not the glyph names**, which appear only in the new
  section; so § 2.4's "added by name to the existing 'could not read' line" is met by the new section, not by
  that line (corrected in the fix wave: this item said the glyphs themselves still appear there).
- **(c) The would-buy and live-spend lines are separate from the "bought this run" list, not additions to it.**
  § 4 says the dry-run and live numbers are both printed, the live one "added to the existing 'MT spawned' line
  and 'bought this run' list." Task 7 instead prints `would buy N figure(s): C billable characters, est X ISK at
  list rate` on a dry run and `buyable this run N figure(s): …` on a live run (both from the same `buyable`
  computation, `tools/figure-run.js`), and on a live run separately extends the `MT spawned for N figure(s), C
  billable characters` line with the billable-character count — **without** touching the `bought this run` name
  list. Reason: `spent`/`bought this run` counts only figures the paid stage was started for, and a figure can be
  billable without being spent. ⚠️ **Not because a purchase failed:** `rec.spent` is set *before* the spawn, so a
  figure whose purchase fails is still counted spent. Billable-but-not-spent on a live run means a **pre-spawn
  refusal** in `processFigureLive` — no mapping pre-flight (`failed-publish`), or an unreadable `blocks.json`
  (`failed-mt`) — so folding the two lists together would report a figure nothing was sent for as bought
  (corrected in the fix wave: this item gave a failed purchase as the reason). **Fix wave:** both headlines and
  the live `MT spawned …` characters count and add only figures whose billable size is known, and append
  `(+K figure(s) whose billable size is UNKNOWN)` when K > 0 — an unknown size is never summed as zero.

Added in the fix wave after the final whole-branch review; like (a)–(c), they change no ruling.

- **(d) Every live translated copy that is a whole paper-size sheet is named, whatever the figure's outcome.**
  § 3.5's still-mapped line is keyed on a *refusal*, and § 6.3 expected it for N2O5 too — but N2O5 is no
  longer refused (§ 3.3 resolves it to its EPS), so § 6.3 and ruling S1 ("the two live June sheets are
  **named** in the run report") could not both be met on N2O5; the Task 8 run named rvosmosis's copy and not
  N2O5's. The build therefore reads, for **every** figure record (translated, copied, refused, a hole,
  skipped-current), its live translated copy — the image-mapping row's `outputName`, else
  `media/<basename>_IS.svg`, the lookup § 3.5 already used — takes the root `<svg>` viewBox (quote-aware), and
  names each copy whose width × height is a paper size, in a summary section of its own worded for a figure
  that was not refused: `live translated copies that are a whole paper-size sheet, not a figure (N) — this run
  does not retire them; a publication step does:`. A copy whose viewBox cannot be read gets its own line. The
  § 3.5 still-mapped line is unchanged. The paper-size table (§ 3.2) moved out of `sources.py` into
  `experiments/figure-text-translation/figure-text.config.json` (`paperSizes`, `paperTolerancePt`) as its
  single owner; `sources.py` and `tools/figure-run.js` both read it. Measured over every `*_IS.svg` under
  `books/*/media/`: **2 of 692** are paper-size sheets — rvosmosis and N2O5, both Letter — and 0 have an
  unreadable viewBox
  ([`sheet-census.txt`](../../../experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports/after-fix/sheet-census.txt)).
- **(e) § 5's live-mode refusal test was built as a dry-run test.** § 5 asks for a refused figure with
  `countOf('translate') === 0`, paired with a control figure bought in the same run. The shipped test
  (`tools/__tests__/figure-run-free.test.js`, "files a production page unresolved, names it apart from holes,
  and buys nothing") runs `--dry-run` and asserts the **prepare** count instead (every figure but the refused
  one is prepared). That covers the same path: in `runFigures` a record with no artwork — a refusal among
  them — `continue`s before prepare, and so before `processFigureLive`, the only place the paid spawn happens;
  it can never reach it. No live-mode refusal test exists.
