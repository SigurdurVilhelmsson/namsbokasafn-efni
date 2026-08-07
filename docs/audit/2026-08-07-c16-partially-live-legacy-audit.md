# C16 — partially-live Markdown/Matecat-era legacy: audit + classification

> **FROZEN EVIDENCE — 2026-08-07.** This document is a measurement, taken at
> `main ed9c554e`. It is **not status**. Per CLAUDE.md § *One source of truth*, if this
> document ever disagrees with the active register
> ([`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../plans/2026-07-21-post-item17-followup-campaign.md)),
> **the register wins** — it is live, this is dated. Do not sync it; cite it.
>
> **Register item:** §C16. **Scope:** the audit of artifacts (a)–(e) that §C16 logged on
> 2026-07-29 and recorded as *not started*, plus the era-bounding survey §C16 asks for in its
> *Sizing / sequencing* bullet. **This audit does not fix anything and prescribes no fix.**

---

## 0. What was asked, and what this answers

§C16's triage axis is one question per artifact: ***can this silently produce a wrong result
on current data?*** Its closing bullet warns that its own enumeration is **"a SAMPLE from a
~10-minute probe, not a survey"** and sets the audit's first task as bounding the era properly.

The deliverable §C16 specifies is **a classification, not a delete list**:
*fully dead → remove · partially live → decide · load-bearing back-compat → keep and pin with a test.*
Section 5 is that classification.

**Headline:** the audit found **one new reader-visible corruption**, **one new artifact more
severe than (b)–(e)**, and **three corrections to §C16's own evidence** — including that
artifact (e)'s premise stopped being true on the day §C16 was written.

---

## 1. Method — and why it is not the register's method

§C16's figures come from shape regexes over segment text. That method has a recorded failure in
this very item: §C16 notes that chemistry's `__` hits are MathML `<mo>_____</mo>` blanks, not
the defect, and that *"a regex census alone would have mis-scored them."*

This audit therefore **does not re-run a shape regex**. It runs the real function, twice:

> For every segment, call the shipped `reverseInlineMarkup()` (`tools/cnxml-inject.js`,
> exported), then call it again from a byte-identical copy of the module whose
> `hasApiMarkers` const is forced to a literal. **The only variable is the guard.** Any
> difference in output is, by construction, exactly what the three `!hasApiMarkers` blocks
> contributed — no regex re-implementation, and all preceding transforms (math stashing,
> bracket resolution, link conversion) applied in production order.

Both directions were run:

| Run | Guard forced to | Question answered |
|---|---|---|
| **A — "what fires today"** | `true` | On segments the guard classes legacy-era, does the legacy branch actually *change* anything? |
| **B — "what a flip would break"** | `false` | On segments the guard classes API-era, what would the Markdown converters do if the guard resolved false? |

Run B is the blast radius of the C13-class hazard §C16(a) describes, and **§C16 never measured
it.** Scripts are throwaway; they wrote a temp module into `tools/` and removed it in a
`finally` (verified: no orphan, `git status` clean).

**Counting unit: the SEGMENT**, as parsed by the shipped `parseSegments()`. Stated because
CLAUDE.md requires it and because §C16's own figures mix per-segment and per-file units.

**⚠️ One flaw in this audit's own instrument, recorded because it is the §C20 lesson
reproduced.** The first run truncated stored strings at 400 chars. For 11 long segments both
sides were truncated identically, and the diff reported **"no change" where the change was
merely unobserved**. Re-run untruncated; all 11 resolved to ordinary legacy markers. *No
effect and no observer are different results — including in the instrument you built to tell
them apart.*

---

## 2. Artifact (a) — `hasApiMarkers`: measured

### 2.1 The guard and its three blocks

`tools/cnxml-inject.js:1251` computes `hasApiMarkers` from the segment's own translated text.
Three blocks are gated on it — §C16 cites `:1420/:1481/:1553`, which are the **comment lines**;
the `if` statements are:

| Block | Lines | Converts |
|---|---|---|
| 1 | `:1421-1445` | `~**t**~` `~*t*~` `^**t**^` `^*t*^`, then `**b**`→bold, `*i*`→italics |
| 2 | `:1482-1486` | `\_\_t\_\_` and `__t__` → `<term>` |
| 3 | `:1554-1562` | ` ^14^C` isotopes, `~x~`→`<sub>`, `^x^`→`<sup>` |

**Not gated, and worth knowing:** `++text++`→underline at `:1416` (current extraction emits it
for *all* segments) and the `~`/`^` restore **inside** `<term>` at `:1494-1501`. Those fire
regardless of era, so removing the guard would not retire them.

### 2.2 Run A — census, re-derived

| | segments | guard FALSE | % | legacy branch **actually changed output** |
|---|---:|---:|---:|---:|
| `02-mt-output` (247 files, 6 books) | **30,647** | **22,004** | **71.8 %** | **168** |
| `03-faithful-translation` (5 files, 2 books) | 371 | 254 | 68.5 % | 9 |
| `04-localized-content` | 0 segment files | — | — | — |

§C16's 71.7 % / 22,163 / 30,932 reproduce within drift. **But the 71.8 % is the register's most
misleading figure, and correcting it is a finding**: it counts the branch being *taken*, not the
branch *doing anything*. **168 of 22,004 legacy-era segments (0.76 %) are actually altered.**
"71.7 % of segments take the legacy path" and "71.7 % of segments are at risk" are different
claims, and only the first is true.

### 2.3 Run A — classification of all 168 firings

Two independent classifiers agreed:

| Class | Segments | Verdict |
|---|---:|---|
| **Correct** — genuine stale-era markers converted as intended (`__term__`, `*ital*`, `^3^`, `~2~`) | **164** | the back-compat working |
| 🔴 **BLANK-MANGLE** — the `__…__` regex biting into a fill-in-the-blank underscore run | **4** | corruption |

### 2.4 🔴 The corruption: 4 instances, 3 modules, 2 books — **one of them new**

§C16 recorded this defect as **2 modules / 2 published pages, `orverufraedi` only**.
Measured, it is **3 modules / 3 published pages / 2 books**:

| Book | Module | Segment | Published page |
|---|---|---|---|
| 🆕 `liffraedi-2e` | `ch03/m66440` | `m66440:problem:fs-id2024704` | `05-publication/mt-preview/chapters/03/3-exercises.html` |
| `orverufraedi` | `ch01/m58782` | `…:fs-id1171360186862` | `…/chapters/01/1-fill-in-the-blank.html` |
| `orverufraedi` | `ch01/m58782` | `…:fs-id1171359127221` | *(same page)* |
| `orverufraedi` | `ch05/m58805` | `…:fs-id1172100638174` | `…/chapters/05/5-fill-in-the-blank.html` |

All four are present in the live injected `03-translated/mt-preview/*.cnxml` **and** in the
rendered HTML. Verbatim, from the published files:

```
______<dfn class="term"> tengis milli glúkósa og  (e.  bond between glucose and )</dfn>______
______<dfn class="term"> hennar og  (e.  and )</dfn>________
______<dfn class="term"> og  (e.  and )</dfn>______
______<dfn class="term"> </dfn>______
```

A student sees a connector word (*og* = "and") marked up as a glossary term with an empty
English gloss, between two broken blanks.

**⚠️ Reader-visibility is not uniform, and the distinction matters for priority.** These are
rendered to `05-publication/` on disk. Whether a reader sees them depends on the vefur sync,
which is manual (CLAUDE.md § *Content delivery*). The register records the `liffraedi-2e` ch03
sync as **[LEAD]-HELD** pending the book's re-MT, so the biology instance may not be live to
readers; the `orverufraedi` pages have no such hold recorded. **Confirm per book against
`/content/<book>/chapters/<NN>/<file>.html`** — never the page URL (SPA fallback 200s
everything).

**⚠️ §C16's finding that re-extraction does NOT clear this is confirmed by construction:** the
blanks originate in `01-source` CNXML and the segment still carries no bracket marker
afterwards, so the guard still resolves false and the converter still fires. Code defect, not
stale data.

### 2.5 Run B — the C13-class flip hazard, measured for the first time

If an editor deletes a segment's last `[[…]]` marker, the guard flips and the Markdown
converters arm on modern text. Blast radius today:

| Track | API-era segments | would change if flipped | % |
|---|---:|---:|---:|
| `02-mt-output` | **8,643** | **4** | 0.05 % |
| `03-faithful-translation` | 117 | **0** | 0 % |

The four are chemistry/organic notation where a lone `*` or `^` would be wrongly wrapped
(e.g. `* og tvö π*` → a spurious `<emphasis>`; `^-^` → `<sup>-</sup>`).

**Read this carefully — it cuts both ways and neither half should be dropped:**

- **The guard is genuinely load-bearing, in both directions.** Of **177** firings across both
  tracks (168 MT + 9 faithful) **173 are correct conversions** (164 + 9) — and it prevents a
  further **4** corruptions on the flip side. Deleting it breaks the human-verified
  `03-faithful-translation/ch01/m68664` file, which has **9 segments depending on it**.
- **The C13-class defect is real and unfixed.** Deciding inject behaviour from editable text
  is banned by CLAUDE.md's durable rule, and §C16's own 2026-07-30 correction shows the
  mixed-dialect state **regenerates** — the editor's Ctrl+T writes `__term__`, so a re-MT does
  not retire the guard. What this audit adds is that the *current* exposure is 4 segments, not
  22,004 — the class is a design defect, not an active fire.

### 2.6 🔴 §C16's starting set is wrong in **both** directions

§C16 names 9 real modules as "the audit's starting set", derived from shape matching.
Measured by actual firing, it is **10** (excluding `__e2e-fixture__`):

| §C16's list | Fires? | |
|---|---|---|
| `ch01/m68674` (61), `m68683` (36), `m68690` (24), `m68664` (5), `m68667` (3) | ✅ | counts differ slightly: 62 / 39 / 24 / 9 / 16 |
| `ch08/m68747` | ✅ | 1 |
| `ch03/m68700` | ❌ | shape-matches, converter never fires |
| `ch09/m68750` | ❌ | ” |
| `ch17/m68825` | ❌ | ” |
| — | 🆕 ✅ | `efnafraedi-2e ch01/m68670` (4) |
| — | 🆕 ✅ | `liffraedi-2e ch03/m66440` (1) — **the new corruption** |
| — | 🆕 ✅ | `orverufraedi ch01/m58782` (2), `ch05/m58805` (1) |

Three of §C16's nine never fire; four modules it does not list do. **A shape census is not a
firing census**, and §C16's own caveat ("a shape match is not a converter match … verifying
whether any produced wrong markup is task one") is vindicated exactly.

---

## 3. Artifacts (b)–(e) — verified, and one falsified

### (b) `terminologyService.importFromKeyTerms` — **CONFIRMED, both defects**

- `:::definition{term="…"}` Markdown files repo-wide: **0**. `*key-terms*.html`: **27**.
  The parser at `server/services/terminologyService.js:1255` can never match. Returns
  `{success: true, added: 0}` — total failure shaped like a clean no-op.
- The second, independent defect is confirmed on disk: `:1221` builds
  `` const chDir = `ch${String(chapterNum).padStart(2,'0')}` `` and `:1222`/`:1225` join it into
  a **publication** path (`…/faithful/chapters/ch03/…`, `…/mt-preview/chapters/ch03/…`).
  Publication dirs are **BARE** (`chapters/03`) per CLAUDE.md's two-conventions rule. This is
  the fourth instance of that trap and the first neither commented nor test-pinned.
  **It survives fixing the format** — both must be addressed.

### (c) `server/routes/status.js:1264` `files.json` — **CONFIRMED, cosmetic**

`find books -name files.json` → **0**. The `existsSync` is permanently false; the response
contract carries a phantom `filesData`. Cannot produce a wrong answer, only a permanently
absent one.

**🆕 Related, not in §C16:** the retired `books/<book>/chapters/<ch>/` tree that `files.json`
lived in **still exists in 4 books** (`efnafraedi-2e` 23 dirs, plus `orverufraedi`,
`liffraedi-2e`, `testbook`) and holds **26 live `status.json` files** — which
`scripts/validate-status.js` reads. So the directory is *not* retired; only `files.json` is.
Do not remove the tree.

### (d) `books/*/for-align/` — **CONFIRMED, cosmetic**

Contents: `books/efnafraedi-2e/for-align/.gitkeep`, and nothing else. Its only code reader is
`tools/archived/prepare-for-align.js` (already archived). Fully dead.

### (e) `books/*/04-localization/` — 🔴 **PREMISE FALSIFIED; §C16 is stale about its own artifact**

§C16(e) is the highest-severity of (b)–(e) in its own argument: *"a wrong entry in a
permissions table is higher-severity than a stray directory — it is the kind of fact an agent
obeys."* **That premise no longer holds.**

Current `CLAUDE.md` contains **no occurrence of `04-localization`** as a bare path. The
§ *File Permissions* table (`CLAUDE.md:298`) names `04-localized-content/`, and § *Purpose*
(`:234`) does too — both agreeing with the `.claude/settings.json` grant
(`books/**/04-localized-content/**`). There is nothing to disagree.

**It was true when written, and was fixed the same day.** `git log -S '04-localization' --
CLAUDE.md` returns `9343827b` — *"docs(claude-md): archive the changelog, lift its 14 durable
rules first"*, **dated 2026-07-29**, the day §C16 was logged. The Directory-Structure rewrite
that made the section self-describing removed the wrong entry incidentally.

**(e) therefore collapses to (d)-class:** a stray directory holding one file,
`books/efnafraedi-2e/04-localization/README.md`. **The doc/reality conflict is gone.**

**⚠️ But (e)'s *argument* was right, and this audit found the live instance it should have been
aimed at.** "A wrong entry in a permissions table is higher-severity than a stray directory —
it is the kind of fact an agent obeys" is sound reasoning; it simply outlived its example. The
agent-obeyed artifact that is still wrong today is **(f)**, `/intake-source` — a live, enabled
slash command with `Write` permission that instructs an agent to hand-upload translations to
malstadur.is. **Carry the argument forward to (f); retire the example.**

---

## 4. 🆕 Era-bounding survey — what §C16's sample missed

§C16 asks the audit to bound four transitions. Doing so surfaced **an artifact that clears
§C16's own (a)-class bar and outranks (b)–(e)**.

### 4.1 🔴 **(f) NEW — `/intake-source` is a live, enabled slash command teaching three retired eras, and its write would REVIVE artifact (c)**

`.claude/commands/intake-source.md` is **not disabled** — `.claude/settings.local.json`'s
`skillOverrides` turns off only `check-terminology`, `localize-chapter`, `review-chapter`,
`security-audit`. `/intake-source` is listed to every session, with
`allowed-tools: Read, Write, Bash`. It instructs an agent to:

1. **Write `books/{book}/chapters/ch{NN}/files.json`** (`:21`) — **the retired review model
   that is artifact (c) itself.** Its entry carries stages
   `source` · `mtOutput` · **`matecat`** · **`pass1`** · **`tmUpdated`** · **`pass2`** · `publication`;
   the canonical enum (`server/constants.js:34-43`) is
   `extraction` · `mtReady` · `mtOutput` · `linguisticReview` · `tmCreated` · `injection` · `rendering` · `publication`.
   **Four of the seven names do not exist**, and `source` is not a stage either.
2. Source from `01-source/docx/ch{NN}/` — the **docx era**; the pipeline is CNXML.
3. **"Upload to malstadur.is for machine translation"** (`:60`) — the **manual-MT era**,
   replaced by `tools/api-translate.js`, and in direct conflict with the standing
   *translations = API only* rule.
4. **"Then proceed to Matecat alignment"** (`:62`) — retired; TMX is in-house via
   `generate-tm.js`.

**⚠️ CORRECTION MADE DURING THIS AUDIT — recorded because the error is the instructive part.**
A first pass of this section claimed the command writes a **`status.json`** and demonstrated,
control-vs-treatment, that `npm run validate` accepts the four retired stage names. **The
demonstration was run against the wrong file and the claim is RETRACTED.** `/intake-source`
writes **`files.json`**; `scripts/validate-status.js` reads only `status.json`. *A severity
claim asserted from a template's contents, without checking the path it lands on, is a guess
wearing a measurement's clothes.*

**What is actually true, and why it still matters:**

- **The write is inert for validation** — nothing validates `files.json`.
- **It is NOT inert for the API.** `server/routes/status.js:1266` guards on
  `fs.existsSync(filesPath)`, which is false today only because **0** `files.json` exist.
  Creating one flips that guard TRUE, and `:1279` then serves the parsed contents as the
  `files` field of the chapter-status response. **So (f) is the thing that resurrects (c)'s
  dead branch** — the project's own recorded lesson, instantiated: *a route that fails closed
  masks what it would otherwise hit; reviving one re-exposes it.* Removing (c)'s branch while
  leaving (f) live, or vice versa, each leaves the other half armed.
- **The primary harm is the instruction, not the write.** A live command telling an operator
  to hand-upload to malstadur.is contradicts a standing project rule, and no test can see it.

**Revised rank: with (b), not with (a).** It is reachable and wrong on current data, but its
write does not corrupt the status model — which is what the (a)-tier claim rested on.

**🆕 A separate, genuine finding fell out of the retracted test, and it stands on its own:**
`schemas/chapter-status.schema.json` declares **no `properties` and no `additionalProperties`
under `stages`**, and `scripts/validate-status.js` implements **no `additionalProperties`
check at all** (`grep` → no match). **Stage names in `status.json` are entirely
unconstrained** — a real `status.json` with its `stages` block replaced by four nonexistent
names reports `Results: 1/1 files valid`. Nothing currently exploits this; it is a gap in the
gate, not an active defect, and it is **not** caused by `/intake-source`.

### 4.2 (g) `/pipeline-status` — cosmetic

`.claude/commands/pipeline-status.md:31` renders a `| Matecat |` row in its status table. Also
live and enabled, but it only *displays*; it writes nothing and decides nothing.

### 4.3 Doc drift in always-loaded / top-level files

| File | Line | Claim | Reality |
|---|---|---|---|
| `ROADMAP.md` | 76 | `Matecat integration` → `server/services/matecat.js` **✅** | **file does not exist** |
| `ROADMAP.md` | 96 | lists `matecat` among current `server/routes/` | **no such route**; not mounted |
| `ROADMAP.md` | 73 | `TM preparation` → `tools/prepare-for-align.js` **✅** | archived (`tools/archived/`) |
| `ROADMAP.md` | 257 | `POST /api/pipeline/prepare-tm` "Prepare files for Matecat Align" | Matecat retired |
| `README.md` | 139 | pipeline step 4 = `prepare-for-align` + Matecat | retired; `generate-tm.js` |
| `README.md` | 100 | `MATECAT_API_KEY` env var | service gone |
| `server/.env.example` | 35-38 | Matecat config block | service gone |

`ROADMAP.md:42` and `:58` **already say Matecat is retired** — so ROADMAP contradicts itself
four lines apart.

### 4.4 🆕 **(i) — the generated inventories are produced, committed, and surfaced NOWHERE**

This is *why* the drift in §4.3 exists, so it belongs with it rather than as a footnote.

`npm run docs:generate` runs three scripts. Two produce authoritative, derived inventories —
`scripts/generate-tool-inventory.js` → `docs/_generated/tools.md` (44 tools) and
`scripts/generate-route-inventory.js` → `docs/_generated/routes.md`. The third,
`scripts/update-readme-sections.js`, splices them into README **only if** it finds
`<!-- tools-start -->` / `<!-- routes-start -->` markers.

**README contains neither marker** (`grep` → no match). So the third script is a **permanent
no-op**: it reads, replaces nothing, and rewrites the file unchanged. The generated inventories
are correct, committed, and read by nobody — while hand-maintained lists in `ROADMAP.md` and
`README.md` drifted until this audit fixed them (§4.3).

`.github/workflows/docs-check.yml` regenerates and fails on any diff, so the *generated* files
cannot go stale — the gate works. It simply guards artifacts that nothing consumes.

This is the project's own "documentation as exhaust — don't maintain prose, generate it"
principle **half-wired**: the generator exists, the consumer was never connected. Reachable,
produces a wrong result (a stale hand list beside a fresh generated one), no test sees it.

### 4.5 The four transitions — bounded

| Era | Live consumers remaining |
|---|---|
| docx/Pandoc → Markdown + `:::` | `terminologyService.js:1255` (artifact **b**); `/intake-source` (**f**). Data: `liffraedi-2e/reference-translations/ch03-human-docx/` — deliberately preserved, not in the pipeline. |
| Matecat → `generate-tm.js` | **No live server code** — `server/services/matecat.js` and `routes/matecat.js` do not exist. Remaining hits in `server/` are *comments recording the retirement* (`pipelineService.js:850`, `pipelineStatusService.js:272`, `routes/status.js:1642`) plus `.env.example`. Docs per 4.3; commands per **f**/**g**. |
| manual malstadur.is → API | `/intake-source` (**f**) only. `tools/lib/malstadur-api.js` is the *current* API client — not legacy. |
| `files.json` → DB | `server/routes/status.js:1264` (artifact **c**) only. |

---

## 5. THE CLASSIFICATION — the deliverable

Per §C16: *fully dead → remove · partially live → decide · load-bearing back-compat → keep and pin with a test.*

| # | Artifact | Class | Basis |
|---|---|---|---|
| **(a)** | `hasApiMarkers` + its 3 blocks | 🟡 **LOAD-BEARING BACK-COMPAT → KEEP AND PIN**, *and* **PARTIALLY LIVE → DECIDE** | Enables 173 correct conversions, prevents 4 further corruptions — cannot be deleted. Also mangles 4 blanks in published output and rests on a banned design. **Two separable pieces of work; do not conflate them.** |
| **(a′)** | the 4 blank-mangles | 🔴 **PARTIALLY LIVE → DECIDE (reader-facing)** | Live in 3 published pages, 2 books. Not cleared by re-MT. |
| **(b)** | `importFromKeyTerms` | 🔴 **PARTIALLY LIVE → DECIDE** | Live HEAD_EDITOR route, silent no-op, **plus** an unpinned `ch`-prefixed publication path that survives fixing the format. |
| **(c)** | `files.json` branch | 🟢 **FULLY DEAD → REMOVE** | 0 files; permanently-false `existsSync` + phantom response field. ⚠️ Remove the *branch*, not `books/*/chapters/` — that tree is live (26 `status.json`). ⚠️ **Dead only while (f) stays unused** — `/intake-source` writes exactly this file. **Pair with (f).** |
| **(d)** | `books/*/for-align/` | 🟢 **FULLY DEAD → REMOVE** | `.gitkeep` only; sole reader archived. |
| **(e)** | `books/*/04-localization/` | 🟢 **FULLY DEAD → REMOVE** (downgraded) | Premise falsified; now (d)-class. One `README.md`. |
| **(f)** 🆕 | `/intake-source` | 🔴 **PARTIALLY LIVE → DECIDE — rank with (b)** | Live, enabled, `Write`-permitted; instructs manual malstadur.is upload against a standing rule, and **writes the `files.json` that would revive (c)'s dead branch**. ⚠️ **Take (c) and (f) together** — fixing either alone leaves the other armed. *(Ranked at (a)'s tier in this doc's first pass, on a retracted claim — see §4.1.)* |
| **(g)** 🆕 | `/pipeline-status` Matecat row | 🟢 **FULLY DEAD → REMOVE** | Display only. |
| **(h)** 🆕 | ROADMAP / README / `.env.example` drift | 🟢 **FULLY DEAD → REMOVE** | §4.3. Fixed in place 2026-08-07 per § *One source of truth* — except `server/.env.example`, left for the scoped work. |
| **(i)** 🆕 | generated inventories with no consumer | 🟡 **PARTIALLY LIVE → DECIDE** | §4.4. `docs/_generated/{tools,routes}.md` are correct, committed and read by nobody; README lacks the markers `update-readme-sections.js` needs, making it a permanent no-op. **This is the mechanism behind (h)** — fix it and the hand lists stop drifting. |
| — | `stages` unconstrained by schema + validator | 🟡 **PARTIALLY LIVE → DECIDE** | §4.1, final para. A gap in the gate, not an active defect; nothing exploits it today. Listed unlettered because it is not era-legacy — it is an independent weakness the audit tripped over. |

**Not classified — out of this audit's remit.** §C16's fix direction for (a) is contested
*within the register*: `:509` (2026-07-29) says *"FIX DIRECTION IS UNRESOLVED — do not inherit
one"*, while `:548` (2026-07-30) says the confirmed instance *"fixes the fix direction"* →
id-anchored `[[term:text|id]]`, after which `:1481-1485` can go. **The later entry partially
supersedes the earlier**, but the premise `:509` was worried about — whether era is a
per-module or per-segment property — is still unestablished, and §C16 makes settling it task
one of the fix. **This audit does not settle it and does not design the fix.**

---

## 6. Corrections this audit makes to §C16's own evidence

Per CLAUDE.md — *if you notice document B is wrong, fix B; never log it as a to-do in
document A*. Recorded here as **evidence**; §C16 was edited directly.

1. **Starting set wrong in both directions** — 9 shape-matched modules → **10 firing**;
   `m68700`/`m68750`/`m68825` never fire; `m68670`, `m66440`, `m58782`, `m58805` do (§2.6).
2. **The corruption is in 2 books, not 1** — `liffraedi-2e ch03/m66440` is new (§2.4).
3. **(e)'s premise was falsified on the day §C16 was written** by `9343827b` (§3).
4. **71.8 % is branch-taken, not at-risk** — the actual altered set is 168 segments, 0.76 %
   (§2.2). §C16's headline invites the stronger reading.
5. **Line citations `:1420/:1481/:1553` are the comment lines**; the `if`s are
   `:1421/:1482/:1554` (§2.1).
6. **ROADMAP.md contradicts itself** — Matecat marked retired at `:42`/`:58` and ✅-current at
   `:73`/`:76`/`:96` (§4.3). Its route list was wrong in both directions: **7 phantom routes,
   3 missing**. Fixed in place, replaced with a pointer.

### 6a. And one correction this audit made to **itself**

A first pass of §4.1 ranked **(f)** at (a)'s tier on the claim that `/intake-source` writes a
**`status.json`** carrying four nonexistent stage names that `npm run validate` accepts. The
control/treatment demonstration was real — but it was run **against the wrong file**. The
command writes **`files.json`**; the validator reads only `status.json`. The claim is retracted
and (f) is re-ranked with (b); the schema/validator gap survives as an independent, unexploited
finding. **The audit reproduced the register's own characteristic failure — asserting from a
document's contents without checking what consumes it** — which is, verbatim, the lesson
[[terminology-status-is-a-selector]] already records: *before judging a value, read its
consumers.*

---

## 7. Reproducing this

**The scripts are committed** — [`experiments/c16-legacy-audit/`](../../experiments/c16-legacy-audit/)
(`audit-guard-firings.mjs`, `audit-guard-flip.mjs`, plus a README recording their traps). They
are read-only over `books/`, resolve paths from `import.meta.url`, and were re-run from an
unrelated cwd as a check: **30,647 segments / 168 firings, identical.**

```bash
node experiments/c16-legacy-audit/audit-guard-firings.mjs /tmp/firings.json
node experiments/c16-legacy-audit/audit-guard-flip.mjs    /tmp/flip.json
STAGE=03-faithful-translation node experiments/c16-legacy-audit/audit-guard-firings.mjs /tmp/f.json
```

⚠️ **Everything here is a measurement of a moving target.** The register records three
different `segment_edits` row counts in five days. **Re-run before acting on any number** —
which is the reason these are committed rather than described.
