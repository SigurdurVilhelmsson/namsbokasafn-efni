# Translation Workflow

This document describes the complete 8-step translation workflow from source material to published content.

## Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              TRANSLATION PIPELINE                                         │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│  PHASE 1: SOURCE             PHASE 2: MT              PHASE 3: TM BUILDING               │
│  ────────────────            ──────────              ─────────────────────               │
│                                                                                           │
│  ┌──────────────┐           ┌────────────┐          ┌────────────────────┐              │
│  │  OpenStax    │           │ malstadur  │          │      Matecat       │              │
│  │  .docx       │──strip───▶│  .txt MT   │──align──▶│  Build Initial TM  │              │
│  │  (formatted) │           │            │          │                    │              │
│  └──────────────┘           └────────────┘          └────────────────────┘              │
│        │                                                     │                           │
│        │                                                     ▼                           │
│        │                                            ┌────────────────────┐              │
│        └────────────────────────────────────────────▶│ TM-Assisted Trans │              │
│                                                      │ (formatted .docx) │              │
│                                                      └────────────────────┘              │
│                                                               │                          │
├───────────────────────────────────────────────────────────────┼──────────────────────────┤
│                                                               │                          │
│  PHASE 4: EDITORIAL PASS 1                                    │                          │
│  ─────────────────────────                                    │                          │
│                                                               ▼                          │
│                                                      ┌────────────────────┐              │
│                                                      │  Linguistic Review │              │
│                                                      │  (Word, track chg) │              │
│                                                      └────────────────────┘              │
│                                                               │                          │
│                             ┌─────────────────────────────────┼─────────────────┐        │
│                             │                                 │                 │        │
│                             ▼                                 ▼                 │        │
│                    ┌────────────────┐               ┌─────────────────┐        │        │
│                    │ FAITHFUL TRANS │               │   Update TM     │        │        │
│                    │  (03-faithful) │               │ Human-verified  │        │        │
│                    │    ★ SAVE ★    │               │    ★ SAVE ★     │        │        │
│                    └────────────────┘               └─────────────────┘        │        │
│                                                               │                 │        │
├───────────────────────────────────────────────────────────────┼─────────────────┼────────┤
│                                                               │                 │        │
│  PHASE 5: EDITORIAL PASS 2                                    │                 │        │
│  ─────────────────────────                                    │                 │        │
│                                                               ▼                 │        │
│                                                      ┌────────────────────┐     │        │
│                                                      │   Localization     │     │        │
│                                                      │ • SI units         │◀────┘        │
│                                                      │ • Icelandic context│              │
│                                                      │ • Extended exercises│              │
│                                                      └────────────────────┘              │
│                                                               │                          │
│                             ┌─────────────────────────────────┤                          │
│                             ▼                                 ▼                          │
│                    ┌────────────────┐               ┌─────────────────┐                 │
│                    │ LOCALIZED VERS │               │ Localization Log│                 │
│                    │ (04-localized) │               │  Document all   │                 │
│                    │    ★ SAVE ★    │               │    changes      │                 │
│                    └────────────────┘               └─────────────────┘                 │
│                             │                                                            │
├─────────────────────────────┼────────────────────────────────────────────────────────────┤
│                             │                                                            │
│  PHASE 6: PUBLICATION       │                                                            │
│  ────────────────────       ▼                                                            │
│                    ┌────────────────┐         ┌─────────────────┐                       │
│                    │ Convert to .md │────────▶│  Publication    │                       │
│                    │ Add frontmatter│         │ (05-publication)│                       │
│                    └────────────────┘         └─────────────────┘                       │
│                                                       │                                  │
│                                                       ▼                                  │
│                                               ┌─────────────────┐                       │
│                                               │   Deploy to     │                       │
│                                               │   efnafraedi.app│                       │
│                                               └─────────────────┘                       │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## The 8 Steps in Detail

### Step 1: Source Preparation

**Goal:** Obtain and prepare source material from OpenStax

**Process:**
1. Download .docx files from [OpenStax](https://openstax.org/)
   - These contain full formatting, equations, and images
   - Organized by chapter/section
2. Strip formatting to plain .txt for machine translation
   - Use `tools/strip-docx-to-txt.js`
   - MT services work better with plain text
3. (Optional) Download high-res editable images (PDF) for figures with text

**Save to:**
- `01-source/docx/ch##/` - Original formatted .docx files
- `01-source/txt/` - Stripped plain text
- `01-source/images-editable/` - Editable figure PDFs

**Tools:** OpenStax website, strip-docx-to-txt.js

---

### Step 2: Machine Translation

**Goal:** Get initial machine translation of plain text

**Process:**
1. Upload .txt files to [malstadur.is](https://malstadur.is)
   - Miðeind's Icelandic machine translation engine
   - Optimized for Icelandic language
2. Download translated output as .docx

**Save to:**
- `02-mt-output/docx/` - Machine translation output (reference only)

**Tools:** malstadur.is

**Note:** This output is for reference and TM building only. It is NOT the final translation.

---

### Step 3: Translation Memory Alignment

**Goal:** Build initial Translation Memory by aligning source and MT output

**Process:**
1. Upload original .docx + MT .docx to [Matecat](https://matecat.com)
2. Use Matecat's alignment feature to match segments
3. Review alignment for major errors
4. Export initial TM as .tmx file

**Save to:**
- `tm/` - Initial .tmx file

**Tools:** Matecat

**Why this step matters:** The aligned TM will be used to translate the formatted document while preserving layout.

---

### Step 4: TM-Assisted Translation (1st Matecat Run)

**Goal:** Translate the formatted .docx using TM, preserving formatting

**Process:**
1. Upload original formatted .docx to Matecat
2. Load the TM from Step 3
3. TM pre-populates translations for each segment
4. Fix obvious terminology errors only (don't perfect the language yet)
5. Export .docx (formatting preserved)

**Save to:**
- Working draft only - not permanently saved (will be replaced after editorial)

**Tools:** Matecat

**Note:** This is a working draft. The real quality work happens in editorial passes.

---

### Step 5: Editorial Pass 1 - Linguistic Review

**Goal:** Human editor reviews for language quality → produces FAITHFUL TRANSLATION

**Focus Areas:**
- Grammar and spelling
- Natural Icelandic phrasing
- Sentence flow and readability
- Terminology consistency (check glossary)
- Technical accuracy preserved

**What NOT to do:**
- NO localization (keep imperial units, American examples, etc.)
- NO adding content
- Focus only on making the translation faithful and well-written

**Process:**
1. Editor receives .docx from Step 4
2. Enable Track Changes in Microsoft Word
3. Review each section systematically
4. Use comments for questions or unclear passages
5. Note terminology decisions

**Save to:**
- `03-faithful/docx/ch##/` - Faithful translation .docx ★ VALUABLE ASSET ★
- `03-faithful/markdown/` - Converted to .md for easy reading

**Tools:** Microsoft Word (with Track Changes)

**Deliverable:** Human-verified faithful translation that accurately represents the source in natural Icelandic.

---

### Step 6: Update Translation Memory

**Goal:** Incorporate Pass 1 edits back into TM → produces HUMAN-VERIFIED TM

**Process:**
1. Review editor's changes in Matecat
2. Accept approved changes into TM
3. Discuss and resolve any flagged terminology
4. Export updated .tmx file

**Save to:**
- `tm/` - Updated .tmx file ★ VALUABLE ASSET ★
- `tm/exports/` - Parallel corpus exports (.txt files)

**Tools:** Matecat

**Why this matters:** The TM is now human-verified, not just MT output. This is valuable for:
- Training other MT systems
- Training Icelandic LLMs
- Future translation projects

---

### Step 7: Editorial Pass 2 - Localization

**Goal:** Adapt content for Icelandic context → produces LOCALIZED VERSION

**Changes to make:**
- **Unit conversions:** Imperial → SI (miles → km, °F → °C, pounds → kg)
- **Cultural adaptations:** American references → Icelandic equivalents
- **Local context:** Add geothermal, fishing industry, Icelandic geography examples
- **Extended exercises:** Add practice problems where beneficial
- **Icelandic examples:** Replace irrelevant examples with locally relevant ones

**Process:**
1. Start from faithful translation (.docx from 03-faithful/)
2. Create localization log from template
3. Make localization changes
4. Document EVERY change in the localization log
5. Ensure scientific accuracy is maintained

**Save to:**
- `04-localized/docx/ch##/` - Localized .docx files ★ VALUABLE ASSET ★
- `04-localized/localization-logs/` - Documentation of all changes

**Tools:** Microsoft Word, localization-log template

**Deliverable:** Localized version adapted for Icelandic secondary school students, with full documentation of changes.

---

### Step 8: Conversion & Publication

**Goal:** Prepare and publish web-ready content

Publication supports multiple version tracks, allowing early MT previews while editorial review continues:

#### Publication Versions

| Version | Source | Quality | Use Case |
|---------|--------|---------|----------|
| `mt-preview` | `02-mt-output/` | Unreviewed MT | Early student access |
| `faithful` | `03-faithful/` | Pass 1 reviewed | Production content |
| `localized` | `04-localized/` | Pass 2 complete | Full localization (future) |

#### Process

**For MT Preview (immediate publication):**
1. Convert MT output from `02-mt-output/` to Markdown
2. Add frontmatter with `version: mt-preview`
3. Save to `05-publication/mt-preview/chapters/ch##/`
4. Update `05-publication/mt-preview/toc.json`

**For Faithful Translation (after Pass 1):**
1. Convert reviewed content from `03-faithful/` to Markdown
2. Add frontmatter with `version: faithful`
3. Save to `05-publication/faithful/chapters/ch##/`
4. Update `05-publication/faithful/toc.json`

**Tools:** docx-to-md.js, add-frontmatter.js, web deployment

**Save to:**
```
05-publication/
├── mt-preview/          # MT versions for immediate use
│   ├── chapters/ch##/
│   └── toc.json
├── faithful/            # Human-reviewed versions
│   ├── chapters/ch##/
│   └── toc.json
├── toc.json             # Index of available versions
└── glossary.json        # Shared terminology
```

**Published at:** [efnafraedi.app](https://efnafraedi.app) (námsbókasafn.is væntanlegt)

**Reader behavior:** The reader website defaults to highest quality version available, with option to switch versions.

---

## Folder Summary

| Folder | Contents | Format | When Created |
|--------|----------|--------|--------------|
| `01-source/docx/` | Original OpenStax files | .docx | Step 1 |
| `01-source/txt/` | Stripped plain text | .txt | Step 1 |
| `01-source/images-editable/` | High-res figures | .pdf | Step 1 |
| `02-mt-output/docx/` | malstadur.is output | .docx | Step 2 |
| `03-faithful/docx/` | Faithful translation | .docx | Step 5 ★ |
| `03-faithful/markdown/` | Faithful in markdown | .md | Step 5 |
| `04-localized/docx/` | Localized translation | .docx | Step 7 ★ |
| `04-localized/localization-logs/` | Change documentation | .md | Step 7 |
| `05-publication/mt-preview/` | MT preview content | .md | Step 8 |
| `05-publication/faithful/` | Reviewed content | .md | Step 8 |
| `tm/` | Translation memory | .tmx | Steps 3, 6 ★ |
| `tm/exports/` | Parallel corpus | .txt | Step 6 |
| `glossary/` | Terminology | .csv | Ongoing |

★ = Valuable preserved asset

---

## Tools Reference

| Tool | Purpose | Website | Used In |
|------|---------|---------|---------|
| malstadur.is | Icelandic MT engine | https://malstadur.is | Step 2 |
| Matecat | CAT tool, TM management | https://matecat.com | Steps 3, 4, 6 |
| Microsoft Word | Editorial review | - | Steps 5, 7 |
| Typora | Markdown editing | https://typora.io | Step 8 |
| strip-docx-to-txt.js | Extract plain text | Local tool | Step 1 |
| docx-to-md.js | Convert to Markdown | Local tool | Step 8 |
| add-frontmatter.js | Add metadata | Local tool | Step 8 |

---

## Quality Checkpoints

### After Step 5 (Faithful Translation)
- [ ] All sections translated
- [ ] Grammar and spelling correct
- [ ] Terminology consistent with glossary
- [ ] Technical accuracy preserved
- [ ] Natural Icelandic phrasing
- [ ] No localization changes (still faithful to source)

### After Step 6 (TM Update)
- [ ] All editor changes incorporated
- [ ] TM exported and saved
- [ ] Terminology questions resolved

### After Step 7 (Localization)
- [ ] All units converted to SI
- [ ] Cultural references adapted
- [ ] Localization log complete
- [ ] Scientific accuracy maintained
- [ ] Extended exercises added where beneficial

### After Step 8 (Publication)

**For MT Preview:**
- [ ] Markdown renders correctly
- [ ] Frontmatter includes `version: mt-preview`
- [ ] Images display properly
- [ ] Equations render correctly
- [ ] `mt-preview/toc.json` updated
- [ ] Deployed to web with version indicator

**For Faithful Version:**
- [ ] Markdown renders correctly
- [ ] Frontmatter includes `version: faithful`
- [ ] Images display properly
- [ ] Equations render correctly
- [ ] `faithful/toc.json` updated
- [ ] Glossary updated
- [ ] Deployed to web

---

## Web Automation (Pipeline Server)

The translation pipeline can be automated using the web-based Pipeline Server. This provides:

- **Guided Workflows**: Step-by-step wizard through the 8-step process
- **Issue Tracking**: Automatic classification and routing of translation issues
- **Image Management**: Track which figures need translation
- **Content Sync**: Create pull requests to merge approved content

### Starting the Server

```bash
cd server
npm install
cp .env.example .env  # Configure GitHub OAuth
npm start
```

Access the web interface at http://localhost:3000/workflow

### Web Interface Pages

| URL | Description |
|-----|-------------|
| `/workflow` | Multi-step workflow wizard |
| `/issues` | Issue review dashboard |
| `/images` | Image translation tracker |
| `/status` | Pipeline status overview |

See [server/README.md](../../server/README.md) for full API documentation.

---

## CNXML-Based Pipeline (Recommended)

For new chapters, we recommend the CNXML-based pipeline which provides better structure preservation.

### Why CNXML?

| Aspect | DOCX Source | CNXML Source |
|--------|-------------|--------------|
| Structure | Formatting may vary | Semantic XML with explicit sections |
| Equations | Often lost or corrupted | Preserved as MathML → LaTeX |
| Paragraphs | Line-based, ambiguous | Explicit `<para>` tags |
| Notes/Examples | Plain text | Tagged with `<note>`, `<example>` |
| Figures | Embedded images | Metadata + captions preserved |

### CNXML Pipeline Steps

```
┌─────────────────┐
│ OpenStax GitHub │
│   (CNXML)       │
└────────┬────────┘
         │ cnxml-to-md.js
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Markdown +      │     │ equations.json   │
│ [[EQ:n]] refs   │     │ (LaTeX mappings) │
└────────┬────────┘     └──────────────────┘
         │ md-to-xliff.js
         ▼
┌─────────────────┐
│ XLIFF           │──▶ Upload to Matecat
│ (bilingual)     │
└────────┬────────┘
         │ (after MT + review)
         ▼
┌─────────────────┐
│ Reviewed XLIFF  │──▶ Export from Matecat
│ + TMX           │
└────────┬────────┘
         │ xliff-to-md.js
         ▼
┌─────────────────┐
│ Final Icelandic │
│ Markdown        │
└─────────────────┘
```

### Directory Structure for CNXML Workflow

```
books/{book}/
├── 02-for-mt/              # CNXML-based English markdown
│   └── ch{NN}/
│       ├── {N}-{N}.en.md           # English markdown for MT
│       ├── {N}-{N}-equations.json  # LaTeX equations
│       └── {N}-{N}.en.xliff        # Bilingual XLIFF
├── 02-mt-output/
│   ├── docx/               # Legacy: DOCX-based MT output
│   └── xliff/              # XLIFF with IS translations
└── 03-faithful/
    └── xliff/              # Matecat-reviewed XLIFF
```

### CLI Tools

| Tool | Purpose | Command |
|------|---------|---------|
| `pipeline-runner.js` | Complete pipeline | `node tools/pipeline-runner.js m68724 --output-dir books/efnafraedi/02-for-mt/ch05` |
| `cnxml-to-md.js` | CNXML → Markdown | `node tools/cnxml-to-md.js m68724 --output file.md` |
| `md-to-xliff.js` | Markdown → XLIFF | `node tools/md-to-xliff.js file.md --output file.xliff` |
| `xliff-to-md.js` | XLIFF → Markdown | `node tools/xliff-to-md.js file.xliff --output file.is.md` |

### Module IDs (Chemistry 2e)

Chapters 1-5 module IDs are mapped in the tools. List all known modules:

```bash
node tools/pipeline-runner.js --list-modules
```

### Workflow Example

Process Chapter 5 Section 5.1:

```bash
# Step 1: Generate English markdown + XLIFF from CNXML
node tools/pipeline-runner.js m68724 --output-dir books/efnafraedi/02-for-mt/ch05

# Output:
#   5-1.en.md           → Send to malstadur.is for MT
#   5-1-equations.json  → Keep for equation restoration
#   5-1.en.xliff        → Upload to Matecat

# Step 2: After MT, create bilingual XLIFF
node tools/md-to-xliff.js \
  --source books/efnafraedi/02-for-mt/ch05/5-1.en.md \
  --target books/efnafraedi/02-mt-output/ch05/5-1.is.md \
  --output books/efnafraedi/02-mt-output/xliff/ch05/5-1.xliff

# Step 3: Upload to Matecat for review
# Step 4: Export reviewed XLIFF + TMX from Matecat

# Step 5: Generate final Icelandic markdown
node tools/xliff-to-md.js \
  --input books/efnafraedi/03-faithful/xliff/ch05/5-1.xliff \
  --output books/efnafraedi/05-publication/faithful/chapters/05/5-1.is.md
```

---

## Additional Resources

- [Pass 1: Linguistic Review](../editorial/pass1-linguistic.md) - First editorial pass
- [Pass 2: Localization](../editorial/pass2-localization.md) - Second editorial pass
- [Terminology Standards](../editorial/terminology.md) - Terminology conventions
- [Contributing Guide](../contributing/getting-started.md) - How to participate
- [Pipeline Server](../../server/README.md) - Web automation server documentation
