# Migrate Authentication: GitHub OAuth to Microsoft Entra ID

**Status:** Planning
**Estimated effort:** ~1 day coding, ~1 week calendar (waiting for admin credentials)
**Risk:** Low — JWT/cookie/role/middleware system is provider-agnostic

---

## Why

The Icelandic school system uses Microsoft Office 365. Editors currently need a GitHub account to log in — an unnecessary barrier. Switching to Microsoft Entra ID (formerly Azure AD) lets editors log in with their existing school accounts.

---

## Strategy: Code First, Credentials Later

All code changes can be written and tested **before** contacting the school IT admin. The switchover is a single deploy with new environment variables.

```
Phase A: Code (Claude)  ──  no admin needed, GitHub login stays active
Phase B: Credentials (You + IT admin)  ──  register the app in Azure
Phase C: Switchover (You + Claude)  ──  deploy + verify, ~15 min downtime
```

---

## Phase A: Code Changes (Claude)

All work happens on a feature branch. GitHub login continues working on `main`.

### A1. Database migration (022-provider-auth.js)
- [ ] Rename `users.github_id` → `users.provider_id`
- [ ] Rename `users.github_username` → `users.provider_username`
- [ ] SQLite column rename requires table recreation (CREATE new → INSERT → DROP old → RENAME)
- [ ] Add `users.email` column (for Microsoft matching)
- [ ] Preserve all existing user data and roles

**File:** `server/migrations/022-provider-auth.js` (NEW)

### A2. Rewrite auth service
- [ ] Replace GitHub OAuth endpoints with Microsoft Entra ID OIDC
- [ ] Microsoft endpoints:
  - Authorize: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
  - Token: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
  - User info: `https://graph.microsoft.com/v1.0/me`
- [ ] Replace `getAuthUrl()` — build MS authorize URL
- [ ] Replace `exchangeCodeForToken()` — POST to MS token endpoint (form-urlencoded, not JSON)
- [ ] Replace `getGitHubUser()` → `getMicrosoftUser()` — GET Microsoft Graph `/me`
- [ ] Simplify `determineUserRole()` — remove org/team API calls, keep DB lookup + ADMIN_USERS
- [ ] Remove `checkOrgMembership()`, `getUserTeams()`, `isOrgOwner()`, `githubApiRequest()`
- [ ] Keep `createToken()` and `verifyToken()` unchanged (provider-agnostic)
- [ ] No npm packages needed — raw HTTPS requests, same pattern as current GitHub code

**File:** `server/services/auth.js` (REWRITE)

### A3. Update user service
- [ ] Rename `findByGithubId()` → `findByProviderId()`
- [ ] Rename `upsertFromGitHub()` → `upsertFromProvider()`
- [ ] Update all SQL: `github_id` → `provider_id`, `github_username` → `provider_username`
- [ ] Accept generic user object: `{ id, username, name, email }`
- [ ] Add `findByEmail()` for matching pre-registered users on first Microsoft login

**File:** `server/services/userService.js` (MODIFY)

### A4. Update routes and config
- [ ] `routes/auth.js` — update error messages ("GitHub" → "Microsoft"), update `/roles` note
- [ ] `routes/admin.js` — user-add accepts email instead of GitHub username; remove `fetchGitHubUser()`
- [ ] `config.js` — update `REQUIRED_PRODUCTION_SECRETS` to `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`
- [ ] `index.js` CSP — remove `avatars.githubusercontent.com` from `img-src`

**Files:** `server/routes/auth.js`, `server/routes/admin.js`, `server/config.js`, `server/index.js`

### A5. Update views
- [ ] `login.html` — Microsoft logo SVG, "Skrá inn með Microsoft" button text
- [ ] `admin.html` — user-add form: "Netfang" (email) field replaces "GitHub notendanafn"

**Files:** `server/views/login.html`, `server/views/admin.html`

### A6. Update env template
- [ ] Replace GitHub env vars with Microsoft ones in `.env.example`

**File:** `server/.env.example` (MODIFY)

### A7. Run tests
- [ ] All Vitest tests pass (`npm test`)
- [ ] All E2E tests pass (`cd server && npm run test:e2e`) — these use direct JWT injection, not OAuth, so they work without Microsoft credentials
- [ ] Manual code review of the auth flow

**PHASE A RESULT:** Feature branch ready. GitHub login still works on `main`. Tests pass.

---

## Phase B: Azure App Registration (You + School IT Admin)

> **BLOCKING:** Phase C cannot proceed until this is complete.

### B1. Contact your school IT admin
- [ ] Request: "Register a web application in Microsoft Entra ID (Azure AD) for our translation platform"
- [ ] Provide them with this information:
  - **App name:** Námsbókasafn (or whatever you prefer)
  - **Redirect URI:** `https://ritstjorn.namsbokasafn.is/api/auth/callback`
  - **Redirect URI type:** Web
  - **Required API permissions:** `openid`, `profile`, `email`, `User.Read` (Microsoft Graph, delegated)
  - **Supported account types:** "Accounts in this organizational directory only" (single tenant)

### B2. Receive credentials from IT admin
- [ ] **Application (client) ID** — a GUID like `12345678-abcd-...`
- [ ] **Directory (tenant) ID** — a GUID identifying the school's Azure AD tenant
- [ ] **Client secret** — a generated secret string (note the expiry date!)

### B3. Record the client secret expiry
- [ ] Client secrets expire (typically 6 months, 1 year, or 2 years)
- [ ] Note the expiry date: ____________
- [ ] Set a calendar reminder 2 weeks before expiry to generate a new one

### What to tell the IT admin (copy-paste)

> Sæl/l,
>
> Ég er að vinna að þýðingarverkefni fyrir Námsbókasafn (namsbokasafn.is).
> Ritstjórar þurfa að skrá sig inn til að vinna að þýðingum.
>
> Getur þú búið til „App registration" í Azure AD/Entra ID fyrir okkur?
>
> - **Nafn:** Námsbókasafn
> - **Redirect URI:** `https://ritstjorn.namsbokasafn.is/api/auth/callback` (tegund: Web)
> - **API permissions:** openid, profile, email, User.Read (Microsoft Graph, delegated)
> - **Account types:** Accounts in this organizational directory only
>
> Ég þarf frá þér:
> 1. Application (client) ID
> 2. Directory (tenant) ID
> 3. Client secret (og hvenær það rennur út)
>
> Takk!

**PHASE B RESULT:** You have 3 values: client ID, tenant ID, client secret.

---

## Phase C: Switchover (You + Claude, ~15 min)

### Preparation (do this in advance, any time after Phase A)

- [ ] Decide on the `ADMIN_USERS` value — your Microsoft email (e.g., `siggi@school.is`)
- [ ] Back up the production database: `cp pipeline-output/sessions.db pipeline-output/sessions.db.pre-ms-auth`
- [ ] Inform editors: "Short maintenance window — you'll need to log in again afterwards"

### C1. Merge and deploy

> **Service interruption starts here (~15 minutes)**

- [ ] Merge the feature branch into `main`
- [ ] Pull on production server: `git pull origin main`

### C2. Update production .env

- [ ] Edit `server/.env` on the production server:
```bash
# Remove these:
# GITHUB_CLIENT_ID=...
# GITHUB_CLIENT_SECRET=...
# GITHUB_CALLBACK_URL=...
# GITHUB_ORG=...

# Add these:
MS_CLIENT_ID=<from Phase B>
MS_CLIENT_SECRET=<from Phase B>
MS_TENANT_ID=<from Phase B>

# Update this — use your Microsoft email:
ADMIN_USERS=siggi@school.is
```

### C3. Restart server

- [ ] Restart: `sudo systemctl restart namsbokasafn` (or however you restart)
- [ ] Watch logs for migration output: "Migration 022: renamed github columns to provider columns"
- [ ] Verify no migration errors

### C4. Verify login flow

- [ ] Open `https://ritstjorn.namsbokasafn.is/login` in browser
- [ ] Confirm Microsoft login button appears (not GitHub)
- [ ] Click "Skrá inn með Microsoft"
- [ ] Authenticate with your school Microsoft account
- [ ] Confirm redirect back to the site, logged in with your name displayed
- [ ] Check `/api/auth/me` — verify correct user data and admin role
- [ ] Test admin panel: can you see user management?
- [ ] Test segment editor: can you load and save a segment?

### C5. Re-register editors

- [ ] Open admin panel → Users
- [ ] Add each editor by their Microsoft email address
- [ ] Assign appropriate roles (same roles as before)
- [ ] Ask editors to log in and confirm access

> **Service interruption ends here**

**PHASE C RESULT:** Microsoft login live. All editors can log in with school accounts.

---

## Post-Switchover

- [ ] Remove the GitHub OAuth app from GitHub settings (optional, but tidy)
- [ ] Monitor logs for any auth errors in the first few days
- [ ] Set calendar reminder for client secret renewal (from B3)

---

## What Does NOT Change

These are all provider-agnostic and need zero modifications:

| Component | Why it's safe |
|-----------|--------------|
| `middleware/requireAuth.js` | Validates JWT, doesn't know about OAuth provider |
| `middleware/requireRole.js` | Checks role string, provider-irrelevant |
| `constants.js` (ROLES) | Role definitions are provider-independent |
| All E2E tests | Inject JWTs directly, never touch OAuth |
| `public/js/layout.js` | Reads `/api/auth/me`, displays name; already handles null avatars |
| Cookie/session system | JWT in httpOnly cookie — same mechanism regardless of provider |
| Role model | admin/head-editor/editor/contributor/viewer — stays DB-driven |
| All pipeline tools | No auth dependency |
| All editor functionality | Depends on JWT claims, not OAuth provider |

---

## Design Decisions

1. **No MSAL library** — Raw HTTPS requests, same pattern as current GitHub code. MSAL adds 15+ transitive dependencies for 3 HTTP calls.

2. **Generic column names** (`provider_id`, `provider_username`) — future-proofs against another provider switch.

3. **Email as identifier** — Microsoft `userPrincipalName` (e.g., `siggi@school.is`) replaces GitHub `login`. Used for display and admin user-add.

4. **No avatar** — Microsoft Graph requires a separate API call for photos, returns binary data (not a URL). Not worth the complexity for 5 editors. The layout already handles null avatars gracefully.

5. **Roles stay DB-driven** — No Microsoft group/role mapping. Admin assigns roles in the admin panel, same as today. This is simpler and doesn't require AD admin involvement for role changes.

6. **No dual-provider support** — Clean switch, not a bridge. The old GitHub columns are renamed (data preserved), not duplicated. If you ever need to switch back, the migration is reversible from git history.

---

## Summary: Who Does What

| Step | Who | Blocked by | Time |
|------|-----|-----------|------|
| **A1-A7** Write all code | Claude | Nothing | ~3-4 hours |
| **B1** Contact IT admin | You | Nothing (can start any time) | 5 min to send email |
| **B2** Receive credentials | IT admin | B1 | Hours to days |
| **B3** Note secret expiry | You | B2 | 1 min |
| **C1** Merge + deploy | You + Claude | A7 + B2 | 5 min |
| **C2** Update .env | You | C1 + B2 | 2 min |
| **C3** Restart server | You | C2 | 1 min |
| **C4** Verify login | You | C3 | 5 min |
| **C5** Re-register editors | You | C4 | 5 min |

**Critical path:** B1 → B2 (waiting for IT admin) is the only blocking dependency. Start Phase B as early as you like — even before Phase A is done.

---

## Files Changed (Complete List)

| File | Action | Phase |
|------|--------|-------|
| `server/migrations/022-provider-auth.js` | NEW | A1 |
| `server/services/auth.js` | REWRITE | A2 |
| `server/services/userService.js` | MODIFY | A3 |
| `server/routes/auth.js` | MODIFY | A4 |
| `server/routes/admin.js` | MODIFY | A4 |
| `server/config.js` | MODIFY | A4 |
| `server/index.js` | MODIFY (CSP only) | A4 |
| `server/views/login.html` | MODIFY | A5 |
| `server/views/admin.html` | MODIFY | A5 |
| `server/.env.example` | MODIFY | A6 |
| `server/.env` | MODIFY (manual, production) | C2 |
