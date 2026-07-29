# Archived Tools

These are one-time or superseded tools that are no longer needed in the active pipeline. Some are from the original DOCX-based (Pandoc) workflow, others are from the CNXML pipeline transition period.

## Tools

### apply-chemistry-tags.py

**Original Purpose:** Applied the "Chemistry Reader" `:::definition` / `:::practice-problem` / `:::key-concept` directives to Markdown, transforming OpenStax-style content into the tagged format an early Markdown-based reader consumed.

**Why Archived:** That directive system **predates the CNXML pipeline** — it belongs to the early experiments in publishing from Markdown with custom tags. The pipeline now renders CNXML straight to semantic HTML (`cnxml-render.js`), styled by vefur's `/styles/content.css`; nothing produces or consumes `:::` directives. Archived 2026-07-29 along with the `chemistry-reader-tags` skill, the `tag-for-publication` command, and the `content-tagger` agent.

⚠️ One consumer of the old format **survives in live server code**: `terminologyService.importFromKeyTerms` still parses `:::definition{term="…"}` out of `*-key-terms.md`, and is reachable via `POST /api/terminology/import/key-terms`. No such `.md` files exist any more, so the route imports nothing while reporting success — see the active register, item 22. Do not "restore" this tool to feed it.

### clean-markdown.js — ⚠️ DELETED, not archived

**Original Purpose:** Fixed artifacts produced by Pandoc when converting DOCX to Markdown (`\mspace`, orphan `:::` markers, escaped tildes, table border artifacts).

**Why Archived:** The CNXML pipeline does not use Pandoc. CNXML source files have semantic structure that converts cleanly.

⚠️ **This file is not in this directory.** It was removed outright in `89b86d22` *("retire old markdown pipeline, ~37,800 lines removed")*. Entry kept as a record of what existed; recover it from that commit's parent if ever needed.

### gen-college-physics-json.js · gen-organic-chemistry-json.js

**Original Purpose:** One-time scripts that generated `server/data/college-physics-2e.json` and `server/data/organic-chemistry.json`.

**Why Archived:** One-shot scaffolding — their output is committed, and book registration is now handled by the server.

### prepare-for-align.js

**Original Purpose:** Prepared markdown files for **Matecat Align**, the external alignment step that once produced the translation memory.

**Why Archived:** Matecat Align is retired. TM is generated in-house by `generate-tm.js` from the already-aligned `02-for-mt/` + `03-faithful-translation/` segment pairs.

### protect-segments-for-mt.js · unprotect-segments.js

**Original Purpose:** The legacy pipeline's steps 1b/2b — wrapped inline formatting in protective markers before MT and unwrapped them afterwards.

**Why Archived:** Superseded by the `[[type:content]]` bracket markers, which survive the Málstaður API intact (the paired `{{i}}…{{/i}}` form they protected had ~2.3% loss). See the `inline-markers` skill.

### translate-markdown.js

**Original Purpose:** Translated a whole Markdown file EN→IS via the Málstaður API, splitting by level-2 headings.

**Why Archived:** The pipeline translates **segments**, not documents — `api-translate.js` works from `02-for-mt/` and writes `02-mt-output/`, which is what keeps translations re-injectable into CNXML.

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
