# Claude Code Instructions for namsbokasafn-efni

## 📍 ONE SOURCE OF TRUTH — where each kind of fact lives

Adopted 2026-07-26, after a closure audit found the work register had been built from *summaries of itself* and eight findings had silently evaporated. The first attempted fix declared a **second** source of truth and said "consult both" — that is the same failure one level up, and it produced a live disagreement **within one day**.

**Every kind of fact has exactly ONE owner. Every other file points; it never restates.**
*(This line used to say "Six kinds" while the table listed seven — a count in prose drifts even here.)*

| Kind of fact | The ONE owner | Everyone else says |
|---|---|---|
| **Durable rule** — an instruction to obey (never restore `Strict`; check provenance before `--force`) | **this file** | `→ see CLAUDE.md § <name>` |
| **Enforceable value** — a version, enum, role, licence code, count | the file the code reads (`.nvmrc`, `server/constants.js`, `schemas/`, `book-config.json`) + its test | `→ see <file>` — no number, no list |
| **Open work** — is X next / blocked / shipped / deferred | **the active register** in `docs/plans/` (currently `2026-07-21-post-item17-followup-campaign.md`), specifically its ⏩ RESUME block | `→ active plan; read its RESUME block`. **No status verbs anywhere else.** |
| **Design record** — why a decision was made, **owned by one item** | that item's spec/audit doc in `docs/superpowers/specs/`, **frozen and banner-dated** | cite as evidence, never as status |
| **Design record** — a decision **no single item owns** (cited by several plans/specs) | `docs/decisions/`, append-only — write it with **`/decision-record`**, not the generic global `/decision` | cite by path; never restate |
| **Historical evidence** — a review as written, an incident, a finished phase | the doc itself, **banner-frozen** | nothing — frozen files are cited, not synced |
| **Session-recall hint** — pointers, and facts with no repo home | project memory | must carry **no repo `file:line`** and **no item status** |
| **Published rendering** — the dashboard artifact | nothing; it is a **dated snapshot** | — |

**The rule that replaces "consult both":** a frozen document is *evidence*, never status. **If a frozen doc disagrees with the register, the register wins** — the frozen one is dated, the register is live.

**Two consequences worth internalising:**
- **No prose anywhere holds a test count, a migration count, or a green/red CI verdict.** The number you need is whatever `npm test` just printed; the gate status is the Actions tab. Every such number found in the docs on 2026-07-26 was stale, one by 3×.
- **If you notice document B is wrong, fix B.** Never log it as a to-do in document A — that creates a third copy which outlives the fix. (Found twice: a register entry pointing at an already-corrected memory line, by a line number that had since moved.)

**Checkable, not aspirational** — one grep, two seconds, yes/no:
```bash
grep -nE '[a-z0-9_-]+\.(js|sh|md|json|yml):[0-9]+' <project-memory>/MEMORY.md   # must return nothing
```
A fact citing a repo `file:line` belongs in the repo. Memory carries pointers.

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
- **Known gap E-2 — MIT tooling (`tools/`, `scripts/`) reaching AGPL `server/` code.**
  **Do not trust any enumeration here; re-derive before asserting the boundary** — this
  bullet said "one optional `require()`" until 2026-07-28, by which point there were three.
  Search for **both** shapes: a literal `'../server/…'` require/import, and
  `require(path.join(…, 'server', …))`, which a `../server/` grep cannot see.
  **Two classes, treated differently:**
  - `api-translate.js`'s require of `pipelineStatusService` is **optional and
    try/catch-guarded** — sever it if you touch that file.
  - the `server/lib/chapterLabel` imports in the appendix-aware tools/scripts are
    **deliberate and load-bearing** — the C1a two-conventions rule below *mandates* that
    idiom, so **do not sever them**. They are unguarded static imports, so the try/catch
    mitigation does not cover them: the importing tool cannot run without `server/`.
  **The current enumeration lives in root `LICENSE`** — update it there when an edge is
  added or removed, not here.
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

## ⚠️ Content delivery to readers is MANUAL, and its automatic leg has never worked

**`Sync Content to Vefur` (`.github/workflows/sync-content.yml`) has failed 34 of 34 runs since 2026-06-16 — zero successes.** `gh secret list` returns **no repository secrets at all**: `VEFUR_DEPLOY_TOKEN` was never created, so `actions/checkout` gets an empty string and dies at `Checkout vefur`. **This is first-time setup, not a rotation** — do not go looking for an expired credential.

- **The working route is manual**, run from `../namsbokasafn-vefur`: `node scripts/sync-content.js --source ../namsbokasafn-efni` → build → deploy (`workflow_dispatch` on `deploy.yml`, or a `v*.*.*` tag — *CI does not deploy*).
- **✅ A failed content push is now VISIBLE (register C11(b), 2026-07-27).** `scripts/git-backup.sh` writes `pipeline-output/.last-content-backup` **only on healthy runs** — a successful push, or nothing-to-commit **with nothing unpushed** (a quiet run on top of a rejected push fails loudly instead of clearing the alarm) — so **staleness is the alarm**; `GET /api/health` reports `checks.content_backup` (default stale after 6h, `CONTENT_BACKUP_STALE_HOURS`) and flips to `degraded`, and `./scripts/deploy.sh` **prints** the verdict plus the names of any not-ok checks. **Nothing else polls `/api/health`** — no monitor, no UI — so the deploy readout is where you see it. Push failures log ahead/behind counts. ⚠️ **Do not add a rebase to the cron:** `merge.ours.driver` is registered by `deploy.sh`, not by cron, so an unattended rebase over `translation-errors.json` wedges prod mid-rebase — the cron still never fetches before pushing, by design.
- **✅ `deploy.yml` no longer hard-resets prod (C11(c), 2026-07-27).** It had never run and could not (0 runs, 0 repo secrets, no `production` environment; it also restarted the wrong systemd unit and pointed at the wrong app dir). It now simply calls `./scripts/deploy.sh` — **the single deploy path** — which backs up the DB, pins Node to the systemd runtime, and **stashes and re-applies** local editorial changes instead of discarding them. Pinned by `tools/__tests__/deployPathSingleSource.test.js`.
- **⚠️ VERIFYING A VEFUR DEPLOY — route status codes are MEANINGLESS.** The reader site is a client-rendered SPA with an any-path fallback: a real page, a deleted page and nonsense all return **200 with the same ~2,940-byte shell**, and WebFetch sees only that shell. **Test `/content/<book>/chapters/<NN>/<file>.html`, never the page URL.**

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
- **⚠️ `validate` is NOT push-to-main-only** (an earlier version of this file said so).
  `validate.yml:13` has a **path-filtered `pull_request` trigger**, which is *worse* than
  push-only: it appears in the required-status-checks picker looking safe, then never
  reports on most PRs.
- **Branch protection — decided 2026-07-26 (register C12): force-push + deletion blocking
  ONLY.** **Required status checks are mechanically impossible here, not merely unwise**:
  they gate *direct pushes* too, a prod-cron commit has no check runs, and there is no
  bypass identity available (**1 collaborator, 0 deploy keys**). Measured: required checks
  would have blocked **58 merged PRs / 522 commits** during the 2026-07-12→25 billing
  outage. ⚠️ If ever revisited: check-run names are the **lowercase job ids** (`Tests` is
  **two** checks, `test` + `e2e`), and requiring the path-filtered `Validate Status Files`
  or `check-docs` blocks PRs **forever** on the PRs where they don't report.
- **Live gate status: the Actions tab. No document asserts green/red** — including this one. *(A `Current state: … e2e ❌` line lived here and was false for a day after C2 merged as #329.)*

---

## Auth

**⚠️ DURABLE — the `auth_token` cookie is `SameSite=Lax`. DO NOT restore `Strict`.**
Strict is withheld on the cross-site-initiated redirect back from Microsoft, so
`requirePageAuth()` bounced the just-logged-in user straight back to `/login` — a login loop.
It surfaced only in "clean" browsers (Edge); a dev's Chrome holding a valid session masked it.
Lax still blocks cross-site POST/subresource sends — the real CSRF control, since all mutating
endpoints are POST — while letting the top-level GET OAuth return carry the cookie. Applies to
**both** the set- and clear-cookie calls. There is a code comment saying so, and a regression
guard at `server/__tests__/authCallbackCookie.test.js`.

Book-scoped authorization goes through `requireHeadEditor` / `requireHeadEditorFor`.

## Notes for Code Reviewers

This project was built iteratively with AI assistance. Known areas of concern:
- Pipeline tools evolved organically — may have inconsistent patterns
- Error handling may be incomplete in some tools
- Documentation may be ahead of or behind actual implementation in places
- Test suite: Vitest (unit) + Playwright (E2E); vitest workspace runs tools in parallel, server sequentially. **No count is recorded here — run `npm test`.** Remediation Units 0–5 added focused suites: `requireRole`, `contentVersionService`, `localizationReviewService`, `assignmentEnforcement`, `applyStatusRebuild`, `segmentEditConflict`, `viewsPageAuth`.

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
  - **Do not "upgrade to Node 24" as a runtime bump.** It is really an **npm 10 → npm 11 lockfile migration**: npm 11 drops optional `@emnapi/*` peer-dep entries, and the resulting `package-lock.json` breaks prod's `npm ci`. It also means a prod-runtime change plus a native ABI rebuild (cf. the 2026-05-10 ABI incident). Node 22 is supported through the 2026–27 school year. When a quiet window opens, **go 22 → 26 and skip 24** — the npm-11 work is identical either way, but 24's Active-LTS window closes in Oct 2026. `better-sqlite3@13` declares `>=22`, so the DB driver is not the constraint; the lockfile format is.
    - **⚠️ better-sqlite3 12 → 13 changed how the native binary arrives (PR #341, 2026-07-28).** v12 used `prebuild-install` to **download** a `.node` from GitHub releases at install time — a network dependency, and the path by which a wrong-ABI binary arrives (the 2026-05-10 incident). v13 **bundles** the prebuilds in its tarball (`prebuilds/linux-x64.node`), so nothing is fetched. npm still auto-runs node-gyp because the package ships a `binding.gyp`, so **prod needs python3 + make + g++** (present: Ubuntu 24.04, build-essential). Install is ~2 s; SQLite is *not* compiled from source. **⚠️ `npm view <pkg> scripts` reports the SOURCE REPO's manifest, not the shipped artifact — it shows an `install` script this package does not publish. `npm pack` and read the tarball before reasoning about install-time behaviour.**
  - Use `nvm use` (reads `.nvmrc`) before `npm install` if you might commit a lockfile.
- **Content format:** CNXML → Markdown (intermediate) → HTML. Everything else — tools, server framework, test runners, dependency list — is in `package.json`; don't restate it here.
- **Dependencies:** the server's `xlsx` installs from the official SheetJS CDN tarball (`cdn.sheetjs.com`), not npm — npm's last SheetJS release (0.18.5) has unfixed advisories. `npm ci` therefore needs cdn.sheetjs.com reachable, and xlsx version bumps are manual (Dependabot can't follow URL dependencies).
- **Fresh-clone bootstrap:** the server builds its full SQLite schema from scratch on first start — `migrationRunner` creates `pipeline-output/sessions.db` and runs all migrations when the file is missing (fixed 2026-06-10; previously a fresh checkout silently skipped all migrations and write endpoints 500'd)

**⚠️ DURABLE — resolve resource paths against something intrinsic, never `process.cwd()`.** Use `import.meta.url`/`__dirname` for files and `resolveDbPath()` for the DB. The server runs with **cwd=`server/`** (`cd server && npm start`), so a `books/`-relative path resolved against cwd silently points at the wrong tree — this shipped three times in `tools/lib` (`embed-mapping`, `book-rendering-config`, `parseArgs`; #213). Corollary: **run `npm test` from the repo root.**

**⚠️ DURABLE — every clone must register the `ours` merge driver once: `git config merge.ours.driver true`.** `.gitattributes` marks `books/*/translation-errors.json merge=ours` because that derived manifest is committed on *both* the prod cron and dev, and every deploy `git pull --rebase` used to conflict on it. The driver is **not** stored in the repo. `scripts/deploy.sh` re-asserts it before each pull; **dev boxes that pull/merge manually must run it once too.**

## Directory Structure

The `books/{book}/` layout is self-describing — `ls books/<slug>/` shows it, and the stage
names map 1:1 onto the pipeline table below. What `ls` **cannot** tell you is which
directories you may write to (→ § *File Permissions*, next) and the naming trap below.

**⚠️ DURABLE — TWO on-disk chapter-dir conventions exist, and must not be conflated:**
- **Source/structure/status dirs are `ch`-prefixed**: `chNN` / `appendices` — build them with
  `chapterLabel.chapterDir()` (`server/lib/chapterLabel.js`, the canonical idiom).
- **Publication-track OUTPUT dirs are BARE**: `NN` / `appendices` — `chapters/01`, **not**
  `chapters/ch01`.

Three *legitimate* independent bare-dir builders exist, and **they must stay separate**.
⚠️ A **fourth site gets it wrong**: `terminologyService.importFromKeyTerms` builds a
`ch`-prefixed **publication** path, so its chapter filter resolves to a directory that never
exists (logged 2026-07-29 → active register §C16(b)). Neither commented nor test-pinned —
assume more exist and check any publication-dir construction you touch.

1. `publicationService.getPublicationStatus()`'s ternary
2. `tools/validate-chapter.js`'s module-local `pubChapterDirName()` — which sits in the same
   file as `chapterDir()`, holding BOTH conventions side by side on purpose
3. `cnxml-render.js` `formatChapterOutput` — which keys on the **string** `'appendices'`
   rather than the `-1` sentinel. Different domain, same trap.

**Do not unify (1) and (2)** — the comment directly above `pubChapterDirName` says so, and
`server/__tests__/publicationAppendices.test.js` pins the behaviour. **⚠️ (3) is NOT pinned by
any test and no comment guards it** (verified 2026-07-28: no test file references
`formatChapterOutput`) — it is the one a refactor can silently break, so treat it with more
caution than the other two, not less.

Appendices are the `-1` chapter sentinel and carry **no section number**.

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

**⚠️ DURABLE RULE — never decide inject behaviour by comparing two translated strings.** When you need to know whether a piece of segment text is duplicated, figure-derived, or already carried by an element, it is tempting to compare it against another segment (a para against a figure's caption, say). **Every segment is independently editable in the segment editor**, so an equality test silently stops matching the first time an editor revises one side — the bug returns with the whole suite still green, because no test can see a future edit. **Decide from the read-only `01-source` structure instead**: every builder already receives `originalCnxml`, and `books/*/01-source/` cannot drift by project rule. Adopted 2026-07-27 (register C13, where the string-equality version would have looked correct and rotted in production).

**⚠️ When you census the corpus for a structural shape, parse it — do not regex it, and state the counting unit.** Regex counts over `<para>`/`<figure>` nesting produced three wrong numbers in one C13 session (an over-generalised book attribution, a glob silently scoped to one book, and a miscount that included an empty `<caption>`). Use `@xmldom/xmldom` and a parent/ancestor predicate, and say whether you counted **per figure or per para** — for C13 the two differ (71 vs 70) and only per-figure matches the schema gate 1:1.

**⚠️ DURABLE — `book-config.json` is MULTI-CONSUMER; a new non-render key must be excluded via `NON_RENDER_KEYS`.** The item-17 licence key leaked through `book-rendering-config.js` `mergeWithShared()`'s lossless passthrough into `getBookRenderConfig()`'s object and broke a golden `toEqual` migration oracle. Verifying "inert on the render path" must check the config-**object** shape and its tests, not just the rendered HTML — a `toEqual`-vs-golden is a shape pin, not only a `toMatchSnapshot`.

**⚠️ DURABLE — `glossary-unified.json` has TWO producers, the export WRITES UNATTENDED, and its shrink guard does not stop a replacement.** `tools/merge-glossary.js` wrote every committed copy; `server/scripts/export-terminology.js` is the second, and **`scripts/git-backup.sh` invokes it on the 2-hourly cron — unforced.** The two producers are not interchangeable: **`merge-glossary.js` still has 3 sources and Íðorðabankinn is not one of them**, and its own `--db` upsert targets the `terminology_terms` table that migration 032 dropped. The file also feeds the **render** path (approved terms are substituted into published CNXML/HTML via `substituteMathLabels`), so a bad write is **reader-visible**, not merely an MT-quality regression.
- **⚠️ A claim that used to live here — "the first prod run is *expected* to refuse" — was FALSIFIED in production on 2026-08-03.** The first prod run **wrote and pushed**: the guard (`server/lib/glossaryExportDecision.js`, `SHRINK_RATIO = 0.5`) measures **size**, so a −36.5% wholesale producer swap passed and pure growth was structurally invisible. **Never reason about that guard as if it gated correctness; it gates only halving.** Full account → active register §C14 ②.
- **⚠️ AMENDED 2026-08-05 — a SECOND, categorical gate now exists. The line above stays true about the SHRINK guard, and *only* about it.** `SHRINK_RATIO` still measures size and still gates **only halving**; nothing about that changed, and the falsification stands. What was added alongside it is a **producer gate** (`server/lib/glossaryProducer.js`): the two producers emit disjoint per-term shapes (`merge-glossary` writes `category`/`chapter`, the exporter writes `subjects`), new exports carry a self-identifying top-level `producer` stamp, and a payload whose producer differs from the committed file's is refused **categorically** — overridden only by **`--adopt`**, which is **separate from `--force`** (two risks, two acknowledgements) and which the cron, invoking the script bare, **cannot reach**. A refusal also ages now: `/api/health` goes not-ok once a book has been refusing past `GLOSSARY_REFUSAL_STALE_DAYS` (decision D6), and `./scripts/deploy.sh` prints each one with its outcome-specific remedy.
  - **⚠️ Do NOT read that as "the cron now refuses everything."** It refuses a book whose committed glossary **exists**. A book with a `glossary/` directory and **no committed file** has an `absent` baseline, which makes **both** gates structurally inert — nothing to fingerprint, nothing to compare — so that write is still **ungated, pushed, and green**. Which books sit in which state, and the containment still live on prod → register **§C14 ③**.
- **⚠️ `status` on `terminology_translations` is a SELECTOR, not a provenance stamp.** Provenance is `source` + `idordabanki_id`. `status` chooses between **competing translations of one headword** (7,601 of 20,272 headwords have more than one — `atom` is both *frumeind* and *atóm*). **`buildGlossaryMap` keys a `Map` on English and last-write-wins**, so multiple `approved` siblings mean row order silently decides what readers see. → register §C18. **Before judging a value in a status column, read its consumers.**

**⚠️ DURABLE — onboard a new book LICENCE-FIRST: TM auto-regen needs a per-book licence row.** A missing row is a loud 500 on `GET /api/tm/export` but a **SILENT, warn-only stale TM** on the fire-and-forget regen cron — the failure you won't notice.

**⚠️ DURABLE — the `<!-- SEG:… -->` marker takes NO SPACE after the colon.** `segmentParser.parseSegments` matches `<!-- SEG:m001:para:fs-id1 -->`; the spaced form `<!-- SEG: m001:… -->` parses to **`[]`** — an empty segment list, not an error. Prose across this repo (including specs and register entries) writes it spaced for readability, so it is easy to copy the readable form into a test fixture or a tool and get a silent empty parse that looks like a matching bug. **Verify a fixture against the real parser before building on it.** Found 2026-07-29 while writing the C16 re-attach plan, where 10 fixtures had it wrong.

**⚠️ Schema validity ⊥ fidelity.** A RelaxNG gate complements `cnxml-fidelity-check.js`, never replaces it (chemistry has 37 known discrepancies and **0** schema errors). If you run the gate, read its traps first — `jing -i` is mandatory, and jing **aborts the rest of the batch** after the first `fatal:`, making a naive invocation fail-QUIET: `experiments/cnxml-validation-gate/FINDINGS.md`.

See [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md) for full instructions.

## Commands

`npm` scripts (`test`, `validate`, `server:dev`, `update-status`, …) are in `package.json` —
read them there. Listed below are only the tool invocations whose **flags are not guessable**.

**⚠️ CORRECTED 2026-08-04 — the three CNXML tools take `--book`/`--chapter` FLAGS, not
positionals.** This table documented `<book> <chapter>` positionally for all three and
**every one of those forms fails**: `cnxml-extract` and `cnxml-inject` exit 1 with
`Error: --book is required`, and `cnxml-render` dies with an unhandled `path` TypeError
(a raw stack trace, not a usage message). Verified by running all three. `cnxml-extract`
does declare one positional, but it is `input` — a file path — not the book slug.
Ironic given this section's own promise to list "only the tool invocations whose flags
are not guessable".

| Command | Purpose |
|---------|---------|
| `node tools/cnxml-extract.js --book <book> --chapter <N>` | Extract EN segments from CNXML |
| `node tools/cnxml-inject.js --book <book> --chapter <N>` | Inject translations into CNXML |
| `node tools/cnxml-render.js --book <book> --chapter <N>` | Render translated CNXML to HTML |
| `node tools/api-translate.js --book <book> --chapter <ch>` | Translate segments via Málstaður API |
| `node tools/api-translate.js --book <book> --dry-run` | Show translation plan + cost estimate |
| `node tools/translate-chapter-titles.js <slug>` | Translate chapter titles via Málstaður API |
| `node tools/generate-tm.js --book <book> [--chapter N] [--format tmx\|csv\|json]` | Generate TM (TMX default; CSV/JSON) from paired EN/faithful segments |
| `node tools/export-corpus.js --book <book>` | Export aligned EN/MT/faithful/localized research corpus (JSONL+TSV, gitignored `books/{book}/corpus/`) |
| `node tools/resolve-embeds.js --book <book>` | Resolve `<iframe>` embed `/l/` redirects → committed `embed-mapping.json` (networked; run at intake) |

Slash commands live in `.claude/commands/`; skills in `.claude/skills/` — both are listed to the
session automatically with their own descriptions, so they are **not** enumerated here.
⚠️ Several commands are switched **off** for this repo in `.claude/settings.local.json`
(`skillOverrides`) — that file, not this one, says which are live. The skills that documented
the retired Matecat/manual-MT pipeline were **deleted** 2026-07-29, not disabled; the four that
remain all describe the current pipeline.

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
- `tmCreated` - Step 4: TM (TMX) generated in-house by `generate-tm.js`. **Reported, not sequenced** — nothing gates on it and nothing auto-advances it (`tools/cnxml-inject.js` never reads `tm/`, and the producer is book-level + fire-and-forget). It is listed in `NON_SEQUENTIAL_STAGES` (`server/constants.js`), which **both** status read models consume — the DB one (`pipelineStatusService`) and the status.json one (`routes/status.js`). ⚠️ **There are two read models; a change to stage sequencing must land in both, or they silently disagree.** Leaving `tmCreated` in the prerequisite chain silently blocked every DB-side advance past `linguisticReview`.
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
2h) pushes `books/` content to `main`. **⚠️ The last leg is MANUAL — see
§ "Content delivery to readers" above.** The `sync-content.yml` Action that
was designed to close this gap has never worked, so nothing publishes to
namsbokasafn-vefur automatically.

**Manual sync** (run in namsbokasafn-vefur, e.g. to publish before the 2h cron):
```bash
node scripts/sync-content.js --source ../namsbokasafn-efni
```

### ⚠️ Durable cross-repo rules

- **Prune-on-rename MUST EMIT an old-slug → new-slug map — do not merely delete.** Vefur needs
  that map to serve redirects for renamed sections, and since its PR #200 (overlay keys on
  `data-module-id`, not filename) **the old filename no longer exists on its side to derive one
  from**. The moment we prune is the only moment the old name is still known; a prune that just
  unlinks destroys the information permanently and 404s every inbound link. Persist the map with
  the rendered output so it survives across syncs.
- **A sync conflict is WARN-ONLY and does NOT change `sync-content.js`'s exit code.** That is
  deliberate on vefur's side — a duplicate is an *efni* content defect, and failing the sync would
  block a deploy over something vefur cannot fix. **So a clean sync exit is NOT evidence that
  there are no duplicates.** Read the output; the unresolved-conflict count is re-reported after
  the run summary.
- **Reader-visibility depends on whether vefur passes a value through or RECOMPUTES it** —
  content-body labels are visible, a page `<title>` vefur re-derives is not. **Trace the consumer
  before assigning severity.**

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

Extraction uses API-safe `[[type:content]]` bracket markers (100% Málstaður API survival;
the legacy paired `{{i}}…{{/i}}` / `++text++` forms had ~2.3% loss and are still parsed for
backward compat). **The full marker table and the injection back-compat rules are in the
`inline-markers` skill** (`.claude/skills/inline-markers/SKILL.md`), which loads on demand.

## Server Features (Post-Refocus)

The server is an **editorial workflow platform**, not a pipeline orchestration tool. Pipeline
operations (extract, translate, inject, render) are handled via CLI tools. The feature list is
derivable from `server/routes/` — read it there rather than trusting a copy here.

Production health check: `GET /api/health` — DB, migrations, books, auth, and **three** staleness
heartbeats: **off-box DB backup** (`OFFBOX_BACKUP_STALE_HOURS`, default 26), content backup
(`CONTENT_BACKUP_STALE_HOURS`, default 6), glossary export. *(This line omitted the off-box one until
2026-08-04 — re-derive the list from the handler rather than trusting any prose copy, this one
included.)* **Nothing polls it** — the routine surface is what `./scripts/deploy.sh` prints;
otherwise `curl` it by hand. ⚠️ **A `degraded` verdict names which check failed — read it before
concluding anything**; `degraded` has meant `glossary_export` alone since the off-box backup went
live 2026-08-04.

### Change history

**The dated `Recent changes` blocks that used to live here are archived, banner-frozen, at
[docs/history/claude-md-changelog.md](docs/history/claude-md-changelog.md)** — 12 blocks,
2026-03-24 → 2026-07-26. They were 46% of this always-loaded file.

Per § *One source of truth*, that archive is **evidence, never status**: if it disagrees with the
active register, **the register wins**. Every durable rule those blocks carried was lifted into
this file before extraction — if you find one in the archive with no home here, that is a bug in
this file, so fix it here.

## Current Priority

**Open work has exactly one owner: the active register in `docs/plans/`** (currently
`2026-07-21-post-item17-followup-campaign.md`), specifically its ⏩ RESUME block. Read that.

Per § *One source of truth*, this file carries **no status verbs and no counts** — not what is
next, in flight, blocked, or shipped; not module/test/term totals. Every such number found here
on 2026-07-26 was stale, one by 3×. Long-lived context lives in
[ROADMAP.md](ROADMAP.md) and [docs/workflow/development-plan-phases-9-13.md](docs/workflow/development-plan-phases-9-13.md).

**⚠️ Do not restate pipeline-coverage claims here — cite the register.** A line in this section
once claimed the 2026-03-30 duplicate-figure fix "follows the same pattern as `buildNoteDom`"
and covered "liffraedi-2e notes (70)". **Both halves were false**, and together they are a large
part of why the `<note>` gap went unnoticed for four months (it was register C13, fixed
2026-07-27 in PR #337). A reader who trusted that line would have concluded notes were handled.
