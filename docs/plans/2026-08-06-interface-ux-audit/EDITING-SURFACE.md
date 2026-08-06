> **FROZEN EVIDENCE — captured 2026-08-06.** Second audit pass. A record of what the
> interface did on that date, not a statement of open work. Per CLAUDE.md § *One source of
> truth*, if this disagrees with the active register, **the register wins**.
> Method and caveats: `README.md`. Ranked findings from the first pass: `FINDINGS.md`.

# The editing surface, accessibility, and phone width

The first pass stopped at the module list. This one opens a real module as an ordinary
`editor` — `/editor?book=efnafraedi-2e&chapter=1&module=m68664` (§1.1, "Chemistry in
Context"), which deep-links correctly — and audits the screen where a teacher would
actually spend their 45 minutes. Script: `scripts/deepdive.js`; screenshots in `deep/`.

## What the screen is

One module = **72 segments ("bútar") in a single flat table, 9,433 px tall** — about ten
screens of continuous scroll — in three columns: `TEGUND | ENSKA (FRUMTEXTI) | ÍSLENSKA
(ÞÝÐING) | AÐGERÐIR`. 35,596 visible characters. Header reads
"Kafli 1 · 72 bútar · 72 þýddar · Heimild: Ritstýrt — bein þýðing".

### 1. Fourteen controls stand between the teacher and the first sentence
Above the first row, in order: a concordance search box ("Samhengisleit — leitaðu í fyrri
samþykktum þýðingum…") + *Leita*; a *Forskoðun* button with an unlabelled track dropdown;
a save-status bar; **seven counter chips** (`0 breytingar`, `0 bíða`, `0 samþykkt`,
`0 staðfest`, `0 hafnað`, `0 umræða`, `0 hugtök`); a progress line (`0/72 bútar breytt`);
three filter dropdowns (`Sýna` / `Staða` / `Flokkur`); a term-lookup box; and a collapsed
colour legend.

For a subject teacher with a spare 45 minutes this is a wall of apparatus in front of the
work. On a freshly opened module every one of the seven chips reads **0** — the same
"wall of zeros" that greets them on the home page.

### 2. All 72 rows have identical visual weight — nothing says *where to look*
Every row carries **two buttons of equal prominence**, `✓ Staðfesta MT` and `Breyta`
(144 buttons per module). A chapter title, an abstract item, a glossary term and a
three-line paragraph are presented identically. Nothing marks which segments are likely
wrong, which contain terminology the glossary disagrees with, or which the MT engine was
least confident about.

So the teacher's actual task is: **make 72 independent yes/no judgements, in order, with no
prioritisation.** That is the single biggest determinant of whether a 45-minute session
feels productive, and the UI currently offers no way to spend those minutes where they
matter most. A "likely problems first" ordering — or even just surfacing segments whose
terminology conflicts with the glossary — would change the economics of a volunteer hour
more than any other change in this audit.

### 3. The `TEGUND` column publishes CNXML element names
`TITLE`, `ABSTRACT`, `ABSTRACT-ITEM`, `NOTE`, `PARA`, `CAPTION`, `GLOSSARY` — internal
document-structure names, in English, uppercase, as the leftmost and most prominent column.
This is the document's XML schema shown to a chemistry teacher.

### 4. Explanations exist, but are hover-only or collapsed
This corrects `FINDINGS.md` §7, which said the badges were unexplained — they are
explained, just not where anyone will see it:

- The badge legend is a `title` attribute: *"MT = óyfirfarin vélþýðing · Yfirlesið =
  mannlegur yfirlestur lokinn · Staðfærð = aðlöguð að Íslandi"*. **Hover-only — invisible
  on a tablet and invisible while scanning.**
- `Litaskýring flokka` (the colour-code key) is **collapsed behind a disclosure triangle**.
- Genuinely useful explanations are likewise hover-only, e.g. *"Sendir allar breytingar til
  yfirlestrar hjá aðalritstjóra"* and *"Staðfesta að vélþýðingin sé rétt eins og hún er
  (Ctrl+Shift+Enter)"*.

This is the tooltip trap in its clearest form: the writing is good, the delivery mechanism
hides it from the people who need it most. Promote the legend to persistent inline text.

### 5. Inconsistent vocabulary for the same three states
The module list badges read **EN / MT / Ritstýrt**. The tooltip legend for those same
states reads **MT / Yfirlesið / Staðfærð**. Two different words (*Ritstýrt*, *Yfirlesið*)
for one state, on two screens a click apart. Segments are *bútar* here but modules are
*einingar* one screen back.

### 6. Submission is all-or-nothing
`Senda til yfirlestrar` sits top-right and, by its own tooltip, "sends **all** changes to
the head editor". A teacher who reviews 10 of 72 segments and has to leave has no
visible way to submit partial work or mark where they stopped. `0/72 bútar breytt` tracks
progress but is not a resume point.

*(Not verified: whether an interrupted session actually loses position, and the full
save/approve/return-to-pending cycle. Establishing that needs a populated DB with edits in
flight — see limitations.)*

## Accessibility — measured, not asserted

axe-core 4.x, WCAG 2.0 A + AA, violations only:

| Page | Violation types | Nodes | Worst |
|---|---|---|---|
| Editor, module open | 3 | **172** | `color-contrast` ×141 (serious), `scrollable-region-focusable` ×27 (serious), `select-name` ×4 (**critical**) |
| `/progress` | 2 | 57 | `color-contrast` ×56, `select-name` ×1 (critical) |
| `/terminology` | 2 | 23 | `color-contrast` ×21, `select-name` ×2 (critical) |
| `/` Heim | 1 | 7 | `color-contrast` ×7 |

Three distinct problems, all systemic and all cheap to fix centrally:

1. **`color-contrast` — 225 nodes across four pages.** Traceable to muted-grey tokens
   (`--text-muted` and friends in `public/css/common.css`); the same offender recurs on
   every page (`.logo-sub` is the canonical sample). Fixing the token values fixes almost
   all of it at once.
2. **`select-name` — critical, 7 selects with no accessible name**, including
   `#book-select` on `/progress` and the preview-track dropdown in the editor. A
   screen-reader user hears an unlabelled combo box. Fix is a `aria-label` per select.
3. **`scrollable-region-focusable` ×27 — `.segment-content` regions scroll but are not
   keyboard reachable.** Directly relevant here: a keyboard-only user cannot scroll the
   text of a long segment. Fix is `tabindex="0"` on the scrollable container.

## Phone width (390×844, touch emulated)

Better than expected, and structurally sound:

| Route | Horizontal overflow | Hamburger | Sidebar |
|---|---|---|---|
| `/` | none (390 = 390) | present | collapses correctly |
| `/editor` | none | present | collapses correctly |
| `/terminology` | none | present | collapses correctly |

No layout breakage on the pages tested. The caveat is finding 4: the interface leans on
`title` tooltips to explain its core vocabulary, and **on touch those explanations are
simply unreachable** — so the phone experience is not "the desktop one, smaller", it is the
desktop one with the glossary removed.

## Limitations of this pass

- **A module was not opened at phone width** — only the selector page. The three-column,
  72-row table at 390 px is untested and is the most likely place for mobile breakage.
- **No edit was saved.** Rows edit via a `Breyta` button rather than always-on textareas,
  so exercising save/approve/reject/return-to-pending needs a populated DB with work in
  flight. The save *path* is therefore unverified — findings 6 above is about the visible
  affordance, not about what the code does on submit.
- axe-core covers roughly a third to a half of WCAG in practice; a clean automated run
  would not mean accessible. Keyboard-only and screen-reader walkthroughs were not done.
- Contrast was measured in the **light** theme only; the app also ships a dark theme.
