<!-- FROZEN EVIDENCE — banner-dated 2026-08-17. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. If it disagrees with the active register, THE REGISTER WINS. -->

<!-- Produced 2026-08-17 to answer two [LEAD] questions: what it would cost and buy to expand
     to the COMPLETE organic chemistry textbook, and whether diffing published openstax.org
     content is a usable debugging oracle. Five read-only investigation lanes + synthesis;
     6 agents, 300 tool calls. The repo was not modified: `git status --porcelain` returned
     0 lines at start and finish.
     ⚠️ Numbers are marked [M] measured / [D] derived / [E] estimated INLINE. Do not quote one
     without its marker, its counting unit, or its scope. -->

# Decision brief — full organic chemistry, and the OpenStax oracle

Prepared 2026-08-17 from five measured lanes. Every number carries its counting unit and scope.
Confidence is marked inline: **[M]** measured, **[D]** derived (arithmetic over measured inputs,
method shown), **[E]** estimated (assumed rate, inputs shown).

---

## Bottom line

**Q1 — Full organic.** Machine translation is cheap and is not the constraint: finishing all 342
source modules costs **≈22,505 ISK on the `--dry-run` basis / ≈18,400 ISK billed-equivalent**, on top
of what has already been spent (**≈8,400 ISK dry-run basis / ≈5,500 billed-equivalent**) — organic is
**0.70× chemistry's size** like-for-like despite having 2.30× the modules. What that buys is a
**complete 342-module textbook plus a 1,961-exercise track no other book in the repo has** — already
translated, current-vintage and paid for, and today serving a 17-module preview. The real cost is
**10,608 segments of human review**, against a project that has applied **368 segments, ever, across
all books**, most recently 55 days ago. Expansion also inherits **four reader-visible media defects**,
one of which (`m00309`, publishes the *wrong image*) is not in the register and passes every
committed check. And organic is **CC BY-NC-SA 4.0**, not CC BY — the finished translation cannot be
used commercially and must be shared alike.

**Q2 — Diffing against openstax.org.** Yes, narrowly, and vintage resolves in its favour:
**1,055 of our 1,192 source modules (88.5%) are byte-identical to the CNXML OpenStax publishes
today** (organic 330/342, chemistry 116/149), so on that subset a diff is a genuine same-vintage
measurement. But the oracle's *unique* contribution is exactly one thing — **construct→presentation
conventions**, which none of our three existing checks has an external reference for — and a full
contextual audit of chemistry costs **18 page fetches**. Build the narrow one-shot audit; do **not**
build a recurring gate or anything scored by similarity. Two cheaper things beat it on value per
hour, including one live discovery: **`tools/check-openstax-errata.js`'s API works today** despite
the tool's own docstring saying it 403s.

---

# Q1 — What full organic costs, and what it buys

## Three premises in the framing were wrong

1. **"We already bought 17 preview modules."** Their committed extraction predates the alt work, so
   the 17 are **superseded, not banked**: 116,573 chars committed vs 133,976 at current vintage
   (+14.9%), and 0 alt segments in them against 100 in a fresh extract of the same 17 [M]. Re-buying
   costs **1,340 ISK** and needs `--force`.
2. **"Id-less alt is wasted spend."** Organic's media are id-less at **100% (0 of 2,163 alt-bearing
   `<media>` carry `@id`)** — but **1,911 of 2,163 (88.3%) are anchored by an enclosing
   `<figure>@id`**, which is the key the write-back looks up, and a sentinel sweep on shipped `main`
   shows **1,918 of 1,918 emitted alt segments reach the injected output** [M]. Nothing is
   structurally unrecoverable here. ⚠️ Scope, applied symmetrically with the §C89 lesson below: that
   was measured **at inject**, with synthetic sentinel tokens. It proves the write-back path can
   address those media; it does **not** prove a real purchased translation reaches published HTML —
   `05-publication/` was not read and no live content file was fetched.
3. **"Alt is already paid for."** **Neither** organic **nor** chemistry has ever bought a single
   figure-alt translation — zero alt segments exist in any committed `02-for-mt` or `02-mt-output`
   file on today's `main` [M, with the positive control that the same census finds 21,536 SEG
   markers in the chemistry files where alt is 0]. Alt is an unpurchased line in both books.

## MT spend

**Rate provenance — settled, not implied.** 10 ISK / 1,000 chars (`ISK_PER_1000_CHARS = 10`,
`tools/lib/malstadur-api.js:30`, "lead-confirmed 2026-06-30"), test-pinned, **and independently
corroborated by the API's own `usage.cost` field across four recorded paid runs — all exactly
0.01 ISK per unit**, with non-circularity proven (one run predates the constant's correction and
its reported cost is exactly 2× our then-estimate) [M].

**What is *not* settled is the counting base.** Málstaður does **not** bill the `<!-- SEG:… -->`
marker lines, which are ~22% of a segment file. On one reconstructed paid run: raw 114,770 chars →
API-reported **89,282 billed units**; the model `raw − marker lines − 1 newline/segment` predicts
89,397 (**+0.13%**), corroborated on a second run [M]. So `--dry-run` and every whole-file estimate
in the register overstate by **~26%**. The model is an empirical fit, not a documented billing rule
— treat the whole-file column as a **ceiling** and the billed column as the **expectation**.

### Organic, complete book (342 source modules + the 1,961-exercise track)

| Line | Unit | `--dry-run` basis (ceiling) | Billed-equivalent (expected) |
|---|---|---|---|
| CNXML track, 342 modules | chars → ISK | 2,250,469 → **22,505** [M] | 1,836,067 → **≈18,361** [D] |
| Exercises track, 31 files / 1,961 exercises | chars → ISK | 724,405 → 7,244 [M] | 443,838 → 4,438 [M] |
| **Single pass, whole book** | | **2,974,874 → ≈29,749** | **≈2,279,900 → ≈22,800** |

The billed CNXML figure [D] = segment text (1,825,459 chars) + 1 newline per segment (10,608
segments). The identical method reproduces the cost lane's own published chemistry figure exactly
(3,268,222 + 22,466 = 3,290,688), which is why I trust the derivation.

### Purchased vs remaining

| | `--dry-run` | Billed-equiv |
|---|---|---|
| Spent on organic to date (50 provenance files, all `"tool": "api-translate"`) | 8,412 ISK [M] | ≈5,494 ISK [M] |
| — of which **durable** (exercises + 2 chapter-title files; 1,961/1,961 ids covered, both directions checked, current vintage) | 7,246 ISK | ≈4,438 ISK |
| — of which **superseded** (the 17 preview modules, 13.9%) | 1,166 ISK | ≈1,056 ISK |
| **Remaining, all 342 at current vintage** | **22,505 ISK** | **≈18,361 ISK** [D] |
| Remaining if you leave the 17 stale (325 modules) | 21,165 ISK | — |

**Recommendation: re-run all 342.** The 6% premium (1,340 ISK) buys the 17 modules' 100 alt segments
and removes a two-vintage split that §C82's quarantine rules would otherwise have to carry.

**Floor caveats — these are real spend that no estimate above contains** [M]:
glossary characters sent alongside each chunk; the truncation retry, which re-sends a whole chunk
without the glossary and is therefore **billed twice** (bounded by chunk count — it did not fire in
the run I could reconstruct); and the §C82 both-arms glossary run (~400 ISK across two books).
**No Miðeind invoice has ever been compared against the API's self-reported cost** — every ISK
figure here is the API's accounting, not a receipt.

**One outlier worth a separate decision** [M]: `appendices/m00226` is the book's **Glossary** —
130,018 chars, **5.8% of the whole remaining CNXML spend**, of which 689 segments (96,197 chars) are
`item`-type head-term/definition pairs being priced as prose through the MT, in a project that
already runs a concept/terminology model. Median module is 4,907 chars; the mean (6,580) is
misleading.

## Engineering debt inherited

**Blocks a full run — 4 reader-visible media defects** (unit: modules; chemistry control = 0 of 149
imbalanced in the same sweep):

| Module | Defect | Status |
|---|---|---|
| `ch28/m00309` | **Publishes the WRONG IMAGE** — injects the commented-out `OChem_28_00_Retrievers.jpg`, drops the live `OSX_OrgChem_28_00_Afghans.jpg`. | **New — not in the register.** Outside the preview, so expansion is what activates it. |
| `m00032` | One `<image>` dropped (36→35). | Register-owned; already the preview blocker. |
| `m00023`, `m00046` | Image **duplicated** — reader sees it twice. | Today tolerated *only because* they are out of preview. Expansion promotes them to in-scope. |

`m00309` matters beyond itself: it is 1-image-in / 1-image-out, so the committed round-trip pin
reports `ok: true` and it appears in neither `loss` nor `gain`. Root cause is **extract-side** —
`tools/cnxml-extract.js:253` does a first-match regex `/<image([^>]*)>/` on raw text and cannot see
that its match is inside an XML comment — so the wrong `src` is baked into `02-structure` and inject
faithfully rebuilds it. It reproduces at three vintages, so it is shipped and pre-existing. The
sibling `m00198` has the identical shape and is correct **only by ordering luck** (live image first)
[M]. Class census with `grep -ralU`: 2 of 342 organic, 0 of 149 chemistry, 0 of 283 physics, 0 of 259
biology, 0 of 159 microbiology — the two hits are the positive control that makes the four zeros
mean something.

**Sizing that debt — "4 defects" is not yet a bounded bill.** `m00309`'s root cause is identified and
the code change is small (one comment-blind regex), but the fix re-bakes `02-structure`, i.e. it is a
**re-extract** — which voids the 12 residue-allowlist entries noted below, so it must be sequenced
with the re-MT rather than shipped alone. **`m00032`'s code path is untraced** [UNKNOWN]: the
structural trigger is identified (one table `<entry>` holding both a `<media>` and a `<para>`) but the
failing branch in the injector's table handling is not, so one of the four defects is unsized. Settle
it by tracing `buildTable`'s mixed-content entry case before committing to a full-book date.

**Tolerated residuals — do not block, but price them in:**

- **245 unreachable alt attributes** (11.3% of organic's 2,163), all one shape (`entry-not-in-figure`)
  [M]. Never extracted → never billed → **not waste, a coverage gap**: those figures stay English.
  ⚠️ **Hazard:** if §C88's emitter tasks land *unscoped*, organic silently jumps 1,918 → 2,163
  emitted alt segments — newly billed, and in the one structural position with **no anchor at all**
  (0 of 245 have either a media `@id` or a figure `@id`).
- **`m00033`'s 9 reproducible invented markers** (9/9/9 across three fresh runs). The unwrap fix is
  merged; the register deliberately keeps this as a live positive control for the check battery.
- **Re-extract friction**: organic's `residue-allowlist.json` holds 12 segmentId-keyed entries that
  a re-extract voids wholesale — 12 pieces of manual editorial judgement to redo [M]. Alt segment ids
  are mostly stable (1,901 of 1,918 source-derived, inheriting `figure@id`), but non-alt `auto-N` ids
  shift wholesale when a segment is inserted.
- **Everything after MT is greenfield**: `03-faithful-translation/`, `04-localized-content/` and
  `tm/` **do not exist** for this book (chemistry has all three) [M]. Note the standing rule: TM
  auto-regen needs a per-book licence row, and a missing one fails **silently** on the cron.

**Structurally unrecoverable spend: essentially none.** The one genuine gap is unbudgeted rather than
wasted — organic's **exercise images carry 2,375 non-empty alt attributes / 288,603 English chars**
(~2,886 ISK if ever bought) that no census counted and that reach no segment file today [M]. Nothing
extra gets spent; exercise image alt simply stays English.

## Editorial / human cost — the dominant term

| Measure | Value | Unit / scope |
|---|---|---|
| Full organic burden | 342 modules / **10,608 segments** / 1,825,459 chars | source modules; segments as the editor sees them [M] |
| Chemistry, for comparison | 149 modules / 22,466 segments | organic is **47% of chemistry's segment burden** despite 2.3× the modules [M] |
| Delivered to date, **all books, all time** | **4 applied faithful modules / 368 segments**, all chemistry | git-tracked `03-faithful-translation/`; last written **2026-06-23**, 55 days ago [M] |
| Pass 2 localization | **zero content files, ever** | repo-wide [M] |
| Only observed cadence | 368 segments in 11 days = 33.5 segments/day, project-wide | → full organic ≈ **317 days** at that calendar rate [D] |
| Only hands-on rate | 12 edits in 431 s, median 24 s/edit (~100 edits/h) | **n=12, one editor, one module**, 6 of them short table cells; seconds per *changed* segment inside a burst [M] |
| MT post-edit intensity | **17.5%** of segments changed (63/360) | **n=4 self-selected, most-worked, hand-repaired modules** — survivorship, not a sample [M] |
| → head-editor decisions on full organic | ≈1,856 | 10,608 × 17.5% [D] |
| Review load | 1–2 humans per changed segment; SLA is 2/3/5 days and the only real queue has sat **161 days** | [M] |

**[E] Person-hours.** Full organic: **99–286 person-hours** (10,608 segments × an *assumed* 30/60/90 s
read-and-decide, plus 1,856 head-editor decisions × an assumed 20–40 s) = **20–57 h per editor across
five**, i.e. 3–8 working days each. The currently approved organic **preview** is 643 segments =
**5–16 editor-hours + 1–2 head-editor hours**. Excludes Pass 2 entirely, excludes any head-editor
read of unchanged segments (if head editors review whole modules the review half roughly doubles),
excludes onboarding and terminology adjudication. **No repo artifact gives seconds per reviewed
segment** — the throughput roadmap poses "can ~5 editors get through ~150 modules per book?" as its
own motivating question and never answers it [M].

So raw hours are **not** prohibitive. Sustained engagement is the question, and the 55-day freeze is
the evidence.

## What the project gets

- A **complete** Icelandic organic chemistry textbook: 342 modules plus a **1,961-exercise track that
  no other book in the repo has** — and which is already 100% translated, current-vintage, and paid
  for. Today that asset serves a 17-module preview [M].
- **Better shape for this project's workflow than chemistry.** Median organic module is 4,907 chars /
  17 segments against chemistry's 25,039 / 120 [M] — genuinely one-module-per-session sized, and far
  easier to deliver incrementally. Carry the corollary too: scheduling intuitions imported from
  chemistry will be badly wrong.
- **Cheap relative to the flagship.** Like-for-like, organic is 0.70× chemistry (2,974,874 vs
  4,262,149 chars) [M].

## Licence — the asymmetry that must not be inherited

`books/lifraen-efnafraedi/book-config.json` → **CC BY-NC-SA 4.0**, obtained 2026-03-23 [M]. Organic
is one of only two NonCommercial/ShareAlike books here (with College Physics); chemistry is CC BY 4.0.

Every derivative of organic — the faithful translation, the localized content, the published HTML —
inherits **both** NonCommercial **and** ShareAlike. Practically: no commercial course packs, no paid
LMS bundling, no sale; and any redistribution must be under the same licence. It **cannot** be
covered by a repo-wide or book-agnostic CC BY statement — exactly that over-grant, naming exactly
Organic Chemistry and College Physics, was the pre-publication audit's blocking finding. Going from
17 modules to 342 multiplies the surface on which such an over-grant could be published ~20×, so the
full-book run must verify per-book licence rendering rather than inherit it.

## The single thing that most changes this answer

**Whether editors have throughput that nothing measures.** `segment_acceptances` — the record that a
human read an MT segment and confirmed it as-is, the cheapest and highest-volume editorial action the
product offers, with a rapid-accept keyboard flow built for exactly that — is read by **one service
and nothing else**: no dashboard, no workload, no velocity, no review-queue code. The only throughput
instrument (`getEditorWorkload`) counts `segment_edits` rows only [M]. So the project cannot today
distinguish *"editors have almost no throughput"* from *"throughput is flowing through a table nobody
counts"*, and every delivery number above is a floor of unknown tightness.

**Settle it with one read-only production query** (seconds, no cost):

```sql
SELECT COUNT(*), COUNT(DISTINCT accepted_by), MIN(accepted_at), MAX(accepted_at)
FROM segment_acceptances;                     -- and the same GROUP BY book
SELECT COUNT(*) FROM segment_edits;           -- floor is ≥169 rows, true total unknown
```

**Then buy the rate you don't have.** Editors return at semester start — derived as ~2026-08-15 from
"~5 weeks" written on 2026-07-11, so roughly now; the repo records **no calendar date anywhere** [D],
which is worth writing down once since a lead deadline (C9) is now overdue against it. A **10-module
organic pilot** during the first weeks of term costs **0 ISK** and yields the one input the whole
decision turns on: real seconds per *reviewed* segment, from the inter-event intervals of
`segment_edits.created_at ∪ segment_acceptances.accepted_at`. Decide the other 332 modules after that.

---

# Q2 — Would diffing against openstax.org help debug the pipeline?

## Vintage first — it resolves favourably, but only because a filter is available

**You can always tell which vintage you are looking at, and you can never ask for a different one**
[M]. The published page carries `"contentVersion":"3be4b60"`, which **is** the upstream git SHA
(verified equal to `osbooks-chemistry-bundle` main HEAD `3be4b60ff501…`). Every attempt to pin an
older vintage 404s — with slug-200 / nonsense-slug-404 controls in the same command, so the 404s are
real.

That makes a **sha-based drift filter** the thing that gives the oracle any meaning. Fetch upstream
CNXML at `main`, compare bytes to `01-source`:

| Book | Undrifted / total source modules |
|---|---|
| lifraen-efnafraedi | **330 / 342** |
| edlisfraedi-2e | 232 / 283 |
| liffraedi-2e | 224 / 259 |
| orverufraedi | 153 / 159 |
| efnafraedi-2e | **116 / 149** |
| **Total** | **1,055 / 1,192 (88.5%)** [M] |

Byte controls: 13 undrifted modules expected MATCH, all matched; 6 drifted expected MISMATCH, all
mismatched.

**On the undrifted subset, a diff is a genuine same-vintage measurement.** On the drifted subset every
diff is exactly the ambiguity you feared — "our bug" vs "their edit" — and is worthless without
per-module adjudication. Two scope caveats: "openstax.org publishes upstream `main`" is verified for
**chemistry only**; the other four books' counts assume it (one page fetch each settles it). And treat
**physics as off-limits** — 47 of its 51 drifted modules changed *structure*.

## What already exists

- `server/services/openstaxFetcher.js` — 44-book repo map, hardened fetcher. Its host allowlist is
  github.com/githubusercontent.com only, so it **cannot reach openstax.org** — but the drift filter
  above is literally its existing job [M].
- **The join keys are free.** The published page's div is `id="page_<our md:uuid>"`, and the
  uuid→slug map is a regex over the TOC **already embedded in a page you have downloaded**: 127 of
  149 chemistry modules resolve, with two known-correct and one fabricated-uuid control [M]. There is
  no mapping project to fund.
- 🔴 **`tools/check-openstax-errata.js`'s API works today**, contradicting the tool's own docstring,
  `--help` and error path (all four say it 403s and needs a manual DevTools import). Measured live:
  HTTP 200, 1,033,833 bytes, **910 errata records** for Chemistry 2e; 885 carry a `corrected_date`;
  **78 corrected on or after our 2026-01-19 copy date** (62 "Approved"); latest 2026-07-08, which
  matches the last upstream commit batch exactly. The committed log has never been populated
  (`lastFetched: null`) [M]. ⚠️ The **endpoint** is verified; the **tool** is not — its
  normalize/merge path has never run on real data, and it writes under `books/`.

## What the oracle catches that the three existing checks do not

All three current checks compare our artifacts to **our own** artifacts: `cnxml-fidelity-check.js` is
CNXML→CNXML tag counts; `cnxml-render-fidelity-check.js`'s sensitive detector is a baseline minted
from our own output (its own header warns it must come from a clean render "or it blesses the bug");
the RelaxNG gate would have caught **0 of the 37** known fidelity gaps. **None of them holds an
external statement of what a CNXML construct should look like rendered** [M].

That is the oracle's whole unique contribution, and it is worth having: what a `<note
type="chemistry">` becomes visually; **what number a reader sees** on a figure / table / equation (we
have a live two-conventions bug class, and appendices carry no section number); what lands on the
section page versus a rollup; which anchors survive.

It already produced a hit on the **first** undrifted module tried (`m68702`): OpenStax retains **5
CNXML `@id` values we drop** — `para-00001`, `list-00001`, and three `<media>` ids — and retains none
that we keep, a strict subset (source 183 distinct ids; they keep 111, we keep 106) [M]. Severity is
**UNKNOWN** and must be traced before it is acted on: it depends on whether vefur re-derives anchors
(its overlay has keyed on `data-module-id` since its PR #200) or passes ours through.

## What it cannot catch — and one trap

- **Anything translation-quality.** The two documents differ by language by design.
- **Values, text, alt, ids as *content*** — all better served by `books/*/01-source/`, offline, at
  guaranteed-correct vintage and zero network.
- 🔴 **Do not build a similarity-scored diff.** Its signal points the *wrong way* on the defect class
  this project most cares about: our currently-published alt on `m68702` is still English and
  **byte-identical to OpenStax's**, so a similarity score rates that page *more* correct exactly
  where the discarded-alt-translation defect is live [M].
- **The cheaper check that falls out of that trap**, and needs no network at all: an **EN-residue scan
  of the published artifact, referenced against `01-source`**. `tools/lib/residue-scan.js` compares
  `*-segments.en.md` to `*-segments.is.md` — segment pairs — so it is structurally blind to a
  translation that was produced correctly and then discarded at inject, which is precisely the §C89
  shape.

## Build cost

- **18 page fetches** for a full *contextual* construct audit of chemistry: a greedy set cover over
  the 123 distinct parent>child contexts present in the 116 undrifted chemistry modules, 0 uncovered
  [M]. The flat cover — 37 constructs — is only 2 modules, and **that gap is the warning**: every bug
  this repo has actually shipped was contextual (figure inside para inside example/note), not a
  missing element type, so a 2-module "we covered every construct" audit would be the
  generalised-past-its-coverage error.
- **To build**: an openstax.org fetcher (a new host → a deliberate allowlist decision, not a config
  tweak) and a construct normaliser mapping our HTML classes ↔ their `data-type`/native tags ↔ CNXML
  element names. **[E] roughly one day**, with the mapping and the join keys already free.
- Instrument caution to carry into the build: the lane's own first pass counted OpenStax constructs
  by `data-type` alone and reported figure 3→0, table 1→0, list 2→0 — those zeros were the
  instrument (REX emits `data-type` only for constructs with no native HTML equivalent). And the
  demo established **count agreement on one module** and exercised **none** of the 123 contexts the
  audit is actually about.

## Recommendation

**Build the narrow version, once — not a gate.** A one-shot, 18-fetch construct-convention audit over
the undrifted chemistry subset, plus the sha drift filter (which `openstaxFetcher` nearly is already).
A **recurring** gate is the wrong shape: our copies are frozen and openstax.org publishes their moving
`main`, so drift only grows and the gate's red increasingly means "they edited", not "we broke it".

**Do these two first — both beat the audit on value per hour:**

1. **Point the errata tool at the live endpoint.** 78 records already corrected upstream since our
   chemistry copy date, and the feed answers "what changed upstream and does it matter" better and
   far more cheaply than any HTML comparison. Verify the tool's own normalize/merge path before
   letting it write under `books/`.
2. **EN-residue scan of published output against `01-source`.** No network, catches the §C89 class,
   and covers the one thing the similarity oracle would have scored backwards.

---

## Two off-lane items worth logging

- `ch05/m68727` (chemistry) emits 5 alt segments where `altReachability` counts 6 reachable, so
  `checkAltCoverage` returns `ok: false` for **1 of 149** chemistry modules — measured against a
  fresh extract at current `main`, not against committed `02-for-mt` (where the check is vacuous,
  since alt is 0 everywhere) [M]. If a chemistry re-extract gates on that check, this module fails it.
- `docs/audit/b1-glossary-probe.mjs:52` still computes ISK at `chars * 5 / 1000` — **half** the
  authoritative rate — in a file whose own header warns it makes live paid API calls. Quoting it
  understates spend 2× [M].

## Where the project's own recorded numbers disagree

- **Chemistry alt: 782,096 vs ~692,000 chars — a ~90,000-char gap that is UNITS, not error.** 782,096
  is *all* 1,149 alt attributes in the source; ~692,000 is only the 952 the extractor can **reach**.
  Same distinction for organic: 329,119 total vs 303,200 reachable. The register's 7,969 ISK alt line
  priced *every* attribute, including the 17–24% never extracted — which is why it re-derives down to
  7,058 ISK on the billed, reachable-only basis.
- **Organic's alt characters, two instruments**: 303,191 vs 303,200 reachable (9 chars apart), and
  chemistry's 691,359 vs 691,846 (487 apart) — agreement to <0.1%, attributable to entity decoding.
  Both are reported; neither is averaged.
- **Organic's MT cost**: ≈29,749 ISK (whole-file) vs ≈22,800 ISK (billed-equivalent) is **not** a
  disagreement — it is two counting bases, and the table above keeps them in separate columns
  deliberately. The register's own ~51,640 ISK in-scope budget reproduces to −0.8% on its own
  whole-file basis; only the base is wrong, by ~26%, which is why ~51,640 should be kept as the
  ceiling and ~38,400 quoted as the expectation for the currently approved scope.

---

*Brief also saved at `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/6f742c16-4311-4f8c-9cfb-66b2a58b3234/scratchpad/DECISION-BRIEF-organic-and-openstax-oracle.md`. Repo untouched: `git status --porcelain` returned 0 lines at start and at finish.*