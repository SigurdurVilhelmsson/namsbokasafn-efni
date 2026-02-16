# Publication Directory

Web-ready semantic HTML produced by the Extract-Inject-Render pipeline (`cnxml-render.js`).

## Three Publication Tracks

| Track | Source | When Published |
|-------|--------|----------------|
| `mt-preview/` | `02-mt-output/` (unreviewed MT) | Immediately after MT — early access for students |
| `faithful/` | `03-faithful-translation/` (reviewed) | Per-module, as reviews are completed and approved |
| `localized/` | `04-localized-content/` (adapted) | After Pass 2 localization complete |

## Module-Level Publication

Faithful HTML appears **per module** as reviews complete:

1. Editor reviews segments in the segment editor
2. Head editor approves module review
3. `applyApprovedEdits()` writes reviewed segments to `03-faithful-translation/`
4. Inject + render produces faithful HTML for that module
5. Reader shows faithful when available, falls back to mt-preview

## Directory Structure

```
05-publication/
├── mt-preview/
│   ├── chapters/
│   │   └── {NN}/
│   │       ├── {NN}-0-introduction.html
│   │       ├── {NN}-{S}-{slug}.html          # Module content pages
│   │       ├── {NN}-exercises.html            # Compiled exercises
│   │       ├── {NN}-summary.html              # Compiled summaries
│   │       ├── {NN}-key-equations.html        # Key equations
│   │       ├── {NN}-key-terms.html            # Glossary terms
│   │       ├── {NN}-answer-key.html           # Exercise solutions
│   │       └── images/                        # Chapter images
│   ├── glossary.json
│   ├── index.json
│   └── toc.json
├── faithful/                                  # Same structure as mt-preview
│   └── chapters/{NN}/                         # Grows as modules are reviewed
├── localized/                                 # Same structure (future)
└── README.md
```

## Pipeline

```
02-mt-output/ ──→ cnxml-inject ──→ cnxml-render ──→ 05-publication/mt-preview/
03-faithful-translation/ ──→ cnxml-inject ──→ cnxml-render ──→ 05-publication/faithful/
04-localized-content/ ──→ cnxml-inject ──→ cnxml-render ──→ 05-publication/localized/
```

**Tools:**
- `cnxml-inject.js` — inject translated segments into CNXML structure
- `cnxml-render.js` — render CNXML to semantic HTML with pre-rendered MathJax SVG

## HTML Output

Each module produces one HTML file containing:
- Semantic markup with preserved OpenStax IDs
- Pre-rendered MathJax 4 SVG equations (inline and display)
- Data attributes for numbering (`data-figure-number`, `data-table-number`, etc.)
- Embedded page data JSON

End-of-chapter pages are compiled from tagged sections across all modules in the chapter.

## CLI Usage

```bash
# MT preview for a chapter
node tools/cnxml-inject.js --chapter 1
node tools/cnxml-render.js --chapter 1 --track mt-preview

# Faithful for a single reviewed module
node tools/cnxml-inject.js --chapter 1 --module m68663
node tools/cnxml-render.js --chapter 1 --module m68663 --track faithful

# Appendices
node tools/cnxml-inject.js --chapter appendices
node tools/cnxml-render.js --chapter appendices --track mt-preview
```
