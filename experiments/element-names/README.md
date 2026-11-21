# Element names in chemistry: glossary, MT and the official list (2026-11-20)

> **Frozen measurement, 2026-11-20.** Production's `sessions.db` and `books/` tree at `844f13d2f`,
> book `efnafraedi-2e`. Evidence, not status: open work lives in the active register. Editors keep
> working, so re-run the scripts before quoting these numbers elsewhere.

**Questions.**
1. What does chemistry's glossary resolve each element name to, and how does that compare with the
   official list?
2. For the names where the glossary disagrees with the list, which segments would a worklist list?
3. For the names with no chemistry glossary row, how did the MT render them?

**The authority.** [USER] named Vísindavefur answer 89909 as the official list of Icelandic element
names on 2026-11-20: <https://www.visindavefur.is/svar.php?id=89909>, *"Hvað heita öll frumefnin á
íslensku?"* (published 2026-11-13, updated 2026-11-18). The page describes its names as a
recommendation for compulsory-school teaching materials, following a November 2026 resolution by
chemists and other experts. All 118 elements are in `evidence/2026-11-20-census/data/visindavefur-89909-official-names.json`.
The ruling is recorded in `../../docs/decisions/2026-11-20-official-element-names-visindavefur.md`.

## How the measurements were taken

Every script is read-only by construction. Before any server module loads, it replaces
`better-sqlite3` in Node's require cache with a subclass that forces
`{readonly: true, fileMustExist: true}`. So every handle in the process is read-only, including the
segment editor service's own writable `getDb()`. Any write would throw instead of landing.

The scripts were sent to production on stdin, so production keeps no file:

```bash
ssh <prod> "cd <repo>/server/scripts && /usr/bin/node - efnafraedi-2e" \
  < experiments/element-names/evidence/2026-11-20-census/instruments/<script>.cjs > out.json
```

Each output starts with a control block and ends with `END-OF-REPORT`. In every run here:
`registered_books` was 6, the only database opened was `pipeline-output/sessions.db` (read-only),
and production's `git status --porcelain` was empty afterwards. Every run that read segments
listed 170 units, none of them unreadable.

Everything this measurement used is kept in `evidence/2026-11-20-census/`: `instruments/` (the scripts),
`data/` (each output as returned, with a `_meta` block added and absolute production paths removed)
and `reports/` (the segment tables). The instruments load AGPL `server/` code, so they sit in a dated
`evidence/` folder. The root `LICENSE` keeps those outside its list of MIT→AGPL edges: they replay
one past measurement and are not tooling.
Segment text in `data/` and `reports/` comes from `efnafraedi-2e` and carries that book's licence
(`books/efnafraedi-2e/book-config.json`). No BÍN data is committed: BÍN is CC BY-SA 4.0, and
`instruments/extract-bin-forms.py` rebuilds what measurement 7 used from your own BÍN download
(`docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md`).

To rebuild the derived files from the committed data (run inside `instruments/`):

```bash
curl -sS -o page.html 'https://www.visindavefur.is/svar.php?id=89909'
python3 -I compare.py page.html ../data/resolver-121-names.json comparison.json
python3 -I build-elements-table.py ../data/comparison-official-vs-resolver.json ../data/elements-table.json
python3 -I assemble-render-census.py render-census.template.cjs ../data/elements-table.json render-census.cjs
python3 -I build-never-official.py render-census.cjs ../data/render-census-69-names.json never-official-readonly.cjs
python3 -I summarise.py ../data ../reports   # rewrites reports/*.md, prints every tally quoted below
node classify-test.cjs                        # the classifier's unit cases
# measurement 7 (needs your own BÍN download, SHsnid.csv.zip):
python3 -I build-fix-targets-fetch.py nine-readonly.cjs ../data/dry-count-ruthenium-mt-forms.json ../data/lanthanide-census.json fetch-fix-targets.cjs
python3 -I extract-bin-forms.py <SHsnid.csv.zip> ../data/comparison-official-vs-resolver.json bin.json
python3 -I build-editor-fixes.py ../data/fix-targets.json ../data/comparison-official-vs-resolver.json \
    ../data/render-census-69-names.json ../data/dry-counts-9-names.json bin.json ../reports/editor-fixes
# measurement 8 (after measurement 7: it reads ../reports/editor-fixes.json):
python3 -I build-fix-targets-fetch.py --never-official nine-readonly.cjs ../data/never-official-lists.json fetch-never-official-targets.cjs
python3 -I build-editor-fixes.py ../data/never-official-targets.json ../data/comparison-official-vs-resolver.json \
    ../data/render-census-69-names.json ../data/dry-counts-9-names.json bin.json \
    ../reports/editor-fixes-never-official ../reports/editor-fixes.json
# measurement 9 (after measurements 7 and 8):
python3 -I build-never-official.py --mixed render-census.cjs ../data/render-census-69-names.json mixed-readonly.cjs
python3 -I build-fix-targets-fetch.py --mixed nine-readonly.cjs ../data/mixed-lists.json fetch-mixed-targets.cjs
python3 -I build-editor-fixes.py ../data/mixed-targets.json ../data/comparison-official-vs-resolver.json \
    ../data/render-census-69-names.json ../data/dry-counts-9-names.json bin.json \
    ../reports/editor-fixes-mixed ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json
# measurement 13 (after measurements 7–9; the scan reads their drafts):
python3 -I scan-inner-non-official.py ../data/render-census-69-names.json ../data/comparison-official-vs-resolver.json \
    ../data/mixed-lists.json ../data/never-official-lists.json ../../../../../books/efnafraedi-2e/02-mt-output \
    ../data/inner-non-official-scan.json ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json \
    ../reports/editor-fixes-mixed.json
python3 -I build-fix-targets-fetch.py --inner nine-readonly.cjs ../data/inner-non-official-scan.json fetch-inner-targets.cjs
python3 -I build-editor-fixes.py ../data/inner-targets.json ../data/comparison-official-vs-resolver.json \
    ../data/render-census-69-names.json ../data/dry-counts-9-names.json bin.json \
    ../reports/editor-fixes-inner ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json \
    ../reports/editor-fixes-mixed.json
# every name fix and hand fix in measurements 7–10 and 13 sits in a segment whose English names that element (exit 1 if not):
python3 -I check-anchoring.py ../data/comparison-official-vs-resolver.json ../../../../../books/efnafraedi-2e/02-for-mt \
    ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json ../reports/editor-fixes-mixed.json \
    ../reports/editor-fixes-inner.json
# 11. the draft §C73 recommendations for the 68 names with no chemistry row:
python3 -I build-c73-recommendations.py ../data/comparison-official-vs-resolver.json \
    ../data/render-census-69-names.json ../reports/c73-entry-recommendations
# 12. the 59 entry drafts of the §C73 ruling (the BÍN outcomes need SHsnid.csv, unpacked from your own download):
node bin-outcomes-c73.cjs <SHsnid.csv> ../reports/c73-entries.json ../data/c73-bin-outcomes.json
python3 -I build-c73-entries.py ../reports/c73-entry-recommendations.json ../data/render-census-69-names.json \
    ../data/comparison-official-vs-resolver.json ../reports/c73-entries ../data/c73-bin-outcomes.json
# 14. the term check's two dry runs: rebuild the scripts that ran (send each on stdin to production, cwd server/scripts,
#     `node - efnafraedi-2e`), ingest each raw output, and write the report:
python3 -I build-termcheck-dryruns.py magnesium termcheck-dryrun-magnesium.template.cjs termcheck-dryrun-magnesium.cjs \
    ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json ../reports/editor-fixes-mixed.json
python3 -I build-termcheck-dryruns.py c73 termcheck-dryrun-c73.template.cjs termcheck-dryrun-c73.cjs \
    ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json ../reports/editor-fixes-mixed.json \
    --entries ../reports/c73-entries.json ../data/render-census-69-names.json
python3 -I ingest-termcheck-dryrun.py <raw output> ../data/termcheck-dryrun-<magnesium|c73>.json \
    termcheck-dryrun-<magnesium|c73>.template.cjs "<what>"   # the what strings are in each file's _meta
python3 -I summarise-termcheck-dryruns.py ../data/termcheck-dryrun-magnesium.json ../data/termcheck-dryrun-c73.json \
    ../reports/termcheck-dryruns.md
```

In the sections below, paths are relative to `evidence/2026-11-20-census/`.

Segment text is what the editor sees: `segmentEditorService.buildEffectiveSegments`, i.e. the files
on production plus the newest edit that is not rejected or superseded (pending edits count).

### 1. The glossary against the official list

- `instruments/elements-readonly.cjs` resolves 121 names: the 118 IUPAC names plus *aluminium*, *sulphur*
  and *caesium*. It uses `conceptResolver.buildScope`/`resolve`, at the book default and at every
  chapter scope (0–21 and appendices), and reads the exported `glossary-unified.json`.
  → `data/resolver-121-names.json`
- `instruments/compare.py` parses the official page's HTML table (`<td>` cells, NFC normalisation) and
  compares it with that output. → `data/comparison-official-vs-resolver.json`

**Result.** 51 of the 121 names resolve. Every one comes from the physics domain (`head-form`),
except `neptunium → neptúníum` (chemistry, `book-entry`). The chapter scopes all agreed with the
book default. The export (`export-terminology-resolved`, 1,638 terms, written 2026-11-20 16:00)
agreed on every name, except that *aluminium* and *sulphur* have no export row. Per element against
the list: **41 match, 9 differ, 68 have no chemistry row.**

The 9 that differ: `germanium → german` (official `germaníum`) · `zirconium → sirkon` (`sirkoníum`) ·
`ruthenium → rúten` (`rúþeníum`) · `lanthanum → lantan` (`lanþan`) ·
`praseodymium → praseódým` (`praseódýmíum`) · `neodymium → neódým` (`neódýmíum`) ·
`polonium → pólon` (`póloníum`) · `astatine → astat` (`astatín`) · `plutonium → plúton` (`plútóníum`).

### 2. Dry worklists for the 9

`instruments/nine-readonly.cjs` runs the worklist's own matcher (`worklistMatch.matchSegment`) the way
`bookGlossaryWorklist.buildWorklist` would. A segment is listed if its English contains the name
(whole word) and its Icelandic contains the resolved old form or one of that term's stored
inflections (whole word, any case). Segments that already contain the official name are skipped.
All 9 old forms had stored inflections. → `data/dry-counts-9-names.json`,
`reports/nine-name-segments.md`

| English | Old form | Segments with the English | Already official | Listed |
|---|---|---:|---:|---:|
| germanium | german | 12 | 3 | 8 |
| zirconium | sirkon | 13 | 1 | 9 |
| ruthenium | rúten | 8 | 0 | **0** |
| lanthanum | lantan | 10 | 0 | 10 |
| praseodymium | praseódým | 5 | 0 | 5 |
| neodymium | neódým | 6 | 0 | 5 |
| polonium | pólon | 17 | 1 | 11 |
| astatine | astat | 8 | 1 | 7 |
| plutonium | plúton | 17 | 5 | 6 |

That is 61 listings and 36 distinct segments. The four copies of the periodic-table alt
(ch2 `m68695`, ch18 `m68829`, ch19 `m68842`, appendices `m68859`) appear under most names.

### 3. Ruthenium, searched by what the MT wrote

The MT never wrote `rúten`; it wrote `rúþen`. `instruments/ruthenium-mt-forms-readonly.cjs` runs the
same matcher with the MT's forms (`rúþen`, `rúþens`, `rúþeni`, `Rúþen`), skipping segments that
contain `rúþeníum`. **8 of 8 segments are listed.** A census of every word starting with `rúþen`
found only those four forms (`rúþen` 5, `rúþens` 1, `Rúþen` 1, `rúþeni` 1).
→ `data/dry-count-ruthenium-mt-forms.json`, `reports/ruthenium-segments.md`

### 4. How the MT rendered the names with no glossary row

`instruments/render-census.cjs` covers the 68 names with no chemistry row, plus *aluminum*. OpenStax
writes *aluminum*, and that spelling has no row although *aluminium* resolves to `ál`. Since there
is no old form to search for, the script has to find the rendering itself:

1. **English anchor.** Only segments whose English contains the name (whole word) are searched.
2. **Shape.** A candidate word ends in an `-íum` or `-ín` base, either standalone with an
   inflection or as the first part of a compound. The base is the shortest split that leaves a valid
   remainder, and a split may not end inside the prefix matched in step 3. For the two names that
   are not `-íum`/`-ín` (`ál`, `blý`), a word starting with the exact, accented official name is
   counted first. Other words still go through the shape test, which is how `alúmín` was found.
3. **Assignment.** All 118 elements compete for each word. Accents are folded and þ→t, c→k, ð→d,
   æ→a, ö→o are treated as equal. The longest prefix shared with an element's official or English
   name wins. A tie goes to the tied element the segment's English names, otherwise it is reported as
   ambiguous.
4. **Tiers.** *strong* means a prefix match of at least 4 letters, or the whole stem if shorter;
   these are counted. *weak* means 3 letters; these are listed, not counted. *unshaped* means a
   prefix match of at least 4 letters with no element ending; these are listed so garbles show up.
5. **Control.** For each element, the English segments where nothing was found are counted, with
   samples.

`instruments/classify-test.cjs` holds the local unit cases the classifier was checked against before it
ran on production (`node classify-test.cjs`). `data/elements-table.json` is its input, built by
`instruments/build-elements-table.py`. → `data/render-census-69-names.json`,
`reports/render-census-table.md`

**Result.** 65 of the 69 names occur; nihonium, moscovium, tennessine and oganesson do not. Every
form is official for 2 names (lead; hafnium, though see the blind spots). 49 are mixed and 14 are
never official. Over the 65: 1,522 official occurrences against 481 others. Patterns:
- **`-ín` for `-íum`.** Common elements are mostly official (`natríum` 359 vs `natrín` 6); rare
  and superheavy ones are mostly `-ín`.
- **Never official for reasons other than the ending:** `litíum` 71 (official `liþíum` appears 0
  times), `prómetín` 5 (official `prómeþíum`), and `kúríum` 5 / `kúrín` 1 (official `curíum`).
  `tallín` 9 sits beside `þallín` 12 and `þallíum` 14.
- **English or Latin left in the Icelandic:** helium 3, barium 3, sodium/natrium 3,
  potassium/kalium 3, lithium 1, vanadium 1, cesium 1, americium 1.
- **MT garble:** hafnium is `hafnfn` in 4 of its 5 segments (the periodic-table alts).

### 5. The lanthanide words

Added the same day, after [USER] ruled that `lanþan` carries into its derived words (`lanþaníð-`,
`lanþanóíð-`). `instruments/lanthanide-readonly.cjs` searches segments whose English holds
*lanthanide*, *lanthanides*, *lanthanoid* or *lanthanoids* (whole word, any case) and lists every
Icelandic word there starting with `lant` or `lanþ`. → `data/lanthanide-census.json`,
`reports/lanthanide-segments.md`

**Result.** 19 segments (ch2 4, ch6 2, ch18 1, ch19 12), and every one holds a `lant`/`lanþ` word.
**18 hold the old derived forms** (27 occurrences: `lantaníð-`, `lantanóíð-`). One already holds the
official `lanþaníðar` (`m68842:para:fs-idm272953936`); that is the MT's own output, as received in
`02-mt-output`. Three of the segments also hold the element name `lantan`, and they are in the
lanthanum list too.

### 6. Dry lists for the 14 names that are never official

The census rows marked ✗ in measurement 4: the names whose MT forms are never the official one.
`instruments/never-official-readonly.cjs` is built by `instruments/build-never-official.py` from
`render-census.cjs`, so it reuses the same read-only header, element table and classifier, and it
takes its 14 targets from the committed census, not from a typed list. A segment is listed when its
English names the element and its Icelandic holds a non-official strong form, or failing that a weak
or unshaped near match. Segments already holding the official name are skipped, as the worklist
skips them. → `data/never-official-lists.json`, `reports/never-official-segments.md`

**Result.** 119 listings over 65 distinct segments; the four periodic-table alts carry most of the 13
rare names. Every segment whose English names one of the 14 is listed: none already holds the
official name, and none is unmatched. Lithium accounts for 58 (`litíum` in 54 segments, `litín` in 4,
the English `lithium` in 1). Each of the other 13 has 4–6. One gadolinium segment is listed only for
the near match `gadólíni`, a real rendering. One lithium near match, `lítil` ("little"), is noise, and
its segment is listed for its `litíum` anyway.

### 7. The editors' fixes for the ruthenium and lanthanide segments

Drafts for the editors' layer, not a measurement. They cover the 8 ruthenium segments (measurement 3)
and the 18 lanthanide segments holding the old derived forms (measurement 5), and apply [USER]'s
rulings of 2026-11-20:

1. **Masculine `lanþaníð-`, as in chemistry's glossary** (`lanthanides → lanþaníðar`). The MT's
   masculine forms are kept. `öll lanþaníð` becomes `allir lanþaníðar`, and the problem segment's
   `lanþaníð frumefnin` becomes `lanþaníðarnir`.
2. **The `óíð` alternatives are dropped, lanthanide and actinide.** One removal in
   `m68842:para:fs-idm9696240` takes both term markers with it (`term-00008`, `term-00010`), so the
   Icelandic page loses those two key-term highlights.
3. **Every other off-list element name in the same segments is fixed** to the official list.

`instruments/fetch-fix-targets.cjs` (built by `build-fix-targets-fetch.py`) read the current
effective text of the 26 segments read-only on production → `data/fix-targets.json`. No segment had
a live edit. `instruments/build-editor-fixes.py` then applies the rules in steps, each verified on
its own:

- the requested substitutions (`rúþen` → `rúþeníum` by case, as BÍN declines it; `lantan-` →
  `lanþan-` in the derived words);
- the exact phrase edits of rulings 1 and 2, each matched exactly once;
- ruling 3's name fixes, with an inflection map checked against BÍN. An `-ín` name turned `-íum`
  takes BÍN's main dative (`osmíni` → `osmíum`).

A word diff confirms that nothing else changed. → `reports/editor-fixes.md` (review),
`reports/editor-fixes-paste.txt` (one block per segment), `reports/editor-fixes.json`

**Result.** 35 requested substitutions, 5 phrase edits and 221 name fixes (50–52 in each
periodic-table alt) over 26 segments. Fifteen official names are not in BÍN; they occur here only in
the nominative, so the form is the official name. **The fixes shrink the nine book entries'
expected worklists**, because the worklist reads pending edits too. Both columns are in
`reports/editor-fixes.md`.

### 8. The editors' fixes for the never-official segments

The same rule script and the same rulings as measurement 7, run over every distinct segment of the 14
never-official names' dry lists (measurement 6). `instruments/fetch-never-official-targets.cjs` (built
by `build-fix-targets-fetch.py --never-official`) read their current text read-only on production
→ `data/never-official-targets.json`. No segment had a live edit. In these segments both stem rules
apply wherever they occur.

Two refinements to the rule script, written for this run. Neither changes any measurement-7 output,
which still rebuilds byte-identically:

- **Compounds on an `-ín`/`-íum` base change their element part only** (`litíumklóríð` →
  `liþíumklóríð`, `samarínjón` → `samaríumjón`). A derived word is left alone (the remainder starts
  `íð`/`óíð`, as in `aktíníðaröðina`). So is a compound on one of the nine entries' short forms,
  where `german` + `skur` would be the ordinary word *germanskur*; that case is flagged for review
  instead.
- **Three census bases that are not element names are excluded:** `kalkstein` (limestone),
  `aktiníðaröðin` (the actinide series) and `alúmín` (from *alúmínat*, aluminate).

→ `reports/editor-fixes-never-official.md` (review), `reports/editor-fixes-never-official-paste.txt`,
`reports/editor-fixes-never-official.json`

**Result.** 65 segments. **4 are the periodic-table alts already drafted in measurement 7:** this
run's text for them is asserted identical, and they are left out of the paste file, so nothing is
pasted twice. **The other 61 all change:** 59 name fixes, 32 compound fixes (31 `litíum-` →
`liþíum-` and `samarínjón`), and no flagged compound or derived word. The review file has the nine
book entries' expected worklists three ways: entries first, after these fixes, and after both sets.

### 9. The mixed names: dry lists and the editors' fixes

The 49 census rows marked ⚠ in measurement 4: names whose MT forms are partly official.

**Dry lists.** `instruments/mixed-readonly.cjs` is built by `build-never-official.py --mixed` from the
same classifier as measurement 6. Unlike measurement 6, it keeps a segment that also holds the
official name and marks it `alsoOfficial`, because an editor fixes the non-official form there too.
The worklist's skip rule would have dropped exactly those segments. → `data/mixed-lists.json`,
`reports/mixed-segments.md`. **Result:** 309 listings over 156 distinct segments; 17 also hold the
official name, and 25 listings rest only on a near match.

**Fixes.** Same rule script, same rulings. `instruments/fetch-mixed-targets.cjs` read the 156
segments read-only on production → `data/mixed-targets.json`. No segment had a live edit.
→ `reports/editor-fixes-mixed.md`, `reports/editor-fixes-mixed-paste.txt`,
`reports/editor-fixes-mixed.json`

- **17 are already drafted in an earlier set** (10 in measurement 7, 7 in measurement 8).
  Their text is asserted identical, and they are left out of the paste file.
- **22 have nothing to fix.** They were listed only by a near match that is not an element name
  (`röðina`, `talin`, `kalksteinn`, `magn`, `Seaborg`) or by an excluded noise base. They are named in
  the review and left out of the paste file.
- **The other 117 change:** 150 name fixes, 50 compound fixes and 1 phrase edit.

Three additions to the rule script for this run; none changes a measurement-7 or measurement-8
output, which still rebuild byte-identically:

1. **A ruling-2 phrase rule** for the actinide series' glossary definition,
   `(einnig, aktínóíðaröð) aktín og …` → `aktíníum og …`. It is the counterpart of the lanthanide one.
2. **Beryllium misspelt with one *l*** (`berillíum`, `berillín`) is added as a base by name. The
   census had it only in its weak tier; that tier's other words are not element names.
3. **A marker guard.** In each word-level step, every marker's type and every id after a `|` must
   come out unchanged, so no name inside an xref or a term id is ever rewritten.

**Anchoring check.** `instruments/check-anchoring.py` confirms that every name fix in measurements
7–9 sits in a segment whose *English* names that element: **0 unanchored**, in all three sets. It
exists because the rule script fixes every off-list name in a segment, and a few bases are also
ordinary words (`serín` is also the amino acid serine, `renín` the enzyme renin).

### 10. The hand fix: hafnium's garble in the periodic-table alts

The MT wrote **`hafnfn`** for hafnium in the four periodic-table alts (ch2 `m68695`, ch18 `m68829`,
ch19 `m68842`, appendices `m68859`), always in the nominative slot `„72; hafnfn; Hf; …“`. It is not a
recognisable form of any name, so no rule in measurements 7–9 could fix it. **[USER] ruled on
2026-11-21 that it reads `hafníum`.** BÍN has the form.

The rule script holds this in an explicit hand-fix table (`HAND`), applied as its own verified step
after the name fixes, and asserts that no `hafnfn` remains. The four alts belong to measurement 7's
set and are the overlaps in measurements 8 and 9, so all three runs were regenerated:

- **In each run, only those four segments change, and only by `hafnfn` → `hafníum`.** Every other
  segment, count and key is identical.
- `editor-fixes-paste.txt` differs by those four words. The paste files of measurements 8 and 9 are
  unchanged, since they leave the alts out.

`check-anchoring.py` now covers hand fixes as well; it reports 0 unanchored in all three runs.
Measurement 7's counts above (35 substitutions, 5 phrase edits, 221 name fixes) stand; the hand fix
is counted on its own, 4 per run.

### 11. A draft §C73 recommendation for the 68 names with no chemistry row

**A draft for [USER]'s ruling, not a ruling.** For each of the 68, it says whether a book glossary
entry is needed. `instruments/build-c73-recommendations.py` computes it from the measurement-4 census
and the official list. → `reports/c73-entry-recommendations.md`, `reports/c73-entry-recommendations.json`

§C73 asks what the MT does unprompted, so the rule classifies each name by how often the MT gets it
wrong:

| Class | Recommendation | Names |
|---|---|---:|
| never official | entry | 14 |
| unreliable (10% or more of the forms not official) | entry | 45 |
| reliable (under 10%: sodium, potassium, calcium, yttrium) | not needed by §C73 | 4 |
| homograph (*lead*, also the English verb) | no entry | 1 |
| absent from the book | no entry | 4 |

That makes **59 entries recommended**. The 10% threshold is the one free parameter, and every
name's share is in the report; calcium, yttrium, magnesium and cadmium sit within 5 points of it.
Beryllium's one-*l* forms and hafnium's `hafnfn` garble count as not official, and the noise bases
are left out.

**How the editor's term check treats compounds: measured in measurement 14.** It accepts the term
only as a whole word, so an entry warns on a segment that holds the official name only inside a
compound. For the 59 adds that is 151 warnings across 19 names (43 for magnesium), all advisory.
✏️ *Until 2026-11-21 this said "not measured" and suggested entering one frequent name first and
reading its warnings.* None of these names has a chemistry row, so each entry is an *add*, which gets
no worklist from the page; the segment fixes come from measurements 8–9.

### 12. The 59 book glossary entries of the §C73 ruling

Drafts for the head-editor page, not a measurement. [USER] accepted the §C73 draft (item 11) as is on
2026-11-21, so these 59 element names get a book glossary entry. `instruments/build-c73-entries.py`
builds them from the accepted recommendation, the census and the official list.
→ `reports/c73-entries.md` (the steps, the table and the 59 reasons), `reports/c73-entries.json`

- **Every entry is an *add*.** None of the 59 has a chemistry row to replace, so the page gives no
  worklist.
- **Checked read-only on production on 2026-11-21:** none of the 60 English forms (the 59 plus
  *cesium*) resolves in chemistry, is excluded as a whole headword, has a `book_term_preference` row
  or is claimed by a book entry; none is a house-style term.
- **Caesium** is looked up by OpenStax's spelling, *cesium*, with *caesium* as a second English form.
- **The reasons** follow change 6's convention: `[USER]:`, the official name, the decision record,
  the ruling (§C245), that name's measurement-4 counts in Icelandic, and the ruling date.
- **Order of work:** merge #756 and paste the editors' fix drafts, then **hold the 59** ([USER]'s
  ruling, 2026-11-21) until the term check accepts a word that starts with the term (measurement
  14). When the hold lifts, enter magnesium first and check that its 43 compound segments no longer
  warn, then enter the rest in one sitting (one export hold and release). ✏️ *Until 2026-11-21 this
  said to enter magnesium first and read its term warnings.*
- **Inflections** (✏️ *corrected 2026-11-21; the page had said that only superheavy names lack BÍN
  forms*). The page starts the BÍN lookup by itself after each add (`routes/book-glossary.js`);
  *Sækja beygingar* only retries it. `instruments/bin-outcomes-c73.cjs` runs the page's own chooser
  (`server/lib/binInflections`) over BÍN and writes only each name's outcome and number of forms
  → `data/c73-bin-outcomes.json`. **46 names get forms; 12 are not in BÍN** (protactinium, curium,
  lawrencium and nine superheavy names), **and lutetium has two BÍN entries, so it is refused.** The
  line in `reports/c73-entries.md` is now generated from that file. The outcomes matched the same
  chooser run read-only on production against its own copy of `SHsnid.csv` (same size, 376,901,553 bytes).

### 13. A non-official name inside a compound (beryllium, 1 segment)

Found on 2026-11-21 by a read-only dry run of the editor's term check for the 59 adds on production
(measurement 14). One of its warnings was not a compound: `miðberyllínatómið` in
`m68742:para:fs-idp122770240` (ch 7, "around the central beryllium atom"). The non-official
`beryllín` sits inside the compound. The census (measurement 4), and the dry lists and drafts built
on it (measurements 6–9), look for a non-official form only at the start of a word, so none of them
saw it.

- **The scan.** `instruments/scan-inner-non-official.py` reads every segment of the committed MT
  for the 69 census names' non-official bases of five or more letters inside a word, and gives each
  hit a verdict → `data/inner-non-official-scan.json`. **59 hits, 1 genuine.**
  - 16 start with another name's non-official base, a form the census already counts (`ytterbín`).
  - 42 are not element names: `glýserín` 15, `strikalína` 12, `alkalínrafhlaða` 11, `enteróbaktín` 4.
  - The genuine hit is the beryllium word, which is in no earlier draft.
- **The fetch.** `fetch-inner-targets.cjs` (from `build-fix-targets-fetch.py --inner`) read the
  segment's effective text read-only on production. It had no live edit. → `data/inner-targets.json`
- **[USER] ruled on 2026-11-21 that it reads `miðberyllíumatómið`.** The rule script holds it in the
  hand-fix table beside `hafnfn`, and the check after the hand step now covers every hand-fix word.
  Nothing else in the segment changes. → `reports/editor-fixes-inner.md`,
  `reports/editor-fixes-inner-paste.txt` (1 block), `reports/editor-fixes-inner.json`
- **Measurements 7–9 rebuild byte for byte** with the changed rule script, since the new hand fix
  occurs in none of their segments.
- **`check-anchoring.py` now finds a name inside a compound too.** When no official form starts the
  new word, it takes the longest official form of five or more letters that the word contains. It
  reports 0 unanchored in all four sets, and the first three sets' results are unchanged.
- The segment is in none of the nine entries' worklists.

### 14. The editor's term check on compounds: two read-only dry runs

Measured 2026-11-21 on production, read-only. One run is for magnesium alone, the other for the 59
§C73 adds entered together. Each added the entries to an **in-memory copy** of the database: the
file was opened read-only, serialized and reopened from the buffer, so the file was never written.
It then ran the server's own functions on that copy: `addEntry`, the BÍN chooser that the page's
automatic lookup runs, `buildEffectiveSegments` and `findTermsInSegments` (the term check). The
file's size and mtime were unchanged after each run, and the checkout stayed clean. Each run
measures three states (no entry; the entry before its BÍN inflections are stored; after), each on
the text as it is and with the fix drafts of measurements 7–9 overlaid. → `reports/termcheck-dryruns.md`

- **Instruments.** `termcheck-dryrun-magnesium.template.cjs` and `termcheck-dryrun-c73.template.cjs`
  are the templates as they ran. `build-termcheck-dryruns.py` refills them from the committed drafts
  and entries, and the scripts it builds are byte-identical to the ones sent to production. The built
  scripts are not committed, since they embed the drafts.
- **Data.** `data/termcheck-dryrun-magnesium.json` and `data/termcheck-dryrun-c73.json` are the raw
  outputs, ingested by `ingest-termcheck-dryrun.py`. That script reduces every BÍN form list to a
  count and asserts that no list survives under a `bin` key. BÍN is CC BY-SA and is not committed.
- **Result.** With the drafts pasted and the inflections stored, the 59 adds warn **152 times on 140
  segments, across 19 names. 151 are closed compounds only**: the segment holds the official name only
  as the first part of a longer word (`magnesíumhýdroxíð`, `baríumefni`). The other 1 is
  `miðberyllínatómið`, drafted in measurement 13. Before the lookup finishes the count is 212, and
  without the drafts it is 491. Magnesium alone gives 43, the same as its row in the 59-name run.
- **Why.** `wholeWordRegex` rejects a letter on either side of the term, so a closed compound does not
  contain it for the check; a hyphen is not a letter, so `magnesíum-jón` passes. The synthetic
  controls show this for every one of the 59 names.
- **Advisory.** The module report's route says "Advisory — no block", and a save cannot fail on its
  warnings. This is read from the code, not run.
- **Not in the runs:** the nine replacement entries (§C245 ①), and measurement 13's draft, which came
  after.
- **[USER] ruled on 2026-11-21 to hold the 59 adds** until the term check accepts a word that starts
  with the term (register §C245; step 3 of `reports/c73-entries.md`).

## Blind spots

- **The English anchor sees only the name as a whole word.** A segment whose English says `Na+`,
  `lanthanide` or a formula is not searched. A segment whose Icelandic gives only a formula (`BeF2`)
  has no word to find. *lead* is also a verb, which accounts for most of lead's 37 unmatched
  segments.
- **The counting unit differs by measurement.** The worklists count segments. The census counts
  word occurrences, compounds included (`natríumklóríð` counts as `natríum`).
- **A worklist lists whole words only.** Compounds of an old form (`sirkonmálmblöndu`, `pólonatóm`,
  `Neódýmseglar`) and derived words (`lantaníð-`) are not listed. The stem census in
  `data/dry-counts-9-names.json` shows them.
- **A segment holding the official name is skipped,** even if it also holds the old form. That is
  the worklist's rule, and these counts follow it.
- **Two kinds of list the head-editor page cannot produce.** Both statements come from reading
  `worklistSpec`/`buildWorklist`, not from running the page or creating an entry.
  1. A list where the MT's form differs from the resolved old form (ruthenium).
  2. A list for a name with no row: `worklistSpec` returns `add-alongside`, with no worklist, for an
     `entry-add` that replaces nothing.
- **The stem census in measurement 2 is diagnostic only.** Six of the old forms are prefixes of the
  official names (`astat` → `astatín`), so a prefix count would count words that are already
  correct.
- **The census classifier is heuristic.** Known noise counted as a variant: `kalkstein` (limestone,
  under calcium) and `aktiníðaröðin` (actinide series, under actinium). `prótín` would count under
  protactinium, though none occurred. Weak and unshaped words are listed, never counted. A garble
  is visible only if it shares 4 letters with the name (`hafnfn` did). Because of that garble,
  hafnium's "all official" covers 1 occurrence.
- **A non-official form inside a compound was invisible until measurement 13.** Its scan reads the
  committed MT, not pending edits. It knows only the census's non-official bases of five or more
  letters, skips any word holding an official name, and excludes the words it lists as not element
  names. A spelling the census never saw is still invisible.
- **The official list is parsed, not transcribed.** The page carries the table twice; both copies
  were identical. The þ spellings (`liþíum`, `rúþeníum`, `lanþan`, `prómeþíum`, `þallíum`) are where
  a transcription drifts.
- **A census word can come from inside markup.** The lanthanide census matched `Lanthanoid` in one
  segment. It is the target id of a cross-reference marker (`[[xref:CNX_Chem_19_01_Lanthanoid]]`),
  not reader-visible English, so it is counted as neither form.
- **A compound's element part is replaced by rule.** The rule is right for `liþíum-` compounds, where
  only the spelling changes. For an `-ín` → `-íum` compound (`samarínjón` → `samaríumjón`) it assumes the
  `-íum` form compounds the same way. Compounds on short forms are never changed, only flagged.
- **The editors' fixes are drafts against the 2026-11-20 text.** Pasting a whole segment replaces
  whatever it holds at that moment. If any of the 26 is edited first, re-run the fetch and the build
  before pasting.
- **This is a snapshot.** The MT layer does not change by hand, but pending and approved edits do,
  so the effective segments move as editors work.
