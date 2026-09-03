# CLI Tools

*Auto-generated from tools/ directory*

## Core Tools (Simplified Workflow)

| Tool | Description | Step |
|------|-------------|------|
| `cnxml-extract` | Extract EN segments and structure from CNXML source | 1a |
| `cnxml-inject` | Inject translated segments back into CNXML | 5a |
| `cnxml-render` | Render translated CNXML to semantic HTML | 5b |

## Utility Tools

| Tool | Description |
|------|-------------|
| `analyze-order-causes` | For each module, build fresh inject output in memory and compare element |
| `api-translate` | Translates English segment files to Icelandic using the Miðeind Málstaður |
| `apply-glossary-supplement` | WHY THIS EXISTS |
| `audit-equation-notation` | Pre-publication validator that compares source equation numbers (US format) |
| `audit-equation-text` | Scan equation structure files and report untranslated English text |
| `audit-render-output` | Post-render audit: compares source CNXML against rendered HTML output |
| `auto-insert-placeholders` | Automatically insert [[MEDIA:n]] and [[TABLE:id]] placeholders into Icelandic se |
| `backfill-provenance` | Stamp producer provenance onto pre-existing 02-mt-output content. |
| `check-openstax-errata` | Track and manage OpenStax errata for Chemistry 2e. |
| `check-source-updates` | Compare local 01-source/ CNXML files against upstream OpenStax GitHub |
| `cnxml-fidelity-check` | Counts opening tags by element name in both source and translated CNXML |
| `cnxml-linguistic-check` | checking whether the TEXT CONTENT was actually translated. Flags leaf-level |
| `cnxml-render-fidelity-check` | CNXML at the INJECT stage). This tool validates the RENDER stage: the |
| `docx-import` | Import human translations from Word (.docx) files into the pipeline. |
| `download-source` | Downloads a tarball of the repository, extracts module CNXML files organized |
| `exercise-assemble` | (item 9 / D3). The inject-stage counterpart for exercise content. |
| `exercise-extract` | segments (item 9 / D3). |
| `export-corpus` | Emits, per segment, the four pipeline tiers {EN, MT, faithful, localized} |
| `generate-glossary` | translated CNXML files. Produces a book-wide glossary sorted by |
| `generate-image-mapping` | translated figure files. This is the producer side of the image-localization |
| `generate-index` | translated CNXML files and organizing them alphabetically with |
| `generate-source-manifest` | the committed sha256 baseline that makes a silent 01-source swap detectable (F2) |
| `generate-tm` | Pairing + serialization live in the boundary lib so the server route |
| `inventory-math-labels` | generate (default): scan a book's 01-source math text nodes → write a ranked |
| `merge-glossary` | Three-source glossary merge tool. Combines: |
| `migrate-pipeline-status` | and populates the chapter_pipeline_status table in the database. |
| `normalize-svg-dimensions` | Make translated figure SVGs render at full figure size in the reader. |
| `preintake-probe` | Scans a candidate book's raw CNXML and prints a go/no-go fitness checklist: |
| `remt-battery` | Runs one tier of the battery over one book/chapter/module and reports every |
| `remt-ctx` | ── WHY THIS FILE IS TOP-LEVEL AND NOT IN `tools/lib/` ── |
| `remt-sweep` | Runs every registered check over the EXISTING corpus and reports, per check: |
| `render-oracle-check` | published HTML, matched 1:1 by CNXML element id. |
| `repair-emphasis` | Compares EN and IS segment files to find segments where the MT API dropped |
| `repair-invented-markers` | from an MT output file, but ONLY where the document proves them separable. |
| `resolve-embeds` | Scans a book's 01-source CNXML for <iframe src="...openstax.org/l/..."> embeds, |
| `resolve-os-embed` | Resolves <link class="os-embed" url="#exercise/{nickname}"/> references |
| `scan-residue` | Read-only EN-residue scanner. Walks a book's 02-for-mt × 02-mt-output segment |
| `source-roundtrip-check` | WHAT IT DOES. Extracts a module, injects its OWN ENGLISH straight back, and diff |
| `test-glossary-comparison` | Tests whether the server-side glossary (activated in the Málstaður web UI) |
| `test-malstadur-api` | Sends carefully crafted test strings to the Málstaður translation API and |
| `translate-chapter-titles` | Translate chapter titles for a book via the Málstaður API. |
| `validate-chapter` | Validate chapter structure and status |
| `validate-glossary` | Gate on unresolved glossary term competitions (register C18). |
| `validate-pipeline-consistency` | Pipeline Status Consistency Validator |
| `verify-extraction-coverage` | Read-only pre-freeze extraction-coverage checkpoint (campaign item 6b). |
| `verify-reextract-equivalence` | No description available |
| `verify-source-manifest` | missing manifest (F2). This is the human-facing companion to the Vitest gate. |

## Deprecated Tools

These tools are deprecated and replaced by Matecat Align in the simplified workflow.

| Tool | Description |
|------|-------------|

---

*50 tools total (50 active, 0 deprecated)*

See [cli-reference.md](../technical/cli-reference.md) for detailed usage instructions.
