> ⚠️ **BANNER — AGENT AUDIT, FROZEN 2026-08-27. EVIDENCE, NEVER STATUS.**
> Produced by one reader during the §C82 Plan C ctx-loader brainstorm, covering
> **Tier 2 — which the lead DEFERRED** (the loader is being built for Tier 0 + Tier 1
> first). It is kept for whoever builds the second half.
>
> 🔴 **NOTHING IN THIS FILE HAS BEEN INDEPENDENTLY RE-MEASURED.** Unlike the Tier 0
> audit — whose G5 finding was re-measured and became register §C82 L137 — no claim
> below has been executed against the code by anyone but its author. That includes
> every line number, every count, and in particular these four, which read as
> high-confidence defects and are exactly the shape that has been wrong before:
>   - §4.2 a mis-scoped `provenance` as a silent-PASS surface
>   - §5.1 `A2c` absent from the typedef while BLOCKING
>   - §5.2 the typedef naming a check id that does not exist
>   - §5.3 `isText`'s attribution omitting 3 of its 7 consumers
>
> ▶ **Before acting on any of them: execute it.** The governing rule is CLAUDE.md's —
> *a stale premise can be written AFTER the fix that kills it*, so neither this file's
> date nor its specificity is evidence. Note also that `tools/__tests__/remt-ctx-contract.test.js`
> mechanically fails on any ctx KEY a check reads that the typedef does not document —
> so §5.1/§5.2, which are about check-id ATTRIBUTION rather than keys, are not covered
> by that gate in either direction. Do not read the green test as confirming or refuting them.

---

# ctx audit — `tools/lib/remt-checks-mt.js` (Tier 2, all ten checks)

**Audited 2026-08-27.** Source file read completely (1,558 lines), not sampled.
**Status: Tier 2 is DEFERRED work** — the lead is building the ctx loader for Tier 0 + Tier 1
(the pre-spend half) first. This document is the durable record for whoever builds the second half.

**Method note.** Registry facts here are **executed, not read**: the module is imported and
`REGISTRY` dumped. Consequence claims are **measured** by running each check against degraded
`ctx` over real corpus files, never inferred from the code. Probe scripts are reproduced inline
at the end so every number can be re-derived.
No NUL bytes in the file (`grep -laUP '\x00'` → exit 1); `grep -a` used throughout regardless.

---

## 1. Harness semantics that decide every consequence

From `tools/lib/remt-battery.js`. Everything downstream depends on these, so they are stated first.

- **`defineCheck`** — `blocking` **must be an explicit boolean; there is NO default** (it throws
  otherwise). All ten checks state it, so nothing in this document is an inference.
- **`REGISTRY.set(c.id, c)`** — the registry id **is** the `id` field, verbatim.
  **No check in this file has a registry id differing from its `id`.**
- **`runCheck`** — a `run()` that **throws or rejects is caught and returned as FAIL**
  (`examined: 0`). It is never an uncaught crash that takes the driver down.
- **`runCheck`** — **PASS + `examined === 0` → SKIPPED.** FAIL and WARN are *not* downgraded.
- **`blockingFailures`** — `blocking && (FAIL || SKIPPED || examined === 0)` → **exit 1**.

⇒ **On a BLOCKING check, SKIPPED == halt.** On an ADVISORY check, SKIPPED/FAIL/WARN are recorded
and the exit code stays 0. `exitCodeFor` reads `verdict` and **never `message`**, so any caveat
carried only in prose is invisible to the gate.

---

## 2. The shared guard — `skipIfMissing`, and why Tier 2 is different

```js
// tools/lib/remt-checks-mt.js:343
function skipIfMissing(ctx, id, keys) {
  const missing = keys.filter((k) => typeof ctx?.[k] !== 'string' || ctx[k] === '');
  if (missing.length === 0) return null;
  return { verdict: VERDICT.SKIPPED, examined: 0, findings: [],
           message: `${id}: ctx is missing ${missing.join(' and ')} — no MT output to examine` };
}
```

It is a **payload test, not a container test**: the key must be a **non-empty string**.
An array, a `Buffer`, a number, `null` and `''` all SKIP.

### 2.1 🔴 Tier 2 is the ONLY tier that uses it — the declaration is machine-readable

Measured across all five tier modules (`grep -an 'skipIfMissing' tools/lib/remt-checks-*.js`):
**every call site is in `remt-checks-mt.js`. Tiers 0, 1, 3 and 4 use ad-hoc guards instead.**

**The seven call sites, verbatim, with line numbers:**

| line | check | call | key list |
|---|---|---|---|
| 407  | `A1`  | `skipIfMissing(ctx, 'A1', ['segText', 'isText'])`            | `segText`, `isText` |
| 495  | `A6`  | `skipIfMissing(ctx, 'A6', ['isText'])`                       | `isText` |
| 614  | `A2b` | `skipIfMissing(ctx, 'A2b', ['isText', 'segText'])`           | `isText`, `segText` |
| 735  | `A2c` | `skipIfMissing(ctx, 'A2c', ['isText'])`                      | `isText` |
| 1234 | `A3`  | `skipIfMissing(ctx, 'A3', ['segText', 'isText'])`            | `segText`, `isText` |
| 1319 | `A5`  | `skipIfMissing(ctx, 'A5', ['segText', 'isText', 'module'])`  | `segText`, `isText`, `module` |
| 1512 | `A7`  | `skipIfMissing(ctx, 'A7', ['segText', 'isText'])`            | `segText`, `isText` |

**The three checks NOT in this table — `A2a`, `A4`, `A8` — use `readRunRecord` instead**, because
their key (`provenance`) is an object and `skipIfMissing` only accepts strings.
**`residueAllowlist` is likewise absent from every list**, for the same reason — see §6.1, which is
exactly why using `skipIfMissing` does **not** make a check safe.

**Note the key ORDER is deliberate and load-bearing for diagnostics**, not incidental: the order
determines which side the SKIP message names first. `A2b` lists `isText` before `segText` while
`A1`/`A3`/`A7` list `segText` first; each is commented at its call site as intentional.

▶ **For a later loader:** these seven literals are a genuinely machine-readable declaration of
string-key obligations, and `tools/__tests__/remt-ctx-contract.test.js` already parses them with
`/skipIfMissing\(\s*ctx\s*,\s*'[^']*'\s*,\s*\[([^\]]*)\]/`. **But deriving obligations from it
alone would be incomplete in two directions**: it omits the object keys (`provenance`,
`residueAllowlist`) entirely, and it is matched **by helper name**, so a rename silently empties
it (§5.5).

---

## 3. Master table — all ten checks

| id (= REGISTRY id) | tier | blocking | ver | ctx keys read | required | absence ⇒ | `examined` keyed to |
|---|---|---|---|---|---|---|---|
| `A1`  | 2 | **ADVISORY** | 1 | `segText`, `isText` | both | SKIPPED | union of EN+IS seg-id sets |
| `A6`  | 2 | **BLOCKING** | 1 | `isText` | yes | SKIPPED → **halt** | `parseSegmentsMit(isText).length` |
| `A2b` | 2 | **BLOCKING** | 3 | `isText`, `segText` | **both** | SKIPPED → **halt** | `countRawSegTokens(isText)` (raw `SEG:` tokens) |
| `A2c` | 2 | **BLOCKING** | 1 | `isText` | yes | SKIPPED → **halt** | `parseSegmentsMit(isText).length` |
| `A2a` | 2 | ADVISORY | 1 | `provenance` → `.run.markersNormalized` | yes | SKIPPED | `1` (run records read: 0 or 1) |
| `A4`  | 2 | ADVISORY | 1 | `provenance` → `.run.unwrappedCount`, `.run.unwrappedByType` | yes | SKIPPED | `1` |
| `A8`  | 2 | ADVISORY | 1 | `provenance` → `.run.chars`, `.run.estimatedIsk`, opt `.run.usage` | yes | SKIPPED | `1` |
| `A3`  | 2 | ADVISORY | 1 | `segText`, `isText` | both | SKIPPED | `d.segmentsExamined` (EN-side occurrences) |
| `A5`  | 2 | ADVISORY | 1 | `segText`, `isText`, `module`, `residueAllowlist` | **all four** | SKIPPED | `pairs.size` (PAIRED segments only) |
| `A7`  | 2 | ADVISORY | 1 | `segText`, `isText` | both | SKIPPED | `pairs.size` (PAIRED segments only) |

**Blocking set = `A6`, `A2b`, `A2c`** (three of ten), read from each registration, confirmed by
executing the registry. `A2b` is the only check above version 1 (v3 — see §4.4).

**Total ctx keys this file reads: FIVE** — `segText`, `isText`, `module`, `residueAllowlist`,
`provenance`. Complete enumeration, from reading every `ctx` occurrence in executable code.

**This file reads NEITHER `book` NOR `chapter`.** Tier 2 is module-scoped at the gate. That is the
root of the coherence hazards in §4.2 and §6.4.

**There is no check `A2`.** The split is `A2a` / `A2b` / `A2c`. (The contract typedef claims
otherwise — §5.2.)

⚠️ **`examined` means two different units in this tier, deliberately.** `A3` counts EN-side
occurrences *including* unpaired ones (it reports them rather than dropping them); `A5`/`A7` count
**paired** segments only. The file's own header states this. **Plan C's ledger must not sum or
compare `examined` across checks in this tier**, nor compute a per-tier "coverage" from them.

---

## 4. Measured consequence matrix

Baseline `ctx` = real corpus files for `efnafraedi-2e` `ch01/m68663`, plus a synthesised v2
provenance sidecar carrying a run record (**0 of 150 committed chemistry sidecars carry one** —
all are `schemaVersion: 1`, so a real one had to be synthesised). `P` = PASS.

| ctx mutation | A1 | A6 | A2b | A2c | A2a | A4 | A8 | A3 | A5 | A7 |
|---|---|---|---|---|---|---|---|---|---|---|
| FULL (baseline) | P/11 | P/11 | P/11 | P/11 | P/1 | P/1 | P/1 | P/11 | P/11 | P/11 |
| drop `segText` | SKIP | P/11 | **SKIP→halt** | P/11 | P/1 | P/1 | P/1 | SKIP | SKIP | SKIP |
| drop `isText` | SKIP | **SKIP→halt** | **SKIP→halt** | **SKIP→halt** | P/1 | P/1 | P/1 | SKIP | SKIP | SKIP |
| drop `module` | P/11 | P/11 | P/11 | P/11 | P/1 | P/1 | P/1 | P/11 | **SKIP** | P/11 |
| drop `residueAllowlist` | — | — | — | — | — | — | — | — | **SKIP** | — |
| drop `provenance` | — | — | — | — | **SKIP** | **SKIP** | **SKIP** | — | — | — |
| `residueAllowlist = {entries: []}` | — | — | — | — | — | — | — | — | **PASS/WARN — NOT SKIP** | — |
| `residueAllowlist = null` | — | — | — | — | — | — | — | — | SKIP | — |
| `provenance = {schemaVersion: 2}` (no `run`) | — | — | — | — | SKIP | SKIP | SKIP | — | — | — |
| `segText = ''` | SKIP | P/11 | **SKIP→halt** | P/11 | P/1 | P/1 | P/1 | SKIP | SKIP | SKIP |
| `isText = ''` | SKIP | **SKIP→halt** | **SKIP→halt** | **SKIP→halt** | P/1 | P/1 | P/1 | SKIP | SKIP | SKIP |
| `module = ''` | P/11 | P/11 | P/11 | P/11 | P/1 | P/1 | P/1 | P/11 | **SKIP** | P/11 |

### 4.1 Central finding

**No key's ABSENCE produces a silent PASS in this file — but a MIS-SCOPED `provenance` does,
and a SHAPELESS `residueAllowlist` silently degrades the judgement.**

⚠️ **Transcribe that scoping.** "Tier 2 has no silent-PASS surface" would be the wrong reading and
is the sentence most likely to be lifted out of this document.

Absence always yields SKIPPED, because **every `examined` in this file is keyed to content
actually parsed** — the three `examined: 1` values are "run records read", set only *after* the
record and its named fields validate. `runCheck`'s PASS+0→SKIPPED backstop therefore fires.

**Verified against the harder case as well** — `isText` a non-empty string carrying **no SEG
markers at all** (a wrong or truncated file, which `skipIfMissing` cannot catch):

| check | verdict | examined | note |
|---|---|---|---|
| `A6` | SKIPPED | 0 | blocking → halt |
| `A2b` | **FAIL** | 0 | `cross-side` leg fires: `0 raw SEG tokens, 0 parsed, 11 EN parsed` |
| `A2c` | SKIPPED | 0 | blocking → halt |
| `A5`, `A7` | SKIPPED | 0 | `pairs.size === 0` |
| `A1`, `A3` | WARN | 11 | keyed to EN side / union; reports 11 unpaired — correctly not silent |

With **both** sides markerless, all ten SKIP. **No check silently passes a markerless input.**

### 4.2 🔴 The one silent-PASS surface: a mis-scoped `provenance`

`readRunRecord` validates `ctx.provenance.run` and the named fields **and nothing else**.
**`A2a`/`A4`/`A8` never read `ctx.module` or `ctx.book`** — proven by running all three with
neither key present in `ctx` at all: **PASS / examined 1** for all three.

So a provenance sidecar belonging to a **different module** validates cleanly, and the three
checks **certify counters that describe some other module**. Measured, judging `m68663` while
handed another module's run record:

```
A2a  WRONG module sidecar   PASS  examined=1  0 SEG markers re-glued by normalizeSegMarkers
A4   WRONG module sidecar   PASS  examined=1  0 invented markers unwrapped across 0 type(s)
A8   WRONG module sidecar   PASS  examined=1  chars=999999 estimatedIsk=1499.9
```

`A8` prints the wrong module's numbers **in the message while returning PASS**, and `exitCodeFor`
never reads `message`.

⚠️ **Note the asymmetry against `A5`, because it inverts the safety direction.** A wrong-book
`residueAllowlist` fails **safe** (tolerates nothing → false findings, i.e. stricter). A
wrong-module `provenance` fails **unsafe** (silent PASS). All three run-record checks are
advisory, so nothing halts — but Plan C scopes quarantine on these verdicts, so a PASS here is a
positive claim about a module.

▶ **Module/sidecar coherence is a LOADER OBLIGATION. No pure gate in this file can check it.**

### 4.3 An absent key and a zero-byte file are BYTE-IDENTICAL results

Measured: dropping `isText` and setting `isText: ''` produce results equal under
`JSON.stringify` — **including the message**:

```
A6 absent : SKIPPED/0 :: A6: ctx is missing isText — no MT output to examine
A6 empty  : SKIPPED/0 :: A6: ctx is missing isText — no MT output to examine
IDENTICAL RESULT? true
```

A genuinely empty `02-mt-output` file — **MT produced nothing, a real pipeline failure** — is
therefore reported as *"the loader forgot the key"*. The **verdict is safe** (SKIPPED → halt on
the three blocking checks); the **diagnosis is wrong**, and being pure, no gate can tell them
apart. **The loader must distinguish the two states and say which it saw.**

### 4.4 Lead: the `id-charset` leg — confirmed

It exists: **leg 4 of `A2b`**, and it is why `A2b` is at **version 3** while every other check
here is version 1 (`defineCheck`'s contract is "bump whenever the judgement changes", and Plan C
scopes quarantine on that stamp).

- Predicate: `SEG_ID_RE = /^[\w-]+:[\w-]+:[\w-]+$/`, applied to `isRecords.map(r => r.segmentId)`.
- **It requires NO ctx key beyond `isText`** — it reuses records already parsed for the other legs
  (deliberately, so two reads of the same bytes cannot drift apart).
- It is the **blocking owner** for corruption that rewrites an id **without moving any count**
  (U+200B ZWSP, U+00AD soft hyphen). Measured on `ch01/m68663`: with such a character planted,
  parsed stays 11 and **A6, A2b (pre-fix) and A2c all returned PASS**; only advisory `A1` warned,
  and `A1` compares *sets*, so it cannot distinguish a legitimate rename from a corruption.
- Findings are **escaped** (`escapeSegId`) and capped at 10, with offending codepoints in their own
  field — an invisible character printed raw would make the finding unreadable.
- Base rate **0 of 57,644 parsed ids across 394 files (0.000%)**, which is what licences a BLOCK.
  🔴 **A PREMISE pin, not a regression pin** — the corpus this battery gates is about to be
  replaced by the re-MT run, so it must be **re-measured** when it moves, never assumed.

---

## 5. Contract (`CheckContext` typedef, `tools/remt-battery.js:22–353`) — findings

**All five keys this file reads ARE documented.** There is **no seventh instance** of the
"undocumented key" class here. The defects are in the **attributions**, and in **the gate that is
supposed to prevent a seventh instance**.

### 5.1 🔴 `A2c` appears NOWHERE in the typedef — and it is BLOCKING
Zero occurrences of the string `A2c` in lines 22–353 (counted). Every other Tier-2 check is named
somewhere. A loader driven by the doc's per-check attributions never learns that a **blocking**
check depends on `isText`.

### 5.2 🔴 The typedef names a check id that does not exist
`@property {string} [isText] 02-mt-output IS segments (Task 8: **A2**/A6 · Task 10: A3/A5/A7)`
— there is no `A2` in the REGISTRY (confirmed by execution; the split is `A2a`/`A2b`/`A2c`).

### 5.3 🔴 `isText`'s attribution omits 3 of its 7 consumers
Documented: `A2`(≠real)/`A6`/`A3`/`A5`/`A7`. **Actual readers: `A1`, `A6`, `A2b`, `A2c`, `A3`,
`A5`, `A7`.** Omitted: **`A1`, `A2b`, `A2c`** — two of them blocking.

### 5.4 🔴 `segText`'s attribution is stale by 3 consumers
Documented: `(Task 3: E2/E4 · Task 8: A1/A2b)`. **Actual Tier-2 readers: `A1`, `A2b`, `A3`, `A5`,
`A7`.** The file's own gating-half header already says "consumed by FIVE checks … when a check
starts consuming a ctx key, that list is part of the change" — the contract was never updated to
match.

### 5.5 🔴 The completeness gate has TWO PROVEN blind spots
`tools/__tests__/remt-ctx-contract.test.js`'s `readKeys()` matches only two idioms:
`/ctx\??\.([A-Za-z][A-Za-z0-9_]*)/` and `skipIfMissing(ctx,'ID',[…])` **matched by helper name**.

Proven empirically on modified copies (bytes confirmed changed by `cmp`; derived key set
**byte-identical to baseline** in both arms):

| probe | derived key set | verdict |
|---|---|---|
| baseline (real file) | `cnxml, isText, module, provenance, residueAllowlist, segText` | control passes |
| a key read only via **destructuring** (`const {x} = ctx`) | unchanged | **INVISIBLE** |
| a key read only via a **renamed guard** (`skipIfMissingV2(ctx,…,['x'])`) | unchanged | **INVISIBLE** |

Neither idiom is used today, so **there is no live gap** — but the gate cannot catch the seventh
instance if it arrives in either shape, which is precisely what the test claims to prevent. This
is the §C82 L71 shape the test's own docstring warns about, one level up.

### 5.6 ⚠️ The same deriver cannot tell CODE from PROSE
It reports **`cnxml`** as read by `remt-checks-mt.js`. The sole occurrence is **line 31, inside a
comment block** — and this file's header explicitly states *"THERE IS NO `cnxml` IN THE TIER-2
ctx"*. **Anyone deriving a loader's per-tier key set from that tool would load `cnxml` for Tier 2.**
Harmless in itself (a wasted read), but it means the test's derived `read` set is **not** a
trustworthy input to a loader design without hand-checking each key against executable code.

---

## 6. How each key must be LOADED — representation-of-nothing hazards

### 6.1 🔴 `residueAllowlist` IS the G5 shape — a truthy-object guard over a parsed value

The guard is `isPlainRecord(v)` = `typeof v === 'object' && v !== null && !Array.isArray(v)`.
That is **stricter** than Tier 0's G5 guard (`v && typeof v === 'object'`, which admits arrays) —
it correctly rejects `null` and `[]`. **But it does nothing about SHAPELESSNESS**, and
`classifyResidue` then does `(allowlist.entries || []).find(…)`, so anything without a usable
`entries` array degrades to **"tolerate nothing"**.

⚠️ **`residueAllowlist` is NOT in any `skipIfMissing` list** (it is an object; that helper only
accepts strings). **So this is the concrete proof that "the check uses `skipIfMissing`" does not
imply the check is safe** — `A5` uses it for its three string keys and is still exposed here.

Measured on `m68729`, a module whose residues the **real** allowlist fully tolerates
(baseline: **PASS, 0 findings, examined 157**):

| `ctx.residueAllowlist` | verdict | examined | findings | |
|---|---|---|---|---|
| real allowlist | PASS | 157 | 0 | baseline |
| **`{}`** | **WARN** | 157 | **1** | 🔴 shapeless — degrades silently |
| **`{error: 'ENOENT'}`** | **WARN** | 157 | **1** | 🔴 spawn/error shape — degrades silently |
| **`{entries: null}`** | **WARN** | 157 | **1** | 🔴 degrades silently |
| **`{entries: []}`** | **WARN** | 157 | **1** | 🔴 what `loadResidueAllowlist` returns for a MISSING FILE |
| `{entries: 'nope'}` | FAIL | 0 | 0 | throws in `.find`, caught by `runCheck` — **louder than a missing one** |
| `[]` (array) | SKIPPED | 0 | 0 | rejected by `!Array.isArray` |
| `null` | SKIPPED | 0 | 0 | what `loadResidueAllowlistOrNull` returns — **correct** |
| absent | SKIPPED | 0 | 0 | correct |
| `'str'` / `42` | SKIPPED | 0 | 0 | correct |

**Four distinct representations of "nothing" pass the guard and silently degrade the judgement**,
at full `examined`. Across the four allowlisted chemistry modules, `{entries: []}` yields
**m68729 1, m68784 1, m68750 2, m68809 1** false findings where the real allowlist yields **0**.

**Direction, stated precisely:** the failure is **false FINDINGS, never false tolerance** — an
empty allowlist is strictly *stricter*, so it pollutes a human triage queue rather than certifying
bad content. `A5` is advisory, so nothing halts. **This is the safe direction, but it is still a
silent degradation of the verdict** (PASS → WARN over identical content).

▶ **LOADER OBLIGATIONS:**
- **Use `loadResidueAllowlistOrNull`, never `loadResidueAllowlist`.** The latter returns
  `{entries: []}` for a missing file *and* for a real empty allowlist — byte-identical, and the
  guard accepts the exact value it exists to refuse.
- **Do NOT hand `A5` a raw `JSON.parse` of the file.** `loadResidueAllowlist` normalises with
  `Array.isArray(raw.entries) ? raw.entries : []`; a raw parse does not, which is how
  `{entries: null}` and `{}` reach the gate at all.
- Both run-target books (`efnafraedi-2e`, `lifraen-efnafraedi`) **do** have the file today.

### 6.2 ✅ `provenance` is NOT the G5 shape — two-level guarding saves it

`readRunRecord` applies `isPlainRecord` **twice** (to `ctx.provenance` and to `.run`) and then
validates **every named field** against `FIELD_KIND` (`count` = non-negative integer;
`number` = finite; `record` = plain object). Nothing is coerced with `|| []`. Measured:

| `ctx.provenance` | A2a | A4 | A8 |
|---|---|---|---|
| `{}` (shapeless) | SKIPPED | SKIPPED | SKIPPED |
| `{run: {}}` (shapeless run) | SKIPPED | SKIPPED | SKIPPED |
| `{error: 'ENOENT'}` | SKIPPED | SKIPPED | SKIPPED |
| `{run: {markersNormalized: 0}}` (partial) | **PASS/1** | SKIPPED | SKIPPED |
| full run record | PASS/1 | PASS/1 | PASS/1 |

⚠️ **The partial row is worth recording:** three checks reading **one** key can legitimately
**disagree** about whether it is usable, because each validates only its own fields. That is
correct behaviour, but a ledger that treats "provenance was supplied" as a single boolean will
mis-describe it.

▶ **LOADER OBLIGATIONS:**
- **Pass the PARSED SIDECAR, not the run record.** All three reach through `.run`; handing the run
  record directly makes `.run` undefined → SKIPPED.
- **Three distinct "nothings", each SKIPPED with a different message** — deliberately: no
  `provenance` object · v2 with no `run` · a `run` whose field is absent/mistyped. The message is
  the only thing that distinguishes them.
- **All 150 committed chemistry sidecars are `schemaVersion: 1` with no `run` record**, so
  `A2a`/`A4`/`A8` SKIP corpus-wide today. All three are advisory, so this reads as a permanent,
  ignorable SKIP — **the exact failure mode that let E7 survive twelve tasks.**

### 6.3 ⚠️ `module` — bare module id, required as a non-empty string
`''` behaves **exactly** like absent (SKIPPED). It is deliberately the existing scope key rather
than a new `moduleId`: two near-identical names is how a loader sets one and leaves a check
permanently SKIPPED.

- `module === 'exercises'` is a **deliberate SKIP** — allowlist entries for that content are
  nickname-keyed (`11-03-OC-P06`) and unreachable from that id, so nothing could be tolerated;
  `tools/exercise-assemble.js` is the authoritative residue gate there.
- ⚠️ **Guard ORDER:** the `residueAllowlist` guard runs **before** the `exercises` guard. Measured:
  an exercises bundle with no allowlist SKIPs citing the **allowlist**, naming the wrong cause.
  If the loader legitimately supplies no allowlist for exercise bundles, every such SKIP will
  misreport why.

### 6.4 ⚠️ `A5` cannot verify the allowlist belongs to the book it is judging
It reads `module` and `residueAllowlist` but **never `ctx.book`**. A wrong-book allowlist degrades
to "tolerates nothing" (false findings — the safe direction), **not** to false tolerance:
measured **0 shared module ids** between the two run-target books (chemistry 149, organic 17).
Book/allowlist coherence is a **loader obligation**. Contrast §4.2, where the analogous
mis-scoping fails *unsafe*.

### 6.5 ⚠️ `segText` / `isText` — payload-tested, but markerless content is caught one layer down
`skipIfMissing` guarantees a non-empty string, so a non-string never becomes "an empty file that
is fine". It does **not** catch a non-empty but **markerless** string; that is caught by
content-keyed `examined` plus `runCheck`'s PASS+0→SKIPPED rule, and by `A2b`'s cross-side leg
(§4.1). **Both defences are needed; neither alone closes it.**

---

## 7. Summary of loader obligations for whoever builds Tier 2

1. **`residueAllowlist` → `loadResidueAllowlistOrNull`**, never `loadResidueAllowlist`, and never
   a raw `JSON.parse`. Four shapeless values pass the guard and silently degrade `A5`. (§6.1)
2. **`provenance` → the parsed sidecar**, not the run record. (§6.2)
3. **Module/sidecar coherence is yours to enforce** — `A2a`/`A4`/`A8` return **PASS** over another
   module's counters, the only silent-PASS surface in this tier. (§4.2)
4. **Book/allowlist coherence is yours to enforce** — `A5` never reads `ctx.book`. (§6.4)
5. **Distinguish "key absent" from "file is zero bytes"** — the gate returns byte-identical results
   and blames the loader for a real MT failure. (§4.3)
6. **Supply `isText` for `A2c`** even though the contract never mentions it — blocking. (§5.1)
7. **Do not derive the key set from `remt-ctx-contract.test.js`** without hand-checking: it reports
   `cnxml` (comment-only) and cannot see destructuring or a renamed guard. (§5.5, §5.6)
8. **Never sum or compare `examined` across Tier-2 checks** — `A3` and `A5`/`A7` use different
   denominators by design. (§3)

---

## Appendix — reproducing the measurements

All probes import the tier module (which self-registers) then call `runCheck` directly.
Corpus paths used: `books/efnafraedi-2e/02-for-mt/ch01/m68663-segments.en.md`,
`books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.is.md`, and for the allowlist arm
`ch06/m68729`, `ch11/m68784`, `ch09/m68750`, `ch14/m68809` (the four modules with allowlist
entries; `books/efnafraedi-2e/residue-allowlist.json` holds 4 entries for
`m68729, m68784, m68750, m68809`).

```js
await import('tools/lib/remt-checks-mt.js');                       // self-registers
const { REGISTRY, runCheck } = await import('tools/lib/remt-battery.js');
const r = await runCheck(REGISTRY.get('A5'), ctx);                 // {verdict, examined, findings, message}
```

Registry dump (the source of §3's tier/blocking/version columns):

```js
for (const [id, c] of REGISTRY) console.log(id, c.tier, c.blocking, c.version);
```

Blind-spot proof (§5.5): copy the file, inject a key read **only** via `const {x} = ctx` (and, in a
second arm, via a renamed guard), run the test's two regexes over both copies, and `cmp` the copies
against the original to confirm the bytes actually changed. Both arms return a key set identical to
baseline.
