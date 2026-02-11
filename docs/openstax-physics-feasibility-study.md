# Feasibility Study: OpenStax College Physics 2e

**Date:** 2026-02-11
**Purpose:** Assess whether the current translation pipeline (built for Chemistry 2e) can accommodate OpenStax College Physics 2e, and document the changes needed.

---

## 1. Executive Summary

The current extract-inject-render pipeline **can accommodate College Physics 2e** with moderate refactoring. The CNXML format is structurally identical — both books use the same OpenStax CNXML schema, namespaces, and core element set. The main work falls into two categories:

1. **Parameterization** — All pipeline tools hardcode `books/efnafraedi`; they need a `--book` flag.
2. **Book-specific configuration** — Chemistry-specific note types, equation text translations, and title translations need to be extracted into per-book config files.

No fundamental architectural changes are required. The pipeline's core logic (extract segments → protect for MT → translate → unprotect → inject → render) is content-agnostic.

---

## 2. Source Repository

**Repository:** [openstax/osbooks-college-physics-bundle](https://github.com/openstax/osbooks-college-physics-bundle)
**License:** CC-BY-4.0
**Contents:** College Physics 2e + College Physics for AP Courses 2e (shared modules)

### Structure

```
osbooks-college-physics-bundle/
├── collections/
│   ├── college-physics-2e.collection.xml       # Table of contents
│   └── college-physics-ap-courses-2e.collection.xml
├── media/                                       # All images (shared)
├── modules/
│   ├── m42033/index.cnxml                       # One dir per module
│   ├── m42042/index.cnxml
│   └── ...  (318 modules total)
└── META-INF/
```

### Scale Comparison

| Metric | Chemistry 2e (efnafraedi) | Physics 2e |
|--------|--------------------------|------------|
| Chapters | 21 + appendices | 34 |
| Modules | ~148 | ~318 (shared with AP edition) |
| Avg modules/chapter | ~7 | ~9 |
| Module ID range | m68663–m68871 | m42033–m57419 |
| File layout | `ch{NN}/m{NNNNN}.cnxml` | `m{NNNNN}/index.cnxml` |

**Note:** The Physics bundle shares modules between the standard and AP editions. The collection XML defines which modules belong to College Physics 2e specifically. A module-selection step will be needed during intake.

---

## 3. Structural Similarities

These aspects are identical between Chemistry and Physics and require **no pipeline changes**.

### 3.1 XML Namespaces

Both books use the same namespace declarations:

```xml
<document xmlns="http://cnx.rice.edu/cnxml"
          xmlns:m="http://www.w3.org/1998/Math/MathML">
```

Metadata uses `xmlns:md="http://cnx.rice.edu/mdml"` in both.

### 3.2 Document Structure

Both follow the same pattern:

```xml
<document>
  <title>Module Title</title>
  <metadata xmlns:md="...">
    <md:content-id>m{NNNNN}</md:content-id>
    <md:title>...</md:title>
    <md:abstract>...</md:abstract>
    <md:uuid>...</md:uuid>
  </metadata>
  <content>
    <section>...</section>
    ...
  </content>
  <glossary>
    <definition>
      <term>...</term>
      <meaning>...</meaning>
    </definition>
  </glossary>
</document>
```

### 3.3 Core Content Elements

Both books use the same CNXML elements for content:

| Element | Purpose | Present in Both |
|---------|---------|-----------------|
| `<section>` | Content sections (nested) | Yes |
| `<para>` | Paragraphs | Yes |
| `<figure>` | Figures with `<media>` + `<image>` | Yes |
| `<table>` | Tables with `<tgroup>` | Yes |
| `<equation>` | Display equations | Yes |
| `<list>` | Bulleted/enumerated lists | Yes |
| `<example>` | Worked examples | Yes |
| `<exercise>` | Exercises with `<problem>` + `<solution>` | Yes |
| `<note>` | Callout boxes | Yes |
| `<term>` | Glossary terms (inline) | Yes |
| `<link>` | Cross-references | Yes |
| `<emphasis>` | Bold/italic | Yes |
| `<sup>`, `<sub>` | Super/subscripts | Yes |

### 3.4 MathML Foundation

Both books use the `m:` namespace for MathML. The core MathML elements (`m:math`, `m:mrow`, `m:mi`, `m:mn`, `m:mo`, `m:mfrac`, `m:msub`, `m:msup`, `m:mtext`) are shared.

### 3.5 Glossary Format

Identical structure: `<glossary>` → `<definition>` → `<term>` + `<meaning>`.

### 3.6 Exercise Structure

Both use `<exercise>` → `<problem>` + optional `<solution>`. The pipeline already handles this pattern.

---

## 4. Key Differences

### 4.1 MathML Volume and Complexity

**This is the most significant difference.**

Physics modules are *extremely* equation-heavy. Nearly every paragraph contains inline MathML. Chemistry uses MathML for chemical equations and some calculations, but Physics uses it pervasively for:

- **Vector notation:** `<m:mtext mathvariant="bold">F</m:mtext>` (bold vectors)
- **Unit expressions:** Number + `<m:mspace width="0.25em"/>` + unit text (e.g., `9.8 m/s²`)
- **Multi-line derivations:** `<m:mtable>` / `<m:mtr>` / `<m:mtd>` for step-by-step solutions
- **Deeply nested fractions:** Fractions within subscripts within superscripts
- **Scientific notation:** `8.99 × 10⁹` encoded as full MathML

**Pipeline impact:** The extraction and injection tools already preserve MathML as opaque blocks (they don't try to translate inside equations). This is correct behavior — MathML should pass through untouched. However:

- The `equation-text.json` dictionary (used by `cnxml-render.js`) contains Chemistry-specific translations (e.g., "reactants" → "hvarfefni"). Physics will need its own dictionary with terms like "velocity", "acceleration", "force", "mass", etc.
- The higher MathML density means more `[[MATH:N]]` placeholders in MT segments. This could push segments closer to the MT character limit (currently 12,000 chars).

**Risk level:** Low — the pipeline already handles MathML correctly; just needs Physics-specific text dictionaries.

### 4.2 Namespace Declaration Placement

Chemistry modules declare `xmlns:m` on the root `<document>` element. Physics modules sometimes declare it on individual elements:

```xml
<!-- Chemistry pattern -->
<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">

<!-- Physics pattern (sometimes) -->
<document xmlns="http://cnx.rice.edu/cnxml">
  ...
  <para xmlns:m="http://www.w3.org/1998/Math/MathML" id="...">
    <m:math>...</m:math>
  </para>
```

**Pipeline impact:** Any XML parsing that assumes `xmlns:m` is declared on the root element could fail. The pipeline tools use `cheerio` for XML parsing, which generally handles namespace scoping correctly, but this needs testing.

**Risk level:** Low-medium — needs verification with actual Physics files.

### 4.3 Note Types

Chemistry and Physics use different note `class` values:

| Chemistry Note Classes | Physics Note Classes |
|----------------------|---------------------|
| `chemistry everyday-life` | `interactive` (PhET simulations) |
| `green-chemistry` | (no class — used for laws/definitions) |
| `safety-hazard` | (no class — misconception alerts) |
| `lab-equipment` | (no class — take-home experiments) |
| `sciences-interconnect` | |
| `link-to-learning` | |

**Pipeline impact:** `cnxml-render.js` (lines 59–90) hardcodes Chemistry note types with Icelandic labels. Unknown note types fall back to a plain `<div>` with no label. This means Physics notes would render but without proper Icelandic labels.

**Required change:** Extract note-type configuration into per-book config files:

```json
// books/edlisfraedi/config/note-types.json
{
  "interactive": "Gagnvirk herma",
  "default": "Athugið"
}
```

**Risk level:** Low — functional without changes (just missing labels), easy to fix.

### 4.4 Exercise Types

Physics has more exercise types than Chemistry:

| Exercise Type | Chemistry | Physics |
|--------------|-----------|---------|
| Regular exercises | Yes | Yes |
| Conceptual questions | — | `type="conceptual-questions"` |
| Problems & exercises | — | `type="problems-exercises"` |
| Check your understanding | — | `type="check-understanding"` |
| AP test prep | — | `type="ap-test-prep"` |

**Pipeline impact:** The extraction tool groups exercises by section class. The `type` attribute on individual exercises is a Physics-specific pattern that the current tools don't distinguish. Exercises will still extract and inject correctly — they just won't have type-specific rendering in HTML.

**Risk level:** Low — exercises work; type-specific styling is a nice-to-have.

### 4.5 Interactive Content (PhET Simulations)

Physics modules include embedded PhET simulations:

```xml
<note class="interactive">
  <media id="..." alt="...">
    <iframe src="https://phet.colorado.edu/sims/html/..." height="315" width="560"/>
  </media>
</note>
```

Chemistry may have some `link-to-learning` notes with external links, but Physics has full iframe embeds.

**Pipeline impact:** The `<iframe>` element inside `<media>` is not currently handled by the extraction tools (they expect `<image>` inside `<media>`). These elements would be silently dropped.

**Required change:** Add `<iframe>` handling to `cnxml-extract.js` and `cnxml-render.js`. The iframe URL should be preserved as-is (no translation needed), and rendered as an embedded iframe or a link in the HTML output.

**Risk level:** Medium — content loss if not addressed; straightforward to implement.

### 4.6 Module File Layout

| Aspect | Chemistry | Physics |
|--------|-----------|---------|
| Source layout | `ch{NN}/m{NNNNN}.cnxml` | `m{NNNNN}/index.cnxml` |
| Media path | `../../media/` | `../../media/` |
| Collection file | Not used (chapters pre-organized) | `collections/college-physics-2e.collection.xml` |

**Pipeline impact:** The intake step needs to:
1. Parse `college-physics-2e.collection.xml` to determine which modules belong to which chapter
2. Reorganize files from `m{NNNNN}/index.cnxml` into the `ch{NN}/m{NNNNN}.cnxml` layout expected by the pipeline
3. Filter out AP-only modules (or flag them)

**Required change:** A new intake script or an extension to the existing intake process.

**Risk level:** Low — one-time setup step; could even be done manually for 34 chapters.

### 4.7 Metadata Differences

| Field | Chemistry | Physics |
|-------|-----------|---------|
| `md:abstract` | Often populated (learning objectives as list) | Usually empty (`<md:abstract/>`) |
| Learning objectives | In `md:abstract` | In `<section class="learning-objectives">` within `<content>` |

**Pipeline impact:** The extraction tool pulls learning objectives from `md:abstract`. For Physics, it would find nothing there — the objectives are in a regular content section instead. This means Physics learning objectives would be extracted as normal section content (which is fine for translation), but the structure metadata would be incomplete.

**Required change:** Optionally detect `class="learning-objectives"` sections and flag them in the structure JSON.

**Risk level:** Low — objectives still get translated; just categorized differently in metadata.

### 4.8 Isotope Notation vs. Physics Notation

Chemistry has special handling for isotope notation (`^14^C` pattern). Physics doesn't use isotope notation but has its own patterns:

- **Vector bold:** `mathvariant="bold"` on variables
- **Unit spacing:** `<m:mspace width="0.25em"/>` between number and unit
- **Greek letters:** More frequent use of α, β, γ, θ, ω, etc.

**Pipeline impact:** The isotope-specific regex in `cnxml-extract.js` (line 327) and `cnxml-inject.js` (line 215) is harmless for Physics (it won't match anything). Physics-specific notation is already handled by MathML preservation.

**Risk level:** None — existing Chemistry-specific code doesn't interfere.

### 4.9 Cross-Module Links

Both books use `<link document="m{NNNNN}">` for cross-module references. However, Physics has 318 modules (vs. 148 for Chemistry), meaning more cross-references to resolve.

**Pipeline impact:** The current pipeline preserves cross-references as `[#ref-id]` placeholders during MT. This works regardless of module count. The rendering step would need a module-to-URL mapping for the Physics book.

**Risk level:** Low — existing mechanism works; just needs Physics URL mapping.

---

## 5. Required Pipeline Changes

### 5.1 Must-Have (Pipeline Won't Work Without These)

| Change | Affected Tools | Effort |
|--------|---------------|--------|
| **Parameterize book path** — Add `--book` flag; replace hardcoded `books/efnafraedi` | All 7 tools | Small — search-and-replace `BOOKS_DIR` with CLI arg |
| **Intake script for Physics** — Parse collection XML, reorganize modules into `ch{NN}/` layout | New script or manual | Small-medium |
| **Book-specific config directory** — `books/{book}/config/` with note-types, equation-text, title translations | cnxml-render.js | Medium |

### 5.2 Should-Have (Content Quality Issues)

| Change | Affected Tools | Effort |
|--------|---------------|--------|
| **Handle `<iframe>` in `<media>`** — Preserve PhET simulation embeds | cnxml-extract.js, cnxml-render.js | Small |
| **Physics equation-text dictionary** — Translate text in Physics equations (velocity, force, etc.) | cnxml-render.js, new config file | Small |
| **Physics note type labels** — Icelandic labels for Physics note types | cnxml-render.js, new config file | Small |
| **Exercise type rendering** — Style conceptual vs. numerical problems differently | cnxml-render.js | Small |
| **Namespace declaration handling** — Test/fix `xmlns:m` on non-root elements | cnxml-extract.js, cnxml-inject.js | Small (testing) |

### 5.3 Nice-to-Have (Polish)

| Change | Affected Tools | Effort |
|--------|---------------|--------|
| **AP content filtering** — Option to exclude AP-only modules/sections | Intake script | Small |
| **Learning objectives detection** — Flag `class="learning-objectives"` sections in structure JSON | cnxml-extract.js | Small |
| **Unknown element warnings** — Log warnings when encountering unhandled CNXML elements | All extraction/injection tools | Small |
| **Physics glossary setup** — Seed terminology files for Physics | Manual + glossary tools | Medium |

---

## 6. Estimated Refactoring Scope

### Phase 1: Pipeline Parameterization
- Add `--book` CLI argument to all 7 tools
- Create `books/edlisfraedi/` directory structure matching `books/efnafraedi/`
- Extract Chemistry-specific configs from code into `books/efnafraedi/config/`
- Create corresponding Physics configs in `books/edlisfraedi/config/`

### Phase 2: Physics Intake
- Write or adapt an intake script that:
  - Clones/downloads `osbooks-college-physics-bundle`
  - Parses `college-physics-2e.collection.xml` for chapter→module mapping
  - Copies modules into `books/edlisfraedi/01-source/ch{NN}/m{NNNNN}.cnxml`
  - Copies media files to appropriate location
- Run `cnxml-extract.js --book edlisfraedi` on all chapters
- Verify extraction output

### Phase 3: Physics-Specific Adjustments
- Add iframe handling for PhET simulations
- Create Physics equation-text dictionary
- Create Physics note-type label mapping
- Test full pipeline on 2–3 representative chapters
- Fix any issues found

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MathML parsing breaks with Physics complexity | Low | High | Test with equation-heavy chapters (Ch2 Kinematics, Ch18 Electric Fields) early |
| Namespace scoping issues | Low | Medium | Run extraction on all modules; check for empty/missing segments |
| MT character limits exceeded (dense equations) | Low | Low | Existing split-file mechanism handles this |
| Unknown CNXML elements dropped silently | Medium | Medium | Add logging; review extraction output for completeness |
| PhET iframes lost | High (certain without changes) | Medium | Implement iframe handling before production use |
| Shared AP modules included accidentally | Medium | Low | Use collection XML as source of truth for module selection |

---

## 8. Recommendation

**The pipeline is feasible for Physics with the changes outlined above.** The CNXML format is the same; the differences are in content patterns, not structure. The refactoring needed is mostly parameterization (making tools book-agnostic) rather than new functionality.

**Suggested approach:**

1. Start with pipeline parameterization (Phase 1) — this benefits any future book, not just Physics.
2. Do a proof-of-concept with 2–3 Physics chapters before committing to full intake.
3. Use the proof-of-concept to validate MathML handling, namespace issues, and segment quality.
4. Proceed with full intake only after the proof-of-concept passes.

The biggest practical consideration is **scale**: Physics has roughly twice the content of Chemistry (34 chapters, 318 modules). This means twice the translation effort, twice the review effort, and twice the TM creation effort. The pipeline itself can handle it — the bottleneck will be human review capacity.

---

## Appendix A: Physics Chapter List

| Ch | Title | Approximate Module Count |
|----|-------|--------------------------|
| 1 | Introduction: The Nature of Science and Physics | 5 |
| 2 | Kinematics | 9 |
| 3 | Two-Dimensional Kinematics | 6 |
| 4 | Dynamics: Force and Newton's Laws | 9 |
| 5 | Further Applications of Newton's Laws | 4 |
| 6 | Uniform Circular Motion and Gravitation | 6 |
| 7 | Work, Energy, and Energy Resources | 9 |
| 8 | Linear Momentum and Collisions | 7 |
| 9 | Statics and Torque | 4 |
| 10 | Rotational Motion and Angular Momentum | 7 |
| 11 | Fluid Statics | 8 |
| 12 | Fluid Dynamics and Its Biological and Medical Applications | 6 |
| 13 | Temperature, Kinetic Theory, and the Gas Laws | 6 |
| 14 | Heat and Heat Transfer Methods | 7 |
| 15 | Thermodynamics | 7 |
| 16 | Oscillatory Motion and Waves | 11 |
| 17 | Physics of Hearing | 7 |
| 18 | Electric Charge and Electric Field | 8 |
| 19 | Electric Potential and Electric Field | 7 |
| 20 | Electric Current, Resistance, and Ohm's Law | 6 |
| 21 | Circuits and DC Instruments | 6 |
| 22 | Magnetism | 11 |
| 23 | Electromagnetic Induction, AC Circuits, and Electrical Technologies | 12 |
| 24 | Electromagnetic Waves | 4 |
| 25 | Geometric Optics | 7 |
| 26 | Vision and Optical Instruments | 5 |
| 27 | Wave Optics | 8 |
| 28 | Special Relativity | 7 |
| 29 | Introduction to Quantum Physics | 8 |
| 30 | Atomic Physics | 9 |
| 31 | Radioactivity and Nuclear Physics | 8 |
| 32 | Medical Applications of Nuclear Physics | 7 |
| 33 | Particle Physics | 6 |
| 34 | Frontiers of Physics | 4 |

## Appendix B: CNXML Element Comparison

| Element | Chemistry Handling | Physics Equivalent | Pipeline Status |
|---------|-------------------|-------------------|-----------------|
| `<para>` | Extracted as segment | Identical | Works |
| `<section>` | Extracted with title | Identical | Works |
| `<figure>` | Image + caption extracted | Identical | Works |
| `<table>` | Extracted with entries | Identical | Works |
| `<equation>` | MathML preserved | Identical (more frequent) | Works |
| `<example>` | Extracted with sub-elements | Identical | Works |
| `<exercise>` | Problem + solution | Same + `type` attribute | Works (type ignored) |
| `<note>` | Chemistry class types | Different class types | Needs config |
| `<term>` | Inline + glossary | Identical | Works |
| `<list>` | Bulleted/enumerated | Same + `mark-prefix`/`mark-suffix` | Works |
| `<emphasis>` | Bold/italic | Identical | Works |
| `<link>` | Internal + external | Identical | Works |
| `<media><image>` | Image extraction | Identical | Works |
| `<media><iframe>` | Not present | PhET simulations | **Needs implementation** |
| `<m:math>` (inline) | Preserved | Identical (much more frequent) | Works |
| `<glossary>` | End-of-module definitions | Identical | Works |

## Appendix C: Pipeline Tool Hardcoding Summary

| Tool | Hardcoded Book Path | Chemistry-Specific Logic | Change Needed |
|------|-------------------|------------------------|---------------|
| `cnxml-extract.js` | Line 45: `books/efnafraedi` | Isotope notation (line 327) | Add `--book` param |
| `cnxml-inject.js` | Line 45: `books/efnafraedi` | Isotope notation (line 215) | Add `--book` param |
| `cnxml-render.js` | Line 116: `books/efnafraedi` | Note types (59–90), LaTeX dict (23–53), titles (96–105) | Add `--book` param + config files |
| `protect-segments-for-mt.js` | — | None | Add `--book` param (paths) |
| `unprotect-segments.js` | — | None | Add `--book` param (paths) |
| `init-faithful-review.js` | Line 24: `books/efnafraedi` | None | Add `--book` param |
| `prepare-for-align.js` | — | None | Minimal changes |
