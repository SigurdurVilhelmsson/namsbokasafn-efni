# Security Audit — namsbokasafn-efni
_Generated 2026-05-29 — via the `security-audit` workflow (82 agents · 11 lenses · adversarial verification)_

Scope: Express editorial workflow server (`server/`) and pipeline CLI tools (`tools/`). Threat model: ~5 trusted editors authenticated via Microsoft Entra ID; small educational project (1–2 developers); not a high-value target. Severities below are **threat-model-calibrated** (the adversarially-adjusted rating), which in several cases is lower than the raw CVE/CVSS rating.

## Executive summary

Overall posture is reasonable for a small, trusted-editor educational platform. The fundamentals are mostly sound: SQL access is parameterized throughout (no injectable query was confirmed), most output sinks are HTML-escaped, session cookies are `httpOnly` + `Secure` + `SameSite=strict`, auth and public-submission routes have dedicated rate limiters separate from the general one, and production is documented to run a single-tenant Entra app registration (which neutralizes what would otherwise be a serious OAuth account-takeover path).

There is **one genuine high-severity finding**: stored XSS via attributed CNXML tags (e.g. `<image onerror=...>`, `<sub on*=...>`) that survive both the inject-time escaping and the render passthrough, then auto-execute when a head-editor or admin opens the live preview — a realistic editor→admin privilege-escalation path given the CSP allows `'unsafe-inline'`. The remaining risks cluster into two systemic themes worth naming: (a) **authorization asymmetry** — write endpoints are correctly chapter-scoped via `requireBookAccess()`, but the matching read endpoints, several review-side mutations, and a couple of write paths are not, allowing cross-editor/cross-book read and some write outside assigned scope; and (b) a **dependency/lockfile gap** — the committed `server/package-lock.json` pins versions with known advisories (`npm audit --omit=dev` reports 10: 4 high, 6 moderate — incl. `lodash`, `multer`, `path-to-regexp`, `xlsx`), while the installed `node_modules` has already drifted to fixed versions that were never committed, so production `npm ci` reinstalls the vulnerable set.

None of the findings supports anonymous RCE or anonymous data theft of high-value secrets; impacts are bounded by the small, authenticated, trusted user base. The recommended priorities are: fix the attributed-tag XSS at both inject and render, regenerate and commit the server lockfile, and close the read-side authorization asymmetry.

## Risk matrix

| ID | Severity | Dimension | Title | File | Reachable by |
|----|----------|-----------|-------|------|--------------|
| SA-01 | High | xss-output-encoding | Stored XSS via attributed allowlisted CNXML tags (`<image onerror>`, `<sub/sup on*>`) in preview-rendered content | tools/lib/cnxml-elements.js:786-787; tools/cnxml-inject.js:1304-1328 | any-editor |
| SA-02 | Medium | path-traversal-fileops | Path traversal in book download: `chapter` query param escapes book dir, ZIPs arbitrary directory | server/routes/books.js:361-371 | any-editor |
| SA-03 | Medium | xss-output-encoding | Stored XSS via `javascript:` URL in `<link url=...>` markers (no protocol allowlist) | tools/lib/cnxml-elements.js:633-635 | any-editor |
| SA-04 | Medium | xss-output-encoding | Stored XSS via terminology subject tags (no enum validation, emitted unescaped to innerHTML) | server/views/terminology.html:1169/1289/1297; server/services/terminologyService.js:313-318 | any-editor |
| SA-05 | Medium | deps-supplychain | xlsx 0.18.5 parses attacker-uploaded spreadsheets; prototype pollution + ReDoS, no npm fix | server/services/terminologyService.js:726-729 | admin-only (head-editor+) |
| SA-06 | Medium | deps-supplychain | Committed server lockfile pins vulnerable versions; prod `npm ci` installs them | server/package-lock.json:1 | any-editor |
| SA-07 | Low | authn-jwt-oauth | Stateless 24h JWT: no DB re-check / revocation; deactivation, demotion, logout don't invalidate live sessions | server/middleware/requireAuth.js:42-59 | any-editor |
| SA-08 | Low | authz-rbac-idor | Cross-editor chapter-scope bypass: segment/localization READ endpoints skip `requireBookAccess()` | server/routes/segment-editor.js:168-215, 904-1017; localization-editor.js:109-130, 421-468 | any-editor |
| SA-09 | Low | input-validation | Cross-book authz gap: segment-edit approve/reject/revert act on global `editId` with role-only guard | server/routes/segment-editor.js:412 | any-editor |
| SA-10 | Low | authz-rbac-idor | Localization `/log` write endpoint omits `requireBookAccess()` that sibling save endpoints enforce | server/routes/localization-editor.js:474-515 | any-editor |
| SA-11 | Low | authz-rbac-idor | Book file-import endpoints let any editor overwrite any book/chapter source files (no `requireBookAccess`) | server/routes/books.js:492-595, 604+ | any-editor |
| SA-12 | Low | input-validation | Unauthenticated feedback endpoint stores unbounded, unvalidated fields | server/routes/feedback.js:51-85 | unauthenticated |
| SA-13 | Low | input-validation | Type confusion: body fields used in string ops before type validation (uncaught 500) | server/routes/feedback.js:62 | unauthenticated |
| SA-14 | Low | path-traversal-fileops | Path traversal in live-preview route: unvalidated `moduleId` + `track` read arbitrary `.cnxml` | server/routes/segment-editor.js:992-1002 | any-editor |
| SA-15 | Low | secrets-cors-headers-csrf | Helmet CSP permits `'unsafe-inline'` for `scriptSrc` and `scriptSrcAttr` | server/index.js:106-107 | any-editor |
| SA-16 | Low | secrets-cors-headers-csrf | Elevated rate-limit budget granted on mere presence of `auth_token` cookie (validity unchecked) | server/index.js:123-129 | unauthenticated |
| SA-17 | Low | deps-supplychain | multer 2.1.0 (lockfile-pinned) DoS via uncontrolled recursion, reachable on every upload route | server/routes/terminology.js:25-37 | any-editor |
| SA-18 | Low | dos-resource-deserialization | Unbounded synchronous regex matching in `/api/terminology/check-consistency` (event-loop amplification) | server/services/terminologyService.js:1061-1077 | any-editor |
| SA-19 | Low | authn-jwt-oauth | Open redirect after login via backslash in `redirect` query param | server/routes/auth.js:68-73 | unauthenticated |

## Confirmed findings

### SA-01 — Stored XSS via attributed allowlisted CNXML tags rendered to preview

- **Severity:** High
- **CWE:** CWE-79 (Cross-site Scripting)
- **Location:** `tools/lib/cnxml-elements.js:786-787` (render passthrough); `tools/cnxml-inject.js:1304-1328` (inject allowlist)
- **Reachable by:** any-editor

```js
// tools/lib/cnxml-elements.js (render):
  result = result.replace(/<sub>([\s\S]*?)<\/sub>/g, '<sub>$1</sub>');
  result = result.replace(/<sup>([\s\S]*?)<\/sup>/g, '<sup>$1</sup>');

// tools/cnxml-inject.js (inject escaping, allowlist protects the tag's open-token, NOT its attributes):
  result = result.replace(
    /<(\/?)(term|emphasis|sup|sub|newline|space|footnote|link|equation|media|image|m:math|m:[a-z]+)([\s>\/])/g,
    (match) => { cnxmlTags.push(match); return `\x00CNXML:${cnxmlTags.length - 1}\x00`; }
  );
  result = result.replace(/<(newline|space|link|image)\s[^>]*\/>/g, (match) => {
    cnxmlTags.push(match); return `\x00CNXML:${cnxmlTags.length - 1}\x00`;
  });
  result = result.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  result = result.replace(/</g, '&lt;');
```

**Description.** The inject step correctly escapes arbitrary editor-typed HTML (`<script>` becomes `&lt;script>`), but it protects an allowlist of CNXML tag names from escaping. The protection regex only swallows the tag's open-token (e.g. `<image ` or `<sub`), so any **attributes** the editor placed after the tag name remain in the surrounding text — which by then contains no `<` or `&`, so the entity-escaping at lines 1324–1325 leaves them untouched. At render time, `processInlineContent` only rewrites bare/exact-shaped tags (`<sub>` literal at line 786; `<emphasis effect="...">` at line 616; `<media><image>` with extracted `src`/`alt` at 710), so an attributed variant matches no transform and falls through verbatim (the namespaced-tag strip at 795–796 does not touch non-namespaced tags). It was verified end-to-end that `<image src="x" onerror="alert(1)"/>` and `<sub onmouseover="alert(2)">z</sub>` survive both inject escaping and render passthrough. Browsers parse a bare `<image>` as `<img>`, so `onerror` auto-fires with no interaction; `<sub>`/`<sup>` `on*` fire on hover. Helmet CSP allows `'unsafe-inline'` in `scriptSrc`/`scriptSrcAttr` (`server/index.js:106-107`), so inline event handlers are not blocked.

**Attack scenario.** An authenticated editor (with book access via `requireBookAccess`) edits a segment via `POST /api/segment-editor/:book/:chapter/:moduleId/edit` and includes `<image src=q onerror="fetch('/api/admin/users',{method:'POST',body:JSON.stringify({email:'attacker@x.is',role:'admin'}),headers:{'Content-Type':'application/json'}})"/>` in `editedContent`. A head-editor applies the edits and opens the live preview (`GET /:book/:chapter/:moduleId/preview`); `segment-editor.js` does `win.document.write(html)`, so the rendered `<image onerror>` auto-executes in the head-editor's/admin's authenticated session, performing privileged actions on their behalf (privilege escalation) or exfiltrating session state. The `POST /api/admin/users` path has no CSRF token, and `SameSite=strict` does not help (the request is same-site in the victim session); `httpOnly` blocks token theft via `document.cookie` but not action-on-behalf.

**Recommendation.** Do not rely on a tag-name allowlist that ignores attributes. After reconstructing CNXML, parse the assembled fragment with a real XML/CNXML parser and reject or strip any element attribute not in a per-element allowlist (CNXML has a small fixed attribute set: `id`, `effect`, `url`, `target-id`, `document`, `src`, `alt`, etc.). At render time in `processInlineContent`, never echo source tags verbatim — match each supported element explicitly and re-emit only known-safe attributes through `escapeAttr`, stripping all unknown attributes (especially `on*`). Add output-side defense: run final HTML through a sanitizer (DOMPurify/sanitize-html) before it leaves `renderModule`, and remove `'unsafe-inline'` from CSP `script-src` (see SA-15).

### SA-02 — Path traversal in book download ZIPs an arbitrary directory

- **Severity:** Medium
- **CWE:** CWE-22 (Path Traversal)
- **Location:** `server/routes/books.js:361-371`
- **Reachable by:** any-editor

```js
const paddedChapter = chapter ? String(chapter).padStart(2, '0') : null;
    const chapterDirName = paddedChapter ? `${config.chPrefix}${paddedChapter}` : null;
...
      const chapterPath = path.join(sourceDir, chapterDirName);
      if (!fs.existsSync(chapterPath)) {
        return res.status(404).json({
          error: 'Not found',
          message: `Chapter ${chapter} not found`,
        });
```

**Description.** The `chapter` query param is passed through `String(chapter).padStart(2,'0')` and joined onto `sourceDir`. `padStart` only pads strings shorter than 2 chars; it does not strip or reject `..`, so a value like `../../../../../../tmp` is preserved verbatim. For the publication download types (`pub-mt-preview`, `pub-faithful`, `pub-localized`), `config.chPrefix === ''`, so `chapterDirName` equals the raw padded chapter with no `ch` prefix to absorb a directory level; `path.join(...publication dir, '../../../../../../tmp')` resolves outside the book directory. `addFilesFromDir` then `archive.file()`s every entry ending in `config.ext` (`.html`/`.md`) into the returned ZIP. The route guard is `requireAuth` only — no `requireRole`, no `requireBookAccess()` — so any authenticated principal (Viewer and up; `AUTO_CREATE_USERS` defaults to true) can reach it. Reads are blind (gated by `existsSync`), single-directory-level (no recursion), and extension-filtered, but still expose files outside the user's authorized scope and return raw file bytes.

**Attack scenario.** Any logged-in user requests `GET /api/books/efnafraedi-2e/download?type=pub-faithful&chapter=../../../../../../some/existing/dir`. The server escapes the books tree and streams a ZIP of every `.html`/`.md` file in that arbitrary directory.

**Recommendation.** Validate `chapter` as `publication.js` does: `const n = parseInt(chapter,10); if (isNaN(n)||n<1||n>99) return 400;` and build the directory name only from the parsed integer. Add a `requireBookAccess()` (or at minimum `requireEditor()`) guard. After constructing `chapterPath`/`sourceDir`, assert the resolved path stays within `path.join(booksDir, bookId)` via a `path.resolve` prefix check.

### SA-03 — Stored XSS via `javascript:` URL in `<link url=...>` markers

- **Severity:** Medium
- **CWE:** CWE-79 (Cross-site Scripting)
- **Location:** `tools/lib/cnxml-elements.js:633-635`
- **Reachable by:** any-editor

```js
  // Convert links
  result = result.replace(/<link\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g, (match, url, inner) => {
    return `<a href="${escapeAttr(url)}">${processInlineContent(inner, context)}</a>`;
  });
```

**Description.** The `<link url="...">` handler builds an anchor with the editor-supplied URL passed only through `escapeAttr` (`cnxml-elements.js:251-257`), which escapes `&"<>` but performs no URL-protocol validation. Inject turns `[[link:text|url]]` into `<link url="url">text</link>` (`cnxml-inject.js:1219`) and protects that whole tag from entity-escaping via the placeholder allowlist, so a `javascript:` scheme passes through to render intact: `<link url="javascript:alert(document.cookie)">click</link>` renders to `<a href="javascript:alert(document.cookie)">click</a>`. CSP `'unsafe-inline'` in `script-src` does not block `javascript:` URIs. Notably the **separate** markdown-link inject path (`cnxml-inject.js:1240-1242`) does allowlist `http(s)` — proving the developers guarded one link path and missed the bracket one. Click-required, hence medium.

**Attack scenario.** An editor submits `[[link:Sjá nánar|javascript:fetch('/api/admin/users/123',{method:'PUT',body:JSON.stringify({role:'admin'}),headers:{'Content-Type':'application/json'}})]]`. After apply, a head-editor opens the module preview and clicks the seemingly-legitimate "Sjá nánar" link, executing the script with the head-editor's/admin's session.

**Recommendation.** In the `<link url>` render handler, validate the scheme against an allowlist (`http`, `https`, `mailto`, relative/anchor refs) before emitting the `href`; reject/neutralize `javascript:`, `data:`, `vbscript:`. Apply the same check in `cnxml-inject.js` where `[[link:..|url]]` and `[text](url)` are converted. Centralize a `sanitizeUrl()` helper used by every link path.

### SA-04 — Stored XSS via terminology subject tags

- **Severity:** Medium
- **CWE:** CWE-79 (Cross-site Scripting)
- **Location:** `server/views/terminology.html:1169, 1289/1297` (sinks); `server/services/terminologyService.js:313-318` (raw store)
- **Reachable by:** any-editor

```js
// terminology.html sink (formatSubject returns raw s):
<span class="term-subject"><span class="subject-badges">${allSubjects.map(s => '<span class="subject-badge">' + formatSubject(s) + '</span>').join('')}</span></span>
// formatSubject (terminology.html:1736):
    function formatSubject(s) {
      return SUBJECT_NAMES[s] || s;
    }
// terminologyService.js createTranslation — subjects stored with NO allowlist:
  if (subjects && subjects.length > 0) {
    const insertSubject = db.prepare(
      'INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
    );
    for (const subj of subjects) {
      insertSubject.run(translationId, subj);
    }
  }
```

**Description.** `POST /api/terminology` and `POST /api/terminology/:headwordId/translations` accept a `subjects[]` array. The service inserts each subject string raw, with no validation against the `SUBJECTS` enum (the enum at line 49 is used only for client UI/filtering, not as a write gate). In the UI, `formatSubject(s)` returns the raw string when it is not in the client-side `SUBJECT_NAMES` map, and the result is interpolated directly into `innerHTML` at `terminology.html:1169` (list) and `1289`/`1297` (detail). Unlike the adjacent free-text fields (english, icelandic, notes, definitions, inflections), all of which go through `escapeHtml`, the subject value is not escaped. It fires via `innerHTML` with no click (auto-firing) for any editor who browses the terminology list or opens a term. CSP `scriptSrcAttr 'unsafe-inline'` permits inline `onerror=`/`onload=`, and `imgSrc 'self','data:'` lets `<img src=x onerror=...>` 404 and fire.

**Attack scenario.** An editor calls `POST /api/terminology` with `{english:'x', subjects:['<img src=x onerror=alert(document.cookie)>']}`. Any other editor/head-editor/admin who later opens the Terminology page triggers the handler in their browser with their session.

**Recommendation.** Validate `subjects` server-side against the `SUBJECTS` allowlist in `createTranslation`/`updateTranslation`/`createHeadword` (reject or drop unknown values). Additionally escape on output: change `formatSubject` to `escapeHtml(SUBJECT_NAMES[s] || s)` before insertion into `innerHTML`.

### SA-05 — xlsx 0.18.5 parses attacker-uploaded spreadsheets (prototype pollution + ReDoS, no npm fix)

- **Severity:** Medium *(originally High; downgraded — reachable only by head-editor/admin, i.e. self-DoS by a trusted insider on a low-value target)*
- **CWE:** CWE-1321 (Prototype Pollution) / CWE-1333 (ReDoS)
- **Location:** `server/services/terminologyService.js:726-729`
- **Reachable by:** admin-only (route guard is `requireRole(HEAD_EDITOR)`; head-editors and admins)

```js
  const workbook =
    typeof fileContent === 'string'
      ? XLSX.readFile(fileContent)
      : XLSX.read(fileContent, { type: 'buffer' });
```

> **Near-duplicate note:** This is the same issue raised a second time in *Needs manual review* ("Excel terminology import parses untrusted uploads with vulnerable xlsx 0.18.5"). The second pass argued **low** because the only triggerers are head-editors/admins who can already disrupt the single-process server via legitimate features (self-DoS), and no cross-trust-boundary or cross-user gadget chain was demonstrated. Treated here as one finding at the medium/low boundary.

**Description.** `xlsx@0.18.5` carries CVE-2023-30533 (prototype pollution, GHSA-4r6h-8v6p-xvw6) and CVE-2024-22363 (ReDoS, GHSA-5pgg-2g8v-p4x9). `npm audit` reports `fixAvailable:false` because SheetJS withdrew patched builds from the public npm registry (only the SheetJS CDN ships ≥0.20.2). Here the parse runs on untrusted content: `req.file.buffer` from the multer upload in `POST /api/terminology/import/excel` flows straight into `XLSX.read(...,{type:'buffer'})`. The multer `fileFilter` checks only extension (`.xlsx`/`.xls`/`.csv`) and a 5MB cap — neither validates workbook structure. The parse is synchronous on the request path in a single-process server, so a ReDoS payload hangs the event loop for all editors; a pollution payload can corrupt subsequent object handling process-wide until restart.

**Attack scenario.** A head-editor (or a promoted/compromised account) uploads a crafted `.xlsx` whose structure triggers prototype pollution during `XLSX.read`/`sheet_to_json`, or whose cell value triggers catastrophic backtracking that pins the single Node process's CPU.

**Recommendation.** Replace the npm `xlsx@0.18.5` with the patched SheetJS CDN build (`https://cdn.sheetjs.com/xlsx-0.20.x`) or a maintained alternative (e.g. `exceljs`). Until then, validate workbook structure, run `sheet_to_json` against a known-column allowlist, reject `__proto__`/`constructor`/`prototype` keys, keep the route restricted to HEAD_EDITOR, and sandbox the parse in a worker thread with a timeout to contain ReDoS.

### SA-06 — Committed server lockfile pins vulnerable versions; prod `npm ci` installs them

- **Severity:** Medium *(originally High; downgraded — internal trusted-editor surface, no anonymous exploit)*
- **CWE:** CWE-1104 (Use of Unmaintained/Vulnerable Third-Party Components)
- **Location:** `server/package-lock.json:1`
- **Reachable by:** any-editor

```
node_modules/multer 2.1.0
node_modules/nodemailer 8.0.4
node_modules/path-to-regexp 8.3.0
node_modules/ip-address 10.1.0
node_modules/brace-expansion 5.0.3
node_modules/lodash 4.17.23
node_modules/qs 6.15.0   (versions resolved FROM the committed server/package-lock.json)
```

**Description.** The committed `server/package-lock.json` pins the vulnerable versions above. The local `node_modules` has already drifted to fixed versions (multer 2.1.1, nodemailer 8.0.7, path-to-regexp 8.4.2, ip-address 10.2.0, brace-expansion 5.0.6, qs 6.15.1), but those upgrades were never committed. Production reinstalls strictly from the lockfile (`cd server && npm ci --omit=dev` in `deploy.yml:54`), so prod gets the vulnerable set. `npm audit --omit=dev` against the committed lockfile reports 4 high + 6 moderate. This is a supply-chain process gap — the installed tree was bumped to fixed versions locally (the exact cause is not recorded in git; `node_modules` simply holds newer versions than the lockfile) but the lockfile change was never committed — which also means the `security.yml` CI gate (`npm audit --audit-level=high`, lines 33 & 36) fails on every run, training the team to ignore it.

**Attack scenario.** Operator deploys from `main`; `npm ci` re-introduces multer 2.1.0 (DoS), nodemailer 8.0.4, path-to-regexp 8.3.0, etc. onto the production host even though a developer's laptop appears patched. The multer DoS (SA-17) is directly reachable on upload routes.

**Recommendation.** Run `cd server && npm audit fix`, bump `package.json` ranges (e.g. multer `^2.1.1`, nodemailer `^8.0.5+`), regenerate `server/package-lock.json` under Node 20/npm 10 to match prod (per the CLAUDE.md lockfile note), commit it, re-run `npm ci --omit=dev` to confirm the fixed tree resolves, and keep `security.yml` as a required status check that blocks merges to `main`.

### SA-07 — Stateless 24h JWT with no DB re-check or revocation

- **Severity:** Low *(originally Medium; partial mitigation exists for chapter-scoped editor writes)*
- **CWE:** CWE-613 (Insufficient Session Expiration) / CWE-862 (Missing Authorization)
- **Location:** `server/middleware/requireAuth.js:42-59`
- **Reachable by:** any-editor

```js
const decoded = verifyToken(token);
  if (!decoded) { ... }

  // Attach user to request
  req.user = {
    id: decoded.sub,
    username: decoded.username,
    name: decoded.name,
    avatar: decoded.avatar,
    role: decoded.role,
    books: decoded.books || [],
  };
```

**Description.** `requireAuth` derives role and book access entirely from signed JWT claims, with no DB lookup and no revocation list / token version. Tokens live 24h. Consequences: (1) demoting a user, removing book access, or setting `is_active=false` has no effect until the token expires — `is_active` is checked only at login; (2) the `ADMIN_USERS` path forces `ROLES.ADMIN` and never checks `is_active`, so an env-listed admin cannot be locked out via deactivation; (3) `POST /api/auth/logout` only clears the client cookie — a captured Bearer token remains valid until expiry. **Partial mitigation:** for plain EDITOR-role users on chapter-scoped write routes guarded by `requireBookAccess()`, `userService.hasChapterAccess` re-queries the DB live, so removing a chapter assignment takes effect immediately on those routes. It does **not** cover role demotion (read from JWT), head-editor book access (read from JWT), deactivation, or the `ADMIN_USERS` path.

**Attack scenario.** A head-editor whose access is revoked continues to read/write segment edits, apply translations, and use old privileges for up to 24h via their existing cookie or a copied Bearer token. No server action immediately cuts off the session.

**Recommendation.** On each authenticated request (or at least for state-changing/role-gated routes), re-load current role / `is_active` / book access from the DB by provider id, or add a per-user `tokenVersion` claim bumped on deactivation/role-change and checked in `requireAuth`. Shorten JWT lifetime and add refresh; enforce `is_active` on the `ADMIN_USERS` path.

### SA-08 — Cross-editor chapter-scope bypass: read endpoints skip `requireBookAccess()`

- **Severity:** Low *(originally Medium; read-only cross-editor exposure within a small trusted team)*
- **CWE:** CWE-862 (Missing Authorization) / CWE-639 (Authorization Bypass Through User-Controlled Key)
- **Location:** `server/routes/segment-editor.js:168-215, 904-976, 992-1017`; `server/routes/localization-editor.js:109-130, 421-468`
- **Reachable by:** any-editor

```js
router.get(
  '/:book/:chapter/:moduleId',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    ...
      const edits = segmentEditor.getModuleEdits(req.params.book, req.params.moduleId);
    ...
      const otherEdits = segmentEditor
        .getModuleEdits(req.params.book, req.params.moduleId, 'pending')
        .filter((e) => String(e.editor_id) !== String(currentUserId));
```

**Description.** Write endpoints in both editors enforce object-level scope via `requireBookAccess()` (calling `userService.hasChapterAccess`), but every read endpoint — GET module (returns all segment edits, including other editors' content and editor notes), `/stats`, `/terms`, `/versions`, `/versions/:version`, `/segment-history`, `/preview`, and the localization GET module + `/history` + `/:segmentId/history` — guards only with `requireRole(EDITOR)`. Once a head-editor restricts an editor to specific chapters via `chapter_assignments`, that editor can still read content, in-progress edits, edit notes, and full version history of any other chapter/book by passing arbitrary `:book/:chapter/:moduleId` params. The per-chapter confidentiality boundary is enforced for writes but not reads. (Note: even the write path is porous — assignments in book A grant full access to book B because `hasChapterAccess` returns full access when no assignment rows exist for that user+book.)

**Attack scenario.** An editor assigned only to efnafraedi-2e ch3 calls `GET /api/segment-editor/liffraedi-2e/12/m68900` (or `.../versions`, `/segment-history`) and receives the full module content, every other editor's pending edit text and `editor_note`, and the full content-version history for an unassigned chapter/book.

**Recommendation.** Apply `requireBookAccess()` (after `validateBookChapter` so `req.chapterNum` is set) to the read endpoints in both editors, mirroring the write endpoints. Alternatively document explicitly that read access is intentionally book-wide — but the asymmetry as written is almost certainly unintended.

### SA-09 — Cross-book authz gap: segment-edit approve/reject/revert act on global `editId`

- **Severity:** Low *(originally Medium; head-editor-only, cross-book within a small team)*
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
- **Location:** `server/routes/segment-editor.js:412` (and 443, 474, 505, 532; DELETE at 289)
- **Reachable by:** any-editor (effectively head-editor for the review routes)

```js
router.post('/edit/:editId/approve', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  try {
    const edit = segmentEditor.approveEdit(
      parseInt(req.params.editId, 10),
      req.user.id,
      req.user.username,
      req.body?.note
    );
```

**Description.** The segment-edit lifecycle routes — approve, reject, discuss, unapprove, complete-review — are guarded only by hierarchical `requireRole(ROLES.HEAD_EDITOR)` and operate on a globally-unique integer `editId`/`reviewId` from the URL. The service looks the row up by `WHERE id = ?` with no book filter, and the route performs no `requireHeadEditor()`/`requireBookAccess()` tying the edit's book to the caller's assigned books — even though the `/edit` (save) route does use `requireBookAccess()`. The `book` column needed for scoping is present on the row but never checked. The `DELETE /edit/:editId` route likewise uses only `requireRole(EDITOR)`; ownership is enforced in the service but not book scope.

**Attack scenario.** A head-editor assigned only to book A enumerates a small-integer `editId` belonging to book B and calls `POST /api/segment-editor/edit/<id>/approve` (or `/reject`, `/unapprove`). The global head-editor role check passes, letting them approve/reject/revert another book's pending translation edits.

**Recommendation.** In each `editId`/`reviewId`-keyed mutation, load the edit first, then for non-admins require `req.user.books.includes(edit.book)` (head-editors) or `userService.hasChapterAccess(dbUser.id, edit.book, edit.chapter)` (editors), returning 403 otherwise. Apply the same fix to `DELETE /edit/:editId`.

### SA-10 — Localization `/log` write endpoint omits `requireBookAccess()`

- **Severity:** Low
- **CWE:** CWE-862 (Missing Authorization)
- **Location:** `server/routes/localization-editor.js:474-515`
- **Reachable by:** any-editor

```js
router.post(
  '/:book/:chapter/:moduleId/log',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    ...
      localizationEditService.logLocalizationEdit({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        ...
        editorId: String(req.user.id),
```

**Description.** The `/save` and `/save-all` localization endpoints use `requireAuth → validateBookChapter → requireBookAccess() → validateModule`, enforcing chapter assignment. The `/log` endpoint also mutates state (inserts into `localization_edits` for an arbitrary book/chapter/module) but uses only `requireRole(EDITOR)`. The upstream validators do not compensate — `validateBookChapter` only checks the book allowlist and parses the chapter int; `validateModule` only checks the `m#####`/`chapter-metadata` format. An editor scoped to specific chapters can write changelog entries against chapters/books they are not assigned to, polluting another editor's localization changelog.

**Attack scenario.** An editor assigned only to ch3 POSTs to `/api/localization-editor/efnafraedi-2e/9/m68700/log`; the row is recorded under their identity against ch9, which they have no assignment to.

**Recommendation.** Insert `requireBookAccess()` into the `/log` middleware chain (after `validateBookChapter`, before `validateModule`) to match `/save` and `/save-all`.

### SA-11 — Book file-import endpoints let any editor overwrite any book/chapter source files

- **Severity:** Low
- **CWE:** CWE-862 (Missing Authorization)
- **Location:** `server/routes/books.js:492-595` (and import-mt at 604+)
- **Reachable by:** any-editor

```js
router.post(
  '/:bookId/chapters/:chapter/import',
  requireAuth,
  requireEditor(),
  upload.array('files', 50),
  async (req, res) => {
    const { bookId, chapter } = req.params;
    ...
        const targetPath = path.join(chapterDir, targetName);
        // Move file to chapter directory
        fs.renameSync(file.path, targetPath);
```

**Description.** `POST /:bookId/chapters/:chapter/import` and `/import-mt` accept up to 50 `.md` uploads and write them into the book's source / `02-mt-output` directories, guarded only by `requireEditor()`. There is no `requireBookAccess()` chapter-assignment check, so any editor can overwrite the EN source or MT-output files for any chapter of any book — including other editors' chapters — clobbering inputs the segment/localization editors render from. The filename is validated against a strict pattern (`/^(\d+-\d+|intro)(\.en)?\.md$/`), so this is **not** path traversal; the gap is purely authorization scope. (Note: simply adding `requireBookAccess()` would be a no-op as-is because these routes use `:bookId`/`:chapter` and never set `req.chapterNum`; derive `req.chapterNum` first.)

**Attack scenario.** An editor assigned only to ch3 uploads crafted `1-1.en.md` to `/api/books/liffraedi-2e/chapters/12/import`, overwriting another editor's chapter source; subsequent extraction/preview reflects the attacker's content.

**Recommendation.** Add `requireBookAccess()` to the import and import-mt routes, deriving `req.chapterNum` from `:chapter` first, consistent with how segment/localization writes are gated. Optionally restrict re-import of an already-populated chapter to head-editor/admin.

### SA-12 — Unauthenticated feedback endpoint stores unbounded, unvalidated fields

- **Severity:** Low *(originally Medium; impact bounded by 10 req/15 min limiter and 1MB body cap)*
- **CWE:** CWE-20 (Improper Input Validation) / CWE-770 (Allocation Without Limits)
- **Location:** `server/routes/feedback.js:51-85`
- **Reachable by:** unauthenticated

```js
router.post('/', optionalAuth, async (req, res) => {
  const { type, book, chapter, section, message, userEmail, userName } = req.body;

  // Validate required fields
  if (!type) {
    return res.status(400).json({ error: 'Missing type', ... });
  }

  if (!message || message.trim().length < 10) {
    return res.status(400).json({ error: 'Invalid message', ... });
  }
  ...
    const feedback = feedbackService.submitFeedback({
      type,
      book: book || null,
      chapter: chapter || null,
      section: section || null,
      message,
      userEmail: userEmail || null,
      userName: userName || req.user?.name || null,
      priority,
    });
```

**Description.** `POST /api/feedback` is public (`optionalAuth`) and mutates state. It enforces only that `type` is present and `message` is ≥10 chars. It applies no **maximum** length to `message`, and no length/format/enum validation to `book`, `chapter`, `section`, `userEmail`, or `userName`. With the global `express.json({limit:'1mb'})` cap, an anonymous caller can persist near-1MB rows and arbitrary book/chapter/email values. The sibling `POST /api/analytics/event` demonstrates the intended discipline (enum allowlist + 2048-char metadata cap) that was simply not applied here. DB writes are parameterized (no SQLi) and the admin email path escapes user fields (no HTML/header injection), so impact is data-quality/abuse, not injection.

**Attack scenario.** An unauthenticated user (rate-limited to 10 req/15 min) submits a ~1MB `message` with bogus `book`/`userEmail`. Repeated over time this inflates the shared `sessions.db` feedback table with oversized, mis-attributed rows and pollutes the admin dashboard / notification emails with attacker-controlled `userName`/`book` strings.

**Recommendation.** Coerce each field with `String()` and enforce explicit caps: message 10..5000, `userName`/`section` ~200 chars, `book`/`chapter` validated against `VALID_BOOKS`/an integer range, and a basic email-format check on `userEmail`. Reject (400) on violation rather than truncating, matching the analytics endpoint.

### SA-13 — Type confusion: body fields used in string ops before type validation (uncaught 500)

- **Severity:** Low
- **CWE:** CWE-20 (Improper Input Validation)
- **Location:** `server/routes/feedback.js:62`
- **Reachable by:** unauthenticated

```js
  if (!message || message.trim().length < 10) {
    return res.status(400).json({
      error: 'Invalid message',
      message: 'Message must be at least 10 characters',
    });
  }
```

**Description.** The truthiness/length check `message.trim()` runs at line 62, outside the handler's `try` block (which begins at line 69). A JSON body with a non-string truthy `message` (e.g. `{"type":"other","message":123}` or an array/object) causes `message.trim is not a function`, an unhandled synchronous `TypeError` that Express forwards to the global handler as a 500 rather than the intended 400. The public feedback path is unauthenticated, so any anonymous caller can trigger it. Impact is contained: the global error handler returns a generic body without leaking the stack, the throw happens before any DB write, the process does not crash, and the 10 req/15 min limiter bounds log noise.

**Attack scenario.** An unauthenticated user POSTs `message` as a number/object; the handler throws before the try/catch, returning HTTP 500 and logging an error-level stack — a low-impact robustness/observability nuisance.

**Recommendation.** Validate type before string methods: `if (typeof message !== 'string' || message.trim().length < 10) return res.status(400)...`. Apply the same `typeof === 'string'` (or `String()` coercion) guard to `book`/`chapter`/`section`/`userEmail`/`userName`, and prefer placing all validation inside the try block or a shared validator.

### SA-14 — Path traversal in live-preview route: unvalidated `moduleId` + `track`

- **Severity:** Low *(originally Medium; constrained `.cnxml`-only read, any-editor)*
- **CWE:** CWE-22 (Path Traversal)
- **Location:** `server/routes/segment-editor.js:992-1002`
- **Reachable by:** any-editor

```js
router.get(
  '/:book/:chapter/:moduleId/preview',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  async (req, res) => {
    const { book, moduleId } = req.params;
    const track = req.query.track || 'mt-preview';

    try {
      const { html } = await renderService.renderModule(book, req.chapterNum, moduleId, track);
```

**Description.** This is the only `:moduleId` route that omits the `validateModule` middleware, and `track` is never checked against `VALID_TRACKS`. Both flow into `renderService.renderModule`, which builds the path as `path.join(PROJECT_ROOT, 'books', book, '03-translated', track, chapterStr, `${moduleId}.cnxml`)` with no normalization/containment check. `book` is allowlisted and `chapterStr` is a safe `chNN`, but `track` and `moduleId` are attacker-controlled. Express 5 URL-decodes `%2F` inside a path param (so `moduleId` can become `a/../b`), and `track` arrives intact as `../../tmp`, so directory-climbing passes through. The only constraint is the trailing `.cnxml` extension — a constrained arbitrary file read.

**Attack scenario.** An EDITOR issues `GET /api/segment-editor/efnafraedi-2e/1/<%2F..%2F target>/preview?track=<../ sequence>`; the resolved path escapes `books/<book>/03-translated` and reads any `*.cnxml` on the host (e.g. another book's/track's unpublished translated source). Valid CNXML renders to HTML; even on parse failure, existence and error text leak path information.

**Recommendation.** Add the existing `validateModule` middleware to this route, and validate `track` against `VALID_TRACKS` (`['mt-preview','faithful','localized']`) before calling `renderModule`. Defense-in-depth: in `renderService.renderModule`, assert `path.resolve(cnxmlPath).startsWith(path.resolve(PROJECT_ROOT,'books',book,'03-translated') + path.sep)` and throw otherwise.

### SA-15 — Helmet CSP permits `'unsafe-inline'` for `scriptSrc` and `scriptSrcAttr`

- **Severity:** Low *(defense-in-depth; the realistic XSS sinks are escaped/sanitized, but it is the missing last line that SA-01/03/04 would otherwise hit)*
- **CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers) / contributes to CWE-79
- **Location:** `server/index.js:106-107`
- **Reachable by:** any-editor

```js
scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
```

**Description.** The CSP allows inline scripts and inline event-handler attributes via `'unsafe-inline'` in both `scriptSrc` and `scriptSrcAttr`. CSP is the last-line browser-side mitigation against XSS; with it enabled, any attribute injection that reaches a rendered page (e.g. the `on*` handlers in SA-01/SA-04) executes unimpeded. Note this is not framework-default — it is explicitly configured. The genuinely load-bearing part is `scriptSrcAttr: 'unsafe-inline'`, which governs injected `on*=` handlers (injected `<script>` via `innerHTML` never executes regardless of CSP). The served views currently rely on inline `<script>` blocks and many inline event handlers (admin.html: ~40 `on*`; books.html ~27; terminology.html ~36), so removal requires a nonce-based refactor, not a one-line config change.

**Attack scenario.** An editor saves translated/localized content (or feedback) with an inline `on*` handler; when a head-editor opens a view that renders it (live preview, admin), the handler runs in the victim's authenticated session — enabling session-scoped actions or content tampering as the higher-privileged user.

**Recommendation.** Remove `'unsafe-inline'` from `scriptSrc`/`scriptSrcAttr`. Move inline scripts/handlers into external `'self'`-allowed `.js` files or adopt a per-response nonce (helmet supports a nonce function). Keep `styleSrc 'unsafe-inline'` only if strictly required, ideally also nonce-based.

### SA-16 — Elevated rate-limit budget granted on mere presence of `auth_token` cookie

- **Severity:** Low
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key) / CWE-770
- **Location:** `server/index.js:123-129`
- **Reachable by:** unauthenticated

```js
max: (req) => {
    // Authenticated users get 5x the limit, but are still rate-limited
    if (req.cookies && req.cookies.auth_token) {
      return config.rateLimit.maxRequests * 5;
    }
    return config.rateLimit.maxRequests;
  },
```

**Description.** `generalLimiter` selects the 5× budget (default 2500 vs 500 per 15 min) based solely on the existence of an `auth_token` cookie; the value is never verified (no `verifyToken()`). An unauthenticated client that sets any non-empty `auth_token` cookie receives the elevated quota on public endpoints. The sensitive surfaces are protected by separate, cookie-independent limiters — `authLimiter` (10 fixed) on `/api/auth/login` and `/api/auth/callback`, and `publicSubmitLimiter` (10 fixed) on `/api/feedback` and `/api/analytics/event` — so the brute-force/credential surface cannot be relaxed by the trick; only the general per-IP budget on low-value public reads (`/api/health`, `/api/books/list`) is raised.

**Attack scenario.** An unauthenticated attacker sends requests with a fabricated `Cookie: auth_token=x` header, getting 5× the throttling budget against unauthenticated/public endpoints before being limited.

**Recommendation.** Gate the elevated limit on a successfully verified token: call `verifyToken(req.cookies.auth_token)` (or read a `req.user` set by an earlier optional-auth pass) inside `max()` and only elevate for a valid, unexpired token. Optionally key the limiter on user id for authenticated callers.

### SA-17 — multer 2.1.0 (lockfile-pinned) DoS via uncontrolled recursion on upload routes

- **Severity:** Low *(originally Medium; any-editor DoS on a single-process server, recoverable by restart)*
- **CWE:** CWE-674 (Uncontrolled Recursion)
- **Location:** `server/routes/terminology.js:25-37`
- **Reachable by:** any-editor

```js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
```

> **See also SA-06:** multer 2.1.0 is one of the lockfile-pinned vulnerable versions; it is broken out here because it is directly reachable on upload routes by any authenticated editor. The fixed 2.1.1 is already present in local `node_modules` — only the lockfile/`package.json` need updating.

**Description.** multer 2.1.0 (the lockfile-pinned version; `package.json` declares `^2.0.0`) is affected by GHSA-5528-5vmv-3xc2 — DoS via uncontrolled recursion when parsing malformed multipart payloads. multer is the front door for the terminology import routes, the books chapter-import routes (`upload.array('files', 50)`), and section uploads. Unlike the other lockfile advisories, this one is triggered by request body parsing, reachable by any authenticated editor (the lightest upload-capable role). `npm audit` reports `fixAvailable:true`.

**Attack scenario.** An authenticated editor POSTs a crafted `multipart/form-data` body to `/api/terminology/import/csv` (or a books chapter-import route) whose nested structure drives multer 2.1.0 into uncontrolled recursion, exhausting stack/CPU and hanging the single-process server for all editors.

**Recommendation.** Pin multer to `^2.1.1` in `server/package.json` and commit the regenerated lockfile (the host already has 2.1.1 locally). Verify via `npm ls multer` after `npm ci`. (Resolved together with SA-06.)

### SA-18 — Unbounded synchronous regex matching in `/api/terminology/check-consistency`

- **Severity:** Low
- **CWE:** CWE-400 (Uncontrolled Resource Consumption)
- **Location:** `server/services/terminologyService.js:1061-1077`
- **Reachable by:** any-editor

```js
  for (const seg of segments) {
    const matches = [];
    const issues = [];

    if (!seg.enContent) {
      result[seg.segmentId] = { matches, issues };
      continue;
    }

    ...
    for (const term of terms) {
      term.regex.lastIndex = 0;
      const enMatch = term.regex.exec(seg.enContent);
```

**Description.** `POST /api/terminology/check-consistency` (`requireAuth`, any authenticated role) calls `findTermsInSegments` with a request-supplied `segments` array. For every segment the code loops over every approved/proposed term in the DB and runs at least one regex `exec` against `seg.enContent`, plus an inner `test` against `seg.isContent` for matched terms. There is no cap on the number of segments nor on `enContent`/`isContent` length — the only bound is the global `express.json({limit:'1mb'})`. With N terms in the DB and a 1MB body of many segments, a single request forces O(N×M×L) synchronous regex work on the single-threaded event loop, blocking all other requests. The term regexes are safely escaped (`escapeRegex`), so this is amplification, not ReDoS.

**Attack scenario.** Any authenticated editor (or a compromised session) repeatedly POSTs a ~1MB body of hundreds of segments; with a populated terminology table, each request spends significant synchronous CPU, stalling the event loop and degrading the platform for other editors.

**Recommendation.** Cap the number of segments per request and per-segment content length (e.g. reject >~100 segments or >50k total chars) and return 400 when exceeded, mirroring the existing 10,000-char guard in localization save-all. Consider chunking/yielding for large inputs so a single request cannot monopolize the event loop.

### SA-19 — Open redirect after login via backslash in `redirect` query param

- **Severity:** Low
- **CWE:** CWE-601 (Open Redirect)
- **Location:** `server/routes/auth.js:68-73`
- **Reachable by:** unauthenticated

```js
    redirect:
      typeof req.query.redirect === 'string' &&
      req.query.redirect.startsWith('/') &&
      !req.query.redirect.startsWith('//')
        ? req.query.redirect
        : '/',
```

**Description.** The login redirect allowlist blocks `//host` but not `/\host`. Browsers normalize backslashes to forward slashes, so `/\evil.com` (or `/\/evil.com`) passes `startsWith('/') && !startsWith('//')`, is stored as `stateData.redirect`, and is later used verbatim in `res.redirect(302, redirectUrl)` (auth.js:152). This produces a cross-origin redirect after a successful login. The auth token stays in the `httpOnly` cookie and is not leaked in the redirect, so impact is redirect-based phishing, not credential theft.

**Attack scenario.** An attacker sends `/api/auth/login?redirect=/\evil.com`; after the victim authenticates with Microsoft, the server 302-redirects them to `https://evil.com`, aiding phishing (e.g. a fake follow-up login page).

**Recommendation.** Reject backslashes and any non-path-absolute value: require a single leading `/` not followed by `/` or `\` (e.g. `/^\/(?![\/\\])/`), or parse with `new URL(value, base)` and confirm the origin matches the server origin before use.

## Needs manual review

These were verified at the code level but their exploitability hinges on deployment configuration or future code changes. The most consequential one (OAuth/tenant) needs an **operational confirmation** before it can be closed.

| Item | File | Why uncertain / action needed |
|------|------|-------------------------------|
| **OAuth flow trusts unverified Graph email/UPN; no ID-token (`tid`/`aud`/`iss`) validation; binds accounts by mutable email; tenant defaults to `common`** | server/services/auth.js:34, 164-207; userService.js:115-127 | Code is real: only an access token + Graph `/me` is used; admin elevation and account matching key on the mutable `mail`/`userPrincipalName`, and `updateProviderInfo` rebinds `provider_id` on email match. **Downgraded to low only because prod is documented single-tenant** (`MS_TENANT_ID` is a required production secret; docs mandate single-tenant). **Action: confirm `MS_TENANT_ID` is the org tenant GUID in production (never `common`/`organizations`) and the app registration is single-tenant. If it is ever switched to multi-tenant this becomes a high-severity admin/account-takeover.** Independent hardening regardless: validate the OIDC `id_token` (`tid`/`aud`/`iss` against Microsoft JWKS), key users on the immutable `oid`/`sub` rather than email, and remove the `|| 'common'` default. |
| **Excel terminology import parses untrusted uploads with vulnerable xlsx 0.18.5** | server/services/terminologyService.js:726-729 | **Same issue as SA-05** (listed twice in source data). Second pass argued low: only head-editor/admin can reach the parse, so it is effectively self-DoS / in-process pollution by a trusted insider with no demonstrated cross-user gadget. Tracked as SA-05; not a separate finding. |
| **JWT verification does not pin the accepted algorithm** | server/services/auth.js:266-268 | `jwt.verify` omits `algorithms`. No current exploit: the key is a symmetric HMAC secret (no RS256→HS256 confusion possible) and jsonwebtoken v9 rejects `alg:none` by default. Pure defense-in-depth — add `algorithms: ['HS256']` as hardening. _(Consolidated here as the single verdict for this issue.)_ |
| **Unallowlisted column-name interpolation in `updateSectionStatus`** | server/services/bookRegistration.js:817-826 | Latent SQL-injection sink: object keys are interpolated as column identifiers with no allowlist (unlike sibling builders in `userService`/`terminologyService`). Not currently exploitable — all reachable callers pass server-side literal keys; only values reach bound `?`. Becomes a real authenticated injection the moment a caller spreads `req.body` into `updates`. Add an `allowedFields` allowlist. |
| **Unvalidated admin-supplied book slug used in directory creation path** | server/services/bookRegistration.js:254-275 | `slug` reaches `path.join(BOOKS_DIR, slug)` + `mkdirSync` with no format check; `../../tmp/evil` would create dirs outside the books tree. Admin-only; an admin already has broad filesystem control, so no trust boundary is crossed. Hardening: validate `slug` against `/^[a-z0-9-]+$/`. |
| **Server-side fetcher follows HTTP redirects to unvalidated `Location`** | server/services/openstaxFetcher.js:186-188 | `fetchRaw` recursively follows `res.headers.location` with no allowlist re-check, no hop cap, no timeout. Admin-only and the first hop is pinned to a hardcoded `raw.githubusercontent.com` URL; weaponizing requires GitHub's CDN to redirect to an internal host. Defense-in-depth SSRF amplifier. Re-validate redirect host against the github allowlist, cap hops, reject private/link-local ranges, add a timeout. |
| **Unbounded recursion / super-linear CPU in `renderList()`** | tools/cnxml-render.js:1684-1696 | Reachable via the preview route, but landing pathological nested `<list>` in `03-translated` requires the HEAD_EDITOR apply/inject path; per-segment 10k cap limits the editor→head-editor route to sub-second renders. (Correction to the source note: segment body text is **not** XML-escaped on inject, so raw `<list>` markup can survive — the limiter is the apply-path gating + 10k cap, not escaping.) Robustness hardening: add a depth counter (~32 levels) in `renderList` and optionally cap preview input size. |
| **Unauthenticated `/api/health` discloses version, internal book list, user count, DB path on error** | server/index.js:266-296 | Real but very low impact: the book slug list is already public by design via `GET /api/books/list`; version is also on `GET /api`; user count is ~5; the `err.message` DB path is a constant and only appears on a non-attacker-inducible server fault. Info-hygiene hardening: return minimal liveness to anon callers; gate detail behind `requireAuth + requireAdmin`; never return raw `err.message`. |
| **Operator-run CLI fetches image URLs parsed from a third-party API response** | tools/resolve-os-embed.js:94-109 | Real "fetch a URL from downloaded content" pattern, but operator-run locally, never server-reachable, no credentials on the fetch. Info only. If ever wired into a server-triggered job, add a CDN-host allowlist and reject private/loopback destinations. |

## Considered and dismissed

Listed for completeness — the reviewer may overrule any of these.

| Item | File | Reason dismissed |
|------|------|------------------|
| `rejectEdit`/`markForDiscussion`/`unapproveEdit` lack the self-review guard on `approveEdit` | server/services/segmentEditorService.js | Factually accurate (only `approveEdit` has the `editor_id == reviewerId` guard), but not a security vulnerability under this threat model — all four are head-editor-gated review actions; lacking a self-review guard on reject/discuss/unapprove is a workflow nicety, not an authorization break. |
| LIKE search patterns built without escaping `%`/`_` wildcards | server/services/terminologyService.js | The pattern is bound as a parameter (`LIKE ?`), not interpolated; this matches the documented better-sqlite3 safe pattern. Unescaped wildcards only affect match breadth, not safety. |
| Logout `clearCookie` uses `sameSite:'lax'` while login sets `'strict'` | server/routes/auth.js | Cosmetic. `SameSite` does not participate in cookie-deletion matching (name/path do), so logout works correctly; no confidentiality/integrity/availability impact. |
| nodemailer 8.0.4 SMTP CRLF injection advisory present | server/services/notifications.js | Not reachable: the single `createTransport` caller never sets the vulnerable `name` option and sources all config from env vars, so no attacker-controlled input reaches the CRLF sink. (Still upgrade via SA-06 as dependency hygiene.) |

## Remediation roadmap

### Priority 0 — Fix now (one true high + the systemic supply-chain gap)

1. **SA-01 (High) — Close the attributed-CNXML-tag XSS at both ends.** In `cnxml-inject.js`, after reconstructing CNXML, parse the fragment and strip any element attribute not in a per-element allowlist (drop all `on*`). In `cnxml-elements.js` `processInlineContent`, match each supported element explicitly and re-emit only known-safe attributes via `escapeAttr` — never echo source tags verbatim. Add an output-side sanitizer (DOMPurify/sanitize-html) in `renderModule`. This is the single most important fix.
2. **SA-06 + SA-17 (Medium/Low) — Regenerate and commit `server/package-lock.json`.** `cd server && npm audit fix`, bump `package.json` ranges (multer `^2.1.1`, nodemailer `^8.0.5+`, etc.), regenerate under Node 20/npm 10, commit, and re-run `npm ci --omit=dev` to confirm prod resolves the fixed tree. Keep `security.yml`'s `npm audit --audit-level=high` a required, merge-blocking check. One commit closes multiple advisories.
3. **OAuth tenant confirmation (operational).** Verify `MS_TENANT_ID` in production is the org tenant GUID (never `common`) and the Azure app registration is single-tenant. This is the precondition that keeps the OAuth finding at low rather than high.

### Priority 1 — Quick code fixes (small diffs, clear wins)

4. **SA-02 — Book download:** validate `chapter` with `parseInt` + range, build the dir name from the integer only, add `requireBookAccess()` (or `requireEditor()`), and add a `path.resolve` containment assert.
5. **SA-03 — `<link url>` XSS:** add a URL-scheme allowlist (`http`/`https`/`mailto`/relative) in both the render handler and the bracket-link inject path; centralize a `sanitizeUrl()` helper.
6. **SA-04 — Terminology subjects:** validate `subjects` server-side against the `SUBJECTS` enum and change `formatSubject` to `escapeHtml(...)`.
7. **SA-14 — Preview route:** add the existing `validateModule` middleware and allowlist `track` against `VALID_TRACKS`; add a `path.resolve().startsWith()` assert in `renderService`.
8. **SA-12 / SA-13 — Feedback endpoint:** add per-field type coercion, length caps, and format/enum validation (mirror the analytics endpoint), returning 400; move validation inside/before the try so malformed types yield 400 not 500.
9. **SA-16 — Rate limiter:** elevate the budget only on a verified token, not mere cookie presence.
10. **SA-19 — Open redirect:** reject backslashes / validate the redirect against the server origin.

### Priority 2 — Authorization consistency (close the read/write asymmetry)

11. **SA-08 — Add `requireBookAccess()` to the segment-editor and localization read endpoints** (after `validateBookChapter`), mirroring the writes — or document the book-wide read intent explicitly.
12. **SA-09 — Add book-scope checks to the `editId`/`reviewId`-keyed review mutations and `DELETE /edit/:editId`** by loading the row and enforcing `req.user.books.includes(edit.book)` / `hasChapterAccess`.
13. **SA-10 — Add `requireBookAccess()` to localization `/log`.**
14. **SA-11 — Add `requireBookAccess()` to the books import / import-mt routes** (deriving `req.chapterNum` first).
15. **Tighten `hasChapterAccess` "no assignments = full access" default** so cross-book access is not silently granted on the write path either.

### Priority 3 — Larger hardening

16. **SA-07 — Session revocation:** add a per-user `tokenVersion` claim bumped on deactivation/role-change and checked in `requireAuth`, re-load role/`is_active` for state-changing routes, shorten JWT lifetime + add refresh, and enforce `is_active` on the `ADMIN_USERS` path.
17. **SA-15 — CSP:** remove `'unsafe-inline'` from `scriptSrc`/`scriptSrcAttr` via a nonce-based CSP and refactor inline scripts/handlers out of the served views (admin/books/terminology). This is a UI refactor, not a config one-liner, but it restores the last-line XSS defense.
18. **SA-05 — Replace `xlsx@0.18.5`** with a maintained parser (`exceljs`) or the patched SheetJS CDN build; parse in a worker thread with a timeout and reject `__proto__`/`constructor` keys.
19. **SA-18 — Cap segments/content length in `/api/terminology/check-consistency`** and consider yielding for large inputs.
20. **Needs-review hardening:** add the `allowedFields` allowlist in `updateSectionStatus`; validate the book `slug` with `/^[a-z0-9-]+$/`; re-validate redirect hosts + cap hops + add a timeout in `openstaxFetcher`; add a depth counter in `renderList`; trim `/api/health` for anonymous callers and add `algorithms: ['HS256']` to `jwt.verify`.

---

## Coverage & completeness (automated critic)

The audit examined 17 of 19 route files (89%) and 24 of 27 services (89%), with good breadth across authentication, input validation, SSRF, SQL injection, and path traversal vectors. However, there are notable gaps in coverage of security-relevant areas that were not addressed by the 11 lenses:

1. Email Security: The notifications.js service uses nodemailer but was not reviewed for email header injection (RFC 5322 compliance), email address validation, or SMTP credential handling. The `/api/feedback` endpoint accepts user_email fields without validation.

2. State/Nonce Management: The auth.js route uses setInterval-based state token cleanup (~15 min lifetime) but timing and uniqueness guarantees were not assessed. State tokens are stored in memory (not DB), which creates TTL-dependent race conditions.

3. Timing Attacks: No constant-time comparison for JWT verification, state token matching, or secret comparisons. jwt.verify() is standard Node.js, but no analysis of algorithm pinning or key rotation.

4. Race Conditions in Lock Mechanisms: The localization-editor.js implements per-module write locks via `acquireModuleLock()`, but the lock implementation (in lib/chapterLock.js) and its TTL/deadlock behavior were not examined.

5. Prototype Pollution / Object Traversal: No check for prototype pollution in JSON parsing, Object.assign usage, or spread operator abuse in service layers.

6. Open Redirect: The auth.js redirect parameter is validated to start with '/' and not '//', but post-redirect behavior (e.g., query string pollution with 'loggedIn=1' appended) was not analyzed for secondary redirect vectors.

7. Logging of Sensitive Data: No audit of log statements that might leak JWT values, passwords, or session tokens in error handlers or middleware logs.

8. Database Connection Pooling / Resource Exhaustion: better-sqlite3 uses synchronous, in-process DB. No review of connection limits, query timeouts, or memory pressure under concurrent load.

9. Untouched Files: activity.js and status.js routes were not examined (both handle detailed editorial data with permission boundaries that need verification). bookDataGenerator.js, bookDataLoader.js, and pipelineStatusService.js services were not examined (DB access patterns and caching logic).

Coverage is moderate-to-good for the 11 lenses but leaves security-relevant areas uncovered that can be exploited in context of a multi-user editorial workflow.

**Files not opened by any finder (5):**

- `server/routes/activity.js`
- `server/routes/status.js`
- `server/services/bookDataGenerator.js`
- `server/services/bookDataLoader.js`
- `server/services/pipelineStatusService.js`

**Areas not covered by the 11 lenses (suggested follow-up):**

- **Email Header Injection / Email Security** — The notifications.js service constructs emails with user-supplied subject and body content. No validation of RFC 5322 compliance or injection of SMTP headers (e.g., Bcc, Cc) via newline injection in 'to', 'subject' fields. Email addresses in feedback (user_email) are not validated before use.
  - _Check:_ Grep for nodemailer sendMail calls in notifications.js; verify user_email / userEmail is validated (RFC 5322 format, no newlines); test if Bcc injection via 'to' parameter is possible
- **Timing Attacks / Constant-Time Comparisons** — JWT verification, state token comparison, and any password/secret comparison should use constant-time functions to prevent timing-based side-channel attacks. Node.js jwt.verify() and standard == comparisons are vulnerable.
  - _Check:_ Check jwt.verify() options for algorithm pinning (explicit 'algorithms: ["HS256"]'); inspect state token matching in auth.js for timing leaks; audit any HMAC-based token validation for timingAttack exposure
- **State Token Lifecycle & Race Conditions** — auth.js stores state tokens in memory with a 15-min cleanup interval. No DB persistence or distributed lock means concurrent OAuth callbacks to multiple servers could cause race conditions; token reuse across multiple login flows is possible.
  - _Check:_ Inspect stateTokens object and setInterval cleanup in auth.js; check if state token is deleted immediately after verification or if it can be reused; test concurrent /auth/callback requests
- **Lock Mechanism Deadlock & TTL Behavior** — localization-editor.js uses `acquireModuleLock()` for per-module write locks. If lock is implemented in-memory without timeout, a crashed/hung request could deadlock all subsequent edits to that module.
  - _Check:_ Read lib/chapterLock.js; verify lock has a maximum TTL, timeout mechanism, and is cleaned up on request completion; test what happens if lock holder crashes
- **Database Query Timeout & Resource Limits** — better-sqlite3 is synchronous and in-process. No query timeout or max memory constraints visible; a slow query or large result set could block the entire Node.js event loop.
  - _Check:_ Inspect server/index.js and DB initialization for connection/query timeouts; check if large SELECT queries (e.g., activity logs) have LIMIT; audit pagination defaults in all routes that query activity/audit tables
- **Logging of Sensitive Data (Secrets in Logs)** — Error handlers in routes and services may log the full error object, which could include JWT tokens, session IDs, or intermediate data structures containing secrets.
  - _Check:_ Audit log statements in error handlers (log.error calls); check if req.headers, req.user, or parsed JWT claims are logged; inspect if error.message exposes sensitive fields
- **Open Redirect / Secondary Redirect Vectors** — auth.js validates redirect parameter (must start with '/' and not '//'), but the post-login redirect logic appends 'loggedIn=1'. If a downstream route echoes query parameters without escaping, a second redirect is possible.
  - _Check:_ Trace redirect parameter validation in auth.js; check if downstream client code (views.js, public JS) re-parses query strings; test if '/?loggedIn=1&redirect=//attacker.com' bypasses the check
- **Activity.js & Status.js Routes Authorization Boundaries** — These routes handle detailed pipeline and activity data. Not reviewed for IDOR (can user A query activity for user B?), data leakage (do responses expose internal stage/chapter details to unauthorized roles?), or pagination bypass.
  - _Check:_ Verify /api/activity/:userId/:book/:chapter requires the correct role; check if activity.js leaks user names/IDs in responses; audit /api/status/:book/:chapter/sections for role boundary enforcement
- **Book Data Generator / Catalogue Entry TOCTOU** — bookDataGenerator.js reads existing JSON files and OpenStax structure in sequence, with DB lookups in between. File could be deleted or modified between check and write, causing data corruption or inconsistent state.
  - _Check:_ Inspect generateBookData(); check if there is atomic write (temp file + rename) vs direct write; test if concurrent generateBookData calls to same book cause race conditions


---

## Audit provenance

- **Method:** multi-agent `security-audit` workflow (`.claude/workflows/security-audit.js`) — reusable via `/security-audit` or `Workflow({name:"security-audit"})`.
- **Scale:** 154 routes mapped, 19 dangerous sinks inventoried, 11 lenses, 102 files examined.
- **Findings funnel:** 33 raw → **19 confirmed**, 9 needs-review, 5 dismissed/refuted. Each finding was adversarially verified by two skeptic lenses (code-existence + reachability, and existing-mitigation + severity-calibration); the cited code was confirmed to exist before a finding was kept.
- **Threat model:** ~5 Entra-authenticated editors; small educational project; severities are threat-model-calibrated (often below raw CVSS).
- **Caveat:** AI-generated audit. Confirmed findings were code-grounded and double-verified, but treat as a prioritized lead list for human confirmation, not a guarantee. 5 files were flagged as un-examined (see coverage section) and warrant a follow-up pass.

