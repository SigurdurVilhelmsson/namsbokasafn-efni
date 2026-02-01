# System Architecture

This document provides a technical overview of the namsbokasafn-efni translation pipeline system.

## Overview

The repository implements a 5-step translation workflow for producing Icelandic versions of OpenStax textbooks. The system produces three key assets:

1. **Faithful translations** (`03-faithful/`) - Human-verified, academically citable translations
2. **Translation memory** (`tm/`) - Human-verified EN↔IS parallel corpus in TMX format
3. **Localized content** (`04-localized/`, `05-publication/`) - Content adapted for Icelandic students

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           External Services                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  OpenStax GitHub    │    malstadur.is (MT)    │    Matecat Align (TM)       │
└─────────────────────────────────────────────────────────────────────────────┘
                │                    │                       │
                ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLI Tools (Node.js)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  pipeline-runner.js  │  chapter-assembler.js  │  prepare-for-align.js       │
│  cnxml-to-md.js      │  restore-strings.js    │  add-frontmatter.js         │
│  protect-for-mt.js   │  split-for-erlendur.js │  validate-chapter.js        │
└─────────────────────────────────────────────────────────────────────────────┘
                │                    │                       │
                ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Content Repository                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  books/{book}/                                                               │
│  ├── 01-source/          (CNXML originals - READ ONLY)                      │
│  ├── 02-for-mt/          (EN markdown for machine translation)              │
│  ├── 02-mt-output/       (MT results - READ ONLY)                           │
│  ├── 03-faithful/        (Human-reviewed translations)                      │
│  ├── 04-localized/       (Culturally adapted content)                       │
│  ├── 05-publication/     (Web-ready output)                                 │
│  ├── for-align/          (Staging for TM creation)                          │
│  └── tm/                 (Translation memory - READ ONLY)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Server (Express.js)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  REST API              │  GitHub OAuth          │  Publication API          │
│  Workflow UI           │  SQLite Database       │  Status Tracking          │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Web Publication                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  namsbokasafn-vefur (separate repository)                                   │
│  ├── Astro + MDX site                                                       │
│  ├── Content synced from efni repo                                          │
│  └── Published at efnafraedi.app                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CLI Pipeline Tools (`tools/`)

The pipeline consists of 40+ Node.js CLI tools organized by function:

#### Content Conversion
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `cnxml-to-md.js` | Convert OpenStax CNXML to Markdown | CNXML | Markdown + equations JSON |
| `pipeline-runner.js` | Orchestrate full conversion pipeline | Module ID or CNXML | All step outputs |
| `chapter-assembler.js` | Assemble modules into 12-file structure | Module files | Publication files |

#### MT Preparation
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `protect-for-mt.js` | Protect tables/frontmatter with placeholders | Markdown | Protected markdown + JSON |
| `split-for-erlendur.js` | Split large files for MT character limits | Markdown | Split file parts |
| `extract-table-strings.js` | Extract translatable table content | Protected JSON | Strings markdown |
| `extract-equation-strings.js` | Extract translatable equation text | Equations JSON | Strings markdown |

#### Post-MT Restoration
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `restore-strings.js` | Restore translated strings to content | Translated strings | Updated markdown |
| `restore-tables.js` | Restore protected tables | Protected JSON + translation | Restored markdown |
| `merge-split-files.js` | Merge split file parts | Split parts | Single file |
| `apply-equations.js` | Restore equation placeholders | Equations JSON | Markdown with LaTeX |

#### TM Creation
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `prepare-for-align.js` | Clean markdown for Matecat Align | EN + IS markdown | Clean file pairs |

#### Publication
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `add-frontmatter.js` | Add metadata for publication | Markdown | Markdown with YAML |
| `validate-chapter.js` | Validate content before publication | Chapter files | Validation report |

### 2. Shared Libraries (`lib/`)

Common utilities extracted from tools to reduce code duplication:

```
lib/
├── utils.js        # CLI argument parsing, file operations, validation
├── constants.js    # Module mappings, track labels, section titles
└── __tests__/      # Unit tests for shared code
```

### 3. Server (`server/`)

Express.js server providing:

- **REST API** for workflow automation
- **GitHub OAuth** authentication
- **Publication API** with role-based access
- **SQLite database** for status tracking
- **Web UI** for workflow management

Key routes:
- `/api/publication/:book/:chapter/*` - Publication operations
- `/api/workflow/*` - Workflow status and actions
- `/api/auth/*` - Authentication endpoints

### 4. Content Structure

```
books/{book}/
├── 01-source/              # OpenStax CNXML originals
│   └── ch{NN}/
│       └── m{NNNNN}.cnxml  # One file per module
├── 02-for-mt/              # English markdown prepared for MT
│   └── ch{NN}/
│       ├── {N}-{N}.en.md           # Section markdown
│       ├── {N}-{N}-equations.json  # LaTeX equations
│       └── {N}-{N}-protected.json  # Protected content
├── 02-mt-output/           # Machine translation output
│   └── ch{NN}/
│       └── {N}-{N}.is.md           # Icelandic MT output
├── 03-faithful/            # Human-reviewed translations
│   └── ch{NN}/
│       └── {N}-{N}.is.md           # Faithful translation
├── 04-localized/           # Culturally adapted content
│   └── ch{NN}/
│       └── {N}-{N}.is.md           # Localized translation
├── 05-publication/         # Web-ready content
│   ├── mt-preview/                 # Unreviewed MT
│   ├── faithful/                   # Reviewed translations
│   └── localized/                  # Adapted content
│       └── chapters/{NN}/
│           ├── {ch}-0-introduction.is.md
│           ├── {ch}-{N}-section-slug.is.md
│           ├── {ch}-key-terms.is.md
│           ├── {ch}-key-equations.is.md
│           ├── {ch}-summary.is.md
│           └── {ch}-exercises.is.md
├── for-align/              # Staging for Matecat Align
│   └── ch{NN}/
│       ├── {N}-{N}.en.clean.md
│       └── {N}-{N}.is.clean.md
├── tm/                     # Translation memory (TMX)
│   └── ch{NN}/
│       └── {N}-{N}.tmx
├── glossary/               # Terminology files
│   └── terms.json
└── chapters/ch{NN}/        # Status tracking
    └── status.json
```

## Data Flow

### Pipeline Flow (Step by Step)

```
CNXML Source (OpenStax)
        │
        ▼ cnxml-to-md.js
EN Markdown + Equations JSON
        │
        ├── protect-for-mt.js → Protected content JSON
        │
        ├── split-for-erlendur.js → Split parts (if >18k chars)
        │
        ▼ malstadur.is (external)
IS Markdown (MT output)
        │
        ├── merge-split-files.js ← Merge split parts
        │
        ├── restore-strings.js ← Translate strings
        │
        ▼ Human review
IS Markdown (faithful)
        │
        ├── prepare-for-align.js → Cleaned file pairs
        │
        ▼ Matecat Align (external)
TMX (Translation Memory)
        │
        ▼ chapter-assembler.js
12 Publication Files
        │
        ▼ sync to namsbokasafn-vefur
Web Publication
```

### Status Tracking Flow

```
status.json (per chapter)
        │
        ├── enMarkdown: complete
        ├── mtOutput: complete
        ├── linguisticReview: in-progress
        ├── tmCreated: not-started
        └── publication: not-started
```

## Technology Stack

### Runtime
- **Node.js** (>=18) - CLI tools and server
- **ESM modules** - Modern JavaScript module system

### CLI Tools
- **xml2js** - CNXML parsing
- **js-yaml** - YAML frontmatter handling
- **cheerio** - HTML/XML manipulation
- **mathml-to-latex** - Equation conversion

### Server
- **Express.js** - Web framework
- **Passport.js** - GitHub OAuth
- **better-sqlite3** - Database
- **Helmet** - Security headers
- **express-rate-limit** - Rate limiting

### Testing
- **Vitest** - Test framework
- **Husky** - Git hooks
- **lint-staged** - Pre-commit linting

### Code Quality
- **ESLint** - Linting
- **Prettier** - Formatting

## External Dependencies

### Services
| Service | Purpose | Integration |
|---------|---------|-------------|
| OpenStax GitHub | Source content | CNXML fetch via API |
| malstadur.is | Machine translation | Manual upload/download |
| Matecat Align | TM creation | Manual upload/download |
| GitHub OAuth | Authentication | Server OAuth flow |

### Repositories
| Repository | Purpose | Sync |
|------------|---------|------|
| namsbokasafn-efni (this) | Content pipeline | Source of truth |
| namsbokasafn-vefur | Web publication | Content sync via script |

## File Permissions

| Level | Directories | Policy |
|-------|-------------|--------|
| READ ONLY | `01-source/`, `02-mt-output/`, `tm/` | Never modify - external sources |
| WRITE | `03-faithful/`, `04-localized/`, `05-publication/` | Backup before editing |
| STAGING | `02-for-mt/`, `for-align/` | Generated by tools |

## Authentication & Authorization

### Roles
| Role | Permissions |
|------|-------------|
| VIEWER | Read status, view content |
| EDITOR | Edit translations |
| REVIEWER | Approve translations |
| HEAD_EDITOR | Publish content |
| ADMIN | Full access |

### Security
- GitHub OAuth for authentication
- JWT tokens for session management
- Role-based access control on publication endpoints
- Rate limiting on auth endpoints

## Configuration

### Environment Variables
```bash
# Server
JWT_SECRET=<required>
GITHUB_CLIENT_ID=<required>
GITHUB_CLIENT_SECRET=<required>
DATABASE_PATH=./data/workflow.db

# Optional
PORT=3000
NODE_ENV=development
```

### Status Stages
```javascript
// Simplified workflow stages
const STAGES = [
  'enMarkdown',       // Step 1: EN markdown generated
  'mtOutput',         // Step 2: MT output received
  'linguisticReview', // Step 3: Faithful translation complete
  'tmCreated',        // Step 4: TM created via Matecat Align
  'publication',      // Step 5: Published
];

// Status values
const STATUSES = ['not-started', 'pending', 'in-progress', 'complete'];
```

## Development

### Running Tests
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Linting
```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
npm run format        # Format code
```

### Git Hooks
Pre-commit hooks run:
1. ESLint on staged JS files
2. Prettier formatting
3. Test suite

## Related Documentation

- [Simplified Workflow](../workflow/simplified-workflow.md) - 5-step process guide
- [CLI Reference](./cli-reference.md) - Tool documentation
- [Editorial Guidelines](../editorial/) - Translation standards
- [Publication Format](./publication-format.md) - Output specifications
