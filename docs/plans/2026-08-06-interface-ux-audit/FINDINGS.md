> **FROZEN EVIDENCE — captured 2026-08-06.** A record of what the interface did on that
> date, not a statement of open work. Per CLAUDE.md § *One source of truth*, if this
> disagrees with the active register, **the register wins**. Cite as evidence, never as
> status. Phase 0–1 method and caveats: `README.md` in this directory.

# Interface UX audit — findings

**Audience assumed throughout:** Icelandic upper-secondary subject teachers — experts in
chemistry/biology/physics, *not* in translation, editing, or CAT/TMS software, volunteering
time on top of a full teaching load. Everything below is judged against onboarding them
with near-zero training, not against what a translation professional would expect.

## Journey B — measured: login → first edit, as an `editor`

Driven with Playwright (`scripts/journey.js`, screenshots in `journey/`). Counting only
what the UI actually presents:

| Step | What the teacher faces | Choices offered |
|---|---|---|
| 1. `/` Heim | "Ekkert verkefni í dag!" | **1** actionable element in the page body: *Nákvæmt yfirlit* |
| 2. `/editor` Ritill | "Velja einingu til að ritstýra" | **7** books |
| 3. after book | chapter dropdown | **22** chapters |
| 4. after chapter | "Einingar í kafla" list | **8** modules, titled **in English** |
| 5. after module | EN / MT / Ritstýrt badges | **3** unlabelled tracks |

**Four unguided choices, none of which the system helps with, before a single line of text
is visible.** Nothing on the path indicates which book is *theirs*, which chapter needs
work, or which of EN/MT/Ritstýrt to open. The home page — the only place that could answer
"what should I do?" — answers "nothing".

## Ranked findings

Ranked by (impact on onboarding a new teacher) × (cost to fix).

### 1. A new teacher's first screen congratulates them and offers no way to start
**Cost: small (one function).** `views/my-work.html:1195-1215`

`buildEmptyTaskMessage()` has three branches. The two that attach an `actionLabel`/
`actionHref` are both gated on `isReviewer` (`admin` or `head-editor`). Every `editor`
falls through to the terminal branch, which has **no action at all**:

> 🎉 **Ekkert verkefni í dag!** — "Þú hefur lokið öllum verkefnum. Slakaðu á eða biddu
> eftir nýjum úthlutunum." Subtitle: "Engin verkefni í dag – vel gert!"

A teacher who has *never done anything* is told they have completed everything and should
relax. The empty state conflates two opposite situations — "you finished your work"
(celebrate) and "you have never been given any" (onboard) — and ships the celebration for
both. Verified in source, so this is not an artifact of the audit's empty seed.

*Fix:* branch on whether the user has ever had an assignment, not on role. Give the
zero-history case a real call to action (below).

### 2. There is no self-serve path from "teacher with free time" to "work"
**Cost: structural.**

From the identical seeded state:
- **head-editor `/`** — "Þarfnast skoðunar — **24 ÚTHLUTAÐ**", listing "Kafli N í vinnslu
  án úthlutunar" with a *Skoða* button each, plus editor workload and team activity.
- **editor `/`** — "you have nothing to do."

The system simultaneously knows *24 chapters need an owner* and tells the teacher *there is
nothing for you*. Nothing bridges them: work reaches a teacher only when a head-editor
pushes it via Úthlutanir. **Onboarding N teachers therefore costs the head editor N manual
assignments before any of them can do anything.** That is the direct structural obstacle to
"onboard as many teachers as possible" — every new volunteer adds work to the one person
who is already the bottleneck.

*Fix (the highest-leverage change in this document):* let a teacher claim work. Surface
"chapters needing an owner, in your subject" on the editor's home with a one-click
*Taka að mér* (take this on). Assignment enforcement already exists as an opt-in toggle
(`Þvinga kaflaúthlutun`, `assignments.html:21`), so a claim model can coexist with the
push model for books that need control.

### 3. The main work tool opens inert, and its list is ordered arbitrarily
**Cost: one page + a sort.**

*Ritill* — the one nav item that looks like work — opens to two empty dropdowns
(~204 visible characters for every role). Then:

- **Section titles are in English.** "Chemistry in Context", "Phases and Classification of
  Matter" in an otherwise Icelandic UI. (`title_is` is null until translated, and the list
  falls back to `title_en` with no marking.)
- **Sections are listed out of order: 1.4, then 1.6, then 1.5.** The source data
  (`server/data/chemistry-2e.json`) has 1.5 before 1.6; the list follows filesystem
  enumeration order (`chapterFilesService.js:130`, `fs.readdirSync` with no sort), which is
  arbitrary. Confirmed with `ls -U` on the chapter directory.
- **Rows render in monospace**, which reads as data rather than as textbook content.
- **EN / MT / Ritstýrt badges carry no legend, no tooltip, no explanation.**

### 4. Default book selection ignores the user's scope
**Cost: small.**

Every page opens on `Eðlisfræði 2e` — the alphabetically-first book — regardless of who is
logged in. For a head-editor scoped to `efnafraedi-2e` this is not merely wrong but
**broken**: `/assignments` 403s on load (`GET /api/admin/assignments/edlisfraedi-2e`),
so the page a head-editor uses to onboard teachers fails for them by default.

*Fix:* default to the user's book when they have exactly one; otherwise to the book with
work outstanding.

### 5. Three nav/gate mismatches
**Cost: small each.**

| What | Effect |
|---|---|
| head-editor sees "Stjórnandi" → `/admin` | Silently bounced to `/`. Dead link in the primary nav for the role that runs the project. (`layout.js` shows the admin section to `['admin','head-editor']`; the gate is `requirePageAuth(ROLES.ADMIN)`.) |
| `/library`, `/localization` reachable by editors, no nav link | Orphaned pages. |
| viewer's sidebar offers "Ritill" | 403 + raw "Insufficient permissions" in console. |

### 6. The work teachers are best at is the work they cannot see
**Cost: a decision, then small.** `layout.js:411`

> `// Localization editor — admin-only until Pass 2 workflow is verified`

Pass 2 localization — unit conversions, Icelandic context, replacing culturally foreign
examples — is precisely where a subject teacher's expertise is decisive, and precisely
where linguistic training matters least. Pass 1 linguistic review is the opposite. The nav
currently hides Pass 2 from editors and leads with Pass 1. The page gate is only
`requirePageAuth()`, so the restriction is nav-only and provisional by its own comment.

Worth revisiting deliberately: if the goal is recruiting subject experts, the interface
currently routes them to the task they are least equipped for.

### 7. Vocabulary that presumes pipeline knowledge
**Cost: string-only — mostly one file (`public/js/ui-strings.js`).**

Observed on real screens (not inferred from grep):

| Shown | Problem | Suggested |
|---|---|---|
| "Velja **einingu** til að ritstýra" / "**Einingar** í kafla" | *module* is pipeline vocabulary; teachers think in chapters and sections | "Veldu **kaflahluta**" / "Kaflahlutar" |
| **EN / MT / Ritstýrt** badges | unexplained three-way distinction | "Enska frumtexti / Vélþýðing / Yfirfarið" + a one-line legend |
| "**Lýsigögn** kafla" | internal concept as a list row | hide from editors |
| "**Staðfesta MT**", "MT — vélþýðing" | acronym from the translation industry | "vélþýðing" throughout, never "MT" |
| Sidebar **"Aðlögun"** vs page title **"Staðfærsla"** | two Icelandic words for one feature | pick one |
| **"Yfirlesari"** (proofreader) | names the role for its least valuable contribution | consider "Fagritstjóri" / subject editor |

### 8. Smaller, still worth fixing

- The celebratory "Ekkert verkefni í dag!" card renders on the **head-editor's own home
  directly above the 24 items needing attention** — its branch keys on
  `globalPendingCount`/`readyToApplyCount`, not on the queue shown beneath it.
- The **login page** spends its space on the internal 4-role taxonomy, which a first-time
  user can neither choose nor act on, and frames the product as a translation system.
- The UI loads **webfonts from `fonts.googleapis.com`** at runtime — a slow first paint on
  poor school connections, and a third-party request worth a deliberate decision.
- `/favicon.ico` 404s on every page load.

## On tooltips

The brief asked about hover tooltips. Recommend treating "this needs a tooltip" as a
symptom rather than a solution: hover does not exist on tablets, tooltips are invisible
while scanning, and they are typically used to rescue a label that should be clearer.
Order of preference: **better label → visible inline hint → progressive disclosure →
tooltip last.** The EN/MT/Ritstýrt badges are the clearest case — they need a legend and
better names, not hover text.

## The five changes that would most reduce time-to-first-useful-edit

1. Give the zero-assignment editor home a real call to action (finding 1).
2. Let teachers **claim** unassigned chapters instead of waiting to be assigned (finding 2).
3. Default the book selector to the user's own book (finding 4).
4. Show section titles in Icelandic — or mark untranslated ones — and sort them by section
   number (finding 3).
5. Rename EN/MT/Ritstýrt and add a legend (finding 7).

1–3 change what a teacher can accomplish alone; 4–5 are string-and-sort work.

## What this audit did not cover

- Populated editing screens. The audit DB has no assignments, edits or activity, so
  findings about *in-progress* work are content-starved and were not made.
- The actual segment-editing surface beyond the module list, and therefore the save/approve
  loop, conflict handling, and the review cycle.
- Excel terminology import/export (`xlsx` could not be installed — network policy).
- Mobile/tablet viewports; everything here is 1440×900.
- Accessibility (contrast, keyboard traps, screen readers) — not examined at all.
