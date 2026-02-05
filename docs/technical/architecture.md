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
│                   Extract-Inject-Render Pipeline (Node.js)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  cnxml-extract.js    │  cnxml-inject.js       │  cnxml-render.js            │
│  protect-segments.js │  restore-segments.js   │  prepare-for-align.js       │
└─────────────────────────────────────────────────────────────────────────────┘
                │                    │                       │
                ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Content Repository                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  books/{book}/                                                               │
│  ├── 01-source/          (CNXML originals - READ ONLY)                      │
│  ├── 02-for-mt/          (EN segments for machine translation)              │
│  ├── 02-structure/       (Document structure + equations JSON)               │
│  ├── 02-mt-output/       (MT results - READ ONLY)                           │
│  ├── 03-faithful/        (Human-reviewed translations)                      │
│  ├── 03-translated/      (Translated CNXML from inject)                     │
│  ├── 04-localized/       (Culturally adapted content)                       │
│  ├── 05-publication/     (Web-ready HTML output)                            │
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
│  ├── SvelteKit site serving pre-rendered HTML                               │
│  ├── Content synced from efni repo                                          │
│  └── Published at efnafraedi.app                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CLI Pipeline Tools (`tools/`)

The pipeline uses an Extract-Inject-Render architecture:

#### Extraction (CNXML → Segments)
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `cnxml-extract.js` | Extract translatable segments from CNXML | CNXML | Segments markdown + structure JSON + equations JSON |
| `protect-segments-for-mt.js` | Protect markers & links, split for MT | Segment files | MT-ready segments + links JSON |

#### Post-MT Restoration
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `restore-segments-from-mt.js` | Restore markers & links in MT output | MT output | Clean segments |

#### TM Creation
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `prepare-for-align.js` | Clean markdown for Matecat Align | EN + IS markdown | Clean file pairs |

#### Injection & Rendering (Segments → CNXML → HTML)
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `cnxml-inject.js` | Inject translations into CNXML structure | Segments + structure JSON + equations JSON | Translated CNXML |
| `cnxml-render.js` | Render CNXML to semantic HTML | Translated CNXML | HTML with pre-rendered KaTeX |

#### Validation
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `validate-chapter.js` | Validate content before publication | Chapter files | Validation report |

### 2. Shared Libraries (`tools/lib/`)

Common utilities extracted from tools to reduce code duplication:

```
tools/lib/
├── cnxml-parser.js       # CNXML document parsing
├── cnxml-elements.js     # HTML rendering for CNXML elements
├── mathml-to-latex.js    # MathML → LaTeX conversion
├── mathjax-render.js     # MathJax SVG rendering
├── module-sections.js    # Module section building
├── utils.js              # CLI argument parsing, file operations
├── constants.js          # Module mappings, track labels
└── __tests__/            # Unit tests for shared code
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
├── 01-source/              # OpenStax CNXML originals (READ ONLY)
│   └── ch{NN}/
│       └── m{NNNNN}.cnxml  # One file per module
├── 02-for-mt/              # EN segments for machine translation
│   └── ch{NN}/
│       └── m{NNNNN}-segments.en.md  # With <!-- SEG:... --> and [[MATH:N]]
├── 02-structure/           # Document structure from extraction
│   └── ch{NN}/
│       ├── m{NNNNN}-structure.json  # Document skeleton
│       └── m{NNNNN}-equations.json  # MathML equations
├── 02-mt-output/           # Machine translation output (READ ONLY)
│   └── ch{NN}/
│       └── m{NNNNN}-segments.is.md  # Icelandic MT segments
├── 03-faithful/            # Human-reviewed translations
│   └── ch{NN}/
│       └── m{NNNNN}-segments.is.md  # Faithful translation
├── 03-translated/          # Translated CNXML from injection
│   └── ch{NN}/
│       └── m{NNNNN}.cnxml          # Reconstructed translated CNXML
├── 04-localized/           # Culturally adapted content
│   └── ch{NN}/
│       └── m{NNNNN}-segments.is.md  # Localized translation
├── 05-publication/         # Web-ready HTML from rendering
│   ├── mt-preview/                  # Unreviewed MT
│   ├── faithful/                    # Reviewed translations
│   └── localized/                   # Adapted content
│       └── chapters/{NN}/
│           └── m{NNNNN}.html        # Semantic HTML per module
├── for-align/              # Staging for Matecat Align
│   └── ch{NN}/
│       ├── {N}-{N}.en.clean.md
│       └── {N}-{N}.is.clean.md
├── tm/                     # Translation memory (TMX) (READ ONLY)
│   └── ch{NN}/
│       └── {N}-{N}.tmx
├── glossary/               # Terminology files
│   └── terms.json
└── chapters/ch{NN}/        # Status tracking
    └── status.json
```

## Data Flow

### Pipeline Flow (Extract-Inject-Render)

```
CNXML Source (OpenStax)
        │
        ▼ cnxml-extract.js
EN Segments + Structure JSON + Equations JSON
        │
        ├── protect-segments-for-mt.js → MT-ready segments + links JSON
        │
        ▼ malstadur.is (external)
IS Segments (MT output)
        │
        ├── restore-segments-from-mt.js → Clean IS segments
        │
        ▼ Human review
IS Segments (faithful)
        │
        ├── prepare-for-align.js → Cleaned file pairs
        │
        ▼ Matecat Align (external)
TMX (Translation Memory)
        │
        ▼ cnxml-inject.js
Translated CNXML
        │
        ▼ cnxml-render.js
Semantic HTML (pre-rendered KaTeX, absolute image paths)
        │
        ▼ sync to namsbokasafn-vefur
Web Publication
```

### Status Tracking Flow

```
status.json (per chapter)
        │
        ├── extraction: complete        (Step 1)
        ├── mtReady: complete           (Step 1b)
        ├── mtOutput: complete          (Step 2)
        ├── linguisticReview: in-progress (Step 3)
        ├── tmCreated: not-started      (Step 4)
        ├── injection: not-started      (Step 5a)
        ├── rendering: not-started      (Step 5b)
        └── publication: not-started    (Step 5c)
```

## Technology Stack

### Runtime
- **Node.js** (>=18) - CLI tools and server
- **ESM modules** - Modern JavaScript module system

### CLI Tools
- **katex** - Server-side equation rendering
- **mathml-to-latex** - Equation conversion
- **js-yaml** - YAML handling

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
| GENERATED | `02-for-mt/`, `02-structure/`, `03-translated/`, `for-align/` | Generated by tools |

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
// Pipeline stages (Extract-Inject-Render workflow)
const STAGES = [
  'extraction',       // Step 1: Segments + structure extracted from CNXML
  'mtReady',          // Step 1b: Segments protected and split for MT
  'mtOutput',         // Step 2: MT output received
  'linguisticReview', // Step 3: Faithful translation reviewed
  'tmCreated',        // Step 4: TM created via Matecat Align
  'injection',        // Step 5a: Translated CNXML produced
  'rendering',        // Step 5b: HTML produced
  'publication',      // Step 5c: Published to web
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
