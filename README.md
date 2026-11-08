# Námsbókasafn - Translation Pipeline

A translation workflow and content pipeline for producing Icelandic translations of [OpenStax](https://openstax.org/) educational textbooks. Includes CLI tools for the Extract-Inject-Render pipeline, a web-based editorial workflow server with Microsoft Entra ID authentication, and the translated content itself. The translations are published at [namsbokasafn.is](https://namsbokasafn.is) via the sister repository [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur).

## About

High-quality science textbooks in Icelandic are scarce. This project takes freely-licensed OpenStax textbooks and translates them through a structured pipeline: machine translation as a starting point, followed by two rounds of human editorial review — first for linguistic accuracy, then for localization (SI units, Icelandic context, adapted examples).

The pipeline produces three distinct assets, each valuable on its own:

1. **Faithful translations** — Human-verified Icelandic translations that accurately reflect the source text. Academically citable.
2. **Translation memory** — Segment-aligned EN-IS parallel corpus in TMX format. Useful for training MT systems, fine-tuning Icelandic language models, and other translation projects.
3. **Localized content** — Versions adapted specifically for Icelandic secondary school students, with SI units, local context, and extended exercises where beneficial.

The project is also a **research evaluation of AI-assisted machine translation**, its cost and its quality. The machine translation is kept exactly as the Málstaður API returned it; an AI review pass and the editors' work are each kept as separate layers, so the three can be compared; and every post-processing step is documented. The rules are in [CLAUDE.md § Purpose](CLAUDE.md#purpose).

Content licensing is **per book, not uniform** — see [Licensing](#licensing). The tooling is MIT-licensed, except the editorial server (`server/`), which is AGPL-3.0. If you're working on textbook translation for another language, the pipeline and tools are designed to be reusable.

### Books

| Book | Slug | Source |
|------|------|--------|
| **Efnafræði** (Chemistry 2e) | `efnafraedi-2e` | [OpenStax](https://openstax.org/details/books/chemistry-2e) |
| **Líffræði** (Biology 2e) | `liffraedi-2e` | [OpenStax](https://openstax.org/details/books/biology-2e) |
| **Örverufræði** (Microbiology) | `orverufraedi` | [OpenStax](https://openstax.org/details/books/microbiology) |
| **Lífræn efnafræði** (Organic Chemistry) | `lifraen-efnafraedi` | [OpenStax](https://openstax.org/details/books/organic-chemistry) — **not translated**, see below |
| **Eðlisfræði** (College Physics 2e) | `edlisfraedi-2e` | [OpenStax](https://openstax.org/details/books/college-physics-2e) |

**Organic Chemistry is not translated.** OpenStax told the project that it cannot
authorise a translation of this book: it was donated by its author and its translation
rights are limited. Its CNXML source and glossary stay in the repository. Record:
[docs/decisions/2026-09-23-organic-translation-stopped-openstax-notice.md](docs/decisions/2026-09-23-organic-translation-stopped-openstax-notice.md).

Each book's licence is in its `books/<slug>/book-config.json` — see [Licensing](#licensing).
Which books reach [namsbokasafn.is](https://namsbokasafn.is) is decided by the publication
allowlist in the reader repo (`scripts/lib/published-books.js` in
[namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur)); how far each
book has been carried through the pipeline is tracked in the active plan in `docs/plans/`, not
here.

`books/` holds a few other directories as well: `stjornufraedi` (Astronomy 2e) was
registered through the server's book intake, `testbook` and `__e2e-fixture__` are test
fixtures, and `_slug-maps/` holds a dated page-rename record.

## Demo / Live Version

**[https://namsbokasafn.is](https://namsbokasafn.is)** — the published translations are read through the [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur) reader.

**[https://ritstjorn.namsbokasafn.is](https://ritstjorn.namsbokasafn.is)** — the editorial workflow server (requires Microsoft login).

## Tech Stack

- **Runtime:** Node.js — the major is in `.nvmrc` and the minimum minor in `package.json`'s `engines` (it is not `.0`); lockfiles must be generated under the npm that ships with it
- **Pipeline tools:** Custom CLI scripts in `tools/` (ES modules)
- **Server:** Express (CommonJS), better-sqlite3, Helmet, express-rate-limit — versions in `server/package.json`
- **Auth:** Microsoft Entra ID (Azure AD), JWT sessions
- **Content format:** CNXML (OpenStax source) → extracted segments → translated → injected → rendered to HTML
- **Machine translation:** Miðeind's Málstaður API (`tools/api-translate.js`)
- **Math:** MathJax (@mathjax/src) with New Computer Modern font
- **Testing:** Vitest (unit) + Playwright (E2E), ESLint, Prettier, Husky — run `npm test`
- **CI:** GitHub Actions — the workflows are in `.github/workflows/` (lint, tests, validate, security audit, docs check)

## Prerequisites

- [Node.js](https://nodejs.org/) — the major version is in `.nvmrc`, the minimum minor in `package.json`'s `engines`. Install at least that minor: `engines` is advisory (Node never reads it), so an older minor of the same major installs cleanly and then throws the first time you run a tool that needs a newer one.
- npm
- For the server: `python3`, `make` and a C++ compiler — npm runs node-gyp when it installs `better-sqlite3`

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

### 3. Environment variables

There are two `.env` files, read by different programs:

- **The server reads `server/.env` only.** It runs from `server/` and loads `.env` from
  there. Start from the template:

  ```bash
  cp server/.env.example server/.env
  ```

  With `NODE_ENV=production` the server refuses to start unless every secret in
  `REQUIRED_PRODUCTION_SECRETS` (`server/config.js`) is set. Every variable the server
  reads is described in [server/README.md § Configuration](server/README.md#configuration).

- **The pipeline tools read a `.env` at the repo root**, and only when the variable is not
  already in the environment: `MALSTADUR_API_KEY` for the Málstaður API
  (`tools/api-translate.js`, `tools/translate-chapter-titles.js`) and `ANTHROPIC_API_KEY`
  for the AI-review harness (`tools/ai-review/`). Both files are git-ignored.

### 4. Run the workflow server

```bash
npm run server:dev    # Development with watch mode
# or
npm run server        # Production mode
```

Open [http://localhost:3000](http://localhost:3000) (or the `PORT` you set).

### 5. Run CLI tools

The pipeline tools are run directly. The CNXML tools take `--book` and `--chapter` as flags,
not positional arguments:

```bash
# 1. Extract English segments from the CNXML source
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 1
# 2. Plan the machine translation and estimate its cost (a live run is paid, and refuses
#    without exactly one glossary choice: --no-glossary, --glossary-only <list> or --full-glossary)
node tools/api-translate.js --book efnafraedi-2e --chapter 1 --dry-run
# 3. Inject the machine translation into CNXML and render the mt-preview track
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track mt-preview
# Faithful: one reviewed module, as the server runs it (a full-chapter faithful inject fails each unreviewed module by design; never --allow-en-fallback)
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --module <moduleId> --source-dir 03-faithful-translation
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --module <moduleId> --track faithful
```

`api-translate.js` reads the generated `02-for-mt/`, so after any change to extraction,
re-extract before you translate. See [docs/technical/cli-reference.md](docs/technical/cli-reference.md)
for full usage and [docs/workflow/config-and-rerun-guide.md](docs/workflow/config-and-rerun-guide.md)
for what to re-run after a change.

## The Pipeline

```
CNXML (OpenStax) → Extract segments → Machine translate → Human review → Inject → Render to HTML
```

The tools are `cnxml-extract` → `api-translate` → (editor review in the web server) →
`cnxml-inject` → `cnxml-render`, with `generate-tm` building the translation memory from
reviewed segments. The step-by-step guide is
[docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md).

### Two-pass editorial process

**Pass 1: Linguistic review** — Editor reviews MT output for language quality, terminology, and accuracy. No localization changes. Output: faithful translation (preserved as-is).

**Pass 2: Localization** — Convert units to SI, add Icelandic context and examples, extend exercises where beneficial. All changes documented in localization logs. Output: localized version for students.

The two-pass approach preserves the faithful translation as a standalone asset while allowing the localized version to diverge for educational purposes.

## Server Deployment

The workflow server runs on a Linode Ubuntu instance.

- **Deploy:** `./scripts/deploy.sh` (the single deploy path — see below)
- **Service:** `ritstjorn.service` (systemd)
- **Domain:** `ritstjorn.namsbokasafn.is`
- **Nginx:** Reverse proxy to the server's port
- **SSL:** Let's Encrypt via certbot
- **Database:** SQLite (`pipeline-output/sessions.db`, auto-migrated on startup)
- **Auth:** Microsoft Entra ID with role-based access — the roles are `ROLES` in `server/constants.js`

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

The server's pages and API are described in [server/README.md](server/README.md).

## Project Structure

```
namsbokasafn-efni/
├── books/<slug>/                 # One directory per book (chemistry's layout shown)
│   ├── 01-source/                # OpenStax CNXML (READ ONLY; licence-bearing)
│   ├── 02-for-mt/                # EN segments for machine translation (generated)
│   ├── 02-structure/             # Document structure JSON (generated)
│   ├── 02-mt-output/             # Machine translation as received (READ ONLY)
│   ├── 02-mt-selected/           # Research layers, written only by their tools
│   ├── 02-mt-revised/            #   (tools/lib/mt-layers.js)
│   ├── ai-review/                #   and the AI-review harness
│   ├── 03-faithful-translation/  # Editor-approved IS segments
│   ├── 03-translated/            # Translated CNXML (from inject)
│   ├── 04-localized-content/     # Localized IS segments (Pass 2)
│   ├── 05-publication/           # Rendered HTML, one directory per track
│   │                             #   (mt-preview/, faithful/, localized/ — each
│   │                             #   exists once something is rendered to it)
│   ├── media/                    # Images, incl. translated figures (image-mapping.json)
│   ├── tm/                       # Translation memory (TMX)
│   ├── glossary/                 # Terminology files
│   └── book-config.json          # Per-book configuration, incl. the licence
├── tools/                        # CLI pipeline tools -> docs/_generated/tools.md
├── server/                       # Ritstjóri, the editorial server -> server/README.md
├── scripts/                      # Deploy, backups, validation, doc generation
├── schemas/                      # JSON Schema definitions
├── experiments/                  # Research experiments and their evidence
├── test-results/                 # Dated measurement artefacts
└── docs/                         # Documentation -> docs/README.md
```

Which directories may be edited, which are generated and which are written only by tools is
a project rule: see [CLAUDE.md § File Permissions](CLAUDE.md#file-permissions). In short,
`01-source/` and `02-mt-output/` are never edited by hand.

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
npm run format            # Prettier (CI runs `npm run format:check`)
npm run docs:generate     # Regenerate tool/route inventories
npm run docs:check        # Verify generated docs are up-to-date
```

### Pipeline status

```bash
npm run validate          # Validate all status files
```

### Content sync to reader

Delivery to readers is manual and runs from the reader repo:

```bash
# In the namsbokasafn-vefur repo:
node scripts/sync-content.js --source ../namsbokasafn-efni
```

The sync regenerates `toc.json` itself and copies only the books on its allowlist. Building
and deploying the reader are vefur's steps — see that repo's documentation. Why this leg is
manual: [CLAUDE.md](CLAUDE.md), section *Content delivery to readers is MANUAL*.

### Check server logs (production)

```bash
sudo journalctl -u ritstjorn -f
```

## Documentation

| Document | Description |
|----------|-------------|
| [Documentation index](docs/README.md) | Everything under `docs/`, by audience |
| [Simplified Workflow](docs/workflow/simplified-workflow.md) | 5-step Extract-Inject-Render pipeline |
| [Config and re-run guide](docs/workflow/config-and-rerun-guide.md) | What to edit by hand and what to re-run |
| [Editor Guide](docs/editor-guide/README.md) | Walkthrough of the editorial server for editors |
| [Pass 1: Linguistic Review](docs/editorial/pass1-linguistic.md) | First editorial pass instructions |
| [Pass 2: Localization](docs/editorial/pass2-localization.md) | Second editorial pass instructions |
| [Terminology](docs/editorial/terminology.md) | Terminology standards and glossary |
| [CLI Reference](docs/technical/cli-reference.md) | Tool usage and examples |
| [Schemas](docs/technical/schemas.md) | JSON Schema field definitions |
| [Publication Format](docs/technical/publication-format.md) | 3-track publication structure |
| [Deployment](docs/deployment/linode-deployment-checklist.md) | Production server setup |
| [Licence provenance](docs/provenance/openstax-cnxml-licence-provenance.md) | Why each book carries the licence it does |
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
| `books/` — translated content | **per-book Creative Commons** | [below](#content-licensing-is-per-book) |

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
copy obtained under it — so the books differ, and no blanket claim is accurate.
**Some books are CC BY-NC-SA 4.0: they may not be used commercially, and any
adaptation you distribute must itself be CC BY-NC-SA 4.0.** Check a book's licence
before you reuse it.

The authoritative source is the `licence` block in each `books/<slug>/book-config.json`.
To list them all:

```bash
node -e 'const fs=require("fs");for(const b of fs.readdirSync("books")){const f=`books/${b}/book-config.json`;if(!fs.existsSync(f))continue;const l=JSON.parse(fs.readFileSync(f,"utf8")).licence;if(l)console.log(b.padEnd(22),l.code)}'
```

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
