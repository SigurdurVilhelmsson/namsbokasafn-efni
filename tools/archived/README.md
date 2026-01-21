# Archived Tools

These tools were created for the original DOCX-based (Pandoc) workflow but are no longer needed since the pipeline switched to CNXML-based conversion.

## Archived Tools

### clean-markdown.js

**Original Purpose:** Fixed artifacts produced by Pandoc when converting DOCX to Markdown:
- `\mspace{Xmu}` commands → KaTeX equivalents
- Orphan `:::` directive markers
- Escaped tildes (`\~`) meant for subscripts
- Table border artifacts (decorative horizontal rules)

**Why Archived:** The CNXML → Markdown conversion (`cnxml-to-md.js`) doesn't produce these artifacts. The CNXML source files have semantic structure that converts cleanly.

### fix-figure-captions.js

**Original Purpose:** Wrapped orphan "Mynd X.Y" figure captions into proper HTML `<figure>` elements with `<figcaption>`.

**Why Archived:** The CNXML source preserves figure structure semantically. The `cnxml-to-md.js` converter correctly associates images with their captions during conversion.

## Still-Active Post-MT Tools

The following tools are still relevant and used by `post-mt-pipeline.js`:

| Tool | Purpose |
|------|---------|
| `restore-links.js` | Converts MT-safe `[text]{url="..."}` syntax back to standard markdown links |
| `repair-directives.js` | Adds missing `:::` closing markers that MT may leave unclosed |

## Date Archived

2026-01-21

## Restoration

If you need these tools for legacy DOCX processing, they can be moved back to `tools/` and should work as originally designed.
