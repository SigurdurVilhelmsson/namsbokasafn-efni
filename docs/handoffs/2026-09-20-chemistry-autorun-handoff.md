# Chemistry autorun — handoff for an UNATTENDED session

**Written 2026-09-20.** Everything a fresh session needs to finish the machine translation of
`efnafraedi-2e` without this conversation.

## ⚖️ The authorisation, in [USER]'s words

> *"I approve an unattended run to finish the machine translation for efnafraedi-2e in a new session."*
> — [USER], 2026-09-20

**Scope: `efnafraedi-2e` only** — ch09 … ch21, **plus the appendices: [USER] added them to scope on
2026-09-20** when asked (they were not named in the original authorisation, so they were put as a
question rather than assumed). ch00, ch01, ch02, ch03–ch07 and ch08 are already bought and prepared.
**Budget: ~27,400 ISK at list price** for the remaining text (~20,000–20,500 billed at the observed
0.68–0.75×), plus 30–100 ISK of figures per chapter, plus a per-module retry (180–610 ISK) when one
is needed. **The loop still ends at PREPARED — no session runs a sync.**

## 🔴 CORRECTED 2026-09-20 — the paid-MT hook DOES NOT GATE THIS DRIVER, and nobody had to clear it

This section used to read: *"`.claude/hooks/guard-paid-mt.mjs` returns `permissionDecision: "ask"`
for every `api-translate` run, which an unattended session cannot answer. **[USER] must clear that
path for this book before the run starts**. If the hook still asks, the run stalls at chapter 9 and
nothing is lost."*

**Measured, both command shapes, before ch09 was bought — the premise is false.** The hook is wired
in `.claude/settings.json` behind a shell `case` matching the **tool-call payload string** for
`*api-translate*`. The documented command is `bash scripts/chemistry-autorun-chapter.sh 9 "…"`,
which contains no such substring, so the case never matches and the guard never runs.
`api-translate` is invoked as a **child process inside the script**, and a PreToolUse hook fires on
Bash **tool calls**, not on grandchildren.

- Direct form (`node tools/api-translate.js …`) → the guard fires, usefully: it reported
  *"8 of 8 segment file(s) in ch09 predate the extractor"*, which the pre-run re-extraction then
  discharged to *"0 of 8"*.
- Driver form → passes straight through, ungated.

▶ **So the run needed no clearing, and ch09 proceeded on [USER]'s written authorisation alone.**
⚠️ **But the spend guard does not cover the command it was written for.** Do not treat a driver run
as confirmed-by-hook. That gap belongs to the session that owns `.claude/hooks/` (untracked, another
session's uncommitted work — **never `git add` it**); it is recorded here, not fixed here.

▶ **The general lesson, which is the durable half:** a guard's *existence* is not its *coverage*.
This one was written, tested against the shape it was written for, documented as blocking — and was
inert against the only invocation anyone was going to use. Pair every guard with a test of the
command line people will actually type.

## The command per chapter

```bash
bash scripts/chemistry-autorun-chapter.sh <N> "<that chapter's subset>"
```

It runs: re-extract → pre-buy scan → buy text → buy figures → inject → render → `generate-index` →
the free checks, and prints one compact summary ending in `DONE=ok` or `DONE=stopped`.
Logs land in `pipeline-output/autorun/` (gitignored). **Each chapter takes 30–60 minutes**, almost
all of it the figure run; run it in the background and poll for the summary.

### The subsets, already curated for sense

🔴 **SUPERSEDED 2026-09-21 — DO NOT COPY THE SUBSETS BELOW. THEY ARE THE DEFECT, NOT THE GUIDE.**
The instruction here used to read *"Do not widen these"*, and widening them is exactly what was
needed. The curation allow-listed against substring false positives and in doing so **dropped
approved terms the chapters needed**, after which the MT drifted away from house terminology:
`buffer` → the model said *jafnalausn*, not **stuðpúði**; `catalysis` → *hvörf* (= reactions), not
**hvötun**; `polyprotic acid` → *fjölróteindasýra*, not **fjölvirk sýra**; `conjugate` →
*samtengd*, not **samoka**; `unit cell` → *einingarfruma* (67×) AND *einingarhólf* (10×), never
**grindareining**.

⚠️ **AND THE JUSTIFICATION BELOW CONTAINS A FALSE PREMISE.** It says ch10's `cell` is
*"118× unit cell (already `grindareining`)"*. **ch10's MT contains ZERO `grindareining`.** The
first half is right — `cell → ker` really would be wrong inside *unit cell* — but the remedy was
to exclude the SHORT headword and include the MULTIWORD one, which cannot substring-collide. The
curation excluded both. ▶ *The plan says X* is a hypothesis to execute, never a finding.

✅ **USE `tools/compute-glossary-subset.js` INSTEAD** (`2c7677f26`), which derives a chapter's
subset from measurement and reports its evidence:

```bash
node tools/compute-glossary-subset.js --book efnafraedi-2e --chapter <N> --explain
```

⚠️ **Its output is a CANDIDATE, not an answer.** It cannot see wrong-sense homographs — `learning`,
`case`, `row`, `box` survive its rules — and CLAUDE.md says only domain knowledge finds those.
**Audit the candidate before it reaches the paid wire**, and pass anything a human has ruled out
with `--exclude`.

The original curation, kept below as the historical record of what was bought for ch09–ch15:

```bash
bash scripts/chemistry-autorun-chapter.sh 9  "enthalpy,enthalpy change,torr"
# ch10 carries the ONE key term the pre-buy scan flagged across all 13 chapters:
# `hydrogen bonding` (21 segments, no glossary row). ⚖️ [USER] ruled 2026-09-20: NO glossary
# action. §C73's unprompted control settles it — the existing MT already renders it `vetnistengi`
# (×23) with correct Icelandic inflection (vetnistengja / -tengjum / -tengið / -tengin), 47 hits,
# zero English residue, and `hydrogen bonds` already has an approved chemistry row. The driver
# HALTS on an unruled flag now, so the ruling is passed in explicitly rather than ignored silently:
AUTORUN_RULED_TERMS="hydrogen bonding" \
bash scripts/chemistry-autorun-chapter.sh 10 "enthalpy,enthalpy change,hole,dispersion force,Lewis structure,Lewis"
bash scripts/chemistry-autorun-chapter.sh 11 "enthalpy,enthalpy change,torr,carbonate,hydroxide,alcohol"
bash scripts/chemistry-autorun-chapter.sh 12 "enthalpy,enthalpy change,elementary reaction,reaction mechanism,reaction order"
bash scripts/chemistry-autorun-chapter.sh 13 "enthalpy,enthalpy change,group,carbonate"
bash scripts/chemistry-autorun-chapter.sh 14 "enthalpy,enthalpy change,hydroxide,pOH,group,carbonate,electronegativity"
bash scripts/chemistry-autorun-chapter.sh 15 "enthalpy,enthalpy change,Lewis,hydroxide,carbonate,group,Lewis structure"
bash scripts/chemistry-autorun-chapter.sh 16 "enthalpy,enthalpy change,microstate"
bash scripts/chemistry-autorun-chapter.sh 17 "enthalpy,enthalpy change,cell,cell potential,galvanic cell,hydroxide"
bash scripts/chemistry-autorun-chapter.sh 18 "enthalpy,enthalpy change,Lewis,group,Lewis structure,hydroxide,carbonate,representative metal,resonance,hybridization,electronegativity,resonance form"
bash scripts/chemistry-autorun-chapter.sh 19 "enthalpy,enthalpy change,group,central metal,carbonate,hydroxide,Lewis"
bash scripts/chemistry-autorun-chapter.sh 20 "enthalpy,enthalpy change,ether,alcohol,Lewis,Lewis structure,carboxylic acid,ketone,carbonyl group,hybridization,resonance,resonance structure"
bash scripts/chemistry-autorun-chapter.sh 21 "enthalpy,enthalpy change,radioactive decay,chain reaction"
# Added to scope by [USER] 2026-09-20. 13 modules, 162,668 chars, ~1,627 ISK at list.
# ⚠️ The driver could NOT have run this before 2026-09-20: `printf 'ch%02d' appendices` yields
# `ch00`, so every verification step would have checked the PREFACE and reported green. Fixed.
bash scripts/chemistry-autorun-chapter.sh appendices "enthalpy,enthalpy change"
```

**Measured prices at `13b38eaa3` (dry-run, list):** ch09 2175 · ch10 2772 · ch11 1813 · ch12 2188 ·
ch13 1287 · ch14 2129 · ch15 1357 · ch16 1237 · ch17 1399 · ch18 3132 · ch19 2052 · ch20 2099 ·
ch21 2114 · appendices 1627 = **27,381 ISK**. ch09 billed **0.79×** its estimate.

⚠️ **Re-derive rather than trust this block** if a chapter's English has moved: the driver runs
`--pre-buy` itself and prints any key term with no row in 20+ segments. **A new such term is a STOP**
— it is a [USER] ruling, and ruling it after the buy is what costs a re-purchase.

## After each chapter

1. **Read the summary.** `DONE=stopped` means do not commit; diagnose and ask.
2. **Redirect rows** for any renamed page → append to
   [`2026-09-20-vefur-chemistry-autorun-redirects.md`](./2026-09-20-vefur-chemistry-autorun-redirects.md).
   These must reach vefur **before** the next chemistry sync.
3. **Log what it surfaced** → [`2026-09-19-chemistry-autorun-log.md`](./2026-09-19-chemistry-autorun-log.md),
   one section per chapter: what was bought, what it cost, what an editor must fix.
4. **Bump the provenance premise pin** in `tools/__tests__/remt-checks-mt-runrecord.test.js`:
   every chapter bought adds its module sidecars plus one `chapter-metadata` one, and turns them
   into v2-with-a-run-record. **Re-measure and bump in the commit that buys the chapter** — it is a
   premise pin, and leaving it turns CI red on the next PR. (Batch A moved it 205 → 208 sidecars and
   43 → 67 run records.)
5. **Re-measure the corpus premise pins** the buy moved, in `tools/__tests__/remt-checks-mt.test.js`
   and `remt-checks-mt-gating.test.js`. Batch A moved these for documented reasons: a re-MT
   **retires the legacy dialect** (mustache 5,160 → 3,200, `++` 49 → 0, carriers 111 → 75) and a
   fresh buy **adds figure `alt` segments** the March MT predates (the m68663 fixture 11 → 12, so
   every count over it moves by one). **Read each number from the failing run and check it against
   that story — never adjust until green.** Regenerate a render golden only when its **tag skeleton
   is identical** (a text-only diff); ch03's m68699 and ch04's m68710 are `main`'s known reds and
   must NOT be regenerated.
6. **Commit** the chapter (`books/` + docs), one commit per chapter. **PR every 4–5 chapters**;
   [USER] merges. No deploy is needed — this is content only.

🔴 **`git add` BY PATH, NEVER `-A` ON A DIRECTORY.** Measured 2026-09-20: `git add -A tools docs`
swept another session's uncommitted hook tests into a PR and onto `main`; their hooks are untracked,
so they fail at COLLECTION on CI. **And the usual CI check cannot see that** — a file-level
collection failure has no `> test name`, so a failing-NAMES diff shows nothing while the count looks
unchanged. ▶ **Compare `Test Files N failed` as well as the names**, and `git status --porcelain`
before every commit.

## What is already known to happen, and is NOT a stop

| What you will see | Why | What to do |
|---|---|---|
| **ch19 m68844 FAILS inject** on a surviving `[[term:` | one of ⑰'s four known modules (m68700, m68733, m68747, m68844) | the driver applies `--no-annotate-en` itself |
| a figure's MT times out, `failed-mt` | sporadic; nothing was persisted | the driver retries once (~1–3 ISK) |
| a module returns **English prose** | sporadic non-translation | the driver re-buys that module once (ch08's m68745 went 5/5) |
| a module still incomplete after that | formula answers, names, or one stubborn segment | the driver writes it `--allow-incomplete` and prints the residue → log it for an editor |
| `meaning#` id renames in the round-trip | known, missing = added | nothing |
| pages renamed by the re-MT | the MT retitled a section | write the redirect row |

🔴 **A census before escalating.** ch08's m68744 returned one English paragraph twice, which looks
alarming; a sweep of **all 8,080 bought segments** found 13 identical prose-shaped segments of which
**12 are chemical-formula answers that are correctly identical**. One in 8,080 is an editor fix.
**Measure the population before calling something a class.**

## Stop conditions, unchanged

An **inject refusal outside ⑰'s four** · a **red fidelity manifest** · a **raw `[[` marker on an
HTML page** · a **failed buy** · the **wrong MT arm** · a **key term with no row in 20+ segments** ·
**superseded figure artwork** (the driver prints `REFUSED — superseded`; confirm with [USER] before
publishing anything over it).

## Where status lives

The campaign register's ⏩ RESUME (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).
Not here, and not in the log.
