# Decision: chemistry terminology and titles ruled from the 2026-09-26 sheet — mostly keep the approved glossary words; eight concept rows change; titles restored where they carry a ruled term

- **Date:** 2026-09-27
- **Status:** Accepted
- **Context owners:** [USER] (the rulings) + pipeline (the sheet and the comparison that framed them)
- **Supersedes:** none. It builds on `docs/decisions/2026-09-21-chemistry-terminology-rulings.md` and
  `docs/decisions/2026-09-26-pre-editor-pivot-translation-rulings.md` (decisions 2 and 3), and changes neither.
- **Related:** `docs/handoffs/2026-09-26-terminology-and-title-ruling-sheet.md` (the questions) ·
  `docs/handoffs/2026-09-26-live-vs-remt-terminology-comparison.md` (the evidence read beside it) ·
  `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C192, §C193, §C194) · `server/lib/houseStyleTerms.js` ·
  `docs/plans/2026-09-06-editor-terminology-assistant.md`

> **FROZEN EVIDENCE — banner-dated 2026-09-27.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The chemistry re-MT was bought with little or no glossary. For many approved terms it wrote its own word, and it
changed 7 chapter titles and 51 section titles. The ruling sheet asked, per term and per title: keep the approved
word (editors substitute), adopt the MT's word (the concept row changes), or neither. The sheet's rule was
**exceptions only**: a row [USER] did not name takes its default.

## Decision

### Book-level questions

| # | ruling |
|---|---|
| K1 stoichiometry | **hlutfallaefnafræði** (default) |
| K2 dissociation | **klofnun** (default); *sundrun* stays the nuclear-decay word |
| K3 electrolyte | **rafkleyfi** / nonelectrolyte **órafkleyft efni** |
| K4 colloid | **svif** (default) |
| K5 states of matter | **-hamur** for states of matter, **fasi** for phases |
| K6 kinetics | **hraðafræði** (default) |

### Terms [USER] named

**Most confirm the approved row as it stands.** Editors substitute these wherever the re-MT differs:
- **Solubility (non-negotiable):** soluble **auðleystur**, insoluble **torleystur**.
- **Electrochemistry:** anode **anóða**, cathode **katóða**, sacrificial anode **fórnaranóða**, cathodic protection **katóðuvörn**.
- **Substances and states:** noble gas **eðalgas**, crystalline solid **kristalkennt fastefni**, alloy **melmi**,
  suspension **sviflausn**, coolant **kæliefni**.
- **Quantities and energies:** mole fraction **mólhlutfall**, binding energy **bindiorka**, bond energy **tengjaorka**,
  calorie **kaloría**, percent yield **prósentuheimtur**, quantitative **magnbundinn**.
- **Other terms:** intermolecular forces **millisameindakraftar**, effusion **útsveim**, substitution **skiptihvarf**,
  anesthetic **deyfilyf**, classical mechanics **hefðbundin aflfræði** (*sígild aflfræði* also acceptable), periodic
  trends **lotubundnir eiginleikar**, atomic radius **atómradíus**.
- **Bond order: tengigráða.** The already-listed alternative *tengistig* is accepted.

**Eight change the concept model:**

| English | approved today | ruled | why ([USER]) |
|---|---|---|---|
| radius | geisli *(physics)* | **radíus** | *geisli* also means *ray* |
| crystalline | kristallskenndur *(physics)* | **kristalkenndur** | matches *kristalkennt fastefni* |
| bent | beygður | **boginn** | |
| dimensional analysis | víddargreining *(physics)* | **einingagreining** | a form neither the row nor the MT used |
| abundance | hlutmergð *(physics)* | **fjöldahlutfall** | accepted synonym, more transparent for students |
| absorption | gleyping *(physics)* | **gleypni** | |
| general anesthetic | — no row | **svæfingarlyf** | *anesthetic* alone stays *deyfilyf* |
| molecular compound | — no row | **sameindaefni** | common Icelandic usage, with *ionic compound → jónaefni* (already approved) |

**Two rulings set no single word:**
- **Bare *trend* has no fixed rendering; it depends on the context.** Only *periodic trends* is fixed.
- *Compound* stays **efnasamband**. *Jónaefni* and *sameindaefni* are the ruled words for the two kinds.

⚠️ **Head forms are lemmas.** [USER] wrote the neuter (*auðleyst, torleyst, kristalkennt*). As in the
2026-09-21 *amorphous* precedent, the glossary stores the lemma (*auðleystur, torleystur, kristalkenndur*), so that
agreement follows the noun.

### Rows [USER] did not name take the sheet's default

- **A:** the MT's word is adopted, e.g. *atómsvigrúm*, *gufuþrýstingur*, *hraðalögmál*, *rafskaut*, *tvískautsvægi*,
  *osmósuþrýstingur*, *rafeindasækni*, *hnútur*, *gildis-*.
- **B:** the approved form is kept, and editors substitute.
- **H:** the row stays, and the editor QA must not flag the other sense.
- **C:** not a term in this book; excluded from chemistry's editor QA.
- **F:** nothing.

### Titles

These are the exceptions and the book-level follow-ons. **Every other changed title takes the sheet's default.**

| § | ruled title | route |
|---|---|---|
| ch04 · 4.3 · 9.3 | the live wording (*Hlutfallaefnafræði …*) | K1 |
| ch11 · 11.5 | *Lausnir og svif* · *Svif* | K4 |
| 1.2 · 10.5 | *Efnishamir og flokkun efnis* · *Fastur efnishamur* | K5 |
| 11.2 | *Rafkleyfar* | K3 |
| **2.6** | **Jónaefni og sameindaefni** | named |
| **4.5** | **Magnbundin efnagreining** | named; in the official chemistry glossary |
| **10.1** | **Millisameindakraftar** | named; in the official chemistry glossary |
| 10.6 | *Grindargerðir í kristalkenndum fastefnum* (live) | follows *crystalline solid* (kept) |
| 18.12 | *… eðalgastegunda* (live) | follows *noble gas* (kept) |
| 12.3 · 17.3 | kept new (*Hraðalögmál*, *Rafskauts- og kerspenna*) | follow the adopted *rate law*, *electrode* |

## Reasoning

### Keeping the approved word is now mostly right, and the comparison says why

The sheet's first defaults leaned towards adopting the MT's word, because the approved form appears nowhere in
the re-MT. The live-vs-re-MT comparison showed that where the glossary had been on the wire, the model followed
these rows **consistently and without harm**: *katóða/anóða* 98/96%, *prósentuheimtur* and *bindiorka* 100%,
*rafkleyfi* 68%. So the approved words are usable and teachable. The re-MT dropped them only because it was bought
without them.

[USER]'s reasons are domain reasons the census cannot see:
- the official chemistry glossary (4.5, 10.1);
- established classroom usage (*jónaefni*, *sameindaefni*);
- transparency for students (*fjöldahlutfall*);
- a non-negotiable pair (*auðleystur* / *torleystur*).

### The eight changes go into `houseStyleTerms.js`, not SQL

Five of the six changed rows are **physics**-domain rows, and physics is a book of its own. A house-style concept
in the chemistry domain outranks them in chemistry without touching physics. It is re-asserted on every boot by
migration 051, which is why CLAUDE.md sends a ruled value to the file the code reads.

## Consequences

- **Editor substitution is the bulk of the work.** Every KEEP row above, and every B row, becomes a find-and-replace
  item for editors (§C78 U3's term-keyed finder). It costs 0 ISK. The re-buy route was given up on 2026-09-26.
- **Concept-model work:** the eight rows go into `server/lib/houseStyleTerms.js`, each with this record as its
  `ruled` authority. The adopted A-row words need entries too, where the MT's word is not already the approved row.
  **Code, so it reaches the export only after a deploy** (memory `enforced-value-reverts-on-boot`).
- **Titles:** the ruled title lines are hand-repaired in `books/efnafraedi-2e/02-mt-output/`, as authorised on
  2026-09-26. Only then are the redirect rows written, one per title whose resulting file name differs from the
  live one.
- **Not ruled explicitly: the sheet's Part 0**, extending the hand-repair authorisation from the 8.4 title to every
  *sámeind* in `m68747`'s body (§C194). Its default was *yes*, but a hand edit of a READ-ONLY tree is not assumed
  from silence. It waits for an explicit yes.
- **Foreclosed:** adopting the MT's words for the terms named above. Reversing it means a concept-model edit plus
  editor re-substitution. There is no MT cost, because the glossary is off the wire.
- Status of all of this → the active register.

## Alternatives considered

1. **Adopt the MT's word wherever the approved form is absent** (the sheet's first default). Rejected for the
   named terms: the comparison showed the approved words work when supplied, and [USER] had reasons of standards
   and teaching behind each one.
2. **Change the physics rows directly.** Rejected: it would change the physics book too, and a hand SQL edit is
   reverted on boot.
3. **Leave titles as the re-MT wrote them.** Rejected: several carry exactly the terms ruled here, and every
   later fix would rename a live page again.

---

## Addendum — the two held items, answered 2026-09-27

1. **Part 0: YES.** [USER] authorises the hand repair of every *sámeind* → *sameind* in
   `books/efnafraedi-2e/02-mt-output/ch08/m68747-segments.is.md` (§C194), in addition to the 8.4 title line.
   It covers the misspelling only. Any other wording in that module is left for editors.
2. **Electrode: raftroð.** [USER] reversed the sheet's default (*adopt rafskaut*), so the approved row stands
   and editors substitute. **17.3 therefore restores the live title *Raftroðs- og kerspenna***, not *Rafskauts-*.
   It is consistent with the named electrochemistry rulings: *anóða*, *katóða*, *fórnaranóða*, *katóðuvörn*.

The lemma reading above (*auðleystur, torleystur, kristalkenndur*) was not corrected, so it stands.
