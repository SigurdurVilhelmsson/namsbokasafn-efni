# §C140 ㊵ design facts — 2026-10-01

> **FROZEN EVIDENCE — banner-dated 2026-10-01.** Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊵). The design these facts informed is
> [`docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`](../../../../docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md).

**Cost:** 0 ISK. Nothing was bought, written to either repo, or synced.

## What is here

| file | what |
|---|---|
| `facts.json` | The structured results of a read-only fact-finding workflow: six readers, one question each, and a critic that cross-checked them. |

The six readers' questions:

| reader | question |
|---|---|
| `retire-durability` | Once a June figure's mapping row and `media/` file are deleted, can any automated path re-create either? |
| `resolver-contract` | What does `tools/figure-run.js` read from `sources.py --json`, and what would an alias or an override change downstream? |
| `publication-refs` | Where do the 10 June figures live under `books/`, and what do inject and render do with them? |
| `vefur-sync` | If efni deletes a published `_IS.svg`, does the next vefur sync remove it from what is deployed? (Read only; nothing was written in vefur.) |
| `conventions` | What conventions must a new destructive CLI in `tools/` follow, and where must it be documented? |
| `alias-config` | Who reads the figure config, and what are the four recompose targets (page sizes, name collisions, the two ibuprofen drawings)? |

## How it was produced

- A Workflow run (`c40-design-facts`, 7 agents), each agent read-only on both repos, with scratch files outside
  the repo. Every agent and the controller confirmed `git status --porcelain` empty afterwards.
- **The agents returned structured output, and the controller wrote it here verbatim**, except for one change:
  absolute local paths, a deploy host and a memory path were replaced with placeholders, because this repository
  is public. The placeholders are `<repo>`, `<vefur>`, `<updates-2e>` and `<first-edition>` (the two artwork
  trees in `sources.local.json`), `<Myndir>`, `<scratch>`, `<tmp>`, `<home>`, `<claude-home>`, `<cache>`,
  `<project-memory>` and `<user>@<host>:<path>`.
- Each fact is marked `measured`, `read` or `inferred` by the agent that reported it. The critic re-measured the
  load-bearing disputes; its `contradictions` and `weakClaims` say which.
- The scratch artefacts the agents cite (dry-run logs, probe scripts, renders) were not kept. They lived outside the
  repo and are not needed to read the conclusions.

## Re-measured by the controller (2026-10-01, before the design was presented)

| claim | result |
|---|---|
| The base tree's two ibuprofen drawings differ | `pdftotext` on the `.pdf`: `18.114`; on the `.eps` (ghostscript → pdf): `18.144`, the published value. |
| The autorun halts on any superseded refusal | `scripts/chemistry-autorun-chapter.sh:208`: `grep -q "REFUSED — superseded" … && halt …` |
| Biology's mapping rows carry no `originalImage` | `liffraedi-2e` 34 rows, 34 without it; `efnafraedi-2e` 717 rows, 0 without it. |
| Chemistry's mapping re-serialises byte-identically | `raw === JSON.stringify(JSON.parse(raw), null, 2) + '\n'` → `true` |
| The mapping loader swallows a parse failure | `tools/lib/image-basename-map.cjs` `loadImageBasenameMap`: `catch { return []; }` |
| The prod backup cron does not stage `media/` | `scripts/git-backup.sh` `PATHSPECS` has no `books/*/media/` entry. |
| `figure-run.js` refuses unknown flags | `KNOWN_FLAGS` in `tools/figure-run.js`. |
| A row-only retire is undone by the generator | `buildMappingEntries` + `mergeMapping`: row removed, file kept → the row comes back; file removed too → it stays gone. |
| The modules that reference the 6 retirees | `03-translated/mt-preview`: ch11 `m68783` · ch18 `m68835` (N2O5, molecreso) and `m68837` · ch19 `m68842` · ch21 `m68854`. |
| Unmapped `_IS` copies under `05-publication/` | 754 copies, 9 with no mapping row: GasBurning (ch05), Ex9soln_img (ch06), and 7 in ch08. |
