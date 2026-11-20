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
- **The official list is parsed, not transcribed.** The page carries the table twice; both copies
  were identical. The þ spellings (`liþíum`, `rúþeníum`, `lanþan`, `prómeþíum`, `þallíum`) are where
  a transcription drifts.
- **A census word can come from inside markup.** The lanthanide census matched `Lanthanoid` in one
  segment. It is the target id of a cross-reference marker (`[[xref:CNX_Chem_19_01_Lanthanoid]]`),
  not reader-visible English, so it is counted as neither form.
- **The editors' fixes are drafts against the 2026-11-20 text.** Pasting a whole segment replaces
  whatever it holds at that moment. If any of the 26 is edited first, re-run the fetch and the build
  before pasting.
- **This is a snapshot.** The MT layer does not change by hand, but pending and approved edits do,
  so the effective segments move as editors work.
