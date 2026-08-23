# §C88 scope re-take — re-measurement of the 245 and the zero

> **FROZEN EVIDENCE — 2026-08-23.** A measurement as taken, not a status record and not a
> decision. **The register owns status** (`docs/plans/2026-07-21-post-item17-followup-campaign.md`,
> ⏩ RESUME); if this file disagrees with it, the register wins. No ruling is taken here — the
> handoff's instruction was *"re-measure both carried numbers before acting"*, and this is that
> step and nothing more.

**Probe:** [`c88-scope-retake-probe-2026-08-23.mjs`](c88-scope-retake-probe-2026-08-23.mjs) —
read-only, pure-function imports, never the CLI. Re-run from the repo root.
`git status --porcelain` was clean before the run and showed only these two new files after — no
write reached `books/`. The probe resolves every `books/` path against `import.meta.url`, so it is
cwd-independent; verified by running it from outside the repo and diffing the output (identical).

---

## Verdict in one line

**All four carried numbers reproduce exactly: 245 · 33 modules · 213/32 · zero.** No number
moved. Every control fired.

---

## A · The 245 — unit: **alt-bearing `<media>` elements**

Detector, §C88 Task 10's verbatim: alt-bearing `<media>`, **no `@id`**, **no `<figure>`
ancestor**, **direct parent** in `{example, problem, solution, note, entry}`.
`reachable` is `altReachability()`; `emitted` is `extractSegments().segments.filter(type==='alt')`.

| book | files | reachable | guarded | modules | predicted | emitted | residual | guarded by parent |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `efnafraedi-2e` | 149 | 1149 | 0 | 0 | 1149 | 1148 | **−1** | — |
| `lifraen-efnafraedi` | 342 | 2163 | **245** | **33** | 1918 | 1918 | **0** | `entry` × 245 |
| `edlisfraedi-2e` | 283 | 1501 | 41 | 40 | 1460 | 1465 | **+5** | `note` × 40, `problem` × 1 |
| `liffraedi-2e` | 259 | 1212 | 0 | 0 | 1212 | 1212 | **0** | — |
| `orverufraedi` | 159 | 849 | 0 | 0 | 849 | 848 | **−1** | — |

**Why the whole table is the control, not just the organic row.** Task 10 predicted two exact
hits *and three specific signed residuals* (chemistry −1 `m68727`; microbiology −1 `m58854`;
physics +5). All five rows reproduce, including the physics parent split `note`×40 + `problem`×1.
**An instrument wrong in a compensating way does not reproduce two exact zeros plus three
correctly-signed residuals** — checking organic alone would not have distinguished that. Physics
is the aimed control: it proves the predicate discriminates *position*, not merely id-lessness.
`unreachable` is 0 for every book, as `ALT_BLIND_DIRECT_PARENTS` being empty requires. Module
counts (149/342/283/259/159) match Task 10's table, so the populations are the same.

## B · The zero — **both units reported**, because the source claim mixes them

The synthesis sentence reads *"ZERO id-bearing `<media>` across 340 media-bearing files
(chemistry 137/137, …)"* — an **element** count and a **file** count in one breath. Reported
separately so the reading does not have to be inferred:

| book | `<media>` elems | with `@id` | files with media | files with id-bearing media | `<figure>` | with `@id` |
|---|---:|---:|---:|---:|---:|---:|
| `efnafraedi-2e` | 1149 | 1149 | 137 | **137** | 627 | 627 |
| `lifraen-efnafraedi` | 2163 | **0** | 340 | **0** | 1911 | **1911** |
| `edlisfraedi-2e` | 1501 | 1450 | 275 | **274** | 1430 | 1430 |
| `liffraedi-2e` | 1212 | 1212 | 257 | **257** | 1152 | 1152 |
| `orverufraedi` | 849 | 849 | 154 | **154** | 822 | 822 |

**The ambiguity dissolves: organic is 0 in *both* units.** Zero id-bearing `<media>` elements,
and zero of its 340 media-bearing files contains one. All four file-unit controls reproduce
exactly (137/137 · 274/275 · 257/257 · 154/154).

🔴 **The asymmetry that matters is on the same row: organic has 1,911 `<figure>`, and every one
of them carries an `@id`.** So the book is not id-less — its ids sit on the **figure**, never on
the **media**.

⚠️ **Therefore "structurally inert for the entire book" is true of the `!media.id` rescue and of
nothing else — do not generalise it to organic's alt pipeline.** Organic emits 1,918 alt segments
and `tools/__tests__/alt-writeback-corpus.test.js` pins **1918 emitted / 1918 reached /
dropped `[]`** (re-run 2026-08-23, green). Those survive because the figure path keys on the
figure id. The 245 have neither a media id nor a figure ancestor, so they have **no key at all**.

## C · Third-source cross-check — `cnxml-extract.js:1557ff`

That comment claims *"37 total alt-bearing table-cell media corpus-wide (29 chemistry + 8
physics)"*. It reconciles, once the predicate is made explicit — it counts **any depth** inside
`<entry>` (what the extractor's `extractElements(entry.content, 'media')` regex actually reaches),
not direct-parent:

| book | direct parent `entry`: id-bearing | id-less | any depth in `entry`: id-bearing | id-less |
|---|---:|---:|---:|---:|
| `efnafraedi-2e` | **29** | 0 | **29** | 0 |
| `lifraen-efnafraedi` | 0 | **245** | 0 | **246** |
| `edlisfraedi-2e` | 0 | 0 | **8** | 0 |
| `liffraedi-2e` | 0 | 0 | 0 | 0 |
| `orverufraedi` | 0 | 0 | 0 | 0 |

**29 + 8 = 37 ✓.** Chemistry's 29 sit directly in the cell; **physics's 8 are all inside a
`<figure>` inside an `<entry>`, all in `m42368`** — which is why they vanish under a
direct-parent predicate and why they are not part of physics's 41 `guarded`. The register table,
the synthesis and a code comment written by a different task now agree.

📌 **One detail the carried numbers do not mention: organic's any-depth figure is 246, not 245.**
The extra one is `m00046`, an id-less `<media>` wrapped in `<figure id="fig-00004">` inside a
table cell. It is correctly **excluded** from `guarded` (it has a figure ancestor) and is
reachable and emitted through the figure key. **245 and 246 are different predicates, both right.**

## D · The voided premise — "213 sit in modules §C80 is not buying"

Bought set derived from disk (`books/lifraen-efnafraedi/02-mt-output`), not typed from prose:
**17 modules** — `m00031`–`m00038`, `m00134`–`m00142`.

| | alts | modules |
|---|---:|---:|
| **inside** the 17-module preview | **32** | 1 — `m00032` |
| **outside** it | **213** | 32 |
| total | **245** | **33** |

**213/32 reproduces exactly.** 🔴 **And every one of the 32 in-scope alts is in `m00032`** — the
same module the §C85-drop fix took from 36→36. That is precisely the population the handoff means
when it says *"`m00032` going 36 → 36 is NOT 'alt fixed'"*.

⚠️ **Do not conflate the 245 with §C89's 243.** `alt-writeback-corpus.test.js:108` records that
§C89's first cut *"keyed its lookup on the media's id and still dropped 243 here … because
organic's media are overwhelmingly ID-LESS."* Those 243 were **emitted-then-dropped-at-inject**
segments (since recovered — 1918/1918). The 245 are **never-emitted**. Different populations,
adjacent magnitudes, same underlying cause. *(That comment says "overwhelmingly"; measured here it
is **entirely** — 0 of 2,163.)*

---

## What this measurement does and does not settle

**Settles:** every number the ruling and the handoff carry is current, and the id-less-media
mechanism is confirmed from four independent directions (register table · live extractor ·
committed corpus gate · an unrelated task's code comment).

**Does not settle:** the ruling itself. The spread is 22 chapters plus `appendices`; the anchor is
design, not spend; and bringing the 245 in needs a real inject-side key for an id-less bare
`<media>`, which no existing mechanism supplies. **That call is not taken here.**
