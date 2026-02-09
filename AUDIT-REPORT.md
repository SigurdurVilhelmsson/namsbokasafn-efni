# Project Audit Report

**Date:** 2026-02-08
**Scope:** namsbokasafn-efni (pipeline + server) + namsbokasafn-vefur (web reader)
**Context:** Small educational project (1-2 devs, ~5 editors), built iteratively with AI assistance

---

## Tier 1: Critical / Quick-Fix — Do These Immediately

### 1.1 Command Injection via `execSync` in git operations
**Severity:** CRITICAL | **Effort:** QUICK-FIX | **Area:** Security

`server/routes/reviews.js:581` and `server/services/gitService.js:285` use `execSync` with string interpolation for git commit messages. While quote-escaping is attempted (`.replace(/"/g, '\\"')`), this is insufficient — backticks, `$()`, and other shell metacharacters in commit messages (sourced from user-submitted review data) could execute arbitrary commands.

**Fix:** Use `execFileSync('git', ['commit', '-m', commitMessage])` instead of `execSync` with string interpolation. This avoids shell interpretation entirely.

**Files:** `server/routes/reviews.js:581`, `server/services/gitService.js:285`

### 1.2 vefur Deploy Not Gated on CI
**Severity:** CRITICAL | **Effort:** QUICK-FIX | **Area:** DevOps

`namsbokasafn-vefur/.github/workflows/deploy.yml` runs on every push to `main` independently of `ci.yml`. A broken commit deploys to production even if tests, linting, or type checks fail.

**Fix:** Either merge CI and deploy into one workflow, or add `needs: [test]` to the deploy job referencing the CI workflow.

### 1.3 Remove 4 Unused Root Dependencies
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Architecture

Root `package.json` has 4 dependencies only used by archived tools: `mammoth`, `turndown`, `js-yaml`, `katex`. They add install time and potential vulnerability surface for zero benefit.

**Fix:** `npm uninstall mammoth turndown js-yaml katex`

### 1.4 Clean Up 13+ Dead Scripts in package.json
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Architecture

Root `package.json` lines 10-22 reference tools that have been moved to `tools/_archived/`. Two scripts (`openstax-fetch`, `generate-book-data`) reference files that don't exist at all.

**Fix:** Remove all dead script entries from `package.json`.

### 1.5 Update CLAUDE.md "Current Priority"
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Documentation

CLAUDE.md says the current priority is Phase 8 (editor rebuild), but ROADMAP.md marks Phase 8 as **COMPLETE (2026-02-05)**. This causes Claude Code to prioritize already-completed work in every session.

**Fix:** Update to Phase 9 or whatever is actually current.

### 1.6 Fix Caddy vs nginx Contradiction
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** Documentation

CLAUDE.md says "nginx" but `docs/deployment/linode-deployment-checklist.md` recommends Caddy. Determine which is actually deployed and fix the contradicting document.

### 1.7 Implement Backup Cron for SQLite Database
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** DevOps

The SQLite database (`pipeline-output/sessions.db`) stores all workflow sessions, reviews, terminology, feedback, and assignments. It is the single point of failure with no backup. The deployment checklist documents a cron example but it's not implemented.

**Fix:** Add the documented cron job on the server: `0 2 * * * tar -czf ~/backups/pipeline-output-$(date +%Y%m%d).tar.gz ~/namsbokasafn-efni/pipeline-output/`

### 1.8 Set Up Free Uptime Monitoring
**Severity:** HIGH | **Effort:** QUICK-FIX | **Area:** DevOps

No external monitoring. If the server goes down, nobody is notified. The health endpoint at `/api/health` doesn't even check database connectivity.

**Fix:** Sign up for UptimeRobot (free tier) to monitor both `namsbokasafn.is` and `ritstjorn.namsbokasafn.is`.

### 1.9 Delete Root `lib/` Directory (Dead Code)
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** Architecture

Root `lib/` contains `constants.js`, `utils.js`, `index.js` — duplicates of data in `tools/lib/chapter-modules.js` and `server/data/chemistry-2e.json`. Not imported by any active code. Three-way data duplication.

**Fix:** Delete root `lib/` after confirming no active imports.

### 1.10 Fix Domain References (efnafraedi.app → namsbokasafn.is)
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** Documentation

`package.json` homepage, README.md, and 4+ doc files still reference the old domain `efnafraedi.app`. The project migrated to `namsbokasafn.is`.

**Fix:** Search-and-replace across docs, update `package.json` homepage.

---

## Tier 2: High-Impact Improvements — Worth Doing Soon

### 2.1 Update 3 Stale Claude Code Skills Files
**Severity:** HIGH | **Effort:** MODERATE | **Area:** Documentation

These skills actively mislead Claude Code during every interaction:
- `.claude/skills/workflow-status.md` — describes legacy 8-step pipeline, not current 5-step Extract-Inject-Render
- `.claude/skills/repo-structure.md` — references docx-based directory structure that no longer exists
- `.claude/skills/editorial-pass1.md` — references docx output format

### 2.2 Rewrite `docs/onboarding.md`
**Severity:** HIGH | **Effort:** MODERATE | **Area:** Documentation

Describes the deprecated EasyMDE-based editor, not the current segment editor at `/segment-editor`. The Phase 8 editor rebuild (completed 2026-02-05) made this doc completely wrong.

### 2.3 Update `books/efnafraedi/STATUS.md`
**Severity:** HIGH | **Effort:** MODERATE | **Area:** Documentation

6+ weeks stale (last updated 2025-12-26). References a pilot target of "January 5, 2026" with no outcome recorded. Uses old pipeline stage names.

### 2.4 Bump vefur GitHub Actions to v6
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** DevOps

vefur uses `actions/checkout@v4`, `actions/setup-node@v4` while efni uses `@v6`. Also, `appleboy/scp-action@v0.1.7` is a full major version behind (current is `@v1`).

**Fix:** Also add `github-actions` ecosystem to vefur's `dependabot.yml` so these auto-update.

### 2.5 Add `.nvmrc` Files to Both Repos
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** DevOps

efni CI uses Node 20, vefur uses Node 22, local machine runs Node 24. No `.nvmrc` or `.node-version` to pin versions.

### 2.6 Add Database Migration Step to Deployment Checklist
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** DevOps

The deployment checklist has no step for running `server/migrations/` after deployment. Migrations also have inconsistent formats (001-007 use `migrate()/rollback()`, 008-009 use `up()/down()`) and no tracking table.

### 2.7 Fix vefur npm Audit Vulnerability
**Severity:** MEDIUM | **Effort:** QUICK-FIX | **Area:** Security

1 high-severity vulnerability: `@isaacs/brace-expansion` 5.0.0 (Uncontrolled Resource Consumption). Fix available via `npm audit fix`. Both efni repos have 0 vulnerabilities.

### 2.8 Server Over-Engineering Assessment
**Severity:** MEDIUM | **Effort:** SIGNIFICANT | **Area:** Architecture

32 route files and 34 service files for ~5 editors is far beyond what the team can maintain. Growth was feature-by-feature via AI assistance without consolidation. Multiple services could be merged:
- `capacityStore` + `presenceStore` + `notesStore` → one `workspaceStore`
- `openstaxCatalogue` + `openstaxFetcher` + `bookRegistration` + `bookDataGenerator` → one `bookService`
- `editorHistory` + `segmentEditorService` → combined editor service
- `meetings.js` + `deadlines.js` + `assignments.js` + `reports.js` — project management features a 5-editor team could handle with GitHub Issues

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

### 3.6 Unified/Remark Stack in vefur Will Become Dead Weight
10 unified/remark/rehype packages are used by a single file (`src/lib/utils/markdown.ts`). The CNXML-to-HTML migration (Phase 8) will make these unnecessary. Plan removal alongside pipeline completion.

### 3.7 No Automated efni Server Deployment
Deployment is manual SSH + `git pull` + `npm install` + `systemctl restart`. Acceptable for a small project but error-prone.

### 3.8 No Staging Environment
Both repos deploy directly to production. Acceptable at this scale but risky for the reader-facing site.

### 3.9 Test Coverage
Limited automated tests. efni has vitest + `lib/__tests__/` with a few test files. vefur has 173 tests (3 failing) with Playwright for e2e. Neither repo has comprehensive coverage, but for a project of this scale, the existing tests cover the critical paths.

### 3.10 License Field in vefur package.json ✅ COMPLETE
Missing `"license"` field. README badges say MIT + CC BY 4.0 with a separate `CONTENT-LICENSE.md`.

**Status:** Fixed 2026-02-09. Added `"license": "MIT"` to package.json (commit 8e5cbd0).

### 3.11 `docs/_archived/` Cleanup
Archive exists and is properly separated. Could use a `README.md` explaining what's there and why. `tools.md` in the archive is the old auto-generated tool inventory — the new one should be regenerated to `docs/_generated/`.

---

## Positive Findings (Things Done Well)

- **`.env` properly gitignored** — `server/.env` is NOT tracked. `.env.example` has proper placeholders.
- **SQL injection protection** — All database queries use parameterized queries (`?` placeholders) throughout, including the `IN (${placeholders})` pattern.
- **Helmet security headers** — Configured in `server/index.js`.
- **CORS configured** — Origin whitelist with subdomain matching for `*.namsbokasafn.is`.
- **Pre-commit hooks** — Both repos have Husky + lint-staged properly configured.
- **JWT validation in production** — `server/config.js` validates JWT_SECRET strength, rejects default values, and requires all secrets in production.
- **Pipeline tools well-organized** — 12 active tools in `tools/`, 30+ deprecated tools properly archived in `tools/_archived/`.
- **README bilingual** — Icelandic + English, comprehensive, well-structured.
- **Workflow documentation current** — `docs/workflow/simplified-workflow.md` is the best-maintained doc.
- **Dependabot configured** — Both repos have automated dependency updates (efni also covers github-actions).
- **0 npm vulnerabilities** in both efni packages (root + server).

---

## Quick-Win Checklist

Copy this to an issue and check off items as you go:

- [ ] Fix `execSync` command injection in `server/routes/reviews.js:581` and `server/services/gitService.js:285`
- [ ] Gate vefur deploy on CI (`needs:` in deploy.yml)
- [ ] `npm uninstall mammoth turndown js-yaml katex` in efni root
- [ ] Remove 13 dead script entries from efni `package.json`
- [ ] Update CLAUDE.md "Current Priority" from Phase 8 to current
- [ ] Resolve Caddy vs nginx contradiction in docs
- [ ] Set up backup cron on server for SQLite DB
- [ ] Sign up for UptimeRobot (free) to monitor both sites
- [ ] Delete root `lib/` directory
- [ ] Search-replace `efnafraedi.app` → `namsbokasafn.is` across docs
- [ ] `npm audit fix` in vefur
- [ ] Add `github-actions` ecosystem to vefur `dependabot.yml`
- [ ] Add `.nvmrc` files to both repos
- [ ] Update `.claude/skills/workflow-status.md`, `repo-structure.md`, `editorial-pass1.md`
- [ ] Remove screenshots from git tracking, add to `.gitignore`

---

*Generated by 5 parallel audit agents (security, architecture, devops, code-quality, documentation) on 2026-02-08.*
