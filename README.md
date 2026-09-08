# Námsbókasafn - Translation Pipeline

A translation workflow and content pipeline for producing Icelandic translations of [OpenStax](https://openstax.org/) educational textbooks. Includes CLI tools for the Extract-Inject-Render pipeline, a web-based editorial workflow server with Microsoft Entra ID authentication, and the translated content itself. The translations are published at [namsbokasafn.is](https://namsbokasafn.is) via the sister repository [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur).

## About

High-quality science textbooks in Icelandic are scarce. This project takes freely-licensed OpenStax textbooks and translates them through a structured pipeline: machine translation as a starting point, followed by two rounds of human editorial review — first for linguistic accuracy, then for localization (SI units, Icelandic context, adapted examples).

The pipeline produces three distinct assets, each valuable on its own:

1. **Faithful translations** — Human-verified Icelandic translations that accurately reflect the source text. Academically citable.
2. **Translation memory** — Segment-aligned EN-IS parallel corpus in TMX format. Useful for training MT systems, fine-tuning Icelandic language models, and other translation projects.
3. **Localized content** — Versions adapted specifically for Icelandic secondary school students, with SI units, local context, and extended exercises where beneficial.

Content licensing is **per book, not uniform** — see [Licensing](#licensing). The tooling is MIT-licensed, except the editorial server (`server/`), which is AGPL-3.0. If you're working on textbook translation for another language, the pipeline and tools are designed to be reusable.

### Books

| Book | Slug | Source | Licence |
|------|------|--------|---------|
| **Efnafræði** (Chemistry 2e) | `efnafraedi-2e` | [OpenStax](https://openstax.org/details/books/chemistry-2e) | CC BY 4.0 |
| **Líffræði** (Biology 2e) | `liffraedi-2e` | [OpenStax](https://openstax.org/details/books/biology-2e) | CC BY 4.0 |
| **Örverufræði** (Microbiology) | `orverufraedi` | [OpenStax](https://openstax.org/details/books/microbiology) | CC BY 4.0 |
| **Lífræn efnafræði** (Organic Chemistry) | `lifraen-efnafraedi` | [OpenStax](https://openstax.org/details/books/organic-chemistry) | **CC BY-NC-SA 4.0** |
| **Eðlisfræði** (College Physics 2e) | `edlisfraedi-2e` | [OpenStax](https://openstax.org/details/books/college-physics-2e) | **CC BY-NC-SA 4.0** |

Which of these actually reach [namsbokasafn.is](https://namsbokasafn.is) is decided by the
publication allowlist in the reader repo (`scripts/lib/published-books.js` in
[namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur)); how far each
book has been carried through the pipeline is tracked in `docs/plans/`, not here.

## Demo / Live Version

**[https://namsbokasafn.is](https://namsbokasafn.is)** — the published translations are read through the [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur) reader.

**[https://ritstjorn.namsbokasafn.is](https://ritstjorn.namsbokasafn.is)** — the editorial workflow server (requires Microsoft login).

## Tech Stack

- **Runtime:** Node.js — the major is in `.nvmrc` and the minimum minor in `package.json`'s `engines` (it is not `.0`); lockfiles must be generated under the npm that ships with it
- **Pipeline tools:** Custom CLI scripts in `tools/` (ES modules)
- **Server:** Express (CommonJS), better-sqlite3, Helmet, express-rate-limit — versions in `server/package.json`
- **Auth:** Microsoft Entra ID (Azure AD), JWT sessions
- **Content format:** CNXML (OpenStax source) → extracted segments → translated → injected → rendered to HTML
- **Math:** MathJax (@mathjax/src) with New Computer Modern font
- **Testing:** Vitest (unit) + Playwright (E2E), ESLint, Prettier, Husky — run `npm test`
- **CI:** GitHub Actions (lint, test, validate, security, docs-check)

## Prerequisites

- [Node.js](https://nodejs.org/) — the major version is in `.nvmrc`, the minimum minor in `package.json`'s `engines`. Install at least that minor: `engines` is advisory (Node never reads it), so an older minor of the same major installs cleanly and then throws the first time you run a tool that needs a newer one.
- npm

For the workflow server in production:
- Microsoft Entra ID app registration ([Azure Portal](https://portal.azure.com/))
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

> **Note:** the server's `xlsx` dependency installs from the official SheetJS
> CDN (`cdn.sheetjs.com`), not the npm registry — npm stopped receiving
> SheetJS releases at 0.18.5, which has unfixed security advisories. Any
> machine running `npm ci`/`npm install` for the server (including the
> production host) must be able to reach `cdn.sheetjs.com`. Dependabot does
> not auto-update URL dependencies; xlsx version bumps are manual.

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
| `MICROSOFT_CLIENT_ID` | **Production** | Microsoft Entra ID app client ID |
| `MICROSOFT_CLIENT_SECRET` | **Production** | Microsoft Entra ID app client secret |
| `MICROSOFT_TENANT_ID` | **Production** | Azure AD tenant ID |
| `MICROSOFT_REDIRECT_URI` | **Production** | OAuth redirect URI (e.g. `https://ritstjorn.namsbokasafn.is/api/auth/callback`) |
| `JWT_SECRET` | **Production** | Session token secret (>= 32 chars) |
| `ADMIN_EMAIL` | No | Email address for feedback notifications |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` / `SMTP_PASS` | No | SMTP credentials |
| `OPENSTAX_ARCHIVE_URL` | No | OpenStax archive URL (has default) |

<!-- MATECAT_API_KEY was removed from the table above on 2026-08-07 (C16 audit): Matecat Align
     was retired, TMX is generated in-house by tools/generate-tm.js, and nothing reads that
     variable. NOTE: this comment sits BELOW the table on purpose — placed between rows, an
     HTML comment plus a blank line terminates a GFM table, and the row after it rendered as
     literal pipe text on the public README. Caught by the C16 adversarial review. -->


### 4. Run the workflow server

```bash
npm run server:dev    # Development with watch mode
# or
npm run server        # Production mode
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Run CLI tools

The pipeline tools are run directly:

```bash
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 01
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 01 --track faithful
node tools/cnxml-render.js --book efnafraedi-2e --chapter 01 --track faithful
```

See [docs/technical/cli-reference.md](docs/technical/cli-reference.md) for full usage.

## The Pipeline

The translation pipeline follows an Extract-Inject-Render sequence:

```
CNXML (OpenStax) → Extract segments → Machine translate → Human review → Inject → Render to HTML
```

| Step | Tool | Input | Output |
|------|------|-------|--------|
| 1 | `cnxml-extract` | CNXML source | EN segments + document structure |
| 2 | `api-translate` (Málstaður API) | EN segments | Raw IS translation |
| 3 | Web segment editor / manual | MT output | Reviewed faithful translation |
| 4 | `generate-tm` | EN + reviewed IS segments | Translation memory (TMX), in-house |
| 5a | `cnxml-inject` | Reviewed segments + structure | Translated CNXML |
| 5b | `cnxml-render` | Translated CNXML | Publication-ready HTML |

<!-- Corrected 2026-08-07 by the C16 audit (docs/audit/2026-08-07-c16-partially-live-legacy-audit.md).
     Three rows described a retired pipeline: `protect-segments-for-mt` is ARCHIVED (bracket
     markers made it unnecessary); machine translation goes through tools/api-translate.js, NOT a
     manual upload to malstadur.is; and TMX is generated in-house by tools/generate-tm.js — the
     `prepare-for-align` + Matecat Align step was retired. CLAUDE.md § Extract-Inject-Render is
     the canonical table; keep this one in step with it. -->


### Two-pass editorial process

**Pass 1: Linguistic review** — Editor reviews MT output for language quality, terminology, and accuracy. No localization changes. Output: faithful translation (preserved as-is).

**Pass 2: Localization** — Convert units to SI, add Icelandic context and examples, extend exercises where beneficial. All changes documented in localization logs. Output: localized version for students.

The two-pass approach preserves the faithful translation as a standalone asset while allowing the localized version to diverge for educational purposes.

See [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) for the complete workflow guide.

## Server Deployment

The workflow server runs on a Linode Ubuntu instance.

- **Deploy:** `./scripts/deploy.sh` (the single deploy path — see below)
- **Service:** `ritstjorn.service` (systemd)
- **Port:** 3000
- **Domain:** `ritstjorn.namsbokasafn.is`
- **Nginx:** Reverse proxy to port 3000
- **SSL:** Let's Encrypt via certbot
- **Database:** SQLite (`pipeline-output/sessions.db`, auto-migrated on startup)
- **Auth:** Microsoft Entra ID with role-based access (admin, head editor, editor, contributor, viewer)

### Deploy / update

```bash
cd namsbokasafn-efni
./scripts/deploy.sh
```

`deploy.sh` is the single deploy path — pinned by
`tools/__tests__/deployPathSingleSource.test.js`. Do not hand-run the steps: it backs up the
database first, pins Node to the systemd runtime before any `npm` runs, re-asserts the `ours`
merge driver the pull needs, and stashes and re-applies the editorial changes the server has
made on disk. A manual `git pull` skips all four.

See [docs/deployment/linode-deployment-checklist.md](docs/deployment/linode-deployment-checklist.md) for the full deployment guide.

### Web interface routes

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

## Project Structure

```
namsbokasafn-efni/
├── books/efnafraedi-2e/          # Chemistry 2e content
│   ├── 01-source/                # OpenStax CNXML (READ ONLY)
│   ├── 02-for-mt/                # EN segments for machine translation
│   ├── 02-structure/             # Document structure (JSON)
│   ├── 02-mt-output/             # Raw MT output (READ ONLY)
│   ├── 03-faithful-translation/  # Human-reviewed IS segments
│   ├── 03-translated/            # Translated CNXML (from inject)
│   ├── 04-localized-content/     # Localized version (pass 2)
│   ├── 05-publication/           # Final HTML output
│   │   ├── mt-preview/           #   MT versions (immediate use)
│   │   ├── faithful/             #   Human-reviewed versions
│   │   └── localized/            #   Localized versions
│   ├── tm/                       # Translation memory (TMX)
│   └── glossary/                 # Terminology files
├── books/liffraedi-2e/           # Biology 2e (proof-of-concept)
├── tools/                        # CLI pipeline tools -> docs/_generated/tools.md
├── server/                       # Express workflow server
│   ├── routes/                   #   API routes -> docs/_generated/routes.md
│   ├── services/                 #   Business logic
│   ├── middleware/               #   Auth, roles, validation
│   ├── views/                    #   HTML pages
│   └── migrations/               #   SQLite migrations
├── scripts/                      # Status updates, validation, doc generation
├── schemas/                      # JSON Schema definitions
└── docs/                         # Comprehensive documentation
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
npm test                  # Vitest unit tests (run from the repo root)
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
cd server && npm run test:e2e   # Playwright E2E tests (a separate CI job; `npm test` does not run them)
```

### Code quality

```bash
npm run lint              # ESLint — scope is package.json's `lint` script
npm run format            # Prettier
npm run docs:generate     # Regenerate tool/route inventories
npm run docs:check        # Verify generated docs are up-to-date
```

### Pipeline status

```bash
npm run update-status efnafraedi-2e 01 linguisticReview complete
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

## Licensing

Three licences apply, depending on where a file lives:

| Path | Licence | |
|------|---------|---|
| `tools/`, `scripts/`, `experiments/` — the CNXML extract → MT → inject → render pipeline, plus root config | **MIT** | [LICENSE](LICENSE) |
| `server/` — Ritstjóri, the editorial workflow server (incl. `greynir-sidecar/`) | **AGPL-3.0** | [server/LICENSE](server/LICENSE) |
| `books/` — translated content | **per-book Creative Commons** | [table below](#content-licensing-is-per-book) |

Ritstjóri is AGPL-3.0 because it is normally operated as a network service: if
you run a modified version and let users interact with it over a network, AGPL
section 13 requires you to offer those users your modified source. The pipeline
tooling is MIT so it can be freely reused by other language projects. This split
follows [OpenStax's own convention](https://github.com/openstax): its server-side
and editorial systems (`openstax-cms`, `rex-web`, `poet`, `cnxml`) are AGPL-3.0,
while its build and pipeline tools (`corgi`, `cookbook`) are MIT.

The MIT grant does **not** extend to `server/`. Parts of the MIT tooling do reach into it,
and not all of those reaches are optional: some are unguarded and happen at import time, so
the tool cannot even load without `server/` present — taking `tools/` alone needs
`server/lib/chapterLabel.js` (or an equivalent) beside it. This changes nobody's rights; it
is a combination caveat. **[LICENSE](LICENSE) carries the authoritative enumeration**, with
the search shapes to re-derive it — no copy of that list is kept here, because the copy is
what goes stale.

### Content licensing is per book

Each book's Icelandic derivative carries the licence in force on its OpenStax
source **when that source was obtained**. OpenStax relicensed several titles
CC BY 4.0 → CC BY-NC-SA 4.0 during 2026, and a CC licence is irrevocable for the
copy obtained under it — so these differ, and no blanket claim is accurate.

| Book | Licence |
|------|---------|
| Efnafræði (Chemistry 2e) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Líffræði (Biology 2e) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Örverufræði (Microbiology) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Lífræn efnafræði (Organic Chemistry) | [**CC BY-NC-SA 4.0**](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| Eðlisfræði (College Physics 2e) | [**CC BY-NC-SA 4.0**](https://creativecommons.org/licenses/by-nc-sa/4.0/) |

**Lífræn efnafræði and Eðlisfræði carry no commercial rights and no
non-ShareAlike rights.** You may not use them commercially, and any adaptation
you distribute must itself be CC BY-NC-SA 4.0.

Authoritative source: the `licence` block in `books/<slug>/book-config.json`.
Evidence and reasoning: [docs/provenance/openstax-cnxml-licence-provenance.md](docs/provenance/openstax-cnxml-licence-provenance.md).
See [LICENSE](LICENSE) for the full terms.

### Content attribution

Based on open textbooks from [OpenStax](https://openstax.org/), Rice University.

**Credit follows the method, not the job title.** Every book's first draft is
machine translation (Erlendur, Miðeind) which people then edit — so the machine
is the translator, and the people are credited for **ritstjórn** and
**yfirlestur**. No reviewer is credited on chapters that have not actually been
reviewed; chapters marked *forskoðun* (preview) are raw machine translation.

| Hlutverk | |
|----------|---|
| Verkefnastjóri og ritstjórn | Sigurður Einar Vilhelmsson |
| Yfirlestur og málfar í efnafræði | Guðrún Ingibjörg Stefánsdóttir |
| Yfirlestur og ritstjórn í líffræði | Þórhallur Halldórsson |
| Vélþýðing | Erlendur ([Miðeind](https://mideind.is/)) |
| Íðorð | Íðorðabankinn (Árnastofnun), Efnafræðifélag Íslands |

*Biology chapter 3 was originally translated by hand. That translation covered
205 of its 429 segments, so the book was re-translated by machine in July 2026
and the human version is preserved verbatim as an editing reference
(`books/liffraedi-2e/reference-translations/ch03-human-docx/`). The credit above
reflects the method now in use.*

**Chemistry 2e** — Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson.
Icelandic edition: machine translation with human editorial review. CC BY 4.0.

When reusing this content, attribute it like this — and use **the licence of the
specific book** (see the table above; two books are CC BY-NC-SA 4.0):

```
Íslensk vélþýðing (Erlendur, Miðeind), ritstjórn og yfirlestur: Námsbókasafn.
Original: Chemistry 2e, OpenStax, Rice University
License: CC BY 4.0
```

*This project is not affiliated with OpenStax or Rice University. OpenStax is not responsible for the content of these translations.*

## Status

Actively maintained. The Extract-Inject-Render pipeline, the multi-book rendering configuration
and the Microsoft Entra ID authentication migration are all in production use.

**What is being worked on right now, and how far each book has got, lives in one place:** the
active register under [`docs/plans/`](docs/plans/) — currently
[2026-07-21-post-item17-followup-campaign.md](docs/plans/2026-07-21-post-item17-followup-campaign.md),
whose ⏩ RESUME block is the entry point. Nothing outside it tracks open work, deliberately: a
second copy of a status is the copy that goes stale.

Live CI status is the
[Actions tab](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/actions) — no document in
this repository asserts a green or red verdict, this one included.

## Related Projects

- [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur) — Web reader for the published translations
- [kvenno-app](https://github.com/SigurdurVilhelmsson/kvenno-app) — Chemistry games and lab report grading platform
