# System Architecture

> 📁 **Deep reference, not authoritative — as of 2026-06-28.**
> Runtime versions, role names, env vars, file permissions, status values and the
> CSRF posture are owned by **CLAUDE.md** and by **the code** (`server/constants.js`,
> `schemas/`, `.nvmrc`, `books/<slug>/book-config.json`). **Where this file disagrees
> with those, they win.** Nothing here asserts current work status.
>
> A 2026-07-26 audit found several claims here that stated the opposite of the running
> code; the two dangerous ones (the auth cookie's `SameSite`, and an invented fifth
> role) are corrected in place and annotated. **Treat any uncorrected detail as
> unverified** — this file's genuinely unique content is the Cross-Repository Content
> Flow and the Data Durability & Recovery table.
>
> ⚠️ The Cross-Repository Content Flow section below describes the sync Action as
> automatic. **It is not, and never has been** — see CLAUDE.md § "Content delivery to
> readers". The final leg is manual.

This document provides a technical overview of the namsbokasafn-efni translation pipeline system.

## Overview

The repository implements a 5-step translation workflow for producing Icelandic versions of OpenStax textbooks. The system produces three key assets:

1. **Faithful translations** (`03-faithful-translation/`) - Human-verified, academically citable translations
2. **Translation memory** (`tm/`) - Human-verified EN↔IS parallel corpus in TMX format
3. **Localized content** (`04-localized-content/`, `05-publication/`) - Content adapted for Icelandic students

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
│  api-translate.js    │  repair-emphasis.js    │  prepare-for-align.js       │
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
│  ├── 03-faithful-translation/        (Human-reviewed translations)                      │
│  ├── 03-translated/      (Translated CNXML from inject)                     │
│  ├── 04-localized-content/       (Culturally adapted content)                       │
│  ├── 05-publication/     (Web-ready HTML output)                            │
│  ├── for-align/          (Staging for TM creation)                          │
│  └── tm/                 (Translation memory - READ ONLY)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Server (Express.js)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  REST API              │  Microsoft Entra ID          │  Publication API          │
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
│  └── Published at namsbokasafn.is                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. CLI Pipeline Tools (`tools/`)

The pipeline uses an Extract-Inject-Render architecture:

#### Extraction (CNXML → Segments)
| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `cnxml-extract.js` | Extract translatable segments from CNXML | CNXML | Segments markdown + structure JSON + equations JSON |
| `api-translate.js` | Translate segments via Málstaður API | EN segments | IS segments in `02-mt-output/` |

> **Note:** `protect-segments-for-mt.js` and `unprotect-segments.js` are archived in `tools/archived/` — superseded by `api-translate.js` which handles marker protection internally.

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
- **Microsoft Entra ID** authentication
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
├── 03-faithful-translation/            # Human-reviewed translations
│   └── ch{NN}/
│       └── m{NNNNN}-segments.is.md  # Faithful translation
├── 03-translated/          # Translated CNXML from injection
│   └── ch{NN}/
│       └── m{NNNNN}.cnxml          # Reconstructed translated CNXML
├── 04-localized-content/           # Culturally adapted content
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
        ├── api-translate.js → Málstaður API translation
        │
        ▼ Málstaður API (automated)
IS Segments (MT output)
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

### Cross-Repository Content Flow (GitHub ↔ server ↔ reader)

This is the part that surprises people: **editorial work does not travel
through GitHub as "edits."** Approvals and segment edits live only in the
production server's SQLite database. GitHub carries *files*, not editor
actions. There are three independent lanes:

```
                  (1) code + committed content
   GitHub (efni) ───────── Deploy workflow / `git pull` ─────────► Production server
        ▲                  (git reset --hard origin/main)          ┌────────────────────────┐
        │                                                          │ pipeline-output/       │
        │   (2) content files, auto-backup cron every 2h           │   sessions.db  ← edits,│
        └────────── scripts/git-backup.sh (push to main) ──────────│   approvals (gitignored)│
                    books/*/{03-faithful,03-translated,             │ books/*/...  ← files   │
                    04-*,05-publication,chapters,                   │   written by Apply/    │
                    translation-errors.json}                       │   Vista+Birta          │
                                                                   └────────────────────────┘

   GitHub (efni) ──(3) "Sync Content to Vefur" Action──► GitHub (vefur) ──build/deploy──► namsbokasafn.is
                     (scripts/sync-content.js, runs IN the vefur repo,
                      reads efni FROM GitHub — not from the server)
```

**Lane 1 — GitHub → server (code & committed content).** The Deploy
workflow (`.github/workflows/deploy.yml`, manual `workflow_dispatch`) SSHes
in, backs up the DB, `git reset --hard origin/main`, `npm ci`, restarts the
service. A manual `git pull` on the box does the same for content.

**Lane 2 — server → GitHub (editorial output).** The DB is gitignored, so
the durable artifact is the *files* that "Vista í skrár" / "Vista + Birta"
write under `books/`. A cron job (`scripts/git-backup.sh`, every 2h) commits
those paths and pushes to `main` as `auto-backup: …` commits.
*Consequence:* editing must happen on the production interface — an approval
made against a laptop's local server sits in that laptop's DB and never
reaches production or GitHub.

**Lane 3 — GitHub → reader.** "Vista + Birta" runs apply → inject → render
and writes HTML to `05-publication/` **on the server's disk only**. To reach
the reader, the "Sync Content to Vefur" Action
(`.github/workflows/sync-content.yml`) copies content from the efni repo *on
GitHub* into namsbokasafn-vefur, which then builds and deploys. This Action
runs automatically on any push to `main` that touches
`books/*/05-publication/**` (so the backup cron's push triggers it), and can
also be run manually.

**End-to-end latency of a publish:** `Vista + Birta` (instant on server) →
auto-backup cron pushes to `main` (**up to 2h**) → sync Action fires on that
push → vefur builds → live. The 2h gap is the backup cadence; run
`scripts/git-backup.sh` by hand on the server, or dispatch the sync Action
after a manual push, to publish immediately.

**Why a `git pull` on the server can report a dirty tree:** inject
regenerates `books/*/translation-errors.json` on every render. It is now in
the backup script's staging list (above), so it rides along with the
auto-backup commit instead of blocking the next pull. If you still see it
dirty from before this fix, `git checkout -- books/*/translation-errors.json`
is safe — it is regenerated deterministically.

The manifest is **track-qualified**: results live under `tracks[<track>]`
(`mt-preview`, `faithful`, …), each with its own `summary` (including
`totalSourceModules` and a real `skippedUntranslated` count) + `modules` +
producing `tool`. A run replaces only its own track's section and preserves the
others, so an `mt-preview` inject and a `faithful` inject no longer clobber each
other's record. The filename is unchanged on purpose — it must stay inside the
`merge=ours` `.gitattributes` glob and the git-backup staging glob.

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
- **jsonwebtoken** - Microsoft Entra ID
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
| Microsoft Entra ID | Authentication | Server OAuth flow |

### Repositories
| Repository | Purpose | Sync |
|------------|---------|------|
| namsbokasafn-efni (this) | Content pipeline | Source of truth |
| namsbokasafn-vefur | Web publication | Content sync via script |

## File Permissions

| Level | Directories | Policy |
|-------|-------------|--------|
| READ ONLY | `01-source/`, `02-mt-output/`, `tm/` | Never modify - external sources |
| WRITE | `03-faithful-translation/`, `04-localized-content/`, `05-publication/` | Backup before editing |
| GENERATED | `02-for-mt/`, `02-structure/`, `03-translated/`, `for-align/` | Generated by tools |

## Authentication & Authorization

### Roles

**Authoritative: `server/constants.js` (`ROLES`).** There are **four**, and this
document is not the place to enumerate them.

> ⚠️ **Corrected 2026-07-26.** This table previously listed a fifth role,
> `REVIEWER`, which **does not exist anywhere in `server/`** — a `contributor`
> role was merged into `editor` by migration 023 ("too granular for a ~5 person
> team"), and `REVIEWER` appears to have been invented by this document.
> `requireRole(ROLES.REVIEWER)` evaluates to `undefined`, so a guard written from
> this table degrades instead of failing loud.

### Security
- Microsoft Entra ID for authentication
- JWT tokens for session management
- Role-based access control on publication endpoints
- Rate limiting on auth endpoints
- Page-level auth gate on view routes (`routes/views.js`): app pages redirect
  anonymous browsers to `/login` (defense-in-depth on top of the role-gated
  `/api/*` routes); `/admin` and `/assignments` additionally require the
  matching role. `/login` and `/feedback` (public form) stay open.

#### CSRF posture (deliberate)
This app uses **no CSRF tokens by design**; the control is a `SameSite=Lax`,
`HttpOnly` session cookie (`auth_token`), plus the fact that **every mutating
endpoint is a POST**. Lax withholds the cookie from cross-site POSTs and
subresource loads — which is the CSRF-relevant half — while still allowing the
top-level GET redirect back from Microsoft to carry it. Helmet + a same-origin
CORS allowlist (`namsbokasafn.is` subdomains) back this up; front-end calls go
through `fetchJson`, which defaults `credentials: 'same-origin'`.

> ⚠️ **Corrected 2026-07-26. This section previously said `SameSite=strict` and
> attached the rule "if it is ever loosened to Lax, CSRF tokens become required."
> Both were wrong.** The cookie has been **Lax since 2026-07-01** — Strict broke
> the Entra OAuth return and produced a login loop that locked clean browsers out
> of production. **Do not restore `Strict`**, and do not treat Lax as a trigger
> for CSRF-token work: the loosening already happened, deliberately, and was
> dispositioned. Authoritative: `server/routes/auth.js` (the `sameSite` values)
> and CLAUDE.md § auth. (Audit ref: F11.)

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

## Data Durability & Recovery

Editorial assets live in two places with different durability guarantees. Know
which is which before relying on a recovery.

| Asset | Lives in | Backed up by | Max data-loss window |
|-------|----------|--------------|----------------------|
| Faithful/localized content (`books/*/03-`, `04-`, `05-`) | git | `scripts/git-backup.sh` (cron, every 2h) | ~2h |
| Translation memory (`books/*/tm/*.tmx`) | git | regenerated on apply (`tmService`), pushed by git-backup | ~2h |
| Glossary export (`books/*/glossary/glossary-unified.json`) | git | `server/scripts/export-terminology.js` (cron) + git-backup | nightly + ~2h |
| Terminology DB, segment edits, discussions, reviews, users, notifications | `pipeline-output/sessions.db` (gitignored) | `scripts/backup-db.sh` (cron) | backup interval (e.g. 6h) |
| Concordance index (`tm_segments`) | `sessions.db` | rebuildable from faithful files via `server/scripts/backfill-concordance.js` | n/a (derived) |

**`sessions.db` backup (6.2):** `scripts/backup-db.sh` checkpoints the WAL,
writes a timestamped copy to `pipeline-output/backups/`, and prunes to the most
recent 30. Restore = stop the server, copy the chosen backup over
`pipeline-output/sessions.db` (remove any stale `-wal`/`-shm` sidecars), restart.
Schedule it from cron (e.g. `0 */6 * * *`); confirm Linode disk snapshots as a
second line of defense.

**Glossary freshness (6.1):** the committed `glossary-unified.json` is the MT
glossary `api-translate.js` sends to Málstaður. It is regenerated from the
terminology DB by `server/scripts/export-terminology.js`; run it from cron so
newly approved terms reach MT without a manual export. Derived assets
(`tm_segments`, the TMX) can always be rebuilt from the faithful files in git,
so only the **DB-only** rows above are truly irreplaceable.

## Related Documentation

- [Simplified Workflow](../workflow/simplified-workflow.md) - 5-step process guide
- [CLI Reference](./cli-reference.md) - Tool documentation
- [Editorial Guidelines](../editorial/) - Translation standards
- [Publication Format](./publication-format.md) - Output specifications
