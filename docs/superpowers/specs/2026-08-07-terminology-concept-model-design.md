# Terminology: concept-oriented model (design)

**Date:** 2026-08-07 · **Register item:** new, supersedes part of §C14 ② · **Baseline:** branch
`fix/c14-remap-empty-subjects` (PR #371) · **Status:** design, not started

---

## 1. What this is for

Three problems share one root cause, and none of them can be fixed where they appear.

1. **A book cannot say which sense of a word it means.** `cell` is *fruma* in biology,
   *rafhlað* in electrochemistry and *flokkur* in mathematics — and a chemistry textbook may
   need two of those in one book.
2. **Preference and legitimacy are the same column.** `status='approved'` answers both "is
   this real Icelandic?" and "is this the term we use?", so bulk-attesting 28,903 rows
   silently destroyed a chooser (register §C14 ②, §C18).
3. **A book cannot fall back to a neighbouring field.** The export's subject scope is
   commented *"DELIBERATELY STRICT"* with no fallback, which is why adopting chemistry today
   would discard `pH`, `bond` and 110 other correct terms.

**The root cause is a missing entity.** The schema stores a headword as `(english, pos)` and
hangs every translation off it, so three different *concepts* that share an English string are
stored as three competing translations of one thing. No amount of tagging on the translation
row can express "these are not alternatives."

Íðorðabankinn is already concept-oriented — one entry per concept, with synonyms — and the
concept identity **survived** the original import in `idordabanki_id` while the structure
around it was discarded. This design restores a model the source already had. It is the
standard shape for terminology data (ISO 30042 / TBX): entries are concepts, and both
languages' terms hang off the concept.

## 2. Measured starting state

All measured on production, 2026-08-07. Every number here is re-derivable; none is quoted
from prose.

| | |
|---|---|
| Translations | **28,903**, every one `source='idordabankinn'` and `status='approved'` |
| Headwords | 20,272 |
| Head forms / synonyms | **20,774** carry `idordabanki_id` · **8,129** do not (`notes='Íðorðabankinn synonym'`) |
| With inflections | 9,715 (**33.6%**) |
| Subjects present | biology 13,561 · mathematics 9,137 · physics 5,496 · chemistry 709 |
| Subjects mapped but **empty** | `organic-chemistry` **0** · `microbiology` **0** |

**The competing-headword population partitions exactly:**

| Kind | Count | What it actually is |
|---|---:|---|
| One concept, many terms | **6,753** | An entry's head form beside its own listed synonyms |
| **Homographs across subjects** | **649** | *Different concepts* sharing an English string |
| Homographs within one subject | **0** | Does not occur in the imported data |

649 + 6,753 = 7,402, the total this register has carried since 2026-08-06.

**Worked example — `cell` (headword id 4110):** five translations hanging off one headword,
from **three** distinct Íðorðabankinn entries — 687862 (biology → *fruma*), 321691 (physics →
*rafhlað*, + synonym), 978712 (mathematics → *flokkur*, + synonym). Three concepts, one bucket.

### 2.1 Why a rebuild is cheap

- **`terminology_discussions` is the only external FK, and it has 0 rows.** Nothing else in
  the schema references a terminology id.
- **Only `terminologyService.js` reads these tables** in production code (plus migrations and
  one golden-capture script). Every route and consumer goes through its exported functions.
- **No project-authored Icelandic is at risk**: all 28,903 rows are `idordabankinn`. The
  project's own terms (`openstax-mt`, `openstax-glossary`, `chemistry-society-csv`) exist only
  in the committed glossary **file** — an import question, not a preservation one.
- The lead has approved a re-import.

**The editor-facing surface may be redesigned** (lead, 2026-08-07). The service API is not a
constraint on this design.

## 3. Decisions taken (lead, 2026-08-07)

1. **One concept per Íðorðabankinn entry. Import never merges.** Where two entries turn out to
   mean the same thing, an editor merges them — an explicit, recorded act. Rationale: import
   can never destroy a distinction, and the `cell` case is then correct with **zero** editorial
   work, while `antibiotic` surfaces as a visible choice.
2. **Preference is per book, with a per-chapter override.** Default resolves at book level;
   a chapter overrides where the book default is wrong.
3. **A term carries attestation + lifecycle; preference lives nowhere on it.** Íðorðabankinn
   terms have **no** lifecycle field — they are attested by arriving.
4. **Population is a clean rebuild with a fresh re-import.**
5. **Domain is OUR classification**, seven values, from OpenStax's book groups plus two.
   Árnastofnun's collection is retained as **provenance only, never a precedence key**.
6. **Import 20 collections** (5 existing + 15 new), 72,483 entries. ⚠️ This line read "17" until the spec self-review recomputed it from the list — a count in prose drifting from the list it summarises, inside a spec whose subject is exactly that failure.

## 4. Schema

```sql
-- A CONCEPT is one SENSE. One per Íðorðabankinn entry; never auto-merged.
CREATE TABLE concept (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  domain          TEXT NOT NULL,        -- OURS. See §5.
  idordabanki_id  INTEGER UNIQUE,       -- provenance; NULL for project-originated
  collection      TEXT,                 -- EFNAFR|LIFORD|… provenance ONLY, never a precedence key
  definition_en   TEXT,
  definition_is   TEXT,
  merged_into     INTEGER REFERENCES concept(id),  -- editorial merge; import NEVER sets this
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- A TERM is one lexical realisation, in EITHER language. Symmetric (ISO 30042).
CREATE TABLE concept_term (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id  INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL CHECK(lang IN ('en','is','la')),   -- 'la' — see §8.1
  text        TEXT NOT NULL,
  rank        INTEGER NOT NULL,   -- 1 = head form (Árnastofnun's own order), 2..n = synonym
  source      TEXT NOT NULL,      -- idordabankinn | openstax-mt | manual | mined-postedit | …
  inflections TEXT,               -- JSON array
  lifecycle   TEXT,               -- NULL for attested sources; proposed|accepted|rejected otherwise
  UNIQUE(concept_id, lang, text)
);

-- PREFERENCE: which term this book uses for this concept. The ONLY home for choice.
CREATE TABLE book_concept_preference (
  book_id     INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
  chapter     INTEGER NOT NULL,   -- 0 = book default · 1..n = chapter · -1 = appendices
  concept_id  INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  term_id     INTEGER NOT NULL REFERENCES concept_term(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, chapter, concept_id)
);

-- FALLBACK: which domains a book draws on, in order.
CREATE TABLE book_domain_priority (
  book_id  INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
  domain   TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (book_id, domain)
);
```

**⚠️ `chapter` is `NOT NULL` with `0` as the book-default sentinel, deliberately not nullable.**
In SQLite `NULL`s do not compare equal inside a primary key, so a nullable `chapter` would
permit `(book 1, NULL, concept 5)` twice — two conflicting "book defaults" for one concept,
with the schema silently allowing it. `-1` is already the appendices sentinel (item-14
`chapterLabel` contract), so `0` is free.

**⚠️ What is deliberately ABSENT.** There is no column on an Íðorðabankinn term that a bulk
`UPDATE` could set into a preference. The 2026-08-03/§C14 incident is not guarded against —
it is **unrepresentable**. Preference requires a row naming a book, and no bulk statement over
`concept_term` can express "and this is the term chemistry uses."

## 5. Domains

Seven values, ours, replacing `book_subject_mapping.primary_subject`:

`biology` · `chemistry` · `physics` · `astronomy` · `anatomy-physiology` · `mathematics` · `earth-science`

Collection → domain at import:

| Domain | Collections |
|---|---|
| biology | LIFORD, LIFORD2, ERFDAFR, ONAEMI, LYFJAFRLYFJASTOFNUN, FARALDSFRAEDI, LYDHEILSA, **FUGLAR**, **PODDUR** |
| chemistry | EFNAFR |
| physics | EDLISFR |
| astronomy | STJARNA, GEIMVISINDI |
| anatomy-physiology | LAEKN, TANNL |
| mathematics | STAERDFRAEDI, TOLFR |
| earth-science | LAND, JARDFRAEDI2, JARDEDLISFRAEDI |

**Proposed per-book priority** (lead-adjustable; this replaces `book_subject_mapping`):

| Book | Priority |
|---|---|
| `efnafraedi-2e` | chemistry › physics › biology |
| `lifraen-efnafraedi` | chemistry › biology › physics |
| `liffraedi-2e` | biology › anatomy-physiology › chemistry |
| `orverufraedi` | biology › anatomy-physiology › chemistry |
| `edlisfraedi-2e` | physics › astronomy › mathematics › earth-science › chemistry |
| `stjornufraedi` | astronomy › physics › earth-science › mathematics |

The **first fallback entry is load-bearing**: `efnafraedi-2e`'s `biology` is what returns
`pH`, `bond` and `carbon dioxide` — the 112-term loss that currently blocks chemistry's
glossary adoption.

## 6. Resolution

One function; every consumer uses it.

```
resolve(book, chapter, english_string):
  1. candidates ← concepts having an 'en' term matching the string,
                  following merged_into to the surviving concept
  2. in-scope   ← candidates whose domain appears in book_domain_priority(book)
  3. per candidate, choose its Icelandic term:
        preference for (book, chapter, concept)   -- chapter override
     else preference for (book, 0,       concept)  -- book default
     else the concept's rank-1 'is' term           -- Árnastofnun's head form
  4. winner ← the in-scope candidate with the LOWEST position
  5. if two in-scope candidates TIE on position → UNRESOLVED. Report; never guess.
```

- Step 3's fall-through is the **head-form default** — measured to resolve 7,277 of 7,315
  competing groups (99.5%), leaving **38** database-wide and **0** in chemistry.
- Step 4 is the **fallback hierarchy**, and it resolves most homographs with no editorial
  input: a chemistry book meets no chemistry `cell`, falls to physics, gets *rafhlað* —
  correct for electrochemistry.
- Step 5 is where `antibiotic` lands: LIFORD's *fúkalyf* and ERFDAFR's *sýklalyf* are two
  concepts in one domain, so nothing separates them and the tie is **surfaced**. That is the
  C18 defect made structurally impossible rather than guarded against.

## 7. Consumers

### 7.1 MT

`api-translate.js` already calls `filterGlossaryForText(glossary, chunkText)` before every
request, and a chunk belongs to a chapter — so the payload is built by calling
`resolve(book, chapter, string)` per English string present. **No new plumbing.**

- Resolved → include the pair.
- **Tied → omit, and count it** (what C18 does today). Forced: the MT glossary is a flat
  EN→IS map with no way to express two candidates, and no editor is present to ask. Sending
  either would be an unreviewed choice made by row order — the original defect.

⚠️ Adherence is measured and high (**93.3%–100%**, bracket from two methods with opposite
biases → `test-results/mt-glossary-adherence.md`), which is what makes a pre-MT choice worth
making: it buys **uniformity**, and uniformity is what makes a later reversal a mechanical
sweep rather than archaeology.

### 7.2 Editor

For a matched string the panel shows, in order: **the resolved term with its reason** (chapter
override / book default / head form of domain X) · **that concept's other Icelandic terms** in
`rank` order · **other in-scope concepts, labelled by domain** · **ties, marked unresolved**,
whose actions are *prefer this one* or *these are the same concept — merge*.

The editor is never shown five undifferentiated translations. They are shown one answer, its
synonyms, and the other senses.

### 7.3 Glossary export

`exportBookGlossary` emits one entry per resolved English string, with the concept's other
terms as `alternatives`. This is the change that makes adoption non-destructive: the export
stops being a subject-filtered dump and becomes a resolved view.

## 8. Import

**20 collections (5 existing + 15 new), 72,483 entries** (from 82 available / 203,017 total). ~25–30 min unattended
at the 1 req/s Árnastofnun policy; LIFORD and LAEKN exceed the 10,000 ES result cap and need
the per-letter fetching `fetch_idordabanki.py` already implements.

New relative to today's five: STJARNA 2,387 · GEIMVISINDI 210 · ERFDAFR 1,163 · ONAEMI 943 ·
LAEKN 33,593 · LYFJAFRLYFJASTOFNUN 943 · FARALDSFRAEDI 269 · LYDHEILSA 244 · TOLFR 502 ·
LAND 2,441 · JARDFRAEDI2 240 · JARDEDLISFRAEDI 349 · TANNL 829.

⚠️ **Per-collection yield is MEASURED, never assumed** — and the import must report, per
collection: entries fetched, EN and LA pairs, and hits against the real book text, so a
zero-yield collection is **visible** rather than silently bulking out the editor's search.

### 8.1 Species collections — the Latin route (measured 2026-08-07, lead-ruled)

**Add `PODDUR` (797) and `FUGLAR` (2,747)**, bringing the import to **20 collections /
72,483 entries**. Exclude `RISAEDLUR`, `FLORA`, `SJODYR`, `PLANTA`.

**`PODDUR` has NO English side at all — and that is precisely why it earns inclusion.** The
textbooks carry Latin binomials inline, so a Latin↔Icelandic collection can supply an Icelandic
name that **no EN→IS lookup could ever reach**. Measured against the complete source:

| Book | Latin present in the textbook | Icelandic only PODDUR supplies |
|---|---|---|
| `liffraedi-2e` | *Drosophila melanogaster* | ediksgerla |
| `orverufraedi` | *Drosophila melanogaster* · *Pediculus humanus* · *Ctenocephalides felis* | ediksgerla · fatalús · kattafló |

Small in count — ~9 terms extrapolated across the collection — and **non-substitutable**, and
one of them is the most-cited model organism in biology. This is what `lang='la'` in §4 exists
for. ⚠️ **The Latin route serves the EDITOR, not MT**: the MT glossary is EN→IS, so a Latin
term can never enter the payload. It surfaces when the Latin appears in a segment.

**`FUGLAR`'s previous exclusion rested on a false premise.** `idordabanki_collections.json`
records it as *"likely Latin-keyed like PODDUR"*; measured, it is **100% English** and produced
the most English-side hits of any species collection (Bald Eagle=*skallaörn*, Emperor
Penguin=*keisaramörgæs*, Common Buzzard=*músvákur*). *"Likely"* was doing all the work.

**`RISAEDLUR` is excluded on measurement, not assumption**: 0 hits across 221 sampled binomials
(~two-thirds of the collection). `FLORA`, `SJODYR` and `PLANTA` are excluded on **measured low
yield** (~0.3%, with English alternatives available) — a yield judgement, not an inherited one.

**⚠️⚠️ THE TRAP THAT NEARLY PUT A WRONG EXCLUSION IN THIS SPEC — the most reusable thing in
this section.** The first two runs of this measurement matched against `02-for-mt`, which holds
**13 of biology's 259 modules — 5% of the book**. Every collection returned **0.0%**, and that
number was one keystroke from being written down as *"confirmed, exclude them all"*. The
complete text was in `01-source/` the whole time. *An absence measured over 5% of a corpus is
not evidence of absence.* **Match species and terminology claims against `01-source`, which is
complete and read-only by project rule — never against the extraction, whose coverage is a
property of how much work has been done, not of the book.**

**Note the scale.** `EFNAFR` is only **593** entries — the chemistry collection is genuinely
small, which is why chemistry has 709 translations against biology's 13,561, and why the
fallback matters most for chemistry books. And `LAEKN` alone is 49% of the new corpus; it is
tolerable **only** because domains scope it — under the current flat model this import would
put medical vocabulary in front of a chemistry editor.

## 9. Rebuild path

1. Migration drops `terminology_headwords`, `terminology_translations`,
   `terminology_translation_subjects`, `terminology_discussions`, `book_subject_mapping`;
   creates the four new tables; seeds `book_domain_priority`.
2. `fetch_idordabanki.py` gains concept-oriented import: one `concept` per entry, terms in
   both languages with `rank`, `collection` and `idordabanki_id` retained.
3. `terminologyService.js` is rewritten around `resolve`.
4. Consumers updated (export, MT, editor routes).
5. Project-originated terms in the committed glossary files are imported as concepts/terms
   with `source` preserved and `lifecycle='proposed'`.

**⚠️ This supersedes migration 044 (PR #371)** — `book_subject_mapping` is replaced by
`book_domain_priority`. **PR #371 should still merge**: it fixes organic's and microbiology's
empty editor panels *now*, and this rebuild is not days away.

## 10. Testing

- `resolve` is the centre of gravity: table-driven cases for chapter override, book default,
  head-form fall-through, cross-domain fallback, merged concepts, and **ties**.
- ⚠️ **A tie test must assert the tie is REPORTED, not merely that no term is returned.** An
  empty return is what a lookup miss also produces; distinguishing them is the whole point.
- Import: a fixture entry with head form + synonyms yields **one** concept with ranked terms,
  not several concepts. Mutation: collapsing `rank` must redden it.
- A real-tree assertion that every registered book has a `book_domain_priority` row — the
  failure mode this design exists to remove is a book silently scoped to nothing.
- Golden-oracle care: `capture-c24-golden.js` reads these tables directly and will need
  regenerating; treat a changed golden as a **finding to explain**, not a file to overwrite.

## 11. Non-goals

- Choosing terms for any book. The model makes choice expressible and visible; editors make it.
- Merging concepts at import. Never automatic (decision 1).
- Predicting Árnastofnun's classification for submissions. The lead's ruling: we should not
  try, so `collection` is provenance and our `domain` is operative.
- Sense disambiguation from context. Explicitly rejected in favour of per-chapter overrides:
  deterministic and visible beats inferred.

## 12. Risks

1. **Re-import is a one-way replacement of the DB's terminology.** Safe by measurement (§2.1),
   but the ordering matters: build and verify the new model on a **copy** before dropping.
2. **72,483 entries is 2.9× today's corpus.** If the domain scoping is wrong, the editor's
   experience gets worse, not better. The real-tree priority assertion in §10 is the guard.
3. **`LAEKN` at 46% of the corpus** is the single largest bet. Mitigation: no current book
   lists `anatomy-physiology` first, and its yield is measured per §8 before it is kept.
4. **`resolve` is now on the hot path** that C24 just spent a branch making fast. Any
   implementation must be benchmarked against C24's golden, not assumed comparable.
