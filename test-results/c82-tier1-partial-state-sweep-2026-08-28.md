# §C82 Plan C — Task N3: the Tier-1 partial-state sweep

**Run 2026-08-28 · node v22.22.2 · 47.2 s · branch `feat/c82-plan-c-ctx-loader` · HEAD `28ab2935`**
Harness: `test-results/c82-tier1-partial-state-sweep-2026-08-28.mjs`
Re-run: `node test-results/c82-tier1-partial-state-sweep-2026-08-28.mjs > /tmp/sweep.txt 2>&1; echo "exit=$?"`

---

## The one-line result

**No blocking Tier-1 check exhibits a silent pass over a partial ctx on the arms this sweep could
reach.** The only blocking Tier-1 candidate the classifier raised (`E9 × handEdits × emptyArray`)
**adjudicates to correct behaviour**, verified by execution and not by reading the comment that
claims it. The four `G5` arms that *are* silent passes are Tier 0 and already known — they are
this sweep's **positive control**, and they fired.

🔴 **A clean result over a check that FAILs at baseline is not evidence.** Four blocking checks
(`G1`, `G3`, `E9`, plus advisory `G4`) never PASS on any unit in this corpus, so no damaged arm of
theirs could have read PASS whatever the check did. § *What the sweep could not reach* is the part
of this report that matters most.

---

## The positive control — stated explicitly

| | |
|---|---|
| Arm | `G5 × payloadVerdict × emptyObject` |
| Result | **PASS, `examined=1`, `readsKey=true`, baseline `PASS/1`** |
| Verdict | ✅ **FIRED** |

It is **arm 0 of the ordinary matrix**, not a special-cased block: it is built, damaged, proxied,
run and classified by the same code as the other 14,923 varying arms, and it must survive the
`candidates` classifier — not merely appear in the raw rows — before the harness reports anything.
If it does not reproduce, the harness prints `HARNESS BROKEN` as its **first** line and sets
`process.exitCode = 1`.

▶ **So the clean Tier-1 result below is a measurement, not an absence.** The instrument
demonstrably produces the exact failure mode it is hunting, in the same run.

---

## Population — every denominator

| | |
|---|---|
| Books | `efnafraedi-2e`, `lifraen-efnafraedi` (the two kept books) |
| Corpus | **220 units** = 166 module + 31 exercises + 23 chapter-metadata, from `unitsFor` |
| **Units swept** | **10** = 9 representatives (3/kind, first/middle/last) + **1 rescued** |
| Checks | **13** (Tier 0 `G1`–`G5`, Tier 1 `E1`–`E7`, `E9`) — **11 blocking** |
| States | **7** — `absent`, `null`, `emptyObject`, `emptyArray`, `errorShape`, `wrongShape`, `emptyString` |
| **Arms** | **15,054** total = **14,924 varying** + 130 baseline |

⚠️ **10 of 220 is the denominator for every rate in this document.** It is not a corpus-wide
claim. This repo carries five live, non-interchangeable counts of "the corpus" (166 module pairs ·
197 IS segment files · 220 exactly-paired basenames · 227 · 112 chapter×track cells); the one used
here is **220 units from `unitsFor` over the two kept books**, and the swept subset is 10 of them.

---

## The instrument, and the hole it closes

🔴 **Verdict equality cannot tell "the check ignores this key" from "the check silently passed over
damage".** `G5` over a damaged `payloadVerdict` returns `PASS` — byte-identical in verdict to what a
check that never reads the key returns. A sweep that reported every non-`SKIPPED` arm would bury 50
real signals in 14,924 rows.

**So every ctx is wrapped in a `Proxy`** whose `get` / `has` / `ownKeys` /
`getOwnPropertyDescriptor` traps record which keys the check actually touched. The per-check key
dependency is therefore **derived by execution**, never enumerated — the same discipline
`probeJudgeableSubset` uses, and for the same reason: an enumeration of what each check reads is
what [LEAD] ruled against, and it cannot be derived mechanically anyway (`E9` reads all five of its
keys through `const c = ctx || {}`, its key names appearing as `ctx.<key>` only inside error
strings).

`ownKeys` is trapped and flagged rather than expanded: a spread inside a helper would touch every
key at once and make the dependency set read as "reads everything". **No check triggered it on any
of the 15,054 arms** — but the flag is there so a future one narrows nothing instead of lying.

**`absent` is `delete`, not `= undefined`.** Setting a key to `undefined` leaves `'key' in ctx ===
true`; the harness asserts `key in damaged === false` on every arm it builds for that state.

### Why the fixtures are producer-built

Every baseline ctx is `{...loadTier0Ctx(unit).ctx, ...(await loadTier1Ctx(unit, runState())).ctx}`
— the **real loader on a real unit from `unitsFor`**, with the committed
`tools/__tests__/helpers/remt-run-state.js` factory. Damage is applied to a **copy** afterwards.
Nothing is hand-built. (A hand-built `{segIds, byId}` snapshot earlier on this branch made all five
of `E7`'s arms SKIP with one message — an absence manufactured by the fixture.)

---

## The classifier — four buckets, and why the fourth exists

| Bucket | Predicate |
|---|---|
| **CANDIDATE** | blocking · reads the key · `PASS` · `examined > 0` · `examined` **unchanged** from the well-formed baseline |
| **SUSPICIOUS** | blocking · reads the key · `PASS` · `examined` **changed** — noticed something and passed anyway |
| **NOT A FINDING** | verdict `FAIL` or `SKIPPED` (loud either way), or the check never touched the key (the arm is **inert**, not clean) |
| **shape tag** | `shapePreserved` = `shapeOf(state) === shapeOf(the real loader's value)`, measured against the **producer's own value** |

`examined` is the discriminator between a *vacuous* pass and a *silent* one. `runCheck` downgrades
`PASS + examined 0` to `SKIPPED` (verified at `tools/lib/remt-battery.js`: `if (verdict ===
VERDICT.PASS && examined === 0)`), so a vacuous pass surfaces as `examined > 0` with zero findings —
and **identical `examined` across the well-formed and damaged arms is the strongest single signal
available**: the check counted the same things while the input it counted them from was replaced.

🔴 **The fourth bucket exists because a type-preserving empty is not damage.** `[]` supplied for a
key whose real value *is* an array is the legitimate "none" state. Conflating the two manufactures
findings — and it would have manufactured this sweep's only Tier-1 one. **The tag narrows; it does
not adjudicate.** `payloadVerdict: {}` is shape-preserving and is still a genuine silent pass.

---

## Results

### Verdict distribution over the 14,924 varying arms

| Count | Arm |
|---:|---|
| 6,398 | `PASS` (key inert — the check never touched the varied key) |
| 3,486 | `FAIL` (key inert) |
| 2,520 | `SKIPPED` (key inert) |
| 1,078 | `WARN` (key inert) |
| 1,012 | `SKIPPED` (reads key) |
| 380 | `FAIL` (reads key) |
| **50** | **`PASS` (reads key)** ← the entire candidate population |

**SUSPICIOUS: 0. Arms that threw: 0. Advisory checks passing over damage: 0.**

### Key dependency, derived by execution

| Check | Keys actually touched |
|---|---|
| `G1` `G2` `G3` | `glossary` |
| `G4` | `glossariesByBook` |
| `G5` | `payloadText`, `payloadVerdict` |
| `E1` `E2` `E4` `E5` | `cnxml`, `segText` |
| `E3` | `segText` |
| `E6` | `emittedFiles` |
| `E7` | `committedExtract`, `freshExtract` |
| `E9` | `locked`, `handEdits`, `inputs`, `force`, `costEstimate`, **`costBand`** |

### The 50 candidates — 5 distinct shapes × 10 units

| Check × key × state | Units | Shape | Adjudication |
|---|---:|---|---|
| `G5 × payloadVerdict × emptyObject` | 10 | preserved | 🔴 **SILENT PASS** — Tier 0, known, the positive control |
| `G5 × payloadVerdict × errorShape` | 10 | preserved | 🔴 **SILENT PASS** — Tier 0 |
| `G5 × payloadVerdict × wrongShape` | 10 | preserved | 🔴 **SILENT PASS** — Tier 0 |
| `G5 × payloadVerdict × emptyArray` | 10 | **VIOLATED** (real=`object`) | 🔴 **SILENT PASS** — Tier 0 |
| `E9 × handEdits × emptyArray` | 10 | preserved | ✅ **NOT a defect** — see below |

---

## Finding 1 (Tier 0, known) — `G5` passes over four shapeless `payloadVerdict` values

- **Check** `G5` · **blocking** · tier 0 · **Key** `payloadVerdict`
- **States** `{}`, `{error:'spawn failed'}`, `{kind:'ok'}`, `[]`
- **Verdict** `PASS`, `examined = 1`, findings 0 — **identical to the well-formed baseline
  (`PASS`/1)** on all 10 swept units
- **Correctly `FAIL`s** on `null` and on `absent`.

**Why the verdict is unjustified.** `G5`'s producer leg is guarded by `if (v && typeof v ===
'object')`. Every one of the four states is truthy and `typeof === 'object'` (`[]` included), so the
leg takes the *checked* branch, reads `v.producer` as `undefined`, finds `undefined !== 'unknown'`,
and **raises no finding**. The `else` branch — which pushes the `leg-not-checked` finding that makes
this loud — is reachable only from `null`/absent. So a `payloadVerdict` that carries **no producer
at all** is treated as a producer that was checked and found acceptable, on the blocking gate whose
own docstring records that *"a leg that did not run is a finding, not a pass"*.

`examined` stays `1` because `G5` counts the payload, not the legs — so the count cannot see the
missing leg. That is the §C89 shape exactly: a count cannot see a substitution that did not happen.

**This is Tier 0, was already known going into this task, and is deliberately included as the
instrument check.** It is reported here because it is what the harness measured, not as a new
discovery. The state that matters operationally is `errorShape`: `spawnGlossaryPayloadCheck` returns
`null` on a spawn failure (which `G5` correctly refuses), but any future wrapper that returns an
error *object* instead would walk straight through this branch.

---

## Finding 2 — adjudicated NOT a defect: `E9 × handEdits × emptyArray`

The classifier raised it because the verdict **flips `FAIL` → `PASS`** with `examined` unchanged at
5 — on its face the strongest possible signal. It is not a defect, and the evidence is execution,
not the comment that claims it:

1. **`[]` is the documented good state.** `E9`'s source states the asymmetry in as many words:
   *"`handEdits: []` is legitimately the GOOD state and must keep counting; only `inputs` requires
   length."* The shape tag agrees — `handEdits`'s real value **is** an array, so `[]` is a
   type-preserving empty, not shapeless damage.
2. **The loader cannot produce `[]` from a failure.** `handEditCommits` **throws**
   (`remt-ctx: git log failed for … — cannot certify the MT baseline`) rather than returning `[]`,
   with a comment saying exactly why.
3. **The flip is the corpus, not the check.** `E9` FAILs on 220/220 units *because* every unit has
   at least one commit touching its `02-mt-output` file, and `E9` reports one finding per commit.
   Emptying the list removes the findings it was reporting. That is the check working.

### ⚠️ Secondary observation (not a sweep finding, logged for §C82)

While adjudicating (2) I measured the boundary rather than trusting it, **with a positive control in
the same command**:

```
git log --oneline --no-merges -- books/efnafraedi-2e/02-mt-output/ch99/NOPE-segments.is.md  → exit 0, no output
git log --oneline --no-merges -- books/…/appendices/m68859-segments.is.md                   → exit 0, 1 commit
```

**`git log` on a path that does not exist exits 0 with empty output.** So `handEditCommits` returns
`[]` — indistinguishable from "checked the right path and it is clean". `E9`'s `handEdits` leg
therefore **cannot tell "no hand edits" from "looked in the wrong place"**, and it reports the
reassuring answer.

**Not live today**: `mtOutputPathFor` is built via the guarded `chapterDirOf`, and all 220 units
have an `02-mt-output` sibling. **But it is a genuine loader/check seam** of the class this campaign
keeps finding — a blocking leg whose clean answer is also its failure answer — and it is invisible
to a ctx-state sweep, because the ctx value is well-formed in both cases. The fix, if wanted, is a
loader-side existence assertion on the path handed to `git log`, not a change to `E9`.

---

## 🔴 What the sweep could NOT reach — read this before reading "clean"

A check that **FAILs at baseline on every swept unit** cannot exhibit a silent pass: every damaged
arm is loud by construction, and a clean result over it is **an absence the sample manufactured**,
not evidence.

| Check | Blocking | Baseline PASS rate over the 10 swept units | Silent-pass behaviour observable? |
|---|---|---:|---|
| `G1` | ✅ | **0/10** | ❌ **NOT REACHABLE** |
| `G2` | ✅ | 10/10 | ✅ |
| `G3` | ✅ | **0/10** | ❌ **NOT REACHABLE** |
| `G4` | advisory | **0/10** (`WARN`) | ❌ NOT REACHABLE |
| `G5` | ✅ | 10/10 | ✅ (and it fired — the control) |
| `E1` | ✅ | 3/10 | ✅ |
| `E2` | ✅ | 4/10 | ✅ |
| `E3` | ✅ | 10/10 | ✅ |
| `E4` | ✅ | 4/10 | ✅ |
| `E5` | ✅ | **1/10** (the rescued unit only) | ✅ but thin |
| `E6` | ✅ | 9/10 | ✅ |
| `E7` | advisory | 10/10 | ✅ |
| `E9` | ✅ | **0/10** | ❌ **NOT REACHABLE** |

### Coverage rescue — and where it failed

The harness scans a spread across the corpus for one unit per unreachable **blocking** check where
that check PASSes at baseline, then adds it to the swept population. Result:

| Check | Outcome |
|---|---|
| `E5` | ✅ **rescued** by `efnafraedi-2e/appendices/m68862` |
| `G1` | ❌ no PASSing unit in a 70-unit spread over 220 |
| `G3` | ❌ no PASSing unit in a 70-unit spread over 220 |
| `E9` | ❌ no PASSing unit in a 70-unit spread over 220 |

`E5` matches the register's live fact — it FAILs on 154 of 166 module units and 12 pass vacuously
(no alt positions in source). The rescued unit is one of those 12. ▶ **So `E5`'s clean result is a
statement about the vacuous-pass population, not about the 154 that fail**, and it rests on **one**
unit.

`G1`, `G3` and `E9` are unreachable for corpus reasons, not sampling ones — `E9` FAILs 220/220 by
the register's own measurement. **This sweep establishes nothing about their silent-pass
behaviour.**

### `costBand` — read by `E9`, never supplied by the loader, never varied here

`E9` touches **`costBand`**, which appears in no ctx the loader builds. It has no well-formed
baseline to damage, so **no arm of this matrix touches it**. It is documented `[costBand]` optional
in the `CheckContext` typedef and `E9` handles a supplied-but-unusable band correctly. Two things
follow, and both are coverage statements rather than findings:

1. This sweep says nothing about `costBand`'s damaged states.
2. Because the loader never supplies it, **`E9`'s cost-band leg never runs in a real run** — the
   only *value* bound on money is `isk > 0` from leg 5. Whether the driver should supply a band is a
   Plan C driver question, logged here for §C82.

---

## What a clean Tier-1 result does and does not establish

**Does establish**, over 10 of 220 units × 13 checks × 7 states = 14,924 varying arms:

- No blocking Tier-1 check returned `PASS` over a **shapeless** value of a key it reads. The single
  blocking Tier-1 candidate was a type-preserving empty and adjudicates to correct behaviour.
- The documented guard architecture **holds under one-key-at-a-time damage**: `skipIfCtxUnusable`
  (`E1`/`E2`/`E4`/`E5`) produced 1,012 loud `SKIPPED`s, `E6`'s `Array.isArray` guard held, and `E9`
  turned every unusable leg into a `FAIL` rather than a pass.
- Zero arms threw and zero arms passed with a *changed* `examined` — no check partially noticed
  damage and passed anyway.

**Does NOT establish:**

- Anything about `G1`, `G3`, `G4` or **`E9`** — all unreachable, `E9` by 220/220 corpus FAIL.
- Anything about `E5` beyond the 12-unit vacuous-pass population; its coverage is **one** unit.
- Anything about `costBand`, or about any other key a check reads that the loader does not supply.
- Anything about **multi-key** damage. Every arm varies exactly **one** key. A guard that reads two
  keys and is defeated only when both are wrong is invisible to this design — the same class of
  blind spot that made the all-empty probe worthless, one level up.
- Anything about **value-level** corruption: a well-shaped `cnxml` holding the *wrong module's*
  bytes, or a stale vintage, passes every state in this table. That is §C82 **L21**'s open contract
  item, and `skipIfCtxUnusable`'s own docstring says so.
- Anything corpus-wide. 10 of 220 units.

---

## Files

| File | |
|---|---|
| `test-results/c82-tier1-partial-state-sweep-2026-08-28.mjs` | the harness, re-runnable from the repo root |
| `test-results/c82-tier1-partial-state-sweep-2026-08-28.md` | this report |

No production code changed. `npm test` was run at the root before committing.

**Env knobs:** `SWEEP_REPS` (default 3) representatives per kind · `SWEEP_RESCUE_CAP` (default 60)
rescue-scan spread · `SWEEP_JSON=1` to emit arm-level JSON after the report.
