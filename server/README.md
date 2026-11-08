# Translation Pipeline Server

Ritstjóri, the web-based editorial server for the OpenStax translation pipeline. Provides a segment editor for linguistic review (Pass 1), a localization editor (Pass 2), pipeline status tracking, terminology management, user administration, and analytics. It is licensed AGPL-3.0 ([LICENSE](LICENSE)); the rest of the repository's tooling is MIT.

> **For complete API reference:** See [`docs/_generated/routes.md`](../docs/_generated/routes.md) which is generated from `server/routes/` and documents every endpoint defined there (`index.js` defines `/api` and `/api/health` itself). This README provides setup instructions and a high-level overview.

## Quick Start

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your Microsoft Entra ID credentials
npm start
```

The server runs at http://localhost:3000 unless `PORT` says otherwise. It reads `.env` from
`server/` (its working directory), never from the repo root.

## Features

- **Segment editor** — Side-by-side EN/IS segment editor with autosave, conflict detection, and cross-tab guards. Supports both MT output review and manual editing.
- **Localization editor** — Pass 2 editor for adapting faithful translations: unit conversions, Icelandic context, extended exercises. Full audit trail of changes.
- **Pipeline management** — Track chapter progress through the pipeline stages, extraction through publication (the list is `PIPELINE_STAGES` in `constants.js`). Unified status in SQLite with JSON cache sync.
- **Terminology database** — Searchable EN-IS terminology with dispute resolution workflow and glossary generation.
- **Multi-book support** — Per-book rendering configuration, access control, and module mapping. Registered books live in the `registered_books` table; `VALID_BOOKS` in `config.js` is only the seed.
- **Admin panel** — User management, book access grants, feedback review, analytics dashboard.
- **Role-based access** — The roles are `ROLES` in `constants.js`, ranked by `ROLE_HIERARCHY`, with middleware enforcement (`middleware/requireRole.js`).
- **Microsoft Entra ID** — OAuth 2.0 authentication via Azure AD with JWT sessions. A sign-in that matches no account is a *visit*: a viewer session with no `users` row (see `signInPolicy` in `services/auth.js`).
- **Publication tracks** — Three-track output (mt-preview, faithful, localized) with independent publication status.
- **Translation memory export** — TMX, CSV or JSON, regenerated on demand (`routes/tm.js`).
- **Research consent** — Members record or withdraw consent for the research evaluation (`/api/research/consent`); the data is kept in its own database (see [Database](#database)).

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
| `/assignments` | Chapter assignments (head editor) |
| `/feedback` | Public feedback form |
| `/profile` | User profile |
| `/login` | Microsoft login |

Older paths (`/segment-editor`, `/workflow`, `/dashboard`, `/status`, `/reviews`, `/review-queue`,
`/pipeline`, `/pipeline/:book/:chapter`, `/books`, …) are kept as 301 redirects onto the
routes above — see `routes/views.js`. They are not separate pages.

## Route Groups

One file per group in `routes/`; `ls routes/` is the list, and `docs/_generated/routes.md` has every endpoint in those files.

| Route | Description |
|-------|-------------|
| `activity` | Activity logging and history |
| `admin` | User management, migrations, system admin |
| `analytics` | Usage statistics and dashboards |
| `auth` | Microsoft Entra ID OAuth flow, JWT sessions |
| `books` | Book and chapter metadata, registration and access control |
| `feedback` | Public feedback submission and review |
| `localization-editor` | Pass 2 localization editing API |
| `my-work` | Per-user task dashboard |
| `notifications` | Email and in-app notifications |
| `pipeline` | Inject, render and job tracking API |
| `pipeline-status` | Stage transitions, locking and status queries |
| `profile` | User profile management |
| `publication` | HTML publication and track management |
| `research` | Research consent: record, read or withdraw your own decision |
| `sections` | Operations on individual translation sections |
| `segment-editor` | Pass 1 segment editing API |
| `status` | Pipeline status API for books and chapters |
| `suggestions` | Auto-detected localization suggestions |
| `terminology` | Terminology CRUD and dispute resolution |
| `tm` | Translation memory export (TMX, CSV, JSON) |
| `views` | HTML page serving |

## Configuration

Copy `.env.example` to `.env` (both in `server/`) and configure. With `NODE_ENV=production`
the server refuses to start unless every variable in `REQUIRED_PRODUCTION_SECRETS`
(`config.js`) is set, and it names the missing ones when it does. Defaults live where each
variable is read.

| Variable | Purpose | Read in |
|----------|---------|---------|
| `PORT` · `HOST` | Listen port and bind address | `config.js` |
| `NODE_ENV` | `production` turns on the startup secret checks | `config.js` |
| `BASE_URL` | Public URL used in email links | `services/notifications.js` |
| `CORS_ORIGIN` | Comma-separated allowed origins | `config.js` |
| `MS_CLIENT_ID` · `MS_CLIENT_SECRET` · `MS_TENANT_ID` | Microsoft Entra ID app registration ([Azure Portal](https://portal.azure.com/)) | `services/auth.js` |
| `MS_CALLBACK_URL` | OAuth redirect URI, e.g. `https://ritstjorn.namsbokasafn.is/api/auth/callback`; falls back to `CALLBACK_URL` | `services/auth.js` |
| `JWT_SECRET` · `JWT_EXPIRY` | Session token secret (its strength is checked in production) and lifetime | `config.js`, `services/auth.js` |
| `ADMIN_USERS` | Comma-separated Microsoft emails granted admin access | `services/auth.js` |
| `AUTO_CREATE_USERS` | What happens when a sign-in matches no account — see `signInPolicy` | `services/auth.js` |
| `ADMIN_EMAIL` | Recipient of feedback notifications | `services/notifications.js` |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_SECURE` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | Outgoing mail. Mail is off unless host, user and password are all set (`isEmailConfigured`) | `services/notifications.js` |
| `GREYNIR_URL` | Optional Icelandic grammar sidecar ([greynir-sidecar/](greynir-sidecar/README.md)); unset means no grammar findings | `services/greynirEngine.js` |
| `SESSIONS_DB_PATH` | Overrides the database location | `lib/dbPath.js` |
| `LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | `lib/logger.js` |
| `RATE_LIMIT_WINDOW_MS` · `RATE_LIMIT_MAX` · `RATE_LIMIT_AUTH_MAX` | Request rate limits | `config.js` |
| `SLOW_REQUEST_MS` | Threshold for logging a slow request | `index.js` |
| `OFFBOX_BACKUP_STALE_HOURS` · `CONTENT_BACKUP_STALE_HOURS` · `GLOSSARY_EXPORT_STALE_HOURS` · `GLOSSARY_REFUSAL_STALE_DAYS` | When `GET /api/health` calls a heartbeat stale; the defaults are in the health modules under `lib/` | `index.js` |

`.env.example` also lists `GITHUB_*` and `MATECAT_*` variables. The server reads none of
them. `MALSTADUR_API_KEY` belongs to the pipeline tools, which read the repo-root `.env`
— see the root [README](../README.md#3-environment-variables).

## Architecture

```
server/
├── index.js              # Express entry point, auto-migration, /api/health
├── config.js             # Environment checks and runtime configuration
├── constants.js          # Roles, pipeline stages and other shared values
├── routes/               # One file per route group
│   ├── auth.js           # Microsoft Entra ID OAuth
│   ├── segment-editor.js # Pass 1 editing API
│   ├── localization-editor.js # Pass 2 editing API
│   ├── admin.js          # User/book/system admin
│   ├── pipeline-status.js # Stage transitions
│   ├── terminology.js    # Term CRUD + disputes
│   ├── views.js          # HTML page serving
│   └── ...               # and the rest: ls routes/
├── services/             # Business logic and DB access
│   ├── segmentEditorService.js   # Segment CRUD, approved edits
│   ├── segmentParser.js          # Segment file I/O
│   ├── pipelineStatusService.js  # Unified pipeline status
│   ├── localizationEditService.js # Localization audit trail
│   ├── terminologyService.js     # Term management
│   ├── userService.js            # User/role management
│   ├── auth.js                   # JWT + Microsoft OAuth
│   ├── migrationRunner.js        # Auto-run DB migrations
│   └── ...                       # and the rest: ls services/
├── lib/                  # Shared helpers (DB paths, logger, health checks, terminology model, glossary export, …)
├── middleware/
│   ├── requireAuth.js    # JWT validation
│   ├── requireRole.js    # Role-based access control
│   ├── validateParams.js # Request parameter validation
│   ├── upload.js         # multer, with each route's file-size limit on its 413
│   ├── errorHandler.js   # The app's last error handler
│   └── ...               # and the rest: ls middleware/
├── views/                # HTML pages
│   ├── segment-editor.html
│   ├── localization-editor.html
│   ├── admin.html
│   ├── status.html
│   ├── terminology.html
│   └── ...               # and the rest: ls views/
├── migrations/           # SQLite migrations, run in order on every start
├── scripts/              # Operational and measurement scripts (terminology export, concept import, gate checks, one-off fixes)
├── public/               # Static assets (JS, CSS)
├── greynir-sidecar/      # Optional Python grammar checker (see its README)
├── e2e/                  # Playwright E2E tests (npm run test:e2e)
├── __tests__/            # Vitest unit tests (run from the repo root with npm test)
└── data/                 # Book module mappings (JSON)
```

## Role-Based Access

Roles are stored in the local SQLite database. The role names are `ROLES` and their ranking
is `ROLE_HIERARCHY`, both in `constants.js`; routes check them through
`middleware/requireRole.js`, and book-scoped checks go through `requireHeadEditor` /
`requireHeadEditorFor`. A signed-in user may have no `users` row at all (a visitor) —
routes must handle that, as the root `CLAUDE.md` § *Auth* explains.

## Dependencies

**`server/package.json` is the single source of truth for versions — read it there.**
This section used to hand-copy the version ranges; by 2026-08-05 **8 of the 11 were
stale** (`archiver` still read `^7.0.1` three months after the v8 bump, `uuid` was a
major behind), which is precisely the drift CLAUDE.md § *One source of truth* exists to
prevent. What is recorded here instead is the part `package.json` cannot tell you —
what each one is load-bearing **for**:

| Dependency | Load-bearing for |
|---|---|
| `express` | HTTP layer; routers under `routes/` |
| `better-sqlite3` | the `sessions.db` store — synchronous driver, ships prebuilt binaries |
| `helmet` · `express-rate-limit` | security headers and abuse limits on the public surface |
| `jsonwebtoken` · `cookie-parser` | the Entra ID auth path and the `auth_token` cookie (⚠️ `SameSite=Lax` — see the root `CLAUDE.md`) |
| `nodemailer` | editor notification mail |
| `multer` | multipart upload endpoints |
| `dotenv` | environment configuration |
| `archiver` | the book/chapter ZIP download route (its ESM-only, class-based API — see register §C19) |
| `uuid` | identifier generation |
| `cors` | cross-origin policy for the API |
| `csv-parse` | CSV ingest on the terminology/import paths |
| `pino` · `pino-pretty` | structured logging (`lib/logger`) |
| `@monyone/aho-corasick` | whole-word terminology matching in segments (`lib/termAutomaton.js`) |
| `xlsx` | ⚠️ installs from the **SheetJS CDN tarball**, not npm — `npm ci` needs `cdn.sheetjs.com` reachable, and bumps are manual (Dependabot cannot follow a URL dependency) |

It is a map of *purpose*, which is stable; if you find a dependency missing here, or the
table disagrees with `package.json`, **`package.json` wins** and this table is the bug.

Dev dependencies: `@playwright/test` for E2E testing.

## Development

```bash
# Start with auto-reload (node --watch; the Node version is in the repo root's .nvmrc)
npm run dev

# Run on custom port
PORT=8080 npm start

# Run E2E tests
npm run test:e2e

# Run E2E tests with browser visible
npm run test:e2e:headed
```

Unit tests for the server live in `__tests__/` and run with the rest of the suite: `npm test`
from the repo root.

## Database

SQLite database at `pipeline-output/sessions.db` (auto-created on first run; resolved by
`lib/dbPath.js`). Migrations run automatically on server startup via `migrationRunner.js`. The migrations cover, among other things, users, sessions, edits, terminology, pipeline status, the localization audit trail and Microsoft auth.

Research data is kept apart from it, in a research database beside `sessions.db`; its path
is derived from the editorial database's by `lib/researchDbPath.js`, and it opens at boot
through `services/researchDb.js`.

## Related Documentation

- [Workflow Guide](../docs/workflow/simplified-workflow.md) - 5-step translation pipeline
- [Editor Guide](../docs/editor-guide/README.md) - Walkthrough of the server for editors
- [Editorial Guide (Pass 1)](../docs/editorial/pass1-linguistic.md) - Linguistic review instructions
- [Editorial Guide (Pass 2)](../docs/editorial/pass2-localization.md) - Localization instructions
- [Architecture](../docs/technical/architecture.md) - System architecture overview
- [Deployment checklist](../docs/deployment/linode-deployment-checklist.md) - Production setup, including `server/.env`
- [CLAUDE.md](../CLAUDE.md) - Claude Code project instructions
