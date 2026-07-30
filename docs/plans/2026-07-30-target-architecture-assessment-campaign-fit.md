# Target-architecture assessment — LENS E: campaign fit, subsumption, and ordering

**Written:** 2026-07-30 · **Branch at time of writing:** `feat/c16-segment-edit-reattach` (`d775e777`)
**Status of this document:** an **assessment**, not a register and not a plan. Per CLAUDE.md
§ *One source of truth*, it **cites** the active register
([`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md))
for status and never restates it. If this file and the register disagree, **the register wins.**
Every number below is a measurement with the command attached, or a citation to a register line.

---

## 0. The verdict, in three lines

The lead's target is **not one project — it is three, and they have very different sizes.**

| | Goal | Size | Why |
|---|---|---|---|
| **1** | Re-extract + re-MT all current content, preserving 2 chemistry modules | **M** (a few days, mostly waiting on API calls) | Runbook written, tooling built, cost measured at **~48,000 ISK** |
| **2** | Remove all retired-pipeline legacy | **M for the data half · L for the editor half** | The curly-marker families die with goal 1. The **markdown** family does not — the editor's toolbar still writes it, so removing it is an editor-UI redesign |
| **3** | Post-refactor system = CNXML in → … → web out **+ OpenStax-conformant CNXML out** | **the web/export half is S–M · the "contributable to OpenStax" half is XL** | Module-level Icelandic CNXML already exists and is good. The *bundle*, the *gate* and the *fidelity proof* do not exist as a pipeline stage |

**The single most important thing:** goal 3's "contribute back to OpenStax" leg is the one that
looks done and is not. `03-translated/` already emits well-formed, metadata-preserving,
MathML-preserving Icelandic CNXML — but the RelaxNG gate that would prove conformance is a
**standalone experiment** whose own README says *"Nothing here is wired into the pipeline, the
server, or CI"* (`experiments/cnxml-validation-gate/README.md:9-10`), and its own effort estimate
is **"Gate alone: ~2.5–3 days. Gate + everything needed to enforce it on biology: ~5–9 days"**
(`FINDINGS.md:231`) — and that is only the *validity* half. **Fidelity is a separate axis**
(CLAUDE.md § *Schema validity ⊥ fidelity*), and no collection bundle is emitted at all.

**The one correction to the lead's premise, and it is load-bearing:** *"the only editorial work to
preserve is TWO modules in chemistry ch03"* is **not quite true**. `02-mt-output` — nominally
🔒 READ ONLY — carries at least six lead-authored hand-repair commits that live in no faithful
file, headed by **`4e5be912`**, which corrected `liffraedi-2e` m66441's title from "Fitusýrur" to
**"Lípíð"**. A `--force` re-MT re-translates that title from English, can restore the wrong term,
and would flip a **live reader URL** back to `3-3-fitusyrur`. §3.5 item 3 · triage measurement U1b.
This does not change any size below; it changes what must be on the pre-flight checklist.

**Recommendation: split the ask.** Goals 1 and 2(data) can start in the next heavy session and
finish inside a week. Goal 2(editor) is a scoped PR that must be designed with C16(a). Goal 3(b)
should be logged as its own campaign, not folded into this one.

---

## 1. What I measured (so the rest can be checked)

### 1.1 Corpus scale — "all current content" is 245 modules of ~1,192 available

```
for b in efnafraedi-2e edlisfraedi-2e liffraedi-2e lifraen-efnafraedi orverufraedi; do
  echo "$b src=$(find books/$b/01-source -name '*.cnxml'|wc -l) \
for-mt=$(find books/$b/02-for-mt -name '*-segments.en.md'|wc -l) \
faithful=$(find books/$b/03-faithful-translation -name '*-segments.is.md'|wc -l)"; done
```

| book | source `.cnxml` | extracted (`02-for-mt`) | faithful files |
|---|---|---|---|
| efnafraedi-2e | 149 | 170 *(= 149 modules + 21 `chapter-metadata`)* | **4** |
| edlisfraedi-2e | 283 | 10 | 0 |
| liffraedi-2e | 259 | 13 | 0 |
| lifraen-efnafraedi | 342 | 40 | 0 |
| orverufraedi | 159 | 12 | 0 |
| **total** | **1,192** | **245** | **4** |

Two consequences the lead should see:

- **Chemistry is the only fully-extracted book** (149/149 + metadata). The other four are at
  3–12% coverage. So "all current content" is a **small, cheap** set — but it is *not* the
  corpus, and the natural follow-on ("now do the rest of biology/physics") is roughly **5×**
  this migration in both cost and elapsed time.
- **The editorial work to preserve really is 4 files, and all four are tracked in git**
  (`git ls-files books/efnafraedi-2e/03-faithful-translation/` → 4 `.is.md` + README). The
  register already verified this and resized the migration on it (register `:241-256`).
  The lead's premise #1 holds. See §5.1 for the one caveat.

### 1.2 Re-MT cost — measured, not estimated: **~48,173 ISK**

Rate is a single shared constant, unit-tested: `ISK_PER_1000_CHARS = 10`
(`tools/lib/malstadur-api.js:28`; `estimateIsk` at `:37`; pinned by
`tools/__tests__/malstadur-api.test.js:174-184`, incl. `estimateIsk(4_691_298) === 46_913`).

Command run per book: `node tools/api-translate.js --book <slug> --dry-run --force`

| book | modules | characters | **ISK** |
|---|---|---|---|
| efnafraedi-2e | 166 *(+4 locked, refused)* | 3,456,110 | **34,561** |
| lifraen-efnafraedi | 40 | 779,707 | **7,797** |
| liffraedi-2e | 13 | 208,441 | **2,084** |
| edlisfraedi-2e | 10 | 196,119 | **1,961** |
| orverufraedi | 12 | 176,983 | **1,770** |
| **total** | **241 + 4 locked** | **4,817,360** | **≈ 48,173** |

**Three caveats so this is not quoted as gospel:**
1. It **excludes the 4 locked chemistry modules** — `--force` is refused on them by design
   (`Locked: 4 (editing started — MT re-run refused)`). They are ~1% of chemistry → add ~800 ISK.
2. It prices the **current** extraction. A re-*extract* shifts character counts (chemistry's EN
   is already on brackets — register `:376` — the others are not).
3. It is **one pass**. A failed batch that must be re-run costs again.

**Budget 50,000–60,000 ISK.** This is not a new ask: register `A5` (`:457`) already lists
*"re-MT API-spend authorization"* as an open [LEAD] decision. This assessment supplies the number
that decision was waiting for.

### 1.3 Goal 3(b) — what exists and what does not

| Needed to "contribute back to OpenStax" | State today | Evidence |
|---|---|---|
| Module-level Icelandic CNXML | **exists and is good** — `<document xmlns="http://cnx.rice.edu/cnxml">`, `md:content-id`/`md:title`/`md:abstract`/`md:uuid` preserved, `xmlns:m` MathML namespace retained on math-bearing modules | `head -25 books/efnafraedi-2e/03-translated/faithful/ch01/m68664.cnxml`; ns check on `03-translated/mt-preview/ch11/*.cnxml` |
| Two tracks emitted | **exists** — `03-translated/{faithful,mt-preview}/chNN/*.cnxml` | `ls books/efnafraedi-2e/03-translated/` |
| A **collection bundle** (`collection.xml`, module dirs, media) | **does not exist.** Nothing writes one. `collection.xml` is only *read*, at intake, by `tools/download-source.js:115` | `grep -rn "collection.xml\|collection-order" tools/*.js` → only `download-source.js`, `translate-chapter-titles.js`, `cnxml-extract.js:2095` — all readers |
| A **schema conformance gate** | **experiment only** — not in `npm run validate` (`package.json:8` → `scripts/validate-status.js`), not in CI, not in `npm test`. Only reference outside `experiments/` is a comment in `tools/__tests__/cnxml-inject.test.js` | `experiments/cnxml-validation-gate/README.md:9-10` |
| A **fidelity guarantee** | separate axis, partially built and **allowlist-based** | `tools/cnxml-fidelity-check.js`; `books/efnafraedi-2e/fidelity-allowlist.json` — **36 allowlisted entries**, exact-match on `moduleId+tag+diff`, *"any drift → unexplained (red)"* |

**So goal 3(b) is: bundle emitter (new, M) + gate integration (2.5–9 d per the experiment's own
estimate) + a fidelity story that is currently 36 hand-triaged exceptions in one book.** That is
XL and it needs its own campaign, brainstorm and spec. It is also the one goal with a genuine
external stakeholder (OpenStax), which means the acceptance criteria are not ours to invent.

---

## 2. Lens E ① — which register items does this SUBSUME?

| Register item | Subsumed? | Evidence |
|---|---|---|
| **C16(a)** `hasApiMarkers` | **NO — explicitly not** | Register `:353-356`: *"Re-extraction + re-MT does NOT clear it… This is a code defect, not stale data."* Confirmed live reader-visible instance at `:338-352` (`orverufraedi` m58782/m58805, 2 published pages, `og` rendered as a glossary term with an empty gloss) |
| **C16(b)** `importFromKeyTerms` | **YES — in scope of goal 2** | Register `:319`. Live HEAD_EDITOR route (`server/views/terminology.html:2115` is the caller) that parses retired `:::definition{…}`; 0 such `.md` exist. Carries a second defect (`ch`-prefixed publication path — the 4th two-conventions instance) |
| **C16(c)** `files.json` | **YES** | `server/routes/status.js:1264`, `find books -name files.json` → 0. Dead branch + phantom response field |
| **C16(d)** `for-align/` | **YES** | `find books/*/for-align -type f` → **1 file** (`.gitkeep`) |
| **C16(e)** `04-localization/` | **YES** | `find books/*/04-localization -type f` → **1 file** (`README.md`). Register `:322` — it is a **doc/reality conflict**, and fixing it means editing CLAUDE.md's § *File Permissions* table |
| **C9** — the three efni tasks | **task 2 YES, task 3 YES, task 1 becomes a PREREQUISITE** | Register `:308-312`: clearing `05-publication/` *"closes one of C9's three efni tasks as a side effect — **but** the before/after file lists **are** the old→new slug map vefur needs"*. See §3.2 — this is the sharpest risk in the whole plan |
| **item 22** (dead code, P3) | **PARTIALLY** | `importFromKeyTerms` already moved out to C16(b) (register `:435`). What remains is an undeclared glob + misc dead code, unrelated to the retired era. **New find:** `POST /api/books/:bookId/chapters/:chapter/import` (`server/routes/books.js:547-551`, `upload.array('files', 50)`, writes `.md` into `02-for-mt/`) is the **manual markdown upload** the lead names — and grep over `server/views`, `server/public`, `server/e2e`, `tools`, `scripts` finds **no caller**. Removing it also retires a `multer` upload surface and one path into the `registerFiles` UNIQUE bug (register `:74`) |
| **C7** terminology governance | **NO** | Three *governance* gaps (`I19-R1/R3/R4`, register `:417-420`) — approved-only MT priming, book-scoping, approved-translation edit policy. None is retired-pipeline legacy. Untouched |
| **C1 U3b** | **NO** | `server/data/*.json` appendices inconsistency (register `:71`). Nothing in this target touches it |
| **C4** nested-para residue | **NO, and it gets a free re-test** | Register `:96` — extract-side truncation in chem `m68710`. A re-extract does not fix it, but the re-render will show whether the residue persists |
| **P0-4** biology MC-options data op | **YES, by construction** | See §3.3 |

**Net:** the target retires **C16(b)–(e)**, most of **C9**, and **P0-4**, plus one previously
un-logged dead upload route. It does **not** retire C16(a) — the highest-severity item in C16 —
and C16(a) is the reason goal 2 is not one size.

---

## 3. Lens E ② — what CONFLICTS or gets harder

### 3.1 Goal 2's three marker families have three different fates — and the lead's wider scope changes the register's own conclusion

The register measured this per family (`:368-390`, DOM-derived, **do not re-derive with regex**):

| family | fate under a **chemistry-only** re-MT (what the register assessed) | fate under the **lead's all-five-books** scope |
|---|---|---|
| `{{i}}` / `{{b}}` | **retires corpus-wide.** 0 EN / 76 IS files, chemistry only | same — clean win |
| `{{term}}` / `{{fn}}` | **does NOT retire.** Register `:381-385`: live in *"28 EN + 28 IS files across the four books this migration does not touch"* | **retires — verified, not assumed.** Those 56 files are all inside the 245-module extracted set, so the lead's scope rewrites every one of them |
| markdown `*` `**` `__` `~` `^` `++` | **never retires by data work** | **never retires by data work** |

**⚠️ This is the one place this assessment differs from the register's conclusion, so it is
measured, not argued.** The register's "does not retire" was scoped to a *chemistry-only* re-MT.
Under the lead's scope:

```bash
grep -rl '{{term}}\|{{fn}}' books/{edlisfraedi-2e,liffraedi-2e,lifraen-efnafraedi,orverufraedi}/02-for-mt \
                            books/{edlisfraedi-2e,liffraedi-2e,lifraen-efnafraedi,orverufraedi}/02-mt-output | wc -l
# → 56   (edlisfraedi 8+8 · liffraedi 4+4 · lifraen 6+6 · orveru 10+10 — matches the register's 28 EN + 28 IS)
```

**Every one of those 56 files lives in `02-for-mt`/`02-mt-output`, i.e. inside the 245-module
extracted set the lead's scope rewrites.** A fresh extract emits `[[term:text|id]]`
(`cnxml-extract.js:339`), so the family is gone from the corpus after goal 1. The only hits
anywhere else are `books/*/corpus/*.jsonl` (**gitignored**, regenerated) and
`books/efnafraedi-2e/03-faithful-translation/ch03/m68700-segments.is.md` — **one of the 4 files
being hand-migrated anyway**, so it is covered by Step 4 rather than being an obstacle.
*(This does not mean future extraction is at risk: the ~1,000 not-yet-extracted source modules
will emit brackets when they are extracted, because they go through the current extractor.)*

The markdown family is the blocker, and the register is unambiguous about why (`:323-337`): it is
**the editor's current toolbar vocabulary**, not residue. `server/public/js/segment-editor.js:972-977`
binds Ctrl+B→`**`, Ctrl+I→`*`, **Ctrl+T→`__term__`**, `++`, `~`, `^`; `:2616` inserts glossary terms
as `__term__`; `tools/cnxml-inject.js:1484` maps `__x__`→`<term>`. **The mixed-dialect state
regenerates — the first Ctrl+T after a re-MT puts markdown straight back in.**

So: **goal 2 cannot be finished by goal 1.** The remaining work is the editor-facing tag redesign
the register prescribes at `:358-362` — make the term marker id-anchored `[[term:text|id]]`, after
which `cnxml-inject.js:1481-1485` and `hasApiMarkers` can both go. That is:
`server/public/js/segment-editor.js` (**AGPL tree, A4-deploy-gated**) + `tools/cnxml-inject.js`
(4,512 lines, the highest-risk file in the pipeline) + a data migration for edits already stored in
markdown dialect. **L, its own PR, whole-branch adversarial review.** It has no register item today.

### 3.2 🔴 The slug-map conflict is the sharpest thing in this plan

A full re-MT re-translates titles → slugs → **filenames**. Chemistry alone has **266 published
HTML files** (`find books/efnafraedi-2e/05-publication -name '*.html' | wc -l`). Regenerating
`05-publication/` from empty is correct (it is what makes the tree authoritative and closes C9
task 2), **but the old filenames exist nowhere else** — since vefur PR #200 keyed the overlay on
`data-module-id`, vefur can no longer derive them either (register `:105`).

The runbook already handles this correctly at Step 2 (`docs/plans/2026-07-29-c16-clean-break-runbook.md:103-118`)
— capture `find books/*/05-publication -name '*.html' | sort` **off-box, before clearing** — and
warns that **dev must first be level with prod's last content commit**, because prod renders into
its own `05-publication/` and the pushing cron is paused by Gate 0.

**Treat this at the same severity class as the `01-source` overwrite rule: one-way, hard to
detect, and the failure mode is "every inbound reader URL 404s with no way to build the redirect
map".** It is not enough that the runbook says so; it should be a gate the lead physically ticks.

### 3.3 P0-3/P0-4 biology onboarding — this **accelerates** it, and P0-4 comes free

P0-4 (register `:49`) is literally *"re-extract + re-MT biology's ~9 already-MT'd modules so the
6b·f-recovered multiple-choice answer-option lists land in `02-for-mt/`+`02-mt-output/` on disk"*,
annotated `0-faithful → free re-extract, cheap re-MT`. My census confirms **liffraedi-2e has 0
faithful files**, so there is nothing to preserve. A re-extract + re-MT of liffraedi-2e's 13
modules (**2,084 ISK measured**) **performs P0-4 by construction**, and P0-4 gates P0-3.

**Honest caveat — it does not clear biology's known reader-visible defects**, which are render-side:
- C13 follow-up 1 (register `:169`): 3 of 6 affected biology figures have a registered Icelandic
  image that is not being served (`fig-ch03_02_02`, `fig-ch03_04_02`, `fig-ch03_05_03`).
- C13 follow-up 2 (register `:170`): **22 latent caption leaks in `edlisfraedi-2e` go LIVE when
  that book onboards.** A re-extract does not change this. Fix it before physics ships.

### 3.4 Chemistry's accumulated QA triage is keyed to the current translation and will need re-derivation

This is the cost the lead's framing does not yet account for. These files are **not** in the
"4 modules of editorial work" and **are** human judgement:

| artifact | keyed on | survives re-MT? |
|---|---|---|
| `books/efnafraedi-2e/fidelity-allowlist.json` | `moduleId + tag + diff`, exact match; header says *"any drift → unexplained (red)"* | **36 entries, all need re-triage** |
| `books/efnafraedi-2e/residue-allowlist.json` | `moduleId + segmentId` | 4 entries, likely survive (source-derived ids) but must be re-checked |
| `books/efnafraedi-2e/render-fidelity-baseline.json` | per-chapter element counts | must be regenerated (`fidelity --update-baseline`, register `:47`) |
| `books/efnafraedi-2e/math-label-map.json` | EN→IS word list (133 entries) | **survives** — not keyed on segments |
| `books/efnafraedi-2e/glossary-supplement.json` | term list | **survives** |
| `books/efnafraedi-2e/translation-errors.json` | derived manifest, `merge=ours` | regenerates |

Budget **half a day to a day of re-triage** on the fidelity allowlist alone, and expect the
chemistry gates to go red on the first pass. That is the gate working, not a regression — but it
must not be mistaken for one at 11pm on a migration night.

### 3.5 Displacement — three things already on disk that a clean break supersedes or destroys

1. **C13's ch03+ch05 biology re-render** (register `:167`) — done on disk, **awaiting the manual
   vefur sync**. A clean break re-renders those files anyway.
2. **PR #321/#322 appendix-label re-renders** (register `:81-82`) — same posture.
3. **🔴 `02-mt-output` carries HAND REPAIRS that are in no faithful file — verified, and this is
   the one place the lead's "only two modules" premise is incomplete.** `02-mt-output` is
   nominally 🔒 READ ONLY, but `git log --diff-filter=M --oneline -- 'books/*/02-mt-output/'`
   shows repeated lead-authored edits to it. The sharpest is **`4e5be912` (2026-07-26)**:
   `liffraedi-2e` m66441's title corrected **"Fitusýrur" → "Lípíð"** — the MT had rendered
   *lipids* as *fatty acids*, a subset. Its own commit message records that it went through
   `02-mt-output` **specifically to avoid tripping the C9 rename bug**, and that the live URL is
   `3-3-lipid.html`. **A `--force` re-MT re-translates that title from English and may restore
   the wrong term — silently reverting a deliberate terminology decision *and* flipping the reader
   URL back to `3-3-fitusyrur`.** Same class: `d440b5b8` (2 hand-restored `[[docref:]]` markers,
   m68818/m68823), `7439d07e` (null-byte / degree-sign repair), `edd84811` (`{=…=}` emphasis
   repair, m68866), `827424da` (ch5 enthalpy terminology), `334d800d` (m68865 marker relabel).
   Some of these the current pipeline now fixes by itself; some are human judgement that will
   simply be lost. **Which is which is unknown — that is measurement U1b, and it must run before
   Step 3.**
   *(For the avoidance of doubt: register `:467`'s `#3(c)` m68662 preface is **open work, not
   existing content** — `02-mt-output/ch00/m68662-provenance.json` reads `"tool": "api-translate"`
   and the file has a single commit. It is not at risk; the commits above are.)*

For items 1 and 2: either sync once before the break (cheap — everything is already rendered) or
accept they ride it. Silently losing them is the outcome to avoid. For item 3, a sync does not
help — the repairs must be identified and re-applied after the re-MT.

---

## 4. Lens E ③ — prerequisites the register already flags

| Prereq | What it actually gates here | Register |
|---|---|---|
| **A2 · off-box DB backup** | **Narrower than the register implies.** The 2026-07-30 resize established that all 4 faithful files are **tracked in git**, so the *files* cannot be lost. What is **not** in git is prod's `sessions.db`: `pending`/`discuss` rows, acceptance state, `content_versions`. **Precise line: A2 gates any step that WRITES `segment_edits`** — Step 4a supersede, and Appendix A's automated re-attach. **It does not gate re-extract/re-MT of the 241 unedited modules.** That distinction is what lets work start in two days | `:305-307`, `:450`, `:241-256` |
| **A4 · manual QA walk** | Gates **deploying `server/`**. Goal 2's C16(b)/(c) fixes and goal 2's editor-marker redesign are all `server/` → they queue behind A4. **Goals 1 and 2's `tools/`+`books/` half do not touch `server/` and are not A4-gated** | `:451` |
| **Manual vefur sync** | The **only** route to readers. Nothing in goal 1 reaches a reader without it | `:47`, `[[content-sync-vefur-broken]]` |
| **C12 branch protection** | Decided force-push + deletion blocking only; **not a blocker**. But note: **no branch protection ⇒ local `npm test` from the repo root is the authoritative gate** for every PR in this work | `:218` |
| **C14 glossary dry-run** | **Should run BEFORE the re-MT, not after.** My own orverufraedi dry-run printed `Glossary: none available (continuing without)` — `api-translate.js` primes MT from `glossary-unified.json`, and the register records `lifraen-efnafraedi`'s copy as a byte-identical duplicate of chemistry's (`:185`). **The re-MT is the moment glossary quality cashes out.** The [LEAD] dry-run is already queued at `:180` — this is an ordering win, not new work | `:180`, `:185` |
| **Gate 0 of the runbook** | editorial server stopped, backup cron paused, dev level with prod's content commit | runbook `:20-51` |

---

## 5. Lens E ⑤ — ordering (dependency graph)

```
                         ┌─────────────────────────────────────────┐
[LEAD] A5: authorize     │ ~50–60k ISK re-MT spend (register :457) │
        the spend        └────────────────┬────────────────────────┘
                                          │
[LEAD] C14 glossary dry-run on prod ──────┤   (do FIRST: primes the MT)
       (register :180)                    │
                                          │
[LEAD] one vefur sync NOW ────────────────┤   (delivers C13 + #321/#322
       (or accept they ride the break)    │    before they are superseded)
                                          │
[LEAD] Gate 0: stop editorial server, ────┤
       pause backup cron, dev == prod     │
                                          ▼
                    ┌──────────────────────────────────────────┐
                    │ STEP 1  snapshot editorial state (prod,  │
                    │         READ-ONLY) — settles U1/U2       │
                    └──────────────────┬───────────────────────┘
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │ STEP 2  🔴 capture published filenames    │
                    │         off-box. ONLY moment they exist  │
                    └──────────────────┬───────────────────────┘
                                       ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ STEP 3  GOAL 1 — the clean break (dev, tools/ + books/ only)  │
   │  delete 4 faithful + 4 .locked · clear 05-publication/<track> │
   │  re-extract → re-MT (--force!) → re-inject → re-render        │
   │  ⚠️ gate on md5sum bytes, not the script summary (runbook:173) │
   └──────────────┬──────────────────────────────┬─────────────────┘
                  │                              │
                  ▼                              ▼
   ┌──────────────────────────┐   ┌──────────────────────────────────┐
   │ STEP 3b  re-triage       │   │ GOAL 2a (data half) — NOW SAFE:  │
   │ fidelity-allowlist (36), │   │ delete {{i}}/{{b}} back-compat,  │
   │ residue-allowlist,       │   │ {{term}}/{{fn}} parsing,         │
   │ render-fidelity-baseline │   │ files.json, for-align,           │
   │ (§3.4 — plan for RED)    │   │ 04-localization, markdown-upload │
   └──────────────┬───────────┘   │ route, importFromKeyTerms        │
                  │               └──────────────┬───────────────────┘
                  ▼                              │  (server/ parts → A4)
   ┌──────────────────────────┐                  │
   │ STEP 4  [LEAD] hand      │                  │
   │ re-apply of the ch03     │                  │
   │ edits, against the NEW   │                  │
   │ MT (A2 gates only the    │                  │
   │ DB-writing variant)      │                  │
   └──────────────┬───────────┘                  │
                  ▼                              │
   ┌──────────────────────────┐                  │
   │ STEP 5  [LEAD] vefur     │                  │
   │ sync + emit old→new slug │                  │
   │ map → closes C9 (2,3)    │                  │
   └──────────────────────────┘                  │
                                                 ▼
                          ┌──────────────────────────────────────────┐
                          │ GOAL 2b (L) — editor tag redesign:       │
                          │ Ctrl+T writes [[term:text|id]];          │
                          │ then delete inject :1481-1485 +          │
                          │ hasApiMarkers. FIXES C16(a).             │
                          │ Needs A4 deploy + a data migration       │
                          └──────────────────────────────────────────┘

                          ┌──────────────────────────────────────────┐
                          │ GOAL 3(b) (XL) — SEPARATE CAMPAIGN:      │
                          │ collection bundle emitter · wire the     │
                          │ RelaxNG gate (2.5–9 d, its own estimate) │
                          │ · a fidelity story that is not 36        │
                          │   hand-triaged exceptions                │
                          └──────────────────────────────────────────┘
```

**Pre-flight (add a fourth [LEAD] pre-step): time the smallest book.**
Wall-clock is bounded and reassuring but not measured. Requests are **chunked at SEG boundaries to
`DEFAULT_MAX_CHUNK_CHARS = 25000`** (`tools/api-translate.js:819` — *"modules under this size are
sent as-is"*) and rate-limited **serially at `DEFAULT_RATE_DELAY_MS = 500`**
(`tools/lib/malstadur-api.js:20`, `createRateLimiter` at `:75`). 245 modules averaging ~19.7k chars
is roughly **250–300 API calls**, not one per segment — so the rate delay contributes ~2–3 minutes
and the total is dominated by per-call latency (chunks over the 10k `SYNC_CHAR_LIMIT` go through
`translateAsync` + polling, `:292`/`:322`, whose latency the repo does not record).
**Run `time node tools/api-translate.js --book orverufraedi --force` first** — 12 modules,
177k chars, **1,770 ISK, 3.7% of the spend** — extrapolate ×27, and it doubles as a live smoke
test of the glossary priming before 34,561 ISK of chemistry goes through. This bounds the
schedule; it does not change the M sizing.

**Ordering rules that fall out of this:**

- **The three [LEAD] pre-steps (spend authorization · glossary dry-run · one vefur sync) can all
  be done today and cost nothing but time.** Doing them first is strictly better.
- **Goal 2a must come AFTER goal 1, not with it.** Deleting `{{term}}`/`{{fn}}` parsing before the
  four non-chemistry books are re-extracted breaks physics, biology, organic and microbiology
  (register `:381-385`). Sequencing it after is the whole reason the wider scope helps.
- **Goal 2b can be designed in parallel but must not be merged mid-migration** — it changes what
  the editor writes, and the editor is stopped during Gate 0 anyway.
- **Nothing here strands an editor mid-flight** provided Gate 0 runs: the editorial server is
  stopped, the only in-flight editorial state is the 4 modules, and the hand path never writes to
  `segment_edits` so a missed module keeps its rows for later (register `:252-256`).
- **Readers ARE stranded briefly** — between clearing `05-publication/` and the vefur sync, the
  rendered tree on dev is incomplete. Readers see the *last synced* content until the sync runs,
  so the exposure is staleness, not a 404 — **except** for any URL whose slug changed, which is
  why Step 2 is not optional.

---

## 6. Risks

1. **🔴 The slug map is destroyed by a single `rm -rf` and cannot be reconstructed.** 266 chemistry
   HTML files; vefur cannot derive old names post-PR #200. Mitigation exists (runbook Step 2) but
   depends on dev being level with prod's content commit first.
2. **🔴 A re-MT without `--force` silently achieves nothing while every checkbox ticks green.**
   `api-translate.js` skips modules whose `02-mt-output` file exists; all 170 chemistry files
   exist, and CLAUDE.md's own command table omits `--force`. The runbook gates on `md5sum`
   (`:173-181`) — keep that gate.
3. **🔴 The lead's "only two modules" premise IS incomplete** — `02-mt-output` holds lead-authored
   hand repairs outside every faithful file, headed by the `m66441` "Fitusýrur"→"Lípíð"
   terminology correction (`4e5be912`), which a `--force` re-MT can revert *and* whose reversal
   changes a live reader URL. §3.5 item 3. Settle with U1b before Step 3.
4. **🟠 Goal 2 will feel finished when it is not.** After goal 1, the curly families are gone and
   the greps come back clean — but `hasApiMarkers` and the markdown converters are still live and
   still mangling `orverufraedi`'s fill-in-the-blank exercises. **The confirmed reader-visible
   defect survives the migration** (register `:353-356`).
5. **🟠 Chemistry's fidelity/residue gates will go RED on first pass** (§3.4). Plan for it; do not
   debug it as a regression.
6. **🟡 `05-publication` is a WRITE directory pinned by a test.** Register `:103`:
   `server/__tests__/publicationAppendices.test.js` pins
   `getPublicationStatus(-1).mtPreview.fileCount === 13` against the chemistry appendices publish
   dir. Clearing and regenerating that tree is exactly the change that breaks it. The register
   already prescribes the fix shape (observe the directory, assert the code agrees).
7. **🟡 Elapsed time is dominated by API calls, not by code** — but the order of magnitude is
   hours, not days — see §5's pre-flight step for the arithmetic and the one run that confirms it.

---

## 7. Unknowns — and the measurement that settles each

**U1 · Is the editorial work really only the 4 faithful modules?**
**No — U1b is already answered, and the answer is "no".** Two independent holes:

**(a) UNKNOWN — prod's DB.** `sessions.db` may hold `pending`/`discuss` rows for modules that never
reached a faithful file — the register's "62 is a floor" warning read from the other side
(`:257-294`). It also notes the `.locked` markers **do not corroborate** the 4: all four came from
one dev commit `06058a0e`, and the authoritative prod `--db` run (2026-07-21) added none, so
absence of markers is not evidence of absence of edits.
**Measurement — one read-only query ON PROD:**
`SELECT module_id, status, count(*) FROM segment_edits WHERE book='efnafraedi-2e' GROUP BY module_id, status;`

**(b) ANSWERED — hand repairs in `02-mt-output`.** `git log --diff-filter=M --oneline --
'books/*/02-mt-output/'` returns **at least six** lead-authored repair commits (§3.5 item 3).
They exist; they are outside every faithful file; a `--force` re-MT discards them.
**The remaining measurement is triage, not discovery:** read each non-`api-translate` commit and
classify it *"the current pipeline now does this correctly"* vs *"human judgement that must be
re-applied"*. The `m66441` title is definitely the second kind. Budget an hour; do it before
Step 3, and carry the second-kind list into the post-re-MT checklist.

**U2 · Does the same hold for the other four books?** The register's query above is chemistry-scoped.
**Measurement:** drop the `WHERE book=` clause. If any non-chemistry module has rows, the
"0 faithful files" census understates the editorial work.

**U3 · Has any aligned-corpus export ever been distributed?** A re-extract renumbers positional
seg-ids (the register measured ~10% positional — `:225-227`; C4 at `:96` calls extract traversal
frozen for exactly this reason), which breaks the corpus join key. **Repo-side this is a
non-issue:** `git log --all -- 'books/*/corpus/'` returns **nothing** and `books/*/corpus/` is
gitignored (`.gitignore:130`), so no corpus was ever committed. **What the repo cannot tell me** is
whether a corpus file was ever emailed or handed to a researcher. **Measurement: ask the lead.**
If one was distributed, its join key is unrecoverable after the re-extract.

**U4 · What does OpenStax actually require for a contributed translation?** Goal 3(b)'s acceptance
criteria are not ours to define — repo layout, licensing metadata, review process, whether they
accept module-level or collection-level contributions. **Measurement: this is a conversation with
OpenStax, not a repo query,** and it should happen *before* any bundle emitter is designed. It is
the strongest argument for making goal 3(b) its own campaign rather than a phase of this one.

**U5 · Are the 139 legacy-shape segments in the C16(a) inspection list actually corrupted?**
Register `:315-317` calls it *"a starting set, not a defect count"*, concentrated in 9 modules.
**Measurement:** diff the 9 injected modules' `03-translated` output against what a converter-free
inject would produce. Cheap — the module list is short — and it sizes goal 2b's urgency.

---

## 8. The answer to "is it achievable in a reasonable timeframe?"

**Yes for goals 1 and 2a — and the next heavy session can start on them.** The runbook exists, the
tooling is built and committed on `feat/c16-segment-edit-reattach`, the cost is measured, the
editorial work to preserve is 4 git-tracked files, and A2 gates only the DB-writing variant the
resize already made optional.

**No for goal 3(b) as part of this.** It is new capability with an external stakeholder, an
unwired gate carrying its own 2.5–9 day estimate, no bundle emitter at all, and a fidelity story
that today is 36 hand-triaged exceptions in one book. Folding it in would turn a one-week
migration into an open-ended one.

**Goal 2b (the editor tag redesign) is the one to decide consciously.** It is the only path to the
confirmed reader-visible C16(a) defect, it has no register item, and it is `server/` work behind
A4. Left undecided it will look subsumed by goal 1 and quietly not happen — which is precisely the
evaporation pattern the closure audit named.

**Before the next heavy session, four things cost almost nothing and unlock everything:** run the
two prod queries in U1/U2, audit `02-mt-output`'s non-`api-translate` commits (U1b — this is what
settles whether the m68662 preface work is about to be destroyed), time `orverufraedi` (§5
pre-flight, 1,770 ISK), and run the C14 glossary dry-run.
