# §C145 ① + ② — marker-residue gates at inject and render

**Frozen 2026-09-17.** Historical evidence, not status → the active register wins on
any disagreement (CLAUDE.md § One source of truth). Branch
`fix/c145-marker-residue-gates`, code commit `ccfe794fe`. **Cost 0 ISK** — no paid
leg was touched; every measurement is local and read-only except the two inject
passes, which were restored and `cmp`-verified.

---

## 1. What was built

**①** `assertNoMarkerResidue` (`tools/cnxml-inject.js`) matched a **whole**
`[[type:…]]` token. ⑰'s `annotateInlineTerms` corruption **consumes the closing
`]]`**, so the gate was blind to exactly the shape it exists to catch.
The predicate is now the marker's **opener**.

**②** `cnxml-render.js` had **no** residue check on its output (0 occurrences of
`[[` in the whole file). It now has **two**, and the order between them is
load-bearing (§6.1): a **pre-flight** over the chapter's input CNXML that refuses
before the render deletes anything, and a write-time gate at the single
`writeHtmlPage()` choke point that all seven HTML writers funnel through.

The predicate has ONE owner — `tools/lib/marker-residue.js` — shared by both
gates, so they cannot drift. The `(?!MATH:|MEDIA:)` carve-out is unchanged,
case-sensitive, and identical on both sides: `term-text.js`'s `stripInlineMarkers`
keeps `[[MATH:n]]` **on purpose** for `flattenMarkersToText` to resolve, so a gate
that flagged it would refuse a shape the pipeline maintains by design.

---

## 2. 🔴 The headline: the gate is NOT inert — it refuses 4 chemistry modules, and 3 were invisible

A **default** inject of chemistry today reproduces ⑰'s corruption. Measured by
running the real CLI, old code vs new, over both kept books.

| module | chapter | residue the new gate names | old verdict | new verdict |
|---|---|---|---|---|
| m68700 | ch03 | `[[term:` ×1 — `…þekktur sem [[term:tala Avogadros (…` | **WRITTEN** (exit 0) | FAILED — marker residue |
| m68733 | ch06 | `[[i:` ×1 — `…m<sub>s</sub></emphasis> (e. [[i:ms)</term>` | SKIPPED (incomplete) | FAILED — marker residue |
| m68747 | ch08 | `[[i:` ×1 — `…sameindasvigrúm (e. σ[[i:s)</term>` | SKIPPED (incomplete) | FAILED — marker residue |
| m68844 | ch19 | `[[i:` ×2 — `(e. e[[i:g)`, `(e. t2[[i:g)` | SKIPPED (incomplete) | FAILED — marker residue |

**Read the two rows differently — they are not the same event:**

- **m68700 is a behaviour change on disk.** The old code **wrote the corruption
  and exited 0**; verified by running the old inject and measuring the file it
  produced: opener hits **1** (`[[term:` TRUNCATED), old closed-form pattern **0**
  on that same file — which is precisely why it exited 0. This is `5dbc9a6b`
  reproduced on demand.
- **m68733 / m68747 / m68844 are NOT a change on disk.** Both old and new refuse
  to write; only the **reported reason** changes, because the gate throws before
  the completeness verdict is reported. ▶ **What is new is the SIGHT of them.**
  Each carries a truncated marker that no run has ever reported, masked by an
  unrelated incompleteness skip. **They would have started shipping it the moment
  their chapters got their re-MT and became writable.**

### ⚠️ This is NOT a new defect population — it is ⑰'s, reconciled exactly

§C118 ⑰ already recorded the scope by a depth-aware scan: _"1,542 `[[term:]]`
markers — 1,409 flat · 127 one-nested · **6 two-nested** (chemistry
ch03/ch06/ch08/ch19; organic 0)"_. **Those are these four modules.** Re-measured
here over 864 segment files in all five books, both MT stages, depth-aware:

| `[[term:` nesting | count |
|---|---|
| flat | 2,101 |
| one level | 267 |
| **two levels** | **6** |

and the six resolve to **five distinct ENGLISH markers plus one Icelandic copy**:

```
02-for-mt/ch03/m68700  [[term:Avogadro's number ([[i:N[[sub:A]]]])|term-00003]]
02-for-mt/ch06/m68733  [[term:[[i:m[[sub:s]]]]|term-00020]]
02-for-mt/ch08/m68747  [[term:σ[[sub:[[i:s]]]] molecular orbital|term-00008]]
02-for-mt/ch19/m68844  [[term:[[i:e]][[sub:[[i:g]]]] orbitals|term-00002]]
02-for-mt/ch19/m68844  [[term:[[i:t]][[sub:2[[i:g]]]] orbitals|term-00003]]
02-mt-output/ch03/m68700  (the Icelandic copy of the first — why the total reads 6)
```

▶ **The gate emits exactly five residues, one per ENGLISH two-nested marker.**
That is the reconciliation: **⑰'s count and this gate's count are the same
population, measured at different stages.**

It also explains the residue *types*, which differ per module: m68700's is
`[[term:` (the outer marker itself is destroyed), while m68733/m68747/m68844
surface as `[[i:` — because `annotateInlineTerms` splices the **English** term
text, which is where the nesting lives, into the output, and in those three the
damage lands on the inner marker. ⚠️ *An earlier draft of this document said the
residues "read `[[i:` and not `[[term:`", which contradicts the table above; a
review caught it.*

⚠️ **One thing the term-scoped scan could not see, found here and latent:**
organic carries two-nested **`[[b:`** markers — `ch01/m00164`
(`[[b:[[i:sp[[sup:3]]]] hybrid orbitals]]`) and `ch16/exercises`
(`[[b:(a), [[b:(b), [[b:(e)]]]]]]`). ⚠️ **The second is NOT MT-invented** — an
earlier draft said so and a review refuted it: `01-source/exercises/16-03-OC-P05.json`
carries `No rearrangement: <b>(a), <b>(b), <b>(e)</b></b></b>` verbatim, i.e.
**improperly nested `<b>` in OpenStax's own content**, which CLAUDE.md § clean
CNXML says to accept rather than tidy. Neither produces residue today (organic
changed in **0** rows of the verdict diff), so both are latent. `[[b:` depth-3
count corpus-wide: **3**.

Every one of the four modules is cleared by `--no-annotate-en`, which confirms the
mechanism is the `(e. …)` annotation insertion — previously proven only for
m68700:

```
m68700 --no-annotate-en → Translated CNXML written [COMPLETE] [PERFECT fidelity]
m68733 --no-annotate-en → SKIPPED — incomplete injection   (residue gone; skip is unrelated)
m68747 --no-annotate-en → SKIPPED — incomplete injection   (residue gone; skip is unrelated)
m68844 --no-annotate-en → SKIPPED — incomplete injection   (residue gone; skip is unrelated)
```

⚠️ **This does not fix ⑰.** The durable fix for the corruption itself is still
⑰'s (a depth-aware `TERM_TEXT` scan, or retiring `annotateInlineTerms` in favour
of `data-en`). What changed is that the loss is now **mechanical rather than
remembered**: a default chemistry ch03 inject can no longer silently drop the
holding state.

---

## 3. Every other measurement

### 3.1 Inject: full old-vs-new verdict-set diff (the CLAUDE.md-mandated check)

Real CLI, every chapter of both kept books, verdicts classified per module.

| | WRITTEN | SKIPPED | FAILED (other) | FAILED (marker residue) | total |
|---|---|---|---|---|---|
| old | 69 | 97 | 325 | — | 491 |
| new | 68 | 94 | 325 | **4** | 491 |

**Per-module diff: exactly 4 rows, all chemistry, all in one direction** (a silent
pass or a differently-labelled refusal → a named refusal). **0 modules went the
other way**, and organic changed in no row.

### 3.2 Render: would the new gate refuse anything that renders today?

Every committed `03-translated` module of both kept books, rendered **in memory**
(nothing written):

```
modules rendered : 161
render errors    : 0
GATE REFUSALS    : 0
POSITIVE CONTROL refused: true
VERDICT: CLEAN (and the harness can refuse)
```

The control is the point: a clean sweep from a harness that cannot refuse would be
indistinguishable from a harness that is blind. The control is the real committed
corrupt m68700 (`66612e43d`), rendered the same way — 213,137 bytes, 1 opener hit.

### 3.3 Corpus census — all five books, not just the kept two

Every tracked `.cnxml` and `.html` under `books/` (01-source, 03-translated,
05-publication) in all five books — **1,717 files**: **ONE residue instance
corpus-wide, present in TWO files** (the module and the page rendered from it).

- `books/orverufraedi/03-translated/mt-preview/ch05/m58805.cnxml` — `[[b:]]`
- `books/orverufraedi/05-publication/mt-preview/chapters/05/5-4-thorungar.html` — the same,
  **reader-visible**, next to `<dfn>þörungablómi (e. algal bloom)</dfn>`

⚠️ *Re-derived while checking this document: the population is 1,717 files, not
the 1,491 a first draft asserted. A census whose denominator is stated is a
census someone can check — which is the point of stating it.*

**Provenance, measured:** both files were written by one commit, `7aca8fd0`
(2026-03-23), and their blobs are byte-identical at that commit, at both 2026-04-19
dependabot merges, at HEAD and in the working tree. `assertNoMarkerResidue` was
introduced 2026-07-02 (`9b32ff32`). **The residue predates the gate by 101 days;
nothing bypassed anything** — the gate has never run over that module. The gate *as
introduced* already matched lowercase types, so every version would have caught it.
A second, independent census — a different instrument, run by a different agent,
over a WIDER population (**2,648** tracked text files: every `.cnxml`, `.html`,
`.json`, `.md` and `.svg` under `books/*/03-translated/` and
`books/*/05-publication/` in all five books) — returns the same two files and no
others: **no file written after the gate carries residue.**

⚠️ **`[[b:]]` is a CLOSED marker, so it is a motivating case for ② and NOT for ①** —
re-injecting microbiology ch05 today would trip the pre-existing closed-form gate.
It is legacy, in a withheld book. **A microbiology ch05 re-render WILL now refuse
until that module is re-injected. That is the gate working.**

### 3.4 Where the gate had to sit, and why

*Vista + Birta* **spawns** the CLI — `pipelineService.runRender` →
`spawnJob` → `spawn('node', ['tools/cnxml-render.js', …])`, verified by an
in-process spawn probe that recorded the real argv. A census of all 23 write calls
under `server/` finds **only JSON and text: the server writes no HTML anywhere.**
`renderService.js` does `import()` the renderer, but only for the read-only
preview route, which `res.send()`s and writes nothing. ▶ **So the write-site choke
point covers prod's publish path**, and the preview is deliberately left
unguarded — an editor inspecting a broken module should still see the page.

The file's one bare `fs.writeFileSync` is **not** an HTML page: it is the two-line
plain-text `rollups-complete` marker for vefur. *(Cited by NAME, not by line: a
review pointed out that the line number a first draft gave had already moved — a
line number in a frozen document is stale the moment the file is edited.)*

**The two failure shapes are both deliberate:**
- a **module** page throws into `main()`'s per-module `catch (moduleErr)` — nothing
  is written, the previously published page stays, the module is named, and
  `process.exitCode = 1`. The spawned child's non-zero exit becomes
  `job.status='failed'` with the message in `job.output`, which the editor badge shows.
- a **rollup** page throws into the chapter-wide catch → `rollbackWrittenFiles`
  restores every page written this pass.

### 3.5 Tests

- `tools/__tests__/marker-residue.test.js` (25) — the superseded closed-form pattern
  is carried as a **control**: it must score **0** on the real truncated fixture, or
  the fixture is not the blind shape and every other assertion is theatre.
  Negative controls: chemistry brackets `[[Ag(NH3)2]+]`, the OpenStax editorial
  comment `[[Insert UNF p. 149-1 here]]`, single brackets, empty/nullish.
- `tools/__tests__/marker-residue-render-gate.test.js` (13) — a **RED/GREEN pair**:
  the corrupt module must still render the literal marker into HTML *first*, else
  the refusal assertion proves nothing. Plus the microbiology closed shape.
- The choke point is a **checked property, not an enumeration**: exactly one
  `safeWrite(` in executable code (comments stripped, with a control asserting the
  stripped prose mentions really exist) and eight `writeHtmlPage(` occurrences
  (7 writers + the definition). An eighth writer cannot skip the gate silently.

### 3.6 Suite

See §5 — measured against the pre-change floor, both directions by name.

---

## 4. What this does NOT cover

- **It does not fix ⑰.** The corruption is still produced; it is now refused
  instead of written.
- **It does not fix the m00061 docref resolver** (§7) — same class, its own unit.
- **It does not make a refusal visible in the EDITOR.** A confirmed review finding:
  the inject/render pipeline paths surface a failed job's exit status, and the
  refusal TEXT does not reach the editor's UI. The CLI operator sees it in full;
  an editor clicking *Vista + Birta* does not. Logged, not built.
- **It does not clean the microbiology legacy instance.** `[[b:]]` is still on
  disk and still on the published microbiology page (a withheld book). Fixing it
  means re-injecting ch05, which is out of this item's scope.
- **The preview route is unguarded by design** (§3.4).
- **Nothing here re-renders or re-injects anything for delivery.** Both inject
  passes were restored; the tree is byte-clean.
- **It says nothing about vefur**, which serves what was synced before any of this.

---

## 5. Suite

Measured from the repo root with `npm test` (`vitest run`; **not** Playwright —
E2E is a separate CI job, so a green `npm test` is never evidence for an E2E
change). The floor was taken by reverting exactly the changed/added files to
`HEAD~1` **in place** and re-running, so the two runs differ only by this work.

| run | test files | tests |
|---|---|---|
| floor (pre-change) | 13 failed / 395 passed (408) | **36 failed** / 6,510 passed / 1 skipped (6,547) |
| this branch, first cut | 16 failed / 394 passed (410) | 39 failed / 6,545 passed (6,585) |
| **this branch, final** | **13 failed / 397 passed (410)** | **36 failed** / 6,562 passed / 1 skipped (6,599) |

**Failing set diffed BY NAME, both directions, against the floor: IDENTICAL.**
0 only-on-branch, 0 only-on-floor. Test count 6,547 → 6,599 = **+52**, all
passing, all new.

⚠️ **The middle row is the honest part of this table and the reason the diff is
by name.** The first cut added **3** failures — all three organic corpus sweeps —
and a count alone would have read as "+3, roughly the same". They had ONE cause,
and it was a real latent defect the new gate exposed (§6), not test noise. They
are resolved by recording the refused module by name rather than by weakening
anything.

⚠️ **This is the LOCAL floor. CI's is not the same** — CI also runs
`format:check` and Playwright, and this project has measured local-vs-CI floors
diverging before. Judge the branch on CI's own comparison against `main`.

---

## 6. What the adversarial review changed — 5 lenses, 37 findings, 25 confirmed

A 42-agent review (5 independent lenses, then one adversarial verifier per
finding, each told to REFUTE and to default to "not real") ran against
`ccfe794fe`. **12 of 37 findings were refuted on re-measurement**, which is the
point of verifying rather than acting on a reviewer's confidence. The confirmed
ones that changed the code:

### 🔴 6.1 THE BLOCKER: the gate's ORDERING would have cost a chapter its pages

A full-chapter render `unlinkSync`s every `.html` **and every `.backup.*`** in the
chapter directory *before* rendering. So a write-time refusal has no previous
page to fall back on, and `rollbackWrittenFiles` — having had its backups swept —
**deletes**. The gate as first written would have destroyed a whole chapter to
stop one bad module.

**Measured counterfactually on microbiology ch05**, which carries the one real
committed residue:

| | pages before | run | pages after | `5-4-thorungar.html` |
|---|---|---|---|---|
| pre-flight disabled | 12 | `Cleaned 12 existing HTML file(s)`, then refused at write time | **11** | **GONE** |
| pre-flight enabled | 12 | refused before anything was touched, exit 1 | **12** | intact |

`git status` after the guarded run: **0 changes**. ▶ **A repair must not cost
more than the defect, and only the counterfactual could show which it was.**
Fixed by `assertNoMarkerResidueInInputs`, which reads the chapter's input CNXML
and refuses *before* the sweep. ⚠️ The editor's *Vista + Birta* passes `--module`
and never sweeps, so that path was always safe — this protects the CLI path.

### 6.2 The tests pinned the gate but not its CALL SITE

A reviewer measured that four mutations which make the gate do nothing left all
38 tests green. Mutation-tested after the fix, with a golden copy taken first and
`cmp` after every round (and at the end):

| mutation | result |
|---|---|
| remove the gate call from `writeHtmlPage` | **2 failed** |
| remove the pre-flight call from `main()` | **1 failed** |
| `findMarkerResidue` returns nothing | **10 failed** |
| revert the predicate to the old closed form | **14 failed** |
| write first, gate after (order inversion in `writeHtmlPage`) | **2 failed** |
| move the pre-flight AFTER the sweep (the real defect) | **1 failed** |

⚠️ **The first attempt at the pre-flight pin passed with the call deleted**, and
the reason is worth carrying: it searched for
`assertNoMarkerResidueInInputs(modules`, which the function's own DECLARATION
also matches. It is anchored on `args.track` now — an argument only the call
site passes. **A pin aimed at a call must not be satisfiable by the declaration.**

### 6.3 The structural pin guarded the wrong token, with an unsound instrument

It counted `safeWrite(` after stripping comments with a regex that a reviewer
measured damaging executable code — and `safeWrite(` is not the property anyway,
since a bypassing writer can use `fs.writeFileSync`. Now: `= safeWrite(` (the
assignment form, which needs no comment-stripping — measured 3 mentions, exactly
1 assignment), plus `fs.writeFileSync(` pinned at 1, plus a `>= 8` FLOOR on
`writeHtmlPage(` instead of an exact count that would red on a legitimate writer.

### 6.4 The predicate's end-scan was the very idiom this item exists to correct

`[^\]]*\]\]` anchored at the opener can borrow a LATER marker's `]]` and report a
token that is not in the file, and it stops at a nested marker's inner close.
Replaced with a depth-aware `markerEnd()` bounded at 2,000 characters. This is
what makes the m00061 finding below legible as an intact-but-unresolved marker
rather than a phantom truncation.

### 6.5 `countPlaceholderMarkers` was a claim, not a mitigation

The module header said carved-out `[[MATH:n]]`/`[[MEDIA:n]]` counts were "still
reported, non-gating" — and the function had **zero production callers**.
`writeHtmlPage` now prints them. The carve-out itself is unchanged and stays
shared with the inject gate; a reviewer's case for dropping it on the render side
was confirmed as *pre-existing* (`HEAD~1` had no render gate at all, so the
change removes no detector) and is logged, not silently widened here.

---

## 7. Organic m00061 — a KNOWN §C115 instance the gate can now SEE

⚠️ **NOT a new finding, and an earlier draft of this section wrongly claimed it
was.** The register already records it, in §C118's three-pre-existing-§C115-instances
bullet: *"`[[docref:specific rotation, [[[i:α]]][[sub:D]]|…]]` on organic ch05
m00061 is unconvertible **and the residue gate shares the idiom, so it is
silent** (0 exposure until ch05 is bought)"*. ▶ **That prediction is what this
work discharges: the gate is no longer silent on it.** What is genuinely new is
the detection, and the measured consequence for three corpus sweeps.

Organic **m00061** (ch05) carries
`[[docref:specific rotation, [[[i:α]]][[sub:D]]|m00052#term-00004]]`. The inner
`[[i:α]]` resolves to `<emphasis…>α</emphasis>`, leaving a **literal `]`** in the
docref payload — so the docref itself is never converted and reaches the output
as residue. **The superseded whole-token gate could not see it**, because
`[^\]]*\]\]` breaks on that literal `]`. The neighbouring docref in the same list
resolved into a `<link>` correctly, which is what makes this a defect rather than
a design.

**It is LATENT, not live.** m00061 has no Icelandic translation at all
(`Translation not found … Refusing to publish untranslated content`), so a real
inject refuses it earlier — which is why the 491-module verdict diff shows **0**
organic changes. It surfaces only in the three corpus sweeps, which inject every
source module's own English.

Those sweeps now record it **by name** (`refused: ['m00061']`) and subtract its
segments explicitly (alt 6, caption 3; organic caption `top` 457 → 454) rather
than skipping it, so **the denominator cannot shrink silently** and a second
refusing module goes red saying which. Chemistry asserts `refused: []` as the
control.

⚠️ **The docref resolver is NOT fixed here.** §C118 ⑰'s own entry says the
depth-aware scan for this class "gets its own reviewed unit" and must not be
changed at the tail of a session; this is the same class.
