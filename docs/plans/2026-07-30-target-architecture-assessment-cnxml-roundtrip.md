# LENS B — Can we really re-create OpenStax-spec Icelandic CNXML?

> **FROZEN EVIDENCE as of 2026-07-30.** This is an assessment, not a register. It carries no status
> verbs and owns no open work. Status lives in `docs/plans/2026-07-21-post-item17-followup-campaign.md`
> — if this document and the register disagree, **the register wins** (CLAUDE.md § *One source of truth*).

**Written:** 2026-07-30 · **Branch at time of writing:** `feat/c16-segment-edit-reattach` @ `d775e777`
**Scope:** goal 3(b) of the lead's target architecture — *"RE-CREATE Icelandic CNXML conforming to
OpenStax's spec, so it could one day be contributed back to OpenStax."*
**Method:** read-only. Every claim below is a `file:line` or a command whose output is quoted.
No repo file was modified except this one (`git status --porcelain` → only untracked `.codegraph/`).

---

## 0. Bottom line

**Goal 3(b) is two claims wearing one sentence, and they size an order of magnitude apart.
Do not let them travel together.**

| | Claim | Verdict | Size |
|---|---|---|---|
| **b1** | The pipeline emits **schema-valid CNXML that faithfully carries the source structure** | **Already true for chemistry, and measured.** 149/149 modules schema-clean; 126/149 tag-count perfect; 37 discrepancies, 0 unexplained | **M** to pin & gate (FINDINGS §6 prices it 2.25–3.25 d) |
| **b1′** | …**for all five books**, after the "re-extract and re-MT everything" of goal 1 | **NOT true today, and I can prove it.** Organic chemistry silently drops `<span>` (1071 occurrences, 184/342 modules — 54% of the book); physics' committed output carries **duplicate `@id`s** in 3 of 9 modules, schema-**invalid** from clean sources (⚠️ that output is 3 months stale — measure before sizing physics) | **L**, and it lands on goal 1's critical path — see §4 |
| **b2** | A **contribution to OpenStax** is plausible | **Separate project.** No `collection.xml` exists or can be fully regenerated; **6,882 `alt` texts** and every table `@summary` are English *by construction* (they never enter the MT path at all); no `xml:lang`; Icelandic modules claim the English modules' `md:uuid`/`md:content-id`; and two of five books are CC BY-NC-SA, which OpenStax cannot republish under CC BY | **XL** — its own campaign, and partly not a code problem |

**The single most useful thing to tell the lead:** b1 is the *strongest* asset in the whole target
architecture — better than the docs claim, and already reproducible in 1.5 seconds. b2 has never
been worked on and nothing in the pipeline was ever asked to do it. Announcing "we can contribute
to OpenStax" on the strength of b1 would be wrong by a wide margin.

---

## 1. What is emitted today — a complete module, not a working intermediate

`tools/cnxml-inject.js` writes `books/<book>/03-translated/{mt-preview,faithful}/<chNN>/<mid>.cnxml`.
On disk: `books/efnafraedi-2e/03-translated/mt-preview/` holds **153 files across 22 chapter dirs**,
`…/faithful/` holds the 4 edited chemistry modules.

Read side by side, `books/efnafraedi-2e/01-source/ch01/m68663.cnxml` vs
`books/efnafraedi-2e/03-translated/mt-preview/ch01/m68663.cnxml`:

- `<document xmlns="http://cnx.rice.edu/cnxml" class="introduction">` — root and its attributes
  copied verbatim from the original (`tools/cnxml-inject.js:1913-1918` regex-lifts
  `<document([^>]*)>` off `originalCnxml`).
- `<metadata>` present with `md:content-id`, `md:title` (translated, `:1960-1965`),
  `md:abstract` (translated, `:1954-1955`), `md:uuid`.
- `<content>` with `<figure id=… class="splash">`, `<media id=… alt=…>`, `<image mime-type= src=…>`,
  `<caption>`, `<para id=…>` — **all source `@id`s preserved byte-for-byte**.

So: **this is a complete, standalone CNXML module, not a working intermediate.** It is only
*documented* as an intermediate — `docs/workflow/simplified-workflow.md:53,258,367` describe
`03-translated/` purely as "Step 5a output" feeding `cnxml-render.js`. Nothing anywhere positions
it as a deliverable. That is a **framing gap, not a capability gap**, and it is the cheapest part
of 3(b) to close.

**Id preservation confirmed** (§C16's "56 of 62 edits key on a source element id" is consistent
with the tree): source `@id`s such as `fs-idp32962032`, `CNX_Chem_01_00_DailyChem`,
`fs-idm52126432`, `list-00001` all appear unchanged in the translated file. Ids survive because
they come from `01-source`, which is read-only by project rule.

---

## 2. Fidelity — what the 37 actually are

CLAUDE.md's "37 known discrepancies and 0 schema errors" is accurate but undifferentiated. Re-run
2026-07-30, `node tools/cnxml-fidelity-check.js --book efnafraedi-2e`:

```
Checked: 149 modules
Perfect: 126
With discrepancies: 23
Total discrepancies: 37 (0 unexplained)
Order check (warn-only): 1 module(s) with reordered content
Math check (warn-only): 0 module(s) with math differing from substituted source
EXIT=0
```

Classified from `books/efnafraedi-2e/translation-errors.json` (`tracks.mt-preview.summary`:
`deferredLosses: 20, benignArtifacts: 17`):

### 17 benign (genuinely cosmetic — do not spend time here)
- Empty self-closing `<emphasis/>` **in the OpenStax source** (zero content): m68710, m68734,
  m68768, m68786, m68793, m68846 (×2), m68848.
- Nested-`<sub>`/`<sup>` normalisation, content present: m68752, m68781, m68783 (−2), m68846.
- Icelandic rephrase adds one italic span: m68805 (+1), m68811 (+1).
- `<term>`-split over-annotation: m68709 (+1), m68735 (+1).

### 20 deferred losses — and only these matter
| Module | Diff | What it actually is | Severity |
|---|---|---|---|
| **m68826** | `title −1` | A `<note>` heading is **dropped** — "Statue of Liberty: Changing Colors" | 🔴 **reader-visible content loss** |
| **m68854** | `link −1` | A cross-reference (xref/docref) dropped at inject | 🔴 reader-visible (dead navigation) |
| **m68727** | `para −7` | 7 `<para>` **wrappers inside `<item>` flattened** | 🟠 **structure/id loss, text intact** |
| **m68818** | `para −1` | same mechanism | 🟠 same |
| m68716, m68733 (−3), m68741, m68822, m68842 (−2) | `emphasis −9` total | italic marker inside `<term>` notation flattened (`ΔH_lattice`, `E_cell`, `d`-/`f`-block) | 🟡 cosmetic-typographic |
| m68741, m68822 | `sub −2` | same `<term>`-flatten family | 🟡 |

**I checked m68727's `para −7` rather than trusting the label**, because "7 paragraphs missing"
and "7 wrappers flattened" are very different headlines. Parsed comparison:

- All 7 lost paras have `parent=item`, ids `fs-idp165042832`, `fs-idm35882976`, `fs-idp167199328`,
  `fs-idp160715680`, `fs-idp146331072`, `fs-idp146331744`, `fs-idp146344672`.
- **None of those ids appears anywhere in the translated file** (checked by substring, not just
  by element).
- **The Icelandic text is present**: `Efnafræðingar nota varmaefnajöfnu til að tákna breytingar á
  bæði efni og orku…` sits directly inside `<item>`, with its sibling
  `<equation id="fs-idp13211824" class="unnumbered">` still in place, in order.
- `<item>` count is 10 → 10.

**Verdict: not content loss — id and wrapper loss.** `<item>` is mixed-content in CNXML 0.7, so the
flattened form is schema-legal (consistent with 149/149 clean). But note the second-order cost:
those `@id`s are exactly the join key that §C16's re-attach design depends on ("56 of the 62 key on
a CNXML source element id"). **Nested-para ids are the subset that does *not* survive.**

### The warn-only findings nobody is looking at
- **`ORDER [warn-only]: m68662 — 23 id(s) out of document order`** (`pref-p-004`, `pref-sub-005`,
  `pref-p-006`, …). m68662 is the chemistry preface. Reordering is invisible to tag counts **and**
  to the schema gate (both see identical multisets), and the exit code is driven only by
  unexplained tag-count diffs (`tools/cnxml-fidelity-check.js:418-420`). This is the shape of
  FINDINGS §3 bug #3 (`<figure>` emitted after its `<media>`). **Neither gate blocks it.**
- Math check is genuinely at 0 — and `substituteMathLabels` **is** applied on the inject path
  (`tools/cnxml-inject.js:4127`, `:4186`), so Icelandic math labels reach the CNXML, not just the
  HTML. That is better than the 2026-03-18 fidelity-gaps doc implies.

### ⚠️ `docs/pipeline/cnxml-fidelity-gaps.md` is stale evidence, not status
It is dated **2026-03-18** and its headline numbers (27 missing inline elements, `<term>`
overproduction +56 in m68664, 15 lost `<emphasis>`) are all **superseded** by the 2026-07-14
`translation-errors.json` run above. Per CLAUDE.md § *One source of truth*, treat that doc as
frozen evidence; the live number is whatever `cnxml-fidelity-check.js` just printed. Its **Fix
Plan** section is still useful as a task list, but its counts should not be quoted.

---

## 3. Schema validity — the gate is adoptable, and cheaper than FINDINGS says

I read `experiments/cnxml-validation-gate/FINDINGS.md` before running anything, per its own
warning. The two traps (`-i` mandatory; jing **aborts the batch** after the first `fatal:`) are both
already handled inside `validate-cnxml.js`, so a naive fail-quiet run was avoided.

Toolchain is present on this box: `/usr/bin/jing`, `/usr/bin/java`. The schema clone is at
`experiments/cnxml-validation-gate/external/cnxml` (5.5 MB) and is **gitignored**
(`experiments/cnxml-validation-gate/.gitignore:3`) — i.e. the AGPL-un-vendored constraint is
already being honoured by construction.

**Re-verified 2026-07-30, chemistry translated output:**
```
$ node validate-cnxml.js --allowlist allowlist.recommended.json --quiet \
    ../../books/efnafraedi-2e/03-translated/mt-preview
149 file(s) checked in 1470 ms — 0 error(s) in 0 file(s), 245 suppressed by allowlist
    allowlist "c1-abstract-id": 245 suppressed
```
**The zero point holds.** 149 modules in 1.5 s.

**New measurement — the other four books' translated output** (FINDINGS only ever ran biology):

| Book | Translated modules | Result |
|---|---|---|
| `liffraedi-2e` | 11 | **0 errors** (FINDINGS' 13 biology defects are gone — fixed by C13 / #332 / #333) |
| `lifraen-efnafraedi` | 8 | **0 errors** |
| `orverufraedi` | 10 | **0 errors** |
| **`edlisfraedi-2e`** | 9 | 🔴 **10 errors in 3 files** |

Physics detail — and this one is new information:
```
✗ .../edlisfraedi-2e/03-translated/mt-preview/ch04/m42075.cnxml
    207  error: duplicate id "eip-id2265769" (first seen on line 163)
    251  error: duplicate id "eip-id1553388" (first seen on line 251)
    324  error: duplicate id "eip-id2503179" (first seen on line 251)
    475  error: duplicate id "eip-id1900825" (first seen on line 398)
✗ .../ch04/m42076.cnxml   (2 duplicate ids)
```
**The corresponding sources validate clean** — I checked `m42073`, `m42075`, `m42076` in
`01-source/ch04/` individually: `0 error(s)` each.

⚠️ **What this does and does not prove.** The committed physics output is **stale**:
`git log -1 --format=%ci -- books/edlisfraedi-2e/03-translated/mt-preview/ch04/m42075.cnxml`
→ **2026-04-19**, while `tools/cnxml-inject.js` last changed **2026-07-27** — a three-month gap
spanning C13 and several inject fixes. So the honest claim is: **the committed physics CNXML in the
tree is schema-invalid, and the source it came from is not.** Whether *today's* inject still
produces it is **unmeasured**. The same staleness caveat applies to physics' `emphasis 31→18` /
`para 120→112` divergences in §4. One re-inject of `m42075` settles both (Unknown #3/#4).

**Is a RelaxNG gate realistically adoptable as CI? Yes.**
- Runtime is negligible (1.5 s/book, ~5 ms/module after JVM warm-up).
- The one real design question is schema provisioning, and FINDINGS §6-A prices it at 0.5–1 d.
  The gitignored-clone pattern already in the experiment is the obvious answer; a `postinstall`
  or a cached clone both keep the AGPL schema un-vendored.
- **Block/warn should follow measured coverage, not the pass rate.** A clean result over 3–6% of a
  book is not a licence to block it — the first newly-injected module that fails would wedge the
  pipeline mid-onboarding, which is exactly why FINDINGS put biology on WARN.

  | Book | Injected / source modules | Coverage | Recommendation |
  |---|---|---|---|
  | `efnafraedi-2e` | 149 / 149 | **100%** | **BLOCK** |
  | `liffraedi-2e` | 11 / 259 | 4% | WARN |
  | `lifraen-efnafraedi` | 8 / 342 | 2% | WARN |
  | `orverufraedi` | 10 / 159 | 6% | WARN |
  | `edlisfraedi-2e` | 9 / 283 | 3% (and 3 failing) | WARN |

  The genuinely new information versus FINDINGS is **not** that more books can block — it is that
  **biology's 13 defects are gone** (C13 / #332 / #333 cleared them), so the "fix biology before
  the gate can be enforced" prerequisite in FINDINGS §6 F–H has largely been paid. Promote a book
  to BLOCK when its injected set approaches its source set, not before.
- ⚠️ Adopt FINDINGS' own caveat: **the gate does not catch a single one of the 37 fidelity
  discrepancies.** `m68709`'s `term +1` is perfectly schema-valid. Schema validity ⊥ fidelity, as
  CLAUDE.md says; the gate is a *complement* to `cnxml-fidelity-check.js`, never a replacement.
  It also cannot see the m68662 reordering.

---

## 4. Is extract→inject information-preserving? No — it is **preserving-by-enumeration**

This is the architectural answer, and it is the thing that decides whether goal 1 ("re-extract and
re-MT *all* content") is safe.

### The mechanism
`tools/cnxml-extract.js` is **regex-based, not DOM-based** — it imports from
`tools/lib/cnxml-parser.js`, whose header says so outright:

> `Uses regex-based parsing to avoid external dependencies` — `tools/lib/cnxml-parser.js:1-7`

The content walker is `walkContent` at `tools/lib/cnxml-parser.js:355-378`. Its dispatch is:

```js
if (handlers[tagName]) {
  ...handlers[tagName](...)
}
```

**There is no `else`. There is no default branch. There is no warning.** An element with no
registered handler is simply not seen: its tags evaporate and whatever text it contained is picked
up (or not) by whichever enclosing handler matched.

The block-level handler set is a closed `switch` at `tools/cnxml-extract.js:936-1057` with exactly
**11 cases**: `para`, `figure`, `table`, `example`, `exercise`, `note`, `equation`, `list`, `media`
(+ `section`, `glossary` handled separately). A census of every `type` value in all
`books/efnafraedi-2e/02-structure/*/*-structure.json` confirms only those 11 ever appear.

**So the loss profile of an unknown element is: silent, text-preserving, markup-destroying.**
Not a crash, not a warning, not a schema error. That is the worst of the three possible profiles
for a fidelity claim, because it is invisible to every gate we have except a tag-count diff.

### What that costs today, measured per book

I parsed (`@xmldom/xmldom`, per CLAUDE.md's "parse it, don't regex it" rule) every module that
exists in **both** `01-source` and `03-translated`, and diffed per-element counts. Non-chemistry
results:

```
### edlisfraedi-2e — 9 translated modules
  m42069: PERFECT
  m42073: equation 18→22 | m:math 101→105 | para 105→101 | title 19→21
  m42074: title 16→18
  m42075: emphasis 31→18 | equation 34→38 | m:math 151→155 | para 120→112 | sub 5→3 | title 21→23
  m42076: equation 2→4 | m:math 62→64 | sub 1→0 | title 11→7
  m42129: emphasis 7→6 | iframe 1→0 | image 2→3
  m42130: emphasis 7→5
  m42132: emphasis 23→21 | title 36→30
  m42137: emphasis 14→15 | image 6→7 | media 6→7 | sub 1→0 | term 5→6 | title 12→11

### liffraedi-2e — 11 translated modules   (10 PERFECT, 1× term 18→19)

### lifraen-efnafraedi — 8 translated modules
  m00031: PERFECT
  m00032: image 36→35 | media 36→35 | para 10→9 | span 10→0
  m00033: link 8→6 | span 2→0
  m00034: PERFECT
  m00035: emphasis 33→32 | link 6→5 | span 9→0
  m00036: link 2→1
  m00037: link 4→3 | span 2→0 | term 9→8
  m00038: span 8→0

### orverufraedi — 10 translated modules
  m58781: emphasis 39→36 | foreign 1→0 | term 13→12
  m58782: emphasis 39→36 | term 14→21          ← the C16(a) __blank__ module
  ...
```

**Named losses, with reach:**

| Element | Reach in source | Fate | Why it matters |
|---|---|---|---|
| **`<span class="magenta-text">`** | **1071 occurrences in 184 of 342 `lifraen-efnafraedi` modules** (54% of the book) | **100% dropped** — `10→0`, `9→0`, `8→0`, `2→0` in every module that has one. Inner text survives as plain text; the class does not | In an organic-chemistry text, magenta highlights the **reacting functional group**. Losing it is losing the pedagogy, not decoration |
| `<foreign xml:lang="ar">` | 1 (`orverufraedi` m58781, `al-Qānūn fī al-Ṭibb`) | dropped | Correct language tagging, screen-reader pronunciation |
| `<iframe>` | 57 physics + 51 biology = **108** | `1→0` in physics m42129 (with `image 2→3` — an embed became a static image) | Interactive simulations; D4 embeds work is aware of this |
| `<quote>` (4), `<subfigure>` (2), `<tfoot>` (1), `c:thead` (1) | rare | untested | low volume, but unhandled |
| default-namespace MathML (`<math>`, `<mn>`, `<mi>` without `m:`) | 7 physics files | untested through inject | FINDINGS §1 already noted the prefix variance |

⚠️ **A grep is not evidence here.** My first pass ran
`grep -c "'span'\|\"span\"" tools/cnxml-extract.js` → 0 and concluded "unhandled". The same grep
returns 0 for `label` and `footnote` — and both round-trip **exactly** (`<label>` 105→105,
`<footnote>` 36→36 in chemistry), because they go through the inline-marker path
(`tools/cnxml-extract.js:397-407`, `[[fn:…|id]]`). The `span` finding above rests on the
**data diff**, not the grep. Anyone re-checking this should do the same.

### The double-encoding note is on the *other* path
`escapeAttr` does **not** appear in `tools/cnxml-inject.js` at all. It lives at
`tools/lib/cnxml-elements.js:419` and is used only on the **HTML render** path — notably
`:858` for `<img … alt="${escapeAttr(alt)}">`. So `serialize→escapeAttr` double-encoding is a
**goal 3(a) web-export defect, not a 3(b) CNXML defect**. One interaction worth flagging:
it is latent specifically in `alt`, which is exactly the attribute 3(b) would have to start
translating (§5) — **fixing `alt` activates the latent bug**. Sequence them together.

### The safety net that half-exists — read this before relying on it
`tools/verify-reextract-equivalence.js` compares a committed extraction against a fresh one on
three axes: segment-**id set** equality, normalised **visible text** equality per id, and the
**equation key-set** (an added/removed `math-N` key renumbers every `[[MATH:N]]` placeholder that
existing IS translations carry — the m68852 mechanism). Its header records it was verified over all
149 chemistry modules on 2026-07-07 with residual exactly `{m68819, m68852}`.

**It is the right *idea* for goal 1's mass re-extraction. It is not yet a per-book gate.** Three
things I checked rather than assumed:

1. **It is a CLI** — `if (import.meta.url === \`file://${process.argv[1]}\`)` at
   `tools/verify-reextract-equivalence.js:134`. Good.
2. **But the CLI block is chemistry-only and hardcoded.** Lines 135–137:
   `verifyBook('efnafraedi-2e', modulesFile, known)` with
   `const known = new Set(['m68819','m68852'])`, and its module list comes from
   `process.argv[2] || '/tmp/reextract-modules.txt'`. There is no `--book`, no `parseArgs`, and the
   waiver set is a literal. Running it over biology/physics/organic requires generalising it first.
3. **It does not pass cleanly on chemistry today.** Register §C8 **REEQ-1** (line 425):
   *"`normalizeVisibleText` nested-bracket term false-flags `m68727`/`m68747`, blocking clean
   verify-reextract-equivalence runs on chemistry (waivable → fails safe)."*

So the correct sizing is **S–M to turn it into the gate**, not "free". `tools/__tests__/verify-reextract-equivalence.test.js`
exercises the two exported functions, so the comparison logic is covered; the runner is what's thin.

---

## 5. What OpenStax would actually require — and what is missing

Judging against the `osbooks-*` / POET git-storage flavour that FINDINGS §1 empirically identified
our sources as (unversioned, no `module-id`, no DOCTYPE — confirmed across all 1192 source files).

| Requirement | Status | Evidence |
|---|---|---|
| Schema-valid CNXML 0.7 modules | ✅ chemistry, biology, organic, microbiology · 🔴 physics | §3 |
| Element `@id`s preserved | ✅ mostly · 🟠 nested-`<para>`-in-`<item>` ids lost | §1, §2 |
| Media files | ✅ 697 files committed in `books/efnafraedi-2e/media/` | `ls` |
| `<image src="../../media/…">` paths | ✅ preserved verbatim | §1 |
| **`collection.xml`** | 🔴 **DOES NOT EXIST.** `find books -name 'collection*.xml' -o -name '*.collxml'` → **empty** | — |
| …its input data | 🟡 **partly.** `books/*/01-source/collection-order.json` exists for all 5 books (generated by `download-source.js` from the upstream collection.xml) — but it is a **reduced projection**: `{chapters:[{chapter,title,modules[]}], preface, appendixModules[]}`. No uuids, no `version-at-this-collection-version`, no nested subcollections, no `md:` block. The original collection.xml is **not retained anywhere** | `tools/lib/chapter-modules.js:20-37`; file dump |
| Icelandic chapter titles for a translated collection | ✅ tool exists (`tools/translate-chapter-titles.js`) | CLAUDE.md commands table |
| **`alt` text translated** | 🔴 **No — untranslated *by construction*, not by omission** | See below |
| **Table `@summary` translated** | 🔴 no — e.g. m68674's `summary="Length is measured with the meter…"` survives verbatim into the Icelandic file | §1 comparison |
| **`xml:lang`** | 🔴 **absent from every translated file.** The Icelandic module never declares it is Icelandic | `grep -l 'xml:lang' …/03-translated/ch01/*.cnxml` → empty |
| **Module identity** | 🔴 `md:uuid` and `md:content-id` are **copied verbatim**. `m68663`'s Icelandic file claims uuid `0d8fa7a1-89a1-46a8-b340-aa25a6093908` — the English module's identity | §1 |
| Repo layout | 🟠 ours is `books/<slug>/01-source/<chNN>/<mid>.cnxml`; osbooks is `modules/<mid>/index.cnxml` + `collections/*.collection.xml` + `META-INF/books.xml`. Mechanical, but not done | — |
| **Licence compatibility** | 🔴 **`edlisfraedi-2e` and `lifraen-efnafraedi` are CC BY-NC-SA 4.0** (CLAUDE.md § *THIS REPOSITORY IS PUBLIC*). OpenStax publishes CC BY. **A ShareAlike-NC derivative cannot be republished by OpenStax under their own licence.** Chemistry / biology / microbiology are CC BY and are fine | `books/*/book-config.json` |

**Two of these are not code problems at all.** The licence row rules out two of the five books
independently of any engineering. And whether OpenStax *ingests* a community translation — as a
new `osbooks-*` repo they host, as a locale variant, or not at all — is a relationship question
this repository cannot answer (see § *Unknowns*).

### The `alt` / `@summary` gap — structural, not an oversight

`alt` is not "forgotten"; it is **architecturally excluded from translation**:

- `tools/cnxml-extract.js:1057-1074` (`case 'media'`) captures
  `alt: mediaAttrs.alt || imageAttrs.alt || ''` as a **plain attribute on the structure record**,
  alongside `src`, `class`, `embedSrc`, `width`, `height`.
- It is written to `02-structure/*-structure.json` and **never emitted as a segment**:
  `grep -c 'alt=' books/efnafraedi-2e/02-for-mt/ch01/*.md` → **0** in every file. Nothing with an
  `alt` ever reaches `02-for-mt/`, so nothing with an `alt` ever reaches the Málstaður API.
- Inject then writes the stored English string straight back out.

Same mechanism for table `@summary` (stored on the table structure record; m68674's
`summary="Length is measured with the meter…"` survives verbatim into the Icelandic file).

**No regex can falsify this and no better MT can fix it** — the text is not in the translation
path at all. Adding it means a new segment kind end-to-end (extract → `02-for-mt` → MT →
editor → inject), which is a pipeline change, not a data job.

**Volume, measured:** `grep -oh 'alt="' books/*/01-source/*/*.cnxml | wc -l` → **6,882 `alt`
attributes across 1,192 source modules** (~5.8/module), plus table summaries. This is the single
biggest lump of work in b2 — and it is *also* a live accessibility defect today, shipping English
image descriptions to Icelandic students in every published book.

---

## 6. So: small delta, or separate project?

**b1 — small delta on what exists. M.**
The emitted CNXML is already a complete module. What's missing is *positioning and pinning*:
document `03-translated/` as a deliverable and adopt the schema gate (FINDINGS §6 A–E,
2.25–3.25 d). The prerequisites — jing, the schema clone, the gate script, an allowlist with a
proven zero point, the fidelity checker — are all built and reproducible today.
(`verify-reextract-equivalence.js` is *not* in that list: see §4 — chemistry-hardcoded runner,
plus register REEQ-1 blocking a clean chemistry run.)

**b1′ — generalising b1 to all five books. L, and it blocks goal 1.**
The `<span>` drop is the wall, not a paper cut: 54% of organic chemistry's modules. Adding a
handler is not hard in itself, but each new element type needs an extract handler, an inject
emitter, a marker (if inline), a fidelity-allowlist entry and a test — and there are 6–8 of them
(`span`, `foreign`, `iframe`, `quote`, `subfigure`, `tfoot`, `c:thead`, default-ns MathML). Plus
physics, whose committed output carries duplicate `@id`s and large `emphasis`/`para` divergences —
though that output is from 2026-04-19 and may be stale, so **measure before sizing physics**
(Unknown #3/#4). **Goal 1 says "ALL current content is re-extracted and
re-MT'd" — chemistry is the only book with a proven round-trip, and re-MT'ing organic chemistry
today would re-issue 1071 dropped `<span>`s as a fresh, deliberate act.**

**b2 — separate project. XL.**
Nothing in the pipeline was ever asked to do this. A collection.xml generator, a full repo-layout
converter, **6,882 alt texts** + table summaries to route through a segment path that does not yet
exist for them and then review, `xml:lang` plumbing, a module
identity scheme, and a licence decision that eliminates two books before any code is written. Then
a conversation with OpenStax that has not happened. This is a campaign, not an item.

---

## 7. How this fits the current campaign

- **b1's gate work is already priced and sequenced** — `experiments/cnxml-validation-gate/FINDINGS.md`
  §5–§6 is a written plan (A–E = 2.25–3.25 d) that nobody has executed. It is not in the register
  as an item. **Recommend: file it as a P1 item.** Its block/warn split should be re-derived from
  §3 above (four books BLOCK, physics WARN) — better than FINDINGS' July assessment.
- **§C16 and b1 overlap on `cnxml-inject.js`.** C16(a)'s fix direction ("make the editor's term
  marker id-anchored `[[term:text|id]]` so `:1481-1485` can go entirely") is *the same file and the
  same function family* as the `<span>`/`<foreign>` handler work. Scope them together or accept
  two adversarial reviews on the highest-risk file in the pipeline.
- **§C16's re-attach depends on ids that §2 shows are not universally preserved.** 56/62 edits key
  on a source element id — true — but nested-`<para>`-in-`<item>` ids are dropped at inject
  (m68727, m68818). Small today; worth knowing the exception exists.
- **The C16 clean break should adopt the schema gate as an acceptance criterion.** It exists, it
  runs in 1.5 s over the whole book, and chemistry's zero point means any regression the re-MT
  introduces shows up immediately. Near-zero cost, highest-value risk reduction available.
- **`verify-reextract-equivalence.js` is the *second* criterion, but it needs work first** — the
  runner is chemistry-hardcoded and register REEQ-1 currently false-flags m68727/m68747. Fix or
  waive REEQ-1 **before** the clean break's re-extract step, not during it.
- **Goal 1's "re-extract everything" needs that equivalence check generalised per book**, and needs
  the `<span>` decision made first for organic chemistry.

---

## 8. Unknowns — and the measurement that would settle each

1. **Does OpenStax accept community translations, and in what shape?** Not answerable from the
   repo. The CC licences permit us to translate and publish; that is not the same as OpenStax
   ingesting our repo. **Measurement:** ask OpenStax directly (support@openstax.org / the
   `openstax/template-osbooks` GitHub org). Until answered, b2 has no acceptance criteria and
   cannot be planned.
2. **Would a `<span>` handler be enough, or does organic chemistry need more?** I measured the
   8 already-translated organic modules. **Measurement:** extract+inject 5 more `span`-heavy
   modules in a scratch tree and re-run the per-element diff — ~1 h, no repo mutation.
3. **Does *today's* inject still produce physics' duplicate `@id`s?** Sources validate clean; the
   committed output does not — but that output is dated **2026-04-19** and `cnxml-inject.js` last
   changed **2026-07-27**. **Measurement:** re-inject `m42075` into a scratch tree and re-run
   `validate-cnxml.js`. If clean, the tree holds stale invalid output (still worth regenerating);
   if not, it is a live inject bug and belongs in the register independently of 3(b).
4. **Same question for physics' `emphasis 31→18` / `para 120→112` divergences** — the same
   re-inject + per-element diff answers both in one run. **Do not size physics before this.**
5. **Is `m68662`'s reordering benign?** 23 ids out of document order in the chemistry preface,
   warn-only, caught by neither gate. **Measurement:** render m68662 and read the published preface
   against the source. Cheap; there is already a memory topic `chemistry-preface-m68662`.
6. **Can a valid `collection.xml` be generated from `collection-order.json` alone?** It has chapter
   order, titles, preface and appendices, but no uuids or version attributes.
   **Measurement:** fetch one upstream `*.collection.xml` (metadata only — this does **not** touch
   `books/*/01-source/**.cnxml` and so is outside the double-consent rule, but confirm with the
   lead) and diff the required attribute set against what we hold.
7. **Is `<iframe>` intentionally converted to an image, or dropped?** Physics m42129 shows
   `iframe 1→0` with `image 2→3`. **Measurement:** read the `d4-iframe-embeds` topic and
   `tools/resolve-embeds.js`; this may be by design.

---

## Appendix — commands, so this is re-derivable

```bash
# fidelity (chemistry) — writes nothing without --report/--annotate
node tools/cnxml-fidelity-check.js --book efnafraedi-2e

# schema gate — read FINDINGS.md first; -i and fatal-resume are handled inside the script
cd experiments/cnxml-validation-gate
node validate-cnxml.js --allowlist allowlist.recommended.json --quiet \
  ../../books/efnafraedi-2e/03-translated/mt-preview      # 149 files, 0 errors, 1470 ms
node validate-cnxml.js --allowlist allowlist.recommended.json --quiet \
  ../../books/edlisfraedi-2e/03-translated                # 10 errors in 3 of 9 files

# per-element round-trip diff — the measurement that found the <span> drop.
# Parse with @xmldom/xmldom; run from the repo root so the import resolves.
# Compare counts(01-source/**/<mid>.cnxml) vs counts(03-translated/**/<mid>.cnxml).

# re-extraction safety net — NOTE: chemistry-hardcoded, takes a module-list file, no --book.
# See §4 before relying on it; register REEQ-1 blocks a clean chemistry run today.
node tools/verify-reextract-equivalence.js /tmp/reextract-modules.txt

# freshness of the physics evidence (Unknown #3/#4)
git log -1 --format=%ci -- books/edlisfraedi-2e/03-translated/mt-preview/ch04/m42075.cnxml
git log -1 --format=%ci -- tools/cnxml-inject.js

# alt-text volume, corpus-wide
grep -oh 'alt="' books/*/01-source/*/*.cnxml | wc -l    # 6882 over 1192 modules
```

**Read-only confirmation:** `git status --porcelain` after all of the above returned only
`?? .codegraph/`. No tracked file was modified.
