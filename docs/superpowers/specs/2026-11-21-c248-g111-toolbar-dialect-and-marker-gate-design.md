# §C248 + G1.11 — the editor writes the dialect the segment uses, and the save gate guards the bracket markers: design

**Status:** DESIGN, written 2026-11-21 for [USER]'s approval. No plan, no code.
**Register:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` **§C248** and the Skerfur plan's **G1.11**. The register owns status; this document owns the design.
**Builds on:** [`2026-08-12-marker-integrity-design.md`](2026-08-12-marker-integrity-design.md) (§C53, never approved). That spec's rules, taxonomy and module split are reused; §3 below lists every point where this design departs from it, each re-measured on 2026-11-21.

**Provenance.** Every number below was measured on 2026-11-21 at `main` `bda1feb40` (or read-only on production at the same commit) by the scripts in `~/.cache/namsbokasafn-audit/2026-11-21-c46/`, which record their units and blind spots. Nothing is relayed from another document.

## 1. Intent

Editors format text with six toolbar buttons (B, I, T, U, subscript, superscript) and Ctrl+B/I/T. All of them write the **legacy** inline markup: `**x**`, `*x*`, `__x__`, `++x++`, `~x~`, `^x^`. `cnxml-inject.js` converts legacy markup only in a segment with **no** new-format marker (`reverseInlineMarkup`'s `hasApiMarkers` is false); in a segment that carries one, readers get the raw characters. Chemistry's MT is in the new bracket dialect, so every formatting edit in such a segment would publish `**` or `__` to readers.

G1.11 is the other half of the same exposure: the save gate (`server/public/js/segment-validation.js`) protects only the legacy marker forms. A deleted `[[sub:]]`, `[[term:]]`, `[[xref:]]`, an unbalanced `[[`, a marker type nobody knows: all save without a word.

**Why now:** the December pilot puts editors on chemistry's new-format text. Nothing on production is exposed yet (§2.5).

## 2. Measured facts

### 2.1 What an editor-added wrap becomes on the page (probe 2)

English round-trip of chemistry `m68685` in memory (`probe-bracket-wraps.mjs`), one segment with a new-format marker and one with none, each wrap appended with a sentinel word:

| Wrap | Segment with a new-format marker | Segment with none |
|---|---|---|
| legacy `**` `*` `__` `~` `^` | **raw characters** | correct |
| legacy `++` (underline) | correct | correct |
| bracket `[[b:]]` `[[i:]]` `[[term:]]` `[[u:]]` `[[sub:]]` `[[sup:]]` | correct | correct |

`[[term:x]]` without an id becomes `<term>` → `<dfn class="term">`, the same as legacy `__x__` in a plain segment: correct for the T button ("Hugtak"). No arm raised an inject report flag.

### 2.2 Dialects in the MT (census-dialects.mjs; unit: SEG-delimited segments in `02-mt-output`)

| Book | Segments | New-format | Legacy | Neither |
|---|---:|---:|---:|---:|
| efnafraedi-2e | 22,876 | 6,467 | 15 | 16,394 |
| edlisfraedi-2e | 922 | 109 | 0 | 813 |
| liffraedi-2e | 948 | 106 | 0 | 842 |
| orverufraedi | 656 | 201 | 1 | 454 |
| `__e2e-fixture__` | 83 | 0 | 9 | 74 |

Chemistry's 15 "legacy" segments are partly real legacy markup (`NO~3~^-^` in alts and table summaries) and partly a literal `~` meaning "approximately" (`~0,03–0,1 s`); `show-legacy-hits.mjs` lists them.

### 2.3 What converting legacy markup everywhere would change today: nothing (CORRECTED)

✏️ *The first draft said inject would subscript the text between two of chemistry's "approximately" tildes (`~10[[sup:−3]]`, `~150 torr`). That came from a looser pattern than inject's. Corrected the same day and put back to [USER] before approval.*

Inject's own legacy patterns (`reverseInlineMarkup`: bold, italic under the literal-asterisk guard, `__x__`, the isotope line and the general sub/sup lines, which require a non-space before the delimiter, no space inside and at most 15 characters), applied to every new-format segment (`optionb-false-positives.mjs`): **0 matches** in efnafraedi-2e (6,337 segments by unique id), edlisfraedi-2e (109), liffraedi-2e (106) and orverufraedi (201). **Control:** the same instrument over chemistry's other segments finds 165 subscripts and 93 superscripts (`optionb-control.out`). So approach 3 would change no current output. The reasons it is still not chosen are in §3.

### 2.4 Today's marker types (census-marker-types.mjs; `[[type` prefix counts, nesting-safe)

20 types: `sub` 20,600 · `i` 17,832 · `MATH` 9,504 · `sup` 8,985 · `b` 3,068 · `MEDIA` 3,055 · `term` 3,040 · `xref` 2,997 · `docref` 2,169 · `BR` 2,043 · `span` 1,071 · `link` 316 · `em` 235 · `sc` 116 · `u` 98 · `fn` 92 · `rb` 38 · `lb` 37 · `TABLE` 26 · `SPACE` 8. The August taxonomy had 17; `span`, `sc` and `u` (now present) are added. `span`, `sc`, `lb` and `rb` occur only in organic, which is not translated.

### 2.5 Base rates: what each new rule would refuse today

- **Rule 1a as August designed it** (`[[type:` followed by a space ⇒ block): 7 English segments, 2 chemistry MT segments (`m68692:entry:auto-97`, `m68831:para:fs-idp120941520`). **Every one is faithful to the source:** `from<emphasis> argentum</emphasis>` extracts as `from[[i: argentum]]`. The absolute rule would refuse even an unchanged save, and "fixing" the space glues words together on the page (`úrargentum`). → made relative (§4, rule 1a; [USER] 2026-11-21).
- **Rule 1b** (`[[` count ≠ `]]` count): 0 segments in any book's `02-for-mt` or `02-mt-output`.
- **Production's 163 saved edits** (read-only): 0 unbalanced, 0 adding a space-after-colon marker, 0 adding a legacy wrap to a new-format segment. 5 add a legacy wrap, all biology, all pending, all in segments with no new-format marker (where inject converts them).
- **Rule 2 on production's 163 saved edits** (`prod-rule2-census.cjs`, read-only; English found for all 163, the control): 0 fall below the baseline in any structural type, and 0 below min(baseline, English). 0 add an empty marker.
- **Empty markers** (`[[type:]]`): an editor-added one makes `buildCnxml` throw (`Marker residue in injected output`), so the whole module fails to inject (`probe-empty-marker.mjs`; a non-empty arm is the control). A wrap clicked with no selection writes exactly that. In the corpus they occur in organic's English exercises (`lb`/`rb`, legitimately empty) and in one microbiology MT module (`m58805`).

## 3. Approaches

1. **The toolbar writes the bracket dialect, choosing per segment** — **chosen by [USER] on 2026-11-21, and kept after §2.3's correction was put to [USER] the same day.** Bracket markup unless the segment already holds legacy markup and no new-format marker; then legacy. Inject's per-segment rule converts either correctly, so inject and the MT are untouched, and stored text stays in one dialect per segment.
2. **Bracket always.** Simpler; breaks the existing legacy markers of a segment like chemistry's `NO~3~^-^` alts the moment an editor adds a bracket wrap there, because that segment then counts as new-format.
3. **Inject converts legacy markup in every segment.** Changes no current output (§2.3), and needs no toolbar or research-log change. Not chosen: it removes the guard inject keeps on purpose against false conversions in translated text (any future MT or edit with `x~y~` in a new-format segment would convert silently); stored text would mix both dialects inside a segment, which every downstream reader (translation memory, corpus export, the AI review layer, the term check) would then have to handle; and it changes the publish path for every book.

**Departures from the August spec** (each re-measured):
- Rule 1a is **relative** (an edit may not add one), not absolute: §2.5. [USER] 2026-11-21.
- The taxonomy gains `span`, `sc` and `u`: §2.4.
- **The existing atomic rules are not collapsed into rule 2** (August §4.2.1). `math-missing` and `media-missing` compare against the **English**; rule 2 compares against the **baseline Icelandic**. Collapsing would loosen them (an MT that already dropped a `[[MATH:4]]` would stop being caught). They stay as they are; rule 2 covers every other type. Claude's call.
- **api-translate's two type lists are not re-pointed** at the shared taxonomy in this change (August §5.1, open question 3). Both carry meaning specific to the paid MT leg (`KNOWN_BRACKET_TYPES` is deliberately wider), chemistry's MT is frozen for the study, and the corpus-anchored test (`api-translate-span-marker.test.js`) already holds the list that matters closed. Logged as follow-up work. Claude's call.
- **The corpus check (August §6) is not built here.** The save gate protects editing now; the corpus check is a separate consumer with its own allowlist question. Logged as follow-up work. Claude's call.

## 4. Design

### 4.1 One taxonomy: `tools/lib/marker-types.json`

The lead's 2026-08-12 ruling (August §5.1, "share the data, not the code") stands: the type list and tiers have one owner, under `tools/` so a future `tools/` reader needs no MIT → AGPL edge.

| Tier | Types | Invariant |
|---|---|---|
| atomic | `MATH` `MEDIA` `TABLE` `BR` `SPACE` `lb` `rb` | present exactly (existing rules for MATH/MEDIA/BR/SPACE; rule 2 for TABLE/lb/rb) |
| structural | `sub` `sup` `xref` `link` `term` `docref` `fn` `span` | count may not fall below the baseline |
| presentational | `i` `b` `em` `u` `sc` | a fall below the baseline warns |

`span` is structural: it carries organic's reaction colouring, which §C118 established as content OpenStax ships. `sc` is presentational (small capitals). The node side `require`s the JSON. The browser gets it from **`GET /js/marker-types.js`**, a route that serves `window.markerTypes = <the JSON>;` built from the file at request time: no copy, no build step. The editor and localization pages load it before `segment-validation.js`.

### 4.2 `server/public/js/marker-integrity.js` (UMD, like `segment-validation.js`)

Pure functions, no DOM:
- `scanMarkers(text)` → `{ counts: {type: n}, atomic: [exact strings], spaced: n, open: n, close: n, unknown: [types] }`. Counts the `[[type` prefix (nesting-safe; August §2.2's trap). `spaced` counts `[[type: `.
- `isBracketDialect(text)` → inject's `hasApiMarkers` regex, verbatim.
- `hasLegacyMarkup(text)` → the legacy forms that **depend on the segment's dialect** and that writing a bracket marker would therefore break: `**x**`, `__x__`, and inject's own sub/sup patterns (`(?<=[^\s~])~([^\s~]{1,15})~` and the caret twin), with `[[MATH|MEDIA|TABLE:n]]` placeholders removed first. **Not** `*x*` (a literal asterisk, as in `(σ, σ*, π, π*)`, would classify the segment as legacy and make the toolbar write `*x*`, which turns off inject's literal-asterisk guard; builder check Q5) and **not** `++x++` (inject converts it in both dialects, §2.1). `{{i}}`/`{{b}}`/`{{term}}` are new-format by inject's own regex. Claude's calls.
- `wrapFor(kind, currentText)` → `{ open, close }` for `bold`, `italic`, `term`, `underline`, `sub`, `sup`: the bracket pair (`[[b:` / `]]` …) unless `hasLegacyMarkup(currentText) && !isBracketDialect(currentText)`, then the legacy pair (`**`, `*`, `__`, `++`, `~`, `^`).
- `edgeSplit(selected)` → `{ lead, core, trail }`: the selection's leading and trailing whitespace, kept **outside** the pair, so the toolbar never writes `[[b: word]]` (rule 1a would refuse its own output; builder check Q1). Claude's call.
- `checkMarkers(originalIs, editedIs)` → `{ blocked, warnings }` in `validateStructure`'s code shape (§4.3).

### 4.3 The rules, all in `validateStructure`'s existing `blocked` / `warnings` split

| # | Rule | Kind | Outcome | Code |
|---|---|---|---|---|
| 1a | the edit **adds** a `[[type: ` (count above the baseline's) | relative | block | `marker-spaced` |
| 1b | `[[` count ≠ `]]` count in the edited text | absolute | block | `marker-unbalanced` |
| 1c | the edit **adds** an empty marker `[[type:]]`, any type but `lb`/`rb` | relative | block | `marker-empty` |
| 2s | a **structural** type's count falls below **min(baseline, English)** | relative | block | `marker-dropped` |
| 2a | a TABLE/lb/rb exact string in **both** the baseline and the English is missing | relative | block | `marker-dropped` |
| 2p | a **presentational** type's count falls below min(baseline, English) | relative | warn | `formatting-dropped` |
| 3 | a type the taxonomy does not name | absolute | warn | `marker-unknown` |
| 4 | `lb` count ≠ `rb` count | absolute | warn | `marker-lb-rb` |
| 5 | **§C248, both directions:** (a) the edited text is new-format and the edit **adds** a legacy wrap (`hasLegacyMarkup`'s forms, or `*x*`); (b) the baseline was not new-format, the edited text is, and it still holds legacy markup | relative | warn | `legacy-wrap` |

- **Baseline** = the **served base text** (`seg.is`; the `originalIs` argument). Every consumer passes it: the segment pane passes the row's `data-is`, and `servedEdit` and propagation pass `seg.is`. For a pending edit this is the base the edit was made against, not the edit's own text (builder check Q2; the first draft said "the text the editor started from", which is the pane's opening text and differs). Production's saved edits trip no relative rule against it (§2.5).
- **The English floor on rule 2** (builder check Q3, Claude's call): the MT sometimes adds structural markers the English lacks (16 chemistry alts carry `[[sub:` their English does not; inject strips markers from attribute values, so readers never saw them). Counting against min(baseline, English) lets an editor delete what the MT invented, while a marker the English and the baseline both carry stays protected. It only relaxes the rule; production shows 0 hits either way.
- **Additions do not block, with one exception:** an added **empty** marker (rule 1c), because inject fails the whole module on it (§2.5). [USER] 2026-11-21. Every other addition raises a count, and only a fall is checked, which is what lets the toolbar's bracket wraps through.
- **Rule 5(b)** (builder check Q4, Claude's call) catches the reverse of 5(a): a bracket marker typed or pasted into a legacy segment flips it to new-format, after which its existing legacy markup would print raw. The toolbar itself never does this (`wrapFor`).
- **The server enforces `blocked` already** (`servedEdit`, `propagationService`, the localization routes all call `validateStructure`); `warnings` stay advisory (design D3 of SR-OOS-2).
- **Wording:** each new code gets a message in `UI.validation` and an entry in **both** panes' maps (`segment-editor.js` `validateSegmentEdit`, `localization-editor.js`). A code with no entry would throw in the pane, so a test asserts every code `validateStructure` can emit has an entry in both maps (§6).
- Messages name the marker type and say what to do, in the house style (`Stærðfræðimerkið … vantar …`). The legacy-wrap warning tells the editor that the text will show as raw characters and to use the toolbar button instead. **The Icelandic wording needs [USER]'s native read** before merge.

### 4.4 The toolbar

`wrapSelection(textareaId, kind, source)` asks `markerIntegrity.wrapFor(kind, ta.value)` for the pair and `edgeSplit` for the selection, so the buttons and Ctrl+B/I/T write the dialect the segment uses, with edge spaces outside the pair. With no selection it still inserts the pair with the cursor inside; if the editor leaves it empty, rule 1c refuses the save with a message saying to type text inside or remove it. The localization editor has no wrap toolbar (only its pair-name map), so only the segment editor changes.

**Attribute segments (`alt`, `table-summary`):** inject strips every marker from attribute values, so a wrap there reaches no reader. The toolbar stays as it is on those rows (harmless; hiding it is a UI change nobody asked for). Claude's call.

- **The research log:** a `markup-wrap` assist's `detail.marker` is the opening string written (`'[[b:'` instead of `'**'`; `'[[term:'` is 7 characters, inside the vocabulary's 8-character cap). **The values change from the deploy date**; the register records it, and the analysis must read both. The item type and its sources are unchanged.
- **The editor's highlighting** (`marker-highlight.js`) already shows bracket markers; the builder confirms it shows `[[u:`, `[[term:` without an id, and nested markers.

### 4.5 Keeping inject and the browser in step

`tools/cnxml-inject.js` exports its `hasApiMarkers` (a behaviour-identical lift of the inline regex). A corpus-anchored test classifies every segment of every book's `02-mt-output` and `02-for-mt` with both inject's function and `markerIntegrity.isBracketDialect` and asserts agreement, with the control that both classes are non-empty. A list-vs-list test would pass with both sides wrong (CLAUDE.md, the bracket-marker rule).

## 5. Goals, non-goals, anti-goals

- **Goals:** a formatting edit in any chemistry segment reaches readers formatted; a dropped structural marker, an unbalanced bracket or a newly malformed marker cannot be saved; an unknown type and a hand-typed legacy wrap are announced.
- **Non-goals:** repairing existing content (the 2 MT segments with source spaces are faithful and stay); the corpus check; api-translate's lists; the `[#…]` / `[text](#…)` legacy cross-reference rules (untouched).
- **Anti-goals:** blocking an unchanged save (base rates in §2.5 say none of the blocking rules does); converting text that merely contains `*` or `~`; changing what inject or the MT does.

## 6. Testing

Test-first; each test named for the production change that would make it fail.
- **`server/__tests__/markerIntegrity.test.js`:** every rule, each with a control that passes; the nesting control `[[b:Some representations of butane, C[[sub:4]]H[[sub:10]].]]` (balanced, silent); `wrapFor` for all six kinds in a new-format, a legacy and a plain segment.
- **`segment-validation` codes:** every code reachable from `validateStructure` has an entry in both panes' maps (a source-scan test with a control that the scan finds the existing codes).
- **Inject/browser agreement:** §4.5, over the real corpus.
- **The taxonomy route:** `GET /js/marker-types.js` evaluates to the same object as the JSON.
- **E2E (Playwright), with real input:** B, I and T in a new-format row write `[[b:…]]`, `[[i:…]]`, `[[term:…]]`; in a legacy row they write legacy markup; deleting a `[[sub:…]]` shows the block and the save is refused by the server; typing `**x**` into a new-format row shows the warning; a wrap clicked with no selection and saved empty is refused. The fixture book has no new-format segment, so the new-format rows are produced with the existing route-rewrite idiom (`served-base-client.spec.js` `rewriteFirstServe`), not by editing the fixture's files. Existing E2E assertions that the wrap marker is `'**'`/`'*'` move to the bracket values where the row is plain (a plain row now gets bracket wraps), by this design.
- **The literal-asterisk case:** `wrapFor('italic', '(σ, σ*, π, π*)')` returns the bracket pair.
- **Empty markers:** rule 1c refuses an added `[[b:]]` and stays silent on an existing one and on `[[lb:]]`/`[[rb:]]`.
- **Round-trip sentinel:** a test that a toolbar-produced bracket wrap, injected and rendered, reaches the HTML as the element by value (probe 2's arms, committed as a test).

## 7. Risks

- **The research data's wrap-marker values change.** Recorded at the deploy; old and new values describe the same act.
- **A rule too aggressive blocks propagation as well as saves** (August §10). Only rules with a measured base rate of 0 block.
- **`wrapFor`'s legacy branch mis-classifies a segment.** It uses inject's own sub/sup patterns, so a segment classifies as legacy exactly when inject would convert something in it. A misclassification therefore costs at most a legacy wrap where a bracket one would also have worked; the output stays correct either way. `*` is excluded for the reason in §4.2.
- **An empty marker already in a module** (microbiology `m58805`) keeps failing that module's inject, as it does today; rule 1c is relative and does not touch it. Repairing it is content work, out of scope.

## 8. Left to the builder

Message wording drafts (for [USER]'s read); the plan's task order; the exact form of the legacy-wrap count in rule 5(a) (count wraps added, never single characters, so `~10`-style text cannot fire it).

## 9. Builder check (2026-11-21) and Claude's calls

A fresh reviewer read the first draft as its builder. Its five questions, with what was done:

1. **Empty markers and edge spaces from the toolbar** → measured (inject fails the module); rule 1c (block, [USER] 2026-11-21) and `edgeSplit` (Claude's call).
2. **Rule 2 on production's saved edits; what "baseline" is** → measured, 0 hits; the baseline is the served base (§4.3), corrected.
3. **Markers the MT invented in alts** → rule 2 counts against min(baseline, English) (Claude's call); the toolbar stays on attribute rows (Claude's call).
4. **The reverse flip** → rule 5(b), a warning (Claude's call).
5. **Literal asterisks** → `*` (and `++`) out of `hasLegacyMarkup` (Claude's call).

Its note that the fixture book has no new-format segment → the E2E uses the route-rewrite idiom, not fixture edits (Claude's call).

**Also Claude's calls, from §3:** the existing MATH/MEDIA/BR/SPACE rules stay as they are; api-translate's lists are not re-pointed; the corpus check is not built here. **And §2.3 was corrected** before approval, with approach 1 confirmed by [USER] afterwards.
