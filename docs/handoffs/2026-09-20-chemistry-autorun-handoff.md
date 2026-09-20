# Chemistry autorun — handoff for an UNATTENDED session

**Written 2026-09-20.** Everything a fresh session needs to finish the machine translation of
`efnafraedi-2e` without this conversation.

## ⚖️ The authorisation, in [USER]'s words

> *"I approve an unattended run to finish the machine translation for efnafraedi-2e in a new session."*
> — [USER], 2026-09-20

**Scope: `efnafraedi-2e` only** — ch09 … ch21, and the appendices only if [USER] says so (they were
not named). ch00, ch01, ch02, ch03–ch07 and ch08 are already bought and prepared.
**Budget: ~27,400 ISK at list price** for the remaining text (~20,000–20,500 billed at the observed
0.68–0.75×), plus 30–100 ISK of figures per chapter, plus a per-module retry (180–610 ISK) when one
is needed. **The loop still ends at PREPARED — no session runs a sync.**

## 🔴 Before the first buy: the paid-MT hook

`.claude/hooks/guard-paid-mt.mjs` (added 2026-09-20) returns `permissionDecision: "ask"` for every
`api-translate` run, which an unattended session cannot answer. **[USER] must clear that path for
this book before the run starts** — narrowly, ideally `efnafraedi-2e` only. If the hook still asks,
the run stalls at chapter 9 and nothing is lost.

## The command per chapter

```bash
bash scripts/chemistry-autorun-chapter.sh <N> "<that chapter's subset>"
```

It runs: re-extract → pre-buy scan → buy text → buy figures → inject → render → `generate-index` →
the free checks, and prints one compact summary ending in `DONE=ok` or `DONE=stopped`.
Logs land in `pipeline-output/autorun/` (gitignored). **Each chapter takes 30–60 minutes**, almost
all of it the figure run; run it in the background and poll for the summary.

### The subsets, already curated for sense

🔴 **Do not widen these.** They come from Section 3 of the pre-buy review, where a headword that is
a substring of ordinary English is allow-listed per chapter: measured, ch01's 27 `ether` hits are
all *together*/*whether*, ch02's `hole` is all *whole*, and ch10's `cell` is 118× **unit cell**
(already `grindareining`), where `ker` would be wrong.

```bash
bash scripts/chemistry-autorun-chapter.sh 9  "enthalpy,enthalpy change,torr"
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
```

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
5. **Commit** the chapter (`books/` + docs), one commit per chapter. **PR every 4–5 chapters**;
   [USER] merges. No deploy is needed — this is content only.

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
