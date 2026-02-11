# Feasibility Study: Expanding the Translation Pipeline to Additional OpenStax Titles

**Date:** 2026-02-11
**Purpose:** Assess whether the current translation pipeline (built for Chemistry 2e) can accommodate additional OpenStax textbooks, and document the changes needed for each title.

**Titles analyzed:**
1. College Physics 2e
2. Biology 2e
3. Precalculus 2e (recommended math title for framhaldsskóli náttúrufræðibraut)

---

## 1. Executive Summary

The current extract-inject-render pipeline **can accommodate all three titles** with moderate refactoring. All OpenStax textbooks use the same CNXML schema, namespaces, and core element set. The pipeline's core logic (extract segments → protect for MT → translate → unprotect → inject → render) is content-agnostic.

The work required falls into two categories shared by all titles:

1. **Parameterization** — All pipeline tools hardcode `books/efnafraedi`; they need a `--book` flag.
2. **Per-book configuration** — Note types, equation text translations, and title translations need to be extracted into config files that each book provides its own version of.

Each title also has subject-specific considerations:

| Title | Key Challenge | Difficulty |
|-------|--------------|------------|
| **Physics 2e** | High MathML density; PhET iframe embeds | Low-Medium |
| **Biology 2e** | Very image-heavy; species name protection for MT; no `<example>` or `<equation>` elements | Low |
| **Precalculus 2e** | Extremely high MathML density; no formal `<glossary>` element; massive exercise sets | Medium |

No fundamental architectural changes are required for any title.

---

## 2. Scale Overview

| Metric | Chemistry 2e | Physics 2e | Biology 2e | Precalculus 2e |
|--------|-------------|-----------|-----------|---------------|
| **Chapters** | 21 + appendices | 34 | 47 (8 units) + 3 appendices | 12 + appendix |
| **Modules** | ~148 | ~318 | ~280 | ~94 |
| **Module ID range** | m68663–m68871 | m42033–m57419 | m66372–m66722 | m49299–m49455 |
| **MathML density** | Moderate | Very high | Very low | Extremely high |
| **`<equation>` elements** | ~1,559 | Very high | <10 | High |
| **`<example>` elements** | ~301 | Present | **None** | Present |
| **Exercises** | ~3,000 est. | ~4,000 est. | ~3,500 est. | ~5,900 |
| **Figures** | ~500 | ~600 | 600+ | ~400 |
| **Glossary** | Formal `<glossary>` | Formal `<glossary>` | Formal `<glossary>` | **Inline `<term>` only** |
| **Repo (GitHub)** | osbooks-chemistry-2e | osbooks-college-physics-bundle | osbooks-biology-bundle | osbooks-college-algebra-bundle |
| **License** | CC-BY-4.0 | CC-BY-4.0 | CC-BY-4.0 | CC-BY-4.0 |
| **Bundle contents** | Chemistry 2e only | Physics 2e + AP Physics | Biology 2e + AP Bio + Concepts of Bio | Precalc 2e + AT 2e + College Algebra 2e + Corequisite |

---

## 3. Shared Infrastructure (All Titles)

These aspects are identical across all four books and require **no pipeline changes**.

### 3.1 XML Namespaces

All books use the same namespace declarations:

```xml
<document xmlns="http://cnx.rice.edu/cnxml"
          xmlns:m="http://www.w3.org/1998/Math/MathML">
```

Metadata uses `xmlns:md="http://cnx.rice.edu/mdml"` in all.

### 3.2 Document Structure

All follow the same pattern:

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
  <glossary>...</glossary>  <!-- except Precalculus -->
</document>
```

### 3.3 Core Content Elements

All books share the same CNXML element vocabulary:

| Element | Purpose | Chemistry | Physics | Biology | Precalculus |
|---------|---------|-----------|---------|---------|-------------|
| `<section>` | Content sections | Yes | Yes | Yes | Yes |
| `<para>` | Paragraphs | Yes | Yes | Yes | Yes |
| `<figure>` | Figures | Yes | Yes | Yes | Yes |
| `<table>` | Tables | Yes | Yes | Yes | Yes |
| `<list>` | Lists | Yes | Yes | Yes | Yes |
| `<exercise>` | Exercises | Yes | Yes | Yes | Yes |
| `<note>` | Callouts | Yes | Yes | Yes | Yes |
| `<term>` | Terminology | Yes | Yes | Yes | Yes |
| `<link>` | Cross-references | Yes | Yes | Yes | Yes |
| `<emphasis>` | Bold/italic | Yes | Yes | Yes | Yes |
| `<equation>` | Display equations | Heavy | Heavy | Rare | Heavy |
| `<example>` | Worked examples | Yes | Yes | **No** | Yes |
| `<m:math>` | MathML | Moderate | Very heavy | Rare | Extremely heavy |
| `<glossary>` | Module glossary | Yes | Yes | Yes | **No** |

### 3.4 File Layout

All OpenStax repos use `m{NNNNN}/index.cnxml` with a shared `media/` directory. The Chemistry source in this project has already been reorganized into `ch{NN}/m{NNNNN}.cnxml`. The same intake process applies to all new titles.

---

## 4. College Physics 2e

### 4.1 Source Repository

**Repository:** [openstax/osbooks-college-physics-bundle](https://github.com/openstax/osbooks-college-physics-bundle)
**License:** CC-BY-4.0
**Contents:** College Physics 2e + College Physics for AP Courses 2e (shared modules)

```
osbooks-college-physics-bundle/
├── collections/
│   ├── college-physics-2e.collection.xml
│   └── college-physics-ap-courses-2e.collection.xml
├── media/
├── modules/  (318 modules total, shared between editions)
└── META-INF/
```

### 4.2 Key Differences from Chemistry

#### MathML Volume and Complexity

**The most significant difference.** Physics modules are extremely equation-heavy. Nearly every paragraph contains inline MathML for:

- **Vector notation:** `<m:mtext mathvariant="bold">F</m:mtext>` (bold vectors)
- **Unit expressions:** Number + `<m:mspace width="0.25em"/>` + unit text (e.g., `9.8 m/s²`)
- **Multi-line derivations:** `<m:mtable>` / `<m:mtr>` / `<m:mtd>` for step-by-step solutions
- **Scientific notation:** `8.99 × 10⁹` encoded as full MathML

**Pipeline impact:** Low — the pipeline already preserves MathML as opaque blocks. The `equation-text.json` dictionary needs Physics-specific translations. Higher MathML density means more `[[MATH:N]]` placeholders in MT segments.

#### Namespace Declaration Placement

Physics modules sometimes declare `xmlns:m` on individual elements rather than on the root `<document>`. The pipeline uses `cheerio` for XML parsing, which generally handles namespace scoping correctly, but this needs testing.

#### Note Types

| Chemistry Note Classes | Physics Note Classes |
|----------------------|---------------------|
| `chemistry everyday-life` | `interactive` (PhET simulations) |
| `green-chemistry` | (no class — laws/definitions) |
| `safety-hazard` | (no class — misconception alerts) |
| `lab-equipment` | (no class — take-home experiments) |
| `sciences-interconnect` | |
| `link-to-learning` | |

#### Exercise Types

Physics adds `type` attributes on exercises: `conceptual-questions`, `problems-exercises`, `check-understanding`, `ap-test-prep`. The pipeline extracts these correctly — type-specific rendering is a nice-to-have.

#### Interactive Content (PhET Simulations)

Physics modules embed PhET simulations via `<iframe>` inside `<media>`:

```xml
<note class="interactive">
  <media id="..." alt="...">
    <iframe src="https://phet.colorado.edu/sims/html/..." height="315" width="560"/>
  </media>
</note>
```

**Pipeline impact:** Medium — the `<iframe>` element is not currently handled. These would be silently dropped without a code change.

#### Metadata

Physics modules typically have empty `<md:abstract/>`. Learning objectives are in `<section class="learning-objectives">` within content (vs. in `md:abstract` for Chemistry).

### 4.3 Physics-Specific Pipeline Changes

| Change | Priority | Effort |
|--------|----------|--------|
| Physics equation-text dictionary | Must-have | Small |
| Physics note type labels (Icelandic) | Must-have | Small |
| `<iframe>` handler for PhET embeds | Should-have | Small |
| Exercise type rendering | Nice-to-have | Small |
| AP content filtering option | Nice-to-have | Small |

### 4.4 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MathML parsing breaks with Physics complexity | Low | High | Test with equation-heavy chapters early |
| PhET iframes lost | Certain (without changes) | Medium | Implement iframe handling |
| Shared AP modules included accidentally | Medium | Low | Use collection XML for module selection |

---

## 5. Biology 2e

### 5.1 Source Repository

**Repository:** [openstax/osbooks-biology-bundle](https://github.com/openstax/osbooks-biology-bundle)
**License:** CC-BY-4.0
**Contents:** Biology 2e + Biology for AP Courses + Concepts of Biology (shared modules)
**Repository size:** ~712 MB (much larger due to image-heavy content)

```
osbooks-biology-bundle/
├── collections/
│   ├── biology-2e.collection.xml
│   ├── biology-ap-courses.collection.xml
│   └── concepts-biology.collection.xml
├── media/  (600+ images)
├── modules/  (574 modules total, shared across 3 books)
└── META-INF/
```

### 5.2 Structural Notes

Biology 2e uses a **three-level hierarchy** in its collection XML: Unit → Chapter → Modules. The current pipeline and intake process only handles two levels (Chapter → Modules). The collection parser needs an additional nesting level.

### 5.3 Key Differences from Chemistry

#### Minimal Math, No Worked Examples

Biology has almost no MathML (~20–50 blocks in the entire book, vs. ~5,369 in Chemistry). The rare math is simple fractions (genetics probability) and chemical formulas using `<sub>`/`<sup>`. The `<example>` element is **not used at all**, and `<equation>` elements are extremely rare (<10 in the book).

**Pipeline impact:** The math and example handling code is harmless (it won't match anything), but this significantly simplifies the translation workload per module.

#### Note Types

Biology uses a completely different set of note classes, and notably does NOT prefix them with the subject name (Chemistry uses `"chemistry everyday-life"`, Biology just uses `"everyday"`):

| Biology Note Class | English Label | Suggested Icelandic Label |
|-------------------|---------------|--------------------------|
| `interactive` | Link to Learning | Tengill |
| `interactive interactive-long` | Link to Learning (video) | Tengill (myndband) |
| `visual-connection` | Visual Connection | Sjónræn tenging |
| `evolution` | Evolution Connection | Þróunartenging |
| `career` | Career Connection | Starfstenging |
| `everyday` | Everyday Connection | Tenging við daglegt líf |
| `scientific` | Scientific Method Connection | Vísindaleg aðferð |

#### Exercise Section Organization

Biology splits exercises into three separately classified sections per module:

```xml
<section class="visual-exercise">  <!-- Visual Connection Questions -->
<section class="multiple-choice">   <!-- Review Questions -->
<section class="critical-thinking"> <!-- Critical Thinking Questions -->
```

Chemistry uses a single `<section class="exercises">`. The exercise internal structure (`<exercise>/<problem>/<solution>`) is identical.

#### Interactive Content (Embedded Videos)

Like Physics, Biology embeds iframes for YouTube videos:

```xml
<note class="interactive interactive-long">
  <media id="...">
    <iframe width="660" height="371.4" src="https://..."/>
  </media>
</note>
```

**Pipeline impact:** Same `<iframe>` handling needed as Physics.

#### Species Nomenclature

Biology is pervasive with Latin binomial species names in `<emphasis effect="italics">`:

```xml
<emphasis effect="italics">Escherichia coli</emphasis>
<emphasis effect="italics">Homo sapiens</emphasis>
```

These use the same `<emphasis>` element as regular italic text. **They must NOT be translated.** This requires either:
- A species name dictionary for MT protection
- A heuristic to detect Latin binomials (two capitalized+lowercase italic words)
- Manual review to catch MT errors on species names

**Pipeline impact:** Medium — this is a translation quality issue, not a structural one.

#### Chemical Formulas in Biology

Biology uses simple chemical notation with `<sub>`/`<sup>` (CO₂, H₂O, C₆H₁₂O₆, NAD⁺). Occasionally MathML for amino acid notation. This is a subset of what Chemistry already handles.

### 5.4 Biology-Specific Pipeline Changes

| Change | Priority | Effort |
|--------|----------|--------|
| Three-level collection XML parser (Unit→Chapter→Module) | Must-have | Small-Medium |
| Biology note type labels (Icelandic) | Must-have | Small |
| Exercise section type rendering (3 types) | Should-have | Small |
| `<iframe>` handler for video embeds | Should-have | Small |
| Species name MT protection | Should-have | Medium |
| Image alt-text translation (600+ images) | Should-have | Medium (volume) |

### 5.5 What Makes Biology Easier Than Chemistry

- **Much less math** — dramatically reduces segment complexity
- **No `<example>` elements** — simpler module structure
- **No equation text to translate** — the equation-text dictionary is unnecessary
- **Same `<glossary>` structure** — glossary extraction works as-is
- **Fewer chemical formulas** — less MT protection needed

### 5.6 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Species names mistranslated by MT | High | Medium | Build species name dictionary; flag italicized Latin for review |
| Three-level hierarchy mishandled | Low | High | Straightforward parser extension; test with collection XML |
| Large image alt-text volume missed | Medium | Low | Systematic alt-text extraction and review |
| Gene/protein names translated | Medium | Medium | Add to MT protection dictionary (p53, BRCA1, Hox, etc.) |

---

## 6. Precalculus 2e (Recommended Math Title)

### 6.1 Why Precalculus 2e

For Icelandic framhaldsskóli students on a náttúrufræðibraut (natural sciences line), **Precalculus 2e** is the optimal choice among OpenStax mathematics titles:

| Criterion | Precalculus 2e | Algebra & Trig 2e | College Algebra 2e |
|-----------|---------------|-------------------|-------------------|
| Functions & algebra | Ch 1–4 | Ch 1–6 (with prerequisites) | Ch 1–9 (no trig) |
| Trigonometry | Ch 5–8 (full coverage) | Ch 7–10 (full coverage) | None |
| Calculus intro | Ch 12 (limits, derivatives) | None | None |
| Prerequisites review | Assumed known | Extensive (Ch 1–2) | Extensive (Ch 1–2) |
| Level match | University-prep | Slightly lower entry point | Below target level |

**Key arguments:**

1. **Scope alignment:** Covers algebra → trigonometry → intro calculus, matching the 3rd–5th year curriculum at schools like Menntaskólinn í Reykjavík.
2. **Chapter 12 (Introduction to Calculus)** covers limits and derivatives — unique among the three options and needed for natural science students.
3. **No redundant prerequisites:** Assumes basic algebra competence from grunnskóli.
4. **Module sharing:** Lives in the same repository as Algebra and Trigonometry 2e. Prerequisite modules can be pulled in later if needed without a separate pipeline setup.
5. **Exercise volume:** ~5,900 exercises across 12 chapters.

### 6.2 Source Repository

**Repository:** [openstax/osbooks-college-algebra-bundle](https://github.com/openstax/osbooks-college-algebra-bundle)
**License:** CC-BY-4.0
**Contents:** Precalculus 2e + Algebra & Trigonometry 2e + College Algebra 2e + College Algebra with Corequisite Support 2e

```
osbooks-college-algebra-bundle/
├── collections/
│   ├── precalculus-2e.collection.xml
│   ├── algebra-and-trigonometry-2e.collection.xml
│   ├── college-algebra-2e.collection.xml
│   └── college-algebra-corequisite-support-2e.collection.xml
├── media/
├── modules/  (138 modules total, shared across 4 books)
└── META-INF/
```

### 6.3 Key Differences from Chemistry

#### Extreme MathML Density

**The most math-heavy title by far.** A typical module has hundreds of `<m:math>` occurrences — math appears in nearly every paragraph, every exercise, every solution, and many table cells. The MathML vocabulary is broader than any other title:

| MathML Element | Chemistry | Physics | Biology | Precalculus |
|---------------|-----------|---------|---------|-------------|
| `<m:msub>` | Heavy | Moderate | Rare | Moderate |
| `<m:msup>` | Moderate | Heavy | Rare | **Very heavy** |
| `<m:mfrac>` | Moderate | Heavy | Rare | **Very heavy** |
| `<m:msqrt>` | Rare | Rare | — | **Common** |
| `<m:munder>` | — | — | — | **Heavy** (limit notation) |
| `<m:mover>` | — | — | — | **Used** (annotations) |
| `<m:mtable>` | — | Moderate | — | **Heavy** (derivations) |
| `<m:menclose>` | — | — | — | **Used** (cancellation in proofs) |

New MathML patterns unique to mathematics:

- **Limit notation:** `<m:munder>` places subscript below "lim"
- **Derivative notation:** f'(x) via `<m:msup>` with prime; dy/dx via `<m:mfrac>`
- **Multi-step derivations:** `<m:mtable>` with aligned equation steps + justification columns
- **Cancellation:** `<m:menclose notation="updiagonalstrike">` for proof steps
- **Set notation:** Curly braces with set-builder notation

**Pipeline impact:** Low for extraction/injection (MathML preserved as opaque blocks). The rendering step needs CSS for `<m:mtable>` alignment and `<m:menclose>` strikethrough, but these are cosmetic.

#### No Formal Glossary

**Precalculus does NOT use the `<glossary>` element.** Terms are defined inline using `<term>` tags. Formal definitions appear inside `<note>` elements with titles like "The Limit of a Function" or "Definition of Continuity."

**Pipeline impact:** The glossary extraction tool would find nothing. A different extraction strategy is needed — either parsing inline `<term>` elements with surrounding context, or manually building a glossary from the definition `<note>` elements.

#### Note Types

| Chemistry Note Classes | Precalculus Note Classes |
|----------------------|------------------------|
| `chemistry everyday-life` | `precalculus try` (inline practice — very frequent) |
| `chemistry link-to-learning` | `precalculus qa` (Q&A clarifications) |
| `green-chemistry` | `precalculus media media-notitle` (resource links) |
| `safety-hazard` | `how-to-notitle` (step-by-step procedures) |
| | `no-emphasis` (reference tables) |
| | (no class, title only — definitions, theorems) |

The `precalculus try` ("Try It") notes are particularly notable — they are inline practice exercises that appear throughout the body text, interleaved with instruction. Chemistry has no equivalent pattern.

#### Exercise Structure

Precalculus uses categorized exercise subsections within `<section class="section-exercises">`:

```xml
<section class="section-exercises">
  <section><title>Verbal</title>...</section>
  <section><title>Algebraic</title>...</section>
  <section><title>Graphical</title>...</section>
  <section><title>Numeric</title>...</section>
  <section><title>Technology</title>...</section>
  <section><title>Extensions</title>...</section>
  <section><title>Real-World Applications</title>...</section>
</section>
```

A single module can have 60+ exercises (vs. 10–20 for Chemistry). This significantly increases the per-module translation and review workload.

#### No Interactive Embeds

Unlike Physics and Biology, Precalculus 2e has **no embedded iframes** — all visualizations are static JPG images. External resources are plain URL links in `<note class="precalculus media media-notitle">` elements. This simplifies the pipeline.

#### Figure Content

Figures are predominantly coordinate plane graphs, unit circle diagrams, and geometric constructions — all as static images with English text labels (axis labels, function names, etc.). These would need localized image versions, same as Chemistry.

### 6.4 Precalculus-Specific Pipeline Changes

| Change | Priority | Effort |
|--------|----------|--------|
| Precalculus note type labels (Icelandic) | Must-have | Small |
| "Try It" inline exercise rendering | Must-have | Small |
| Categorized exercise section rendering | Should-have | Small |
| Alternative glossary extraction (inline `<term>`) | Should-have | Medium |
| `<m:mtable>` CSS for derivation alignment | Should-have | Small |
| Math equation-text dictionary (sin, cos, lim, etc.) | Should-have | Small |

### 6.5 What Makes Precalculus Easier Than Chemistry

- **No chemical formulas in running text** — Chemistry has inline formulas (CH₃COOH) that are tricky for MT; math has clean `<m:math>` blocks.
- **Less domain vocabulary** — mathematical terms (fall, markgildi, afleiða) have well-established Icelandic equivalents; Chemistry required extensive custom glossary work.
- **Fewer modules** — 94 vs. 148 for Chemistry.
- **No embedded iframes** — no PhET/YouTube handling needed.

### 6.6 What Makes Precalculus Harder

- **MathML density** — far more math placeholders per segment than Chemistry, making MT segments harder to read for reviewers.
- **Massive exercise sets** — 5,900 exercises is roughly double Chemistry's count.
- **No formal glossary** — requires alternative terminology extraction strategy.
- **Graph figure localization** — many coordinate plane images have English axis labels that need Icelandic versions.

### 6.7 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MathML placeholder density degrades MT quality | Medium | Medium | Test with exercise-heavy modules; may need smaller segments |
| Missing glossary extraction | Certain (without changes) | Medium | Build inline `<term>` extractor; manual glossary seeding |
| Reviewer fatigue on math-heavy segments | Medium | Medium | Prioritize instructional text over exercises for early review |

---

## 7. Cross-Title Comparison: Pipeline Change Requirements

### 7.1 Changes Needed for ALL New Titles

| Change | Affected Tools | Effort |
|--------|---------------|--------|
| **Parameterize book path** — Add `--book` flag to all tools | All 7 tools | Small |
| **Collection XML intake script** — Parse collection XML, reorganize modules into `ch{NN}/` layout | New script | Small-Medium |
| **Per-book config directory** — `books/{book}/config/` with note types, equation text, labels | cnxml-render.js | Medium |

### 7.2 Title-Specific Changes

| Change | Physics | Biology | Precalculus |
|--------|---------|---------|-------------|
| `<iframe>` handler | Required | Required | Not needed |
| Three-level collection hierarchy | Not needed | Required | Not needed |
| Species name MT protection | Not needed | Required | Not needed |
| Glossary extraction alternative | Not needed | Not needed | Required |
| Exercise categorization rendering | Nice-to-have | Should-have | Should-have |
| Equation-text dictionary | Required | Not needed | Required |
| `<m:mtable>` derivation CSS | Nice-to-have | Not needed | Should-have |

### 7.3 Estimated Effort Summary

| Phase | Description | Effort |
|-------|-------------|--------|
| **Phase 1: Parameterization** (all titles) | `--book` flag, config extraction, intake script | Medium |
| **Phase 2a: Physics intake** | Dictionary, note labels, iframe handler, test 2–3 chapters | Small |
| **Phase 2b: Biology intake** | Three-level parser, note labels, species protection, test 2–3 chapters | Small-Medium |
| **Phase 2c: Precalculus intake** | Note labels, glossary extraction, derivation CSS, test 2–3 chapters | Small-Medium |

Phase 1 is shared work that benefits all titles. Phases 2a–2c are independent and can be done in any order.

---

## 8. Recommendation

**The pipeline architecture is sound for all three titles.** The CNXML format is the same across all OpenStax books; the differences are in content patterns (MathML density, note types, exercise organization), not in the underlying structure.

**Suggested implementation order:**

1. **Phase 1 first** — Parameterize the pipeline. This is prerequisite for all titles and improves the codebase regardless.
2. **Biology second** — Simplest adaptation (least math, familiar element set). Good for validating the parameterized pipeline with minimal risk.
3. **Physics third** — Tests the pipeline's MathML handling at scale. PhET iframe work benefits Biology too.
4. **Precalculus last** — Most demanding adaptation (no glossary, extreme MathML density, massive exercises). Benefits from all prior work.

**The real bottleneck is human review capacity, not pipeline capability.** The combined content across all four titles is approximately:

| | Chemistry | Physics | Biology | Precalculus | **Total** |
|--|-----------|---------|---------|-------------|-----------|
| Modules | ~148 | ~280 | ~280 | ~94 | **~800** |
| Chapters | 21 | 34 | 47 | 12 | **114** |

---

## Appendix A: Chapter Lists

### A.1 College Physics 2e (34 chapters)

| Ch | Title | ~Modules |
|----|-------|----------|
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

### A.2 Biology 2e (47 chapters across 8 units)

| Unit | Ch | Title |
|------|-----|-------|
| 1: The Chemistry of Life | 1 | The Study of Life |
| | 2 | The Chemical Foundation of Life |
| | 3 | Biological Macromolecules |
| 2: The Cell | 4 | Cell Structure |
| | 5 | Structure and Function of Plasma Membranes |
| | 6 | Metabolism |
| | 7 | Cellular Respiration |
| | 8 | Photosynthesis |
| | 9 | Cell Communication |
| | 10 | Cell Reproduction |
| 3: Genetics | 11 | Meiosis and Sexual Reproduction |
| | 12 | Mendel's Experiments and Heredity |
| | 13 | Modern Understandings of Inheritance |
| | 14 | DNA Structure and Function |
| | 15 | Genes and Proteins |
| | 16 | Gene Expression |
| | 17 | Biotechnology and Genomics |
| 4: Evolutionary Processes | 18 | Evolution and the Origin of Species |
| | 19 | The Evolution of Populations |
| | 20 | Phylogenies and the History of Life |
| 5: Biological Diversity | 21 | Viruses |
| | 22 | Prokaryotes: Bacteria and Archaea |
| | 23 | Protists |
| | 24 | Fungi |
| | 25 | Seedless Plants |
| | 26 | Seed Plants |
| | 27 | Introduction to Animal Diversity |
| | 28 | Invertebrates |
| | 29 | Vertebrates |
| 6: Plant Structure and Function | 30 | Plant Form and Physiology |
| | 31 | Soil and Plant Nutrition |
| | 32 | Plant Reproduction |
| 7: Animal Structure and Function | 33 | The Animal Body: Basic Form and Function |
| | 34 | Animal Nutrition and the Digestive System |
| | 35 | The Nervous System |
| | 36 | Sensory Systems |
| | 37 | The Endocrine System |
| | 38 | The Musculoskeletal System |
| | 39 | The Respiratory System |
| | 40 | The Circulatory System |
| | 41 | Osmotic Regulation and Excretion |
| | 42 | The Immune System |
| | 43 | Animal Reproduction and Development |
| 8: Ecology | 44 | Ecology and the Biosphere |
| | 45 | Population and Community Ecology |
| | 46 | Ecosystems |
| | 47 | Conservation Biology and Biodiversity |

### A.3 Precalculus 2e (12 chapters)

| Ch | Title | ~Modules |
|----|-------|----------|
| 1 | Functions | 8 |
| 2 | Linear Functions | 5 |
| 3 | Polynomial and Rational Functions | 10 |
| 4 | Exponential and Logarithmic Functions | 9 |
| 5 | Trigonometric Functions | 5 |
| 6 | Periodic Functions | 4 |
| 7 | Trigonometric Identities and Equations | 7 |
| 8 | Further Applications of Trigonometry | 9 |
| 9 | Systems of Equations and Inequalities | 9 |
| 10 | Analytic Geometry | 6 |
| 11 | Sequences, Probability, and Counting Theory | 8 |
| 12 | Introduction to Calculus | 5 |

---

## Appendix B: CNXML Element Comparison Across All Titles

| Element | Chemistry | Physics | Biology | Precalculus | Pipeline Status |
|---------|-----------|---------|---------|-------------|-----------------|
| `<para>` | Yes | Yes | Yes | Yes | Works |
| `<section>` | Yes | Yes | Yes | Yes | Works |
| `<figure>` | Yes | Yes | Yes | Yes | Works |
| `<table>` | Yes | Yes | Yes | Yes | Works |
| `<equation>` | Heavy | Heavy | Rare | Heavy | Works |
| `<example>` | Yes | Yes | **No** | Yes | Works (unused for Bio) |
| `<exercise>` | Yes | Yes (typed) | Yes (categorized) | Yes (categorized) | Works (types ignored) |
| `<note>` | Chem classes | Phys classes | Bio classes | Precalc classes | **Needs per-book config** |
| `<term>` | Inline + glossary | Inline + glossary | Inline + glossary | Inline only | Works (glossary extraction differs) |
| `<list>` | Yes | Yes | Yes | Yes | Works |
| `<emphasis>` | Yes | Yes | Yes (species!) | Yes | Works |
| `<link>` | Yes | Yes | Yes | Yes | Works |
| `<media><image>` | Yes | Yes | Yes | Yes | Works |
| `<media><iframe>` | No | PhET sims | YouTube videos | No | **Needs implementation** |
| `<m:math>` | Moderate | Very heavy | Rare | Extremely heavy | Works |
| `<m:munder>` | No | No | No | Yes (limits) | Works (passthrough) |
| `<m:menclose>` | No | No | No | Yes (proofs) | Works (passthrough) |
| `<glossary>` | Yes | Yes | Yes | **No** | Works (missing for Precalc) |

## Appendix C: Pipeline Tool Hardcoding Summary

| Tool | Hardcoded Book Path | Subject-Specific Logic | Change Needed |
|------|-------------------|------------------------|---------------|
| `cnxml-extract.js` | `books/efnafraedi` | Isotope notation regex | Add `--book` param; make regex configurable |
| `cnxml-inject.js` | `books/efnafraedi` | Isotope notation regex | Add `--book` param; make regex configurable |
| `cnxml-render.js` | `books/efnafraedi` | Note types, LaTeX dict, titles | Add `--book` param + per-book config files |
| `protect-segments-for-mt.js` | — | None | Add `--book` param (paths) |
| `unprotect-segments.js` | — | None | Add `--book` param (paths) |
| `init-faithful-review.js` | `books/efnafraedi` | None | Add `--book` param |
| `prepare-for-align.js` | — | None | Minimal changes |

## Appendix D: Grant Application Summary

All three additional titles (Physics, Biology, Precalculus) can be processed through the existing Icelandic translation pipeline with moderate adaptation work. The infrastructure built for Chemistry 2e is reusable because:

1. **All OpenStax titles share the same CNXML format** — the same XML schema, namespaces, and element vocabulary. Differences are in content patterns, not structure.

2. **The pipeline is content-agnostic at its core** — segment extraction, MT protection, injection, and rendering operate on generic CNXML elements. Subject-specific handling (note labels, equation text, exercise types) can be externalized into per-book configuration.

3. **The parameterization work is shared** — making the pipeline book-agnostic (Phase 1) is a one-time investment that benefits all future titles.

4. **Each title has a clear adaptation path** — Biology is the simplest (least math), Physics tests MathML handling at scale, and Precalculus is the most demanding but benefits from all prior work.

5. **All source material is CC-BY-4.0** — freely available for translation and redistribution.

The pipeline can be extended to any OpenStax title that uses the CNXML format, which includes the majority of their catalog.
