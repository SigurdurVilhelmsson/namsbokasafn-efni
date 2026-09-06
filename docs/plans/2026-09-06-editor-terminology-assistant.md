# The editor terminology assistant — the plan of record

**Date:** 2026-09-06 · **Owner of:** the DESIGN and its DEPENDENCY ORDER.
**Status lives in** [`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md)'s ⏩ RESUME block — this document carries no status verbs and no progress counts.
**Supersedes nothing.** It collects §C36 B4c, §C54, §C50, §C78 and §C42 into one dependency-ordered plan, because they were separate register items that turn out to be one feature.

---

## Why this document exists

[USER], 2026-09-06:

> *"I'm starting to think that removing the glossary from the MT runs and pipeline process, and spending more effort on beefing up the glossary assistant in the editor system (including propagation, lemma support etc) to make it easier for editors, who are reading the complete text anyway, to fix and propagate the occasional terminology problems, rather than continue to plug all possible holes the glossary inclusion in the MT creates."*

**The measurements support it, and §C133 is the one that decides it.** On a full chapter, three runs:

| version | terms with a stable Icelandic signature |
|---|---|
| glossary run | 198/448 = 44.2% |
| no-glossary run 1 | 200/448 = 44.6% |
| no-glossary run 2 | 199/448 = 44.4% |

**0.4 points across three runs, with the two same-arm runs 0.2 apart — the glossary-vs-none difference is inside the measure's own noise.** Consistency is the one thing the wire glossary was kept for. → §C133.

🔴 **THE STRUCTURAL ARGUMENT, WHICH OUTLIVES THE NUMBERS: THE GLOSSARY PLACES TERMINOLOGY DECISIONS AT THE POINT OF LEAST INFORMATION AND THE EDITOR PLACES THEM AT THE POINT OF MOST.** `filterGlossaryForText` is a flat, case-folded, context-free map applied **before** translation by a matcher that cannot see the sentence, cannot inflect, and cannot tell *addition reaction* from *tax assessment*. Every guard built so far — §C71 contested, §C73 partial compliance, §C116 substring, §C117 homographs, §C119/§C121 fallback contamination, headword shadowing, §C128 in-domain — is an attempt to give that map information it structurally cannot have. **An editor reading finished Icelandic with the English beside it has all of it.**
▶ **And the failure economics are inverted:** a glossary error costs a **paid re-run of every chapter bought under it**; an editor error costs an edit.

---

## 🔴 THE REFRAMING — READ THIS BEFORE BUILDING ANYTHING

**B4c's write path was specified when the glossary was still on the MT wire, so its purpose was *"make the MT stop producing the bad term."* THAT IS NO LONGER THE TARGET.** The new chain is:

> record the editorial decision → `conceptResolver.js:81` reads it → `findTermsInSegments` flags against it → the **term-keyed** finder uses it as the propagation seed

⚠️ **Nothing in this plan should reach toward `api-translate.js`.** A unit that does has misunderstood the purpose.

---

## What already exists — do not rebuild it

### Wired to the UI (an editor sees and uses this today)

| Capability | Anchor |
|---|---|
| Term highlighting in the EN pane, per segment | `segment-editor.js:297` → `:316` → `routes/segment-editor.js:1334` → `terminologyService.js:1391`; render `segment-editor.js:1233`, `term-highlight.js:41-85` |
| Term popup — **display only**; its one action is a link to `/terminology` | `segment-editor.js:2942-3012`, link at `:2996` |
| Per-segment terminology issues (`missing` / `alternative`) | `segment-editor.js:1237-1249`; emitted `terminologyService.js:1786`, `:1814`, `:1822` |
| Inflection-aware matching (BÍN paradigm → regex) | `terminologyService.js:1742-1743`, `:2250`; `conceptMatcher.js:386,409-418` |
| Quick term lookup + insert into the textarea | `segment-editor.html:1932`, `segment-editor.js:3044`, `:3111-3120` |
| Head-editor per-module terminology-violation report | `segment-editor.js:889-911` → `routes/segment-editor.js:1506` → `terminologyService.js:2094` |
| §C124 MT-residue badge, module + segment | `server/lib/mtFindings.js`; `segmentParser.js:128,169,426`; `segment-editor.js:242,1252-1275` |
| **Segment**-keyed propagation (`Beita víðar`): preview → confirm → book-wide pending edits | `segment-editor.js:1478,1948-1990`; `propagationService.js:36-57,65-160,189-215` |
| `/terminology` page: search, add/edit, approve/dispute, review queue, CSV export, term mining | `views/terminology.html`; `routes/terminology.js` |

### Computed but unused — the cheap wins live here

- 🔴 **`buildModuleTerminologyReport` returns `segments: []` per violation and the client throws it away.** Computed at `terminologyService.js:2100-2113`, transmitted, then `segment-editor.js:902-908` renders only `„english“ → „expected“ (count)`. **The head editor is told a term is wrong and given no way to reach its occurrences.**
- 🔴 **`matchesForm` discards the match.** `terminologyService.js:1750` is `return re.test(seg.isContent);` — **nothing anywhere knows WHICH surface form was found.** The `alternative` issue's `used.text` (`:1815`) is the alternative term's *lemma*, not the string in the segment.
- ⚠️ **BÍN's grammatical tag is on disk and never read.** `binInflections.js:140` reads `row[4]` (the form); index 5 is the tag. `concept_term.inflections` is a flat, tagless set.
- ⚠️ **`book_term_preference` is read-live, write-dead.** Reader `conceptResolver.js:81` (with a `chapter` column). Writers are migration 048, an `import-concepts.js` *delete*, a gate script and tests — **no route, no view, no client JS.**
- ⚠️ **Two term models on one screen.** Highlighting and issues read the **concept model** (`terminologyService.js:1498`); lookup, approve/dispute and mining read the **legacy tables** — so approving on `/terminology` changes nothing the editor highlights. → §C42.
- ⚠️ **The lookup insert emits `__term__`** (`segment-editor.js:3117`), and `cnxml-inject.js:282-299` strips that wrapper *only* when both EN and IS carry a `term` marker. **Whether the underscores survive to the reader in the common case is UNVERIFIED — one probe before anything is built on that button.**

---

## What was started and halted

| Item | How far it got | Artifacts |
|---|---|---|
| **§C36 B4c** — panel + concept-model write path | **Zero. Never reached design.** No spec, no branch, no commit. **Four shipped files are written *against* it** | `terminologyService.js:1693`; `conceptResolver.js:402,544`; `e2e/terminology-multibook.spec.js:93` |
| **§C54** acceptable-forms (`matching_words`) | Ruled the second of two specs; the sibling shipped, this one was never written | `docs/superpowers/specs/2026-08-12-marker-integrity-design.md:5,309`; input frozen at `docs/decisions/2026-08-12-matecat-evaluation-and-editor-architecture.md:75-85` |
| **§C50** — is the panel's volume usable? | Self-promoted to P1 2026-08-12, still `[decision needed]` | 4.80 issues/segment biology, 2.81 chemistry |
| **§C40** — whole-system adversarial review of the editor pathway | Never run; gated on B4c existing | register |
| **§C42** — the propose route still writes the dead table | Open, verified live | `routes/terminology.js:541` → `terminologyService.js:346-352` |
| **§C44.1** compounder | Sized (28.0% → 45.1–70.5%), jammed at STEP 0 on the §C25 coupling | `test-results/b4b-matcher-cutover-2026-08.md` §B11 |
| **§C25** Greynir sidecar | **Ruled DELETE 2026-08-06, still in the tree, still wired, never once executed** | `server/greynir-sidecar/` (`da2868f9`); `greynirEngine.js:34,77` |
| **BÍN credit in the editor UI** | Decided, never built — absent from `server/views/` and `server/public/` | `docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md:110-116` |

▶ **The halt date is 2026-08-12 and the cause is recorded: displaced by the re-MT campaign.** Nothing was abandoned on technical grounds.

---

## The gap list — ordered by DEPENDENCY, not by size

**U1 — capture the matched surface form.**
*Why:* every replace or propagate action needs the actual inflected substring; today only a boolean survives. *Depends on:* nothing. *Half-exists:* the regex already matches it — `terminologyService.js:1750` throws it away. Switch `re.test` → `re.exec` and carry `{form, index}` onto the issue objects at `:1785`, `:1812`, `:1822`.

**U2 — render the `segments[]` the client already receives.**
*Why:* the head-editor report names a bad term and offers no route to its occurrences. *Depends on:* nothing. *Half-exists:* fully computed and transmitted. **Client-only — the cheapest unit here.**

**U3 — term-keyed occurrence finder.**
*Why:* §C78's whole finding. `propagationService.js:206` keys on `concordance.normalizeEn(seg.en)` — normalized-exact ENGLISH — so a wrong term's occurrences, which sit in thousands of *different* sentences, are never grouped. *Depends on:* U1. *Half-exists:* **almost everything** — the book-wide walk, `classifyOccurrence`, `createPropagatedEdits`, the required `sourceEn` structural guard, pending-edit semantics with no auto-approve. **Only the KEY changes.** A single-term regex, not the Aho-Corasick pass, so §C24's cost profile does not apply.

**U4 — `book_term_preference` write path (this is B4c).**
*Why:* without it an editor cannot make a term decision stick, and it is the seed U3 propagates from. *Depends on:* the §C50 volume ruling, and re-deriving `termId` for `tied` candidates (`hit.tied` carries `text` only). *Half-exists:* the read side is live end to end with a `chapter` column (0 = book-wide, -1 = appendices). **Schema and resolver are done; the writer is the missing piece.**

**U5 — acceptable-forms (`matching_words`) — the §C54 spec, then the schema.**
*Why:* converts *generation* into *validation*, which is exactly the [LEAD]'s **semi**-automatic threshold. It reaches the three populations morphology cannot: affix fragments, solid compounds `wholeWordRegex` cannot see inside, and paraphrase. *Depends on:* U4's design. *Half-exists:* the consumption point is one line — `buildInflectionRegex` at `:2250` already unions a list.

**U6 — per-segment acceptance store.**
*Why:* nothing persists an editor's judgement, so every save re-flags. *Depends on:* nothing. *Half-exists:* nothing.
⚠️ **TWO SEMANTICS THAT MUST NOT BE MERGED:** *"prefer this term from here on"* = **U4**; *"in THIS segment the deviation is right"* = **U6**. Different table, different UX.

**U7 — replace-into-slot (the actual flip).**
*Why:* U3 finds the occurrences; something must write the correct target form. *Depends on:* U1 + U3 + U5. *Half-exists:* the write path to readers exists (`applyApprovedEdits` → faithful → inject → render). 🔴 **When no acceptable form fits, the behaviour is FLAG FOR HAND FIX — never guess.**

**U8 — BÍN credit + modification statement in the editor UI.**
*Why:* the obligation goes live the moment a panel displays an inflected form. *Depends on:* whichever unit first surfaces forms. *Half-exists:* the text is already in the CLI (`scripts/fetch-bin-inflections.js:64-67`, `lib/binInflections.js:27-30`).

**U9 — optional: read BÍN's tag column, as an auto-seeder for U5 ONLY.**
*Why:* pre-fills U5's form list per case/number rather than typing it. *Depends on:* U5 existing first. **NOT step 1** — see the ruling below.

---

## Decisions already made — do not re-litigate

**Morphology is not the primary route** (`docs/decisions/2026-08-12-matecat-evaluation-and-editor-architecture.md:146-149`):
> *"Solve the target-form problem with morphology instead (compound decomposition, wider BÍN coverage) — rejected as the primary route. The compounder work was already measured at roughly 3% yield, and it cannot reach the paraphrase population at all. Morphology remains useful for auto-seeding an acceptable-forms list, not as a replacement for one."*

**The adopted mechanism needs no morphology** (same file, `:82-85`):
> *"It requires no morphology, no compounder, and no BÍN dependency, and it composes with the paradigms already populated rather than competing with them."*

**Vanilla JS, and the one condition that reopens it** (`:32-35`, `:121-126`): keep the editor vanilla with no build step; inline decoration **inside** the editable field is a named reopen condition owing the lead a decision. ⚠️ **The acceptable-forms mechanism does NOT trigger it — it works as a panel action.**

**The threshold the flip must meet** ([LEAD], register `:2539`): a wrong translation across a book is *(a) unacceptable* if fixing it needs manual per-occurrence editing or a re-MT; *(b) acceptable* if a single **flip** propagates at least **semi**-automatically. 🔴 **Measured answer: we are in (a).**

**BÍN is legally available; three obligations bound it** (`docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md:401,411,412`): plain **CC BY-SA 4.0 plus credit and a modification declaration**, no acquisition-route restriction · **BÍN-derived forms must not enter `glossary-unified.json`, and neither existing gate would catch it** · **no BÍN bytes may be committed, test fixtures included.**

**No JS/WASM Icelandic NLP exists** (`docs/decisions/2026-08-06-mideind-toolchain-evaluation.md:154-158`): the answer to the no-Python constraint is a **hosted API**, not a port — and the key held calls only `/v1/translate*`, so there is no hosted morphology endpoint today.

---

## Open questions needing a [USER] ruling

**Q1 — Propagation scope. TWO questions; keep them apart.**
- **Preference scope** — where the *rule* applies. `book_term_preference (book_id, chapter, english, term_id)` already supports chapter and book-wide. **There is no module column**, so module-level preference is new schema.
- **Propagation scope** — where the *edits land*. `findOccurrences` is **book-wide by construction** (`propagationService.js:198-200`). Narrowing is a filter; widening cross-book is excluded by item O's YAGNI boundary.
▶ **Recommended framing:** *preference* book-wide with a chapter override (already free); *propagation preview* book-wide but **applied per chapter** — matching the per-chapter loop the campaign already runs, and keeping a bad flip's blast radius at one chapter.

**Q2 — Forced by BÍN licensing.** If any panel shows an inflected form, U8 becomes mandatory *before that panel ships*. And the ShareAlike export hazard needs a **mechanical** gate: measured clean today, but nothing *stops* the next one-line `SELECT`, and `scripts/git-backup.sh` runs the exporter unforced every 2 hours **into a public repo**.

**Q3 — §C50, the volume ruling, blocks U4.** 4.80 issues/segment on biology, 2.81 on chemistry. **A panel showing 3–5 issues per segment is a different product from one showing occasional ones.** Options on record: accept and ship · suppress `alternative` until it renders distinctly · gate on severity · defer the Icelandic-side check on raw MT.

**Q4 — "Off the MT wire" ≠ off the render path.** `glossary-unified.json` also feeds the reader-visible render path via `substituteMathLabels` / `buildGlossaryMap`, and the 2-hourly cron keeps exporting it. **Does the render-side substitution stop reading it too, or does only `formatGlossary` go?**

**Q5 — §C25 vs §C44: owed, but NOT blocking.** Under the `matching_words` route the compounder is off the critical path — it is only needed if someone later chooses morphological *generation*. The sidecar's deletion is still owed and §C44.1 stays jammed until it is ruled, but **neither blocks U1–U8.**

---

## Two findings surfaced while writing this

- 🔴 **`importFromKeyTerms` is a zero-yield no-op.** `terminologyService.js:1235-1242` searches for `*-key-terms.md`; the published tree contains **0** `.md` and **27** `.html`. It always returns `No key-terms files found`. One-line fix in three places, **not applied** — it is a code change outside the campaign's current scope and belongs to whoever owns Item 21.
- ⚠️ **`server/.venv` IS a Python virtualenv** — `pyvenv.cfg`, `bin/python3.12`, `lib/python3.12/`, 151 MB. The Playwright inside it is the **Python** package at `site-packages/playwright-1.57.0.dist-info`, which is exactly what CLAUDE.md already describes. **A peer session proposed "correcting" CLAUDE.md to say otherwise; that correction is wrong and must not be filed.**
