# Interface walkthrough and audit: Ritstjóri (`server/`)

> ❄️ **FROZEN 2026-11-13.** Evidence, not status. This is a read-only audit of the editorial
> interface, taken at `main` `e387f308`. Nothing was fixed. Per CLAUDE.md § *One source of
> truth*, open work is owned by the active register in `docs/plans/`; **if this document
> disagrees with the register, the register wins.** Cite it; do not sync it.
>
> **Scope:** the web interface served from `server/` (12 views, the client scripts, the API
> behind them) and the editor-facing documents. **Not in scope:** production, pipeline
> operations, machine translation, content sync. No pipeline, publish, apply or sync control
> was clicked; section A7 lists each one and what it would do.
>
> **Three findings are withheld.** This repository is public. Three security-sensitive
> findings (SEC-1 to SEC-3) were given to the project lead privately and are not described
> here.

## How to read the evidence

Every finding carries one of three evidence levels:

- **verified live**: reproduced in a browser against a local server (see "Method").
- **code only (read)**: the auditor read the cited code; not reproduced live.
- **code only (reader, not re-checked)**: one automated code reader raised it, and neither a
  second reader nor a live test confirmed it. Treat these as hypotheses. Where two readers
  working separately raised the same point it says "two readers".

### Method and limits

- **Inventory from code.** Endpoints, client call sites and static controls were extracted by
  script and joined mechanically. Sixteen of 36 planned code readers finished and one finished in part (all six
  control inventories, five of six states-and-strings inventories, three of four combined
  small-page readers, both work-protection readers); the run was cut short by a usage limit. The server-endpoint, API-contract and
  docs-drift readers did not finish, and no verifier pass ran. Those gaps were covered by the
  live walkthrough and by direct reading where this report says so.
- **Live walkthrough.** A separate git worktree; the E2E configuration
  (`server/e2e/playwright.config.js`: fresh throwaway database, `seed-fixture.js`, the test
  `JWT_SECRET`, port 3456); sessions signed in with `server/e2e/helpers/auth.js`. Every
  action went through a counting wrapper, so step and click counts are measured. A network
  guard blocked every pipeline, publish, apply, sync, import and source-fetch endpoint; it
  never fired.
- **Two additions to the E2E seed**, both in the throwaway database only.
  - Agreed with the project lead beforehand: `users` rows for the helper's default admin,
    head-editor and editor tokens (a real member always has a row; the helper's tokens do
    not).
  - Added by the auditor without asking: four `user_book_access` rows (two for the head
    editor, matching the books in its token, and one each for the two editors on the fixture
    book), so the assignment dropdown could list the editors. The admin screen that grants
    book access lists no books when the catalogue has never been synced, and that sync was
    not clicked.
- **What could not be walked live:**
  - *Localization editing.* No book in the repository has a faithful-translation file, so no
    module can be opened in the localization editor. Findings about saving there are code
    only.
  - *Bókasafn.* The library lists books from the catalogue table, which is empty in a
    database where the catalogue was never synced. Findings there are code only.
  - *Sign-in.* Microsoft sign-in cannot run locally; sessions were injected as cookies.
- **Changes under `books/`.** `git status` was clean in both trees before and after. The
  server wrote two edit-lock markers under the fixture book
  (`books/__e2e-fixture__/02-mt-output/ch01/m68663-segments.locked` and
  `m68664-segments.locked`) when the first edit of each module was saved. They are
  git-ignored, so `git restore` does not apply; they were deleted from the worktree. No real
  book was written to.
- **Screenshots** are in the git-ignored folder
  `server/test-results/interface-audit-2026-11-13/` (175 images, most with the visible page
  text beside them). Links below point there and resolve only where that folder exists.

---

## 1. Summary

### The findings that matter most

1. **Typed text is lost without a warning in four ordinary situations in the segment editor**
   (ED-01 to ED-05, verified live): pressing "← Til baka"; another editor saving the same
   row first, when the user then answers OK to the dialogs; pressing Escape; and saving from
   a second, stale tab. In two of the four the green line then reads "Allar breytingar
   vistaðar".
2. **A new teacher's front page says the work is finished and offers no way in** (HM-01,
   verified live). Heim reads "Þú hefur lokið öllum verkefnum. Slakaðu á eða biddu eftir
   nýjum úthlutunum." for a new editor, for an editor with a chapter assigned, and for a
   guest. No page shows an editor which chapters are theirs.
3. **Orðasafn tells the user a term was saved when most of it was not** (TE-01, TE-02, TE-04,
   verified live). "Breyta orðhausu" stores two of its fields and silently drops the rest.
   After one cancelled "Bæta við þýðingu", "Vista" fails for every new term until the page is
   reloaded.
4. **Changing who a chapter is assigned to adds a second, invisible assignee** (AS-01,
   verified live). The table keeps showing the first person; choosing "— Óúthlutað —" then
   removes the other one. The person the head editor believes they replaced keeps access.
5. **The review loop has gaps on both sides** (ED-07, ED-08, ED-09, SH-04, verified live).
   "Senda til yfirlestrar" works once per module and afterwards always answers "Villa:
   Module already has a pending review". "Yfirlestrar" is the ordinary picker with a banner,
   not a list of what is waiting. A rejection reason appears on Heim but not on the rejected
   row, and in-app notifications are stored but never shown.
6. **Localization cannot be done from the interface today** (LO-01 to LO-03). Editors have
   no link to it; no module can be opened until a faithful file exists, and none does;
   clicking a module marked "Vantar Pass 1" does nothing and says nothing; the review tab
   calls a server route that does not exist.
7. **Most error messages reach the teacher in English, and some are internal text** (SH-05).
   Seven were reproduced live, for example "Villa við að vista: You are not assigned to
   chapter 1 of __e2e-fixture__". Of 442 error bodies the server can send, the client would
   show fixed English text for 327, Icelandic for 20 and the raw internal error for 89.
8. **The screen speaks the pipeline's language** (SH-06, verified live): module ids as names
   ("hluti m68664"), segment ids in the activity list
   ("m68664:m68664:title:fs-idp71946416-title"), book slugs, type codes (TITLE,
   ABSTRACT-ITEM), "EN" and "MT" badges, "Pass 1" and "Pass 2", "(faithful)" and
   "(localized)".
9. **Two accessibility blockers** (ED-10, SH-08, verified live). In the dark theme the text
   in the edit box is close to invisible (contrast 1.2:1). A module cannot be opened from
   the keyboard, in either editor.
10. **"Skoða sem" does not show what the chosen role gets** (SH-01, verified live). It
    changes the sidebar and the segment editor. Heim, Orðasafn, Stjórnandi and Úthlutanir
    keep showing the admin's own view.

### The overall experience for a teacher

The core task works and is quick: from the front page to a saved correction took eight steps
and six clicks, the row showed "Bíður" and "Vistað", and the status line said when it was
saved. A long chapter (381 rows) opened in under a second and did not freeze. The trouble is
everything around that core. A teacher who logs in now and then is not told where to start,
is shown identifiers instead of names, meets native browser boxes whose natural answer
discards their text, and gets feedback from a reviewer only if they look in the right panel
on the front page. The parts a teacher does not need (pipeline panels, type codes, source
filters, six kinds of "save" and "publish") are on the same screens as the parts they do.
Nothing here needs a redesign: most of the findings are a missing message, a missing link,
a control that should be hidden for editors, or one of a small number of plain defects.

---

## 2. Inventory (condensed)

Full tables are in the appendix (A1 to A8).

### 2.1 Pages

| View | URL | Aliases that redirect to it | Page needs | Sidebar entry | Entry shown to |
|---|---|---|---|---|---|
| `my-work.html` | `/` | `/my-work`, `/workflow`, `/dashboard`, `/issues`, `/for-teachers` | any sign-in | Heim | everyone |
| `segment-editor.html` | `/editor` | `/segment-editor` (keeps query), `/reviews`, `/review-queue` | any sign-in | Ritill; Yfirlestrar (`/editor?view=reviews`) | Ritill: everyone. Yfirlestrar: editor and above |
| `status.html` | `/progress` | `/status`, `/pipeline`, `/pipeline/:book/:chapter` | any sign-in | Framvinda | everyone |
| `terminology.html` | `/terminology` | none | any sign-in | Orðasafn | everyone |
| `localization-editor.html` | `/localization` | `/localization-editor`, `/localization-review` | any sign-in | Aðlögun | head-editor, admin |
| `books.html` | `/library` | `/books`, `/books/:id`, `/chapter`, `/images` | any sign-in | Bókasafn | head-editor, admin |
| `assignments.html` | `/assignments` | none | head-editor | Úthlutanir | head-editor, admin |
| `admin.html` | `/admin` | `/admin/users`, `/admin/books`, `/admin/feedback`, `/analytics` | admin | Stjórnandi | admin |
| `profile.html` | `/profile` | none | any sign-in | Um mig | any signed-in user |
| `feedback.html` | `/feedback` | none | public | Ábendingar | everyone |
| `login.html` | `/login` | none | public | Innskrá (signed out) | signed-out users |
| `404.html` | any unknown path | none | public | none | none |

Points from the live pass:

- A page below a user's role redirects to `/` with no message (head-editor on `/admin`;
  editor on `/admin` and `/assignments`).
- `/localization` and `/library` are served to editors and guests who type the address, with
  no sidebar entry highlighted.
- `/reviews` and `/review-queue` redirect to `/editor`, not to `/editor?view=reviews`.
- An unknown `/api/...` address returns the HTML 404 page, not JSON (SH-03).

### 2.2 Functions and the UI

- **219 API endpoints**: 217 in 20 route files and two in `server/index.js`.
  `docs/_generated/routes.md` matches the code exactly.
- **140 have a caller in the UI; 79 do not.** Of the 79: 26 are functions a role needs that
  no screen reaches, 23 belong to an earlier workflow, 20 are maintenance or tooling
  endpoints, 8 are infrastructure, 2 were built for displays that do not exist (A2; classified
  from route names and docblocks).
- **152 client call sites.** Three call a route that does not exist: `GET /api/issues` twice
  in `books.html` (BK-01) and `GET /api/sections/:book/:chapter` in `localization-editor.js`
  (LO-01).
- **No inline handler calls an undefined or non-global function, and no element lookup
  targets a missing element.** The check was run against a planted-defect control first.

Functions with no screen that a teacher or reviewer would miss:

| Function | Endpoints | Effect of the gap |
|---|---|---|
| Read in-app notifications | `GET /api/notifications`, `/count`, `POST /:id/read`, `/read-all` | Stored, never displayed (SH-04) |
| Review queue; complete a review | `GET /api/segment-editor/reviews`, `/review-queue`, `/reviews/:id`; `POST /reviews/:id/complete` | No list of waiting work; a module's review never closes (ED-07, ED-08) |
| Correct or remove a translation in Orðasafn | `PUT`/`DELETE /api/terminology/translations/:id`, `DELETE /api/terminology/:id` | A typo in a term cannot be fixed (TE-01) |
| Switch localization review on or off; book-level queue | `GET`/`POST /api/localization-editor/settings/:book`, `GET /review-queue/:book` | No control exists (LO-04) |
| Publication readiness | `GET /api/publication/...` (4) | Publish buttons cannot say why a chapter is not ready (BK-03) |
| Research consent | `/api/research/consent` (3) | Cannot be given or withdrawn in the UI |
| Withdraw a pending edit | `DELETE /api/segment-editor/edit/:editId` | Only by saving the original text again |

### 2.3 Controls

588 controls were inventoried from code, static and JS-built (A3).

| Page | Controls | Native dialogs in its scripts (alert / confirm / prompt) |
|---|---|---|
| Stjórnandi | 112 | 0 / 3 / 0 |
| Ritill | 95 | 25 / 12 / 1 |
| Aðlögun | 93 | 26 / 11 / 0 |
| Orðasafn | 92 | 31 / 6 / 3 |
| Bókasafn | 65 | 3 / 1 / 0 |
| Heim (with the shared shell) | 41 | 0 / 0 / 0 |
| Framvinda | 24 | 0 / 0 / 0 |
| Úthlutanir | 16 | 1 / 1 / 1 |
| Ábendingar, Um mig, Innskráning, 404 | 50 | 4 / 0 / 0 |

- No control has a handler that does not exist.
- **Hidden for ever:** the notification bell and its badge (SH-04).
- **Dead from the UI:** the localization review tab, about 30 controls (LO-01); the "Atriði"
  tab in Bókasafn (BK-01).
- **Labels that do not match the action** are listed per page in section 4.
- **71 controls would start a pipeline run, write files, publish, import or contact an
  outside service.** None was clicked (A7).

### 2.4 Strings

- `ui-strings.js` describes itself as "all user-facing Icelandic text in one place". Three of
  the 12 views load it (Ritill, Aðlögun, Úthlutanir). The others hold their text inline:
  the readers counted 267 hardcoded strings in Stjórnandi, 222 in Orðasafn, 157 in Bókasafn
  and 103 in Heim.
- Server error bodies: 442. What the client would show: English 327, Icelandic 20, the
  internal `err.message` 89, other 6 (A4).
- Text that is not Icelandic and can reach the screen: 169 entries from the page readers
  (A6); seven were reproduced live (SH-05) and three more appear on Framvinda (PR-01).

---

## 3. Task walkthroughs per role

Steps and clicks are measured. "Guess" marks a point where the screen did not say what to do
next; "silent" marks a point where it did not say what had happened.

Screenshot folders: [editor-t1][f-e1], [editor-t2][f-e2], [review][f-rv], [head-editor][f-he],
[terms and feedback][f-e3], [admin][f-ad], [visitor][f-vi], [explore][f-ex].

### 3.1 Editor (a member with an account and no chapter assigned)

| # | Task | Steps | Clicks | Fields | Outcome | Sticking points |
|---|---|---|---|---|---|---|
| E1 | From the front page to a first saved correction | 8 | 6 | 1 | Done | **Guess:** Heim says "Ekkert verkefni í dag!" and has no link into the work; the only way on is the sidebar. **Guess:** which module to pick, and what "EN" and "MT" mean. **Guess:** whether "Flokkur..." must be chosen (it need not). |
| E2 | See that it was recorded | 3 | 1 | 0 | Done | **Silent:** after a reload the address is still `/editor` and the module is closed; book, chapter and module must be chosen again. Heim lists the edit under "Bíður yfirlestrar" as "Sent" although nothing was sent yet. "Nýleg virkni þín" says "Engin virkni skráð enn." |
| E8 | Send the module for review | 2 | 2 | 0 | Done once | Second time: "Villa: Module already has a pending review", also after every edit had been reviewed. |
| E9 | See the review outcome and answer | 7 | 5 | 1 | Done | Heim shows the reviewer's question under "Breytingar óskast" with "Laga nú". "Laga" opens the module but not the row. The rejected row shows "Hafnað" without the reason. |
| E13 | Look up a term | 3 | 1 | 1 | Done | The term box inside the editor found nothing for "acid" in a module with 116 highlighted terms. |
| E14 | Propose a term | 8 | 3 | 5 | Done | **Silent:** the dialog closes with no confirmation. "Aðrar þýðingar" was discarded. Heim still shows "Orðatillögur 0". |
| E15 | Correct the term just proposed | 7 | 4 | 3 | **Failed silently** | The Icelandic word and the note were not saved; the dialog closed as if they were. |
| E16 | Add another term after a cancelled "Bæta við þýðingu" | 6 | 4 | 2 | **Blocked** | "Villa: Failed to add translation" until the page is reloaded. |
| E17 | Send feedback | 4 | 2 | 1 | Done at the second attempt | "Tegund athugasemdar" is required but not marked; the box says so only after "Senda endurgjöf". The optional book field was already filled in. |
| E18 | Make a localization edit | 5 | 4 | 0 | **Blocked** | No sidebar link (address typed by hand). Modules show "Vantar Pass 1"; clicking one does nothing and says nothing. |
| E19 | Edit a chapter assigned to someone else, enforcement on | 7 | 5 | 1 | Refused at save | Every "Breyta" button is offered; "Vista" answers in English; the typed text stays in the box. |

Work-protection checks in the editor (all verified live):

| Check | What happened |
|---|---|
| "← Til baka" with unsaved text | No question. Text gone, local draft deleted, nothing offered on reopening. |
| Escape with unsaved text | Text reverted at once, no question; status line "Allar breytingar vistaðar". |
| Save row B while row A holds unsaved text | The same OK/Cancel box three times: "Opnum klippispjöldum verður lokað. Viltu halda áfram?" |
| Reload with unsaved text | Browser leave prompt. On reopening: "Fundust 1 óvistuð drög frá síðustu lotu. Endurheimta?", then the box above twice more. |
| Same module in two tabs | Banner in both: "Aðvörun: Þessi eining er opin í öðrum flipa. Breytingar gætu skrifað yfir hvort annað." Editing stays possible. |
| Two editors, same row | The second gets "Annar yfirlesari (test-editor) hefur breytt þessum bút. Endurhlaðið til að sjá nýjustu útgáfu." and then the box above three times. Cancel three times keeps the text. OK loses it. |
| One user, stale second tab | The stale tab's save replaced the first tab's saved text. No message. |
| Server error on save | "Villa við að vista: Server villa (500) — reyni aftur", three retries, then "Vista mistókst eftir 3 tilraunir — textinn var geymdur og birtist aftur í bútnum." Text kept. |
| Session expired on save (simulated) | Leave prompt, then "Villa við að vista: Please log in again", then the sign-in redirect. |

Keyboard and performance:

- From the chapter list, Tab never reaches a module card (`tabindex` is -1). Inside a module,
  "Breyta" takes Enter, the text box gets focus, Ctrl+S saves. After the save, focus is on
  the page body.
- Largest module in the repository (`efnafraedi-2e` chapter 20, 381 rows, 17,633 DOM nodes):
  rows on screen after 0.9 s; filter change 0.19 s; opening a row 0.19 s; typing 19
  characters 0.34 s; one 223 ms frame while scrolling the whole page. No freeze.

### 3.2 Head editor

| # | Task | Steps | Clicks | Outcome | Sticking points |
|---|---|---|---|---|---|
| H1 | Find the pending edits | 6 | 5 | Done | Heim points the way ("3 breytingar bíða úrskurðar þíns." with "Skoða úrlausnir"), but under a header that says "Engin verkefni í dag – vel gert!" (HM-10). **Guess:** "Yfirlestrar" then shows the ordinary book, chapter and module pickers with a banner; nothing says which module holds the edits. The filter "Bíður yfirlestrar" inside the module works. |
| H2 | Approve one, reject one, discuss one | 4 | 4 | Done | Approve is one click. Reject and discuss ask for their text in a bare browser prompt ("Ástæða höfnunar:", "Umræðuefni:"). |
| H3 | Assign a chapter, then change the assignee | 6 | 5 | **Wrong result** | The dropdown keeps the first name; the server holds both; "— Óúthlutað —" removes the hidden one (AS-01). A book that is not the head editor's own answers "Villa: Insufficient permissions". |
| H4 | Open a book in Bókasafn | 2 | 1 | Not possible here | "Engar bækur skráðar" (fixture limit, see Method). |
| H5 | Localization review tab | 2 | 1 | **Blocked** | The book list on that tab is empty. |

The head editor's module page also shows "Vista í skrár", "Vista + Birta", "Útgáfusaga" and a
panel "Ferill (innsetja → birta)" with "Rás: Bein þýðing (faithful) | MT forskoðun | Staðfærð
(localized)" and "Innsetja", "Birta", "Innsetja + Birta". None was clicked.

### 3.3 Admin

| # | Task | Steps | Clicks | Outcome | Sticking points |
|---|---|---|---|---|---|
| A1 | Add a user | 5 | 3 | Done | **Silent:** the dialog closes; no confirmation. The role list says "Kerfistjóri". |
| A2 | Give an editor access to a book | 12 | 12 | **Blocked here** | The book list in the edit panel was empty (catalogue never synced). |
| A3 | Books tab | 1 | 1 | Viewed | "Engar bækur fundust" although seven books are registered and in use. |
| A4 | Handle a reader report | 3 | 3 | Done | **Silent:** changing "Staða" gives no confirmation. Location shown as `__e2e-fixture__`. |
| A5 | Statistics tab | 1 | 1 | Viewed | All zeros. |
| A6 | "Skoða sem" for each role | 29 | 4 | Compared | See SH-01. |

### 3.4 Guest (signed in, role viewer, no `users` row)

Nine steps, four clicks.

- **Heim:** the same "Þú hefur lokið öllum verkefnum" as an editor. Nothing says the user is
  a guest.
- **Ritill:** the book picker works; the chapter list stays at "Veldu kafla..." with no
  message (the request is refused).
- **Stillingar:** opens, lets the guest tick boxes; "Vista" answers "Gestir fá engar
  tilkynningar og því eru engar stillingar vistaðar."
- **Orðasafn:** "Bæta við" is offered; "Vista" answers "Villa: Insufficient permissions".
- **Um mig** is the one page that explains: "Þú ert gestur … Sendu umsjónarmanni verkefnisins
  netfangið sem þú skráðir þig inn með".
- **Framvinda** is readable.

[f-e1]: ../../server/test-results/interface-audit-2026-11-13/editor-t1/
[f-e2]: ../../server/test-results/interface-audit-2026-11-13/editor-t2-work-protection/
[f-rv]: ../../server/test-results/interface-audit-2026-11-13/review-editor-A/
[f-he]: ../../server/test-results/interface-audit-2026-11-13/head-editor-review/
[f-e3]: ../../server/test-results/interface-audit-2026-11-13/editor-t3-terms-feedback/
[f-ad]: ../../server/test-results/interface-audit-2026-11-13/admin-tasks/
[f-vi]: ../../server/test-results/interface-audit-2026-11-13/visitor-tasks/
[f-ex]: ../../server/test-results/interface-audit-2026-11-13/explore-editor/

---

## 4. Findings, grouped by page

Format: **ID · severity · category · roles**, then where, what was observed against what was
expected, why it matters to a teacher, a suggested fix, and the evidence level. Paths are
under `server/`. Screenshot paths are under
`server/test-results/interface-audit-2026-11-13/`. Suggested Icelandic copy is marked
*(needs native reading)*.

Severity: S1 blocks a task, loses or silently corrupts work, or exposes a function to the
wrong role. S2 misleads. S3 is friction, inconsistency or jargon. S4 is polish.

### 4.1 The whole application (shell, shared behaviour)

**SH-01 · S2 · D, B · admin** — `public/js/layout.js:370-376`; `admin-tasks/010` to `015`
- Observed: "Skoða sem" changes the sidebar and the segment editor's role-gated controls.
  Under any preview, `/admin` and `/assignments` stay open with full content, Heim keeps the
  admin panels, and Orðasafn keeps the mining, queue and export controls. A real session of
  that role is redirected from `/admin`, and does not see those controls.
- Expected: the preview shows what the role gets, or says plainly what it does not cover.
- Why it matters: an admin checking "what does a teacher see?" gets a wrong answer on four
  pages.
- Fix: have `admin.html`, `books.html`, `my-work.html` and `terminology.html` read the
  effective role, as the segment editor does; add a line under the dropdown, for example
  "Sýnir aðeins valmynd og ritil; réttindi á þjóni breytast ekki." *(needs native reading)*
- Evidence: verified live.

**SH-02 · S3 · B · editor and above** — `public/js/layout.js:244-261`
- Observed: at `/editor?view=reviews` both "Ritill" and "Yfirlestrar" are highlighted. With
  any further query parameter only "Ritill" is.
- Fix: match the `view=reviews` parameter instead of the whole query string, and exclude it
  from the "Ritill" match.
- Evidence: verified live (both highlighted); the second half by running the function's
  logic.

**SH-03 · S3 · F · everyone** — `server/index.js:426-436`
- Observed: an unknown `/api/...` address returns the HTML 404 page with status 404. The JSON
  404 handler declared after the view routes is never reached.
- Why it matters: a mistyped or removed endpoint shows up in the UI as "Netþjónninn svaraði
  HTTP 404" or as nothing at all, which is how BK-01 and LO-01 stay invisible.
- Fix: mount the `/api` 404 handler before the view routes.
- Evidence: verified live.

**SH-04 · S2 · A, F · everyone** — `public/js/layout.js:144-147`; `views/my-work.html`
(Stillingar)
- Observed: the bell is created hidden and nothing shows it. No client code reads
  notifications. After a rejection and a discussion request, `GET /api/notifications`
  returned an empty list for the editor. The settings dialog still offers "Í appinu" for
  three kinds of notification and answers "Stillingar vistaðar".
- Expected: either notifications are shown, or the settings for them are not offered.
- Why it matters: a teacher who logs in now and then has no signal that something is waiting
  except the front page.
- Fix: show the bell with the unread count, or remove the "Í appinu" column until it exists.
- Evidence: verified live (bell hidden; empty list) and code only (read) for the absence of
  callers.

**SH-05 · S2 · F, G · everyone** — `public/js/htmlUtils.js:44-55`; all route files (A4)
- Observed: `fetchJson` shows the server's `error` field first. Reproduced live:
  - "Villa: Module already has a pending review"
  - "Villa við að vista: You are not assigned to chapter 1 of __e2e-fixture__"
  - "Villa: Insufficient permissions"
  - "Villa: Failed to add translation"
  - "Villa við að hlaða einingu: Failed to load"
  - "Villa: Failed to load" (inline in the term list)
  - "Villa við að vista: Please log in again"
- Expected: plain Icelandic with a next step.
- Why it matters: the message arrives at the moment the teacher is unsure whether their text
  survived, and it does not say.
- Fix: give error bodies a stable `code`; translate codes on the client; never return
  `err.message` as `error` (89 places do).
- Evidence: verified live (seven messages); the totals are mechanical.

**SH-06 · S3 · C · everyone** — several views
- Observed on screen:
  - module ids used as names: "Kafli 1, hluti m68664", "E2E Fixture K1/m68664";
  - segment ids in the activity list: "vistaði breytingu á
    m68664:m68664:title:fs-idp71946416-title í __e2e-fixture__ kafla 1";
  - book slugs: "efnafraedi-2e / Kafli 1", "Staðsetning: __e2e-fixture__";
  - type codes in the "Tegund" column: TITLE, ABSTRACT, ABSTRACT-ITEM, PARA, CAPTION;
  - "EN" and "MT" badges; "Lýsigögn kafla"; module titles in English ("20.1 Hydrocarbons");
  - "Pass 1", "Pass 2", "Bein þýðing (faithful)", "Staðfærð (localized)";
  - raw values in Orðasafn's filters: "idordabankinn", "chemistry-association",
    "mined-postedit".
- Fix: show the section number and Icelandic title everywhere a module is named; translate
  the type codes ("Titill", "Málsgrein", "Myndatexti") *(needs native reading)* or hide the
  column for editors; show the book title, never the slug.
- Evidence: verified live.

**SH-07 · S3 · J · everyone** — A5
- Observed: 90 `alert`, 34 `confirm` and 5 `prompt` calls. A reviewer types a rejection
  reason into a bare browser prompt. Success is shown by a toast on some pages, by a closing
  dialog on others, and by nothing in Stjórnandi.
- Fix: one in-page dialog and one toast component; start with the prompts and the
  "unsaved text" confirms (ED-03).
- Evidence: counts mechanical; six dialogs verified live.

**SH-08 · S3 · I · keyboard users** — `public/js/segment-editor.js` (module cards);
`views/books.html`; `views/status.html`
- Observed: module cards have `tabindex` -1 and no key handler, so Tab from the chapter list
  goes to the page body. After Ctrl+S, focus is on the body and the user must tab through
  the sidebar again. The readers report the same pattern for module rows in Aðlögun, book and
  chapter cards in Bókasafn and chapter rows in Framvinda.
- Fix: render the cards as buttons or links; return focus to the saved row.
- Evidence: verified live for Ritill; code only (reader, two readers) for the other pages.

**SH-09 · S3 · I · everyone** — `public/css/common.css`
- Observed (computed in the browser, WCAG AA): muted text `rgb(154,147,138)` on the light
  backgrounds is 2.7:1 to 3.0:1 (section labels, the "Ritstjórnarumhverfi" line, meta text);
  "✓ Staðfesta MT" is 4.2:1. In the dark theme: muted text 2.5:1 to 3.1:1, primary button
  text 3.1:1 to 3.4:1, the queue chips in Orðasafn black on dark (1.5:1).
- Fix: darken the muted token in light and lighten it in dark; give the chips a text colour.
- Evidence: verified live.

**SH-10 · S3 · I, J · everyone** — `views/status.html` (script tags)
- Observed: Framvinda does not load `theme.js`. In the dark theme the page stays light, the
  theme button has no label there and does nothing.
- Fix: load `theme.js` on that page.
- Evidence: verified live.

**SH-11 · S3 · B · everyone** — `public/js/segment-editor.js`, `localization-editor.js`
- Observed: the address stays `/editor` while a module is open, so a reload or a bookmark
  returns to the picker. Deep links such as `/editor?book=…&chapter=…&module=…` do work.
  The chapter list keeps "Hleður kafla..." as its first option after it has loaded.
- Fix: write book, chapter and module to the address when they change; replace the
  placeholder with "Veldu kafla...".
- Evidence: verified live.

**SH-12 · S3 · C, D · guest** — `views/my-work.html`, `segment-editor.html`,
`terminology.html`
- Observed: only Um mig tells a guest they are a guest. Heim congratulates them on finishing;
  Ritill shows a chapter list that stays empty with no message; Orðasafn lets them fill in a
  term and refuses in English; Stillingar explains only after "Vista".
- Fix: one banner on every page for a guest, with the text Um mig already has; hide "Ritill"
  and the write controls.
- Evidence: verified live.

**SH-13 · S4 · G · everyone** — `public/js/theme.js`
- Observed: the theme button reads "Ljóst" with a moon in the light theme and "Dimmt" with a
  sun in the dark theme. It is not clear whether the word is the state or the action.
- Fix: "Ljóst þema" / "Dökkt þema" as the state, or an explicit switch. *(needs native
  reading)*
- Evidence: verified live.

**SH-14 · S2 · F · everyone at sign-in** — `views/login.html:169`; `routes/auth.js`
- Observed: sign-in is a navigation to an API route, so a refusal is shown as a bare JSON
  document. Locally `/api/auth/login` answers 503 with `{"error":"Authentication not
  configured",…}`. The readers report the same for a deactivated account and for the sign-in
  rate limit.
- Fix: redirect sign-in failures to `/login` with a message.
- Evidence: verified live for the not-configured case; code only (reader, not re-checked)
  for the others.

### 4.2 Heim (`/`)

**HM-01 · S2 · A, C · editor, guest** — `routes/my-work.js:217-242`; `views/my-work.html`;
`explore-editor/001-home.png`
- Observed: a new editor, an editor with chapter 2 of Efnafræði assigned, and a guest all see
  "Engin verkefni í dag – vel gert!" and "Þú hefur lokið öllum verkefnum. Slakaðu á eða biddu
  eftir nýjum úthlutunum." The two editors' pages were identical. There is no button into
  the editor, and no page lists an editor's chapters.
- Expected: "Kaflarnir þínir" with a "Byrja" button, or a plain statement that nothing is
  assigned yet and who to ask.
- Why it matters: this is the first screen of the first day.
- Fix: list the user's chapter assignments with progress and a link; when there are none,
  say so and offer "Opna ritil". Suggested empty text: "Þér hefur ekki enn verið úthlutað
  kafla. Hafðu samband við aðalritstjóra, eða opnaðu ritilinn til að skoða." *(needs native
  reading)*
- Evidence: verified live.

**HM-02 · S2 · F · editor** — `views/my-work.html` (detailed view);
`probe-editor-A/002-home-detailed-after-review.png`
- Observed: a saved edit appears under "Bíður yfirlestrar" as "Sent 2026-11-13" before
  "Senda til yfirlestrar" was pressed. Three edits in one module appear as three identical
  rows ("E2E Fixture · Kafli 1, hluti m68664 · Sent …"), each with the same "Skoða" link.
- Expected: one row per module with a count, or rows that name the sentence.
- Fix: group by module; show the section title and the number of edits; say "Vistað" until
  it is actually sent, or drop the sending step (ED-07).
- Evidence: verified live.

**HM-03 · S2 · C, G · editor** — `routes/my-work.js:219-234`;
`review-editor-A/001-editor-home-after-review.png`
- Observed: a reviewer's question ("Á þetta að vera í nútíð eða þátíð?") is shown under
  "Breytingar óskast" with the button "Laga nú". The rejected edit is the second item, shown
  without its reason in the focus view. Neither names the sentence.
- Expected: a question reads as a question with "Svara"; a rejection shows its reason and the
  text it concerns.
- Fix: separate "Spurning frá yfirlesara" (button "Svara") from "Breytingu hafnað" (button
  "Skoða og laga"); show the first words of the segment. *(needs native reading)*
- Evidence: verified live.

**HM-04 · S3 · B · editor** — `views/my-work.html` ("Laga")
- Observed: "Laga" opens the right module but no row; the editor must find the row among 72.
- Fix: add the segment to the link and open that row.
- Evidence: verified live.

**HM-05 · S2 · B · editor** — `routes/my-work.js:62-71`
- Observed: the tile "Orðatillögur" stays 0 and the card says "Orðatillögur eru ekki enn í
  boði." after the user proposed a term that Orðasafn stores as theirs.
- Fix: count the user's proposed translations, or remove the tile and the card.
- Evidence: verified live.

**HM-06 · S3 · F · editor** — `views/my-work.html` ("Nýleg virkni þín")
- Observed: "Engin virkni skráð enn." after the user had saved edits, sent a module for
  review and replied in a discussion. The head editor's "Nýleg virkni
  teymis" listed the same actions.
- Fix: match the activity log on the same user key the team list uses.
- Evidence: verified live.

**HM-07 · S2 · F · everyone** — `views/my-work.html:1361-1373`
- Observed: when `/api/my-work` fails, the detailed view keeps "Hleður..." in all four lists
  for ever, with no message. When `/api/my-work/today` fails, the header says "Villa við að
  hlaða gögnum" and the task card keeps "Hleður verkefnum...".
- Fix: replace the spinners with the error and a "Reyna aftur" button.
- Evidence: verified live (simulated failure).

**HM-08 · S3 · C · head-editor, admin** — `views/my-work.html` (admin panels);
`head-editor-review/001-he-home.png`
- Observed: "efnafraedi-2e / Kafli 1", "test-editor test-editor vistaði breytingu á
  m68664:m68664:title:fs-idp71946416-title í __e2e-fixture__ kafla 1". The user name is
  printed twice.
- Fix: as SH-06; print the display name once.
- Evidence: verified live.

**HM-09 · S2 · B, C · head-editor, admin** — `views/my-work.html:1017-1024, 1658-1683`;
`services/dashboardReadModel.js`
- Observed: the panel "Tilbúið til úthlutunar" lists modules whose approved edits have not
  been applied to files, not anything that can be assigned. "N samþykktar breytingar bíða
  birtingar" counts modules, and its button opens the pending-review filter.
- Fix: rename to what it lists, for example "Samþykkt, á eftir að vista í skrár" *(needs
  native reading)*, and link to the apply panel.
- Evidence: code only (reader, two readers).

**HM-10 · S2 · G · head-editor** — `views/my-work.html` (header);
`head-editor-review/001-he-home.png`
- Observed: the header reads "Engin verkefni í dag – vel gert!" and the card "Engin
  ritstjórnarverkefni í dag" directly above "3 breytingar bíða úrskurðar þíns." The button is
  "Skoða úrlausnir"; to a teacher "úrlausnir" means answers to exercises.
- Fix: count review decisions as tasks in the header; "Fara yfir breytingar". *(needs native
  reading)*
- Evidence: verified live. Raised by the fresh-eyes reader.

**HM-11 · S3 · E · everyone** — `views/my-work.html:1797-1867`
- Observed: pressing "Vista" in Stillingar before the list has loaded, or after it failed to
  load, sends an empty set and resets the saved choices to the defaults, with a success
  toast.
- Fix: disable "Vista" until the list has loaded.
- Evidence: code only (reader, two readers).

### 4.3 Ritill (`/editor`)

**ED-01 · S1 · E · editor and above** — `public/js/segment-editor.js:3248-3260` (handler),
`:153-160` (`clearDraft`); `editor-t2-work-protection/001-after-back-with-unsaved.png`
- Observed: "← Til baka" with unsaved text in an open row asks nothing. The text is gone, the
  local draft is deleted, and reopening the module offers nothing back.
- Expected: a question, as the localization editor asks ("Þú átt óvistaðar breytingar. Viltu
  yfirgefa?"), or the draft kept.
- Why it matters: "Til baka" is the visible way out of a module.
- Fix: ask before leaving when a row is dirty, and keep the draft either way. Suggested text:
  "Þú átt óvistaðan texta í N línum. Vista áður en þú ferð?" with "Vista", "Henda", "Hætta
  við". *(needs native reading)*
- Evidence: verified live.

**ED-02 · S1 · E · editor and above** — `public/js/segment-editor.js:600-627, 1561-1587`;
`probe-editor-A/003-conflict-A-after-ok.png`
- Observed: when another editor saved the same row first, "Vista" shows "Annar yfirlesari (…)
  hefur breytt þessum bút. Endurhlaðið til að sjá nýjustu útgáfu.", then "Opnum
  klippispjöldum verður lokað. Viltu halda áfram?", then "Fundust 1 óvistuð drög frá síðustu
  lotu. Endurheimta?", then the first question again. Answering OK to all of them leaves no
  open row, the other editor's text in the row, and "Allar breytingar vistaðar". After a
  reload the draft is offered and closed again by the next OK. Answering Cancel to every
  "Opnum klippispjöldum" question keeps the text.
- Expected: the typed text stays in the box next to the other editor's version.
- Why it matters: OK is the natural answer to "Viltu halda áfram?", and it is the one that
  discards.
- Fix: on a conflict, keep the row open and show both texts in the page; do not re-render
  the table.
- Evidence: verified live.

**ED-03 · S2 · E, G · editor and above** — `public/js/segment-editor.js:1561-1574`, callers
`:674`, `:698`, `:1488`; `ui-strings.js:50`
- Observed: saving one row while another holds unsaved text raises "Opnum klippispjöldum
  verður lokað. Viltu halda áfram?" three times in a row. The wording does not say that text
  will be lost, and "klippispjöld" is not a word a teacher knows.
- Fix: do not close dirty rows on a re-render. If a question is unavoidable, ask once:
  "Línan sem þú ert að breyta er óvistuð. Ef þú heldur áfram tapast textinn." *(needs native
  reading)*
- Evidence: verified live.

**ED-04 · S2 · E, F · editor and above** — `public/js/segment-editor.js:4355-4377` (Escape),
`:54-73` (status line)
- Observed: Escape in a changed text box reverts the text at once, with no question and no
  undo. The status line then reads "Allar breytingar vistaðar". The readers report the same
  for "Hætta við" and "↩ Endurstilla".
- Fix: ask before discarding changed text, or offer "Afturkalla" for a few seconds; make the
  status line say "Engar óvistaðar breytingar" when nothing was saved. *(needs native
  reading)*
- Evidence: verified live for Escape; code only (reader, two readers) for the two buttons.

**ED-05 · S2 · E · editor and above** — `services/segmentEditorService.js:58-76`;
`public/js/tabGuard.js`
- Observed: with a module open in two tabs, a save from the tab that had not seen the other
  tab's save replaced that text with no message. The banner "Þessi eining er opin í öðrum
  flipa…" warns but does not block, and does not exist across devices.
- Fix: apply the same base-text check to the user's own earlier edit as to another editor's.
- Evidence: verified live.

**ED-06 · S2 · D, F · editor** — `middleware/requireRole.js:238-290`;
`public/js/segment-editor.js:1673-1686`;
`editor-t5-enforced/001-editor-refused-not-my-chapter.png`
- Observed: with assignment enforcement on and the chapter assigned to someone else, the
  editor sees "Breyta" on all 72 rows and "✓ Staðfesta MT" on 66, and no notice. "Vista"
  answers "Villa við að vista: You are not assigned to chapter 1 of __e2e-fixture__". The
  text stays in the box.
- Fix: return the user's write access with the module and show the rows read-only with one
  line: "Þessi kafli er úthlutaður öðrum. Þú getur lesið en ekki breytt." *(needs native
  reading)*
- Evidence: verified live.

**ED-07 · S2 · B · editor** — `public/js/segment-editor.js:3106-3140`;
`services/segmentEditorService.js:749-759`
- Observed: "Senda til yfirlestrar" succeeds once per module. Every later attempt answers
  "Villa: Module already has a pending review", also after the head editor had approved,
  rejected and discussed every edit. The head editor could review the edits without it, and
  Heim listed them as "Sent" before it was pressed (HM-02). No screen calls the endpoint
  that closes a review.
- Expected: either the step means something and can be repeated, or it is not there.
- Fix: decide which. If edits are reviewable when saved, remove the button; otherwise close
  the review when its last edit is decided.
- Evidence: verified live; the missing caller is mechanical.

**ED-08 · S2 · A, B · editor and above** — `public/js/segment-editor.js:4507-4524`;
`head-editor-review/003-he-reviews-module-list.png`
- Observed: "Yfirlestrar" shows the banner "Sýnir einingar sem bíða yfirlestrar" over the
  ordinary book, chapter and module pickers. Nothing is filtered and module cards carry no
  mark for waiting edits. The server has a review-queue endpoint that nothing calls.
- Fix: list modules with waiting edits (book, chapter, section title, count, oldest) and
  open them filtered.
- Evidence: verified live.

**ED-09 · S3 · F · editor** — `public/js/segment-editor.js:2123-2136`
- Observed: a rejected row shows "Hafnað" and "Breytingu var hafnað — vélþýðingin stendur
  óbreytt." The reviewer's reason is on Heim only.
- Fix: show the reason in the row.
- Evidence: verified live.

**ED-10 · S2 · I · everyone using the dark theme** — `public/css/common.css` (marker
backdrop); `quality-contrast-dark/002-dark-editor.png`
- Observed: in the dark theme the text in the edit box is `rgb(26,26,26)` on
  `rgb(39,43,51)`, a contrast of 1.2:1.
- Fix: give the highlighted layer behind the text box the theme's text colour.
- Evidence: verified live.

**ED-11 · S2 · B, C · head-editor, admin** — `views/segment-editor.html:1958-2030`;
`head-editor-review/004-he-pending-rows.png`
- Observed: above the rows a reviewer has to judge sit "Vista í skrár", "Vista + Birta",
  "Útgáfusaga" and "Ferill (innsetja → birta)" with "Rás: Bein þýðing (faithful) | MT
  forskoðun | Staðfærð (localized)", "Innsetja", "Birta", "Innsetja + Birta". The ✓ ✗ 💬
  buttons are below the fold. The readers add that "Vista + Birta" ends with "Vistað + Birt!"
  although it writes HTML on the editorial server and publishes nothing to readers.
- Why it matters: the fresh-eyes reader's first fear was publishing to students by accident.
- Fix: move the file and pipeline panels to their own tab or page for admins; keep the
  review page for reviewing.
- Evidence: verified live for the layout and labels; the "Birt!" claim is code only (reader,
  not re-checked).

**ED-12 · S3 · C · editor** — `views/segment-editor.html` (module header, figure cards);
`editor-t1/004-editor-segments.png`
- Observed: before the first sentence come a search box, a preview control with a track
  list, a panel "MYNDATEXTI TIL YFIRLESTRAR" with figure file names
  ("CNX_Chem_01_01_Alchemist") and labels such as "⚠ Orðalag MT stakra merkinga", seven
  counters and three filters.
- Fix: collapse everything but the status line and the filters by default; show the figure
  panel only to those reviewing figures.
- Evidence: verified live. Weight raised by the fresh-eyes reader.

**ED-13 · S3 · C · editor** — row buttons
- Observed: "✓ Staðfesta MT" sits on every row next to "Breyta". Nothing on the screen says
  what confirming means, who sees it, or that it can be undone. Saved rows show "Vistað" and
  "Bíður"; approved rows "Samþykkt"; confirmed rows "Staðfest".
- Fix: "Staðfesta vélþýðingu" with a tooltip on first use; one legend for the four states.
  *(needs native reading)*
- Evidence: verified live. Raised by the fresh-eyes reader.

**ED-14 · S3 · B · editor** — `routes/segment-editor.js:134` (lookup); live module with 116
highlighted terms
- Observed: "Fletta upp hugtaki…" answered "Ekkert fannst" for "acid" in a module where 116
  terms are highlighted and the popup shows "hybridization → svigrúmablöndun". The lookup
  reads one term store and the highlights another (TE-03).
- Evidence: verified live on the test database, where only one of the two stores has data.

**ED-15 · S3 · G · everyone** — texts seen live
- "Athugasemd (valkvætt)" in the row and "Athugasemd (valkvæð)" on the figure card.
- "Breytingar gætu skrifað yfir hvort annað."
- "1 samþykktar breytingar til að vista"; "Senda 1 breytingar til yfirlestrar?"
- "Vista mistókst eftir 3 tilraunir"; "Server villa (500) — reyni aftur".
- "72 bútar · 72 þýddar"; "0/72 bútar breytt".
- See section 6 and the fresh-eyes list in 5.4 for suggested wording.
- Evidence: verified live.

**ED-16 · S3 · F · editor** — `public/js/segment-editor.js:502-560, 600-631`
- Observed: when the chapter list fails to load, the list stays at "Veldu kafla..." with no
  message. When a module fails to load, a browser box says "Villa við að hlaða einingu:
  Failed to load".
- Fix: show the error in the page with "Reyna aftur".
- Evidence: verified live (simulated failure).

**ED-17 · S3 · D · everyone** — book picker (`public/js/bookSelector.js`)
- Observed: "Lífræn efnafræði" is offered in every book list. The readers report that the
  server refuses every write for it. The picker pre-selects the first book or the one last
  used in this browser, on every page, including the optional book field in Ábendingar.
- Fix: list only books that are open for editing; pre-select the user's assigned book.
- Evidence: verified live (listing and pre-selection); the refusal is code only (reader, not
  re-checked).

**ED-18 · S2 · E · editor and above** — code only (reader, not re-checked), from the
work-protection reader:
- text typed after pressing "Vista" and before the server answers is not sent, and the row
  is then marked clean (`segment-editor.js:2682, 2763, 2801-2813`);
- "Fundust N óvistuð drög… Endurheimta?": Cancel deletes the drafts, which the question does
  not say (`:207`);
- "Nota þessa þýðingu" replaces unsaved typed text without asking (`:1225-1248`);
- local drafts are keyed by book, chapter and module only, so on a shared browser profile
  the next person to sign in is offered the previous person's text (`:79-94`);
- a head editor's ✓ or ✗ is applied to the newest text even if it changed after their page
  loaded (`:1398-1410`).

**ED-19 · no finding · K** — performance
- The largest module (381 rows) rendered in 0.9 s and stayed responsive. Nothing to report.

### 4.4 Aðlögun (`/localization`)

**LO-01 · S1 · A, B · head-editor, admin** — `public/js/localization-editor.js:1842-1865`;
`routes/sections.js:53`
- Observed: the tab "Yfirlestur á staðfæringu" fills its "Hluti" list from
  `GET /api/sections/:book/:chapter`. The sections router has only `/:sectionId`, so the
  request gets a 404, the list reads "Villa" and stays disabled, and "Hlaða" can never be
  enabled. About 30 controls behind it (scan, suggestions, log) are unreachable except by
  typing `?sectionId=N`.
- Fix: add the route or remove the tab.
- Evidence: code only (read) and mechanical. Live, the tab's book list was already empty on
  the test database, so the request could not be reached.

**LO-02 · S2 · A, D · editor** — `public/js/layout.js:420-424`; `routes/views.js:53-55`
- Observed: "Aðlögun" is shown to head editors and admins only. The page is served to any
  signed-in user who types the address, and the readers report that the save endpoints accept
  the editor role. `docs/onboarding.md` tells new editors to "Navigate to `/localization`".
- Expected: one answer to "do teachers localize?", the same in the menu, the server and the
  documents.
- Fix: decide, then make the three agree.
- Evidence: verified live (menu and page); the save permission is code only (reader, two
  readers).

**LO-03 · S2 · F · everyone** — `public/js/localization-editor.js:423-456`;
`editor-t4/002-localization-module-without-pass1.png`
- Observed: every module shows "Vantar Pass 1". Clicking one does nothing and shows nothing.
  No book in the repository has a faithful-translation file, so today no module can be
  opened by anyone.
- Fix: say why on the row and what unlocks it: "Ekki hægt að staðfæra fyrr en yfirlestri er
  lokið og hann vistaður í skrár." *(needs native reading)*
- Evidence: verified live.

**LO-04 · S2 · E, F · anyone who can open a module** — code only (reader, two readers
unless noted); none could be tested live (see LO-03):
- on a save conflict the dialog promises "(Óvistaðar breytingar þínar verða geymdar sem
  drög.)" but the draft can be deleted before the reloaded module reads it
  (`localization-editor.js:240-243, 1072-1079`; one reader);
- the first save of any one row writes the whole module, after which every row counts as
  "staðfærð" and the progress bar is full (`:356-360, 536-544`);
- where localization review is on, the row button and the autosave report "Vistað" and
  "Allar breytingar vistaðar" although the text was only submitted for approval, and the
  editor cannot see their pending or rejected edits afterwards (`:185-208, 576-613`);
- "Afrita" (tooltip "Afrita trúa þýðingu") overwrites the row's text with the faithful text
  instead of copying to the clipboard (`:811-816`);
- after "Til baka", Escape or a failed load, the module list is a permanent "Hleður
  einingu..." spinner (`:473-479`);
- "Færa í þessa útgáfu" discards unsaved text while its question says the action is
  reversible (`:1342-1378`);
- choosing to stay at the browser's leave prompt switches off the autosave and the local
  draft for the rest of the session (`:1406-1420`; one reader);
- no control switches localization review on or off for a book.

**LO-05 · S3 · G, C · everyone** — texts seen live
- "Velja einingu til staðfærslu (Pass 2)"; "Staðfærsla aðlagar trúa þýðingu (Pass 1)…".
- "Allar bútur" in the filter (expected "Allir bútar").
- "Kafli 0" in the chapter list for Efnafræði 2e.
- The menu says "Aðlögun", the tab "Staðfærsluritill", the other tab "Yfirlestur á
  staðfæringu".
- Evidence: verified live.

### 4.5 Orðasafn (`/terminology`)

**TE-01 · S1 · E, F · editor and above** — `views/terminology.html:1900-1936`;
`services/terminologyService.js:393`; `editor-t3-terms-feedback/005-terminology-detail.png`
- Observed: "Breyta orðhausu" opens a form with the Icelandic word, subject, source,
  Icelandic definition and note filled in and editable. "Vista" closes it as if saved. Only
  the part of speech and the English definition are stored; the changed Icelandic word and
  note were not. No other control edits an existing translation.
- Why it matters: a teacher who fixes their own spelling mistake believes it is fixed, and
  the misspelling can then be approved.
- Fix: send the translation fields to the translation endpoint that already exists
  (`PUT /api/terminology/translations/:id`), or disable the fields that are not saved.
- Evidence: verified live and code only (read).

**TE-02 · S1 · B · editor and above** — `views/terminology.html:2003, 2030`
- Observed: opening "Bæta við þýðingu" rewires "Vista" to the add-translation action, and
  only a successful add rewires it back. After "Hætta við", adding a new term posts to
  `/api/terminology/null/translations` and shows "Villa: Failed to add translation". It
  stays so until the page is reloaded.
- Fix: set the button's action every time the dialog opens.
- Evidence: verified live and code only (read).

**TE-03 · S2 · C, A · everyone** — `services/terminologyService.js`; `lib/resolvedGlossary.js`
- Observed: this page writes to the headword and translation tables. The editor's term
  highlighting and the glossary exported for machine translation read the concept model,
  which no screen can change. Live, Orðasafn was empty while the editor highlighted 116
  terms, and the popup's "Opna í orðasafni →" led to the empty list.
- Why it matters: approving a term here does not change what the editor flags.
- Fix: this is a known state of the terminology work; until the concept model has a write
  path, say on the page what approving does and does not affect.
- Evidence: code only (read; CLAUDE.md records the split) with live corroboration.

**TE-04 · S2 · E · editor and above** — `views/terminology.html:979-982, 1864`
- Observed: text typed in "Aðrar þýðingar" is discarded on save.
- Fix: save it or remove the field.
- Evidence: verified live.

**TE-05 · S3 · F · editor and above** — `views/terminology.html:1931-1935`
- Observed: a successful "Vista" closes the dialog with no confirmation.
- Fix: a toast, as other pages use: "Tillaga vistuð. Hún bíður samþykkis." *(needs native
  reading)*
- Evidence: verified live.

**TE-06 · S3 · D · editor, guest** — `views/terminology.html:930` and others
- Observed: an editor sees "Flytja inn"; all five import endpoints need the head-editor
  role. A guest sees "Bæta við", fills the form and gets "Villa: Insufficient permissions".
- Fix: hide what the role cannot do.
- Evidence: verified live (buttons shown; guest refusal); the import role is from the
  route's middleware.

**TE-07 · S3 · C, G · everyone** — filters and labels seen live
- "Uppruni" lists "Efnafræðifélag Íslands" twice and ends with "mined-postedit".
- The queue's source filter lists raw values ("idordabankinn", "chemistry-association").
- "0 orðh. / 0 þýð."; "ORÐHAUSAR / ÞÝÐINGAR"; "Orðflokkur (POS)" with "t.d. n, adj, v".
- "Breyta orðhausu"; "Niðurstöður (1 orðhausar)"; "Engin niðurstöður"; "Allir upprunar".
- Evidence: verified live.

**TE-08 · S2 · B, F · everyone** — code only (reader, two readers):
- the "Uppruni" filter has no effect on the list or the export, yet counts as an active
  filter (`terminology.html:829-833, 1166-1184`);
- a new search from page 2 or later keeps the old offset and can show "Engin orð fundust."
  when there are matches (`:1151, 1654-1657`);
- "Lykilorð úr köflum" reports "Innflutningur lokið!" with zeros when it found no files to
  read (`:2109-2124`);
- "Flytja út CSV" stops at 10,000 headwords without saying so (`routes/terminology.js:229`).

### 4.6 Framvinda (`/progress`)

**PR-01 · S3 · G, C · everyone** — `views/status.html`; `routes/status.js`;
`explore-editor/004-progress.png`
- Observed under "Þarfnast skoðunar": "K1: m68664: 1 rejected", "K1: m68664: 1 in
  discussion", "K1: m68664: awaiting review", and "1 einingar bíða yfirlestrar", "1
  breytingar í umræðu".
- Fix: translate the three phrases; name the section; singular forms.
- Evidence: verified live.

**PR-02 · S2 · F · everyone** — `public/js/bookSelector.js:30-43`; `views/status.html`
- Observed: when the book list fails to load the page shows "Hleður..." for ever.
- Evidence: verified live (simulated failure).

**PR-03 · S2 · B, F · everyone** — code only (reader, not re-checked):
- after the book is changed, "Kaflayfirlit" keeps the old book's chapter and its links
  (`status.html:735-739`);
- "Tímalína" is loaded once; after a book change "Hlaða fleiri" appends the new book's rows
  under the old ones (`:677-703`);
- a failed timeline request shows "Engin virkni fundin" (`:688-692`);
- the percent and "Samþ." column count approved edits only, while the badge and totals also
  count confirmed rows (`routes/status.js:995-1065`).

### 4.7 Úthlutanir (`/assignments`)

**AS-01 · S1 · D, B · head-editor, admin** — `public/js/assignments.js:171-195`;
`routes/admin.js:1141-1205`; `head-editor-t3/001-assignments-after-change.png`
- Observed: chapter 1 was assigned to editor A, then the dropdown was changed to editor B.
  The toast said "Úthlutun uppfærð", the dropdown still showed A, and the server held both.
  Choosing "— Óúthlutað —" removed B and left A; a second time removed A.
- Expected: the dropdown replaces the assignee, or the row shows everyone assigned.
- Why it matters: with enforcement on, the person the head editor replaced can still save.
- Fix: replace on change, or show assignees as removable tags.
- Evidence: verified live.

**AS-02 · S2 · A · head-editor, admin** — `routes/admin.js` (eligible editors);
`views/admin.html` ("Bókaheimildir")
- Observed: the dropdown lists only users who hold a book-access row for that book. Two
  editors with accounts did not appear until such rows existed. Neither page says so; the
  admin panel calls the same rows "Bókaheimildir" and says "Engir sérstakir bókaréttindi".
- Fix: list all active editors, or say under the table "Vantar yfirlesara? Stjórnandi bætir
  bók við notanda undir Notendur." *(needs native reading)*
- Evidence: verified live.

**AS-03 · S2 · D, F · head-editor** — `public/js/bookSelector.js`; `routes/admin.js:101`
- Observed: every book is offered. A book that is not the head editor's own shows "Villa:
  Insufficient permissions" in place of the table while the cards keep the previous book's
  numbers. Each page load also requests the AI-suggestion switch and gets a 403.
- Fix: list the head editor's own books.
- Evidence: verified live.

**AS-04 · S3 · E, G · admin** — `views/assignments.html:20-23`
- Observed: "Þvinga kaflaúthlutun" switches enforcement for the whole book on one click, with
  the toast "Kaflaúthlutun þvinguð" and no question. For a head editor the box is shown
  enabled with no explanation.
- Fix: ask first and say what it does: "Eftir þetta geta yfirlesarar aðeins vistað í köflum
  sem þeim er úthlutað." *(needs native reading)*
- Evidence: verified live.

**AS-05 · S2 · F · editor** — `routes/admin.js:1158-1168`
- Observed: assigning a chapter tells the editor nothing. No notification is created and
  Heim does not change (HM-01).
- Evidence: verified live for Heim; the missing notifier is code only (reader, not
  re-checked).

**AS-06 · S3 · B · head-editor, admin** — `routes/admin.js:1151, 1188`
- Observed: the assign and unassign routes reject any chapter above 30.
- Evidence: code only (read).

### 4.8 Stjórnandi (`/admin`)

**AD-01 · S3 · F · admin** — `views/admin.html` (add user, feedback status)
- Observed: adding a user and changing a report's status give no confirmation. The role list
  in the add dialog and the filter says "Kerfistjóri"; the table and edit panel say
  "Kerfisstjóri".
- Evidence: verified live.

**AD-02 · S3 · B, F · admin** — `views/admin.html` (Bækur tab);
`admin-tasks/005-admin-books.png`
- Observed: on a database whose catalogue was never synced, the Bækur tab reads "Engar bækur
  fundust" and the book list in a user's edit panel is empty, although seven books are
  registered and usable in the editor. Book access cannot be granted in that state.
- Fix: list registered books regardless of the catalogue.
- Evidence: verified live on the test database; production has a synced catalogue.

**AD-03 · S2 · B, C · admin** — code only (reader, two readers unless noted):
- the Tölfræði cards "Kaflar skoðaðir" and "Niðurhal" and the table "Virkasta efnið" read
  fields the server never sends, so they always show 0 and "Engin gögn"
  (`admin.html:1306-1321`);
- the edit panel says "Ef engir kaflar eru úthlutaðir hefur notandi aðgang að öllum köflum."
  without condition, which is false for a book with enforcement on (`:746, 785`);
- in "Breyta notanda", book access and chapters are saved on click while name, role and
  status wait for "Vista" (`:741-817`);
- in a reader report, "Svara" reads as a reply to the sender but only stores a note
  (`:509-515`; one reader);
- "↻ Endurgera" asks only "Viltu endurgera kaflaskipan fyrir þessa bók?" before downloading
  and overwriting a tracked data file (`:901, 993-1000`; one reader).

### 4.9 Bókasafn (`/library`)

Not walked live (see Method). All code only.

**BK-01 · S2 · B, F · head-editor, admin** — `views/books.html:2011-2013, 2440-2442`
- Observed: both chapter views request `GET /api/issues`, which no route provides, so the
  "Atriði" tab can only show "Villa við að hlaða atriði".
- Fix: remove the tab or restore the route.
- Evidence: mechanical (no such route) and code only (reader, two readers).

**BK-02 · S2 · E · head-editor, admin** — `views/books.html:992-1017, 2197-2218`
- Observed: "Birta MT", "Birta" and "Birta staðf." start a publication job on one click, with
  no question and no cancel.
- Fix: a confirmation that names the chapter and the track.
- Evidence: code only (reader, not re-checked). Not clicked.

**BK-03 · S2 · F · head-editor** — `views/books.html:2197-2249`
- Observed: when a publish request is refused the page shows only "Villa" or "Mistókst"; the
  server's reason is discarded. The buttons are shown for every book, though the server
  accepts a head editor only on their own books and holds Efnafræði for admins.
- Evidence: code only (reader, two readers).

**BK-04 · S2 · B, F · head-editor, admin** — `views/books.html:929-958, 2251-2260, 2771-2782`
- Observed: the three downloads point the whole tab at an API address, so a refusal replaces
  the application with a JSON document in English. "Sækja allt EN markdown" cannot succeed
  for any book in the repository.
- Evidence: code only (reader, two readers).

### 4.10 Ábendingar, Um mig, Innskráning, 404

**SP-01 · S3 · F · everyone** — `views/feedback.html`
- Observed: "Tegund athugasemdar" is required but not marked. "Senda endurgjöf" with a
  description and no type answers with a browser box, "Vinsamlegast veldu tegund
  athugasemdar". With an empty description the browser's own message appears, in English in
  the test browser.
- Fix: mark the field and show the message beside it.
- Evidence: verified live.

**SP-02 · S3 · B · everyone** — `public/js/bookSelector.js:89-103`; `views/feedback.html`
- Observed: "Bók (valfrjálst)" is never empty; the first or last-used book is pre-selected,
  so a report about nothing in particular is filed against a book.
- Evidence: verified live.

**SP-03 · S4 · C · signed-in users** — `views/feedback.html:324-329`
- Observed: the form asks a signed-in user for "Nafn (valfrjálst)" and "Netfang
  (valfrjálst)".
- Fix: fill them from the session or hide them.
- Evidence: verified live. Raised by the fresh-eyes reader.

**SP-04 · S2 · E · everyone** — `views/profile.html:89-90, 236-251`; `routes/profile.js`
- Observed: "Fullt nafn" can be edited and saving answers "Vistað", but the name in the
  sidebar does not change and is overwritten at the next sign-in.
- Evidence: code only (reader, not re-checked).

**SP-05 · no finding** — the 404 page is plain Icelandic with links back. Um mig for a guest
is clear.

### 4.11 Documentation drift (H)

**DO-01 · S3 · H** — `docs/onboarding.md` ("Last updated: March 2026")
- Tells new editors to "Navigate to `/localization`"; the menu does not offer it to editors
  and the editor guide says it is for head editors and admins (LO-02).
- "Click on the segment to edit it" (the UI has a "Breyta" button); "two-column layout" (four
  columns); categories as English codes (`terminology`, `accuracy`…); "Submit for Review",
  "Save All", "Bæta við orði" (the buttons read "Senda til yfirlestrar", "Vista allt", "Bæta
  við").
- "You can track your submissions in the reviews list": there is no such list (ED-08).
- Lists an "Unchanged" localization category that the UI does not have.

**DO-02 · S3 · H** — `docs/editor-guide/README.md`, `README.is.md`
- The nine screenshots are from March 2026, as the guide itself says.
  `screenshots/04-editor-segments.png` shows "Ritstjóri", "Yfirferðir", "Prófíll" and "Álit"
  where the menu now reads "Ritill", "Yfirlestrar", "Um mig" and "Ábendingar", and has no
  "✓ Staðfesta MT".
- "Submitting for Review" describes "Senda til yfirlestrar" as the step that sends edits to
  the head editor. Live, saved edits were reviewable without it and a second use fails
  (ED-07).
- "An edit that has a discussion cannot be deleted": the UI has no control that deletes an
  edit.
- Describes the tab "Yfirlestur á staðfæringu" as working (LO-01).
- The Icelandic version heads one section "Pass 1: Ritill" and the next "Áfangi 2:
  Staðfærsluritill".
- The rest of the text matched the live UI.

**DO-03 · S3 · H** — `docs/editorial/pass2-localization.md`
- Describes a file workflow: "Open the localization review UI at
  `http://localhost:3000/localization-review`", start from `03-faithful-translation/`, "Save
  to `04-localized-content/ch##/`", a log template, and a DOCX route. It does not describe
  the web editor.

**DO-04 · S3 · H** — `docs/editorial/terminology.md`
- Says the CSV files under `books/*/glossary/` are "the authoritative source for approved
  terminology" and tells editors to add terms to the CSV. One path names `books/liffraedi/`
  (the slug is `liffraedi-2e`). The UI's route is Orðasafn (and see TE-03).

**DO-05 · S3 · H** — `docs/editorial/pass1-linguistic.md`
- Sends editors to `/segment-editor` and reviewers to `/review-queue`. Both redirect; the
  second lands on `/editor` without the reviews view.

**DO-06 · S4 · H** — `docs/testing/manual-test-plan-editors.md` (2026-03-12)
- Names the pages "Ritstjóri" and "Staðfærsla"; a filter change "Allt → Klárað" (the options
  are now "Allir hlutar", "Með breytingum", "Bíður yfirlestrar", …); the dialog text "Opin
  klippispjöld verða lokuð...". Its note that modules without Pass 1 are "unclickable"
  matches LO-03 and is the only place that says so.

---

## 5. The fresh-eyes teacher pass

A separate reader was given 28 screenshots with the visible text of each page and the pop-up
messages, and nothing else: no code, no documents, no project instructions, none of the
findings above. It was asked to answer as an Icelandic chemistry teacher on their first day.
This section reports its answers; 5.5 says where they differ from section 4.

Three things in its answers come from the test set-up, not from the product: screens 04 and
05 were taken from two different books, so it believed it had opened the wrong chapter; the
reviewer's test question was attached to a title row; and a test account's "e-mail address"
was the string "test-viewer".

### 5.1 What stopped it, most serious first (its order)

1. **"I don't know whether I'm publishing to students."** "Staðfesta MT" on every row,
   "Innsetja + Birta", "Vista + Birta", "Samþykkt", "Staðfest", "Vistað", "Bíður": it could
   not tell which makes text final or public, or what can be undone.
2. **Landing in the wrong place.** A book it did not choose was pre-selected on every page.
3. **Nobody says what the job is.** The front page says everything is finished on day one; a
   guest gets the same congratulations.
4. **Rejections and comments are not tied to rows.** Comments name no sentence, "Laga" does
   not go to the row, the rejected row shows no reason.
5. **Error messages in English or jargon**, none saying whether the typed text survived.
6. **The editor page is overloaded**: search, preview, figure panels, seven counters and
   three filters before the first sentence; for the head editor the ✓ and ✗ buttons sit
   below "a wall of publishing controls".
7. **English and code labels everywhere**: "TITLE", "ABSTRACT-ITEM", "MT", "Pass 1/Pass 2",
   "m68664", "POS", "faithful/localized", the activity line.
8. **The "other tab" banner and the "another reviewer changed this" box** made it think
   someone was overwriting it; "Hunsa" felt like gambling.
9. **A term cannot be corrected.** It expected "Breyta orðhausu" to edit the English
   headword and found no "edit translation".
10. **Dead ends**: the module that does nothing in Aðlögun, "Vantar Pass 1" with no
    explanation, a guest's empty chapter list, the theme button without a label, unreadable
    text in the dark theme.

### 5.2 What it found clear

- The side-by-side table, English left and Icelandic right, with a plain "Breyta" button:
  "exactly how I'd want to check a translation".
- The status line ("● 1 óvistuð breyting" to "Allar breytingar vistaðar Síðast vistað:
  14:05") and the green "Vistað" in the row.
- The term popup on underlined words and the "fannst ekki" note under a paragraph.
- The 404 page and the "Þú ert gestur" page.

### 5.3 Questions it would ask a colleague before continuing

- Which book, chapter and sections are mine?
- What exactly does "Staðfesta MT" do, should I press it on every row I have read, and can
  it be undone?
- What is the difference between "Vistað", "Bíður", "Samþykkt", "Staðfest" and "Hafnað", and
  when does text reach students?
- When do I press "Senda til yfirlestrar", and who receives it?
- Must I choose a "Flokkur"? What does "Beita víðar" change, and where?
- What are "Pass 1" and "Pass 2", and why can I open nothing in Staðfærsla?
- When a change is rejected, where do I see why, and is my text gone?
- Is the "opin í öðrum flipa" warning about me or someone else?
- Are the terms I add proposals or final, and how do I fix a mistake in one?
- Who is "umsjónarmaður verkefnisins"?
- As head editor: does ✓ publish, and must I ever press "Innsetja", "Birta" or "Rás"?

### 5.4 How it answered the pop-up boxes

| Message | Its reading | Its answer |
|---|---|---|
| "Opnum klippispjöldum verður lokað. Viltu halda áfram?" (three times) | "klippispjöld makes me think of clipboards"; guesses other edit boxes close | Cancel; expects OK to lose the text |
| "Fundust 1 óvistuð drög frá síðustu lotu. Endurheimta?" | Something unsaved was found | OK; unsure whether Cancel deletes it |
| "Villa: Module already has a pending review" | "English, mid-way through Icelandic"; cannot send again | OK; "no idea what to do next" |
| "Annar yfirlesari (…) hefur breytt þessum bút. Endurhlaðið…" | Someone else changed the row | Copy the text somewhere safe first; expects a reload to discard it |
| "Villa við að vista: You are not assigned to chapter 1 of __e2e-fixture__" | Not allowed to edit this chapter | OK; expects the text is lost; "why did the system let me open and edit it?" |
| "Server villa (500) — reyni aftur", then "Vista mistókst eftir 3 tilraunir — textinn var geymdur…" | Saving failed, text kept | OK; "geymdur where?" |
| "Villa: Failed to add translation" | The word was not added | OK; no reason, no advice |

Its notes on Icelandic wording are folded into section 6 (copy column) and into ED-15,
LO-05, TE-07 and PR-01. It also flagged three chapter titles and several phrases in the
machine translation itself ("Varmefnafræði", "Stökkfræði efnahvarfa", "höggvuðu"); those are
content, not interface, and are outside this audit.

### 5.5 Where the two passes disagree

| Topic | Section 4 | Fresh-eyes reader |
|---|---|---|
| What matters most | Lost text (ED-01 to ED-05) first | Fear of publishing by accident first; it did not rank lost text, because a screenshot cannot show text disappearing |
| "✓ Staðfesta MT" | Not a finding before this pass | A top worry: vouching for the machine translation in one click, undo unknown. Added as ED-13 |
| The head editor's front page | Recorded as pointing the way | Contradictory: "Engin verkefni í dag – vel gert!" above "3 breytingar bíða úrskurðar þíns"; "úrlausnir" misread. Added as HM-10 |
| Overload of the editor page | A note on jargon (SH-06) | A blocker in its own right. Added as ED-12, and ED-11 raised |
| "Breyta orðhausu" | The dialog drops fields (TE-01) | It would not have tried the dialog for this at all: it reads the label as "edit the English headword". Both hold; the label is a second defect |
| The other-tab banner | Works as designed; warns | Read as "someone else is in my text"; it cannot tell whose tab |
| The pre-selected book | A small point (SP-02, ED-17) | Its second-biggest obstacle. Partly the test book, but the pre-selection is real |
| Keyboard access, contrast figures, "Skoða sem" | Findings | Not visible to it |
| The term popup and status line | Not remarked on | Named as the best parts of the interface |

---

## 6. UI terminology table

One row per concept, with every name found for it. "Seen live" unless marked (code) or
(docs).

| Concept | Names in use | Where | Note |
|---|---|---|---|
| The application | Námsbókasafn; Ritstjórnarumhverfi; "Ritstjórnarumhverfi fyrir OpenStax kennslubækur"; Ritstjóri (docs, repository) | logo, sidebar, login, docs | |
| The front page | Heim; Mælaborð (docs, IS); Dashboard (docs) | menu, guide | |
| The segment editor | Ritill; "Velja einingu til að ritstýra"; Ritstjóri (old screenshots, test plan); textaritill (docs, IS) | menu, heading, docs | |
| One unit of text | bútur ("72 bútar", "þessum bút"); hluti ("Allir hlutar" filter); segment (docs) | editor, filters | "hluti" has three meanings, see next rows |
| A module | eining ("Einingar í kafla", "Hleður einingu"); hluti ("Kafli 1, hluti m68664" on Heim); the id itself ("m68664", "K1/m68664") | editor, Heim | |
| A section | Hluti (Ábendingar "t.d. 1-1"; Aðlögun review tab; Bókasafn "Hlutar") | forms | |
| A chapter | Kafli N; K1; "K1.0" (Tölfræði); Viðaukar | everywhere | |
| Machine translation | MT; vélþýðing; "MT — vélþýðing"; "MT forskoðun" | badges, header, panels | |
| Reviewed translation | Bein þýðing (faithful); Trú þýðing (Pass 1); "Ritstýrt — bein þýðing"; Yfirlesið; Pass 1; "Yfirlestur 1" (code); Áfangi (docs, IS) | panels, Aðlögun, badges | five names |
| Localization | Aðlögun (menu); Staðfærsla; Staðfærsluritill; staðfæring ("Yfirlestur á staðfæringu"); Staðfært; "(localized)"; Pass 2 | menu, tabs, badges | menu and page disagree |
| Review | Yfirlestur ("Senda til yfirlestrar", "Bíður yfirlestrar"); Yfirlestrar (menu); yfirferð ("Yfirferðarröð", "Yfirferð mynda"); úrskurður ("bíða úrskurðar þíns"); úrlausnir; "Þarfnast skoðunar" | menu, Heim, Orðasafn, Framvinda | six words |
| Save a correction | Vista | editor row | |
| Write approved edits to files | "Vista í skrár"; "samþykktar breytingar til að vista" | head editor's panel | a second meaning of "vista" |
| Build pages | Birta ("Breyta CNXML í HTML"); "Vista + Birta"; Innsetja; "Innsetja + Birta" | head editor's panels | |
| Publish a chapter | Birta; Birta MT; "Birta staðf." (code) | Bókasafn | a second meaning of "birta" |
| Confirm that MT is right | "Staðfesta MT"; Staðfest; "Staðfesta vélþýðingu" (code comment) | editor row | easily confused with the next row |
| Approve an edit | Samþykkja; Samþykkt; ✓ | reviewer's buttons, chips | |
| Waiting | Bíður (chip); "Í bið" (Orðasafn); "Bíður yfirlestrar"; "awaiting review" (Framvinda) | chips, lists | |
| Discussion | Ræða (button title); Umræða (chip, dialog); "Í umræðu" (filter); "Til umræðu" (Orðasafn); "in discussion" (Framvinda) | editor, Orðasafn, Framvinda | |
| Editor role | Yfirlesari (admin, preview, login, "Annar yfirlesari"); ritstjóri (guide: "Þitt hlutverk sem ritstjóri", "hjá öllum ritstjórum") | admin, messages, docs | the guide and the UI use different words for the teacher |
| Head-editor role | Aðalritstjóri | everywhere | consistent |
| Admin role | Stjórnandi (menu, preview, login); Kerfisstjóri (admin table, login); Kerfistjóri (admin lists) | admin, login | one is a typo |
| Viewer role | Áhorfandi (preview, login); Lesandi (admin); gestur (Um mig, toast) | admin, login, profile | |
| Terminology | Orðasafn (menu); hugtak ("Fletta upp hugtaki", category "Hugtök"); orð ("Bæta við orði", "Engin orð fundust"); íðorð ("Gera að íðorði"); orðhaus ("Breyta orðhausu"); Orðatillögur (Heim) | Orðasafn, editor, Heim | five words |
| Feedback | Ábendingar (menu); Endurgjöf ("Endurgjöf / Feedback", admin tab, "Senda endurgjöf"); athugasemd ("Tegund athugasemdar"); Álit (old screenshots) | menu, form, admin | |
| Assignment | Úthlutanir (menu); Kaflaverkefni (admin panel); úthlutun; "Þvinga kaflaúthlutun" | menu, admin | |
| Optional | valkvætt; valkvæð; valfrjálst; "valfrálst" (typo) | forms | |

Copy to correct, with suggestions *(all need native reading)*:

| On screen | Suggested |
|---|---|
| "72 bútar · 72 þýddar" | "72 bútar · 72 þýddir" |
| "0/72 bútar breytt" | "0 af 72 bútum breytt" |
| "Athugasemd (valkvætt)" | "Athugasemd (valkvæð)" |
| "Allar bútur" | "Allir bútar" |
| "1 samþykktar breytingar"; "Senda 1 breytingar"; "1 einingar bíða"; "Niðurstöður (1 orðhausar)" | singular forms |
| "Engin niðurstöður" | "Engar niðurstöður" |
| "Breytingar gætu skrifað yfir hvort annað" | "Breytingar gætu skrifast hver yfir aðra" |
| "Opnum klippispjöldum verður lokað" | see ED-03 |
| "Fundust 1 óvistuð drög frá síðustu lotu. Endurheimta?" | "Óvistuð drög fundust frá síðustu heimsókn. Viltu endurheimta þau?" |
| "Endurhlaðið til að sjá nýjustu útgáfu" | "Endurhladdu síðuna til að sjá nýjustu útgáfu" (the rest of the UI says "þú") |
| "Server villa (500) — reyni aftur" | "Villa á netþjóni — reyni aftur…" |
| "Vista mistókst eftir 3 tilraunir" | "Vistun mistókst eftir 3 tilraunir" |
| "Breyta orðhausu" | "Breyta færslu" or "Breyta uppflettiorði" |
| "Allir upprunar" | "Allur uppruni" |
| "Skoða úrlausnir" | "Fara yfir breytingar" |
| "✓ Staðfesta MT" | "✓ Staðfesta vélþýðingu" |
| "Tillaga að bætingu" | "Tillaga að úrbótum" |
| "Endurgjöf / Feedback" | "Ábendingar" (as the menu) |
| "Kerfistjóri" | "Kerfisstjóri" |
| "(valfrálst)" | "(valfrjálst)" |

---

## 7. Simplification proposals for the editor role

Nothing below removes something an editor needs.

**Hide for editors**

- The "Tegund" column, or show Icelandic words in it (SH-06).
- "EN" and "MT" badges on module cards; show a progress count instead.
- The figure panel "Myndatexti til yfirlestrar", unless the editor is reviewing figures
  (ED-12).
- The preview track list ("MT | Bein þýðing"); preview what is on the screen.
- "Lífræn efnafræði" and any book not open for editing, in every book list (ED-17).
- In Orðasafn: "Flytja inn", the "Uppruni" filter, the review queue's source and subject
  filters, the counters row, "Orðflokkur (POS)" (TE-06, TE-07).
- "Yfirlestrar" in the menu, until it lists something (ED-08).
- "Stillingar" on Heim, until notifications are shown somewhere (SH-04).
- "Tímalína" on Framvinda; show the editor's own chapters first.

**Merge**

- "Vista" and "Senda til yfirlestrar": if a saved edit is already reviewable, one action is
  enough (ED-07).
- "Einbeitt sýn" and "Nákvæmt yfirlit" on Heim into one list: my chapters, what came back to
  me, what is waiting (HM-01 to HM-04).
- The three words for optional, the five for terminology, the six for review (section 6).
- "Hætta við" and "↩ Endurstilla" in the row: one "Hætta við" that asks when text changed.

**Remove**

- The tile and card "Orðatillögur" while they cannot count (HM-05).
- "Aðrar þýðingar" in the term dialog while it is not saved (TE-04).
- The tab "Yfirlestur á staðfæringu" while its list cannot load (LO-01), and "Atriði" in
  Bókasafn (BK-01).
- Name and e-mail fields in Ábendingar for a signed-in user (SP-03).

**Move away from the editing page (head editors and admins)**

- "Vista í skrár", "Vista + Birta", "Útgáfusaga" and "Ferill (innsetja → birta)" to a
  separate "Útgáfa" tab (ED-11).

**Add one line of help where a teacher has to guess**

- On Heim: where to start (HM-01).
- In the row: "Flokkur" is optional; what "Staðfesta" means (ED-13).
- In Aðlögun: why a module cannot be opened (LO-03).
- On every page for a guest: that they are a guest and whom to write to (SH-12).

---

## 8. Proposed register entries (draft text only)

Drafts for the project lead to accept, change or drop. None has been written to
`docs/plans/`. Ids are placeholders.

1. **IA-1 · Unsaved text in the segment editor.** Four ways to lose typed text without a
   warning: "← Til baka", a save conflict answered with OK, Escape, and a stale second tab
   (ED-01 to ED-05). One model for "this row has unsaved text" is needed: ask once, in the
   page, and never close a dirty row on a re-render. Includes the status line reading "Allar
   breytingar vistaðar" after a discard. Evidence: verified live.
2. **IA-2 · Chapter assignment replaces nobody.** Changing the assignee adds a hidden second
   one, and "— Óúthlutað —" removes the wrong person (AS-01). Decide between one assignee per
   chapter and a visible list. Also: who appears in the dropdown, and why (AS-02). Evidence:
   verified live.
3. **IA-3 · Orðasafn edit and add dialog.** "Breyta orðhausu" drops most of its fields;
   "Vista" stays wired to add-translation after a cancel; "Aðrar þýðingar" is discarded; no
   control corrects or removes a translation (TE-01, TE-02, TE-04). Evidence: verified live.
4. **IA-4 · A front page that tells an editor where to start.** Show assignments; replace
   "Þú hefur lokið öllum verkefnum" for users with nothing assigned and for guests; separate
   a reviewer's question from a rejection; link "Laga" to the row (HM-01 to HM-04, SH-12).
   Evidence: verified live.
5. **IA-5 · The review loop.** "Senda til yfirlestrar" is one-shot and reviews never close;
   "Yfirlestrar" is not a queue; the rejection reason is not on the row; notifications are
   never shown (ED-07 to ED-09, SH-04). Needs a decision on whether sending is a step at
   all. Evidence: verified live.
6. **IA-6 · Error messages.** Stable error codes from the server, Icelandic text on the
   client, no `err.message` in `error`; JSON 404 for unknown API paths; sign-in failures back
   to `/login` (SH-03, SH-05, SH-14). Evidence: verified live and mechanical.
7. **IA-7 · Localization: who, and through which door.** Menu, server and documents disagree
   on whether editors localize; no module opens without a faithful file and the page does not
   say so; the review tab calls a missing route; eight save-path claims are untested because
   nothing can be opened (LO-01 to LO-04). Evidence: live for the first three, code only for
   the rest.
8. **IA-8 · Names instead of identifiers.** Section titles for modules, book titles for
   slugs, Icelandic for type codes and for the three English phrases on Framvinda; one word
   each for review, terminology, localization and "optional" (SH-06, PR-01, section 6).
   Evidence: verified live.
9. **IA-9 · Editing page for reviewers.** Move the file and pipeline panels off the review
   page; explain "Staðfesta MT"; collapse the panels above the table (ED-11 to ED-13).
   Evidence: verified live; weight from the fresh-eyes pass.
10. **IA-10 · Accessibility basics.** Dark-theme edit box; module, book and chapter cards
    from the keyboard; focus after save; muted-text contrast; Framvinda and the theme
    (ED-10, SH-08 to SH-10). Evidence: verified live.
11. **IA-11 · "Skoða sem".** Either make the four pages honour the preview or label what it
    covers (SH-01). Evidence: verified live.
12. **IA-12 · Editor-facing documents.** `docs/onboarding.md`, the editor guide's
    screenshots and three passages, `pass2-localization.md`, `terminology.md` (DO-01 to
    DO-06). Evidence: read against the live UI.
13. **IA-13 · Re-check the untested claims.** 478 reader flags were not re-checked (A8), and
    Bókasafn and localization saving could not be walked live. A second pass needs a test
    database with a synced catalogue and at least one module with a faithful file.
14. **IA-SEC · Three withheld findings.** Handed over privately; to be entered by the project
    lead in whatever form suits a public repository.

---

## Appendix

### A1. Every API endpoint and its UI caller

Auth level is read from the middleware named on the route; checks inside handlers are not shown. "UI caller" is the first client call site found.

| Method | Path | Auth (middleware) | UI caller |
|---|---|---|---|
| GET | `/api/activity` | head-editor | `views/books.html:2095` +1 |
| GET | `/api/activity/recent` | head-editor | **none** |
| GET | `/api/activity/user/:userId` | head-editor | **none** |
| GET | `/api/activity/book/:book` | head-editor of the book | **none** |
| GET | `/api/activity/section/:book/:chapter/:section` | login | **none** |
| GET | `/api/activity/my` | login | **none** |
| GET | `/api/activity/types` | login | **none** |
| GET | `/api/admin/catalogue` | admin | `views/admin.html:879` +1 |
| GET | `/api/admin/catalogue/predefined` | admin | **none** |
| POST | `/api/admin/catalogue/sync` | admin | `views/admin.html:909` +1 |
| POST | `/api/admin/catalogue/add` | admin | `views/admin.html:978` |
| POST | `/api/admin/books/register` | admin | `views/admin.html:941` +1 |
| POST | `/api/admin/books/:slug/fetch-source` | admin | `views/admin.html:1062` |
| GET | `/api/admin/books` | editor | `public/js/localization-editor.js:1804` +2 |
| GET | `/api/admin/books/data-status` | admin | **none** |
| GET | `/api/admin/books/:slug` | editor | `views/books.html:1729` |
| GET | `/api/admin/books/:slug/chapters/:chapter` | editor | `views/books.html:1917` |
| POST | `/api/admin/books/:slug/generate-data` | admin | `views/admin.html:996` |
| GET | `/api/admin/users` | admin | `views/admin.html:661` +1 |
| GET | `/api/admin/users/roles` | admin | **none** |
| GET | `/api/admin/users/:id` | admin | **none** |
| POST | `/api/admin/users` | admin | `views/admin.html:729` |
| PUT | `/api/admin/users/:id` | admin | `views/admin.html:830` +1 |
| DELETE | `/api/admin/users/:id` | admin | **none** |
| POST | `/api/admin/users/:id/books` | admin | `views/admin.html:767` |
| DELETE | `/api/admin/users/:id/books/:bookSlug` | admin | `views/admin.html:774` |
| GET | `/api/admin/users/:id/chapters` | admin | `views/admin.html:784` |
| POST | `/api/admin/users/:id/chapters` | admin | `views/admin.html:805` |
| DELETE | `/api/admin/users/:id/chapters/:book/:chapter` | admin | `views/admin.html:813` |
| GET | `/api/admin/assignments/:book` | head-editor of the book | `public/js/assignments.js:316` |
| POST | `/api/admin/assignments/:book/enforcement` | admin | `public/js/assignments.js:393` |
| GET | `/api/admin/books/:book/suggestion-view` | admin | `public/js/assignments.js:234` +1 |
| POST | `/api/admin/books/:book/suggestion-view` | admin | `public/js/assignments.js:250` |
| POST | `/api/admin/assignments/:book/:chapter` | head-editor of the book | `public/js/assignments.js:178` +1 |
| DELETE | `/api/admin/assignments/:book/:chapter` | head-editor of the book | `public/js/assignments.js:188` |
| GET | `/api/admin/migrate` | admin | **none** |
| POST | `/api/admin/migrate` | admin | `views/admin.html:851` +1 |
| GET | `/api/admin/validate-pipeline` | admin | **none** |
| GET | `/api/analytics/stats` | head-editor | `views/admin.html:1289` |
| GET | `/api/analytics/recent` | head-editor | `views/admin.html:1290` |
| POST | `/api/analytics/event` | optional | **none** |
| GET | `/api/analytics/dashboard-data` | head-editor | **none** |
| GET | `/api/auth/status` | NO AUTH | **none** |
| GET | `/api/auth/login` | NO AUTH | `views/login.html:169 (link)` +1 |
| GET | `/api/auth/callback` | NO AUTH | **none** |
| GET | `/api/auth/me` | optional | `public/js/layout.js:605` +2 |
| POST | `/api/auth/logout` | NO AUTH | `public/js/layout.js:540` |
| GET | `/api/auth/roles` | NO AUTH | **none** |
| GET | `/api/books/list` | NO AUTH | `public/js/bookSelector.js:30` |
| GET | `/api/books` | login | **none** |
| GET | `/api/books/:bookId` | login | `public/js/bookSelector.js:30` +2 |
| GET | `/api/books/:bookId/chapters/:chapter` | login | **none** |
| GET | `/api/books/:bookId/download` | login | `views/books.html:2253 (navigation)` +1 |
| GET | `/api/books/:book/chapters/:chapter/faithful-count` | login + requireBookAccess() | **none** |
| GET | `/api/feedback/types` | NO AUTH | **none** |
| POST | `/api/feedback` | optional | `views/feedback.html:401` |
| GET | `/api/feedback` | head-editor | `views/admin.html:1161` |
| GET | `/api/feedback/stats` | head-editor | `views/admin.html:1140` |
| GET | `/api/feedback/open` | head-editor | **none** |
| GET | `/api/feedback/:id` | head-editor | `views/admin.html:1140` +1 |
| POST | `/api/feedback/:id/status` | head-editor | `views/admin.html:1231` |
| POST | `/api/feedback/:id/resolve` | head-editor | `views/admin.html:1263` |
| POST | `/api/feedback/:id/priority` | head-editor | `views/admin.html:1239` |
| POST | `/api/feedback/:id/assign` | head-editor | **none** |
| POST | `/api/feedback/:id/respond` | head-editor | `views/admin.html:1251` |
| GET | `/api/localization-editor/settings/:book` | editor | **none** |
| POST | `/api/localization-editor/settings/:book` | admin | **none** |
| GET | `/api/localization-editor/review-queue/:book` | head-editor of the book | **none** |
| POST | `/api/localization-editor/loc-edit/:editId/approve` | head-editor of the book | `public/js/localization-editor.js:662` |
| POST | `/api/localization-editor/loc-edit/:editId/reject` | head-editor of the book | `public/js/localization-editor.js:662` |
| GET | `/api/localization-editor/:book/chapters` | editor | `public/js/localization-editor.js:353` |
| GET | `/api/localization-editor/:book/:chapter` | editor | `public/js/localization-editor.js:353` +1 |
| GET | `/api/localization-editor/:book/:chapter/:moduleId` | editor | `public/js/localization-editor.js:482` +1 |
| POST | `/api/localization-editor/:book/:chapter/:moduleId/save` | login + requireBookAccess() | `public/js/localization-editor.js:1018` |
| POST | `/api/localization-editor/:book/:chapter/:moduleId/save-all` | login + requireBookAccess() | `public/js/localization-editor.js:166, 1135` |
| GET | `/api/localization-editor/:book/:chapter/:moduleId/pending-edits` | editor | `public/js/localization-editor.js:582` |
| GET | `/api/localization-editor/:book/:chapter/:moduleId/history` | editor | `public/js/localization-editor.js:495` +2 |
| GET | `/api/localization-editor/:book/:chapter/:moduleId/:segmentId/history` | editor | `public/js/localization-editor.js:1650` |
| GET | `/api/localization-editor/:book/:chapter/:moduleId/versions` | editor | `public/js/localization-editor.js:1290` |
| GET | `/api/localization-editor/:book/:chapter/:moduleId/versions/:version` | editor | **none** |
| GET | `/api/localization-editor/:book/:chapter/:moduleId/version-history/:segmentId` | editor | **none** |
| POST | `/api/localization-editor/:book/:chapter/:moduleId/restore/:version` | login + requireHeadEditorGuard | `public/js/localization-editor.js:1351` |
| POST | `/api/localization-editor/:book/:chapter/:moduleId/log` | editor | `public/js/localization-editor.js:2387` |
| GET | `/api/my-work` | login | `views/my-work.html:1368` |
| GET | `/api/my-work/today` | login | `views/my-work.html:1123` |
| GET | `/api/my-work/summary` | login | **none** |
| GET | `/api/notifications` | login | **none** |
| GET | `/api/notifications/count` | login | **none** |
| POST | `/api/notifications/:id/read` | login | **none** |
| POST | `/api/notifications/read-all` | login | **none** |
| GET | `/api/notifications/preferences` | login | `views/my-work.html:1811` |
| PUT | `/api/notifications/preferences` | login | `views/my-work.html:1858` |
| GET | `/api/pipeline-status/:bookSlug/:chapterNum` | login | **none** |
| POST | `/api/pipeline-status/:bookSlug/:chapterNum/advance` | admin | **none** |
| POST | `/api/pipeline-status/:bookSlug/:chapterNum/revert` | admin | **none** |
| POST | `/api/pipeline-status/:bookSlug/:chapterNum/lock` | editor | **none** |
| DELETE | `/api/pipeline-status/:bookSlug/:chapterNum/lock` | editor | **none** |
| POST | `/api/pipeline/inject` | head-editor of the book | `public/js/segment-editor.js:3583` |
| POST | `/api/pipeline/render` | head-editor of the book | `public/js/segment-editor.js:3583` |
| POST | `/api/pipeline/run` | head-editor of the book | `public/js/segment-editor.js:3583` |
| GET | `/api/pipeline/jobs` | head-editor | **none** |
| GET | `/api/pipeline/jobs/:jobId` | head-editor | `public/js/segment-editor.js:3646` +3 |
| GET | `/api/profile` | login | `views/profile.html:187` |
| PUT | `/api/profile` | login | `views/profile.html:232` |
| GET | `/api/publication/:bookSlug/:chapterNum/status` | login | **none** |
| GET | `/api/publication/:bookSlug/:chapterNum/readiness` | login | **none** |
| GET | `/api/publication/:bookSlug/:chapterNum/modules` | login | **none** |
| POST | `/api/publication/:bookSlug/:chapterNum/mt-preview` | head-editor of the book | `views/books.html:2211` |
| POST | `/api/publication/:bookSlug/:chapterNum/faithful` | head-editor of the book | `views/books.html:2211` |
| POST | `/api/publication/:bookSlug/:chapterNum/localized` | head-editor of the book | `views/books.html:2211` |
| GET | `/api/publication/:bookSlug/overview` | login | **none** |
| GET | `/api/research/consent` | login | **none** |
| POST | `/api/research/consent` | login | **none** |
| POST | `/api/research/consent/withdraw` | login | **none** |
| GET | `/api/sections/:sectionId` | editor | `public/js/localization-editor.js:1903` |
| POST | `/api/sections/:sectionId/assign-reviewer` | head-editor of the book | **none** |
| POST | `/api/sections/:sectionId/assign-localizer` | head-editor of the book | **none** |
| POST | `/api/sections/:sectionId/status` | editor | **none** |
| POST | `/api/sections/:sectionId/submit-review` | editor | **none** |
| POST | `/api/sections/:sectionId/approve-review` | head-editor of the book | **none** |
| POST | `/api/sections/:sectionId/request-changes` | head-editor of the book | **none** |
| GET | `/api/segment-editor/terminology/lookup` | editor | `public/js/segment-editor.js:4188` |
| GET | `/api/segment-editor/concordance` | editor | `public/js/segment-editor.js:1277` |
| GET | `/api/segment-editor/reviews/:reviewId` | editor | **none** |
| GET | `/api/segment-editor/edit/:editId/comments` | editor | `public/js/segment-editor.js:3028` |
| GET | `/api/segment-editor/:book/chapters` | editor | `public/js/assignments.js:319` +1 |
| GET | `/api/segment-editor/:book/:chapter` | editor | `public/js/assignments.js:319` +5 |
| GET | `/api/segment-editor/:book/:chapter/repetition-report` | head-editor of the book | `public/js/segment-editor.js:1416` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId` | editor | `public/js/segment-editor.js:600` +2 |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/edit` | login + requireBookAccess() | `public/js/segment-editor.js:2763 (saveRetry)` |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/suggestions/reject` | login + requireBookAccess() | `public/js/segment-editor.js:1866` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/figures` | editor | `public/js/segment-editor.js:819` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/figures/:basename/image` | editor | `public/js/segment-editor.js:1104 (img.src = server-supplied imageUrl)` |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/figures/:basename/block` | login + requireBookAccess() | `public/js/segment-editor.js:1182` |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/figures/:basename/state` | login + requireBookAccess() | `public/js/segment-editor.js:1203` |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/accept` | login + requireBookAccess() | `public/js/segment-editor.js:2418` |
| POST | `/api/segment-editor/acceptance/:id/revoke` | editor | `public/js/segment-editor.js:2492` |
| DELETE | `/api/segment-editor/edit/:editId` | editor | **none** |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/submit` | login + requireBookAccess() | `public/js/segment-editor.js:3117` |
| GET | `/api/segment-editor/reviews` | editor | **none** |
| GET | `/api/segment-editor/review-queue` | editor | **none** |
| POST | `/api/segment-editor/edit/:editId/approve` | head-editor of the book | `public/js/segment-editor.js:2943` |
| POST | `/api/segment-editor/edit/:editId/reject` | head-editor of the book | `public/js/segment-editor.js:2943` |
| POST | `/api/segment-editor/edit/:editId/discuss` | head-editor of the book | `public/js/segment-editor.js:2943` |
| POST | `/api/segment-editor/edit/:editId/unapprove` | head-editor of the book | `public/js/segment-editor.js:3076` |
| POST | `/api/segment-editor/edit/:editId/return-to-pending` | head-editor of the book | `public/js/segment-editor.js:3091` |
| POST | `/api/segment-editor/reviews/:reviewId/complete` | head-editor of the book | **none** |
| POST | `/api/segment-editor/edit/:editId/comment` | editor | `public/js/segment-editor.js:3056` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/terms` | editor | `public/js/segment-editor.js:665` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/repetitions` | editor | `public/js/segment-editor.js:687` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/propagation-preview` | editor | `public/js/segment-editor.js:2895` |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/propagate` | editor | `public/js/segment-editor.js:2904` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/terminology-report` | editor | `public/js/segment-editor.js:1328` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/spellcheck` | editor | `public/js/segment-editor.js:1382` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/stats` | editor | **none** |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/apply-status` | editor | `public/js/segment-editor.js:3775` |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/apply` | head-editor of the book | `public/js/segment-editor.js:3838` |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/apply-and-render` | head-editor of the book | `public/js/segment-editor.js:3867` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/versions` | editor | `public/js/segment-editor.js:3971` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/versions/:version` | editor | **none** |
| POST | `/api/segment-editor/:book/:chapter/:moduleId/restore/:version` | head-editor of the book | `public/js/segment-editor.js:4033` |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/segment-history/:segmentId` | editor | **none** |
| GET | `/api/segment-editor/:book/:chapter/:moduleId/preview` | editor | `public/js/segment-editor.js:3713` |
| GET | `/api/status/dashboard` | login | `views/my-work.html:1503` |
| GET | `/api/status/activity/timeline` | login | `views/status.html:683` |
| GET | `/api/status/activity/types` | login | **none** |
| GET | `/api/status/analytics` | login | **none** |
| GET | `/api/status/meeting-agenda` | head-editor | **none** |
| GET | `/api/status/:book/editorial-progress` | login | `views/status.html:474` |
| GET | `/api/status/:book` | login | `views/my-work.html:1503` |
| GET | `/api/status/:book/summary` | login | **none** |
| GET | `/api/status/:book/:chapter` | login | `views/books.html:2123` +3 |
| GET | `/api/status/:book/:chapter/sections` | login | **none** |
| GET | `/api/status/:book/scan` | login | **none** |
| POST | `/api/status/:book/sync` | admin | **none** |
| POST | `/api/status/:book/:chapter/sync` | admin | **none** |
| POST | `/api/suggestions/scan/:sectionId` | login + requireBookAccessForSection(bySectionParam) | `public/js/localization-editor.js:2126` |
| POST | `/api/suggestions/scan-book/:bookSlug` | head-editor of the book | **none** |
| GET | `/api/suggestions/patterns` | login | **none** |
| GET | `/api/suggestions/:sectionId` | login + requireBookAccessForSection(bySectionParam) | `public/js/localization-editor.js:1991` |
| GET | `/api/suggestions/:sectionId/stats` | login + requireBookAccessForSection(bySectionParam) | **none** |
| POST | `/api/suggestions/:id/accept` | login + requireBookAccessForSection(bySuggestionParam) | `public/js/localization-editor.js:2142` |
| POST | `/api/suggestions/:id/reject` | login + requireBookAccessForSection(bySuggestionParam) | `public/js/localization-editor.js:2154` |
| POST | `/api/suggestions/:id/modify` | login + requireBookAccessForSection(bySuggestionParam) | `public/js/localization-editor.js:2187` |
| POST | `/api/suggestions/:sectionId/bulk` | login + requireBookAccessForSection(bySectionParam) | `public/js/localization-editor.js:2219` +1 |
| POST | `/api/suggestions/:sectionId/sync-log` | login + requireBookAccessForSection(bySectionParam) | `public/js/localization-editor.js:2275` |
| GET | `/api/terminology` | login | `views/terminology.html:1668` |
| GET | `/api/terminology/lookup` | login | **none** |
| GET | `/api/terminology/stats` | login | `views/terminology.html:1634` |
| GET | `/api/terminology/review-queue` | editor | `views/terminology.html:1424` |
| GET | `/api/terminology/review-queue/counts` | editor | `views/terminology.html:1382` |
| GET | `/api/terminology/subjects` | login | `views/terminology.html:1601` |
| GET | `/api/terminology/categories` | login | **none** |
| GET | `/api/terminology/export` | login | `views/terminology.html:2322` +1 |
| GET | `/api/terminology/added-terms/export` | head-editor | `views/terminology.html:2344` +1 |
| POST | `/api/terminology/mine` | head-editor | `views/terminology.html:1297` |
| GET | `/api/terminology/mined-candidates` | head-editor | `views/terminology.html:1231` |
| POST | `/api/terminology/mined-candidates/:id/dismiss` | head-editor | `views/terminology.html:1314` |
| POST | `/api/terminology/mined-candidates/:id/promote` | head-editor | `views/terminology.html:1331` |
| GET | `/api/terminology/:id` | login | `views/terminology.html:1231` +5 |
| POST | `/api/terminology` | editor | `views/terminology.html:1925` |
| PUT | `/api/terminology/:id` | editor | `views/terminology.html:1925` |
| DELETE | `/api/terminology/:id` | admin | **none** |
| POST | `/api/terminology/:headwordId/translations` | editor | `views/terminology.html:2020` |
| PUT | `/api/terminology/translations/:id` | editor | **none** |
| DELETE | `/api/terminology/translations/:id` | admin | **none** |
| POST | `/api/terminology/translations/batch-approve` | head-editor | `views/terminology.html:1574` |
| POST | `/api/terminology/translations/:id/reject` | head-editor | `views/terminology.html:1550` |
| POST | `/api/terminology/translations/:id/approve` | head-editor | `views/terminology.html:1534` +1 |
| POST | `/api/terminology/translations/:id/dispute` | editor | `views/terminology.html:1969` |
| POST | `/api/terminology/:id/discuss` | editor | `views/terminology.html:2054` |
| POST | `/api/terminology/import/csv` | head-editor | `views/terminology.html:2213` |
| POST | `/api/terminology/import/glossary` | head-editor | `views/terminology.html:2213` |
| POST | `/api/terminology/import/excel` | head-editor | `views/terminology.html:2213` |
| POST | `/api/terminology/import/key-terms` | head-editor | `views/terminology.html:2115` |
| POST | `/api/terminology/import/existing-glossary` | head-editor | `views/terminology.html:2098` |
| GET | `/api/tm/export` | login | `views/books.html:2258 (navigation)` |
| GET | `/api/health` | NO AUTH | **none** |
| GET | `/api` | NO AUTH | **none** |

### A2. Endpoints with no UI caller (79 of 219)

Classified from route names and docblocks; the handlers were not all read.

| Class | Method | Path | Auth | Note |
|---|---|---|---|---|
| missing UI | GET | `/api/localization-editor/settings/:book` | editor | no control switches localization review on or off for a book; no book-level queue of pending localization edits |
| missing UI | POST | `/api/localization-editor/settings/:book` | admin | no control switches localization review on or off for a book; no book-level queue of pending localization edits |
| missing UI | GET | `/api/localization-editor/review-queue/:book` | head-editor of the book | no control switches localization review on or off for a book; no book-level queue of pending localization edits |
| missing UI | GET | `/api/localization-editor/:book/:chapter/:moduleId/versions/:version` | editor | version content and per-segment history cannot be viewed before restoring |
| missing UI | GET | `/api/localization-editor/:book/:chapter/:moduleId/version-history/:segmentId` | editor | version content and per-segment history cannot be viewed before restoring |
| missing UI | GET | `/api/notifications` | login | in-app notifications are stored but no page lists them and the bell is never shown |
| missing UI | GET | `/api/notifications/count` | login | in-app notifications are stored but no page lists them and the bell is never shown |
| missing UI | POST | `/api/notifications/:id/read` | login | in-app notifications are stored but no page lists them and the bell is never shown |
| missing UI | POST | `/api/notifications/read-all` | login | in-app notifications are stored but no page lists them and the bell is never shown |
| missing UI | GET | `/api/publication/:bookSlug/:chapterNum/status` | login | readiness and publication status exist on the server; the publish buttons do not show why a chapter is or is not ready |
| missing UI | GET | `/api/publication/:bookSlug/:chapterNum/readiness` | login | readiness and publication status exist on the server; the publish buttons do not show why a chapter is or is not ready |
| missing UI | GET | `/api/publication/:bookSlug/:chapterNum/modules` | login | readiness and publication status exist on the server; the publish buttons do not show why a chapter is or is not ready |
| missing UI | GET | `/api/publication/:bookSlug/overview` | login | readiness and publication status exist on the server; the publish buttons do not show why a chapter is or is not ready |
| missing UI | GET | `/api/research/consent` | login | research consent can be neither given nor withdrawn in the UI |
| missing UI | POST | `/api/research/consent` | login | research consent can be neither given nor withdrawn in the UI |
| missing UI | POST | `/api/research/consent/withdraw` | login | research consent can be neither given nor withdrawn in the UI |
| missing UI | GET | `/api/segment-editor/reviews/:reviewId` | editor | the review queue and "complete review" have no screen; see ED-12, ED-13 |
| missing UI | DELETE | `/api/segment-editor/edit/:editId` | editor | an editor cannot withdraw a pending edit with a control (only by saving the original text again) |
| missing UI | GET | `/api/segment-editor/reviews` | editor | the review queue and "complete review" have no screen; see ED-12, ED-13 |
| missing UI | GET | `/api/segment-editor/review-queue` | editor | the review queue and "complete review" have no screen; see ED-12, ED-13 |
| missing UI | POST | `/api/segment-editor/reviews/:reviewId/complete` | head-editor of the book | the review queue and "complete review" have no screen; see ED-12, ED-13 |
| missing UI | GET | `/api/segment-editor/:book/:chapter/:moduleId/versions/:version` | editor | version content and per-segment history cannot be viewed before restoring |
| missing UI | GET | `/api/segment-editor/:book/:chapter/:moduleId/segment-history/:segmentId` | editor | version content and per-segment history cannot be viewed before restoring |
| missing UI | DELETE | `/api/terminology/:id` | admin | an existing translation can be neither corrected nor removed in Orðasafn; see TE-01 |
| missing UI | PUT | `/api/terminology/translations/:id` | editor | an existing translation can be neither corrected nor removed in Orðasafn; see TE-01 |
| missing UI | DELETE | `/api/terminology/translations/:id` | admin | an existing translation can be neither corrected nor removed in Orðasafn; see TE-01 |
| unused | GET | `/api/my-work/summary` | login | built for a display that does not exist (per-module statistics, nav badges) |
| unused | GET | `/api/segment-editor/:book/:chapter/:moduleId/stats` | editor | built for a display that does not exist (per-module statistics, nav badges) |
| legacy | GET | `/api/activity/recent` | head-editor | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/activity/user/:userId` | head-editor | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/activity/book/:book` | head-editor of the book | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/activity/section/:book/:chapter/:section` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/activity/my` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/activity/types` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/analytics/dashboard-data` | head-editor | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/books` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/books/:bookId/chapters/:chapter` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/books/:book/chapters/:chapter/faithful-count` | login + requireBookAccess() | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/feedback/open` | head-editor | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | POST | `/api/feedback/:id/assign` | head-editor | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | POST | `/api/sections/:sectionId/assign-reviewer` | head-editor of the book | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | POST | `/api/sections/:sectionId/assign-localizer` | head-editor of the book | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | POST | `/api/sections/:sectionId/status` | editor | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | POST | `/api/sections/:sectionId/submit-review` | editor | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | POST | `/api/sections/:sectionId/approve-review` | head-editor of the book | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | POST | `/api/sections/:sectionId/request-changes` | head-editor of the book | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/status/:book/:chapter/sections` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/suggestions/patterns` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/suggestions/:sectionId/stats` | login + requireBookAccessForSection(bySectionParam) | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/terminology/lookup` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| legacy | GET | `/api/terminology/categories` | login | belongs to an earlier workflow or was superseded by another endpoint; nothing in the UI calls it |
| maintenance / API-only | GET | `/api/admin/catalogue/predefined` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/admin/books/data-status` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/admin/users/roles` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/admin/users/:id` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | DELETE | `/api/admin/users/:id` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/admin/validate-pipeline` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/pipeline-status/:bookSlug/:chapterNum` | login | admin or tooling endpoint with no screen |
| maintenance / API-only | POST | `/api/pipeline-status/:bookSlug/:chapterNum/advance` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | POST | `/api/pipeline-status/:bookSlug/:chapterNum/revert` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | POST | `/api/pipeline-status/:bookSlug/:chapterNum/lock` | editor | admin or tooling endpoint with no screen |
| maintenance / API-only | DELETE | `/api/pipeline-status/:bookSlug/:chapterNum/lock` | editor | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/pipeline/jobs` | head-editor | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/status/activity/types` | login | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/status/analytics` | login | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/status/meeting-agenda` | head-editor | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/status/:book/summary` | login | admin or tooling endpoint with no screen |
| maintenance / API-only | GET | `/api/status/:book/scan` | login | admin or tooling endpoint with no screen |
| maintenance / API-only | POST | `/api/status/:book/sync` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | POST | `/api/status/:book/:chapter/sync` | admin | admin or tooling endpoint with no screen |
| maintenance / API-only | POST | `/api/suggestions/scan-book/:bookSlug` | head-editor of the book | admin or tooling endpoint with no screen |
| intentional | GET | `/api/admin/migrate` | admin | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |
| intentional | POST | `/api/analytics/event` | optional | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |
| intentional | GET | `/api/auth/status` | NO AUTH | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |
| intentional | GET | `/api/auth/callback` | NO AUTH | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |
| intentional | GET | `/api/auth/roles` | NO AUTH | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |
| intentional | GET | `/api/feedback/types` | NO AUTH | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |
| intentional | GET | `/api/health` | NO AUTH | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |
| intentional | GET | `/api` | NO AUTH | infrastructure, OAuth return, or called from outside this UI (the reader site posts analytics events) |

### A3. Controls per page


**admin** (112 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Til baka | link | `#admin-denied a.btn` | Only a signed-in user whose client-side rol… | Goes to the home page. |
| Notendur | tab | `#admin-content > .tabs .tab[data-tab=users]` | admin only (page gate views.js:57; client c… | Shows #tab-users, marks the tab active, writes ?tab=users with history.replaceState. No data is loaded on cli… |
| Bækur | tab | `.tab[data-tab=books]` | admin only (views.js:57) | Shows #tab-books and writes ?tab=books. |
| Endurgjöf | tab | `.tab[data-tab=feedback]` | admin only (views.js:57) | Shows #tab-feedback and writes ?tab=feedback. |
| Tölfræði | tab | `.tab[data-tab=analytics]` | admin only (views.js:57) | Shows #tab-analytics and writes ?tab=analytics. |
| Keyra flutning (title: Keyrir gagnagrunnsflut… | button | `#btn-run-migration` | admin only, and only inside #users-migration | Runs the legacy migration list 001-014 on the live database through withProgress; on success hides the notice… |
| (placeholder) Leita að notanda... | text input | `#users-search` | admin only (views.js:57; usersInit admin.ht… | Filters the already loaded user list in the browser by name, e-mail or username. |
| Öll hlutverk / Kerfistjóri / Aðalritstjóri / … | select | `#users-role-filter` | admin only | Filters the loaded user list by role in the browser. |
| Bæta við | button | `.users-toolbar .btn-primary` | admin only | Clears the e-mail field, sets role to Lesandi, disables the submit button and opens the add-user modal. |
| (user table row) | clickable row | `#users-tbody tr` | admin only | Builds the edit panel for that user, slides it in, then loads the user's chapter assignments. |
| ✎ (title: Breyta) | icon button | `#users-tbody .action-btn (first)` | admin only | Same as clicking the row: opens the edit panel. |
| ✘ (title: Gera óvirkan) or ✔ (title: Virkja) | icon button | `#users-tbody .action-btn.danger` | admin only; also drawn on the admin's own r… | After a native confirm, flips the user's active flag in the database, reloads the list and toasts. Does not e… |
| Bæta við notanda (modal) | dialog contai… | `#add-user-modal` | admin only | Holds the add-user form. Hidden by the .modal rule (common.css:1237-1238); shown with display:flex. |
| × (add-user modal) | icon button | `#add-user-modal .btn-close` | admin only | Closes the modal. |
| Netfang (placeholder: t.d. nafn@skoli.is) | email input | `#add-user-email` | admin only | Enables the submit button as soon as the value contains @. |
| Hlutverk: Lesandi / Yfirlesari / Aðalritstjór… | select | `#add-role` | admin only | Chooses the role of the new account. |
| Hætta við (add-user modal) | button | `#add-user-modal .btn-secondary` | admin only | Closes the modal; typed values are cleared the next time it opens. |
| Bæta við (add-user modal) | button | `#add-user-btn` | admin only | Creates an account row for the e-mail with the chosen role (display name = text before @). No invitation is s… |
| (backdrop of the edit panel) | click target | `#edit-backdrop` | admin only | Closes the edit panel and discards unsaved name/role/status without asking. |
| × (edit panel) | icon button | `#edit-panel .btn-close` | admin only | Closes the panel. |
| Hætta við (edit panel) | button | `#edit-panel .edit-panel-footer .btn-seconda…` | admin only | Closes the panel. Does not undo book permissions or chapter assignments already written from inside the panel… |
| Vista | button | `#edit-panel .edit-panel-footer .btn-primary` | admin only | Saves name, role and active state of the open user, closes the panel, reloads the list, toasts 'Notandi uppfæ… |
| Nafn | text input | `#edit-display-name` | admin only | Edits the stored display name. |
| Hlutverk: Lesandi / Yfirlesari / Aðalritstjór… | select | `#edit-role` | admin only | Chooses the global role, saved by Vista. |
| Staða: Virkur / Óvirkur | select | `#edit-active` | admin only | Chooses the active flag, saved by Vista. |
| ✘ (title: Fjarlægja) beside a book permission | icon button | `#book-access-list .action-btn.danger` | admin only | Deletes that per-book row at once, redraws the list, toasts 'Bókaheimild fjarlægð'. |
| Bæta við bók (inside the edit panel) | button | `#edit-panel-body .btn-sm.btn-secondary` | admin only | Reveals the small add-permission form. |
| Veldu bók... (book list) | select | `#new-book-slug` | admin only | Chooses the book for the new permission; options come from GET /api/admin/books loaded at page start (679). |
| Yfirlesari / Aðalritstjóri (role for the book) | select | `#new-book-role` | admin only | Chooses the per-book role. |
| Bæta við (book permission) | button | `#add-book-access-form .btn-primary` | admin only | Writes the per-book row at once (not on Vista), redraws the list, hides the form, toasts 'Bókaheimild bætt vi… |
| × (title: Fjarlægja) on a chapter tag | clickable span | `#chapter-assignments .remove-ch` | admin only | Deletes that chapter assignment at once and reloads the tags. |
| Bók... (book list for chapter assignment) | select | `#assign-book` | admin only | Chooses the book for the chapter assignment. |
| (placeholder) Kafli nr. | number input | `#assign-chapter` | admin only | Chapter number to assign. min=1 max=30 are hints only; the script accepts any whole number from 1 up. |
| Úthluta | button | `.add-chapter-row .btn` | admin only | Writes the chapter assignment at once, clears the number, reloads the tags, toasts 'Úthlutað: Kafli N'. |
| Allar | sub-tab | `.books-subtab[data-filter=all]` | admin only | Shows every catalogue book. |
| Skráðar | sub-tab | `.books-subtab[data-filter=registered]` | admin only | Shows registered books only. |
| Óskráðar | sub-tab | `.books-subtab[data-filter=unregistered]` | admin only | Shows unregistered books only. |
| Samstilla (title: Samstillir bókalista við Op… | button | `#books-sync-btn` | admin only | Upserts the server's built-in list of 34 books into the catalogue table and overwrites existing rows' details… |
| Bæta við bók (title: Skrá nýja bók handvirkt … | button | `.books-toolbar .btn-primary` | admin only | Clears and opens the 'Bæta við bók í lista' modal. |
| Skoða (registered book card) | link | `.book-card .actions a[href^='/library']` | admin only | Opens the library page on that book. |
| ↻ (title: Endurgera) | icon button | `.book-card .actions button[title=Endurgera]` | admin only | After a native confirm, makes the server download the book's structure from GitHub and overwrite server/data/… |
| ⬇ Sækja (title: Sækja CNXML upprunaskrár) | button | `.book-card .actions button (retryFetchSourc…` | admin only; drawn when the book is register… | Asks the server to download the book's source files from GitHub. With source files already on disk the server… |
| Skrá (unregistered book card) | button | `.book-card .actions .btn-primary` | admin only | Fills the register modal (English title, empty Icelandic title and slug, checkbox on), loads the user list fo… |
| ↗ (no title, no aria-label) | icon link | `.book-card .actions a[target=_blank]` | admin only; when the catalogue row has a re… | Opens the book's GitHub repository in a new tab. |
| Keyra uppsetningu | button | `#books-grid .empty-state .btn` | admin only | Runs the legacy migration list 001-014 on the live database, then reloads the catalogue. |
| Skrá bók (modal) | dialog contai… | `#register-book-modal` | admin only | Holds the register form. |
| × (register modal) | icon button | `#register-book-modal .btn-close` | admin only | Closes the modal. |
| (form) Skrá bók | form | `#register-form` | admin only | Registers the book: see control 56. |
| (hidden) catalogueSlug | hidden input | `#reg-catalogue-slug` | nobody (hidden field) | Carries the catalogue slug of the chosen card. |
| Ensk heiti | text input (d… | `#reg-title-en` | admin only | Shows the English title, read-only. |
| Íslenskt heiti (placeholder: t.d. Efnafræði) | text input (r… | `#reg-title-is` | admin only | Icelandic title of the book; cannot be changed afterwards from the UI. |
| Slug (stytting) (placeholder: t.d. efnafraedi… | text input (r… | `#reg-slug` | admin only | Short name that becomes the book's folder name and URL part; cannot be changed afterwards from the UI. |
| Aðalritstjóri (valkvætt): Velja síðar... + on… | select | `#reg-head-editor` | admin only | Optionally names a head editor for the new book; the server writes a per-book 'head-editor' row and notifies … |
| Sækja kaflaskipan frá OpenStax (checked by de… | checkbox | `#reg-fetch` | admin only | When on: structure is fetched from GitHub AND a job downloads the complete source files into books/<slug>/01-… |
| Hætta við (register modal) | button | `#register-form .btn-secondary` | admin only | Closes the modal. |
| Skrá bók (submit) | submit button | `#register-form button[type=submit]` | admin only | Registers the book: may fetch structure from GitHub, writes database rows, creates the folder tree books/<slu… |
| Bæta við bók í lista (modal) | dialog contai… | `#add-book-modal` | admin only | Holds the add-to-catalogue form. |
| × (add-book modal) | icon button | `#add-book-modal .btn-close` | admin only | Closes the modal. |
| (form) Bæta við bók í lista | form | `#add-book-form` | admin only | Adds a catalogue row: see control 67. |
| Slug (kennimerki) (placeholder: t.d. physics-… | text input (r… | `#add-book-slug` | admin only | Catalogue identifier of the new row. |
| Enskt heiti (placeholder: t.d. University Phy… | text input (r… | `#add-book-title` | admin only | English title of the new row. |
| Lýsing (valkvætt) (placeholder: Stutt lýsing … | textarea | `#add-book-description` | admin only | Optional description. |
| GitHub repo URL (valkvætt) (placeholder: http… | url input | `#add-book-repo-url` | admin only | Optional repository address; later drawn as the ↗ link on the card. |
| Fjöldi kafla (placeholder: t.d. 21) | number input … | `#add-book-chapter-count` | admin only | Optional chapter count shown on the card. |
| Hefur viðauka | checkbox | `#add-book-appendices` | admin only | Marks the catalogue row as having appendices. |
| Hætta við (add-book modal) | button | `#add-book-form .btn-secondary` | admin only | Closes the modal. |
| Bæta við (add-book submit) | submit button | `#add-book-form button[type=submit]` | admin only | Inserts a catalogue row, toasts 'Bók bætt við lista', closes the modal and reloads the grid. |
| Reyna aftur (failed fetch banner) | button | `#fetch-progress-banner .btn-primary` | admin only | Same as '⬇ Sækja' (control 42). |
| Loka (failed fetch banner) | button | `#fetch-progress-banner .btn-secondary` | admin only | Removes the banner. |
| Allar stöður / Opin (preselected) / Í vinnslu… | select | `#fb-status-filter` | admin only (the server would also serve hea… | Resets to page 1 and reloads the feedback list with the chosen status. |
| Allar tegundir / Villa í þýðingu / Tæknilegt … | select | `#fb-type-filter` | admin only | Resets to page 1 and reloads with the chosen type. |
| Öll forgangs / Mjög há / Há / Venjuleg / Lág | select | `#fb-priority-filter` | admin only | Resets to page 1 and reloads with the chosen priority. |
| Fyrri | button | `#fb-prev-btn` | admin only | Goes back 20 items and reloads. |
| Næsta | button | `#fb-next-btn` | admin only | Goes forward 20 items and reloads. |
| Skoða (feedback row) | button | `.fb-table .btn` | admin only | Loads the item and opens the detail modal with type, status, priority, location, date, contact, message, resp… |
| Endurgjöf #N (modal) | dialog contai… | `#fb-detail-modal` | admin only | Holds the feedback detail. |
| × (feedback detail) | icon button | `#fb-detail-modal .btn-close` | admin only | Closes the modal. |
| Staða: Opið / Í vinnslu / Leyst / Verður ekki… | select (saves… | `#fb-detail-status` | admin only | Saves the new status at once, then reloads the counters and the list. No success message. |
| Forgangur: Lágur / Venjulegur / Hár / Mjög hár | select (saves… | `#fb-detail-priority` | admin only | Saves the new priority at once and reloads the list. |
| opna í ritli ↗ | link | `#fb-detail-location a` | admin only; only when the item has book, ch… | Opens the editor on the reported place in a new tab (the server redirects /segment-editor to /editor, views.j… |
| (placeholder) Skrifa svar... | textarea | `#fb-response-input` | admin only | Text of the response. |
| Innanhússathugasemd | checkbox | `#fb-response-internal` | admin only | Stores the response with an 'internal' mark (shown as the badge 'Innanhúss'). |
| Svara | button | `.response-actions .btn` | admin only | Stores the response in the database and reopens the item. Nothing is sent to the person who gave the feedback. |
| Loka | button | `#fb-detail-modal .modal-footer .btn-seconda…` | admin only | Closes the modal. |
| Merkja sem leyst | button | `#fb-resolve-btn` | admin only | Opens the resolve modal on top of the detail modal. |
| Merkja sem leyst (modal) | dialog contai… | `#fb-resolve-modal` | admin only | Asks for an optional resolution note. |
| × (resolve modal) | icon button | `#fb-resolve-modal .btn-close` | admin only | Closes the modal and clears the note. |
| Lausnarathugasemd (valfrálst) (placeholder: L… | textarea | `#fb-resolution-input` | admin only | Optional note stored with the resolution. |
| Hætta við (resolve modal) | button | `#fb-resolve-modal .btn-secondary` | admin only | Closes the modal and clears the note. |
| Staðfesta | button | `#fb-resolve-modal .btn-primary` | admin only | Marks the item resolved with the signed-in admin as resolver and the note, closes both modals, reloads counte… |
| 7 dagar | segmented but… | `.period-btn[data-period='-7 days']` | admin only (the server would also serve hea… | Reloads the statistics for the last 7 days and the recent-events list. |
| 30 dagar | segmented but… | `.period-btn[data-period='-30 days']` | admin only | As control 91 for 30 days. |
| 90 dagar | segmented but… | `.period-btn[data-period='-90 days']` | admin only | As control 91 for 90 days. |
| Heim | sidebar link | `#app-sidebar a[href='/']` | everyone | Goes to the home page. |
| Ritill | sidebar link | `a[href='/editor']` | everyone | Opens the editor. |
| Framvinda | sidebar link | `a[href='/progress']` | everyone | Opens the progress page. |
| Orðasafn | sidebar link | `a[href='/terminology']` | everyone | Opens the terminology page. |
| Yfirlestrar (section Yfirlestur) | sidebar link | `#sidebar-section-review a[href='/editor?vie…` | admin, head-editor, editor (effective role;… | Opens the review queue in the editor. |
| Aðlögun | sidebar link | `#nav-localization` | admin and head-editor (layout.js:420-424) | Opens the localization editor. |
| Stjórnandi (section Stjórnun) | sidebar link | `#nav-admin` | admin only, by effective role (layout.js:41… | Opens this page. Highlighted as active on /admin (layout.js:244-261). |
| Bókasafn | sidebar link | `a[href='/library']` | admin and head-editor (section #sidebar-sec… | Opens the library page. |
| Úthlutanir | sidebar link | `a[href='/assignments']` | admin and head-editor (layout.js:401-403); … | Opens the assignments page. |
| Um mig | sidebar link | `#nav-profile` | any signed-in user (layout.js:405-409) | Opens the profile page. |
| Ábendingar | sidebar link | `a[href='/feedback']` | everyone | Opens the public feedback form. |
| Skoða sem: Stjórnandi (raunhlutverk) / Aðalri… | select | `#role-preview-select` | real admins only (layout.js:444-448) | Stores a preview role in sessionStorage and re-applies sidebar and class-based visibility. Browser-side only;… |
| (theme toggle; title and aria-label: Skipta u… | button | `.theme-toggle` | everyone | Switches light / dark and stores the choice in localStorage. |
| (user name) or Innskrá | sidebar user … | `#sidebar-user-info` | everyone | Shows who is signed in; when signed out links to the login page. |
| (hamburger; aria-label: Opna valmynd) | icon button | `#hamburger-btn` | everyone, at widths up to 1023 px (common.c… | Opens or closes the sidebar on narrow screens. |
| (dimmed overlay behind the open sidebar) | click target | `#sidebar-overlay` | everyone, while the mobile sidebar is open | Closes the sidebar on narrow screens. |
| (bell; title and aria-label: Tilkynningar) | icon control | `#notification-bell` | nobody | Nothing: it is never shown and has no handler. |
| (logout icon; title and aria-label: Útskrá) | icon button | `#logout-btn` | any signed-in user | Clears the session cookie on the server, clears the cached user and goes to /login. |
| Innskrá (topbar) | link | `#user-info a` | only when no user is known to the page (can… | Goes to the login page. |

**/assignments - Úthlutanir (server/views/assignments.html + server/pub…** (15 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| (no visible label) options: 'Veldu bók...' th… | select | `#book-select.book-select` | Everyone who can open the page (admin, head… | Loads the chosen book: stat cards, chapter table, the state of the enforcement checkbox and, for an admin on … |
| Þvinga kaflaúthlutun (checkbox; hover title o… | checkbox togg… | `#enforce-assignments-toggle inside label#en…` | Shown to admin AND head-editor after any su… | Posts the new state at once. Success: toast 'Kaflaúthlutun þvinguð' or 'Þvingun afturkölluð'. Failure: error … |
| Tillögur gervigreindar í ritli: Kveikt \| Slö… | checkbox togg… | `#suggestion-view-toggle inside label#sugges…` | Admin only, and only for a study book (STUD… | Switches the editors' AI-suggestion view for the book on or off. Off: native confirm first. On: plain POST; i… |
| (no label; column header YFIRLESARI) options:… | select, one p… | `select.assign-select[data-book][data-chapte…` | admin; head-editor of that book (the table … | A name: POST the user id for that chapter. '— Óúthlutað —': DELETE. Then toast 'Úthlutun uppfærð' and a full … |
| Opna → (one per chapter row) | link | `a.link-accent[href^='/editor?book=']` | admin; head-editor of the book | Opens the segment editor with that book and chapter preselected; the editor reads both parameters and '-1' fo… |
| Heim \| Ritill \| Framvinda \| Orðasafn | sidebar links… | `.sidebar .nav-link` | everyone | Go to the home page, the editor, the progress page, the glossary. |
| group 'Yfirlestur': Yfirlestrar \| Aðlögun | sidebar links… | `#sidebar-section-review .nav-link, #nav-loc…` | group: admin, head-editor, editor (layout.j… | Review queue view of the editor; localization editor. |
| group 'Stjórnun': Stjórnandi \| Bókasafn \| Ú… | sidebar links… | `#sidebar-section-admin .nav-link, #nav-admin` | group: admin and head-editor (layout.js:388… | Admin panel, library, this page (highlighted as active here). |
| Um mig \| Ábendingar | sidebar foote… | `#nav-profile, .sidebar-footer .nav-link` | 'Um mig': any signed-in user (layout.js:406… | Profile page; feedback form. |
| Skoða sem: [Stjórnandi (raunhlutverk) \| Aðal… | select (role … | `#role-preview-select` | real admins only (layout.js:444-448) | Re-applies role-based visibility as if the admin had the chosen role. On this page only the sidebar changes: … |
| (icon button) title and aria-label 'Skipta um… | button (theme… | `button.theme-toggle` | everyone | Nothing on /assignments. On other pages it switches light/dark (theme.js:47-51). |
| (icon button) aria-label 'Opna valmynd' | button (hambu… | `#hamburger-btn` | everyone (shown by CSS at narrow widths, co… | Opens or closes the sidebar on narrow screens. |
| (bell icon) title and aria-label 'Tilkynninga… | div (notifica… | `#notification-bell` | nobody | Nothing: it is rendered with display:none and no script ever shows it. |
| (user name) + icon button title and aria-labe… | button (logou… | `#logout-btn` | any signed-in user | Logs out and goes to /login. |
| Innskrá | links (shared… | `#sidebar-user-info a, #user-info a` | only when the shell could not load the user… | Shown instead of the user name when /api/auth/me fails or reports no user. |

**server/public/js/bookSelector.js (shared script: fills every select.b…** (1 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| placeholder option 'Veldu bók...' (or data-pl… | select popula… | `select.book-select` | every role, including anonymous users (the … | Fills the dropdown and auto-selects: current value or data-default, else the stored book, else (without allow… |

**books** (65 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Bækur | tab (view swi… | `.library-tab[data-view='books']` | every signed-in role (no role class, no JS … | Hides every .library-view, shows #view-books and marks this tab active. It does not go back to the book list:… |
| Kafli | tab (view swi… | `.library-tab[data-view='chapter']` | every signed-in role | Shows #view-chapter. The first time it wires the two dropdowns and the load button; if a book is already sele… |
| Skrá nýja bók | button (opens… | `#register-btn` | Browser: admin AND head-editor (class admin… | Opens the dialog #catalogue-modal, hides the form, shows 'Hleður...', then (a) POSTs the catalogue sync with … |
| Sækja allt EN markdown | button (file … | `#book-detail-section button[onclick^='downl…` | No role class or check. In practice admin, … | Shows a native confirm; on OK sets window.location.href to the download URL, asking for a ZIP of every .md fi… |
| (icon-less select, aria-label 'Snið þýðingami… | select | `#tm-format` | same as control 4 | Chooses the file format for the translation-memory download. |
| Sækja þýðingaminni | button (file … | `.tm-download button` | same as control 4 | Sets window.location.href to the export URL with the chosen format. The server builds the translation memory … |
| Opna ritil | link | `#chapter-editor-link` | any role that can open a chapter panel (adm… | Goes to /segment-editor?book=<book>&chapter=<n>; the server redirects to /editor with the same query (views.j… |
| Birta MT | button (start… | `#btn-publish-mt` | Browser: admin and every head-editor (windo… | Disables itself, shows the badge 'Í gangi...', POSTs the publish request for the machine-translation track an… |
| Birta | button (start… | `#btn-publish-faithful` | admin and head-editor, and only when the ch… | Same as control 8 for the reviewed (faithful) track. |
| Birta staðf. | button (start… | `#btn-publish-localized` | admin and head-editor, and only when the fa… | Same as control 8 for the localized track. |
| HTML (title 'Sækja birta HTML') | button (file … | `#btn-download-pub` | Browser: admin and head-editor only, and on… | Sets window.location.href to the download URL for the chapter with type=pub-faithful, always, whichever track… |
| Hlutar | tab (sub-tab … | `.detail-tab (text 'Hlutar')` | any role that can open a chapter panel | Shows #dtab-sections: the section list of the chapter (number, English title, status badge, reviewer name, 'O… |
| Atriði | tab (sub-tab … | `.detail-tab (text 'Atriði')` | any role that can open a chapter panel | Shows #dtab-issues, which always contains 'Villa við að hlaða atriði' because its data request has no server … |
| Virkni | tab (sub-tab … | `.detail-tab (text 'Virkni')` | visible to any role that can open a chapter… | Shows #dtab-activity: the last 10 activity-log rows for the chapter (icon, user, description, relative time). |
| Bók | label | `#view-chapter .form-group:nth-child(1) labe…` | every signed-in role, when the Kafli tab is… | Visible caption for the book dropdown; not associated with it (no for attribute). |
| (book dropdown; placeholder option 'Veldu bók… | select | `#cv-book-select` | every signed-in role | On change loads the chosen book's chapters into the chapter dropdown; with the empty option it disables the c… |
| Kafli | label | `#view-chapter .form-group:nth-child(2) labe…` | every signed-in role, Kafli tab | Visible caption for the chapter dropdown; not associated with it. |
| (chapter dropdown; first option 'Veldu kafla.… | select | `#cv-chapter-select` | every signed-in role | Enables the load button when a chapter is chosen. |
| (empty label, non-breaking space) | label (layout… | `#view-chapter .form-group:nth-child(3) labe…` | every signed-in role | Nothing; keeps the button aligned with the dropdowns. |
| Hlaða kafla | button | `#cv-load-btn` | every signed-in role; the requests succeed … | Shows the chapter panel of the Kafli view, sets the editor and issues links, loads the module list, the (miss… |
| Opna ritil | link | `#cv-editor-link` | every signed-in role once a chapter is load… | Goes to /segment-editor?book=<book>&chapter=<n> (redirects to /editor). |
| Öll atriði | link | `#cv-issues-link` | every signed-in role once a chapter is load… | Goes to /issues?book=<book>&chapter=<n>, which the server redirects (301) to '/', the home page (views.js:103… |
| Skrá nýja bók (dialog container) | custom modal … | `#catalogue-modal` | whoever can press control 3 or 34 | Holds the catalogue list (#catalogue-list) and the registration form (#register-form). |
| × (no aria-label) | button (close… | `#catalogue-modal .btn-close` | dialog users (admin; head-editor sees the d… | Hides the dialog. It does not reset which part (list or form) is visible, which is why the next opening can b… |
| (registration form) | form | `#register-form form` | admin (a head editor can never get a 'Skrá'… | Sends catalogueSlug, slug and titleIs. On success shows a native alert with the number of chapters and units … |
| (hidden field catalogueSlug) | input type=hi… | `#catalogue-slug` | not visible | Carries the OpenStax catalogue slug of the chosen row. |
| Íslenskt stuttnefni (slug) | label | `#register-form .form-group:nth-of-type(1) l…` | admin | Caption for the slug field; not associated with it. |
| (text field, placeholder 't.d. efnafraedi') | input type=te… | `#book-slug` | admin | The Icelandic slug: becomes the folder name books/<slug>/ and the book's key everywhere. |
| Íslenskt heiti | label | `#register-form .form-group:nth-of-type(2) l…` | admin | Caption for the title field; not associated with it. |
| (text field, placeholder 't.d. Efnafræði') | input type=te… | `#book-title-is` | admin | The Icelandic book title shown in the library and the dropdowns. |
| Hætta við | button type=b… | `#register-form button[type='button']` | admin | Hides the form and shows the catalogue list again. This is the only code path that makes the list visible aga… |
| Skrá bók | button type=s… | `#register-form button[type='submit']` | admin | Registers the chosen catalogue book under the typed slug and title. |
| (book card: Icelandic title, English title, '… | clickable car… | `.book-card` | admin, head-editor, editor (a viewer gets '… | Hides the list, shows the book header and loads the chapter grid; updates the breadcrumb and pushes /books/<s… |
| Skrá fyrstu bókina | button (opens… | `#books-list .empty-state-large button` | admin only (window.currentUser.role === 'ad… | Same as control 3. |
| Bækur (breadcrumb) | link (javascr… | `#books-breadcrumb a:first-child` | anyone who has opened a book | Shows the book list again, hides the book and chapter panels, resets the breadcrumb and pushes /books to the … |
| (book title in breadcrumb) | link (javascr… | `#books-breadcrumb a:nth-of-type(2)` | anyone who has opened a chapter | Closes the chapter panel and reloads the book's chapter grid (pushes /books/<slug> again). |
| (chapter card: 'K3' or 'Við.', status pill, t… | clickable car… | `.chapter-card` | admin, head-editor, editor | Shows the chapter panel under the grid, updates breadcrumb, title and editor link, hides the publish controls… |
| Klárt / Í vinnslu / Ekki byrjað (status pill;… | link wrapping… | `.chapter-card a.pipeline-link` | admin, head-editor, editor | Goes to /pipeline/<book>/<chapter>, which the server redirects (301) to /progress without book or chapter (vi… |
| Opna (one per section row in the 'Hlutar' tab) | link | `#sections-panel .section-row a.btn` | admin, head-editor, editor | Goes to /segment-editor?book=<book>&chapter=<n>&module=<moduleId>; the editor opens that module (segment-edit… |
| Leysa | link | `.blocked-issue a.btn` | nobody: it is only rendered after a success… | Would go to the retired /issues page (301 to '/'). |
| +N fleiri atriði | link | `a.show-more-link` | nobody (same reason as control 40) | Would go to the retired /issues page. |
| Opna (one per module row in the Kafli view) | link | `#cv-sections-panel .section-row a.btn` | admin, head-editor, editor (the list needs … | Goes to /segment-editor?book=<book>&chapter=<n> for every row: the link has no module parameter, so it opens … |
| Kafli 1, Kafli 2 ... (options of the chapter … | select options | `#cv-chapter-select option` | every signed-in role | One option per entry of the book data file's chapters array, labelled by chapterLabel.full (chapter-label.js:… |
| Veldu bók... + one option per book (options o… | select options | `#cv-book-select option` | every signed-in role | Lists the server's book whitelist with Icelandic labels, sorted with Icelandic collation (books.js:75-81). |
| Allar / Skráðar / Óskráðar | filter button… | `.catalogue-filter-btn[data-filter='all'\|'r…` | admin (inside the dialog after the catalogu… | Shows all rows, only registered rows or only unregistered rows, and hides subject headings that end up empty.… |
| Skrá (one per unregistered catalogue row) | button | `.catalogue-book-row button` | admin; only rows whose subject is in the fi… | Hides the catalogue list, shows the registration form for that book and clears the two text fields. No reques… |
| Heim | sidebar link | `.sidebar a[href='/']` | everyone | Goes to the home page (my-work). |
| Ritill | sidebar link | `.sidebar a[href='/editor']` | everyone | Goes to the segment editor. |
| Framvinda | sidebar link | `.sidebar a[href='/progress']` | everyone | Goes to the progress page. |
| Orðasafn | sidebar link | `.sidebar a[href='/terminology']` | everyone | Goes to the terminology page. |
| Yfirlestrar | sidebar link | `#sidebar-section-review a[href='/editor?vie…` | admin, head-editor, editor (section shown b… | Goes to the editor in review mode. |
| Aðlögun | sidebar link | `#nav-localization` | admin and head-editor (layout.js:420-424; t… | Goes to /localization. |
| Stjórnandi | sidebar link | `#nav-admin` | admin only (layout.js:411-418) | Goes to /admin. |
| Bókasafn | sidebar link … | `.sidebar a[href='/library']` | admin and head-editor (section #sidebar-sec… | Reloads /library, i.e. back to the plain book list. |
| Úthlutanir | sidebar link | `.sidebar a[href='/assignments']` | admin and head-editor | Goes to /assignments. |
| Um mig | sidebar link | `#nav-profile` | any signed-in user (layout.js:405-409) | Goes to /profile. |
| Ábendingar | sidebar link | `.sidebar a[href='/feedback']` | everyone | Goes to the feedback form. |
| Skoða sem: (options Stjórnandi (raunhlutverk)… | select (role … | `#role-preview-select` | real admins only (layout.js:444-448) | Stores the chosen role in sessionStorage and re-applies the role classes and sidebar sections. It changes onl… |
| (theme toggle; title and aria-label 'Skipta u… | button | `.theme-toggle` | everyone | Switches between light and dark and stores the choice in localStorage('theme'). |
| (user name and avatar) or 'Innskrá' | sidebar foote… | `#sidebar-user-info` | everyone | Shows who is signed in; when signed out links to the login page. |
| (hamburger; aria-label 'Opna valmynd') | button (mobil… | `#hamburger-btn` | everyone, at viewport widths up to 1023 px … | Toggles the sidebar open/closed and the dark overlay. |
| (dark overlay behind the open mobile menu) | click target | `#sidebar-overlay` | everyone on small screens while the menu is… | Closes the mobile sidebar. |
| (notification bell; title and aria-label 'Til… | icon (div) wi… | `#notification-bell, #notification-count` | nobody | Nothing. Injected with display:none; no code shows it, fills the counter or reacts to a click. |
| (logout icon; title and aria-label 'Útskrá') | button | `#logout-btn` | any signed-in user | POSTs the logout request, clears the cached session info and goes to /login, whatever the network outcome. |
| Innskrá (topbar) | link | `#user-info a[href='/login']` | only when /api/auth/me reports no session (… | Goes to the login page. |

**localization-editor** (93 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Staðfærsluritill | tab button | `button.view-tab[data-view="editor"]` | Any signed-in role that loads the page: no … | Marks this tab active and shows #view-editor, hides #view-review. Nothing is unloaded or reloaded, and the UR… |
| Yfirlestur á staðfæringu | tab button | `button.view-tab[data-view="review"]` | Any signed-in role that loads the page: no … | Shows #view-review (the section selector, or the review interface if a section was loaded) and hides #view-ed… |
| Leiðbeiningar ▼ | expandable pa… | `#guidelines-panel > button.guidelines-header` | Any signed-in role that loads the page: no … | Expands or collapses the four-line guideline list (html:1458-1463) and stores the state in localStorage key l… |
| Bók | label | `#module-selector label.form-label (1st)` | Any signed-in role that loads the page: no … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (book select; first option „Veldu bók...“) | select | `#ed-book-select.book-select` | Any signed-in role that loads the page: no … | On page load bookSelector.js fills it from GET /api/books/list, preselects the remembered book (or the first … |
| Kafli | label | `#module-selector label.form-label (2nd)` | Any signed-in role that loads the page: no … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (chapter select; „Veldu kafla...“, then „Hleð… | select | `#ed-chapter-select` | Any signed-in role that loads the page: no … | Loads the module list of the chosen chapter into #modules-container, shows the chapter progress card („Staðfæ… |
| <module title> + „<module id> §<section>“ + b… | clickable lis… | `#modules-container .module-item.clickable` | Any signed-in role that loads the page: no … | Replaces the module list with a „Hleður einingu...“ spinner (js:473-479), loads the module (EN, faithful, loc… |
| <module title> + badge „Vantar Pass 1“ (title… | disabled list… | `#modules-container .module-item.disabled` | Any signed-in role that loads the page: no … | Nothing. Shown at 60% opacity with a not-allowed cursor; the only explanation is the hover title „Þarf Pass 1… |
| Til baka | button | `#btn-back` | Any signed-in role that loads the page: no … | If there are unsaved changes asks „Þú átt óvistaðar breytingar. Viltu yfirgefa?“; on OK deletes the local dra… |
| Vista allt (title „Vista allar breytingar“) | button | `#btn-save-all` | Any signed-in role that loads the page: no … | With nothing pending: alert „Engar óvistaðar breytingar.“ Otherwise checks every pending segment for blocking… |
| Útgáfusaga (title „Skoða eldri útgáfur og fær… | button (opens… | `#ed-btn-history` | head-editor and admin only, by the ACTUAL r… | Opens the version-history overlay with „Hleður…“, then lists every stored version of the module: „<who> · <da… |
| Yfirlestur staðfærslu er virkur fyrir þessa b… | info banner (… | `#loc-review-banner` | Any signed-in role that loads the page: no … | Tells the user that saves in this book are held for head-editor approval. |
| Staðfærsla í bið (panel heading) | panel | `#loc-pending-panel` | head-editor and admin (actual role, not boo… | Container for the pending-edit rows (segment id · editor name, old text struck through, new text) with the tw… |
| Samþykkja | button | `#loc-pending-list .loc-approve[data-id]` | head-editor and admin (actual role; NOT lim… | Approves one pending localization edit: the server writes the edited text into the localized file (after a sn… |
| Hafna | button | `#loc-pending-list .loc-reject[data-id]` | same as „Samþykkja“ above. | After a native confirm, marks the pending edit rejected (database only, the file is untouched), then reloads … |
| Sýna: | label | `.editor-filter-bar label (1st)` | Any signed-in role that loads the page: no … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (row filter: Allar bútur \| Breyttar (óvistað… | select | `#filter-type` | Any signed-in role that loads the page: no … | Re-renders the table with only the matching rows: rows with an unsaved change; rows that exist in the localiz… |
| Flokkur: | label | `.editor-filter-bar label (2nd)` | Any signed-in role that loads the page: no … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (category filter: Allir flokkar \| Einingabre… | select | `#filter-category` | Any signed-in role that loads the page: no … | Shows only rows whose currently shown category (explicit pick, else pending, else latest saved) equals the ch… |
| Afrita (title „Afrita trúa þýðingu“) | button (per s… | `#segments-body .btn-copy-faithful` | Any signed-in role that loads the page: no … | REPLACES the content of the row's „Staðfært“ textarea with the faithful translation and runs the edit trackin… |
| (textarea in the column „Staðfært (Pass 2)“; … | textarea (per… | `#segments-body textarea.localized-textarea#…` | Any signed-in role that loads the page: no … | Holds the pending text, else the saved localized text, else the faithful text. Typing marks the row „Breytt“,… |
| (category picker: Flokkur… \| Einingabreyting… | select (per s… | `#segments-body select.loc-category-select#c…` | Any signed-in role that loads the page: no … | Remembers the chosen category for the row. If the row already has an unsaved text change, the category is att… |
| ✓ icon only (title „Vista bút“) | icon button (… | `#segments-body .btn-save-seg` | Any signed-in role that loads the page: no … | Validates the textarea (blocking errors → alert „Ekki hægt að vista: …“; advisory warnings → native confirm „… |
| clock icon only (title „Breytingasaga“) | icon button (… | `#segments-body .btn-history-seg` | Any signed-in role that loads the page: no … | Opens (or, if already open for this row, closes) a popover under the button listing up to 20 saved edits of t… |
| × (in the popover header „Breytingasaga (N)“) | icon button | `.history-popover .btn-close` | Any signed-in role that loads the page: no … | Removes the popover. The popover also closes on any click outside it that is not on a clock button (delegated… |
| Endurheimta (title „Setja þessa útgáfu í text… | button (per h… | `.history-popover .btn-history-restore[data-…` | Any signed-in role that loads the page: no … | Puts that entry's saved text (new_content) into the row's textarea, runs the edit tracking (the row becomes a… |
| Útgáfusaga (dialog) — caption „Hver útgáfa sý… | dialog contai… | `#ed-vh-overlay > .vh-modal[role="dialog"][a…` | whoever can click „Útgáfusaga“ (head-editor… | Custom modal for the version list. No focus is moved into it, there is no focus trap, and Escape is not handl… |
| Loka (title „Loka“) | button | `#ed-vh-close` | head-editor, admin (inside the modal). | Closes the version-history overlay. |
| (click on the dark backdrop of the version-hi… | backdrop clic… | `#ed-vh-overlay` | head-editor, admin. | Closes the version-history overlay. |
| Færa í þessa útgáfu | button (per v… | `#ed-vh-list .vh-restore[data-version]` | head-editor and admin (actual role; not lim… | After a native confirm, asks the server to rebuild the localized file from that snapshot (the current file co… |
| Bók | label | `#rv-section-selector label.form-label (1st)` | Any signed-in role that loads the page: no … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (review book select; „Veldu bók...“) | select | `#rv-book-select` | Any signed-in role that loads the page: no … | Options (value = slug, text = Icelandic title) are appended once, after sign-in is known (initPage, js:2468).… |
| Kafli | label | `#rv-section-selector label.form-label (2nd)` | Any signed-in role that loads the page: no … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (review chapter select; „Veldu kafla...“) | select | `#rv-chapter-select` | Any signed-in role that loads the page: no … | Requests the sections of the chapter. The URL it calls does not exist on the server, so the request fails, th… |
| Hluti | label | `#rv-section-selector label.form-label (3rd)` | Any signed-in role that loads the page: no … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (section select; „Veldu hluta...“) | select | `#rv-section-select` | Any signed-in role that loads the page: no … | Never usable: it is created disabled and the only statement that enables it (js:1861) runs after a successful… |
| Hlaða | button | `#rv-load-btn` | Any signed-in role that loads the page: no … | Would open the review interface for the chosen section: put ?sectionId in the URL, hide the selector, load th… |
| Til baka | button | `#rv-review-interface .section-info button.b…` | Anyone who gets the review interface open; … | Hides the review interface, shows the section selector, removes sectionId from the URL (history.pushState) an… |
| Skanna | button | `#rv-review-interface .section-actions-bar b…` | Anyone who gets the review interface open; … | Disables itself, shows a spinner and „Skannar...“, asks the server to scan the section's faithful text for un… |
| Samstilla við skrá | button | `#rv-review-interface .section-actions-bar b…` | Anyone who gets the review interface open; … | If no suggestion is accepted or modified: alert „Engar samþykktar tillögur til að samstilla“. Otherwise the s… |
| Samþykkja allt | button | `#rv-review-interface .suggestions-header bu…` | Anyone who gets the review interface open; … | With no pending suggestion: alert „Engar tillögur í bið“. Otherwise confirm, then mark every pending suggesti… |
| Hafna öllu | button | `#rv-review-interface .suggestions-header bu…` | Anyone who gets the review interface open; … | Same as above with action "reject": confirm, then mark every pending suggestion rejected and reload. |
| Allt | filter chip b… | `.suggestions-filters .filter-btn[data-filte…` | Anyone who gets the review interface open; … | Marks the chip active and re-renders the suggestion list for that status (the „Samþykkt“ chip also shows „mod… |
| Í bið | filter chip b… | `.suggestions-filters .filter-btn[data-filte…` | Anyone who gets the review interface open; … | Marks the chip active and re-renders the suggestion list for that status (the „Samþykkt“ chip also shows „mod… |
| Samþykkt | filter chip b… | `.suggestions-filters .filter-btn[data-filte…` | Anyone who gets the review interface open; … | Marks the chip active and re-renders the suggestion list for that status (the „Samþykkt“ chip also shows „mod… |
| Hafnað | filter chip b… | `.suggestions-filters .filter-btn[data-filte…` | Anyone who gets the review interface open; … | Marks the chip active and re-renders the suggestion list for that status (the „Samþykkt“ chip also shows „mod… |
| Samþykkja (on a pending suggestion) | button | `#rv-suggestions-list .suggestion-actions .b…` | Anyone who gets the review interface open; … | Marks the suggestion accepted (status, reviewer and time in localization_suggestions; localizationSuggestions… |
| Breyta (on a pending suggestion) | button (opens… | `#rv-suggestions-list .suggestion-actions .b…` | Anyone who gets the review interface open; … | Fills the „Breyta tillögu“ modal with the original text, the suggestion (both read-only) and an editable copy… |
| Hafna (on a pending suggestion) | button | `#rv-suggestions-list .suggestion-actions .b…` | Anyone who gets the review interface open; … | Marks the suggestion rejected and reloads the list. |
| Bæta við | button (opens… | `#rv-review-interface .log-header button` | Anyone who gets the review interface open; … | Clears the five fields of the „Bæta við færslu“ modal (type preset to „Annað“) and shows it. |
| × (Breyta tillögu) | icon button | `#edit-modal .btn-close` | Anyone who gets the review interface open; … | Hides the modal; the typed text is discarded without a question. |
| Upprunalegt | label | `#edit-modal label (1st)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (read-only field under „Upprunalegt“) | text input (r… | `#edit-original` | Anyone who gets the review interface open; … | Shows the detected original text. Not editable. |
| Tillöga | label | `#edit-modal label (2nd)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (read-only field under „Tillöga“) | text input (r… | `#edit-suggested` | Anyone who gets the review interface open; … | Shows the machine suggestion. Not editable. |
| Þín breyting | label | `#edit-modal label (3rd)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (field under „Þín breyting“; placeholder „Slá… | text input | `#edit-modified` | Anyone who gets the review interface open; … | Editable replacement text, prefilled with the earlier modification or the suggestion (js:2172-2173). Not insi… |
| Hætta við (Breyta tillögu) | button | `#edit-modal .modal-footer .btn-secondary` | Anyone who gets the review interface open; … | Hides the modal without saving. |
| Vista (Breyta tillögu) | button | `#edit-modal .modal-footer .btn-primary` | Anyone who gets the review interface open; … | Empty field: alert „Breyting er nauðsynleg“. Otherwise stores the text AND sets the suggestion's status to "m… |
| × (Bæta við færslu) | icon button | `#log-modal .btn-close` | Anyone who gets the review interface open; … | Hides the modal; typed text is discarded without a question. |
| Tegund | label | `#log-modal label (1st)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (type select: Einingaumreikningur \| Menninga… | select | `#log-type` | Anyone who gets the review interface open; … | Value is sent as "type". The server stores it in the segment_id column and matches it against a hyphenated ca… |
| Upprunalegt | label | `#log-modal label (2nd)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (field; placeholder „Upprunalegur texti...“) | text input | `#log-original` | Anyone who gets the review interface open; … | Required. Stored as previous_content. |
| Breytt í | label | `#log-modal label (3rd)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (field; placeholder „Nýr texti...“) | text input | `#log-changed` | Anyone who gets the review interface open; … | Required. Stored as new_content. |
| Ástæða | label | `#log-modal label (4th)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (textarea; placeholder „Hvers vegna var breyt… | textarea | `#log-reason` | Anyone who gets the review interface open; … | Required by the client and by the server check, but the server never stores it (routes/localization-editor.js… |
| Staðsetning (valfrálst) | label | `#log-modal label (5th)` | Anyone who gets the review interface open; … | Static text label. It has no for= attribute and does not wrap its field, so it is not programmatically tied t… |
| (field; placeholder „t.d. Málsgrein 3“) | text input | `#log-location` | Anyone who gets the review interface open; … | Optional. Sent as "location"; the server ignores it. |
| Hætta við (Bæta við færslu) | button | `#log-modal .modal-footer .btn-secondary` | Anyone who gets the review interface open; … | Hides the modal without saving. |
| Vista (Bæta við færslu) | button | `#log-modal .modal-footer .btn-primary` | Anyone who gets the review interface open; … | If original, new text or reason is empty: alert „Breyting er nauðsynleg“. If the section has no module id: al… |
| Aðvörun: Þessi eining er opin í öðrum flipa. … | warning banne… | `#tab-guard-warning / #tab-guard-dismiss` | any role with a module open in two tabs | „Hunsa“ hides the orange banner. The banner is shown when another browser tab of the same browser has claimed… |
| (toast messages, e.g. „Vista mistókst — reyni… | notification … | `#toast-container .toast` | any role | Shown bottom-centre. Ordinary toasts disappear after 5 s; toasts created with persistent=true (the final save… |
| (hamburger icon; aria-label „Opna valmynd“) | icon button (… | `#hamburger-btn` | every signed-in role | Toggles the sidebar and its dark overlay on narrow screens. |
| (sidebar overlay) | backdrop clic… | `#sidebar-overlay` | every signed-in role | Closes the mobile sidebar. |
| Heim | sidebar nav l… | `.sidebar a.nav-link[href="/"]` | every signed-in role | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Ritill | sidebar nav l… | `.sidebar a.nav-link[href="/editor"]` | every signed-in role | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Framvinda | sidebar nav l… | `.sidebar a.nav-link[href="/progress"]` | every signed-in role | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Orðasafn | sidebar nav l… | `.sidebar a.nav-link[href="/terminology"]` | every signed-in role | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Yfirlestrar | sidebar nav l… | `.sidebar a.nav-link[href="/editor?view=revi…` | admin, head-editor, editor (group #sidebar-… | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Aðlögun | sidebar nav l… | `.sidebar a.nav-link[href="/localization"]` | admin and head-editor only (layout.js:421-4… | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Stjórnandi | sidebar nav l… | `.sidebar a.nav-link[href="/admin"]` | admin only (layout.js:414-418) | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Bókasafn | sidebar nav l… | `.sidebar a.nav-link[href="/library"]` | admin, head-editor (group #sidebar-section-… | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Úthlutanir | sidebar nav l… | `.sidebar a.nav-link[href="/assignments"]` | admin, head-editor (group #sidebar-section-… | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Um mig | sidebar nav l… | `.sidebar a.nav-link[href="/profile"]` | every signed-in role (layout.js:406-409) | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Ábendingar | sidebar nav l… | `.sidebar a.nav-link[href="/feedback"]` | everyone | Full page navigation. If the open module has unsaved changes the browser shows its own leave-page prompt (bef… |
| Skoða sem: [Stjórnandi (raunhlutverk) \| Aðal… | select (shell… | `#role-preview-select` | actual admin only (layout.js:445-448) | Stores a preview role in sessionStorage and re-applies sidebar/role-class visibility. This page does not list… |
| (theme toggle; title/aria-label „Skipta um þe… | button (shell) | `.sidebar-footer button.theme-toggle` | every signed-in role | Switches light/dark theme and stores it in localStorage key theme. |
| Innskrá (sidebar) / Innskrá (topbar button) | link (shell) | `#sidebar-user-info a[href="/login"], #user-…` | only when /api/auth/me reports no user | Goes to /login. Shown only when no user could be loaded; a signed-in user sees avatar and name instead (layou… |
| (bell icon; title/aria-label „Tilkynningar“) | icon (shell, … | `#notification-bell, #notification-count` | nobody | Nothing: created with style display:none and no script ever shows it or binds a handler. |
| (logout icon; title/aria-label „Útskrá“) | icon button (… | `#logout-btn` | every signed-in role | POSTs the logout, clears the cached auth and navigates to /login. The session is ended BEFORE the browser ask… |

**my-work** (41 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Stillingar (title: Tilkynningastillingar) | button (opens… | `#settings-btn` | Every signed-in user (admin, head-editor, e… | Shows #settings-modal (display:flex), then loadNotificationPreferences() (1806-1839) puts a spinner in the li… |
| Nákvæmt yfirlit | button (view … | `#focus-view .view-toggle button:nth-child(2)` | Every signed-in user. | Hides #focus-view, shows #detailed-view, calls loadDetailedView() (1361-1373), which fetches once, caches in … |
| Einbeitt sýn | button (view … | `#detailed-view .view-header button` | Every signed-in user. | Shows #focus-view, hides #detailed-view, writes localStorage 'myWorkView'. No request. |
| Sjá orðasafn | link | `#detailed-view .card-footer a[href='/termin…` | Every signed-in user, in the detailed view. | Navigates to /terminology (views.js:51, any signed-in user). |
| Sjá allt | link | `#admin-view .activity-panel a[href='/progre…` | admin, head-editor (real role). | Navigates to /progress (views.js:50), which opens on its 'Yfirlit' tab. |
| Stillingar (dialog container; heading 'Stilli… | modal (role=d… | `#settings-modal` | Every signed-in user who presses 'Stillinga… | Holds the preference list (#preference-list) and the three buttons below. |
| × (no aria-label, no title) | icon button (… | `#settings-modal .btn-close` | Every signed-in user. | Hides the modal. Ticks changed but not saved are dropped without a prompt; the list is rebuilt from the serve… |
| Hætta við | button | `#settings-modal .modal-footer .btn-secondary` | Every signed-in user. | Same as ×: hides the modal and discards unsaved ticks. |
| Vista | button (save) | `#settings-modal .modal-footer .btn-primary` | Every signed-in user. The server refuses vi… | Reads the two checkboxes of every .preference-item into {category: {inApp, email}} and PUTs it. Success: clos… |
| Skoða úrlausnir | link (primary… | `#current-task-card .empty-task a.btn` | admin and head-editor only, and only when t… | Navigates to the editor in review mode: the status filter is preset to 'pending' and a banner 'Sýnir einingar… |
| Laga nú | link (large p… | `#current-task-card .task-actions a.btn` | Any signed-in user who authored an edit tha… | Navigates to the legacy path, which answers 301 to /editor with the same query (views.js:70-73); the editor t… |
| <bók> K<n>/<module id> [Laga] -> (one row per… | link (list ro… | `#up-next-list a.up-next-item` | Same users as control 11, when they have tw… | Opens the task's module in the editor through the same 301 redirect. |
| Sýna N fleiri verkefni | accordion tog… | `#up-next-more-accordion .accordion-header` | Same users as control 11, when more than th… | Toggles the class 'collapsed' on the wrapper; CSS hides or shows the body (common.css:1838-1844). The text an… |
| Skoða (row in 'Bíður yfirlestrar') | link (small s… | `#submissions-list .work-item-action a` | Any signed-in user with own pending edits; … | Opens the module that holds the user's own pending edit (301 to /editor). |
| Laga (row in 'Breytingar óskast') | link (small p… | `#changes-list .work-item-action a` | Any signed-in user with own rejected or dis… | Opens the module that holds the rejected or discuss edit (301 to /editor). |
| Skoða (attention item) | button | `#attention-items .attention-item-action` | admin, head-editor (real role). | type 'review' -> /editor?view=reviews; type 'unassigned' -> /assignments?book=<book> (assignments.js:375-379 … |
| Sýna N fleiri atriði | accordion tog… | `#attention-more-accordion .accordion-header` | admin, head-editor, when more than five att… | Toggles 'collapsed' on the wrapper. Re-rendered collapsed every 120 seconds. |
| Kafli N / <module id> [N samþykkt] <book slug… | link (card ro… | `#ready-list a.ready-item` | admin, head-editor. | Opens that module in the editor (deep link, public/js/segment-editor.js:4541-4559). |
| Sýna N fleiri (ready list) | accordion tog… | `#ready-more-accordion .accordion-header` | admin, head-editor, when more than four rea… | Toggles 'collapsed' on the wrapper. |
| Sýna N fleiri (team activity) | accordion tog… | `#activity-more-accordion .accordion-header` | admin, head-editor, when more than five act… | Toggles 'collapsed' on the wrapper. |
| Í appinu (one per category: Yfirlestrar, Úthl… | checkbox | `#pref-reviews-inApp, #pref-assignments-inAp…` | Every signed-in user who opens the modal. | Nothing until 'Vista'. Stored, it decides whether a notification row is written for that category (services/n… |
| Tölvupóstur (one per category) | checkbox | `#pref-reviews-email, #pref-assignments-emai…` | Every signed-in user who opens the modal. | Nothing until 'Vista'. Stored, it is consulted only on a send path that no code invokes (services/notificatio… |
| Heim | sidebar nav l… | `#app-sidebar a.nav-link[href='/']` | Everyone (no role condition). | Reloads this page. Highlighted as active here (layout.js:244-261: pathname '/' equals the data-path '/'). |
| Ritill | sidebar nav l… | `#app-sidebar a.nav-link[href='/editor']` | Everyone (no role condition), viewers and v… | Navigates to /editor (views.js:49, any signed-in user). |
| Framvinda | sidebar nav l… | `#app-sidebar a.nav-link[href='/progress']` | Everyone. | Navigates to /progress (views.js:50, any signed-in user). |
| Orðasafn | sidebar nav l… | `#app-sidebar a.nav-link[href='/terminology']` | Everyone. | Navigates to /terminology (views.js:51, any signed-in user). |
| Yfirlestrar (under the section label 'Yfirles… | sidebar nav l… | `#sidebar-section-review a.nav-link[href='/e…` | admin, head-editor, editor (effective role;… | Navigates to the editor in review mode (same destination as control 10). |
| Aðlögun | sidebar nav l… | `#nav-localization` | admin, head-editor (layout.js:391, 421-424). | Navigates to the localization editor (views.js:53-55, any signed-in user). |
| Stjórnandi (under the section label 'Stjórnun… | sidebar nav l… | `#nav-admin` | admin only (layout.js:414-418); the surroun… | Navigates to the admin panel (views.js:57, admin only). |
| Bókasafn | sidebar nav l… | `#sidebar-section-admin a.nav-link[href='/li…` | admin, head-editor. | Navigates to /library (views.js:56, any signed-in user). |
| Úthlutanir | sidebar nav l… | `#sidebar-section-admin a.nav-link[href='/as…` | admin, head-editor. | Navigates to /assignments (views.js:58-60, head-editor or above). |
| Um mig | sidebar nav l… | `#nav-profile` | Any signed-in user (layout.js:406-409). | Navigates to the profile page (views.js:61, any signed-in user). |
| Ábendingar | sidebar nav l… | `#app-sidebar a.nav-link[href='/feedback']` | Everyone. | Navigates to the public feedback form (views.js:64, no page gate). |
| Skoða sem: (options: Stjórnandi (raunhlutverk… | select (role … | `#role-preview-select` | Real admins only (layout.js:445-448). | Stores the choice in sessionStorage 'rolePreviewOverride' (or removes it), then re-runs updateRoleVisibility … |
| Skipta um þema (icon button; visible text 'Di… | icon button (… | `#app-sidebar .theme-toggle` | Everyone. | Switches data-theme between dark and light and stores it in localStorage 'theme' (theme.js:22-28). |
| Innskrá (sidebar footer) | link | `#sidebar-user-info a.nav-link[href='/login']` | Shown until the user is known and whenever … | Navigates to the local login page (views.js:48). |
| Opna valmynd (icon button, aria-label) | icon button (… | `#hamburger-btn` | Everyone, at viewport widths below 1024px o… | Toggles the class 'open' on the sidebar and 'active' on the overlay. |
| (sidebar overlay, no text) | click target … | `#sidebar-overlay` | Everyone, only while the mobile sidebar is … | Closes the mobile sidebar (removes 'open' and 'active'). |
| Tilkynningar (bell icon with unread badge; ti… | indicator (di… | `#notification-bell, #notification-count` | Nobody. | Nothing. It is never displayed. |
| Útskrá (icon button; title and aria-label) | icon button (… | `#logout-btn` | Any signed-in user. | POSTs the logout, removes sessionStorage 'authCache', then goes to /login whatever the request returned. The … |
| Innskrá (topbar) | link (small s… | `#user-info a[href='/login']` | Only when /api/auth/me fails or reports not… | Navigates to the local login page. |

**segment-editor** (95 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Bók | label | `label[for=book-select]` | any signed-in user (page gate has no minimu… | Names the book select. |
| (book select; options are book labels, e.g. E… | select | `#book-select.book-select` | any signed-in user; the chapters call is re… | Sets the current book, enables the chapter select, fetches the chapters and fills „Kafli N — titill“ / „Viðau… |
| Kafli | label | `label[for=chapter-select]` | any signed-in user | Names the chapter select. |
| Veldu kafla... / Kafli N — <titill> / Viðaukar | select | `#chapter-select` | any signed-in user; data needs editor+ | Loads the chapter's modules and draws one card per module with badges EN / MT / Ritstýrt / Staðfært / ⚠ n. Em… |
| <section> <module title> (tooltip „<moduleId>… | clickable car… | `#modules-container .module-card` | anyone who got a module list (editor+) | Opens the module: fetches segments, edits, acceptances and AI suggestions, hides the picker, renders the tabl… |
| ← Til baka | button | `#btn-back` | anyone with a module open (editor, head-edi… | Leaves the module: deletes the module's stored drafts and all unsaved pane text (only texts kept by a refused… |
| Senda til yfirlestrar (title: Sendir allar br… | button | `#btn-submit` | anyone with a module open | If the module has no pending edits: alert „Engar breytingar til að senda.“. Otherwise confirm, POST submit, s… |
| (placeholder) Samhengisleit — leitaðu í fyrri… | text input | `#concordance-q` | anyone with a module open | Runs the concordance search (same as „Leita“). |
| Leita | button | `#btn-concordance` | anyone with a module open | Needs 2+ characters („Sláðu inn a.m.k. 2 stafi.“); lists earlier applied EN/IS pairs of the current book with… |
| <moduleId> · kafli N ↗ (concordance hit sourc… | link (new tab) | `#concordance-results a.concordance-prov` | anyone with a module open | Opens that module in a new tab; the legacy path is redirected to /editor with the query kept (views.js:70-73)… |
| Endurtekningar í kafla | button | `#btn-repetition-report` | client: effective role head-editor or admin… | Lists English sentences repeated in the chapter and whether their translations agree (✓ / ⚠, ×n, k þýðingar).… |
| Yfirlestur (title: Málfræði- og stafsetningar… | button | `#btn-spellcheck` | client: head-editor or admin only, although… | Asks the server to proofread the module; the server sends every segment's Icelandic text, one request per seg… |
| <short segment id> (title „Fara í þennan bút“… | button | `#review-summary-terms .rs-jump` | client: head-editor or admin (list comes fr… | Scrolls to and marks that segment row (the accept cursor); if the row is filtered out it resets all three fil… |
| Rás: | label (no for) | `#pipeline-panel label` | client: head-editor or admin | Visual label for the track select. |
| Bein þýðing (faithful) \| MT forskoðun \| Sta… | select | `#pipeline-track` | client: head-editor or admin | Chooses which track the three pipeline buttons act on. |
| Innsetja (title: Setja þýðingar inn í CNXML) | button | `#btn-inject` | client: head-editor or admin, not scoped by… | Starts a server job that runs tools/cnxml-inject.js for this book, chapter, module and track (writes translat… |
| Birta (title: Breyta CNXML í HTML) | button | `#btn-render` | client: head-editor or admin | Starts a server job that runs tools/cnxml-render.js (writes HTML under books/<book>/05-publication/<track>/) … |
| Innsetja + Birta (title: Setja inn og birta) | button | `#btn-pipeline` | client: head-editor or admin | Starts inject then render in one job and advances the chapter's injection and rendering status. |
| Forskoðun (eye icon; title: Birta þýðingu sem… | button | `#btn-preview` | anyone with a module open | Fetches server-rendered HTML of the module's last INJECTED CNXML for the chosen track and writes it into a ne… |
| MT \| Bein þýðing | select | `#preview-track` | anyone with a module open | Chooses the track the preview renders (mt-preview or faithful). |
| Vista í skrár (title: Vista samþykktar breyti… | button | `#btn-apply` | client: head-editor or admin | Writes all approved edits and MT confirmations of the module into the faithful translation file on the server… |
| Vista + Birta (title: Vista í skrár og birta … | button | `#btn-apply-render` | client: head-editor or admin | Applies as above, then starts inject + render for the faithful track and polls; badge ends „Vistað + Birt!“ o… |
| Útgáfusaga (title: Skoða eldri útgáfur og fær… | button | `#btn-history` | client: head-editor or admin (the read rout… | Opens the version-history modal and lists the module's snapshots (who · when, „Útgáfa N (M einingar · nýjasta… |
| Útgáfusaga (modal container, role=dialog aria… | modal dialog | `#vh-overlay .vh-modal` | head-editor or admin (client) | Holds the version list; caption „Hver útgáfa sýnir efnið eins og það var áður en viðkomandi vistun átti sér s… |
| Loka | button | `#vh-close` | head-editor or admin (client) | Closes the version-history modal. |
| Færa í þessa útgáfu | button (one p… | `#vh-list .vh-restore[data-version]` | client: head-editor or admin | After a confirm, rewrites the module's faithful file from that snapshot (current content is snapshotted first… |
| (click on the dark overlay) | click target | `#vh-overlay` | head-editor or admin | Closes the modal. |
| Sýna: | label (no for) | `.filter-bar label (1st)` | anyone with a module open | Visual label for the type filter. |
| Allir hlutar \| Með breytingum \| Bíður yfirl… | select (filte… | `#filter-type` | anyone with a module open | Re-renders the table showing only segments with any edit / with a pending edit / with term issues / of type t… |
| Staða: | label (no for) | `.filter-bar label (2nd)` | anyone with a module open | Visual label for the status filter. |
| Allir \| Óbreyttir \| Óyfirfarnir \| Breytt \… | select (filte… | `#filter-status` | anyone with a module open | Filters rows by the latest edit's status, by „no edit“, by active MT confirmation, or by the unreviewed backl… |
| Flokkur: | label (no for) | `.filter-bar label (3rd)` | anyone with a module open | Visual label for the category filter. |
| Allir flokkar \| Hugtök \| Nákvæmni \| Læsile… | select (filte… | `#filter-category` | anyone with a module open | Shows only segments that have an edit in that category. |
| (placeholder) Fletta upp hugtaki... | text input (t… | `#term-lookup` | anyone with a module open | From 2 characters, looks the term up for the current book and shows a dropdown „english → íslenska ✓ [subject… |
| <english> → <íslenska> … (lookup result) | clickable row… | `#term-lookup-results .term-lookup-item` | anyone with a module open | Inserts „__<term>__“ (term markup) at the caret of the last-focused pane textarea and shows „Sett inn!“; if n… |
| Litaskýring flokka (expandable legend) | details | `details.category-legend` | anyone with a module open | Shows the five category colours with one-line meanings. |
| Litaskýring flokka | summary (expa… | `details.category-legend > summary` | anyone with a module open | Expands / collapses the legend. |
| × (no title, no aria-label) | button (icon … | `#term-popup .term-popup-close` | anyone with a module open | Closes the term popup. |
| Opna í orðasafni → | link (new tab) | `#term-popup-body a[href='/terminology']` | anyone with a module open | Opens the glossary page (not the specific term). |
| <highlighted glossary term in the English tex… | clickable span | `.col-en .term-highlight[data-term-id]` | anyone with a module open | Opens a popup with the term's Icelandic translations, status mark (✓ / …), subject badges and ★ for the prima… |
| <English block key> (aria-label = key) — figu… | text input, o… | `#figure-cards [data-block-input]` | anyone with a module open, when the module … | Edits one label of a translated figure; unsaved text is bold-bordered and kept in a localStorage draft (figSa… |
| Vista (figure block) | button | `#figure-cards [data-block-save]` | anyone with a module open | Saves that block's text (DB row figure_block_edit) and rebuilds all cards, carrying other unsaved fields over… |
| Nota (aria-label „Nota tillögu fyrir <key>“) … | button | `#figure-cards [data-block-apply] (decimal s…` | anyone with a module open | Saves the server's decimal-comma suggestion to the server immediately (not just into the field). Disabled whi… |
| Nota (aria-label „Nota orðalag stakra merking… | button | `#figure-cards [data-block-apply] (per-label…` | anyone with a module open | Saves the alternative MT wording to the server immediately. |
| (placeholder) Athugasemd (valkvæð) — aria-lab… | text input | `#figure-cards [data-figure-note-input]` | anyone with a module open | Optional note sent with Samþykkja / Merkja villu. |
| Samþykkja (figure) | button | `#figure-cards [data-figure-approve]` | anyone with a module open | Records the figure text as approved and writes the figure's sidecar file, then rebuilds the cards. Failure → … |
| Merkja villu (figure) | button | `#figure-cards [data-figure-flag]` | anyone with a module open | Flags the figure text as wrong (kind text) and writes the sidecar file. |
| Breyta — or „Breyta aftur“ on a published seg… | button | `tr.segment-row .btn-edit` | any role, when segmentEditAllowed (1673-168… | Opens the inline edit pane under the Icelandic text (preview, format toolbar, textarea prefilled with the sho… |
| ✓ Staðfesta MT (title: Staðfesta að vélþýðing… | button | `tr.segment-row .btn-accept` | any role, when the row is accept-eligible (… | Records that the editor confirms the machine translation of this segment as it stands, moves the keyboard cur… |
| ↩ Afturkalla staðfestingu (shown beside the c… | button | `tr.segment-row button[onclick^=revokeAccept…` | client: the user who confirmed it, or effec… | After a confirm, withdraws the MT confirmation; the segment counts as unreviewed again; reloads the module. |
| 💬 Umræða (title: Skoða umræðuefnið og svara) | button | `tr.segment-row .btn-thread` | any role, on rows whose latest edit has sta… | Opens the discussion dialog: the head editor's topic (reviewer note) and the replies. |
| ✓ (title: Samþykkja) | button (icon … | `tr.segment-row .btn-approve` | client: effective role head-editor or admin… | Approves the pending edit immediately and reloads the module. Server also closes AI suggestions the approved … |
| ✗ (title: Hafna) | button (icon … | `tr.segment-row .btn-reject` | client: head-editor or admin, latest edit p… | Asks for a reason in a native prompt („Ástæða höfnunar:“; Cancel aborts, empty is accepted), rejects the edit… |
| 💬 (title: Ræða) | button (icon … | `tr.segment-row .btn-discuss` | client: head-editor or admin, latest edit p… | Asks for a topic in a native prompt („Umræðuefni:“), marks the edit for discussion and reloads. |
| ↺ Opna aftur (title: Opna aftur til yfirferða… | button | `tr.segment-row .btn-reopen` | client: head-editor or admin, latest edit d… | Returns a rejected or discussed edit to pending and reloads. Server clears the reviewer, the reviewer note an… |
| ↩ Afturkalla (title: Afturkalla samþykki — br… | button | `tr.segment-row button[onclick^=unapproveEdi…` | client: head-editor or admin, latest edit a… | After a confirm, returns an approved, not yet applied edit to pending and reloads. |
| Nota þessa þýðingu (inside the green hint „✓ … | button | `tr.segment-row .repetition-hint button` | any role, on any row that has a repetition … | Opens the edit pane and replaces its whole text with the translation already approved elsewhere; nothing is s… |
| ✓ Nota (aria-label „Nota tillögu“) · „✓ Nota … | button | `tr.segment-row .sugg-btn.sugg-nota[data-gro…` | any role, on rows that carry suggestions an… | Opens the pane if needed and writes the suggested term change(s) into the pane's text on screen only; the ser… |
| ✗ Hafna (aria-label „Hafna tillögu“) · „✗ Haf… | button | `tr.segment-row .sugg-btn.sugg-hafna[data-gr…` | as „✓ Nota“ | Rejects the suggestion group on the server and removes it from the row in place; failure → alert „Ekki tókst … |
| B (title: Feitletrað (Ctrl+B)) | button (forma… | `.edit-panel .format-toolbar .tb-bold` | anyone with an open pane | Wraps the selection in ** ** (or inserts the pair) and marks the pane changed. |
| I (title: Skáletrað (Ctrl+I)) | button (forma… | `.edit-panel .format-toolbar .tb-italic` | anyone with an open pane | Wraps the selection in * *. |
| T (title: Hugtak (Ctrl+T)) | button (forma… | `.edit-panel .format-toolbar .tb-term` | anyone with an open pane | Wraps the selection in __ __ (term markup). |
| U (underlined letter; no title) | button (forma… | `.edit-panel .format-toolbar button:nth-chil…` | anyone with an open pane | Wraps the selection in ++ ++ (underline). |
| x₂ (title: Niðurskrift) | button (forma… | `.edit-panel .format-toolbar button:nth-chil…` | anyone with an open pane | Wraps the selection in ~ ~ (subscript). |
| x² (title: Uppskrift) | button (forma… | `.edit-panel .format-toolbar button:nth-chil…` | anyone with an open pane | Wraps the selection in ^ ^ (superscript). |
| (edit textarea; no label or aria-label) | textarea | `#textarea-<cssId(segmentId)>` | anyone with an open pane | Holds the segment's Icelandic text with inline markers highlighted behind it. Unsaved text is copied to a loc… |
| Flokkur... \| Hugtök \| Nákvæmni \| Læsileiki… | select | `#cat-<id>` | anyone with an open pane | Optional category stored with the edit; preselected from the latest edit. |
| (placeholder) Athugasemd (valkvætt) | text input | `#note-<id>` | anyone with an open pane | Optional note stored with the edit (editor_note). |
| Vista (segment edit) | button | `.edit-panel .edit-controls .btn-primary` | anyone with an open pane | Validates markers (blocking alert „Ekki hægt að vista: …“ or warning confirm „Athugið: … Viltu halda áfram?“)… |
| Beita víðar (title: Beita þessari þýðingu á a… | button | `.edit-panel .btn-propagate` | anyone with an open pane | Saves the pane first if changed, asks the server where the same English text occurs in the book, and after a … |
| ↩ Endurstilla (title: Endurstilla bútinn í sí… | button | `.edit-panel .btn-revert` | anyone with an open pane | Replaces the pane's text with the shown baseline (the in-flight edit's text if there is one, else the file te… |
| Hætta við | button | `.edit-panel .edit-controls button:last-child` | anyone with an open pane | Closes the pane and discards what was typed. |
| (placeholder) Skrifaðu svar… | textarea | `#discussion-reply` | any role with the discussion dialog open | Reply text for the discussion thread. |
| Senda svar | button | `#discussion-send` | any role with the dialog open | Posts the reply and reloads the thread; empty text only focuses the field. Does not change the edit's status. |
| Loka (discussion dialog) | button | `#discussion-close` | any role with the dialog open | Closes the discussion dialog. |
| Skoða yfirlestur → (inside the toast „Sent ti… | link | `.toast.toast-success a[href='/editor']` | the user who just submitted | Reloads the editor page at the module picker. |
| Hunsa (in the banner „Aðvörun: Þessi eining e… | button | `#tab-guard-dismiss` | anyone with the same module open in two tab… | Dismisses the same-module-in-two-tabs warning in this tab. |
| Sýnir einingar sem bíða yfirlestrar (review-m… | status banner | `#review-mode-banner.review-banner` | anyone opening /editor?view=reviews | Static text inserted under the picker card when the URL has view=reviews. |
| Heim | sidebar link | `#app-sidebar a[href='/']` | everyone | Goes to the home page (my-work). |
| Ritill | sidebar link | `#app-sidebar a[href='/editor']` | everyone, including viewer (flag 13) | Reloads the editor at the picker (leaves review mode). |
| Framvinda | sidebar link | `#app-sidebar a[href='/progress']` | everyone | Goes to the progress page. |
| Orðasafn | sidebar link | `#app-sidebar a[href='/terminology']` | everyone | Goes to the glossary page. |
| Yfirlestrar (under section label „Yfirlestur“) | sidebar link | `#sidebar-section-review a[href='/editor?vie…` | admin, head-editor, editor (updateRoleVisib… | Opens this page in the review view. |
| Aðlögun | sidebar link | `#nav-localization` | admin and head-editor (layout.js:420-424) | Goes to the localization editor. |
| Stjórnandi (under „Stjórnun“) | sidebar link | `#nav-admin` | admin only (layout.js:411-418) | Goes to the admin page. |
| Bókasafn | sidebar link | `#sidebar-section-admin a[href='/library']` | admin and head-editor | Goes to the library page. |
| Úthlutanir | sidebar link | `#sidebar-section-admin a[href='/assignments…` | admin and head-editor | Goes to the assignments page. |
| Um mig | sidebar link | `#nav-profile` | any authenticated user (layout.js:405-409) | Goes to the profile page. |
| Ábendingar | sidebar link | `#app-sidebar a[href='/feedback']` | everyone | Goes to the feedback form. |
| Skoða sem: Stjórnandi (raunhlutverk) \| Aðalr… | select (role … | `#role-preview-select` | real role admin only (layout.js:444-448) | Makes the page draw as if the admin had a lower role. On this page the change immediately re-evaluates only t… |
| (sun/moon icon) Ljóst / Dimmt — title „Skipta… | button | `#app-sidebar .theme-toggle` | everyone | Switches light/dark theme and stores it in localStorage. |
| (hamburger icon) aria-label „Opna valmynd“ | button | `#hamburger-btn (and #sidebar-overlay)` | everyone; displayed only under the mobile b… | Opens/closes the sidebar on narrow screens. |
| (bell icon) title/aria-label „Tilkynningar“ w… | div styled as… | `#notification-bell, #notification-count` | nobody | Nothing. It is created with display:none and no script ever shows it or attaches a handler. |
| (logout icon) title/aria-label „Útskrá“, next… | button | `#logout-btn` | any signed-in user | Posts logout, clears the cached auth and goes to /login. |
| Innskrá | link (fallbac… | `#sidebar-user-info a[href='/login'], #user-…` | shown only when /api/auth/me reports no use… | Goes to the login page. |

**Ábendingar (server/views/feedback.html)** (13 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Villa í þýðingu — Villa í þýðingu eða merkingu | radio (name=t… | `input[name=type][value=translation_error]` | everyone (anonymous included) | Chooses the report type. On the server this type with a book set additionally creates notification rows for t… |
| Tæknilegt vandamál — Tæknilegt vandamál eða b… | radio (value=… | `input[name=type][value=technical_issue]` | everyone | Chooses the report type; the server stores this type with priority 'high' (server/routes/feedback.js:84-87). |
| Tillaga að bætingu — Tillaga um hvernig má bæ… | radio (value=… | `input[name=type][value=improvement]` | everyone | Chooses the report type. |
| Annað — Annað sem þú vilt koma á framfæri | radio (value=… | `input[name=type][value=other]` | everyone | Chooses the report type. |
| Bók (valfrjálst) — placeholder option '-- Vel… | select (optio… | `#book.book-select` | everyone | Lists every registered book title. On load it selects the URL value (never effective here), else the book sto… |
| Kafli — placeholder 't.d. 1 eða 1.2' | text input | `#chapter` | everyone | Free text stored as feedback.chapter. |
| Hluti — placeholder 't.d. 1-1' | text input | `#section` | everyone | Free text stored as feedback.section; the server and the admin page use it as the module id in /segment-edito… |
| Lýsing * — placeholder 'Lýstu vandamálinu eða… | textarea (req… | `#message` | everyone | The report text; sent trimmed as 'message'. |
| Nafn (valfrjálst) — placeholder 'Nafnið þitt' | text input | `#userName` | everyone | Optional sender name. If empty and the sender is signed in, the server stores the account name instead (serve… |
| Netfang (valfrjálst) — placeholder 'netfang@d… | email input | `#userEmail` | everyone | Optional sender address; stored and shown to admins. No code sends anything to it. |
| Senda endurgjöf (while sending: spinner + 'Se… | submit button | `#submit-btn` | everyone | Validates type and length, disables itself, POSTs the report, then hides the form and shows the thanks panel,… |
| Takk fyrir! / Endurgjöfin þín hefur verið mót… | clickable <di… | `#success-message` | everyone, after a successful send | Hides the thanks panel and shows the (already reset) form again. |
| Stjórnborð endurgjafar | link styled a… | `#admin-link a[href='/admin/feedback']` | effective role admin only (.admin-role-only… | /admin/feedback → 301 → /admin?tab=feedback (server/routes/views.js:96); /admin requires the admin role (view… |

**Um mig (server/views/profile.html)** (9 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Fullt nafn | text input (m… | `#profile-name` | signed-in users who have an account row (an… | Edits users.display_name. The value is overwritten with the Microsoft name at the next sign-in and never reac… |
| Netfang — hint 'Netfang kemur frá Microsoft i… | email input, … | `#profile-email` | users with an account row | Display only. |
| Skóli — placeholder 't.d. Menntaskólinn í Rey… | text input (m… | `#profile-school` | users with an account row | Stores users.school. Shown nowhere else in the interface (flag small-pages-18). |
| Kennslugrein — placeholder 't.d. Efnafræði' | text input (m… | `#profile-subject` | users with an account row | Stores users.subject. Shown nowhere else. |
| Stutt lýsing — placeholder 'Stutt lýsing (val… | textarea (row… | `#profile-bio` | users with an account row | Stores users.bio. Shown nowhere else. |
| Hlutverk — badge 'Stjórnandi' / 'Aðalritstjór… | read-only bad… | `#profile-role` | users with an account row | Shows the real role from the database (not the admin's 'Skoða sem' preview). An unknown role value would be s… |
| Vista breytingar (while saving: 'Vista...') | button (type=… | `#profile-save-btn` | users with an account row; server accepts t… | PUTs displayName, school, subject and bio (always all four), shows the toast 'Vistað' and clears the 60-secon… |
| ← Til baka (guest panel) | link styled a… | `#profile-loading a[href='/']` | visitors (signed in, role viewer, no users … | Goes to '/' (Heim), not to the previous page. |
| ← Til baka (error panel) | link styled a… | `#profile-loading a[href='/']` | anyone whose profile request failed | Goes to '/'. No retry control. |

**Innskráning (server/views/login.html)** (2 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Skrá inn með Microsoft | link styled a… | `a.github-btn` | everyone | Server stores a state token in memory and redirects to login.microsoftonline.com (server/routes/auth.js:55-79… |
| Hlutverk — Stjórnandi: Kerfisstjóri / Aðalrit… | static list (… | `.roles .role-list` | everyone | Information only. |

**404 (server/views/404.html)** (5 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Til baka á forsíðu | link styled a… | `a.home-link` | everyone | Goes to '/' (requirePageAuth: signed-out users continue to /login?redirect=%2F). |
| Heim | link | `.help-links-list a[href='/']` | everyone | Same target as control 1 under a different name. |
| Ritill | link | `.help-links-list a[href='/editor']` | everyone | Goes to /editor (any signed-in role; views.js:49). |
| Orðasafn | link | `.help-links-list a[href='/terminology']` | everyone | Goes to /terminology (any signed-in role; views.js:51). |
| Framvinda | link | `.help-links-list a[href='/progress']` | everyone | Goes to /progress (any signed-in role; views.js:50). |

**server/public/js/bookSelector.js (shared script; fills every select.b…** (3 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| placeholder option 'Veldu bók...' (default) /… | js-built <opt… | `select.book-select > option[value='']` | whoever sees the host select | First option of every book dropdown. For selects without data-allow-all it is not left selected when at least… |
| book options | js-built <opt… | `select.book-select > option` | whoever sees the host select | Order of preference on load: value already on the select or data-default, else the stored book, else the firs… |
| window.bookSelector.init / fetchBooks | script API | `window.bookSelector` | n/a | Lets a page re-populate selects; the list is cached per page load once fetched successfully. |

**Shared shell as rendered on /feedback and /profile (server/public/js/…** (18 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Heim | nav link | `.sidebar a[href='/']` | everyone, including anonymous visitors of /… | → / (signed-out users continue to /login?redirect=%2F) |
| Ritill | nav link | `.sidebar a[href='/editor']` | everyone | → /editor |
| Framvinda | nav link | `.sidebar a[href='/progress']` | everyone | → /progress |
| Orðasafn | nav link | `.sidebar a[href='/terminology']` | everyone | → /terminology |
| Yfirlestrar (under 'Yfirlestur') | nav link | `#sidebar-section-review a[href='/editor?vie…` | effective role editor, head-editor, admin (… | → /editor?view=reviews |
| Aðlögun | nav link | `#nav-localization` | effective role admin or head-editor (layout… | → /localization |
| Stjórnandi (under 'Stjórnun') | nav link | `#nav-admin` | effective role admin (layout.js:414-418) | → /admin |
| Bókasafn | nav link | `#sidebar-section-admin a[href='/library']` | effective role admin or head-editor | → /library |
| Úthlutanir | nav link | `#sidebar-section-admin a[href='/assignments…` | effective role admin or head-editor | → /assignments |
| Um mig | nav link | `#nav-profile` | any signed-in user (layout.js:405-409) | → /profile |
| Ábendingar | nav link | `.sidebar a[href='/feedback']` | everyone | → /feedback |
| Skoða sem: — Stjórnandi (raunhlutverk) / Aðal… | select | `#role-preview-select` | actual admins only (layout.js:444-448) | Changes only what the interface shows to an admin; server permissions are unchanged. On /feedback it hides 'S… |
| theme toggle — title/aria-label 'Skipta um þe… | button | `.theme-toggle` | everyone | Switches light/dark and stores it in localStorage 'theme'. |
| sidebar user area: name, or link 'Innskrá' | text or link | `#sidebar-user-info` | everyone | Shows who is signed in. |
| hamburger — aria-label 'Opna valmynd' | button | `#hamburger-btn` | everyone on narrow screens | Opens/closes the menu below 1024 px (common.css:813-841). |
| bell — title/aria-label 'Tilkynningar', badge… | <div> (not a … | `#notification-bell, #notification-count` | nobody | Nothing: both elements carry style=display:none and no code changes that. |
| log-out icon — title/aria-label 'Útskrá' | icon button | `#logout-btn` | signed-in users | POSTs log-out, clears the auth cache, goes to /login. No question is asked; unsaved text on the page is lost. |
| Innskrá (top bar) | link styled a… | `#user-info a[href='/login']` | signed-out visitors (only /feedback can sho… | → /login (no return address, so sign-in lands on '/') |

**Framvinda — server/views/status.html** (18 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| (no label) — options: 'Veldu bók...' followed… | select | `select#book-select.book-select` | All signed-in roles (admin, head-editor, ed… | Reloads the progress data for the chosen book (two requests per change, one from each handler), resets select… |
| ↻ (title 'Endurhlaða') | button | `.controls-row > button.btn.btn-sm.btn-secon…` | All signed-in roles. | Re-fetches the progress data and re-renders the Yfirlit tab. If a chapter has been opened since the last book… |
| Yfirlit | tab (button r… | `.tabs > button.tab-btn (1st)` | All signed-in roles. | Shows #tab-overview by toggling the class 'active' on the three tab buttons (matched by index) and on the thr… |
| Kaflayfirlit | tab (button r… | `.tabs > button.tab-btn (2nd)` | All signed-in roles. | Shows #tab-detail: the empty state until a chapter row has been clicked, otherwise the last opened chapter (w… |
| Tímalína | tab (button r… | `.tabs > button.tab-btn (3rd)` | All signed-in roles (the endpoint has no ro… | Shows #tab-timeline. Loads the first 30 activity rows only if #timeline-list has no children; afterwards the … |
| Chapter row, e.g. 'K3 [bar] 2/7 einingar ⚠ 42… | clickable div… | `#chapter-list > div.chapter-row` | All signed-in roles. | Marks the chapter selected, switches to the Kaflayfirlit tab, fills the four cards and the unit table from th… |
| Opna ritil | link styled a… | `a#detail-editor-link` | All signed-in roles — no gating, although t… | Opens the segment editor, which pre-selects the book and chapter from the query string (public/js/segment-edi… |
| Opna (one per unit row) | link styled a… | `#detail-modules-body a.btn` | All signed-in roles — no gating (flag statu… | Opens the editor and auto-loads that unit (public/js/segment-editor.js:4555-4559 -> loadModule). |
| Hlaða fleiri | button | `button#timeline-more` | All signed-in roles. | Adds 30 to the offset, fetches the next page for the CURRENTLY selected book and appends it to the list. |
| Sidebar: 'Heim', 'Ritill', 'Framvinda', 'Orða… | nav links | `#app-sidebar .sidebar-section:first-child a…` | Everyone, signed in or not (no role gating … | Page navigation. 'Framvinda' is the active item here. |
| Sidebar section 'Yfirlestur': 'Yfirlestrar', … | nav links | `#sidebar-section-review a.nav-link, #nav-lo…` | Section shown to admin, head-editor, editor… | Page navigation. |
| Sidebar section 'Stjórnun': 'Stjórnandi', 'Bó… | nav links | `#sidebar-section-admin a.nav-link, #nav-adm…` | Section shown to admin and head-editor (lay… | Page navigation. |
| Sidebar footer: 'Um mig', 'Ábendingar' | nav links | `#nav-profile, .sidebar-footer a[href='/feed…` | 'Um mig': any authenticated user (layout.js… | Page navigation. |
| 'Skoða sem:' — options 'Stjórnandi (raunhlutv… | select (role … | `#role-preview-select` | Real admins only (layout.js:445-448). | Lets a real admin preview the navigation as another role. Has no effect on the content of this page (nothing … |
| Theme button (title / aria-label 'Skipta um þ… | button | `button.theme-toggle` | Everyone. | ON THIS PAGE: nothing. status.html does not load theme.js, so window.toggleTheme is undefined (flag status-10… |
| Hamburger (aria-label 'Opna valmynd') | button | `#hamburger-btn` | Everyone, at viewport widths of 1023px and … | Opens/closes the sidebar on narrow screens. |
| Notification bell (title 'Tilkynningar') | div (not a bu… | `#notification-bell, #notification-count` | Nobody. | Nothing: rendered with display:none and never shown. |
| User name + logout button (title / aria-label… | button / link | `#logout-btn, #user-info a, #sidebar-user-in…` | Logout: any signed-in user. 'Innskrá': only… | Logout: POST /api/auth/logout (clears the cookie), clears the cached auth, goes to /login. 'Innskrá' goes to … |

**server/public/js/bookSelector.js — shared script that fills every sel…** (6 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| Veldu bók... (or the select's data-placeholde… | option (value… | `select.book-select > option:first-child` | Whoever sees the host select. | Placeholder. It is an ordinary selectable option (not disabled, not hidden) and is never left selected automa… |
| Allar bækur | option (value… | `select.book-select[data-allow-all=true] > o…` | Whoever sees the host select. | Replaces the placeholder when the select carries data-allow-all=true (only terminology.html:810 does). With a… |
| <book label> — one option per book | option (value… | `select.book-select > option[value]` | Everyone, including anonymous visitors of /… | Lists every slug in the server's VALID_BOOKS (config.js:98-104 defaults plus active rows of registered_books,… |
| (behaviour) automatic selection + synthetic c… | script behavi… | `n/a` | n/a | Selects, in this order: the value the select already has (always empty on first init, because it has no optio… |
| (behaviour) remember the choice | script behavi… | `n/a` | n/a | Writes a non-empty value to localStorage 'selectedBook'. Bound after the initial synthetic change, so the aut… |
| window.bookSelector.init / fetchBooks | global API | `n/a` | n/a | Lets a page re-run the population (used by public/js/segment-editor.js:4541-4543). Re-running re-dispatches '… |

**terminology** (92 controls)

| Label | Kind | Selector | Visible to | What it does |
|---|---|---|---|---|
| (no visible label) placeholder: Leita að orði… | text input | `#search-input` | All signed-in roles (no role class, no JS r… | Typing alone does nothing. Enter (or 'Leita') sends the text as q; the server matches English headwords or an… |
| Leita | button | `.search-row button.btn-primary` | All signed-in roles | Runs the list query with the current search text and filters, shows 'Hleður...', then renders rows, the title… |
| Bæta við | button (opens… | `.search-row button.btn-secondary` | All signed-in roles, viewer included; the s… | Sets currentTermId = null, title 'Bæta við orði', clears all fields, sets Uppruni to 'manual', enables the En… |
| Bók: (options: Allar bækur + one per register… | select | `#filter-book.book-select[data-allow-all=tru…` | All signed-in roles | Re-runs the list with bookSlug=<slug> (the server turns the book into its subject; ignored when 'Fag' is set,… |
| Fag: (options: Öll fög + Efnafræði, Líffræði,… | select | `#filter-subject` | All signed-in roles | Filters the list to headwords with a translation tagged with the subject, refreshes the translation counts in… |
| Staða: (Allar stöður, Samþykkt, Í bið, Til um… | select | `#filter-status` | All signed-in roles | Lists headwords that have at least one translation with the chosen status; each row still shows its first tra… |
| Uppruni: (Allir upprunar + one per source, e.… | select | `#filter-source` | All signed-in roles | Re-runs the same search unchanged (the value is never sent) and raises the 'síur virkar' count. |
| <n> síur virkar | status badge … | `#active-filters-badge` | All signed-in roles | Counts how many of Fag, Staða and Uppruni are set; hidden at zero. Does not count the book filter or the sear… |
| ⓘ (title: Endurteknar leiðréttingar þýðenda á… | tooltip glyph… | `#mined-section .mined-hint` | admin, head-editor (inside #mined-section) | Shows a browser tooltip on hover; not reachable by keyboard or touch. |
| Náma úr samþykktum breytingum | button | `#btn-mine` | admin, head-editor | Needs a book in 'Bók:' (else alert 'Veldu bók fyrst.'). Disables itself, asks the server to scan every approv… |
| Endurhlaða | button | `#mined-section .mined-header button:nth-of-…` | admin, head-editor | Reloads the open suggestions for the selected book; without a book shows 'Veldu bók til að sjá tillögur.'; wh… |
| Gera að íðorði | button (one p… | `#mined-results .mined-card .btn-primary` | admin, head-editor | Asks with a native prompt for the English term; on OK creates (or reuses) that English headword with the corr… |
| Hafna (mined suggestion) | button (one p… | `#mined-results .mined-card .btn-secondary` | admin, head-editor | Immediately marks the suggestion dismissed and reloads the list. |
| Skoða (in the banner '<n> orð bíða/bíður yfir… | link (href=#) | `#review-queue-alert a` | admin, head-editor, editor, and only while … | Scrolls smoothly to the review queue section if it is visible; otherwise does nothing. |
| Allt | filter chip (… | `#queue-chip-all` | admin, head-editor, editor | Shows the queue without a status parameter, which the server reads as the three pending statuses (proposed, d… |
| Í bið (<n>) | filter chip (… | `#queue-chip-proposed` | admin, head-editor, editor | Shows queue rows with status proposed. |
| Til umræðu (<n>) | filter chip (… | `#queue-chip-disputed` | admin, head-editor, editor | Shows queue rows with status disputed. |
| Þarf yfirlestur (<n>) | filter chip (… | `#queue-chip-needs_review` | admin, head-editor, editor | Shows queue rows with status needs_review. |
| (no label) first option: Allir upprunar | select | `#queue-filter-source` | admin, head-editor, editor | Filters the queue by translation source; this one is sent and applied on the server. |
| (no label) options: Öll fög, Ómerkt, then eac… | select | `#queue-filter-subject` | admin, head-editor, editor | Filters the queue by subject tag; 'Ómerkt' (value untagged) shows translations with no subject tag. |
| (no label) first option: — fag við samþykkt — | select | `#queue-batch-subject` | admin, head-editor, and only while at least… | Chooses the subject tag given to untagged translations when they are approved from the queue. |
| Samþykkja valin (next to '<n> valin') | button | `#queue-batch-bar button` | admin, head-editor | After a confirm, approves every ticked translation in one request; if a subject is chosen in the picker, only… |
| (unlabelled checkbox at the start of each que… | checkbox | `#queue-results .queue-row input[type=checkb…` | admin, head-editor (canActOnQueue(), termin… | Adds or removes the translation from the selection and shows or hides the batch bar with the count. The selec… |
| <English term> (<pos>) in a queue row | clickable tex… | `#queue-results .queue-en` | admin, head-editor, editor | Opens the detail dialog for the headword. |
| Samþykkja (queue row) | button | `#queue-results .queue-actions .btn:not(.btn…` | admin, head-editor | Approves the translation. If it has no subject tag and the (possibly hidden) subject picker has a value, asks… |
| Hafna (queue row) | button | `#queue-results .queue-actions .btn-secondary` | admin, head-editor | Asks for an optional reason; OK (even with an empty reason) sets the translation to rejected and adds a discu… |
| ‹ | button (queue… | `.queue-pager button:first-of-type` | admin, head-editor, editor | Loads the previous 50 queue rows; does nothing on the first page. |
| › | button (queue… | `.queue-pager button:last-of-type` | admin, head-editor, editor | Loads the next 50 queue rows; does nothing on the last page. The text between the arrows reads '<from>–<to> a… |
| Flytja út CSV (title: Flytja út síuð orð sem … | button (downl… | `.terms-header button[onclick^=exportGlossar…` | All signed-in roles | Requests a CSV of the headwords matching the search text, Fag or Bók, and Staða (not Uppruni), one line per t… |
| Flytja inn | button (opens… | `.terms-header button[onclick^=showImportMod…` | All signed-in roles; every import it leads … | Hides the upload sub-panel and the previous result and opens #import-modal. |
| Viðbætt hugtök (CSV) (title: Sækja viðbætt hu… | button (downl… | `#added-terms-export button:first-of-type` | admin, head-editor | Downloads arnastofnun-added-terms.csv: approved, project-authored translations not already in Íðorðabankinn, … |
| JSON (title: Sækja viðbætt hugtök fyrir Árnas… | button (downl… | `#added-terms-export button:last-of-type` | admin, head-editor | Same as the CSV button, saved as arnastofnun-added-terms.json. |
| List row: <English> (<pos>) [n þýð.] \| <Icel… | expandable/cl… | `#terms-body .term-card` | All signed-in roles | Fetches the headword with all translations and discussion comments, fills #detail-modal and opens it. No erro… |
| ⓘ (title: Sýna skilgreiningu) next to the Eng… | toggle (span)… | `#terms-body .def-toggle` | All signed-in roles; only on rows whose hea… | Shows or hides the English definition under the row by toggling the class 'visible' (CSS at terminology.html:… |
| (eye icon) title: Skoða | icon button | `#terms-body .term-actions .btn-icon` | All signed-in roles; hidden below 1024px wi… | Same as clicking the row. |
| (left chevron icon, no text) | pagination bu… | `#pagination .pagination-btn:first-child` | All signed-in roles, when the result has mo… | Sets the page and re-runs the list query; disabled on the first page. |
| 1 ... <page numbers> ... <last page> | pagination bu… | `#pagination .pagination-btn` | All signed-in roles | Jumps to the page (two pages either side of the current one, plus first and last). |
| (right chevron icon, no text) | pagination bu… | `#pagination .pagination-btn:last-child` | All signed-in roles | Next page; disabled on the last page. |
| Dialog title: Bæta við orði \| Breyta orðhaus… | custom modal … | `#term-modal` | Whoever opened it (all signed-in roles can) | One form shared by three actions; which request Vista sends depends on the mode and on a handler that is swap… |
| × (close, term dialog) | button | `#term-modal .btn-close` | All signed-in roles | Hides the dialog. Does not restore the Vista handler or re-enable the English field. |
| Enska * (placeholder: English term) | text input | `#term-english` | All signed-in roles | English headword. Required when creating (alert 'Enska er nauðsynleg', 1911-1914). |
| Íslenska * (placeholder: Íslenskt orð) | text input | `#term-icelandic` | All signed-in roles | Icelandic translation. Saved on create and on add-translation; ignored by the server in edit mode. |
| Aðrar þýðingar (placeholder: Aðskilið með kom… | text input | `#term-alternatives` | All signed-in roles | Nothing: the value is discarded in every mode. |
| Fag (veldu eitt eða fleiri): one checkbox per… | checkbox group | `#term-subjects input[name=term-subject]` | All signed-in roles | Subject tags for the new translation. Saved on create and add-translation; ignored in edit mode. |
| Orðflokkur (POS) (placeholder: t.d. n, adj, v) | text input | `#term-pos` | All signed-in roles | Part of speech of the headword. Saved on create and edit, but only when non-empty (1917); not sent in add-tra… |
| Uppruni (source list) | select | `#term-source` | All signed-in roles | Source label of the new translation (default 'Handvirkt'). Ignored in edit mode. |
| Skilgreining (enska) (placeholder: English de… | textarea | `#term-definition-en` | All signed-in roles | English definition of the headword. Saved on create and edit when non-empty (1918); not sent in add-translati… |
| Skilgreining (íslenska) (placeholder: Íslensk… | textarea | `#term-definition-is` | All signed-in roles | Icelandic definition of the translation. Saved on create and add-translation; ignored in edit mode. |
| Athugasemdir (placeholder: Viðbótarupplýsinga… | textarea | `#term-notes` | All signed-in roles | Notes on the translation. Saved on create and add-translation; ignored in edit mode. |
| Hætta við | button | `#term-modal .modal-footer .btn-secondary` | All signed-in roles | Hides the dialog without saving and without asking; leaves the Vista handler as it was. |
| Vista | button (submi… | `#save-term-btn` | All signed-in roles; all three requests nee… | New term: creates the headword and, if Icelandic is given, a translation in status 'Í bið'. Edit: sends all f… |
| Dialog title: <English> (<pos>); read-only fi… | custom modal … | `#detail-modal` | All signed-in roles | Shows the headword, every translation with subject badges, status, source, approver, inflections, Icelandic d… |
| × (close, detail dialog) | button | `#detail-modal .btn-close` | All signed-in roles | Hides the dialog. |
| ✓ (title: Samþykkja) on a translation row | icon button | `#detail-translations .translation-actions .…` | admin, head-editor, and only on translation… | After a confirm, sets the translation to approved (records approver and time) and refreshes the dialog, list … |
| ⚑ (title: Senda til umræðu) on a translation … | icon button | `#detail-translations .translation-actions .…` | Every signed-in role including viewer, on t… | Asks why; with a non-empty answer sets the translation to 'Til umræðu' (also when it was approved) and adds t… |
| (no label) placeholder: Bæta við athugasemd... | textarea | `#new-discussion` | All signed-in roles | Text of a new discussion comment. |
| (no label) placeholder: Leggja til aðra þýðin… | text input | `#proposed-translation` | All signed-in roles | Optional alternative translation stored with the comment and shown as 'Tillaga: <text>'; it does not create a… |
| Bæta við athugasemd | button | `#detail-modal .add-discussion button` | All signed-in roles; server needs editor | Requires comment text (alert 'Athugasemd er nauðsynleg'); posts the comment and optional proposal to the head… |
| Loka (detail dialog) | button | `#detail-modal .modal-footer .btn-secondary` | All signed-in roles | Hides the dialog. |
| Bæta við þýðingu | button (switc… | `#detail-modal .modal-footer button[onclick^…` | All signed-in roles; the save needs editor … | Closes the detail dialog, opens #term-modal titled 'Bæta við þýðingu á “<English>”' with English locked and P… |
| Breyta orðhausu | button (switc… | `#detail-modal .modal-footer button[onclick^…` | All signed-in roles; the save needs editor … | Closes the detail dialog and opens #term-modal titled 'Breyta orðhausu' with English locked and every other f… |
| Dialog title: Flytja inn orð | custom modal … | `#import-modal` | All signed-in roles can open it; all import… | Offers five import routes for a chosen book and shows the result counts (Bætt við / Uppfært / Auðgað með skil… |
| × (close, import dialog) | button | `#import-modal .btn-close` | All signed-in roles | Hides the dialog. |
| Bók (import dialog; first option 'Veldu bók..… | select | `#import-book-select.book-select` | All signed-in roles | Chooses the book whose subject will tag the imported terms and whose files the two file-based imports read. P… |
| Núverandi orðalisti — Flytja inn terminology-… | clickable car… | `#import-modal .import-card:nth-child(1)` | All signed-in roles; server needs head-edit… | Needs a book (alert 'Veldu bók fyrst'); after a confirm the server reads books/<slug>/glossary/terminology-en… |
| CSV skrá — Hlaða upp CSV skrá með english, ic… | clickable car… | `#import-modal .import-card:nth-child(2)` | All signed-in roles | Sets the upload type to csv, restricts the file picker to .csv, shows the upload sub-panel, clears any chosen… |
| Excel skrá — Flytja inn frá Efnafélaginu (Exc… | clickable car… | `#import-modal .import-card:nth-child(3)` | All signed-in roles | Sets the upload type to excel, restricts the picker to .xlsx/.xls and shows the upload sub-panel. No request. |
| Orðasafn (glossary) — Flytja inn með skilgrei… | clickable car… | `#import-modal .import-card:nth-child(4)` | All signed-in roles | Sets the upload type to glossary, restricts the picker to .csv and shows the upload sub-panel. No request. |
| Lykilorð úr köflum — Draga út orð úr key-term… | clickable car… | `#import-modal .import-card:nth-child(5)` | All signed-in roles; server needs head-edit… | Needs a book; after a confirm the server walks books/<slug>/05-publication for files ending -key-terms.md and… |
| (hidden file input; accept .csv or .xlsx,.xls… | file input | `#import-file` | Not visible itself (display:none); opened t… | Shows the chosen file name and enables 'Hlaða upp'. |
| Dragðu skrá hingað eða veldu skrá (drop zone) | drag-and-drop… | `#file-drop-zone` | All signed-in roles, after one of the three… | Highlights while a file is dragged over; on drop assigns the dropped files to the hidden input, shows the fir… |
| veldu skrá | link (href=#) | `#file-drop-zone a` | All signed-in roles, after one of the three… | Opens the browser's file picker. |
| Hlaða upp | button (submi… | `#upload-btn` | All signed-in roles; server needs head-edit… | Needs a file and a book; uploads the file to the import endpoint for the chosen type with ?bookSlug=<slug>. C… |
| Loka (import dialog) | button | `#import-modal .modal-footer .btn-secondary` | All signed-in roles | Hides the dialog. |
| Heim | sidebar link | `#app-sidebar a[href='/']` | All | Opens the home page. |
| Ritill | sidebar link | `#app-sidebar a[href='/editor']` | All | Opens the segment editor. |
| Framvinda | sidebar link | `#app-sidebar a[href='/progress']` | All | Opens the progress page. |
| Orðasafn (active) | sidebar link | `#app-sidebar a[href='/terminology']` | All | Reloads this page (all page state except the stored book is reset). |
| Yfirlestrar (section 'Yfirlestur') | sidebar link | `#sidebar-section-review a[href='/editor?vie…` | admin, head-editor, editor (updateRoleVisib… | Opens the editor's review view. |
| Aðlögun | sidebar link | `#nav-localization` | admin, head-editor (layout.js:420-424; the … | Opens the localization editor. |
| Stjórnandi (section 'Stjórnun') | sidebar link | `#nav-admin` | admin only (layout.js:414-418) | Opens the admin page. |
| Bókasafn | sidebar link | `#sidebar-section-admin a[href='/library']` | admin, head-editor (section gate, layout.js… | Opens the library page. |
| Úthlutanir | sidebar link | `#sidebar-section-admin a[href='/assignments…` | admin, head-editor | Opens the assignments page. |
| Um mig | sidebar foote… | `#nav-profile` | Any signed-in user (layout.js:405-409) | Opens the profile page. |
| Ábendingar | sidebar foote… | `#app-sidebar a[href='/feedback']` | All | Opens the feedback form. |
| Skoða sem: (Stjórnandi (raunhlutverk), Aðalri… | select (role … | `#role-preview-select` | Real admin only (layout.js:444-448) | Changes which sidebar sections and .admin-only/.reviewer-only elements are shown. On this page it changes the… |
| (sun/moon icon) title and aria-label: Skipta … | toggle button | `.theme-toggle` | All | Switches light/dark theme and stores it in localStorage 'theme'. |
| <avatar> <user name> (or link 'Innskrá' when … | user block / … | `#sidebar-user-info, #user-info` | All | Shows who is signed in (not clickable). The 'Innskrá' link appears only if the auth request fails or reports … |
| (hamburger icon) aria-label: Opna valmynd | button (mobil… | `#hamburger-btn` | All, at widths of 1023px and below (common.… | Opens or closes the sidebar and its overlay. |
| (sidebar overlay, no label) | click-away ar… | `#sidebar-overlay` | All, while the mobile sidebar is open | Closes the mobile sidebar. |
| (bell icon) title and aria-label: Tilkynninga… | icon (div, no… | `#notification-bell, #notification-count` | Nobody | Nothing; never shown. |
| (log-out icon) title and aria-label: Útskrá | icon button | `#logout-btn` | Any signed-in user | Posts the logout request, clears the cached auth and goes to /login, whatever the network result. |

### A4. Server error bodies by file

What `fetchJson` would put in front of the user (`error` field first, else `message`): fixed English text, fixed Icelandic text, or the internal `err.message`.

| File | English | Icelandic | Internal `err.message` | Other dynamic |
|---|---|---|---|---|
| `routes/activity.js` | 6 | 0 | 0 | 0 |
| `routes/admin.js` | 60 | 1 | 11 | 0 |
| `routes/analytics.js` | 6 | 0 | 0 | 0 |
| `routes/auth.js` | 5 | 0 | 0 | 0 |
| `routes/books.js` | 7 | 6 | 0 | 0 |
| `routes/feedback.js` | 16 | 0 | 0 | 0 |
| `routes/localization-editor.js` | 14 | 5 | 18 | 0 |
| `routes/my-work.js` | 3 | 0 | 0 | 0 |
| `routes/notifications.js` | 7 | 0 | 0 | 0 |
| `routes/pipeline-status.js` | 0 | 5 | 5 | 0 |
| `routes/pipeline.js` | 8 | 3 | 0 | 0 |
| `routes/profile.js` | 4 | 0 | 0 | 0 |
| `routes/publication.js` | 14 | 0 | 0 | 0 |
| `routes/research.js` | 4 | 0 | 0 | 1 |
| `routes/sections.js` | 22 | 0 | 0 | 0 |
| `routes/segment-editor.js` | 44 | 0 | 49 | 4 |
| `routes/status.js` | 21 | 0 | 0 | 0 |
| `routes/suggestions.js` | 14 | 0 | 0 | 0 |
| `routes/terminology.js` | 42 | 0 | 4 | 0 |
| `routes/tm.js` | 5 | 0 | 0 | 0 |
| `middleware/errorHandler.js` | 2 | 0 | 0 | 1 |
| `middleware/refuseCompressedBodies.js` | 1 | 0 | 0 | 0 |
| `middleware/requireAuth.js` | 2 | 0 | 0 | 0 |
| `middleware/requireRole.js` | 16 | 0 | 2 | 0 |
| `middleware/validateParams.js` | 3 | 0 | 0 | 0 |
| `index.js` | 1 | 0 | 0 | 0 |
| **Total** | **327** | **20** | **89** | **6** |

### A5. Native browser dialogs per page (from the static census)

| View | alert | confirm | prompt |
|---|---|---|---|
| `404.html` (with its scripts) | 0 | 0 | 0 |
| `admin.html` (with its scripts) | 0 | 3 | 0 |
| `assignments.html` (with its scripts) | 1 | 1 | 1 |
| `books.html` (with its scripts) | 3 | 1 | 0 |
| `feedback.html` (with its scripts) | 4 | 0 | 0 |
| `localization-editor.html` (with its scripts) | 26 | 11 | 0 |
| `login.html` (with its scripts) | 0 | 0 | 0 |
| `my-work.html` (with its scripts) | 0 | 0 | 0 |
| `profile.html` (with its scripts) | 0 | 0 | 0 |
| `segment-editor.html` (with its scripts) | 25 | 12 | 1 |
| `status.html` (with its scripts) | 0 | 0 | 0 |
| `terminology.html` (with its scripts) | 31 | 6 | 3 |

### A6. Non-Icelandic text that can reach the screen (from the page readers; code only unless a finding says otherwise)

| Page | Text | How it reaches the screen | Where |
|---|---|---|---|
| admin | Samstilling lokið: Synced <n> new books, updated <m> existing | success toast after 'Samstilla'; the server message is appended verbatim | `views/admin.html:910 (text built at …` |
| admin | <nafn> (admin) / <nafn> (head-editor) / <nafn> (editor) | option text of the picker 'Aðalritstjóri (valkvætt)' in the dialog 'Skrá bók'; the raw ro… | `views/admin.html:926` |
| admin | English book descriptions, e.g. 'Microbiology textbook covering bacte… | first 150 characters of the catalogue description on every book card | `views/admin.html:901 (data from serv…` |
| admin | Raw output lines of 'node tools/download-source.js … --verbose' | status line of the download banner while running and when finished | `views/admin.html:1032, 1044-1047 (jo…` |
| admin | Process exited with code <n> (or the spawn error text) | detail line of the failed download banner | `views/admin.html:1040 (server/servic…` |
| admin | Unknown error | literal fallback in the failed download banner when job.error is empty | `views/admin.html:1040` |
| admin | Villa: Book '<slug>' already has CNXML in 01-source/. The server will… | 4-second error toast after '⬇ Sækja' on a book whose source files already exist | `views/admin.html:1098 (server/routes…` |
| admin | Villa: No book registered with slug '<slug>' / Villa: Book has no Git… | error toast of the download start; this handler prefers the server's message over its err… | `views/admin.html:1104, 1114 (server/…` |
| admin | Already exists / Missing parameters / Failed to add user | error toast of 'Bæta við notanda', no Icelandic prefix; 'Already exists' is the ordinary … | `views/admin.html:731 (server/routes/…` |
| admin | Invalid operation / Invalid role / Not found / Failed to update user | error toast of 'Vista' in the user panel; 'Invalid operation' appears when an admin chang… | `views/admin.html:832 (server/routes/…` |
| admin | bookSlug and chapters array required / raw exception text such as 'Us… | error toast of 'Úthluta' | `views/admin.html:807 (server/routes/…` |
| admin | <n> migration(s) failed / Migration failed | toast after 'Keyra flutning' or 'Keyra uppsetningu' | `views/admin.html:853, 855, 990 (serv…` |
| admin | Villa: Database not ready / Villa: Failed to sync catalogue | error toast of 'Samstilla' | `views/admin.html:913 (server/routes/…` |
| admin | Villa: Invalid slug / Missing parameters / Already registered / Not f… | error toast of 'Skrá bók' (only the duplicate case is Icelandic: 'Bók þegar skráð', admin… | `views/admin.html:953 (server/routes/…` |
| admin | Villa: Already exists / Missing parameters / Failed to add to catalog… | error toast of 'Bæta við bók í lista' | `views/admin.html:981 (server/routes/…` |
| admin | Villa: Book not available / Villa: Failed to generate book data | error toast of ↻ | `views/admin.html:999 (server/routes/…` |
| admin | Villa: Failed to list feedback | inline text in place of the feedback table | `views/admin.html:1173 (server/routes…` |
| admin | Villa: Not found / Villa: Failed to get feedback | error toast of 'Skoða' | `views/admin.html:1223 (server/routes…` |
| admin | Villa: Missing message / Villa: Response failed | error toast of 'Svara' | `views/admin.html:1253 (server/routes…` |
| admin | Villa: Resolve failed | error toast of 'Staðfesta' in 'Merkja sem leyst' | `views/admin.html:1266 (server/routes…` |
| admin | Too many requests | rate-limit answer 429; its error label becomes the toast text | `index.js:149-165, through every catc…` |
| admin | Villa: HTTP <status> | download start answered with a non-JSON error body; the HTTP code is shown | `views/admin.html:1104, 1114` |
| admin | Netþjónninn svaraði HTTP <status> (Icelandic sentence carrying an HTT… | fetchJson fallback for a non-JSON error body, shown by the same catch blocks | `public/js/htmlUtils.js:44` |
| admin | The browser's own network error text (in Chrome 'Failed to fetch') | fetch rejects with a TypeError whose message is shown, with or without 'Villa: ' | `every catch that prints e.message (lines as…` |
| admin | The browser's raw JavaScript error, e.g. 'Cannot read properties of n… | toast when the 'Vista' button of the closed, off-screen edit panel is activated (flag adm… | `views/admin.html:825-832` |
| admin | Raw event type code, e.g. 'error' | activity list line for any event type the page does not map | `views/admin.html:1345 (accepted type…` |
| admin | Slug (stytting) / Slug (kennimerki) / OpenStax slug, … / GitHub repo … | static labels, tooltips, the download banner and the confirm text | `views/admin.html:454, 475, 478, 266,…` |
| admin | Number abbreviations '1.2k' and '3.4m' with a decimal point | analytics counters for values of 1000 and more (smaller values use is-IS formatting) | `views/admin.html:1349-1353` |
| admin | Native validation bubbles (required, pattern, type=url, min/max) and … | drawn by the browser in the browser's language; the pattern fields have no title to expla… | `views/admin.html:453-454, 475-480, 8…` |
| assignments | Insufficient permissions |  | `` |
| assignments | Invalid chapter: 31 (any chapter above 30) |  | `` |
| assignments | Invalid book: <slug> |  | `` |
| assignments | raw exception text, e.g. 'User management not available - run migrati… |  | `` |
| assignments | The suggestion view is not available for <book> |  | `` |
| assignments | Too many requests |  | `` |
| assignments | Authentication required / Invalid or expired token |  | `` |
| assignments | browser network error, e.g. 'Failed to fetch' (Chrome), 'NetworkError… |  | `` |
| assignments | Netþjónninn svaraði HTTP <status> (Icelandic but technical) |  | `` |
| assignments | English chapter title |  | `` |
| assignments | book slug, e.g. efnafraedi-2e |  | `` |
| assignments | NOT shown (handled): 'Not a study book: ...' (admin.js:1083, swallowe… |  | `` |
| assignments | MT (in 'Staðfesta MT', 'MT — vélþýðing', 'MT = óyfirfarin vélþýðing') |  | `` |
| assignments | raw marker syntax: [[BR]], [[SPACE]], {= and =}, (**), (__), (++), ~ … |  | `` |
| assignments | raw phase value interpolated into 'Í gangi (<phase>)...' and 'Birting… |  | `` |
| assignments | F5 |  | `` |
| books | Sækja allt EN markdown | static button label in the book header | `views/books.html:945` |
| books | TMX / CSV / JSON | static <option> labels and the button's title tooltip | `views/books.html:949-951, 955` |
| books | Birta MT | static button label (English abbreviation), head-editor and admin | `views/books.html:998` |
| books | HTML | static button label | `views/books.html:1044 (title 'Sækja …` |
| books | (slug) | static form label in the registration form (admin) | `views/books.html:1418` |
| books | English book title, e.g. 'Chemistry 2e' | book.titleEn printed as the card subtitle and in the book header | `views/books.html:1673-1675, 1733-1736` |
| books | English chapter title | ch.titleIs \|\| ch.titleEn - English whenever a chapter has no Icelandic title | `views/books.html:1813-1815` |
| books | English section titles, e.g. 'Chemistry in Context' | the 'Hlutar' tab prints sec.titleEn only; sections are registered with title_is NULL (boo… | `views/books.html:1942-1944` |
| books | intro | sec.sectionNum for introduction modules ('section': 'intro' in server/data/chemistry-2e.j… | `views/books.html:1939-1941` |
| books | m68664, chapter-metadata | module ID (file-name stem) printed as the only row label on the 'Kafli' tab | `views/books.html:2411-2413` |
| books | raw section status code, e.g. tm_created | fallback { text: sec.status } when the status is not in STATUS_LABELS; 'tm_created' is a … | `views/books.html:1935, 1949` |
| books | raw issue category, e.g. AUTO_FIX | fallback CATEGORY_LABELS[i.category] \|\| i.category - unreachable while /api/issues does… | `views/books.html:2065, 2492` |
| books | English catalogue titles and descriptions; subject key such as 'other' | OpenStax catalogue fields printed in the registration dialog (admin); subjectLabels[subj]… | `views/books.html:2587, 2598-2602, 26…` |
| books | Villa: Invalid slug / Missing parameters / Already registered / Not f… | alert('Villa: ' + err.message); fetchJson sets err.message = data.error \|\| data.message… | `views/books.html:2761; server/routes…` |
| books | Villa: Netþjónninn svaraði HTTP 502 (any status code) | fetchJson fallback when the error body is not JSON (e.g. an nginx error page); the HTTP s… | `views/books.html:2761; server/public…` |
| books | Villa: Failed to fetch (Chrome) / NetworkError when attempting to fet… | a network failure rejects fetch with the browser's own TypeError message, which is alerte… | `views/books.html:2761` |
| books | Raw JSON page: {"error":"No translation memory","message":"No reviewe… | window.location.href navigation to the export URL; any book without reviewed content | `views/books.html:2256-2260; server/r…` |
| books | Raw JSON page: {"error":"Not found","message":"Source directory not f… | 'HTML' button always requests the faithful track; every 05-publication tree in the repo h… | `views/books.html:2251-2254; server/r…` |
| books | Raw JSON page: {"error":"Authentication required","message":"Please l… | any of the three download buttons after the session has expired (the 401 redirect only wr… | `views/books.html:2253, 2259, 2781; s…` |
| books | Assigned chapter 3 to user 7 / Unassigned chapter 3 | activity descriptions are stored in English by the assignment routes and printed verbatim… | `views/books.html:2817-2819; server/r…` |
| books | Browser validation bubble for the slug field (e.g. 'Please match the … | native required/pattern validation in the browser's language; the input has no title expl… | `views/books.html:1419-1427` |
| books | Dead branches that would print server text: 'Villa við að hlaða kafla… | unreachable today (the routes never answer 2xx without `chapter` / with success false); l… | `views/books.html:1919-1925, 2757-2759` |
| localization-editor | Pass 1 / Pass 2 | Static heading, description and table headers; dynamic badges, tooltip and module meta li… | `views/localization-editor.html:1469,…` |
| localization-editor | imperial (in 'Breyta einingum úr imperial í SI') | Static bullet in the 'Leiðbeiningar' panel (collapsed by default). | `views/localization-editor.html:1459` |
| localization-editor | Segment type codes: para, title, caption, problem, solution, abstract… | seg.segmentType from the server is printed in the 'Tegund' column of every row. | `public/js/localization-editor.js:793…` |
| localization-editor | English module titles, e.g. 'Chemistry in Context', 'Introduction' | Module list prints m.titleIs \|\| m.title; the editor header prints the title from 02-str… | `public/js/localization-editor.js:436…` |
| localization-editor | Module ids, e.g. m68664; segment ids, e.g. m68664:para:fs-id123 | Module list and editor header; pending panel (head-editors); bulk-validation alert (every… | `public/js/localization-editor.js:441…` |
| localization-editor | undefined | Type badge of every 'Staðfæringarskrá' row, because the history rows have no `type` field. | `public/js/localization-editor.js:230…` |
| localization-editor | Skannað! undefined tillögur fundust. | alert after 'Skanna' when the scan returns no suggestionsCount. | `public/js/localization-editor.js:213…` |
| localization-editor | Raw section status codes: not_started, mt_pending, mt_uploaded, revie… | UI.reviewStatus[status] \|\| status in the review header badge. | `public/js/localization-editor.js:191…` |
| localization-editor | English section title, e.g. '1.1 - Chemistry in Context' | section.sectionNum + ' - ' + section.titleEn in the review header. | `public/js/localization-editor.js:191…` |
| localization-editor | Suggestion contexts: 'Temperature conversion: 72°F = 22.2°C', 'Weight… | s.context is printed under each suggestion. | `services/localizationSuggestions.js:…` |
| localization-editor | unchanged (raw category key) | Fallback `\|\| category` when a history row carries a category the UI map lacks. The pick… | `public/js/localization-editor.js:159…` |
| localization-editor | Villa við að vista: Server villa (500) — reyni aftur | alert on any 5xx save response (see flag 09). | `public/js/saveRetry.js:407-409; serv…` |
| localization-editor | Villa við að vista: You are not assigned to chapter 3 of efnafraedi-2e | 403 from requireBookAccess on save; saveRetry takes data.message. | `middleware/requireRole.js:299-303; s…` |
| localization-editor | Villa við að vista: This action requires editor role or higher | 403 on save for a viewer. | `middleware/requireRole.js:248-253` |
| localization-editor | Villa við að vista: Please log in again / Please log in to access thi… | 401 on save after the session expired; the alert races the redirect to login. | `middleware/requireAuth.js:34-48; ser…` |
| localization-editor | Villa við að vista: Content too long (max 10,000 characters) / segmen… | 400/404 `error` strings on save; there is no client-side length check (grep maxlength\|10… | `routes/localization-editor.js:303-31…` |
| localization-editor | Villa við að hlaða einingu: Faithful translation not found for m68664… | 404 on module load. | `services/segmentParser.js:247-250; s…` |
| localization-editor | Villa við að hlaða einingu: EN source not found: <absolute server pat… | 404 on module load; the path is part of the message. | `services/segmentParser.js:241-243; s…` |
| localization-editor | Villa: Insufficient permissions | fetchJson takes data.error. Shown inline in the module list (viewer), and in alerts for a… | `middleware/requireRole.js:32-38, 78-…` |
| localization-editor | Villa: Edit is not pending / Edit not found / Target not found | alert after a double click on 'Samþykkja' or when two reviewers act on the same edit. | `services/localizationReviewService.j…` |
| localization-editor | Villa: Version 3 not found for m68664 in chapter 2 / Confirmation req… | alert on version restore. | `services/contentVersionService.js:29…` |
| localization-editor | Villa: Section not found / Failed to get section | alert when the review deep link names a missing section. | `routes/sections.js:59-73; server/pub…` |
| localization-editor | Villa: Failed to scan section / Failed to accept suggestion / Failed … | alert 'Villa: ' + data.error for every failure in the review tab. | `routes/suggestions.js:64-67, 221-224…` |
| localization-editor | Villa: original, changedTo, and reason are required | alert on manual log entry (the client check normally prevents it). | `routes/localization-editor.js:925-92…` |
| localization-editor | Too many requests / Please try again later | 429 body from the rate limiter; fetchJson shows `error`, saveRetry shows `message`. | `index.js:160-164` |
| localization-editor | Raw exception text from any 500, e.g. Node's ENOENT message with a fi… | res.status(500).json({ error: err.message }) → err.message → alert or inline text. | `routes/localization-editor.js:95, 12…` |
| localization-editor | Failed to fetch (Chromium) / NetworkError when attempting to fetch re… | The browser's own TypeError message is printed after the Icelandic prefix when the networ… | `public/js/localization-editor.js:459…` |
| localization-editor | Netþjónninn svaraði HTTP 404 / Villa 400 (HTTP status codes) | Fallback when the error body is not JSON or has no text. Icelandic, but a bare status cod… | `public/js/htmlUtils.js:44; server/pu…` |
| localization-editor | [BR], [[MATH:3]], [[MEDIA:2]] and other raw markers | Shown as-is in the English column, the faithful preview and the editable textarea; not a … | `public/js/localization-editor.js:144…` |
| my-work | Added translation: <íslenska> (headword #<id>) | Stored as activity_log.description, returned by /api/my-work (my-work.js:179) and /api/st… | `written at routes/terminology.js:574…` |
| my-work | Disputed translation #<id> — <the user's comment> | Same path. Route open to the editor role (terminology.js:770), called from terminology.ht… | `routes/terminology.js:794; shown at …` |
| my-work | Approved translation #<id> for <term> / Rejected translation #<id> fo… | Same path; head-editor routes called from terminology.html:1534, 1950, 1550, 1574. | `routes/terminology.js:747, 708, 670;…` |
| my-work | Imported <n> key terms from <book slug> / Imported <n> terms from <bo… | Same path; called from terminology.html:2115, 2098. | `routes/terminology.js:1103, 1162; sh…` |
| my-work | Created headword: <english> → <íslenska> / Created headword: <english… | Same path. The pre-computed table lists no exact client caller for these endpoints, so wh… | `routes/terminology.js:467, 495, 602,…` |
| my-work | Assigned chapter <n> to user <numeric user id> / Unassigned chapter <… | Same path; called from public/js/assignments.js:178, 188, 393. | `routes/admin.js:1166, 1204; shown at…` |
| my-work | (accept) / (reject) inside the Icelandic sentence '<notandi> afgreidd… | The raw request value action is interpolated into the description; called from public/js/… | `routes/suggestions.js:394; shown at …` |
| my-work | Book slugs such as efnafraedi-2e instead of the title | item.book / activity.book are printed as received; only the personal lists use bookLabel … | `views/my-work.html:1576 (attention i…` |
| my-work | Module ids such as m68663 | module_id is aliased to section in the queries (my-work.js:86, 112) and printed as the se… | `views/my-work.html:1260, 1300, 1411,…` |
| my-work | chapter-metadata (the module id of a chapter's title and metadata) | It is a module id like any other (books/efnafraedi-2e/02-for-mt/ch01/chapter-metadata-seg… | `same places as module ids` |
| my-work | Segment ids such as m68663:title:auto-1, printed after the module id:… | Server composes '<moduleId>:<segmentId>' into the text; the client prints it. | `descriptions written at routes/segme…` |
| my-work | E-mail addresses in place of people's names | req.user.username is the Microsoft e-mail address (services/auth.js:335-338) and is what … | `views/my-work.html:1261 (Athugasemdi…` |
| my-work | MT in 'MT forskoðun hafin fyrir <slug> kafla <n>' | Activity description of a head-editor publishing an MT preview (the table lists only a we… | `routes/publication.js:153; shown at …` |
| my-work | Kafli -1 / kafla -1 / kafla 3.0 | The appendices chapter is the number -1; the message and the team feed print the raw valu… | `routes/status.js:207 shown at server…` |
| my-work | A raw activity type such as segment_edit_saved | Only if a row has an empty description; every write site read passes one. | `views/my-work.html:1729 (activity.de…` |
| small-pages | Endurgjöf / Feedback |  | `views/feedback.html:240` |
| small-pages | netfang@domain.is |  | `views/feedback.html:329` |
| small-pages | Villa: Too many submissions |  | `alert at feedback.html:426; string from ser…` |
| small-pages | Villa: Too many requests |  | `alert at feedback.html:426; string from ser…` |
| small-pages | Villa: Submission failed |  | `alert at feedback.html:426; string from ser…` |
| small-pages | Villa: Missing type / Villa: Invalid message |  | `routes/feedback.js:70,77` |
| small-pages | Villa: Internal Server Error |  | `middleware/errorHandler.js:67` |
| small-pages | Villa: Failed to fetch (Chrome) or the equivalent browser text |  | `alert at feedback.html:426` |
| small-pages | Browser validation bubbles for Lýsing (required, minlength) and Netfa… |  | `views/feedback.html:249,315-316,329` |
| small-pages | Villa: Display name cannot be empty |  | `toast at profile.html:253; string from serv…` |
| small-pages | Villa: Please log in to access this resource / Villa: Please log in a… |  | `middleware/requireAuth.js:37,46` |
| small-pages | Villa: User profile not found |  | `routes/profile.js:66` |
| small-pages | Villa: Please try again later |  | `index.js:162` |
| small-pages | Villa: An unexpected error occurred |  | `middleware/errorHandler.js:68` |
| small-pages | Villa: HTTP 502 (or another number) |  | `profile.html:245` |
| small-pages | Villa: Failed to fetch (browser text) |  | `profile.html:253` |
| small-pages | raw role value such as 'head-editor' |  | `profile.html:208` |
| small-pages | {"error":"Authentication failed","message":"User is not authorized. C… |  | `routes/auth.js:163-169; server/servi…` |
| small-pages | {"error":"Microsoft authorization failed","message":<Microsoft's text… |  | `routes/auth.js:93-98` |
| small-pages | {"error":"Invalid state token","message":"CSRF verification failed. P… |  | `routes/auth.js:101-106` |
| small-pages | {"error":"Too many authentication attempts","message":"Please try aga… |  | `index.js:168-178` |
| small-pages | OpenStax, Microsoft |  | `views/login.html:167,176` |
| small-pages | none from this script |  | `bookSelector.js` |
| status | Faithful file exists |  | `views/status.html:616` |
| status | <module id>: <n> rejected \| <module id>: <n> in discussion \| <modul… |  | `built at routes/status.js:1018, 1021…` |
| status | chapter-metadata |  | `views/status.html:615 (value from se…` |
| status | m68702 (and every other OpenStax module id) |  | `views/status.html:615; also inside a…` |
| status | Assigned chapter <n> to user <numeric id> \| Unassigned chapter <n> |  | `written at routes/admin.js:1166, 120…` |
| status | Created headword: … \| Updated headword: … \| Deleted headword ID … \… |  | `written at routes/terminology.js:467…` |
| status | MT \| ✓ MT birt |  | `views/status.html:653, 665` |
| status | book slugs and raw codes inside Icelandic log lines, e.g. 'MT forskoð… |  | `written at routes/publication.js:153…` |
| status | <sign-in e-mail> at the start of most timeline lines |  | `e.g. routes/segment-editor.js:548; u…` |
| status | book slug such as 'edlisfraedi-2e' as option text |  | `routes/books.js:77 (label falls back…` |
| status | Failed to fetch books |  | `public/js/bookSelector.js:32` |
| terminology | English term | placeholder of the 'Enska *' field in the add/edit dialog | `views/terminology.html:973` |
| terminology | English definition... | placeholder of 'Skilgreining (enska)' | `views/terminology.html:999` |
| terminology | Orðflokkur (POS) / t.d. n, adj, v | label and placeholder in the add/edit dialog; English abbreviation and English part-of-sp… | `views/terminology.html:989-990` |
| terminology | JSON | button label next to 'Viðbætt hugtök (CSV)' (admin, head-editor) | `views/terminology.html:939` |
| terminology | terminology-en-is.csv / glossary/ | description of the first import option: 'Flytja inn terminology-en-is.csv úr glossary/ mö… | `views/terminology.html:1091` |
| terminology | english, icelandic | description of the CSV import option: 'Hlaða upp CSV skrá með english, icelandic dálkum' | `views/terminology.html:1096` |
| terminology | (glossary) | heading of an import option: 'Orðasafn (glossary)' | `views/terminology.html:1105` |
| terminology | key-terms | import option description 'Draga út orð úr key-terms skrám' and the confirm 'Draga út orð… | `views/terminology.html:1111, 2112` |
| terminology | books/<slug>/glossary/terminology-en-is.csv | native confirm before importing the existing word list; shows a repository path and the r… | `views/terminology.html:2095` |
| terminology | <book slug>, e.g. efnafraedi-2e | the confirms print the slug, not the book title that the selector shows | `views/terminology.html:2095, 2112` |
| terminology | OpenStax MT | source label: option in both Uppruni selects, list column, 'Uppruni:' line in the term di… | `views/terminology.html:2274` |
| terminology | mined-postedit | TERM_SOURCES has 11 values, formatSource() names 10 and falls back to the raw value, so t… | `views/terminology.html:1621-1624, 16…` |
| terminology | idordabankinn, chemistry-association, chemistry-society-csv, openstax… | options of the review queue's source filter (opt.textContent = s, no label lookup); seen … | `views/terminology.html:1357-1364` |
| terminology | raw source code per queue row, e.g. imported-csv · <name> · <date> | escapeHtml(it.source) in the grey metadata of every queue row | `views/terminology.html:1470-1471` |
| terminology | part-of-speech codes from the data, e.g. (n), (adj) | term.pos printed as stored, in list rows, queue rows and the dialog title | `views/terminology.html:1463, 1689, 1…` |
| terminology | EN: / Skilgreining (EN) / Skilgr. (IS) | prefixes and labels in suggestion cards, list rows and the term dialog | `views/terminology.html:1243, 1035, 1…` |
| terminology | glossary-export.csv, arnastofnun-added-terms.csv / .json | names of the downloaded files | `views/terminology.html:2328, 2349; s…` |
| terminology | Failed to search terms / Failed to get review queue / Failed to get r… | fetchJson makes the body's error field the message (htmlUtils.js:48); the page shows it a… | `routes/terminology.js:84, 163, 183, …` |
| terminology | Insufficient permissions / Authentication required / Invalid or expir… | same path: 'Villa: Insufficient permissions' is what a viewer gets from Bæta við, ⚑, Bæta… | `middleware/requireRole.js:34; server…` |
| terminology | Invalid book / Invalid CSV — The file could not be read as CSV: … / N… | import and upload alerts; uploadFile() shows error and message together (terminology.html… | `routes/terminology.js:42-44, 851, 87…` |
| terminology | raw exception text, e.g. 'Candidate not found or not open', 'Candidat… | the mining routes send { error: err.message }; shown after 'Villa: ', 'Náma mistókst: ' o… | `routes/terminology.js:344, 363, 379,…` |
| terminology | the browser's own network error text, e.g. 'Failed to fetch' (Chromiu… | fetch rejects with the browser's TypeError; the catch blocks print err.message unchanged.… | `views/terminology.html:1273, 1306, 1…` |
| terminology | Netþjónninn svaraði HTTP <status> | Icelandic, but exposes the HTTP status code; used when an error body is not JSON (for exa… | `public/js/htmlUtils.js:44` |
| terminology | unmapped subject or status codes from the database | formatSubject() and formatStatus() fall back to the raw stored value; all current server … | `views/terminology.html:2265-2267, 22…` |

### A7. Controls the walkthrough did not click, and what they would do

| Page | Control | What it would do |
|---|---|---|
| admin | «Skrá bók» — the submit button of the register modal (also Enter in its fields)… | [EXTERNAL + FILES + DATABASE + possibly E-MAIL] Fetches the book structure from raw.githubusercontent.com (always with the checkbox on; also with it off when server/data/<catalogueSlug>.json is missing) and may write that file; i… |
| admin | «⬇ Sækja» on a registered book card | [EXTERNAL + FILES] If the book has no .cnxml file under 01-source the server spawns tools/download-source.js (GitHub download into books/<slug>/01-source; that tool's own licence gates were not traced here). If source files exist… |
| admin | «Reyna aftur» in a failed source-fetch banner | [EXTERNAL + FILES] Exactly the same as «⬇ Sækja». |
| admin | «↻» (tooltip «Endurgera») on a registered book card, followed by OK in the conf… | [EXTERNAL + FILE] Downloads the collection file and every module title from raw.githubusercontent.com (openstaxFetcher.js:318-410) and overwrites the git-tracked server/data/<catalogueSlug>.json (bookDataGenerator.js:224); Icelan… |
| admin | «Bæta við» inside the edit panel's book-permission form (reached with «Bæta við… | [E-MAIL + DATABASE] Writes a per-book row for a real user, creates an in-app notification and, when mail is configured, e-mails that user «Nýr aðgangur að bók» (userService.js:387-405; notifications.js:698-745). Also changes who … |
| admin | «Samstilla» (Books tab) | [DATABASE only, despite the label] Writes the 34 built-in catalogue rows and overwrites title, description, repository address, chapter count and subject of existing rows; no network request and no files (openstaxCatalogue.js:555… |
| admin | «Keyra flutning» (Users tab) and «Keyra uppsetningu» (Books tab), should they e… | [DATABASE SCHEMA] Runs migrations 001-014 again against the live database from inside the web process. Per flag admin-04 these buttons should not appear in normal operation; if one does, that is itself a finding. |
| admin | «Bæta við» — submit of «Bæta við bók í lista» | [DATABASE, permanent] Inserts a catalogue row that no control can delete or edit and that cannot be registered (flag admin-14). |
| admin | «Bæta við» — #add-user-btn in «Bæta við notanda» | [DATABASE, permanent] Creates an account row for the typed e-mail with the chosen role. Nobody is e-mailed, but whoever signs in with that address receives that role, and no control deletes the row (it can only be deactivated). |
| admin | Writes against real accounts: «Vista» in the edit panel; ✘ / ✔ in the user list… | [DATABASE, real permissions] Change a real person's name, role, active state, book rows or chapter access at once; the two removals have no confirmation. Use a dedicated test account only. |
| admin | Feedback writes: the «Staða» and «Forgangur» selects in the detail modal (they … | [DATABASE] Change the status or priority of, add a permanent response to, or resolve a real reader report. Responses cannot be deleted from the UI. Nothing is e-mailed. |
| assignments | any per-chapter editor dropdown (select.assign-select) | Writes or deletes a user_chapter_assignments row in the live database (POST or DELETE /api/admin/assignments/:book/:chapter). It changes who can save in which chapters at once, and on the study book (efnafraedi-2e) an assignment … |
| assignments | 'Þvinga kaflaúthlutun' checkbox (#enforce-assignments-toggle) | As admin: flips enforce_assignments for the whole book at once (POST /api/admin/assignments/:book/enforcement), locking every editor without an explicit assignment out of saving in that book, with no confirmation; writes an activ… |
| assignments | 'Tillögur gervigreindar í ritli' switch (#suggestion-view-toggle), admin on efn… | Switching on for the first time writes the permanent first-switch-on research event (book_switch_events) and shows AI suggestions to all editors of the study book; it cannot be moved or undone. Switching off hides all suggestions… |
| assignments | 'Útskrá' button in the top bar (shared shell) | Ends the session (POST /api/auth/logout). Harmless but interrupts a test session. |
| assignments | (for information) nothing on this page starts a pipeline operation, writes unde… | The three write routes call only userService, suggestionSwitch and activityLog; no notifier is called (flag assignments-17). The stylesheet does load Google Fonts on every page view (common.css:33). |
| books | Birta MT (#btn-publish-mt) - chapter panel in the Bækur view; visible to admin … | POST /api/publication/<book>/<chapter>/mt-preview. The server spawns tools/validate-chapter.js, then runs cnxml-inject and cnxml-render for the whole chapter from 02-mt-output (publicationService.js:201-230, pipelineService.js:19… |
| books | Birta (#btn-publish-faithful) - same place; shown when linguistic review is mar… | POST /api/publication/<book>/<chapter>/faithful: same job from 03-faithful-translation; rewrites 03-translated/ and 05-publication/faithful/chapters/NN/, marks injection, rendering and publication.faithful complete, logs activity… |
| books | Birta staðf. (#btn-publish-localized) - same place; shown when the faithful tra… | POST /api/publication/<book>/<chapter>/localized: same job from 04-localized-content; rewrites 03-translated/ and 05-publication/localized/chapters/NN/, marks injection, rendering and publication.localized complete, logs activity… |
| books | Skrá bók (submit button of the registration form) - and pressing Enter in eithe… | POST /api/admin/books/register (admin only). Inserts the book, its chapters and its sections into the database; creates the folder tree books/<slug>/ (12 folders: 01-source, 02-for-mt, 02-mt-output, 03-faithful-translation, 04-lo… |
| books | Skrá nýja bók (#register-btn) when signed in as admin | Before showing anything it POSTs /api/admin/catalogue/sync, which upserts all 34 predefined OpenStax catalogue rows in the database and updates their last_synced time (openstaxCatalogue.js:555-615). No files under books/, no netw… |
| books | Skrá fyrstu bókina (empty-state button; admin only, only when no book is regist… | Same catalogue sync write as 'Skrá nýja bók'. |
| localization-editor | TYPING in any textarea of the column „Staðfært (Pass 2)“ (no click needed) | Any typed difference becomes a pending change, and the 60-second autosave timer POSTs it to /api/localization-editor/:book/:chapter/:moduleId/save-all with autosave:true — between 0 and 60 s later, with no click and no question. … |
| localization-editor | ✓ icon button „Vista bút“ in a segment row — even on a row that was not edited | POST …/save. Writes books/<book>/04-localized-content/<chNN>/<module>-segments.is.md with ALL segments of the module (faithful text for the untouched ones), after taking a content_versions snapshot and a .bak copy; logs an audit … |
| localization-editor | „Vista allt“ (#btn-save-all) | POST …/save-all with every pending segment: same file write (books/<book>/04-localized-content/<chNN>/<module>-segments.is.md), snapshot, .bak, audit rows and activity log; or, with localization review on, one pending edit per ch… |
| localization-editor | „Afrita“ under the faithful text of a row | No request by itself, but it overwrites the row's textarea with the faithful text; if that differs from what was saved, the row becomes a pending change and the 60 s autosave writes the file (see the first entry). Safe only on a … |
| localization-editor | „Endurheimta“ in a segment's „Breytingasaga“ popover | No request by itself; it puts an older text into the textarea, which becomes a pending change that the 60 s autosave writes to the localized file (see the first entry). |
| localization-editor | OK on the question „Fundust N óvistuð drög frá síðustu lotu. Endurheimta?“ | Restores drafted text into the textareas as pending changes, which the 60 s autosave then writes to the localized file. (Cancel is not neutral either: it deletes the drafts from this browser's localStorage.) Use a clean browser p… |
| localization-editor | „Samþykkja“ in the panel „Staðfærsla í bið“ (head-editor/admin, review tier on) | POST /api/localization-editor/loc-edit/:id/approve with no confirmation: applies the editor's text to books/<book>/04-localized-content/<chNN>/<module>-segments.is.md (snapshot + .bak first), marks the edit approved, supersedes o… |
| localization-editor | „Hafna“ in the panel „Staðfærsla í bið“ (then OK on „Hafna þessari staðfærslu?“) | POST /api/localization-editor/loc-edit/:id/reject: database only — marks a colleague's pending edit rejected (no undo control) and writes the activity log. No file is written. |
| localization-editor | „Færa í þessa útgáfu“ in the „Útgáfusaga“ modal (then OK on the confirm) | POST …/restore/:version {confirm:true}: rewrites books/<book>/04-localized-content/<chNN>/<module>-segments.is.md from an older snapshot (after snapshotting the current file), and deletes this browser's drafts for the module. |
| localization-editor | „Skanna“ (review interface) | POST /api/suggestions/scan/:sectionId: database only — deletes the section's pending suggestions and inserts newly detected ones; reads (does not write) a file under books/; writes the activity log. No machine translation or exte… |
| localization-editor | „Samþykkja“, „Hafna“, „Samþykkja allt“, „Hafna öllu“ on suggestions, and „Breyt… | POST /api/suggestions/:id/accept \| reject \| modify, or /:sectionId/bulk: database only — changes suggestion status (no undo control) and writes the activity log. No text or file is changed. |
| localization-editor | „Samstilla við skrá“ (review interface) | POST /api/suggestions/:sectionId/sync-log: database only — appends one entry per accepted/modified suggestion to localization_logs (duplicates on every click) and writes the activity log. Despite the name it synchronises nothing … |
| localization-editor | „Bæta við“ → „Vista“ in the modal „Bæta við færslu“ (review interface) | POST /api/localization-editor/:book/:chapter/:moduleId/log: database only — inserts a row into the module's localization edit history (localization_edits) that no control can delete. |
| localization-editor | (not a control) loading the page in a browser profile that holds a queued faile… | saveRetry re-POSTs any save left in localStorage key saveRetryQueue (younger than 1 hour, fewer than 3 attempts) as soon as a page that includes saveRetry.js loads — a file write with no click. Use a clean browser profile. |
| segment-editor | Innsetja (#btn-inject), pipeline panel | PIPELINE: POST /api/pipeline/inject starts a server job running node tools/cnxml-inject.js --book <book> --chapter <n> --source-dir <track dir> --module <id>; writes translated CNXML under books/<book>/03-translated/<track>/. If … |
| segment-editor | Birta (#btn-render), pipeline panel | RENDER: POST /api/pipeline/render starts node tools/cnxml-render.js --book --chapter --track --module; writes HTML under books/<book>/05-publication/<track>/ (the tree the reader site is synced from). |
| segment-editor | Innsetja + Birta (#btn-pipeline), pipeline panel | PIPELINE: POST /api/pipeline/run runs inject then render for the selected track and advances the chapter's injection and rendering status. |
| segment-editor | Vista í skrár (#btn-apply), apply panel | APPLY TO FILES: POST …/apply writes books/<book>/03-faithful-translation/<ch>/<module>-segments.is.md (with backup) and <module>-review-status.json, marks edits and confirmations applied, snapshots a content version, may advance … |
| segment-editor | Vista + Birta (#btn-apply-render), apply panel | APPLY + INJECT + RENDER: everything „Vista í skrár“ does, then pipelineService.runPipeline for the faithful track (writes 03-translated and 05-publication). No confirmation dialog. |
| segment-editor | Færa í þessa útgáfu (.vh-restore, inside the Útgáfusaga modal; „Útgáfusaga“ its… | WRITES FILES: after a native confirm, POST …/restore/:version rewrites the module's faithful file from the snapshot, records a new snapshot and rewrites the review-status sidecar. |
| segment-editor | Samþykkja on a figure card ([data-figure-approve]) | WRITES A COMMITTED FILE: POST …/figures/:basename/state {approved} updates figure_review and rewrites books/<book>/figure-text/<basename>.is.json. No confirmation. (Non-admins on efnafraedi-2e are refused 423 before any write.) |
| segment-editor | Merkja villu on a figure card ([data-figure-flag]) | WRITES A COMMITTED FILE: same route with state flagged, flagKind text; rewrites the figure's sidecar under books/<book>/figure-text/. No confirmation. |
| segment-editor | ↩ Afturkalla staðfestingu on a row with the chip „Staðfest“ | DB + FILE: after a native confirm, POST /api/segment-editor/acceptance/:id/revoke withdraws the confirmation and, when the module has a faithful file, rewrites books/<book>/03-faithful-translation/<ch>/<module>-review-status.json. |
| segment-editor | Yfirlestur (#btn-spellcheck), review summary panel | EXTERNAL SERVICE: GET …/spellcheck makes the server POST every segment's Icelandic text, one request per segment, to the Greynir proofreading sidecar at GREYNIR_URL (no-op with a message when the variable is unset). |
| segment-editor | Forskoðun (#btn-preview) | RENDER, READ-ONLY: GET …/preview loads tools/cnxml-render.js inside the server process (MathJax start-up on first use) and renders books/<book>/03-translated/<track>/…; it writes no file and opens a popup window. Listed because i… |
| segment-editor | Native confirm raised by a pipeline button (English text about a missing stage) | PIPELINE: choosing OK re-posts the same pipeline action with confirmed:true and starts the job; choose Cancel. |
| segment-editor | [DB only, one-time] Module card click as a user who holds a chapter assignment … | Not a file or pipeline action, but irreversible research data: the first serve of a unit to an assigned editor records the unit's opening time and in-flight snapshot (module_openings) and emits a module-opened research event. It … |
| segment-editor | [DB only, irreversible] ✗ Hafna / ✗ Hafna báðum / ✗ Hafna öllum (n) on an AI te… | POST …/suggestions/reject writes rejection rows that hide the suggestion for every editor permanently, plus research events; no confirmation and no undo. |
| segment-editor | [DB only] ✓ Staðfesta MT and Ctrl/Cmd+Shift+Enter (second press) | POST …/accept records an MT confirmation in shared data, closes any AI suggestions still open on that segment, and emits research events. No file is written until someone applies. |
| segment-editor | [DB only] Vista (segment), Beita víðar, review ✓ / ✗ / 💬, ↺ Opna aftur, ↩ Aftu… | Write shared sessions.db rows (and research events on efnafraedi-2e) but no file, no e-mail and no external call. Notable side effects: Beita víðar creates pending edits across the whole book; Senda til yfirlestrar creates a revi… |
| small-pages | 'Senda endurgjöf' on /feedback | POST /api/feedback: inserts a row in the production feedback table, sends an e-mail to ADMIN_EMAIL through SMTP when configured (server/services/notifications.js:499-528), and stores notification rows for 'admin' and, for a trans… |
| small-pages | 'Skrá inn með Microsoft' on /login (and any 401 on a page that loads htmlUtils.… | Contacts an external service (login.microsoftonline.com, then Microsoft Graph from the server), and on return can write the users table (display-name refresh, last sign-in time, binding an admin-added row to the Microsoft account… |
| small-pages | 'Vista breytingar' on /profile (listed for caution; it is a database write only… | PUT /api/profile overwrites the signed-in user's display name, school, subject and description in the users table with no undo. No file under books/, no e-mail, no external call. |
| status | 'Opna' on a unit row of the Kaflayfirlit tab | Navigates to /editor?…&module=<id>; the editor then auto-loads the unit (public/js/segment-editor.js:4555-4559) with GET /api/segment-editor/:book/:chapter/:moduleId, which is not read-only: it mints served-version rows (routes/s… |
| status | 'Innskrá' (sidebar / topbar when signed out) and the automatic redirect after a… | Leads to /api/auth/login, which redirects to Microsoft Entra (external service; routes/auth.js:55-79). |
| status | Logout button (title 'Útskrá') in the topbar | POST /api/auth/logout clears the session cookie and sends the browser to /login. No external call and no data change, but it ends the audit session. |
| terminology | Náma úr samþykktum breytingum (#btn-mine) | POST /api/terminology/mine for the book selected in 'Bók:': reads every approved segment edit of that book from the database, reads that book's segment files under books/<book>/ for English context (read only, segmentParser.loadM… |
| terminology | Import card 'Núverandi orðalisti' (then OK in the confirm) | POST /api/terminology/import/existing-glossary: reads books/<slug>/glossary/terminology-en-is.csv and inserts every English/Icelandic pair not already present as a headword plus a 'proposed' translation (source imported-csv) tagg… |
| terminology | Import card 'Lykilorð úr köflum' (then OK in the confirm) | POST /api/terminology/import/key-terms: walks books/<slug>/05-publication for *-key-terms.md and inserts their term definitions as 'proposed' translations (source chapter-glossary). In this checkout no such file exists, so it wou… |
| terminology | Hlaða upp (#upload-btn) after choosing 'CSV skrá', 'Excel skrá' or 'Orðasafn (g… | POST /api/terminology/import/csv \| excel \| glossary with ?bookSlug=<book in the import dialog>: inserts every row of the uploaded file as headwords and translations (proposed, or needs_review for the glossary type) tagged with … |
| terminology | Samþykkja valin (batch bar; then OK in the confirm) | POST /api/terminology/translations/batch-approve: sets every ticked translation (up to 200) to approved with the user as approver and tags the untagged ones with the chosen subject. |
| terminology | Hafna on a mined suggestion | POST /api/terminology/mined-candidates/:id/dismiss: marks the suggestion dismissed for good; it cannot be listed or reopened afterwards. |
| terminology | Gera að íðorði on a mined suggestion (then OK in the prompt with a non-empty an… | POST /api/terminology/mined-candidates/:id/promote: creates or reuses the English headword, adds the corrected form as a 'proposed' translation (source mined-postedit) and marks the suggestion promoted. |
| terminology | Samþykkja in a queue row, and ✓ in the detail dialog | POST /api/terminology/translations/:id/approve: sets one translation to approved (and, from the queue, may replace its subject tags). A tagged queue row is approved with no question. |
| terminology | Hafna in a queue row (OK in the prompt, even with an empty reason) | POST /api/terminology/translations/:id/reject: sets the translation to rejected and adds a permanent discussion entry 'Hafnað' with the reason. |
| terminology | Vista in the term dialog (all three modes) | Creates a headword (and a 'proposed' translation), or updates a headword's part of speech and English definition, or adds a 'proposed' translation. Created rows can only be deleted through the admin API. |
| terminology | ⚑ Senda til umræðu in the detail dialog (OK in the prompt with a reason) | POST /api/terminology/translations/:id/dispute: sets the translation to disputed, also when it was approved, and adds the reason as a permanent discussion comment. |
| terminology | Bæta við athugasemd in the detail dialog | POST /api/terminology/:id/discuss: adds a discussion comment under the user's name; comments cannot be edited or deleted. |
| terminology | Útskrá (log-out icon in the topbar) | POST /api/auth/logout and a redirect to /login: ends the walkthrough session. Signing in again goes through Microsoft Entra, an outside service. |

### A8. Reader flags not re-checked (hypotheses, not findings)

One line per flag raised by a single code reader. No second reader and no live test confirmed these unless a finding in section 4 cites the flag. Flags withheld as security-sensitive are not listed.

| Flag | Sev. | Cat. | Kind | Claim | Where |
|---|---|---|---|---|---|
| admin.A/admin-02 | S2 | B,F | api-contract | On the Tölfræði tab the cards 'Kaflar skoðaðir' and 'Niðurhal' and the table 'Virkasta efnið' read three fields the server never sends (chaptersViewed, downloads, topContent). They therefore always show 0, 0 a… | `views/admin.html:1306-1321; ser…` |
| admin.A/admin-03 | S3 | C,G | label-mismatch | The card headed 'Nýleg ritstjórnarvirkni' (recent editorial activity) lists reader analytics events — pages opened, downloads, searches — not editorial work. The editorial activity log is a different store beh… | `views/admin.html:388, 1290, 1294, 1333…` |
| admin.A/admin-04 | S3 | B,F | hidden-forever | The panel 'Gagnagrunnur ekki tilbúinn' with the button 'Keyra flutning', and the Books-tab button 'Keyra uppsetningu', appear only if the error message contains the text '503'. The server's 503 answer is JSON … | `views/admin.html:262-269, 659-675, 877…` |
| admin.A/admin-06 | S2 | D | role-ui-shows-server-refuses | The UI lets an admin give the per-book role 'Aðalritstjóri' to a user whose global role is 'Yfirlesari' — in the edit panel, and in the 'Aðalritstjóri (valkvætt)' list of 'Skrá bók', which includes editors. Th… | `views/admin.html:742, 745, 926; server…` |
| admin.A/admin-07 | S2 | C,D | label-mismatch | 'Bókaheimildir' with the role 'Yfirlesari' reads as a permission, and the empty state says 'Engir sérstakir bókaréttindi', but no server check consults these rows for editors. Adding or removing one neither gr… | `views/admin.html:744-745, 753-757, 762…` |
| admin.A/admin-08 | S2 | C,H | label-mismatch | The edit panel states without condition 'Ef engir kaflar eru úthlutaðir hefur notandi aðgang að öllum köflum.' and 'Engir kaflar úthlutaðir — aðgangur að öllum köflum.'. For a book whose assignment enforcement… | `views/admin.html:746, 785; serv…` |
| admin.A/admin-09 | S3 | B | label-mismatch | The field 'Nafn' in the edit panel saves, but the value is replaced by the Microsoft display name the next time that user signs in. An admin's correction therefore disappears without notice. | `views/admin.html:741, 825-833; …` |
| admin.A/admin-10 | S3 | D | other | For an account whose e-mail is in the ADMIN_USERS environment list the edit panel still offers 'Hlutverk' and 'Staða' and the ✘ button, and saving succeeds. At that account's next sign-in the role is forced ba… | `services/auth.js:198-215; views…` |
| admin.A/admin-11 | S3 | D,E | other | An admin can deactivate their own account: the ✘ button and the 'Staða' select are offered on the admin's own row and the server accepts the change. The server blocks self-demotion and self-deletion but not se… | `routes/admin.js:766-803, 839-845; serv…` |
| admin.A/admin-12 | S3 | B,C | label-mismatch | The tooltip of 'Samstilla' says it synchronises the list with OpenStax and does not change books already there. The handler contacts nothing outside the server: it writes a list of 34 books that is hard-coded … | `views/admin.html:313, 905-914; …` |
| admin.A/admin-13 | S3 | C,E | label-mismatch | The checkbox 'Sækja kaflaskipan frá OpenStax' (on by default) says it fetches the chapter structure. When it is on, the server additionally starts a job that downloads the book's complete source files from Git… | `views/admin.html:456, 921, 937, 945-94…` |
| admin.A/admin-14 | S3 | A,B | other | 'Bæta við bók' (tooltip 'Skrá nýja bók handvirkt í kerfið') only adds a row to the catalogue, and a row added this way cannot then be registered from the UI. Registration needs the slug to be one of the 34 the… | `views/admin.html:314, 470, 971-983; se…` |
| admin.A/admin-15 | S3 | B,F | dead-control | '⬇ Sækja' is drawn on every registered book that has a repository address and no recorded fetch time, whether or not its source files are already on disk. If they are, the server always refuses and the user ge… | `views/admin.html:900, 1070-1099; serve…` |
| admin.A/admin-16 | S4 | C,G | label-mismatch | The confirmation for a source fetch opens with 'Uppfærsla frá OpenStax mun skrifa yfir CNXML í 01-source/'. The server reaches the branch that triggers this dialog only after establishing that 01-source holds … | `views/admin.html:1070-1090; rou…` |
| admin.A/admin-17 | S2 | E | work-loss | The icon button ↻ ('Endurgera') asks only 'Viltu endurgera kaflaskipan fyrir þessa bók?'. On OK the server downloads the book's current structure from GitHub and overwrites the git-tracked file server/data/<ca… | `views/admin.html:901, 993-1000; server…` |
| admin.A/admin-18 | S3 | E | missing-confirmation | The ✘ beside a book permission and the × on a chapter tag delete at once, with no confirmation and no undo, whereas deactivating a user does ask. Re-adding a wrongly removed book permission sends the user a fr… | `views/admin.html:756, 772-777, 791, 81…` |
| admin.A/admin-19 | S3 | A | unreachable-function | Several admin functions exist on the server with no control anywhere in the UI: removing a user (DELETE /api/admin/users/:id), replacing a book registration (forceReregister) and the pipeline consistency repor… | `routes/admin.js:197-199, 766-768, 826-…` |
| admin.A/admin-20 | S3 | B,F | state-missing | In the feedback list, when the last item on a later page leaves the current filter (for example after 'Merkja sem leyst' under the default filter 'Opin'), the list shows 'Engin endurgjöf fannst' and the paging… | `views/admin.html:1128-1132, 1162, 1233…` |
| admin.A/admin-21 | S3 | C,F | label-mismatch | 'Svara', the placeholder 'Skrifa svar...' and the checkbox 'Innanhússathugasemd' suggest that an unchecked reply goes to the person who sent the feedback, whose name and e-mail are shown under 'Tengiliður'. Th… | `views/admin.html:509-515, 1245-1254; s…` |
| admin.A/admin-22 | S3 | A,D | role-ui-hides-server-allows | The server lets head editors list, read, prioritise, answer and resolve reader feedback and read the analytics, and it routes translation-error feedback to them, but the only UI for these is /admin, which admi… | `routes/views.js:57; public/js/l…` |
| admin.A/admin-23 | S3 | A,F | hidden-forever | The notification bell in the top bar is created hidden and no code ever shows it, and no page reads the notification list. In-app notifications caused from this page — for example 'Nýr aðgangur að bók' when a … | `public/js/layout.js:144-147; se…` |
| admin.A/admin-24 | S4 | F | other | The source-fetch progress banner has no close control while it is in the running state and ignores every polling error. If the job record is gone (jobs are kept in memory, so after a server restart the lookup … | `views/admin.html:1007-1053; ser…` |
| admin.A/admin-25 | S4 | I,J | inconsistency | The six overlays on this page close in different ways: Escape closes only the two feedback modals; a click outside closes five of them but not 'Bæta við notanda'; the edit panel and the add-user, register and … | `views/admin.html:400-426, 429, 957, 96…` |
| admin.A/admin-26 | S3 | E,J | inconsistency | The edit-user panel mixes two ways of saving under one 'Hætta við / Vista' footer: name, role and status are saved only by 'Vista', while book permissions and chapter assignments are written the moment their b… | `views/admin.html:436-438, 744-747, 762…` |
| admin.B/admin.B-01 | S2 | B,F | api-contract | On the Tölfræði tab the cards 'Kaflar skoðaðir' and 'Niðurhal' always show 0 and the table 'Virkasta efnið' always shows 'Engin gögn', whatever was recorded. Expected: they show what the server returns. | `views/admin.html:1306-1320` |
| admin.B/admin.B-02 | S2 | F | silent-failure | When the user list fails to load (any error whose text does not contain '503'), the Notendur tab shows the empty state 'Engir notendur fundust' and no error. Expected: an error message with a way to retry. | `views/admin.html:659-675` |
| admin.B/admin.B-03 | S3 | B,F | hidden-forever | The 'database not ready' prompts (the card with 'Keyra flutning' on Notendur, and 'Gagnagrunnur ekki tilbúinn' with 'Keyra uppsetningu' on Bækur) are not shown for the server's own 503 answer. They appear only… | `views/admin.html:666-668` |
| admin.B/admin.B-04 | S2 | C,G | label-mismatch | In the feedback dialog 'Svör', 'Skrifa svar...' and 'Svara' read as a reply to the person who sent the feedback, whose contact is shown as 'Tengiliður', and the checkbox 'Innanhússathugasemd' implies that unch… | `views/admin.html:509-515` |
| admin.B/admin.B-05 | S2 | D,G | label-mismatch | The edit panel states without condition 'Ef engir kaflar eru úthlutaðir hefur notandi aðgang að öllum köflum.' and, for an empty list, 'Engir kaflar úthlutaðir — aðgangur að öllum köflum.' For a book with assi… | `views/admin.html:746` |
| admin.B/admin.B-06 | S2 | F | silent-failure | After 'Skrá bók' the page says 'Bók skráð!' even when the server reports that the chosen head editor could not be assigned or that the source download could not be started. Expected: the partial failure is sho… | `views/admin.html:941-953` |
| admin.B/admin.B-07 | S2 | E,J | inconsistency | The 'Breyta notanda' panel mixes two save models under one footer: book access and chapter assignments are saved the moment their buttons are clicked, while name, role and status are saved only by 'Vista'. 'Hæ… | `views/admin.html:436-439` |
| admin.B/admin.B-08 | S3 | F,G | english-on-screen | Every successful 'Samstilla' shows a half-English toast: 'Samstilling lokið: Synced <n> new books, updated <m> existing'. | `views/admin.html:910` |
| admin.B/admin.B-09 | S3 | F,G | raw-error | Most failures on this page show the server's short English error label, with or without the prefix 'Villa: '. Adding an address that already exists shows 'Already exists', changing one's own role shows 'Invali… | `public/js/htmlUtils.js:44-48` |
| admin.B/admin.B-10 | S3 | C,G | english-on-screen | The picker 'Aðalritstjóri (valkvætt)' in the dialog 'Skrá bók' lists people as '<nafn> (admin)', '<nafn> (head-editor)' or '<nafn> (editor)': raw role codes in English. | `views/admin.html:926` |
| admin.B/admin.B-11 | S3 | C,F | raw-error | The source-download banner uses the raw console output of the download tool as its status line while running and when done, and on failure shows 'Process exited with code <n>' or the literal 'Unknown error'. | `views/admin.html:1016` |
| admin.B/admin.B-12 | S3 | B,F | dead-control | The '⬇ Sækja' button is offered for every registered book that has a repository address and no recorded download time, also when its source files are already on the server. For such a book the only possible re… | `views/admin.html:900` |
| admin.B/admin.B-13 | S3 | F | silent-failure | If polling the download job fails (job unknown after a server restart, a network error), the banner keeps its spinner and last text indefinitely. While running it has no close button and no timeout. | `views/admin.html:1016-1052` |
| admin.B/admin.B-14 | S3 | C,G | label-mismatch | The list headed 'Nýleg ritstjórnarvirkni' (recent editorial activity) shows analytics events such as page and chapter views, not editorial actions. Event types the page does not know are printed as their raw c… | `views/admin.html:388` |
| admin.B/admin.B-15 | S3 | G | label-mismatch | The tooltip of 'Samstilla' says it synchronises the book list with the OpenStax web library, registers new books and does not change those already registered. The action compares with a list built into the ser… | `views/admin.html:313` |
| admin.B/admin.B-16 | S4 | E,G | label-mismatch | The confirmation that begins 'Uppfærsla frá OpenStax mun skrifa yfir CNXML í 01-source/.' can only appear when there is no CNXML to overwrite. Whenever source files exist the server refuses before it reaches t… | `views/admin.html:1070-1090` |
| admin.B/admin.B-17 | S3 | F | state-missing | If the call to /api/auth/me fails or answers 'not authenticated', the page stays on the spinner with 'Hleður...' for good. There is no timeout and no error text. | `views/admin.html:593-623` |
| admin.B/admin.B-18 | S4 | F,K | state-missing | Several loads have no loading state. The Notendur tab is blank until the list arrives, the Bækur grid shows 'Engar bækur fundust' until the catalogue arrives, and 'Skrá', 'Skoða' (feedback) and ↻ give no sign … | `views/admin.html:270` |
| admin.B/admin.B-19 | S3 | F | state-missing | Changing 'Staða' or 'Forgangur' in the feedback dialog saves at once but gives no confirmation, and when the save fails the dropdown keeps showing the value that was not saved. | `views/admin.html:1220-1243` |
| admin.B/admin.B-20 | S4 | F | label-mismatch | When the migration endpoint answers 200 with success: false, the 'Keyra flutning' button shows 'Lokið!' while the toast shows the English '<n> migration(s) failed'. | `views/admin.html:847-856` |
| admin.B/admin.B-21 | S3 | E | work-loss | Typed text is discarded without warning. Escape closes both feedback dialogs at once and empties the resolution note, and Escape, × or a click outside the feedback dialog drops a half-written reply; the 'Skrá … | `views/admin.html:1133-1135` |
| admin.B/admin.B-22 | S4 | E | other | 'Svara' has no in-flight guard, so a double click stores the same reply twice. 'Bæta við' (user) and 'Vista' (user) are not disabled while their request runs either. | `views/admin.html:1245-1254` |
| admin.B/admin.B-23 | S3 | I | a11y | The closed 'Breyta notanda' panel stays in the keyboard tab order: it is only moved off-screen, so Tab lands on invisible '×', 'Hætta við' and 'Vista' buttons and, after a first edit, on the whole invisible fo… | `views/admin.html:61-64` |
| admin.B/admin.B-24 | S3 | I | a11y | The only control for removing a chapter assignment is a clickable span '×' with no tabindex, role or key handler, so it cannot be operated from the keyboard. User rows are clickable tr elements too, but each r… | `views/admin.html:791` |
| admin.B/admin.B-25 | S3 | I | a11y | The five dialogs declare aria-modal but do not behave as modal for the keyboard: focus is not moved into them, not kept inside them and not returned afterwards, and they have no accessible name. Escape closes … | `views/admin.html:400` |
| admin.B/admin.B-26 | S3 | I | a11y | No text field or dropdown on the page has a programmatic label: 20 static fields and 7 built by script. Visible labels are not tied to their fields, the filters have no label at all, and several fields rely on… | `views/admin.html:274-282` |
| admin.B/admin.B-27 | S3 | F,I | a11y | Toasts carry most of the page's feedback but are not announced to assistive technology, vanish after four seconds, cannot be dismissed or read again, and tell success from failure by colour alone when the text… | `views/admin.html:625-635` |
| admin.B/admin.B-28 | S3 | I | a11y | Several text colours fall well below the 4.5:1 contrast needed for small text. Muted text (table headers, captions of counters, help text, empty states) is about 2.8:1 in both themes; in the light theme the pa… | `public/css/common.css:41-53` |
| admin.B/admin.B-29 | S4 | I | a11y | Structure is thin for screen-reader users. The layout script replaces the page's main element with plain divs, there is no skip link and the page title is a span, so the page has no main landmark and no page h… | `public/js/layout.js:141` |
| admin.B/admin.B-30 | S4 | G | copy | Spelling and agreement slips: 'Kerfistjóri' and 'kerfistjórar' in three places beside 'Kerfisstjóri' in three others; 'valfrálst'; 'Öll forgangs'; 'Ensk heiti' beside 'Enskt heiti'; 'Engir sérstakir bókaréttin… | `views/admin.html:278` |
| admin.B/admin.B-31 | S3 | C,J | inconsistency | The same roles carry different names on one screen. The sidebar's 'Skoða sem' picker calls the admin 'Stjórnandi' and the viewer 'Áhorfandi', while the page calls them 'Kerfisstjóri' and 'Lesandi'; 'Stjórnandi… | `public/js/layout.js:102-108` |
| admin.B/admin.B-32 | S4 | C | jargon | The page speaks the pipeline's language: 'CNXML', '01-source/', 'Slug', 'GitHub repo URL', 'flutning (migration)', 'Commit:', 'einingar útdregnar'. It identifies books by slug ('efnafraedi-2e') and chapters as… | `views/admin.html:266-267` |
| admin.B/admin.B-33 | S3 | C,G | copy | Help is missing where an occasional admin needs it. The role pickers do not say what each of the four roles may do or how 'Hlutverk' differs from the per-book role under 'Bókaheimildir', and 'Bæta við notanda'… | `views/admin.html:283` |
| admin.B/admin.B-34 | S3 | C,J | inconsistency | Feedback can be set to 'Leyst' in two ways that do different things. The 'Staða' dropdown changes only the status; the button 'Merkja sem leyst' also records who resolved it, when, and an optional note. After … | `views/admin.html:502` |
| assignments.AB/assignments-01 | S1 | B,D,E | api-contract | Picking a different editor in a chapter's dropdown does not move the chapter: it adds a second assignee and keeps the first, who retains access. The table shows only one assignee per chapter, and choosing '— Ó… | `public/js/assignments.js:171-195, 342-…` |
| assignments.AB/assignments-02 | S2 | C,D,G | label-mismatch | The only explanation of the toggle, a hover tooltip, says editors are limited to their assigned chapters when it is ON, implying assignments do not limit access when it is OFF. In code, with the toggle OFF an … | `views/assignments.html:20-23; s…` |
| assignments.AB/assignments-03 | S2 | D,F | role-ui-shows-server-refuses | A head editor is offered every registered book, but the server serves only the books on their own head-editor list; any other book shows 'Villa: Insufficient permissions'. That can be the first thing they see,… | `public/js/bookSelector.js:30-37, 82-10…` |
| assignments.AB/assignments-04 | S2 | B | api-contract | The assign and unassign routes reject every chapter above 30, although the page lists all extracted chapters and the editor accepts chapters up to 99. Today row K31 of Lífræn efnafræði can never be assigned (e… | `routes/admin.js:1151, 1188; con…` |
| assignments.AB/assignments-05 | S2 | B,F | state-missing | When a chapter's assignee is not in the eligible-editor list, the dropdown shows '— Óúthlutað —' although the chapter is assigned: the row is not highlighted, the 'Úthlutað' card counts it, and the assignee's … | `public/js/assignments.js:57-75, 90-108…` |
| assignments.AB/assignments-06 | S2 | I | a11y | In the dark theme the assigned editor's name is probably unreadable: the dropdown gets the dark surface colour as background but no text colour, so the browser's default dark control text is used (about 1.3:1)… | `public/css/common.css:41-52, 2485-2497…` |
| assignments.AB/assignments-07 | S3 | D,F | role-ui-shows-server-refuses | The 'Þvinga kaflaúthlutun' checkbox is shown, enabled, to head editors, but the server lets only admins change it. A head editor who clicks it gets the English toast 'Insufficient permissions' and the box flip… | `public/js/assignments.js:331-337, 388-…` |
| assignments.AB/assignments-08 | S3 | B,J | dead-control | On /assignments the sidebar theme button ('Skipta um þema') does nothing and its 'Dimmt' / 'Ljóst' label stays empty. This page is the only view that loads theme.js before layout.js. | `views/assignments.html:73-74; p…` |
| assignments.AB/assignments-09 | S3 | F,G | raw-error | Every failure on this page is shown as the server's English error string or a raw exception message, or as the browser's own network error (for example 'Villa: Failed to fetch'). The Icelandic fallbacks writte… | `public/js/htmlUtils.js:44-55; p…` |
| assignments.AB/assignments-10 | S3 | F | state-missing | After any load error the error sentence permanently replaces 'Hleður...': every later load, including the reload after each assignment change, shows the old 'Villa: ...' text while loading. On an error the sta… | `public/js/assignments.js:72-74, 310-31…` |
| assignments.AB/assignments-11 | S3 | F,C | state-missing | There is no empty state. A book with no extracted chapters (Stjörnufræði in this checkout) shows only the table header and 0 / 0 / 0, and when a book has no eligible editors every dropdown contains only '— Óút… | `public/js/assignments.js:97-108, 159, …` |
| assignments.AB/assignments-12 | S3 | F | silent-failure | If the book list cannot be fetched, or is empty, the page shows 'Hleður...' forever beside an empty selector, with no error. | `public/js/bookSelector.js:39-42, 100-1…` |
| assignments.AB/assignments-13 | S3 | I,K | a11y | Every assignment change hides the whole table and rebuilds it, destroying the dropdown that had focus, so a keyboard user is sent back to the top of the page after each change (the scroll position is probably … | `public/js/assignments.js:118, 159, 197…` |
| assignments.AB/assignments-14 | S3 | I | a11y | The book selector and every per-chapter editor dropdown have no label, aria-label or title, and the table's last column header is empty. | `views/assignments.html:13, 57-64; serv…` |
| assignments.AB/assignments-15 | S3 | F,I | a11y | All save feedback is a toast with no role or aria-live that removes itself after 3 seconds, errors included; an error cannot be read again and is never announced. The loading and error line has no live region … | `public/js/assignments.js:29-47; server…` |
| assignments.AB/assignments-16 | S3 | B,E | other | After the book is switched, both checkboxes keep showing the previous book's state until the new load succeeds (indefinitely if it fails), yet a click already writes to the newly selected book. loadAssignments… | `public/js/assignments.js:236, 259, 265…` |
| assignments.AB/assignments-17 | S2 | A,F | unreachable-function | Assigning or unassigning a chapter tells the editor nothing: no in-app notification and no e-mail is sent, and no page shows editors their own chapters. The ready-made notifier notifyAssignmentCreated has no c… | `routes/admin.js:1158-1168, 1196-1205; …` |
| assignments.AB/assignments-18 | S3 | E,J | missing-confirmation | Switching 'Þvinga kaflaúthlutun' on takes effect at once with no confirmation, although it immediately removes edit access from every editor who has no chapter assigned in that book. The neighbouring AI-sugges… | `public/js/assignments.js:271, 279, 391…` |
| assignments.AB/assignments-19 | S3 | G,B | label-mismatch | The first switch-on prompt asks the admin to type 'heiti bókarinnar' (the book's name), but the server accepts only the slug (for example 'efnafraedi-2e'), which is printed under the text with no instruction. … | `public/js/ui-strings.js:501-502, 505; …` |
| assignments.AB/assignments-20 | S3 | C,G | jargon | Several labels assume inside knowledge: 'Þvinga kaflaúthlutun' and 'Kaflaúthlutun þvinguð' (force what?), the chapter codes 'K1' and 'Við.', an unexplained percentage under 'FRAMVINDA', 'Yfirlesarar' as a coun… | `views/assignments.html:21-22, 47, 59-6…` |
| assignments.AB/assignments-21 | S3 | C,J | inconsistency | The same people are 'yfirlesarar' on this page and 'ritstjórar' in the page's own confirmation dialog, while 'yfirlestur' elsewhere names the head editor's review of their work. A teacher cannot tell from the … | `views/assignments.html:21, 47, 61; ser…` |
| assignments.AB/assignments-22 | S3 | H | docs-drift | No guide explains this page. The admin guide's 'Assigning Work' says to tell editors their chapters 'via team communication channel' and points to /segment-editor, /review-queue, /chapter and /issues, which ar… | `docs/admin-guide.md:64-79; docs/editor-guide/…` |
| assignments.AB/assignments-23 | S4 | H,G | docs-drift | ui-strings.js says it holds 'all user-facing Icelandic text in one place', but only three views load it and this page hardcodes about 26 strings against 8 taken from UI.*. Thirteen catalogue entries are refere… | `public/js/ui-strings.js:2, 5, 48, 252,…` |
| assignments.AB/assignments-24 | S3 | G,C | copy | The shared string catalogue contains agreement errors and uses one word for two things. Examples: 'N bútar vistaðar' (masculine noun, feminine participle), 'N/M bútar breytt', 'N færslur bættar við skrá', 'Ley… | `public/js/ui-strings.js:20, 24, 62, 83…` |
| books.A/books-01 | S2 | B,F | api-missing | Both chapter panels request GET /api/issues?book=..&chapter=..&status=pending, but the server has no /api/issues route. Observed: the 'Atriði' tab and panel always show 'Villa við að hlaða atriði', the 'Atriði… | `views/books.html:2011-2013, 2083-2087 …` |
| books.A/books-02 | S3 | B | dead-control | 'Öll atriði' in the Kafli view links to /issues?book=..&chapter=.., a page that no longer exists; the server answers with a redirect to the home page. Observed: the user lands on Heim with no explanation. The … | `views/books.html:1341-1358, 2349-2350 …` |
| books.A/books-03 | S3 | B | dead-control | The status pill on every chapter card ('Klárt', 'Í vinnslu', 'Ekki byrjað'; tooltip 'Framvinduferill') is a link to /pipeline/<book>/<chapter>, which the server redirects to the general /progress page. Clickin… | `views/books.html:1801-1811; rou…` |
| books.A/books-04 | S2 | B,F | label-mismatch | The 'HTML' button (tooltip 'Sækja birta HTML') appears as soon as ANY publication track is complete, but it always asks for the reviewed track (type=pub-faithful). For a chapter published only as machine-trans… | `views/books.html:1022-1045, 2184-2190,…` |
| books.A/books-05 | S2 | B,G,H | dead-control | 'Sækja allt EN markdown' first asks for confirmation with a text that sends the user to a '↓ Sækja EN' button in 'kaflayfirlit' and mentions a protection step; neither exists any more. After OK the server refu… | `views/books.html:929-946, 2771-2782; s…` |
| books.A/books-06 | S3 | F | raw-error | The three download buttons work by pointing the browser tab at an API address. Any refusal replaces the application with a raw JSON error in English, for example 'No translation memory / No reviewed (faithful)… | `views/books.html:2251-2260, 2781; serv…` |
| books.A/books-07 | S2 | D | role-ui-shows-server-refuses | The publish buttons are shown to every head editor on every book. The server lets a head editor publish only the books listed in their own session (403 otherwise) and refuses efnafraedi-2e for everyone but adm… | `views/books.html:2154-2182; mid…` |
| books.A/books-08 | S2 | F | silent-failure | When a publish request is refused or the job fails, the page shows only the badge 'Villa' or 'Mistókst'. The server's reason (chapter not ready, validation errors, a job already running, not your book, the Ice… | `views/books.html:2197-2249; pub…` |
| books.A/books-09 | S3 | F | state-missing | The publish status poll has no exit for errors. If the job record disappears (jobs are kept only in server memory, so a restart or deploy loses them) every poll fails, the error is swallowed, the badge stays '… | `views/books.html:2205, 2220-2243; serv…` |
| books.A/books-10 | S2 | E,G | missing-confirmation | 'Birta MT', 'Birta' and 'Birta staðf.' start the publication job on a single click, with no confirmation and no way to cancel. The job rewrites the chapter's generated and published files and advances its pipe… | `views/books.html:992-1017, 2197-2218; …` |
| books.A/books-11 | S3 | D | role-ui-shows-server-refuses | 'Skrá nýja bók' has the class admin-only, which the layout shows to head editors as well as admins. All three requests behind it require the admin role, so a head editor who clicks it gets a dialog that only s… | `views/books.html:892-912, 1520-1524, 2…` |
| books.A/books-12 | S2 | B | dead-control | After one book has been registered, or after the registration form was closed with ×, 'Skrá nýja bók' opens a dialog with an empty body: only the heading and ×. Expected: the catalogue list. Reloading the page… | `views/books.html:2543-2551, 2715-2731,…` |
| books.A/books-13 | S3 | B | state-missing | The addresses this page writes into the address bar do not lead back to what the user was looking at. Reloading or bookmarking /books/<book> or /books?view=chapter&book=..&chapter=.. lands on the plain book li… | `views/books.html:1530-1535, 1538-1559,…` |
| books.A/books-14 | S3 | D,F | visitor-unhandled | A viewer is served /library, but the page's main requests need the editor role. Observed: 'Villa við að hlaða bókum' instead of the list; in the Kafli tab 'Villa við að hlaða hlutum' and a status badge that st… | `routes/views.js:56; routes/admi…` |
| books.A/books-15 | S4 | A,D | role-ui-hides-server-allows | The 'Bókasafn' link sits in the Stjórnun section that only admins and head editors see, while the server serves the page and its read requests to editors. The translation-memory and content downloads are allow… | `public/js/layout.js:75-89, 388-403; se…` |
| books.A/books-16 | S3 | D,F | role-ui-shows-server-refuses | For an editor the 'Virkni' tab and the 'Nýleg virkni' panel are visible, but the activity request requires head editor. The page hides the refusal and prints 'Engin virkni', which is false. | `views/books.html:1096, 2091-2111, 2517…` |
| books.A/books-18 | S3 | B,C | label-mismatch | In the Kafli tab every row of the 'Hlutar' list is labelled only with a raw module ID (m68664, chapter-metadata) and its 'Opna' button opens the chapter, not that module: all rows carry the same link. In the B… | `views/books.html:2395-2428 (compare 19…` |
| books.A/books-19 | S3 | A,J | inconsistency | The chapter dropdown in the Kafli tab never offers the appendices, although the Bækur view shows a 'Við.' card for them. It also lists chapters as 'Kafli N' without titles although the titles are in the same r… | `views/books.html:2318-2329; rou…` |
| books.A/books-20 | S3 | F,J | inconsistency | One chapter gets its status from two unrelated calculations with two vocabularies. The card can say 'Í vinnslu' (from section statuses, or from pipeline stages when no section has progress) while the panel for… | `views/books.html:1743-1772 (card), 197…` |
| books.A/books-21 | S3 | I | a11y | Book cards and chapter cards are <div> elements with only an onclick. They cannot be reached with Tab or activated with Enter or Space, so a keyboard user cannot open a book or a chapter and never reaches the … | `views/books.html:1667-1669, 1792-1796,…` |
| books.A/books-22 | S4 | I | a11y | The registration dialog cannot be closed with Escape or by clicking outside it, does not take focus, has no accessible name, and its close button is a bare '×'. Four fields (Bók, Kafli, stuttnefni, heiti) have… | `views/books.html:1399-1403, 1144-1149,…` |
| books.A/books-23 | S3 | A,B | hidden-forever | The top bar of this page (and of every page that uses the layout) contains a notification bell and counter that are inserted hidden and are never shown or connected to anything. The server stores in-app notifi… | `public/js/layout.js:144-147; ro…` |
| books.A/books-24 | S3 | A,F | unreachable-function | The server can report for a chapter which track readers currently get, whether each track is ready to publish and why not, and whether a job is running. No page asks for this. The library decides which publish… | `routes/publication.js:71-123, 299; ser…` |
| books.A/books-25 | S3 | C | jargon | Several labels assume pipeline or translation-industry vocabulary a teacher should not need: 'Birta MT', 'Birta staðf.' (an abbreviation that can be read as staðfært or staðfest), 'Sækja allt EN markdown', 'Sæ… | `views/books.html:945, 949-956, 998, 10…` |
| books.A/books-26 | S3 | C,J | inconsistency | The same things have different names on one page: the units of a chapter are 'einingar' on the cards and in the registration message but 'Hlutar' in figures, tabs and panels; not started is 'Ekki byrjað' or 'E… | `views/books.html:1053, 1093, 1310 ('Hl…` |
| books.A/books-27 | S3 | C | inconsistency | The 'Kafli' tab is a second chapter overview that shows less than the chapter panel in the Bækur view (no publish buttons, no HTML download, module IDs instead of titles, no appendices) and repeats its request… | `views/books.html:842-861, 1132-1394, 2…` |
| books.A/books-28 | S4 | C,G | english-on-screen | The 'Hlutar' list shows section titles in English only (for example 'Chemistry in Context'). The code never uses the section's Icelandic title field, and the book data has none to offer. | `views/books.html:1943 (also 1674, 1735…` |
| books.A/books-29 | S4 | F,G | raw-error | A failed registration is reported with a native alert 'Villa: ' plus the server's short English error code ('Invalid slug', 'Already registered', 'Not available', 'Failed to register book'); the longer explana… | `views/books.html:1419-1427, 2740-2762;…` |
| books.A/books-30 | S4 | D,J | inconsistency | The admin's 'Skoða sem' role preview does not reach this page's own role checks. Previewing as Yfirlesari or Áhorfandi hides 'Skrá nýja bók' but still shows the publish buttons and loads data the previewed rol… | `views/books.html:1521, 1649, 2155-2156…` |
| books.A/books-31 | S4 | F,K | state-missing | Opening another chapter does not clear the previous chapter's figures or lists. Until the new data arrives, or if a request fails, the new chapter's name stands over the old chapter's 'Hlutar' and 'Framvinda' … | `views/books.html:1860-1910, 1974-2003` |
| books.A/books-32 | S4 | A,B | unreachable-function | A catalogue book whose subject is not in the fixed subject list is shown without a 'Skrá' button and always with the badge 'Ekki skráð', even when it is registered. Books added through the admin page's add-to-… | `views/books.html:2607-2622, 2627-2655;…` |
| books.B/books-01 | S2 | B,F | api-missing | Both chapter views request GET /api/issues, which no server route provides, so the 'Atriði' tab and panel can only ever show 'Villa við að hlaða atriði' and the 'Atriði' number stays '-'. The empty state, the … | `views/books.html:2011-2013, 2083-2087,…` |
| books.B/books-02 | S2 | F | state-missing | When a publish request is refused the page shows only the word 'Villa' in the badge (or 'Mistókst' when the job fails); the server's reason is thrown away. For efnafraedi-2e every non-admin publish is refused … | `views/books.html:2197-2249; lib…` |
| books.B/books-03 | S2 | B,F | raw-error | The 'HTML' download button appears when any publication track is complete but always requests the faithful track (type=pub-faithful). When only the MT preview is published - the state of every 05-publication t… | `views/books.html:1022-1045, 2184-2190,…` |
| books.B/books-04 | S2 | B,F,G | dead-control | 'Sækja allt EN markdown' cannot succeed for any book in the repository: the server refuses with 409 because the files are not in the retired 'protected' format, and the browser shows that refusal as a raw JSON… | `views/books.html:929-946, 2194-2195, 2…` |
| books.B/books-05 | S2 | F | raw-error | All three downloads are started by pointing the whole tab at an API URL, so any refusal replaces the application with a raw JSON document in English. 'Sækja þýðingaminni' does this for every book that has no r… | `views/books.html:947-958, 2251-2260, 2…` |
| books.B/books-06 | S3 | F | silent-failure | Polling errors during publication are swallowed, so when the job can no longer be found the badge stays 'Í gangi...' and the publish button stays disabled until another chapter is opened. A server restart caus… | `views/books.html:2205-2243; rou…` |
| books.B/books-07 | S3 | F,D | silent-failure | A failed activity request is displayed as the empty state 'Engin virkni', which a user cannot tell apart from a chapter with no activity. For the editor role the request always fails, because GET /api/activity… | `views/books.html:2099-2110, 2525-2536;…` |
| books.B/books-08 | S3 | F | silent-failure | If the module-list request fails, the chapter header badge stays 'Hleður...' indefinitely and the 'Hlutar' and 'Framvinda' numbers keep whatever the previously opened chapter showed. Opening another chapter ne… | `views/books.html:1881-1906, 1974-2003,…` |
| books.B/books-09 | S3 | F | silent-failure | bookSelector.js swallows a failed /api/books/list request and renders a dropdown that contains only 'Veldu bók...', with no error text; before the response arrives the select has no options at all. On the 'Kaf… | `public/js/bookSelector.js:27-43, 62-79…` |
| books.B/books-10 | S3 | B,F | dead-control | After a book has been registered, or after the dialog is closed with × while the registration form is showing, clicking 'Skrá nýja bók' again opens an empty dialog: the catalogue list stays hidden. Only reload… | `views/books.html:2543-2551, 2715-2731,…` |
| books.B/books-11 | S3 | F,G | english-on-screen | A failed registration is shown as alert('Villa: ' + err.message), and err.message is the server's short `error` label, which is English in every case but one ('Invalid slug', 'Missing parameters', 'Already reg… | `views/books.html:1419-1427, 2760-2762;…` |
| books.B/books-12 | S3 | E,F | state-missing | Submitting the registration form shows no progress and does not disable 'Skrá bók', although registration may wait on a download of the book structure from OpenStax. A second click sends a second request. | `views/books.html:1415, 1447, 2733-2765…` |
| books.B/books-13 | S2 | B,C,F | label-mismatch | The status badge and reviewer column in the 'Hlutar' tab show book_sections.status and linguistic_reviewer_name, which no screen in the interface can change. Every section therefore shows the registration defa… | `views/books.html:1933-1955, 2397-2406;…` |
| books.B/books-14 | S3 | C,J | inconsistency | The chapter card and the opened chapter's header compute their status badge from different inputs and use different words for 'not started'. A chapter that has machine translation but no reviewed files shows '… | `views/books.html:1743-1772, 1785-1789,…` |
| books.B/books-15 | S3 | C | jargon | The 'Hlutar' list on the 'Kafli' tab identifies each row only by its internal module ID (for example 'm68664', and the literal 'chapter-metadata'), although the same response carries the section number and tit… | `views/books.html:2395-2428, 1956-1962;…` |
| books.B/books-16 | S2 | I | a11y | Book cards and chapter cards are <div onclick> elements with no tabindex, role or key handler, so they cannot be focused or activated from the keyboard. The book header with its downloads, the chapter detail a… | `views/books.html:97-111, 180-194, 1667…` |
| books.B/books-18 | S3 | I | a11y | None of the page's five <label> elements is associated with a control, so the book select, the chapter select, the slug input and the Icelandic-title input have no programmatic label. One of the five is an emp… | `views/books.html:1144-1155, 1418-1441` |
| books.B/books-19 | S3 | I,F | a11y | No status change on the page is announced to assistive technology: there is no aria-live region and no role=status or role=alert. The publish badge ('Í gangi...' to 'Birt', 'Mistókst' or 'Villa') and every loa… | `views/books.html:1018, 1694-1698, 2205…` |
| books.B/books-20 | S3 | I | a11y | Muted text, used for most secondary information on this page, is far below the WCAG AA ratio of 4.5:1: it computes to 2.8:1 on card surfaces in both themes and 2.5:1 on the grey badges in the dark theme. In th… | `public/css/common.css:51-53, 65, 167-1…` |
| books.B/books-21 | S4 | G | copy | Several on-screen strings are ungrammatical or unidiomatic Icelandic: 'Enginn bækur í skráning', 'Innskráning krafist til að sjá bækur', 'Þýðing móttekið', 'Staðfæring úthlutað', 'Villa við að hlaða atriði', '… | `views/books.html:1477, 1478, 1484, 156…` |
| books.B/books-22 | S3 | C,G | jargon | The publish buttons read 'Birta MT', 'Birta' and 'Birta staðf.', and the download controls 'HTML', 'Sækja allt EN markdown' and 'Sækja þýðingaminni' with a 'TMX / CSV / JSON' selector. None of the publish butt… | `views/books.html:945, 947-958, 992-101…` |
| books.B/books-23 | S3 | C,J | inconsistency | The same unit is called 'Hlutar' in the chapter detail and 'einingar' on the chapter cards and in the registration message, and the label 'Atriði' ('items') stands for open issues without saying so. The page t… | `views/books.html:1053, 1061, 1093, 109…` |
| books.B/books-24 | S3 | G,C | english-on-screen | Activity rows print server-written descriptions verbatim. Chapter-assignment events are stored in English with a raw user id ('Assigned chapter 3 to user 7', 'Unassigned chapter 3'); most others embed module a… | `views/books.html:2805-2828; rou…` |
| books.B/books-25 | S3 | B,E | other | The addresses the page writes into the address bar cannot be reloaded, bookmarked or shared. After opening a book the address is /books/<slug>, which the server redirects to /library?book=<slug>, and the page … | `views/books.html:1530-1535, 1551, 1836…` |
| books.B/books-26 | S3 | F,A | state-missing | The chapter detail has no lasting indication of what has been published. The 'Birt' badge exists only until another chapter is opened; afterwards the only clues are which buttons are visible ('HTML', 'Birta st… | `views/books.html:1892-1897, 2158-2191,…` |
| books.B/books-27 | S4 | F | state-missing | A book with no chapters and a chapter with no sections render as blank areas with no message, whereas the 'Kafli' tab says 'Engir hlutar fundust' for the same situation. | `views/books.html:1738-1741, 1933-1966,…` |
| books.B/books-28 | S4 | H,J | docs-drift | ui-strings.js describes itself as 'all user-facing Icelandic text in one place', but this page neither loads it nor refers to UI.*: all of its roughly 157 strings are hardcoded, including hand-typed copies of … | `public/js/ui-strings.js:1-9; vi…` |
| books.B/books-29 | S4 | K,F | state-missing | Clicking a chapter card may give no visible response until all five requests have finished: the detail panel is placed below the whole chapter grid, and the page scrolls to it only after Promise.all resolves. | `views/books.html:921-965, 1864, 1900-1…` |
| books.B/books-30 | S3 | F,G | state-missing | Every load error is a fixed 'Villa við að hlaða ...' line with no cause, no retry control and no next step, and a permission refusal looks exactly like a server failure. The server's reason is written only to … | `views/books.html:1694-1698, 1837-1842,…` |
| localization-editor-save.E/localization-editor-save-01 | S1 | E | work-loss | On a save conflict the dialog promises '(Óvistaðar breytingar þínar verða geymdar sem drög.)' and the page writes a draft, then reloads the module. The 5-second draft timer keeps running during that reload and… | `public/js/localization-editor.js:240-2…` |
| localization-editor-save.E/localization-editor-save-02 | S1 | E | work-loss | Draft recovery writes a drafted text only into boxes that are on screen and then deletes the whole draft. If a filter hides the drafted rows during an in-page reload — with 'Breyttar (óvistaðar)' it hides all … | `public/js/localization-editor.js:306-3…` |
| localization-editor-save.E/localization-editor-save-03 | S1 | E,F | work-loss | When a save answer arrives, the page marks the row saved using what is in the box at that moment, not what was sent. Text typed while the request was in flight — routine for the 60-second autosave, which fires… | `public/js/localization-editor.js:156, …` |
| localization-editor-save.E/localization-editor-save-04 | S1 | E | work-loss | The 409 conflict check never runs for a module that had no localized file when the page loaded it. Two people (or two tabs) who start the same never-localized module can therefore save the same row one after t… | `routes/localization-editor.js:322-336,…` |
| localization-editor-save.E/localization-editor-save-05 | S1 | E | work-loss | 'Færa í þessa útgáfu' throws away whatever the head editor has typed but not saved in the open module and deletes the browser draft. Its confirmation says 'Núverandi efni er fyrst vistað sem ný útgáfa, svo þet… | `public/js/localization-editor.js:1342-…` |
| localization-editor-save.E/localization-editor-save-06 | S1 | E | work-loss | Pressing 'Samþykkja' or 'Hafna' on a pending edit reloads the whole module and discards the head editor's own unsaved typing in other rows without any check. At best a draft up to 5 seconds old is offered back… | `public/js/localization-editor.js:659-6…` |
| localization-editor-save.E/localization-editor-save-07 | S1 | E,F | work-loss | With the review tier on, a saved row shows 'Vistað' and the bar 'Allar breytingar vistaðar', but the text is only held for approval: after a reload the box shows the old text and nothing on the page shows the … | `routes/localization-editor.js:382-405,…` |
| localization-editor-save.E/localization-editor-save-08 | S2 | E | other | With the review tier on, the 60-second autosave files whatever is in the box as a review submission, so half-typed text lands in the head editor's 'Staðfærsla í bið' list and can be approved into the book. Exp… | `public/js/localization-editor.js:123-1…` |
| localization-editor-save.E/localization-editor-save-09 | S2 | E,F | state-missing | When a save fails with a 5xx or network error and the automatic retry then succeeds, a toast says 'Vista tókst eftir endurtilraun' but the row stays 'Villa!' / unsaved. The next save or autosave is then refuse… | `public/js/saveRetry.js:17-20, 295-313,…` |
| localization-editor-save.E/localization-editor-save-10 | S2 | E,F | other | Two of the user's own saves that overlap — a double-click on a row's tick button, two rows saved in quick succession on a slow line, or a tick-button save while the autosave is in flight — make the second fail… | `public/js/localization-editor.js:977-1…` |
| localization-editor-save.E/localization-editor-save-11 | S2 | E | silent-failure | If the leave-page prompt appears and the user chooses to stay, the 60-second autosave and the 5-second draft saving are switched off for the rest of the visit, with nothing on screen saying so. Expected: both … | `public/js/localization-editor.js:1406-…` |
| localization-editor-save.E/localization-editor-save-12 | S2 | E,C | missing-confirmation | The 'Afrita' button under the Pass 1 text replaces the content of the row's box with the Pass 1 text in one click, with no question and no undo in the page, although the label reads as a harmless copy. 'Endurh… | `public/js/localization-editor.js:811-8…` |
| localization-editor-save.E/localization-editor-save-13 | S2 | E,G | missing-confirmation | Answering Cancel (or Esc) to 'Fundust N óvistuð drög frá síðustu lotu. Endurheimta?' deletes the draft for good; the wording does not say that declining destroys the text. The same prompt also presents a live … | `public/js/localization-editor.js:316-3…` |
| localization-editor-save.E/localization-editor-save-14 | S2 | B,E,F | label-mismatch | The first save (or autosave) in a module writes every row into the localized file, the untouched ones as copies of the Pass 1 text. After a reload every row shows 'Vistað', the counters say all rows are 'staðf… | `routes/localization-editor.js:356-360,…` |
| localization-editor-save.E/localization-editor-save-15 | S2 | D,E,F | role-ui-shows-server-refuses | An editor can open any module and type in it, but saving needs chapter access, and the page shows no read-only sign. The 60-second autosave is refused silently every time; only a manual save reports it, in Eng… | `routes/localization-editor.js:262-268,…` |
| localization-editor-save.E/localization-editor-save-16 | S2 | E,F | silent-failure | When the 24-hour session ends mid-edit, the next save or autosave redirects to sign-in; the text is put in a browser draft, but the user sees only the browser's generic leave-page prompt and, after signing in,… | `public/js/htmlUtils.js:118-148; server…` |
| localization-editor-save.E/localization-editor-save-17 | S2 | E | other | After a conflict reload the user's draft is put back over the freshly loaded text of the same rows without any sign that another person changed those very rows; saving then replaces that person's version. The … | `public/js/localization-editor.js:274-2…` |
| localization-editor-save.E/localization-editor-save-18 | S3 | E,G | copy | The confirmation for leaving a module with unsaved text asks 'Þú átt óvistaðar breytingar. Viltu yfirgefa?' and does not say that OK throws the text away and also deletes the browser draft. The clearer string … | `public/js/localization-editor.js:1245-…` |
| localization-editor-save.E/localization-editor-save-19 | S3 | E,I,J | inconsistency | Escape pressed anywhere on the page while a module is open — in a text box, with the row-history popover, the 'Útgáfusaga' window or a review-tab dialog open — closes the module. With unsaved text the same con… | `public/js/localization-editor.js:1430-…` |
| localization-editor-save.E/localization-editor-save-20 | S3 | E,F | silent-failure | The row tick button asks 'Bútur var tæmdur — var það viljandi?' (and the other advisory warnings) before saving, but 'Vista allt' and the autosave apply only the blocking rules. An accidentally emptied box is … | `public/js/localization-editor.js:989-1…` |
| localization-editor-save.E/localization-editor-save-21 | S3 | C,F | jargon | When 'Vista allt' is blocked by a missing marker nothing is saved, and the alert names the offending rows by internal id (for example 'm68664:para:fs-id123: Stærðfræðimerkið [[MATH:3]] vantar.') — an id that i… | `public/js/localization-editor.js:1098-…` |
| localization-editor-save.E/localization-editor-save-22 | S3 | F,J | state-missing | Once the retries give up, the red toast 'Vista mistókst eftir N tilraunir. Vinsamlegast reyndu aftur.' stays until the page is reloaded: it has no close control and is not removed when a later save succeeds, s… | `public/js/saveRetry.js:333-341, 356-36…` |
| localization-editor-save.E/localization-editor-save-23 | S3 | E,F | label-mismatch | Choosing a category for a row whose text is already saved and pressing the tick button draws the category badge as if saved, but nothing is stored; after a reload it is gone. Changing only the category also ne… | `public/js/localization-editor.js:1558-…` |
| localization-editor-save.E/localization-editor-save-24 | S3 | E | other | Clicking the logout icon with unsaved text ends the session first and only then triggers the leave-page prompt; choosing to stay leaves an open editor that can no longer save. Expected: the unsaved-text questi… | `public/js/layout.js:538-564; ro…` |
| localization-editor-save.E/localization-editor-save-25 | S3 | E,F | other | Browser drafts are deleted without notice once they are 7 days old, and nothing shows which modules hold a draft — it is offered only when that exact module is opened. For teachers who log in now and then, a d… | `public/js/tabGuard.js:125-162; …` |
| localization-editor-save.E/localization-editor-save-26 | S3 | B,E,F | silent-failure | The 'Bæta við færslu' dialog requires a reason ('Ástæða') and takes a location, reports success, and stores neither; the new line in 'Staðfæringarskrá' then shows the word 'undefined' and no text. Expected: wh… | `public/js/localization-editor.js:2359-…` |
| localization-editor-save.E/localization-editor-save-27 | S3 | B,F | label-mismatch | 'Samstilla við skrá' answers 'N færslur bættar við skrá', but the entries go to a store that no page reads, so the 'Staðfæringarskrá' list on the same screen never shows them. Every further click adds the same… | `public/js/localization-editor.js:2264-…` |
| localization-editor-save.E/localization-editor-save-28 | S3 | E | missing-confirmation | In the 'Staðfærsla í bið' panel 'Samþykkja' writes the text into the book at once without a question and silently retires other editors' pending proposals for the same row. 'Hafna' asks only 'Hafna þessari sta… | `public/js/localization-editor.js:597-5…` |
| localization-editor.A/localization-editor-A-01 | S1 | A,B | dead-control | Observed: in the tab „Yfirlestur á staðfæringu“ the „Hluti“ select can never be filled, so „Hlaða“ can never be enabled and the whole review interface (suggestions, log, both modals; about 30 controls) cannot … | `public/js/localization-editor.js:1842-…` |
| localization-editor.A/localization-editor-A-02 | S2 | B,F | state-missing | Observed: after opening a module and pressing „Til baka“ (or Escape) the module list is gone; in its place a „Hleður einingu...“ spinner turns forever. The same happens when a module fails to load. Expected: t… | `public/js/localization-editor.js:473-4…` |
| localization-editor.A/localization-editor-A-03 | S2 | A,D | role-ui-hides-server-allows | Observed: the only link to this page („Aðlögun“) is hidden from the editor role, yet the page is served to every signed-in role and the server lets an editor read every module and save localized text. Expected… | `public/js/layout.js:388-391, 420-424; …` |
| localization-editor.A/localization-editor-A-04 | S2 | D | role-ui-shows-server-refuses | Observed: every head-editor sees „Útgáfusaga“ → „Færa í þessa útgáfu“ and the „Staðfærsla í bið“ panel with „Samþykkja“ / „Hafna“ in every book. The server accepts these three actions only from an admin or a h… | `public/js/localization-editor.js:534, …` |
| localization-editor.A/localization-editor-A-05 | S2 | D,E | role-ui-shows-server-refuses | Observed: every chapter and module is listed and every textarea is editable for any editor, but saving is refused (403) when the editor has no access to that chapter (book with assignment enforcement on, or an… | `public/js/localization-editor.js:356-3…` |
| localization-editor.A/localization-editor-A-06 | S3 | D,F | role-ui-shows-server-refuses | Observed: a viewer who opens /localization gets the full page with working-looking selectors, but every data request is refused and nothing says so: the chapter list stays „Veldu kafla...“ with no options, and… | `routes/views.js:53-55; public/j…` |
| localization-editor.A/localization-editor-A-07 | S2 | B,E | label-mismatch | Observed: the button „Afrita“ (tooltip „Afrita trúa þýðingu“) under the faithful text copies nothing to the clipboard; it overwrites the row's localized textarea with the faithful text, without asking. On a ro… | `public/js/localization-editor.js:811-8…` |
| localization-editor.A/localization-editor-A-08 | S2 | B,F | label-mismatch | Observed: when the book holds localization edits for approval, the per-row save and the autosave still report „Vistað“ and „Allar breytingar vistaðar“ and count the segment as „staðfærðar“, although nothing wa… | `public/js/localization-editor.js:185-2…` |
| localization-editor.A/localization-editor-A-09 | S2 | A,F | state-missing | Observed: an editor whose edits are held for approval cannot see them again. After reopening the module the textarea shows the old text, no row is marked as waiting, and there is no list of the editor's own su… | `public/js/localization-editor.js:576-6…` |
| localization-editor.A/localization-editor-A-10 | S2 | B,F | label-mismatch | Observed: „Staðfært“ is not real progress. The first save of any one segment — including a ✓ click on an untouched row — writes the whole module into the localized file, so after a reload every segment counts … | `routes/localization-editor.js:356-360,…` |
| localization-editor.A/localization-editor-A-11 | S3 | B,F | silent-failure | Observed: choosing a category on a row whose text is unchanged and pressing ✓ shows the category badge as saved, but the server stores no category, and after a reload it is gone. A category can therefore never… | `public/js/localization-editor.js:1019-…` |
| localization-editor.A/localization-editor-A-12 | S2 | B,E | other | Observed: the per-row ✓ button stays enabled while its request runs, and the single-save path ignores the in-flight flag that „Vista allt“ and the autosave use. Two overlapping saves from the same page (a doub… | `public/js/localization-editor.js:836-8…` |
| localization-editor.A/localization-editor-A-13 | S3 | B,I,J | other | Observed: Escape is an undocumented „leave this module“ key that fires anywhere on the page whenever a module is loaded: in a textarea, while the review tab is showing, and while a dialog is open. The dialogs … | `public/js/localization-editor.js:1430-…` |
| localization-editor.A/localization-editor-A-14 | S2 | E | work-loss | Observed: „Færa í þessa útgáfu“ throws away any unsaved edits in the open module (it deletes the local drafts and reloads), while its confirm says „Núverandi efni er fyrst vistað sem ný útgáfa, svo þetta er af… | `public/js/localization-editor.js:1342-…` |
| localization-editor.A/localization-editor-A-15 | S3 | E | work-loss | Observed: „Samþykkja“ and „Hafna“ on a pending edit reload the whole module without saving a draft or asking. Unsaved text typed in the last 5 seconds is lost, and older unsaved text comes back only if the use… | `public/js/localization-editor.js:659-6…` |
| localization-editor.A/localization-editor-A-16 | S3 | E,G | missing-confirmation | Observed: the draft-recovery question „Fundust N óvistuð drög frá síðustu lotu. Endurheimta?“ deletes the drafts permanently when the user presses Cancel, and the text does not say so. Expected: declining keep… | `public/js/localization-editor.js:306-3…` |
| localization-editor.A/localization-editor-A-17 | S2 | A | unreachable-function | Observed: two functions of the localization review tier exist on the server with no UI. (1) Nothing can switch the tier on or off for a book, so the banner, the „Staðfærsla í bið“ panel and its buttons appear … | `routes/localization-editor.js:103-124,…` |
| localization-editor.A/localization-editor-A-18 | S2 | B,F | api-contract | Observed: the „Staðfæringarskrá“ panel renders every history row as a badge reading „undefined“ followed by an empty „→“ line. Expected: type, old text → new text, reason. | `public/js/localization-editor.js:1923-…` |
| localization-editor.A/localization-editor-A-19 | S2 | B | label-mismatch | Observed: „Samstilla við skrá“ answers „N færslur bættar við skrá“, but the „Staðfæringarskrá“ panel below does not change, because the entries go to a table that no page reads; each further click appends the … | `public/js/localization-editor.js:2264-…` |
| localization-editor.A/localization-editor-A-20 | S2 | B,G | label-mismatch | Observed: the right-hand panel of the review interface is titled „Staðfærð útgáfa“ with the hint „Breytanlegt“, but it shows a copy of the left-hand faithful text and cannot be edited. Expected: the localized … | `views/localization-editor.html:1779-18…` |
| localization-editor.A/localization-editor-A-21 | S3 | B | api-contract | Observed: the form „Bæta við færslu“ requires „Ástæða“ and offers „Staðsetning“ and six „Tegund“ choices, but the server keeps neither the reason nor the location, files the type word in the segment-id column … | `views/localization-editor.html:2007-20…` |
| localization-editor.A/localization-editor-A-22 | S3 | B | label-mismatch | Observed: „Samþykkja“, „Samþykkja allt“ and „Breyta“ → „Vista“ only change a status field. The accepted replacement is never written into the localized text, and nothing tells the user the change still has to … | `public/js/localization-editor.js:2059-…` |
| localization-editor.A/localization-editor-A-23 | S3 | B,F | api-contract | Observed: when a section has no stored faithful-file path, „Skanna“ answers „Skannað! undefined tillögur fundust.“ From the code this is the normal case, because no code path ever fills that path column, so th… | `public/js/localization-editor.js:2126-…` |
| localization-editor.A/localization-editor-A-24 | S3 | D | role-ui-shows-server-refuses | Observed: „Samstilla við skrá“ is shown to everyone in the review interface, but the server accepts it only from the section's assigned localizer, an admin, or a head-editor of that book; anyone else gets the … | `views/localization-editor.html:1714-17…` |
| localization-editor.A/localization-editor-A-25 | S3 | F | label-mismatch | Observed: after the chapters have loaded, the chapter select still shows „Hleður kafla...“ as its selected first option, so it looks as if loading never finished. Expected: „Veldu kafla...“. | `public/js/localization-editor.js:348, …` |
| localization-editor.A/localization-editor-A-26 | S3 | C,J | inconsistency | Observed: one feature, three names. The sidebar link is „Aðlögun“; the page title, topbar and first tab say „Staðfærsla“ / „Staðfærsluritill“; the second tab and its headings say „staðfæring“ („Yfirlestur á st… | `public/js/layout.js:68-71; view…` |
| localization-editor.A/localization-editor-A-27 | S3 | I,B | a11y | Observed: the module rows — the only way to open a module — are div elements with an onclick attribute. They cannot be focused with Tab or activated with Enter or Space, so a module cannot be opened from the k… | `public/js/localization-editor.js:423-4…` |
| localization-editor.A/localization-editor-A-28 | S4 | D | role-ui-hides-server-allows | Observed: „Útgáfusaga“ is hidden from editors, but the three read endpoints behind it (version list, one version's content, per-segment snapshot history) accept any editor. Harmless: they are read-only and ret… | `public/js/localization-editor.js:534; …` |
| localization-editor.A/localization-editor-A-29 | S4 | D,J | inconsistency | Observed: the admin's „Skoða sem“ role preview does not reach this page's own role-dependent controls: previewing as „Yfirlesari“ still shows „Útgáfusaga“ and the pending panel, so the admin does not see what … | `public/js/layout.js:370-376, 450-455, …` |
| localization-editor.A/localization-editor-A-30 | S4 | B | hidden-forever | Observed: the topbar notification bell („Tilkynningar“) is created hidden and no script ever shows it or gives it a handler, on this page or any other. | `public/js/layout.js:144-147` |
| localization-editor.A/localization-editor-A-31 | S4 | B,H | other | Observed: the notification the server writes when a localizer is assigned links to /localization-editor?book=…&chapter=…&module=…. That path redirects to /localization without the query string, and the page re… | `routes/sections.js:201-207; rou…` |
| localization-editor.B/localization-editor.B-01 | S1 | E | work-loss | On a save conflict the dialog promises '(Óvistaðar breytingar þínar verða geymdar sem drög.)', but the draft it writes can be deleted before the reloaded module reads it, so the unsaved text is lost. Expected:… | `public/js/localization-editor.js:240-2…` |
| localization-editor.B/localization-editor.B-02 | S2 | B,F | state-missing | After 'Til baka' (or Escape, or a failed module load) the list under 'Einingar í kafla:' is a permanent spinner reading 'Hleður einingu...'. Expected: the chapter's module list, so the next module can be opene… | `public/js/localization-editor.js:473-4…` |
| localization-editor.B/localization-editor.B-03 | S2 | F,E | label-mismatch | In a book with localization review on, the ✓ button and the 60 s autosave report 'Vistað' / 'Allar breytingar vistaðar' although nothing was written: the text was submitted to the head-editor's queue. Autosave… | `public/js/localization-editor.js:194-2…` |
| localization-editor.B/localization-editor.B-04 | S2 | F,E | state-missing | After reopening a module in review mode an editor sees the old text and no sign that their edit is pending, approved or rejected; a rejection is never communicated. Expected: per-segment review status, which t… | `public/js/localization-editor.js:576-6…` |
| localization-editor.B/localization-editor.B-05 | S2 | F | label-mismatch | After the first save of any single segment, reopening the module shows every row as 'Vistað', the counters 'N staðfærðar / 0 eftir', a full progress bar, an empty 'Eftir að staðfæra' filter and the module badg… | `routes/localization-editor.js:356-360,…` |
| localization-editor.B/localization-editor.B-06 | S2 | E,G | work-loss | The 'Afrita' button (copy icon, tooltip 'Afrita trúa þýðingu') does not copy to the clipboard: it replaces the content of the row's editable field with the faithful text, with no confirmation and no undo. Unsa… | `public/js/localization-editor.js:811-8…` |
| localization-editor.B/localization-editor.B-07 | S2 | E,F | other | Saving two rows with ✓ in quick succession, or pressing ✓ while the autosave fires, makes the second request fail with 409 and the dialog 'Einingin hefur verið breytt af öðrum notanda', although nobody else ed… | `public/js/localization-editor.js:977-1…` |
| localization-editor.B/localization-editor.B-08 | S2 | F,E | silent-failure | When a save fails on a network blip or 5xx and the background retry then succeeds, the toast says 'Vista tókst eftir endurtilraun' but the row still shows 'Villa!', the change still counts as unsaved, and the … | `public/js/saveRetry.js:15-20, 63-71, 2…` |
| localization-editor.B/localization-editor.B-09 | S3 | F,G | raw-error | On a 5xx save response the user gets the retry toast and also a blocking alert 'Villa við að vista: Server villa (500) — reyni aftur'. The alert is meant to be skipped for retryable errors, as it is for networ… | `public/js/saveRetry.js:235-241, 389-41…` |
| localization-editor.B/localization-editor.B-10 | S2 | E,G | missing-confirmation | The prompt 'Fundust N óvistuð drög frá síðustu lotu. Endurheimta?' permanently deletes the drafts when the user presses Cancel or Escape. The text does not say so. | `public/js/localization-editor.js:306-3…` |
| localization-editor.B/localization-editor.B-11 | S2 | E | work-loss | 'Færa í þessa útgáfu' discards any unsaved text in the open module and clears its local draft, while the confirm says 'Núverandi efni er fyrst vistað sem ný útgáfa, svo þetta er afturkræft'. That holds only fo… | `public/js/localization-editor.js:1342-…` |
| localization-editor.B/localization-editor.B-12 | S2 | E | work-loss | Choosing to stay on the page in the browser's leave prompt silently switches off both the 60 s autosave and the 5 s local draft for the rest of the session. The status bar gives no hint. | `public/js/localization-editor.js:1406-…` |
| localization-editor.B/localization-editor.B-13 | S3 | E,I,J | other | Pressing Escape anywhere on the page while a module is open leaves the module; with unsaved changes the same confirm 'Þú átt óvistaðar breytingar. Viltu yfirgefa?' appears twice. The dialogs and the history po… | `public/js/localization-editor.js:1430-…` |
| localization-editor.B/localization-editor.B-14 | S2 | I | a11y | A module can be opened only with a mouse. The rows are div elements with an inline onclick and no tabindex, role or key handler, so the page's main task cannot be started from the keyboard. | `public/js/localization-editor.js:423-4…` |
| localization-editor.B/localization-editor.B-15 | S2 | I,F | a11y | In the dark theme the banner 'Yfirlestur staðfærslu er virkur fyrir þessa bók — …' is light text on a near-white box, about 1.2:1. It is the only notice that saves go to review. | `views/localization-editor.html:1287-12…` |
| localization-editor.B/localization-editor.B-16 | S3 | I | a11y | In the dark theme the version label 'Útgáfa N' in the version-history list is near-black on the dark dialog surface, about 1.2:1. | `views/localization-editor.html:1349-13…` |
| localization-editor.B/localization-editor.B-17 | S1 | A,F | api-missing | On the 'Yfirlestur á staðfæringu' tab the 'Hluti' dropdown always ends as a disabled list reading 'Villa', so 'Hlaða' can never be enabled. The review interface is reachable only by typing /localization?sectio… | `public/js/localization-editor.js:1842-…` |
| localization-editor.B/localization-editor.B-18 | S3 | B,G | label-mismatch | The right-hand panel headed 'Staðfærð útgáfa' with the hint 'Breytanlegt' is neither localized nor editable: it is a copy of the faithful panel. | `views/localization-editor.html:1787-18…` |
| localization-editor.B/localization-editor.B-19 | S3 | B,F | api-contract | Every row in 'Staðfæringarskrá' renders as a badge reading 'undefined' followed by empty text. Expected: type, original text, new text and reason. | `public/js/localization-editor.js:1925-…` |
| localization-editor.B/localization-editor.B-20 | S3 | F | silent-failure | 'Samstilla við skrá' answers 'N færslur bættar við skrá', but the entries never appear in the 'Staðfæringarskrá' panel or anywhere else. | `public/js/localization-editor.js:2264-…` |
| localization-editor.B/localization-editor.B-21 | S3 | E,F | work-loss | The 'Bæta við færslu' form requires 'Ástæða' and offers 'Staðsetning', but the server stores neither. The chosen 'Tegund' is saved as the row's segment id and its category is always empty. | `views/localization-editor.html:2006-20…` |
| localization-editor.B/localization-editor.B-22 | S3 | C,G | english-on-screen | The section status badge shows a raw code such as 'review_approved' or 'faithful_published' for 11 of the 14 section statuses. | `public/js/localization-editor.js:1916,…` |
| localization-editor.B/localization-editor.B-23 | S3 | F,B | other | 'Skanna' ends with the alert 'Skannað! undefined tillögur fundust.' and finds nothing. | `public/js/localization-editor.js:2119-…` |
| localization-editor.B/localization-editor.B-24 | S3 | C | english-on-screen | Modules are listed by their English title followed by the module ID ('Chemistry in Context m68664 §1.1'), and the editor header reads 'm68664 — Chemistry in Context'. Expected: Icelandic titles and no IDs. | `public/js/localization-editor.js:436-4…` |
| localization-editor.B/localization-editor.B-25 | S3 | F,G | english-on-screen | When the server refuses, the alert is English after an Icelandic prefix, for example 'Villa við að vista: You are not assigned to chapter 3 of efnafraedi-2e', 'Villa: Insufficient permissions', 'Villa: Failed … | `public/js/htmlUtils.js:44-49; p…` |
| localization-editor.B/localization-editor.B-26 | S3 | F | raw-error | Server exceptions are sent to the browser as {error: err.message} and printed verbatim, so internal text can reach an alert or the page, including an absolute server path ('EN source not found: <path>/m68664-s… | `routes/localization-editor.js:165-169,…` |
| localization-editor.B/localization-editor.B-27 | S3 | D,F | visitor-unhandled | A viewer or visitor who opens /localization gets a normal-looking page whose 'Kafli' list stays empty and whose review 'Bók' list stays empty, with no message. Expected: a notice that they have no access, or a… | `routes/views.js:53-55; routes/l…` |
| localization-editor.B/localization-editor.B-28 | S3 | I | a11y | No form control on the page has a programmatic label. The 15 label elements have no for= and do not wrap their control, and the editable field in each row has no label, aria-label or title. | `views/localization-editor.html:1476-14…` |
| localization-editor.B/localization-editor.B-29 | S3 | I | a11y | The three dialogs do not take or trap focus and do not close on Escape; two of them have no dialog role. Save status is never announced: there is no aria-live or status role on the status bar, the row indicato… | `public/js/localization-editor.js:31-33…` |
| localization-editor.B/localization-editor.B-30 | S3 | I | a11y | Text set in --text-muted has about 2.8:1 contrast against the card surface in both themes, below the 4.5:1 minimum for body text. On this page that covers the whole English reference column (12 px), the table … | `public/css/common.css:43-45, 53, 160-1…` |
| localization-editor.B/localization-editor.B-31 | S3 | F | other | The error toast 'Vista mistókst eftir N tilraunir. Vinsamlegast reyndu aftur.' stays on screen until the page is reloaded. It has no close control and no timeout. | `public/js/saveRetry.js:333-340, 357-36…` |
| localization-editor.B/localization-editor.B-32 | S3 | F | silent-failure | When the 60 s autosave is refused for any reason other than a conflict, for example 403 'not assigned to this chapter', nothing is shown. The status bar flips from 'Sjálfvirk vistun...' back to 'N óvistaðar br… | `public/js/localization-editor.js:228-2…` |
| localization-editor.B/localization-editor.B-33 | S3 | A,F | state-missing | In a book with localization review on, 'Breytingasaga' stays 'Engin saga.' and no category badge ever appears, even after an edit is approved. The code comment says 'its category shows on approval'. | `services/localizationReviewService.js:…` |
| localization-editor.B/localization-editor.B-34 | S4 | F | state-missing | A filter that matches nothing, for example 'Breyttar (óvistaðar)' with no changes, leaves a bare table header with no message. | `public/js/localization-editor.js:706-7…` |
| localization-editor.B/localization-editor.B-35 | S4 | F,G | state-missing | The static hint 'Engar tillögur fundust. Smelltu á "Skanna" …' is replaced on load by 'Engar tillögur í bið', which is also what the 'Samþykkt' and 'Hafnað' filters show when they are empty. | `views/localization-editor.html:1905-19…` |
| localization-editor.B/localization-editor.B-36 | S4 | H,J | docs-drift | ui-strings.js describes itself as 'all user-facing Icelandic text in one place' and defines Icelandic module badges ('Yfirlestur 1', 'Vantar yfirlestur 1'), but nothing uses them. This page hardcodes 'Pass 1' … | `public/js/ui-strings.js:1-9, 454-459; …` |
| localization-editor.B/localization-editor.B-37 | S3 | C | jargon | The English workflow terms 'Pass 1' and 'Pass 2' appear eight times, in the first heading, the description, two column headers, the module badges, a tooltip and the meta line, next to 'Trú þýðing', a literal r… | `views/localization-editor.html:1469, 1…` |
| localization-editor.B/localization-editor.B-38 | S3 | C,G | jargon | The editing surface exposes internal codes: the 'Tegund' column shows 'PARA', 'TITLE', 'CAPTION'; the bulk-save alert and the pending panel identify text by ids like 'm68664:para:fs-id123'; the editable field … | `public/js/localization-editor.js:793-7…` |
| localization-editor.B/localization-editor.B-39 | S3 | C,J | inconsistency | One concept has several names and one name has several concepts. The page is 'Aðlögun' in the menu, 'Staðfærsla' in its title and 'staðfæring' on its second tab. 'eining' means module in headings, unit of meas… | `public/js/layout.js:70; views/l…` |
| localization-editor.B/localization-editor.B-40 | S3 | G | copy | Several strings have grammar or spelling errors: 'Allar bútur'; feminine adjectives with the masculine 'bútar' ('Breyttar', 'Staðfærðar', 'N bútar vistaðar'); 'valfrálst'; 'Lesaðgang'; 'Einingin hefur verið br… | `views/localization-editor.html:1592-15…` |
| localization-editor.B/localization-editor.B-41 | S3 | G,F | copy | Messages state a problem without a next step: a module that cannot be opened says only 'Vantar Pass 1' / 'Þarf Pass 1 fyrst'; a blocked save says which marker is missing but not how to get it back; 'Breyting e… | `public/js/localization-editor.js:434, …` |
| localization-editor.B/localization-editor.B-42 | S3 | J | inconsistency | Feedback and controls follow no single pattern. Success is an inline word in the editor, a blocking alert on the review tab and a toast for version restore; failures are always alerts. 'Samþykkja' and 'Hafna' … | `public/js/localization-editor.js:635-6…` |
| localization-editor.B/localization-editor.B-43 | S3 | C,G | copy | Help is missing where a teacher needs it: nothing explains the category picker, what 'Skanna' and 'Samstilla við skrá' do, or where saved text goes next; 'Hlaða' with a download icon reads as download; the gui… | `views/localization-editor.html:1435-14…` |
| my-work.A/my-work-A-02 | S2 | D,B | scope-missing | A head-editor's Home counts and lists cover every book, not only the books that person manages. The server refuses approve/reject, apply and the assignments data for books outside the head-editor's own list, s… | `routes/my-work.js:262-267; serv…` |
| my-work.A/my-work-A-03 | S3 | D,F | role-ui-shows-server-refuses | The sidebar shows 'Ritill' to every signed-in user, viewers and visitors included, but every editor data endpoint requires the editor role. A viewer who opens it gets a book list and a chapter list that never … | `public/js/layout.js:47-50, 385-456; se…` |
| my-work.A/my-work-A-04 | S4 | D,F | role-ui-shows-server-refuses | A visitor sees 'Stillingar', can tick the notification boxes and press 'Vista', and is told only afterwards that nothing is stored. The server refuses the save for every visitor. | `views/my-work.html:851-853, 1061, 1873…` |
| my-work.A/my-work-A-05 | S2 | A,D | role-ui-hides-server-allows | 'Aðlögun' is hidden from the editor role in the sidebar, yet the localization page and its API accept editors, saving included. If teachers are meant to localize, the function cannot be reached without typing … | `public/js/layout.js:68-71, 388, 391, 4…` |
| my-work.A/my-work-A-06 | S4 | D | role-ui-hides-server-allows | 'Bókasafn' is shown only to admin and head-editor, but /library is served to any signed-in user. As far as checked this is harmless: the pipeline routes behind the page are head-editor-gated and the book read … | `public/js/layout.js:75-89, 388, 391, 4…` |
| my-work.A/my-work-A-07 | S3 | B,F | hidden-forever | The topbar notification bell and its unread badge are rendered hidden, and no code ever shows them or gives them a handler. The endpoints that list notifications and mark them read have no client caller, so an… | `public/js/layout.js:144-147; pu…` |
| my-work.A/my-work-A-08 | S2 | B,C | label-mismatch | The Stillingar dialog offers 'Í appinu' and 'Tölvupóstur' for each category and answers 'Stillingar vistaðar', but neither choice changes anything a user can observe. In-app notifications are stored and never … | `views/my-work.html:1053-1054, 1824-183…` |
| my-work.A/my-work-A-09 | S3 | E,B | work-loss | Pressing 'Vista' while the preference list is still loading, or after it failed to load, replaces the user's saved preferences with the defaults (everything on) and shows 'Stillingar vistaðar'. Expected: 'Vist… | `views/my-work.html:1061, 1798-1799, 18…` |
| my-work.A/my-work-A-10 | S2 | B,C | label-mismatch | The panel titled 'Tilbúið til úthlutunar' (ready for assignment) lists nothing that can be assigned. It lists modules whose approved edits have not yet been applied, each with an 'N samþykkt' badge and a link … | `views/my-work.html:1017-1024, 1663, 16…` |
| my-work.A/my-work-A-11 | S3 | B | label-mismatch | 'Skoða' on an attention item does not open that item. For a pending edit it goes to /editor?view=reviews with no book, chapter or module, and for an edit marked for discussion it goes to /progress. The user mu… | `views/my-work.html:1582-1585, 1765-177…` |
| my-work.A/my-work-A-12 | S3 | B,G | label-mismatch | 'N samþykktar breytingar bíða birtingar' and the tile 'Samþykkt, bíður birtingar' print a number of modules as a number of changes. The button under that message, 'Skoða úrlausnir', opens the editor filtered t… | `routes/my-work.js:266; services…` |
| my-work.A/my-work-A-13 | S3 | B,C | label-mismatch | Every task and list row stands for one edited segment, but its title and link name only the book, the chapter and the module. Several edits in one module therefore appear as identical rows that all open the sa… | `routes/my-work.js:51-60, 85-92, 111-12…` |
| my-work.A/my-work-A-14 | S3 | B,H | label-mismatch | Home shows an 'Orðatillögur' counter that is always 0 and a card that always says 'Orðatillögur eru ekki enn í boði.', while the terminology page lets editors propose translations that are stored as proposals … | `routes/my-work.js:62-71, 167, 196, 249…` |
| my-work.A/my-work-A-15 | S3 | B,D | other | The admin's 'Skoða sem:' role preview does not change Home's content. With 'Yfirlesari' or 'Áhorfandi' selected the sidebar narrows, but the 'Stjórnun & yfirlit' panels and the admin tiles stay, so the preview… | `public/js/layout.js:101-109, 370-376, …` |
| my-work.A/my-work-A-16 | S4 | B,I | label-mismatch | The 'Sýna N fleiri…' buttons keep that text after the list is opened, so the same label then hides the items. They are also built with aria-expanded='true' while collapsed, and the attribute is never updated. | `views/my-work.html:1320-1324, 1596-160…` |
| my-work.A/my-work-A-17 | S2 | A,C | unreachable-function | An editor cannot see which chapters have been assigned to them. Home builds 'Núverandi verkefni' only from the editor's own rejected or discuss edits, so a newly assigned editor reads 'Þú hefur lokið öllum ver… | `routes/my-work.js:218-236; view…` |
| my-work.A/my-work-A-18 | S3 | B | inconsistency | The focus view and the detailed view work out 'changes requested' from different windows, and both can drop open items. Tasks come from the user's 20 most recently reviewed edits, approved ones included, and t… | `routes/my-work.js:102, 111-120, 151, 2…` |
| my-work.A/my-work-A-19 | S4 | B,K | other | A 'Sýna N fleiri…' list that an admin has opened in the admin panels closes by itself within two minutes. The panels are rebuilt on a timer and the rebuilt markup always starts collapsed. | `views/my-work.html:1096, 1596, 1609, 1…` |
| my-work.A/my-work-A-20 | S4 | B | label-mismatch | 'Sjá allt' beside 'Nýleg virkni teymis' opens /progress on its default tab 'Yfirlit', not on the activity timeline. The user has to find and press 'Tímalína' to see what the link promised. | `views/my-work.html:1031-1034; v…` |
| my-work.B/my-work-51 | S2 | E,F | work-loss | Pressing 'Vista' in the settings dialog while the list is still loading, or after it failed to load ('Villa við að hlaða stillingum'), overwrites the user's saved notification choices with the all-enabled defa… | `views/my-work.html:1061, 1797-1800, 18…` |
| my-work.B/my-work-52 | S2 | B,C | hidden-forever | Every notification category offers an 'Í appinu' checkbox, but the product has no place where in-app notifications are shown: the bell is created hidden and never revealed, and no page reads the notification l… | `views/my-work.html:1824-1827; p…` |
| my-work.B/my-work-53 | S2 | F | silent-failure | If GET /api/my-work fails, the detailed view says nothing: the summary cards stay '-', the header badges stay '0' and all four lists keep the spinner 'Hleður...' for ever. Expected an error line with a retry. | `views/my-work.html:1361-1373, 912-953,…` |
| my-work.B/my-work-54 | S3 | F | silent-failure | If GET /api/status/dashboard fails, the admin section says nothing: on the first load its four spinners stay for ever, and after a failed 2-minute refresh the old data stays with only the 'Uppfært:' time stand… | `views/my-work.html:1096, 1501-1515, 98…` |
| my-work.B/my-work-55 | S2 | F | silent-failure | Database read failures behind this page are turned into empty results on the server, so the page shows its reassuring empty states ('Engin verkefni í dag – vel gert!', zeros, 'Ekkert þarfnast skoðunar!') inste… | `routes/my-work.js:93-96, 121-124, 261-…` |
| my-work.B/my-work-56 | S3 | F | state-missing | When GET /api/my-work/today fails, the heading changes to 'Villa við að hlaða gögnum' while the task card keeps spinning 'Hleður verkefnum...' and the tiles keep '-'. There is no retry and no next step. | `views/my-work.html:1194-1197, 870-873,…` |
| my-work.B/my-work-57 | S2 | B,F | other | The 'changes requested' tasks and counts are computed from the user's N most recently reviewed edits of any outcome, filtered afterwards, with N = 20 for the focus view and N = 10 for the detailed view. Reject… | `routes/my-work.js:102-120, 151, 193-19…` |
| my-work.B/my-work-58 | S2 | C,G | label-mismatch | Home presents every edit a reviewer rejected or marked for discussion as 'Breytingar óskast' with the action 'Laga nú' / 'Laga'. For a discussion the fitting response is a reply, and replying does not clear th… | `routes/my-work.js:219-234; view…` |
| my-work.B/my-work-59 | S3 | C,F | other | A 'verkefni' on Home is a single segment edit, but each row is titled only with book, chapter and module and its link opens the module without naming the segment. Several edits in one module therefore appear a… | `routes/my-work.js:51-60, 85-92, 111-12…` |
| my-work.B/my-work-60 | S3 | C | jargon | Module ids are shown to teachers as the name of the section: 'Efnafræði 2e - Kafli 3, m68663', 'Efnafræði 2e K3/m68663', 'Kafli 3, hluti m68663'. Expected the section number and title. | `routes/my-work.js:86, 112, 142, 157, 2…` |
| my-work.B/my-work-61 | S3 | C,G | english-on-screen | Activity lines written in English reach the screen in 'Nýleg virkni þín' and 'Nýleg virkni teymis', for example 'Added translation: mól (headword #12)', 'Disputed translation #45 — …' and 'Assigned chapter 3 t… | `routes/terminology.js:467, 495, 574, 6…` |
| my-work.B/my-work-62 | S3 | C | jargon | Internal identifiers are printed where a teacher expects a place and a name: module and segment ids ('… vistaði breytingu á m68663:m68663:title:auto-1', 'Bíður yfirlestrar: m68663 / m68663:title:auto-1') and e… | `routes/segment-editor.js:548, 1439, 14…` |
| my-work.B/my-work-63 | S2 | B,G | label-mismatch | The admin panel headed 'Tilbúið til úthlutunar' (ready for assignment), with the empty state 'Ekkert tilbúið til úthlutunar', lists modules whose approved edits are waiting to be applied and published; each ro… | `views/my-work.html:1020, 1658-1683; se…` |
| my-work.B/my-work-64 | S3 | B,G | label-mismatch | The reviewer tile 'Samþykkt, bíður birtingar' and the sentence 'N samþykktar breytingar bíða birtingar.' show the number of modules that have approved edits, not the number of approved changes. | `routes/my-work.js:266; services…` |
| my-work.B/my-work-65 | S3 | B,G | label-mismatch | The attention counter labelled 'Lokað' (closed) counts edits that are marked for discussion; the items it summarises are titled 'Til umræðu: …'. | `views/my-work.html:1532-1537; r…` |
| my-work.B/my-work-66 | S3 | D,G | scope-missing | For a head-editor the tile 'Bíða þíns úrskurðar' and the sentence 'N breytingar bíða úrskurðar þíns.' count every pending edit in every book, although a head-editor can only decide edits in their own books. | `routes/my-work.js:262-267; serv…` |
| my-work.B/my-work-67 | S3 | F,G | inconsistency | A reviewer with edits waiting for them sees the subtitle 'Engin verkefni í dag – vel gert!' directly above a card that says 'N breytingar bíða úrskurðar þíns.' | `views/my-work.html:1136-1145, 1205-121…` |
| my-work.B/my-work-68 | S2 | A,F,G | label-mismatch | When the user has no rejected or discussed edit the page says 'Engin verkefni í dag – vel gert!' and 'Þú hefur lokið öllum verkefnum. Slakaðu á eða biddu eftir nýjum úthlutunum.' The same text is shown to a ne… | `routes/my-work.js:217-242; view…` |
| my-work.B/my-work-69 | S2 | B,F | label-mismatch | The tile 'Orðatillögur' always shows 0 and the card 'Orðatillögur þínar' always says 'Orðatillögur eru ekki enn í boði.', although translations a user adds in Orðasafn are stored as that user's proposals. | `routes/my-work.js:62-71, 167, 249, 288…` |
| my-work.B/my-work-70 | S3 | I | a11y | The settings dialog does not behave as a dialog for keyboard and screen-reader users: focus is not moved into it, not kept in it and not returned; Escape and a click outside do nothing; it has no accessible na… | `views/my-work.html:1046-1064, 1797-180…` |
| my-work.B/my-work-71 | S4 | I | a11y | The four 'Sýna N fleiri …' buttons are rendered collapsed with aria-expanded='true' and the attribute is never updated; the visible label also stays 'Sýna …' after expanding. | `views/my-work.html:1320-1321, 1596-159…` |
| my-work.B/my-work-72 | S3 | I,F | a11y | The result of saving settings is conveyed only by a toast without a live-region role that disappears after 3 seconds, errors included; the warning banner and the loading and error texts have no role either. | `views/my-work.html:861-864, 1866-1879,…` |
| my-work.B/my-work-73 | S3 | I | a11y | Text in the --text-muted colour has a contrast of about 2.5 to 3.1 to 1 against the page's surfaces in both themes, and it is the colour of the tile labels, section labels, empty and loading states, list metad… | `public/css/common.css:43-45, 53, 56, 6…` |
| my-work.B/my-work-74 | S3 | G,J | other | Chapter numbers reach the admin section unformatted: the appendices chapter is announced as 'Kafli -1 í vinnslu án úthlutunar', and the team feed appends ' kafla ' plus the stored value ('kafla -1', and 'kafla… | `routes/status.js:200-208; lib/c…` |
| my-work.B/my-work-75 | S4 | G | inconsistency | Team-feed lines repeat themselves: the actor is printed in bold and again as the first word of the description, and book and chapter are appended a second time as slug and number. | `views/my-work.html:1728-1731; r…` |
| my-work.B/my-work-76 | S3 | F | state-missing | If /api/auth/me fails or takes longer than 3 seconds, a signed-in user is told 'Vinsamlegast skráðu þig inn' and 'Skráðu þig inn til að sjá verkefnin þín', with no link in the message. The page is only ever se… | `views/my-work.html:1100-1111; p…` |
| my-work.B/my-work-77 | S4 | E | other | The chosen view is saved to localStorage under myWorkView but never read, so the page always reopens in the focus view. | `views/my-work.html:1340-1355` |
| my-work.B/my-work-78 | S4 | G,J | copy | Counts and time phrases are worded inconsistently and in places ungrammatically: '(3 dagar síðan)', 'fyrir 1 dögum', '5 samþykkt', '3 d', and plural forms chosen with n === 1 only, so 21 gives '21 breytingar b… | `views/my-work.html:1209, 1217, 1414-14…` |
| my-work.B/my-work-79 | S3 | G | label-mismatch | The tile 'Kláruð í vikunni' (for a reviewer 'Þú kláraðir í vikunni') reads as work the user finished this week; it counts the user's own edits that someone approved in the last 7 days. For a head-editor it doe… | `routes/my-work.js:102-120, 251-256; se…` |
| my-work.B/my-work-80 | S3 | C,J | jargon | One review queue has many names on this single screen: 'Bíða þíns úrskurðar', 'úrskurðar þíns', 'Skoða úrlausnir', 'Í bið', 'Bíður yfirlestrar: …', 'Þarfnast skoðunar', and 'Yfirlestrar' in the sidebar. 'Yfirl… | `views/my-work.html:891, 983, 996, 1001…` |
| my-work.B/my-work-81 | S4 | F,G | copy | The three error messages state a problem with no cause and no next step: 'Villa við að hlaða gögnum', 'Villa við að hlaða stillingum', 'Villa við að vista stillingar'. | `views/my-work.html:1196, 1837, 1869, 1…` |
| my-work.B/my-work-82 | S4 | D,F | visitor-unhandled | A visitor can open the settings dialog, sees default choices and can change them; only after pressing 'Vista' are they told 'Gestir fá engar tilkynningar og því eru engar stillingar vistaðar.' | `views/my-work.html:851-853, 1806-1834,…` |
| segment-editor-save.E/segment-editor-save-01 | S1 | E | work-loss | Clicking „← Til baka“ with unsaved text in one or more open panes discards all of it and deletes the module's local drafts, with no dialog and no message. Expected: a confirmation (the localization editor asks… | `public/js/segment-editor.js:3248-3260 …` |
| segment-editor-save.E/segment-editor-save-02 | S1 | E,F | work-loss | Every table re-render while an ordinary unsaved pane is open asks „Opnum klippispjöldum verður lokað. Viltu halda áfram?“ — after saving a different segment, after Staðfesta MT or a review action, on a filter … | `public/js/segment-editor.js:1561-1587 …` |
| segment-editor-save.E/segment-editor-save-03 | S1 | E | work-loss | When another editor saved the same segment first, the second editor's Vista is refused with 409 and the page does not keep the typed text as it does for the other refusals: it shows the alert, reloads and runs… | `routes/segment-editor.js:600-611; serv…` |
| segment-editor-save.E/segment-editor-save-04 | S1 | E | work-loss | The same user can silently overwrite their own saved edit: save a segment in one tab (or on one device), then save the same segment from a second, stale tab whose row still shows no edit, and the first text is… | `services/segmentEditorService.js:58-76…` |
| segment-editor-save.E/segment-editor-save-05 | S2 | E | missing-confirmation | Pressing Escape while typing in a segment's text field, or clicking „Hætta við“ or „↩ Endurstilla“, replaces the typed text with the old text at once, removes it from the local draft and offers neither a confi… | `public/js/segment-editor.js:4363-4377 …` |
| segment-editor-save.E/segment-editor-save-06 | S2 | E | missing-confirmation | „Nota þessa þýðingu“ on a row whose pane already holds unsaved typed text replaces the whole text with the suggested translation, with no confirmation and no undo. A confirmation exists only for texts kept aft… | `public/js/segment-editor.js:1225-1248;…` |
| segment-editor-save.E/segment-editor-save-07 | S2 | E,F | work-loss | Text typed into the same field after pressing Vista / Ctrl+S but before the server answers is not sent, yet on success the segment is marked clean, dropped from the draft and re-rendered without a question. Th… | `public/js/segment-editor.js:2682 (the …` |
| segment-editor-save.E/segment-editor-save-08 | S2 | F,E | label-mismatch | The green status bar reads „Allar breytingar vistaðar“ whenever no pane is dirty, including right after typed text was thrown away (Hætta við, Endurstilla, Escape, OK at the close-panes question, a refused con… | `public/js/segment-editor.js:54-73; cal…` |
| segment-editor-save.E/segment-editor-save-09 | S2 | E,G | work-loss | At „Fundust N óvistuð drög frá síðustu lotu. Endurheimta?“ the answer Cancel deletes the drafts for good, which the question does not say. Answering OK silently drops every draft whose row is not in the table … | `public/js/segment-editor.js:207 (stora…` |
| segment-editor-save.E/segment-editor-save-10 | S3 | E | work-loss | The „Athugasemd (valkvætt)“ text and the chosen „Flokkur“ are not part of the draft and do not mark the segment as unsaved. They are lost on reload, on any re-render and when a refused save 'keeps' the text, a… | `public/js/segment-editor.js:123-139, :…` |
| segment-editor-save.E/segment-editor-save-11 | S3 | E | work-loss | Unsaved text in a „Myndatexti til yfirlestrar“ field never arms the leave warning and is protected only by a draft written every 5 seconds. Closing or reloading the tab, or any module reload caused by saving o… | `public/js/segment-editor.js:4475-4488,…` |
| segment-editor-save.E/segment-editor-save-12 | S2 | E,D | scope-missing | Local drafts, the retry queue and parked saves are keyed by book/chapter/module only and survive sign-out. On a shared browser profile the next person who signs in is offered the previous person's unsaved text… | `public/js/segment-editor.js:79-94, :18…` |
| segment-editor-save.E/segment-editor-save-13 | S2 | E | other | If an editor saves a new version of a pending edit after the head editor's page loaded, the head editor's ✓ or ✗ is applied to the new text, which was never on their screen. The page sends the hash of the text… | `routes/segment-editor.js:1398-1410, :1…` |
| segment-editor-save.E/segment-editor-save-14 | S2 | E,A | other | After two editors have each saved an edit on the same segment, the earlier one stays in the database as 'pending' but is no longer shown on the row, cannot be approved or rejected from this page, and its autho… | `routes/segment-editor.js:332-346; serv…` |
| segment-editor-save.E/segment-editor-save-15 | S2 | E,F | other | When the session has expired, the first request stores the draft and starts the sign-in redirect, but the page's own unsaved-changes prompt then asks whether to leave. If the user stays, no further redirect ev… | `public/js/htmlUtils.js:118-148; server…` |
| segment-editor-save.E/segment-editor-save-16 | S2 | E,F | silent-failure | „Senda til yfirlestrar“ only counts edits already saved with Vista. With unsaved panes open it says „Engar breytingar til að senda.“ or asks „Senda N breytingar til yfirlestrar?“ without mentioning them, and t… | `public/js/segment-editor.js:3106-3140;…` |
| segment-editor-save.E/segment-editor-save-17 | S2 | G,E | copy | „Opnum klippispjöldum verður lokað. Viltu halda áfram?“ does not say that unsaved text will be lost and uses a word („klippispjöld“) a teacher will not recognise; the safe answer is Cancel, against the flow of… | `public/js/ui-strings.js:45-50; used at…` |
| segment-editor-save.E/segment-editor-save-18 | S2 | F,E,C | label-mismatch | When Vista is blocked for a missing marker, the alert ends „Ýttu á „Endurstilla" til að ná aftur upprunalega textanum.“, and Endurstilla throws away the whole edit without asking. For [[MATH:n]], [#…], [doc#…]… | `public/js/segment-validation.js:34-40,…` |
| segment-editor-save.E/segment-editor-save-19 | S3 | E | missing-confirmation | „✗ Hafna“ on an AI term suggestion removes that suggestion for every editor, permanently, on a single click with no confirmation; nothing in the UI brings it back. The only protection is a 500 ms pause against… | `public/js/segment-editor.js:1743-1748,…` |
| segment-editor-save.E/segment-editor-save-20 | S3 | E | silent-failure | After a save fails on the network and is queued for retry, „Hætta við“ or „Til baka“ discards the text on screen but not the queued request. It can still be saved on the server seconds later (toast „Vista tóks… | `public/js/saveRetry.js:223-229, :381-3…` |
| segment-editor-save.E/segment-editor-save-21 | S3 | F | label-mismatch | Two indicators can contradict the server: after a background retry succeeds the segment still shows „Breytt“ and the bar still counts it as unsaved (only a 5-second toast says it was saved), and when the reloa… | `public/js/segment-editor.js:462-467, :…` |
| segment-editor-save.E/segment-editor-save-22 | S3 | E | other | The two-tab warning can switch itself off: when the user starts to leave one tab and then chooses to stay at the unsaved-changes prompt, that tab still broadcasts 'release', and the other tab hides its banner … | `public/js/tabGuard.js:54-81, :171-176;…` |
| segment-editor-save.E/segment-editor-save-23 | S3 | G,E | copy | A refused save tells the user the text „var geymdur“ / „er geymdur hér“, but it is kept only in this browser's local storage and is removed without notice after 7 days. For refusals the page can never get past… | `public/js/ui-strings.js:135, :152-158;…` |
| segment-editor-save.E/segment-editor-save-24 | S3 | E,J | missing-confirmation | „Vista + Birta“ (write approved edits into the book files and render them for the web), „Vista í skrár“ and the three pipeline buttons run on one click with no confirmation, while smaller actions on the same p… | `views/segment-editor.html:2014-2030, :…` |
| segment-editor-save.E/segment-editor-save-25 | S3 | G,E | copy | The restore question says „…svo þetta er afturkræft“, but a restore also cancels every „Staðfest“ confirmation whose text it changes, and restoring back does not bring those confirmations back. | `public/js/segment-editor.js:4023-4028;…` |
| segment-editor-save.E/segment-editor-save-26 | S3 | E | other | The editor has no undo of its own, and its formatting buttons and shortcuts (B, I, T, Ctrl+B/I/T), term insertion and „✓ Nota“ write the field's value directly, which in most browsers resets the field's own Ct… | `public/js/segment-editor.js:4311-4348 …` |
| segment-editor.A/segment-editor.A-01 | S1 | E,B | work-loss | Clicking „← Til baka“ while edit panes hold unsaved text throws all of it away with no question, and also deletes the browser drafts, so it cannot be recovered. Expected: ask first (the localization editor's B… | `public/js/segment-editor.js:3248-3260,…` |
| segment-editor.A/segment-editor.A-02 | S2 | E | missing-confirmation | Pressing Esc while typing in an edit pane instantly discards everything typed there: no confirmation, no undo, and the draft is updated at once. „↩ Endurstilla“ and „Hætta við“ do the same on one click. The sh… | `public/js/segment-editor.js:4355-4377,…` |
| segment-editor.A/segment-editor.A-03 | S2 | E,F,K | work-loss | Every full re-render of the table closes open edit panes. If a pane holds unsaved text the only warning is „Opnum klippispjöldum verður lokað. Viltu halda áfram?“, which does not say the text is lost, and OK d… | `public/js/segment-editor.js:1561-1584,…` |
| segment-editor.A/segment-editor.A-04 | S2 | D | role-ui-shows-server-refuses | Head-editor controls are drawn by role alone, but the server limits them to the head editor's own books. A head editor who opens a module of another book sees ✓ / ✗ / 💬, Opna aftur, Afturkalla, Afturkalla sta… | `public/js/segment-editor.js:484-488, 1…` |
| segment-editor.A/segment-editor.A-05 | S2 | D,F | role-ui-shows-server-refuses | Breyta, Vista, Staðfesta MT, Hafna (suggestion), Senda til yfirlestrar and Beita víðar are offered to every editor in every chapter, but the server refuses writes from an editor who is not assigned to that cha… | `public/js/segment-editor.js:1673-1686,…` |
| segment-editor.A/segment-editor.A-06 | S2 | D,F | role-ui-shows-server-refuses | On efnafraedi-2e the figure cards under „Myndatexti til yfirlestrar“ show live Vista, Nota, Samþykkja and Merkja villu buttons to everyone, but the server refuses all four for non-admins because figure review … | `lib/heldBookWrites.js:24-26, 45-55; se…` |
| segment-editor.A/segment-editor.A-07 | S2 | D,F | role-ui-shows-server-refuses | „Lífræn efnafræði“ (lifraen-efnafraedi) is offered in the book list and its modules open with Breyta, Staðfesta MT and Vista like any other book, but the server refuses every write for it (409 BOOK_NOT_MINTED)… | `config.js:98-104; routes/books.…` |
| segment-editor.A/segment-editor.A-08 | S2 | B,A | label-mismatch | The review view (/editor?view=reviews) shows the banner „Sýnir einingar sem bíða yfirlestrar“, but the book, chapter and module lists are the ordinary ones: nothing is filtered and module cards carry no sign o… | `public/js/segment-editor.js:4507-4524,…` |
| segment-editor.A/segment-editor.A-09 | S2 | B,A | dead-control | „Senda til yfirlestrar“ works once per module. The review record it creates stays pending because no screen ever calls the one endpoint that closes it, so every later submit of the same module fails with „Vill… | `public/js/segment-editor.js:3106-3140;…` |
| segment-editor.A/segment-editor.A-10 | S2 | A,F | unreachable-function | Review feedback has no path to the other person on screen. The reason a head editor types when rejecting („Ástæða höfnunar:“) is stored and put into an in-app notification, but the author's row shows only the … | `public/js/segment-editor.js:2933-2937,…` |
| segment-editor.A/segment-editor.A-11 | S2 | B,F | label-mismatch | „Forskoðun“ does not preview the text in the editor. It renders the module's last injected CNXML file for the chosen track, so edits made since the last inject, saved or not, are missing; when no injected file… | `views/segment-editor.html:1980-2004; s…` |
| segment-editor.A/segment-editor.A-12 | S2 | B,G | label-mismatch | „Vista + Birta“ (tooltip „Vista í skrár og birta á vef“) ends with the badge „Vistað + Birt!“, but the handler only applies the edits and runs inject and render, which writes HTML files on the editorial server… | `views/segment-editor.html:1958-1963, 2…` |
| segment-editor.A/segment-editor.A-13 | S2 | D,F | visitor-unhandled | A viewer, including a newly signed-in visitor, sees „Ritill“ in the menu and gets the editor page, but every data request needs the editor role. The chapter request fails with 403, the error is swallowed, and … | `routes/views.js:49; public/js/l…` |
| segment-editor.A/segment-editor.A-14 | S3 | D,F | role-ui-shows-server-refuses | On efnafraedi-2e the three pipeline buttons (Innsetja, Birta, Innsetja + Birta) are enabled for head editors although the server refuses them for non-admins (423, pipeline hold). The apply panel on the same pa… | `lib/heldBookWrites.js:18-22, 45-55; se…` |
| segment-editor.A/segment-editor.A-15 | S3 | D,F | role-ui-shows-server-refuses | On a book whose faithful files are held (efnafraedi-2e) the version-history modal still offers „Færa í þessa útgáfu“ on every version; after the confirm the server answers 423 for every role, admin included. | `lib/applyHold.js:14-18; service…` |
| segment-editor.A/segment-editor.A-16 | S3 | B | dead-control | In the module „Lýsigögn kafla“ (id chapter-metadata, present in every chapter) the three pipeline buttons can never work: the request is rejected with 400 „Invalid module ID format. Expected: m followed by 5 d… | `public/js/segment-editor.js:556, 3583-…` |
| segment-editor.A/segment-editor.A-17 | S3 | B | label-mismatch | After a successful submit the toast offers „Skoða yfirlestur →“, but the link is /editor: it reloads this page at the module picker and shows no review. There is no review page; /reviews and /review-queue redi… | `public/js/segment-editor.js:3123-3135;…` |
| segment-editor.A/segment-editor.A-18 | S3 | A,D | role-ui-hides-server-allows | The terminology-deviation report („Hugtakafrávik“) and the grammar and spelling check sit in the panel „Yfirlit yfirlesara“, which is shown only to head editors, although both endpoints accept the editor role.… | `public/js/segment-editor.js:1310-1318;…` |
| segment-editor.A/segment-editor.A-19 | S3 | A | unreachable-function | An editor cannot withdraw their own pending edit except by retyping the original machine translation exactly and saving. The server has DELETE /api/segment-editor/edit/:editId for this, but no control calls it… | `routes/segment-editor.js:1275-1298; se…` |
| segment-editor.A/segment-editor.A-20 | S3 | A | unreachable-function | The version-history modal lets a head editor restore a module to „Útgáfa N“ without any way to see what that version contains; each row shows only who, when and a segment count. | `public/js/segment-editor.js:3964-4016;…` |
| segment-editor.A/segment-editor.A-21 | S3 | E | missing-confirmation | „Vista í skrár“ and „Vista + Birta“ write the book files and regenerate the published HTML on a single click with no confirmation, and the three pipeline buttons also start at once. A confirm appears only when… | `public/js/segment-editor.js:3826-3853,…` |
| segment-editor.A/segment-editor.A-22 | S3 | E | missing-confirmation | „✗ Hafna“ on an AI term suggestion closes that suggestion for every editor for good on one click: no confirmation and no way to undo it on screen. The only protection is a 500 ms guard against double clicks. | `public/js/segment-editor.js:1743-1748,…` |
| segment-editor.A/segment-editor.A-23 | S3 | E,A | missing-confirmation | „↺ Opna aftur“ on a rejected or discussed edit erases the reviewer's note (the rejection reason or the discussion topic) without asking, and the discussion thread then has no button any more, because „Umræða“ … | `public/js/segment-editor.js:2151-2163,…` |
| segment-editor.A/segment-editor.A-24 | S3 | F,B | silent-failure | A deep link (?book=…&chapter=…&module=…) that cannot be resolved does nothing at all: no message, the page simply stays on the picker. This happens for an unknown book, a chapter that is not in the list (for e… | `public/js/segment-editor.js:4497-4560` |
| segment-editor.A/segment-editor.A-25 | S3 | D,F | inconsistency | The admin's „Skoða sem“ role preview is only partly applied on this page. Switching role with a module open re-evaluates the pipeline and apply panels, but the review-summary panel, the module-id tag and all r… | `public/js/segment-editor.js:3755-3761,…` |
| segment-editor.A/segment-editor.A-26 | S3 | I | a11y | Opening a module, the main step on this page, is a div with onclick and no tabindex, role or key handler, so it cannot be reached or activated from the keyboard. The same holds for term-lookup results and high… | `public/js/segment-editor.js:564, 4231;…` |
| segment-editor.A/segment-editor.A-27 | S3 | I,B | a11y | Esc does not close the version-history modal, which is marked role=dialog and aria-modal but has no key handling and no focus management; the page's Esc handler acts on an edit pane behind it instead. With the… | `views/segment-editor.html:2153-2165; s…` |
| segment-editor.A/segment-editor.A-28 | S3 | B,I | dead-control | The format button „T“ advertises „Hugtak (Ctrl+T)“, but Ctrl+T is the browser's new-tab shortcut, which desktop browsers normally do not hand to the page. Pressing it is expected to open a new browser tab inst… | `public/js/segment-editor.js:2269, 4465…` |
| segment-editor.A/segment-editor.A-29 | S3 | F,B | state-missing | Error toasts that the retry queue marks as persistent („Vistun var hafnað — textinn var geymdur…“, „Vista mistókst eftir N tilraunir…“) never go away and have no close control. They stay at the bottom of the p… | `public/js/saveRetry.js:122-148, 332-34…` |
| segment-editor.A/segment-editor.A-31 | S3 | D,B | inconsistency | A row hides „Breyta“ when another editor's edit is pending or approved but not yet applied, and gives no reason. Yet „Nota þessa þýðingu“ on the same row still opens the edit pane, and „Vista“ then saves a com… | `public/js/segment-editor.js:2079-2095,…` |
| segment-editor.A/segment-editor.A-32 | S3 | C,J | label-mismatch | „Nota“ means two different things on one page. On a segment („Nota þessa þýðingu“, „✓ Nota“) it only puts text into the edit pane and nothing is saved until „Vista“; on a figure card „Nota“ saves the suggested… | `public/js/segment-editor.js:1013-1036,…` |
| segment-editor.A/segment-editor.A-33 | S3 | C,J | state-missing | Once a module is open the page no longer shows which book it belongs to. The picker is hidden, the header shows the module title and „Kafli N“, and the top bar shows the module title. | `public/js/segment-editor.js:607, 1445-…` |
| segment-editor.A/segment-editor.A-34 | S3 | B,F | other | After a pane is closed with „Hætta við“ or Esc, clicking a term-lookup result still inserts the term into that closed pane's hidden text field and the lookup reports „Sett inn!“. The row then shows „Breytt“ an… | `public/js/segment-editor.js:44-48, 257…` |
| segment-editor.A/segment-editor.A-35 | S3 | B,E | other | With several panes open, Esc (when the focused field has no unsaved text, or focus is elsewhere) closes the first open pane in the table rather than the one in focus, and asks to discard that other pane's text. | `public/js/segment-editor.js:4379-4407` |
| segment-editor.A/segment-editor.A-36 | S3 | C,D | label-mismatch | The menu section „Yfirlestur → Yfirlestrar“ is shown to the editor role, which cannot review: the review buttons are drawn only for head editors and the server requires a head editor. For an editor the link op… | `public/js/layout.js:62-67, 388-400; se…` |
| segment-editor.A/segment-editor.A-37 | S3 | C,G | jargon | The grammar and spelling check button is labelled „Yfirlestur“, the same word the page uses for the human review step („Senda til yfirlestrar“, „Bíður yfirlestrar“, menu „Yfirlestur“). When the checker is not … | `views/segment-editor.html:1890-1892, 1…` |
| segment-editor.A/segment-editor.A-38 | S3 | C,J | copy | One state has four names: an edit awaiting review is „Breytt“ in the Staða filter, „Bíður yfirlestrar“ in the Sýna filter, „Bíður“ on the row and „bíða“ in the counters, and the two filters each have a pending… | `views/segment-editor.html:2062-2080; s…` |
| segment-editor.A/segment-editor.A-39 | S4 | B | other | On /editor?view=reviews both „Ritill“ and „Yfirlestrar“ are highlighted as the active menu item; with any extra query parameter only „Ritill“ is. | `public/js/layout.js:47, 64, 244-261` |
| segment-editor.A/segment-editor.A-40 | S4 | I | a11y | Five selects have no programmatic label (the visible labels lack a for attribute, and the preview track select has none), two text fields and the edit textarea rely on a placeholder or nothing, and two icon-on… | `views/segment-editor.html:1900-1905, 1…` |
| small-pages.AB/small-pages-01 | S2 | B,C | label-mismatch | The field is labelled 'Bók (valfrjálst)' and offers a '-- Veldu bók --' placeholder, but it never starts empty: the first book in the list, or the book last used in this browser, is pre-selected. A sender who … | `public/js/bookSelector.js:89-103; serv…` |
| small-pages.AB/small-pages-02 | S2 | B | dead-control | The page says it pre-fills book, chapter and section from ?book=&chapter=&module= so that a report 'routes to the right module', but the book part never takes effect. Chapter and section are filled; the book f… | `views/feedback.html:366-378; pu…` |
| small-pages.AB/small-pages-03 | S3 | B,G | label-mismatch | 'Nafn (valfrjálst)' suggests a report can be sent without a name, but when a signed-in sender leaves it empty the server stores the account name anyway. The name is then shown to admins and written into the no… | `routes/feedback.js:64,96; views…` |
| small-pages.AB/small-pages-04 | S3 | F,G | english-on-screen | Every failed send is shown as a native alert 'Villa: ' followed by an English server code, for example 'Villa: Too many submissions' or 'Villa: Submission failed'. Expected: a plain Icelandic sentence that say… | `views/feedback.html:425-426; pu…` |
| small-pages.AB/small-pages-05 | S4 | I,F | a11y | After a successful send the only way back to the form is a clickable <div>; it cannot be reached or activated from the keyboard, and the success is not announced. | `views/feedback.html:19-29,228-235,417-…` |
| small-pages.AB/small-pages-06 | S3 | I | a11y | The four 'Tegund athugasemdar' choices are radio inputs hidden with opacity 0 and zero size, and nothing shows which card has keyboard focus. The group's name is a <label> tied to no control, so the question i… | `views/feedback.html:120-139,252-286; s…` |
| small-pages.AB/small-pages-07 | S3 | F,J,G | inconsistency | Validation uses two mechanisms in an order that does not follow the form: an empty or short 'Lýsing' is stopped by the browser's own bubble, in the browser's language rather than Icelandic, before any page cod… | `views/feedback.html:249,309-317,329,38…` |
| small-pages.AB/small-pages-08 | S3 | D,A | role-ui-hides-server-allows | The server lets head editors list, read, prioritise, answer and resolve feedback, and it routes translation-error reports to a book's head editors, but the only screen for feedback is a tab of /admin, which ad… | `routes/feedback.js:115-141,165,192,209…` |
| small-pages.AB/small-pages-09 | S3 | G,A | label-mismatch | The form asks for an address 'Ef þú vilt fá svar', but nothing in the product ever sends a message to it. A reply reaches the sender only if an admin writes one by hand outside the system. | `views/feedback.html:328-330; ro…` |
| small-pages.AB/small-pages-10 | S3 | C,G,J | copy | One thing has three Icelandic names and an English one on the same page: the page and menu say 'Ábendingar', the heading 'Endurgjöf / Feedback', the button and the thanks 'endurgjöf', and the type label, the a… | `views/feedback.html:6,224,228,233-234,…` |
| small-pages.AB/small-pages-11 | S4 | C,G | jargon | 'Kafli' (example '1 eða 1.2') and 'Hluti' (example '1-1') overlap and are not explained, and only three of the five optional fields say '(valfrjálst)'. The server treats 'Hluti' as a module id when it builds t… | `views/feedback.html:292,297-298,302-30…` |
| small-pages.AB/small-pages-12 | S3 | C,A | other | The public form is wrapped in the editors' shell: an anonymous reader sees 'Heim', 'Ritill', 'Framvinda', 'Orðasafn' and 'Innskrá', every one of which leads to the Microsoft sign-in, and nothing leads back to … | `views/feedback.html:356; public…` |
| small-pages.AB/small-pages-13 | S2 | B,E | work-loss | 'Fullt nafn' can be edited and saving answers 'Vistað', but the new name never appears in the sidebar or top bar and is overwritten with the Microsoft name the next time the user signs in. Expected: the edit p… | `views/profile.html:89-90,236,248-251; …` |
| small-pages.AB/small-pages-14 | S3 | F | raw-error | Any failure to load the profile other than a 401 shows 'Notandinn finnst ekki í gagnagrunni. Hafðu samband við kerfisstjóra.' A dropped connection, a rate-limit answer or a server error is thus reported as a m… | `views/profile.html:188-194,217-224; se…` |
| small-pages.AB/small-pages-15 | S3 | F,G | english-on-screen | Save errors are shown as 'Villa: ' plus the server's English sentence in a toast that disappears after 3 seconds. Clearing 'Fullt nafn' and pressing 'Vista breytingar' shows 'Villa: Display name cannot be empt… | `views/profile.html:90,160-167,227-246,…` |
| small-pages.AB/small-pages-16 | S3 | E,F | raw-error | If the 24-hour session has ended when the user presses 'Vista breytingar', the page shows 'Villa: Please log in to access this resource' for 3 seconds and stays where it is; there is no way to sign in again wi… | `views/profile.html:133-134,189-191,243…` |
| small-pages.AB/small-pages-17 | S4 | F,K | state-missing | The page loads the profile only when the shell fires 'userLoaded'. If the shell's /api/auth/me request fails, or its 60-second cached answer says 'not signed in', nothing fires and the page shows 'Hleð...' for… | `views/profile.html:80,261-269; …` |
| small-pages.AB/small-pages-18 | S4 | C | other | 'Skóli', 'Kennslugrein' and 'Stutt lýsing' are collected but shown nowhere else in the interface, and the page does not say what they are for. | `views/profile.html:99-113; rout…` |
| small-pages.AB/small-pages-19 | S4 | E | work-loss | Neither form guards typed text: following a menu link, pressing the log-out icon or reloading discards an unsent description or unsaved profile edits without a question. | `views/profile.html:227-259; vie…` |
| small-pages.AB/small-pages-20 | S3 | A,C | other | A new teacher learns how to join only by opening 'Um mig', and the instruction there is 'Sendu umsjónarmanni verkefnisins netfangið…' without saying who that is or offering any way to send it. The sign-in page… | `views/profile.html:172-183; vie…` |
| small-pages.AB/small-pages-21 | S3 | C,G,J | copy | The person a teacher should turn to has three names on these pages: 'stjórnandi' (sign-in page), 'umsjónarmaður verkefnisins' (guest panel) and 'kerfisstjóri' (profile error, and the description of Stjórnandi … | `views/login.html:181,187,190; v…` |
| small-pages.AB/small-pages-22 | S3 | H,C | docs-drift | The Icelandic editor guide names the roles 'ritstjóri', 'yfirritstjóri' and 'kerfisstjóri', while the pages that show a user their role say 'Yfirlesari', 'Aðalritstjóri', 'Stjórnandi' and 'Áhorfandi'. A teache… | `docs/editor-guide/README.is.md:30,37,66,80-85…` |
| small-pages.AB/small-pages-23 | S2 | F,G | raw-error | Every failed sign-in ends on a bare JSON document in English with no link back, because 'Skrá inn með Microsoft' is a page navigation to an API route. A deactivated teacher sees {"error":"Authentication failed… | `views/login.html:169,194-207; r…` |
| small-pages.AB/small-pages-24 | S2 | B,F | other | With the default settings only five sign-ins per network address fit in 15 minutes; the sixth person at the same school gets the raw JSON 'Too many authentication attempts'. | `index.js:125,168-178,234-235; c…` |
| small-pages.AB/small-pages-25 | S3 | I | a11y | Instruction and help text on these pages is below the WCAG AA contrast of 4.5:1. The sign-in instructions are about 2.8:1, the role descriptions about 2.0:1, and the guest's 'how to join' text on the profile a… | `views/login.html:77-82,113-120,131-139…` |
| small-pages.AB/small-pages-26 | S3 | D | other | The check that keeps the after-sign-in destination on this site accepts a path beginning with a slash followed by a backslash ('/\'), which browsers treat like '//', i.e. another site. Expected: reject a backs… | `views/login.html:199-204; route…` |
| small-pages.AB/small-pages-27 | S4 | I,F | a11y | 'Vistað' and every save error appear only in a toast that has no role or aria-live and removes itself after 3 seconds, so the result of saving is not announced and an error cannot be re-read. | `views/profile.html:130,160-167; server…` |
| small-pages.AB/small-pages-28 | S4 | J,G | inconsistency | None of the four pages uses the shared string table that describes itself as 'all user-facing Icelandic text in one place'. The profile says 'Hleð...' and 'Vista...' where the table and the other pages say 'Hl… | `views/profile.html:80,160-167,229,248,…` |
| small-pages.AB/small-pages-29 | S4 | C,G,A | copy | The sign-in page gives most of its space to a four-row role table a newcomer cannot act on, and does not say what a first sign-in gives (guest access), where to ask for a role, or where to get help. | `views/login.html:167,179-192` |
| small-pages.AB/small-pages-30 | S3 | F | silent-failure | If the book list cannot be fetched, every book dropdown silently shows only its placeholder: there is no message, nothing in the console and no retry. While the request is running the dropdown has no option at… | `public/js/bookSelector.js:27-43,63-79,…` |
| status.AB/status-01 | S2 | B,F | other | After the book is changed, the Kaflayfirlit tab keeps showing the chapter that was open for the OLD book (heading 'Kafli N', counts, unit table, stage badges), and its 'Opna ritil' and 'Opna' links still point… | `views/status.html:735-739, 466-486, 57…` |
| status.AB/status-02 | S2 | B,F | other | The Tímalína list is loaded once and never refreshed. After a book change it still shows the old book's activity, 'Hlaða fleiri' then appends the NEW book's rows 31-60 beneath the old book's first 30, and ↻ do… | `views/status.html:457-459, 677-703, 73…` |
| status.AB/status-03 | S2 | F | silent-failure | A failed timeline request is shown as 'Engin virkni fundin' — the exact text of a genuinely empty log — and replaces rows that were already loaded. Because that message is itself a list item, re-opening the ta… | `views/status.html:688-692, 715-717, 45…` |
| status.AB/status-04 | S2 | B,F | label-mismatch | In the unit table the progress percent and the 'Samþ.' column count approved EDIT rows only, while the same row's status badge and the chapter and book figures count segments reviewed by approved edit OR by ac… | `views/status.html:412-413, 596-597, 61…` |
| status.AB/status-05 | S2 | B | label-mismatch | The 'Bútar í vinnslu' card is computed as edited minus approved, but 'approved' now includes segments accepted without any edit, which are not part of 'edited'. The result is too low and is clamped to 0, so th… | `views/status.html:350, 500-501; server…` |
| status.AB/status-06 | S2 | B | other | The progress data keys its per-unit lookups by module id alone, but every chapter has a unit with the same id, 'chapter-metadata' (the chapter title). As soon as one chapter title in a book is approved or acce… | `routes/status.js:947-951, 958, 961-965…` |
| status.AB/status-07 | S2 | F | state-missing | If /api/books/list fails or returns no books, the page shows 'Hleður...' indefinitely: no error, no empty state, and ↻ does nothing. Expected: a message and a way to retry. | `public/js/bookSelector.js:30-43, 100-1…` |
| status.AB/status-09 | S2 | I | a11y | Chapter rows are click-only div elements: they cannot be focused or activated from the keyboard and expose no role. A keyboard user can open the Kaflayfirlit tab but only ever sees its empty state, so the chap… | `views/status.html:92-106, 548-549, 375…` |
| status.AB/status-10 | S3 | B,J | dead-control | On /progress the sidebar theme button ('Skipta um þema') does nothing and the user's saved theme is not applied: the page follows the operating-system colour scheme, so it can render light while every other pa… | `views/status.html:434-437; publ…` |
| status.AB/status-11 | S3 | A,B | dead-control | Framvinda lists the front-matter chapter as 'K0' / 'Kafli 0' (the first row for Efnafræði 2e), but that chapter cannot be opened: its 'Opna ritil' and 'Opna' links land in an editor that never selects chapter … | `routes/status.js:972, 1243; ser…` |
| status.AB/status-12 | S3 | D | role-ui-shows-server-refuses | 'Opna ritil' and the per-unit 'Opna' links are shown to viewers and visitors, but the editor's data endpoints require the editor role. The link opens /editor, the chapter-list request is refused with 403 and t… | `views/status.html:379, 626; rou…` |
| status.AB/status-13 | S3 | B | label-mismatch | The ↻ button (tooltip 'Endurhlaða') does more than reload: if any chapter has been opened since the last book change, it switches the user to the Kaflayfirlit tab from wherever they were. Expected: refresh in … | `views/status.html:323, 479-482, 566-56…` |
| status.AB/status-14 | S3 | C,G | english-on-screen | The 'Þarfnast skoðunar' list mixes its Icelandic summary lines with server-built English fragments keyed by raw module id, for example 'K3: m68702: 2 rejected', 'K3: m68702: 1 in discussion', 'K3: m68702: awai… | `routes/status.js:1017-1025; vie…` |
| status.AB/status-15 | S3 | C,G | english-on-screen | Timeline lines are the stored log descriptions printed as-is. Chapter-assignment events are English and name a numeric user id ('Assigned chapter 3 to user 17', 'Unassigned chapter 3'); when no book is selecte… | `views/status.html:680-682, 704-713; se…` |
| status.AB/status-16 | S3 | C,J | inconsistency | Framvinda identifies chapters only by number ('K3', 'Kafli 3') and units only by raw OpenStax id ('m68702', the literal 'chapter-metadata'), while the editor shows the same things as 'Kafli 3 — <titill>' and a… | `views/status.html:535, 550, 578-579, 6…` |
| status.AB/status-17 | S3 | C,J | inconsistency | The same thing (a segment) is called 'Bútar' on the Yfirlit tab and 'Hlutir' on the Kaflayfirlit tab. The editor's strings say 'bútar'. | `views/status.html:346, 350, 390, 411, …` |
| status.AB/status-18 | S3 | C,J | inconsistency | The stage badges use a different vocabulary from the rest of the application: 'MT', 'Yfirlestur', 'Inndráttur', 'Birting', 'MT birt', 'Birt' here, against 'Vélþýðing', 'Málfarsskoðun', 'Inndráttur', 'Myndbreyt… | `views/status.html:651-657, 665-666; se…` |
| status.AB/status-19 | S3 | B | label-mismatch | Links into Framvinda cannot target a tab, a book or a chapter. The home page's team-activity panel offers 'Sjá allt', which opens /progress on the Yfirlit tab; the activity is on the third tab and limited to t… | `views/my-work.html:1031-1034; r…` |
| status.AB/status-20 | S3 | B,E | other | bookSelector never leaves the placeholder selected when books exist: unless data-allow-all is set it selects the remembered book or, failing that, the first book alphabetically. On the public feedback form the… | `public/js/bookSelector.js:65-79, 89-10…` |
| status.AB/status-21 | S3 | I | a11y | Several basics are missing: the book select has no label or aria-label; the refresh button's only content is the glyph '↻'; the tabs declare role=tab but never set aria-selected or aria-controls and the panels… | `views/status.html:322-323, 327-331, 33…` |
| status.AB/status-22 | S3 | I | a11y | Contrast is below WCAG AA (4.5:1) for most secondary text on this page: --text-muted computes to 2.8:1 on the card and table surface in both themes and 2.5:1 on the grey badges, and the white status-badge text… | `views/status.html:35-41, 60-72, 130-13…` |
| status.AB/status-23 | S4 | K | other | The progress data is requested three times on page load and twice on every book change, and responses are applied in arrival order with no check that they belong to the latest request. Expected: one request pe… | `views/status.html:322, 466-486, 735-73…` |
| status.AB/status-24 | S4 | C,F | other | The badge next to 'Þarfnast skoðunar' shows the total number of lines, but only the first 15 are listed and nothing says more exist. Each pending review is also counted twice: once inside the summary line and … | `views/status.html:506-530; rout…` |
| status.AB/status-25 | S4 | B | other | The figure in 'N breytingar í umræðu' is taken from a page of the 50 most recent discuss-edits across ALL books and then filtered to the selected book, so it under-reports once other books hold many such edits… | `routes/status.js:967-969, 1072-1073; s…` |
| status.AB/status-26 | S4 | F | state-missing | After one failed load the loading placeholder permanently reads 'Villa við að hlaða gögnum': every later attempt (↻ or a book change) shows the error text while the request is running instead of 'Hleður...'. T… | `views/status.html:335, 470, 484` |
| status.AB/status-27 | S4 | F | state-missing | A book with no extracted chapters shows '0 / 0', '0', '0', '0%' and the heading 'Kaflaframvinda' above an empty area. There is no message saying the book has no content yet. | `views/status.html:496-503, 533-559; se…` |
| status.AB/status-28 | S4 | B | other | The placeholder 'Veldu bók...' remains in the list as a selectable option. Choosing it leaves the previous book's numbers on screen under a selector that now reads 'Veldu bók...', and a timeline loaded in that… | `public/js/bookSelector.js:74-79; serve…` |
| status.AB/status-29 | S4 | G,I | english-on-screen | The green ✓ after a unit id carries the English tooltip 'Faithful file exists' and no other explanation; the ⚠ appended to a chapter's unit count has no explanation at all. | `views/status.html:543-546, 615-617` |
| status.AB/status-30 | S3 | C | jargon | The chapter detail shows a row of pipeline stage badges — 'Útdráttur', 'MT', 'Yfirlestur', 'Inndráttur', 'Birting', '✓ MT birt', '✓ Birt' — with no legend. These are developer stage names ('Inndráttur' ordinar… | `views/status.html:402-403, 634-667` |
| status.AB/status-31 | S3 | C | jargon | The timeline is an unprocessed audit log: one line per saved segment in the form '<netfang> vistaði breytingu á m68702:fs-idm123456', with internal ids, book slugs ('… fyrir efnafraedi-2e kafla 3') and forms l… | `views/status.html:704-713; rout…` |
| status.AB/status-32 | S3 | A,C | other | Items under 'Þarfnast skoðunar' are plain text: none links to the chapter, unit or segment it names, so acting on one means finding the chapter row, opening it, finding the unit and pressing 'Opna'. The chapte… | `views/status.html:359-365, 377-380, 50…` |
| status.AB/status-33 | S4 | G | copy | Small copy defects: number agreement ('1 einingar bíða yfirlestrar', '1 breytingar í umræðu', 'fyrir 1 dögum'), a decimal point where Icelandic uses a comma ('12.5%' under Heildarframvinda while chapter rows s… | `views/status.html:502-503, 508, 511, 5…` |
| terminology.A/terminology-01 | S1 | E,B,A | silent-failure | The 'Breyta orðhausu' dialog pre-fills and lets the user edit Íslenska, Fag, Uppruni, Skilgreining (íslenska) and Athugasemdir, but Vista saves only the part of speech and the English definition; the other edi… | `views/terminology.html:1066, 1876-1899…` |
| terminology.A/terminology-02 | S2 | B,E | other | After 'Bæta við þýðingu' is opened and closed without saving, the Vista button stays wired to addTranslation. The next 'Bæta við' then posts to /api/terminology/null/translations and fails, and 'Breyta orðhaus… | `views/terminology.html:2003, 2030, 968…` |
| terminology.A/terminology-03 | S2 | B,F | other | A new search or a filter change keeps the current page offset. From page 2 or later, any search with fewer matches than that offset shows 'Engin orð fundust.' and 'Engin niðurstöður' and removes the pager alth… | `views/terminology.html:1151, 1656, 167…` |
| terminology.A/terminology-04 | S2 | B | dead-control | The 'Uppruni' filter has no effect on the list or on the CSV export. Changing it only repeats the same search and raises the 'síur virkar' count, so the user believes the list is filtered by source. | `views/terminology.html:829-833, 1169, …` |
| terminology.A/terminology-05 | S2 | D,F | role-ui-shows-server-refuses | A viewer (including a visitor with no users row) sees 'Bæta við', 'Bæta við þýðingu', 'Breyta orðhausu', the ⚑ dispute button and 'Bæta við athugasemd', can fill in the form or type a reason, and is refused on… | `views/terminology.html:801, 1053, 1062…` |
| terminology.A/terminology-06 | S3 | D | role-ui-shows-server-refuses | 'Flytja inn' and all five import actions are shown to editors and viewers, but every import endpoint requires head-editor. They learn this only after choosing a book or file and confirming, through 'Villa: Ins… | `views/terminology.html:930, 1088-1108,…` |
| terminology.A/terminology-07 | S2 | B,E | dead-control | The 'Aðrar þýðingar' field is never sent to the server in any mode, so whatever is typed there is discarded without notice. In add-translation mode the editable 'Orðflokkur (POS)' and 'Skilgreining (enska)' fi… | `views/terminology.html:979-982, 1864, …` |
| terminology.A/terminology-08 | S2 | B,F,H | dead-control | 'Lykilorð úr köflum' looks in the publication tree only for files ending in -key-terms.md. The pipeline now writes HTML there, so the import finds nothing and the dialog still announces 'Innflutningur lokið!' … | `views/terminology.html:1108-1112, 2109…` |
| terminology.A/terminology-09 | S3 | E,A | missing-confirmation | 'Hafna' on a mined suggestion dismisses it at once with no question, and nothing can bring it back: there is no un-dismiss action, no view of dismissed suggestions, and mining again never reopens it. | `views/terminology.html:1264-1266, 1312…` |
| terminology.A/terminology-10 | S3 | A | unreachable-function | Three server functions have no control anywhere in the UI: editing an existing translation (PUT /api/terminology/translations/:id, editor and above), deleting a translation and deleting a headword (DELETE, adm… | `routes/terminology.js:592-614, 513-533…` |
| terminology.A/terminology-11 | S3 | B | label-mismatch | The 'Staða' filter selects headwords that have any translation with that status, but each row displays the status, word and source of its first translation, and approved translations sort first. Filtering on '… | `views/terminology.html:818-828, 1682-1…` |
| terminology.A/terminology-12 | S3 | B | label-mismatch | Choosing a book refilters the list, but the statistics boxes stay global: the 'Bók' handler calls loadStats(), which never sends the book. The headword total is never filtered at all, not even by 'Fag'. | `views/terminology.html:810, 1627-1634;…` |
| terminology.A/terminology-13 | S3 | C,B | other | A single-row 'Samþykkja' on an untagged translation takes its subject from the '— fag við samþykkt —' picker, which sits in the batch bar and is hidden unless at least one checkbox is ticked. The picker is pre… | `views/terminology.html:907-913, 1399-1…` |
| terminology.A/terminology-14 | S3 | D,J | inconsistency | The admin's 'Skoða sem' role preview changes the sidebar but not this page: the review queue, mined suggestions, added-terms export and approve buttons stay visible while previewing as Yfirlesari or Áhorfandi.… | `public/js/layout.js:370-376, 462-484; …` |
| terminology.A/terminology-15 | S3 | B,D | dead-control | 'Gera að íðorði' puts the corrected form into an inline onclick as a JavaScript string after HTML escaping only. A form containing an apostrophe breaks the handler so the button does nothing, and a crafted for… | `views/terminology.html:1259-1263, 1283…` |
| terminology.A/terminology-16 | S3 | B,F | label-mismatch | 'Flytja út CSV' (tooltip: export the filtered words) stops at the first 10,000 headwords in alphabetical order and gives no sign that the file is cut. Whether the glossary holds more than 10,000 headwords is u… | `views/terminology.html:926-929, 2308-2…` |
| terminology.A/terminology-17 | S4 | B | hidden-forever | The topbar notification bell and its counter are rendered with display:none and no code path ever shows them. This is the shared layout, so it applies to every page that uses layout.js. | `public/js/layout.js:144-147` |
| terminology.A/terminology-19 | S1 | A,C,H | label-mismatch | Everything this page writes (new terms, approvals, rejections, imports, promoted suggestions) goes to the terminology_headwords and terminology_translations tables, but the editor's automatic term checks and t… | `views/terminology.html:1519-1544, 1526…` |
| terminology.A/terminology-20 | S3 | I | a11y | Several controls work with the mouse only: the five import cards, the English term in a queue row and the definition toggle are div or span elements with onclick but no tabindex, role or key handler. The three… | `views/terminology.html:1088-1108, 1459…` |
| terminology.A/terminology-21 | S3 | E,B | other | showTermDetail() records the clicked id before its request has finished. If two different rows are clicked in quick succession and the first response arrives last, the dialog shows term A while writes go to te… | `views/terminology.html:1789-1794, 1876…` |
| terminology.A/terminology-22 | S3 | E | missing-confirmation | 'Hlaða upp' imports the whole file at once with no question naming the book, and the book in the import dialog is chosen automatically (the book last used on any page, otherwise the first in the list). A wrong… | `views/terminology.html:1082-1086, 1122…` |
| terminology.A/terminology-23 | S4 | B,C | other | Choosing 'Allar bækur' is not remembered: the stored book is overwritten only by a non-empty choice, so the next visit or reload silently re-applies the last specific book as a filter. The 'síur virkar' badge … | `public/js/bookSelector.js:89-108, 113-…` |
| terminology.B/terminology.B-01 | S1 | E,F | work-loss | 'Breyta orðhausu' opens a form pre-filled with the first translation's Íslenska, Fag, Uppruni, Skilgreining (íslenska) and Athugasemdir, all editable. On 'Vista' the dialog closes as if saved, but only Orðflok… | `views/terminology.html:1876-1898` |
| terminology.B/terminology.B-02 | S1 | B,E,F | other | After 'Bæta við þýðingu' has been opened and closed with 'Hætta við' or ×, the 'Vista' button stays wired to the add-translation action for the rest of the page visit. A new term from 'Bæta við' then cannot be… | `views/terminology.html:2003` |
| terminology.B/terminology.B-03 | S2 | B,F | other | A new search or filter change made while on page 2 or later of the list reuses the old page offset. If the new result set is smaller than that offset the page shows 'Engin orð fundust.' / 'Engin niðurstöður' a… | `views/terminology.html:1151` |
| terminology.B/terminology.B-04 | S2 | F,G | english-on-screen | Every failed request on this page is shown as 'Villa: ' plus the server's English error label, and the more specific reason is dropped. Adding a term that already exists reads 'Villa: Failed to create headword… | `public/js/htmlUtils.js:44-55` |
| terminology.B/terminology.B-05 | S3 | F,G | raw-error | The four 'Tillögur úr leiðréttingum' endpoints return the raw exception text as the error, and the page prints it: a database fault would appear as 'Villa: <database message>' in the list or 'Náma mistókst: <d… | `routes/terminology.js:344` |
| terminology.B/terminology.B-06 | S3 | F,K | silent-failure | Opening a term has no loading state and no error state. If the request fails (no connection, expired session, deleted term, server error) nothing changes on screen: the click simply appears to do nothing. | `views/terminology.html:1789-1794` |
| terminology.B/terminology.B-07 | S3 | F | silent-failure | Failures of the page's supporting loads are swallowed. If the user check, the subject and source lists, the statistics, the queue counts or the book list fail, the user sees only '-' in the statistics boxes, e… | `views/terminology.html:1190-1213` |
| terminology.B/terminology.B-08 | S2 | E,F | state-missing | A successful 'Vista' gives no confirmation: the dialog closes and the list reloads. If a book is selected in the filter (it is restored automatically from the last visit) and the new term has no Fag ticked or … | `views/terminology.html:1931-1935` |
| terminology.B/terminology.B-09 | S2 | B,F | dead-control | The 'Uppruni' filter above the list does nothing: choosing a source reloads the same results. The badge beside the filters still counts it as an active filter ('1 síur virkar'), so the user believes the list i… | `views/terminology.html:830-833` |
| terminology.B/terminology.B-10 | S2 | F | silent-failure | 'Lykilorð úr köflum' reports 'Innflutningur lokið!' with Bætt við: 0, Uppfært: 0, Sleppt: 0 when the importer found no files to read. The server's explanation is not shown, so the user believes the import ran.… | `views/terminology.html:2109-2124` |
| terminology.B/terminology.B-11 | S3 | F | silent-failure | The 'Orðasafn (glossary)' import can fail for individual rows without telling the user. Failed rows go into an errors list that the page never shows and are not counted as added, updated or skipped, so the pan… | `services/terminologyService.js:1183` |
| terminology.B/terminology.B-12 | S2 | F,K | silent-failure | 'Flytja út CSV' stops at 10,000 headwords without saying so. The button's tooltip promises the filtered list ('Flytja út síuð orð sem CSV') and nothing in the file or on screen says it was cut short. Whether t… | `routes/terminology.js:229-234` |
| terminology.B/terminology.B-13 | S3 | E | missing-confirmation | 'Hafna' on a mined suggestion removes it at once, with no confirmation and no undo, and it never comes back. The same word 'Hafna' in the review queue asks for a reason first and can be reversed. | `views/terminology.html:1264-1266` |
| terminology.B/terminology.B-14 | S3 | J,E | inconsistency | Approving a translation behaves differently in three places. In the queue, 'Samþykkja' on a row that has a subject approves instantly with no question; the ✓ in the term dialog always asks 'Ertu viss um að þú … | `views/terminology.html:1519-1531` |
| terminology.B/terminology.B-15 | S3 | C,G | english-on-screen | Internal source codes are shown as text. The review queue's source filter lists raw values such as 'idordabankinn', 'chemistry-society-csv', 'imported-csv' and 'manual', and each queue row prints the raw code … | `views/terminology.html:1357-1364` |
| terminology.B/terminology.B-16 | S3 | E,F,K | state-missing | Save and import actions have no busy state: 'Vista', 'Bæta við athugasemd', 'Hlaða upp' and the import options stay enabled and unchanged while the request runs. A second click sends the request again, and for… | `views/terminology.html:1012` |
| terminology.B/terminology.B-17 | S2 | B,E | dead-control | The 'Aðrar þýðingar' field (placeholder 'Aðskilið með kommu') is never read: whatever is typed there is discarded on save, in every mode of the dialog. In 'Bæta við þýðingu' mode the Orðflokkur and Skilgreinin… | `views/terminology.html:979-982` |
| terminology.B/terminology.B-18 | S3 | C,F,G | other | When a translation without a subject is approved from the queue, the dialog warns 'Ómerkt orð skila sér ekki í vélþýðingarorðasafnið' but offers no way to add the subject: the choices are approve without, or c… | `views/terminology.html:907-913` |
| terminology.B/terminology.B-19 | S3 | B,F | label-mismatch | The status filter and the status badge in a row can contradict each other. Filtering on 'Hafnað' or 'Í bið' lists every headword that has any translation with that status, but each row shows only its first tra… | `services/terminologyService.js:164-188` |
| terminology.B/terminology.B-20 | S3 | K,F | other | The page loads its parts one after another, and the term list and the Enter key in the search box wait for the earlier requests. Until the user check, the subject list, the statistics and (for editor roles) th… | `views/terminology.html:1188-1219` |
| terminology.B/terminology.B-21 | S3 | I | a11y | Several controls are plain div or span elements with a click handler and cannot be reached or used from the keyboard: the five import options, the English term in a queue row (the only way to open a queued ter… | `views/terminology.html:1088` |
| terminology.B/terminology.B-22 | S3 | I | a11y | The three dialogs do not manage focus. Opening one leaves keyboard focus on the page behind it, focus is not kept inside, Escape does not close it and focus is not returned on close; because the dialogs come l… | `views/terminology.html:964-968` |
| terminology.B/terminology.B-23 | S3 | I | a11y | Most form fields have no programmatic label. The search box and the two comment fields have only a placeholder; the three queue selects have nothing; every field in the add/edit dialog and the import book sele… | `views/terminology.html:795` |
| terminology.B/terminology.B-24 | S3 | I,J | a11y | The inactive queue chips ('Allt', 'Til umræðu (n)', 'Þarf yfirlestur (n)') have no text colour of their own, so they take the browser's default button text colour; on the dark theme's #272b33 panel black text … | `views/terminology.html:757-769` |
| terminology.B/terminology.B-25 | S3 | I | a11y | The muted text colour that carries this page's small print is below the 4.5:1 contrast that WCAG AA asks for, in both themes: about 2.5 to 3.0:1. It is used for the filter labels, the statistics labels, the 11… | `public/css/common.css:53` |
| terminology.B/terminology.B-26 | S4 | I | a11y | Nothing on the page is announced to assistive technology when it changes: loading, empty and error lines and the result count are swapped in silently. The previous and next page buttons contain only an arrow g… | `views/terminology.html:955` |
| terminology.B/terminology.B-27 | S3 | C,G | jargon | The import dialog describes its options in file names, folder paths, English column names and book slugs: 'Flytja inn terminology-en-is.csv úr glossary/ möppu bókar', 'Hlaða upp CSV skrá með english, icelandic… | `views/terminology.html:1090-1111` |
| terminology.B/terminology.B-28 | S3 | C,G | jargon | The page's most prominent texts use a lexicographer's word and abbreviations of it: 'Orðhausar / þýðingar', '20272 orðh. / 27873 þýð.', 'Niðurstöður (n orðhausar)', 'Breyta orðhausu', '[2 þýð.]'. The part-of-s… | `views/terminology.html:860` |
| terminology.B/terminology.B-29 | S3 | G,C | copy | Two labels are likely to be misread. 'Náma úr samþykktum breytingum' uses the noun 'náma' (a mine) as a verb for searching the approved edits, and its messages follow suit ('Náma mistókst', 'Smelltu á „Náma“')… | `views/terminology.html:849` |
| terminology.B/terminology.B-30 | S3 | C,J | inconsistency | One page uses five words for the same thing: orð, orðhaus, íðorð, hugtak and lykilorð all mean a glossary entry. 'Athugasemdir' means the translation's notes in the form and discussion comments in the term dia… | `views/terminology.html:795` |
| terminology.B/terminology.B-31 | S4 | G | copy | Small language errors: 'Engin niðurstöður' (should agree: 'Engar'), 'valfrálst' (missing j), 'Breyta orðhausu' (not a form of 'orðhaus'), '1 síur virkar' and '21 orð bíða' (no singular agreement), 'Villa: Vill… | `views/terminology.html:1672` |
| terminology.B/terminology.B-32 | S3 | C,G | copy | The page explains nothing to the people it is for. The five statuses have no legend, Bók and Fag look independent although one overrides the other and both hide entries without a subject, and an editor is show… | `views/terminology.html:807-838` |
| terminology.B/terminology.B-33 | S3 | J,F | inconsistency | All feedback for actions goes through the browser's native dialogs: 31 alerts, 6 confirms and 3 prompts, the prompts being used to type an English headword and two kinds of reason. Success is silent while fail… | `views/terminology.html:1326` |
| terminology.B/terminology.B-34 | S4 | J | inconsistency | Button styling does not signal meaning consistently. Approve is an unstyled default button in the queue and a green icon-only ✓ in the term dialog; the two negative actions ('Hafna') use the neutral secondary … | `views/terminology.html:912` |
