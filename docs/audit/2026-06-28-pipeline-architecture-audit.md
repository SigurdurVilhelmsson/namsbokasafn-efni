# Pipeline Architecture Audit & Roadmap — 2026-06-28

**Scope:** the full CNXML → API-translate (Erlendur/Málstaður) → rebuild (inject) → render (HTML)
pipeline, audited ahead of scaling from 1 mature book to 4–5 books and 10–15 editors.
**Method:** a multi-agent workflow fanned out ~13 lenses across 4 pillars + cross-cutting concerns,
**adversarially verified** each material finding against the real files (83 findings, **0 refuted**;
several seed assumptions *corrected* — noted inline), plus **live Erlendur API probes** and a
**full-corpus DOM round-trip sweep** run directly. Deliverable is this report + roadmap; no code was
changed. Severity counts: **3 critical, 32 high, 27 medium, 15 low, 6 info**; **21 findings block
onboarding the next book**.

> Note: the synthesis stage of the workflow was cut short by a session usage limit; this report was
> assembled by hand from the verified findings journal + the directly-run probes. All findings carry
> `file:line` evidence from the verification pass.

---

## 1. Executive summary — the six things that matter for scaling

1. **The render architecture is the root cause, and migration is now de-risked.** `cnxml-render.js`
   re-derives document order from string positions (63 `indexOf` sites, 5 near-duplicate "positioner"
   blocks, strip-and-re-extract). All three historical render bugs came from this. A **direct probe
   round-tripped all 1,192 source modules across 5 books through `@xmldom/xmldom` with 0 errors** — so
   an **incremental DOM migration is viable**, not all-or-nothing. This is the single highest-leverage
   architectural change and the right time is now.

2. **Erlendur has been fixed; the pipeline's marker-restoration machinery is now largely redundant.**
   Live probes (below) show the catastrophic `{{SEG}}`-stripping bug is **gone**, all marker types
   survive ~100% with content intact, and the ~33-35KB truncation is gone at 38KB. The elaborate
   `restore*` heuristics can be **downgraded to validate-and-warn** — a large simplification — *after*
   a full-chapter validation run. (Caveat: the glossary counts toward Erlendur's char budget — §5.)

3. **Three cross-book content gaps will silently corrupt the next books**, independent of the render
   refactor: **(a)** organic chemistry's **1,961 `os-embed` exercises** resolve to *untranslated
   English* that passes review silently (not "empty" as previously believed — a worse failure);
   **(b)** **108 `<iframe>` PhET/YouTube embeds** (physics+biology) are dropped at both extract and
   render; **(c)** books without `<glossary>` (organic, microbiology) render an empty "Lykilhugtök"
   page despite thousands of inline `<term>`s.

4. **The pipeline has no real correctness gate, and the manifest reports false-green.** The fidelity
   check is character-blind (untranslated English, dropped sentences, corrupted math all pass as
   PERFECT), never runs in CI, and never fails inject. The manifest hardcodes `skippedUntranslated: 0`,
   so un-injected books report green (e.g. physics "9 of 283 checked, 0 skipped"). With 15 editors this
   is the difference between a trustworthy and an untrustworthy queue.

5. **Onboarding a book currently requires a code change + deploy.** Per-book config lives in code
   (`BOOK_CONFIGS`), unknown books fall back to a silently-incomplete default, every tool defaults
   `--book` to `efnafraedi-2e`, and there is **no pre-intake structural gate** to assess a title's
   fitness before sinking effort. Onboarding should become a data-file + a one-shot probe.

6. **Test coverage is chemistry-shaped.** The only end-to-end integration test is efnafraedi-2e ch01;
   `cnxml-parser.js` (the string core of render) has zero direct tests; the CSS-contract test silently
   skips when vefur is absent. A refactor of render is unsafe until the nesting matrix and a
   per-book characterization test exist.

---

## 2. Findings by pillar

Severity in brackets; ★ = blocks next book. Evidence is abbreviated — full `file:line` in the
findings journal (`scratchpad/audit-findings.json`).

### Pillar 1 — Extract + API guards (Erlendur)

- **[HIGH ★] `validateMarkers` is count-only** (`api-translate.js:255`) — blind to inline `[[bracket]]`
  loss and intra-segment truncation; 0 `[[` handling anywhere. → add per-type bracket-count check at
  the producer boundary, mirroring `assertNoControlChars`/`countInlineMarkers`.
- **[HIGH] `pollTask` GET not wrapped in `withRetry`** (`malstadur-api.js:293`) — the dominant
  (async, >10K) production path fails a whole module on one transient blip, unlike `translate`/`translateAsync`.
- **[HIGH] `<iframe>` dropped at extraction** (`cnxml-extract.js:180`/`:99`) — 57 physics + 51 biology
  embeds; the whitelist `stripTags` at `:374` deletes them with no diagnostic.
- **[HIGH ★] Whitelist reconstruction drops any unrecognized construct silently** (`:374`, manifest
  whitelist `:1653`) → add a residual-`<tag>` detector that surfaces unknown elements at intake.
- **[MED] `<term>`/`<footnote>` still emitted as legacy `{{ }}`** — the lossy family, on the
  highest-volume inline elements. (Survives now — §5 — but should move to brackets.)
- **[MED] Title with inline markup extracts as "Untitled"**; **organic colored-text `<span>` semantics
  flattened**; **[INFO] exercise type/class variants ARE config-handled** (correction) but the
  extraction regex is non-greedy and truncates on nested `<section>`.
- **[INFO] Clean-cut SEG splitting is correct; overlapping-split is NOT warranted** (correction — see §5).

### Pillar 1b — Marker restoration (inject) — *the simplification target*

- **[MED] `restoreNewlines`/`restoreMediaMarkers`/`restoreSupersubMarkers` are near-dead for API
  content** but still live for `docx-import`; **`restoreMathMarkers` is ~190 lines of anchor/position
  heuristics for 3 fixes book-wide**; **`restoreMediaMarkers` blindly appends `[[MEDIA:N]]`** with no
  alignment check. → with Erlendur fixed (§5), convert these to **validate-and-warn**; keep a path for
  the `docx-import` population. **[LOW]** several branches are already dead code.
- **[HIGH] `annotateInlineTerms` pairs EN glosses by ordinal position** (`cnxml-inject.js:794`) and
  desyncs on count mismatch — wrong "(e. english)" reaches readers; ON by default. → skip on count
  mismatch, match by glossary content.
- **[HIGH] `isApiTranslated` is a marker-shape guess** (`:3307`) — biology/microbiology (few inline
  markers) will be misrouted. → stamp explicit producer provenance in `02-mt-output` (dissolves several
  routing risks at once).

### Pillar 1c — Fidelity verification

- **[CRIT ★] Manifest false-green** (`update-translation-errors.js:76,:108`) — `skippedUntranslated`
  hardcoded `0`; un-injected modules dropped uncounted. → count real skips, record `totalSourceModules`,
  treat `skipped>0` as non-green. (Cheap, high value.)
- **[HIGH] Fidelity check is not a gate** — never in CI, inject never fails on a diff, render has no
  structural check. **[HIGH] It is character-blind** (`cnxml-fidelity-check.js:32`) — counts opening
  tags only; text/attrs/MathML contents never inspected (this is why the null-byte degree-sign incident
  passed). → add a render-stage structural check (reuse the DOM) + feed the planned untranslated-EN
  residue detector; wire into CI as a regression report. **[MED] correction:** manifest is *overwritten
  per-run/per-track* (not truncated by partial re-injects) and has a second uncontrolled producer.

### Pillar 2 — Inject / CNXML rebuild

- **[HIGH ★] List-flattening remediation diverges**: `buildExampleDom` preserves the nested list, but
  `buildExerciseDom`/`buildNoteDom` delete it (`cnxml-inject.js:2352` vs the exercise/note builders). →
  unify on the example approach; factor out shared para+list handling.
- **[HIGH ★] Tables never moved to DOM** — `buildTable:1913` is self-described "simplified" positional
  regex; the one complex element still string-built. → port to the DOM path the other builders use.
- **[HIGH ★] All media-rebuild paths emit only `<image>`** (`:1030`,`:2986`,`:1881`) — `<iframe>`/audio/
  video lost unless riding inside a preserved container. → capture full media inner XML at extraction;
  re-emit non-image media verbatim.
- **[HIGH ★] Two divergent `parseSegments` + 4–5 SEG regexes** (`cnxml-inject.js:168` vs
  `server/services/segmentParser.js:24`) — divergent duplicate policies. → extract one shared
  `tools/lib/seg-markers.js` with a canonical tokenizer + documented duplicate policy.
- **[HIGH ★] Injection gate checks presence, not translatedness** — untranslated-English residue passes
  as COMPLETE. **[MED] `--allow-en-fallback` is whole-chapter** — silently ships English for every
  untranslated module. **[MED] duplicate segment IDs handled 3 different ways** across inject/editor/count.

### Pillar 3 — Render → HTML + architecture

- **[HIGH / XL] Document order re-derived by string search** — 63 `indexOf` sites, 5 near-duplicate
  positioner blocks (`renderContent:696`, `renderTopLevelContent:924`, `renderExample:1354`,
  `renderExercise:1602`, `renderNote:1255`). The root fragility class.
- **[MED] `indexOf(`id="X"`) still substring-collides with `target-id="X"`** in the positioners — the
  exact bug just fixed, still live elsewhere; **guarding is inconsistent** across the 5 copied blocks
  (containers `fullMatch`-guarded in main loops but `id`-positioned in `renderNote`/`renderExercise`).
- **[MED ★] id-less `<para>` inside `<note>` renders out of order** — deterministic for 95 notes across
  77 biology modules.
- **[HIGH ★] `renderMedia` is image-only** (`:1232`) — 108 physics+biology `<iframe>` embeds silently lost.
- **[HIGH ★] os-embed organic exercises resolve but render *untranslated English*** (correction:
  `resolveOsEmbed` at `:137` DOES exist and reads `01-source/exercises/*.json`) — there is **no
  extraction/translation path** for that 1,961-file English cache, so reviewed-looking English ships.
- **[HIGH] Books without `<glossary>` render an empty compiled page** (organic 0, microbiology 0 despite
  6,395 inline `<term>`). → per-book alternative glossary extractor (`key-terms` section / inline terms).
- **[HIGH ★] Note classes passed raw into HTML** (`:1259`) — couples every new book's note vocabulary to
  vefur `content.css`; only the first CNXML class word gets the `note-` prefix, rest leak as stray classes.

**Render→DOM migration (the architectural question):**
- **[HIGH/S] Incremental migration is VIABLE** — round-trip probe across 3 books (and the full 1,192-module
  sweep) confirms `@xmldom/xmldom` parses real translated CNXML cleanly. **Leaf-seam pattern:** a new DOM
  traversal (reusing `cnxml-dom.js` helpers) walks `<content>` childNodes *in source order* (ordering
  falls out for free, killing the position-collision class), serializes each block node via
  `serializeCnxmlFragment`, and hands it to the **existing, unchanged** string renderers. Switch the
  dispatcher per element type as each is validated; keep the regex path alive in parallel during migration.
- **[MED] Smallest high-value first phase:** `renderNote` (the dropped-`<media>` bug site) → `renderExample`
  → `renderExercise`. **[MED] Fix the test oracle:** render's gate is golden-HTML diff (not inject's
  `compareTagCounts`). **[INFO] Scope correction:** `cnxml-dom.js` is a parse/manipulate helper, **not a
  renderer** — HTML emission must be ported separately; don't over-promise reuse. **[INFO] MathML
  passthrough is NOT a blocker** (re-counted).

### Pillar 4 — Cross-book structural fitness

- **[CRIT ★] / [CRIT] / [CRIT ★]** the three organic/os-embed findings (unextractable 1,961-exercise
  corpus; resolves to silent English; external JSON never read) — see roadmap.
- **[HIGH ★] No pre-intake structural gate** — fitness can't be assessed before intake. → one-shot probe:
  grep `os-embed`, `<iframe>`, `<glossary>==0 with <term>`, unknown note classes, unrecognized elements.
- **[INFO] Empirical difference matrix re-counted** (corrects seed/study numbers); **[INFO] microbiology
  footnotes ARE rendered** (458, not 355 — correction).

### Cross-cutting — config, tests, vefur contract

- **[HIGH ★] Per-book config is code-resident** (`book-rendering-config.js:48`) — book #6 needs a code
  change + test + deploy. **[HIGH ★] Unknown book → silently-incomplete default.** **[HIGH] every tool
  defaults `--book` to chemistry.** → move config to a data file co-located with the book (extend the
  orphaned `books/<slug>/metadata.json`); make missing config fail loud; make `--book` required.
- **[HIGH ★] No non-chemistry end-to-end test** (only efnafraedi ch01); **[HIGH] `cnxml-parser.js` has
  zero direct tests**; **[HIGH] render nesting matrix almost empty** (2 cases); **[HIGH ★] CSS-contract
  test scoped to efnafraedi + skips silently when vefur absent**. → per-book characterization specs
  (inline-CNXML pattern, no MT input needed); `cnxml-parser` unit suite; nesting matrix; parametrize
  CSS-contract over all books.
- **vefur cross-repo (flag, do not edit here):** iframe wrapper styling, note-class vocabulary,
  key-equations/exercise class-name mismatches, unstyled end-of-chapter Summary + periodic-table wrappers,
  unbounded dynamic class passthrough, hardcoded stylesheet path / JS DOM hooks with no shared manifest.
  → produce a per-book note-class report at intake and a shared class manifest with vefur.

---

## 3. Erlendur re-characterization (live probes, 2026-06-28, ~546 ISK)

Run directly against the production endpoint with the project key (structure tests only, nothing
published; `01-source` untouched). Full detail in `scratchpad/erlendur-probe-findings.md`.

| Test | Result |
|------|--------|
| `{{SEG}}` bulk-stripping bug (orig. fixture, 155 markers, 3×) | **FIXED** — 155/155 every run; the only residual is a **deterministic** hyphen-in-module-id (`m68724`→`m6-8724`), already handled by `repairSegTags` |
| Determinism | **Consistent** — same single anomaly all 3 runs |
| Inline-marker matrix (every type, 2×) + content integrity | **100%** — incl. `[[link:text\|url]]` (text translated, URL intact), xref label translated + id preserved; legacy `{{term}}/{{fn}}` survive |
| Real files (`m68866`: 36 `[[sup:]]`, 33 `[[MATH:]]`) + organic excerpt | all preserved |
| `[[BR]]`/`[[MEDIA:N]]` stress (20 each) | **20/20**, indices intact (vs historical ~2-3% loss) |
| Truncation threshold | **No truncation at 38KB** (214/214 markers); historical ~33-35KB ceiling gone |

**Implication:** the `restore*` machinery was built for a much worse API and is now largely redundant →
**downgrade to validate-and-warn**, retiring a class of inject-time bugs and ~hundreds of lines. **Keep**
`repairSegTags` (hyphen persists), `assertNoControlChars` (the degree-sign→NUL corruption is a separate
*content* issue), and the cheap count check.

**⚠️ Glossary caveat (lead):** the probes sent text **without a glossary**, but production sends ~1,100
glossary terms per request, and **those characters count toward Erlendur's payload budget**. So the
"truncation is gone / relax chunking" result is an upper bound — **before relaxing `splitAtSegBoundaries`,
re-run the threshold test with the glossary attached** and size the chunk limit to `payload + glossary`.
This also reconciles with the workflow's finding that clean-cut splitting is currently correct: keep
chunking, just re-tune the limit with glossary overhead accounted for. **Validation gate before deleting
any restoration code:** re-translate a full chapter *with glossary* and diff marker integrity end-to-end.

---

## 4. Cross-book readiness checklist (must land before onboarding the next title)

- [ ] **os-embed extraction path** (organic) — emit `exercises/*.json` stem/stimulus/solutions as
      translatable segments; `resolveOsEmbed` prefers a translated sidecar. *(blocks organic)*
- [ ] **`<iframe>` extract + render** (physics, biology) — capture embed in extraction, emit responsive
      iframe/links in render (vefur styling coordination). *(blocks physics, biology)*
- [ ] **Alternative glossary extractor** — `key-terms` section (organic) + inline `<term>` (microbiology).
- [ ] **Per-book config as data file** + fail-loud on unknown book + `--book` required.
- [ ] **Pre-intake structural probe** — the one-shot fitness scan.
- [ ] **Manifest false-green fix** + a real correctness/residue gate.
- [ ] **Provenance stamp** in `02-mt-output` (fixes restore-routing for low-marker books).
- [ ] **Per-book characterization test** + parametrized CSS-contract over all books.

---

## 5. Prioritized roadmap

Effort: S(<1d) M(1-3d) L(~1wk) XL(>1wk). Ordered by dependency + impact.

### Track A — Correctness & trust gates (do first; cheap, unblocks safe scaling)
| # | Item | Eff | Why first |
|---|------|-----|-----------|
| A1 | Manifest false-green: real `skippedUntranslated`/`totalSourceModules`; `skipped>0` ≠ green | S | One-line lie today; everything downstream trusts it |
| A2 | Untranslated-EN residue check at inject + save/submit | M | The silent-English failure mode behind os-embed & MTPE |
| A3 | Render-stage structural check (reuse DOM) + wire fidelity into CI as regression report | M | First actual gate; safety net for the render refactor |
| A4 | `pollTask` `withRetry` + async-path tests | S | Reliability on the dominant production path |

### Track B — API simplification (after a glossary-aware validation run)
| # | Item | Eff | Note |
|---|------|-----|------|
| B1 | Re-run threshold test **with glossary**, re-tune chunk limit to payload+glossary | S | Gates B2/B3 |
| B2 | Downgrade `restore*` heuristics to validate-and-warn (keep docx path) | M | Retires ~hundreds of lines + a bug class |
| B3 | Per-type bracket-marker count check at producer boundary | S | Replaces blind count-only `validateMarkers` |
| B4 | Move `<term>`/`<footnote>` from `{{ }}` to brackets | M | Last lossy-family inline elements |

### Track C — Architectural: render → DOM (incremental, leaf-seam)
| # | Item | Eff | Note |
|---|------|-----|------|
| C0 | Safety nets first: `cnxml-parser` unit suite, render nesting matrix, golden-HTML oracle | M | Refactor is unsafe without these |
| C1 | DOM traversal/ordering seam dispatching to existing string renderers; migrate `renderNote` | M | Smallest high-value phase; kills position-collision class for notes |
| C2 | Migrate `renderExample`, then `renderExercise` | L | Highest-bug-density containers |
| C3 | Converge the 5 positioner blocks onto one ordered emitter; retire `indexOf(id=)` ordering | L | Eliminates the root fragility class |
| C4 | Port `buildTable` (inject) to DOM | M | The last string-built complex element |

### Track D — Cross-book onboarding (sequence against the next title chosen)
| # | Item | Eff | Blocks |
|---|------|-----|--------|
| D1 | Per-book config as data file + fail-loud + `--book` required | L | all |
| D2 | Pre-intake structural probe | M | all |
| D3 | os-embed extraction+translation path | XL | organic |
| D4 | `<iframe>` extract + render | M | physics, biology |
| D5 | Alternative glossary extractor (key-terms / inline term) | M | organic, microbiology |
| D6 | Per-book characterization test + parametrized CSS-contract | M | all |

**Suggested sequence:** Track A in full → C0 + B1 → start C1/C2 in parallel with D1/D2 → then the
title-specific D3-D5 as each book is scheduled.

---

## 6. Cross-repo (namsbokasafn-vefur) coordination — flagged, not actioned

These require coordinated changes in the sister repo's `static/styles/content.css` (and JS hooks);
**do not change render class names/structure unilaterally:**
- iframe embed wrapper styling (new element class for physics/biology).
- Per-book **note-class vocabulary** (produce a note-class report from each book at intake).
- key-equations / exercise class-name mismatches (fixable efni-side) vs genuinely **unstyled**
  end-of-chapter Summary + periodic-table wrappers (need a vefur selector).
- A shared, version-pinned **class manifest** between render output and vefur CSS (none exists today).

---

*Appendix (committed alongside this report):*
- *`2026-06-28-audit-findings.json` — all 83 raw verified findings (severity, evidence file:line, recommendation).*
- *`2026-06-28-erlendur-probe-findings.md` — full Erlendur live-probe detail.*
- *DOM round-trip sweep result: 1,192/1,192 source modules across 5 books parse clean through `@xmldom/xmldom` (0 errors, 0 throws).*
