# §C146 + §C154 — block content in CALS table cells · VERIFICATION

**🧊 FROZEN 2026-09-17.** Evidence, never status. Status lives in the active register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`). If this file and the register
disagree, the register wins.

Branch `fix/c146-c154-table-cell-blocks`, off `main` at `0577af980`.
Cost **0 ISK** — no paid leg was touched; every measurement is the free, source-anchored
EN round-trip (`extract → inject the module's own English → render`).

---

## 1. The two defects

Both live in the CALS table path of `tools/cnxml-render.js`, and **they fail in opposite
directions** — which is why one instrument cannot see both.

### §C146 — a `<para>` child of an `<entry>` reached published HTML verbatim

`renderTableCells` rendered a cell with `processInlineContent(entry.content, context)`.
That function has no `<para>` case, so the tag survived while its **inner** content
rendered correctly:

```html
<td style="text-align: left"><para id="nh4">NH<sub>4</sub><sup>+</sup></para>
  <para id="fs-idm477369440">katjónir úr flokki 1:</para>
<para id="fs-idm188410288">Li<sup>+</sup></para>…</td>
```

`<para>` is not HTML and vefur's `content.css` has no rule for it, so chemistry's
solubility table (Table 4.1) put seven ions on one line instead of stacking them.

### §C154 (NEW) — a `<tfoot>` row was dropped entirely

`renderTable` matched `<thead>` and `<tbody>` only. There was no `tfoot` branch, so the
whole footer row never reached the output. One instance corpus-wide, and what it holds is
a **footnote**:

> `ᵃPrincipal groups are listed in order of decreasing priority; subordinate groups have
> no priority order.`

The table's own title carries `[[xref:[[sup:a]]|para-00014]]` pointing at it, so the page
shipped a **dangling superscript reference with nothing to refer to**. The text is
extracted and translated (`SEG:m00016:entry:para-00014`), so MT was bought for content no
reader could ever see — the translate-then-discard shape of §C89 and §C148, in a third
place.

---

## 2. Exposure — parser census of `01-source`, both kept books

Counted with `xml.etree`, unit = a `<para>` that is a **direct child** of an `<entry>`.
Regex was not used (CLAUDE.md § census).

| module | chapter | paras | published when measured |
|---|---|---|---|
| `efnafraedi-2e` `m68710` | ch04 | 18 | ✅ live |
| `efnafraedi-2e` `m68824` | ch17 | 6 | ✅ live |
| `lifraen-efnafraedi` `m00032` | ch03 | 1 | ✅ live |
| `lifraen-efnafraedi` `m00327` | ch26 | 24 | ⏳ latent |
| `lifraen-efnafraedi` `m00016` | appendices | 1 | ⏳ latent — **§C154's**, inside the `<tfoot>` |

**50 total: 25 live, 25 latent.** The register recorded **24 in 2 modules** — that count
was chemistry-mt-preview-only, as its own entry said ("not yet censused beyond chemistry
mt-preview"). The 25 live figure is independently corroborated by a census of the
committed published HTML (24 chemistry + 1 organic = 25 raw `<para` occurrences).

**Other block children of an `<entry>`, same census:** `media` **274** (chemistry 29,
organic 245) and `figure` **1** (organic `m00046`). Neither leaks — 0 raw `<media` in all
published HTML, and `processInlineContent`'s `<media><image>` handler renders the image in
place. ▶ **So this was never a general "cells don't dispatch blocks" hole; it was one
missing case.** That is why the fix is scoped to `<para>` and the rest is covered by a
diagnostic seam rather than by new dispatchers.

### ⚠️ A raw-tag census over published HTML is nearly unusable, and the reason is mundane

Sweeping `books/*/05-publication/` for CNXML block tags returns `<figure: 862` and
`<table: 182` — **all of them legitimate HTML elements**, because CNXML and HTML share
those tag names. Only `<para` is unambiguous. A sweep that trusted those numbers would
have reported a catastrophe. Key the census on the tags that cannot collide, or parse.

---

## 3. §C154 was found by a PREDICTION disagreeing with a MEASUREMENT by one

The source census predicted **50**. The corpus render measured **49** raw `<para` before
the fix. One module short: `m00016`.

Chasing that single unit is what surfaced §C154 — its para is inside the `<tfoot>`, which
never rendered at all. **Accepting "49 ≈ 50" would have shipped §C146 and left §C154
undiscovered**, in a module whose footnote is referenced from its own table title.

▶ This is CLAUDE.md's predicted-number rule paying for itself, and the payment was exactly
one off-by-one worth of curiosity.

---

## 4. Corpus verification — EN round-trip over all 491 modules of both kept books

Harness: [`corpus-render-harness.mjs`](corpus-render-harness.mjs) (frozen beside this
file). It renders every `01-source` module through `renderEnglishRoundTrip` and writes one
HTML file per module, so arms are compared **by name, per module** — never by a total.

| arm | raw `<para` total | render errors |
|---|---|---|
| baseline (`main`) | **49** | 1 |
| + §C146 fix | **0** | 1 |
| + §C146 + §C154 | **0** | 1 |

### Byte-identity diff, by name

| comparison | modules | byte-identical | changed |
|---|---|---|---|
| baseline → §C146 only | 491 | **487** | **4** |
| baseline → both fixes | 491 | **486** | **5** |
| §C146 only → both fixes | 491 | 490 | **1** (`m00016`) |

The 5 changed modules are **exactly the 5 predicted, by name** — `m68710`, `m68824`,
`m00032`, `m00327`, `m00016`. The `<tfoot>` fix is cleanly isolated: it changes one module
and no other.

`m00016`'s footnote string `Principal groups are listed in order` occurs **0 times before
and 1 time after** — a before/after control built into the measurement rather than
asserted about it.

### The single render error is expected and is not ours

`lifraen-efnafraedi/ch05/m00061` fails with

```
Marker residue in injected output for m00061: 1 marker(s) survived …
[[docref:specific rotation, [<emphasis effect=…
```

That is the **§C145 gate merged earlier today doing its job** on a known §C115 instance.
It is present identically in every arm, so it affects no comparison here.

### 🔴 The loud seam's FIRST DRAFT WAS BLIND TO THE ONLY CASE IT EXISTED FOR — and had been written up as working

The first version of `renderEntryBody` put the seam scan **inside** the
`paras.length > 0` branch and scanned only `rest`, the text after the last para. Three
consequences, all measured:

1. **A cell with no `<para>` was never scanned.** Organic `m00046`'s `<figure>` entry has
   no para, so the one real candidate in the whole corpus was invisible. The corpus run
   reported `undispatched non-empty: 1` — the `renderList-item` `<quote>` in `m00155` —
   and that clean-looking zero for table cells was **manufactured by the detector, not
   observed in the corpus**.
2. **Anything before or between paras was invisible.** The unit test passed only because
   its `<quote>` was trailing; `<quote/><para/>` would not have been recorded.
3. **`media` was missing from `ENTRY_INLINE_OK`.** A `<media>` *after* a para would have
   false-positived — and 274 entries carry one. It stayed silent only because no corpus
   cell has that order.

▶ **This was written up as working in three places** — the code comment, §9 of this file,
and the register's §C146 bullet — each asserting that `m00046` would be recorded if it ever
reached a rendered page. It would not have been. **That is the stale-premise class
CLAUDE.md is built around, committed by the same session that was documenting it.**
▶ **A NULL FROM A DETECTOR IS WORTH NOTHING UNTIL YOU HAVE SHOWN THE DETECTOR REACHES THE
CASE.** The seam's own ignore-set is part of that reach: `renderItemBody` **swaps `<media>`
out to a placeholder** before its scan, so `ITEM_INLINE_OK` needs no `media` entry — a set
copied from it without adjustment is wrong for a cell, which renders media **in place**.
Two seams with different dispatch need different ignore-sets.

### After the fix — a stated prediction, then the measurement

The scan now runs **unconditionally**, over the whole cell with the dispatched paras
removed. **Predicted before running: the seam fires on exactly 2 modules** — `m00046`
(`figure`, `renderTableCells`) and `m00155` (`quote`, `renderList-item`).

```
PREDICTED 2 modules -> MEASURED 2
    lifraen-efnafraedi__ch04_m00046.cnxml ['renderTableCells:figure']
    lifraen-efnafraedi__ch13_m00155.cnxml ['?:quote']
```

**Two live positive controls where there had been one and a false zero.** More than 2 would
have meant `ENTRY_INLINE_OK` was missing a tag; fewer, that the scan still did not reach.

The seam change is **output-neutral**: a corpus render before and after it is
**491 of 491 byte-identical**. It records; it does not alter a page.

---

## 5. Unit + corpus tests

`tools/__tests__/cnxml-render-table-cell-blocks.test.js` — **20 tests, all passing.**

Each null carries a control:

- *"no raw `<para>`"* is paired with **"m68710 emits ≥18 `<p id=` inside cells"** — because
  "no raw `<para>`" is also what a renderer that **dropped** every para would print, and
  that failure is precisely §C154's. Requiring presence separates the two.
- *"records an undispatched block on the loud seam"* is paired with **"records nothing for
  an ordinary para-only cell"** and with **"does not report a `<media>` as undispatched"** —
  a seam that fired on everything would satisfy the first on its own. Two further legs pin
  the reach the first draft lacked: a block **before** the first para, and a block in a cell
  with **no para at all**.
- *"renders `<tfoot>`"* is paired with **"emits no `<tfoot>` when the source has none"** —
  proving the assertion reads the source rather than an unconditional wrapper.
- *"media still renders in the same cell"* guards the 274 entries that already worked
  against a fix that took cells off `processInlineContent` wholesale.

### Mutation-tested against the broken code (a regression test is unverified until it goes red)

Golden copy taken **before** the first mutation; restored from the golden and `cmp`-verified
after **every** round, with `git status --porcelain` as a second instrument at the end.

| round | mutation | red | verdict |
|---|---|---|---|
| M1 | revert §C146 (cell body back to `processInlineContent`) | **12 of 17** (pre-seam-fix test set) | kills every §C146 leg + the shared corpus legs |
| M2 | delete the `<tfoot>` branch only | **3 of 20** | kills exactly the three §C154 legs, nothing else |
| M3 | restore the half-blind seam (tail-only, inside the para branch) | **2 of 20** | kills exactly the before-first-para and no-para legs |
| M4 | drop `media` from `ENTRY_INLINE_OK` | **1 of 20** | kills exactly the media-not-undispatched leg |

Both restores verified (`[restore OK]`, then a clean `git status`).

---

## 6. Suite — failing set compared BY NAME, both directions

`main` was measured in a `git worktree`, branch in the working repo.

| run | Test Files | Tests |
|---|---|---|
| `main` (worktree, deps linked) | 13 failed / 396 passed / 1 skipped (410) | 31 failed / 6,433 passed / 135 skipped (6,599) |
| branch (contended) | 13 failed / 398 passed (411) | 31 failed / 6,461 passed / 124 skipped (6,616) |
| branch (uncontended) | 13 failed / 398 passed (411) | 36 failed / 6,579 passed / 1 skipped (6,616) |

**Failing FILE sets are IDENTICAL, both directions, in all three runs** (parser proven
against each run's own summary count first: 13 = 13 each time). 0 only-branch, 0 only-main.
Total tests 6,599 → 6,616 = **+17**, exactly this change's new file.

### ⚠️ The per-TEST count is not a stable floor here, and reading it as one is a trap

Failed tests moved 31 → 36 while the failed **file** set never moved. The cause is
memory's own rule — *a file that TIMES OUT is not a file that passes*: when a test file
aborts partway, vitest reports its remaining tests as **skipped**, not failed. Skipped
therefore swung 135 → 124 → 1 across runs, and the 5 "new" failures are all in
`cnxml-inject-equation-seam`, `cnxml-inject-robustness` and `pipeline-integration` —
**files already failing on `main`**, which simply got further in the uncontended run.
▶ **In this repo, compare failing FILES; treat the per-test count as a run artefact
unless every file completes.**

### ⚠️ A `git worktree` is an INCAPABLE INSTRUMENT until both dependency trees are linked

The first `main` measurement returned **137 failed files / 61 failed tests** — and it was
entirely manufactured: 105 × `Cannot find module 'better-sqlite3'`, plus `pino`, `express`,
`jsonwebtoken`. A worktree gets tracked files, not gitignored `node_modules`, and CLAUDE.md's
rule *"`better-sqlite3` is installed only in `server/node_modules`"* means **both** trees
must be symlinked, not just the root. Comparing that 61 against the branch's 31 would have
yielded a confident, wholly fabricated "this branch fixes 30 tests".

### The two highest-risk pre-existing reds were checked individually

Both touch m68710 — the module this change alters most — and both fail **identically** on
`main` and branch (same test names, same counts):

- `cnxml-inject-m68710-table-regression.test.js` — 1 failing, identical.
- `cnxml-render-golden.test.js` — 2 failing (`m68699`, `m68710`), identical.

🔴 **The golden's `m68710` red is a TRANSLATION-VINTAGE difference, not a structural one**
(`útfellingu` vs `útfelling`, `Borið kennsl á` vs `Þekkt` …): the committed golden encodes
an older MT vintage, the §C118 mixed-vintage problem. **It was deliberately NOT
regenerated** — doing so would silently adopt every other drift accumulated since,
conflating a translation red with this render fix. ▶ **Whoever does regenerate it must
expect the `<para>` → `<p>` delta on top of the translation delta**, and must not read that
structural change as a surprise.

---

## 7. Cross-repo: no vefur change is needed

Read-only check of `../namsbokasafn-vefur/static/styles/content.css`:

```css
article.cnx-module p { margin: 10px 0; line-height: 1.44; }
article.cnx-module table th,
article.cnx-module table td { …; vertical-align: top; }
```

The paragraph rule applies inside `<td>` and cells are top-aligned, so `<p>` stacks
exactly as the source intends. **The CSS contract already covers this**, which is what
keeps §C146 a single-repo item.

---

## 8. Instruments that read this defect class as CLEAN — do not cite them

- **The id-matched render oracle passed §C146.** The leaked `<para id="nh4">` still carries
  its id, so `render-oracle-check` found every id present and reported no gap. ▶ Never cite
  a clean oracle run as evidence against this class.
- **Every character/segment-coverage tally reconciles for §C146**, because the text is all
  present — only its wrapper is wrong.
- **Nothing can tally §C154 at all**, because the row is absent. The oracle would report its
  ids as an *anchor* gap, which its own header says to treat as "id renamed" until the text
  is checked.
- **The loud seam could not have seen §C146.** It fires inside `renderBlockChildrenInOrder`;
  a table cell never reached that walk, so there was no dispatcher for a tag to be missing
  from. The seam record added here closes that, diagnostically.

---

## 9. What this does NOT do

- **It does not re-render or publish anything.** The published pages still carry the raw
  `<para>` until the affected chapters are re-rendered; that is a separate step, and per
  CLAUDE.md a `books/` push strands prod's content backup until the next deploy.
- **It does not answer §C85/M1** (organic `m00032`, a `<media>`+`<para>` entry) — that is an
  **extract-side** question about segmentation, and this fix is render-side. `m00032`'s
  published `<para>` leak is cleared by this change; its extract-side classification is not.
- **It does not widen the render to dispatch `figure` inside a cell.** Organic `m00046`'s
  single figure-in-entry is latent and unpublished. The seam records it **today, measured**
  (`renderTableCells:figure`, §6 above) rather than "if it ever reaches a rendered page" —
  and records it **diagnostically**, without turning it into a refusal, because
  `undispatchedBlocks` is returned by `renderCnxmlToHtml` and nothing fails on it.
