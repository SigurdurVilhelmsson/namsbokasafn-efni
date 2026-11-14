# AI-assisted localization: a side track beside the Skerfur editing (proposed 2026-11-14)

- **Date:** 2026-11-14
- **Asked by:** [USER], 2026-11-14 (item 2 of that day's message: "a side-track for AI-localization of the book").
- **Measured at:** `main` = `7b048b60`. Read-only, USD 0. The pilot was done inside a cloud session with no API key,
  so no API spend; the drafting cost is the session itself.
- **Status of the work:** the active register's ⏩ RESUME block, never this file. This is a proposal: nothing in it is
  decided until [USER] rules on §8.
- **Pilot:** [2026-11-14-ai-localization-pilot-ch01-inventory.md](2026-11-14-ai-localization-pilot-ch01-inventory.md),
  a localization inventory of chemistry ch01, built from the English source.

## 1. In brief

1. **Localization can run beside the editing without touching what Skerfur measures**, if it keeps three rules:
   - it reads **only the English source** until a chapter's faithful text is complete;
   - it writes **only its own directory** (`04-localization/`, unused today) and, at the end, `04-localized-content/`
     through the existing localization editor;
   - **yfirlesarar do not see it while they edit the chapter in Pass 1.**

   The MT layers (`02-mt-output`, `02-mt-selected`, `02-mt-revised`) and the faithful layer are never written. The
   localized track is a fourth stage that starts where the measured stage ends.
2. **Most of the work is finding places and drafting proposals, and that work does not depend on the edited text.**
   A proposal is keyed to a source element (id + a hash of its English), so it can be drafted months before the
   chapter's Pass 1 ends and is fitted to the faithful wording when it is applied.
3. **Much of it can be done today. Some of it needs building.** Replacing the text of an existing segment (units,
   prices, US examples, data) works through the localization editor as it stands. Inserting new material (a spotlight
   box, new exercises, an imperial-units box) and swapping a photo **on the localized track only** have no path yet
   (§5).
4. **The pilot found 63 items in ch01**, which is the book's outlier: ch01 holds 113 of the 222 segments in the whole
   book that use US units (§3). The single most valuable find is not a unit: ch01's "Hazard Diamond" box teaches the
   US NFPA 704 label, while every Icelandic lab container carries the EU's CLP/GHS pictograms.
5. **Localization can itself be a research result.** Recording each AI proposal and what the localizer finally wrote
   gives a clean measure of AI-assisted localization, separate from the MT-editing study and never mixed into it (§6).

## 2. What exists today

| Piece | State on `main` |
|---|---|
| `books/<slug>/04-localization/` | Exists, holds only a README saying nothing uses it. Proposed here as the overlay store. |
| `books/<slug>/04-localized-content/` | Written by the localization editor (`server/routes/localization-editor.js`), on save or on a head editor's approval when the book enforces localization review (`server/services/localizationReviewService.js`, `localization_pending_edits`). Every change is logged in `localization_edits`. |
| Localized render | `cnxml-inject --source-dir 04-localized-content` then `cnxml-render --track localized` → `05-publication/localized/` (`04-localized-content/README.md`). |
| Reader | `sync-content.js` in vefur copies `mt-preview` and `faithful` only. **The localized track does not reach readers.** |
| Auto-suggestions | `server/services/localizationSuggestions.js` has regex detectors (°F, lb, oz, …) and a `localization_suggestions` table. Useful for units; it cannot see examples, boxes, photos or exercise gaps. |
| Editorial guide | `docs/editorial/pass2-localization.md` (Pass 2) and the `localization` skill. Both assume Pass 2 starts from the faithful text. |
| Figure swaps | `books/<slug>/media/image-mapping.json`, read by `loadImageMapping()` in `tools/cnxml-inject.js`. **It is book-wide, not track-scoped**, so a photo swapped there changes every track, the measured faithful one included. It must not be reused for localization. |
| Number format | Already handled: the MT writes decimal commas (`0,25`, `2,54 cm` in ch01's `02-mt-output`). Not a localization item. |

## 3. What to localize

[USER]'s five targets, with the pilot's evidence, and five additions.

| # | Target | What the pilot showed | Typical action |
|---|---|---|---|
| T1 | **US units → SI** | ch01: 113 segments; the whole book: 222 (the census below). ch01.6 (dimensional analysis) alone has 41 of its 91 exercise segments in US units. | Replace with SI. Keep **one short box** on US units and dimensional analysis in ch01.6, with a handful of exercises built on real US data (a recipe in °F and cups, fuel economy in mpg, an oil barrel), so students can handle legacy data. |
| T2 | **Spotlights on Icelandic subjects and scientists** | ch01 has no spotlight that names a place. The hydrogen box (ch01.2) is a natural fit for Reykjavík's hydrogen buses; ch16's opener photo is a Yellowstone geyser (`CNX_Chem_16_00_Geyser`), which is exactly the Geysir/Strokkur case. | Add a short Icelandic paragraph to an existing box, or a new box. Every factual claim carries a source. |
| T3 | **US examples → Icelandic, Nordic or European** | Philadelphia→Atlanta and San Francisco→Seattle drives priced in $/gallon; a US census figure; the area of Delaware and Oregon; a dime, a quarter, a football field, "two-by-four" lumber. | Replace the example and **recompute the numbers**; a worked example's answer must still follow. |
| T4 | **Photos** | Two good candidates in ch01: the water-domains figure (an Icelandic steam/ice scene) and the plasma figure (northern lights as natural plasma, phrasing to check). | Candidate list with licence; swap only on the localized track (§5.3). |
| T5 | **Exercises for the curriculum** | ch01 has 318 exercise segments but none with Icelandic data. The pilot cannot judge curriculum fit without the course descriptions. | Map the chapter to the course outcomes [USER] supplies, then draft new exercises with worked solutions. |
| T6 | **Safety and regulation** (added) | NFPA 704 "hazard diamond" box and its figure (ch01.3). Icelandic labs use CLP (EU 1272/2008, through the EEA) and GHS pictograms. | Replace the box; keep one sentence that the diamond appears on US-sourced containers. |
| T7 | **Agencies and institutions** (added) | NIST, FDA, EPA as the example authority. | Swap for the Icelandic or EU equivalent where the text uses them as an example; keep them where the fact is historical (Alma Levant Hayden at the FDA stays). |
| T8 | **Prices and currency** (added) | $3.80 and $3.90 per gallon. | ISK per litre, looked up when drafted, with the date. |
| T9 | **Dated data** (added) | "the official January 2014 census … 317,297,725"; "FCVs are not yet economically viable". | Replace with a current Icelandic figure (Hagstofa Íslands) or update the claim, dated. |
| T10 | **Links to learning** (added) | Four "Link to Learning" boxes point to English-language sites. | Note an Icelandic alternative where one exists; otherwise leave. Low priority. |

**Book-wide census.** Segments with at least one match in each chapter's English (`02-for-mt/chNN/m*-segments.en.md`,
excluding the older `(b)` files; a regex count, so an estimate, not a list):

| | US units | `$` amounts | "US / American" |
|---|---|---|---|
| ch01 | 113 | 3 | 4 |
| ch09 (gases) | 34 | 0 | 7 |
| appendices | 21 | 0 | 7 |
| ch05 (thermochemistry) | 18 | 2 | 4 |
| all other chapters together | 36 | 5 | 52 |
| **book** | **222** | **10** | **74** |

So units are concentrated in four places, and T2–T9 are spread thinly. The inventory for the other chapters should be
quicker than ch01's.

**What not to localize:** the core science, the pedagogical structure, and US references that are the point of the
sentence (the list of countries that still use Fahrenheit, the replica kilogram's real home at NIST). The pilot lists
the items it considered and chose to keep.

## 4. Keeping it out of the research measurements

The Skerfur measurement (B1) records what the yfirlesari was shown, their active time and every edit's origin, from MT
to the faithful text. Localization must not change any of those. The rules:

1. **No writes to any MT layer or the faithful layer.** Localization changes reach only `04-localization/` (proposals)
   and `04-localized-content/` (applied text). This matches the 2026-11-05 ruling: no hand repairs to pure MT.
2. **The inventory reads the English source only.** It never takes the MT, the AI-reviewed layer or an editor's text
   as input, so it cannot feed anything back into what is measured. (It reads `01-source` and the generated
   `02-for-mt`/`02-structure`.)
3. **Yfirlesarar do not see proposals for a chapter while they edit it in Pass 1.** Seeing an Icelandic drop-in for a
   paragraph they are post-editing would change their edit, and B1 could not tell. Proposals stay in the repository
   and out of the segment editor until the chapter's faithful text is complete (SD8's completion rule).
4. **Apply after Pass 1, per chapter.** A chapter's localization is applied only once its faithful text is complete.
   Chapters roll out as editing progresses, so localization follows them chapter by chapter, not book-end.
5. **Localization time is logged apart from editing time.** If a yfirlesari also localizes, that work happens in the
   localization editor, whose log (`localization_edits`) is not B1's.
6. **AI-drafted proposals are not translations.** The 2026-03-29 and 2026-10-10 rulings say new *translations* come
   only from the MT API. A localization drop-in is new content written for Icelandic students (a Geysir paragraph has
   no English source), so it is a different thing. It is still AI text, so it carries its producer, model and date,
   and a human fits and approves every word before it reaches `04-localized-content`. This reading needs [USER]'s
   ruling (§8, LD3).
7. **The localized track is labelled as localized.** CC BY requires changes to be indicated, and a reader must be able
   to tell the faithful translation from the adapted text. How the reader shows it is a vefur decision for later.

## 5. How proposals are stored and applied

### 5.1 The overlay store: `books/<slug>/04-localization/chNN/`

One JSONL file per chapter, `inventory.jsonl`, one record per item, plus a run record per drafting session. Tool-written
data in the sense of CLAUDE.md § File Permissions: never regenerated, never deleted to reset. A sketch:

```json
{
  "id": "L-ch01-031",
  "anchor": {
    "module": "m68670",
    "elementId": "fs-idm51398400",
    "segmentIds": ["m68670:note-title:fs-idm51398400-title"],
    "sourceSha256": "<sha256 of the element's English text in 01-source>"
  },
  "target": "T6",
  "action": "replace-box",
  "priority": "high",
  "finding": "NFPA 704 hazard diamond; Icelandic labs use CLP/GHS pictograms.",
  "proposal": { "intent": "…", "dropIn": { "lang": "is", "text": "…" } },
  "facts": [{ "claim": "…", "source": "…" }],
  "decision": { "state": "proposed", "by": null, "at": null, "note": null },
  "provenance": { "producer": "claude-session", "model": "…", "date": "2026-11-14", "run": "…" }
}
```

- **The anchor is the source, not the translation.** `01-source` is read-only and cannot drift, so the hash pins each
  proposal to the English it was written against. This is the same idea as `beforeSha256` in
  `tools/lib/mt-layers.js`: if the anchor's text ever differs, the proposal refuses instead of applying silently.
- **`decision.state`** is `proposed`, `accepted`, `rejected`, `deferred`, `drafted` or `applied`. It is data in the
  file, not status prose.
- **`facts`** is required for T2, T7 and T9: every Icelandic fact in a drop-in has a source a reader could check.

### 5.2 Phase 1: replacements (works today)

Units, prices, examples and dated data change the text of a segment that already exists. The localizer opens the
chapter in the localization editor, which starts from the faithful text, and fits the proposal's drop-in to the
editors' wording. The head editor approves it through the existing review queue. One small build: record the proposal
id as the edit's origin in `localization_edits`, so §6 can compare proposal and result.

### 5.3 Phase 2 and 3: insertions and photos (need building)

- **Insertions.** The localized track today replaces segment text inside the source structure. A new box, a new
  exercise or the US-units box needs new elements. Per the 2026-08-30 "clean CNXML" ruling, these must be real CNXML
  elements (`<note>`, `<para>`, `<exercise>`) with their own ids, never a sentinel marker inside a segment. The design
  is a small localized-structure overlay that inject reads on the localized track only. Before building it, check what
  inject does today with a segment that `02-structure` does not list (this plan has not measured that).
- **Photos.** A track-scoped mapping, for example `04-localization/image-mapping.localized.json`, read by inject only
  when it renders the localized track. Each replacement records its licence and credit line; only CC BY, CC0 or the
  project's own photos.

## 6. Per-chapter workflow, and who approves

| Step | Who | Input | Output | Can start |
|---|---|---|---|---|
| 1. Inventory | Claude, in a session | English source | `inventory.jsonl` + a readable table | any time |
| 2. Triage | [USER] as aðalritstjóri | the inventory | each item accepted, rejected or deferred; photo and spotlight choices | any time |
| 3. Drafting | Claude | accepted items | Icelandic drop-ins, recomputed numbers, new exercises with worked solutions, photo candidates with licences, sources for every fact | any time |
| 4. Check | [USER], or a subject teacher | drafts | science and numbers confirmed; a second AI pass recomputes every answer | any time |
| 5. Apply | a localizer (a yfirlesari or [USER]) in the localization editor | faithful text + drafts | `04-localized-content/` | **after the chapter's Pass 1 is complete** |
| 6. Approve | head editor (aðalritstjóri) | pending edits | approved edits; localization review enforced for the book | after 5 |
| 7. Render and check | Claude / [USER] | localized segments | `05-publication/localized/`, checked by value against the faithful render | after 6 |

**What this measures, for free:** for each item, whether it was accepted, and the distance from Claude's drop-in to
the text the localizer approved. That is a small, clean study of AI-assisted localization, reported separately from
the MT-editing results. Per § Purpose, each drafting run records its model, date, inputs and cost.

## 7. Suggested first steps

1. [USER] rules on §8.
2. [USER] triages the ch01 pilot (63 items; the table is built for it).
3. Claude drafts the accepted ch01 items into `04-localization/ch01/inventory.jsonl`, with a test that checks every
   anchor against `01-source`.
4. Inventory ch09, ch05 and the appendices (the other unit-heavy places), then ch16's geyser opener.
5. Build Phase 1's origin field; leave Phases 2–3 until a chapter is ready to apply.

Nothing here needs [USER]'s production time until step 5 of §6, and that waits for ch01's Pass 1 anyway.

## 8. Decisions for [USER]

| | Question | Recommendation |
|---|---|---|
| LD1 | Run the inventory and drafting now, from the source, and apply per chapter after Pass 1? | Yes. |
| LD2 | Hide a chapter's proposals from yfirlesarar until its Pass 1 is complete? | Yes; it is what keeps B1 clean. |
| LD3 | Treat AI-drafted Icelandic drop-ins as authored localization content (allowed, labelled, human-approved), not as translation (API-only)? | Yes, with provenance on every item. Record it with `/decision-record`. |
| LD4 | Imperial policy for ch01.6: one short US-units box plus about five exercises on real US data, SI everywhere else? | Yes. |
| LD5 | Which course descriptions should new exercises serve? | [USER] to supply the course outcomes; the pilot cannot judge fit without them. |
| LD6 | Should the reader ever show the localized track, and how is it labelled? | Decide later, with vefur; nothing here depends on it. |
| LD7 | Who localizes, and on which hours? | Outside the editing hours, so localization never eats into measured Pass 1 time. |
