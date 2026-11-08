# Publication Directory

Web-ready semantic HTML produced by the Extract-Inject-Render pipeline (`cnxml-render.js`).

## Three Publication Tracks

| Track | Source | When Published |
|-------|--------|----------------|
| `mt-preview/` | `02-mt-output/` (unreviewed MT) | Immediately after MT — early access for students |
| `faithful/` | `03-faithful-translation/` (reviewed) | Per-module, as reviews are completed and approved |
| `localized/` | `04-localized-content/` (adapted) | After Pass 2 localization complete |

A track's directory exists only once something has been rendered to it. Chemistry's faithful
track was retired on 2026-10-04
([#535](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/535)), which removed its
rendered pages; `ls` shows what is here now.

## Module-Level Publication

Faithful HTML appears **per module** as reviews complete:

1. Editor reviews segments in the segment editor
2. Head editor approves the edits
3. `applyApprovedEdits()` writes reviewed segments to `03-faithful-translation/`
4. Inject + render produces faithful HTML for that module
5. The reader shows the faithful page where one exists and falls back to mt-preview elsewhere

The reader's sync (`scripts/sync-content.js` in
[namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur)) copies
`mt-preview/` as the baseline and `faithful/` on top of it. It does not copy `localized/`.

## Directory Structure

```
05-publication/
├── mt-preview/
│   ├── chapters/
│   │   └── {NN}/                              # Zero-padded directory: 01, 02, …
│   │       ├── {N}-0-introduction.html        # File names use the bare number: 1-0-…
│   │       ├── {N}-{S}-{slug}.html            # Module content pages
│   │       ├── {N}-exercises.html             # Compiled exercises
│   │       ├── {N}-summary.html               # Compiled summaries
│   │       ├── {N}-key-equations.html         # Key equations
│   │       ├── {N}-key-terms.html             # Glossary terms
│   │       ├── {N}-answer-key.html            # Exercise solutions
│   │       └── images/                        # Chapter images
│   ├── glossary.json
│   ├── index.json
│   └── slug-map.mt-preview.json               # Pages a re-render superseded: old → new
├── faithful/                                  # Same structure as mt-preview, once rendered
├── localized/                                 # Same structure, once rendered
├── glossary.json
├── toc.json
└── README.md
```

`slug-map.<track>.json` records each page a render pruned and the page that replaced it, so
old URLs can be redirected. It cannot be regenerated, so treat it as data, not build output —
see CLAUDE.md, *Prune-on-rename*.

## Pipeline

```
02-mt-output/ ──→ cnxml-inject ──→ cnxml-render ──→ 05-publication/mt-preview/
03-faithful-translation/ ──→ cnxml-inject ──→ cnxml-render ──→ 05-publication/faithful/
04-localized-content/ ──→ cnxml-inject ──→ cnxml-render ──→ 05-publication/localized/
```

**Tools:**
- `cnxml-inject.js` — inject translated segments into CNXML structure (`--source-dir` chooses which segments; the track follows from it)
- `cnxml-render.js` — render CNXML to semantic HTML with pre-rendered MathJax SVG

## HTML Output

Each module produces one HTML file containing:
- Semantic markup with preserved OpenStax IDs
- Pre-rendered MathJax SVG equations (inline and display)
- Data attributes for numbering (`data-figure-number`, `data-table-number`, etc.)
- Embedded page data JSON (`<script type="application/json" id="page-data">`)

End-of-chapter pages are compiled from tagged sections across all modules in the chapter.

## CLI Usage

```bash
# MT preview for a chapter
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track mt-preview

# Faithful for a single reviewed module
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --module m68663 --source-dir 03-faithful-translation
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --module m68663 --track faithful

# Localized for a chapter (pass --source-dir; inject refuses a --track that disagrees with it)
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 04-localized-content
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track localized

# Appendices
node tools/cnxml-inject.js --book efnafraedi-2e --chapter appendices
node tools/cnxml-render.js --book efnafraedi-2e --chapter appendices --track mt-preview
```
