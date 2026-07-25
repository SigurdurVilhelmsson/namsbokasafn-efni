# FINDINGS — CNXML schema validation gate

Experiment conclusion, 2026-07-25. Toolchain and schema selection: [SETUP.md](SETUP.md).
Per-file evidence: [BASELINE-REPORT.md](BASELINE-REPORT.md).

**Verdict: yes — jing + OpenStax's own RelaxNG schema is a reliable fail-loud gate, and
it is cheap (~0.7 s per chapter). It is ready to turn on for chemistry today. It is not
a fidelity checker, and it must not be run naively batched.**

---

## 1. Schema version situation — clean match, with three caveats

**Our sources are CNXML 0.7**, and `poet-schema`'s 0.7 schema is the right one.

Recon across all 1192 CNXML files in `books/*/01-source/`:

- Root element is always `<document xmlns="http://cnx.rice.edu/cnxml">`.
- **No `cnxml-version` attribute, no `module-id`, no DOCTYPE, no XML declaration, no
  `xsi:schemaLocation`** — anywhere. Nothing self-declares a version.
- Namespaces are consistent; the MathML prefix varies (`m:` 1015, `mml:` 66, default
  in 7 files), which is irrelevant since jing is namespace-aware.

That shape — unversioned, no `module-id` — is the **git-storage/POET flavour** OpenStax
uses in its `osbooks-*` repos, not the old cnx.org export flavour. Version identification
is therefore by structure, not by declaration, so it was confirmed empirically instead.

**Chosen schema:**
`external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-jing.rng` @ `2278259`

- It is OpenStax's **own** entry point — `cnxml/validation.py:15` uses exactly this file.
- `poet-jing.rng` is only a 15-line dispatcher (COLLXML 2.0 *or* this same file). For
  single modules it adds nothing but a duplicated grammar; prefer it only if you also
  want to validate `collection.xml`.
- `poet-schema` beats `master` **measured on our content**: master requires `media/@id`
  and produces 51 extra false errors on legacy physics, and has only MathML 2.0.
  Non-abstract errors over 1192 pristine files: **poet-schema 6, master 56.**

### Caveat 1 — `-i` is mandatory, and that costs us duplicate-id checking

Without `-i` the grammar **does not compile at all**:

```
mathml3-common.rng:182: error: conflicting ID-types for attribute "id"
    of element "table" from namespace "http://cnx.rice.edu/cnxml"
```

CNXML declares `table/@id` as `xsd:ID`; MathML 3's `anyElement` pattern matches
`cnxml:table` with an untyped attribute. This is a defect in the *schema composition*,
not in any document. `-i` is also OpenStax's own flag (`cnxml/jing.py:53`), so we are
using the schema exactly as its authors do. The cost — no ID/IDREF checking — is
recovered by a duplicate-`@id` scan implemented in `validate-cnxml.js`.

### Caveat 2 — pristine OpenStax content does NOT validate clean

**660 of 1192 pristine source files fail**, in three fully-characterised classes
(BASELINE-REPORT §4). The dominant one: CNXML 0.7 forbids `@id` inside `<md:abstract>`,
but OpenStax's own generator stamps `id="para-00001"` on every abstract child. *OpenStax
content violates the OpenStax schema.* Both branches agree, so it isn't a branch artifact.

This is why the brief's stop-condition was considered and consciously passed: the schema
is not mis-selected (it is the canonical one, and the alternative is measurably worse).
The classes are mechanically identifiable, so the paired design and a documented
allowlist neutralise them. **With `allowlist.recommended.json`, all 1192 pristine files
validate clean** — the gate has a real zero point.

### Caveat 3 — one upstream schema bug worth reporting

`cnxml-defs.rng:935-944` wraps **two** `<attribute>` elements in a single `<optional>`,
which in RELAX NG means both-or-neither. So any element with `xml:lang` but no
`data-platform-hidden` is rejected. Almost certainly unintended; `master` has neither
attribute and doesn't show it. Worth an upstream issue if we ever want to run against an
unpatched schema with no allowlist.

## 2. Baseline health — chemistry is perfect, biology is not

| Set | Modules | class (a) reinjection bugs |
|---|---|---|
| efnafraedi-2e `mt-preview` | 149 | **0** |
| efnafraedi-2e `faithful` (ships) | 4 | **0** |
| liffraedi-2e `mt-preview` | 11 | **13** |

**Chemistry's reinjected CNXML is exactly as schema-valid as the OpenStax source it came
from — error for error, across all 149 modules**, including the math-heaviest (ch14, 578
`<m:math>`) and table-heaviest (ch12, 37 `<table>`) chapters. Zero class-(a) bugs, zero
class-(b) divergences, and nothing dropped relative to the original.

That is a genuinely strong result for the step the experiment called "the riskiest part".

Biology, early in onboarding, has 13 real defects in 7 of its 11 reinjected modules.

### ⚠️ The single most important operational finding

**jing aborts the entire remaining batch after the first `fatal:` (well-formedness)
error.** One malformed biology module hid three real defects in another chapter and
manufactured a phantom "the pipeline dropped something" finding for files jing never
opened. A naive `jing schema.rng *.cnxml` gate would be **fail-quiet** — worse than no
gate, because it reports success over unvalidated files. `validate-cnxml.js` resumes past
each fatal; demonstrated with the fatal file sorted first, where a naive batch reports
one file and the gate reports all three.

## 3. Top reinjection bugs, ranked

| # | Defect | Severity | Freq | Suspected stage |
|---|---|---|---|---|
| 1 | Content silently dropped → empty `<glossary>` / empty `<section>` | **High** — reader-visible content loss | 8 errors, 4 modules | **Step 2 MT** (`api-translate.js`), surfaced by **5a inject** |
| 2 | Malformed table cell `<entry/>Text</entry>` → not well-formed XML | **High** — file unparseable | 2 errors, 1 module | **Step 5a** `cnxml-inject.js` |
| 3 | `<figure>` start tag emitted after its `<media>` | Medium — image escapes figure, loses caption/number | 3 errors, 2 modules | **Step 5a** `cnxml-inject.js` |

**#1 — the important one.** For `m66438`, `02-for-mt` holds 43 EN segments but
`02-mt-output` holds only 13: every `glossary-term`, `glossary-def`, `problem` and
`solution` segment is missing (m66440 84→32, m66443 94→48). Whole *categories* vanish,
not a tail. Injection then converts that into invalid output **silently** —
`cnxml-inject.js:1864-1874` returns `''` for a missing segment and only warns under
`--verbose`, and the glossary emitter (`:2023`) guards `if (termText && defText)`, so it
skips the entire `<definition>` and leaves `<glossary></glossary>`. The glossary and
Section Summary vanish from the page.

This is exactly the "malformed output can fail silently" failure mode the experiment was
commissioned to test, and the schema catches it because CNXML requires `<glossary>` to
hold ≥1 `<definition>`. Note the root cause is upstream of injection — the gate is the
*detector*, not the culprit.

**#3** is the same family as the 2026-03-30 duplicate-figure fix (figures in `<para>`
inside `<example>`/`<exercise>`); the `<note>` case appears uncovered.

## 4. What the gate does NOT catch — set expectations

**Schema validity and translation fidelity are orthogonal.** Chemistry's own
`translation-errors.json` records **37 known discrepancies across 23 modules**
(20 deferred losses, 17 benign artifacts) — and those same 149 modules produce **zero**
schema errors. Example: `m68709`, `{"tag":"term","diff":1,"status":"benign"}` — a
tag-count difference that is perfectly schema-valid.

So the gate would not have caught a single one of the known fidelity gaps. It answers
"is this structurally legal CNXML?", not "does this say the same thing as the source?".
It complements `cnxml-fidelity-check.js`; it does not replace it. Nor does it catch
wrong-but-legal content (a mistranslated term, a swapped `id`).

## 5. Integration proposal

### Where

**Immediately after step 5a (`cnxml-inject.js`), gating step 5b (`cnxml-render.js`).**
Inject is where the risk is, the errors found are exactly inject/MT errors, and blocking
there stops invalid CNXML from reaching `05-publication/` and the reader site.

A second, cheaper call is worth it inside the server's "Vista + Birta" path
(`applyApprovedEdits` → render), so an editor gets told immediately rather than
discovering it after the 2 h git-backup cron has published.

### Block vs warn

| Condition | Action | Why |
|---|---|---|
| `fatal:` (well-formedness) | **BLOCK always, every book** | The file is not XML. Nothing downstream can consume it. No allowlist may suppress this. |
| class-(a) structural errors, **efnafraedi-2e** | **BLOCK** | Already at 0 — turning it on costs nothing and locks in the current clean state. |
| class-(a) structural errors, **liffraedi-2e + new books** | **WARN** until §6.1 is fixed | 13 known failures; blocking today would stop biology onboarding. |
| class-(c) allowlisted classes | Suppress, but **report the counts** | Upstream/schema issues. Counts printed so silent drift is visible. |
| duplicate `@id` | **BLOCK** | Currently zero anywhere; cheap invariant to hold. |

Per-book severity is the key design point: a single global switch would either block
biology onboarding or leave chemistry ungated. `book-config.json` already carries
per-book settings and would be the natural home for a `validation: "block" | "warn"` key
— but note the **I17-R6 rule**: any new non-render key must also be added to
`NON_RENDER_KEYS` in `tools/lib/book-rendering-config.js`, or it leaks through
`mergeWithShared()` into `getBookRenderConfig()` and breaks a golden `toEqual` oracle.

### Runtime cost — negligible

Measured, OpenJDK 25 / jing 20241231, this box:

| Scope | Batched | Per-file loop |
|---|---|---|
| one chapter (8 modules) | **708 ms** | 4 729 ms |
| one book (149 modules) | **~1 310 ms** | ~88 s (extrapolated) |
| all 1192 pristine sources, via gate script | **6 510 ms** | — |

Roughly **0.6 s fixed JVM+grammar startup, then ~5 ms per module.** Cost per chapter is
under a second — far below the MT and render steps it would gate. **Always batch**
(with the fatal-resume logic); a per-file loop is 7–68× slower and buys nothing.

### What must be fixed before the gate can be enforced everywhere

Nothing for chemistry — it passes today.

For biology, in priority order:

1. **MT segment loss** (bug #1). The real defect; also the likely cause of the
   cell-misalignment half of bug #2. Investigate why `api-translate.js` produced 13 of
   43 segments. Independently worth fixing — it is live content loss.
2. **Injection should fail loud on missing segments** (`cnxml-inject.js:1864-1874`).
   Today `getSeg()` returns `''` and warns only under `--verbose`, and the caller
   silently skips the element. Per the project's standing "fail loud, no escape hatches"
   preference, a missing segment for a required child should be an error, not an empty
   element. **This one change would have caught bug #1 three stages earlier, without any
   schema at all.**
3. **Self-closing `<entry/>` handling** in table injection (bug #2).
4. **`<figure>` inside `<para>` inside `<note>`** (bug #3) — extend the `buildNoteDom`
   pattern from the 2026-03-30 fix.

Items 2–4 are the pipeline fixes; item 1 is a content/MT investigation.

### Risks to accept knowingly

- **The allowlist can mask.** Each rule in `allowlist.recommended.json` carries a stated
  `risk`. `c1-abstract-id` is the broad one; it is narrowed to the no-class/no-id
  attribute-set signature so a body element rejecting `@id` still fails. Re-verify if
  OpenStax changes the abstract content model.
- **The schema is an external moving branch.** `poet-schema` is a branch, not a release.
  Pin the SHA (done in SETUP.md) and treat a schema update as a reviewed change, or the
  gate's meaning drifts silently under us.
- **Schema availability becomes a build dependency.** The clone is AGPL-3.0 and must
  stay un-vendored. If the gate becomes permanent, decide deliberately how CI obtains it
  (see §6).

## 6. Effort estimate for integration — a separate future task

| Task | Est. | Notes |
|---|---|---|
| A. Decide + implement schema provisioning | **0.5–1 d** | The one real design question. Options: (i) clone-on-demand into a gitignored cache; (ii) a small `postinstall`; (iii) ask OpenStax for a release artifact. Must keep AGPL code un-vendored — schema files are consumed as data, no XSLT/code copied. |
| B. Promote `validate-cnxml.js` into `tools/` | **0.5 d** | Already ESM, `import.meta.url`-relative, no deps, correct exit codes. Add `parseArgs` from `tools/lib`, book/chapter args matching other tools, and `jing`-missing handling. |
| C. Wire into inject/render + server apply path | **0.5–1 d** | Per-book block/warn; must not regress the "Vista + Birta" flow. |
| D. Vitest coverage | **0.5 d** | Fixture-based: fatal-first batch ordering, allowlist suppression + non-suppression, duplicate-id, exit 1 vs 2. Mutation-check each per project convention. |
| E. Docs | **0.25 d** | `docs/workflow/simplified-workflow.md`, `config-and-rerun-guide.md`, CLAUDE.md commands table. |
| **Gate infrastructure subtotal** | **2.25–3.25 d** | Ships gate ON for chemistry, WARN for biology. |
| F. Fix inject to fail loud on missing segments | **0.5–1 d** | Highest value per hour; catches bug #1 three stages earlier. |
| G. Fix `<entry/>` + `<figure>`-in-`<note>` | **1–2 d** | Needs care — the 2026-03-30 figure fix touched four books. |
| H. Investigate biology MT segment loss | **1–3 d** | Unknown scope; may overlap the known `isApiTranslated` mis-routing and `processExercise` option-drop issues. |

**Gate alone: ~2.5–3 days. Gate + everything needed to enforce it on biology: ~5–9 days.**

Recommended split: ship A–E first (chemistry protected immediately, biology surfaced as
warnings), then F, then H/G informed by what the warnings show.

## 7. Success criteria — status

| Criterion | Status |
|---|---|
| One command to validate any CNXML file, and trust the result | ✅ `node validate-cnxml.js <file-or-dir>` — exit 0/1/2, mutation-tested |
| Know whether reinjected output validates, and why not | ✅ chemistry 149/149 clean; biology 13 defects, each traced to a stage |
| Know the exact scope to make validation a permanent gate | ✅ §5–§6 |
| Nothing outside `experiments/cnxml-validation-gate/` touched | ✅ verified with `git status` |

## 8. Reference material consulted

Read for understanding only — **no XSLT or code was copied from either AGPL-3.0 repo**,
and nothing from them executes as part of this project beyond invoking `jing` and
reading `.rng` files as validation data.

- `openstax/cnxml` `cnxml/validation.py`, `cnxml/jing.py` — canonical schema path, `-i`
- `openstax/cnxml` `.../rng/0.7/cnxml-defs.rng` — `id-attribute` (:13), `common-attributes-noclass` (:933)
- `openstax/cnxml` `.../rng/0.7/cnxml-abstract-defs.rng` — restricted abstract model
- `openstax/cnxml` `.../rng/0.7/cnxml-common-jing.rng` — abstract/MathML/QML/MDML binding
- `openstax/cnxml` `.../mathml/schema/rng/3.0/mathml3-common.rng` — `anyElement` (:181)
- `openstax/cnx-transforms` @ `34604e1` — cloned as instructed; **not needed**, nothing consulted from it
- Ours: `tools/cnxml-inject.js` (:1864 `getSeg`, :2019 glossary emit), `tools/cnxml-extract.js` (:557 glossary extract), `books/efnafraedi-2e/translation-errors.json`
