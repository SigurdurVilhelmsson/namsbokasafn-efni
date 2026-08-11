# Errata / Updates page — idea (efni side, not started)

> **Status:** Captured 2026-07-01. Cross-repo flag from the **vefur** PDF-redesign session so
> efni is kept in the loop and can pick this up if the data/authoring belongs here (it likely
> does). **Not started** — needs its own brainstorm/spec. The reader-facing page is a **vefur**
> feature; the *data* (what content changed, when) originates **here** in efni.

## Why (from the vefur session)

Students and teachers need transparency into the editing/error-checking process. Because this is a
project in **active localization**, "updates" are mostly large (whole modules going
**MT-preview → faithful/reviewed**) plus genuine errata — not the minor-correction maintenance a
mature book does. A public, **dated** record makes the proofreading progress legible.

Directly related transparency work already shipped in **vefur** (branch `feature/pdf-redesign`):
per-PDF **build date** on covers, and a per-section **"VÉLÞÝTT EFNI" watermark** on unreviewed
content (driven by `reviewed` in `toc.json`). An errata/updates page is the web-reader complement.

## How OpenStax does it (reference)

Per-book **Errata** page: readers submit suspected errors → editors vet → accepted corrections are
published as a dated list (location, description, status) and batched into **periodic releases**.
Their books are mature, so it's maintenance, not active development.

## Why this may be an efni-side project

The changelog **data** is efni's domain — the reader page just renders it (same shape as the
content-sync flow: efni owns content, vefur publishes it). Candidate data sources here:

- **Editorial approvals / status transitions** — a module moving to `03-faithful-translation/` (and
  published to `05-publication/faithful/`) is exactly a "reviewed on <date>" event. The editorial
  server already tracks approvals + per-segment snapshots (`contentVersionService`), and `toc.json`
  carries the resulting `reviewed` flag.
- **Curated editor notes** — a human-written changelog entry per meaningful update (most meaningful,
  but manual). Could live beside the content and sync to vefur, or be authored in the editorial
  server UI.
- **Derived from git history** of `books/*/05-publication/faithful/**` (dates of first faithful
  render per module) — automatable but coarse.

## Rough shape (to refine)

- Per-book, newest-first dated list: "2026-07 — Kafli 1 yfirlesinn og staðfærður", "2026-06 —
  leiðrétting í jöfnu í kafla 3.2", …
- An errata-submission path — vefur already has `/feedback`; efni already routes feedback → module
  (there's a feedback→module routing thread).
- Optionally surface the per-section `reviewed` status as an at-a-glance proofreading-progress view.

## Open questions

- Curated vs derived changelog (or both: derived "reviewed" events + curated correction notes)?
- Authoring surface: editorial server UI, a synced file in `books/`, or generated at publish time?
- Granularity (section vs chapter) and cadence.
- Split of responsibility: **efni** produces + syncs the changelog data; **vefur** renders the page.

## Cross-repo notes

- **vefur** companion doc: `namsbokasafn-vefur/docs/plans/2026-07-01-errata-and-updates-page-idea.md`.
- If picked up, the **center of gravity is efni** (data/authoring) with a small vefur page — so a
  proper session should probably run here. Ties naturally to the editorial-throughput roadmap
  (proofreading progress is already the project's binding constraint).
