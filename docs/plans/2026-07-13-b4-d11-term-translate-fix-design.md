# B4-D11 fix — paired-bracket MT round-trip for term/footnote translation (design)

**Date:** 2026-07-13
**Status:** design (approved in brainstorming; awaiting spec review → writing-plans)
**Register:** B4-D11 in `docs/plans/2026-07-11-pre-semester-coding-campaign.md`; memory `b4-d11-bracket-term-no-translate`.

## 1. Problem

The id-anchored inline marker `[[term:text|id]]` (and `[[fn:text|id]]`), introduced by B4 (PR #274,
merged), reads to the Málstaður API as an **opaque protected token** (like `[[MATH]]`): the API returns
it verbatim and never translates the inner term/footnote text. Discovered running the B4 #274 post-merge
data op (spec §10): across the 8 re-MT'd chemistry modules, **21/40 bracket-term inner-texts stayed
English** in the injected output (`<term id="term-00001">viscosity</term>` vs the old published
`<term id="term-00001">Seigja (e. viscosity)</term>`) — a reader-visible regression. The fail-loud inject
gate caught it; nothing was published.

### Mechanism (probe-proven, 2026-07-13, glossary-primed, deterministic)

| Form on the wire | API result |
|---|---|
| `[[term:viscosity\|term-00001]]` (single token + id) | returned **verbatim**, not translated |
| `[[term:viscosity]]` (single token, no id) | text translated **but brackets stripped** (marker lost) |
| `{{term}}viscosity{{/term}}` (paired) | translated **and** delimiters kept — but paired `{{}}` carries B4's ~2.3% drop |
| **`[[term]]viscosity[[/term]]` (paired brackets)** | **translated AND both delimiters survive 100%** ✓ |

Text sealed *inside* one `[[…]]` token is opaque (or translate-then-stripped); text *between* two
`[[…]]` tokens is ordinary translatable content flanked by two survivable markers. The paired-bracket
form additionally survived with **nested `[[i:]]`/`[[sub:]]` markers inside the term** and for
**`[[fn]]…[[/fn]]`** footnotes.

### Why it matters now (biology gate)

Biology (`liffraedi-2e`) is dormant today (its `02-for-mt` uses legacy `{{term}}`/`__term__`, pre-B4) but
the current extractor emits `[[term:|id]]`, so re-extraction at intake flips it onto the defect:
**2,442 inline id-anchored `<term>` across 207/259 modules + 42 `<footnote>` across 32 = 2,484 opaque
tokens**, with an **empty approved glossary** (0/2,262) — zero priming and zero inject-side recovery.
Only ~11/259 modules are extracted, so the exposure is almost entirely future. **This fix must land
before biology intake resumes through the current extractor.**

## 2. Approach decision

**Chosen: MT-round-trip via paired `[[term]]…[[/term]]` / `[[fn]]…[[/fn]]` (in `api-translate`).**

Rejected alternatives (full analysis: 3-agent scoping workflow, register B4-D11):
- **`{{term}}` round-trip** — works but reintroduces B4's ~2.3% paired-marker drop; the paired-bracket
  form is strictly better (loss-free) so there is no reason to accept the drop.
- **Inject-side glossary substitution** — 0 ISK but only partial (recovers ~9–11/21 chem terms; 8 are
  in-glossary with empty Icelandic → need human curation), does not fix the id-corruption sub-case, and
  **recovers 0 for biology** (empty glossary). Redundant once the round-trip lands.

## 3. Architecture — one seam, two pure functions

The change lives entirely inside `translateChunk` (`tools/api-translate.js:489`), wrapping the
`client.translateAuto` call (`:496`, and its retry-without-glossary sibling at `:511`). No other module
changes. Two new pure, unit-testable helpers (exported for testing):

### `stripTermFnToPaired(chunkText) → { wireText, idMap }`
- Rewrites `[[term:text|id]]` → `[[term]]text[[/term]]` and `[[fn:text|id]]` → `[[fn]]text[[/fn]]`.
- Also handles the **no-id** variants `[[term:text]]` / `[[fn:text]]` (id captured as `null`).
- **Nesting-aware:** strips only the outer `[[term:` prefix and `|id]]` (or `]]`) suffix; inner
  `[[i:]]`/`[[sub:]]`/etc. inside the term text are left untouched (they ride through and survive — probe N).
- `idMap`: captured ids grouped **per SEG segment, per type (term/fn separately), in source order.**

### `reattachIds(wireOutput, idMap) → { text, mismatches }`
- Walks each segment's surviving `[[term]]…[[/term]]` / `[[fn]]…[[/fn]]` in document order
  (**nesting-aware** outer-match, since translated text may contain preserved nested `[[…]]`), and
  re-emits `[[term:TranslatedText|id_k]]` (or `[[term:TranslatedText]]` when the captured id was `null`).
- **Per-segment, per-type count-guard:** if a segment's surviving paired-marker count ≠ its captured id
  count, that segment **falls back to its original markers** (from `chunkText`), and a `{segId, type,
  expected, got}` mismatch is recorded.

## 4. Data flow (per chunk)

```
chunkText  [[term:x|id]]            (from 02-for-mt, correct ids)
   │  stripTermFnToPaired
   ▼
wireText   [[term]]x[[/term]]       → client.translateAuto (+ retry path)
   ▼
wireOutput [[term]]X[[/term]]
   │  reattachIds(…, idMap)
   ▼
output     [[term:X|id]]            → existing normalizeUnicode / repairSegTags / validateMarkers (unchanged)
   ▼
02-mt-output  [[term:X|id]]         (paired form is transient, wire-only; on-disk stays bracket+id)
```

`02-for-mt` and `02-mt-output` on disk stay in `[[term:text|id]]` form. **Extract, inject, and the
`-inline-attrs.json` sidecar are untouched** — inject still reads the id straight from the on-disk marker
(content-anchored restore preserved; frozen seg-ids and the export-corpus join key unaffected).

## 5. Error handling

- **Count-guard mismatch (per segment):** degrade that segment to its **original markers** (valid
  `[[term:text|id]]` format, correct id, English text = today's behavior for that one segment — never a
  mismapped/corrupt id) + a loud per-segment warning collected into the run summary + **process exit ≠ 0**
  so CI/operator sees it. Module still writes; other segments/modules unaffected. Expected rate ≈ 0
  (100% probe survival); the guard is defense-in-depth mirroring inject's `reportAttrMismatch`.
- Existing `translateChunk` guards (`assertNoControlChars`, `validateMarkers` SEG-count, truncation
  retry) are unchanged and continue to operate on the re-attached output.

## 6. Scope

**In:** `[[term:…]]` and `[[fn:…]]`, both id-anchored and no-id variants; nested inline markers inside
term/fn text preserved; the retry-without-glossary path.

**Out:**
- `[[u:]]` / `[[em:]]` — no `|id`, not opaque-afflicted (they already translate).
- `tools/cnxml-extract.js`, `tools/cnxml-inject.js`, the sidecar format — unchanged.
- The ~1,500 ISK targeted re-MT of the 6 chemistry modules — a **separate data step** after this PR
  merges (not in this PR).
- The already-committed corrupted `m68789` `02-mt-output` — regenerated correctly by the re-MT (the
  transform reads correct ids from `02-for-mt`); no special-casing.

## 7. Edge cases

- **m68789 id-corruption** (`[[term:…|aðferð upphafshraða]]`): impossible under this fix — the id never
  rides the wire; re-MT reads the correct id (`term-00006`) from `02-for-mt` and re-attaches it.
- **Nested markers** inside term text (`activation energy ([[i:E]][[sub:a]])`): preserved by both the
  nesting-aware strip and the nesting-aware reattach outer-match.
- **Chunking:** transform is per-chunk; `splitAtSegBoundaries` never splits mid-segment, so within-segment
  ordinals are stable across chunk boundaries.
- **Retry-without-glossary path** (`:511`): uses the same `wireText`, so it is covered.
- **Proper nouns** (Geim, Novoselov): the API correctly leaves them English — not a defect, no handling.
- **Translated text containing `]]`**: only via preserved nested markers; the nesting-aware outer-match
  handles it.

## 8. Testing

Pure-function unit tests (no live API):
- strip: `[[term:x|id]]`/`[[fn:x|id]]`/no-id variants → paired form + correct `idMap`.
- reattach: paired output + `idMap` → `[[term:X|id]]` by ordinal.
- full round-trip with a simulated translation → ids preserved, text swapped.
- nested-marker term round-trips with nested markers intact.
- fn symmetric.
- **count-guard mismatch → original fallback + recorded mismatch + non-zero exit signal.**
- multi-term-per-segment; multi-segment chunk; term + fn in the same segment.

Live: one **opt-in** probe case added to `tools/test-malstadur-api.js` (paired `[[term]]`/`[[fn]]`
survival, ~3 ISK) — run before the real re-MT, gated out of CI.

Gate: `npm test` from repo root, all green.

## 9. Acceptance criteria

1. `stripTermFnToPaired` / `reattachIds` exist as exported pure functions with the unit tests above green.
2. A module whose `02-for-mt` contains `[[term:…|id]]` produces `02-mt-output` with the **term text
   translated** and the **id preserved** (verified on a fixture; no live API in CI).
3. On a simulated dropped paired marker, the affected segment degrades to its original markers, a mismatch
   is reported, and the process exit is non-zero.
4. `cnxml-inject` on the fixed `02-mt-output` yields `<term id="…">Icelandic (e. English)</term>`.
5. `npm test` green from repo root.

## 10. Sequencing (after this PR merges)

Separate lead-gated data step (finishes the halted B4 data op): paired-survival probe (~3 ISK) → targeted
re-MT of the 6 term-bearing chemistry modules (~1,500 ISK) on branch `data/b4-remt-8modules` → re-inject →
re-render → order/F8 recheck → data-delivery PR. Biology intake stays gated until this fix is on `main`.

## 11. Known limitations & follow-ups (from the whole-branch review, 2026-07-13)

Implemented and re-reviewed READY-TO-MERGE (final-review fix `42876fa5`: reattach reordered AFTER
`repairSegTags` on both paths + a pre-write leak guard `/\[\[\/?(?:term|fn)\]\]/` in `translateModule`
+ `computeCompleteChapters()` excluding failed AND mismatch-bearing chapters). Register these residuals:

- **[known limitation] Cross-type term/fn nesting permanently degrades to English + perpetual `exit 1`.**
  A `[[term:…]]` inside a `[[fn:…]]` (or vice versa) is *structural*, not a random drop, so the
  count-guard's `nested` mismatch fires every run — the segment is always degraded to its English
  original and never receives Icelandic term text, and the run always exits non-zero. Safe (no
  corruption, loud) but a genuine ceiling. **Biology has 42 footnotes** (32 modules); if any wrap a
  `<term>`, those need a recursive re-attach or manual handling. Fix candidate: recursive/stack-based
  span resolution in `reattachIds` (deferred as YAGNI — 0 corpus instances today).
- **[L1, cosmetic] Degrade path emits un-normalized English.** When a segment degrades to
  `originalText`, that text bypasses `normalizeUnicode` (which now runs pre-reattach on the discarded
  translated form), so a raw Unicode sub/sup in the EN source lands raw rather than as `~N~`/`^N^`.
  Only affects already-flagged, held-back mismatch segments; invariant + fail-loud intact.
- **[L2, by-design] Whole-module hard-fail on one unrepairable SEG-id mangle.** The leak guard throws
  for the whole module → nothing written, must re-MT. Deliberate fail-loud tradeoff.
- **[T1, register] DRY:** `SEG_SPLIT_RE`/`SEG_ID_RE` duplicate pre-existing inline regexes in
  `api-translate.js` (never migrated to `tools/lib/seg-markers.cjs`); `splitTopLevelId` last-top-level-`|`
  -wins misparses a no-id term whose prose contains a bare top-level `|` (near-impossible corpus).
- **[T5, register] Probe asymmetry:** `T1.18` checks term inner-text translation + both delimiters'
  survival but not *fn* inner-text translation (one-line add:
  `!/\[\[fn\]\]At standard pressure\.\[\[\/fn\]\]/.test(output)`).
