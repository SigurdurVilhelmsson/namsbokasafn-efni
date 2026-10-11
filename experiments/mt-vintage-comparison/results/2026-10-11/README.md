# ch01–ch02's professional review in Word: what it changed, and against which text (2026-10-11)

> 🧊 **Frozen evidence, 2026-10-11.** This is a citable measurement, not status. Open work lives
> in the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`); what the plan
> does with this is plan 0.2 (`docs/plans/2026-10-10-chemistry-finish-preparation-plan.md`).

**Question.** [USER] ruled that only the segments the ch01–ch02 review touched count as
human-reviewed (D10, `docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md`). The plan
assumed the review was in tracked changes. Which text did the reviewers start from, what did they
change, and where do their comments sit?

**Inputs.**
- The 25 reviewed Word files (ch01 12, ch02 13). They are **off-repo**, one level up from the
  repository, because they carry the reviewer's name. **No name and no comment text appears in
  this directory.**
- Their starting text, in git history only: 25 MT `.docx` files exported by LibreOffice 7.0 on
  2025-01-24. The MT engine that produced them is not recorded anywhere in the repository. They were
  uploaded on 2026-01-12 (`b37ab8cc8` ch1, `9ca3fb2ef` ch2) under
  `books/efnafraedi/02-mt-output/docx/`, renamed unchanged in `35b872073`, and deleted on 2026-01-21
  in `265a2496e`. Read here at `265a2496e^`.

**Method.**
- `scripts/word-review/word_review_census.py` measures the numbers in the first table and writes
  `word-review-census.json`. It prints no names and no text. Its definitions are in its docstring.
- A Claude Code workflow on 2026-10-11 did the wider analysis: extraction, base-text identification
  over all of git history, Word session-id forensics, comment classification, and an independent
  re-count. Five AI agents ran it. Their results that are cited below were reproduced either by the
  census script or by the workflow's own verifier, unless a line says otherwise. Their per-paragraph
  data carries comment text, so it is kept off-repo under
  `~/.cache/namsbokasafn-audit/2026-10-11-word-review/`.

## What the files contain (census script)

| | ch01 | ch02 | total |
|---|---|---|---|
| Word files | 12 | 13 | 25 |
| paragraphs (non-empty) | 1,339 (1,251) | 1,600 (1,445) | 2,939 (2,696) |
| revision marks (insertions, deletions, moves, format changes) | 0 | 0 | **0** |
| files with comments | 11 | 6 | 17 |
| comments | 192 | 131 | **323** |
| paragraphs a comment spans | 126 | 65 | 191 |
| files byte-identical to their starting text | 1 | 7 | 8 |
| paragraphs that differ from the starting text | 39 | 0 | **39** |

- **Track Changes** is explicitly off in the 17 files with comments; the other 8 carry no setting
  (off). Each commented file has one comment author. Comment dates run **2025-09-25 → 2026-03-13**;
  two stamps in ch01 are in US format, so a plain string minimum reports 1 October.
- **The starting text is identified.** The 8 files without comments are byte-identical to their
  git-history base, and their git objects exist in the repository; no commented file's does. All 25
  pairs have the same paragraph count. Their creation stamps match the base to the second in 22
  files and to the minute in 2. One file (ch01 §1.2) was re-created on 2025-10-07.
- **The 39 differing paragraphs, all in ch01:**
  - 12 are bare URLs that Word filled into empty hyperlinks on conversion (6 in the exercises, 6 in
    the summary). They are not edits;
  - 1 is a note to the editors, typed into an empty paragraph;
  - 15 change only case, punctuation or spacing (9 of them in the key terms);
  - 11 change wording (§1.1 7, §1.2 2, key terms 2).
- **ch02 has no text changes at all.** Its review is the 131 comments.

## From the workflow (AI agents, 2026-10-11)

- **No other text matches better.** Pooled over all 25 files, 97.9% of the 1,231 substantive
  paragraphs (at least 20 characters after normalisation) equal the starting text exactly
  (reproduced by the verifier: 1,205 of 1,231). A scan of every Icelandic text in git history found
  no better candidate. **The June and September API MT are different translations:** about 30% of
  substantive paragraphs match exactly, median similarity 0.94–0.95 (reproduced within 0.005).
- **None of the comments' proposals is applied in the files.** All 323 comments were classified by
  one AI annotator under written rules:
  - 183 propose a correction;
  - 95 concern terminology, among them 16 on *frumeind → atóm* and 14 on *hópur → flokkur*;
  - 21 flag a problem without wording;
  - 16 concern a figure or format;
  - 3 are questions, 3 approvals, 2 other.

  None is marked resolved. **0 of the 183 proposed corrections appear in the text they are anchored
  on.** Positive controls: writing each proposal into its anchor makes 236 of 236 read as applied,
  and removing the replaced text flags 262 of 262. The labels carry comment text and stay off-repo.
  This classification was not re-run by the verifier.
- **Review scope.** A comment in the ch01 exercises file says that only the odd-numbered exercises
  (the ones with answers) were read. An exercise without a comment is therefore not evidence of
  review, and the 8 files without comments carry no review signal at all.
- **AI inside the human review.** One comment's proposed sentence says it was generated by ChatGPT.
- **Word session ids cannot find the edits.** In the files saved only by Word for the web, typed text
  carries the file's base session id: 0 of 15 edited paragraphs were flagged. Deletions leave
  nothing to stamp in any case.
- **Part of ch01's review already reached the repository by hand.** The reviewer's wording at 4 edit
  sites in §1.1 (module m68664), plus an inserted gloss, appears in editor rows created on
  2026-06-16, the [LEAD]'s re-entry. Spot-checked here: the gloss is absent from the starting text,
  present in the reviewed file, and first in faithful m68664 at `4ec48fbab` (2026-06-16).
- **An English bridge to segment ids exists.** The English source `.docx`
  (`books/efnafraedi-2e/01-source/docx/`) matches the Icelandic starting text paragraph for paragraph
  in 25 of 25 files. Through it, 192 of the 198 non-empty paragraphs that were changed or commented
  resolve to a current English segment at similarity 0.9 or more. This is the verifier's own
  measurement and was not reproduced.

## Blind spots

- **Authorship of untracked typing is not recorded.** Attributing the 26 changed paragraphs (39
  minus the 12 URLs and the note) to the reviewer rests on circumstance: one comment author in all 17
  files.
- **The starting text is proven byte for byte only for the 8 files without comments.** For the other
  17 it rests on equal paragraph counts, the creation stamps and the exact paragraph matches.
- The alignment is positional. That is valid here because all 25 pairs have equal paragraph counts,
  and no paragraph was inserted, deleted, split or merged.
- Math is excluded from the text comparison (the workflow compared it separately and found 0
  changes). Run-level formatting such as bold and italic was not compared.

## Re-running

```bash
python3 -I experiments/mt-vintage-comparison/scripts/word-review/word_review_census.py --repo . \
    --ch01 '../1._kafli_OpenStax til yfirlestrar' --ch02 '../2. kafli OpenStax' > census.json
```

It needs the off-repo Word files and `defusedxml`. It exits 1 unless the run completes (control:
missing inputs → exit 1).
