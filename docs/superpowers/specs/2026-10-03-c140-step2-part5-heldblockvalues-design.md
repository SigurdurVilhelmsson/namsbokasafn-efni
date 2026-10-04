# Part 5: `heldBlockValues` (spec D5(a)). Final design, synthesized

> **FROZEN DESIGN RECORD — banner-dated 2026-10-03.** Evidence, never status: status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊾ and its ⏩ RESUME). If this document disagrees
> with the register, the register wins. It is the design of PR-A's Part 5 (`heldBlockValues`, spec
> `docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md` D5(a)), produced by a judge panel (three
> independent designs, two judges, one synthesis) on 2026-10-03. Off-repo evidence: `~/.cache/namsbokasafn-audit/2026-10-03-step2/`
> (`wf2/` holds all three designs and both judges' scores; `vs-prepare/` and `vs-dump.txt` the real geometry). Two
> corrections were applied when it was committed: open question 6 (Part 3 is verified) and D-h limit 1 (no `--force`
> recipe). One fact was pinned the same day: `figure-run.js --stale --dry-run` files both textless held figures,
> `CNX_Chem_07_04_HNO2_img` (ch07) and `CNX_Chem_18_04_OxStNonmts` (ch18), as `copied-textless`, "would be recomposed
> from source artwork over its existing copy (0 ISK)".

**Basis.** Both judges chose FAIL-CLOSED FIRST (design 3, "D3"). Judge 1 scored it 40 against 38.5 and 38. Judge 2 scored it 38, tied with design 1 ("D1"), and broke the tie on fail-closed plus testability. This design starts from D3. It adopts the grafts that survived my own check of the code and the geometry. It fixes or overrules each judge claim that did not survive (see the last section).

**Re-measured.** I wrote an independent probe, `~/.cache/namsbokasafn-audit/2026-10-03-step2/tmp/p5-synth/probe.py`. Its outputs are `probe.out` (Part 3 simulated) and `probe-head.out` (HEAD). It simulates this design's exact route on the prepared `vs-prepare/<b>/` directories:
- Part 3 is simulated by applying its two textual edits to the real code, not by re-written copies. The first changes `figcontainers` `line_frames` to `own_line_frames` in `cell_alignment` and `open_alignment`. The second is the plan's `visual_lines`, copied verbatim.
- Decoding, the block's own script pool (figscripts' threshold), the per-visual-line cues, `container_for`, `figlayout.decide` and the acceptance predicate all follow D-a to D-c below.
- The glyph check uses `figis.load(...).getBestCmap()`.

Results:
- **13 of 13 changed lines are accepted at source size.** Every number matches all three designs and both judges.
- At HEAD (no Part 3), buffer is refused as `line-count` (value 1, visual 2). Every other row is identical between the two runs.
- `git status --porcelain` was empty before and after. No composer, prepare or driver was run.

Also re-measured:
- Glyphs: ⁰ ⁻ ⁺ ₊ ₋ ☃ U+0F00 are absent from all four pinned faces; ₂ ₃ ¹ ² ³ – − ð are present.
- Dash census over 465 committed sidecars: U+2013 ×43, U+2212 ×0.
- Backslashes: 0 of 2,771 committed sidecar keys contain one.

---

## Measured width table (D-c)

**Method.**
- Measuring context: cairo `FORMAT_A8`, `HINT_METRICS_OFF`, 'Liberation Sans'.
- Weight comes from the visual line's first run. Each segment is measured at size × ratio.
- The width is the sum of the segments as cut by `FS.segments` and `split_at_word_edges`. This is the same computation as `compose.lin_advance` and `seg_width`.
- `decide` is called with ONE visual line's cues: `n_src` 1, `sz0 = FS.body_size(vl)`, that line's own starts and ends, and `projs=[proj(vl[0])]`. It runs inside the BLOCK's `container_for` result.
- Containers are post-Part-3. Every row has `vdisp` 0.00 and a top equal to the source baseline.

| Row | Figure, block | Container (post-Part-3) | Changed line | PDF adv extent | lin before → after | Width budget | decide | Drawn extent | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| A1 | MattType b11 | open, center (no-container) | `No`→Nei, bold 9 | 12.00 | 12.00 → 14.01 | b_i 37.00 (b_ii 168.00) | i, 1 line, 9.0 | 144.70..158.71 @117.89 | fits |
| A1 | MattType b13 | open, center | same | 12.00 | 12.00 → 14.01 | 27.50 (64.50) | i | 45.77..59.78 @66.38 | fits |
| A1 | MattType b15 | open, center (refused: rules-not-spanning) | same | 12.00 | 12.00 → 14.01 | 27.50 (113.25) | i | 281.93..295.94 @66.38 | fits |
| A2 | HNO2_img b8 | open, center | `or`→eða, 9 | 8.00 | 8.00 → 15.02 | 22.50 (23.25) | i | 61.24..76.26 @8.45 | fits |
| A3 | amide1 b1 | open, left (single-flush 1.25 / 60) | `R or H`→R eða H | 26.00 | 26.00 → 33.02 | 99.00 (98.25) | i | 132.76..165.78 @93.49 | fits |
| A3 | amide1 b2 | open, center | same | 26.00 | 26.00 → 33.02 | 186.50 (229.75) | i | 122.00..155.02 @66.12 | fits |
| B6 | amide1 b0, line 1 | open, right (multi, margin 9.75) | `H or R`→H eða R | 26.00 | 26.00 → 33.02 | 85.25 (102.26) | i | 54.25..**87.26** @83.49 | fits; line 0 `C` UNCHANGED, run-exact |
| B1 | MolSpeed1 b13 | open, center | `02 at T = 300 K`→O₂ við T = 300 K | 60.68 | 60.68 → 66.67 | 78.68 (107.43) | i | 124.79..191.46 @83.30 | fits; sub at (0.7778, −0.2222) |
| B2 | phscale b5 | cell, center (margins 1.44); L 21.00, R 69.67 | `100 or 1`→10⁰ eða 1 | 31.91 | 31.91 → 38.93 | 44.67 | fit, 8.9998 (= sz0) | 24.36..63.28 @341.66 | fits; sup at (0.7778, 0.4445) |
| B2 | phscale b87 | cell, center; L 70.67, R 119.34 | same | 31.91 | 31.91 → 38.93 | 44.67 | fit | 74.01..112.94 @35.48 | fits |
| B3 | buffer b23 (2 FT.lines, 1 visual line) | cell, center (single margins 2.28); L 99.72, R 236.72 | whole line | 129.34 | 130.99 → 132.49 | 133.00 | fit, 9.0, disp **+1.24** | **101.72..234.21** @150.37 | fits, 0.51 pt spare; subs (0.7778, −0.3333); charge U+2013 at (0.7778, 0.4444) |
| B4 | OxStNonmts b2, line 1 | cell, center (multi-ambiguous .32); L 131.63, R 202.19 | `To`→til, bold 7 | 8.03 | 8.55 → 6.22 | 66.56 | fit, 7.0 | 163.83..170.05 @59.51 (centred on To's 166.94) | fits; lines 0 and 2 UNCHANGED |
| B5 | OxStNonmts b4, line 1 | cell, center; L 209.63, R 280.19 | same | 8.03 | 8.55 → 6.22 | 66.56 | fit | 241.83..248.05 @59.51 | fits; lines 0 and 2 UNCHANGED |

Notes on the table:
- **Totals:** 13 changed lines in 13 blocks of 7 figures. All 13 are drawn on one line at sz0, with 0 shrinks, 0 wraps and 0 overflows. One line is displaced (buffer). Five lines are unchanged and drawn run-exact: amide1's `C`, and OxStNonmts' `4+`, `4–`, `5+` and `3–`.
- **Why buffer's "before" is 130.99 against a 129.34 extent:** the source kerns the charge back 1.4 pt over its subscript, and the layout draws it after the subscript.
- **Buffer under HEAD's container alignment** (right, multi on 2 FT.lines), as D1, D2 and both judges measured: disp +2.81, landing on the same x0, 101.72. So x0 does not depend on Part 3's alignment edit. It does depend on Part 3's `visual_lines`: without it, buffer is refused as `line-count`, which fails closed.
- **Why OxStNonmts' "before" is 8.55 against an 8.03 PDF advance:** the PDF advance carries a kern pair.
- **Whole-block routes were measured to fail** (D2's probe, adopted as negative controls).
  - `decide` on amide1's whole value gives `['C H eða','R']`.
  - On OxStNonmts it gives `['4+','til 4–']` at an 8.554 pt lead, against the source's 7.0 pt, which moves the unchanged lines.
  - `FS.transfer` styles 0 characters of B1, because the source token is DIGIT `02` and the value has a LETTER O.
- **The anchored-replacement alternative** (D1's measurement) gives the same x0 on 12 of 13 lines. It differs only on buffer, where it crosses the cell rule by 0.82 pt.

---

## D-a. Value encoding

**Choice.** A value is [USER]'s string, kept byte for byte. The Unicode script characters on the sheet are formatting INTENT, decoded by `heldvalues.parse_value`:
- **The closed set** is 24 characters: `HELD_SCRIPT_CHARS = '₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻'`.
- **Lowered:** ₀–₉ (U+2080–2089) become the digits 0–9. ₊ becomes `+`. ₋ becomes **U+2013**.
- **Raised:** ⁰ (U+2070), ¹ ² ³ (U+00B9/B2/B3) and ⁴–⁹ (U+2074–2079) become digits. ⁺ becomes `+`. ⁻ becomes **U+2013 EN DASH**.
- **Any other character in U+2070–U+209F** is refused as `unsupported-script-char`. Every other character, Icelandic letters included, is drawn as written.

A script character is never drawn as its own glyph. It is drawn as its base glyph, in the block's OWN source style of that kind:
- `heldplan.script_pool(block, fonts)` collects every distinct `SourceStyle` in `FS.source_tokens(block, fonts)` that passes a new function, `figscripts.is_script_style(st)`.
- That function is figscripts' own rule restated on a style: `|frac| >= SMALL_SHIFT if ratio < SMALL_RATIO else SAME_SHIFT`. It is placed beside the thresholds, so the rule keeps one owner. Its ratio and frac are rounded to 4 places, as `_analyse` writes them.
- The pool is split by the sign of frac into `sub` and `sup`.
- A kind the value uses must have **exactly one** style in the pool. If it has none, the block is refused as `no-source-script:<kind>`. If it has two or more, it is refused as `ambiguous-source-script:<kind>`.
- A drawn script segment is `size × ratio`, with its baseline shifted by `size × frac`, and it inherits the style's italic bit. This is exactly how the translated path draws a transferred style.

**Reasons.**
- The pinned Liberation faces have no ⁰, ⁻ or ⁺ (re-measured on all four), so literal glyphs would draw missing-glyph boxes. The sheet's reading note says the same.
- ⁻ maps to U+2013 because both ruled charge runs are U+2013: buffer's 7 pt `–` and OxStNonmts' STIX `–`. Over all 465 committed sidecars the formula dashes are U+2013 ×43 and U+2212 ×0. `unicodedata` NFKC would give U+2212.
- Taking geometry from the block's own runs is figscripts' principle: "the source run's OWN, never a constant". The sheet alone carries two subscript offset families, −0.2222 and −0.3333.
- `FS.transfer` cannot be reused: it styles 0 characters of B1 (digit-zero `02` against letter-O `O₂`).
- Measured pools:
  - MolSpeed1: sub {(0.7778, −0.2222)}.
  - phscale: sup {(0.7778, 0.4445)}.
  - buffer: sub {(0.7778, −0.3333)} and sup {(0.7778, 0.4444)}. The charge's style reaches the pool through `token_lines`.
- OxStNonmts' charges (1.0, 0.0714, italic) are italic-only, NOT a script, because 0.0714 < SAME_SHIFT 0.13. They sit on unchanged lines, so this classification is correct.
- Every sheet block has at most one style per kind, so the ambiguity rule is never exercised on the sheet. It refuses instead of guessing (judge 2's defect 4 against D1's tie-break).

**Alternatives rejected.**
- Literal script glyphs: they draw missing-glyph boxes for ⁰ ⁻ ⁺.
- An ASCII markup such as `_2` or `^0`: [USER]'s values would have to be re-encoded, which the API-only rule forbids.
- `FS.transfer`: fails on B1.
- A constant ratio or frac: forbidden by figscripts' principle.
- A "most characters wins" tie-break (D1): it guesses, so this design refuses instead.
- Drawing an unplaceable mark flat under a NOTE: a ruled value would be drawn degraded.

## D-b. Multi-line values

**Choice.** Lines are separated by `'\n'`. A `'|'` anywhere in a value is refused, in both the JS validator and `parse_value`. Every line must be non-empty and equal to its own `.strip()`.
- **The rule:** the value's line count must equal `len(FT.visual_lines(block))` (Part 3 Task 1). Value line *i* replaces visual line *i*. A mismatch is the compose-time refusal `line-count {value, visual}`, which is fatal.
- **The CI check (validator):** value lines ≤ the key's `'|'`-separated lines. Visual lines merge and never split, so this is a necessary condition.

**Reasons.**
- buffer's key `[CH3CO2H] is 11% of [CH3CO2|–]` is 2 FT.lines but 1 visual line (Δproj 4.0 < 0.6 × 1.222 × 9 = 6.60), and [USER] wrote it as one line.
- OxStNonmts has 3 visual lines (Δ 7.0 > 5.13) and amide1 `C|H or R` has 2 (Δ 9.96 > 6.60). Both match the sheet's stacks.
- `'\n'` is deliberately NOT the key's `'|'`. The one ruled row whose FT and visual structures differ is buffer, so a value copied in the key's shape would be wrong exactly there.
- With `'|'` banned from values, the validator catches in CI both the sheet's Markdown `'\|'` artefact in a VALUE and a key-shaped value.
- Edge whitespace is refused because a value line `'4+ '` would fail the unchanged test (D-c) and quietly re-lay a line [USER] did not change.

**Alternatives rejected.**
- `'|'` as the separator (D1, D2): it mirrors the key, and a key-shaped buffer value is then caught only at compose.
- Counting lines against FT.lines: it forces [USER] to break `[CH₃CO₂⁻]` at the charge.
- A JSON array of lines: `normalise_block_value` already treats a list as the dead legacy pre-split shape.
- A free line count re-wrapped by `decide`: `decide` has no forced break (pinned fact 1).

## D-c. Drawing route (per visual line, all-or-nothing)

**Choice.** A new pure function, `heldplan.plan_block(...)`, plans the whole block before anything is drawn. If any refusal fires, nothing from the value is drawn.

**Unchanged line.** A line is unchanged when its decoded text (script marks ignored) equals either the visual line's joined source text or the joined text of its slice of `localise_block(b)`. That slice is drawn with `draw_run_exact`: the same call, on the same runs, as today, so it is byte-identical by construction.
- `localise_block(b)` is computed once for the whole block, as today.
- Slices are contiguous: `FT.lines` buffers consecutive runs and `visual_lines` merges consecutive lines, so the offsets are cumulative `len(vl)`.

**Changed line.** A changed line is laid out by `figlayout.decide` with that ONE visual line's cues, inside the BLOCK's `container_for` result:
- The cues are `n_src=1`, `sz0=FS.body_size(vl, fonts)`, `starts=[min along]`, `ends=[max along+adv]` and `projs=[FT.proj(vl[0])]`.
- The width function is `seg_width` with run `vl[0]`, which also supplies the font and the fill. This is Part 3's per-line convention.
- The line is drawn by the translated path's segment loop, extracted unchanged into `draw_layout(layout, run_for_line, rot)` and called by both paths. Items keep `path='layout'`, so svgout draws them with `font-kerning:none` (ruling 2026-09-17) and they match the linear measure.

**Acceptance (refuse shrink).** A changed line is accepted only when all of these hold: `len(layout['lines']) == 1 and layout['size'] == sz0 and layout['overflow'] is None and layout['step'] in {'i', 'ii', 'fit'}`.
- Displacement is allowed: open step ii, and the cell clamp.
- The step check is load-bearing, because a box/cell `floor-overflow` can carry `overflow None`.
- Exact float equality is safe, because `size_steps(sz0)[0]` IS `sz0` (phscale's 8.9998 passes).
- Anything else is refused as `does-not-fit {line, step, size, lines}`.

**Guards, checked in this order, each fatal:**
1. `arc` (`FT.is_arc`, degenerate or not).
2. `line-count`.
3. `no-change`: every line decodes as unchanged, so the entry draws nothing ruled.
4. The container, fetched lazily and once:
   - `box-multiline` when the container is a `box` and the block has more than one visual line. `decide`'s box branch puts `top` at the box centre and ignores `projs` (figlayout.py, the `cls == 'box'` branch; judge 2 measured top 133.03 against proj 150.37).
   - Then `container-error` when `why` starts with `error:`.
5. Per changed line:
   - `opens-styled`: the characters of vl[0] carry a style.
   - `italic-not-carried`: the line holds an italic-only styled run, which the encoding cannot express.
   - `no-source-script` / `ambiguous-source-script`.
   - `no-glyph:U+XXXX`, via `has_glyph(ch, bold, italic)` over the face the segment draws in.
   - `does-not-fit`.

**Reasons.**
- All 13 rows fit at source size (table above), so none of the guards fires on the sheet.
- The per-line anchor keeps amide1's `H eða R` right-aligned at its OWN end, 87.26, where the bond meets it. A block-level anchor would sit at max(ends) = 104.53, a 17.27 pt move onto the structure.
- For a one-line block this route IS the translated path (same cues, container, width and `decide`) and differs only in the acceptance rule. Anchor, clamp and vertical clamp therefore keep one implementation.
- Shrink is refused (judge graft (b), from both judges). A held value is a ruling, measured to fit at source size, and a size change is a fidelity change for [USER] to decide by rewording.
- D3's `no-base-run` is replaced by `opens-styled`. It is simpler, it matches Part 3's `fr = vls[j][0]` convention, and no sheet row reaches it. Review Focus 3's shape stays a refusal.
- Making the planner a pure module is what makes every refusal unit-testable. `compose.py` draws at import time and cannot be imported (test_blockkey_consumers says so).

**Alternatives rejected.**
- The whole value through the translated path: measured to give the wrong breaks for B4–B6, and it re-lays unchanged lines.
- A forced-break parameter in `figlayout.decide`: it touches a pure module with a 176-block equivalence contract, for 3 rows.
- A hand-anchored replacement: a second copy of `decide`'s anchor and clamp rules, and it overhangs buffer's cell by 0.82 pt.
- Accepting shrink or overhang under a NOTE (D3): a ruled line would be drawn smaller than its source.
- Per-run word substitution: `at`→`við` (+4 pt) collides with the following words.

## D-d. Report and verify contract

**compose-report.json** gains these fields:
- `held`: `[{key, block, changed: [visual-line indices]}]`, in draw order WITH multiplicity.
- `heldErrors`: `[{key, block (int, or null for no-block), reason, ...detail}]`.
- `heldValuesPath` and `heldConfigPath`: both `null` when compose ran without `--held-values`.

How the existing lists change:
- A HELD key is NOT appended to `missing`, `translated`, `identity` or `runExact`. The `runExact` comment becomes "every kept block drawn wholly run-exact".
- A REFUSED held block is drawn run-exact in its source text, exactly as today (never erased), and is appended to BOTH `missing` and `heldErrors`.
- The unchanged lines of a held block feed `undecodable` and `localized` per drawn run, as today, and their STIX runs are counted as today. An eligible STIX run on a changed line is named in `STIX['skipped']` with reason `held`.

**The figure-compose.py pre-flight.** `load_held(out_dir, blocks, tr, config_path)` runs before any spawn. It raises `ComposeError` when:
- meta.json has no string `source`;
- the config's `heldBlockValues` is not an object;
- this figure's entry is malformed;
- a configured key matches no block in blocks.json ("renamed or re-extracted — the ruled value would never be drawn");
- any block carrying a configured key is `send:true`;
- a configured key is also in the `--translations` file (two authors for one label).

**`verify(report, blocks, translations, held=None)`.** `held` is this figure's `{key: value}`. Its default is `{}`: a caller that forgets it refuses any drawn held value (fail-closed), and section 8's existing calls keep their signature. The checks run in this order:
1. **Blocks.** The blocks multiset check, unchanged.
2. **The held contract.**
   - If `held or report.get('held') or report.get('heldErrors')`, then `report['held']` and `report['heldErrors']` must be lists of dicts, each with a string `key`. Otherwise it raises "compose.py and this wrapper have drifted". `heldErrors` is in the trigger so that a report carrying refusals but no `held` list cannot pass when nothing is configured.
   - A non-empty `heldErrors` raises, naming every `{key, block, reason}`. This includes a compose-side `no-block` or `in-translations` entry, which only a hand-run can reach, because the pre-flight refuses both before any spawn. Those cases have ONE verdict: step 2 raises before the multiplicity check.
   - `drawn_held = Counter(h['key'] for h in report['held'])` must equal `Counter({k: declared[k] for k in held})`. This is the double-entry check against blocks.json's multiplicity. It catches a composer that ignored `--held-values`, dropped a twin, or drew an unconfigured key.
3. **Money.**
   - `over = drawn_held − never_bought`. If it is non-empty, verify raises "drawn from heldBlockValues for block(s) blocks.json marks send:true". This never uses the `held_but_drawn` wording.
   - Then `expected = never_bought − drawn_held`, and `kept_english = Counter(report['missing'])` is compared against `expected`. The existing `absent` / `unusable` / `held_but_drawn` branches and their wording are unchanged, computed against `expected`.

**`read_report`** is unchanged: it still requires only `blocks`, `missing` and `translated`. Verify step 2 demands the two held lists, and only when values are configured, so a report from an older composer with nothing configured still composes (tests 11c/11d stay green).

**COMPOSE_NOTES and COMPOSE_NOTE_LISTS.** The Python `COMPOSE_NOTES` and the JS `COMPOSE_NOTE_LISTS` (`tools/figure-run.js`, now exported) both become `('unformatted', 'overflow', 'localized', 'containerErrors', 'held')`.
- `success_payload` copies `held` verbatim. This meets the stub's "reports each substitution in compose.json".
- `heldErrors` is never a note, because it is fatal at verify.
- `heldConfigPath` stays out of compose.json, because test 11b pins `set(d) == {'outputPath', *COMPOSE_NOTES}`.

**Stdout.**
- The `!! N block(s) with no translation - ENGLISH KEPT:` block lists `missing`. That no longer contains held keys, so the log tells the truth.
- Two new sections are printed directly after it, each opening with `'\n'`, because test_blockkey_consumers parses from the `!!`…`no translation` header to the first blank line:
  - `NOTE (not a failure): K label(s) drawn from heldBlockValues ([USER]'s values):`, followed by `'key' block N: lines [..]`.
  - `!! R heldBlockValues entr(ies) NOT drawn - figure-compose.py refuses this figure:`, followed by `'key' block N: reason detail`. The phrase `no translation` must not appear in it.
- The closing line gains `, K held` only when K > 0. Nothing parses that line (grep finds only frozen copies of compose.py).

**Driver (`tools/figure-run.js`, `tools/lib/figure-outcomes.js`).**
- A new filter, `figuresWithHeldValues(figures)`, selects `(outcome === 'translated' || (outcome === 'copied-textless' && published)) && composeNotes.held.length`. It is not `figuresWithComposeNote`, which keeps only translated figures (the ㊹ shape) and would hide the textless figures HNO2_img and OxStNonmts.
- `summarise` gets a section headed `labels drawn from heldBlockValues ([USER]'s values), by figure`, which prints `basename: "key" block N`.
- `verdict` gets `extra.heldFigures` and a NOTE: `N figure(s) drew labels from heldBlockValues ([USER]'s values) — the report names each`. It is never fatal.
- A refusal reaches the driver as `failed-compose`. Its `rec.reason` is figure-compose's message, naming every key and reason. Readers keep the previous copy, and the run is red.

**Reasons.**
- Pinned fact 3, plus the spec's rule that a substituted key is never `held_but_drawn`.
- Moving held keys OUT of `missing` keeps stdout and `missing` truthful; D2's in-`missing` version makes them lie. The SUM check (missing + held == send:false) keeps the money check exact, and the multiset arithmetic keeps MattType's ×3 exact.
- The independent double-entry check is the only design in which compose cannot grade its own homework (judge 2).
- A figure-fatal refusal is a recoverable state at 0 ISK: one config edit and a rerun. The sidecar keeps '4', the figure stays stale, and readers keep the earlier copy.

**Alternatives rejected.**
- Keeping held keys in `missing` (D2): stdout and `missing` lie.
- `heldErrors` as a NOTE: a ruled value fails under VERDICT ok.
- D1's run-fatal-but-publish: media would be written under a red verdict.
- Adding `heldErrors` to COMPOSE_NOTES: it is fatal, so it is not a note.

## D-e. Plumbing

**Choice.** figure-compose.py is the single choke point and the single reader of the config.
- **Config path.** A new argparse flag, `--config`, defaults to `heldvalues.CONFIG_PATH` (`HERE/'figure-text.config.json'`, the same file `sources.load_config` reads). It is test-only. The driver never passes it, so `composeFigure`'s argv and the paid and free harness pins do not move.
- **Basename.** `basename = Path(meta['source']).stem`, read strictly. This is the derivation in `publish-figure-svg.js` `basenameFromMeta`. The publisher refuses `basename-mismatch` against the same rule, so a figure drawn with another figure's values can never publish.
- **Table and entry.** `heldvalues.load_table(config)` refuses a non-object (or null) table: a table that cannot be read is never read as empty (sources.policy's R3). `heldvalues.for_figure(table, basename)` takes the EXACT-basename entry and parses only that entry. So a malformed entry for another figure never breaks this one; the validator catches it in CI.
- **The file hand-off.** `compose()` unlinks `DERIVED_OUTPUTS` (which gains `held-values.json`) and only then writes `<out>/held-values.json`, containing `{basename, configPath, values}`. The file is written even when `values` is `{}`. `run_compose` always passes `--held-values <path>`.

compose.py:
- **The flag.** The path is resolved and the file read ONLY when not `--control`. The `CONTROL` test comes first, so under `--control` a nonexistent or malformed path is not an error (CH6). Outside `--control`, compose **raises** before anything is drawn if the file is missing, unparsable or malformed, or if its `basename` differs from `Path(meta['source']).stem`.
  - The result is exit 1, no report, and figure-compose refuses with `wrote no compose-report.json`.
  - This follows the `load_page` precedent, and compose.py keeps its "no exit call at all".
- **Absent flag.** With no flag, `HELD = {}` and compose behaves as today.
- **Under `--control`.** The file is not read at all: `HELD = {}`, and `heldValuesPath` is null.

The three driver routes:
- **Sidecar recompose:** `composeFigure` → figure-compose `--translations <sidecar>`.
- **Textless:** `recomposeTextless` writes `{blocks:{}}`, so every block misses and the held ones are drawn from the values. verify then checks missing + held == every block.
- **Buy:** step 9 composes against the just-minted sidecar, whose keys are send:true only. The pre-flight guarantees the held keys are send:false.

All three routes get the values with **zero driver plumbing**.

**Reasons.**
- Pinned fact 2: every driver route goes figure-compose.py → compose.py.
- A flag the driver would have to remember on two call sites is how a route gets forgotten.
- **Rejected: judge 1's graft (5)**, in which compose reads the config, or warns, when run without `--held-values`. About 25 frozen evidence instruments, `test_blockkey_consumers`, `test_compose_t23` and `test_compose_runexact` spawn compose.py directly. A config read in compose would silently change their output for any configured figure. The by-eye route is `figure-compose.py --out <dir> --translations <file>`, and `heldValuesPath: null` in the report shows when a direct run drew no values.
- The basename cross-check inside the file stops a leftover `held-values.json` in a reused directory from drawing another figure's values.
- `heldvalues.py` is stdlib-only and imports no `_deps`. So figure-compose's isolation (its docstring, and test_figtext_out's OUT_IMPORTERS) is unchanged. This applies judge 2's correction (k).

**Alternatives rejected.**
- compose reads the config itself (D1, D2): see the rejected graft above.
- The driver passes the values: JS plumbing on two routes.
- A `FIGTEXT_CONFIG` environment variable: `defaultSpawn` merges `process.env`, so an export in a shell leaks onto the driver.

## D-f. Failure modes (behaviour, and why)

Every failure below costs 0 ISK to retry, and a refused figure's readers keep its previous copy.

1. **A configured key matches no block.** The figure-compose pre-flight raises a `ComposeError` naming the basename and key ("renamed or re-extracted"), and nothing is spawned. In a hand-run of compose.py, `heldErrors` gets `no-block` (block null) after the loop. *Why:* a moved key would otherwise silently stop drawing a ruling.
2. **The key is send:true.** The pre-flight refuses it, and verify's `over` check repeats the check as a belt. The validator also catches keys that are already in the committed sidecar, in CI. *Why:* a value must never mask a bought or buyable label.
3. **The key is also in the translations file.** The pre-flight refuses it. In a hand-run of compose, the translation is drawn and `heldErrors` gets `in-translations`. *Why:* two authors for one label; a value never overrides a bought or editor value.
4. **The value's line count differs from the visual lines.** `line-count {value, visual}`, fatal. It is also the measured guard against Part 5 landing without Part 3 (buffer).
5. **The value uses a script kind that has no source run in the block.** `no-source-script:<kind>`, or `ambiguous-source-script:<kind>` when there are two or more styles. *Why:* never a constant, never flat.
6. **An arc block**, degenerate or not: `arc`. The arc path draws one string glyph by glyph and has no lines or scripts.
7. **`--control`.** The values are ignored and not read. Both lists are `[]`, and control.png/.svg are byte-identical. *Why:* control is a faithful redraw of the source, and values have no meaning there.
8. **numloc.**
   - It is NEVER applied to a changed line. `localize` is not idempotent (`1.008→1,008→1.008`), and the value already carries [USER]'s separators.
   - Unchanged lines are localised exactly as today.
   - A value line equal to the localised source text counts as unchanged.
9. **A key that occurs several times (MattType `No` ×3).** One value per key per figure. Every occurrence is planned against its OWN container and drawn independently, so `held` lists the key 3 times. verify requires the drawn count to equal the blocks.json count, and a refusal of any occurrence refuses the figure.
10. **An unlisted `No` (nobelium) elsewhere.** It is unreachable: the lookup is by exact basename and then exact key, and no periodic-table basename is configured.
11. **A multi-line block in a box:** `box-multiline`.
12. **A changed line that does not fit at sz0, or that wraps:** `does-not-fit`.
13. **A glyph missing from the face:** `no-glyph:U+XXXX`.
14. **An italic-only run on a changed line:** `italic-not-carried`.
15. **A changed line whose first run is styled:** `opens-styled`.
16. **A container whose detection raised:** `container-error`. The translated path only NOTEs this; a ruled value refuses.
17. **An entry whose every line decodes as unchanged:** `no-change`. The validator also refuses `value.split('\n').join('|') === key` in CI.
18. **An unreadable config, or a malformed entry for THIS figure:** a `ComposeError`, loud. A malformed entry for another figure is not read.
19. **meta.json without `source`:** refused.
20. **A report with no `held` list while values are configured** (an older composer): refused as drift.
21. **A configured figure that is not composed this run** (skipped-current, kept, retired, superseded, unresolved, or a textless figure with a raster): nothing happens at compose time. The validator refuses the policy-table and row cases in CI; the rest are stated limits (D-h). The records-level NOTE is deferred (see the last section).

## D-g. Validator rule

**Where.** In `tools/lib/figure-config-validate.js` (post-Part-1), `heldBlockValues` stays OUT of `TABLES`, so `reasonOf` and the pin-overlap list are untouched (Review Focus 5). A new `const KEYED = [...TABLES, 'heldBlockValues']` drives exactly three existing loops:
- the type check;
- the fold-within-table check;
- the exactly-one-book check, by exact name and by fold.

Their problem strings come from the same `${name}` template, so Part 1's regexes are unchanged.

**Rules** (problem strings):
- `heldBlockValues must be an object` (an absent table counts as empty; null is refused).
- `heldBlockValues: <a> and <b> fold to the same key`.
- `heldBlockValues.<b> names an image in N books' source …`.
- `heldBlockValues.<b> must be a non-empty object of {blockKey: value}`.
- `heldBlockValues.<b>: a block key must be a non-empty string`.
- `heldBlockValues.<b>[<k>] must be a non-empty string`.
- `heldBlockValues.<b>[<k>] contains '|' — a value's lines are separated by a newline; '|' is the KEY's notation`.
- `heldBlockValues.<b>[<k>] has an empty line, or a line with leading or trailing whitespace`.
- `heldBlockValues.<b>[<k>] has N lines but its key has M source lines` (when N > M).
- `heldBlockValues.<b>[<k>] uses <c> (U+XXXX), which is not a sub/superscript a held value can draw` (any character in U+2070–U+209F that is not in `HELD_SCRIPT_CHARS`).
- `heldBlockValues.<b>[<k>] equals its key — it draws nothing new`.
- `heldBlockValues.<b>: the key <k> holds '\|', a Markdown escape — copy the bare '|'`. The measured base rate is 0 of 2,771 committed sidecar keys containing a backslash.
- **Cross-table, by fold:** `heldBlockValues.<b> is also in <retiredFigures|keptCopies|supersededArtwork> (<key>) — that figure is never composed, so its values are never drawn`. artworkPins is allowed, because a pinned figure is composed.

**Corpus.** `buildValidatorCorpus` adds `heldState`:
- It reuses Part 1's `copyState(cfg.heldBlockValues)` UNCHANGED for `{rows, translatedCopies}`. Part 1's `toEqual` on `keptState` pins `copyState`'s return shape.
- It then augments each entry with `svgRows`, the rows whose `outputName` ends `.svg`. That is the condition `isRecomposableTextless` and the sidecar publish both need.
- It also adds `sidecarKeys`: `Object.keys(JSON.parse(fs.readFileSync(sidecarPath(bookDir, k))).blocks)`, read STRICTLY. ENOENT means null; any other error, a parse failure included, throws, as `readMappingOrRefuse` does. It never uses the lenient `readSidecar`.

The corpus rules are:
- `heldBlockValues.<b> has no image-mapping row naming an .svg — no run recomposes it`.
- `heldBlockValues.<b> has no translated copy at the top of its book's media/`.
- `heldBlockValues.<b>[<k>] is a bought block in figure-text/<b>.is.json — edit its value there (figure review), not here`.

The rule reads `(corpus.heldState || {})[k]`, so Part 1's fixtures, which carry no heldState, still pass.

`HELD_SCRIPT_CHARS` is exported. It is a SECOND implementation of `heldvalues.HELD_SCRIPT_CHARS`, so both tests pin the same literal, following the normkey / test_sources precedent.

The committed config ships `"heldBlockValues": {}` plus a `_heldBlockValues` doc string. They are inserted after `"_artworkPins"` and before `"paperSizes"`, an anchor Part 1 does not touch. The doc string covers:
- the shape, the `'\n'` line separator, the 24 script characters and the visual-line rule;
- that values come from [USER] only, citing the value sheet;
- that a value never overrides a translation;
- that values sit outside renderHash, and the 0-ISK route for a later change;
- which checks run in CI and which at compose.

**What it can and cannot check.**
- CAN: the owner book, the .svg row, the translated copy, the policy overlaps, a collision with a bought sidecar key, shape and encoding, and the line upper bound.
- CANNOT: that the key exists in the current read layer, its send flag, the exact visual line count, script availability, glyph coverage, fit, or whether the block is an arc. `blocks.json` is generated from artwork outside the repo. Each of these is refused by name at compose time, before anything publishes.

**Part 1 stays green.**
- TABLES, `reasonOf` and `copyState` are unchanged.
- The KEYED loops emit the same strings for the existing tables.
- Part 1's `baseCfg()` and `baseCorpus()` are NOT modified. The held tests build `{...baseCfg(), heldBlockValues: …}` and `{...baseCorpus(), heldState: …}`. So graft (i), Part 1's "none of the four tables" CONTROL, is moot and stays untouched.

All 7 PR-B figures pass by measurement:
- Each has exactly one `<b>_IS.svg` row.
- None of the 9 keys is in its sidecar (MattType, amide1, MolSpeed1, phscale and buffer are at composedVersion '4').
- The line bounds hold: buffer 1 ≤ 2, OxStNonmts 3 ≤ 3, amide1 2 ≤ 2.
- None is retired, kept or superseded.

## D-h. Limits, in words

1. **Values are outside renderHash and composedVersion.** Adding or changing one never makes a figure stale, and an approval does not certify a held label.
   - For a SIDECAR figure (MattType, amide1_img, MolSpeed1, phscale, buffer), a later value change does NOT reach media on a `--stale` run: the figure reads `skipped-current` once its sidecar carries the current composer version. **Today the only sanctioned route is the next COMPOSER_VERSION bump.** A per-figure `--stale --force` recompose would mechanically reach it at 0 ISK (`--stale` selects a sidecar figure, `--force` lifts only the `skipped-current` mark, and the spend site throws under `--stale`), but the register and the step-2 spec say never `--force`, so that route **needs a [USER] ruling before any such run**. A held-values stamp checked by `isStale` is the real fix (open question 3) and is out of PR-A's scope.
   - For a TEXTLESS figure (HNO2_img, OxStNonmts) there is no stamp, so the next `--stale` run of its chapter recomposes it.
   - Either way, readers see the change only after step 3's re-render and [USER]'s sync.
2. **Editors cannot see or edit held labels.** The review panel lists `sidecar.blocks` only, which are send:true keys, and it cannot add a key. A correction is a [USER] config edit plus the route in limit 1.
3. **A direct `compose.py` run without `--held-values` draws held labels in English.** By-eye checks go through `figure-compose.py`. The report's `heldValuesPath: null` shows when values were not drawn.
4. **The encoding carries sub- and superscripts only, not italics.** A changed line with an italic-only run is refused. Italics survive on unchanged lines, and a decoded script inherits its source style's italic bit.
5. **A held stacked charge is drawn AFTER its subscript.** buffer's source kerns the `–` back 1.4 pt over the `2` (the `2` spans 222.08–225.97 and the `–` starts at 224.58). This is ②'s limit for every translated stacked charge, and it is what this layout draws.
6. **One value per key per figure.** Values bypass the MT, the glossary, TM and the corpus exports by design: they are [USER]'s rulings, the API-only rule's person exception.
7. **A held figure's SVG bytes change** in its embedded FigIS subset, which gains new characters such as ð. So identity is asserted on `<text>` items and pixels, never on whole SVG bytes. No face appears or disappears on the 7 figures.

## D-i. Red-first tests

Each test fails on the post-Parts-1–4 tree unless it is marked CONTROL.

Values are ASCII sentinels (`QZX`, `QZQ`), except buffer's, which quotes the value sheet's B3 verbatim as evidence (Global Constraints allow it). The 0.51 pt fit margin is part of what that test pins. Real geometry is read from the committed `held-geometry.json` (edit 0).

**The split between files is deliberate.**
- Absolute placements (x0, extents, cell clamps) depend on the REAL figure's container. They are asserted in `test_heldplan.py`, against the committed real container dicts.
- The end-to-end `test_compose_held.py` plants runs onto the FIXTURE artwork, whose containers differ. It asserts only container-independent and relative properties, after a precondition that the block's container class there is the one the assertion assumes. The precondition reads the `HELD` report line, which carries `[cls step]`.

**`experiments/figure-text-translation/test_heldvalues.py`** (NEW; pure, stdlib only)
- **HV1** — `HELD_SCRIPT_CHARS` equals the literal `'₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻'`, the same literal as the JS test. `SCRIPT_MAP['⁻'][0] == SCRIPT_MAP['₋'][0] == '–'`. *Kills:* ⁻ mapped to U+2212 or ASCII `-` (NFKC), and the two implementations drifting.
- **HV2** — `parse_value`.
  - `'a\nb'` gives 2 lines. `'₂'` gives `('2', 'sub')`, `'⁰'` gives `('0', 'sup')`, and `'¹²³'` decode as raised.
  - These are refused, with their reasons: `'a|b'` (pipe), `'a\n\nb'` (empty-line), `' a'` (edge-space), `'⁽'` (unsupported-script-char), and a non-string.
  - *Kills:* splitting on `'|'`, and drawing ⁽ literally.
- **HV3** — `load_table`: an absent key gives `{}`; null, a list or a string raises. *Kills:* an unreadable table being read as empty.
- **HV4** — `for_figure`: a malformed entry under ANOTHER basename is never parsed, and a fold twin (`cnx_chem_01_02_matttype`) does not match. *Kills:* one bad entry failing every figure, and fold or prefix matching.
- **HV5** — `write_file` / `read_file` round-trip, and `read_file` refuses a missing field.
- **HV6** (CONTROL) — the committed config's table loads and equals `json.loads(CONFIG_PATH)['heldBlockValues']`, and `CONFIG_PATH` is the file `sources.load_config` reads. Vacuous while the table is empty.

**`test_figscripts.py`, new section HS**
- **HS1** — `is_script_style` is True for MolSpeed1's sub, phscale's sup and buffer's charge, and False for OxStNonmts' `(1.0, 0.0714, italic)`. *Kills:* a sign-only classification.
- **HS2** — every NON-italic style that `source_tokens` emits on the file's committed fixtures (CONJ, BLOOD) satisfies `is_script_style`. *Kills:* a restated threshold that drifts from `_classify`.

**`test_heldplan.py`** (NEW; pure; real runs plus fake container, width and has_glyph)
- **HP1** — MolSpeed1 with `O₂ QZ T = 300 K`: `O` is plain, and `2` gets `(0.7778, −0.2222, False)`. *Kills:* the `FS.transfer` route (measured 0 styled characters) and constant geometry.
- **HP2** — phscale with `10⁰ QZ 1`: `0` gets `(0.7778, 0.4445)`. *Kills:* a sub/sup swap.
- **HP3** — buffer with B3 verbatim: ₃ and ₂ get `(0.7778, −0.3333)`, and ⁻ becomes `'–'` with `(0.7778, 0.4444)`. *Kills:* NFKC and literal glyphs.
- **HP4** — MattType with `Q₂` gives `no-source-script:sub`. *Kills:* a constant fallback, and flat drawing.
- **HP5** — a planted block with two subscript families and `₂` gives `ambiguous-source-script:sub`. *Kills:* take-first and most-characters.
- **HP6** — OxStNonmts with `4⁺\nQZQ\n4–` gives `no-source-script:sup`. *Kills:* reading the italic-only charge as sup.
- **HP7** — a 2-line value on buffer gives `line-count {2, 1}`, and a 2-line value on OxStNonmts gives `{2, 3}`. A 1-line buffer value is accepted. *Kills:* FT.lines counting.
- **HP8** — OxStNonmts' plan is `('runs', drawn[0:2])`, `('layout', …)`, `('runs', drawn[3:5])`. *Kills:* re-laying unchanged lines, and wrong slice offsets.
- **HP9** — numloc, on a planted `2.54 cm` block. The value line `2,54 cm` is unchanged and planned as runs. The value line `2.54 QZ` is changed, and its words read `2.54` verbatim. *Kills:* localising the value, and failing to accept the localised source form.
- **HP10** — a fake `box` container with a 2-visual-line block gives `box-multiline`. A 1-line block in the same box is accepted (CONTROL). *Kills:* box-centre drawing over neighbours.
- **HP11** — `does-not-fit`, in three arms. Each refusal carries step and size.
  - A long sentinel on buffer.
  - A fake width under which `decide` would shrink. *Kills:* accepting shrink.
  - A 7 pt open label that overflows at its own floor.
- **HP12** — `opens-styled` (a planted line opening with a 7 pt raised run) and `italic-not-carried` (a planted italic body run).
- **HP13** — `no-glyph`, with `has_glyph` returning False, names the code point.
- **HP14** — `arc`, `no-change`, and `container-error` (a fake `why='error: KeyError'`).
- **HP15** — all-or-nothing: a 3-line block whose line 2 refuses raises, and no plan is returned. The container thunk is called at most once, and never on a `no-change` block.
- **HP16** (REAL PLACEMENTS) — `plan_block` is run for each of the 13 changed lines and must give the D-c table's step, size, x0, extent and top within ±0.01. That includes buffer's cell clamp (disp +1.24, 101.72..234.21) and amide1's right edge, 87.26.
  - **Inputs:** the committed real runs, the committed real (post-Part-3) container dict, and a test-local cairo `HINT_METRICS_OFF` width.
  - **The width** is the same 10 lines as `compose.lin_advance`, pinned by asserting `No` bold 9 = 12.00, `Nei` = 14.01 and B3 = 132.49.
  - *Kills:* any drift between this design's numbers and the implementation, including a block-level anchor.

**`test_compose_held.py`** (NEW; end to end)

Set-up: compose.py runs with `--held-values` on `fixtures/fixture_figure.pdf`, prepared with `--basename`, with runs.json replaced by REAL geometry and the meta fonts patched (the test_compose_visual_lines pattern). Each arm also runs with NO flag, as "today".
- **CH1** — MattType's three `No` (real b11, b13, b15) with `QZX`.
  - Precondition: each `HELD` report line says `open`.
  - Exactly 3 layout items `QZX`, bold 9, at baselines 117.89 / 66.38 / 66.38, each centred on its own source centre (151.70 / 52.78 / 288.94, ±0.01).
  - There are 0 `No` items, the `held` keys are `['No','No','No']`, and `No` is not in `missing`.
  - *Kills:* first-occurrence-only, a set where a multiset is needed, and held keys left in `missing`.
- **CH2** — OxStNonmts b2 with `4+\nQZQ\n4–`.
  - Precondition: container `open` or `cell`, alignment center.
  - The items of lines 0 and 2 equal the no-flag run's field for field (path run-exact, x, y, size, bold, italic, rgb, family, order).
  - One layout item `QZQ`, bold 7, at y 59.51, centred on 166.94. No `To`.
  - *Kills:* the whole-block route (measured: `['4+','til 4–']` at an 8.554 pt lead) and a block-centre anchor.
- **CH3** — amide1 b0 with `C\nQZX R`.
  - Precondition: container `open` or `cell`; its multi-line alignment is `right`, taken from its own frames.
  - `C` is identical to the no-flag run, and the changed line's right edge is at 87.26 ±0.01.
  - *Kills:* a block anchor at 104.53, and the whole-block `['C H eða','R']`.
- **CH4** — buffer with B3 verbatim (needs Part 3):
  - ONE drawn line at 150.37.
  - The segments `3`/`2` at 7.0002 pt shifted −2.9997 pt, and `–` (U+2013) at 7.0002 pt shifted +3.9996 pt, after the last subscript. The absolute extent is HP16's, because the fixture has no cell here.
  - 0 characters in U+2070–209F in translated.svg.
  - *Kills:* FT.lines counting (it would refuse), literal glyphs, the wrong charge glyph and constant offsets.
- **CH5** — refusals end to end.
  - `☃` (with a precondition that it is absent from the cmap) gives `no-glyph`.
  - A 2-line buffer value gives `line-count`.
  - In each arm the block's items are identical to the no-flag run, the key is in both `missing` and `heldErrors`, and `held` is `[]`.
  - *Kills:* silent drops, flat drawing and partial application.
- **CH6** (CONTROL) — `--control` with a NONEXISTENT `--held-values` path: exit 0, control.png/.svg byte-identical to `--control` alone, and `heldValuesPath` null. *Kills:* values leaking into the faithful redraw.
- **CH7** (C11) — an empty `values` gives translated.svg and translated.png byte-identical to the no-flag run, and a report identical except for `heldValuesPath` and `heldConfigPath`. *Kills:* the always-passed flag perturbing every figure.
- **CH8** — a nonexistent `--held-values` path without `--control`, and a file whose `basename` mismatches: exit ≠ 0 and no compose-report.json. *Kills:* a missing file read as `{}`, and a stale file in a reused directory.
- **CH9** — test_blockkey_consumers' own parse rule, run over CH1's stdout, yields exactly `report.missing`, and the NOTE section begins after a blank line. CH5's `!!` header does not contain `no translation`. *Kills:* a stdout parse break.
- **CH10** — a key in both `--translations` and the values: the translation is drawn, and `heldErrors` gets `in-translations`.
- **CH11** — a configured key absent from the figure gives `heldErrors` `no-block`, with block null.

**`test_figure_compose.py`** (updated, plus a new section 12)
- **Updates:** the `COMPOSE_NOTES` literal (:77) grows to five, and 11a and 11b now cover `held`. 11b keeps `set(d) == {'outputPath', *COMPOSE_NOTES}`. 11c and 11d stay green, because nothing is configured.
- **F1** — a stale key exits 1. compose.json's error names the key and says `matches no block`, and compose-report.json was never written. *Kills:* a missing pre-flight, or one that runs after the spawn.
- **F2** — a send:true key is refused before the spawn.
- **F3** — a key that is also in the translations file is refused.
- **F4** (CONTROL) — on the committed fixture, configure `{<first single-line send:false non-arc key>: <a sentinel>}`, where the sentinel is asserted, by the same linear measure, to be narrower than the key. The run exits 0, compose.json `held` lists the key once, and translated.svg draws the sentinel at that block's position and not the key. *Kills:* a wrapper that refuses everything.
- **F5** (NOBELIUM) — MattType's planted `No` geometry is prepared under two basenames, each with a blocks.json derived from the runs by `blockkey` (send:false), and the config lists one of them. The other basename's translated.svg is byte-identical to a run with no `--config` entry, and its `held` is `[]`. *Kills:* a global key map that ignores the basename, and fold or prefix basename matching.
- **F6** — with `synth_duplicate`, a configured twin key gives a held count of 2, and a planted report with count 1 is refused.
- **F7** (verify units) — V1 to V6:
  - V1: held send:false keys are subtracted and pass (red on HEAD: `held_but_drawn`).
  - V2: held over send:true gives the new wording, never `held_but_drawn`.
  - V3 (CONTROL): a send:false key in neither list keeps the OLD `held_but_drawn` wording.
  - V4: MattType `No` ×3 with 2 drawn is refused.
  - V5: a report without `held` while values are configured is refused as drift. With nothing configured, a report whose `held` is non-empty is refused, and so is one that carries `heldErrors` but no `held` list.
  - V6: `heldErrors` refuses and names every reason.
- **F8** — meta.json without `source` is refused.
- **F9** — `--config` with `heldBlockValues: []`, with an entry that is a string, or with a value holding `'|'` is refused, naming the entry. A malformed entry for ANOTHER basename does not refuse this figure.
- **F10** (production route, CONTROL) — with no `--config`, held-values.json's `configPath` is `HERE/'figure-text.config.json'` and `values` is `{}` on the committed empty table. Paired with F4.
- **F11** — in process, verify on compose's REAL report from CH1-style planted runs, plus a blocks.json built by `block_key`, raises nothing; a CH5-style report raises (D2's P10). *Kills:* the two halves drifting.

**tools/__tests__ (Vitest)**
- **`figure-config-validate.test.js`:**
  - one refusal row per new problem string;
  - CONTROLs: an absent table and an empty table give `[]`; a held figure that is also pinned passes; a 3-line value on a 3-line key passes; a 1-line value on a 2-line key (buffer's shape) passes;
  - a throwaway-tree `heldState` test covering `svgRows`, a `.png`-row case, `sidecarKeys`, an absent sidecar giving null, and a malformed sidecar THROWING;
  - a committed-config test, vacuous while the table is empty (PR-B adds `expect(keys.length).toBeGreaterThan(0)`);
  - the `HELD_SCRIPT_CHARS` literal pin;
  - Part 1's 76 tests, unchanged and green.
- **`figure-run-paid.test.js`** (:548–557 and the later NOTES assertions): `NOTES` and `EMPTY` gain `held` (red-first). `held` reaches `rec.composeNotes`. `summarise` names held labels for a PUBLISHED copied-textless figure, which kills the translated-only filter. Part 1 Task 2 edits this file first.
- **`figure-run-free.test.js`:** a parity test parses figure-compose.py's `COMPOSE_NOTES` tuple and checks it equals the exported `COMPOSE_NOTE_LISTS`.
- **`figure-outcomes.test.js`:** `heldFigures > 0` gives a NOTE, and `ok` stays true.
- **`figure-text-config.test.js`:** `heldBlockValues` joins the "carries … tables as plain objects" list, and the `_heldBlockValues` doc string is present.

**Required measurements before the PR.** Each has a terminal marker and runs in a subshell with `python3 -u`.
- **The golden suites** print ALL PASS after the `draw_layout` extraction: `test_compose_t23`, `test_compose_runexact`, `test_compose_visual_lines`, `test_figlayout`, `test_figcontainers` and `test_figscripts`. Part 3's V7 still passes, because the translated path passes `lambda j: vls[min(j, len(vls)-1)][0]`.
- **The 27-figure no-op.** Use Part 3 Task 4's `c21_measure.py` `prepare` and `arm`, NOT its `compare`, which encodes ㉑'s 4-block prediction.
  - Run `arm` at the post-Part-4 commit and at Part 5's commit, then `cmp` every `translated.svg` and diff the decide-trace JSON.
  - It covers 27 named figures, not the corpus. Predicted: 0 differences.
  - It proves that the extraction and the no-flag path move nothing.
- **The 8-directory A/B** (D-j).
- **Everything else:** all Python suites, `npm test` (the failing SET diffed by name against main), `npm run lint` and `npm run format:check`.

## D-j. Predicted delta

**PR-A (table empty): 0 changes anywhere.**
- figure-compose always passes an empty values file, and CH7 proves that is byte-identical to no flag.
- The 27-figure no-op proves the extraction moves nothing.
- The 8-directory A/B arm "empty table vs the post-Part-4 figure-compose" gives byte-identical translated.svg on all 8 `vs-prepare` directories.

**PR-B's pass, Part-5-attributable.** This is measured as an A/B within the '5' composer: figure-compose.py with `--config <the sheet's values>` against `--config <empty table>`, on the 8 `vs-prepare` copies. The runs go one at a time with `free -h` between them, and the evidence stays off-repo.

**Exactly 13 lines in 13 blocks of 7 figures change, with 0 `heldErrors`. Everything else is identical.**

| Figure (chapter) | `held` (draw order) | Changed drawing |
|---|---|---|
| CNX_Chem_01_02_MattType (ch01; sidecar) | `['No','No','No']`, b11/b13/b15 | Nei, bold 9, at 144.70..158.71 @117.89, 45.77..59.78 @66.38 and 281.93..295.94 @66.38. Published `>Nei</text>` ×3 and `>No</text>` ×0. **The June regression and the census's positive control.** |
| CNX_Chem_07_04_HNO2_img (ch07; textless) | `['or']`, b8 | eða at 61.24..76.26 @8.45 |
| CNX_Chem_09_05_MolSpeed1 (ch09; sidecar) | `['02 at T = 300 K']`, b13 | Letter O, then `2` at 7.0002 pt shifted −1.9998 pt, then ` við T = 300 K`; 124.79..191.46 @83.30 |
| CNX_Chem_14_02_phscale (ch14; sidecar) | `['100 or 1','100 or 1']`, b5/b87 | `10`, then `0` at 6.9998 pt (8.9998 × 0.7778) shifted +4.0004 pt (8.9998 × 0.4445), then ` eða 1`; 24.36..63.28 @341.66 and 74.01..112.94 @35.48 |
| CNX_Chem_14_06_buffer (ch14; sidecar) | its one key, b23 | ONE line, 101.72..234.21 @150.37 (+1.24 pt in its cell); subscripts 7.0002 pt shifted −2.9997 pt; U+2013 at 7.0002 pt shifted +3.9996 pt, after the last subscript |
| CNX_Chem_18_04_OxStNonmts (ch18; textless) | `['4+\|To\|4–','5+\|To\|3–']`, b2/b4 | Line 1 only: til, bold 7, at 163.83..170.05 and 241.83..248.05 @59.51. The `4`/`+`/`4`/`–` and `5`/`+`/`3`/`–` items are field-identical. `>To</text>` ×0 and `>til</text>` ×2. |
| CNX_Chem_20_04_amide1_img (ch20; sidecar) | `['C\|H or R','R or H','R or H']`, b0/b1/b2 | b0 line 1: H eða R at 54.25..87.26 @83.49, with `C` identical. b1: R eða H at 132.76..165.78 @93.49. b2: 122.00..155.02 @66.12. |

The rest of the prediction:
- **Unchanged by Part 5:**
  - every other block of these 7 figures, compared as `<text>` items because their font subset legitimately changes;
  - CNX_Chem_01_04_MYdCmIn, whose translated.svg is BYTE-identical in both arms (C1–C3 have no entry);
  - every other figure.
- **Driver:** a `held` NOTE in the ch01, ch07, ch09, ch14 (2 figures), ch18 and ch20 runs, and no Part-5 `failed-compose`.
- **Post-pass census over `media/`:**
  - The 7 `_IS.svg` carry each value at those positions, and none reads No/or/To/at/is/of there.
  - **Nobelium control:** `>No</text>` stays at exactly 1 and `>Nei</text>` at 0 in CNX_Chem_01_03_PeriodicPU, 02_05_PerTable1, 06_04_Econtable, 18_01_PeriodicPU3 and 00_AA_PeriodicPU_img, all of which the pass recomposes.
- **Falsified by:**
  - any `heldErrors` entry;
  - a `held` multiplicity different from the list above;
  - any `<text>` difference outside the 13 lines;
  - any U+2070–209F character in those SVGs;
  - MattType still drawing `No`;
  - any change to MYdCmIn's bytes.

---

## File edits, in order (against the tree after Parts 1–4; re-read every anchor before editing)

0. **Evidence.** NEW directory `experiments/figure-text-translation/evidence/2026-10-03-c140-held/`, containing:
   - `README.md`.
   - `vs_dump.py` and `vs-dump.txt`, the human-readable dump, copied from `~/.cache/namsbokasafn-audit/2026-10-03-step2/`.
   - A NEW instrument, `held_geometry.py`. Run it ONCE on the post-Parts-1–4 tree, against the off-repo `vs-prepare/<b>/` directories, one figure at a time. It writes `held-geometry.json`:
     - for each of the 7 figures: `page`, and the `meta.fonts` entries the held blocks use;
     - for each held block: its key, its block index, its `runs` (verbatim from runs.json), its visual line count, and its REAL `container_for` dict (post-Part-3).
   - **The tests read `held-geometry.json`; they never parse the text dump.** The JSON holds OpenStax figure text (CC BY), like the committed code1 runs.json evidence. The instrument writes nothing in the repo except that one JSON, and it runs no composer.
1. **NEW `heldvalues.py`** (stdlib only; no `_deps`):
   - `CONFIG_PATH`, `HELD_SCRIPT_CHARS`, `SCRIPT_MAP`;
   - `HeldValueError(reason)`;
   - `parse_value`, `load_table`, `for_figure`, `write_file`, `read_file`.
   - Then NEW `test_heldvalues.py` (HV1–HV6), written red first.
2. **`figscripts.py`:** add `is_script_style(st)` beside the thresholds. Nothing else changes. Add section HS to `test_figscripts.py`.
3. **NEW `heldplan.py`** (pure: figtext, figscripts, figlayout, heldvalues):
   - `script_pool(block, fonts)`;
   - `HeldRefusal(reason, **detail)`;
   - `HeldPlan(lines, changed)`;
   - `plan_block(block, lines, fonts, drawn, *, is_bold, container, width, has_glyph)`, with D-c's check order and acceptance predicate.
   - Then NEW `test_heldplan.py` (HP1–HP16; HP16 reads `held-geometry.json`).
4. **`compose.py`,** in this order:
   - (a) A docstring paragraph for §C140 ㊾ D5(a), including the by-eye route.
   - (b) After `TR = …`, set `HELD = {}` and `HELD_PATH = HELD_CONFIG = None`. When `'--held-values' in sys.argv and not CONTROL`:
     - call `heldvalues.read_file(...)`, which raises on any problem;
     - also raise when `basename != Path(meta['source']).stem`.
   - (c) Add the report lists `held` and `held_errors`, with contract comments, and reword the `runExact` comment.
   - (d) Extract the translated path's segment loop verbatim into `draw_layout(layout, run_for_line, rot)`. The translated path calls it with `lambda j: vls[min(j, len(vls) - 1)][0]`. The goldens must stay byte-identical.
   - (e) In the main loop's non-CONTROL branch:
     - When `key in HELD and key not in TR`, call `heldplan.plan_block(...)` with these arguments:
       - `b`, `HELD[key]`, `meta['fonts']` and `localise_block(b)`;
       - `is_bold=lambda r: r['font'] in BOLD`;
       - `container=`: a lazy thunk that loads `PAGE`/`DARK` once and returns `FC.container_for(BI, blocks, PAGE, DARK, H_PT)`;
       - `width=lambda ch, size, run: seg_width(ch, run, size)`;
       - `has_glyph=`: the figis cmap, imported lazily.
     - On `HeldRefusal`, append to `held_errors` and to `missing`, then fall through to the kept branch (run-exact, as today).
     - On success:
       - draw each planned line: runs through `draw_run_exact`, keeping the `undecodable`/`localized` bookkeeping; layouts through `draw_layout`;
       - name the STIX runs of changed lines as `held`;
       - append to `held`, add the report line `  HELD …`, then `continue`.
     - `elif key in HELD`: record `in-translations`, and the existing translated path proceeds.
   - (f) After the loop, add `no-block` entries for configured keys never seen.
   - (g) compose-report gains `held`, `heldErrors`, `heldValuesPath` and `heldConfigPath`.
   - (h) Print the two stdout sections, each with a leading `'\n'`, after the ENGLISH KEPT block, and add `, K held` to the closing line when K > 0.
   - Then NEW `test_compose_held.py` (CH1–CH11).
5. **`figure-compose.py`:**
   - `import heldvalues`;
   - add `--config` to `parse_args`;
   - add `load_held(...)`, the pre-flight; blocks.json is now read once in `compose()`, right after `validate_inputs`;
   - `DERIVED_OUTPUTS += ('held-values.json',)`, with the file written after the unlink loop;
   - `run_compose(out_dir, translations, held_path)` passes `--held-values`;
   - `verify(..., held=None)` per D-d;
   - `COMPOSE_NOTES += ('held',)`, with its comment;
   - docstring: "THE THREE ASSERTIONS" (blocks; the held contract; money) and a held paragraph.
   - Then `test_figure_compose.py`: the COMPOSE_NOTES literal, 11a/11b, and section 12 (F1–F11).
6. **`tools/lib/figure-outcomes.js`:** `extra.heldFigures` produces a NOTE; update the JSDoc.
   **`tools/figure-run.js`:**
   - `export const COMPOSE_NOTE_LISTS = [..., 'held']`, with its JSDoc and the `composeNotesFrom` return type;
   - `figuresWithHeldValues`;
   - the `summarise` section;
   - `heldFigures` in the verdict call.
   - `composeFigure`'s argv is unchanged.
   - Tests: `figure-run-paid.test.js`, `figure-run-free.test.js` and `figure-outcomes.test.js`.
7. **`tools/lib/figure-config-validate.js`:**
   - the header line;
   - `KEYED` for the three loops;
   - the heldBlockValues section (shape, encoding, line bound, value≠key, `'\|'`, cross-table and corpus rules);
   - export `HELD_SCRIPT_CHARS`;
   - in `buildValidatorCorpus`, `heldState` via `copyState` plus the `svgRows`/`sidecarKeys` augmentation, importing `sidecarPath` from `tools/lib/figure-text-sidecar.cjs`;
   - the JSDoc.
   - Test: `figure-config-validate.test.js`.
8. **`figure-text.config.json`:** add `"heldBlockValues": {}` and `"_heldBlockValues": "…"` after `_artworkPins`. Update `figure-text-config.test.js`.
9. **Measurements:** the goldens, the 27-figure no-op, the 8-directory A/B (off-repo evidence under `~/.cache/namsbokasafn-audit/<date>-c140-p5/`), every Python suite, then `npm test`, lint and format:check.

**No books/ change, no media, no sidecar and no COMPOSER_VERSION change. The table ships EMPTY.**

**PR-B handoff: transcription rules for the data commit.** Copy the sheet's "Value from [USER]" column BY VALUE:
- A1 is the bare `Nei`, not the italic chat note.
- B3's key is the bare `[CH3CO2H] is 11% of [CH3CO2|–]`, not the Markdown `\|`.
- In B4–B6, ` / ` becomes `'\n'`, and `–` is U+2013, as in the key.
- B1's O is a LETTER.
- C1–C3 get no entry.
- **Detectors:** the validator in CI (`'|'` in a value, `'\|'` in a key, value=key, line bound); the pre-flight's `matches no block` at compose; the by-value census after the pass.

## Open questions I could not settle

1. **`heldErrors` is figure-fatal.** Readers keep the previous copy, and the figure misses the pass's other fixes (such as ㉗ metadata) until the config is fixed and the figure re-run at 0 ISK. The alternative is D1's run-fatal-but-publish. I chose figure-fatal.
2. **Shrink and wrap of a held value are refused.** No row is near the limit; the tightest is buffer, with 0.51 pt to spare.
3. **The records-level "configured but NOT drawn this run" NOTE (D3's D-k) and its `loadHeldBasenames` are deferred.** After PR-B, every sidecar figure with held values is `skipped-current` on every `--stale` run, so the NOTE would print forever. It also could not tell "drawn with current values" from "drawn before the value changed". The real fix is a held-values stamp checked by `isStale`, which touches the publisher and `isStale` and is out of PR-A's scope.
4. **¹²³ are decoded as raised.** A future `cm³` in a block with no source superscript would be refused, rather than drawn with Liberation's literal glyph. There are 0 instances.
5. **Is `'\|'`-in-a-key worth a validator rule?** The base rate is 0 of 2,771. The pre-flight's `matches no block` already catches it, at compose time.
6. ~~Part 3 is drafted but not independently verified.~~ **Corrected 2026-10-03: Part 3 WAS verified the same day** (replicate + skeptic in scratch worktrees; its 0-ISK prediction held, 4 blocks in 2 figures; plan `docs/superpowers/plans/2026-10-03-c140-step2-code-fixes.md` § State of this plan). buffer still depends on `visual_lines` merging its charge line: if Part 3's threshold ever moves, buffer refuses `line-count` (fail-closed); it is never misdrawn.
7. **Should the review panel show held labels read-only?** That is a server change, outside PR-A.
8. **`test_blockkey_consumers` runs compose.py without `--held-values`,** so a future SciMethod entry does not break it. That is by design.

## Judge claims that did not survive (or were corrected)

- **"Corpus-wide c21 harness" (both judges, graft (a)):** `c21_measure.py` covers 27 named figures (RULE_A + KEPT_MERGE + BOUGHT34), and its `compare` encodes ㉑'s 4-block prediction. It is re-used here through `arm`, plus `cmp` and the decide trace, and stated as 27 figures.
- **Judge 1's graft (5) is rejected.** It would have compose emit a NOTE or refuse when `--held-values` is absent but the table has an entry. See D-e: it would make compose read the policy config and change the output of every direct caller.
- **Judge 2: "the records-level NOTE closes the late-value-change gap."** It does not. It cannot distinguish a current drawing from a stale one, so it only nags. Deferred.
- **Judge 2's correction (j) is confirmed:** `--stale` SELECTS a sidecar figure (figure-run.js:2021), and the loop at :2031 marks it `skipped-current`. D3's "deselected" is wrong.
- **Judge 1 on D3's first exit call: confirmed.** compose.py's own comment says "no exit call at all". This design raises instead, and under `--control` it ignores `--held-values` rather than refusing.
- **Judge 2 on figheld pulling figis/`_deps` into figure-compose: confirmed,** and resolved by the stdlib-only `heldvalues.py`.
- **Graft (i), Part 1's CONTROL, is moot:** this design does not touch `baseCfg()`.
- **Every judge measurement I re-ran reproduced:** the 13 rows, buffer at HEAD and after Part 3, glyph coverage, and the dash census, which matches D3's 43/0. I confirmed the box-centre hazard from the code: `decide`'s `cls == 'box'` branch sets `top = (D + U) / 2 + …` and never reads `projs`. The 133.03-against-150.37 figure is judge 2's measurement.
