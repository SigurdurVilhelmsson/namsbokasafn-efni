# Námsbókasafn - Translation Pipeline

A translation workflow and content pipeline for producing Icelandic translations of [OpenStax](https://openstax.org/) educational textbooks. Includes CLI tools for the Extract-Inject-Render pipeline, a web-based editorial workflow server with GitHub OAuth, and the translated content itself. The translations are published at [namsbokasafn.is](https://namsbokasafn.is) via the sister repository [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur).

## About

High-quality science textbooks in Icelandic are scarce. This project takes freely-licensed OpenStax textbooks and translates them through a structured pipeline: machine translation as a starting point, followed by two rounds of human editorial review — first for linguistic accuracy, then for localization (SI units, Icelandic context, adapted examples).

The pipeline produces three distinct assets, each valuable on its own:

1. **Faithful translations** — Human-verified Icelandic translations that accurately reflect the source text. Academically citable.
2. **Translation memory** — Segment-aligned EN-IS parallel corpus in TMX format. Useful for training MT systems, fine-tuning Icelandic language models, and other translation projects.
3. **Localized content** — Versions adapted specifically for Icelandic secondary school students, with SI units, local context, and extended exercises where beneficial.

All content is released under CC BY 4.0. The tooling is MIT-licensed. If you're working on textbook translation for another language, the pipeline and tools are designed to be reusable.

### Books

| Book | Source | Status | Published |
|------|--------|--------|-----------|
| **Efnafraedi** (Chemistry 2e) | [OpenStax](https://openstax.org/details/books/chemistry-2e) | In progress | [namsbokasafn.is](https://namsbokasafn.is) |
| **Liffraedi** (Biology 2e) | [OpenStax](https://openstax.org/details/books/biology-2e) | Planned | — |

## Demo / Live Version

**[https://namsbokasafn.is](https://namsbokasafn.is)** — the published translations are read through the [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur) reader.

**[https://ritstjorn.namsbokasafn.is](https://ritstjorn.namsbokasafn.is)** — the editorial workflow server (requires GitHub OAuth login).

## Tech Stack

- **Runtime:** Node.js >= 20 (`.nvmrc` specifies 20)
- **Pipeline tools:** Custom CLI scripts in `tools/` (ES modules)
- **Server:** Express 4 (CommonJS), better-sqlite3, GitHub OAuth (JWT), Helmet, rate limiting
- **Content format:** CNXML (OpenStax source) → extracted segments → translated → injected → rendered to HTML
- **Math:** MathJax 4 for equation rendering in HTML output
- **Testing:** Vitest (root), ESLint + Prettier, Husky pre-commit hooks
- **CI:** GitHub Actions (lint, test, validate, security, docs-check)

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0 (see `.nvmrc`)
- npm

For the workflow server in production:
- GitHub OAuth app credentials ([create one here](https://github.com/settings/developers))
- SMTP server (optional, for email notifications)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/SigurdurVilhelmsson/namsbokasafn-efni.git
cd namsbokasafn-efni
npm install
```

### 2. Install the server

The workflow server has its own `package.json`:

```bash
npm run server:install
```

### 3. Environment variables (server)

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `3000`) |
| `HOST` | No | Bind address (default: `localhost`) |
| `BASE_URL` | No | Public URL for email links (default: `http://localhost:3000`) |
| `GITHUB_CLIENT_ID` | **Production** | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | **Production** | GitHub OAuth app client secret |
| `JWT_SECRET` | **Production** | Session token secret (>= 32 chars) |
| `ADMIN_EMAIL` | No | Email address for feedback notifications |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` / `SMTP_PASS` | No | SMTP credentials |
| `MATECAT_API_KEY` | No | Matecat API key for TM creation |
| `OPENSTAX_ARCHIVE_URL` | No | OpenStax archive URL (has default) |

In development, the server runs without GitHub OAuth — authentication is bypassed locally.

### 4. Run the workflow server

```bash
npm run server:dev    # Development with watch mode
# or
npm run server        # Production mode
```

Open [http://localhost:3000/workflow](http://localhost:3000/workflow)

### 5. Run CLI tools

The pipeline tools are run directly:

```bash
node tools/cnxml-extract.js --book efnafraedi --chapter 01
node tools/cnxml-inject.js --book efnafraedi --chapter 01 --track faithful
node tools/cnxml-render.js --book efnafraedi --chapter 01 --track faithful
```

See [docs/technical/cli-reference.md](docs/technical/cli-reference.md) for full usage.

## The Pipeline

The translation pipeline follows an Extract-Inject-Render sequence:

```
CNXML (OpenStax) → Extract segments → Machine translate → Human review → Inject → Render to HTML
```

| Step | Tool | Input | Output |
|------|------|-------|--------|
| 1a | `cnxml-extract` | CNXML source | EN segments + document structure |
| 1b | `protect-segments-for-mt` | EN segments | MT-safe segments |
| 2 | malstadur.is (external) | MT-safe segments | Raw IS translation |
| 3 | Web editor / manual | MT output | Reviewed faithful translation |
| 4 | `prepare-for-align` + Matecat | EN + IS segments | Translation memory (TMX) |
| 5a | `cnxml-inject` | Reviewed segments + structure | Translated CNXML |
| 5b | `cnxml-render` | Translated CNXML | Publication-ready HTML |

### Two-pass editorial process

**Pass 1: Linguistic review** — Editor reviews MT output for language quality, terminology, and accuracy. No localization changes. Output: faithful translation (preserved as-is).

**Pass 2: Localization** — Convert units to SI, add Icelandic context and examples, extend exercises where beneficial. All changes documented in localization logs. Output: localized version for students.

The two-pass approach preserves the faithful translation as a standalone asset while allowing the localized version to diverge for educational purposes.

See [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) for the complete workflow guide.

## Server Deployment

The workflow server runs on a Linode Ubuntu instance.

- **Server path:** on the Linode server (deployed via git pull)
- **Service:** `ritstjorn.service` (systemd)
- **Port:** 3000
- **Domain:** `ritstjorn.namsbokasafn.is`
- **Nginx:** Reverse proxy to port 3000
- **SSL:** Let's Encrypt via certbot
- **Database:** SQLite (`pipeline-output/sessions.db`, auto-created on first run)
- **Auth:** GitHub OAuth with role-based access (admin, head editor, editor, contributor, viewer)

### Deploy / update

```bash
ssh siggi@kvenno.app
cd /path/to/namsbokasafn-efni
git pull
cd server && npm install
sudo systemctl restart ritstjorn
```

See [docs/deployment/linode-deployment-checklist.md](docs/deployment/linode-deployment-checklist.md) for the full deployment guide.

### Workflow server routes

| URL | Description |
|-----|-------------|
| `/workflow` | Step-by-step workflow wizard |
| `/issues` | Issue review dashboard |
| `/images` | Image translation tracker |
| `/status` | Pipeline status overview |
| `/login` | GitHub OAuth login |

## Project Structure

```
namsbokasafn-efni/
├── books/efnafraedi/              # Chemistry book content
│   ├── 01-source/                 # OpenStax CNXML (READ ONLY)
│   ├── 02-for-mt/                 # EN segments for machine translation
│   ├── 02-structure/              # Document structure (JSON)
│   ├── 02-mt-output/              # Raw MT output (READ ONLY)
│   ├── 03-faithful-translation/   # Human-reviewed IS segments
│   ├── 03-translated/             # Translated CNXML (from inject)
│   ├── 04-localized-content/      # Localized version (pass 2)
│   ├── 05-publication/            # Final HTML output
│   │   ├── mt-preview/            #   MT versions (immediate use)
│   │   └── faithful/              #   Human-reviewed versions
│   ├── tm/                        # Translation memory (TMX)
│   └── glossary/                  # Terminology files
├── tools/                         # CLI pipeline tools (7 active)
├── server/                        # Express workflow server
│   ├── routes/                    #   API routes (24 groups)
│   ├── services/                  #   Business logic
│   ├── middleware/                #   Auth, rate limiting
│   ├── views/                     #   HTML pages
│   └── migrations/                #   SQLite migrations
├── scripts/                       # Status updates, validation, doc generation
├── schemas/                       # JSON Schema definitions
└── docs/                          # Comprehensive documentation
```

### File permissions

| Permission | Directories | Rule |
|------------|-------------|------|
| READ ONLY | `01-source/`, `02-mt-output/`, `tm/` | Never modify — original sources |
| WRITABLE | `03-faithful-translation/`, `04-localized-content/`, `05-publication/` | Editorial output |
| GENERATED | `02-for-mt/`, `02-structure/`, `03-translated/` | Regenerated by tools |

## Common Tasks

### Run tests

```bash
npm test                  # Vitest unit tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

### Code quality

```bash
npm run lint              # ESLint (tools/ and scripts/)
npm run format            # Prettier
npm run docs:generate     # Regenerate tool/route inventories
npm run docs:check        # Verify generated docs are up-to-date
```

### Pipeline status

```bash
npm run update-status efnafraedi 01 linguisticReview complete
npm run validate          # Validate all status files
```

### Content sync to reader

After producing new HTML in `05-publication/`, sync to the reader repo:

```bash
# In the namsbokasafn-vefur repo:
node scripts/sync-content.js --source ../namsbokasafn-efni
node scripts/generate-toc.js
```

### Check server logs (production)

```bash
ssh siggi@kvenno.app
sudo journalctl -u ritstjorn -f
```

## Documentation

| Document | Description |
|----------|-------------|
| [Simplified Workflow](docs/workflow/simplified-workflow.md) | 5-step Extract-Inject-Render pipeline |
| [Master Pipeline](docs/workflow/master-pipeline.md) | Complete CNXML-to-HTML reference |
| [Pass 1: Linguistic Review](docs/editorial/pass1-linguistic.md) | First editorial pass instructions |
| [Pass 2: Localization](docs/editorial/pass2-localization.md) | Second editorial pass instructions |
| [Terminology](docs/editorial/terminology.md) | Terminology standards and glossary |
| [CLI Reference](docs/technical/cli-reference.md) | Tool usage and examples |
| [Schemas](docs/technical/schemas.md) | JSON Schema field definitions |
| [Publication Format](docs/technical/publication-format.md) | 3-track publication structure |
| [Deployment](docs/deployment/linode-deployment-checklist.md) | Production server setup |
| [Contributing](docs/contributing/getting-started.md) | How to get involved |

## Contributing

The project needs editors to review translations. No programming experience required — the workflow server guides you through the editorial process.

- **Get started:** [docs/contributing/getting-started.md](docs/contributing/getting-started.md)
- **Bug reports:** [Open an issue](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/issues)

## License

### Dual license

1. **Tools and scripts** (`tools/`, `server/`, `scripts/`) — [MIT License](LICENSE)
2. **Translations and content** (`books/`) — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

### Content attribution

Based on open textbooks from [OpenStax](https://openstax.org/), Rice University.

**Chemistry 2e** — Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson
Translated by Sigurdur E. Vilhelmsson. Licensed under CC BY 4.0.

When using these assets, please attribute:

```
Icelandic translation by Sigurdur E. Vilhelmsson
Original: Chemistry 2e, OpenStax, Rice University
License: CC BY 4.0
```

*This project is not affiliated with OpenStax or Rice University. OpenStax is not responsible for the content of these translations.*

## Status

Actively maintained. Pipeline phases 8–13 complete (as of February 2026). The Extract-Inject-Render pipeline is operational with 49 automated integration tests. New chapters are processed as editorial review progresses.

## Related Projects

- [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur) — Web reader for the published translations
- [kvenno-app](https://github.com/SigurdurVilhelmsson/kvenno-app) — Chemistry games and lab report grading platform
