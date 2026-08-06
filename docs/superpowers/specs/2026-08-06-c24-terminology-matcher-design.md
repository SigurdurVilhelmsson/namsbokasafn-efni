# C24 — replace the term-matching primitive in `findTermsInSegments`

**Created:** 2026-08-06 · **Register item:** [`§C24`](../../plans/2026-07-21-post-item17-followup-campaign.md) (P1, `[CODE]`)
**Baseline:** `main` `65a26034`, root `npm test` **268 files / 3868 tests green**, 160.6 s (measured 2026-08-06 10:50)

> **Status discipline.** This document is a *design record*, frozen on the date above. It is
> **evidence, never status**. If it disagrees with the active register, **the register wins**.
> Per CLAUDE.md § *One source of truth* it carries no status verbs and no live counts; the
> baseline figure above is a dated measurement, not a claim about any later tree.

---

## 1. Problem

Opening any module in the production editor freezes the **whole server** for ~2.6 minutes.

`terminologyService.findTermsInSegments` (`server/services/terminologyService.js:1331`) loads every
approved/proposed translation row on every call, compiles a fresh `RegExp` per headword and per
translation-inflection-alternation, then runs **every term against every segment** — synchronously,
with no `await` and no yield.

Measured on prod (register §C24): **28,903 rows / 20,073 headwords / 120,340 inflection forms →
48,976 `RegExp` objects compiled per request**, then 20,073 × 282 segments = **5.66 M regex
executions**. Two editor endpoints funnel into it:

| endpoint | segments | measured |
|---|---|---|
| `GET …/:moduleId/terminology-report` | whole module | 77,674 ms / 99,858 ms |
| `GET …/:moduleId/terms` | whole module | 77,085 ms / 98,563 ms |
| `POST …/:moduleId/edit` (save) | 1 | ~45 s (benchmark projection, **never observed on prod**) |

They run back-to-back on one module open. **The event loop is blocked, not merely busy** — zero
requests are logged across either window, then a backlog drains in a single second. One editor
opening one module takes the server away from all ~5 editors.

The lead has **declined a stopgap** (register, 2026-08-06), so production stays as it is until this
lands: C24 blocks editorial work outright.

### Filed and ignored once already

`docs/audit/security-audit-2026-05-29.md` **SA-18** — *"unbounded synchronous regex matching…
event-loop amplification"*. C23's instrumentation did not discover a new problem; it made a known,
ignored one impossible to ignore.

---

## 2. What this change is — and is not

**It is one narrow swap of a single primitive**, inside `findTermsInSegments`:

```js
// terminologyService.js:1421-1422 — the entire change surface
term.regex.lastIndex = 0;
const enMatch = term.regex.exec(seg.enContent);
```

Everything else is preserved **byte-for-byte**: `translationTier`, the in-scope/fallback partition
(`:1388-1403`), the `consumed` span-claiming tiler (`:1418-1433`), the translation ranking sort
(`:1436-1442`), match-object construction (`:1445-1462`) and issue construction (`:1465-1483`).

**Out of scope** (lead decision 2026-08-06, "narrow swap only"):

| Not in this PR | Why it is adjacent | Where it goes |
|---|---|---|
| C7 terminology governance | governance *around* the term store, not the matcher | P2 batch, unchanged |
| The vacuous `/terms` route test | `server/e2e/terminology-multibook.spec.js:61-74` accepts 404 **or** 500 as a pass | log to register — ⚠️ but see §4.9: two *behavioural* tests **are** ported onto that route, by an explicit lead exception. Do not let the port drift into rewriting this one. |
| Coverage for the two untested wrappers | `getSegmentTerminologyWarnings`, `getModuleTerminologyReport` | log to register |
| C20 archive `error` listener · C22 button gate · C26 audit | separate items | unchanged |
| Adding Icelandic inflections (BÍN) | `buildInflectionRegex` **is** this hot path; raising stored forms moves the correctness oracle while we rewrite the implementation beneath it | blocked until this lands |

**One deletion is in scope** (lead decision 2026-08-06): `POST /api/terminology/check-consistency`.

### Tests that ARE in scope

Tests pinning *this function's own* equivalence are part of the swap, not a widening: the golden
oracle, the differential, the fold sweep and the compile-count assertions all test the code being
changed. What is excluded is coverage of *adjacent* surfaces (routes, `segmentEditorService`
wrappers).

---

## 3. Why Aho-Corasick, and why not the obvious levers

All measured against a materialised prod-scale DB with the **unmodified** production function
(register §C24 "Fix direction", 2026-08-05, independently audited):

| lever | result | verdict |
|---|---|---|
| baseline (dev box) | 136–139 s / call | — |
| **cache every regex** | ~128 s cold / **~64 s warm** | ❌ still a total server block |
| chunking | 27.9 µs/exec at 200 live regexes | ❌ |
| loop reordering | 2× | ❌ |
| tokenise + hash | **137 of 600 fixtures diverged**, always over-matching | ❌ **rejected on correctness** |
| **Aho-Corasick** | **6.8 ms**, byte-identical 52,445-byte output | ✅ |

**"Recompiles ~49,000 regexes per call" is not the headline.** Caching them is not the fix. The
dominant cost is the 5.66 M executions of a `\p{L}\p{N}` lookbehind, whose per-exec cost degrades
**~67×** with the number of distinct regexes V8 has *seen*.

⚠️ **A caching-only change would make saves fast and leave page loads broken — and would look like
success.** At n=1 segment the *build* dominates (~45 s → ~0.4 s); at n=282 the *scan* dominates
(~138 s → ~64 s, still an outage). This is the single most likely way to ship a green half-fix.

---

## 4. Design

### 4.1 The invariant

> **`firstWholeWordOccurrence(headword, segment)`** — the **earliest** position at which the
> headword occurs **with whole-word boundaries**. Filter to whole-word **first**, then take the
> earliest. **Never "all occurrences."**

This exactly reproduces `.exec()` on
`/(?<![\p{L}\p{N}_])(?:escaped)(?![\p{L}\p{N}_])/giu` (`wholeWordRegex`, `:1877-1882`).

**This is the trap.** Today, a term whose *first* occurrence is swallowed by a longer term's claimed
span is dropped **entirely** (`overlaps → continue`, `:1429-1430`), even when it recurs later
unoverlapped. AC naturally yields all occurrences, and the tempting next step — "try the next one,
it doesn't overlap" — is an *improvement* that silently breaks byte-identity:

```
"The atomic mass unit is defined so that mass can be compared."
  current:  "atomic mass"@4
  naive AC: "atomic mass"@4, "mass"@40      <-- DIVERGES
```

`matches[]` grows and missing-term issues shrink on real segments. **The existing suite cannot catch
it**: `server/__tests__/terminologyService.test.js:881` places the short term *first*, so the
divergent ordering is untested. Hence §5.2.

⚠️ **Reduce by "smallest `begin` wins", and filter to whole-word BEFORE reducing.** The
implementation is a loop over hits maintaining a `Map`, where `<` vs `<=` is the difference between
"earliest" and "last", and filtering after reducing silently yields a *different position* than
filtering before. All three variants look correct and none of the existing pins distinguish them.
Pinned by §5.5.

### 4.1.1 Duplicate English headwords are a correctness invariant, not plumbing

The automaton is keyed by **string**, but the schema is `UNIQUE(english, pos)`
(`server/migrations/032-terminology-redesign.js:38`) — **not** unique on `english`. (SQLite treats
NULLs as distinct in a UNIQUE index, so even two NULL-`pos` rows are permitted; `upsertHeadword`'s
explicit `pos IS NULL` handling at `:110` shows the code already knows this.) The same English
string legitimately exists as **two headword rows** with different parts of speech, and the SQL
groups by `h.id, t.id`, so both reach `terms` as independent entries.

Today each has its own regex, each finds the **same** position; the first in `terms` order claims the
span and the second is dropped by the overlap check. **Reproducing that requires mapping keyword →
*list* of headword ids, all sharing one position.** A lookup keyed on the string alone would drop
the siblings *before* the tiler ever sees them — a different result, arrived at earlier.

This is a second reason the §5.0 tie-break matters: two rows with identical `english` have identical
`LENGTH`, so `h.id ASC` is what makes which-one-wins deterministic.

**Measured on prod (§4.10): 20,272 headwords, 20,272 distinct `english` — ZERO duplicates.**

So this is **defence, not a reproduction of observed behaviour**. Say so in the code comment. The
schema permits the collision and `importGlossaryTerms` can create one tomorrow; the committed
glossary corpus already carries 1,102 English strings appearing in more than one book's file. But no
test can be justified as "matching production" here — the §5.5 pin is a *guard against a state prod
does not currently occupy*.

### 4.2 The outer loop does not move

`terms` is ordered in-scope-before-fallback (`:1400-1403`), and within each group by SQL's
longest-first. **That ordering is the homograph precedence policy** — `consumed` claims spans in
exactly that sequence. The loop stays; only the `exec` inside it is replaced by a map lookup.

### 4.3 Data flow

```
rows (SELECT, every call)
   │
   ├─► fingerprint of (headword_id, english) pairs ──► automaton cache (hit / rebuild)
   │
   ├─► termMap / partition / terms[]              (unchanged)
   │
   └─► per segment:
         foldedText  = foldPerChar(seg.enContent)          length-stable
         hits        = automaton.match(foldedText)         {begin, end, keyword}[]
         candidates  = hits.filter(wholeWordAt(seg.enContent, begin, end))
         firstByHw   = earliest candidate per headwordId   ← THE INVARIANT
         │
         └─► for (const term of terms)   ← UNCHANGED loop
                 enMatch = firstByHw.get(term.headwordId)
                 ... consumed / tiering / issues unchanged
```

### 4.4 Case folding

**Fold per character, never `String.prototype.toLowerCase()` on the whole string, never
`toLocaleLowerCase`.** Empirically swept across all 1,112,064 code points (Node v22.22.2 / ICU 78.2):

- **Exactly one** code point changes string length under `toLowerCase()`: **U+0130** `İ` → `U+0069
  U+0307` (2 chars). Nothing else in Unicode, including astral. It is guarded as an identity
  mapping, which is also what `/iu` does (`pat "İ"` vs `hay "i̇"` → regex **false**).
- Per-character folding is **context-free**, which removes `Final_Sigma`. `"ΟΣ".toLowerCase()` is
  `"ος"`; per-char gives `"οσ"`. **Per-char is the one that agrees with `/iu`**
  (`/σ/iu.test("ΟΣ")` is `true`).
- `"I".toLocaleLowerCase("tr")` → `"ı"` (U+0131). Locale-sensitive folding must never be used.

`/iu` uses simple case **folding**; `toLowerCase()` is lowercase **mapping** — different Unicode
operations (`scf(µ)=μ`, `lower(µ)=µ`). 92 code-point pairs disagree, requiring an override table of
~25 entries: U+00B5 µ, U+017F ſ, U+0345, U+03C2 ς, U+03D0, U+03D1, U+03D5, U+03D6, U+03F0, U+03F1,
U+03F5, U+1E9B, U+1FBE, U+1C80–U+1C88, U+A64A/B, plus the U+0130 identity guard.

Contrary to common claims, these **agree** and need no entry: Kelvin U+212A↔k, Angstrom U+212B↔å,
ẞ U+1E9E↔ß, dotless ı.

**Length-stability is why positions survive.** Both AC and the boundary check index by UTF-16 code
unit; a length-stable fold makes folded offsets identical to original offsets, so no position
mapping table is needed.

**Reachability — MEASURED on prod, not proxied (§4.10).** The complete set of non-ASCII characters
across all **20,272** English headwords is:

```
´ U+00B4 (22)   ö (8)   é (6)   ë (3)   ü (3)   ô (1)   ç (1)
```

Seven distinct characters. **No Greek, no Cyrillic, none of the 92 disagreeing pairs.** Reachability
on the AC path today is **0 — measured, not inferred.**

⚠️ **The override table is still load-bearing, and this is the reason to keep it rather than skip
it.** The AC path folds `seg.enContent` — arbitrary English source text — against these headwords,
and `importGlossaryTerms` can add Greek headwords at any time: the committed glossary corpus already
carries `σ π Δ α β γ` in its `english` field (`"σ* bonding orbital"`, `"pi bond (π bond)"`). The
moment a `σ` headword exists, a `ς` in text is one segment away, and `scf(ς) = σ` while
`toLowerCase(ς) = ς`. Direction of failure is **under-match** — a suggestion silently disappears,
the §C18 failure shape, with a green suite. Hence the exhaustive sweep in §5.4 rather than a spot
check.

**No NFD and no astral code points anywhere in the terminology tables** (`not_nfc_strings` = 0
across headwords, translations and inflections). UTF-16 index arithmetic is safe there. ⚠️ This does
**not** extend to segment text — `books/orverufraedi/01-source/ch10/m58835.cnxml` carries decomposed
`ü` (§4.5).

### 4.5 Boundary semantics — preserved exactly, including a pre-existing flaw

The boundary predicate stays `[\p{L}\p{N}_]`, applied to the **original** text at `begin-1` and
`end`. This excludes `\p{M}` (combining marks), so the lookaround succeeds mid-grapheme:

```
headword "Bru" vs "Brünn" (NFD) -> MATCHES   <-- false positive, TODAY and after
headword "Bru" vs "Brünn" (NFC)  -> no match
```

Icelandic `á é í ó ú ý þ æ ö ð` are precomposed everywhere in this corpus (headwords 0 NFD;
`02-for-mt`, `02-mt-output`, `03-faithful-translation`, `05-publication` all 0 NFD). One exception:
`books/orverufraedi/01-source/ch10/m58835.cnxml` carries `ü` as U+0075 U+0308 ×3 in a Mendel
citation.

**This hazard is pre-existing and reproduced exactly. It is not introduced by the swap and is not
fixed by it.** Changing it would be a behaviour change outside the narrow scope.

⚠️ **The boundary check must step by CODE POINT, not code unit.** The lookbehind evaluates the
preceding *code point*; a naive `text[begin - 1]` reads a lone low surrogate, which is never
`\p{L}`, so `"𝐀atom"` would match under the new path but not the old. Not reachable in today's data
(§4.10 measured zero astral code points), but the guard is one line — back up over a surrogate pair
with `codePointAt` — and §5.2's generator alphabet must include astral characters or the class is
untestable.

**No astral code points exist anywhere** in headwords (3,270) or across 01-source (1,192 files /
35.5 M chars), 02-for-mt, 02-mt-output, 03-faithful-translation or 05-publication. UTF-16 index
arithmetic is safe on today's data.

### 4.6 The cache: automaton only, stale-proof by construction

Today the function re-reads the DB on every call, so it **cannot** serve stale data. A cache trades
that away, and the register's research measured speed, not staleness. Given
`getSegmentTerminologyWarnings` and `getModuleTerminologyReport` have **zero tests**, a stale-cache
bug would ship green.

**Therefore: cache only the automaton.** It depends solely on the `(headword_id, english)` pairs.
We already `SELECT` those rows every call, so the fingerprint is computed **in memory from rows
already read** — no extra query, no invalidation hook, no second connection, no test-mode special
case. Translations, inflections, subjects and statuses are re-read every call exactly as today.

**Fingerprint: a hash over the concatenated `id‖english` pairs in row order.** Not `count + sum(id)
+ sum(length)` — a length-preserving rename (`atom` → `aton`) would evade it.

Rejected alternatives, and why (from the invalidation survey):

- **`PRAGMA data_version` on `_db`** — all 16 mutators write through the *same* module-singleton
  connection (`terminologyService.js:91-102`), and per
  [sqlite.org](https://www.sqlite.org/pragma.html#pragma_data_version) data_version is *"unchanged
  for commits made on the same database connection."* **It would detect nothing that actually
  happens today.**
- **Explicit epoch bumped by every mutator** — 16 functions (`createTerm`, `addTranslation`,
  `updateHeadword`, `updateTranslation`, `approveTranslation`, `batchApproveTranslations`,
  `disputeTranslation`, `rejectTranslation`, `deleteHeadword`, `deleteTranslation`, `importFromCSV`,
  `importFromExcel`, `importGlossaryTerms`, `importFromKeyTerms`, `proposeMinedTerm`,
  `upsertHeadword`) **plus** `ON DELETE CASCADE` paths. One miss = a silent stale cache.
- **mtime columns** — `terminology_translation_subjects` has **no timestamp at all**, and retagging
  is DELETE+INSERT (`:433-435`, `:487-491`), invisible to any mtime scheme. `CURRENT_TIMESTAMP` is
  also 1-second granular, and DELETEs leave no trace.

**Second connection with `data_version`** remains available as a later optimisation if the
fingerprint measures too costly, but is not in this design.

⚠️ **Do not expect §3's 6.8 ms.** That figure is the register's *fully cached* AC measurement. This
design deliberately re-reads and re-parses every row on every call — 28,903 rows including a
`JSON.parse` per `inflections` blob — buying stale-proofness at a real cost. **The expected per-call
figure is therefore higher and is unmeasured; measure it on `m68700` and report the number rather
than shipping an estimate** (§7.2). If it proves unacceptable, the escalation path is caching the
parsed rows too — which reintroduces the invalidation problem §4.6 exists to avoid, and is a
decision to bring back to the lead, not to take silently.

### 4.7 Lazy `isRegex`

`buildInflectionRegex` is constructed **28,903 times** and executed **~313 times**.

🔴 **Lazy construction is MANDATORY — it is load-bearing for the entire performance claim, not
cold-path hygiene.** The register frames the eager cost as a stall "on every cache invalidation",
but that assumes a design where the term set is cached. **This design deliberately re-reads and
rebuilds the translation objects on every call (§4.6)**, and `buildInflectionRegex` sits in that
per-call path at `:1376` — *not* in the cached automaton build. So without laziness the ~28,903
compiles are paid **on every single request**, and the 6–11 s figure becomes a per-request stall.
**A correct AC implementation with eager `isRegex` is not a fix at all.**

⚠️ **The 4.16 mean hides a long tail: one production translation carries 72 inflection forms**
(§4.10) — a 73-alternative regex. Size any per-regex reasoning against 73, not against 4.

⚠️ **The memoised accessor lives on per-call-rebuilt objects**, so the ~313 regexes that *are*
executed recompile every call. That is acceptable — but it is a real per-call cost and belongs in
§4.6's accounting, not omitted from it.

⚠️ **Do not `Object.freeze` the cached term objects** — a memoised accessor must be able to write
its cached value.

⚠️ **The Icelandic side stays a regex.** Per the audit: do **not** move the boundary check out of
`buildInflectionRegex`. A post-hoc boundary test **abandons a position when the longest alternative
fails**, instead of backtracking to a shorter one as the lookbehind does for free. Verified
counterexample: forms `['mól','mól (m)']` against `mól (m)x` yields a false `fannst ekki` warning.
Structurally unreachable on the English side (always one alternative) — safe there, unsafe on the
Icelandic side.

`isRegex` is consumed only via `.test()` (`:1469-1470`) — boolean, no offsets — so position
stability is moot there; only fold *correctness* matters. An ASCII-only fold would be a correctness
bug on this side (`þingvellir/Þingvellir`, `æxlun/Æxlun`, `öld/Öld` all differ), and the local test
DB's 6 pure-ASCII Icelandic forms hide it entirely.

### 4.8 Dependency

**`@monyone/aho-corasick`** — MIT, **zero runtime dependencies**, no `install`/`preinstall`/
`postinstall` hooks, full dual `require`/`import` exports map (CJS-safe; `server/package.json` is
`"type": "commonjs"`), 53,089 weekly downloads, actively published. Returns `{begin, end, keyword}[]`
— begin index is what the invariant needs.

Verified by `npm pack` and reading the tarball, **not** from `npm view` — per CLAUDE.md, `npm view
<pkg> scripts` reports the *source repo's* manifest, not the shipped artifact. **Re-verify at
install time.**

MIT into AGPL-3.0 is one-way compatible. It is **exactly one new lockfile entry** in `server/`, zero
new advisory surface, and no interaction with the five existing `overrides`.

⚠️ **Its two headline features are unusable here and must not be used:**
- `Boundary.AsciiEdge()` is **ASCII-only**; ours is Unicode `\p{L}\p{N}_`.
- `/greedy` is leftmost-longest; our semantics are per-term-first-occurrence + priority-ordered span
  claiming. **Not** leftmost-longest.

We use only the raw automaton.

⚠️ **Install discipline:** `server/package.json:37` pins `xlsx` to a `cdn.sheetjs.com` tarball URL.
Run `npm install` inside `server/` with that host reachable, then `git diff server/package-lock.json`
and confirm the **only** change is the new package — the URL dependency entry must survive
byte-identical.

⚠️ **Duplicate English headwords:** the automaton is keyed by *string*, but several headword ids may
share one `english`. Map keyword → **list** of headword ids; a lookup keyed on the string alone
would drop siblings. Case-variant duplicates (`Atom` / `atom`) fold to one keyword and are handled by
the same list.

⚠️ **Empty and whitespace-only headwords must mirror `wholeWordRegex` exactly.** It maps falsy
`english` to `/(?!)/` — matches nothing (`:1878-1879`) — so falsy keywords must be **excluded** from
the automaton (an empty pattern would also loop forever in most AC outputs). But whitespace-only
`english` currently **does** match a lone space: `' '` passes the `!english` guards at `:278`,
`:985`, `:1074`, and only `:1116` trims. It must therefore be **included**. Two opposite answers, one
line apart — do not collapse them into a single "skip blanks" check.

### 4.9 Deleting `POST /api/terminology/check-consistency`

Lead decision, following the `/jobs` precedent (issue #328). Confirmed dormant: **zero production
callers**; the only references are 4 E2E assertions (`server/e2e/terminology.spec.js:646, 661, 758,
786`).

It is also the **only** `findTermsInSegments` call site gated by `requireAuth` **alone**
(`server/routes/terminology.js:1101`) — no `requireRole`, no book scope — with a **caller-supplied,
unbounded, unvalidated `segments` array**. Any authenticated user, including `viewer`, can hand it
an arbitrary segment list. Under today's cost that is a one-request server-outage handle.

Deleting it removes **two** call expressions — `terminology.js:1107` (segments branch) and `:1122`
(legacy `content`/`sourceContent` branch) — taking the blast radius from **5 expressions to 3**
(`segment-editor.js:1000`, `terminologyService.js:1718`, `:1732`), or 4 calling functions to 3. It
also removes the handle.

⚠️ **`docs/_generated/routes.md:305` lists this route, and `docs-check.yml` path-triggers on
`server/routes/**` then diffs `docs/_generated/` after `npm run docs:generate`.** Regenerate it in
the same PR or the gate goes red. Loud, but it is not in §7's checklist otherwise.

⚠️ **The deletion removes two whole *tests*, not four assertions** — `server/e2e/terminology.spec.js:746-772`
("detects missing translation") and `:774-799` ("passes when translation present"). They create a
term, approve it, and assert the `missing` issue appears / does not, driving `findTermsInSegments`
through a real server and a real DB. They are the only **integration-level** exercise of the issue
path. The behaviours themselves are already unit-pinned at `terminologyService.test.js:1129-1174`,
so what is lost is the real-server path, not the behaviour.

✅ **LEAD DECISION 2026-08-06 — PORT THEM to `GET …/terms`, in this PR.** This is a deliberate,
narrow exception to the §2 scope fence, and the reason is specific: without it the PR is
**net-negative on tests for the very function it rewrites**, at the moment of maximum risk.
Preserving coverage we are deleting is not the same as adding coverage to a new surface.

⚠️ **Porting is not transcription — the shapes differ.** The deleted tests use the legacy
`content`/`sourceContent` branch (`terminology.js:1119-1132`), a synthetic single segment with
`segmentId: 'single'`. `GET …/terms` takes a **whole module** off disk and returns `termMatches`.
The ported tests must seed a term whose English actually occurs in a real fixture module's EN, and
assert on that module's response. **They must not inherit the sibling's branchless
`expect([404,500]).toContain(...)` idiom** (`terminology-multibook.spec.js:61-74`) — the failure mode
this whole item exists to stop. A ported test that accepts a 500 has preserved nothing.

### 4.10 Production census — measured 2026-08-06

Read-only, with the owner's explicit per-request authorization; `readonly: true` at the connection,
aggregate counts and a character inventory only, **no table dump and nothing copied off the box**.
Recorded here because several design claims turn on it and a proxy corpus had been standing in.

| | measured | note |
|---|---|---|
| `terminology_headwords` | **20,272** | distinct `english` also **20,272** ⇒ **zero duplicates** (§4.1.1) |
| `terminology_translations` | **28,903** | **all `status='approved'`; zero `proposed`** |
| headwords with an in-scope translation | **20,073** | matches the register exactly |
| inflection forms | **120,340** | mean 4.16, **max 72 on one translation** |
| `MAX(LENGTH(english))` | 54 | |
| subject tags | biology 13,561 · mathematics 9,137 · physics 5,496 · **chemistry 709** | every translation has exactly **one**; **0 untagged** |
| `book_subject_mapping` | chemistry, microbiology, biology, organic-chemistry, physics | **no `mathematics` book** |
| non-NFC strings / astral code points | **0 / 0** | across all three tables |

**Three consequences the design would otherwise have got wrong:**

1. **The fallback path is the DOMINANT path in production, not an edge case.** For a chemistry book
   (`bookSubject = 'chemistry'`) only **709 of 28,903** translations are in-scope; **~28,194 are
   tier `fallback`**, and mathematics' 9,137 are permanently fallback for *every* book since no book
   maps to it. A balanced fixture would exercise almost none of what prod runs. → §5.1.
2. **`translations_with_no_subject` = 0**, so the "untagged ⇒ in-scope" branch of `translationTier`
   (`:1319`) is **never taken in production**. It is pinned by unit tests only. Do not use "prod
   never hits it" as licence to change it — but do not mistake a passing fixture for coverage of the
   live shape either.
3. **Zero `proposed` rows**, so the translation ranking's `approved`-beats-`proposed` tiebreak
   (`:1439-1441`) is currently inert in production. The golden must still exercise it from fixtures;
   it is one approval workflow away from mattering.

**Two data-quality oddities, logged not fixed** (out of scope, §8): an isolated `U+0096` C1 control
character and a stray `U+00B8` cedilla in `icelandic`; 22 standalone `´ U+00B4` acute accents in
`english`. Both smell like mojibake from an import.

### 4.11 Translation-collision census — measured 2026-08-06

Same read-only conditions as §4.10. Run to settle whether competing translations of one headword are
separated by subject (the tier partition resolves them) or share one (row order decides). **They
share one, overwhelmingly.**

| | headwords |
|---|---|
| >1 in-scope translation | **7,402** |
| …resolved by differing subject | **306** (4.1%) |
| …**colliding WITHIN one subject** | **7,096** (95.9%) |

Within-subject collisions per subject — **chemistry's 124 matches the register's "chemistry is 124
decisions" exactly**, independently confirmed:

| subject | colliding headwords | competing translations |
|---|---|---|
| biology | 3,555 | 7,372 |
| mathematics | 2,237 | 4,564 |
| physics | 1,399 | 2,946 |
| **chemistry** | **124** | **253** |

Distribution: 12,671 headwords have 1 translation, 6,502 have 2, 573 have 3, and a tail out to 13.

**Approval provenance — four bulk stamps, no human ever approved a row individually.** Every one of
the 28,903 rows carries `approved_by_name = "Íðorðabankinn"`, `source = "idordabankinn"`, and one of
exactly four `approved_at` seconds on **2026-03-25**: chemistry 709 @ 16:18:23 · biology 13,561 @
16:34:26 · physics 5,496 @ 16:40:02 · mathematics 9,137 @ 16:44:40. (`first_approved ==
last_approved` per subject.) 20,774 of 28,903 carry an `idordabanki_id`.

**Why this belongs in a C24 spec at all** — C24 changes none of it, but it raises the stakes on
§5.0's `t.id ASC` from "tidy" to "the golden is otherwise built on arbitrary order for ~35% of all
production headwords", and it dictates §5.1's fixture shape.

⚠️ **A data-shape finding, logged for §C18 not fixed here.** Several rows hold *comma-separated
alternatives inside one `icelandic` field* — `"án, ekki, -laus-"`, `"deoxýríbósakjarnsýra, DNA"`,
`"gulbúsörvandi hormón, millifrumuörvandi hormón"`. `buildInflectionRegex` escapes the whole string
literally, so such a translation **can never match running text** — it is dead for matching — and if
it lands at `approvedTranslations[0]` the editor is shown „a-" → „án, ekki, -laus-" fannst ekki.
Editor-facing nonsense produced by a data shape, not by the matcher. The swap reproduces it exactly.

---

## 5. Testing

### 5.0 Commit order — the oracle must not be circular

1. **Commit 1 — the ordering fix, alone.** Three levels are unspecified today and **all three land in
   the golden**. Fixing only the first leaves the oracle resting on unspecified order.

   | level | today | fix |
   |---|---|---|
   | headwords | `ORDER BY LENGTH(h.english) DESC` — no tie-break; arbitrary order among equal-length headwords shifts match-array order in 6–10 of 274 segments (measured) | `, h.id ASC` |
   | **translations within a headword** | **share BOTH sort keys ⇒ completely unordered** | `, t.id ASC` |
   | subject lists | `GROUP_CONCAT(ts.subject)` is unordered | sort after `.split(',')` **in JS** |

   🔴 **The translation level is the dangerous one, and it is MEASURED, not hypothetical.** The
   ranking sort (`:1436-1442`) returns `0` when both `isPrimary` and both `status` match — and per
   §4.11, **7,096 of 7,402 multi-translation headwords (95.9%) collide WITHIN a single subject**, so
   the tier partition cannot separate them, `isPrimary` is equal, and (per §4.10) every row is
   `approved`. The comparator therefore returns `0` for **~35% of all headwords in production**
   (7,096 / 20,272). The sort is stable, so `sorted[0]` **is raw SQL row order**. That decides
   `matches[].icelandic`,
   the `translations[]` array order, `issues[].expected` and `issues[].message` — every one of which
   is captured in the golden. A SQLite or better-sqlite3 bump can then flake the oracle, and the
   natural response — "regenerate the golden" — destroys it silently. Same failure family the
   register records for `toMatchSnapshot -u`.

   Sort subjects **in JS after the split**, not with `GROUP_CONCAT(… ORDER BY …)`: the SQL form
   needs SQLite ≥ 3.44 and would make the oracle depend on the bundled engine version, which is the
   very coupling this commit exists to remove. *(Inert in production today — §4.10 measured exactly
   one subject row per translation — but fixtures will have several, and the golden must not depend
   on which order they come back in.)*
2. **Commit 2 — capture the golden from the UNMODIFIED function.**
3. **Commit 3+ — write AC.**

⚠️ **"Byte-identical" means identical *after* the tie-break.** Adding `h.id ASC` is itself a small
behaviour change and it ships in this PR. Do not let a later reader conclude nothing changed.

### 5.1 Golden equality (migration oracle)

Checked-in JSON, `toEqual`. Copy the established pattern at
`tools/__tests__/book-rendering-config.test.js:5-13` — keyed by case, looped into one `it` per key
so a diff names the failing case.

**Never `toMatchSnapshot`** — `-u` regenerates it silently.

Fixture data is seeded from the committed `glossary-unified.json` corpus into the in-memory test DB
(`server/__tests__/helpers/terminologyTestDb.js:11`, injected via `_setTestDb`). **No production
data is used.** The seed **generator is committed** alongside the fixture so the golden is
reproducible rather than a one-off artifact whose provenance is lost.

#### ⚠️ The corpus alone CANNOT produce a meaningful golden — measured, not suspected

The committed `glossary-unified.json` files carry the `merge-glossary` shape:

```
english · icelandic · pos · definitionEn · definitionIs · status · source · alternatives · category · chapter · notes
```

**No `subjects` field. No `inflections` field. Zero of 4,496 terms have either.**

Seeded naively, the consequences compound and every one of them is silent:

| gap | consequence | what the golden would silently NOT cover |
|---|---|---|
| no `subjects` | every translation untagged ⇒ `translationTier` (`:1319`) always returns `in-scope` | the whole fallback partition (`:1388-1403`), `isPrimary`, the homograph guard — **the part §3 calls most at risk** |
| no `inflections` | `buildInflectionRegex` only ever receives `[]` | the entire Icelandic path, incl. §4.7's `['mól','mól (m)']` counterexample |
| `liffraedi-2e` is **100% `needs_review`** | `WHERE status IN ('approved','proposed')` filters it to **zero rows** | a biology golden case would be **fully vacuous** — it would pass on an empty result set |

⚠️ **`efnafraedi-2e` is the only usable book**: `approved 617 + proposed 170 = 787` in-scope rows —
which is exactly the register's "787 real EN↔IS pairs". That figure was always chemistry-only.

#### The generator must therefore synthesize, explicitly and in committed code

1. **Assign subjects deliberately, reproducing prod's skew.** Because the corpus supplies none, we
   choose them — so choose them to match §4.10: a chemistry book sees ~709 in-scope against ~28,194
   fallback. **State the ratio in the generator.** A balanced fixture would leave the dominant
   production branch — fallback's "surfaces but never issues" rule (`:1465`, `:1384-1387`) — almost
   untested while the golden passed.
2. **Synthesize inflection lists**, including one translation carrying **72 forms** (§4.10's measured
   maximum) so the tail is covered, and the `['mól','mól (m)']` shape of §4.7.
3. **Reassign status** where needed so the in-scope filter is non-empty, and **include `proposed`
   rows** — production has zero, so the `approved`-beats-`proposed` tiebreak is otherwise never
   exercised anywhere (§4.10 consequence 3).
4. **Seed `book_subject_mapping`** (the helper covers chemistry and biology, `terminologyTestDb.js:80-84`).
5. 🔴 **Include WITHIN-SUBJECT collisions — they are 95.9% of the real multi-translation population**
   (§4.11). A fixture whose competing translations always differ by subject would exercise only the
   4.1% case that the tier partition resolves cleanly, and would leave the ranking sort's
   *all-comparisons-return-zero* path — the one that actually runs for ~35% of production headwords
   — pinned by nothing. This is the single most important property of the fixture after the tier
   skew, and it is why §5.0's `t.id ASC` exists.
6. **Include a short abbreviation-shaped headword** (`W`, `pH`, `os`, `a-`). Real collisions are
   disproportionately 1–3 character abbreviations, symbols and prefixes (§4.11), which are also the
   headwords that generate the most AC hits per segment and sort *last* under
   `LENGTH(h.english) DESC` — i.e. the ones most often dropped by `consumed`. Both behaviours
   deserve a pin.

**These are fixture-design decisions, not incidental setup — record them in the generator's header
comment.** A future reader must be able to tell which properties of the golden are load-bearing and
which are arbitrary.

⚠️ There is **no shared terminology-row seed helper** — `insertHeadword` /
`insertTranslation` / `addSubject` are local to `terminologyService.test.js:37-109`. Extract or
copy; do not expect to import.

### 5.2 Randomised differential — the one that catches the trap

Random headword sets × random segments, asserting the AC path equals the regex path. This is what
catches §4.1's first-occurrence divergence and any fold error, because it generates orderings the
hand-written tests do not. The register's own research ran 1,000 fixtures with 0 mismatches; the
rejected tokenise+hash approach failed 137 of 600 here.

⚠️ **`findTermsInSegments` is never exercised with more than one segment anywhere in the suite
today** (the sole multi-segment test is on `buildModuleTerminologyReport`,
`terminologyService.test.js:1176-1197`). The differential must use multi-segment inputs.

⚠️ **The generator must EMBED headwords into segments, and its alphabet must be stated.** Purely
random segments almost never contain a headword, so the differential would spend its budget
comparing empty outputs against empty outputs — a vacuous pass at scale, which is the most
convincing kind. It must deliberately plant headwords with **case variants, overlapping pairs,
repeated occurrences, and boundary contexts**, and its alphabet must include **non-ASCII and astral
characters** — an ASCII-only generator can never surface a fold bug (§4.4) or the surrogate boundary
bug (§4.5).

### 5.3 Compile count, never wall-clock

Spy on `RegExp` construction. **Assert both sides**: AC removes ~20,073 English compiles; laziness
removes most of ~28,903 inflection compiles. **A count assertion covering only one side passes on a
half-fix** — precisely the ~45 s-save / ~64 s-load half-fix of §3.

🔴 **And an uncalibrated two-sided count passes on a NO-fix.** On a 10-headword fixture the
*unmodified* function compiles ~20 regexes; any threshold loose enough to be robust is satisfied
before and after. **Demonstrate the assertion RED against the unmodified function before accepting
it** — §5.0's commit order makes this free, since the unmodified function is still on the branch —
and size the fixture so eager and lazy differ decisively.

### 5.4 Unicode fold sweep

Exhaustive over code points, **not** over pairs. The naive statement — `fold(a) === fold(b)` ⟺
`/^a$/iu.test(b)` for all `a, b` — is O(n²) at 1.1 M² pairs and untestable; a test written that way
times out and gets quietly downgraded to a sample, which is exactly what §4.4 is guarding against.

**The tractable formulation:** for each code point `c`, build the small candidate set
`{c, toLowerCase(c), toUpperCase(c), overrides(c)}` and assert `fold` agrees with `/iu` on every
pair *within that set*. O(n), and it is what the survey actually ran to find the 92 disagreeing
pairs.

Plus the length-stability assertion (only U+0130 is special) and the `Final_Sigma` case (`"ΟΣ"`).

### 5.5 Regression pins from the audit

- Forms `['mól','mól (m)']` against `mól (m)x` must **not** produce a `fannst ekki` issue (§4.7).
- The `atomic mass` / `mass` divergence of §4.1 must produce the **current** single-match result.
- **Three occurrences, middle one non-whole-word** — headword `mass` against
  `"mass spectrometry uses bitmasses and mass units"`. Correct answer is **position 0**. This is the
  pin that separates the three plausible reductions of §4.1: filter-then-earliest (correct, 0),
  earliest-then-filter (picks the `bitmasses` interior hit, then rejects it, losing the match), and
  last-wins (34). No existing test distinguishes them.
- **Two headwords sharing one `english`** (differing `pos`) must both receive the same position, and
  the tiler must award the span to the `terms`-order winner and drop the other — §4.1.1.
- Existing pins must stay green — `:861`, `:881`, `:1058` (in-scope beats longer fallback **and**
  the missing-term issue survives), `:906`, `:965`, `:981`, `:1335-1378` (Icelandic boundary).

---

## 6. Error handling

No new failure modes are introduced on purpose. The two endpoints are **advisory** — the client
already degrades silently (`segment-editor.js:307-321`, *"Term loading is non-critical, fail
silently"*), and the save path's `try/catch` makes it non-fatal.

⚠️ **That save-path comment says "Live QA (non-blocking)" and it is FALSE** — the `try/catch` makes
it non-*fatal*, not non-*blocking*; there is no `await`. **Correct the comment in this PR.** It is
probably why this call site was never suspected.

An automaton build failure must **throw**, not silently fall back to the regex path. A silent
fallback would restore the 100 s block while the suite stayed green — no escape hatches in prod.

---

## 7. Verification — the bar is the prod journal

`npm test` green is necessary, not sufficient. §C21 and §C23 were both demonstrated on prod's own
deployed code.

0. `npm run docs:generate` after the route deletion, or `docs-check` goes red (§4.9).
1. Root `npm test` green (run from the repo root — cwd matters).
2. Local before/after on the real `m68700` (282 segments), reported as a measurement — **including
   RSS before and after**. ~20,073 folded keywords in a JS trie is plausibly tens of MB resident,
   rebuilt (old copy left to GC) on every terminology mutation, on a small Linode running everything.
   The pre-fix peak was **1,167 MB** for one call; a number that big is not automatically fixed by
   being fast. Report both time and memory or the claim is half-measured.
3. **Deploy, then read the journal:**
   `journalctl -u ritstjorn | grep '"msg":"request"'` must show `terminology-report` and `terms` in
   **milliseconds** after a real module open.
4. **Get one real `POST …/edit` into the journal.** Since C23 deployed, prod has served four POSTs
   (three `/accept`, one `return-to-pending`, 2–7 ms) and **no `/edit` at all** — so the ~45 s save
   figure is a benchmark projection, never observed. `/accept` is a different route and does not
   exercise this path.

⚠️ **`./scripts/deploy.sh` cannot complete over non-interactive SSH** — `sudo systemctl restart
ritstjorn` needs a password and there is no TTY under `BatchMode`. `set -euo pipefail` aborts there,
*after* the pull and `npm ci`, leaving the tree updated while the service runs the **old code**.
Plan the deploy as two steps; a human runs the restart.

⚠️ **A liveness probe cannot falsify intermittent blocking.** C23's hypothesis 4 was falsified from
a 2.7 ms `/api/health` sampled *between* blocks. Sample **during** the suspect operation.

⚠️ **The in-flight watchdog is structurally blind to synchronous blocking** — a blocked event loop
cannot run timers. The terminal `slow request` line is the signal to read, not the in-flight
warning.

---

## 8. Follow-ups to log (not to fix here)

- 🔴 **§C18 / §C14 ② — the within-subject collision census is now measured** (§4.11): 7,096 of 7,402
  multi-translation headwords collide inside one subject, so nothing but SQL row order chooses what
  an editor sees for ~35% of production headwords. Per-book editorial cost: **chemistry 124**,
  physics 1,399, mathematics 2,237, biology 3,555. Colliding terms skew heavily to abbreviations,
  symbols and prefixes, including genuine homographs (`os` → *bein* | *munnur*). C24 preserves this
  behaviour exactly; resolving it is the standing per-book work.
- **Comma-separated alternatives inside a single `icelandic` field** (§4.11) — dead for matching, and
  editor-facing when they surface as `expected` in a `fannst ekki` message. A data fix, not a code
  fix.
- **`mathematics` has 9,137 translations and no `book_subject_mapping` row** (§4.10), so every one is
  permanently `fallback` for every book. Probably intentional from the Íðorðabankinn bulk import, but
  it is a large silent population adjacent to §C14 ②'s unmade per-book adoption decisions.

- The vacuous `/terms` E2E test (`terminology-multibook.spec.js:61-74` and its sibling `:97-116`) —
  a branchless pass that accepts 404 or 500. The C19 lesson repeating.
- `GET …/terminology-report` has **zero** tests at any level.
- `getSegmentTerminologyWarnings` / `getModuleTerminologyReport` wrapper plumbing untested,
  including the silent `catch { return []; }` at `segmentEditorService.js:291-293`.
- `buildModuleTerminologyReport`'s `expected` is `approvedTranslations[0].icelandic` with **no order
  among sibling translations** — the §C18 "status is a selector" hazard in a different function.
- `GET …/terms` and `…/terminology-report` are `requireRole(EDITOR)` with **no book scoping**; the
  report is head-editor-gated in the UI only.
- The NFD boundary false-positive of §4.5 (pre-existing).
- **Terminology data-quality oddities** (§4.10): an isolated `U+0096` C1 control character and a
  stray `U+00B8` cedilla in `terminology_translations.icelandic`; 22 standalone `´ U+00B4` acute
  accents in `terminology_headwords.english`. Import mojibake. Harmless to the matcher (they are
  ordinary non-word characters to the boundary predicate), but they are wrong data.
- Inflection coverage is **4.16 forms per translation** — measured max 72 — against a full Icelandic
  paradigm of 8–16, a silent-miss surface. Blocked on this item; see
  [`docs/decisions/2026-08-06-mideind-toolchain-evaluation.md`](../../decisions/2026-08-06-mideind-toolchain-evaluation.md).
