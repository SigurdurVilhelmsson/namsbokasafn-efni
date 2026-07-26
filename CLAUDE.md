# Claude Code Instructions for namsbokasafn-efni

## ⚠️ MANDATORY: Read Documentation Before Pipeline Operations

**Before performing ANY pipeline operation** (processing, publishing, assembling, syncing content), you MUST:

1. **Read** [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) first
2. **Identify** which step(s) of the 5-step workflow apply
3. **Use the documented tools** - never bypass with manual file operations
4. **Follow the documented order** - source fixes go in source directories, not publication directories

**Pipeline operations include:**
- Processing content through any pipeline stage
- Publishing or preparing content for publication
- Splitting or assembling chapter files
- Syncing content between repositories
- Fixing content rendering issues

**DO NOT:**
- Edit files directly in `05-publication/` without using pipeline tools
- Copy files manually between repositories (use sync scripts)
- Edit `toc.json` in -vefur directly (source of truth is in content repo)
- "Quick fix" content issues without understanding the proper workflow

**If documentation is unclear or tools don't work as expected:**
- Report the issue to the user
- Do not work around the tooling with manual operations

---

## 🔒 MANDATORY: Never overwrite local OpenStax CNXML from upstream without double written consent

The CNXML files under `books/*/01-source/` are the **legally load-bearing copies** of the
OpenStax source. The licence that governs each book is the one in force **on the date that
local copy was obtained** (CC licences are irrevocable for the copy you hold). OpenStax has
since relicensed several books CC BY → **CC BY-NC-SA**. Full record:
[docs/provenance/openstax-cnxml-licence-provenance.md](docs/provenance/openstax-cnxml-licence-provenance.md).

**Replacing these files with a fresh pull/clone/download from OpenStax would silently
substitute today's CC BY-NC-SA bytes for the irrevocable CC BY copies — destroying the
provenance basis for Chemistry, Biology, and Microbiology and making their derivatives
unsafe to publish under CC BY.** This is a one-way, hard-to-detect loss.

Therefore, you **MUST NOT** re-download, re-clone, `git pull`, `rsync`, extract, copy, or by
any other means replace or modify any file under `books/*/01-source/` from an OpenStax/CNX
source, **unless ALL of the following happen first, in order:**

1. **Remind the user, in writing, of the ramifications** — that overwriting replaces the
   irrevocable CC BY copies with current CC BY-NC-SA upstream content and cannot be undone
   without restoring from git history; name exactly which book(s)/files would be touched.
2. **Obtain the user's explicit written confirmation** — a typed message clearly authorizing
   the specific overwrite.
3. **Obtain a SECOND, separate written confirmation.** A bare "yes" / "ok" / "go ahead" /
   pressing Enter on a permission prompt is **NOT** sufficient. The user must type a distinct,
   unambiguous second consent for the named operation.

No accidental "hit Enter for consent." If any of the three steps is missing, **do not
proceed** — stop and report. This guard is in addition to the general `01-source/` READ-ONLY
rule below; it specifically covers the *replace-from-upstream* path, which a re-download could
otherwise bypass.

---

## 🌐 THIS REPOSITORY IS PUBLIC (since 2026-07-25)

Assume anything committed is world-readable immediately. A pre-publication audit +
remediation shipped first (efni `ba5e9a89`…`cb919966`); full record in memory
`pre-publication-2026-07-25`.

**Three licences, by path — do not conflate them:**

| Path | Licence | File |
|---|---|---|
| `tools/`, `scripts/`, root config | **MIT** | root `LICENSE` |
| `server/` incl. `greynir-sidecar/` — Ritstjóri | **AGPL-3.0** | `server/LICENSE` |
| `books/` | **per-book Creative Commons** | `books/<slug>/book-config.json` is authoritative |

- **Never make a blanket "all content is CC BY 4.0" claim.** Organic Chemistry and
  College Physics are **CC BY-NC-SA 4.0** (no commercial, ShareAlike). That exact
  over-grant was the audit's blocking finding.
- The AGPL/MIT split mirrors OpenStax's own convention (their server-side systems are
  AGPL-3.0, build tooling MIT).
- **Known gap E-2:** `tools/api-translate.js:1003` has one optional `require()` into
  `server/services/pipelineStatusService.js` — MIT tooling reaching AGPL code. Guarded
  by try/catch; documented in both LICENSE and README. Sever it if you touch that file.
- **Credit follows the METHOD:** the machine is the translator; people get *ritstjórn*
  / *yfirlestur*. Never write "Translated by \<person\>" for MT content —
  `books/*/metadata.json`, `templates/frontmatter.yaml` and both READMEs follow this.
  - **⚠️ CHANGED 2026-07-26 — no book is human-translated any more.** This line used to
    read "Only biology is human-translated (Þýðing)". Biology ch03 *was* a human docx
    translation (`docx-import`), but it covered only **205 of 429 segments**, which is why
    the published chapter shipped with an empty summary page and no key-terms page. Per a
    lead decision the whole book is now machine-translated and the editor edits the MT
    instead; ch03 was re-translated 2026-07-25. The human translation is preserved verbatim
    at `books/liffraedi-2e/reference-translations/ch03-human-docx/` (+ README) as an
    editing reference — it is **not** in the pipeline. **Biology is now MT +
    *ritstjórn*, like every other book.** Check `02-mt-output/*-provenance.json`
    (`"tool": "api-translate"` vs `"docx-import"`) before asserting how anything was
    translated — segment counts tell you how much, only provenance tells you by whom.
- **`.claude/*.local.json` is gitignored at repo level** (`.gitignore:106`). Claude
  Code writes credentials into permission-allowlist strings where they don't look
  like secrets — this is exactly how the sister repo published two live Cloudflare
  tokens for ~5 months. A global `~/.config/git/ignore` does **not** travel with a
  clone; the repo-level rule is the only real protection.

## CI — what actually gates, and how to read a red check

CI was billing-blocked 2026-07-17 → 2026-07-25. It works again.

- **⚠️ `npm run lint` ≠ the Lint job** — CI also runs `npm run format:check`
  (prettier). **`npm test` ≠ the Tests job** — CI also runs Playwright E2E. Verify
  against the workflow files before claiming a branch is green; asserting from a
  subset is how a red `main` goes unnoticed.
- **Duration is the diagnostic**: an infra/billing failure dies in ~3s *before*
  `Current runner version:` appears. Minutes elapsed = a real result.
- All five gating workflows (`lint`, `test`, `validate`, `security`, `docs-check`)
  now have **`workflow_dispatch`** — re-verify from the Actions tab, never by
  inventing a commit.
- **Current state:** Lint ✅ · Security ✅ · unit ✅ (3368) · **e2e ❌ = C2 only**
  (`editor-workflow.spec.js`, `ux-phase2.spec.js` — synthetic segment IDs 404'd by
  the SR-OOS-2 backstop since 2026-07-12). Handoff:
  `docs/plans/2026-07-25-c2-playwright-red-handoff.md`.

---

## Notes for Code Reviewers

This project was built iteratively with AI assistance. Known areas of concern:
- Pipeline tools evolved organically — may have inconsistent patterns
- Error handling may be incomplete in some tools
- Documentation may be ahead of or behind actual implementation in places
- Test suite: ~1168 Vitest unit tests + 137 Playwright E2E tests, all green as of 2026-06-12 (vitest workspace: tools parallel, server sequential). Remediation Units 0–5 added focused suites: `requireRole`, `contentVersionService`, `localizationReviewService`, `assignmentEnforcement`, `applyStatusRebuild`, `segmentEditConflict`, `viewsPageAuth`.

## Purpose

Translation workflow for Icelandic OpenStax textbooks. Produces three assets:
1. **Faithful translations** (03-faithful-translation/) - human-verified, academically citable
2. **Translation memory** (tm/) - human-verified EN↔IS parallel corpus
3. **Localized content** (04-localized-content/, 05-publication/) - adapted for Icelandic students

## Project Context

- **Developer profile:** Chemistry teacher with basic Linux skills, not a professional developer
- **Development method:** Built primarily with Claude Code assistance
- **Server:** Linode Ubuntu, nginx, Node.js
- **Sister repo:** namsbokasafn-vefur (web publishing service)
- **Domain:** namsbokasafn.is (migrated from efnafraedi.app)
- **Authentication:** Microsoft Entra ID (Azure AD) OAuth for the workflow server
- **Scale:** Small educational project — 1-2 developers, ~5 editors

## Tech Stack

- **Runtime:** Node.js **22.x** — `.nvmrc` is the single source of truth, and `tools/__tests__/ci-node-version.test.js` fails if any workflow pin or either `engines` floor drifts from it. Production runs Node 22.x / npm 10.x; dev, prod and **all seven CI workflows** now agree (they pinned the EOL Node 20 until 2026-07-25 — see below). `deploy.yml` deliberately has no pin: its steps run over SSH **on the production server**, so they use the server's own Node.
  - **⚠️ Node 22 is in MAINTENANCE, not Active LTS.** Per the official `nodejs/Release` schedule: v22 Active LTS 2024-10-29 → **maintenance 2025-10-21**, **EOL 2027-04-30**. v20 died **2026-04-30**. **v24 has been Active LTS since 2025-10-28** and drops to maintenance **2026-10-20**; **v26 becomes Active LTS 2026-10-28** (EOL 2029-04-30). (An earlier version of this file claimed "Active LTS until Oct 2027" — wrong on both the status and the date.)
  - **Do not "upgrade to Node 24" as a runtime bump.** It is really an **npm 10 → npm 11 lockfile migration**: npm 11 drops optional `@emnapi/*` peer-dep entries, and the resulting `package-lock.json` breaks prod's `npm ci`. It also means a prod-runtime change plus a native ABI rebuild (cf. the 2026-05-10 ABI incident). Node 22 is supported through the 2026–27 school year. When a quiet window opens, **go 22 → 26 and skip 24** — the npm-11 work is identical either way, but 24's Active-LTS window closes in Oct 2026. `better-sqlite3@12` already declares `20.x || 22.x || … || 26.x`, so the DB driver is not the constraint; the lockfile format is.
  - Use `nvm use` (reads `.nvmrc`) before `npm install` if you might commit a lockfile.
- **Pipeline tools:** Custom CLI scripts in `tools/`
- **Server:** Express 5 editorial workflow server in `server/`, better-sqlite3 12, Helmet, JWT auth
- **Content format:** CNXML → Markdown (intermediate) → HTML
- **Testing:** Vitest (unit), Playwright (E2E)
- **Dependencies:** See package.json. Note: the server's `xlsx` installs from the official SheetJS CDN tarball (`cdn.sheetjs.com`), not npm — npm's last SheetJS release (0.18.5) has unfixed advisories. `npm ci` therefore needs cdn.sheetjs.com reachable, and xlsx version bumps are manual (Dependabot can't follow URL dependencies).
- **Fresh-clone bootstrap:** the server builds its full SQLite schema from scratch on first start — `migrationRunner` creates `pipeline-output/sessions.db` and runs all migrations when the file is missing (fixed 2026-06-10; previously a fresh checkout silently skipped all migrations and write endpoints 500'd)

## Directory Structure

```
books/{book}/
├── 01-source/          # 🔒 READ ONLY - OpenStax CNXML originals
├── 02-for-mt/          # EN segments for machine translation
│   └── ch{NN}/         #   m{NNNNN}-segments.en.md
├── 02-structure/       # Document structure from extraction
│   └── ch{NN}/         #   m{NNNNN}-structure.json, -equations.json
├── 02-mt-output/       # 🔒 READ ONLY - Raw IS segments from MT
├── 03-faithful-translation/ # ✏️ Reviewed IS segments (per-module, written by applyApprovedEdits)
├── 03-translated/      # Translated CNXML from injection
│   └── {track}/ch{NN}/ #   m{NNNNN}.cnxml (track = mt-preview, faithful, localized)
├── 04-localization/    # ✏️ Localization in progress
├── 04-localized-content/ # ✏️ Pass 2 output (localized version)
├── 05-publication/     # ✏️ Web-ready HTML
│   ├── mt-preview/     #    MT versions for immediate use
│   ├── faithful/       #    Human-reviewed versions
│   └── localized/      #    Localized (adapted) versions
├── for-align/          # (legacy) Matecat Align staging — retired, see generate-tm.js
├── tm/                 # GENERATED by generate-tm.js from faithful segments; don't edit by hand
├── glossary/           # Terminology files
└── chapters/ch{NN}/    # Status tracking (status.json)

tools/                  # CLI tools for pipeline processing
server/                 # Web workflow interface
docs/                   # Documentation (see below)
```

## File Permissions

| Permission | Folders | Rule |
|------------|---------|------|
| 🔒 READ ONLY | `01-source/`, `02-mt-output/` | Never modify |
| ✏️ WRITE | `03-faithful-translation/`, `04-localized-content/`, `05-publication/` | Backup before editing |
| GENERATED | `02-for-mt/`, `02-structure/`, `03-translated/`, `tm/` | Generated by tools (`tm/` by `generate-tm.js`) |

**Before modifying files:** Create backup `{filename}.{YYYY-MM-DD-HHMM}.bak`

## Extract-Inject-Render Pipeline

```
CNXML → Extract → EN Segments → MT → Initialize → Review → Inject → Render → HTML
```

| Step | What | Tool/Service | Output |
|------|------|--------------|--------|
| 1 | CNXML → EN segments | `cnxml-extract.js` | `02-for-mt/`, `02-structure/` (bracket markers: `[[i:]]`, `[[link:]]`, `[[xref:]]`, `[[docref:]]`) |
| 2 | Machine translation | `api-translate.js` (Málstaður API) | `02-mt-output/` |
| 3a | Linguistic review | Segment editor (web) or manual editing | `03-faithful-translation/` ★ |
| 3b | Apply approved edits | `applyApprovedEdits()` (per-module) | `03-faithful-translation/` |
| 4 | TM creation | `generate-tm.js` (in-house TMX from faithful pairs; auto-regen on apply via `tmService`) | `tm/` ★ |
| 5a | Inject translations | `cnxml-inject.js` | `03-translated/` |
| 5b | Render to HTML | `cnxml-render.js` | `05-publication/` |

Legacy protect/unprotect steps (1b, 2b) are archived in `tools/archived/` — not needed with API translation.

★ = Human-verified asset

**Key insight:** Review BEFORE TM creation, so TM is human-verified quality. Markdown is only an intermediary for MT; final output is semantic HTML.

See [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) for full instructions.

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all Vitest unit tests |
| `npm run validate` | Validate chapter status files |
| `npm run server:dev` | Start editorial server (dev mode) |
| `node tools/cnxml-extract.js <book> <chapter>` | Extract EN segments from CNXML |
| `node tools/cnxml-inject.js <book> <chapter>` | Inject translations into CNXML |
| `node tools/cnxml-render.js <book> <chapter>` | Render translated CNXML to HTML |
| `node tools/api-translate.js --book <book> --chapter <ch>` | Translate segments via Málstaður API |
| `node tools/api-translate.js --book <book> --dry-run` | Show translation plan + cost estimate |
| `node tools/translate-chapter-titles.js <slug>` | Translate chapter titles via Málstaður API |
| `node tools/generate-tm.js --book <book> [--chapter N] [--format tmx\|csv\|json]` | Generate TM (TMX default; CSV/JSON) from paired EN/faithful segments |
| `node tools/export-corpus.js --book <book>` | Export aligned EN/MT/faithful/localized research corpus (JSONL+TSV, gitignored `books/{book}/corpus/`) |
| `node tools/resolve-embeds.js --book <book>` | Resolve `<iframe>` embed `/l/` redirects → committed `embed-mapping.json` (networked; run at intake) |
| `/pipeline-status` | Overview of all chapters |
| `/chapter-status <book> <ch>` | Specific chapter progress |
| `/review-chapter <book> <ch>` | Pass 1 linguistic review |
| `/localize-chapter <book> <ch>` | Pass 2 localization |
| `/check-terminology <book> <ch>` | Verify terminology |

## Skills (Auto-loaded)

| Skill | Triggers When |
|-------|---------------|
| `editorial-pass1` | Working on `03-faithful-translation/`, grammar review |
| `localization` | Working on `04-localized-content/`, unit conversions |
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

**Stages (Extract-Inject-Render pipeline):**
- `extraction` - Step 1: Segments + structure extracted
- `mtReady` - Step 1b: Segments protected for MT
- `mtOutput` - Step 2: MT output received
- `linguisticReview` - Step 3: Faithful translation reviewed
- `tmCreated` - Step 4: TM (TMX) generated in-house by `generate-tm.js`
- `injection` - Step 5a: Translated CNXML produced
- `rendering` - Step 5b: HTML produced
- `publication` - Step 5c: Published to web

**Statuses:** `complete`, `not-started` (binary in status.json; `pending` used in section-level display)

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

**Cross-repo CSS contract:** Rendered HTML from `cnxml-render.js` produces semantic HTML that relies on `/styles/content.css` served by namsbokasafn-vefur (located at `static/styles/content.css`). Changes to CNXML class names or structure must be coordinated with that stylesheet.

**Content → reader flow:** editor edits/approvals live only in the production
server's `sessions.db` (gitignored). "Vista + Birta" renders HTML to
`05-publication/` on the server's disk; `scripts/git-backup.sh` (cron, every
2h) pushes `books/` content to `main`; a push touching
`books/*/05-publication/**` auto-triggers the "Sync Content to Vefur" Action
(`.github/workflows/sync-content.yml`), which publishes to namsbokasafn-vefur.
Full picture: [docs/technical/architecture.md](docs/technical/architecture.md)
§ Cross-Repository Content Flow.

**Manual sync** (run in namsbokasafn-vefur, e.g. to publish before the 2h cron):
```bash
node scripts/sync-content.js --source ../namsbokasafn-efni
```

### Cross-repo sessions (sister repo: ../namsbokasafn-vefur)

A single fix often spans both repos (content/render here + routing/slug/deploy there).
The harness only auto-loads **this** repo's CLAUDE.md, memory, skills, and permissions —
never the sister's. So when work crosses over:

1. **Before editing any file under `../namsbokasafn-vefur/`**, first read its `CLAUDE.md`
   and its memory index
   (`~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-vefur/memory/MEMORY.md`).
2. **Record learnings in the repo they belong to.** A fact about vefur (routing, slugs,
   rendering, deploy) goes in vefur's memory and, if it's a durable rule, vefur's
   CLAUDE.md — not here. Update both only when the fact is genuinely cross-repo.
3. **Recommend relaunching in the sister repo** (then pause for the user's choice) when
   the work's center of gravity is there — ANY of: more than ~2 files to change in the
   sister repo; the task needs the sister's skills/permissions/auto-recalled memory;
   it's an iterative edit→test/build loop there; or you're about to *design/architect*
   there rather than apply a known edit. Phrase it: *"This is now mostly vefur work —
   consider relaunching Claude in namsbokasafn-vefur for full context. Continue here, or
   relaunch?"* Do **not** nag for a one- or two-file cross-repo touch.

These are heuristics you apply with judgment, not hard gates.

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) | **Extract-Inject-Render workflow** |
| [docs/workflow/config-and-rerun-guide.md](docs/workflow/config-and-rerun-guide.md) | **What to edit by hand & what to re-run** |
| [docs/workflow/editor-improvements-jan2026.md](docs/workflow/editor-improvements-jan2026.md) | **Editor rebuild plan for CNXML→HTML pipeline** |
| [docs/plans/2026-06-12-editorial-throughput-roadmap.md](docs/plans/2026-06-12-editorial-throughput-roadmap.md) | **Editorial throughput & quality roadmap (next dev plan)** |
| [docs/editorial/pass1-linguistic.md](docs/editorial/pass1-linguistic.md) | Pass 1 instructions |
| [docs/editorial/pass2-localization.md](docs/editorial/pass2-localization.md) | Pass 2 instructions |
| [docs/editorial/terminology.md](docs/editorial/terminology.md) | Terminology standards |
| [docs/technical/architecture.md](docs/technical/architecture.md) | System architecture |
| [docs/pipeline/html-pipeline-issues.md](docs/pipeline/html-pipeline-issues.md) | cnxml-render bug tracking |
| [docs/pipeline/cnxml-fidelity-gaps.md](docs/pipeline/cnxml-fidelity-gaps.md) | CNXML round-trip fidelity for OpenStax remerge |
| [test-results/api-marker-survival.md](test-results/api-marker-survival.md) | Málstaður API marker survival test results |
| [ROADMAP.md](ROADMAP.md) | Development status |

## Inline Marker Format (Bracket Pattern)

Extraction uses API-safe `[[type:content]]` bracket markers that achieve **100% Málstaður API survival**:

| Marker | CNXML Element | Example |
|--------|--------------|---------|
| `[[i:text]]` | `<emphasis effect="italics">` | `[[i:solid]]` → `[[i:fast efni]]` |
| `[[b:text]]` | `<emphasis effect="bold">` | `[[b:important]]` |
| `[[sub:content]]` | `<sub>` | `H[[sub:2]]O` |
| `[[sup:content]]` | `<sup>` | `Ca[[sup:2+]]` |
| `[[link:text\|url]]` | `<link url="...">` | `[[link:click here\|http://example.com]]` |
| `[[xref:id]]` | `<link target-id="..."/>` | `[[xref:CNX_Chem_05_02]]` |
| `[[xref:text\|id]]` | `<link target-id="...">` | `[[xref:Figure 5.2\|CNX_Chem_05_02]]` |
| `[[docref:doc#target]]` | `<link document="..." target-id="..."/>` | `[[docref:m68674#fs-id123]]` |
| `[[term:text\|id]]` | `<term id="...">` | `[[term:mól\|term-00042]]` (no id → `[[term:text]]`; class recovered from sidecar by id) |
| `[[fn:text\|id]]` | `<footnote id="...">` | `[[fn:Sjá viðauka A\|fs-idp2355696]]` (no id → `[[fn:text]]`) |
| `[[u:text]]` | `<emphasis effect="underline">` | `[[u:undirstrikað]]` |
| `[[em:text\|class]]` | `<emphasis class="...">` | `[[em:áhersla\|emphasis-one]]` — class rides in the marker |

**Key insight:** The API translates content inside brackets while preserving the delimiters. Legacy `{{i}}...{{/i}}` paired markers had ~2.3% loss; bracket `[[i:text]]` has 0% loss. The same loss applied to the legacy `{{term}}...{{/term}}`/`{{fn}}...{{/fn}}`/`++text++` formats (still parsed for backward compat, below) — id-anchored `[[term:|id]]`/`[[fn:|id]]` and bracket `[[u:]]`/`[[em:|class]]` (2026-07, B4) close out the last lossy inline classes at 0% loss.

Injection handles both bracket and legacy formats (backward compat) — `{{term}}text{{/term}}`, `{{fn}}text{{/fn}}`, and `++text++` are always parsed (never gated). Legacy markdown-style patterns (`*text*`, `~text~`, `^text^`, `__term__`) are skipped for API-translated segments via `hasApiMarkers` guard instead, since they'd false-match inside API-translated prose.

## Server Features (Post-Refocus)

The server is an **editorial workflow platform**, not a pipeline orchestration tool. Pipeline operations (extract, translate, inject, render) are handled via CLI tools.

**Core editorial features:**
- Segment editor (Pass 1 linguistic review) with keyboard shortcuts, filtering, progress tracking
- Localization editor (Pass 2) with category badges and guidelines panel
- Terminology manager with cross-book support, definitions, CSV export
- Editorial progress dashboard (per-chapter/module segment counts)
- Live preview — in-process CNXML→HTML rendering via `renderService.js`
- Content versioning — per-segment snapshots before each apply (rollback capability)
- Structured logging via pino (`LOG_LEVEL` env var, JSON in production)
- Production health check at `GET /api/health` (DB, migrations, books, auth)

**Recent changes (2026-07-26, latest — CNXML validation-gate experiment → live biology content-loss fix → glossary sourcing):** **Two branches, NOTHING PUSHED, nothing deployed, no vefur sync — readers still see the broken ch03.**
- **`experiment/cnxml-schema-validation-gate` (1 commit `9ef606d2`)** — self-contained under `experiments/cnxml-validation-gate/` (nothing wired into the pipeline/server/CI; `lint`/`format:check` cover only `tools/`+`scripts/` and vitest only `*/__tests__/`, so CI is unaffected). **Verdict: jing + OpenStax's own RelaxNG is a viable fail-loud gate, ~0.7 s/chapter.** efnafraedi-2e is **schema-perfect: 149/149 modules, error-for-error identical to the OpenStax originals** (incl. the math- and table-heaviest chapters) — reinjection is not the fragile step it was feared to be. **⚠️ Three traps:** (1) **`jing -i` is MANDATORY** — without it the grammar doesn't compile at all (CNXML `table/@id` is `xsd:ID`, MathML 3's `anyElement` matches it untyped); it's OpenStax's own flag (`cnxml/jing.py:53`), and the cost is no duplicate-id checking (the gate script implements its own). (2) **jing ABORTS THE REST OF THE BATCH after the first `fatal:`** — a naive `jing schema.rng *.cnxml` is **fail-QUIET**; it actually hid 3 real defects here. (3) **Pristine OpenStax content does NOT validate clean** (660/1192 files — CNXML 0.7 forbids `@id` inside `<md:abstract>` yet their own generator stamps `para-00001` there) → allowlist, never "fix". **Schema validity ⊥ fidelity:** chemistry has 37 known discrepancies and **0** schema errors, so this complements `cnxml-fidelity-check.js`, never replaces it. Reports: `experiments/cnxml-validation-gate/{FINDINGS,BASELINE-REPORT,SETUP}.md`.
- **`fix/liffraedi-ch03-mt-content-loss` (11 commits, `30efea88`..`e34ccd5e`)** — the gate found **live reader-facing content loss**: biology ch03 was publicly serving **55%** of its content (`3-summary` = 112 visible chars of empty headings, **no `3-key-terms` page at all**, 0 ch03 glossary terms). **⚠️ Root cause was NOT an MT failure — ch03 was a HUMAN docx translation** (`02-mt-output/*-provenance.json` → `"tool": "docx-import"`; `import-report.json` = 429 EN segments, **205 matched, 195 SKIPPED**). A blind `api-translate --force` would have overwritten the translator's work. **LESSON: segment counts tell you HOW MUCH, only `-provenance.json` tells you BY WHOM — check provenance before any `--force`.** Lead decision → machine-translate the whole book, editor edits the MT with his own translation as reference (preserved verbatim at `books/liffraedi-2e/reference-translations/ch03-human-docx/`). ch03 re-extracted (**+68 MC answer-option segments** — the `processExercise` fix #287 had shipped but was never re-extracted; the code was fine, the *data* was stale) → re-MT'd (850 ISK, 497/497 parity) → re-injected → re-rendered. `3-summary` 112→**5385** chars, `3-key-terms` **created** (50 definitions), book glossary 42→**92** terms; gate on ch03 **10 errors → 3** (the rest is the pre-existing `<figure>`-in-`<note>` inject bug). ⚠️ **Still only 13 of 259 biology modules are EXTRACTED** — "MT the whole book" means extracting ~246 first (~4.0M chars ≈ 40,000 ISK).
- **Glossary sourcing (see `[[idordabanki-biology-seeding]]`):** fetched Íðorðabankinn biology (10,003 bilingual headwords) + genetics/immunology/chemistry etc. **Coverage 60% authoritative · 425 (18%) genuinely absent everywhere.** **⚠️ Íðorðabankinn is authoritative but NOT self-consistent** (`fosfórlípíð` vs `fosfólípíðlag`; `fjölpeðtíð` is *their* typo; **39% of multi-collection headwords disagree**) → adopt **per term with `fkdictionary` kept**, never bulk-import. Two editor markup sheets shipped: `exports/06-ch03-mt-review-liffraedi.csv` + `exports/07-idordabanki-candidates-liffraedi.csv`. **⚠️ Two blockers before any of this reaches the translator: (a)** nothing bridges the terminology DB → `books/<book>/glossary/glossary-unified.json` (which is what `api-translate`'s `loadGlossary` reads, `approvedOnly:true`); `merge-glossary.js` has 3 sources and Íðorðabankinn is not one. **(b)** `formatGlossary` (`tools/lib/malstadur-api.js:186`) still has **no empty-`targetWord` guard** — latent only because biology's terms are all `needs_review`; a blank IS side 400s the WHOLE request.
- **⚠️ NEW cross-repo bug — campaign register C9 + vefur issue [#197](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur/issues/197), LEAD DEADLINE: before fall semester.** A Pass-1 review that corrects a section **title** publishes the section **TWICE**: the faithful overlay replaces per **filename**, but a corrected title **renames** the file (title→slug), `sync-content.js` copies faithful on top **without `--delete`**, and `generate-toc.js:499` readdir's the **destination** → two TOC entries (one reviewed/new-title, one stale/old-title still bannered). Never fired yet; **fires on the first real title correction**. The `Fitusýrur`→`Lípíð` fix dodged it by going through `02-mt-output` under a **lead-waived read-only exception** (`4e5be912`, annotated in `m66441-provenance.json` `manualCorrections` — `tool` untouched so `readProvenance` still resolves) — **not repeatable**.
- **⚠️ Don't blanket-replace `Fitusýrur`:** ~28 occurrences in m66441 are **correct** (the EN genuinely says "fatty acid"); only 5 are wrong (EN says "lipid"). Body errors left for the editor pass, listed in the CSV row.

**Recent changes (2026-07-21, C1a appendices read-path, PR #323 MERGED):** First **[CODE]** item of the follow-up campaign. **C1 split into two PRs; PR-1 (read-path, register I14-R2/R3) MERGED as PR #323** (main `06605ab6`; **deploy still gated by A4** — do not deploy server units mid-QA). Adopts item-14's canonical `server/lib/chapterLabel.js` idiom at the read-path sites that rejected/skipped appendices: new helpers `chapterFromDir`/`compareChapters`; the 7 `status.js` disk-scan loops + `pipelineService.checkBookDownstreamWork` (+ its `checkExtractionImpact` path-builder) + `scripts/validate-status.js` (R3 scans); and `status.js /sections`, `books.js /faithful-count`, `publication.js`+`publicationService` (R2 validators/service). **Editing already worked** (item-14 `listChapters`+`validateBookChapter`) — PR-1 is read/report consistency, not enabling editing. 7 TDD tasks (subagent-driven), suite **3317 green**, whole-branch adversarial review (5 opus lenses → 3-vote refute-default) = **0 confirmed defects**. **⚠️ Durable rule (C1a): TWO appendix dir conventions must not be conflated** — md-style source dirs are `chNN`/`appendices` (use `chapterLabel.chapterDir()`); publication-track OUTPUT dirs are BARE `NN`/`appendices` (`chapters/01`, NOT `chapters/ch01` — `getPublicationStatus` keeps a bare ternary, guarded by a regression test). **Write-path fail-closed:** the SHARED `validateChapterParams` now lets appendices reach the POST publish routes, but they fail closed (no write) — to *enable* appendix publish PR-2 must fix `tools/validate-chapter.js` (its `parseArgs` drops `-1` as a flag; `:1055` builds `ch-1`) AND `publicationService.validateBeforePublish` (use `chapterLabel.cliChapterArg`, not raw `String(-1)`). **PR-2 (deferred):** I14-R4/I16-R3 registration + `book_sections` appendix rows + **prod backfill** (`registerBook` not re-runnable) + I14-R8 E2E fixture. **New find logged:** `server/routes/tm.js:39` `GET /api/tm/export` rejects appendices though its lib is appendix-aware (item-21 route — follow-up). Design/plan: `docs/superpowers/{specs,plans}/2026-07-21-c1a-*`; SDD detail `.superpowers/sdd/progress.md`.

**Recent changes (2026-07-21, later — follow-up campaign + delivery + appendix fixes):** With item 17 shipped, the pre-semester campaign's Phases 0–4 are **COMPLETE**; the successor plan is **`docs/plans/2026-07-21-post-item17-followup-campaign.md`** (all deferred/emergent findings + Phase-5 backlog, ordered **blocking × severity**, each item tagged **[LEAD]** ops/data-op/decision vs **[CODE]** I-execute: **P0** delivery gates → **P1** correctness (C1 appendices-support · C2 Playwright-red · C3 corpus/TM durability · C4 nested-para residue) → **P2** hardening (C5 authz-2 · C6 MTA edges · C7 terminology governance · C8 pipeline) → **P3** polish). **Delivered:** items 12–21 deployed to ritstjórn via `./scripts/deploy.sh` + `node scripts/backfill-mt-locks.js --db` (P0-1, MT-lock active); vefur content synced+built+deployed (P0-2). **Appendix render fixes (found in the P0-2 spot-check):** **#321** — appendix examples/figures/equations were labelled `Dæmi appendices.N` because R4-3 fixed only the table loop; generalized `formatTableNumber`→`formatElementNumber` applied to all four numbered-element loops → per-letter labels (`Dæmi B1`, `Mynd E1`), **reader-facing**. **#322** — the appendix page `<title>` / `pageData.section` emitted `appendices.N`; **efni-internal** (vefur re-titles appendix pages from `pageData.title` and zeroes their section), fixed with `sectionNumber=''` for appendices. Both merged + re-rendered (main `7bfe6fa5`); **#321 still needs a vefur re-sync** to reach readers. **⚠️ Durable rule:** whether a leaked value is reader-visible depends on whether vefur passes it through (content-body labels → visible, #321) or **recomputes** it (page title → not, #322) — trace the consumer before assigning severity. Suite 3299 green.

**Recent changes (2026-07-21):** **Item 17 — Licence metadata per product (PR #320, main `480fc651`) — PHASE 4 COMPLETE.** `books/<slug>/book-config.json` is now the **canonical** per-book licence datum: it gains a nested `licence:{code,obtained}` block, and `tools/lib/book-licences.cjs` `getBookLicence` **reads it** instead of an inline map (return contract `{licence, obtained}` **FROZEN** → the three byte-freeze consumers `export-corpus.js`/`generate-tm.js`/`server/routes/tm.js` are output-identical; the inline `BOOK_LICENCES` map is dropped). The 6 covered books' codes are pinned to provenance §1; `stjornufraedi`/`testbook` carry none and `getBookLicence` fails loud. **Cross-repo pin:** a `VEFUR_CONTRACT`-gated test asserts efni's codes agree with vefur `book.ts` `derivativeLicence` after normalising the `CC BY 4.0`↔`CC-BY-4.0` format gap (mutation-checked). **Containment:** new `tools/lib/licence-containment.cjs` encodes "no restrictive book in a permissive aggregate" — **NO caller yet** (preventive, for a future cross-book aggregate); the item-21 added-terms export is documented + test-locked **licence-neutral** (terms aren't copyrightable; provenance §6.1.a). **Footer part-(b) DROPPED** — vefur already owns the per-page/print licence footer (`BookAttribution.svelte`); efni emits none (lead decision). **⚠️ Durable render-config rule (I17-R6):** `book-config.json` is now MULTI-CONSUMER; the licence key leaked through `book-rendering-config.js` `mergeWithShared()`'s lossless passthrough into `getBookRenderConfig()`'s object (broke a golden `toEqual` "migration oracle") — fixed by excluding it via `NON_RENDER_KEYS`. Adding a non-render book-config key means excluding it there too; verifying "inert on render path" must check the config-OBJECT shape + its tests, not just rendered HTML (a `toEqual`-vs-golden is a shape pin, not only `toMatchSnapshot`). Whole-branch adversarial review (4 opus lenses) = SHIP_WITH_MINORS, all findings cleared. **Tools + one server comment + tests + docs — no data op, no re-render, no server behavior change (frozen contract); nothing to deploy.** Suite 3297 green.

**Recent changes (2026-07-21):** **Item 21 PR-B — Árnastofnun added-terms seed (PR #319, main `cd7c26fe`).** New HEAD_EDITOR route `GET /api/terminology/added-terms/export?format=csv|json&subject=&book=` + a HE-only download control on `terminology.html`: exports the project's OWN approved Icelandic terms that are **not already in Íðorðabankinn**, as an Árnastofnun submission seed. Service `terminologyService.getAddedTerms()` (two-query: rights filter + a per-headword Íðorðabankinn-anchor lookup), pure serializers in `server/lib/arnastofnunSeed.js` (CSV formula-guarded for the external spreadsheet destination — a PR-B-local `csvSeedField`; the shared glossary `csvEscapeField` is untouched). **Rights model (lead 2026-07-21, I21-R4 — reverses PR-A's `openstax-mt` exclusion):** a scientific term is not source-owned, so the discriminator is whose *Icelandic* it is + `idordabanki_id IS NULL` (not already in Íðorðabankinn). `PROJECT_ORIGINATED_SOURCES = {manual, mined-postedit, chapter-glossary, openstax-mt, openstax-glossary}` (**openstax-mt IN**; resolves I21-R1). The three sources the lead confirmed are already in Íðorðabankinn (`idordabankinn`/`chemistry-association`/`chemistry-society-csv`) are excluded from the seed AND feed the `new-translation`/`new-alternative` classifier (I21-R5 — they carry a NULL `idordabanki_id`, so an id-only classifier would mislabel them; an advisor catch, test-pinned). No licence stamp (terms aren't copyrightable, spec §B6). Whole-branch adversarial review (4 opus lenses) found all 3 survivors were **test-pin gaps, not code bugs** — closed with mutation-verified pins and **0 code change**. **⚠️ I21-R7: the first real export is EMPTY until an editor re-reviews terms on prod (the dev DB has ~0 approved terms); the empty case is a valid header-only file.** Server + `terminology.html` only. **✅ DEPLOYED to ritstjórn 2026-07-21** as part of the items-12–21 batch (`./scripts/deploy.sh` + `node scripts/backfill-mt-locks.js --db` run on prod; MT edit-lock now active). Post-deploy riders still pending: run the I12-R3 sanity queries; tell ritstjórn about the F18-DROP/MTA-R1-RISE metric changes + the full first-open queue backlog; I21-R7 added-terms export reads empty until a prod term re-review. Suite 3271 green.

**Recent changes (2026-07-20):** **Item 21 PR-A — TM multi-format export (PR #317, main `e70692a0`).** New CommonJS boundary lib `tools/lib/tm-export.cjs` holds the TM pairing+serialization, shared by the ESM CLI `generate-tm.js` and the CommonJS server route (the `.cjs`-shared-across-the-ESM/CJS-seam pattern — ESM imports CJS, CJS can't require ESM). `generate-tm.js` gains `--format tmx|csv|json` (tmx default — the `tmService` auto-regen cron spawns it flagless, so the tmx-default/`.tmx`-path contract is load-bearing, pinned end-to-end via a testable `runExport`). New `GET /api/tm/export` route (`requireAuth`, VALID_BOOKS/chapter guards, 404-on-empty) + a "Sækja þýðingaminni" download control on `books.html`. Per-book **licence stamping** on every TM export (TMX header `<prop type="licence">` + CSV column + JSON manifest) via `getBookLicence` (`tools/lib/book-licences.cjs`, fail-loud) — parity with the item-20 corpus export. **⚠️ Durable operational rule (I21-R2): a book needs a `book-licences.cjs` row before its TM auto-regen works — a missing row is a loud 500 on the route but a SILENT warn-only stale TM on the fire-and-forget cron; onboard new books licence-first.** PR-B (Árnastofnun added-terms seed) shipped 2026-07-21 as #319 — see the 2026-07-21 entry above. Merged alongside routine dependency maintenance (Dependabot #314 setup-node / #315 express-rate-limit / #316 lint-staged, all landmine-clear; #318 brace-expansion 5.0.6→5.0.7 high-sev ReDoS fix, both trees 0 vulns). Suite 3235 green; main `c69cd096`.

**Recent changes (2026-07-11):** **server/ two-perspective review + provenance audit → remediation.** A findings-first review of `server/` (code + editorial-workflow) plus a product-provenance & durability audit shipped as reports (`docs/audit/2026-07-11-*.md`, PR #261 merged) — headline finding: cross-book authz holes in `routes/pipeline.js`/`routes/sections.js` that Unit-0 book-scoping never adopted. Remediation of the top-3 durability findings is planned in `docs/plans/2026-07-11-provenance-durability-remediation-plan.md` (3 PR-sized tracks): **Track A shipped (PR #262)** — off-box encrypted `sessions.db` backup + restore-test + `/api/health` staleness heartbeat. **⚠️ DEPLOY PREREQ (not yet done):** the off-box backup only activates once someone creates the Linode Object Storage bucket + rclone crypt remote and sets `BACKUP_REMOTE` in cron — see `docs/technical/backup-and-restore.md`; until then `/api/health` reports `"degraded"` (expected, deploy-gate-whitelisted). **Track B shipped (PR #264)** — the second `01-source` overwrite path (`check-source-updates.js update`) is deleted (read-only `check`/`status`/`diff` kept) and `tools/__tests__/source-write-guard.test.js` statically enforces that `download-source.js` stays the only CNXML writer into `01-source/` (any new tool referencing `01-source` fails the suite until a human classifies it read-vs-write). **Track C shipped (PR #266)** — per-module MT edit-lock: the server writes a `.locked` sibling marker next to a module's `02-mt-output` file on its **first saved segment edit**; `api-translate` then refuses that module **even with `--force`** (corrupt/indeterminate marker fails safe to locked); markers ride the git-backup cron and already-edited modules are backfilled (`scripts/backfill-mt-locks.js`, file signal + opt-in `--db`). **⚠️ DEPLOY STEPS (not yet done):** the lock protects production only after `./scripts/deploy.sh` AND a one-time `node scripts/backfill-mt-locks.js --db` on the prod box. **All three remediation tracks are now shipped (A #262 · B #264 · C #266)**; successor effort: `docs/plans/2026-07-11-pre-semester-coding-campaign.md`.

**Recent changes (2026-07-01):** **auth-cookie SameSite fix (login loop).** The `auth_token` cookie was set with `SameSite=Strict` (routes/auth.js), which broke the Microsoft OAuth return: Strict is withheld on the cross-site-initiated redirect back from Microsoft to `/`, so `requirePageAuth()` bounced the just-logged-in user straight back to `/login` (a login loop). It surfaced in "clean" browsers like Edge; browsers already holding a valid session (e.g. a dev's Chrome) masked it. **Corrected to `SameSite=Lax`** on both the set- and clear-cookie calls — Lax still blocks cross-site POST/subresource sends (the real CSRF control; all mutating endpoints are POST) while letting the top-level GET OAuth return carry the cookie. Regression guard: `server/__tests__/authCallbackCookie.test.js`. **Do not restore `Strict`** (there's a code comment saying so). Server code → reaches prod only via `./scripts/deploy.sh`.

**+ hardening arc the login fix uncovered (#209–#213, all merged + deployed).** Verifying #208 through CI (Actions credits returned ~2026-07-01) surfaced five latent bugs, each fixed with a regression test and CI-green-verified: **#209** regenerated stale `docs/_generated/` + added `log.error` to a swallowing catch (the instrument that then diagnosed #210); **#210** `termMiningService` hardcoded `pipeline-output/sessions.db` instead of using `resolveDbPath()`, so it ignored `SESSIONS_DB_PATH` (e2e 500, unreproducible locally); **#211** migrations 004/006 weren't idempotent on re-run — `CREATE INDEX IF NOT EXISTS` guards the index name, not its columns, and later migrations (022/032) dropped `github_id`/`term_id` — fixed with `server/lib/migrationSchema.createIndexIfColumnsExist`; **#212** the migration/seed path now **fails loud** (`failLoudOnMigrationErrors` → `index.js` boot + `e2e/seed-fixture.js` `exit(1)` on any migration error, fatal in all envs — made safe by #211's `migrationIdempotency.test` catching non-idempotency in CI pre-deploy); **#213** `tools/lib` (`embed-mapping`, `book-rendering-config`, `parseArgs`) resolved `books/` against `process.cwd()`, but the server runs with **cwd=`server/`** (`cd server && npm start`), so resolve via `import.meta.url` instead. **Durable rule: resolve resource paths against something intrinsic (`import.meta.url`/`__dirname` for files, `resolveDbPath()` for the DB), never `process.cwd()`; and run `npm test` from the repo root.** Full narrative in project memory `session-2026-07-01-hardening`; register finds d1/d2/e/f in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md).

**Recent changes (2026-06-12, remediation Units 0–5 — PRs #102–#108, all merged):** worked through all six units of the June-2026 remediation roadmap — **the remediation roadmap is now code-complete**. Each unit shipped with tests; full suite green. Manual QA checklists §0–§5 still need a pass on a running server.
- **Unit 0 — security hotfixes (#102):** preview path-traversal guard (`validateModule` + `VALID_TRACKS` on the live-preview route); render restore-on-failure (`cnxml-render.js` now restores each file's newest `.backup.*` instead of unlinking good prior versions); **book-scoped head-editor authz** — new `requireHeadEditor(bookParam)` / `requireHeadEditorFor(resolveBook)` middleware on approve/reject/discuss/unapprove/complete/apply/publish (a head-editor of one book can no longer act on another); terminology + page-data output escaping (`escapeHtml`, `escapeJsonForScript`).
- **Unit 1 — content restore (#103):** `contentVersionService.restoreVersion` writes a chosen `content_versions` snapshot back as the faithful file (snapshots current content first, so restore is itself reversible), aligned to the current extraction; `POST …/restore/:version` (book-scoped, confirm-flagged) + a "Saga útgáfa" modal in the editor. Emits the previously-dead `version_restored` activity. **Decision:** no git-per-apply (redundant with the 2h git-backup cron).
- **Unit 2 — localization review tier (#104):** migration 034 (`localization_pending_edits` + `book_settings`) + `localizationReviewService`. With per-book `enforce_localization_review` ON, Pass 2 edits go to a head-editor approve/reject queue before reaching `04-localized-content/`; OFF (default) keeps legacy direct-save. Four-eyes mirrors Pass 1 (head-editor-only approve, self-approval permitted).
- **Unit 3 — assignment enforcement (#105):** migration 035 (`enforce_assignments` on `book_settings`). `userService.hasChapterAccess` flips from fail-open to **default-deny** when enforced (missing table → fail-closed 503); admin toggle on the assignments dashboard. Admin/head-editor bypass unchanged.
- **Unit 4 — editor UX (#106):** **rebuild affordance** (`getApplyStatus` reports `faithful_exists`/`can_rebuild`; the apply button re-enables to rebuild a module whose faithful file went missing — closes the m68700 recovery gap); header de-jargon (human title leads, `mNNNNN` muted + head-editor-only); **optimistic-concurrency token** for segment saves (`baseEditId` → 409 on a concurrent cross-editor change, parity with localization); editor-facing label sweep (residual English "Render"/"Starting" → Icelandic).
- **Unit 5 — defense & housekeeping (#108):** `requirePageAuth` on view routes (anon → `/login` with destination preserved; `/admin`=ADMIN, `/assignments`=HEAD_EDITOR); CSRF posture documented (SameSite on the auth cookie is the deliberate control) + logout-cookie/`fetchJson` consistency; legacy-migration try/catch (boot survives a throwing legacy migration); singleton DB handle in pipeline-status GET; `moduleLocks` self-prune; dead `gitService` deleted; **all tool-layer lows F7–F20 cleared** (EN-fallback gate on inject, URL-scheme sanitization, redirect caps, path containment, curl auth off argv, `.bak` before lossy rewrites, glossary `.terms[]` fix, status-advance only on failure-free chapters, `repairSegTags` ≥80% digit-overlap).
- **Next:** walk the manual QA checklists §0–§5 on a running server, then start the **editorial-throughput roadmap** (see Current Priority). Shared infra added by these units: `requireHeadEditor`/`requireHeadEditorFor` middleware, `requirePageAuth`, the `book_settings` per-book toggle table (migrations 034–035), and `escapeJsonForScript`.

**Recent changes (2026-06-12):** editorial-flow fixes surfaced by a real "Vista + Birta" failure on m68700, plus the content-publish flow:
- **Segment-parser bug (#96):** `segmentParser.parseSegments` was line-based and dropped any segment whose text shared a line with the next `<!-- SEG: -->` marker (the MT API sometimes eats the newline before a marker). It's now marker-based like the injection parser. This was the root cause of an "incomplete injection → render not found" failure that the UI mislabelled as a render error. Apply failure labels are now phase-aware (inject vs render) and surface the real error.
- **MT producer hardening (#98):** `api-translate.js` now `normalizeSegMarkers()` un-glues markers the API ran onto the previous line before writing `02-mt-output`, and reports a per-module/summary count (`countInlineMarkers`) so the mangling is visible at the MT stage instead of three stages downstream. 62 module-files had the latent pattern; consumers tolerate it now, producer emits clean.
- **Edit-again (#99):** a published (approved + applied) segment can now be revised in the editor via a "Breyta aftur" button. A new edit supersedes the old on the next "Vista + Birta"; the older version stays in history. Leans on existing supersede logic — **no reversal code**. This is the *forward-editing* complement to roadmap Unit 1 (`content-restore`, *backward* rollback); they're independent.
- **Apply model (important for future work):** `loadModuleForEditing` reads `03-faithful-translation` as the baseline once it exists (else `02-mt-output`). So `applyApprovedEdits` rebuilds the faithful file from the *current published content* + newly-approved-unapplied edits — incremental re-applies preserve every other segment's edits. Edits are also one-way at apply for *unapprove* (`unapproveEdit` throws once `applied_at` is set); edit-again is the way to change published content.
- **Content publish flow (#95):** `scripts/git-backup.sh` now also stages `books/*/translation-errors.json` (it was perpetually dirty on prod after inject), and a push to `main` touching `books/*/05-publication/**` auto-triggers the "Sync Content to Vefur" Action — so "Vista + Birta" reaches namsbokasafn.is via the 2h backup cron with no manual step. Full flow: [docs/technical/architecture.md](docs/technical/architecture.md) § Cross-Repository Content Flow.
  - **Merge-driver for the manifest (2026-06-26):** because that manifest is committed on *both* the cron (prod) and dev, every deploy `git pull --rebase` used to conflict on it. `.gitattributes` now marks `books/*/translation-errors.json merge=ours` (it's a derived artifact — keep the current side, it regenerates on the next inject). The `ours` driver is **not** stored in the repo, so each clone needs it once: `git config merge.ours.driver true`. `scripts/deploy.sh` re-asserts it before each pull; **dev boxes that pull/merge manually must run it once too.**
- **Known editorial-UX follow-ups (both since resolved — see Units 0–4 block above):** (a) the rebuild-when-faithful-file-deleted affordance landed as Unit 4.5 (`getApplyStatus` now reports `can_rebuild`); (b) `content-restore` (backward rollback) landed as Unit 1.

**Recent changes (2026-06-10):** CI fully green for the first time (lint, test, e2e, audit, docs-check):
- `@xmldom/xmldom` 0.9 `errorHandler`→`onError` migration in `tools/lib/cnxml-dom.js` (the old option threw at runtime and broke injection)
- Fresh-database migration fix (see bootstrap note above) — repaired the e2e suite, red since 2026-02-28
- Terminology e2e specs aligned with the migration-032 redesign (headwords + nested `translations[]`, translation-scoped approve/dispute)
- Two production bugs fixed: `/library` threw an uncaught error on every load (dead `/api/images` call fired by bookSelector auto-change), and the duplicate book-registration 409 guard missed when `openstax_catalogue` was empty (`isBookRegistered()` added)
- `xlsx` → SheetJS 0.20.3 CDN tarball + `qs` bump; `npm audit` clean
- Known follow-up: `getRegisteredBook`/`listRegisteredBooks` INNER JOIN `openstax_catalogue`, hiding registered books without catalogue entries (consider LEFT JOIN)

**Recent changes (2026-03-24):**
- Removed 20 legacy files (workflow, matecat, sync, images, issues routes/services)
- All DB services use singleton connection pattern
- Migrations use the unified `up(db)` pattern (35 as of 2026-06-12; 034–035 added the `book_settings` per-book toggle table)
- Frontend JS wrapped in IIFEs (encapsulated state)
- Vitest workspace splits tools (parallel) from server (sequential) tests

## Current Priority

Three active tracks:

1. **Remediation roadmap — code-complete, manual QA outstanding** — [docs/plans/2026-06-10-remediation-roadmap.md](docs/plans/2026-06-10-remediation-roadmap.md). **All units 0–5 are merged** (#102–#108, see Recent-changes block above). The only remaining work is **walking the manual QA checklists §0–§5 on a running server** (authz boundaries, on-disk render rollback, restore round-trip, enforcement 403/503, stored-XSS rendering, page-auth redirects, fetch/CSRF posture). Plan (2026-06-12): the lead runs this as part of a **combined major manual QA of namsbokasafn-efni + namsbokasafn-vefur** in the coming days. This does not technically block track 2, but server-touching roadmap units should not deploy mid-QA (see the roadmap's Unit 0 note). Source audit: [docs/audit/2026-06-10-security-quality-review.md](docs/audit/2026-06-10-security-quality-review.md); QA gates: [docs/plans/2026-06-10-qa-checklist.md](docs/plans/2026-06-10-qa-checklist.md).

2. **Editorial-throughput roadmap (drafted 2026-06-12, amended same day for the MTPE workflow, pending lead sign-off)** — [docs/plans/2026-06-12-editorial-throughput-roadmap.md](docs/plans/2026-06-12-editorial-throughput-roadmap.md). The successor plan: with the platform now safe/governed/reversible, the bottleneck is **Pass 1 throughput**. MTPE amendment: every segment already has an MT draft, so Unit 2 is *review-deduplication* (approved match outranks MT draft; fuzzy matching dropped permanently), Unit 3 gains term-decision mining (the glossary — not the TMX — primes Málstaður, so mining approved edits for term decisions is the real feedback loop), Unit 4 gains an untranslated-EN-residue detector. Production state driving the plan: 250 MT-preview pages vs **1 faithful module** project-wide; `tm/` **empty** in every book — the TM deliverable doesn't exist yet; glossary thriving at 1,117+617-approved chemistry terms. Units: **0** remediation manual QA (carried over) → **1** in-house TMX generation from the already-aligned `02-for-mt/` + `03-faithful-translation/` segment pairs (retires the never-used Matecat Align step) → **2** concordance search + exact-match repetition leverage in the segment editor (FTS5) → **3** live terminology QA in the save/submit path (wire the existing never-called `check-consistency`) → **4** Icelandic spell-check + number-consistency QA (engine decision pending) → **5** team operations (SLA aging, approve/reject notifications to editors, feedback→module routing) → **6** asset durability (nightly terminology export to git — current export is stale since 2026-03-09; `sessions.db` backup). Deliberately out of scope: more hardening, Pass 2 buildout, dashboard rewrites.

3. **Fidelity optimization** — 119/148 modules PERFECT (80%) for efnafraedi-2e, 49 total discrepancies across 29 modules. Error manifest auto-updated: `books/efnafraedi-2e/translation-errors.json`. Pipeline verified with ~1168 Vitest + 137 Playwright tests (all green).

Remaining discrepancies are structural injection issues (nested para/list), annotation side-effects (sub/sup/term overcounting from EN marker conversion), and a handful of math/link losses. See `translation-errors.json` for per-module detail.

Duplicate figure fix (2026-03-30): figures nested inside `<para>` inside `<example>`/`<exercise>` are now kept in-place instead of being stripped and duplicated. Follows same pattern as `buildNoteDom`. Affects organic chemistry (10 occurrences), edlisfraedi-2e exercises (38), liffraedi-2e notes (70).

See [ROADMAP.md](ROADMAP.md) and [docs/workflow/development-plan-phases-9-13.md](docs/workflow/development-plan-phases-9-13.md) for completed work and future ideas.

**Phases 8-13:** All COMPLETE (2026-02-05 through 2026-02-16). See [ROADMAP.md](ROADMAP.md) for details.
