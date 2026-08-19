# Session handoff — 2026-08-17 evening

> **⛔ SUPERSEDED 2026-08-19 — do not resume from this file.** Both branches it points at are
> finished: §C93 merged as PR #403, §C88 as PR #405. Its "resume order" is spent.
>
> ⚠️ **Its two ledger citations below point into `.superpowers/sdd/`, which is gitignored and is
> deleted at plan close-out — so they dangle by design, and that is §C97 exactly.** The durable
> replacements: §C88's whole-branch review is frozen at
> `docs/superpowers/specs/2026-08-19-c88-whole-branch-review.md`, its design spec at
> `docs/superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md`, and every ruling and
> open item it produced is in the active register (§C97–§C102). Read the register, not this.

**Everything is committed. No branch has uncommitted work. Nothing is pushed.**
Per § *One source of truth*, this file is a **breadcrumb, not status** — the register owns
open work. It exists so the next session knows which branch to stand on.

---

## ▶ THE ONE THING WAITING ON YOU

**The backup folder is built and verified: `~/namsbokasafn-backup-2026-08-17/` — 5.0 GB, 16,999 files.**
Move it to your cloud services, Linodes and local machine. Read its `README.txt` first; it carries
the provenance that the bytes themselves do not state.

⚠️ **Keep the manifest digest somewhere separate from the folder** (email, notes app) —
`a8d727ea43039285669e6bd2c4d639486e8d932403a703a0abea609b9c649875`. A checksum stored only beside
the files it checks proves nothing if both were replaced together.

To re-check any copy after moving it:
```bash
cd <copy> && sha256sum -c MANIFEST.sha256 | grep -v ': OK$'   # silence = all good
```

**What is in it, and why it could not come from git:** the live `01-source` for all six books,
copied from the working tree — biology's 2,455 and physics's 2,088 images are gitignored, so a
`git archive` returns **0** of them. Plus 1,332 historical `.eps`/`.psd`/`.pdf` editable-art files
recovered from git commit `d33b0763`; those exist **nowhere on disk** and would be destroyed
permanently by any future history rewrite.

---

## Branches — both green, neither pushed

| Branch | Head | State |
|---|---|---|
| `fix/c93-licence-keyed-source-guard` | `46d28518` | **current.** Tasks 1–3 done, 21/21 green. Tasks 4–6 remain. |
| `feat/c88-unreachable-figure-alt` | `dc964eab` | Tasks 1–3 done, 4,764 tests green. Task 3's review held; Tasks 4–11 remain. |
| `main` | `d5b48642` | untouched |

`git checkout fix/c93-licence-keyed-source-guard` to resume where this session stopped.

**Ledgers survive compaction and hold every ruling:**
`.superpowers/sdd/2026-08-17-c93-licence-keyed-source-guard/progress.md` ·
`.superpowers/sdd/2026-08-17-c88-unreachable-figure-alt/progress.md`

---

## Resume order

1. **§C93 Tasks 4–6** — wire the gates into `download-source.js` (and fix its error message, which
   currently tells the operator to delete `01-source/`), manifest v2 + the CI baseline dropout,
   then CLAUDE.md + `docs:generate`.
2. **§C88 Tasks 4–11** — the four emitters, then coverage model, pins, organic scope, acceptance.
   Task 3's review is still owed.
3. **A deploy is owed** — prod has been behind since before this session.

---

## Decisions you took today, so they are not re-litigated

- Organic scoped up to the **full 342-module book**; budget **approved**.
- Source refresh **approved**, route (a) — targeted, diff-reviewed, consent intact.
- **§C93 guard first**, before any refresh runs.
- **No re-sync verb, ever** (Ruling A); a re-make is permitted only under three conditions —
  source independently matches the recorded hashes, additive never replacing, full provenance
  (Ruling B). Recorded at `scratchpad/vault-hard-constraint.md`.
- **In-repo vault: dropped.** The manual archive supersedes it.
- **`.gitignore` for biology media: left as is.** Adding it takes the repo to ~4.8 GiB against
  GitHub's 5 GB soft ceiling, and the archive now covers the risk.
- **History rewrite to reclaim 3 GB: not doing it.** `refs/pull/*` survive rewrites and are
  GitHub-owned, so it would break every clone and still not reclaim the space.

---

## Open, logged, nobody working on it

**§C90** `m00309` publishes the wrong image (reader-visible; activated by the organic scope-up) ·
**§C91** the MT character base overstates by ~26%, plus two instrument defects ·
**§C92** the organic source refresh (approved, not yet run) · **§C93** ①② are live on `main` today ·
**§C94** the OpenStax lookup placement · the biology-media single point of failure
(`test-results/ccby-media-single-point-of-failure-2026-08-17.md`) — **closed once you distribute
the archive** · the 3 GB of dead `books/efnafraedi` art in history, accepted for now.
