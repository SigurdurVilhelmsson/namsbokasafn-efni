# Archived Tools

These are one-time or superseded tools that are no longer needed in the active pipeline. Some are from the original DOCX-based (Pandoc) workflow, others are from the CNXML pipeline transition period.

## Tools

### clean-markdown.js

**Original Purpose:** Fixed artifacts produced by Pandoc when converting DOCX to Markdown (`\mspace`, orphan `:::` markers, escaped tildes, table border artifacts).

**Why Archived:** The CNXML pipeline does not use Pandoc. CNXML source files have semantic structure that converts cleanly.

### compare-markers.js

**Original Purpose:** Compared segment markers between files to detect discrepancies introduced during machine translation.

**Why Archived:** Superseded by the CNXML extract-inject pipeline, which tracks segments via structure JSON files.

### fix-figure-captions.js

**Original Purpose:** Wrapped orphan "Mynd X.Y" figure captions into proper HTML `<figure>` elements with `<figcaption>`.

**Why Archived:** The CNXML source preserves figure structure semantically. The pipeline correctly associates images with their captions.

### gen-microbiology-json.js

**Original Purpose:** One-time tool to generate the `server/data/microbiology.json` chapter/module mapping file for the microbiology book.

**Why Archived:** The JSON file has been generated and is maintained manually.

### init-faithful-review.js

**Original Purpose:** Initialized faithful review files in `03-faithful-translation/` by copying MT output as a starting point for human review.

**Why Archived:** Superseded by the segment editor web interface, which handles initialization and review workflow.

### join-mt-output.js

**Original Purpose:** Joined split MT output files back into single per-module segment files after machine translation.

**Why Archived:** MT output handling was consolidated during the pipeline cleanup (Phase 13).

### migrate-status-schema.js

**Original Purpose:** One-time migration tool to convert chapter status files from the old schema format to the Phase 11 schema (8 pipeline stages with binary status).

**Why Archived:** Migration has been applied to all chapters. Status is now managed by the unified `chapter_pipeline_status` database table.

### repair-mt-document-links.js

**Original Purpose:** Fixed document cross-reference links in MT output that were broken during machine translation.

**Why Archived:** The CNXML inject pipeline handles cross-references at the CNXML level, making post-MT link repair unnecessary.

### restore-segments-from-mt.js

**Original Purpose:** Restored segment files from MT backup when the primary MT output was corrupted or lost.

**Why Archived:** MT output is now stable in `02-mt-output/` (read-only) and does not need restoration.

## Date Archived

January-February 2026

## Restoration

If you need any of these tools, they can be moved back to `tools/` and should work as originally designed. Check for any dependency changes since archival.
