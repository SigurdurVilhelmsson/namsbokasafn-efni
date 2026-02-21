# Chapter 1 CNXML Pipeline Processing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Process chapter 1 (Essential Ideas, 7 modules) through the extract-inject CNXML pipeline to produce structure files, EN segments for MT, translated CNXML, and rendered HTML for publication.

**Architecture:** The full pipeline has 7 stages:

```
extract → protect → protect-segments → [MT] → restore-segments → inject → render → resources
```

The extract stage produces structure + EN segments. Two protection stages prepare segments for MT (converting markers to MT-safe format, extracting links to sidecars). MT is a manual step (malstadur.is). After MT, a restoration stage unescapes markers and restores links. Then inject rebuilds translated CNXML, render produces HTML, and resources extracts glossary/exercises/summary.

**Tech Stack:** Node.js CLI tools, CNXML/XML processing, KaTeX for equations

**Chapter 1 modules (7 total):**

| Module ID | Section | Title |
|-----------|---------|-------|
| m68663 | intro | Introduction |
| m68664 | 1.1 | Chemistry in Context |
| m68667 | 1.2 | Phases and Classification of Matter |
| m68670 | 1.3 | Physical and Chemical Properties |
| m68674 | 1.4 | Measurements |
| m68690 | 1.5 | Measurement Uncertainty, Accuracy, and Precision |
| m68683 | 1.6 | Mathematical Treatment of Measurement Results |

---

## Phase 0: Fix module ordering bug in buildModuleSections() — DONE

### Task 0: Add sectionOrder to structure files and use it for sorting

**Status:** Complete (commit `7960977`)

**Problem:** `buildModuleSections()` sorts structure files alphabetically by filename. For ch01, m68683 (1.6) sorts before m68690 (1.5).

**Solution implemented:**
- `cnxml-extract.js` imports `getChapterModules` from `pipeline-runner.js`, builds a module order map, writes `sectionOrder` into each structure JSON
- `buildModuleSections()` reads all structure files, sorts by `sectionOrder` when present, falls back to alphabetical
- Ch05 re-extracted with `sectionOrder` values (0-3), output verified unchanged

---

## Phase 1: Extract — DONE

### Task 1: Run extract stage for chapter 1

**Status:** Complete (commit `f4f01dc`)

```bash
node tools/pipeline-runner.js --mode extract-inject --chapter 1 --book efnafraedi --stage extract --verbose
```

Output: 7 structure files + 5 equations files in `02-structure/ch01/`, 7 EN segment files in `02-for-mt/ch01/`. sectionOrder verified correct (m68690=5, m68683=6).

---

## Phase 2: Pre-MT Protection + Machine Translation

### Task 2: Protect segments for MT — DONE

**Status:** Complete (commit `b493dd5`)

**Why protection is needed:** The Erlendur MT engine (malstadur.is) strips HTML comments (`<!-- SEG:... -->`), destroying segment boundary markers. Links and cross-references are also mangled. Two protection steps convert these to MT-safe formats.

**Step 1: Protect tables/frontmatter**

```bash
node tools/protect-for-mt.js --batch books/efnafraedi/02-for-mt/ch01/ --verbose
```

Extracts tables to `*-protected.json` sidecars, replaces with `[[TABLE:N]]` placeholders. Protects directive names as `[[DIRECTIVE:name]]`. Generates `*-strings.en.md` for translatable table/figure text.

For segment files from `cnxml-extract.js`, this step typically finds nothing to protect (no tables/frontmatter/directives in segments), but it must still be run as a safeguard.

**Step 2: Protect segment markers + split by visible chars**

```bash
node tools/protect-segments-for-mt.js --batch books/efnafraedi/02-for-mt/ch01/ --verbose
```

This is the critical step. It does three things:
1. **Converts markers:** `<!-- SEG:... -->` → `{{SEG:...}}` (curly brackets survive MT with escaping)
2. **Protects links:** `[text](url)` → `{{LINK:N}}text{{/LINK}}`, `[#ref]` → `{{XREF:N}}`, with URLs stored in `*-segments-links.json`
3. **Splits by visible chars:** Files exceeding 18K *visible* characters (excluding tag sizes) are split at paragraph boundaries into `(a)`, `(b)`, etc.

**Important:** Do NOT use `split-for-erlendur.js` separately — `protect-segments-for-mt.js` handles splitting as part of protection, counting only visible characters (excluding marker overhead).

Output: 11 upload files + 6 links.json sidecars.

### Task 3: Upload to malstadur.is and save MT output

**This is a manual step — pause the pipeline here.**

**Files to upload** (11 total):

| File | Section | Visible chars |
|------|---------|---------------|
| `m68663-segments.en.md` | intro | 2K |
| `m68664-segments.en.md` | 1.1 | 17K |
| `m68667-segments.en.md` | 1.2a | 18K |
| `m68667-segments(b).en.md` | 1.2b | 11K |
| `m68670-segments.en.md` | 1.3 | 11K |
| `m68674-segments.en.md` | 1.4a | 18K |
| `m68674-segments(b).en.md` | 1.4b | 7K |
| `m68690-segments.en.md` | 1.5a | 18K |
| `m68690-segments(b).en.md` | 1.5b | 2K |
| `m68683-segments.en.md` | 1.6a | 18K |
| `m68683-segments(b).en.md` | 1.6b | 4K |

**Process:**
1. Upload each `.en.md` file to [malstadur.is](https://malstadur.is)
2. Download Icelandic translations
3. Save with matching filenames but `.is.md` extension in `books/efnafraedi/02-for-mt/ch01/`:
   - `m68663-segments.is.md`, `m68664-segments.is.md`, etc.
   - For split modules: `m68667-segments.is.md` + `m68667-segments(b).is.md`, etc.
4. **Do NOT rename or merge files** — the restore step handles merging

**What MT does to markers:**
- `{{SEG:...}}` → `\{\{SEG:...\}\}` (escaped with backslashes — this is expected)
- `{{LINK:N}}` → `\{\{LINK:N\}\}` (escaped)
- `{{XREF:N}}` → `\{\{XREF:N\}\}` (escaped)

**Commit MT output:**

```bash
git add books/efnafraedi/02-for-mt/ch01/*-segments.is.md books/efnafraedi/02-for-mt/ch01/*-segments\(b\).is.md
git commit -m "feat(content): add ch01 Icelandic MT output from malstadur.is"
```

---

## Phase 3: Post-MT Restoration + Inject + Render + Resources

### Task 4: Restore segments from MT output

**Why:** MT output has escaped markers (`\{\{SEG:...\}\}`) and placeholder links. This step unescapes them and restores links from sidecar JSON.

```bash
node tools/restore-segments-from-mt.js --batch books/efnafraedi/02-for-mt/ch01/ --verbose
```

**What it does:**
1. Unescapes `\{\{SEG:...\}\}` → `{{SEG:...}}` → `<!-- SEG:... -->`
2. Restores links from `*-segments-links.json`: `{{LINK:N}}text{{/LINK}}` → `[text](url)`
3. Restores cross-refs: `{{XREF:N}}` → `[#ref-id]`
4. Merges split files: `*-segments.is.md` + `*-segments(b).is.md` → single `*-segments.is.md`

**Verify:** Check that restored `.is.md` files have `<!-- SEG:... -->` markers (not `{{SEG:...}}`).

```bash
head -5 books/efnafraedi/02-for-mt/ch01/m68664-segments.is.md
# Should show: <!-- SEG:m68664:title:auto-1 -->
```

**Commit:**

```bash
git add books/efnafraedi/02-for-mt/ch01/*-segments.is.md
git commit -m "feat(content): restore ch01 segment markers and links from MT output"
```

### Task 5: Run inject stage

**Files:**
- Input: `books/efnafraedi/02-for-mt/ch01/*-segments.is.md` + `02-structure/ch01/`
- Output: `books/efnafraedi/03-translated/ch01/` (7 translated CNXML files)

```bash
node tools/pipeline-runner.js --mode extract-inject --chapter 1 --book efnafraedi --stage inject --verbose
```

Expected: Creates `03-translated/ch01/` with 7 `.cnxml` files.

**Verify Icelandic title:**

```bash
grep '<title>' books/efnafraedi/03-translated/ch01/m68663.cnxml
```

Expected: Icelandic title rather than "Introduction".

**Commit:**

```bash
git add books/efnafraedi/03-translated/ch01/
git commit -m "feat(content): inject ch01 Icelandic translations into CNXML"
```

### Task 6: Run render stage

**Files:**
- Input: `books/efnafraedi/03-translated/ch01/` (7 CNXML files)
- Output: `books/efnafraedi/05-publication/mt-preview/chapters/01/` (7 HTML files)

```bash
node tools/cnxml-render.js --chapter 1 --verbose
```

Expected: `1-0-introduction.html`, `1-1-*.html` through `1-6-*.html`.

**Critical:** `1-5-*` must correspond to m68690 (Measurement Uncertainty) and `1-6-*` to m68683 (Mathematical Treatment), not reversed.

**Commit:**

```bash
git add books/efnafraedi/05-publication/mt-preview/chapters/01/
git commit -m "feat(content): render ch01 translated CNXML to HTML"
```

### Task 7: Run resources stage

**Files:**
- Input: `books/efnafraedi/03-translated/ch01/` + `01-source/ch01/`
- Output: `05-publication/mt-preview/chapters/01/` (summary, glossary, exercises, equations, answer key HTML)

```bash
node tools/cnxml-extract-chapter-resources.js --book efnafraedi --chapter 1 --verbose
```

Expected: `1-summary.html`, `1-key-terms.html`, `1-key-equations.html`, `1-exercises.html`, `1-answer-key.html`.

**Commit:**

```bash
git add books/efnafraedi/05-publication/mt-preview/chapters/01/
git commit -m "feat(content): extract ch01 resources (glossary, exercises, summary)"
```

---

## Phase 4: Publish

### Task 8: Sync to vefur and verify in browser

```bash
node ../namsbokasafn-vefur/scripts/sync-content.js --source ../namsbokasafn-efni
```

**Verify in browser:**
- Navigate to `http://localhost:5173/efnafraedi/kafli/01/1-1`
- Check: page loads, Icelandic title, sidebar shows all 6 sections + intro, equations render, figures display
- Visit each section: `/1-0`, `/1-1`, `/1-2`, `/1-3`, `/1-4`, `/1-5`, `/1-6`

---

## Full Pipeline Reference

```
CNXML Source (01-source/ch01/*.cnxml)
    │
    ▼ Step 1: cnxml-extract.js --chapter 1
    │
    ├── 02-structure/ch01/*-structure.json  (document skeleton + sectionOrder)
    ├── 02-structure/ch01/*-equations.json  (MathML equations)
    └── 02-for-mt/ch01/*-segments.en.md    (segments with <!-- SEG:... --> markers)
    │
    ▼ Step 2: protect-for-mt.js --batch
    │   Extracts tables → *-protected.json, replaces with [[TABLE:N]]
    │   Extracts figure captions → *-strings.en.md
    │   (For segment files: usually a no-op, but run as safeguard)
    │
    ▼ Step 3: protect-segments-for-mt.js --batch
    │   <!-- SEG:... --> → {{SEG:...}}       (MT-safe curly brackets)
    │   [text](url)     → {{LINK:N}}...      (links to sidecar *-links.json)
    │   [#ref]          → {{XREF:N}}         (cross-refs to sidecar)
    │   Splits by visible chars (excluding tags) at paragraph boundaries
    │
    ▼ Step 4: Upload to malstadur.is (MANUAL)
    │   MT escapes markers: {{SEG:...}} → \{\{SEG:...\}\}
    │   Content translated to Icelandic
    │   Save .is.md files to 02-for-mt/ch01/
    │
    ▼ Step 5: restore-segments-from-mt.js --batch
    │   \{\{SEG:...\}\} → {{SEG:...}} → <!-- SEG:... -->  (unescape + restore)
    │   {{LINK:N}}...   → [text](url)                      (restore from sidecar)
    │   {{XREF:N}}      → [#ref-id]                        (restore from sidecar)
    │   Merges split files back into one per module
    │
    ▼ Step 6: cnxml-inject.js --chapter 1
    │   Reads .is.md segments + structure.json + equations.json + source CNXML
    │   Produces translated CNXML → 03-translated/ch01/*.cnxml
    │
    ▼ Step 7: cnxml-render.js --chapter 1
    │   Translated CNXML → semantic HTML
    │   Output → 05-publication/mt-preview/chapters/01/*.html
    │
    ▼ Step 8: cnxml-extract-chapter-resources.js --chapter 1
    │   Extracts glossary, key equations, summary, exercises, answer key
    │   Output → 05-publication/mt-preview/chapters/01/1-*.html
    │
    ▼ Step 9: sync-content.js (in vefur repo)
        Syncs to web app, regenerates toc.json
```

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| Curly brackets `{{ }}` for MT-safe markers | HTML comments `<!-- -->` are stripped by Erlendur; curly brackets survive (with escaping) |
| Protect before split | Segment markers must be protected BEFORE splitting so each part retains markers |
| Visible character counting | Excludes tag overhead from 18K limit; prevents exceeding Erlendur's 20K hard limit |
| Sidecar JSON for links | URLs can't survive MT intact; stored separately and restored post-MT |
| `sectionOrder` in structure files | Module IDs don't always sort alphabetically in section order (ch01: m68683=1.6 < m68690=1.5) |

## Key Risks

- **Blocking dependency:** Phase 3 cannot start until MT output (Phase 2, manual) is complete.
- **Chapter 1 is larger than ch05:** 7 modules vs 4, ~240KB CNXML. 1,110 segments, 150 equations.
- **cnxml-render.js hardcodes `'efnafraedi'`:** Fine for now since that's the only book.
