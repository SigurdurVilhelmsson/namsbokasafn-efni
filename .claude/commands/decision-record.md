---
description: Record a cross-cutting decision as frozen, banner-dated evidence in docs/decisions/
allowed-tools: Read, Write, Grep, Bash
---

# Record a Decision (repo convention)

Write an append-only decision record to `docs/decisions/`.

> **Use this, not the generic global `/decision`.** That one writes a plain ADR template with no
> freeze banner and no register-wins clause, so a record written with it drifts into reading like
> live status. This command encodes the conventions in CLAUDE.md § *One source of truth*.

**This repo already has an owner for most design records: the per-item spec.** This command is
for the narrower case that no single spec can own. Apply the gate below before writing anything.

## Gate — does this belong here at all?

A decision record is warranted **only when the question is cross-cutting**: it will be cited by
more than one plan, spec, or audit, and no single one of them owns it.

| The decision is… | Where it goes |
|---|---|
| About **one campaign item / one PR** | that item's spec in `docs/superpowers/specs/` — **not here** |
| **What to do next**, or whether something is blocked/shipped | the active register in `docs/plans/` — → see CLAUDE.md § *One source of truth* |
| A **rule to obey** from now on | `CLAUDE.md` — → see its § *One source of truth* |
| Cross-cutting, cited by several docs, owned by none | **here** |

If it fails the gate, say so and write it in the right place instead. A decision file that
duplicates a spec is a second source of truth for the same fact — the exact failure the
closure audit was about.

Precedent: `docs/decisions/2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md` is cited by
two plans, a spec, and an audit. That citation count is what justifies its existence.

## Steps

1. **Run the gate.** If it fails, stop and redirect.
2. Ask: **What was decided?** (one line — becomes the title and filename)
3. Ask: **What question was being answered?**
4. Ask: **What alternatives were considered, and why were they rejected?**
5. Ask: **What are the consequences** — including what this forecloses?
6. Ask: **Does this supersede an existing decision?** If yes, note it both ways (see below).
7. Get the real date: `date +%F`. **Never guess or infer it.**
8. Filename: `docs/decisions/YYYY-MM-DD-<slug>.md` — lowercase, hyphens, no special
   characters, ≤ 50 chars of slug.
9. Write the file using the template below.
10. **Add the inbound citation.** A decision nothing points at is dead weight — edit the plan,
    spec, or audit that prompted it to cite the new file by path. Do this in the same step.

## Template

```markdown
# Decision: <one-line statement of what was decided>

- **Date:** YYYY-MM-DD
- **Status:** Accepted
- **Context owners:** <who decided — e.g. lead + pipeline>
- **Supersedes:** <path, or "none">
- **Related:** <paths to the plans/specs/audits this bears on>

> **FROZEN EVIDENCE — banner-dated <YYYY-MM-DD>.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

<The question, stated precisely enough that a reader can tell whether it is still the
question being asked. Include what was at stake.>

## Decision

<What was chosen. One or two sentences, up front — do not make the reader hunt for it.>

## Reasoning

<Why. Use `###` subsections per line of argument. Cite verifiable evidence — file paths,
measurements, test names — not impressions. State which claims were checked against the
tree and which were not.>

## Consequences

- <What this commits the project to>
- <What it forecloses, and what it would cost to reverse>
- <Follow-up work this creates, and where that work is tracked — link the register,
  do not restate its status here>

## Alternatives considered

1. **<Option>** — <why rejected>
2. **<Option>** — <why rejected>
```

## Rules

- **Append-only. Never edit an existing decision record.** If one becomes wrong, write a new
  record and set `Supersedes:` on the new file. Then set `Status: Superseded by <path>` on the
  old one — that status line is the *only* permitted edit to a frozen record.
- **No status verbs beyond the record's own `Status:` field.** Whether the work a decision
  implies is next, blocked, or shipped belongs to the register, not here.
- **No test counts, migration counts, or green/red CI verdicts** — → see CLAUDE.md
  § *One source of truth*.
- **Record the WHY, not the WHAT.** The code shows what; only this shows why.
