# Organic's exercise architecture — measured, and one false finding retracted

**Measured 2026-08-27** · **frozen; cite, do not sync.** Evidence for the [LEAD] ctx-loader
decision (`docs/plans/2026-08-27-ctx-loader-decision-brief.md`), §C82 L19/L133/L134/L135.

Prompted by a lead hypothesis: *that OpenStax changed the exercise system for Organic Chemistry —
one collection of problems, injected into chapters by a selection process, possibly in preparation
for reusable learning aids.* **The structural half is confirmed. The "shared pool" half is not:
placement is exhaustive and exclusive.**

---

## 1. Organic is architecturally different from all four other books, with no mixed cases

| book | modules | with `<exercise>` | with `os-embed` | inline prose | pool dir |
|---|---|---|---|---|---|
| `efnafraedi-2e` | 149 | 114 | **0** | 114 | — |
| **`lifraen-efnafraedi`** | 342 | 260 | **260** | **0** | **1,961 json** |
| `liffraedi-2e` | 259 | 208 | **0** | 208 | — |
| `edlisfraedi-2e` | 283 | 243 | **0** | 243 | — |
| `orverufraedi` | 159 | 127 | **0** | 127 | — |

**The split is total.** Organic is 260 of 260 embed-based with zero inline prose; the other four
are 692 inline modules with zero embeds and no pool directory. Not a drift — a different
architecture applied wholesale.

**What the two forms look like:**

```xml
<!-- chemistry: the problem text is IN the CNXML -->
<exercise id="fs-idm230641408">
  <problem id="fs-idm297205264">
    <para>Is one liter about an ounce, a pint, a quart, or a gallon?</para>
  </problem>
</exercise>

<!-- organic: the CNXML carries an empty shell and a POINTER -->
<exercise id="exer-00001">
  <problem id="prob-00001">
    <para><link class="os-embed" url="#exercise/01-04-OC-P03"/></para>
  </problem>
</exercise>
```

⚠️ **Acquisition order does NOT support "the new way going forward".** `edlisfraedi-2e` was
fetched **45 seconds before** organic on the same day (2026-03-23) and is wholly inline. Fetch
date says nothing about authoring vintage, but it does rule out the difference being an artefact of
when we pulled. **The local evidence supports "organic-specific"; it cannot distinguish one-off
from leading-edge.**

## 2. The pool is flat STORAGE with 1:1 placement — not shared content

| | |
|---|---|
| references in CNXML | **1,961** |
| distinct exercise ids referenced | **1,961** |
| pool files | **1,961** |
| referenced but not in the pool | **0** |
| in the pool but never referenced | **0** |
| **referenced from more than one module** | **0** |
| modules carrying references | 260 of 342 |

CONTROL: an invented id (`ZZ-99-OC-P00`) resolves in neither set.

▶ **Every exercise belongs to exactly one module.** The pool is an inventory with its own
lifecycle (`version`, `published_at`, `group_uuid`, `uid` like `36122@13`), but nothing in this
book is reused across placements. **The "single pool for other purposes" reading is consistent with
the STORAGE shape and is not evidenced by the PLACEMENT.**

## 3. The id grammar is item-bank shaped

`CH-SS-OC-{type}{nn}` — all 1,961 ids have four hyphen-separated fields.

| type | count | | section code | meaning |
|---|---|---|---|---|
| `AP` | 996 | | `99` | the chapter-end bank — **1,400 refs across 31 modules** |
| `P` | 561 | | `01`–`nn` | in-section — **561 refs across 251 modules** |
| `MP` | 240 | | | |
| `VC` | 119 | | chapters | `01`–`31`, plus a lettered **`18a`** |
| `GP` | 33 | | | |
| `EDRM` | 10 | | | |

Two ids carry a trailing letter (`26-99-OC-MP04a`, `15-99-OC-AP39a`), i.e. insertions after the
fact — the signature of a bank edited in place rather than renumbered.

---

## 4. 🔴 A FALSE FINDING, RETRACTED — AND IT WAS AN EXACT ENUMERATION OF MY OWN BLIND SPOT

**I reported that 2 of the 1,961 pool entries (`02-06-OC-P10`, `30-09-OC-P12`) were referenced by
no chapter, and that we would pay to translate two exercises nothing uses. BOTH ARE IN THE
PUBLISHED BOOK** — P10 directly below P09 in §2.6, P12 as the sole problem at the end of §30.9.
The lead knew the live book and said so; **nothing in my instrument would ever have told me.**

**The mechanism.** There are two `os-embed` spellings, and my pattern matched one:

```
class="os-embed"                 →  1,959 references   ← matched by /os-embed"?\s+url="#exercise\//
class="os-embed exercise-block"  →      2 references   ← MISSED: a second class token intervenes
```

The corpus contains **exactly two** references in the variant form, and they are **precisely the
two I called orphans**. The "finding" was not about the data at all — it was a complete, accurate
census of where my regex could not see.

**Why the control did not save me.** I ran one: *an invented id resolves in neither set* → `false`.
It is a real control and it passed. It proves the instrument can return a negative — it **cannot**
reveal that the instrument is blind to an entire *reference form*. ▶ **A control on the VALUES a
detector returns says nothing about the SHAPES it can see.** To catch this the control had to be a
different construction, not a different input:

```
grep -rhao 'url="#exercise/[^"]*"' …   →  1,961        (identity lives in the URL)
grep -rhao 'class="os-embed[^"]*"' … | sort | uniq -c  (enumerate the forms, do not assume one)
```

**Both are now the method:** anchor on the field that carries the identity (`url`), never on a
neighbouring attribute whose value may vary — and **enumerate the variants before counting**, so
the count is over a population you have seen rather than one you assumed.

⚠️ This is CLAUDE.md's `<tag[^>]*>` rule arriving through a new door. That rule is about a regex
running past the end of a tag; this is a regex making an assumption about what sits *inside* one.
Same cause — treating attribute structure as fixed — different symptom.

---

## 5. What this changes for the decision

- ✅ **There are no orphans.** The bijection is exact: 1,961 ↔ 1,961, nothing unreferenced,
  nothing dangling, no reuse.
- 🔴 **The granularity blocker is OUR bundling, not OpenStax's structure.**
  `tools/exercise-extract.js` groups a whole chapter into one `exercises-segments.en.md` (35–86
  exercises, 77–392 segments). The source hands us an unambiguous **exercise → module** mapping.
  A per-module or per-exercise unit is therefore *well defined by the data* — the aggregation is a
  choice we made, and it is the choice that makes the Tier-1 unit mismatch.
- ⚠️ **It does not make the Tier-1 checks work as built.** Those compare segment text against
  CNXML, and organic's CNXML contains only pointers — the prose is in JSON. Re-bundling fixes the
  *unit*; it does not give E2/E4/E5 a document to compare against. **Both problems are real and
  they are separable, which they were not before this measurement.**
