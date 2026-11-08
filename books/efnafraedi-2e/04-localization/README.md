# 04-localization

**Used by:** nothing. No code in `server/`, `tools/` or `scripts/` reads or writes this directory.

## What happened to it

This directory was meant as a working area for Pass 2 (localization), with finished work
promoted to `04-localized-content/`. The localization editor was built without it:

- The editor at `/localization` loads a module's faithful segments from
  `03-faithful-translation/` and its localized segments, if any, from `04-localized-content/`.
- When a book enforces localization review, each edit is held in the database
  (`localization_pending_edits`) and is written to `04-localized-content/` only after a head
  editor approves it (`server/services/localizationReviewService.js`). Otherwise the editor
  saves straight to `04-localized-content/`.
- Every change is logged in the database for the audit trail (`localization_edits`).

So localized text never passes through here. See
[`../04-localized-content/README.md`](../04-localized-content/README.md) for the directory that
holds it, and [docs/editorial/pass2-localization.md](../../../docs/editorial/pass2-localization.md)
for what localization changes.
