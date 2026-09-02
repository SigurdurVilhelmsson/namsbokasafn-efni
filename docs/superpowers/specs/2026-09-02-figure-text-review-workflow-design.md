# Figure-text review: approving machine-translated images in the editor

> **FROZEN DESIGN RECORD — written 2026-09-02.** Evidence, never status. Progress on this
> item lives in `experiments/figure-text-translation/REGISTER.md`, which owns figure-track
> status; if this document and that register disagree, **the register wins**. Every number
> below was measured on 2026-09-02 against chapter 1 of `efnafraedi-2e`; re-measure before
> relying on one.

## 1. What this adds, in one sentence

A figure whose text has been machine-translated becomes a **reviewable object inside the
existing segment editor**: the editor sees the rendered Icelandic image beside the module's
own paragraphs, corrects labels as text, and approves — and the figure carries a publication
state that behaves exactly like the MT-preview / Edited distinction already applied to text.

## 2. The publication model this fits into

[USER], 2026-09-02: publication order is **MT-Preview** (labelled as such on the website,
per page/module) → **Edited content** → *[future] Localized content*. Translated figures
publish immediately as part of MT-preview. A module is released to Edited when its **text**
has been edited and approved.

▶ **Because regenerating an image is manual CLI work, a module's figures may lag its text.**
The resolution is to release the module text as Edited while **labelling the images as
MT-preview** until a regenerated image has been approved. That is the whole design in one
sentence, and it is the user's, not the author's.

### This extends an existing mechanism; it does not invent one

Already true of **text**, and verified in the code on 2026-09-02:

- `03-translated/faithful/` is an **overlay** over the complete `mt-preview` baseline.
  `translatedCnxmlPath()` (`tools/cnxml-render.js`) falls back to a module's mt-preview
  CNXML when its faithful file does not exist, so chapter rollups stay complete.
- An **mt-preview warning banner** already exists and "stays until the whole chapter is
  reviewed" (comment at the `rollups-complete` marker write).
- `05-publication/{mt-preview,faithful}/` are real, populated tracks.

Not true of **figures**: `loadImageMapping(bookDir)` takes **no track argument**, so today a
translated figure appears identically in both tracks. That is the gap this closes.

## 3. Approach: the figure's state is information, not a gate

Three approaches were considered.

| | approach | why not |
|---|---|---|
| **A** | Figure carries a review state; both tracks publish the figure; the state is a **label** | **chosen** |
| B | Track-scoped mappings — the Edited track gets only approved figures, others fall back to the English original | Makes figures the **only** artefact that degrades to English. Text degrades to machine-Icelandic; a readable Icelandic figure would be discarded because nobody ticked a box. Worse for the reader than A. |
| C | Figures gate the module — no Edited release until every figure is approved | Couples two review streams the user explicitly wants decoupled, and gives one stubborn figure a veto over a finished module. |

A is also the smallest change: no second mapping file, no new fallback path, no publication
gate. Only a state per figure and a way to render it.

## 4. Data model

`server/migrations/050-figure-review.js`, following the `book_term_preference` idiom
(migration 048) — and, per CLAUDE.md, `up()` must be a never-throw boundary: a migration
that throws wedges the boot, because `migrationRunner` runs every migration on every start.

```sql
CREATE TABLE IF NOT EXISTS figure_review (
  book_id     INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
  chapter     INTEGER NOT NULL,
  module_id   TEXT    NOT NULL,
  basename    TEXT    NOT NULL,   -- CNX_Chem_01_06_TempScales
  state       TEXT    NOT NULL DEFAULT 'mt-preview',  -- mt-preview | approved | flagged
  render_hash TEXT,               -- inputs that produced the approved image
  flag_kind   TEXT,               -- text | terminology | layout | other
  note        TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  PRIMARY KEY (book_id, basename)
);

CREATE TABLE IF NOT EXISTS figure_block_edit (
  book_id   INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
  basename  TEXT NOT NULL,
  block_key TEXT NOT NULL,        -- "Boiling|point|of water" — content-addressed
  is_text   TEXT NOT NULL,        -- the editor's Icelandic
  edited_by TEXT,
  edited_at TEXT,
  PRIMARY KEY (book_id, basename, block_key)
);
```

### Three decisions, with their reasons

**`basename` is the join key.** It is already what `image-mapping.json` keys on, what the
translated file is named (`<basename>_IS.<ext>`), and what the CNXML `src` resolves to. No
new identifier is minted.

**`block_key` is content-addressed, not positional.** §C82 repeatedly changes what extraction
emits, and CLAUDE.md records that adding one segment renumbers every later positional
`auto-N` id. A positional key would silently rebind an editor's correction to a *different*
label after re-extraction. Content-addressing makes changed English **orphan** the edit
instead — which is correct, because changed English deserves a fresh look. The CLI must
**name** orphans, never drop them silently.

**Staleness is derived, not stored.** `render_hash` records the inputs that produced the
approved image (block texts + composer version). If it differs from the current inputs the
figure is stale, and reports `mt-preview` regardless of stored state. One fewer state to keep
in sync, and no `corrected-stale` row that can drift from reality.

## 5. Editor surface

A figure card rendered inside the existing segment editor, in document order among the
module's segments — **not** a separate queue. Chosen because terminology consistency is the
main risk and context is the cheapest defence against it (§7).

```
┌─ CNX_Chem_01_06_TempScales ──────────── MT-PREVIEW ─┐
│  [ rendered Icelandic figure ]                       │
│                                                      │
│  Boiling point of water   → Suðumark vatns      [✎]  │
│  Celsius                  → Selsíus             [✎]  │
│      ⚠ caption for this module says "Celsíus"        │
│  373.15 K                 → 373.15 K   (verbatim)    │
│      ⚠ Icelandic decimal comma: 373,15 K             │
│                                                      │
│  [Approve]  [Flag: text│terminology│layout│other]    │
└──────────────────────────────────────────────────────┘
```

- **Correcting text inline is the editor's primary action** ([USER]: editors are expected to
  suggest corrections in the UX). Editing a block writes `figure_block_edit` and marks the
  figure stale. **It does not regenerate anything.**
- **Flagging is per-figure**, with a note — the escape hatch for what text cannot fix
  (layout, overlap, a question). Per-block flagging was considered and rejected: it adds a
  table, and an editor can say it in words.
- Verbatim blocks are shown and **are editable**, but are never sent to the MT. The two
  properties are independent and conflating them would be a bug: `373.15 K` must never go on
  the wire (it is not a translation problem) and must still be correctable to `373,15 K` (it
  is a localization problem). An earlier draft of this spec made verbatim blocks read-only,
  which would have locked the editor out of the single most common correction the decimal-comma
  rule creates.

## 6. Content lives in a committed sidecar, not only in the database

⚠️ **`sessions.db` is gitignored and covered only by the off-box backup.** Editorial content
must not live only there. The existing pattern already solves this: editor approvals live in
the DB, and `applyApprovedEdits()` writes them out to `03-faithful-translation/`, which the
2-hourly cron commits.

| | holds | committed |
|---|---|---|
| `figure_review`, `figure_block_edit` | **workflow state** — who, when, flags, notes | no |
| `books/<slug>/figure-text/<basename>.is.json` | **content** — approved Icelandic per block, plus the figure's state | **yes** |

Per-figure files, not per-module ([USER]): diffability beats file count.

```
editor corrects "Selsíus" → "Celsíus"                      (DB)
      ↓  applyApprovedFigureEdits()
books/<slug>/figure-text/CNX_Chem_01_06_TempScales.is.json  (committed)
      ↓  CLI, run manually
books/<slug>/media/CNX_Chem_01_06_TempScales_IS.svg
      ↓  node tools/generate-image-mapping.js               (exists)
      ↓  inject + render                                    (exists)
```

### The sidecar also keeps a licence boundary closed

`cnxml-render.js` needs the figure's review state in order to emit the badge. It lives in
`tools/`, which is **MIT**; the database is behind `server/`, which is **AGPL**. CLAUDE.md
records that boundary as known gap E-2 and warns against widening it.

▶ Reading state from the **committed sidecar** means the renderer never touches the database,
no new MIT→AGPL edge appears, and the CLI works on a fresh clone with no server running.

## 7. Free consistency checks — the caption and alt are already translated

Measured 2026-09-02 on `CNX_Chem_01_06_TempScales`: **16 of its 17 figure blocks have every
one of their words present in the figure's own `alt` text.** The alt reads *"the boiling point
of water is 212 degrees while the freezing point of water is 32 degrees. Therefore, there are
180 Fahrenheit degrees…"* — very nearly a complete lexicon of the image.

This gives three distinct uses, which must not be conflated:

1. **MT context.** A block like `Celsius` currently reaches the paid API as a naked token.
   Sending the alt as context makes it a sentence. *(Not part of this design — it changes the
   MT call, not the review workflow. Logged separately.)*
2. **A consistency oracle, free and offline.** Cross-check each figure block against the
   module's already-translated caption and alt.
3. **A reviewer's reference** — show the Icelandic alt beside the image.

🔴 **This is not hypothetical: it catches a real defect already committed.** The first paid
run returned `Celsius → Selsíus` for the figure, while the module's committed caption reads
**Celsíus**. A figure whose image says one thing while the caption directly beneath it says
another is exactly what a reader notices — and no check built before this design would have
seen it.

⚠️ Use (2) depends on the module having a translated alt. The current extraction emits one;
the **committed** MT for `m68683` has none, because that vintage predates the alt work. So the
check must degrade to "no reference available", never to a false all-clear.

## 8. Render contract with vefur

```html
<figure data-figure-review="mt-preview">   <!-- or "approved" / "flagged" -->
  <img src="/content/<book>/chapters/01/images/media/CNX_..._IS.svg" alt="…">
```

Efni emits the **signal**; vefur owns the **badge** — the same division as the existing
MT-preview banner, which is vefur-side. This needs a cross-repo note to vefur; nothing is
styled in this repo.

A figure whose `render_hash` no longer matches its inputs emits `mt-preview` **regardless of
stored state**, so an edited-but-not-yet-regenerated figure loses its approved badge without
anyone remembering to clear it.

## 9. Testing

- **State machine** (`server/__tests__/`): approve → edit → assert stale; regenerate →
  assert the badge returns.
- **Sidecar round-trip**: DB → sidecar → composer → the corrected string is present in the
  emitted SVG.
- **Render contract** (`tools/__tests__/`): assert the attribute is present when unapproved
  **and absent when approved**. Both directions — this repo's recurring lesson is that a
  check testing one direction passes for the wrong reason.
- **Orphan reporting**: change a block's English, assert the CLI **names** the orphaned edit
  rather than dropping it.
- **Non-vacuity**: every assertion over a set must first assert the set is non-empty.

## 10. Explicitly out of scope

- **Automated image repair.** The editor corrects text; regeneration is a manual CLI step
  ([USER] 2026-09-02, choosing this over server-side regeneration to avoid putting python3 +
  pikepdf + pycairo + fontTools + poppler on production).
- **Number localization.** `373.15 K` must read `373,15 K`. Unimplemented, tracked as ⑭ in
  the figure register. The editor surface *shows* the warning; nothing transforms it yet.
- **Sending alt/caption as MT context** (§7 use 1) — changes the MT call, not the workflow.
- **A figure queue view.** Considered; deferred until tracking actually proves painful. It
  would be a different view over identical rows, so deferring costs nothing.
- **Any publication gate.** By construction: the state is a label, not a gate.
