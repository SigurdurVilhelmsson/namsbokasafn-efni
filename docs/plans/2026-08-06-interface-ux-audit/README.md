> **FROZEN EVIDENCE — captured 2026-08-06.** This is a record of what the interface did
> on that date, not a statement of open work. Per CLAUDE.md § *One source of truth*, if
> this disagrees with the active register, **the register wins**. Cite it as evidence;
> never as status.
>
> Reproduce with `scripts/seed-ux-audit.js` (throwaway DB) + `scripts/walk.js`.
> Screenshots are WebP at 1100px; the raw walk data is `walk-results.json`.

# Phase 0–1 — Site map + role walkthrough (evidence)

Captured 2026-08-06 against a throwaway DB seeded with all six real books
(181 chapters / 1,359 sections). Read-only against the repo; no repo files changed.

**Method note.** Auth via injected JWT cookie (`server/e2e/helpers/auth.js` pattern),
six actors: anon, viewer, editor, new-editor (zero history), head-editor, admin.
78 page records + 63 redirect records + 78 full-page screenshots in `shots/<role>/`.
Raw data: `walk-results.json`.

## Harness caveats — read before trusting a finding

1. **`ERR_CERT_AUTHORITY_INVALID` on every page is MY artifact, not a defect.** Chromium
   had to be launched `--no-proxy-server` (this container proxies even localhost, turning
   a 5 ms request into a ~14 s stall). That bypass breaks the external Google Fonts fetch.
   *Underlying fact that is real:* the UI loads webfonts from `fonts.googleapis.com` at
   runtime — relevant for schools on poor connections, and a privacy question.
2. **No assignments, edits or activity exist in the seed.** So `editor` and `new-editor`
   are legitimately identical here. Any finding about *populated* screens is content-starved
   and is marked as such below. Findings verified in source are not.
3. `xlsx` could not be installed (network policy blocks `cdn.sheetjs.com`), so the Excel
   import/export path in `terminologyService` was not exercised. Lazy-required, so nothing
   else is affected.

## The map — pages, gates, and how you get there

Page gates from `server/routes/views.js`; nav visibility from `server/public/js/layout.js`.

| Page | Page gate | In sidebar for | Purpose |
|---|---|---|---|
| `/` Heim | any authed | all | Landing / "what do I do today" |
| `/editor` Ritill | any authed | all | Segment editor — the main work tool |
| `/editor?view=reviews` Yfirlestrar | any authed | editor+ | Review queue (same page, query param) |
| `/progress` Framvinda | any authed | all | Pipeline progress |
| `/terminology` Orðasafn | any authed | all | Glossary |
| `/localization` Aðlögun | **any authed** | **admin/head-editor only** | Pass 2 localization editor |
| `/library` Bókasafn | **any authed** | **admin/head-editor only** | Book/chapter browser |
| `/assignments` Úthlutanir | head-editor+ | admin/head-editor | Assign chapters to editors |
| `/admin` Stjórnandi | **admin only** | **admin + head-editor** | Admin console |
| `/profile` Um mig | any authed | all authed | Profile |
| `/feedback` Ábendingar | public | all | Feedback form |
| `/login` | public | — | Microsoft SSO |

21 legacy paths 301-redirect to the above; all 21 verified resolving correctly for
anon/editor/admin. `/reviews` → `/editor`. No broken redirects found.

## Confirmed nav ↔ gate mismatches

| # | What | Evidence |
|---|---|---|
| M1 | **head-editor sees "Stjórnandi" → `/admin`, which bounces them to `/`.** A dead link in the primary nav for the role that runs the project daily. | walk: head-editor `/admin` → `/`; `layout.js` shows admin section to `['admin','head-editor']`, gate is `requirePageAuth(ROLES.ADMIN)` |
| M2 | **`/library` and `/localization` are reachable by editor + viewer but have no nav link for them.** Orphaned pages for the teacher role. | walk: both `ok` for editor; absent from editor's `navLinks` |
| M3 | **viewer's sidebar offers "Ritill", which then 403s.** `/api/segment-editor/.../chapters` → "Insufficient permissions" rendered as a raw error. | walk: viewer `/editor` NET 403 + console error |
| M4 | **head-editor's own `/assignments` page 403s on load.** The book selector defaults to the alphabetically-first book (`edlisfraedi-2e`), ignoring the user's book scope (`efnafraedi-2e`). | walk: head-editor `/assignments` NET 403 `/api/admin/assignments/edlisfraedi-2e` |

M4's root cause — *default book selection ignores the user's scope* — also explains why
every page opens on Eðlisfræði 2e regardless of who logs in.

## The finding that matters most for onboarding

**A new teacher's first screen congratulates them for work they have never done, and
offers no way to start.**

`/` for an `editor` renders: 🎉 "Ekkert verkefni í dag!" / "Þú hefur lokið öllum
verkefnum. Slakaðu á eða biddu eftir nýjum úthlutunum." ("You've completed all tasks.
Relax, or wait for new assignments.") Subtitle: "Engin verkefni í dag – vel gert!"

This is **structural, not a seed artifact**. In `views/my-work.html:1195-1215`,
`buildEmptyTaskMessage()` has three branches; the only two that attach an
`actionLabel`/`actionHref` are both gated on `isReviewer` (`admin` or `head-editor`).
Every `editor` falls through to the terminal branch, which has **no action at all**.

Compounding it, the one nav item that looks like work — **Ritill** — opens to an empty
page with two dropdowns ("Velja einingu til að ritstýra", defaulting to the wrong book)
and no content until the teacher independently knows which book, chapter and *eining*
to open.

## The structural gap: no self-serve path to work

Side by side, from the same seeded state:

- **head-editor `/`** — a full dashboard: "Þarfnast skoðunar — **24 ÚTHLUTAÐ**", listing
  "Kafli N í vinnslu án úthlutunar" (chapter in progress, unassigned) with a *Skoða* button
  each; plus "Vinnuálag yfirlesara", "Tilbúið til úthlutunar", "Nýleg virkni teymis".
  885 visible chars.
- **editor `/`** — "you have nothing to do, relax." 247 visible chars.

The system simultaneously knows *24 chapters need an owner* and tells the teacher
*there is nothing for you*. Nothing bridges the two: work reaches a teacher only when a
head-editor pushes it via Úthlutanir. **Onboarding N teachers therefore costs the head
editor N manual assignments before any of them can do anything** — which is the direct
obstacle to "onboard as many teachers as possible".

Also note the celebratory card appears on the head-editor's own home *above* the 24
items needing attention — its branch keys on `globalPendingCount`/`readyToApplyCount`,
not on the dashboard's own queue, so it contradicts the panel directly beneath it.

## Content volume per role (visible chars in main)

| route | viewer | editor | new-editor | head-editor | admin |
|---|---|---|---|---|---|
| `/` | 247 | 247 | 247 | 885 | 879 |
| `/editor` | 148 | 204 | 204 | 204 | 204 |
| `/progress` | 240 | 240 | 240 | 240 | 240 |
| `/terminology` | 671 | 1060 | 1060 | 1186 | 1186 |
| `/localization` | 329 | 385 | 385 | 385 | 385 |
| `/library` | 56 | 313 | 313 | 327 | 327 |
| `/assignments` | (redir) | (redir) | (redir) | 162 | 309 |

`/editor` at ~204 chars for every role is the empty selector shell — the main work tool
is inert until three unguided choices are made.

## Vocabulary flags already visible (full audit is Phase 3)

- **"eining" (module)** — pipeline vocabulary on the editor's primary call to action.
- **Aðlögun vs Staðfærsla** — the sidebar calls the localization editor *Aðlögun*; the
  page titles itself *Staðfærsla*. Two words, one feature.
- **"Yfirlesari"** (proofreader) is the role name for the people the project wants to be
  *subject experts*; the login page describes it as "Þýðingar og yfirlestur".
- Login page spends its space on the internal 4-role taxonomy, which a first-time user
  can neither choose nor act on.

## Incidental (non-UX) observation

`bookRegistration.createBookDirectories()` writes a README into `books/<slug>/01-source/`
— the read-only, licence-load-bearing directory. Five of six books currently lack that
file, so registering them through the admin route would create files there. Avoided
during this audit by replicating only the DB half of `registerBook`.

Two books (`lifraen-efnafraedi`, `edlisfraedi-2e`) arrive **pre-registered with zero
chapters and a null catalogue id** on a fresh DB, seeded by migration.
