# Decision: organic chemistry may buy a chapter's text before its figures; editors stay off the chapter until its figures are done

- **Date:** 2026-09-22
- **Status:** Accepted
- **Context owners:** [USER]
- **Supersedes:** none. This is a scoped **exception** to the one-unit ruling (2026-09-06, restated 2026-09-12), which has no decision record of its own. It lives in `docs/plans/2026-09-05-per-chapter-loop.md` § Step 3, and it still governs every other book.
- **Related:** `docs/plans/2026-09-05-per-chapter-loop.md` (Step 3) · `experiments/figure-text-translation/REGISTER.md` (③, organic scope) · `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C126, the 2026-09-22 RESUME)

> **FROZEN EVIDENCE — banner-dated 2026-09-22.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The per-chapter loop runs a chapter's figures **immediately after its text, before any editor
opens it**. For `lifraen-efnafraedi` that ordering cannot be met today: the figure track composes
from OpenStax's **artwork delivery** (PDF/EPS with live text), not from `01-source/media/` rasters,
and organic's delivery is not on the machine. Does organic's text wait for the artwork, or may it
go ahead?

At stake: every organic text buy is blocked for as long as the delivery takes, against the risk
the one-unit rule exists to prevent, which is a second editor visit per module.

## Decision

**For `lifraen-efnafraedi` only, a chapter's text may be bought before its figures.** The
condition is part of the ruling, not a side note: **editors are kept off each such chapter until
its figures are done.** Every other book keeps the one-unit rule unchanged.

## Reasoning

### The blocking fact was measured, not assumed

Measured 2026-09-22: `experiments/figure-text-translation/sources.local.json` (gitignored and
machine-local) has exactly one book key, `efnafraedi-2e`, and `/home/siggi/dev/repos/Myndir/`
holds only `chemistry-2e/`. The figure register records the request to OpenStax as made
2026-09-07. `01-source/media/` is **not** a substitute: it holds published rasters, and text
baked into pixels cannot be extracted or replaced (figure register ③).

### The one-unit rule's reason survives the exception

The loop plan states the rule's reason: *"One-pass edit + one-pass approval means the editor sees
a module **once**, so its figures must already be there when they do."* The protected quantity is
**editor visits**, not the order of the purchases. Keeping editors off a text-bought chapter until
its figures land preserves exactly that quantity. What changes is only when the text is bought.

### What was not established

[USER] chose this option over holding every organic buy for the artwork. No reason beyond that
choice was recorded in the session. This record does not invent one.

## Consequences

- **An organic chapter can now sit in a new intermediate state: text bought, figures pending,
  editors held off.** The loop's own states do not name it. The register has to track which
  organic chapters are in it, because nothing in the code does.
- **"Editors kept off" is procedural, not mechanical.** Nothing in the server was checked to
  enforce it (assignment, visibility). Until something does, holding editors off is a human
  commitment, which is the class of rule this repo has repeatedly found decays.
- **The one-unit rule is not weakened elsewhere.** Chemistry and any future book still run
  figures immediately after text.
- **Reversing this costs nothing retroactively.** Holding buys again only delays text; it
  strands no bought work.
- **When the artwork arrives, the pending chapters' figures are owed.** Two organic figures also
  carry upstream errata our local copy predates (register §C92), so check the delivery for those
  two before composing either.

## Alternatives considered

1. **Hold every organic text buy until the artwork arrives.** Offered to [USER] as the first
   option. It keeps the rule literally, but blocks all organic translation on an external
   delivery of unknown date.
2. **Drop the one-unit rule for organic entirely** (buy text, let editors in, do figures later).
   This was not offered. It would book the second editor visit per module that the rule exists to
   prevent.
