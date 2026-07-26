# BASELINE-REPORT — validating reinjected CNXML against OpenStax's RelaxNG schema

Task 2 of the CNXML validation-gate experiment. Everything here is measured, not
estimated; raw jing output is in `results/` (gitignored). Schema, flags and pinned
commits: [SETUP.md](SETUP.md).

## 0. Method: paired runs, not one-sided

Class (c) in the brief is defined as "errors also present in the originals". That is
only an empirical claim if the originals are actually run. So every reinjected module
was validated **together with its pristine `01-source/` counterpart**, same schema,
same invocation, and the two error sets were diffed (`analyze-paired.mjs`).

The join key is **(moduleId, normalized-message, count)** — deliberately *not*
`file:line:col`. Icelandic text has different lengths than the English source, so line
numbers drift between the two sides; keying on them would make every original error
look "new" and would silently blame the pipeline for OpenStax's own quirks.

Four buckets fall out of the diff:

| Bucket | Meaning |
|---|---|
| signature only in reinjected | class (a) or (b) — we introduced it |
| same signature, higher count in reinjected | partly new — investigate the delta |
| same signature and count on both sides | class (c) — schema noise / upstream |
| signature only in the original | pipeline **dropped** something — also a finding |

### ⚠️ A methodological trap that materially changed these results

jing **aborts the entire remaining batch** after the first `fatal:` (well-formedness)
error. The first version of the paired analysis used one batched call per side, so a
single malformed biology module (`m66443`) suppressed validation of every file after
it. That produced two wrong conclusions:

- three real defects in `liffraedi-2e/ch05` were invisible, and
- eight abstract-id errors appeared to be "present in original, absent in reinjected",
  i.e. a phantom "the pipeline dropped something" finding — for files jing never opened.

Both the analysis script and the gate script now resume past each fatal until every
file has genuinely been validated. **All numbers below are post-fix.** Anyone repeating
this work with a naive `jing schema.rng *.cnxml` will get materially wrong answers.

## 1. Pilot set — chosen by measurement

Selected by counting elements per chapter in `03-translated/mt-preview/`, not by topic
intuition:

| Chapter | Modules | `<m:math>` | `<table>` | `<list>` | `<equation>` | Why chosen |
|---|---|---|---|---|---|---|
| ch14 | 8 | **578** | 6 | 9 | **193** | math-heaviest in the book |
| ch12 | 8 | 421 | **37** | 12 | 133 | table-heaviest **and** a re-rendered-slug chapter |
| ch09 | 7 | 194 | 9 | 11 | 89 | re-rendered-slug chapter |
| ch13 | 5 | 321 | 2 | 8 | 120 | re-rendered-slug chapter |
| ch07 | 7 | 178 | 8 | **25** | 26 | most `<list>` elements — structural variety |

35 modules. The track is **mt-preview** because it is the only track with full
coverage (149 modules vs 4 for `faithful`); both tracks go through the same
`cnxml-inject.js`. The 4 `faithful` modules are reported separately in §3.

## 2. Pilot result — per file

Every pilot module: **PASS**. The only errors are the class-(c) abstract-`id` class,
present in identical count in the pristine original of the same module.

| chapter | module | raw errors | class | gate verdict |
|---|---|---|---|---|
| ch07 | m68736 | 1 | (c) abstract-id | PASS |
| ch07 | m68737 | 2 | (c) abstract-id | PASS |
| ch07 | m68738 | 2 | (c) abstract-id | PASS |
| ch07 | m68739 | 2 | (c) abstract-id | PASS |
| ch07 | m68740 | 2 | (c) abstract-id | PASS |
| ch07 | m68741 | 2 | (c) abstract-id | PASS |
| ch07 | m68742 | 2 | (c) abstract-id | PASS |
| ch09 | m68748 | 1 | (c) abstract-id | PASS |
| ch09 | m68750 | 2 | (c) abstract-id | PASS |
| ch09 | m68751 | 2 | (c) abstract-id | PASS |
| ch09 | m68752 | 2 | (c) abstract-id | PASS |
| ch09 | m68754 | 2 | (c) abstract-id | PASS |
| ch09 | m68758 | 1 | (c) abstract-id | PASS |
| ch09 | m68759 | 2 | (c) abstract-id | PASS |
| ch12 | m68785 | 1 | (c) abstract-id | PASS |
| ch12 | m68786 | 2 | (c) abstract-id | PASS |
| ch12 | m68787 | 2 | (c) abstract-id | PASS |
| ch12 | m68789 | 2 | (c) abstract-id | PASS |
| ch12 | m68791 | 2 | (c) abstract-id | PASS |
| ch12 | m68793 | 2 | (c) abstract-id | PASS |
| ch12 | m68794 | 2 | (c) abstract-id | PASS |
| ch12 | m68795 | 2 | (c) abstract-id | PASS |
| ch13 | m68796 | 1 | (c) abstract-id | PASS |
| ch13 | m68797 | 2 | (c) abstract-id | PASS |
| ch13 | m68798 | 2 | (c) abstract-id | PASS |
| ch13 | m68799 | 2 | (c) abstract-id | PASS |
| ch13 | m68801 | 2 | (c) abstract-id | PASS |
| ch14 | m68802 | 1 | (c) abstract-id | PASS |
| ch14 | m68803 | 2 | (c) abstract-id | PASS |
| ch14 | m68804 | 2 | (c) abstract-id | PASS |
| ch14 | m68805 | 2 | (c) abstract-id | PASS |
| ch14 | m68806 | 2 | (c) abstract-id | PASS |
| ch14 | m68807 | 2 | (c) abstract-id | PASS |
| ch14 | m68808 | 2 | (c) abstract-id | PASS |
| ch14 | m68809 | 2 | (c) abstract-id | PASS |

**35 modules, 64 raw errors, 64 of them class (c), 0 class (a), 0 class (b).**

## 3. Widened to everything reinjected

Because the run is so cheap (~1.3 s per book) the pilot was extended to every
reinjected module that exists:

| Set | Modules | Raw errors | (a) reinjection bugs | (b) divergences | (c) noise | Dropped-vs-original |
|---|---|---|---|---|---|---|
| efnafraedi-2e `mt-preview` | 149 | 245 | **0** | 0 | 245 | 0 |
| efnafraedi-2e `faithful` | 4 | 5 | **0** | 0 | 5 | 0 |
| liffraedi-2e `mt-preview` | 11 | 31 | **13** | 0 | 18 | 0 |

Chemistry — the mature book, 149 modules through the full extract→MT→inject path,
including the math- and table-heaviest chapters — is **structurally perfect**: its
reinjected CNXML is exactly as schema-valid as the OpenStax source it came from, error
for error. The 4 `faithful` modules that actually ship are equally clean.

Biology, which is early in onboarding, is not.

## 4. Class (c) — the schema noise, fully characterised

Three classes, all reproduced on pristine `01-source/` content across all five books
(1192 files, 666 errors). None is attributable to our pipeline.

### (c1) `@id` forbidden inside `<md:abstract>` — 660 errors, 5/5 books

```
error: attribute "id" not allowed here; expected attribute "data-platform-hidden",
       "display", "list-type", … or "xml:lang"
```

`cnxml-common-jing.rng` binds abstract content to `cnxml-abstract-common-attributes` →
`common-attributes-noclass` (`cnxml-defs.rng:933-945`), which allows only
`xml:lang` and `data-platform-hidden`. But OpenStax's own generator stamps
`id="para-00001"` / `id="list-00001"` onto every `<para>`/`<list>`/`<item>` in the
abstract. **OpenStax content violates the OpenStax schema**, in 660 of 1192 files.

Both `poet-schema` and `master` reject it identically, so it is not a branch artifact.

### (c2) `data-platform-hidden` made co-required with `xml:lang` — 1 error

```
orverufraedi/01-source/ch01/m58781.cnxml:70: element "foreign" missing required
       attribute "data-platform-hidden"
```

A genuine RELAX NG authoring bug on the `poet-schema` branch. `cnxml-defs.rng:935-944`
wraps **two** `<attribute>` elements in one `<optional>`:

```xml
<optional>
  <attribute name="xml:lang"/>
  <attribute name="data-platform-hidden">…</attribute>
</optional>
```

In RELAX NG that makes the *group* optional, i.e. both-or-neither — so any element
carrying `xml:lang` alone is rejected. `master` has no `data-platform-hidden` and so
does not show this. Worth reporting upstream.

### (c3) legacy physics module `m42103` — 5 errors

`<equation>` mixing literal text (`(a)At`) with `<m:math>`/`<sup>`, which the CNXML 0.7
equation content model disallows. An upstream authoring defect in a legacy CNX module
(`m421xx` id range), present in the pristine source.

### Systematic? Yes — so allowlist, don't "fix"

All three are systematic and none originates with us, so treating them as failures
would be wrong, and "fixing" (c1) would mean editing 660 pristine source files — which
`01-source/` rules forbid outright. A **documented allowlist** is the right instrument:
`allowlist.recommended.json` encodes exactly these three, each with its cause, evidence
and a stated risk of what it could mask.

With that allowlist, **all 1192 pristine source files validate clean (0 errors, 6.5 s)**
— the gate has a well-defined zero point.

Note this is class (c), not class (b): the experiment found **zero** intentional
divergences of ours. `allowlist.json` (the default) is therefore empty, as specified.

## 5. Class (a) — the real reinjection bugs, all in biology

13 errors across 7 of 11 biology modules. Ranked by severity.

### (a1) Content silently dropped → empty required elements — 8 errors, 4 modules

```
m66438.cnxml:111:12  element "glossary" incomplete; missing required element "definition"
m66438.cnxml:37:11   element "section" incomplete; expected element "code", "definition", …
```
(identically in m66440, m66441, m66442)

Traced through the pipeline:

| Stage | State |
|---|---|
| `01-source` | `<glossary>` with 5 `<definition>`; `<section class="summary">` with its para |
| `cnxml-extract` → `02-structure` | glossary captured correctly, 5 items with segment ids |
| `02-for-mt` (EN) | **43 segments**, including 5 `glossary-term`, 5 `glossary-def`, 9 `problem`, 6 `solution` |
| `02-mt-output` (IS) | **13 segments** — every `glossary-*`, `problem` and `solution` segment absent |
| `cnxml-inject` → `03-translated` | emits `<glossary></glossary>` and an empty `<section>` |

**Suspected stage: step 2, machine translation (`api-translate.js`).** 30 of 43 segments
never reached `02-mt-output` for m66438 (m66440: 84→32; m66443: 94→48). Whole segment
*categories* vanish, not a tail truncation.

**Injection then converts that into invalid output silently.** `cnxml-inject.js:1864-1874`
`getSeg()` returns `''` for a missing segment and only warns under `--verbose`; the
glossary emitter at `:2023` guards `if (termText && defText)` and so **skips the whole
`<definition>`**, leaving an empty `<glossary>`. Reader impact: the glossary and the
Section Summary are simply gone from the page.

This is precisely the "fails silently" risk the experiment set out to test — and the
schema gate catches it, because CNXML requires `<glossary>` to contain ≥1 `<definition>`.

### (a2) `<figure>` open tag migrates past its `<media>` — 3 errors, 2 modules

```
m66375.cnxml:31:10  element "caption" not allowed yet; expected element "code",
                    "label", "media", "subfigure", "table" or "title"
```

Structural skeleton, `m66375` (figure inside `<para>` inside `<note class="visual-connection">`):

```
ORIGINAL:  <para> <figure> <media>…</media> <caption>…</caption> </figure> </para>
INJECTED:  <para> <media>…</media> <figure> <caption>…</caption> </figure> </para>
```

Tag counts stay balanced (5 open / 5 close), so this is not a nesting break — the
`<figure>` **start tag is emitted after the media**, so the image escapes the figure and
the figure retains only a caption. Reader impact: the image loses its figure
association, caption pairing and figure numbering.

**Suspected stage: step 5a, `cnxml-inject.js`** — figure-inside-`<para>` handling. This
is the same family as the 2026-03-30 duplicate-figure fix (figures nested in `<para>`
inside `<example>`/`<exercise>`, fixed via the `buildNoteDom` pattern); the `<note>`
case appears not to be covered.

### (a3) Malformed table cell — well-formedness break — 2 errors, 1 module

```
m66443.cnxml:66:18  text not allowed here; expected the element end-tag or element "entry" …
m66443.cnxml:66:20  fatal: The element type "row" must be terminated by "</row>"
```

Line 66 is literally `<entry/>Starfsemi</entry>` — a self-closed element followed by
text and a close tag. The original header is:

```xml
<row><entry/><entry>DNA</entry><entry>RNA</entry></row>
```

i.e. an empty corner cell. Injection wrote translated content into that cell **without
removing the self-closing slash**, and the cells also shifted by one row (the body row
"Function | Carries genetic information | …" landed on the header row).

**Suspected stage: step 5a, `cnxml-inject.js`** — table-cell mapping does not handle
self-closing `<entry/>`, and cell alignment degrades when the MT segment count doesn't
match the source cell count (this module lost 46 of 94 segments at MT, per (a1)).

This is the most severe class: the file **is not well-formed XML**, so any consumer
that parses it strictly fails outright — and it is what triggers jing's batch-abort.

## 6. Sensitivity — proving the clean result isn't vacuous

A clean chemistry result is only meaningful if the check can fail. Mutation tests
against a known-good chemistry module:

| Mutation | Detected? |
|---|---|
| unknown element (`<bogus-elem>`) | ✅ `element "bogus-elem" not allowed here` |
| unknown attribute (`bogus-attr="x"`) | ✅ `attribute "bogus-attr" not allowed here` |
| unclosed tag (`</title>` removed) | ✅ `fatal: … must be terminated` |
| non-XML garbage | ✅ `fatal: Content is not allowed in prolog` |
| **duplicate `@id`** | ❌ **not detected by jing** — see below |
| fatal file sorted **first** in a batch | ✅ later files still validated (naive batch: ❌ hidden) |

It was also confirmed that reinjected files genuinely differ from their originals
(Icelandic titles, differing byte counts), so the pairing compares real output.

### The duplicate-`@id` gap

`-i` is mandatory (without it the grammar doesn't compile at all — SETUP.md §4), and it
switches off jing's ID/IDREF checking. Verified with a real mutation: two elements
carrying `id="list-00001"` produced **zero** errors.

`validate-cnxml.js` therefore implements its own duplicate-`@id` scan, mutation-verified
both ways — it fires on a planted duplicate, and `--no-dup-id-check` makes it stop
firing, proving that check is what caught it. No duplicate ids exist in any current
source or reinjected file.

## 7. Reproducing

```bash
# per-file/paired classification
node experiments/cnxml-validation-gate/analyze-paired.mjs efnafraedi-2e ch07 ch09 ch12 ch13 ch14
node experiments/cnxml-validation-gate/analyze-paired.mjs liffraedi-2e ch03 ch05

# the gate itself
cd experiments/cnxml-validation-gate
node validate-cnxml.js --allowlist allowlist.recommended.json ../../books/efnafraedi-2e/03-translated
node validate-cnxml.js --allowlist allowlist.recommended.json ../../books/liffraedi-2e/03-translated
```
