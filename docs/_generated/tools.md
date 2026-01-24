# CLI Tools

*Auto-generated from tools/ directory*

## Core Tools (Simplified Workflow)

| Tool | Description | Step |
|------|-------------|------|
| `add-frontmatter` | Adds or updates YAML frontmatter in Markdown files for the Chemistry Reader | 5 |
| `cnxml-to-md` | Convert CNXML to Markdown with equation placeholders | 1 |
| `pipeline-runner` | Full CNXML → Markdown pipeline with equation extraction | 1 |
| `prepare-for-align` | Prepare markdown files for Matecat Align | 4 |
| `split-for-erlendur` | Split files at 18k characters for Erlendur MT | 1 |

## Utility Tools

| Tool | Description |
|------|-------------|
| `apply-equations` | Restore LaTeX equations from JSON mapping file |
| `chapter-assembler` | Assembles 7 module files into 12 publication files for the Chemistry Reader webs |
| `cnxml-math-extract` | Extract MathML equations from CNXML and convert to LaTeX |
| `compile-chapter` | Compiles chapter content for web publication by: |
| `docx-to-md` | Convert DOCX files to Markdown format |
| `export-parallel-corpus` | Export Translation Memory to parallel text files |
| `generate-glossary` | 1. Extracting English terms + definitions from CNXML <glossary> elements |
| `patch-alt-text` | Patches missing alt text in publication files using alt text from MT output. |
| `post-mt-pipeline` | Chains post-MT cleanup tools to process translated markdown files. |
| `process-chapter` | Full chapter processing pipeline |
| `protect-for-mt` | Pre-MT protection script that extracts frontmatter and tables before |
| `repair-directives` | Fix directive syntax issues in markdown |
| `replace-math-images` | Replace equation images with LaTeX code |
| `restore-images` | Post-MT processing script that reconstructs image markdown from attribute blocks |
| `restore-links` | Post-MT processing script that restores markdown links from MT-safe syntax. |
| `restore-tables` | Post-MT processing script that restores tables from sidecar JSON files. |
| `strip-docx-to-txt` | Extract plain text from DOCX files |
| `validate-chapter` | Validate chapter structure and status |

## Deprecated Tools

These tools are deprecated and replaced by Matecat Align in the simplified workflow.

| Tool | Description |
|------|-------------|
| `cnxml-to-xliff` | Convert CNXML to XLIFF format (DEPRECATED) |
| `create-bilingual-xliff` | Create bilingual XLIFF from EN/IS pairs (DEPRECATED) |
| `md-to-xliff` | Convert Markdown to XLIFF format (DEPRECATED) |
| `xliff-to-md` | Convert XLIFF back to Markdown (DEPRECATED) |
| `xliff-to-tmx` | Convert XLIFF to TMX format (DEPRECATED) |

---

*28 tools total (23 active, 5 deprecated)*

See [cli-reference.md](../technical/cli-reference.md) for detailed usage instructions.
