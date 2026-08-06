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
| The vacuous `/terms` route test | `server/e2e/terminology-multibook.spec.js:61-74` accepts 404 **or** 500 as a pass | log to register |
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
(`server/migrations/032-terminology-redesign.js:37`) — **not** unique on `english`. The same English
string legitimately exists as **two headword rows** with different parts of speech, and the SQL
groups by `h.id, t.id`, so both reach `terms` as independent entries.

Today each has its own regex, each finds the **same** position; the first in `terms` order claims the
span and the second is dropped by the overlap check. **Reproducing that requires mapping keyword →
*list* of headword ids, all sharing one position.** A lookup keyed on the string alone would drop
the siblings *before* the tiler ever sees them — a different result, arrived at earlier.

This is a second reason the §5.0 tie-break matters: two rows with identical `english` have identical
`LENGTH`, so `h.id ASC` is what makes which-one-wins deterministic.

Measured in the committed corpus: 3,270 distinct English strings, **0 case-insensitive collisions**
among them — but 1,102 strings appear in more than one book's glossary file. ⚠️ **Whether those land
as one headword row or several is decided by `pos`, and prod's `terminology_headwords` is
unmeasured** (§4.4). Treat duplicates as present.

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

⚠️ **Reachability is bounded, not settled.** Zero of the 92 pairs is reachable in the committed
glossaries (3,270 distinct English headwords across 3 files). **That census is a proxy** — prod's
`terminology_headwords` (~20,073) was *not* measured; a survey agent's attempt to read prod was
blocked by the permission classifier and no production data was obtained. The corpus contains
σ (530), μ (480), µ (197) and π (1,053), so a single new headword containing ς or µ would make it
reachable. Direction of failure is **under-match** — a suggestion silently disappears, the §C18
failure shape. Hence the exhaustive sweep in §5.4 rather than a spot check.

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

`buildInflectionRegex` is constructed **28,903 times** and executed **~313 times**. Build it lazily
(memoised accessor on the translation object) or the AC cold build becomes a **6–11 s event-loop
stall on every cache invalidation — i.e. on every terminology approval, an editor action.** With
lazy construction the cold build is under 1 s.

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
would drop siblings.

### 4.9 Deleting `POST /api/terminology/check-consistency`

Lead decision, following the `/jobs` precedent (issue #328). Confirmed dormant: **zero production
callers**; the only references are 4 E2E assertions (`server/e2e/terminology.spec.js:646, 661, 758,
786`).

It is also the **only** `findTermsInSegments` call site gated by `requireAuth` **alone**
(`server/routes/terminology.js:1101`) — no `requireRole`, no book scope — with a **caller-supplied,
unbounded, unvalidated `segments` array**. Any authenticated user, including `viewer`, can hand it
an arbitrary segment list. Under today's cost that is a one-request server-outage handle.

Deleting it takes the blast radius from 5 call sites to 4 and removes the handle. The 4 E2E
assertions are removed with it.

---

## 5. Testing

### 5.0 Commit order — the oracle must not be circular

1. **Commit 1 — the SQL tie-break, alone.** `ORDER BY LENGTH(h.english) DESC` (`:1349`) has **no**
   tie-break, so SQLite's arbitrary order among equal-length headwords changes match-array **order**
   in 6–10 of 274 segments (membership and issues unaffected — measured). Add `, h.id ASC`.
   `GROUP_CONCAT(ts.subject)` is unordered too and must not be hashed as a change signal.
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

⚠️ **Verify the corpus actually supplies every field the function reads** before building on it —
`english`, `icelandic`, `inflections`, `status`, and per-translation `subjects`, plus a
`book_subject_mapping` row (the helper seeds chemistry and biology at `:80-84`). A fixture missing
`subjects` would exercise the `bookSubject = null` branch only, and the tier/partition logic — the
part most at risk — would go untested while the golden still passed.

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

### 5.3 Compile count, never wall-clock

Spy on `RegExp` construction. **Assert both sides**: AC removes ~20,073 English compiles; laziness
removes most of ~28,903 inflection compiles. **A count assertion covering only one side passes on a
half-fix** — precisely the ~45 s-save / ~64 s-load half-fix of §3.

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

1. Root `npm test` green (run from the repo root — cwd matters).
2. Local before/after on the real `m68700` (282 segments), reported as a measurement.
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
- Inflection coverage is **4.16 forms per translation** against a full Icelandic paradigm of 8–16 —
  a silent-miss surface. Blocked on this item; see
  [`docs/decisions/2026-08-06-mideind-toolchain-evaluation.md`](../../decisions/2026-08-06-mideind-toolchain-evaluation.md).
