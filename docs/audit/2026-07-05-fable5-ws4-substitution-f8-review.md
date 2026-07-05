# PR #233 (WS4 math-label substitution + F8) — Fable-5 correctness review

**Date:** 2026-07-05
**Run:** workflow `wf_39dd308f-ed9` (`model:'fable'`, claude-fable-5) — 4 finders (distinct correctness lenses) → dedup → 3-skeptic refute-by-default → synthesis. **38 agents, 0 errors, 0 empty results, 2.25M tokens.** RUN-1 ops-lesson check passes (survivors from real verification, not a crashed empty).
**Scope:** hard-to-detect correctness in PR #233 only; deliberately excluded the items Opus already found/fixed and the logged WS4-M2/M3/M4 + OV-M2 Minors.
**Raw → survivors:** 11 raw → 11 deduped → 7 survived adversarial verification → **5 distinct bugs** (two found independently twice — raises confidence).
**Verdict:** all 5 are Important, high-confidence, concretely demonstrated on real source, and **structurally invisible to F8** (it forward-substitutes both sides with the same resolver, so any resolver-level bug cancels). #1 and #2 affect efnafraedi-2e today.

---

# PR #233 (WS4 math-label substitution + F8) — Fable-5 Correctness Review

Five distinct correctness bugs survived adversarial verification (two were independently found twice, which raises confidence in those). None are Critical, but three affect **efnafraedi-2e today** and all share one dangerous property: **F8 is structurally blind to every one of them**, because it forward-substitutes both the source and translated sides with the same resolver — so any bug in the resolver cancels out and F8 stays green. F8 cannot be your safety net for this class.

Ranked most-severe first.

---

## 1. Case-blind resolution — capitalized math labels ship English, invisible to every guard
**Location:** `tools/lib/math-label-substitute.js:40` (`resolveLabel`)
**Confidence: High. Affects efnafraedi-2e now (~13 occurrences, 7 modules).**

**Failure scenario:** The overlay map and glossary map are both keyed lowercase (`bucketToken` only inventories `/^[a-z]{3,}$/`; `buildGlossaryMap` keys by `english.toLowerCase()`). `resolveLabel` looks up the *raw* captured label. So `<m:mtext>Rate</m:mtext>` misses both maps and resolves `source='english'` — stays English — while `<m:mtext>rate</m:mtext>` correctly becomes `hraði`. Real source hits: `Rate` ×4 in `ch21/m68854.cnxml` (integrated rate law), `Slope` in `ch12/m68793.cnxml`, `Acid`+`Base` in `ch14/m68809.cnxml`, `Total` ×2, `Activity`, `Calories`. Post-WS5 the published book shows `hraði` in some rate equations but English `Rate`/`Slope`/`Acid`/`Base` in adjacent chapters — and *within m68793*, `reaction rate`→`hvarfhraði` (glossary hit) while `Slope` stays English in the same module.

**Why it survived:** No guard can surface it. `bucketToken('Rate')==='other'`, so the loud unmapped-label report skips it entirely. F8 forward-substitutes both sides identically, so it stays green. This is exactly the silent-English-residue class WS4 was built to eliminate, now demonstrated on real current-book content.

**Suggested fix:** Case-fold at lookup — try `overlay[label]` then `overlay[label.toLowerCase()]` (same for glossary), and/or have `bucketToken` case-normalize so capitalized variants are inventoried and reportable. Decide deliberately whether `Rate`→`Hraði` (capitalized target) or `hraði`; a chemistry label mid-equation is usually lowercase, but confirm.

---

## 2. F8 permanently false-flags all DOM-built math (example/exercise/note) — masks real corruption and would break the gate-flip
**Location:** `tools/cnxml-fidelity-check.js:148` (`compareMathBlocks` byte-equality premise)
**Confidence: High. Affects efnafraedi-2e now (6 blocks, 5 modules).**

**Failure scenario:** F8 assumes `substitute(sourceBlock)` is byte-equal to the translated block absent corruption. But math inside `<example>`/`<exercise>`/`<note>` is emitted through `buildExampleDom`/`buildExerciseDom`/`buildNoteDom` → `serializeCnxmlFragment`, and the xmldom parse+serialize round-trip **rewrites bytes that substitution never touches**: numeric charrefs decode (`&#x394;`→literal `Δ`) and raw `>` re-escapes (`<m:mo>></m:mo>`→`<m:mo>&gt;</m:mo>`). Verified against committed output: `m68819` source has `<m:mo>></m:mo>` ×2, translated has `<m:mo>&gt;</m:mo>` ×2; `m68786`'s four `&#x394;` are literal `Δ` in translated. Round-tripping every example/exercise/note slice in `01-source` changes 6 blocks across m68786, m68805, m68809, m68811, m68819.

**Why it survived:** These are the math-heaviest kinetics/acid-base/equilibria/thermo modules. Two consequences both hold: (a) the planned warn→hard-gate flip would go **red on correct output**, permanently; (b) since the per-module report is only a mismatch *count*, genuine math corruption in exactly these modules is indistinguishable from the standing noise. F8's diagnostic value in the hardest modules is near zero.

**Suggested fix:** Before comparing, normalize both sides through an identical parse/serialize round-trip (or explicitly decode numeric charrefs and canonicalize `>`/`&gt;` in text nodes). Do this **before** flipping F8 to a hard gate.

---

## 3. Unmapped-label guard scans only `equations.json` math — blind to the second seam (standalone `<equation>`, note/example/answer math)
**Location:** `tools/cnxml-inject.js:3529` (`reportMathLabels` input)
**Confidence: High. Real math class exists in efnafraedi-2e; primary risk is biology/organic onboarding.**

**Failure scenario:** `reportMathLabels` is fed `Object.values(equations).map(e=>e.mathml).join('\n')` only. But the post-review second seam substitutes `originalCnxml` (~line 3575) precisely *because* standalone `<equation>` and example/exercise/note math never reach the equations object — confirmed real: `m68709` (ch04) has 4 `<m:math>` blocks inside `<note>` Answer sections (`molecular`, `complete ionic`) that live only in `originalCnxml`; `m68786` (ch12) same class. A biology/organic module whose only occurrence of a new bucket-1 label (e.g. `<m:mtext>enzyme</m:mtext>`, no overlay entry yet) sits in note-answer or standalone-equation math gets **no `⚠ unmapped math label(s)` warning** — the label ships English silently. F8 can't compensate (unmapped→`english` on both sides→equal).

**Why it survived:** The spec ("Loud unmapped-label report") explicitly promises the guard covers "any bucket-1 label token present in the math" and "travels to future books." The implementation covers substitution on both seams but the *report* on only one — silencing the alarm for exactly the math that bypassed the equations object. The same gap applies to the glossary long-subscript advisory.

**Suggested fix:** Run `reportMathLabels` on the raw `originalCnxml` (**pre-substitution**, so Icelandic fills don't pollute token collection) instead of, or in addition to, the joined equations values. `collectMathTokens` already parses full CNXML.

---

## 4. Whitespace-only overlay value silently deletes a label book-wide; `--validate` green-lights it
**Location:** `tools/lib/math-label-substitute.js:35` (`resolveLabel` pending check)
**Confidence: High mechanism; requires a lead typo to trigger. Found independently twice.**

**Failure scenario:** The pending check is `typeof ov === 'string' && ov.length > 0` — a whitespace-only value passes (length ≥ 1) and, being `!== key`, is classified `overlay-translated`. Demonstrated: overlay `{"rate": " "}` turns `<m:mtext>rate</m:mtext>` into `<m:mtext> </m:mtext>` — the label is erased from every equation in the book. The gate that should catch it does not: `validateMap` classifies `" "` as `translated` and `validateValue` emits only the *advisory* "multi-word (contains whitespace)"; `inventory --validate` exits 0 ("✓ no correctness errors"). F8 can't catch it (both sides substitute to `" "`). Related same-line defect: a value differing from its key only by whitespace (`{"amu": "amu "}`) is misread as a translation instead of a self-map, injecting a stray space *and* silently re-enabling the glossary auto-replacement the self-map was meant to opt out of.

**Why it survived (and the honest caveat):** It needs a human to leave a stray space — but there are 7 pending fills sitting empty in `math-label-map.json` today (`con/dep/eff/ele/frz/sub/tet`), and a one-keystroke slip while filling one is book-wide silent deletion with **zero tripwire** at validate, inject, or fidelity-check. The glossary branch already guards this exact case with `g.trim()`; only the overlay branch omits it.

**Suggested fix:** Gate on `ov.trim().length > 0` (treat whitespace-only as pending), compare `ov.trim() === label` for self-map, and make whitespace-only a **hard** error in `validateValue` so `--validate` fails.

---

## 5. Entity-encoded whitespace splits inventory (decoded) from substitution (raw) — a mapped label silently never substitutes
**Location:** `tools/lib/math-label-substitute.js:66`
**Confidence: High mechanism; zero current efnafraedi-2e hits — risk is onboarded lifraen-efnafraedi / edlisfraedi and future intake.**

**Failure scenario:** `collectMathTokens` uses DOM `textContent`, which decodes `&#x00A0;`→U+00A0, and `String.trim()` strips it — so `<m:mtext>all&#x00A0;</m:mtext>` (real: `lifraen-efnafraedi/ch27/m00265.cnxml`, the "(all Z)" fatty-acid descriptors; same class `net&#160;` in `edlisfraedi-2e/ch10/m42179.cnxml`) inventories as the clean label `all`. The lead fills it. But `substituteMathLabels` trims the **raw** captured inner `all&#x00A0;` — the entity text is not whitespace to `trim()` — so `resolve()` gets `all&#x00A0;`, misses the key, and the node stays English while other bare occurrences of the same label substitute (inconsistent published math). No unmapped warning fires (`reportMathLabels` sees the decoded `all`, which *is* in the overlay).

**Why it survived:** The inventory and substitution disagree on what the label string is; the map is filled against one and applied against the other. F8 is blind (source side misses identically; both cancel). Lowest rank only because it doesn't touch chemistry today — but lifraen-efnafraedi is already onboarded.

**Suggested fix:** Match on `decodeEntities(inner).trim()` for the key lookup while keeping the raw-core replace, so inventory and substitution agree; or normalize entity-encoded whitespace at extraction.

---

## Bottom line
- **Fix #2 (F8 false-flag normalization) before ever flipping F8 warn→hard-gate** — otherwise the gate goes red on correct output and you lose the tool's ability to show real corruption in the hardest modules.
- **#1 (case-blind) is the highest-value content fix** — it's real English residue in the current book, on the exact label class WS4 exists to kill, and no guard will ever tell you.
- **The cross-cutting lesson:** F8 forward-substitutes both sides with the same resolver, so it cannot catch any resolver-level bug (#1, #4, #5) or any originalCnxml-only unmapped label (#3). Do not treat F8 as the backstop for substitution correctness; the unmapped-label *report* (once it covers both seams, #3) and hard validation of the map (#4) are the real tripwires.

All five are beyond the seven already-logged items. Confidence is high on the mechanisms (each was demonstrated by executing the real functions on real source); the honest caveats are on *reach*, noted per finding — #4 needs a human typo, #5 has no current chemistry hits.
