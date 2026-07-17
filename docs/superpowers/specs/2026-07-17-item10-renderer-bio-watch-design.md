# Item 10 — Renderer biology-watch sweep (design)

**Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` § Phase 2, item 10 (must-survive, biology-gating).
**Register origins:** `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (P0-2..P0-5 at `:921-924`/`:1059-1062`, RV-3 `:934`/`:1064`, RV-4 `:935`/`:1065`); `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` items 20 (`:49`) and 22 (`:55`).
**Date:** 2026-07-17
**Status:** design approved (user-confirmed, Approach A); spec pending user review.

## Purpose

Close the seven still-open, already-diagnosed renderer defects that are latent on the
committed corpus but will fire at biology/organic/physics onboarding. Every one is a
"fix when it surfaces" register entry that the campaign deliberately pulls forward: the
whole point of item 10 is that biology intake must not be the event that discovers them.

**Two items in the campaign line need no code:**
- **RV-4** (id-needle aliasing `target-id`) was **closed structurally by P0-1**
  (2026-07-13): `positionInContent` is deleted, ordering is DOM child order, no
  `id="X"` needle remains in ordering logic. This item only confirms the closure in the
  campaign register.
- **P0-2** (equation pre-scan exact-string `unnumbered` check) is **subsumed by RV-3's
  pre-scan unification** — it is fixed here, but as one row of the sweep, not a separate
  mechanism. The `hasUnnumberedClass` doc comment (`cnxml-render.js:452-459`) explicitly
  deferred it to "a future task"; this is that task, and the comment is updated.

## Verified code sites (current `main`, 2026-07-17)

| Item | Site | Today |
|------|------|-------|
| Table pre-scan (the E7 template) | `cnxml-render.js:532-543` | attrs-anywhere capture → `hasUnnumberedClass` skip → id extract — **the pattern everything else adopts** |
| Equation pre-scan (P0-2) | `cnxml-render.js:~546+` (immediately after tables) | exact-string `attrs.includes('class="unnumbered"')` — misses `class="foo unnumbered"` |
| Figure pre-scan, per-module | `cnxml-render.js:516` | `/<figure\s+id="([^"]+)"/g` — id-first, **no** unnumbered skip |
| Figure pre-scan, chapter-wide | `cnxml-render.js:3206` | same id-first pattern |
| Example pass, chapter-wide | `cnxml-render.js:3242` | `/<example\s+id="([^"]+)"/g` — id-first, no skip |
| Example title pass | `cnxml-render.js:3287` | `/<example\s+id="([^"]+)"[^>]*>[\s\S]*?<title>…/g` — id-first |
| Exercise pass, chapter-wide | `cnxml-render.js:3304` | `/<exercise\s+id="([^"]+)"/g` — id-first |
| Answer-key extraction | `cnxml-render.js:2943` | `/<exercise\s+id="([^"]+)">…/g` — id-first (also requires id directly after tag name) |
| List number-style map (P0-4) | `cnxml-render.js:1700-1706` | `lower-alpha`/`upper-alpha` only; roman falls to decimal |
| Outline filter (P0-3) | `cnxml-render.js:445-449` | `info.section` throws if `info` is null (unreachable today) |
| Emphasis class carry (P0-5) | `tools/lib/cnxml-elements.js:760-774` | word-match keeps only `emphasis-one`; all other classes dropped |
| Appendix resolver branch (#20) | `tools/lib/cnxml-elements.js:109-112` | resolves `/vidauki/{letter}` — `targetId` fragment silently dropped |
| Key-terms fallback (#22) | `cnxml-render.js:3570-3579+` | fires only when `chapterGlossary.length === 0`; hand-rolled `<link document= target-id=>` regex emits section URLs, never calls `resolveCrossModuleHref` |

Gated-shape inventory (why these matter at onboarding): organic has **60+ class-first
figures** incl. `class="unnumbered scaled-down"` and effect-less `<emphasis
class="centered-text">`; physics has **6 `type=`/`xmlns=`-first exercises**
(m42606/m42665/m42440) and uses **roman** enumerated lists; organic is the only book
whose key-terms fallback fires (0 `<glossary>`); biology could introduce
`document=`+`target-id` appendix links (0 in chem's 67 appendix links today).

## Design (approved Approach A)

### Cluster 1 — RV-3 pre-scan unification (subsumes P0-2)

New module-local helper in `cnxml-render.js` (exported for tests):

```
scanBlocks(cnxml, tagName, { skipUnnumbered = false } = {})
  → [{ id: string, attrs: string, index: number }]   // document order
```

- Regex per call: `new RegExp('<' + tagName + '\\b([^>]*)>', 'g')` — captures the attrs
  string wherever the id sits.
- `skipUnnumbered: true` → drop matches where `hasUnnumberedClass(attrs)`.
- Matches without an `id="…"` are dropped (all six passes key numbering by id today; an
  id-less numbered block cannot receive a forward reference).
- `index` = match index in the source string (the example-title pass uses it to slice
  forward and find its `<title>` within the match's own block; other passes ignore it).

All six passes adopt it:

| Pass | skipUnnumbered | Numbering behavior change on gated shapes |
|------|----------------|-------------------------------------------|
| Equations (per-module) | true | multi-class `unnumbered` equations stop consuming numbers (P0-2) |
| Tables (per-module) | true | none — already this pattern (pure refactor row) |
| Figures (per-module + chapter-wide) | true | class-first figures get numbered; `unnumbered` figures stop consuming slots |
| Examples (chapter-wide + title pass) | **false** | attrs-anywhere only (no skip — matches today's semantics; zero classed `<example>` in any book; adding a skip would be speculative behavior) |
| Exercises (chapter-wide + answer-key) | **false** | `type=`/`xmlns=`-first exercises register in numbering and the answer key |

The `hasUnnumberedClass` JSDoc note declaring the equation check out-of-scope is
rewritten to state the unified reality.

**Deliberate semantics note:** unnumbered-skip applies exactly where a skip exists today
or the register names it (equations, tables, figures). Examples/exercises get the
attrs-anywhere fix only. Widening their skip behavior is out of scope (no corpus
evidence, no register ask).

### Cluster 2 — hardenings

- **P0-3:** `filterOutlineEntries` filter becomes
  `([key, info]) => !key.startsWith('_') && info && info.section !== '0'` — a null
  `info` is silently excluded instead of throwing. (Unreachable today by call-site
  construction; this is defense, tested with a synthetic null entry.)
- **P0-4:** `renderList` number-style map gains `lower-roman` / `upper-roman` →
  `list-style-type: lower-roman|upper-roman` (same inline-style mechanism as alpha).
- **P0-5:** the emphasis handler preserves the element's **entire class attribute
  verbatim** when present (any classes, any count), instead of the `emphasis-one`-only
  word-match. Escaping unchanged (class value passes through the existing attr
  handling). Unstyled classes are inert in the reader until vefur adds CSS —
  **[VEFUR]** note logged in the campaign register (D6 known-gaps posture, cross-repo
  CSS contract per CLAUDE.md).

### Cluster 3 — link-path fixes

- **#20:** in BOTH of `resolveCrossModuleHref`'s appendix branches
  (`cnxml-elements.js:109-112` documentId-keyed, and the no-owner branch at `:119+` —
  both emit `/vidauki/{letter}` landing hrefs), append
  `#${targetId}` to the `/vidauki/{letter}` href when `targetId` is non-null. The
  fragment must be attr-escaped exactly as other hrefs are.
- **#22:** the key-terms fallback's per-item link handling calls
  `resolveCrossModuleHref(documentId, targetId, context)` (the same context object the
  surrounding render pass already holds) instead of hand-building
  `/content/{book}/chapters/{ch}/{slug}.html`. Non-appendix links must keep resolving to
  the same section URLs they produce today (the resolver's normal path — verified by
  characterization test); appendix links switch to `/vidauki/{letter}` (+ fragment per
  #20). Only the href construction changes — item text/ordering/markup stay as-is.

### RV-4 — register confirmation only

The campaign line's RV-4 mention is annotated "closed by P0-1, 2026-07-13; confirmed
item 10" when the register is updated at ship time. No code.

## Safety proof (load-bearing)

Render-hash sweep over **all books'** committed `03-translated` modules (item-8/P0-1
harness pattern: in-memory `renderCnxmlToHtml`, `resetMathJaxIds` per module, main-tree
worktree vs branch), with a strict split:

- **efnafraedi-2e and liffraedi-2e: 0 diffs — hard requirement.** (Frozen corpus;
  imminent-intake corpus.) Any diff = STOP, find the leak.
- **Other books (lifraen-efnafraedi, edlisfraedi-2e, …): every diff must classify into
  one of the four expected improvement classes:**
  1. figure numbering shifts from the unnumbered-skip / class-first-id adoption,
  2. `<em>`/`<strong>` now carrying a `class="…"` they previously lost,
  3. roman `list-style-type` inline styles appearing,
  4. exercise numbering/answer-key changes where `type=`-first exercises now register.
  Anything unclassifiable = STOP.
- **#22 is invisible to the module sweep** (key-terms is a chapter-level compiled
  artifact) — it is proven by characterization test instead: a key-terms section fixture
  with one ordinary cross-module link and one appendix link; assert the ordinary link's
  href is byte-identical to today's output and the appendix link resolves to
  `/vidauki/{letter}`.

## Testing strategy (TDD per fix)

New/extended Vitest specs under `tools/__tests__/`:
- `scanBlocks` unit: attrs-anywhere id extraction, skip semantics, id-less drop,
  document order, `index` usability for the title pass.
- Per gated shape: multi-class `unnumbered` equation and figure (skipped from
  numbering); class-first figure (numbered); `type=`-first exercise (numbered + appears
  in answer key); roman list (`list-style-type`); multi-class emphasis (classes
  preserved verbatim); null-`info` outline entry (excluded, no throw); appendix link
  with `target-id` (fragment in href); key-terms fallback characterization (above).
- Pre-scan equivalence pin: for a representative id-first corpus shape, the new helper
  produces the identical id list/numbering the old regexes produced (refactor rows
  provably behavior-preserving).
- Full suite (`npm test`, repo root) green; corpus sweep per Safety proof.

## Out of scope (explicit)

- Extractor changes of any kind (BIO-EX2 stands; P1-R1's extract-side fix is a separate
  item).
- Numbering-subsystem refactor beyond `scanBlocks` (Approach C rejected).
- Widening unnumbered-skip to examples/exercises (no evidence, no register ask).
- Vefur CSS for newly-preserved emphasis classes ([VEFUR] note only).
- D5 (Icelandic key-terms content for organic/microbiology) — #22 fixes link routing
  only; the fallback's EN term text is D5's problem.
- Re-renders / content delivery / `books/` changes.
- osd-1 (preview `BOOKS_DIR` rebinding) and osd-2 (`excludedSectionClasses` substring) —
  registered item-9 follow-ups, not this sweep.
