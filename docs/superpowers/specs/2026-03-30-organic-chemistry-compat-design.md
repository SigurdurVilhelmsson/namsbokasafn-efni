# Organic Chemistry Compatibility — Design Spec

**Date:** 2026-03-30
**Origin:** Investigation of lifraen-efnafraedi (Organic Chemistry) rendering differences from the OpenStax site. The book uses a newer OpenStax authoring format with external exercise references, per-module sequential IDs, and linked key-terms.

## Context

The rendering pipeline was built around efnafraedi-2e's conventions (inline exercises, `<glossary>` elements, globally unique IDs). Lifraen-efnafraedi uses three different patterns:

1. **1,961 exercises reference an external exercise bank** via `<link class="os-embed" url="#exercise/{nickname}"/>` — rendering as empty placeholders
2. **Key Terms uses a linked list** (`<section class="key-terms">`) instead of per-module `<glossary><definition>` elements — page not generated
3. **Section exercises stripped from all module pages** by `excludedSectionClasses` config — OpenStax shows them inline per section

All fixes use detection rather than configuration where possible — check what format the source uses and handle both paths automatically.

## Fix 1: Exercise Content Resolver

### Problem

All 1,961 exercises in lifraen-efnafraedi are `os-embed` references like `<link class="os-embed" url="#exercise/03-04-OC-P11"/>`. The rendered HTML contains these as raw links with no visible content. The other 4 books have zero os-embed references (all inline content).

### Design

**New tool:** `tools/resolve-os-embed.js`

**What it does:**
1. Scans all source CNXML files (`01-source/`) in a book for `os-embed` links
2. Extracts exercise nicknames (e.g., `03-04-OC-P11` from `url="#exercise/03-04-OC-P11"`)
3. Fetches exercise content from the public API: `GET https://exercises.openstax.org/api/exercises?q=nickname:{nickname}`
4. Caches API responses as JSON files in `books/{book}/01-source/exercises/` (one file per exercise, keyed by nickname)
5. Downloads referenced exercise images to `books/{book}/01-source/media/`

**When it runs:** Once per book, as a pre-processing step after source download and before extraction. Cached results persist — subsequent runs skip already-cached exercises.

**API response structure (relevant fields):**
```json
{
  "items": [{
    "nickname": "03-04-OC-P11",
    "stimulus_html": "Give IUPAC names for the following compounds:",
    "solutions_are_public": true,
    "questions": [{
      "id": 351766,
      "stem_html": "<img src=\"...\" alt=\"...\">",
      "collaborator_solutions": [{"content_html": "Pentane, 2-methylbutane..."}]
    }],
    "images": [{"url": "https://exercises.openstax.org/rails/..."}]
  }]
}
```

**Rendering integration:** During rendering, `cnxml-render.js` checks if an exercise para contains an `os-embed` link. If so, it looks up the cached exercise JSON and renders:
- The `stimulus_html` as the problem text
- Each question's `stem_html` as sub-parts (a), (b), (c), (d)
- Images from the local cache
- Solutions (if `solutions_are_public`) in a collapsible answer section

**First pass:** Exercises render in English. The stimulus and solution text is short (typically one sentence + chemical names). Translation can be added later via the editorial pipeline once exercises are integrated as segments.

**Backward compat:** The tool only finds os-embed references in lifraen-efnafraedi. Other books are unaffected. The renderer only activates the resolution path when it encounters an os-embed link.

### Files

| File | Change |
|------|--------|
| `tools/resolve-os-embed.js` | New — CLI tool for fetching and caching exercises |
| `tools/cnxml-render.js` | Add os-embed resolution during exercise rendering |
| `books/lifraen-efnafraedi/01-source/exercises/` | New directory — cached exercise JSON files |

## Fix 2: Key Terms Fallback Renderer

### Problem

The renderer builds key-terms pages from `<glossary><definition>` elements (via `extractChapterGlossary()`). Lifraen-efnafraedi has zero `<glossary>` elements. Instead, it uses `<section class="key-terms">` in the last module with a `<list>` of cross-reference links:

```xml
<section class="key-terms" id="sect-00002">
  <list id="list-00001">
    <item><link document="m00032" target-id="term-00006">alcohol</link></item>
    <item><link document="m00032" target-id="term-00013">aldehyde</link></item>
  </list>
</section>
```

### Design

In `cnxml-render.js`, after `extractChapterGlossary()` returns empty, add a fallback:

1. Check if the end-of-chapter sections (already extracted) include a `key-terms` section
2. If found, extract the `<list>` items
3. Each item is a `<link document="..." target-id="...">term</link>` — resolve `document` to the section page URL
4. Render as a simple linked term list (matching the OpenStax style)
5. Write to `{chapter}-key-terms.html` via the existing `writeCompiledGlossary()`

**Backward compat:** Only triggers when `<glossary>` returns nothing AND a `<section class="key-terms">` exists. Older books have `<glossary>` and hit the existing path.

### Files

| File | Change |
|------|--------|
| `tools/cnxml-render.js` | Add fallback key-terms renderer after glossary extraction |

## Fix 3: Per-Book Section Exercise Handling

### Problem

`excludedSectionClasses` includes `section-exercises` globally, stripping exercises from ALL module pages. On the OpenStax site, each section shows its own exercises at the bottom. Currently, our section pages for lifraen-efnafraedi have zero exercises.

### Design

Add a `sectionExercises` option to `book-rendering-config.js`:

```javascript
// lifraen-efnafraedi config:
sectionExercises: 'both',     // keep inline in sections AND compile to EOC page

// Default (all other books):
sectionExercises: 'compiled',  // current behavior: strip from sections, compile only
```

When `'both'`:
- Remove `section-exercises` from `excludedSectionClasses` for this book
- Section exercises render inline at the bottom of each section page
- ALSO compile them into the end-of-chapter exercises page (existing behavior)

When `'compiled'` (default):
- Current behavior, no change

**Implementation:** In `cnxml-render.js`, before applying `excludedSectionClasses`, check the book config's `sectionExercises` value. If `'both'`, filter out `section-exercises` from the exclusion list.

**Backward compat:** Default is `'compiled'` — all existing books unchanged.

### Files

| File | Change |
|------|--------|
| `tools/lib/book-rendering-config.js` | Add `sectionExercises: 'both'` to lifraen-efnafraedi config |
| `tools/cnxml-render.js` | Check `sectionExercises` config before excluding section-exercises |

## Testing

- **Fix 1:** Run `resolve-os-embed.js` for lifraen-efnafraedi ch03, verify cached JSON and images. Re-render and check exercises have content.
- **Fix 2:** Re-render lifraen-efnafraedi ch03, verify `3-key-terms.html` is generated with linked terms.
- **Fix 3:** Re-render lifraen-efnafraedi ch03, verify section 3.4 page has 4 exercises at bottom. Verify efnafraedi-2e is unchanged (no inline exercises).
- **Regression:** Run full test suite. Re-render efnafraedi-2e ch01 and verify no changes.

## Scope Boundaries

- Exercise translation is deferred — first pass renders exercises in English.
- The exercise resolver caches locally but doesn't integrate with the editorial pipeline (no segments, no segment editor). This can be added later.
- The key-terms fallback renders cross-reference links but doesn't resolve `target-id` to anchor links within section pages (would require a cross-module ID index). First pass renders term names as plain text with module-level links.
