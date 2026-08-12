# §C56 Gate C — pilot baseline, and a free pre-MT dry run

> ❄️ **FROZEN 2026-08-12.** Evidence, not status. **§C56 in the active register owns status; the
> pilot runbook owns the procedure.** If this document ever disagrees with the register, the
> register wins.
>
> **Scope:** the two pilot chapters only — `efnafraedi-2e` ch20 (6 modules) and `edlisfraedi-2e`
> ch04 (10 modules), **16 modules**. Nothing here generalises to the other three books or to the
> other 229 extracted modules.

**Register item:** §C56 · **Runbook:** [`2026-08-12-c56-pilot-re-extract-remt-runbook.md`](../plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md) Gate C
**Predecessors:** Gate A [`2026-08-12-c56-gate-a-hand-repair-triage.md`](2026-08-12-c56-gate-a-hand-repair-triage.md) · Gate B (recorded inline in the runbook)

---

## What was done, and why it was free

The LEAD amendment of 2026-08-12 established that **re-extraction costs nothing — only re-MT
costs money** — and that the pilot's shape is therefore *extract (free) → review `02-for-mt` →
fix in code and re-extract (still free), loop until clean → only now spend on MT.*

This gate executed that free half. Both pilot chapters were **re-extracted in place, measured,
and the tree restored**; `git status --porcelain` was empty before and after, and the baseline
instrument was re-run post-restore to confirm the numbers returned to their committed values.
**No ISK was spent and no file was left modified.**

**Instrument:** `countBracketMarkers` / `bracketMarkerDelta` imported from `tools/api-translate.js`
— the real functions, not a reimplementation, per criterion 3's own instruction.
`bracketMarkerDelta(EN, IS)` returns **IS minus EN**, so a negative value means the Icelandic side
carries *fewer* of that marker than the English.

---

## 1. Pre-migration baseline (the committed state, both sides)

| book | ch | module | legacy `{{}}` IS/EN | malformed `[[type: ` IS/EN | raw `<emphasis` EN/IS | `[[i:]]` EN/IS | EN→IS delta |
|---|---|---|---|---|---|---|---|
| efnafraedi-2e | ch20 | `chapter-metadata` | 0/0 | 0/0 | 0/0 | 0/0 | — |
| efnafraedi-2e | ch20 | `m68845` | 8/2 | 0/0 | 0/0 | 3/0 | `{"i":-3}` |
| efnafraedi-2e | ch20 | `m68846` | 34/34 | 0/0 | 0/0 | 66/66 | — |
| efnafraedi-2e | ch20 | `m68847` | 0/0 | 0/0 | 0/0 | 8/8 | — |
| efnafraedi-2e | ch20 | `m68848` | 10/10 | 0/0 | 0/0 | 9/9 | — |
| efnafraedi-2e | ch20 | `m68849` | 28/4 | 0/0 | 0/0 | 12/0 | `{"i":-12,"link":-1,"xref":-8,"docref":-3}` |
| edlisfraedi-2e | ch04 | `chapter-metadata` | 0/0 | 0/0 | 0/0 | 0/0 | — |
| edlisfraedi-2e | ch04 | `m42069` | 16/16 | 0/0 | 0/0 | 22/22 | — |
| edlisfraedi-2e | ch04 | `m42073` | 18/18 | 0/0 | 0/0 | 18/18 | — |
| edlisfraedi-2e | ch04 | `m42074` | 8/8 | 0/0 | 0/0 | 7/7 | — |
| edlisfraedi-2e | ch04 | `m42075` | 8/8 | **4/4** | 0/0 | 8/8 | — |
| edlisfraedi-2e | ch04 | `m42076` | 2/2 | 0/0 | 0/0 | 5/5 | — |
| edlisfraedi-2e | ch04 | `m42129` | 2/2 | 0/0 | 0/0 | 6/6 | — |
| edlisfraedi-2e | ch04 | `m42130` | 18/18 | 0/0 | 0/0 | 5/5 | — |
| edlisfraedi-2e | ch04 | `m42132` | 0/0 | 0/0 | 0/0 | 19/19 | — |
| edlisfraedi-2e | ch04 | `m42137` | 8/6 | 0/0 | 0/0 | 14/15 | **`{"i":+1}`** |
| | | **TOTALS (16)** | **160 / 128** | **4 / 4** | **0 / 0** | **202 / 188** | 3 non-zero |

### 🔴 Correction 1 — the legacy-marker count is **288, not 160**. The EN side was never measured.

The runbook's Gate C baseline records "legacy `{{…}}` markers: 80 + 80 = **160**". That figure is
**the Icelandic side only**. The English side under `02-for-mt` carries a further **128** —
`efnafraedi-2e` ch20 **50**, `edlisfraedi-2e` ch04 **78**.

This is not a rounding matter. It changes what the migration is *for*: the mixed vintage is not
"clean EN, stale IS" but **stale on both sides**, and criterion 1 ("zero legacy markers in
regenerated output") has to be stated per side or it is only half-checked. The original
instrument counted `legacy` on the IS file alone; adding one line to count the EN file is what
surfaced it.

#### ⚠️ And the pilot barely tests the marker the migration is named after. Broken down by type:

**Unit: every number in this table and everywhere downstream is a MARKER HALF** — `{{i}}` and
`{{/i}}` count as two — because that is what the `grep -aoE '\{\{/?(i|b|term|fn)\}\}'` in
criterion 1 counts, and what the 288 total is in. **Halve it for pairs.** *(Stated because this
file's own § on counting requires the unit named alongside the number; the register and the
runbook cite this table rather than restating its figures.)*

| | `{{term}}` | `{{fn}}` | `{{i}}` | `{{b}}` | total halves |
|---|---|---|---|---|---|
| EN `efnafraedi-2e` ch20 | 42 | 8 | 0 | 0 | 50 |
| EN `edlisfraedi-2e` ch04 | 78 | 0 | 0 | 0 | 78 |
| IS `efnafraedi-2e` ch20 | 42 | 8 | **30** | 0 | 80 |
| IS `edlisfraedi-2e` ch04 | 80 | 0 | 0 | 0 | 80 |
| **total** | **242 (84%)** | **16** | **30** | **0** | **288** |

**`{{b}}` does not occur anywhere in the pilot, and `{{i}}` occurs in exactly one chapter's
Icelandic side — 30 halves, i.e. 15 pairs.** §C16 and §C56 characterise the legacy problem as
"`{{i}}`/`{{b}}` corpus-wide";
**what these two chapters overwhelmingly exercise is `{{term}}` migration.** The
runbook's criterion 1 greps all four forms and is correct as written — but a clean pass on this
pilot is **not** evidence that `{{b}}` elimination works, because there is nothing to eliminate.
Appendix B should say so alongside its existing `{{term}}`/`{{fn}}` caveat, which points the
opposite way.

*(One asymmetry inside this table is not explained here: physics ch04's Icelandic carries 80
`{{term}}` halves against the English side's 78 — one extra pair. It is picked up under `m42137`
below, which it resembles.)*

### 🔴 Correction 2 — the marker deltas are **VINTAGE MISMATCH, not MT loss.**

The runbook calls the three non-zero deltas *"the live ~2.3%-loss class"* and proposes them as an
improvement target. **Measured against the per-file git dates, that attribution does not hold.**

| module | `02-for-mt` last written | `02-mt-output` last written | delta |
|---|---|---|---|
| `m68845` | **2026-07-07** | 2026-03-21 | `{"i":-3}` |
| `m68849` | **2026-07-07** | 2026-03-21 | `{"i":-12,"link":-1,"xref":-8,"docref":-3}` — 24 markers |
| `m68847` | 2026-07-13 | 2026-07-13 | — |
| `m42137` | 2026-03-23 | 2026-03-23 | **`{"i":+1}`** |
| *(11 others)* | *same date as their IS* | *same date as their EN* | — |

**The load-bearing evidence is the two date-mismatched modules, and `m68847`.** `m68845` and
`m68849` had their English re-extracted on 2026-07-07 — after B4 introduced bracket markers —
while their Icelandic still dates from March. `bracketMarkerDelta` is therefore comparing a July
English file against a March Icelandic one. **The 24 "lost" markers in `m68849` were never lost;
they never existed on the Icelandic side, because that side predates the markers.** `m68847` is
the paired positive case: it was re-extracted **and** re-MT'd on the same day, 2026-07-13, and its
delta is zero.

⚠️ **The other 13 zero-delta modules are the CONTROL, not 13 confirmations.** Same-date EN/IS
means the MT ran against that very extract, so a zero delta is simply what a working pipeline
produces. They show the instrument is sound and that nothing else in the pilot is anomalous —
they do not independently corroborate the vintage hypothesis, and counting them as evidence would
be double-counting the same fact.

⚠️ **The consequence for the pilot is that this class is not an improvement target at all — it is
the exact thing a re-MT eliminates by construction.** Anything left afterwards is the real signal.

### The one genuine anomaly: `m42137` `{"i":+1}`

`m42137` is same-vintage on both sides (2026-03-23) and still shows the Icelandic carrying **one
more** `[[i:]]` than the English. It is the only module in the pilot with a same-vintage
**bracket-marker** delta.

**A tempting explanation was tested and falsified.** §C58 destroys `[[i:]]` markers on the English
side, so an EN under-count would produce exactly this `+1` signature. **`m42137`'s source contains
zero self-closing `<emphasis/>` tags** — measured — and its English `[[i:]]` count is **unchanged
by the re-extract**, 14 both before and after. §C58 acts only on self-closing tags and can only
*lower* an EN count; neither condition is present. **§C58 cannot explain it.** It is a genuine
machine-translation-side marker *gain*.

*(The module has 14 paired `<emphasis>` elements in source and 14 `[[i:]]` in the English file.
**That agreement is not evidence of anything** — the source count was not split by `effect=`, so
bold and underline are folded into it. The falsification above rests on the zero self-closing
count and the unchanged EN count, neither of which depends on it.)*

⚠️ **There is a second same-vintage EN/IS count mismatch in the pilot, and the two may share a
cause.** Physics ch04's Icelandic carries **40** `{{term}}` pairs against the English side's
**39**. Like `m42137`'s `{"i":+1}`, it is an Icelandic-side *surplus* on a same-date pair.
Neither was chased. **They are the pilot's only two anomalies of this shape — a later session
should look at them together rather than separately.**

---

## 2. The free pre-MT dry run (re-extract, measure, restore)

Both chapters were re-extracted with the current tree, which includes the §C58 fix (`43bf77cd`,
merged as PR #391).

| metric, EN side (`02-for-mt`) | before | after re-extract |
|---|---|---|
| legacy `{{i}}/{{b}}/{{term}}/{{fn}}` | **128** | **0** ✅ |
| malformed `[[type: ` | **4** | **0** ✅ |
| raw `<emphasis` residue | 0 | **0** ✅ |
| `[[i:]]` markers | 202 | **207** (+5, restored by the §C58 fix) |

**Diff size:** 13 of 16 EN files changed — 366 insertions / 81 deletions; the structure sidecars
moved 1,594 / 803 across 24 files. **No untracked files were created** (the extract emits exactly
the committed file set: 5 chemistry + 9 physics source modules, plus `chapter-metadata` each).

### ⚠️ The two chapters are not comparable — drift exposure differs by 16 commits

| chapter | EN last extracted | extractor commits since | diff |
|---|---|---|---|
| `efnafraedi-2e` ch20 | 2026-07-07 / 07-13 | **1** (§C58 only) | 4 files, ~42 lines |
| `edlisfraedi-2e` ch04 | **2026-03-23** | **16** | 9 files, ~405 lines |

Physics ch04's re-extract diff is dominated by **accumulated extractor drift** — B4 bracket
markers, the RC4 donor-scan fixes, the OC-E list-block fixes, the exercise option-drop fixes —
**not** by §C58. `m68847`, re-extracted most recently (2026-07-13), came back **byte-identical**,
which is a useful determinism check on the extractor.

⚠️ **Chemistry ch20's diff is NOT "pure §C58" — a first draft of this document said so and the
arithmetic refutes it.** 50 legacy markers going to zero cannot happen in a 42-line diff unless
they are dense, and they are: those 50 halves sit on just **20 lines** (`m68845` 1, `m68846` 15,
`m68848` 2, `m68849` 2), because `{{term}}…{{/term}}` pairs cluster inside segment paragraphs.
20 removals + 20 additions accounts for essentially the whole ch20 diff. **So ch20's diff is
almost entirely the `{{term}}` → `[[term:…|id]]` migration, and barely §C58 at all** — ch20's
source carries **3** self-closing `<emphasis/>` tags (against 102 `<emphasis` occurrences as a
control; the book holds 12 in total), and none produced a malformed marker in the baseline.
**The §C58 evidence in this pilot comes entirely from physics `m42075`, not from chemistry.**

**This matters for the amendment's step ②.** "Review `02-for-mt`" is a tractable read for
chemistry ch20 and a 405-line read for physics ch04, and most of the latter is intended change
that landed months ago and has never been re-extracted anywhere. The criteria below say so
explicitly rather than implying a uniform review.

---

## 3. §C58 verified against real corpus content — with controls

The §C58 fix commit verified a minimal repro plus the unit suite. **It had never been run over
real `01-source` content.** Two checks were added here.

**a. Residue.** After the fix, a self-closing `<emphasis effect="bold"/>` matches neither emphasis
regex and falls through. Feeding all **8** real `m42075` paragraphs that contain one through the
exported `extractInlineText` gives **0 raw `<emphasis` residue and 0 malformed markers**; the
5 paired-emphasis paragraphs in the same file are unaffected. **Positive control:** re-applying
the *old* regex to the same 8 paragraphs yields **4** malformed markers — exactly the baseline
figure — so the probe was live rather than vacuously clean. The orphaned tag is absorbed by the
bare `stripTags(text)` at the end of `extractInlineText`.

**b. The worked example — this is content loss, not cosmetic malformation.**

*Before* (committed `m42075-segments.en.md`):

> …this force is defined to be a `{{term}}`normal force`{{/term}}``[[b: and here is given the symbol [[MATH:4]]. (This is not the unit for force N.) The word normal]]` means perpendicular to a surface.

*After* re-extract:

> …this force is defined to be a `[[term:normal force|import-auto-id1254224]]` and here is given the symbol `[[MATH:4]]`. (This is not the unit for force N.) The word `[[i:normal]]` means perpendicular to a surface.

Three separate defects clear in that one segment: the legacy `{{term}}` migrates to the
id-anchored bracket form; the bogus bold capture spanning **three sentences and swallowing
`[[MATH:4]]`** disappears; and the `[[i:normal]]` marker that §C58 had **destroyed** is restored.

**Arithmetic, reconciled — and the recovered marker was located, not inferred.** `m42075`'s EN
`[[b:` count goes 10 → 7 while **4** malformed captures are eliminated, so one `[[b:]]` must have
been *gained*. A set difference over the before/after marker bodies names it: **`[[b:,]]`** — a
bold comma. The source confirms the mechanism directly:

```
…</m:math><emphasis effect="bold">,</emphasis><emphasis effect="bold"/> and a force acting parallel…
```

`m42075.cnxml` contains **exactly two** `<emphasis effect="bold">,</emphasis>` elements; the
committed English file carries **one** `[[b:,]]`, and the re-extract carries **two**. The missing
one had been swallowed whole — opening tag and all — inside an earlier self-closing tag's runaway
capture. Net: **−4 bogus, +1 genuine recovered, +3 restored `[[i:]]`.**

⚠️ **The corruption reached Icelandic.** The IS file carries the same four malformed markers with
the swallowed prose faithfully translated (`[[b: og er hér gefið táknið [[MATH:4]]…`). The MT step
did not introduce this and did not repair it; it translated it.

---

## 4. What this establishes for the criteria

- **The pre-MT gate passes on the first extract.** Legacy markers, malformed markers and raw
  residue all go to zero on the English side with no further code work. The amendment's step ③
  loop (fix → re-extract) **terminates immediately for these two chapters** — §C58 was the fix it
  was waiting for.
- **C3 has stopped being an experiment.** "Do `m42075`'s four malformed markers disappear?" is now
  answerable for free, pre-MT, and the answer is yes. A thing checkable for free is a **gate**, not
  a prediction — it is restated as one in the revised criteria.

### 🔴 The pilot no longer has a falsifiable pre-registered prediction about the paid step, and no honest substitute was found.

The runbook's own standard is *"a pilot with no falsifiable prediction is a rehearsal."* **That
line now applies to the pilot itself**, and the lead should have that stated plainly rather than
be handed a manufactured replacement. Two candidates were considered and both were rejected:

- **"All marker deltas go to `{}` after re-MT."** Not a prediction — a **tautology**. Correction 2
  shows the deltas are vintage mismatch, and re-MT regenerates both sides at one vintage *by
  construction*. It cannot come out any other way.
- **"`m42137`'s `{"i":+1}` survives."** Untestable in any useful sense. It is a single marker from
  a March MT run being re-translated in August by a model that has changed in between; neither
  outcome licenses a decision about the remaining ~229 modules.

**What remains true is that the free half already delivered its result:** the English side of both
pilot chapters came back completely clean — zero legacy, zero malformed, zero residue — at zero
cost. **Whether a rehearsal of the paid half is worth the pilot's ISK is a [LEAD] judgement**, and
this document deliberately does not make it. The relevant input is that the pre-MT gate passing
first try is the single strongest signal the pilot was designed to look for, and it was obtained
without spending anything.

## 5. What this does NOT establish

- **Nothing about the other three books, or the other 229 extracted modules.** The 111 self-closing
  `<emphasis/>` tags are spread across 57 files in all five books; only ch04's 18 were exercised.
- **Nothing about the paid step.** No MT was run. Every post-MT number in the criteria is still
  unmeasured.
- **Nothing about inject or render.** The re-extract was measured at `02-for-mt`/`02-structure`
  and reverted; nothing downstream was run, so `fidelity:render` has no post-migration figure.
- **Nothing about the four protected modules**, none of which is in the pilot.
