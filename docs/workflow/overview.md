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

## Simplified Workflow (Recommended)

**For new chapters, use the [Simplified 5-Step Workflow](simplified-workflow.md)** which eliminates XLIFF generation and lets Matecat Align handle segmentation.

### Why Simplified?

The older workflow had 12+ steps with multiple format conversions. The new workflow:

- Does linguistic review BEFORE TM creation (TM is human-verified from the start)
- Uses Matecat Align for TM creation (no XLIFF needed)
- Reduces complexity from 12+ steps to 5

### Quick Overview

```
CNXML → EN Markdown → MT → Linguistic Review → Matecat Align → Publication
```

| Step | Tool/Service | Output |
|------|--------------|--------|
| 1 | `pipeline-runner.js` | EN markdown + equations |
| 2 | malstadur.is | MT output |
| 3 | Manual editing | Faithful translation |
| 4 | `prepare-for-align.js` + Matecat Align | Human-verified TMX |
| 5 | `add-frontmatter.js` | Published content |

**See [simplified-workflow.md](simplified-workflow.md) for full instructions.**

### Deprecated Tools

The following tools are deprecated in favor of Matecat Align:

| Tool | Status | Reason |
|------|--------|--------|
| `create-bilingual-xliff.js` | Deprecated | Matecat Align handles segmentation |
| `md-to-xliff.js` | Deprecated | No longer generating XLIFF |
| `xliff-to-md.js` | Deprecated | No longer processing XLIFF |
| `cnxml-to-xliff.js` | Deprecated | No longer generating XLIFF |
| `xliff-to-tmx.js` | Deprecated | Matecat exports TMX directly |

---

## Additional Resources

- [Pass 1: Linguistic Review](../editorial/pass1-linguistic.md) - First editorial pass
- [Pass 2: Localization](../editorial/pass2-localization.md) - Second editorial pass
- [Terminology Standards](../editorial/terminology.md) - Terminology conventions
- [Contributing Guide](../contributing/getting-started.md) - How to participate
- [Pipeline Server](../../server/README.md) - Web automation server documentation
