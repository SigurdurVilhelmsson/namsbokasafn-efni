# Chemistry 2e — PRE-BUY term review, all remaining chapters

**Written 2026-09-19 · [USER] asked for one file to review before an automated run · 0 ISK spent to produce it.**

## What this is

The 17 chemistry chapters that have NOT been re-MT'd yet (ch00, ch01, ch02, ch08–ch21) were scanned
with `tools/chapter-term-check.js --pre-buy`, which reads only the English. For every term the book
itself marks up as a key term (a `[[term:...]]` marker) and which has **no glossary row**, this file
says what the **old March MT** did with it — an unprompted control, since that translation was made
before any of these rulings existed.

**Why it matters:** a term with no row is what let ch07's *resonance* come back as COVALENCE in 15 of
24 segments, and *Lewis structure* in four different forms. Each cost a paid re-buy. Rulings made
here cost nothing; the same rulings made after a buy cost roughly 300–800 ISK per module.

## What the scan can and cannot tell you — measured, not assumed

**Reliable:** which key terms have no glossary row, and how many segments each appears in. That
comes from the English alone.

🔴 **NOT reliable, and I threw it away: what the OLD MT did with a term.** My first draft aligned
the March translation to today's English by segment id and reported a "dominant rendering" per term.
**Measured: that alignment is unsound.** 80–95% of ids are shared between the two vintages (ch07
100%, ch02 95%, ch08 86%, ch20 80%) — but the CONTENT under a shared id has drifted, so an English
segment about orbital hybridization lines up with Icelandic about magnetism. It produced confident
nonsense ("Solomon → susan, 100%"), so the classification is gone rather than shipped.
This is CLAUDE.md's own *source-drift-under-a-stable-id* hazard, which nothing in the pipeline
detects.

**Still valid:** a chapter-level token count (how often *blending* appears against *blöndun* across
a whole chapter) needs no alignment. That is what ch08's rulings rested on, and I will use it when
you want evidence for a specific word.

**Reliable after a buy:** `chapter-term-check` compares a chapter's English with its own Icelandic,
both the same vintage. That is what catches anything we miss here.

## The cost this governs

Text for all 17 chapters is **~3.38M characters ≈ 25,000–34,000 ISK** (ch07 billed ~0.75× of list),
plus figures at roughly 25–40 ISK a chapter. **I will not start any of it without your explicit go.**

## What I would do autonomously, once you have ruled

Per chapter, in order: re-extract → pre-buy scan → buy text with the agreed subset → buy figures →
inject → render → `generate-index` → the free checks → commit. Then the next chapter.

**I STOP and ask — a "fundamental problem", meaning anything that would force a re-purchase later:**

- a term the MT renders inconsistently that has no ruling, in a chapter not yet bought;
- any extraction or marker defect meaning the English we paid for was wrong (a lost marker class, an
  id-charset break, a bracket-body change);
- inject refusing a module, or the fidelity manifest going `green: false`;
- a figure whose artwork is superseded by the published one, or a compose that damages a formula;
- anything that changes what a buy would produce, in a chapter I have not yet bought.

**I log and keep going — it does not need a re-purchase:**

- terminology an editor can fix in the segment editor (the ledger M9 shape);
- figure labels needing a human word choice;
- page renames, redirect rows and other publication bookkeeping;
- known-benign fidelity discrepancies and `meaning#` id renames.

The running log is [`2026-09-19-chemistry-autorun-log.md`](./2026-09-19-chemistry-autorun-log.md),
written as I go, one section per chapter. Status stays in the campaign register's RESUME.

## Already ruled, for reference

ch08: `hybridization` → **svigrúmablöndun** · `hybrid orbital` → **blendingssvigrúm** ·
`bonding orbital` → **bindandi svigrúm** · `antibonding` — no row, the MT is unanimous.
Standing: the chemistry subset `enthalpy` / `enthalpy change`, §C164's `resonance` family, and
`Lewis structure` → `Lewis-mynd`.

---

## Section 1 — the terms I need a ruling on (23, plus 3 already ruled)

Key terms with **no glossary row** appearing in **20+ segments**. A wrong or inconsistent rendering here is reader-visible across a whole section, and fixing it after the buy costs 300–800 ISK a module.

**Please write the Icelandic you want beside each, or "leave" if the MT should choose.**

| Chapter | English key term | Segments | Icelandic (your ruling) |
|---|---|---|---|
| ch08 | ~~hybridization~~ | 76 | ✅ **svigrúmablöndun** — ruled 2026-09-19 |
| ch08 | ~~hybrid orbitals~~ | 56 | ✅ **blendingssvigrúm** — ruled 2026-09-19 |
| ch09 | **torr** | 55 | |
| ch18 | **hydroxide** | 55 | |
| ch02 | **group** | 42 | |
| ch20 | **alcohol** | 42 | |
| ch18 | **carbonates** | 40 | |
| ch21 | **radioactive decay** | 39 | |
| ch17 | **galvanic cell** | 36 | |
| ch10 | **holes** | 34 | |
| ch18 | **representative metals** | 34 | |
| ch12 | **elementary reaction** | 32 | |
| ch14 | **pOH** | 32 | |
| ch15 | **Lewis** | 29 | |
| ch19 | **central metal** | 29 | |
| ch20 | **ether** | 29 | |
| ch10 | **dispersion forces** | 28 | |
| ch16 | **microstates** | 28 | |
| ch20 | **carboxylic acid** | 26 | |
| ch08 | ~~bonding orbital~~ | 25 | ✅ **bindandi svigrúm** — ruled 2026-09-19 |
| ch20 | **ketone** | 23 | |
| ch12 | **reaction mechanism** | 22 | |
| ch20 | **carbonyl group** | 22 | |
| ch21 | **chain reaction** | 22 | |
| ch10 | **hydrogen bonding** | 21 | |
| ch12 | **reaction orders** | 21 | |

## Section 2 — the rest (126), default: leave them

Key terms with no row in 5–19 segments. **Default: no ruling.** After each chapter is bought, `chapter-term-check` compares its English with its Icelandic — that check IS reliable, because both sides are the same vintage — and anything inconsistent goes to the editor ledger rather than a re-buy. Say the word if you want any of these ruled up front.

- **ch01** — Fahrenheit (18) · weight (18) · SI unit (16) · uncertainty (13) · chemical change (11) · microscopic domain (10) · pure substance (10) · heterogeneous mixture (8) · homogeneous mixture (8) · intensive property (8) · physical change (8) · rounding (7) · symbolic domain (7) · macroscopic domain (6) · theories (6) · extensive property (5)
- **ch02** — Rutherford (16) · molecular compounds (15) · Thomson (11) · chalcogen (10) · Millikan (6) · monatomic ions (6) · main-group elements (5) · Oxyacids (5) · series (5)
- **ch08** — antibonding orbital (14) · s-p mixing (6) · Kohn (5)
- **ch09** — Solomon (5)
- **ch10** — tetrahedral holes (19) · octahedral holes (17) · dipole-dipole attraction (15) · cohesive forces (10) · London (10) · metallic solid (9) · molecular solid (9) · adhesive forces (8) · deposition (8) · ionic solid (8) · supercritical fluid (8) · Clausius-Clapeyron equation (7) · Bragg (6) · Bragg equation (6) · capillary action (6)
- **ch11** — Strong electrolyte (13) · supersaturated (11) · colloidal dispersion (10) · miscible (10) · colligative properties (9) · semipermeable membrane (9) · Cottrell (7) · immiscible (7) · dispersed phase (6) · dispersion medium (6) · solvation (6)
- **ch12** — reaction diagrams (13) · Arrhenius equation (12) · rate expressions (9) · Molina (7) · unimolecular reaction (6) · activated complex (5) · heterogeneous catalyst (5)
- **ch13** — reversible reaction (13)
- **ch14** — acid ionization (18) · base ionization (18) · amphiprotic (14) · percent ionization (13) · acid-base indicator (12) · diprotic acid (7) · Henderson-Hasselbalch equation (7) · amphoteric (5) · buffer capacity (5) · oxyacids (5)
- **ch15** — Lewis acid (17) · Lewis base (12)
- **ch16** — spontaneous process (16) · Gibbs (6) · nonspontaneous process (6)
- **ch17** — Nernst equation (12) · cell schematic (11) · dry cell (9) · cell notation (6) · concentration cell (5)
- **ch18** — allotropes (14) · nitrate (14) · peroxides (12) · silicate (11) · hydrogen halides (10) · chemical reduction (9) · hydrogen carbonates (9) · superoxides (9) · interhalogens (8) · sulfite (8) · representative elements (7) · chlor-alkali process (6) · hydrogen sulfite (6) · passivation (6) · borate (5)
- **ch19** — donor atoms (13) · optical isomers (11) · coordination sphere (7) · polydentate ligand (7) · low-spin complexes (6) · strong-field ligands (6) · chelate (5) · high-spin complexes (5) · weak-field ligands (5)
- **ch20** — organic compounds (19) · esters (18) · IUPAC (17) · substituent (16) · alkyl group (12) · aromatic hydrocarbon (8) · skeletal structure (8) · saturated hydrocarbon (6) · addition reaction (5)
- **ch21** — fusion (18) · curie (8) · daughter nuclide (8) · parent nuclide (8) · radiation therapy (8) · RBE (7) · nuclear chemistry (6) · radiometric dating (6) · transuranium elements (6) · containment system (5)
