# Translation Pipeline Server

Web-based editorial server for the OpenStax translation pipeline. Provides a segment editor for linguistic review (Pass 1), a localization editor (Pass 2), pipeline status tracking, terminology management, user administration, and analytics.

> **For complete API reference:** See [`docs/_generated/routes.md`](../docs/_generated/routes.md) which documents all endpoints across 25 route groups. This README provides setup instructions and a high-level overview.

## Quick Start

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your Microsoft Entra ID credentials
npm start
```

Server runs at http://localhost:3000

## Features

- **Segment editor** — Side-by-side EN/IS segment editor with autosave, conflict detection, and cross-tab guards. Supports both MT output review and manual editing.
- **Localization editor** — Pass 2 editor for adapting faithful translations: unit conversions, Icelandic context, extended exercises. Full audit trail of changes.
- **Pipeline management** — Track chapter progress through 8 pipeline stages (extraction through publication). Unified status in SQLite with JSON cache sync.
- **Terminology database** — Searchable EN-IS terminology with dispute resolution workflow and glossary generation.
- **Multi-book support** — Per-book rendering configuration, access control, and module mapping. Chemistry, Biology, and Microbiology registered.
- **Admin panel** — User management, book access grants, feedback review, analytics dashboard.
- **Role-based access** — Five roles (admin, head editor, editor, contributor, viewer) with middleware enforcement.
- **Microsoft Entra ID** — OAuth 2.0 authentication via Azure AD with JWT sessions.
- **Publication tracks** — Three-track output (mt-preview, faithful, localized) with independent publication status.

## Web Interface

| URL | Description |
|-----|-------------|
| `/` | My Work (translator dashboard) |
| `/editor` | Segment editor (Pass 1: linguistic review) |
| `/localization` | Localization editor (Pass 2) |
| `/progress` | Pipeline status overview |
| `/terminology` | Terminology database |
| `/library` | Book catalog |
| `/admin` | Admin panel (users, books, feedback, analytics) |
| `/feedback` | Public feedback form |
| `/profile` | User profile |
| `/login` | Microsoft login |
| `/pipeline/:book/:chapter` | Chapter pipeline detail |

## Route Groups (25)

| Route | Description |
|-------|-------------|
| `activity` | Activity logging and history |
| `admin` | User management, migrations, system admin |
| `analytics` | Usage statistics and dashboards |
| `auth` | Microsoft Entra ID OAuth flow, JWT sessions |
| `books` | Book registration and access control |
| `feedback` | Public feedback submission and review |
| `images` | Image translation tracking |
| `issues` | Translation issue tracking and classification |
| `localization-editor` | Pass 2 localization editing API |
| `matecat` | Matecat TM project integration |
| `modules` | OpenStax module metadata |
| `my-work` | Per-user task dashboard |
| `notifications` | Email and in-app notifications |
| `pipeline` | Chapter pipeline detail pages |
| `pipeline-status` | Stage transitions and status queries |
| `profile` | User profile management |
| `publication` | HTML publication and track management |
| `sections` | Section-level status tracking |
| `segment-editor` | Pass 1 segment editing API |
| `status` | Pipeline overview pages |
| `suggestions` | Translation suggestions |
| `sync` | Content sync to reader repository |
| `terminology` | Terminology CRUD and dispute resolution |
| `views` | HTML page serving |
| `workflow` | Legacy workflow (redirects to current routes) |

## Configuration

Copy `.env.example` to `.env` and configure:

### Required (production)

```env
# Microsoft Entra ID (register app at https://portal.azure.com/)
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
MICROSOFT_TENANT_ID=your_tenant_id
MICROSOFT_REDIRECT_URI=https://ritstjorn.namsbokasafn.is/api/auth/callback

# JWT for sessions
JWT_SECRET=change-this-to-a-secure-random-string
```

### Optional

```env
# Server
PORT=3000
HOST=localhost
BASE_URL=http://localhost:3000

# Email notifications
ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass

# Matecat API
MATECAT_API_KEY=your_api_key
```

## Architecture

```
server/
├── index.js              # Express 5 entry point, auto-migration
├── routes/               # 25 route files
│   ├── auth.js           # Microsoft Entra ID OAuth
│   ├── segment-editor.js # Pass 1 editing API
│   ├── localization-editor.js # Pass 2 editing API
│   ├── admin.js          # User/book/system admin
│   ├── pipeline-status.js # Stage transitions
│   ├── terminology.js    # Term CRUD + disputes
│   ├── views.js          # HTML page serving
│   └── ...               # 18 more route files
├── services/             # 36 service modules
│   ├── segmentEditorService.js   # Segment CRUD, approved edits
│   ├── segmentParser.js          # Segment file I/O
│   ├── pipelineStatusService.js  # Unified pipeline status
│   ├── localizationEditService.js # Localization audit trail
│   ├── terminologyService.js     # Term management
│   ├── userService.js            # User/role management
│   ├── auth.js                   # JWT + Microsoft OAuth
│   ├── migrationRunner.js        # Auto-run DB migrations
│   └── ...                       # 28 more service files
├── middleware/
│   ├── requireAuth.js    # JWT validation
│   ├── requireRole.js    # Role-based access control
│   └── validateParams.js # Request parameter validation
├── views/                # 12 HTML pages
│   ├── segment-editor.html
│   ├── localization-editor.html
│   ├── admin.html
│   ├── status.html
│   ├── terminology.html
│   └── ...               # 7 more view files
├── migrations/           # 22 SQLite migrations (001-022)
├── public/               # Static assets (JS, CSS)
├── e2e/                  # Playwright E2E tests (96 tests)
└── data/                 # Book module mappings (JSON)
```

## Role-Based Access

Roles are managed in the local SQLite database:

| Role | Access |
|------|--------|
| Admin | Full access, user management, migrations |
| Head Editor | Manage assigned books, approve edits |
| Editor | Review content, resolve issues, edit segments |
| Contributor | Submit translations, suggest terminology |
| Viewer | Read-only access |

## Dependencies

Key production dependencies (see `package.json` for full list):

```json
{
  "express": "^5.1.0",
  "better-sqlite3": "^12.6.2",
  "helmet": "^8.0.0",
  "express-rate-limit": "^8.2.1",
  "jsonwebtoken": "^9.0.2",
  "nodemailer": "^8.0.0",
  "multer": "^2.0.0",
  "cookie-parser": "^1.4.6",
  "dotenv": "^17.2.3",
  "archiver": "^7.0.1",
  "uuid": "^13.0.0"
}
```

Dev dependencies: `@playwright/test` for E2E testing.

## Development

```bash
# Start with auto-reload (Node 20+)
npm run dev

# Run on custom port
PORT=8080 npm start

# Run E2E tests
npm run test:e2e

# Run E2E tests with browser visible
npm run test:e2e:headed
```

## Database

SQLite database at `pipeline-output/sessions.db` (auto-created on first run). Migrations run automatically on server startup via `migrationRunner.js`. Current schema has 22 migrations covering users, sessions, edits, terminology, pipeline status, localization audit trail, and Microsoft auth.

## Related Documentation

- [Workflow Guide](../docs/workflow/simplified-workflow.md) - 5-step translation pipeline
- [Editorial Guide (Pass 1)](../docs/editorial/pass1-linguistic.md) - Linguistic review instructions
- [Editorial Guide (Pass 2)](../docs/editorial/pass2-localization.md) - Localization instructions
- [Architecture](../docs/technical/architecture.md) - System architecture overview
- [CLAUDE.md](../CLAUDE.md) - Claude Code project instructions
