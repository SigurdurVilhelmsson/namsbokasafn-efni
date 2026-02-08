# Translation Pipeline Server

Web-based automation server for the OpenStax translation pipeline. Provides a guided workflow interface, issue tracking, image management, and GitHub-based content sync.

> **📚 For complete API reference:** See [`docs/_generated/routes.md`](../docs/_generated/routes.md) which documents all 200+ endpoints across 28 route groups. This README provides setup instructions and a high-level feature overview.

## Quick Start

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your GitHub OAuth credentials
npm start
```

Server runs at http://localhost:3000

## Features

### Phase 1: Processing API
- **CNXML Processing**: Convert OpenStax CNXML to Markdown and XLIFF
- **Module Fetching**: Fetch modules directly from OpenStax GitHub
- **Status Tracking**: Query pipeline status for books and chapters
- **Matecat Integration**: Create translation projects via Matecat API

### Phase 2: Workflow Management
- **GitHub OAuth**: Authenticate users via GitHub with role-based access
- **Guided Workflows**: Step-by-step wizard for translation pipeline
- **Issue Classification**: Automatic categorization of translation issues
- **Image Tracking**: Track translation status of figures with text
- **PR-Based Sync**: Create pull requests to sync approved content

## Web Interface

| URL | Description |
|-----|-------------|
| `/workflow` | Multi-step workflow wizard |
| `/issues` | Issue review dashboard |
| `/images` | Image translation tracker |
| `/status` | Pipeline status overview |
| `/login` | GitHub authentication |

## API Endpoints

### Phase 1 - Processing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/modules` | GET | List available OpenStax modules |
| `/api/modules/:moduleId` | GET | Get module details |
| `/api/process/cnxml` | POST | Process CNXML file through pipeline |
| `/api/process/module/:moduleId` | POST | Process module by ID |
| `/api/status/:book` | GET | Get pipeline status for book |
| `/api/status/:book/:chapter` | GET | Get chapter status |
| `/api/matecat/projects` | POST | Create Matecat project |

### Phase 2 - Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | GET | Initiate GitHub OAuth flow |
| `/api/auth/callback` | GET | OAuth callback handler |
| `/api/auth/me` | GET | Get current user info |
| `/api/auth/logout` | POST | Clear authentication |

### Phase 2 - Workflow

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workflow/start` | POST | Start new workflow session |
| `/api/workflow/sessions` | GET | List active sessions |
| `/api/workflow/:sessionId` | GET | Get session status |
| `/api/workflow/:sessionId/upload/:step` | POST | Upload file for step |
| `/api/workflow/:sessionId/advance` | POST | Advance to next step |

### Phase 2 - Issues

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/issues` | GET | List pending issues |
| `/api/issues/stats` | GET | Issue statistics |
| `/api/issues/:id/resolve` | POST | Resolve single issue |
| `/api/issues/batch-resolve` | POST | Batch resolve issues |
| `/api/issues/auto-fix` | POST | Apply automatic fixes |

### Phase 2 - Content Sync

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/prepare` | POST | Validate files for sync |
| `/api/sync/create-pr` | POST | Create GitHub pull request |
| `/api/sync/status/:prNumber` | GET | Check PR status |

### Phase 2 - Images

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/images/:book` | GET | Book image overview |
| `/api/images/:book/:chapter` | GET | Chapter image details |
| `/api/images/:book/:chapter/:id/upload` | POST | Upload translated image |

## Configuration

Copy `.env.example` to `.env` and configure:

### Required

```env
# GitHub OAuth (create app at https://github.com/settings/developers)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/callback
GITHUB_ORG=namsbokasafn

# JWT for sessions
JWT_SECRET=change-this-to-a-secure-random-string
```

### Optional

```env
# Server
PORT=3000
HOST=localhost
NODE_ENV=development

# GitHub repository for PR sync
GITHUB_REPO_OWNER=namsbokasafn
GITHUB_REPO_NAME=namsbokasafn-efni
GITHUB_BASE_BRANCH=main

# Matecat API
MATECAT_API_KEY=your_api_key

# OneDrive/SharePoint for image source links
ONEDRIVE_BASE_URL=onedrive://Namsbokasafn
```

## Architecture

```
server/
├── index.js              # Express entry point
├── routes/
│   ├── auth.js           # GitHub OAuth endpoints
│   ├── workflow.js       # Workflow session management
│   ├── issues.js         # Issue tracking
│   ├── sync.js           # GitHub PR creation
│   ├── images.js         # Image translation tracking
│   ├── views.js          # HTML page serving
│   ├── process.js        # CNXML processing (Phase 1)
│   ├── modules.js        # OpenStax module fetching (Phase 1)
│   ├── status.js         # Pipeline status (Phase 1)
│   └── matecat.js        # Matecat integration (Phase 1)
├── services/
│   ├── auth.js           # JWT + GitHub OAuth logic
│   ├── session.js        # Workflow session persistence
│   ├── issueClassifier.js # Issue categorization
│   ├── github.js         # GitHub API client
│   ├── imageTracker.js   # Image status tracking
│   └── matecat.js        # Matecat API client
├── middleware/
│   ├── requireAuth.js    # JWT validation
│   └── requireRole.js    # Role-based access control
└── views/
    ├── login.html        # GitHub login page
    ├── workflow.html     # Workflow wizard
    ├── issues.html       # Issue dashboard
    ├── images.html       # Image tracker
    └── status.html       # Status overview
```

## Role-Based Access

Roles are determined by GitHub organization/team membership:

| Role | Access | GitHub Mapping |
|------|--------|----------------|
| Admin | Full access | Organization owners |
| Head Editor | Manage specific book | `book-{id}-head` team |
| Editor | Review content, resolve issues | `editors` team |
| Contributor | Upload translations | `contributors` team |
| Viewer | Read-only access | Organization members |

## Issue Classification

Issues detected during processing are automatically categorized:

| Category | Examples | Action |
|----------|----------|--------|
| `AUTO_FIX` | Whitespace, trailing spaces | Applied automatically |
| `EDITOR_CONFIRM` | Terminology suggestions | Editor reviews |
| `BOARD_REVIEW` | New terminology, policy | Editorial board decides |
| `BLOCKED` | Copyright concerns | Manual escalation |

## Workflow Steps

The guided workflow includes 6 steps:

1. **Source**: Select book/chapter or upload CNXML
2. **MT Upload**: Upload machine translation output
3. **Matecat Create**: Generate XLIFF for Matecat project
4. **Matecat Review**: Upload reviewed XLIFF from Matecat
5. **Issue Review**: Review and resolve flagged issues
6. **Finalize**: Generate final outputs and sync

## Dependencies

```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "cookie-parser": "^1.4.6",
  "jsonwebtoken": "^9.0.2",
  "multer": "^1.4.5-lts.1",
  "archiver": "^6.0.1",
  "uuid": "^9.0.1",
  "dotenv": "^16.3.1"
}
```

## Development

```bash
# Start with auto-reload (Node 18+)
npm run dev

# Run on custom port
PORT=8080 npm start
```

## Related Documentation

- [Workflow Guide](../docs/workflow/simplified-workflow.md) - 5-step translation pipeline
- [Editorial Guide (Pass 1)](../docs/editorial/pass1-linguistic.md) - Linguistic review instructions
- [Editorial Guide (Pass 2)](../docs/editorial/pass2-localization.md) - Localization instructions
- [CLAUDE.md](../CLAUDE.md) - Claude Code project instructions
