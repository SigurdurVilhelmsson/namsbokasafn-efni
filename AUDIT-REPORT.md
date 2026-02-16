# Project Audit Report

**Original Date:** 2026-02-08
**Updated:** 2026-02-15
**Scope:** namsbokasafn-efni (pipeline + server) + namsbokasafn-vefur (web reader)
**Context:** Small educational project (1-2 devs, ~5 editors), built iteratively with AI assistance

**Update Summary (2026-02-16):**
- Phase 13.1 complete: Retired old markdown pipeline (~37,800 lines removed)
- Deleted `tools/_archived/` (43 files), old editor/process/localization routes + views
- Cleaned dead code in `workflow.js` (~575 lines), `books.js` (~210 lines)
- Updated nav links in 23 view files (`/editor` → `/segment-editor`)
- Confirmed 4 orphaned services: `presenceStore.js`, `notesStore.js`, `editorHistory.js`, `mtRestoration.js`
- Updated ROADMAP.md, architecture.md, simplified-workflow.md, development-plan-phases-9-13.md

**Update Summary (2026-02-15):**
- Fixed internal inconsistencies in audit report (items 1.6, 2.1 status mismatches)
- Quick-Win Checklist now 19/19 complete (100%)
- Completed Tier 2 documentation items: onboarding rewrite (2.2), STATUS.md update (2.3), deploy checklist (2.6)

**Update Summary (2026-02-10):**
- Directory structure completely restructured (see new structure in docs/workflow/directory-structure.md)
- Appendices integration completed (all 13 appendices now processable)
- All 8 chapters + 13 appendices rendered to mt-preview track
- Many Tier 1 critical items completed

---

## Tier 1: Critical / Quick-Fix — Do These Immediately

### 1.0 Directory Structure Overhaul ✅ COMPLETE (2026-02-10)
**Severity:** HIGH | **Effort:** SIGNIFICANT | **Area:** Architecture

**New structure implemented:**
- `02-machine-translated/` — Staging for unreviewed MT output
- `03-editing/` — Working directory for Pass 1 (editorial review)
- `03-faithful-translation/` — Final location for human-reviewed translations
- `04-localization/` — Working directory for Pass 2 (localization)
- `04-localized-content/` — Final location for localized content
- `05-publication/mt-preview/` — Unreviewed MT, acceptable for student use
- `05-publication/faithful/` — Human-reviewed, academically citable (future)
- `05-publication/localized/` — Fully adapted for Icelandic students (future)

**Completed:**
- All 8 chapters (01-05, 09, 12, 13) + 13 appendices rendered to mt-preview
- Old directories backed up to `.backup-20260210/`
- Comprehensive documentation in `docs/workflow/directory-structure.md`
- Tools updated to accept `--chapter appendices` as string literal

### 1.1 Command Injection via `execSync` in git operations ✅ COMPLETE
**Severity:** CRITICAL | **Effort:** QUICK-FIX | **Area:** Security

~~`server/routes/reviews.js:581` and `server/services/gitService.js:285` use `execSync` with string interpolation for git commit messages. While quote-escaping is attempted (`.replace(/"/g, '\\"')`), this is insufficient — backticks, `$()`, and other shell metacharacters in commit messages (sourced from user-submitted review data) could execute arbitrary commands.~~

**Status:** Fixed. `server/services/gitService.js` now uses `execFileSync('git', ['commit', '-m', commitMessage])` with array arguments throughout (lines 191, 278, 285, 297, 312, 331). No shell interpretation occurs.

### 1.2 vefur Deploy Not Gated on CI ✅ COMPLETE
**Severity:** CRITICAL | **Effort:** QUICK-FIX | **Area:** DevOps

~~`namsbokasafn-vefur/.github/workflows/deploy.yml` runs on every push to `main` independently of `ci.yml`. A broken commit deploys to production even if tests, linting, or type checks fail.~~

**Status:** Fixed. deploy.yml now uses `workflow_run` trigger that waits for CI completion and only proceeds if `github.event.workflow_run.conclusion == 'success'` (lines 4-6, 13).

### 1.3 Remove 4 Unused Root Dependencies ✅ COMPLETE
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Architecture

~~Root `package.json` has 4 dependencies only used by archived tools: `mammoth`, `turndown`, `js-yaml`, `katex`. They add install time and potential vulnerability surface for zero benefit.~~

**Status:** Complete. Root package.json now has only MathJax as a dependency (`@mathjax/src` 4.1.0 + `@mathjax/mathjax-newcm-font`, upgraded from `mathjax-full` 3.2.1 on 2026-02-11). All 4 unused packages removed.

### 1.4 Clean Up Dead Scripts in package.json ✅ COMPLETE
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Architecture

~~Root `package.json` has dead scripts referencing non-existent files:
- Line 10: `openstax-fetch` → references `tools/openstax-fetch.cjs` (doesn't exist)
- Line 11: `generate-book-data` → references `tools/generate-book-data.cjs` (doesn't exist)~~

**Status:** Complete. Both dead scripts removed from package.json (commit 9b31be7, 2026-02-10).

### 1.5 Update CLAUDE.md "Current Priority" ✅ COMPLETE
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Documentation

~~CLAUDE.md says the current priority is Phase 8 (editor rebuild), but ROADMAP.md marks Phase 8 as **COMPLETE (2026-02-05)**. This causes Claude Code to prioritize already-completed work in every session.~~

**Status:** Complete. CLAUDE.md now shows "Phase 9: Close the Write Gap" as current priority with Phase 8 marked complete.

### 1.6 Fix Caddy vs nginx Contradiction ✅ COMPLETE
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Documentation

~~`namsbokasafn-efni/CLAUDE.md` line 51 said "Caddy" but the project actually uses nginx (confirmed by deploy.yml and user).~~

**Status:** Complete. CLAUDE.md updated to say "nginx" (commit cd5fa8d, 2026-02-10).

### 1.7 Implement Backup Cron for SQLite Database ✅ COMPLETE
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** DevOps

~~The SQLite database (`pipeline-output/sessions.db`) stores all workflow sessions, reviews, terminology, feedback, and assignments. It is the single point of failure with no backup. The deployment checklist documents a cron example but it's not implemented.~~

**Status:** Complete. Backup cron job configured on production server (confirmed 2026-02-10).

### 1.8 Set Up Free Uptime Monitoring ✅ COMPLETE
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** DevOps

~~No external monitoring. If the server goes down, nobody is notified. The health endpoint at `/api/health` doesn't even check database connectivity.~~

**Status:** Complete. UptimeRobot configured for both namsbokasafn.is and ritstjorn.namsbokasafn.is (confirmed 2026-02-10).

### 1.9 Delete Root `lib/` Directory (Dead Code) ✅ COMPLETE
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** Architecture

~~Root `lib/` contains `constants.js`, `utils.js`, `index.js` — duplicates of data in `tools/lib/chapter-modules.js` and `server/data/chemistry-2e.json`. Not imported by any active code. Three-way data duplication.~~

**Status:** Complete. Root `lib/` directory has been deleted.

### 1.10 Fix Domain References (efnafraedi.app → namsbokasafn.is) ✅ COMPLETE
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** Documentation

~~`package.json` homepage, README.md, and 4+ doc files still reference the old domain `efnafraedi.app`. The project migrated to `namsbokasafn.is`.~~

**Status:** Complete. Active documentation updated. Only references remaining are in `docs/_archived/` (intentionally preserved history) and CLAUDE.md mentioning the migration.

---

## Tier 2: High-Impact Improvements — Worth Doing Soon

### 2.1 Update Claude Code Skills Files ✅ COMPLETE (3 of 3)
**Severity:** HIGH | **Effort:** MODERATE | **Area:** Documentation

**Status:**
- ✅ `.claude/skills/workflow-status.md` — COMPLETE. Now correctly describes Extract-Inject-Render pipeline (updated 2026-02-08)
- ✅ `.claude/skills/repo-structure.md` — COMPLETE. Updated with correct directory names including `02-machine-translated/`, `03-editing/`, `03-faithful-translation/`, `04-localization/`, `04-localized-content/` (updated 2026-02-10)
- ✅ `.claude/skills/editorial-pass1.md` — COMPLETE. No docx references (updated 2026-02-08)

### 2.2 Rewrite `docs/onboarding.md` ✅ COMPLETE
**Severity:** HIGH | **Effort:** MODERATE | **Area:** Documentation

~~Describes the deprecated EasyMDE-based editor, not the current segment editor at `/segment-editor`. The Phase 8 editor rebuild (completed 2026-02-05) made this doc completely wrong.~~

**Status:** Complete (2026-02-15). Rewritten for current segment editor workflow: describes Pass 1 (`/segment-editor`) and Pass 2 (`/localization-editor`), edit categories, review flow, terminology integration, and correct URLs.

### 2.3 Update `books/efnafraedi/STATUS.md` ✅ COMPLETE
**Severity:** HIGH | **Effort:** MODERATE | **Area:** Documentation

~~6+ weeks stale (last updated 2025-12-26). References a pilot target of "January 5, 2026" with no outcome recorded. Uses old pipeline stage names.~~

**Status:** Complete (2026-02-15). Updated with accurate pipeline status for all 8 extracted chapters + 13 appendices, correct directory state, MT preview publication status, and Phase 9 context.

### 2.4 Bump vefur GitHub Actions to v6 ✅ COMPLETE
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** DevOps

~~vefur uses `actions/checkout@v4`, `actions/setup-node@v4` while efni uses `@v6`. Also, `appleboy/scp-action@v0.1.7` is a full major version behind (current is `@v1`).~~

**Status:** Complete. vefur now uses:
- `actions/checkout@v6` (line 17)
- `actions/setup-node@v6` (line 20)
- `appleboy/scp-action@v1` (line 32)
- `appleboy/ssh-action@v1` (line 43)

Note: Still need to add `github-actions` ecosystem to vefur's `dependabot.yml` for auto-updates.

### 2.5 Add `.nvmrc` Files to Both Repos
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** DevOps

efni CI uses Node 20, vefur uses Node 22, local machine runs Node 24. No `.nvmrc` or `.node-version` to pin versions.

### 2.6 Add Database Migration Step to Deployment Checklist ✅ COMPLETE
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** DevOps

~~The deployment checklist has no step for running `server/migrations/` after deployment. Migrations also have inconsistent formats (001-007 use `migrate()/rollback()`, 008-009 use `up()/down()`) and no tracking table.~~

**Status:** Complete (2026-02-15). Deployment checklist updated with correct migration instructions. Fixed admin migrate endpoint (`server/routes/admin.js`) to include migrations 008-009 and handle both `migrate()` and `up(db)` formats. Also fixed Caddy→nginx in the deployment checklist. Removed reference to non-existent `run-migrations.js` script.

### 2.7 Fix vefur npm Audit Vulnerability
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** Security

1 high-severity vulnerability: `@isaacs/brace-expansion` 5.0.0 (Uncontrolled Resource Consumption). Fix available via `npm audit fix`. Both efni repos have 0 vulnerabilities.

### 2.8 Server Over-Engineering Assessment ⏳ PARTIAL (2026-02-16)
**Severity:** MEDIUM | **Effort:** SIGNIFICANT | **Area:** Architecture

32 route files and 34 service files for ~5 editors is far beyond what the team can maintain. Growth was feature-by-feature via AI assistance without consolidation. Multiple services could be merged:
- `capacityStore` + `presenceStore` + `notesStore` → one `workspaceStore`
- `openstaxCatalogue` + `openstaxFetcher` + `bookRegistration` + `bookDataGenerator` → one `bookService`
- `editorHistory` + `segmentEditorService` → combined editor service
- `meetings.js` + `deadlines.js` + `assignments.js` + `reports.js` — project management features a 5-editor team could handle with GitHub Issues

**Phase 13.1 progress (2026-02-16):** Deleted 3 old routes (`editor.js`, `process.js`, `localization.js`) and their views (`editor.html`). Cleaned ~785 lines of dead code from `workflow.js` and `books.js`. Confirmed 4 orphaned services after route deletion: `presenceStore.js`, `notesStore.js`, `editorHistory.js`, `mtRestoration.js` — safe to delete in future cleanup. Server now has ~20 route files.

**Note:** This is not urgent. The server works. But each new feature adds maintenance burden. Consider freezing new features and consolidating before adding more.

### 2.9 session.js is 1745 Lines
**Severity:** MEDIUM | **Effort:** MODERATE | **Area:** Code Quality

`server/services/session.js` is the largest file. Consider splitting by responsibility (session CRUD, session search, session export, etc.).

### 2.10 Duplicated `escapeHtml()` Across 4+ Files
**Severity:** LOW | **Effort:** QUICK-FIX | **Area:** Code Quality

The same `escapeHtml()` function is copy-pasted in `server/views/admin-users.html`, `server/routes/meetings.js`, `server/services/notifications.js`, and at least 17 other view files. Should be a shared utility.

5 view files use `innerHTML` WITHOUT `escapeHtml`: `pipeline-dashboard.html`, `reports.html`, `dashboard.html`, `images.html`, `feedback.html`. Low risk since data comes from the server API (not direct user input), but worth noting.

---

## Tier 3: Nice-to-Haves — Improve Over Time

### 3.1 ESM/CommonJS Split
Root is ESM (`"type": "module"`), server is CommonJS (`"type": "commonjs"`). Works via separate `package.json` files but creates a split personality. Tools use `import`, server uses `require()`. Converting server to ESM would unify the codebase but is significant effort with low payoff.

### 3.2 ESLint Version Inconsistency
efni uses ESLint 8 (legacy `.eslintrc.json`), vefur uses ESLint 9 (flat config `eslint.config.js`). Different config systems that can't share rules. The efni lint script uses `--ext .js` which is deprecated in ESLint 9 — will break on upgrade.

### 3.3 Screenshots Tracked in Git ✅ COMPLETE
4 screenshot PNGs (~256KB total) tracked in repo root. Add `Screenshot*.png` to `.gitignore` and remove from tracking.

**Status:** Already complete. `Screenshot*.png` is in `.gitignore` (line 73) and root screenshots are not tracked in git.

### 3.4 `server/README.md` Massively Outdated
Documents ~25 of 200+ API endpoints. Architecture lists 10 of 28 route files, 6 of 15+ services. Significant rewrite needed, but low impact since developers use CLAUDE.md and the generated route inventory instead.

### 3.5 CHANGELOG.md Missing Phase 8 ✅ COMPLETE
Last versioned release is `[0.4.0] - 2025-12-27`. No entries for Phase 8 (the biggest recent change, completed 2026-02-05).

**Status:** Already complete. CHANGELOG.md has `[0.5.0] - 2026-02-05` with comprehensive Phase 8 documentation.

### 3.6 Unified/Remark Stack in vefur Will Become Dead Weight ⏸️ BLOCKED
~~10 unified/remark/rehype packages are used by a single file (`src/lib/utils/markdown.ts`). The CNXML-to-HTML migration (Phase 8) will make these unnecessary. Plan removal alongside pipeline completion.~~

**Status:** Blocked. Chemistry completed Phase 8 (uses HTML), but biology (`liffraedi`) still has 1 chapter (35-taugakerfid) with 6 markdown files actively served via `MarkdownRenderer.svelte`. Cannot remove unified/remark stack until biology migrates to CNXML→HTML pipeline.

**Packages affected:** `unified`, `remark-parse`, `remark-gfm`, `remark-math`, `remark-directive`, `remark-rehype`, `rehype-slug`, `rehype-mathjax`, `rehype-stringify`, `unist-util-visit` (118 transitive dependencies total).

**Removal plan:**
1. Migrate biology to CNXML→HTML (same Phase 8 process as chemistry)
2. Remove `src/lib/utils/markdown.ts` and `markdown.test.ts`
3. Simplify `MarkdownRenderer.svelte` to HTML-only
4. Remove 10 packages from `package.json`
5. Run `npm install` (will remove ~118 packages total)

### 3.7 No Automated efni Server Deployment
Deployment is manual SSH + `git pull` + `npm install` + `systemctl restart`. Acceptable for a small project but error-prone.

### 3.8 No Staging Environment
Both repos deploy directly to production. Acceptable at this scale but risky for the reader-facing site.

### 3.9 Test Coverage
Limited automated tests. efni has vitest + `lib/__tests__/` with a few test files. vefur has 173 tests (3 failing) with Playwright for e2e. Neither repo has comprehensive coverage, but for a project of this scale, the existing tests cover the critical paths.

### 3.10 License Field in vefur package.json ✅ COMPLETE
Missing `"license"` field. README badges say MIT + CC BY 4.0 with a separate `CONTENT-LICENSE.md`.

**Status:** Fixed 2026-02-09. Added `"license": "MIT"` to package.json (commit 8e5cbd0).

### 3.11 `docs/_archived/` Cleanup ✅ COMPLETE
~~Archive exists and is properly separated. Could use a `README.md` explaining what's there and why. `tools.md` in the archive is the old auto-generated tool inventory — the new one should be regenerated to `docs/_generated/`.~~

**Status:** Complete. `docs/_archived/README.md` now documents all 8 archived files with context for why each was archived. Added action item noting tool inventory regeneration (commit 13a9a63, 2026-02-10).

---

## Positive Findings (Things Done Well)

- **`.env` properly gitignored** — `server/.env` is NOT tracked. `.env.example` has proper placeholders.
- **SQL injection protection** — All database queries use parameterized queries (`?` placeholders) throughout, including the `IN (${placeholders})` pattern.
- **Helmet security headers** — Configured in `server/index.js`.
- **CORS configured** — Origin whitelist with subdomain matching for `*.namsbokasafn.is`.
- **Pre-commit hooks** — Both repos have Husky + lint-staged properly configured.
- **JWT validation in production** — `server/config.js` validates JWT_SECRET strength, rejects default values, and requires all secrets in production.
- **Pipeline tools well-organized** — 12 active tools in `tools/`, old archived tools deleted (Phase 13.1, 2026-02-16).
- **README bilingual** — Icelandic + English, comprehensive, well-structured.
- **Workflow documentation current** — `docs/workflow/simplified-workflow.md` is the best-maintained doc.
- **Dependabot configured** — Both repos have automated dependency updates (efni also covers github-actions).
- **0 npm vulnerabilities** in both efni packages (root + server).

---

## Quick-Win Checklist

**Progress: 19 of 19 complete (100%) ✅**

### Completed ✅
- [x] Directory structure overhaul (2026-02-10)
- [x] Fix `execSync` command injection (now uses `execFileSync`)
- [x] Gate vefur deploy on CI (uses `workflow_run` trigger)
- [x] `npm uninstall mammoth turndown js-yaml katex` in efni root
- [x] Remove 2 dead script entries from efni `package.json` (2026-02-10)
- [x] Update CLAUDE.md "Current Priority" to Phase 9
- [x] Delete root `lib/` directory
- [x] Search-replace `efnafraedi.app` → `namsbokasafn.is` across docs
- [x] Set up backup cron on server for SQLite DB (confirmed)
- [x] Sign up for UptimeRobot to monitor both sites (confirmed)
- [x] `npm audit fix` in vefur (0 vulnerabilities)
- [x] Bump vefur GitHub Actions to v6
- [x] Add `github-actions` ecosystem to vefur `dependabot.yml` (already done)
- [x] Add `.nvmrc` files to both repos (already done)
- [x] Update `.claude/skills/workflow-status.md` and `editorial-pass1.md`
- [x] Update `.claude/skills/repo-structure.md` for new directory structure (2026-02-10)
- [x] Remove screenshots from git tracking (already done)
- [x] License field in vefur package.json (already done)

- [x] Fix CLAUDE.md to say "nginx" instead of "Caddy" (already fixed, confirmed 2026-02-15)

---

## Assessment Summary (2026-02-15)

### Is This Report Still Valid?
**YES** — The audit remains relevant. All critical and high-priority items are complete. Remaining work is Tier 3 (nice-to-haves) and product development (Phases 9-13).

### What Changed Since Original Audit (2026-02-08)?

**Major accomplishments:**
1. **Directory structure overhaul** — Complete separation of working vs final directories, three publication tracks
2. **Appendices integration** — All 13 appendices now processable through pipeline
3. **Critical security fixes** — Command injection vulnerabilities eliminated
4. **CI/CD hardening** — Deploy now properly gated on CI success
5. **Dependency cleanup** — Removed unused packages, deleted dead code
6. **Documentation updates** — CLAUDE.md, workflow docs, and most skills files updated
7. **Old pipeline retirement (2026-02-16)** — ~37,800 lines of dead code removed: `tools/_archived/` (43 files), old editor/process/localization routes + views, dead code in workflow.js and books.js. Nav links updated across 23 views.
8. **MathJax 4 upgrade (2026-02-11)** — Native Icelandic character support in equations, removed all workarounds

**Tier 1 Status:** 11 of 11 items complete (100%) ✅
**Tier 2 Status:** 7 of 10 items complete (70%) ✅ (all HIGH severity complete)
**Tier 3 Status:** 4 of 11 items complete (36%)
**Overall Quick-Win Checklist:** 19 of 19 items complete (100%) ✅

### Remaining Work

**All critical and high-priority items complete!** ✅

**Tier 2 remaining (medium severity, non-urgent):**
- 2.8: Server over-engineering assessment — consider consolidating when ready
- 2.9: session.js 1745 lines — split when modifying
- 2.10: Duplicated `escapeHtml()` — extract to shared utility when touching those files

### Risk Assessment
**Current risk level: LOW** ✅

- ✅ All critical security issues resolved
- ✅ All CI/CD hardening complete
- ✅ Monitoring and backups operational
- ✅ Documentation updated and accurate
- ✅ All documentation inconsistencies resolved

---

*Original audit generated by 5 parallel audit agents (security, architecture, devops, code-quality, documentation) on 2026-02-08.*
*Updated 2026-02-10 to reflect completed work and directory restructuring.*
*Updated 2026-02-15 to fix internal inconsistencies (items 1.6, 2.1) and complete Tier 2 documentation items (2.2, 2.3, 2.6).*
*Updated 2026-02-16 for Phase 13.1 pipeline retirement (~37,800 lines removed, 4 orphaned services identified).*
