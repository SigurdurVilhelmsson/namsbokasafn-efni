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

### 2.3 Why inject must not convert legacy markup everywhere

Chemistry's **new-format** segments use a literal `~` for "approximately": `~10[[sup:−3]]`, `~150 torr; (b) ~`, `~28 g) … (~`, `~20%–25% … ~`. A converter applied to them would subscript the text between two tildes. This is the false positive `hasApiMarkers` exists to prevent.

### 2.4 Today's marker types (census-marker-types.mjs; `[[type` prefix counts, nesting-safe)

20 types: `sub` 20,600 · `i` 17,832 · `MATH` 9,504 · `sup` 8,985 · `b` 3,068 · `MEDIA` 3,055 · `term` 3,040 · `xref` 2,997 · `docref` 2,169 · `BR` 2,043 · `span` 1,071 · `link` 316 · `em` 235 · `sc` 116 · `u` 98 · `fn` 92 · `rb` 38 · `lb` 37 · `TABLE` 26 · `SPACE` 8. The August taxonomy had 17; `span`, `sc` and `u` (now present) are added. `span`, `sc`, `lb` and `rb` occur only in organic, which is not translated.

### 2.5 Base rates: what each new rule would refuse today

- **Rule 1a as August designed it** (`[[type:` followed by a space ⇒ block): 7 English segments, 2 chemistry MT segments (`m68692:entry:auto-97`, `m68831:para:fs-idp120941520`). **Every one is faithful to the source:** `from<emphasis> argentum</emphasis>` extracts as `from[[i: argentum]]`. The absolute rule would refuse even an unchanged save, and "fixing" the space glues words together on the page (`úrargentum`). → made relative (§4, rule 1a; [USER] 2026-11-21).
- **Rule 1b** (`[[` count ≠ `]]` count): 0 segments in any book's `02-for-mt` or `02-mt-output`.
- **Production's 163 saved edits** (read-only): 0 unbalanced, 0 adding a space-after-colon marker, 0 adding a legacy wrap to a new-format segment. 5 add a legacy wrap, all biology, all pending, all in segments with no new-format marker (where inject converts them).

## 3. Approaches

1. **The toolbar writes the bracket dialect, choosing per segment** — **chosen by [USER] on 2026-11-21.** Bracket markup unless the segment already holds legacy markup and no new-format marker; then legacy. Inject's per-segment rule converts either correctly, so inject and the MT are untouched.
2. **Bracket always.** Simpler; breaks the existing legacy markers of a segment like chemistry's `NO~3~^-^` alts the moment an editor adds a bracket wrap there, because that segment then counts as new-format.
3. **Inject converts legacy markup in every segment.** Rejected: §2.3.

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
- `hasLegacyMarkup(text)` → the legacy inline forms (`{{i}}`/`{{b}}`/`{{term}}`, `**x**`, `__x__`, `*x*`, `~x~`, `^x^`, `++x++`), with `[[MATH|MEDIA|TABLE:n]]` placeholders removed first.
- `wrapFor(kind, currentText)` → `{ open, close }` for `bold`, `italic`, `term`, `underline`, `sub`, `sup`: the bracket pair (`[[b:` / `]]` …) unless `hasLegacyMarkup(currentText) && !isBracketDialect(currentText)`, then the legacy pair (`**`, `*`, `__`, `++`, `~`, `^`).
- `checkMarkers(originalIs, editedIs)` → `{ blocked, warnings }` in `validateStructure`'s code shape (§4.3).

### 4.3 The rules, all in `validateStructure`'s existing `blocked` / `warnings` split

| # | Rule | Kind | Outcome | Code |
|---|---|---|---|---|
| 1a | the edit **adds** a `[[type: ` (count above the baseline's) | relative | block | `marker-spaced` |
| 1b | `[[` count ≠ `]]` count in the edited text | absolute | block | `marker-unbalanced` |
| 2s | a **structural** type's count falls below the baseline's | relative | block | `marker-dropped` |
| 2a | a TABLE/lb/rb exact string in the baseline is missing | relative | block | `marker-dropped` |
| 2p | a **presentational** type's count falls below the baseline's | relative | warn | `formatting-dropped` |
| 3 | a type the taxonomy does not name | absolute | warn | `marker-unknown` |
| 4 | `lb` count ≠ `rb` count | absolute | warn | `marker-lb-rb` |
| 5 | **§C248:** the edited text is new-format (`isBracketDialect`) and the edit **adds** a legacy wrap (`**x**`, `*x*`, `__x__`, `~x~`, `^x^`) | relative | warn | `legacy-wrap` |

- **Baseline** = `originalIs`, the text the editor started from, as every existing relative rule uses. Rules 1a, 2 and 5 are therefore 0 on an unchanged save by construction; rules 1b, 3 and 4 measured 0 (§2.5) where they block or apply.
- **Additions never block.** A wrap the editor adds raises a count; only a fall is checked. That is what lets the toolbar's bracket wraps through.
- **The server enforces `blocked` already** (`servedEdit`, `propagationService`, the localization routes all call `validateStructure`); `warnings` stay advisory (design D3 of SR-OOS-2).
- **Wording:** each new code gets a message in `UI.validation` and an entry in **both** panes' maps (`segment-editor.js` `validateSegmentEdit`, `localization-editor.js`). A code with no entry would throw in the pane, so a test asserts every code `validateStructure` can emit has an entry in both maps (§6).
- Messages name the marker type and say what to do, in the house style (`Stærðfræðimerkið … vantar …`). The legacy-wrap warning tells the editor that the text will show as raw characters and to use the toolbar button instead. **The Icelandic wording needs [USER]'s native read** before merge.

### 4.4 The toolbar

`wrapSelection(textareaId, kind, source)` asks `markerIntegrity.wrapFor(kind, ta.value)` for the pair, so the buttons and Ctrl+B/I/T write the dialect the segment uses. The localization editor has no wrap toolbar (only its pair-name map), so only the segment editor changes.

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
- **E2E (Playwright), with real input:** B, I and T in a new-format row write `[[b:…]]`, `[[i:…]]`, `[[term:…]]`; in a legacy row they write legacy markup; deleting a `[[sub:…]]` shows the block and the save is refused by the server; typing `**x**` into a new-format row shows the warning. Existing E2E assertions that the wrap marker is `'**'`/`'*'` move to the bracket values, by this design.
- **Round-trip sentinel:** a test that a toolbar-produced bracket wrap, injected and rendered, reaches the HTML as the element by value (probe 2's arms, committed as a test).

## 7. Risks

- **The research data's wrap-marker values change.** Recorded at the deploy; old and new values describe the same act.
- **A rule too aggressive blocks propagation as well as saves** (August §10). Only rules with a measured base rate of 0 block.
- **The legacy-segment branch of `wrapFor` mis-classifies** a segment whose `~` means "approximately" and has no new-format marker: it would write legacy wraps there, which inject converts, so the output stays correct; the only cost is a legacy wrap where a bracket one would also have worked.

## 8. Left to the builder

Message wording drafts (for [USER]'s read); the exact legacy-wrap regexes (they must not fire on `~10`-style text that lacks a closing tilde: count pairs added, not characters); the plan's task order.
