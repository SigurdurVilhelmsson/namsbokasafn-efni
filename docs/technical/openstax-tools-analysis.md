# OpenStax Repository Analysis for namsbokasafn

> Analysis date: 2026-01-20
> Purpose: Identify tools and systems that could benefit the Icelandic textbook translation workflow

## Summary

Analysis of OpenStax GitHub repositories to identify tools that could integrate with or improve our translation pipeline. **Recommendation:** Adopt Option B (incremental adoption) - install POET for validation, keep existing workflow.

---

## Most Relevant Repositories

### 1. Enki - Content Pipeline (HIGHLY RELEVANT)

**Repository:** [openstax/enki](https://github.com/openstax/enki)

**What it does:** All-in-one build system for OpenStax books. Produces PDF, web (JSON), and EPUB from CNXML source.

**Relevance:** Could replace custom `cnxml-to-md.js` pipeline with official OpenStax toolchain.

| Pros | Cons |
|------|------|
| Actively maintained | Complex setup (Docker, submodules) |
| Multiple output formats (PDF, web, EPUB) | No built-in MT integration |
| Docker-based - consistent builds | Outputs OpenStax-specific JSON, not Markdown |
| Handles equations, figures natively | Would require adapting namsbokasafn-vefur |
| Used for Polish translations | |

**Usage:**
```bash
./enki --command all-web --repo 'username/book-repo' --ref main
./enki --command all-pdf --repo 'username/book-repo' --book-slug 'chemistry'
```

---

### 2. POET - VSCode Extension (USEFUL)

**Repository:** [openstax/poet](https://github.com/openstax/poet)

**What it does:** VSCode extension for editing CNXML with real-time validation and preview.

**Relevance:** Improves translation editing workflow and QA.

| Pros | Cons |
|------|------|
| Real-time CNXML validation | No translation/MT workflow support |
| Preview capabilities | Designed for authoring, not translation |
| Broken link detection | |
| Actively maintained | |

**Best use:** Install for manual review of CNXML files during translation QA.

**Installation:**
1. Open VSCode
2. Press `Ctrl+Shift+X`
3. Search for "POET" or "openstax.editor"
4. Click Install

---

### 3. rex-web - Reading Platform (MAJOR ALTERNATIVE)

**Repository:** [openstax/rex-web](https://github.com/openstax/rex-web)

**What it does:** The official OpenStax web reader - "Unified Reading EXperience"

**Tech stack:** React, TypeScript

**Relevance:** Could potentially replace namsbokasafn-vefur entirely.

| Pros | Cons |
|------|------|
| Battle-tested (millions of users) | React-based (we use SvelteKit) |
| Full feature set (search, highlighting) | Tightly coupled to OpenStax infrastructure |
| WCAG 2.0 AA accessibility | Would need UI localization to Icelandic |
| Supports Polish content | No flashcards or quiz features |

**Decision:** Don't migrate. Our SvelteKit app has unique features (flashcards, quizzes, offline-first) and is simpler to maintain.

---

### 4. cookbook + cnx-recipes - Styling Framework

**Repositories:**
- [openstax/cookbook](https://github.com/openstax/cookbook)
- [openstax/cnx-recipes](https://github.com/openstax/cnx-recipes)

**What it does:** CSS-based styling and content manipulation for OpenStax books.

**Relevance:** Could provide consistent styling for publications.

**Usage:**
```bash
docker run --rm -v $PWD:/files openstax/recipes:latest \
  /code/bake -b chemistry -i /files/input.xhtml -o /files/baked.xhtml
```

---

### 5. osbooks-fizyka-bundle - Polish Translation Example

**Repository:** [openstax/osbooks-fizyka-bundle](https://github.com/openstax/osbooks-fizyka-bundle)

**What it does:** Polish physics textbook in CNXML format.

**Relevance:** Reference for how OpenStax organizes translated content.

**Key insight:** Translations maintain the same CNXML structure as English originals. OpenStax Poland does NOT use MT - they hire expert translators/adapters.

---

## Less Relevant / Archived Repositories

| Repository | Status | Notes |
|------------|--------|-------|
| nebuchadnezzar | Archived 2023 | Was for publishing to cnx.org |
| cnx-transforms | Archived 2023 | CNXML→HTML5 XSLT (reference only) |
| cnxml2md | Inactive since 2016 | Third-party, doesn't handle math |
| oer.exports | Legacy | Replaced by Enki |

---

## Key Findings

### 1. No Official Translation/i18n Tools

OpenStax does NOT have translation workflow tools. Their translations (Polish, Spanish) are done by partner organizations who:
- Work with expert human translators
- Create "adaptations" not just translations
- Store translated content in the same CNXML format

### 2. Our Custom Approach Has Merit

Our CNXML→Markdown→MT→Review workflow is novel. OpenStax doesn't do this - they skip MT entirely and use human translators. Our approach could actually be more efficient for smaller languages like Icelandic.

### 3. Integration Options

| Option | Effort | Description |
|--------|--------|-------------|
| **A: Adopt Enki** | Medium | Use Enki for CNXML→web/PDF, adapt vefur to consume JSON |
| **B: POET + Keep Custom** | Low | Install POET for validation, keep existing tools |
| **C: Full OpenStax Stack** | High | Fork rex-web, use Enki, store in osbooks format |

---

## Recommendation: Option B (Incremental Adoption)

Given the January 2026 pilot deadline:

1. **Install POET** for CNXML validation during review
2. **Reference cnx-transforms** XSLT for any conversion improvements
3. **Study osbooks-fizyka-bundle** structure for best practices
4. **Keep existing workflow** - it's actually innovative

### Post-Pilot Evaluation

Consider after pilot is stable:
- Evaluate Enki for PDF generation (could replace manual exports)
- Consider rex-web if namsbokasafn-vefur needs major updates

---

## Enki Integration Details

### What Enki Does

Enki is OpenStax's official book-building pipeline:

```
CNXML Source → fetch → prebake → bake → postbake → [pdf/web/epub]
                ↓
        Git repo or local --sideload
```

**Key stages:**
1. **fetch** - Clone book repository
2. **prebake** - Assemble modules into single XHTML, generate metadata
3. **bake** - Apply CSS styling via cookbook recipes (Ruby/XSLT)
4. **postbake** - Link resolution, cross-book references
5. **format-specific** - Generate PDF/web/EPUB output

### Practical Considerations

| Aspect | Details |
|--------|---------|
| Docker | Required (~2GB with submodules) |
| Build time | 5-15 minutes per book |
| Language | Supports `language` field in collection XML (`is` for Icelandic) |

### Integration Scenarios

**Scenario 1: Enki for PDF Only (Low effort)**
```
Our workflow:  CNXML → MD → MT → IS MD → 03-faithful-translation/
Enki:          03-faithful-translation/ → convert to CNXML → PDF
```

**Scenario 2: Enki for All Outputs (Medium effort)**
```
Our workflow:  CNXML → MD → MT → IS MD → review
New step:      IS MD → IS CNXML (osbooks-efnafraedi-bundle)
Enki:          osbooks-efnafraedi-bundle → PDF + web + EPUB
```

---

## rex-web vs namsbokasafn-vefur Comparison

| Feature | rex-web | namsbokasafn-vefur |
|---------|---------|-------------------|
| Framework | React + TypeScript | SvelteKit 2 + TypeScript |
| Content Format | Baked XHTML + JSON API | Markdown files |
| Math | MathJax | KaTeX + mhchem (faster) |
| Flashcards | ❌ | ✅ SM-2 spaced repetition |
| Quizzes | ❌ (via partners) | ✅ Built-in |
| Offline | Mobile apps only | ✅ PWA |
| UI Language | English | Icelandic |
| Accessibility | WCAG 2.0 AA | (needs audit) |

### Migration Effort: 10-19 weeks

Not recommended given our unique features and simpler architecture.

---

## POET Setup Guide

### VSCode Extension (Recommended)

1. Open VSCode
2. Press `Ctrl+Shift+X`
3. Search for "POET" or "openstax.editor"
4. Click Install

The extension activates automatically when opening CNXML files.

### CLI Tools (Optional)

```bash
git clone https://github.com/openstax/poet.git
cd poet
npm install
npm run build

# Validate all books
./poet validate /path/to/books/efnafraedi/01-source

# Find broken links
./poet links /path/to/books/efnafraedi/01-source

# Find orphaned files
./poet orphans /path/to/books/efnafraedi/01-source
```

### Integration Points

| When | Use POET for |
|------|--------------|
| Before MT export | Validate source CNXML is clean |
| After translation | Validate if converting back to CNXML |
| Debugging | When content doesn't render correctly |

---

## Sources

- [openstax/enki](https://github.com/openstax/enki) - Content pipeline
- [openstax/poet](https://github.com/openstax/poet) - VSCode extension
- [openstax/rex-web](https://github.com/openstax/rex-web) - Reading platform
- [openstax/cookbook](https://github.com/openstax/cookbook) - Styling framework
- [openstax/cnx-recipes](https://github.com/openstax/cnx-recipes) - CSS recipes
- [openstax/cnx-transforms](https://github.com/openstax/cnx-transforms) - XSLT transforms (archived)
- [openstax/osbooks-fizyka-bundle](https://github.com/openstax/osbooks-fizyka-bundle) - Polish physics
- [openstax/template-osbooks-new](https://github.com/openstax/template-osbooks-new) - Book template
- [OpenStax Poland](https://openstax.pl/en) - Polish translation partner
