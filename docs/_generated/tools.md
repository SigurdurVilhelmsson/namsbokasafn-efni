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
| `api-translate` | Translates English segment files to Icelandic using the Miðeind Málstaður |
| `audit-equation-notation` | Pre-publication validator that compares source equation numbers (US format) |
| `audit-equation-text` | Scan equation structure files and report untranslated English text |
| `audit-render-output` | Post-render audit: compares source CNXML against rendered HTML output |
| `auto-insert-placeholders` | Automatically insert [[MEDIA:n]] and [[TABLE:id]] placeholders into Icelandic se |
| `check-openstax-errata` | Track and manage OpenStax errata for Chemistry 2e. |
| `check-source-updates` | Compare local 01-source/ CNXML files against upstream OpenStax GitHub |
| `cnxml-fidelity-check` | Counts opening tags by element name in both source and translated CNXML |
| `cnxml-linguistic-check` | checking whether the TEXT CONTENT was actually translated. Flags leaf-level |
| `docx-import` | Import human translations from Word (.docx) files into the pipeline. |
| `download-source` | Downloads a tarball of the repository, extracts module CNXML files organized |
| `generate-glossary` | translated CNXML files. Produces a book-wide glossary sorted by |
| `generate-index` | translated CNXML files and organizing them alphabetically with |
| `generate-tm` | The EN source segments (02-for-mt/) and the human-reviewed IS segments |
| `merge-glossary` | Three-source glossary merge tool. Combines: |
| `migrate-pipeline-status` | and populates the chapter_pipeline_status table in the database. |
| `repair-emphasis` | Compares EN and IS segment files to find segments where the MT API dropped |
| `resolve-os-embed` | Resolves <link class="os-embed" url="#exercise/{nickname}"/> references |
| `test-glossary-comparison` | Tests whether the server-side glossary (activated in the Málstaður web UI) |
| `test-malstadur-api` | Sends carefully crafted test strings to the Málstaður translation API and |
| `translate-chapter-titles` | Translate chapter titles for a book via the Málstaður API. |
| `translate-markdown` | Splits the markdown by level-2 headings, translates each section, |
| `validate-chapter` | Validate chapter structure and status |
| `validate-pipeline-consistency` | Pipeline Status Consistency Validator |

## Deprecated Tools

These tools are deprecated and replaced by Matecat Align in the simplified workflow.

| Tool | Description |
|------|-------------|

---

*27 tools total (27 active, 0 deprecated)*

See [cli-reference.md](../technical/cli-reference.md) for detailed usage instructions.
