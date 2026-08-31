> ⚠️ **BANNER — THIS IS AN AGENT AUDIT, NOT A VERIFIED MEASUREMENT. FROZEN 2026-08-27.**
> Produced by one reader agent during the §C82 Plan C ctx-loader brainstorm. It is
> **evidence, never status** (CLAUDE.md § One source of truth).
>
> **What has been INDEPENDENTLY RE-MEASURED and is safe to build on:**
> - The G5 shapeless-`payloadVerdict` silent pass (§4). Re-measured through the real
>   `runCheck`; the table reproduced exactly. → register **§C82 L137**, probe committed at
>   `test-results/c82-ctx-state-probe-2026-08-27.mjs`.
> - Tier 0 blocking flags (G1/G2/G3/G5 blocking, G4 advisory) — confirmed against the live
>   `REGISTRY`.
> - G1 and G3 failing on organic's live glossary — measured here as `G1 FAIL/840/1` and
>   `G3 FAIL/838/7`.
>
> 🔴 **NOT re-measured — do NOT build on these without executing them first:**
> - §306's claim that G3's docstring is stale and that 2 of its 7 findings are false positives.
> - Findings #2 and #3 (§5, §6) in their entirety.
> - Every line count, byte offset and source line number quoted below.
>
> The rule that applies: *a citation is not a measurement.* Re-run it or treat it as inherited.

---

# ctx-loader audit — Tier 0, `tools/lib/remt-checks-glossary.js` (G1–G5)

Audited 2026-08-27. **Every claim below was produced by EXECUTING the checks through the real
`runCheck()`**, not by reading them. File read complete (496 lines), not sampled.

Tool hygiene: `grep -aUP '\x00'` and `grep -UP '[\x01-\x08\x0b\x0c\x0e-\x1f]'` over both target
files → **no NUL, no control bytes**, so plain grep is not blind here. Every absence claim in
this document is paired with a positive control using the identical command.

---

## 0. Why Tier 0 reads differently from every other tier

Tier 0 is the ONLY tier whose input the re-MT loop does **not** regenerate. So:

- a Tier-0 blocking failure is a **PRECONDITION on the whole run** — the glossary must be fixed
  by a DB edit before any ISK is spent;
- a tier-1..4 failure over the bar is a statement about a committed **vintage**.

Same-looking red, opposite readings. Consequence for the loader: **a Tier-0 SKIPPED caused by a
loader defect is indistinguishable, at the exit code, from a real precondition failure.** Both
produce exit 1. The `message` is the only discriminator, and `exitCodeFor` does not read it.

---

## 1. Per-check table

`registerChecks` keys `REGISTRY` on `c.id`, so **the REGISTRY id string is identical to the check
id in every case** — `G1`,`G2`,`G3`,`G4`,`G5`. No divergence anywhere in this file.

| id | REGISTRY id | Tier | Blocking | ctx keys read (incl. destructuring + property access) | REQUIRED | Exact consequence of absence |
|---|---|---|---|---|---|---|
| **G1** | `G1` | 0 | **BLOCKING** | `ctx?.glossary` (in `skipUnusable`), `ctx.glossary`; then `.terms`, and each row's `.status`, `.english`, `.icelandic` | `glossary` | absent / `null` / number / string / object-without-`terms` / **any non-object row** → `SKIPPED, examined 0`, message names the cause. `[]` or `{terms:[]}` → PASS+0 → `runCheck` downgrades to `SKIPPED`. Blocking ⇒ **halt** either way. **Fail-closed.** |
| **G2** | `G2` | 0 | **BLOCKING** | `ctx?.glossary`, `ctx.glossary`; via `wireTerms`→`formatGlossary` each row's `.status`/`.english`/`.icelandic`; wire entries' `.sourceWord`/`.targetWord` | `glossary` | identical to G1. Additionally: rows that are objects but carry no usable `english`/`icelandic` → wire `[]` → `examined 0` → `SKIPPED` → halt. **Fail-closed.** |
| **G3** | `G3` | 0 | **BLOCKING** | identical to G2 | `glossary` | identical to G2. **Fail-closed.** |
| **G4** | `G4` | 0 | **ADVISORY** | `ctx?.glossariesByBook`; `Object.keys(byBook)`; `byBook[book]` for each slug → each parsed glossary | `glossariesByBook` **with ≥2 keys** | absent / `null` / `{}` / exactly 1 book → `SKIPPED, examined 0`. **Advisory ⇒ no halt and no failure line.** A per-book value that is unreadable is correctly a `unreadable-book` **finding**, not a silent skip. |
| **G5** | `G5` | 0 | **BLOCKING** | `ctx?.payloadText`; `ctx?.payloadVerdict` → **`.producer` and nothing else** | `payloadText` (must be `typeof === 'string'`) | `payloadText` absent / `Buffer` / non-string → `SKIPPED, examined 0` → halt. `payloadVerdict` → **only SOME absences are caught; see §4.** |

**Blocking flags — source vs live REGISTRY: NO DISAGREEMENT.**
Read from the registration literals at lines 117/183/259/298/380 (`blocking: true,true,true,false,true`)
and independently from the loaded REGISTRY:

```
G1 tier=0 BLOCKING v1
G2 tier=0 BLOCKING v1
G3 tier=0 BLOCKING v1
G4 tier=0 ADVISORY v1
G5 tier=0 BLOCKING v1
```

This matches the lead's measurement exactly. `defineCheck` rejects a non-boolean `blocking`
outright (no coercion, no default), so drift between literal and registry is not possible.

**No check reads both `glossary` and `glossariesByBook`.** G1–G3 take `glossary`; G4 takes
`glossariesByBook`; G5 takes neither. A complete Tier-0 loader must populate **four independent
keys** across three unrelated sources.

**No check reads `ctx.book`.** See §5, finding #2.

---

## 2. HOW each check guards a missing key — the literal code shape

`skipIfMissing(ctx, id, keys)` is used **0 times** in this file. Verified with positive controls
using the identical command:

```
grep -ac 'skipIfMissing' tools/lib/remt-checks-mt.js        -> 11   (positive control: findable)
grep -ac 'skipIfMissing' tools/lib/remt-checks-glossary.js  ->  0   (genuine absence)
grep -ac 'skipUnusable'  tools/lib/remt-checks-glossary.js  ->  4   (control #2: same tool sees this file)
```

**It is not merely unused — it is unusable here, for two independent reasons:**

1. It is **module-local to `remt-checks-mt.js`** (`function skipIfMissing(...)` at line 343, **not
   exported**). There is no shared helper module for it.
2. Its predicate is `typeof ctx?.[k] !== 'string' || ctx[k] === ''` — a **string-payload test**.
   Three of Tier 0's four keys (`glossary`, `glossariesByBook`, `payloadVerdict`) are **objects**.
   `skipIfMissing` would classify every valid Tier-0 object ctx as missing.

So Tier 0 expresses its requirements through **three different bespoke shapes**:

### G1 / G2 / G3 — a shared shape-validity helper (NOT a presence test)

```js
const skip = skipUnusable('G1', ctx?.glossary);   // optional chaining: absent key -> undefined
if (skip) return skip;
const terms = glossaryTerms(ctx.glossary);        // re-derived, unguarded, but provably non-null here
```

`skipUnusable` calls `glossaryTerms()`, which returns `null` (never `[]`) for any unusable shape,
and emits `SKIPPED / examined 0 / message naming the cause`.

**This is a validity test, not a key-presence test — and that is why it is safe.** The absent key
degrades to `undefined`, which is one of the shapes `glossaryTerms` rejects. Presence and validity
collapse onto the same SKIPPED outcome. **Omitting `glossary` produces a LOUD SKIP.**

Note the second `glossaryTerms(ctx.glossary)` call on the next line is *unguarded*, but cannot
throw: `skipUnusable` has already proven the shape. It is redundant computation, not a hazard.

### G4 — an inline truthiness + typeof + **cardinality** test

```js
const byBook = ctx?.glossariesByBook;
const books = byBook && typeof byBook === 'object' ? Object.keys(byBook) : [];
if (books.length < 2) return { verdict: SKIPPED, examined: 0, ... };
```

Absent, `null`, `{}` and single-book all collapse to `books.length < 2` → **loud SKIP in the
message, but SILENT at the exit code**, because G4 is advisory.

Per-book values are then guarded *individually* — `wireTerms(byBook[book])` returning `null`
pushes an `unreadable-book` finding rather than `continue`-ing silently. This was a deliberate
repair (comment at lines 317-320) and it holds: measured, two books with `undefined` values give
`WARN, examined 0, 2 findings` rather than a false agreement.

### G5 — TWO different guards, and they are not equally strong

```js
// payloadText: a TYPE test -> loud SKIP
const text = ctx?.payloadText;
if (typeof text !== 'string') return { verdict: SKIPPED, examined: 0, ... };

// payloadVerdict: a truthiness + typeof test -> a FINDING, not a skip
const v = ctx?.payloadVerdict;
if (v && typeof v === 'object') {
  producerNote = `producer ${v.producer}`;        // <-- .producer read UNGUARDED
  if (v.producer === 'unknown') findings.push(...);
} else {
  findings.push({ kind: 'leg-not-checked', leg: 'producer', ... });
}
```

`payloadText === ''` is deliberately **NOT** a skip — it becomes a `payload / 'empty file'`
**finding**. That is correct and differs from `skipIfMissing`: an empty *committed* glossary is a
real defect, whereas an empty *ctx* is a loader defect.

---

## 3. Item 7 — ctx keys read but NOT in the CheckContext typedef

**There are none. Every key this file reads is documented.** `glossary`, `glossariesByBook`,
`payloadVerdict`, `payloadText` all appear in the typedef at `tools/remt-battery.js`; the
`payloadVerdict` entry even carries the 🔴 note recording its own past omission. The contract
that failed three times has been repaired for Tier 0.

**The residual gap is SHAPE, not NAME** — the typedef enumerates keys and never states their
internal contract. This is the direct cause of finding #1:

- `payloadVerdict` — documented as "`spawnGlossaryPayloadCheck()` result". Nothing states that
  **only `.producer` is read**, that it must be the exact string `'unknown'` to fire, or that a
  present-but-shapeless object is **silent**.
- `glossariesByBook` — documented `{slug: parsedGlossary}`. Nothing states the values must be raw
  parsed glossaries rather than `glossaryTerms()` output. (Both happen to work, because
  `glossaryTerms` accepts a bare array — that is luck, not contract.)
- `payloadText` — documented "raw glossary bytes". But a `Buffer` (literally the raw bytes)
  **SKIPs**. The loader must use `fs.readFileSync(p, 'utf8')`.
- `glossary` — documented "parsed glossary-unified.json". Nothing states that a single non-object
  row anywhere in the array voids the **entire** check (all three of G1–G3 SKIP, halting the tier).

**⚠️ Naming hazard for the design document:** the typedef lives in `tools/remt-battery.js` (591
lines, the CLI). The checks import `defineCheck`/`registerChecks`/`VERDICT` from
`tools/lib/remt-battery.js` (210 lines, the contract). **Two different files share a basename.**
A loader author told to "read the typedef in remt-battery.js" can open the wrong one.

---

## 4. 🔴 FINDING #1 — G5 reports PASS over an unjudged producer leg

**The single most important result in this audit.** `v.producer` is read **without any guard**.
The enclosing test `v && typeof v === 'object'` admits *any* truthy object, and the only thing
that produces a finding is `v.producer === 'unknown'`. A verdict object that is present-but-
shapeless therefore leaves the producer leg **unjudged and silent**.

Measured through the real `runCheck()`:

| `ctx.payloadVerdict` | G5 verdict | |
|---|---|---|
| absent | **FAIL** (`leg-not-checked`) | correct |
| `null` | **FAIL** | correct |
| a raw JSON **string** (unparsed) | **FAIL** | correct |
| `{}` | **PASS** | **WRONG** |
| `{kind:'ok'}` (no `producer`) | **PASS** | **WRONG** |
| `[]` (`typeof [] === 'object'`) | **PASS** | **WRONG** |
| `{verdict:{producer:…}}` (wrapped) | **PASS** | **WRONG** |

All four bad cases print `producer undefined` into `message` — but **`exitCodeFor` reads verdicts,
not messages**, which is verbatim the failure the file's own comment at line 415 records as
already fixed. **The earlier fix closed the *absent* representation and left the *shapeless* one
open: a gate keyed on one representation of "nothing", walked past by another** — the §C21 lesson
recurring one level down, inside the code that documents it.

`Array.isArray` is guarded for `payloadText`'s parsed payload **in the same function** (line 407),
in `glossaryTerms` (line 44), and in `classifyPayloadText` (line 68). The omission on
`payloadVerdict` is inconsistent with its own immediate neighbours.

### This is reachable from a realistic loader, not just a hand-written literal

`spawnGlossaryPayloadCheck` **rejects** whenever the CLI emits no parseable JSON. Measured against
the real spawn:

```
nonexistent path   -> RESOLVES {"kind":"absent","producer":"unknown"}      -> G5 FAIL  (safe)
a directory        -> RESOLVES {"kind":"unreadable","producer":"unknown"}  -> G5 FAIL  (safe)
empty --file arg   -> REJECTS  "produced no parseable JSON. stderr: usage: ..."
```

On that rejection the loader must choose a value, and **the two most idiomatic catch shapes both
PASS**:

```
catch -> payloadVerdict = {}             G5 => PASS (0 findings)   silent
catch -> payloadVerdict = {error: msg}   G5 => PASS (0 findings)   silent   <- most natural to write
catch -> payloadVerdict = null           G5 => FAIL (1 finding)    the ONLY safe catch
```

### Loader requirements arising from this

1. **On any rejection from `spawnGlossaryPayloadCheck`, set `payloadVerdict = null` or omit the
   key. NEVER `{}`, `{error: …}`, or any partial object.**
2. Recommended code repair (outside this audit's scope, but it removes the trap):
   `if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.producer === 'string')`.
3. G5's `examined` is **hardcoded to `1`**, so `runCheck`'s `PASS + examined 0 → SKIPPED`
   backstop — the net that protects G1–G4 — is **structurally disabled for G5**. Its `findings`
   array is the only fail-closed mechanism it has. That is why this hole has no second line of
   defence.

### Related, currently sound but fragile: G5 never reads `v.kind`

`absent` / `unreadable` / `corrupt` are caught only *incidentally*, because the CLI happens to set
`producer: 'unknown'` on all of those paths (confirmed by real spawn, above). If the CLI ever
returned a non-ok `kind` alongside a recognised producer, G5 would PASS. The finding's `reason`
also mislabels the cause as *"producer is unrecognised"* when the true cause is a missing or
unreadable file.

---

## 5. 🔴 FINDING #2 — nothing binds a glossary to its book

**No Tier-0 check reads `ctx.book`.** Consequences for the loader:

- A loader that reads the **wrong book's** `glossary-unified.json` yields a fully confident,
  fully green G1/G2/G3 verdict about a book nobody examined. Undetectable from the output.
- G5 never cross-checks that `payloadText` and the path passed to `spawnGlossaryPayloadCheck` name
  the **same file**. A mismatch means its two legs judge two different payloads, and G5 reports a
  single coherent-looking verdict over them.

**Loader requirement:** derive `payloadText` and the spawn path from **one** variable, and record
the resolved path in the run ledger so the pairing is auditable after the fact.

---

## 6. ⚠️ FINDING #3 — G4 is silently disabled by the natural loader scoping

If the loader populates `glossariesByBook` with only the book under test — the obvious shape for a
per-book loader — **G4 is permanently SKIPPED**. It is advisory, so nothing halts, and no failure
line is printed. The cross-book detector simply never runs, for the entire campaign.

Measured: `glossariesByBook: {a: <valid glossary>}` → `SKIPPED, examined 0`,
message `"G4: needs ctx.glossariesByBook with at least 2 books, got 1"`.

**Loader requirement:** `glossariesByBook` must be populated with **all** books being judged even
on a single-book run, and G4 must run **once per campaign**, not once per book.

---

## 7. Tri-state / "representation of nothing" hazards, per key

| key | representations of "nothing" | collapse to | safe? |
|---|---|---|---|
| `glossary` | absent, `null`, `42`, `"text"`, `{}`, `{terms:[null]}` | `SKIPPED` via `glossaryTerms → null` | ✅ fail-closed |
| `glossary` | `[]`, `{terms:[]}`, rows with no `english`/`icelandic` | PASS+0 → downgraded `SKIPPED` | ✅ fail-closed (by the `runCheck` backstop, not by the check) |
| `glossariesByBook` | absent, `null`, `{}`, 1 key | `SKIPPED` | ⚠️ advisory ⇒ invisible |
| `glossariesByBook` | 2 keys with `undefined` values | `WARN`, 2 `unreadable-book` findings | ✅ correctly loud |
| `payloadText` | absent, `Buffer`, non-string | `SKIPPED` | ✅ fail-closed |
| `payloadText` | `''`, `'null'` | `FAIL` (a content finding) | ✅ deliberate — a defect, not a skip |
| `payloadVerdict` | absent, `null`, string | `FAIL` | ✅ |
| `payloadVerdict` | **`{}`, `{kind:'ok'}`, `[]`, wrapped** | **`PASS`** | 🔴 **UNSAFE — finding #1** |

`glossaryTerms` returning `null` rather than `[]` (lines 34-38) is the load-bearing decision that
makes the `glossary` key safe: `[]` would flow into `formatGlossary`, produce a clean empty wire,
and read as a glossary with no defects. **A blocking gate must tell "nothing wrong" from "nothing
read", and for `glossary` it does. For `payloadVerdict` it does not.**

---

## 8. Live-tree state — can the loader even run the tier?

Measured against the two kept books' committed `glossary-unified.json`, real spawn included:

| Book | G1 | G2 | G3 | G5 |
|---|---|---|---|---|
| `efnafraedi-2e` | **FAIL** ex=2021 — 2 competitions: `at→astat\|marsnákaætt`, `si→alþjóðlega einingakerfið\|kísill` | PASS ex=2017 | **FAIL** ex=2017, 7 findings | PASS (488,128 bytes, `export-terminology-resolved`) |
| `lifraen-efnafraedi` | **FAIL** ex=840 — 1 competition: `at→astat\|marsnákaætt` | PASS ex=838 | **FAIL** ex=838, 7 findings | PASS (202,500 bytes, `export-terminology-resolved`) |

G4 over both books: `WARN`, examined 2224, **33 disagreements**.

**Lead confirmed: G1 and G3 fail today, both blocking, so Tier 0 exits 1 regardless of the
loader.** Per §0 this is a **precondition on the whole run**, not a statement about a vintage —
a perfect loader still cannot get a green Tier 0 today.

The `examined` split 2021 → 2017 (chemistry) reproduces the file header's documented
"2,021 file terms → 2,017 on the wire" **exactly**, independently corroborating that the header's
measurement is still current.

### Precision correction — G3's docstring is stale, and 2 of its findings are false positives

The docstring (lines 247-254) claims **5** findings per book, measured 2026-08-25. The live code
finds **7** in each:

```
efnafraedi-2e:      AM→víddarmótun · As→arsen · in→tomma · is→lófalægur · minus→mínus · no→blóð- · plus→plús
lifraen-efnafraedi: As→arsen · OR→gagnlíkindahlutfall · in→tomma · is→lófalægur · minus→mínus · no→blóð- · plus→plús
```

The two extra — `plus→plús` and `minus→mínus`, in **both** books — were introduced by the
2026-08-25 paradigm-hole closure that appended `… despite except like plus minus …` to
`FUNCTION_WORDS` (line 238). **These are correct translations, not glossary defects.**

So a **blocking** gate currently halts both kept books partly on two entries that are not faults.
This bears directly on "can the tier run": part of today's Tier-0 halt is a false positive from
paradigm completion, not glossary quality. Two consequences worth separating before the run:

- the docstring's "5" is stale and should be re-derived, not trusted;
- `plus`/`minus` (and possibly other unit/sign words) need either a mask or an exclusion before
  Tier 0 can be expected to go green.

---

## 9. Loader checklist — what this file requires, in one place

1. `glossary` — parsed JSON, either a bare array or `{terms:[…]}`. **Every row must be a non-null
   object**; one bad row voids all three of G1–G3 and halts the tier.
2. `glossariesByBook` — `{slug: parsedGlossary}`, **≥2 entries**, populated with all books in the
   campaign. Fewer ⇒ G4 never runs and says nothing.
3. `payloadText` — `fs.readFileSync(path, 'utf8')`. **A string, never a Buffer.**
4. `payloadVerdict` — the resolved value of `spawnGlossaryPayloadCheck(path)`. **On rejection use
   `null`, never `{}` or `{error}`.** Same `path` as (3).
5. Nothing binds these to `ctx.book` — the loader is solely responsible for the pairing, and must
   record it.

---

## 10. Stated uncertainty

- I did not execute G2/G3 against rows whose `english`/`icelandic` are exotic non-strings
  (throwing getters, symbols). `formatGlossary` guards with `typeof === 'string'`, so I expect
  them dropped, but this is inference, not measurement.
- I found no input that makes `wireTerms` throw — all row dereferences are guarded upstream by
  `glossaryTerms` — but that rests on inspection plus the absence probes, not exhaustive fuzzing.
  A throw would surface as `FAIL` through `runCheck`'s catch, so it is fail-closed either way.
- The `plus`/`minus` false positives are my judgement that they are correct translations, not a
  measurement of reader impact. Someone with Icelandic domain knowledge should confirm before
  they are masked.
