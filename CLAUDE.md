# Claude Code Instructions for namsbokasafn-efni

## Purpose

Translation workflow for Icelandic OpenStax textbooks. Produces three assets:
1. **Faithful translations** (03-faithful/) - human-verified, academically citable
2. **Translation memory** (tm/) - human-verified EN↔IS parallel corpus
3. **Localized content** (04-localized/, 05-publication/) - adapted for Icelandic students

## Directory Structure

```
books/{book}/
├── 01-source/          # 🔒 READ ONLY - OpenStax CNXML originals
├── 02-for-mt/          # EN markdown for machine translation
│   └── ch{NN}/         #   {N}-{N}.en.md, {N}-{N}-equations.json
├── 02-mt-output/       # 🔒 READ ONLY - IS markdown from MT
├── 03-faithful/        # ✏️ Reviewed IS markdown (faithful translation)
├── 04-localized/       # ✏️ Pass 2 output (localized version)
├── 05-publication/     # ✏️ Web-ready markdown
│   ├── mt-preview/     #    MT versions for immediate use
│   └── faithful/       #    Human-reviewed versions
├── for-align/          # Staging for Matecat Align
├── tm/                 # 🔒 READ ONLY - TMX from Matecat Align
├── glossary/           # Terminology files
└── chapters/ch{NN}/    # Status tracking (status.json)

tools/                  # CLI tools for pipeline processing
server/                 # Web workflow interface
docs/                   # Documentation (see below)
```

## File Permissions

| Permission | Folders | Rule |
|------------|---------|------|
| 🔒 READ ONLY | `01-source/`, `02-mt-output/`, `tm/` | Never modify |
| ✏️ WRITE | `03-faithful/`, `04-localized/`, `05-publication/` | Backup before editing |

**Before modifying files:** Create backup `{filename}.{YYYY-MM-DD-HHMM}.bak`

## 5-Step Simplified Workflow

```
CNXML → EN Markdown → MT → Linguistic Review → Matecat Align → Publication
```

| Step | What | Tool/Service | Output |
|------|------|--------------|--------|
| 1 | CNXML → EN markdown | `pipeline-runner.js` | `02-for-mt/` |
| 2 | Machine translation | malstadur.is | `02-mt-output/` |
| 3 | Linguistic review | Manual editing | `03-faithful/` ★ |
| 4 | TM creation | `prepare-for-align.js` + Matecat Align | `tm/` ★ |
| 5 | Publication | `add-frontmatter.js` | `05-publication/` |

★ = Human-verified asset

**Key insight:** Review BEFORE TM creation, so TM is human-verified quality.

See [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) for full instructions.

## Commands

| Command | Purpose |
|---------|---------|
| `/pipeline-status` | Overview of all chapters |
| `/chapter-status <book> <ch>` | Specific chapter progress |
| `/review-chapter <book> <ch>` | Pass 1 linguistic review |
| `/localize-chapter <book> <ch>` | Pass 2 localization |
| `/check-terminology <book> <ch>` | Verify terminology |

## Skills (Auto-loaded)

| Skill | Triggers When |
|-------|---------------|
| `editorial-pass1` | Working on `03-faithful/`, grammar review |
| `localization` | Working on `04-localized/`, unit conversions |
| `chemistry-reader-tags` | Working on `05-publication/`, tagging content |
| `workflow-status` | Discussing chapter progress |
| `repo-structure` | Creating or moving files |
| `review-protocol` | Discussing reviews or approvals |
| `activity-logging` | File operations requiring logging |

Skills are in `.claude/skills/` and provide domain-specific guidance.

## Status Updates

```bash
npm run update-status <book> <chapter> <stage> <status>
npm run validate
```

**Stages (simplified workflow):**
- `enMarkdown` - Step 1: EN markdown generated
- `mtOutput` - Step 2: MT output received
- `linguisticReview` - Step 3: Faithful translation complete
- `tmCreated` - Step 4: TM created via Matecat Align
- `publication` - Step 5: Published

**Statuses:** `complete`, `in-progress`, `pending`, `not-started`

## Human Review Required

All AI suggestions require human approval before:
- Advancing workflow stages
- Committing terminology changes
- Publishing content

## Two-Repository Workflow

| Problem Type | Fix In |
|--------------|--------|
| Content issues | **HERE** (namsbokasafn-efni) |
| Rendering bugs | namsbokasafn-vefur |

**Sync command** (run in namsbokasafn-vefur):
```bash
node scripts/sync-content.js --source ../namsbokasafn-efni
```

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) | **5-step workflow (recommended)** |
| [docs/workflow/overview.md](docs/workflow/overview.md) | Legacy 8-step pipeline reference |
| [docs/editorial/pass1-linguistic.md](docs/editorial/pass1-linguistic.md) | Pass 1 instructions |
| [docs/editorial/pass2-localization.md](docs/editorial/pass2-localization.md) | Pass 2 instructions |
| [docs/editorial/terminology.md](docs/editorial/terminology.md) | Terminology standards |
| [docs/technical/cli-reference.md](docs/technical/cli-reference.md) | CLI tools reference |
| [ROADMAP.md](ROADMAP.md) | Development status |

## Current Priority

**Pilot at Fjölbrautaskólinn við Ármúla, January 2026**

Focus: Chapters 1-4 with MT preview published, Pass 1 review in progress.
