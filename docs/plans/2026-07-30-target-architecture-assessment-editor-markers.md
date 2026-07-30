# Target-architecture assessment — LENS C: what an id-anchored editor tag system costs

**Written:** 2026-07-30 · **Branch:** `feat/c16-segment-edit-reattach` · **Status:** assessment, not a plan.
**Scope:** the editor-facing marker vocabulary only. This document is *evidence*, not status — per
CLAUDE.md § *One source of truth*, open work is owned by
[`docs/plans/2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md)
§C16. Where I cite a count from §C16 I say so; where I measured my own, I give the command and the
counting unit.

---

## Bottom line

**Changing what the editor *writes* is S — under a day of code, zero data migration, zero inject
changes. Inventing a *richer* vocabulary is L→XL and is a different project.** Those two have been
travelling under one heading ("editor-facing tag redesign") and they should be split, because the
cheap half is the half that fixes a confirmed reader-visible defect and unblocks the deletion PR.

The cost multiplier is not the editor. It is that marker vocabulary is consumed by **three
independent strippers with three different policies**, plus two preview renderers, a highlighter, a
validator and inject — and the failure mode of missing one is a silent TM/corpus quality regression,
not a red test.

| Work | Size | Why |
|---|---|---|
| **1.** Editor emits brackets instead of markdown | **S** | 3 emit sites, one file, one-line string swaps; verified empirically that inject already handles the output |
| **2.** Delete the `__x__ → <term>` converter (fixes the live defect) | **S** | 5 lines; gated on (1) shipping and on the chemistry re-MT |
| **3.** Delete `hasApiMarkers` + its 3 back-compat blocks | **M** | `cnxml-inject.js` is the highest-risk file in the pipeline; needs its own PR + whole-branch review |
| **4.** A *new*, richer "informational" tag grammar (type + payload) | **L→XL** | 8 consumers in lockstep; silent-regression failure mode; own campaign |
| **0.** Correct §C16's reach line to 3 pages / 2 books (F1) | **S** | register owns that fact; do it there, not here |

**Where this fits the campaign:** this *is* §C16(a)'s fix direction, which §C16 itself says is
unresolved and should be scoped with the editor tag redesign. It sits at **P1, ahead of the P2
batches**. Step 1 is the **only** part with no [LEAD] gate and no dependency on the chemistry
re-MT — which makes it the right thing to start in a session two days out, while the re-MT and
deploy decisions stay open.

**Seven findings below are not in §C16. One changes a reader-facing number the [LEAD] queue is about
to act on (F1); one is a live editor-facing defect that gets worse exactly as editorial volume
ramps (F2).**

---

## 1. New findings

### F1 — 🔴 There is a **third** live published instance of the C16(a) defect, in **biology**, and §C16 does not list it

§C16's reach line reads: *"2 modules (`orverufraedi` ch01 `m58782`, ch05 `m58805`), 2 published pages
(`1-fill-in-the-blank.html`, `5-fill-in-the-blank.html`)"*.

Measured with a structural oracle (underscore adjacent to a rendered `<dfn class="term">`) over
**all 335 published HTML files**, not a regex over segment text:

```
node -e '…walk("books")…filter(f=>f.includes("05-publication"))… /_<dfn class="term">|<\/dfn>_/ …'
→ published html files: 335
  HIT books/liffraedi-2e/05-publication/mt-preview/chapters/03/3-exercises.html
  HIT books/orverufraedi/05-publication/mt-preview/chapters/01/1-fill-in-the-blank.html
  HIT books/orverufraedi/05-publication/mt-preview/chapters/05/5-fill-in-the-blank.html
  files with underscore-adjacent <dfn>: 3
```

The new one, verbatim from
`books/liffraedi-2e/05-publication/mt-preview/chapters/03/3-exercises.html`:

```html
<p id="fs-id2024704">Laktósi er tvísykra sem myndast við myndun
______<dfn class="term"> tengis milli glúkósa og  (e.  bond between glucose and )</dfn>______.</p>
```

Source segment: `books/liffraedi-2e/02-mt-output/ch03/m66440-segments.is.md`,
`<!-- SEG:m66440:problem:fs-id2024704 -->`. I confirmed `hasApiMarkers` evaluates **false** for it by
running the exact regex from `tools/cnxml-inject.js:1250` against the segment text.

**Why this matters beyond the count:** it is in `liffraedi-2e` **ch03** — the chapter the C13 fix
re-rendered, and the chapter sitting in the register's ▶ [LEAD] queue item ① ("publish the C13 fix",
6 section pages). Syncing that chapter to readers as-is ships this defect alongside the C13 fix.
`3-exercises.html` is not one of the 6 C13 pages, but it is in the same directory and the same sync.

⚠️ **3 is a floor for one shape.** The oracle keys on an underscore surviving *adjacent* to the
`<dfn>`, which requires the blank runs to be longer than the two underscores the regex consumes. A
blank written with exactly two underscores (`__ og __`) would be fully eaten and leave no adjacent
underscore to detect. Rare in this corpus (every blank I inspected is 8+ underscores), but the count
is a floor for that shape — the same caveat §C16 attaches to its "62 is a floor".

**Reach is therefore 3 pages / 2 books, not 2 pages / 1 book.** §C16's line was derived from a
`__`-regex census over segment files; the biology hit is in a book that census reported as
"1 file" without the per-file inspection the orverufraedi hits got. Fix the register line; do not
log it elsewhere (CLAUDE.md § *One source of truth*: fix document B).

### F2 — ⚠️ **Five of the six toolbar buttons are silently inert** in ~28% of segments

This is a live editor-facing correctness defect that §C16 does not name, and it is the single
strongest argument for doing the editor change *before* editorial volume ramps up.

`hasApiMarkers` is evaluated **per segment** (`tools/cnxml-inject.js:1247-1253`). When it is **true**
— i.e. the segment carries any bracket/brace marker — the three `!hasApiMarkers` blocks are skipped,
and *that is where all six markdown dialects the toolbar writes are converted*. Verified empirically
by calling the real exported `reverseInlineMarkup`:

```
B button, no bracket in seg    -> <emphasis effect="bold">feitletrað</emphasis>
B button, bracket in seg       -> Þetta <emphasis effect="italics">skáletrað</emphasis> er **feitletrað** orð.
I button, bracket in seg       -> … er *skáletrað* orð.
T button, bracket in seg       -> … er __hugtak__ orð.
sub button, bracket in seg     -> … H~2~O
sup button, bracket in seg     -> … x^2^
U button, bracket in seg       -> Þetta … er <emphasis effect="underline">undirstrikað</emphasis> orð.   ← the only one that works
```

So an editor who selects a word and presses **Ctrl+B** inside a segment that happens to contain, say,
`[[i:…]]` gets **the literal characters `**feitletrað**` in the published HTML**. Per §C16's own
census, `hasApiMarkers` is false for 71.7% of segments — so it is **true for the other 28.3%
(≈8,769 of 30,932)**, and in every one of those the B/I/T/sub/sup buttons do nothing.

**Nothing catches it.** `assertNoMarkerResidue` (`tools/cnxml-inject.js:1818-1827`) matches only
`/\[\[(?!MATH:|MEDIA:)[A-Za-z][\w]*:[^\]]*\]\]/` — bracket residue. Markdown residue is not checked.
The preview pane *does* render it (`segment-editor.js:1770-1790`), so the editor sees bold in the
preview and plain `**` in the book: **the preview actively lies about the outcome.**

**Currently latent, not live — confirmed at two independent tiers.** A 0-hit census over published
HTML alone would be ambiguous: it predicts the same result whether this has never happened *or* the
render path silently normalizes `**`. So I checked the **injected CNXML** tier as well, which sits
upstream of render:

```
published HTML (05-publication):   335 files, ** residue in 0
injected CNXML (03-translated):    191 files, ** residue in 0
```

Both empty ⇒ genuine absence, not a render-path false negative. That is a fact about today's
editorial volume (5 real `03-faithful-translation` files exist, see §4), **not** about the code. It
goes live the first time an editor formats inside a bracket-carrying segment — which is precisely
what the lead's target enables.

The U button is the exception only by accident: `++text++` is converted **unconditionally** at
`tools/cnxml-inject.js:1414`, outside the guard.

### F3 — `++text++` is at **17 files**, not 0, and the comment justifying it is stale

§C16's marker table states `++text++` is *"now at 0"*. Measured over all 568
`books/**/*-segments.{en,is}.md`, paired form `/\+\+([^+\n]{1,60})\+\+/`:

```
files with paired ++text++: 17 of 568
  (16 × efnafraedi-2e across 02-for-mt / 02-mt-output / 03-faithful-translation, + 1 e2e fixture)
```

Meanwhile `[[u:` is at **0** files — even though `tools/cnxml-extract.js:306` has emitted
`[[u:${inner}]]` for underline since B4. So the 17 are stale pre-B4 extraction output, all in
chemistry, and a chemistry re-extract retires them corpus-wide.

*(A file carrying both `++` and `[[i:` — e.g. `efnafraedi-2e/02-for-mt/ch06/m68734` with
`++4[[i:s++` — is not a contradiction: `[[i:]]` landed in `de601457` (2026-03-22) and `[[u:]]` only
in `ee84f770` (2026-07-12, B4), so anything extracted between those dates legitimately has bracket
italics **and** `++` underline.)*

But the comment at `tools/cnxml-inject.js:1413` still reads *"underline has no API-safe `{{u}}`
variant, so `++text++` is always the format"* — which is why that conversion sits outside the guard.
It is false as of B4. And the **editor's U button (`segment-editor.js:975`) still writes `++`**, a
dialect current extraction never produces. Pure drift; cheap to fix in step 1.

### F4 — Nothing reads `__` back. The glossary round-trip does **not** depend on it

`insertTermFromLookup` (`segment-editor.js:2616`) writes `'__' + icelandicTerm + '__'`. I grepped the
glossary/terminology read path — `tools/lib/glossary-extract.js`, `tools/lib/glossary-term.js`,
`tools/lib/math-label-substitute.js`, `server/services/terminologyService.js` — for `__`,
`[[term:` and `{{term}}`: **the only hit is `__dirname`.**

I also checked the three places a marker could plausibly be load-bearing without appearing in a
glossary file:

- `restoreGlossaryTermMarkup` (`cnxml-inject.js:969-1004`) — despite the name, it early-returns
  unless `originalRawTerm.includes('<')` and works purely on **XML** (`<m:math>`, emphasis/sub/sup
  notation runs) recovered from the read-only source term. It never sees `__`.
- `server/services/segmentEditorService.js` and `server/services/propagationService.js` — no
  reference to `__`, `**`, `[[term:` or `{{term}}`. Propagation does not match on marker content.

The marker is write-only convenience for the editor; **no consumer identifies a term from it.**
Switching that one string costs nothing downstream.

### F5 — The emit sites have **zero test coverage**

```
grep -rln "wrapSelection\|tb-term\|tb-bold\|tb-italic" server/__tests__ tools/__tests__ server/e2e
→ (no matches)
```

No unit test and no Playwright spec touches the toolbar, the keyboard shortcuts, or
`insertTermFromLookup`. Consequence for sizing: **step 1 breaks no tests** — but it also has no
safety net, so the real work is *writing* tests, not fixing them. That is what keeps it S rather
than trivial. (It is also, per the project's own KEY LESSON, exactly the shape where "a green suite
is the expected result, not evidence.")

### F6 — Switching to brackets is a free **quality gain** for TM and corpus

Both exporters deliberately refuse to strip the markdown family:

- `tools/lib/tm-export.cjs:105-107` — *"Single-char legacy markers (`*…*`, `~…~`, `^…^`, `__…__`) are
  intentionally left alone: they collide with literal math/chemistry text and are ambiguous to strip
  safely."*
- `tools/export-corpus.js:428` — manifest note: *"single-char legacy markers … retained in clean text
  (TM ambiguity rationale)"*.

So today, every `__term__` an editor writes leaks verbatim into the TMX and into the research
corpus's "clean" text. Both files already strip the bracket family unambiguously
(`tm-export.cjs:118-136`). **Nothing needs to change in either exporter** — they simply start
producing cleaner output once the editor stops writing ambiguous markers. This answers the lens's
"the exporters must reproduce the editor's exact view" concern: they must, and they already handle
brackets; brackets are the form they can handle *correctly*.

### F7 — ⚠️ The **localization editor's preview is missing 4 of the 8 bracket rules** — pre-existing, and step 1 makes it visible

The two previews are not equivalent. Fixed-string count of preview rules per file:

```
for m in 'i:' 'b:' 'sub:' 'sup:' 'u:' 'term:' 'em:' 'fn:'; do
  grep -cF '\[\['"$m" server/public/js/{segment-editor,localization-editor}.js; done
```

| marker | `segment-editor.js` | `localization-editor.js` |
|---|---|---|
| `[[i:` `[[b:` `[[sub:` `[[sup:` | 1 each | **0 — missing** |
| `[[u:` `[[em:` | 1 each | 1 each |
| `[[term:` `[[fn:` | 2 each | 2 each |

`edRenderMarkdownPreview` (`localization-editor.js:1436-1494`) handles the markdown family, the
brace family, `[[term:`, `[[fn:`, `[[u:`, `[[em:` — but **not** `[[i:`, `[[b:`, `[[sub:`, `[[sup:`.
A Pass-2 localizer looking at a segment containing `[[sub:2]]` sees the literal characters
`[[sub:2]]`, not a subscript.

**This is a pre-existing defect, not one step 1 creates** — extraction has emitted those four forms
since well before B4, so they are already in the corpus and already mis-previewed. But step 1 turns
them into what the *editor itself* writes, which raises it from "old content looks odd" to "the tool
doesn't render its own output". **Four one-line additions, mirroring `segment-editor.js:1718-1721`.
Fold them into step 1.**

---

## 2. Blast radius — emit sites vs read sites

The critical structural fact: **there are 3 emit sites, all in one file, and they are the only places
markdown is *written*.** Everything else only *reads*, and every reader already accepts brackets.

### Emit (must change in step 1) — all in `server/public/js/segment-editor.js`

| Site | What it writes |
|---|---|
| `:972-977` toolbar buttons | `**` `*` `__` `++` `~` `^` |
| `:2789-2798` Ctrl+B / Ctrl+I / Ctrl+T | `**` `*` `__` |
| `:2616` `insertTermFromLookup` (glossary insert) | `__term__` |

`server/public/js/localization-editor.js` has **no toolbar** — grep for
`wrapSelection|format-toolbar|tb-term` returns nothing. It has a textarea (`:820`) and a preview
(`:1435-1474`), so it is a **read site only**. That halves the client-side scope versus what the lens
assumed.

### Read (keep as-is in step 1 — see §4 on why)

| Site | Role | Bracket-ready today? |
|---|---|---|
| `segment-editor.js:1770-1790` preview | renders `**`, `*`, `__`, `~`, `^`, `++` | **yes, all 8** — `[[i: b: sub: sup: u: term: em: fn:]]` at `:1718-1739` |
| `localization-editor.js:1466-1487` preview | same, + only *some* brackets | **⚠️ NO — missing `[[i:` `[[b:` `[[sub:` `[[sup:`. See F7** |
| `marker-highlight.js:99-112` | backdrop highlighter; markdown in the "old-content tolerance" block | yes — bracket rules are §1-3, markdown is §5 |
| `segment-validation.js:110-119` `pairs` | advisory `unmatched-pair` warning for `**` `__` `++` | n/a — warnings only, never server-enforced |
| `segment-editor.js:1274-1278` `PAIR_NAMES` | maps those 3 markers to Icelandic labels | n/a |
| `cnxml-inject.js` | 3 `!hasApiMarkers` blocks + unconditional `++` | yes |
| `tm-export.cjs` / `export-corpus.js` / `residue-check.js` | 3 independent strippers | brackets yes, markdown deliberately not |

**This asymmetry — stop emitting, keep parsing — is the whole reason step 1 is safe.** It is also the
answer to (b) and (c) at once, so it is stated once here: prod's `segment_edits` rows still contain
`__`, and the editor loads them for display, so the preview renderers and the highlighter **must**
keep their markdown rules after the toolbar stops writing them. Removing the *read* rules is step 3,
gated on data, not on the editor.

---

## 3. (a) Is `[[term:text|id]]` already sufficient?

**Yes for the term case — but the correct target is the BARE `[[term:text]]`, not the id-anchored
form. The `|id` is the problematic half.**

`tools/cnxml-extract.js:339` emits `|id` **only when the source `<term>` carries an id**:

```js
return parsedAttrs.id ? `[[term:${termText}|${parsedAttrs.id}]]` : `[[term:${termText}]]`;
```

A term an editor *invents* with Ctrl+T has no source id. Verified against the real
`reverseInlineMarkup`:

```
editor bare bracket term      -> Vatn er <term>leysir</term> í efnafræði.
current editor markdown term  -> Vatn er <term>leysir</term> í efnafræði.      ← byte-identical
editor id-anchored (invented) -> Warning: [[term:…|editor-1]] id not found in inline-attrs sidecar
                                 Vatn er <term id="editor-1">leysir</term>.
```

Three conclusions, each load-bearing:

1. **The bare form injects correctly today with ZERO changes to `cnxml-inject.js`.** The path is
   `tools/cnxml-inject.js:1603`. This is what makes step 1 an S.
2. **The bare form is byte-identical in output to what `__term__` produces today.** Switching the T
   button is output-neutral for every legitimate term — the change is that the *ambiguity* goes
   away, not that the markup changes.
3. **Minting synthetic ids is actively bad.** It fires the loud `console.warn` at
   `cnxml-inject.js:1608-1613` on every editor-created term whenever a sidecar exists, and it writes
   an invented `id=` into the CNXML. That collides directly with the lead's target #3
   (re-creating OpenStax-conformant CNXML for contribute-back): `<term>text</term>` is clean;
   `<term id="editor-1">text</term>` is a provenance claim we invented. **`|id` should stay
   extraction-only.**

**On "more informational": price it separately, and do not let this assessment bless it.**
The existing bracket grammar (`[[type:text|payload]]`) is already extensible — that is not the cost.
The cost is that a *new marker kind* must be added, in lockstep, to: 2 preview renderers, the
highlighter (whose stated invariant `stripTags(highlight(t)) === escapeHtml(t)` must survive),
`segment-validation.js`, `cnxml-inject.js`, `cnxml-extract.js`, and **the three independent
strippers** — where missing one produces a silent TM/corpus regression that no test will catch,
because the strippers' own tests assert on the markers they know about. That is the L→XL branch.
Re-pointing the toolbar at markers that *already exist end to end* touches essentially none of it.

**Recommendation:** ship the re-encoding first as its own PR. Decide "informational" afterwards, with
the (by then) single-dialect codebase as the baseline — designing a richer grammar on top of a
three-dialect substrate is how the current state was reached.

---

## 4. (b) Does the migration problem vanish?

**For files on disk: essentially yes. For prod's database: UNKNOWN, and the repo cannot answer it.**

### Files — measured

```
for b in books/*/; do for s in 02-for-mt 02-mt-output 03-faithful-translation 04-localized-content;
  do grep -rlE '__[^_]+__' "$b$s" --include='*.md' | grep -v '\.bak' | wc -l; done; done
```

| book | 02-for-mt | 02-mt-output | 03-faithful | what it actually is |
|---|---|---|---|---|
| `efnafraedi-2e` | 12 | 6 | **1** | real `__term__` markers — retired by the chemistry re-extract + re-MT |
| `liffraedi-2e` | 1 | 1 | 0 | **fill-in-the-blank blanks**, not term markers |
| `orverufraedi` | 2 | 2 | 0 | **fill-in-the-blank blanks**, not term markers |
| `__e2e-fixture__` | 0 | 1 | 0 | fixture |

I inspected every non-chemistry hit individually rather than trusting the regex — all six are
underscore runs like `myndun ________ tengis milli glúkósa og ________`. **Outside chemistry, there
is not one legitimate `__term__` marker in the entire corpus.**

And the editorial surface is genuinely tiny:

```
find books/*/03-faithful-translation -name '*-segments.is.md' | grep -v '\.bak'
→ books/efnafraedi-2e/… × 5, books/__e2e-fixture__/… × 1
```

Exactly **one real file** carries `__` (`efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md`).
Everything else matching the grep was a `.bak` or a `-review-status.json`. **File migration is
effectively zero work**, and it is consistent with §C16's independently-derived "4 modules /
62 applied segments".

### Database — **UNKNOWN**

Prod's `sessions.db` is gitignored and holds `segment_edits` rows whose `edited_content` still
carries `__`. Nothing in this repo can see them. §C16 already names the settling measurement and I
am not going to reason around it:

```sql
SELECT module_id, status, count(*) FROM segment_edits WHERE book='efnafraedi-2e'
GROUP BY module_id, status;
```

Run read-only on prod. Note this is the *same* query §C16 needs for the `--modules` scope decision —
one measurement, two answers.

**What the DB answer does and does not change.** It does **not** gate step 1: stopping the toolbar
from writing markdown is safe regardless of what old rows contain, precisely because the read side
keeps parsing markdown (§2). It gates only step 3, and even then weakly — the surviving rows'
markdown is displayed, not injected, unless someone re-applies them.

**Therefore: yes, the lead's re-extract + re-MT collapses the migration problem, with one carve-out.**
It retires all *data*-borne markdown. It does **not** retire the *generator*. §C16 already says this
("the mixed-dialect state does not decay — it REGENERATES"), and F2 sharpens it: the generator is
not merely regenerating stale dialect, it is regenerating dialect that **silently fails in 28% of
segments**.

### Two functions retired by data, not by the editor

The lens asks whether an id-anchored form makes `normalizeTermMarkers` unnecessary. Precisely:

- `tools/lib/mt-normalize.cjs:57-62` early-returns when `enTermCount === 0`, and its own B4 note says
  bracket-era EN carries no `__`. It is **already a no-op for any re-extracted module.**
- `tools/cnxml-inject.js:235` `restoreTermMarkers` has the same shape via its `enHasNewTerms`
  early-continue at `:253-267`.

Both are keyed on the **EN** side, which the editor never writes. So **re-extraction retires them,
not the editor change.** They belong in step 3's deletion PR, not step 1's — and keeping that
distinction is what keeps step 1 genuinely small.

---

## 5. (c) Is there an ordering where the editor changes first?

**Yes, and it is the safest available order. Step 1 is purely additive.**

### Step 1 — editor emits brackets · **S** · no gate

Change 3 emit sites in `segment-editor.js`: toolbar `:972-977`, shortcuts `:2789-2798`, glossary
insert `:2616`.

| button | now | → |
|---|---|---|
| B | `**…**` | `[[b:…]]` |
| I | `*…*` | `[[i:…]]` |
| T (Hugtak) | `__…__` | `[[term:…]]` — **bare, no id** (§3) |
| U | `++…++` | `[[u:…]]` (F3 — `++` is stale) |
| sub | `~…~` | `[[sub:…]]` |
| sup | `^…^` | `[[sup:…]]` |
| glossary insert | `__t__` | `[[term:t]]` |

`wrapSelection(id, prefix, suffix)` (`:2656`) already takes prefix/suffix separately, so every one of
these is a two-string swap. Verified end-to-end against real `reverseInlineMarkup`: all six bracket
forms convert correctly, **and unlike the markdown forms they convert in both guard branches.**

Plus the four missing localization-editor preview rules (F7) — mechanical, mirroring
`segment-editor.js:1718-1721`.

Why it is safe with no gate:
- Every read site already accepts brackets (§2), with the one gap F7 names and closes.
- Markdown parsing stays everywhere, so old DB rows and the one chemistry faithful file keep
  rendering.
- It fixes F2 as a side effect — the buttons start working in the 28% of segments where they
  currently don't.

Cost is dominated by **writing the tests that don't exist** (F5) plus a small doc pass:
`.claude/skills/inline-markers/SKILL.md:27` documents the markdown family as inject back-compat but
does not document the *toolbar* as a producer of it — and `docs/workflow/simplified-workflow.md`
documents no editor marker vocabulary at all. Neither is wrong today; both become wrong after step 1.

### Step 2 — delete the `__x__ → <term>` converter · **S** · gated on step 1 + chemistry re-MT

`tools/cnxml-inject.js:1481-1485`. This is the line that produces F1's biology defect and §C16's
orverufraedi ones. Per §4's census, once step 1 has shipped and chemistry is re-extracted, this
converter has **no legitimate input anywhere in the corpus** — every remaining `__` is a
fill-in-the-blank blank it should never have touched.

⚠️ **Step 1 does not fix the live defect on its own** — §C16 says this and I confirmed it: the blanks
come from source CNXML, the segments carry no bracket markers, so `hasApiMarkers` stays false and the
converter still fires. Step 2 is a separate, required change.

⚠️ **And neither step re-publishes.** The 3 pages in F1 stay wrong for readers until those modules are
re-injected, re-rendered and manually synced (CLAUDE.md § *Content delivery to readers*).

### Step 3 — delete `hasApiMarkers` and its 3 back-compat blocks · **M** · gated on chemistry re-MT

§C16 already measured this: `{{i}}`/`{{b}}` lives **only** in chemistry's stale MT output (76 files),
so the chemistry re-MT removes the guard's reason to exist. What §C16 correctly flags is that
removing the guard is only safe if the *markdown* converters it gates are dealt with too — which is
exactly what steps 1+2 do. **So steps 1 and 2 are prerequisites for step 3, and doing them first is
what makes step 3 a deletion rather than a redesign.**

⚠️ `{{term}}`/`{{fn}}` parsing must **stay** (§C16: 28 EN + 28 IS files across the four books this
migration does not touch). Do not conflate the two brace families.

### Where this sits against the lead's target

- Target #2 ("remove all legacy code") — steps 2 and 3 *are* a large slice of it, and steps 1+2 are
  what make step 3 possible at all. Doing the deletion PR first, without step 1, would break the
  editor's own toolbar.
- Target #3 (OpenStax-conformant CNXML for contribute-back) — favours bare `<term>` over invented
  ids (§3). Worth deciding once, here, rather than discovering it during the contribute-back work.
- Target #1 (re-extract + re-MT everything) — is the gate for steps 2 and 3, and it dissolves the
  file-migration problem entirely (§4).
- Glossary / TM / corpus exports "must keep working" — they do, unchanged, and get *better* (F6).

**Ordering risk if inverted:** doing the re-MT and the deletion PR before step 1 leaves the toolbar
writing a dialect inject no longer converts — i.e. F2 goes from "inert in 28% of segments" to
"inert in 100%", silently, with the preview still showing bold. That is the one order to avoid.

---

## 6. Unknowns, and the measurement that settles each

1. **How many `segment_edits` rows exist on prod, in which modules, at which status.** The repo
   cannot see it. → the read-only `GROUP BY module_id, status` query in §4, run on prod. Gates step 3
   and §C16's `--modules` scope; does **not** gate step 1.
2. **Whether any *editor-authored* markdown sits in a prod `segment_edits` row that has not yet been
   applied.** F2's 0-hit census covers the two *file* tiers (injected CNXML + published HTML), which
   is enough to rule out a render-path false negative — but rows never applied to a faithful file are
   invisible from the repo. → `SELECT count(*) FROM segment_edits WHERE edited_content LIKE '%**%'
   OR edited_content LIKE '%\_\_%' ESCAPE '\';` on prod. Decides whether F2 is purely latent or has
   already-authored instances waiting to land.
3. **Whether §C16's "38 files" markdown figure has other per-family errors.** F3 found `++` reported
   as 0 when it is 17. I did not re-derive the `*` / `~` / `^` rows. → the same per-family,
   per-stage census I ran for `__`, extended. Cheap; worth doing before the deletion PR quotes any
   of those numbers.
4. **What "more informational" means concretely.** Cannot be sized without a spec — the same
   grammar with a payload is a different project from a new marker *kind*. → a brainstorming session
   naming the specific tags wanted. Until then it is UNKNOWN, and the L→XL in §1's table is a
   floor derived from consumer count, not a real estimate.
5. **Whether `liffraedi-2e` ch03 has *other* modules with the same shape that are not yet injected.**
   I censused published HTML (definitive for what readers see) and `__x__` in segment files
   (definitive for the corpus), but the intersection for *un*published modules is unmeasured.
   → re-run the `<dfn>`-adjacency oracle after any re-inject, not before.

---

## 7. What I did not assess

- The `[[…]]` marker set's own completeness against CNXML inline elements (that is the
  `inline-markers` skill's domain).
- §C16 artifacts (b)–(e). Out of this lens.
- Whether the chemistry re-MT is itself achievable in the lead's timeframe — LENS C is the editor
  vocabulary only.
