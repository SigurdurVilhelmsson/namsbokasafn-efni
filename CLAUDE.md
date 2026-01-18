# Claude Code Instructions for namsbokasafn-efni

## Purpose

Translation workflow for Icelandic OpenStax textbooks. Produces three assets:
1. **Faithful translations** (03-faithful/) - human-verified, academically citable
2. **Translation memory** (tm/) - human-verified EN↔IS parallel corpus
3. **Localized content** (04-localized/, 05-publication/) - adapted for Icelandic students

## Directory Structure

```
books/{book}/
├── 01-source/          # 🔒 READ ONLY - OpenStax originals
├── 02-mt-output/       # 🔒 READ ONLY - Machine translation
├── 03-faithful/        # ✏️ Pass 1 output (faithful translation)
├── 04-localized/       # ✏️ Pass 2 output (localized version)
├── 05-publication/     # ✏️ Web-ready markdown
│   ├── mt-preview/     #    MT versions for immediate use
│   └── faithful/       #    Human-reviewed versions
├── tm/                 # 🔒 READ ONLY - Translation memory
├── glossary/           # Terminology files
└── chapters/ch{NN}/    # Status tracking (status.json)

tools/                  # 19 CLI tools for pipeline processing
server/                 # Web workflow interface
docs/                   # Documentation (see below)
```

## File Permissions

| Permission | Folders | Rule |
|------------|---------|------|
| 🔒 READ ONLY | `01-source/`, `02-mt-output/`, `tm/` | Never modify |
| ✏️ WRITE | `03-faithful/`, `04-localized/`, `05-publication/` | Backup before editing |

**Before modifying files:** Create backup `{filename}.{YYYY-MM-DD-HHMM}.bak`

## 8-Step Workflow

| Steps | Stage | Output |
|-------|-------|--------|
| 1-2 | Source + MT | `01-source/`, `02-mt-output/` |
| 3-4 | Matecat alignment | `tm/` (initial TM) |
| 5 | Pass 1 (linguistic) | `03-faithful/` ★ |
| 6 | TM update | `tm/` ★ |
| 7 | Pass 2 (localization) | `04-localized/` ★ |
| 8 | Publication | `05-publication/` |

★ = Preserved valuable asset

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

**Stages:** `source`, `mtOutput`, `matecat`, `editorialPass1`, `tmUpdated`, `editorialPass2`, `publication`

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
| [docs/workflow/overview.md](docs/workflow/overview.md) | Full 8-step pipeline |
| [docs/editorial/pass1-linguistic.md](docs/editorial/pass1-linguistic.md) | Pass 1 instructions |
| [docs/editorial/pass2-localization.md](docs/editorial/pass2-localization.md) | Pass 2 instructions |
| [docs/editorial/terminology.md](docs/editorial/terminology.md) | Terminology standards |
| [docs/technical/cli-reference.md](docs/technical/cli-reference.md) | CLI tools reference |
| [ROADMAP.md](ROADMAP.md) | Development status |

## Current Priority

**Pilot at Fjölbrautaskólinn við Ármúla, January 2026**

Focus: Chapters 1-4 with MT preview published, Pass 1 review in progress.
