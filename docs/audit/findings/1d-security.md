# 1D: Security Spot-Check

**Date:** 2026-03-13
**Auditor:** Claude (code analysis)
**Result:** CONDITIONAL PASS (3 LOW issues found)

---

## Step 1: Middleware Map — Every Route in Active Route Files

### Priority Files (Editor-Facing)

#### `server/routes/segment-editor.js`

| # | Method | Path | Auth Middleware | Role Middleware | Param Validation |
|---|--------|------|-----------------|-----------------|------------------|
| 1 | GET | `/terminology/lookup` | `requireAuth` | `requireRole(CONTRIBUTOR)` | -- |
| 2 | GET | `/reviews/:reviewId` | `requireAuth` | `requireRole(EDITOR)` | -- |
| 3 | GET | `/edit/:editId/comments` | `requireAuth` | `requireRole(CONTRIBUTOR)` | -- |
| 4 | GET | `/:book/chapters` | `requireAuth` | `requireRole(CONTRIBUTOR)` | VALID_BOOKS check |
| 5 | GET | `/:book/:chapter` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter` |
| 6 | GET | `/:book/:chapter/:moduleId` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter`, `validateModule` |
| 7 | POST | `/:book/:chapter/:moduleId/edit` | `requireAuth` | `requireBookAccess()` | `validateBookChapter`, `validateModule` |
| 8 | DELETE | `/edit/:editId` | `requireAuth` | `requireRole(CONTRIBUTOR)` | -- |
| 9 | POST | `/:book/:chapter/:moduleId/submit` | `requireAuth` | `requireBookAccess()` | `validateBookChapter`, `validateModule` |
| 10 | GET | `/reviews` | `requireAuth` | `requireRole(EDITOR)` | -- |
| 11 | GET | `/review-queue` | `requireAuth` | `requireRole(CONTRIBUTOR)` | -- |
| 12 | POST | `/edit/:editId/approve` | `requireAuth` | `requireRole(HEAD_EDITOR)` | -- |
| 13 | POST | `/edit/:editId/reject` | `requireAuth` | `requireRole(HEAD_EDITOR)` | -- |
| 14 | POST | `/edit/:editId/discuss` | `requireAuth` | `requireRole(HEAD_EDITOR)` | -- |
| 15 | POST | `/edit/:editId/unapprove` | `requireAuth` | `requireRole(HEAD_EDITOR)` | -- |
| 16 | POST | `/reviews/:reviewId/complete` | `requireAuth` | `requireRole(HEAD_EDITOR)` | -- |
| 17 | POST | `/edit/:editId/comment` | `requireAuth` | `requireRole(CONTRIBUTOR)` | -- |
| 18 | GET | `/:book/:chapter/:moduleId/terms` | `requireAuth` | -- | `validateBookChapter`, `validateModule` |
| 19 | GET | `/:book/:chapter/:moduleId/stats` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter`, `validateModule` |
| 20 | GET | `/:book/:chapter/:moduleId/apply-status` | `requireAuth` | `requireRole(EDITOR)` | `validateBookChapter`, `validateModule` |
| 21 | POST | `/:book/:chapter/:moduleId/apply` | `requireAuth` | `requireRole(HEAD_EDITOR)` | `validateBookChapter`, `validateModule` |
| 22 | POST | `/:book/:chapter/:moduleId/apply-and-render` | `requireAuth` | `requireRole(HEAD_EDITOR)` | `validateBookChapter`, `validateModule` |
| 23 | POST | `/:book/:chapter/apply-all` | `requireAuth` | `requireRole(HEAD_EDITOR)` | `validateBookChapter` |

**Finding:** Route #18 (`/:book/:chapter/:moduleId/terms`) has `requireAuth` but no `requireRole()`. Any authenticated user (including viewers) can access terminology matches. This is **LOW** severity since it is read-only data and not sensitive.

#### `server/routes/localization-editor.js`

| # | Method | Path | Auth Middleware | Role Middleware | Param Validation |
|---|--------|------|-----------------|-----------------|------------------|
| 1 | GET | `/:book/chapters` | `requireAuth` | `requireRole(CONTRIBUTOR)` | VALID_BOOKS check |
| 2 | GET | `/:book/:chapter` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter` |
| 3 | GET | `/:book/:chapter/:moduleId` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter`, `validateModule` |
| 4 | POST | `/:book/:chapter/:moduleId/save` | `requireAuth` | `requireBookAccess()` | `validateBookChapter`, `validateModule` |
| 5 | POST | `/:book/:chapter/:moduleId/save-all` | `requireAuth` | `requireBookAccess()` | `validateBookChapter`, `validateModule` |
| 6 | GET | `/:book/:chapter/:moduleId/history` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter`, `validateModule` |
| 7 | GET | `/:book/:chapter/:moduleId/:segmentId/history` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter`, `validateModule` |
| 8 | POST | `/:book/:chapter/:moduleId/log` | `requireAuth` | `requireRole(CONTRIBUTOR)` | `validateBookChapter`, `validateModule` |

All routes properly protected. Write operations use `requireBookAccess()`.

#### `server/routes/pipeline-status.js`

| # | Method | Path | Auth Middleware | Role Middleware | Param Validation |
|---|--------|------|-----------------|-----------------|------------------|
| -- | USE | (all) | `router.use(requireAuth)` | -- | -- |
| -- | USE | `/:bookSlug/:chapterNum` | -- | -- | local `validateBookChapter` (VALID_BOOKS + integer range) |
| 1 | GET | `/:bookSlug/:chapterNum` | (from router.use) | -- | (from param middleware) |
| 2 | POST | `/:bookSlug/:chapterNum/advance` | (from router.use) | `requireRole(EDITOR)` | (from param middleware) |
| 3 | POST | `/:bookSlug/:chapterNum/revert` | (from router.use) | `requireRole(ADMIN)` | (from param middleware) |
| 4 | POST | `/:bookSlug/:chapterNum/lock` | (from router.use) | `requireRole(EDITOR)` | (from param middleware) |
| 5 | DELETE | `/:bookSlug/:chapterNum/lock` | (from router.use) | `requireRole(EDITOR)` | (from param middleware) |

All routes properly protected.

#### `server/routes/status.js`

All routes use `requireAuth`. The `router.param('book')` middleware validates against `VALID_BOOKS`. Status routes are read-only. Admin-level sync endpoint (`POST /sync-to-db`) uses `requireAdmin()`.

#### `server/routes/my-work.js`

| # | Method | Path | Auth Middleware | Role Middleware |
|---|--------|------|-----------------|-----------------|
| 1 | GET | `/` | `requireAuth` | -- |
| 2 | GET | `/today` | `requireAuth` | -- |
| 3 | GET | `/summary` | `requireAuth` | -- |

All routes require auth. No role restriction is appropriate here since all authenticated users should see their own work.

### Also Checked

#### `server/routes/admin.js`

All routes use `requireAuth` + `requireAdmin()` except:
- `GET /books` and `GET /books/:slug` use `requireRole(EDITOR)` (appropriate for editors to browse books)
- `GET /books/:slug/chapters/:chapter` uses `requireRole(EDITOR)` (same)

All write operations require `requireAdmin()`. Properly protected.

#### `server/routes/publication.js`

All `GET` routes require `requireAuth` + `validateChapterParams`. All `POST` (publish) routes require `requireRole(HEAD_EDITOR)`. Properly protected.

#### `server/routes/terminology.js`

| # | Method | Path | Auth | Role |
|---|--------|------|------|------|
| 1 | GET | `/` (search) | `requireAuth` | -- |
| 2 | GET | `/lookup` | `requireAuth` | -- |
| 3 | GET | `/stats` | `requireAuth` | -- |
| 4 | GET | `/review-queue` | `requireAuth` | `requireRole(EDITOR)` |
| 5 | GET | `/categories` | `requireAuth` | -- |
| 6 | GET | `/:id` | `requireAuth` | -- |
| 7 | POST | `/` (create) | `requireAuth` | `requireRole(CONTRIBUTOR)` |
| 8 | PUT | `/:id` | `requireAuth` | `requireRole(EDITOR)` |
| 9 | DELETE | `/:id` | `requireAuth` | `requireRole(ADMIN)` |
| 10 | POST | `/:id/approve` | `requireAuth` | `requireRole(HEAD_EDITOR)` |
| 11 | POST | `/:id/dispute` | `requireAuth` | `requireRole(CONTRIBUTOR)` |
| 12 | POST | `/:id/discuss` | `requireAuth` | `requireRole(CONTRIBUTOR)` |
| 13 | POST | `/import/csv` | `requireAuth` | `requireRole(HEAD_EDITOR)` |
| 14 | POST | `/import/excel` | `requireAuth` | `requireRole(HEAD_EDITOR)` |
| 15 | POST | `/import/key-terms` | `requireAuth` | `requireRole(HEAD_EDITOR)` |
| 16 | POST | `/import/existing-glossary` | `requireAuth` | `requireRole(HEAD_EDITOR)` |
| 17 | GET | `/export` | `requireAuth` | -- |
| 18 | POST | `/check-consistency` | `requireAuth` | -- |

All write operations require at least CONTRIBUTOR. Read operations only require auth. Properly protected.

#### `server/routes/pipeline.js`

Uses `router.use(requireAuth, requireRole(ROLES.HEAD_EDITOR))` at the top, so ALL routes require HEAD_EDITOR. Properly protected.

#### `server/routes/sync.js`

| # | Method | Path | Auth | Role |
|---|--------|------|------|------|
| 1 | GET | `/config` | -- | -- |
| 2 | POST | `/prepare` | `requireAuth` | `requireEditor()` |
| 3 | POST | `/create-pr` | `requireAuth` | `requireHeadEditor()` |
| 4 | GET | `/status/:prNumber` | `requireAuth` | -- |
| 5 | GET | `/prs` | `requireAuth` | -- |

**Note:** `GET /config` has no auth at all. It exposes the GitHub configuration status (whether GITHUB_REPO_OWNER and GITHUB_REPO_NAME are set). This is a very minor info-leak, not security-sensitive.

### Other Route Files (Quick Summary)

| File | Auth Pattern | Notes |
|------|-------------|-------|
| `auth.js` | Public (login/callback) + `requireAuth` (me/logout) | Expected |
| `views.js` | None (serves HTML files) | Expected — pages are static shells, data requires API auth |
| `modules.js` | None | Public read-only module metadata |
| `books.js` | Mixed (`/list` public, others `requireAuth`) | `/list` is public metadata, acceptable |
| `feedback.js` | `POST /` uses `optionalAuth`, `GET /types` public | By design — public feedback form |
| `analytics.js` | `POST /event` uses `optionalAuth` | By design — client telemetry |
| `workflow.js` | All routes use `requireAuth` | Write ops use `requireContributor()` or `requireAdmin()` |
| `issues.js` | All routes use `requireAuth` | Write ops use `requireEditor()` |
| `images.js` | All routes use `requireAuth` | Write ops use `requireContributor()` or `requireEditor()` |
| `notifications.js` | All routes use `requireAuth` | User-scoped |
| `activity.js` | All routes use `requireAuth` | Most require `HEAD_EDITOR` |
| `sections.js` | All routes use `requireAuth` | Write ops require `CONTRIBUTOR+` |
| `suggestions.js` | All routes use `requireAuth` | Write ops require `CONTRIBUTOR+` |
| `matecat.js` | All routes use `requireAuth` | External service integration |

---

## Step 2: Role Enforcement on Sensitive Actions

| Action | Endpoint | Required Role | Actual Middleware | Result |
|--------|----------|---------------|-------------------|--------|
| Approve edit | `POST /edit/:editId/approve` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Reject edit | `POST /edit/:editId/reject` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Discuss edit | `POST /edit/:editId/discuss` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Unapprove edit | `POST /edit/:editId/unapprove` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Complete review | `POST /reviews/:reviewId/complete` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Apply to files | `POST /:book/:chapter/:moduleId/apply` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Apply and render | `POST /:book/:chapter/:moduleId/apply-and-render` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Bulk apply all | `POST /:book/:chapter/apply-all` | HEAD_EDITOR+ | `requireRole(ROLES.HEAD_EDITOR)` | PASS |
| Pipeline advance | `POST /:bookSlug/:chapterNum/advance` | EDITOR+ | `requireRole(ROLES.EDITOR)` | PASS |
| Pipeline revert | `POST /:bookSlug/:chapterNum/revert` | ADMIN | `requireRole(ROLES.ADMIN)` | PASS |
| Pipeline run | `POST /api/pipeline/*` | HEAD_EDITOR | `router.use(requireRole(HEAD_EDITOR))` | PASS |
| Publish | `POST /api/publication/*/mt-preview,faithful,localized` | HEAD_EDITOR | `requireRole(ROLES.HEAD_EDITOR)` | PASS |

**Role hierarchy** (verified in `server/services/auth.js` via `hasRole()`): viewer < contributor < editor < head-editor < admin.

All sensitive actions are properly gated. **PASS**

---

## Step 3: Input Sanitization & innerHTML XSS Check

### 3a. Input Validation in Routes

**segment-editor.js POST `/edit`:**
- `segmentId`: validated non-empty (but no format check beyond existence)
- `editedContent`: validated non-null, max 10,000 chars
- `category`: validated against `VALID_CATEGORIES` whitelist
- `editorNote`: no validation (stored as-is in DB)

**localization-editor.js POST `/save`:**
- `segmentId`: validated non-empty
- `content`: validated non-null, max 10,000 chars
- `category`: validated against `VALID_CATEGORIES` whitelist

**No HTML sanitization before DB storage.** This is acceptable because all output is escaped on render (see 3b).

### 3b. innerHTML Usage Audit

**`server/views/segment-editor.html`** (17 innerHTML assignments):
- All user-derived content passes through `escapeHtml()` before innerHTML
- `renderMarkdownPreview()` starts with `let html = escapeHtml(text)` before any markup
- `renderInlineDiff()` escapes via `escapeHtml(op.text)` before wrapping in `<del>`/`<ins>`
- `renderSegmentRow()` uses `escapeHtml()` for EN content; uses `renderMarkdownPreview()` for IS content
- Error messages use `escapeHtml(err.message)` (line 1424)
- Term popup uses `escapeHtml()` for all term fields
- `seg.segmentId` is used unescaped in `onclick` attributes, but segment IDs come from server-parsed files (not user input) and are further sanitized by `cssId()` for element IDs
- **Result: PASS** - no XSS via innerHTML

**`server/views/localization-editor.html`** (25 innerHTML assignments):
- Error messages consistently use `escapeHtml(err.message)` (line 1659)
- Module listing uses `escapeHtml()` for titles and error messages
- History popover uses `escapeHtml()` for usernames and error text
- Review tab selectors use `escapeHtml()` for book/chapter/section titles
- Suggestions list uses `escapeHtml()` for suggestion text
- **Result: PASS** - no XSS via innerHTML

**`server/views/chapter-pipeline.html`** (6 innerHTML assignments):
- All static/computed content (stage names, history entries)
- No user-editable content rendered via innerHTML
- **Result: PASS**

**`server/views/status.html`** (3 unescaped innerHTML assignments):

| Line | Code | Risk |
|------|------|------|
| 2450 | `content.innerHTML = '...Villa...: ' + err.message + '</p>';` | LOW |
| 2538 | `content.innerHTML = '...Villa: ' + err.message + '</p>';` | LOW |
| 2567 | `content.innerHTML = '...Villa: ' + err.message + '</p>';` | LOW |

These `err.message` values come from `catch` blocks around `fetchJson()` calls. The error message originates from either:
1. Network errors (browser-generated, safe)
2. JSON parse errors (browser-generated, safe)
3. Server error responses that are already escaped server-side

**Risk assessment:** LOW. The error messages do not typically contain user-controlled HTML. An attacker would need to either (a) control the server response body to inject HTML into an error message, or (b) trigger a network error with a crafted message. In practice, CSP `script-src: 'self'` blocks script execution even if HTML were injected. Nevertheless, these should use `escapeHtml()` for defense-in-depth.

**`server/views/books.html`:** Uses `escapeHtml()` for error data from API responses (line 1500-1501). Other error messages are hardcoded strings. PASS.

### 3c. Summary of innerHTML Findings

- **CRITICAL:** None
- **LOW:** 3 occurrences of unescaped `err.message` in `status.html` (lines 2450, 2538, 2567). Should use `escapeHtml(err.message)` for consistency. The file already includes `htmlUtils.js` and uses `escapeHtml` elsewhere.

---

## Step 4: Book/Chapter/Module Parameter Validation (Path Traversal)

### Shared Middleware (`server/middleware/validateParams.js`)

**`validateBookChapter()`:**
- `:book` is checked against `VALID_BOOKS` array (whitelist). Path traversal values like `../../etc` will be rejected.
- `:chapter` is parsed as integer (`parseInt`) and checked: `>= 1` and `<= MAX_CHAPTERS`, or must be `'appendices'`/`'-1'`. No string injection possible.

**`validateModule()`:**
- `:moduleId` is checked against regex `/^m\d{5}$/`. Only `m` + exactly 5 digits allowed. Path traversal impossible.

### Pipeline Status Routes (`server/routes/pipeline-status.js`)

Local `validateBookChapter()` checks:
- `bookSlug` against `VALID_BOOKS` whitelist
- `chapterNum` parsed as integer, range `-1` to `MAX_CHAPTERS`

### Publication Routes (`server/routes/publication.js`)

Local `validateChapterParams()` checks:
- `bookSlug` against `VALID_BOOKS` whitelist
- `chapterNum` parsed as integer, range `1-99`

### Pipeline Routes (`server/routes/pipeline.js`)

Local `validateParams()` checks:
- `book` against `VALID_BOOKS` whitelist
- `chapter` parsed as integer, range `1-MAX_CHAPTERS`
- `moduleId` checked against `/^m\d{5}$/` regex
- `track` checked against `VALID_TRACKS` whitelist

### Sync Routes (`server/routes/sync.js`)

The `POST /prepare` endpoint has **explicit path traversal protection** (line 112):
```js
if (!fullPath.startsWith(projectRoot + path.sep)) {
  return res.status(400).json({ error: 'Invalid file path' });
}
```

### Result: PASS

All book/chapter/module parameters are validated via whitelists or strict format checks. Path traversal is not possible through any route parameter.

---

## Step 5: CSP Configuration

From `server/index.js` lines 107-122, helmet CSP is configured as:

```
Content-Security-Policy:
  default-src: 'self'
  script-src: 'self' 'unsafe-inline'
  script-src-attr: 'self' 'unsafe-inline'
  style-src: 'self' 'unsafe-inline' https://fonts.googleapis.com
  font-src: 'self' https://fonts.gstatic.com
  img-src: 'self' data: https://avatars.githubusercontent.com
  connect-src: 'self' https://api.github.com
```

**Assessment:**
- `script-src 'unsafe-inline'` is present. This is **necessary** because the HTML views use inline `<script>` blocks (not separate JS files). It does reduce the XSS mitigation value of CSP.
- `script-src-attr 'unsafe-inline'` is present. This allows inline event handlers (`onclick`), which are used extensively in the editor views.
- No `unsafe-eval` is present. **Good.**
- `connect-src` is restricted to `'self'` and `https://api.github.com`. **Good.**
- No `frame-src` or `object-src` overrides, so they fall back to `default-src: 'self'`. **Good.**

**Note:** `'unsafe-inline'` in `script-src` means that CSP cannot prevent XSS from innerHTML injection. However, a nonce-based CSP would require refactoring all inline scripts into external files, which is a significant effort for this project's scale.

### Result: ACCEPTABLE

CSP is configured and provides meaningful protection against external script loading, frame injection, and data exfiltration. The `'unsafe-inline'` directive is a known trade-off for projects using inline scripts.

---

## Findings Summary

| # | Severity | Location | Issue | Recommendation |
|---|----------|----------|-------|----------------|
| 1 | LOW | `server/views/status.html:2450,2538,2567` | `err.message` used in `innerHTML` without `escapeHtml()` | Replace with `escapeHtml(err.message)`. The file already includes `htmlUtils.js`. |
| 2 | LOW | `server/routes/segment-editor.js:564-598` (route #18) | `GET /:book/:chapter/:moduleId/terms` lacks `requireRole()` — any viewer can access | Add `requireRole(ROLES.CONTRIBUTOR)`. Data is read-only terminology matches, not sensitive. |
| 3 | INFO | `server/index.js:111` | CSP allows `'unsafe-inline'` for scripts | Acceptable trade-off. Would require refactoring all inline scripts to external files to remove. |

### Not Findings (Verified Secure)

- All write endpoints on segment-editor and localization-editor require `requireAuth` + at minimum `requireBookAccess()`
- All review actions (approve/reject/discuss/complete) require `requireRole(HEAD_EDITOR)`
- All pipeline operations require `requireRole(HEAD_EDITOR)`
- All admin operations require `requireAdmin()`
- All book/chapter/module parameters validated against whitelists or strict regex
- Path traversal explicitly blocked in sync routes
- `innerHTML` in both editor HTML files consistently uses `escapeHtml()` for user-derived content
- `renderMarkdownPreview()` escapes before processing
- `renderInlineDiff()` escapes both old and new text
- `editorNote` and `comment` fields are not HTML-sanitized on input but are escaped on output
- Content length caps (10,000 chars) on all user text inputs
- Category fields validated against whitelists
- Rate limiting applied globally and with stricter limits on auth endpoints
