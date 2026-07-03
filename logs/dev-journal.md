# Development Journal

Snapshots captured with /snapshot command.

---

## 2026-02-15 - MathJax 4 upgrade + appendix routing and image fixes

**Branch:** main
**Modified:**
(clean)

**Recent commits:**
b27bae5 fix(render): copy appendix images using correct CNX_Chem_00_ prefix
79bc18d Add feasibility study for expanding translation pipeline to additional OpenStax titles (#36)
0c9f03f Claude/review audit report n fr ld (#37)

**Why:** MathJax 3 TeX fonts only had 1/20 Icelandic characters, causing Helvetica fallback hacks. Upgraded to MathJax 4 (New Computer Modern) for native glyph support. Also fixed appendix pages: content loader had double appendices/ path prefix causing 404s, and image copy used wrong filename prefix (CNX_Chem_appendices_ instead of CNX_Chem_00_).

**Session summary:**
- Upgraded mathjax-full 3.2.1 -> @mathjax/src 4.1.0 with mathjax-newcm font
- Removed Helvetica width table workaround (no longer needed)
- Fixed contentLoader.ts double appendices/ path (vefur repo, 2 commits)
- Fixed copyChapterImages() to use CNX_Chem_00_ prefix for appendices (36 images)
- All 8 chapters + 13 appendices re-rendered and synced
- Site running on localhost:5174, all appendices verified working

---

## 2026-02-04 06:00 - Replaced hardcoded MODULE_SECTIONS with shared helper that derives metadata from structure/segment files

**Branch:** main
**Modified:**
?? docs/erlendur-bug-report.md
?? docs/pipeline/ch5-equations-screenshot.png
?? docs/pipeline/ch5-katex-rendered.png

**Recent commits:**
5d7bbf9 refactor(pipeline): replace hardcoded MODULE_SECTIONS with shared helper
fb34440 fix(pipeline): translate figures in notes and list items in examples/exercises
88d6409 fix(pipeline): use translated CNXML for exercises/summary/answer-key extraction

**Why:** Hardcoded constants had to be updated for every new chapter — now derived automatically from structure + segment files

---

## 2026-07-03 14:11 - Design investigation done; next = the oracle-hardening gate before biology

**Branch:** docs/integrate-clean-slate-into-plans (PR #222 open) — cut a fresh branch off main for code work

**Modified:** (working tree clean; all committed)

**Recent commits:**
d124b304 docs(plans): integrate clean-slate design decision into the plan of record
eba3f098 Merge pull request #221 (clean-slate design spec + brief)
928ed8a6 docs(design): add clean-slate investigation handoff brief

**Why:** Clean-slate rewrite question is RESOLVED — don't rewrite; finish the chemistry clean-slate + onboard biology on the current pipeline. Spec: docs/design/2026-07-03-clean-slate-translation-system-design.md. Plan updated: docs/plans/2026-07-01-chemistry-clean-slate-design.md § Amendment 2026-07-03.

**NEXT (per the integrated plan, step 2 = the oracle-hardening gate, all before biology extraction):**
  1. F4 — table double-model, fix at EXTRACTION (cnxml-extract.js; model once, mirror figuresHandledInContainers), then flip the [[TABLE:]] carve-out in assertNoMarkerResidue to hard-fail. Diagnosis: docs/plans/2026-07-02-f456-marker-residue-design.md § Split outcome.
  2. Promote the id-order/LCS check warn-only → HARD-FAIL (cnxml-fidelity-check.js:357-359).
  3. F8 — normalized math-content hash in the fidelity check (land with WS4).
  Then: F3 benign re-triage → WS5 batched re-extract/re-inject/re-render/sync → biology onboarding (gated behind 1+2+3).
  Trailing (throughput track): F9 link-attr diff, F7 allowlist track+fingerprint, F10 faithful manifest, F16 marker-sequence flag.

**Workflow (carry forward):** per item → superpowers:brainstorming → writing-plans → executing-plans; one PR off main per item; robustness>expedience; log out-of-scope finds to docs/plans/2026-06-28-...register + memory; probe-first; `npm test` from repo root is the authoritative gate (no branch protection). Merge #222 first so the plan-of-record reflects this sequencing.

---
