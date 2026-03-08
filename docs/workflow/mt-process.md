# Machine Translation Process Guide

This document covers the full MT workflow using malstadur.is (Erlendur), including both available methods, troubleshooting, and how the pipeline GUI automates key steps.

## Prerequisites

Before starting MT for a chapter:

1. **Book registered** in the pipeline (appears in the book selector)
2. **CNXML source extracted** — Step 1a complete (`02-for-mt/` and `02-structure/` populated)
3. **EN segments protected** — Step 1b complete (files have `{{SEG:...}}` markers instead of `<!-- SEG:... -->`)

Steps 1a and 1b are handled automatically by the pipeline GUI's **"↓ Sækja EN"** button.

---

## Method 1: File Upload/Download (Preferred)

This is the standard method when using the pipeline GUI. The protect step runs automatically.

### Download EN files

1. Open the pipeline UI and select the book and chapter
2. Click **"↓ Sækja EN"**
   - This auto-runs extraction (if needed) and protection
   - Downloads a ZIP containing protected `.en.md` files with `{{SEG:...}}` markers
3. Extract the ZIP to a local folder

**Safety checks:** The server verifies files are protected before allowing download. If files contain `<!-- SEG:... -->` instead of `{{SEG:...}}`, the download is rejected with a 409 error and an Icelandic warning message.

### Translate via malstadur.is

1. Go to [malstadur.is](https://malstadur.is)
2. Upload the `.en.md` file(s)
3. Wait for translation to complete
4. Download the translated `.is.md` files

**Important:** Rename downloaded files if needed so they match the expected pattern: `m{NNNNN}-segments.is.md` (same base name as the EN file, with `.is.md` extension).

### Upload IS files

1. In the pipeline UI, click **"↑ Hlaða upp IS"**
2. Select the translated `.is.md` files
3. The pipeline:
   - Validates uploaded files have segment markers (warns if missing)
   - Saves files to `02-mt-output/ch{NN}/`
   - Auto-runs the unprotect step (converts `{{SEG:...}}` → `<!-- SEG:... -->`, restores links)
   - Advances the chapter status

---

## Method 2: Copy/Paste (Fallback)

Use this when file upload/download doesn't preserve markers, or when translating individual modules.

Both `<!-- SEG:... -->` and `{{SEG:...}}` marker formats survive copy/paste in malstadur.is.

### Process

1. Open the EN segment file (from `02-for-mt/`) in a text editor
2. Copy the entire file content
3. Paste into malstadur.is translation editor
4. Copy the translated Icelandic output
5. Create a new file in a text editor (e.g., Typora, VS Code)
6. Paste the translated content
7. Save as `m{NNNNN}-segments.is.md` in `02-mt-output/ch{NN}/`

### After copy/paste

If the pasted files have `{{SEG:...}}` markers (from protected files), run unprotect:

```bash
node tools/unprotect-segments.js --chapter {N} --verbose
```

If they have `<!-- SEG:... -->` markers (from unprotected files), no unprotect is needed — they're already in the format the pipeline expects.

---

## What the Protect Step Does

The protect step (`protect-segments-for-mt.js`) transforms EN segment files for safe passage through the MT service:

| Before (unprotected) | After (protected) | Why |
|----------------------|-------------------|-----|
| `<!-- SEG:m68724:para:1 -->` | `{{SEG:m68724:para:1}}` | Erlendur strips HTML comments |
| `[text](url)` | `{{LINK:N}}text{{/LINK}}` | Erlendur strips markdown link URLs |
| `[#ref-id]` | `{{XREF:N}}` | Cross-references are preserved |

It also splits files exceeding 12K visible characters into parts: `(a)`, `(b)`, etc.

The unprotect step (`unprotect-segments.js`) reverses all of these transformations.

---

## Re-extraction and Status Reset

When extraction is re-run for a chapter (e.g., after source CNXML updates):

1. New unprotected files are written to `02-for-mt/` with `<!-- SEG:... -->` markers
2. The pipeline automatically resets the `mtReady` status
3. Next time **"↓ Sækja EN"** is clicked, the protect step re-runs automatically

This prevents the stale-status bug where the GUI thought files were protected when they weren't.

---

## Troubleshooting

### Translations don't appear in the segment editor

**Symptom:** You uploaded IS files but the segment editor shows no translations.

**Likely cause:** Files are missing segment markers (`<!-- SEG:... -->` or `{{SEG:...}}`).

**Fix:**
1. Check one of the uploaded files in `02-mt-output/` — look for `<!-- SEG:` markers
2. If markers are missing, the MT service stripped them during file upload/download
3. Re-translate using copy/paste method (Method 2), which preserves markers

### Download gives "Skrár eru ekki verndaðar" error

**Symptom:** Clicking "↓ Sækja EN" shows an error about unprotected files.

**Cause:** Files in `02-for-mt/` have `<!-- SEG:... -->` instead of `{{SEG:...}}`. The protect step either didn't run or failed.

**Fix:**
1. Check if `mtReady` shows as complete in the chapter status
2. If not, the protect step should run automatically — try clicking "↓ Sækja EN" again
3. If it still fails, run protect manually:
   ```bash
   node tools/protect-segments-for-mt.js --batch books/{book}/02-for-mt/ch{NN}/
   ```

### Upload warns about missing markers

**Symptom:** After uploading IS files, you see a warning about missing segment markers.

**Cause:** The MT service stripped the markers from the downloaded files.

**Fix:** Use the copy/paste method (Method 2) instead. Copy/paste preserves both marker formats.

### Split files not merging

**Symptom:** After unprotect, you still see `(a)`, `(b)` files in `02-mt-output/`.

**Fix:** Run unprotect with verbose mode to see what's happening:
```bash
node tools/unprotect-segments.js --chapter {N} --verbose
```

The unprotect step should merge split files automatically. If it doesn't find matching parts, check that all translated parts were uploaded.

---

## Pipeline GUI vs CLI Summary

| Action | GUI (pipeline UI) | CLI |
|--------|-------------------|-----|
| Extract + Protect + Download | "↓ Sækja EN" button | `cnxml-extract.js` then `protect-segments-for-mt.js` |
| Upload + Unprotect | "↑ Hlaða upp IS" button | Copy to `02-mt-output/` then `unprotect-segments.js` |
| Check protection status | Chapter status panel | Inspect files for `{{SEG:` vs `<!-- SEG:` |

---

## See Also

- [Simplified Workflow](simplified-workflow.md) — full pipeline overview
- [Leiðbeiningar um vélþýðingu](../guides/mt-guide-for-editors.md) — Icelandic guide for editors
