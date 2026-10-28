# D11: a controlled glossary test (design, 2026-10-24)

> **FROZEN 2026-10-25 (pre-registration).** [USER] decided the arms in §3: three arms, June's wire (M) primary, today's
> wire (S) a pre-registered secondary arm, and no glossary, 2 runs each, up to ISK 5,000. Record:
> [`docs/decisions/2026-10-25-d11-three-arms-junes-wire-primary.md`](../../docs/decisions/2026-10-25-d11-three-arms-junes-wire-primary.md). The run follows this file.
> _(Until then it read: "Pre-registration draft. Everything here is fixed except the arm in §3, which is [USER]'s
> decision, due Monday 26 October. Once it is made, this file is frozen and the run follows it.")_ Status and the go live in the
> register's newest RESUME, never here.

## 1. The question

Plan 2026-10-10, D11 (answered yes 2026-10-11): the old chemistry MT, bought with the glossary on, kept the terms each
chapter teaches more consistently than the September MT (register, 2026-10-10: consistent taught terms 401 → 365 of
607). Was that a glossary effect? D11 answers that hypothesis (the plan's option 6) for the paper. It does not change
this book's route.

## 2. The design (fixed)

- **2 modules × {glossary arm, no glossary} × 2 runs**, all with today's model and the same freshly extracted
  English, in a scratch copy of the book tree.
- **The glossary values are the March file**, `books/efnafraedi-2e/glossary/glossary-unified.json` at `5db701c92`.
  Measured: it is byte-identical at every March buy commit (`c43026f46`, `7658de896`, `de601457d`) and unchanged
  until at least 15 July, so it is what the whole old vintage was sent.

## 3. The arm: what is put on the wire (DECISION)

The values are fixed. The sending rules are not: they changed after June (register, 2026-10-23).

| | June's wire (what the old MT was sent) | today's wire |
|---|---|---|
| a headword with two approved values (13 in the March file, e.g. *atom*: atóm / frumeind) | both values sent | both omitted (C18, `a9e334ed3`) |
| a headword of 3 characters or fewer | case-insensitive substring | case-sensitive whole word (§C116, `462a00a4a`) |
| the March file's 617 approved rows | 617 sent | 590 sent |

**Measured on the two modules** (`wire-compare.mjs`, `results/2026-10-24/wire-compare.json`): per chunk, June's wire
sends 4 to 7 terms that today's does not, and today's sends none that June's does not:

| module | chunk | today | June | only June |
|---|---:|---:|---:|---|
| ch11 `m68781` | 1 | 49 | 56 | atom (both), dilute (both), group (both), pH |
| ch01 `m68667` | 1 | 51 | 55 | atom (both), ion, pH |
| ch01 `m68667` | 2 | 55 | 61 | atom (both), emission (both), ion, pH |

*ion* and *pH* ride along on substrings ("solution", "phase").

**The options:**
- **M, June's wire.** Send what the old MT was sent. This answers the hypothesis. It needs a June-wire mode in
  `api-translate`. **Measured against the March code, the mode is small:** the two functions are 13 and 7 lines in
  `7658de896`, so the build is the two verbatim copies, one flag, and the wire recorded in provenance, test-first.
  The plan critique's estimate (2 to 4 sessions) was not measured, and this contradicts it.
- **S, today's wire.** Needs no code. It answers a different question: would the old values help if sent with
  today's safeguards? On these two modules it cannot speak to *atom* at all, because today's wire omits it, and
  *atom* is one of `m68667`'s drifted terms.
- **Both (three arms).** Answers both questions, and isolates the effect of today's safeguards. About half as much
  again (§5).

**Recommendation: M**, because D11 exists to test what the old MT was actually sent. Add S as a third arm if the
budget allows.

**Decided 2026-10-25 ([USER]):** three arms. **M is the primary arm**; **S is a pre-registered secondary arm**; and no
glossary is the control; 2 runs each, up to ISK 5,000 ([record](../../docs/decisions/2026-10-25-d11-three-arms-junes-wire-primary.md)). So §2's "{glossary arm, no glossary}"
reads {M, S, no glossary}.

## 4. The modules

**Rule:** the two modules with the most taught terms in the TEXT-DRIFT class (the running text moved away from the
key-terms entry between the old and the September MT), on segment ids present in both vintages
(`experiments/terminology-consistency/results/2026-10-10/classified-common.json`). That file counts 80 TEXT-DRIFT
term-module pairs in 46 modules. The register's headline of 69 counts lost terms only; the two counts were not
reconciled, and the ranking does not depend on it.

| module | TEXT-DRIFT terms |
|---|---|
| ch11 `m68781` (5) | dissociation, electrolyte, nonelectrolyte, strong electrolyte, weak electrolyte |
| ch01 `m68667` (4) | atom, heterogeneous mixture, homogeneous mixture, law of conservation of matter |

Next in line: ch10 `m68773` (4 terms, about 1.6 times the cost of `m68667`).

**Both modules' old MT came from March buys** (`m68781` at `de601457d`, 22 March; `m68667` at `c43026f46`,
19 March), before C18 landed (`a9e334ed3`, 4 August). So for these two, June's wire is exactly what the old MT
was sent. That would not hold for a module from the 12 August pilot, which already ran with C18's omissions.

## 5. Cost

On the expectation basis (the register's measured billing model: raw characters, less the SEG marker lines and one
newline per segment, at 0.01 ISK a unit), on the current English: `m68781` about 126 ISK a run, `m68667` about 360.

| arms | runs | about |
|---|---:|---:|
| 2 (M or S, and no glossary) | 4 | 1,940 ISK |
| 3 (M, S and no glossary) | 6 | 2,920 ISK |

Allow about a fifth more for retries. The ceiling basis comes from a dry run in the scratch tree. Re-extraction may
move both slightly.

## 6. The mechanism

**Verified by reading the code (2026-10-24):**
- `api-translate.js` and `cnxml-extract.js` resolve `books/<book>` against the working directory
  (`BOOKS_DIR = 'books/<book>'`), so a run from a scratch folder reads and writes the scratch copy.
- `api-translate` writes only the MT file and its provenance sidecar under that directory. **`--update-status` writes
  the real server database, so it is never passed.**
- It reads the API key from the repository's own `.env`, found from its own location, so the scratch tree holds no
  secrets.

**To check in the D11 session, before buying (free):**
- a dry run from the scratch folder reports the March file (617 approved; 590 on today's wire), and the real tree is
  unchanged afterwards (`git status`);
- re-extract the two modules from the scratch folder. `cnxml-extract --output-dir` is accepted and ignored
  (CLAUDE.md), so the working directory is the only isolation, and the real `02-for-mt` must be unchanged afterwards;
- for M: the June-wire mode, test-first, with the wire recorded in provenance.

## 7. Hazards

- **A truncation retry drops the glossary** (`translateChunk`'s retry path), so a glossary-arm chunk can come back as
  a no-glossary sample. Check `glossarySent` per chunk in the provenance before analysis, and re-buy such a chunk.
- **Run-to-run noise:** two runs of the same input differ on about a quarter of segments (§C133). Hence two runs per
  arm: an arm effect counts only beyond the difference between an arm's own two runs.
- **A wrong glossary row is obeyed on some occurrences** (§C73). The March file's wrong rows are part of what is
  tested; report them, do not filter them.
- **Neither arm reproduces June's model.** No sidecar records a model; both arms run today's.
- **Billing:** D11 must be billed before 1 November (§9).

## 8. Analysis (pre-registered)

- **Primary:** for each run, whether each module's running text is consistent with its key-terms entry for the nine
  TEXT-DRIFT terms in §4, by the instrument in `experiments/terminology-consistency/` (inflection-aware matcher),
  compared between arms.
- **Secondary:** all the two modules' taught terms, and segment-level difference rates between runs and between arms.
- **The June-only terms** (§3) are reported separately: they are where M and S differ.
- **Contrasts (pre-registered 2026-10-25, with the arms):** the **primary** contrast is M against no glossary. **Secondary:**
  S against no glossary, and M against S. M against S differs on only a few terms per chunk, so it is expected to be
  too small to call against the run-to-run noise; it is reported either way.

## 9. Funding

The current grant pays for D11 if it is billed before 1 November (companion, "controlled glossary test"). After S no
grant pays API fees. So the go waits for the billing check (u08) and is due Wednesday 28 October, leaving Thursday
and Friday for a retry.
